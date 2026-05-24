import {
  convertToModelMessages,
  generateText,
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
  chatThreads,
  foremanMemories,
  properties,
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

// Transcript compaction: keep the last KEEP_LAST turns verbatim; once the
// thread grows past KEEP_LAST + COMPACT_BATCH, fold the batch rolling out of
// that window into a cheap rolling summary instead of replaying everything.
const KEEP_LAST = 12;
const COMPACT_BATCH = 8;

const textOf = (m: UIMessage): string =>
  (m.parts as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join(" ")
    .trim();

const SYSTEM = `You are "The Foreman" — a seasoned general contractor with 25+ years of hands-on residential renovation experience who loves coaching ambitious DIYers.

Voice: warm, plain-spoken, encouraging but never reckless. Like a pro friend on-site.

Rules:
- Be specific and practical. Give concrete tools, materials, measurements, grits, cure times, and order of operations.
- SAFETY FIRST. Proactively flag lead paint (pre-1978), asbestos (old flooring/mastic/popcorn), gas, structural, mold, and electrical risks. Say clearly when something needs a licensed pro, a permit, or an inspection — don't let pride cause a hazard.
- When the user shares a photo, study it closely and describe what you actually see before advising.
- Prefer short paragraphs and tight numbered steps. Bold the one thing that matters most.
- If something is ambiguous, ask one sharp clarifying question instead of guessing.
- TOOLS: when a task needs tools, check them against the user's owned-tools list. Clearly state which planned tools they ALREADY OWN and which they're MISSING. For each missing tool, recommend BUY or RENT — rent expensive/bulky/seldom-reused gear (floor sander, tile wet saw, scaffolding, hammer drill for one job), buy cheap or frequently-reused hand tools. Give rough price/rental ranges when useful. Never tell them to buy something they already own.
- ACTIONS: you can actually change things with your tools — and ONLY these: update the PROJECT BRIEF via setProjectBrief (when the user states a durable fact about the home/scope — "walls are plaster", house age, budget — fold it into the existing brief and save the full text), rename the project / change its tagline via updateProjectDetails, DELETE a task via deleteTask or a phase via deletePhase (only on explicit request), CREATE A NEW TASK via addTask (optionally in a phase from PROJECT PHASES or a new phase, optionally with steps/tools/materials/safety; then call moveTask if the user wants it in a specific spot), set a task's status via setTaskStatus, REWRITE THE PLAN (steps/tools/materials/safety/tips) via updateTaskGuide, rename/redescribe or RENUMBER a task via editTaskDetails (use its 'num' arg to fix duplicate numbers — e.g. split three #30 into '30a'/'30b'/'30c'), REORDER the project task list via moveTask, MANAGE PHASES — moveTaskToPhase, movePhase, renamePhase, mergePhases (fold one phase's tasks into another and delete it; great for cleaning up stray single-task phases), add a note, add a buy-list item, log time, record an owned tool, save durable facts about THE PLACE via setPropertyDetails (type apartment/house/other, own/rent, location, name), and offer tappable quick replies via ask (accelerator only — the user can always type). EVERY task tool works on ANY task from anywhere (project chat, the global bubble, or a task page): pass the 'task' arg as the task's # (e.g. '30a') or part of its title — you do NOT need the user to 'open' a task. If a # is ambiguous (duplicates), the tool tells you the candidates; pick by title or renumber them. Take the action when the user asks. Don't just describe it — do it.
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
  const [
    taskRows,
    ownedTools,
    allTasks,
    projectPhases,
    projectRows,
    memoryRows,
    threadRows,
  ] = await Promise.all([
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
        propertyId: projects.propertyId,
        propName: properties.name,
        propType: properties.type,
        propOwnership: properties.ownership,
        propLocation: properties.location,
      })
      .from(projects)
      .leftJoin(properties, eq(projects.propertyId, properties.id))
      .where(eq(projects.id, projectId)),
    db
      .select()
      .from(foremanMemories)
      .where(eq(foremanMemories.userId, session.user.id))
      .orderBy(asc(foremanMemories.createdAt)),
    db
      .select({ summary: chatThreads.summary })
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.projectId, projectId),
          taskId
            ? eq(chatThreads.taskId, taskId)
            : isNull(chatThreads.taskId),
        ),
      ),
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
  const propertyId = project?.propertyId ?? null;

  // Durable memory in scope for this conversation (user / property / project).
  const memText = memoryRows
    .filter(
      (m) =>
        (m.scope === "user" && m.scopeId === userId) ||
        (m.scope === "project" && m.scopeId === projectId) ||
        (propertyId !== null &&
          m.scope === "property" &&
          m.scopeId === propertyId),
    )
    .map((m) => `- ${m.body}`)
    .join("\n");
  const priorSummary = threadRows[0]?.summary?.trim() ?? "";

  // Conversational intake ("first scrivener"): what structured context is
  // still missing. Injected as guidance only — opportunistic, never gating.
  const placeName = project?.propName ?? null;
  const placeNeeded = [
    !project?.propType && "what kind of place it is (apartment / house / other)",
    !project?.propOwnership &&
      "whether they own or rent (condo / co-op if relevant)",
    !project?.propLocation &&
      "rough location (climate / code / permit context)",
    (!placeName || /^my place$/i.test(placeName)) && "a name for the place",
  ].filter(Boolean) as string[];
  const projNeeded = [
    (!project?.title || /^new renovation$/i.test(project.title)) &&
      "what they're actually renovating — set a real title + tagline via updateProjectDetails",
    !project?.brief &&
      "the ground-truth brief (surfaces, age, constraints, scope) via setProjectBrief",
  ].filter(Boolean) as string[];
  const intakeBlock =
    placeNeeded.length || projNeeded.length
      ? `\n\n--- INTAKE: STILL NEEDED (pursue opportunistically — NEVER gate) ---\nYou're also this person's "first scrivener." Capture structure by conversation, never a form/wizard, never a checklist read aloud, never count questions. Lead with the renovation itself (that's what they're excited about); pick up place facts opportunistically as they come up — never as a separate interview. Two layers:\n1) THIS PROJECT (lead with this): ${projNeeded.length ? projNeeded.join("; ") : "complete"}. Set a real title + tagline with updateProjectDetails the moment you have them — the placeholder "New renovation" is what keeps this card out of the user's dashboard until you've done so.\n2) THE PLACE (collect in passing while talking about the project; one property is reused by every project on it): ${placeNeeded.length ? placeNeeded.join("; ") : "complete"}. Save each fact with setPropertyDetails the moment you learn it.\nAdapt to whatever they volunteer; infer and skip the obvious or irrelevant (a renter isn't asked about moving structural walls). Collect just enough to start and backfill the rest as the work surfaces it — do NOT block on completeness. Warm and brief, not an interrogation. No deadlines or dates. Use the ask tool to offer tappable quick replies for short choices (project type, own/rent) — but the user can always just type; chips never gate.`
      : "";
  const denied = {
    ok: false as const,
    message:
      "You only have view access to this project, so I couldn't make that change.",
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

  // Resolve which task a task-scoped tool should act on. The Foreman can
  // act on ANY task from anywhere (project chat, global bubble, or a task
  // page) — pass `task` as its # or part of its title; falls back to the
  // open task. Ambiguity (e.g. duplicate #30) is reported, never guessed.
  const tnum = (s: string) => s.replace(/^#/, "").trim().toLowerCase();
  function resolveTaskId(
    arg?: string,
  ): { ok: true; id: string } | { ok: false; message: string } {
    const a = arg?.trim();
    if (a) {
      const byNum = allTasks.filter((x) => tnum(x.num) === tnum(a));
      if (byNum.length === 1) return { ok: true, id: byNum[0].id };
      const q = a.toLowerCase().replace(/^#/, "");
      const byTitle = allTasks.filter((x) =>
        x.title.toLowerCase().includes(q),
      );
      if (byNum.length === 0 && byTitle.length === 1)
        return { ok: true, id: byTitle[0].id };
      const cands = byNum.length ? byNum : byTitle;
      if (cands.length > 1)
        return {
          ok: false,
          message:
            `"${a}" matches ${cands.length} tasks: ` +
            cands.map((x) => `#${x.num} "${x.title}"`).join(" | ") +
            `. Re-call with a distinct title (or fix the duplicate # via editTaskDetails).`,
        };
      return {
        ok: false,
        message: `No task matches "${a}". Use a # from ALL TASKS IN THIS PROJECT, or part of the title.`,
      };
    }
    if (taskId) return { ok: true, id: taskId };
    return {
      ok: false,
      message:
        "Which task? Pass its # (e.g. '30a') or part of its title — I can act on any task from here, it doesn't need to be opened.",
    };
  }

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
        "Set a task's status (done / in progress / not started). Works on ANY task from anywhere — pass `task` as its # or title; omit only if a task is already open.",
      inputSchema: z.object({
        status: z.enum(["todo", "in_progress", "done"]),
        task: z
          .string()
          .optional()
          .describe("Task # (e.g. '30a') or part of its title"),
      }),
      execute: async ({ status, task }) => {
        if (!writable) return denied;
        const r = resolveTaskId(task);
        if (!r.ok) return r;
        const tid = r.id;
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
              .where(eq(tasks.id, tid));
            touch();
            revalidatePath(`/p/${projectId}/t/${tid}`);
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
        "Rewrite a task's PLAN. Pass only the sections you are changing; each provided array fully REPLACES that section. Works on ANY task — pass `task` as its # or title; omit only if a task is already open.",
      inputSchema: z.object({
        task: z
          .string()
          .optional()
          .describe("Task # (e.g. '30a') or part of its title"),
        steps: z.array(z.string()).optional(),
        tools: z.array(z.string()).optional(),
        materials: z.array(z.string()).optional(),
        safety: z.array(z.string()).optional(),
        tips: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        if (!writable) return denied;
        const r = resolveTaskId(input.task);
        if (!r.ok) return r;
        const tid = r.id;
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
                taskId: tid,
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
              .where(eq(tasks.id, tid));
            touch();
            revalidatePath(`/p/${projectId}/t/${tid}`);
          },
          { updated: changed },
        );
      },
    }),
    editTaskDetails: tool({
      description:
        "Rename a task, rewrite its one-line description, and/or change its # (use `num` to fix duplicate numbers, e.g. split three #30 into '30a'/'30b'/'30c'). Works on ANY task — pass `task` as its current # or title; omit only if a task is already open.",
      inputSchema: z.object({
        task: z
          .string()
          .optional()
          .describe("Which task: current # or part of its title"),
        title: z.string().min(1).optional(),
        detail: z.string().optional(),
        num: z
          .string()
          .optional()
          .describe("New task number/label, e.g. '30a' (no leading #)"),
      }),
      execute: async ({ task, title, detail, num }) => {
        if (!writable) return denied;
        const r = resolveTaskId(task);
        if (!r.ok) return r;
        const tid = r.id;
        const set: {
          title?: string;
          detail?: string;
          num?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };
        if (title) set.title = title.trim();
        if (detail !== undefined) set.detail = detail.trim();
        if (num) set.num = num.replace(/^#/, "").trim();
        if (
          !("title" in set) &&
          !("detail" in set) &&
          !("num" in set)
        )
          return {
            ok: false as const,
            message: "Nothing to change.",
          };
        return commit(
          "editTaskDetails",
          async () => {
            await db.update(tasks).set(set).where(eq(tasks.id, tid));
            touch();
            revalidatePath(`/p/${projectId}/t/${tid}`);
          },
          { title: set.title, detail: set.detail, num: set.num },
        );
      },
    }),
    addNote: tool({
      description:
        "Add a work note to a task (a tip learned, a heads-up, what's left). Works on ANY task — pass `task` as its # or title; omit only if a task is already open.",
      inputSchema: z.object({
        body: z.string().min(1),
        task: z
          .string()
          .optional()
          .describe("Task # (e.g. '30a') or part of its title"),
      }),
      execute: async ({ body, task }) => {
        if (!writable) return denied;
        const r = resolveTaskId(task);
        if (!r.ok) return r;
        const tid = r.id;
        return commit(
          "addNote",
          async () => {
            await db.insert(notes).values({
              taskId: tid,
              projectId,
              authorId: userId,
              body: body.trim(),
            });
            touch();
            revalidatePath(`/p/${projectId}/t/${tid}`);
          },
          { body: body.trim() },
        );
      },
    }),
    addBuyItem: tool({
      description:
        "Add an item to a task's shopping/buy list. Works on ANY task — pass `task` as its # or title; omit only if a task is already open.",
      inputSchema: z.object({
        label: z.string().min(1),
        quantity: z.string().optional(),
        task: z
          .string()
          .optional()
          .describe("Task # (e.g. '30a') or part of its title"),
      }),
      execute: async ({ label, quantity, task }) => {
        if (!writable) return denied;
        const r = resolveTaskId(task);
        if (!r.ok) return r;
        const tid = r.id;
        return commit(
          "addBuyItem",
          async () => {
            await db.insert(shoppingItems).values({
              projectId,
              taskId: tid,
              label: label.trim(),
              quantity: quantity?.trim() || null,
              addedById: userId,
            });
            touch();
            revalidatePath(`/p/${projectId}/t/${tid}`);
          },
          { label: label.trim() },
        );
      },
    }),
    logTime: tool({
      description:
        "Log time the user spent on a task, in minutes. Works on ANY task — pass `task` as its # or title; omit only if a task is already open.",
      inputSchema: z.object({
        minutes: z.number().positive(),
        note: z.string().optional(),
        task: z
          .string()
          .optional()
          .describe("Task # (e.g. '30a') or part of its title"),
      }),
      execute: async ({ minutes, note, task }) => {
        if (!writable) return denied;
        const r = resolveTaskId(task);
        if (!r.ok) return r;
        const tid = r.id;
        const seconds = Math.round(minutes * 60);
        return commit(
          "logTime",
          async () => {
            await db.insert(timeLogs).values({
              taskId: tid,
              projectId,
              userId,
              startedAt: new Date(Date.now() - seconds * 1000),
              endedAt: new Date(),
              seconds,
              note: note?.trim() || null,
            });
            touch();
            revalidatePath(`/p/${projectId}/t/${tid}`);
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
    remember: tool({
      description:
        "Save a durable fact worth recalling in FUTURE conversations — survives 'start fresh'. scope 'user' = about the person (skill, confidence, preferences), 'property' = about the place, 'project' = about this job (default). Use for lasting facts, not small talk.",
      inputSchema: z.object({
        fact: z.string().min(1).describe("The fact to remember, concise"),
        scope: z.enum(["user", "property", "project"]).optional(),
      }),
      execute: async ({ fact, scope }) => {
        const sc = scope ?? "project";
        if ((sc === "project" || sc === "property") && !writable)
          return denied;
        if (sc === "property" && !propertyId)
          return {
            ok: false as const,
            message: "No property is linked to this project yet.",
          };
        const scopeId =
          sc === "user" ? userId : sc === "property" ? propertyId! : projectId;
        return commit(
          "remember",
          async () => {
            await db.insert(foremanMemories).values({
              userId,
              scope: sc,
              scopeId,
              body: fact.trim(),
            });
          },
          { remembered: fact.trim(), scope: sc },
        );
      },
    }),
    forget: tool({
      description:
        "Forget previously-remembered facts that match the given text (within this conversation's user/property/project memory). Use only when the user asks you to forget something.",
      inputSchema: z.object({
        match: z
          .string()
          .min(1)
          .describe("Text to match against saved memories"),
      }),
      execute: async ({ match }) => {
        const q = match.trim().toLowerCase();
        const scopeIds = [
          userId,
          projectId,
          ...(propertyId ? [propertyId] : []),
        ];
        return commit(
          "forget",
          async () => {
            const rows = await db
              .select()
              .from(foremanMemories)
              .where(eq(foremanMemories.userId, userId));
            const ids = rows
              .filter(
                (r) =>
                  scopeIds.includes(r.scopeId) &&
                  r.body.toLowerCase().includes(q),
              )
              .map((r) => r.id);
            for (const id of ids)
              await db
                .delete(foremanMemories)
                .where(eq(foremanMemories.id, id));
          },
          { forgot: match.trim() },
        );
      },
    }),
    setPropertyDetails: tool({
      description:
        "Save durable facts about THE PLACE (the property this project is on) — reused by every project on it. Pass only the fields you're setting; capture them during intake or whenever the user states one.",
      inputSchema: z.object({
        name: z.string().optional().describe("A short name for the place"),
        type: z
          .string()
          .optional()
          .describe("apartment | house | other"),
        ownership: z
          .string()
          .optional()
          .describe("own | rent | condo | co-op"),
        location: z
          .string()
          .optional()
          .describe("City / area — for climate, code, permits"),
      }),
      execute: async ({ name, type, ownership, location }) => {
        if (!writable) return denied;
        if (!propertyId)
          return {
            ok: false as const,
            message: "No property is linked to this project yet.",
          };
        const patch: {
          name?: string;
          type?: string;
          ownership?: string;
          location?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };
        if (name?.trim()) patch.name = name.trim();
        if (type?.trim()) patch.type = type.trim();
        if (ownership?.trim()) patch.ownership = ownership.trim();
        if (location?.trim()) patch.location = location.trim();
        const fields = Object.keys(patch).filter((k) => k !== "updatedAt");
        if (fields.length === 0)
          return {
            ok: false as const,
            message:
              "Nothing to save — give at least one of name / type / ownership / location.",
          };
        return commit(
          "setPropertyDetails",
          async () => {
            await db
              .update(properties)
              .set(patch)
              .where(eq(properties.id, propertyId));
            revalidatePath("/");
            touch();
          },
          { saved: fields },
        );
      },
    }),
    ask: tool({
      description:
        "Attach 2–6 tappable quick-reply chips to the question in your message (e.g. apartment / house / other). An accelerator only: the user can always ignore the chips and type instead — never require a chip, never block on one. Ask the question in your normal text; this just adds the buttons.",
      inputSchema: z.object({
        options: z
          .array(z.string())
          .min(2)
          .max(6)
          .describe("Short tappable answers"),
      }),
      execute: async ({ options }) => ({
        ok: true as const,
        options: options
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, 6),
      }),
    }),
  };

  const memoryBlock = `\n\n--- WHAT YOU REMEMBER (durable; survives "start fresh") ---\n${
    memText ||
    "(nothing saved yet — use the remember tool for durable facts about the user, the place, or this project)"
  }`;
  const summaryBlock = priorSummary
    ? `\n\n--- EARLIER IN THIS CONVERSATION (summary of older turns) ---\n${priorSummary}`
    : "";
  // Bound per-turn cost: the model sees the last KEEP_LAST turns verbatim;
  // everything older is carried by the rolling summary above.
  const recent = messages.slice(-KEEP_LAST);

  const result = streamText({
    model: MODEL,
    system: `${SYSTEM}\n\n--- ABOUT THIS PROJECT ---\n${projectInfo}${memoryBlock}${summaryBlock}${intakeBlock}\n\n--- USER'S OWNED TOOLS ---\n${toolsList}\n\n--- PROJECT PHASES ---\n${phaseList}\n\n--- ALL TASKS IN THIS PROJECT (current order) ---\n${taskList}\n\n${
      taskId
        ? `--- CURRENT TASK CONTEXT ---\n${context}`
        : `--- MODE: PROJECT FOREMAN ---\nNo task is "open", but you can still act on ANY task directly: every task tool (setTaskStatus, updateTaskGuide, editTaskDetails, addNote, addBuyItem, logTime) takes a \`task\` arg — pass the task's # or part of its title (it's in ALL TASKS IN THIS PROJECT above). Never tell the user to open a task; just do it. Use editTaskDetails' \`num\` to fix duplicate task numbers.`
    }`,
    messages: await convertToModelMessages(recent),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      try {
        const threadWhere = and(
          eq(chatMessages.projectId, projectId),
          taskId
            ? eq(chatMessages.taskId, taskId)
            : isNull(chatMessages.taskId),
        );

        // Compaction: once the thread is long, fold the batch of turns just
        // rolling out of the verbatim window into the rolling summary (one
        // cheap summarize call) instead of growing the stored transcript
        // unbounded. The summary + memory carry older context.
        let keep = finalMessages;
        if (finalMessages.length > KEEP_LAST + COMPACT_BATCH) {
          keep = finalMessages.slice(-KEEP_LAST);
          const rollEnd = finalMessages.length - KEEP_LAST;
          const rollStart = Math.max(0, rollEnd - COMPACT_BATCH);
          const rolling = finalMessages
            .slice(rollStart, rollEnd)
            .map((m) => `${m.role.toUpperCase()}: ${textOf(m)}`)
            .filter((l) => l.length > 6)
            .join("\n");
          if (rolling) {
            const { text } = await generateText({
              model: MODEL,
              system:
                "You maintain a tight running memory of a renovation-coaching chat. Keep durable facts, decisions, the user's situation/skill, and open threads; drop pleasantries. Merge the new turns into the existing summary without losing or duplicating earlier facts. 200 words max.",
              prompt: `EXISTING SUMMARY:\n${priorSummary || "(none)"}\n\nNEW TURNS ROLLING OUT OF THE LIVE WINDOW:\n${rolling}\n\nReturn the updated running summary only.`,
            });
            const summary = text.trim();
            const threadKey = and(
              eq(chatThreads.projectId, projectId),
              taskId
                ? eq(chatThreads.taskId, taskId)
                : isNull(chatThreads.taskId),
            );
            await db.delete(chatThreads).where(threadKey);
            await db
              .insert(chatThreads)
              .values({ projectId, taskId, summary });
          }
        }

        await db.delete(chatMessages).where(threadWhere);
        if (keep.length) {
          await db.insert(chatMessages).values(
            keep.map((m) => ({
              projectId,
              taskId,
              role:
                m.role === "assistant"
                  ? ("assistant" as const)
                  : ("user" as const),
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
