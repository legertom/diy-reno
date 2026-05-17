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
- ACTIONS: you can actually change this task with your tools — and ONLY these: set status, REWRITE THE PLAN (steps/tools/materials/safety/tips) via updateTaskGuide, rename/redescribe via editTaskDetails, add a note, add a buy-list item, log time, record an owned tool. Take the action when the user asks. Don't just describe it — do it.
- CRITICAL — if the user asks you to change/fix/update the steps or the plan, you MUST call updateTaskGuide with the corrected arrays (and editTaskDetails if the title/detail is now inaccurate). Adding a note is NOT updating the plan. Never say "steps updated" / "task updated" unless that specific tool returned ok. After acting, state ONLY the changes whose tools returned ok — nothing more.
- You have the FULL conversation for this task. If the change was already spelled out earlier in this thread — by the user OR in your own prior message — and the user says to apply it ("update it", "do that", "again", "make those changes", "go"), ACT on that prior content immediately with the right tool. Do NOT ask for details that are already in the thread. Ask a clarifying question only when the intended change genuinely cannot be found anywhere in the conversation. Never fabricate a change a tool didn't confirm.
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

  // Run a write and only report success if it actually committed — so the
  // Foreman can never claim a change that didn't land.
  async function commit<T extends Record<string, unknown>>(
    label: string,
    op: () => Promise<void>,
    ok: T,
  ) {
    try {
      await op();
      console.log(`[foreman] ${label} committed (task ${taskId})`);
      return { ok: true as const, ...ok };
    } catch (e) {
      console.error(`[foreman] ${label} FAILED (task ${taskId}):`, e);
      return {
        ok: false as const,
        message:
          "I hit a database error and could not save that — tell the user it did NOT save and to try again.",
      };
    }
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
        return commit(
          "setTaskStatus",
          async () => {
            await db
              .update(tasks)
              .set({
                status,
                completedAt: status === "done" ? new Date() : null,
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, taskId));
            touch();
          },
          { status },
        );
      },
    }),
    updateTaskGuide: tool({
      description:
        "Rewrite this task's PLAN. Pass only the sections you are changing; each provided array fully REPLACES that section. Use when the user wants the steps/tools/materials/safety/tips corrected or rewritten.",
      inputSchema: z.object({
        steps: z.array(z.string()).optional(),
        tools: z.array(z.string()).optional(),
        materials: z.array(z.string()).optional(),
        safety: z.array(z.string()).optional(),
        tips: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        if (!writable) return denied;
        const set: Partial<{
          steps: string[];
          tools: string[];
          materials: string[];
          safety: string[];
          tips: string[];
        }> = {};
        for (const k of [
          "steps",
          "tools",
          "materials",
          "safety",
          "tips",
        ] as const) {
          if (input[k]) set[k] = input[k]!.map((s) => s.trim()).filter(Boolean);
        }
        const changed = Object.keys(set);
        if (changed.length === 0)
          return {
            ok: false as const,
            message: "No sections were provided to update.",
          };
        return commit(
          "updateTaskGuide",
          async () => {
            await db
              .insert(taskGuides)
              .values({
                taskId,
                steps: set.steps ?? [],
                tools: set.tools ?? [],
                materials: set.materials ?? [],
                safety: set.safety ?? [],
                tips: set.tips ?? [],
              })
              .onConflictDoUpdate({ target: taskGuides.taskId, set });
            await db
              .update(tasks)
              .set({ updatedAt: new Date() })
              .where(eq(tasks.id, taskId));
            touch();
          },
          { updated: changed },
        );
      },
    }),
    editTaskDetails: tool({
      description:
        "Rename this task or rewrite its one-line description. Use when the task's title/detail no longer matches the real job.",
      inputSchema: z.object({
        title: z.string().min(1).optional(),
        detail: z.string().optional(),
      }),
      execute: async ({ title, detail }) => {
        if (!writable) return denied;
        const set: { title?: string; detail?: string; updatedAt: Date } = {
          updatedAt: new Date(),
        };
        if (title) set.title = title.trim();
        if (detail !== undefined) set.detail = detail.trim();
        if (!("title" in set) && !("detail" in set))
          return {
            ok: false as const,
            message: "Nothing to change.",
          };
        return commit(
          "editTaskDetails",
          async () => {
            await db.update(tasks).set(set).where(eq(tasks.id, taskId));
            touch();
          },
          { title: set.title, detail: set.detail },
        );
      },
    }),
    addNote: tool({
      description:
        "Add a work note to this task (a tip learned, a heads-up, what's left).",
      inputSchema: z.object({ body: z.string().min(1) }),
      execute: async ({ body }) => {
        if (!writable) return denied;
        return commit(
          "addNote",
          async () => {
            await db.insert(notes).values({
              taskId,
              projectId,
              authorId: userId,
              body: body.trim(),
            });
            touch();
          },
          { body: body.trim() },
        );
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
        return commit(
          "addBuyItem",
          async () => {
            await db.insert(shoppingItems).values({
              projectId,
              taskId,
              label: label.trim(),
              quantity: quantity?.trim() || null,
              addedById: userId,
            });
            touch();
          },
          { label: label.trim() },
        );
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
        return commit(
          "logTime",
          async () => {
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
          },
          { minutes },
        );
      },
    }),
    recordOwnedTool: tool({
      description:
        "Add a tool to the user's owned-tools inventory when they say they bought or already have it.",
      inputSchema: z.object({ name: z.string().min(1) }),
      execute: async ({ name }) => {
        const clean = name.trim().replace(/\s+/g, " ");
        if (!clean)
          return { ok: false as const, message: "Empty tool name." };
        return commit(
          "recordOwnedTool",
          async () => {
            await db
              .insert(userTools)
              .values({ userId, name: clean })
              .onConflictDoNothing({
                target: [userTools.userId, userTools.name],
              });
            revalidatePath("/profile");
          },
          { name: clean },
        );
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
