import "server-only";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { getDb } from "@/db";
import {
  users,
  properties,
  projects,
  projectMembers,
  phases,
  tasks,
  taskGuides,
  notes,
  shoppingItems,
  timeLogs,
  photos,
  chatMessages,
  userTools,
  type Task,
} from "@/db/schema";

export type Role = "owner" | "editor" | "viewer";

export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user as { id: string; name?: string | null; email?: string | null; image?: string | null };
});

/** Idempotently attach pending email invites to this user. */
async function reconcileInvites(userId: string, email?: string | null) {
  if (!email) return;
  const db = getDb();
  await db
    .update(projectMembers)
    .set({ userId })
    .where(
      and(
        eq(projectMembers.email, email.toLowerCase()),
        isNull(projectMembers.userId),
      ),
    );
}

export async function listProjectsForUser(userId: string, email?: string | null) {
  await reconcileInvites(userId, email);
  const db = getDb();
  const propertyOf = (p: { id: string; name: string } | null) =>
    p ? { id: p.id, name: p.name } : null;

  const owned = await db
    .select({ project: projects, property: properties })
    .from(projects)
    .leftJoin(properties, eq(projects.propertyId, properties.id))
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(projects.updatedAt));

  const shared = await db
    .select({
      project: projects,
      property: properties,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(properties, eq(projects.propertyId, properties.id))
    .where(
      and(
        eq(projectMembers.userId, userId),
        // owner already covered above
      ),
    )
    .orderBy(desc(projects.updatedAt));

  return {
    owned: owned.map((r) => ({
      ...r.project,
      role: "owner" as Role,
      property: propertyOf(r.property),
    })),
    shared: shared
      .filter((s) => s.project.ownerId !== userId)
      .map((s) => ({
        ...s.project,
        role: s.role as Role,
        property: propertyOf(s.property),
      })),
  };
}

/** Resolve the acting user's role on a project, or null if no access. */
export async function getAccess(
  projectId: string,
  userId: string,
  email?: string | null,
): Promise<Role | null> {
  await reconcileInvites(userId, email);
  const db = getDb();
  const [proj] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!proj) return null;
  if (proj.ownerId === userId) return "owner";

  const [m] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        or(
          eq(projectMembers.userId, userId),
          email ? eq(projectMembers.email, email.toLowerCase()) : undefined,
        ),
      ),
    );
  return (m?.role as Role) ?? null;
}

export const canWrite = (role: Role | null) =>
  role === "owner" || role === "editor";

/** For server actions: throws unless the user can write to the project. */
export async function assertCanWrite(projectId: string) {
  const user = await requireUser();
  const role = await getAccess(projectId, user.id, user.email);
  if (!canWrite(role)) throw new Error("Not authorized to edit this project");
  return { user, role: role as Role };
}

/** Property writes are owner-only — sharing stays at the project level
 *  (§3.1), so a Property has no collaborator roles of its own. */
export async function assertOwnsProperty(propertyId: string) {
  const user = await requireUser();
  const db = getDb();
  const [p] = await db
    .select({ ownerId: properties.ownerId })
    .from(properties)
    .where(eq(properties.id, propertyId));
  if (!p || p.ownerId !== user.id)
    throw new Error("Not authorized to edit this property");
  return { user };
}

export async function getProjectOr404(projectId: string) {
  const user = await requireUser();
  const role = await getAccess(projectId, user.id, user.email);
  if (!role) redirect("/");
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) redirect("/");
  return { user, role, project };
}

export type TaskWithGuide = Task & {
  guide: {
    tools: string[];
    materials: string[];
    safety: string[];
    steps: string[];
    tips: string[];
  } | null;
  noteCount: number;
  photoCount: number;
  loggedSeconds: number;
};

async function loadTasksWithMeta(projectId: string): Promise<Map<string, TaskWithGuide>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(tasks)
    .leftJoin(taskGuides, eq(tasks.id, taskGuides.taskId))
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.position));

  const [noteRows, photoRows, timeRows] = await Promise.all([
    db
      .select({ taskId: notes.taskId })
      .from(notes)
      .where(eq(notes.projectId, projectId)),
    db
      .select({ taskId: photos.taskId })
      .from(photos)
      .where(eq(photos.projectId, projectId)),
    db
      .select({ taskId: timeLogs.taskId, seconds: timeLogs.seconds })
      .from(timeLogs)
      .where(eq(timeLogs.projectId, projectId)),
  ]);

  const noteCount = new Map<string, number>();
  for (const n of noteRows)
    noteCount.set(n.taskId, (noteCount.get(n.taskId) ?? 0) + 1);
  const photoCount = new Map<string, number>();
  for (const p of photoRows)
    if (p.taskId)
      photoCount.set(p.taskId, (photoCount.get(p.taskId) ?? 0) + 1);
  const logged = new Map<string, number>();
  for (const t of timeRows)
    logged.set(t.taskId, (logged.get(t.taskId) ?? 0) + (t.seconds ?? 0));

  const map = new Map<string, TaskWithGuide>();
  for (const r of rows) {
    const t = r.task;
    map.set(t.id, {
      ...t,
      guide: r.task_guide
        ? {
            tools: r.task_guide.tools,
            materials: r.task_guide.materials,
            safety: r.task_guide.safety,
            steps: r.task_guide.steps,
            tips: r.task_guide.tips,
          }
        : null,
      noteCount: noteCount.get(t.id) ?? 0,
      photoCount: photoCount.get(t.id) ?? 0,
      loggedSeconds: logged.get(t.id) ?? 0,
    });
  }
  return map;
}

export async function getBoard(projectId: string) {
  const db = getDb();
  const [phaseRows, taskMap] = await Promise.all([
    db
      .select()
      .from(phases)
      .where(eq(phases.projectId, projectId))
      .orderBy(asc(phases.position)),
    loadTasksWithMeta(projectId),
  ]);

  const tasksByPhase = new Map<string, TaskWithGuide[]>();
  const orphans: TaskWithGuide[] = [];
  for (const t of taskMap.values()) {
    if (t.phaseId) {
      const arr = tasksByPhase.get(t.phaseId) ?? [];
      arr.push(t);
      tasksByPhase.set(t.phaseId, arr);
    } else orphans.push(t);
  }

  const all = [...taskMap.values()];
  const done = all.filter((t) => t.status === "done").length;

  return {
    phases: phaseRows.map((p) => ({
      ...p,
      tasks: (tasksByPhase.get(p.id) ?? []).sort(
        (a, b) => a.position - b.position,
      ),
    })),
    orphans,
    progress: { done, total: all.length },
    allTasks: all,
  };
}

export async function getTaskDetail(projectId: string, taskId: string) {
  const db = getDb();
  const [taskRow] = await db
    .select()
    .from(tasks)
    .leftJoin(taskGuides, eq(tasks.id, taskGuides.taskId))
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  if (!taskRow) return null;

  const [noteRows, shoppingRows, timeRows, photoRows] = await Promise.all([
    db
      .select({
        note: notes,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(notes)
      .leftJoin(users, eq(notes.authorId, users.id))
      .where(eq(notes.taskId, taskId))
      .orderBy(desc(notes.createdAt)),
    db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.taskId, taskId))
      .orderBy(asc(shoppingItems.createdAt)),
    db
      .select({
        log: timeLogs,
        userName: users.name,
        userEmail: users.email,
      })
      .from(timeLogs)
      .leftJoin(users, eq(timeLogs.userId, users.id))
      .where(eq(timeLogs.taskId, taskId))
      .orderBy(desc(timeLogs.startedAt)),
    db
      .select()
      .from(photos)
      .where(eq(photos.taskId, taskId))
      .orderBy(desc(photos.createdAt)),
  ]);

  const totalSeconds = timeRows.reduce(
    (s, t) => s + (t.log.seconds ?? 0),
    0,
  );

  return {
    task: taskRow.task,
    guide: taskRow.task_guide,
    notes: noteRows.map((n) => ({
      ...n.note,
      authorName: n.authorName ?? n.authorEmail ?? "Someone",
    })),
    shopping: shoppingRows,
    timeLogs: timeRows.map((t) => ({
      ...t.log,
      userName: t.userName ?? t.userEmail ?? "Someone",
    })),
    photos: photoRows,
    totalSeconds,
  };
}

export async function getProjectPhotos(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(photos)
    .where(eq(photos.projectId, projectId))
    .orderBy(desc(photos.createdAt));
}

export async function getUserTools(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(userTools)
    .where(eq(userTools.userId, userId))
    .orderBy(asc(userTools.name));
}

export async function getMembers(projectId: string) {
  const db = getDb();
  const [proj] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!proj) return null;
  const [ownerUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, proj.ownerId));
  const memberRows = await db
    .select({
      member: projectMembers,
      name: users.name,
      image: users.image,
    })
    .from(projectMembers)
    .leftJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));
  return {
    owner: {
      name: ownerUser?.name ?? null,
      email: ownerUser?.email ?? null,
      image: ownerUser?.image ?? null,
    },
    members: memberRows.map((m) => ({
      id: m.member.id,
      email: m.member.email,
      role: m.member.role as Role,
      name: m.name,
      image: m.image,
      active: !!m.member.userId,
    })),
  };
}

export async function getTaskChat(taskId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.taskId, taskId))
    .orderBy(asc(chatMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    parts: (r.parts as unknown[]) ?? [],
  }));
}

/** Project-level Foreman thread (messages with no task). */
export async function getProjectChat(projectId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.projectId, projectId),
        isNull(chatMessages.taskId),
      ),
    )
    .orderBy(asc(chatMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    parts: (r.parts as unknown[]) ?? [],
  }));
}

/** Project title used as the placeholder while intake is still gathering
 *  the real one. Filtered out of the dashboard listing and used as the
 *  signal "this project is mid-intake" by the modal. */
export const INTAKE_PLACEHOLDER_TITLE = "New renovation";

/** The seeded opener for a fresh intake. Interview-style: short, ends on
 *  a question. Foreman drives, user just answers. */
const INTAKE_WELCOME_TEXT =
  "Hey — I'm the Foreman. I'll coach you through this whole thing. So tell me: what are we renovating? A sentence is plenty — kitchen in a Brooklyn co-op, basement in a 1920s house, whatever fits.";

/** Returns the user's in-progress intake project (one with the placeholder
 *  title still set), creating one with a seeded Foreman welcome if none
 *  exists. Idempotent so it's safe to call on every empty-state render
 *  — and also backfills the welcome on placeholders that predate it.
 *  The chat is then loaded with getProjectChat(projectId). */
export async function ensureIntakePlaceholder(
  userId: string,
): Promise<{ projectId: string }> {
  const db = getDb();

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.ownerId, userId),
        eq(projects.title, INTAKE_PLACEHOLDER_TITLE),
      ),
    )
    .orderBy(desc(projects.createdAt))
    .limit(1);

  let projectId: string;
  if (existing) {
    projectId = existing.id;
  } else {
    // Reuse an existing property if the user has one, else create the
    // default "My place" (renamed by setPropertyDetails during intake).
    const [property] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.ownerId, userId))
      .limit(1);
    const propertyId =
      property?.id ??
      (
        await db
          .insert(properties)
          .values({ ownerId: userId, name: "My place" })
          .returning({ id: properties.id })
      )[0].id;

    const [created] = await db
      .insert(projects)
      .values({
        ownerId: userId,
        propertyId,
        title: INTAKE_PLACEHOLDER_TITLE,
      })
      .returning({ id: projects.id });
    projectId = created.id;
  }

  // Ensure the Foreman has spoken first. Idempotent: only insert if the
  // thread has no assistant turn yet. Handles both fresh creates AND
  // legacy placeholders that predate the welcome-seeding.
  const [anyAssistant] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.projectId, projectId),
        isNull(chatMessages.taskId),
        eq(chatMessages.role, "assistant"),
      ),
    )
    .limit(1);

  if (!anyAssistant) {
    await db.insert(chatMessages).values({
      projectId,
      taskId: null,
      role: "assistant",
      authorId: null,
      parts: [{ type: "text", text: INTAKE_WELCOME_TEXT }],
    });
  }

  return { projectId };
}

/** First not-done task in phase + position order — drives "Next up". */
export function computeNextUp(
  board: Awaited<ReturnType<typeof getBoard>>,
): { task: TaskWithGuide; phaseName: string } | null {
  for (const phase of board.phases) {
    for (const t of phase.tasks) {
      if (t.status !== "done")
        return { task: t, phaseName: phase.name };
    }
  }
  for (const t of board.orphans) {
    if (t.status !== "done") return { task: t, phaseName: "Unphased" };
  }
  return null;
}
