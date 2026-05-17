import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import {
  chatMessages,
  tasks,
  taskGuides,
  notes,
  shoppingItems,
  timeLogs,
  userTools,
} from "@/db/schema";
import { getAccess, canWrite, getUserTools } from "@/lib/projects";

export const maxDuration = 60;

const MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4.6";

const SYSTEM = `You are "The Foreman" — a seasoned general contractor with 25+ years of hands-on residential renovation experience who loves coaching ambitious DIYers.

Voice: warm, plain-spoken, encouraging but never reckless. Like a pro friend on-site.

Rules:
- Be specific and practical. Give concrete tools, materials, measurements, grits, cure times, and order of operations.
- SAFETY FIRST. Proactively flag lead paint (pre-1978), asbestos (old flooring/mastic/popcorn), gas, structural, mold, and electrical risks. Say clearly when something needs a licensed pro, a permit, or an inspection — don't let pride cause a hazard.
- When the user shares a photo, study it closely and describe what you actually see before advising.
- Prefer short paragraphs and tight numbered steps. Bold the one thing that matters most.
- If something is ambiguous, ask one sharp clarifying question instead of guessing.
- TOOLS: when a task needs tools, check them against the user's owned-tools list. Clearly state which planned tools they ALREADY OWN and which they're MISSING. For each missing tool, recommend BUY or RENT — rent expensive/bulky/seldom-reused gear (floor sander, tile wet saw, scaffolding, hammer drill for one job), buy cheap or frequently-reused hand tools. Give rough price/rental ranges when useful. Never tell them to buy something they already own.
- ACTIONS: you can actually change this task — use your tools to set its status, log a work note, add an item to the buy list, log time spent, or record a tool the user just bought into their inventory. Take the action when the user asks ("mark this done", "add caulk to the list", "log 2 hours", "I bought a heat gun"). Don't just describe it — do it, then confirm in one short line what you changed. Only act on explicit intent; if unsure, ask first. Never fabricate that you did something the tool didn't confirm.
- Tailor every answer to THIS task's context provided below.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    messages,
    projectId,
    taskId,
  }: { messages: UIMessage[]; projectId: string; taskId: string } =
    await req.json();

  if (!projectId || !taskId) {
    return new Response("Missing project or task", { status: 400 });
  }

  const role = await getAccess(
    projectId,
    session.user.id,
    session.user.email,
  );
  if (!role) return new Response("Forbidden", { status: 403 });

  const db = getDb();
  const [[row], ownedTools] = await Promise.all([
    db
      .select()
      .from(tasks)
      .leftJoin(taskGuides, eq(tasks.id, taskGuides.taskId))
      .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId))),
    getUserTools(session.user.id),
  ]);

  if (!row) return new Response("Task not found", { status: 404 });

  const t = row.task;
  const g = row.task_guide;
  const context = [
    `TASK #${t.num}: ${t.title}`,
    t.detail ? `Detail: ${t.detail}` : "",
    t.hoursEstimate ? `Estimated effort: ${t.hoursEstimate}` : "",
    g?.tools?.length ? `Planned tools: ${g.tools.join("; ")}` : "",
    g?.materials?.length ? `Planned materials: ${g.materials.join("; ")}` : "",
    g?.safety?.length ? `Known safety notes: ${g.safety.join("; ")}` : "",
    g?.steps?.length ? `Planned steps: ${g.steps.join(" -> ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const toolsList =
    ownedTools.length > 0
      ? ownedTools.map((t) => t.name).join("; ")
      : "(none recorded — treat all needed tools as not owned)";

  const writable = canWrite(role);
  const userId = session.user.id;
  const denied = {
    ok: false as const,
    message:
      "You only have view access to this project, so I couldn't make that change.",
  };
  function touch() {
    revalidatePath(`/p/${projectId}/t/${taskId}`);
    revalidatePath(`/p/${projectId}`);
  }

  const tools = {
    setTaskStatus: tool({
      description:
        "Set this task's status. Use when the user says it's done, in progress, or not started.",
      inputSchema: z.object({
        status: z.enum(["todo", "in_progress", "done"]),
      }),
      execute: async ({ status }) => {
        if (!writable) return denied;
        await db
          .update(tasks)
          .set({
            status,
            completedAt: status === "done" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));
        touch();
        return { ok: true as const, status };
      },
    }),
    addNote: tool({
      description:
        "Add a work note to this task (a tip learned, a heads-up, what's left).",
      inputSchema: z.object({ body: z.string().min(1) }),
      execute: async ({ body }) => {
        if (!writable) return denied;
        await db
          .insert(notes)
          .values({ taskId, projectId, authorId: userId, body: body.trim() });
        touch();
        return { ok: true as const, body: body.trim() };
      },
    }),
    addBuyItem: tool({
      description: "Add an item to this task's shopping/buy list.",
      inputSchema: z.object({
        label: z.string().min(1),
        quantity: z.string().optional(),
      }),
      execute: async ({ label, quantity }) => {
        if (!writable) return denied;
        await db.insert(shoppingItems).values({
          projectId,
          taskId,
          label: label.trim(),
          quantity: quantity?.trim() || null,
          addedById: userId,
        });
        touch();
        return { ok: true as const, label: label.trim(), quantity };
      },
    }),
    logTime: tool({
      description: "Log time the user spent on this task, in minutes.",
      inputSchema: z.object({
        minutes: z.number().positive(),
        note: z.string().optional(),
      }),
      execute: async ({ minutes, note }) => {
        if (!writable) return denied;
        const seconds = Math.round(minutes * 60);
        await db.insert(timeLogs).values({
          taskId,
          projectId,
          userId,
          startedAt: new Date(Date.now() - seconds * 1000),
          endedAt: new Date(),
          seconds,
          note: note?.trim() || null,
        });
        touch();
        return { ok: true as const, minutes };
      },
    }),
    recordOwnedTool: tool({
      description:
        "Add a tool to the user's owned-tools inventory when they say they bought or already have it.",
      inputSchema: z.object({ name: z.string().min(1) }),
      execute: async ({ name }) => {
        const clean = name.trim().replace(/\s+/g, " ");
        if (!clean) return { ok: false as const };
        await db
          .insert(userTools)
          .values({ userId, name: clean })
          .onConflictDoNothing({
            target: [userTools.userId, userTools.name],
          });
        revalidatePath("/profile");
        return { ok: true as const, name: clean };
      },
    }),
  };

  const result = streamText({
    model: MODEL,
    system: `${SYSTEM}\n\n--- USER'S OWNED TOOLS ---\n${toolsList}\n\n--- CURRENT TASK CONTEXT ---\n${context}`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      try {
        await db
          .delete(chatMessages)
          .where(eq(chatMessages.taskId, taskId));
        if (finalMessages.length) {
          await db.insert(chatMessages).values(
            finalMessages.map((m) => ({
              projectId,
              taskId,
              role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
              authorId: m.role === "user" ? session.user.id : null,
              parts: m.parts as unknown[],
            })),
          );
        }
      } catch (e) {
        console.error("[chat] persist failed:", e);
      }
    },
  });
}
