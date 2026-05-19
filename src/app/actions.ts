"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { getDb } from "@/db";
import {
  properties,
  projects,
  projectMembers,
  tasks,
  taskGuides,
  notes,
  shoppingItems,
  timeLogs,
  photos,
  userTools,
  chatMessages,
  chatThreads,
} from "@/db/schema";
import {
  assertCanWrite,
  assertOwnsProperty,
  requireUser,
} from "@/lib/projects";

async function projectIdForTask(taskId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!row) throw new Error("Task not found");
  return row.projectId;
}

function revalidateProject(projectId: string) {
  revalidatePath(`/p/${projectId}`);
  revalidatePath("/");
}

/* ---------------------------------- projects --------------------------- */

/** Reuse the owner's place if they have one, else create a default. Keeps
 *  the data-model invariant that every project is nested under a Property
 *  (the conversational two-stage intake is Phase 4). */
async function ensurePropertyId(userId: string): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.ownerId, userId));
  if (existing) return existing.id;
  const [created] = await db
    .insert(properties)
    .values({ ownerId: userId, name: "My place" })
    .returning({ id: properties.id });
  return created.id;
}

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  const summary = String(formData.get("summary") || "").trim() || null;
  if (!title) throw new Error("A project name is required");
  const db = getDb();
  const propertyId = await ensurePropertyId(user.id);
  const [created] = await db
    .insert(projects)
    .values({ ownerId: user.id, propertyId, title, summary })
    .returning({ id: projects.id });
  revalidatePath("/");
  redirect(`/p/${created.id}`);
}

/** Phase 4 onboarding: create a starter project and drop the user into the
 *  Foreman, where the conversational two-stage intake (the "still needed"
 *  prompt block) interviews them for the place + project. The "New
 *  renovation" title is the placeholder the intake prompt looks for. */
export async function startGuidedSetup() {
  const user = await requireUser();
  const db = getDb();
  const propertyId = await ensurePropertyId(user.id);
  const [created] = await db
    .insert(projects)
    .values({ ownerId: user.id, propertyId, title: "New renovation" })
    .returning({ id: projects.id });
  revalidatePath("/");
  redirect(`/p/${created.id}/foreman`);
}

export async function createProperty(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("A property name is required");
  const db = getDb();
  await db.insert(properties).values({
    ownerId: user.id,
    name,
    type: String(formData.get("type") || "").trim() || null,
    ownership: String(formData.get("ownership") || "").trim() || null,
    location: String(formData.get("location") || "").trim() || null,
  });
  revalidatePath("/");
}

export async function updateProperty(input: {
  propertyId: string;
  name: string;
  type: string;
  ownership: string;
  location: string;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Property name is required");
  await assertOwnsProperty(input.propertyId);
  const db = getDb();
  await db
    .update(properties)
    .set({
      name,
      type: input.type.trim() || null,
      ownership: input.ownership.trim() || null,
      location: input.location.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, input.propertyId));
  revalidatePath("/");
}

export async function updateProject(input: {
  projectId: string;
  title: string;
  summary: string;
  brief: string;
}) {
  const title = input.title.trim();
  if (!title) throw new Error("Project name is required");
  await assertCanWrite(input.projectId);
  const db = getDb();
  await db
    .update(projects)
    .set({
      title,
      summary: input.summary.trim() || null,
      brief: input.brief.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId));
  revalidatePath(`/p/${input.projectId}`);
  revalidatePath(`/p/${input.projectId}/foreman`);
  revalidatePath("/");
}

/* ----------------------------------- tasks ----------------------------- */

export async function setTaskStatus(
  taskId: string,
  status: "todo" | "in_progress" | "done",
) {
  const projectId = await projectIdForTask(taskId);
  await assertCanWrite(projectId);
  const db = getDb();
  await db
    .update(tasks)
    .set({
      status,
      completedAt: status === "done" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
  revalidateProject(projectId);
  revalidatePath(`/p/${projectId}/t/${taskId}`);
}

export async function updateTaskPlan(input: {
  taskId: string;
  title: string;
  detail: string;
  tools: string[];
  materials: string[];
  safety: string[];
  steps: string[];
  tips: string[];
}) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  const projectId = await projectIdForTask(input.taskId);
  await assertCanWrite(projectId);
  const db = getDb();
  const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
  const guide = {
    tools: clean(input.tools),
    materials: clean(input.materials),
    safety: clean(input.safety),
    steps: clean(input.steps),
    tips: clean(input.tips),
  };
  await db
    .update(tasks)
    .set({
      title,
      detail: input.detail.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, input.taskId));
  await db
    .insert(taskGuides)
    .values({ taskId: input.taskId, ...guide })
    .onConflictDoUpdate({ target: taskGuides.taskId, set: guide });
  revalidatePath(`/p/${projectId}/t/${input.taskId}`);
  revalidateProject(projectId);
}

/* ----------------------------------- notes ----------------------------- */

export async function addNote(taskId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const projectId = await projectIdForTask(taskId);
  const { user } = await assertCanWrite(projectId);
  const db = getDb();
  await db
    .insert(notes)
    .values({ taskId, projectId, authorId: user.id, body: text });
  revalidatePath(`/p/${projectId}/t/${taskId}`);
  revalidateProject(projectId);
}

export async function deleteNote(noteId: string) {
  const db = getDb();
  const [n] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!n) return;
  await assertCanWrite(n.projectId);
  await db.delete(notes).where(eq(notes.id, noteId));
  revalidatePath(`/p/${n.projectId}/t/${n.taskId}`);
}

/* ------------------------------- shopping list ------------------------- */

export async function addShoppingItem(
  projectId: string,
  taskId: string | null,
  label: string,
  quantity?: string,
) {
  const text = label.trim();
  if (!text) return;
  const { user } = await assertCanWrite(projectId);
  const db = getDb();
  await db.insert(shoppingItems).values({
    projectId,
    taskId: taskId ?? null,
    label: text,
    quantity: quantity?.trim() || null,
    addedById: user.id,
  });
  revalidateProject(projectId);
  if (taskId) revalidatePath(`/p/${projectId}/t/${taskId}`);
}

export async function toggleShoppingItem(id: string) {
  const db = getDb();
  const [item] = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id));
  if (!item) return;
  await assertCanWrite(item.projectId);
  await db
    .update(shoppingItems)
    .set({ purchased: !item.purchased })
    .where(eq(shoppingItems.id, id));
  revalidateProject(item.projectId);
  if (item.taskId) revalidatePath(`/p/${item.projectId}/t/${item.taskId}`);
}

export async function deleteShoppingItem(id: string) {
  const db = getDb();
  const [item] = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id));
  if (!item) return;
  await assertCanWrite(item.projectId);
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id));
  revalidateProject(item.projectId);
  if (item.taskId) revalidatePath(`/p/${item.projectId}/t/${item.taskId}`);
}

/* -------------------------------- time logs ---------------------------- */

export async function startTimer(taskId: string) {
  const projectId = await projectIdForTask(taskId);
  const { user } = await assertCanWrite(projectId);
  const db = getDb();
  const [running] = await db
    .select({ id: timeLogs.id })
    .from(timeLogs)
    .where(
      and(
        eq(timeLogs.taskId, taskId),
        eq(timeLogs.userId, user.id),
        isNull(timeLogs.endedAt),
      ),
    );
  if (running) return;
  await db
    .insert(timeLogs)
    .values({ taskId, projectId, userId: user.id, startedAt: new Date() });
  revalidatePath(`/p/${projectId}/t/${taskId}`);
  revalidateProject(projectId);
}

export async function stopTimer(taskId: string, note?: string) {
  const projectId = await projectIdForTask(taskId);
  const { user } = await assertCanWrite(projectId);
  const db = getDb();
  const [running] = await db
    .select()
    .from(timeLogs)
    .where(
      and(
        eq(timeLogs.taskId, taskId),
        eq(timeLogs.userId, user.id),
        isNull(timeLogs.endedAt),
      ),
    );
  if (!running) return;
  const endedAt = new Date();
  const seconds = Math.max(
    1,
    Math.round((endedAt.getTime() - running.startedAt.getTime()) / 1000),
  );
  await db
    .update(timeLogs)
    .set({ endedAt, seconds, note: note?.trim() || null })
    .where(eq(timeLogs.id, running.id));
  revalidatePath(`/p/${projectId}/t/${taskId}`);
  revalidateProject(projectId);
}

export async function addManualTime(
  taskId: string,
  minutes: number,
  note?: string,
) {
  if (!minutes || minutes <= 0) return;
  const projectId = await projectIdForTask(taskId);
  const { user } = await assertCanWrite(projectId);
  const db = getDb();
  const seconds = Math.round(minutes * 60);
  const startedAt = new Date(Date.now() - seconds * 1000);
  await db.insert(timeLogs).values({
    taskId,
    projectId,
    userId: user.id,
    startedAt,
    endedAt: new Date(),
    seconds,
    note: note?.trim() || null,
  });
  revalidatePath(`/p/${projectId}/t/${taskId}`);
  revalidateProject(projectId);
}

export async function deleteTimeLog(id: string) {
  const db = getDb();
  const [log] = await db.select().from(timeLogs).where(eq(timeLogs.id, id));
  if (!log) return;
  await assertCanWrite(log.projectId);
  await db.delete(timeLogs).where(eq(timeLogs.id, id));
  revalidatePath(`/p/${log.projectId}/t/${log.taskId}`);
  revalidateProject(log.projectId);
}

/* --------------------------------- photos ------------------------------ */

export async function registerPhoto(input: {
  projectId: string;
  taskId: string | null;
  url: string;
  pathname: string;
  caption?: string;
}) {
  const { user } = await assertCanWrite(input.projectId);
  const db = getDb();
  await db.insert(photos).values({
    projectId: input.projectId,
    taskId: input.taskId ?? null,
    uploaderId: user.id,
    url: input.url,
    pathname: input.pathname,
    caption: input.caption?.trim() || null,
  });
  revalidateProject(input.projectId);
  if (input.taskId)
    revalidatePath(`/p/${input.projectId}/t/${input.taskId}`);
}

export async function deletePhoto(id: string) {
  const db = getDb();
  const [photo] = await db.select().from(photos).where(eq(photos.id, id));
  if (!photo) return;
  await assertCanWrite(photo.projectId);
  try {
    await del(photo.url);
  } catch {
    /* blob may already be gone — still drop the row */
  }
  await db.delete(photos).where(eq(photos.id, id));
  revalidateProject(photo.projectId);
  if (photo.taskId) revalidatePath(`/p/${photo.projectId}/t/${photo.taskId}`);
}

/* ------------------------------ owned tools ---------------------------- */

export async function addUserTool(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return;
  const user = await requireUser();
  const db = getDb();
  await db
    .insert(userTools)
    .values({ userId: user.id, name: clean })
    .onConflictDoNothing({
      target: [userTools.userId, userTools.name],
    });
  revalidatePath("/profile");
}

export async function addUserTools(names: string[]) {
  const cleaned = Array.from(
    new Set(
      names
        .map((n) => n.trim().replace(/\s+/g, " "))
        .filter((n) => n.length > 1 && n.length < 60),
    ),
  );
  if (cleaned.length === 0) return;
  const user = await requireUser();
  const db = getDb();
  await db
    .insert(userTools)
    .values(cleaned.map((name) => ({ userId: user.id, name })))
    .onConflictDoNothing({ target: [userTools.userId, userTools.name] });
  revalidatePath("/profile");
}

export async function removeUserTool(id: string) {
  const user = await requireUser();
  const db = getDb();
  await db
    .delete(userTools)
    .where(and(eq(userTools.id, id), eq(userTools.userId, user.id)));
  revalidatePath("/profile");
}

/* ------------------------------- collaborators ------------------------- */

export async function inviteMember(
  projectId: string,
  email: string,
  role: "editor" | "viewer",
) {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) throw new Error("Enter a valid email");
  const { user } = await assertCanWrite(projectId);
  const db = getDb();
  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (project?.ownerId !== user.id)
    throw new Error("Only the project owner can manage collaborators");
  await db
    .insert(projectMembers)
    .values({ projectId, email: clean, role })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.email],
      set: { role },
    });
  revalidatePath(`/p/${projectId}/settings`);
}

export async function updateMemberRole(
  memberId: string,
  role: "editor" | "viewer",
) {
  const db = getDb();
  const [m] = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.id, memberId));
  if (!m) return;
  const { user } = await assertCanWrite(m.projectId);
  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, m.projectId));
  if (project?.ownerId !== user.id)
    throw new Error("Only the project owner can manage collaborators");
  await db
    .update(projectMembers)
    .set({ role })
    .where(eq(projectMembers.id, memberId));
  revalidatePath(`/p/${m.projectId}/settings`);
}

export async function removeMember(memberId: string) {
  const db = getDb();
  const [m] = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.id, memberId));
  if (!m) return;
  const { user } = await assertCanWrite(m.projectId);
  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, m.projectId));
  if (project?.ownerId !== user.id)
    throw new Error("Only the project owner can manage collaborators");
  await db.delete(projectMembers).where(eq(projectMembers.id, memberId));
  revalidatePath(`/p/${m.projectId}/settings`);
}

/* ------------------------------- foreman ------------------------------- */

/** "Start fresh": clear this thread's transcript + rolling summary.
 *  Durable Foreman memory (foreman_memory) is intentionally preserved — the
 *  character is never amnesiac after a reset. Shared thread → write-gated. */
export async function resetForemanThread(
  projectId: string,
  taskId: string | null,
) {
  await assertCanWrite(projectId);
  const db = getDb();
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
  await db
    .delete(chatThreads)
    .where(
      and(
        eq(chatThreads.projectId, projectId),
        taskId
          ? eq(chatThreads.taskId, taskId)
          : isNull(chatThreads.taskId),
      ),
    );
  if (taskId) revalidatePath(`/p/${projectId}/t/${taskId}`);
  revalidatePath(`/p/${projectId}`);
  revalidatePath(`/p/${projectId}/foreman`);
}
