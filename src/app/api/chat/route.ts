import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import {
  chatMessages,
  projects,
  tasks,
  taskGuides,
  phases,
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
- ACTIONS: you can actually change things with your tools — and ONLY these: update the PROJECT BRIEF via setProjectBrief (when the user states a durable fact about the home/scope — "walls are plaster", house age, budget — fold it into the existing brief and save the full text), rename the project / change its tagline via updateProjectDetails, DELETE a task via deleteTask or a phase via deletePhase (only on explicit request), CREATE A NEW TASK via addTask (optionally in a phase from PROJECT PHASES or a new phase, optionally with steps/tools/materials/safety; then call moveTask if the user wants it in a specific spot), set this task's status, REWRITE THE PLAN (steps/tools/materials/safety/tips) via updateTaskGuide, rename/redescribe via editTaskDetails, REORDER the project task list via moveTask (move any task before/after another, identified by its # from the task list above — works on ANY task, not just this one), MANAGE PHASES — moveTaskToPhase (put a task in a different/new phase), movePhase (reorder phases before/after another), renamePhase, mergePhases (fold one phase's tasks into another and delete it; great for cleaning up stray single-task phases), add a note, add a buy-list item, log time, record an owned tool. Take the action when the user asks. Don't just describe it — do it.
- CRITICAL — if the user asks you to change/fix/update the steps or the plan, you MUST call updateTaskGuide with the corrected arrays (and editTaskDetails if the title/detail is now inaccurate). Adding a note is NOT updating the plan. Never say "steps updated" / "task updated" unless that specific tool returned ok. After acting, state ONLY the changes whose tools returned ok — nothing more.
- "Make this task / the plan reflect <X>" means the WHOLE task: call editTaskDetails (title/detail) AND updateTaskGuide (steps/tools/materials/safety/tips). After ANY change to the method, scan the existing guide — if tools/materials/safety/steps still describe the OLD method, they are now wrong and unsafe; fix them in the same turn or, if you can't, explicitly tell the user exactly which sections are now stale.
- SAFETY ON REWRITE: never silently drop a hazard that still applies under the new method. Re-derive safety for the NEW method from scratch. Example: switching from heat-gun stripping to SANDING old paint does NOT remove lead risk — sanding pre-1978 paint creates lead dust and still requires a lead test, containment, HEPA, and a P100. Keep the lead/asbestos warnings that still apply; only remove ones genuinely irrelevant to the new method.
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
    taskId: rawTaskId,
  }: {
    messages: UIMessage[];
    projectId: string;
    taskId?: string | null;
  } = await req.json();
  // Project-level Foreman = no specific task.
  const taskId = rawTaskId || null;

  if (!projectId) {
    return new Response("Missing project", { status: 400 });
  }

  const role = await getAccess(
    projectId,
    session.user.id,
    session.user.email,
  );
  if (!role) return new Response("Forbidden", { status: 403 });

  const db = getDb();
  const [taskRows, ownedTools, allTasks, projectPhases, projectRows] =
    await Promise.all([
    taskId
      ? db
          .select()
          .from(tasks)
          .leftJoin(taskGuides, eq(tasks.id, taskGuides.taskId))
          .where(
            and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)),
          )
      : Promise.resolve([]),
    getUserTools(session.user.id),
    db
      .select({
        id: tasks.id,
        num: tasks.num,
        title: tasks.title,
        status: tasks.status,
        position: tasks.position,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.position)),
    db
      .select({
        id: phases.id,
        name: phases.name,
        position: phases.position,
      })
      .from(phases)
      .where(eq(phases.projectId, projectId))
      .orderBy(asc(phases.position)),
    db
      .select({
        title: projects.title,
        summary: projects.summary,
        brief: projects.brief,
      })
      .from(projects)
      .where(eq(projects.id, projectId)),
  ]);

  const project = projectRows[0];
  const row = taskRows[0];
  if (taskId && !row)
    return new Response("Task not found", { status: 404 });

  const t = row?.task;
  const g = row?.task_guide;
  const context = t
    ? [
        `TASK #${t.num}: ${t.title}`,
        t.detail ? `Detail: ${t.detail}` : "",
        t.hoursEstimate ? `Estimated effort: ${t.hoursEstimate}` : "",
        g?.tools?.length ? `Planned tools: ${g.tools.join("; ")}` : "",
        g?.materials?.length
          ? `Planned materials: ${g.materials.join("; ")}`
          : "",
        g?.safety?.length
          ? `Known safety notes: ${g.safety.join("; ")}`
          : "",
        g?.steps?.length
          ? `Planned steps: ${g.steps.join(" -> ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const toolsList =
    ownedTools.length > 0
      ? ownedTools.map((t) => t.name).join("; ")
      : "(none recorded — treat all needed tools as not owned)";

  const taskList = allTasks
    .map((x) => `#${x.num} [${x.status}] ${x.title}`)
    .join("\n");

  const phaseList = projectPhases.length
    ? projectPhases.map((p) => p.name).join("\n")
    : "(no phases yet)";

  const projectInfo = [
    `PROJECT: ${project?.title ?? "Renovation"}`,
    project?.summary ? project.summary : "",
    project?.brief
      ? `BRIEF (ground truth — always honor this):\n${project.brief}`
      : "(no project brief set — if the user states a key fact about the home/scope, suggest saving it with setProjectBrief)",
  ]
    .filter(Boolean)
    .join("\n");

  const writable = canWrite(role);
  const userId = session.user.id;
  const denied = {
    ok: false as const,
    message:
      "You only have view access to this project, so I couldn't make that change.",
  };
  const noTask = {
    ok: false as const,
    message:
      "No task is open — you're the project Foreman here. Tell the user to open that specific task to do this, or use addTask / moveTask which work project-wide.",
  };
  function touch() {
    if (taskId) revalidatePath(`/p/${projectId}/t/${taskId}`);
    revalidatePath(`/p/${projectId}`);
    revalidatePath(`/p/${projectId}/foreman`);
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

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^\s*\d+(\.\d+)?\s*[—.)\-:]?\s*/, "")
      .trim();

  type Ph = { id: string; name: string; position: number };
  const findPhase = (list: Ph[], q: string): Ph | undefined => {
    const ql = q.trim().toLowerCase();
    return (
      list.find((p) => p.name.trim().toLowerCase() === ql) ??
      list.find((p) => norm(p.name) === norm(q))
    );
  };
  const freshPhases = () =>
    db
      .select({
        id: phases.id,
        name: phases.name,
        position: phases.position,
      })
      .from(phases)
      .where(eq(phases.projectId, projectId))
      .orderBy(asc(phases.position));

  const tools = {
    setProjectBrief: tool({
      description:
        "Replace the PROJECT BRIEF — the ground-truth context you read in every conversation (e.g. 'walls are plaster not drywall', house age, scope, constraints). When the user states a durable fact about the home or project, fold it into the existing brief and save the FULL updated brief here. Works project-wide; no task needed.",
      inputSchema: z.object({
        brief: z
          .string()
          .min(1)
          .describe("The complete updated project brief text"),
      }),
      execute: async ({ brief }) => {
        if (!writable) return denied;
        return commit(
          "setProjectBrief",
          async () => {
            await db
              .update(projects)
              .set({ brief: brief.trim(), updatedAt: new Date() })
              .where(eq(projects.id, projectId));
            touch();
          },
          { brief: brief.trim() },
        );
      },
    }),
    updateProjectDetails: tool({
      description:
        "Rename the project and/or change its short tagline. Pass only what you're changing. (For the long ground-truth context use setProjectBrief instead.)",
      inputSchema: z.object({
        title: z.string().optional(),
        summary: z
          .string()
          .optional()
          .describe("Short one-line tagline shown on cards"),
      }),
      execute: async ({ title, summary }) => {
        if (!writable) return denied;
        const t = title?.trim();
        const s = summary?.trim();
        if (!t && s === undefined)
          return {
            ok: false as const,
            message: "Nothing to change — give a title and/or tagline.",
          };
        return commit(
          "updateProjectDetails",
          async () => {
            const patch: {
              title?: string;
              summary?: string | null;
              updatedAt: Date;
            } = { updatedAt: new Date() };
            if (t) patch.title = t;
            if (s !== undefined) patch.summary = s || null;
            await db
              .update(projects)
              .set(patch)
              .where(eq(projects.id, projectId));
            touch();
          },
          { title: t, summary: s },
        );
      },
    }),
    addTask: tool({
      description:
        "Create a NEW task in this project. Optionally place it in a phase (use an exact name from PROJECT PHASES, or a new name to create that phase) and give it steps/tools/materials/safety/tips. It's added to the end of the list — use moveTask afterward if the user wants it in a specific spot.",
      inputSchema: z.object({
        title: z.string().min(2),
        detail: z.string().optional(),
        hoursEstimate: z
          .string()
          .optional()
          .describe("e.g. '1–2h', '30m'"),
        phase: z
          .string()
          .optional()
          .describe("Phase name; omit to leave unphased"),
        steps: z.array(z.string()).optional(),
        tools: z.array(z.string()).optional(),
        materials: z.array(z.string()).optional(),
        safety: z.array(z.string()).optional(),
        tips: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        if (!writable) return denied;
        const title = input.title.trim();
        const maxNum = allTasks.reduce((m, x) => {
          const n = parseInt(x.num, 10);
          return Number.isFinite(n) && n > m ? n : m;
        }, 0);
        const num = String(maxNum + 1);
        const position =
          allTasks.reduce((m, x) => Math.max(m, x.position), -1) + 1;
        const phaseName = input.phase?.trim();
        const clean = (a?: string[]) =>
          (a ?? []).map((s) => s.trim()).filter(Boolean);
        const guide = {
          tools: clean(input.tools),
          materials: clean(input.materials),
          safety: clean(input.safety),
          steps: clean(input.steps),
          tips: clean(input.tips),
        };
        const hasGuide = Object.values(guide).some((a) => a.length > 0);
        let newTaskId = "";
        let resolvedPhase = "Unphased";
        const result = await commit(
          "addTask",
          async () => {
            let phaseId: string | null = null;
            if (phaseName) {
              const existing = projectPhases.find(
                (p) => norm(p.name) === norm(phaseName),
              );
              if (existing) {
                phaseId = existing.id;
                resolvedPhase = existing.name;
              } else {
                const pos =
                  projectPhases.reduce(
                    (m, p) => Math.max(m, p.position),
                    -1,
                  ) + 1;
                const [ph] = await db
                  .insert(phases)
                  .values({ projectId, name: phaseName, position: pos })
                  .returning({ id: phases.id, name: phases.name });
                phaseId = ph.id;
                resolvedPhase = ph.name;
              }
            }
            const [created] = await db
              .insert(tasks)
              .values({
                projectId,
                phaseId,
                num,
                title,
                detail: input.detail?.trim() || null,
                hoursEstimate: input.hoursEstimate?.trim() || null,
                position,
              })
              .returning({ id: tasks.id });
            newTaskId = created.id;
            if (hasGuide) {
              await db
                .insert(taskGuides)
                .values({ taskId: created.id, ...guide });
            }
            touch();
            revalidatePath(`/p/${projectId}/t/${created.id}`);
          },
          { added: `#${num} ${title}` },
        );
        if (result.ok)
          return { ...result, num, phase: resolvedPhase, taskId: newTaskId };
        return result;
      },
    }),
    setTaskStatus: tool({
      description:
        "Set this task's status. Use when the user says it's done, in progress, or not started.",
      inputSchema: z.object({
        status: z.enum(["todo", "in_progress", "done"]),
      }),
      execute: async ({ status }) => {
        if (!writable) return denied;
        if (!taskId) return noTask;
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
    moveTask: tool({
      description:
        "Reorder the project task list: move a task to just before or just after another task. Identify tasks by their # number exactly as shown in 'ALL TASKS IN THIS PROJECT'. Provide exactly one of `before` or `after`.",
      inputSchema: z.object({
        task: z.string().describe("The task # to move, e.g. '16a'"),
        before: z
          .string()
          .optional()
          .describe("Move it to just before this task #"),
        after: z
          .string()
          .optional()
          .describe("Move it to just after this task #"),
      }),
      execute: async ({ task, before, after }) => {
        if (!writable) return denied;
        const norm = (s: string) => s.replace(/^#/, "").trim().toLowerCase();
        // LLMs often send "" for the unused optional — treat blank as absent.
        const bef = before?.trim() ? before.trim() : undefined;
        const aft = after?.trim() ? after.trim() : undefined;
        const anchorNum = bef ?? aft;
        const placeBefore = !!bef;
        if (!anchorNum || (bef && aft))
          return {
            ok: false as const,
            message:
              "Tell me one anchor: place it BEFORE a task # or AFTER a task #, not both.",
          };
        const moving = allTasks.find((x) => norm(x.num) === norm(task));
        const anchor = allTasks.find((x) => norm(x.num) === norm(anchorNum));
        if (!moving)
          return { ok: false as const, message: `No task #${task}.` };
        if (!anchor)
          return {
            ok: false as const,
            message: `No task #${anchorNum} to anchor to.`,
          };
        if (moving.id === anchor.id)
          return {
            ok: false as const,
            message: "A task can't be moved relative to itself.",
          };
        return commit(
          "moveTask",
          async () => {
            const rest = allTasks.filter((x) => x.id !== moving.id);
            const ai = rest.findIndex((x) => x.id === anchor.id);
            const insertAt = placeBefore ? ai : ai + 1;
            const ordered = [
              ...rest.slice(0, insertAt),
              moving,
              ...rest.slice(insertAt),
            ];
            await Promise.all(
              ordered.map((x, i) =>
                x.position === i
                  ? Promise.resolve()
                  : db
                      .update(tasks)
                      .set({ position: i })
                      .where(eq(tasks.id, x.id)),
              ),
            );
            touch();
          },
          {
            moved: `#${moving.num}`,
            placement: placeBefore ? "before" : "after",
            anchor: `#${anchor.num}`,
          },
        );
      },
    }),
    deleteTask: tool({
      description:
        "Permanently delete a task (by its #) and its notes/time logs/guide. Photos and buy-list items it created stay at the project level. Use only on explicit request.",
      inputSchema: z.object({
        task: z.string().describe("Task # to delete"),
      }),
      execute: async ({ task }) => {
        if (!writable) return denied;
        const tnum = task.replace(/^#/, "").trim().toLowerCase();
        const target = allTasks.find(
          (x) => x.num.trim().toLowerCase() === tnum,
        );
        if (!target)
          return { ok: false as const, message: `No task #${task}.` };
        return commit(
          "deleteTask",
          async () => {
            await db.delete(tasks).where(eq(tasks.id, target.id));
            touch();
          },
          { deleted: `#${target.num} ${target.title}` },
        );
      },
    }),
    moveTaskToPhase: tool({
      description:
        "Move a task into a different phase. Identify the task by its # and the phase by an exact name from PROJECT PHASES; if the phase name doesn't exist, a new phase is created at the end.",
      inputSchema: z.object({
        task: z.string().describe("Task # to move, e.g. '29'"),
        phase: z.string().min(1).describe("Destination phase name"),
      }),
      execute: async ({ task, phase }) => {
        if (!writable) return denied;
        const tnum = task.replace(/^#/, "").trim().toLowerCase();
        const moving = allTasks.find(
          (x) => x.num.trim().toLowerCase() === tnum,
        );
        if (!moving)
          return { ok: false as const, message: `No task #${task}.` };
        const wanted = phase.trim();
        return commit(
          "moveTaskToPhase",
          async () => {
            const phs = await freshPhases();
            let target = findPhase(phs, wanted);
            if (!target) {
              const pos =
                phs.reduce((m, p) => Math.max(m, p.position), -1) + 1;
              const [created] = await db
                .insert(phases)
                .values({ projectId, name: wanted, position: pos })
                .returning({
                  id: phases.id,
                  name: phases.name,
                  position: phases.position,
                });
              target = created;
            }
            if (!target) throw new Error("Could not resolve phase");
            await db
              .update(tasks)
              .set({ phaseId: target.id, updatedAt: new Date() })
              .where(eq(tasks.id, moving.id));
            touch();
          },
          { moved: `#${moving.num}`, phase: wanted },
        );
      },
    }),
    movePhase: tool({
      description:
        "Reorder phases: move a phase to just before or just after another phase (by exact names from PROJECT PHASES). Provide exactly one of before/after.",
      inputSchema: z.object({
        phase: z.string().min(1),
        before: z.string().optional(),
        after: z.string().optional(),
      }),
      execute: async ({ phase, before, after }) => {
        if (!writable) return denied;
        const bef = before?.trim() ? before.trim() : undefined;
        const aft = after?.trim() ? after.trim() : undefined;
        const anchorName = bef ?? aft;
        const placeBefore = !!bef;
        if (!anchorName || (bef && aft))
          return {
            ok: false as const,
            message:
              "Tell me one anchor: place it BEFORE a phase or AFTER a phase, not both.",
          };
        return commit(
          "movePhase",
          async () => {
            const phs = await freshPhases();
            const moving = findPhase(phs, phase);
            const anchor = findPhase(phs, anchorName);
            if (!moving) throw new Error(`No phase "${phase}"`);
            if (!anchor) throw new Error(`No phase "${anchorName}"`);
            if (moving.id === anchor.id)
              throw new Error("Same phase");
            const rest = phs.filter((p) => p.id !== moving.id);
            const ai = rest.findIndex((p) => p.id === anchor.id);
            const at = placeBefore ? ai : ai + 1;
            const ordered = [
              ...rest.slice(0, at),
              moving,
              ...rest.slice(at),
            ];
            await Promise.all(
              ordered.map((p, i) =>
                p.position === i
                  ? Promise.resolve()
                  : db
                      .update(phases)
                      .set({ position: i })
                      .where(eq(phases.id, p.id)),
              ),
            );
            touch();
          },
          {
            phase,
            placement: placeBefore ? "before" : "after",
            anchor: anchorName,
          },
        );
      },
    }),
    renamePhase: tool({
      description:
        "Rename a phase. Match the current phase by an exact name from PROJECT PHASES.",
      inputSchema: z.object({
        phase: z.string().min(1).describe("Current phase name"),
        name: z.string().min(1).describe("New phase name"),
      }),
      execute: async ({ phase, name }) => {
        if (!writable) return denied;
        const newName = name.trim();
        if (!newName)
          return { ok: false as const, message: "New name is empty." };
        return commit(
          "renamePhase",
          async () => {
            const phs = await freshPhases();
            const target = findPhase(phs, phase);
            if (!target) throw new Error(`No phase "${phase}"`);
            await db
              .update(phases)
              .set({ name: newName })
              .where(eq(phases.id, target.id));
            touch();
          },
          { from: phase, to: newName },
        );
      },
    }),
    mergePhases: tool({
      description:
        "Merge one phase into another: all tasks from `from` move to `into`, then the `from` phase is deleted. Use exact names from PROJECT PHASES.",
      inputSchema: z.object({
        from: z.string().min(1).describe("Phase to empty and remove"),
        into: z.string().min(1).describe("Phase that absorbs the tasks"),
      }),
      execute: async ({ from, into }) => {
        if (!writable) return denied;
        return commit(
          "mergePhases",
          async () => {
            const phs = await freshPhases();
            const src = findPhase(phs, from);
            const dst = findPhase(phs, into);
            if (!src) throw new Error(`No phase "${from}"`);
            if (!dst) throw new Error(`No phase "${into}"`);
            if (src.id === dst.id) throw new Error("Same phase");
            await db
              .update(tasks)
              .set({ phaseId: dst.id, updatedAt: new Date() })
              .where(eq(tasks.phaseId, src.id));
            await db.delete(phases).where(eq(phases.id, src.id));
            touch();
          },
          { merged: from, into },
        );
      },
    }),
    deletePhase: tool({
      description:
        "Delete a phase (by exact name from PROJECT PHASES). Its tasks are NOT deleted — they become unphased. To keep them grouped, use mergePhases instead.",
      inputSchema: z.object({
        phase: z.string().min(1),
      }),
      execute: async ({ phase }) => {
        if (!writable) return denied;
        return commit(
          "deletePhase",
          async () => {
            const phs = await freshPhases();
            const target = findPhase(phs, phase);
            if (!target) throw new Error(`No phase "${phase}"`);
            await db.delete(phases).where(eq(phases.id, target.id));
            touch();
          },
          { deletedPhase: phase },
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
        if (!taskId) return noTask;
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
        if (!taskId) return noTask;
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
        if (!taskId) return noTask;
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
        if (!taskId) return noTask;
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
        if (!taskId) return noTask;
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
    system: `${SYSTEM}\n\n--- ABOUT THIS PROJECT ---\n${projectInfo}\n\n--- USER'S OWNED TOOLS ---\n${toolsList}\n\n--- PROJECT PHASES ---\n${phaseList}\n\n--- ALL TASKS IN THIS PROJECT (current order) ---\n${taskList}\n\n${
      taskId
        ? `--- CURRENT TASK CONTEXT ---\n${context}`
        : `--- MODE: PROJECT FOREMAN ---\nNo specific task is open. You're helping plan the whole project: answer questions, advise sequencing, and CREATE or REORDER tasks (addTask / moveTask) when asked. For status changes, notes, time logs, or rewriting one task's plan, tell the user to open that specific task — those tools need a task open.`
    }`,
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
          .where(
            and(
              eq(chatMessages.projectId, projectId),
              taskId
                ? eq(chatMessages.taskId, taskId)
                : isNull(chatMessages.taskId),
            ),
          );
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
