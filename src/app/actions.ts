"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { getDb } from "@/db";
import {
  projects,
  projectMembers,
  tasks,
  notes,
  shoppingItems,
  timeLogs,
  photos,
  userTools,
} from "@/db/schema";
import { assertCanWrite, requireUser } from "@/lib/projects";

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

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  const summary = String(formData.get("summary") || "").trim() || null;
  if (!title) throw new Error("A project name is required");
  const db = getDb();
  const [created] = await db
    .insert(projects)
    .values({ ownerId: user.id, title, summary })
    .returning({ id: projects.id });
  revalidatePath("/");
  redirect(`/p/${created.id}`);
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
