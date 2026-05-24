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
  foremanMemories,
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
  /** EXIF capture moment, parsed client-side. Null when EXIF is absent. */
  takenAt?: Date | null;
  /** EXIF Orientation (1–8). Null when absent or already baked in. */
  orientation?: number | null;
  /** Optional room name (must match a room on the project's Property —
   *  the chooser UI enforces this). Free-text by design. */
  roomName?: string | null;
}) {
  const { user } = await assertCanWrite(input.projectId);
  const db = getDb();
  const orientation =
    typeof input.orientation === "number" &&
    input.orientation >= 1 &&
    input.orientation <= 8
      ? input.orientation
      : null;
  await db.insert(photos).values({
    projectId: input.projectId,
    taskId: input.taskId ?? null,
    uploaderId: user.id,
    url: input.url,
    pathname: input.pathname,
    caption: input.caption?.trim() || null,
    takenAt: input.takenAt ?? null,
    orientation,
    roomName: input.roomName?.trim() || null,
  });
  revalidateProject(input.projectId);
  if (input.taskId)
    revalidatePath(`/p/${input.projectId}/t/${input.taskId}`);
  revalidatePath(`/p/${input.projectId}/photos`);
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
  revalidatePath(`/p/${photo.projectId}/photos`);
}

/** Update editable photo metadata from the timeline lightbox: caption,
 *  attached room, attached task. Pass `null` to clear. Omitted fields are
 *  left alone. */
export async function updatePhotoMeta(input: {
  id: string;
  caption?: string | null;
  roomName?: string | null;
  taskId?: string | null;
}) {
  const db = getDb();
  const [photo] = await db.select().from(photos).where(eq(photos.id, input.id));
  if (!photo) return;
  await assertCanWrite(photo.projectId);

  const patch: Partial<typeof photos.$inferInsert> = {};
  if (input.caption !== undefined)
    patch.caption = input.caption?.trim() || null;
  if (input.roomName !== undefined)
    patch.roomName = input.roomName?.trim() || null;
  if (input.taskId !== undefined) {
    if (input.taskId === null) {
      patch.taskId = null;
    } else {
      const [t] = await db
        .select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, input.taskId));
      if (!t || t.projectId !== photo.projectId)
        throw new Error("Task not in this project");
      patch.taskId = t.id;
    }
  }

  if (Object.keys(patch).length === 0) return;
  await db.update(photos).set(patch).where(eq(photos.id, input.id));
  revalidateProject(photo.projectId);
  revalidatePath(`/p/${photo.projectId}/photos`);
  if (photo.taskId) revalidatePath(`/p/${photo.projectId}/t/${photo.taskId}`);
  if (patch.taskId && patch.taskId !== photo.taskId)
    revalidatePath(`/p/${photo.projectId}/t/${patch.taskId}`);
}

/** Reorder a photo within the project's timeline by swapping its position
 *  with its in-order neighbor. Tie-breaking on takenAt then createdAt
 *  matches the timeline query in getProjectTimeline. */
export async function movePhoto(input: {
  id: string;
  direction: "up" | "down";
}) {
  const db = getDb();
  const [photo] = await db.select().from(photos).where(eq(photos.id, input.id));
  if (!photo) return;
  await assertCanWrite(photo.projectId);

  const all = await db
    .select()
    .from(photos)
    .where(eq(photos.projectId, photo.projectId));

  const ordered = [...all].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    const ta = (a.takenAt ?? a.createdAt).getTime();
    const tb = (b.takenAt ?? b.createdAt).getTime();
    if (ta !== tb) return tb - ta;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  const i = ordered.findIndex((p) => p.id === photo.id);
  if (i < 0) return;
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return;

  const reordered = [...ordered];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];

  // Renumber the whole project's positions to be dense and stable.
  // O(N) but personal photo libraries stay small; the simplicity beats
  // gap-rebalancing for this use case.
  for (let k = 0; k < reordered.length; k++) {
    const target = reordered[k];
    if (target.position !== k) {
      await db.update(photos).set({ position: k }).where(eq(photos.id, target.id));
    }
  }

  revalidateProject(photo.projectId);
  revalidatePath(`/p/${photo.projectId}/photos`);
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

/* ---------------------------------- dream ------------------------------ */

/** Manual "update my dream" trigger. The other two dreamTriggers (style-
 *  profile field change, reference image add/remove) write the style
 *  profile via updateStyleProfile below and call this on success — the
 *  detection rule stays "explicit observable user action" per
 *  PHOTO_PLAN.md §5 Q3. Throws to surface errors to the caller. */
export async function regenerateDream(projectId: string) {
  await assertCanWrite(projectId);
  const { renderDreamHero } = await import("@/lib/dream");
  const result = await renderDreamHero(projectId);
  revalidateProject(projectId);
  return result;
}

/** Patch the project's styleProfile. Triggers a dream re-render only
 *  when the new shape differs in a render-affecting way (see
 *  styleProfileTriggersRerender). Cooldown is honored so the dream
 *  doesn't flicker on rapid intake edits. */
export async function updateStyleProfile(input: {
  projectId: string;
  styleProfile: import("@/lib/style-profile").StyleProfile;
}) {
  await assertCanWrite(input.projectId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId));
  if (!row) return;

  const {
    styleProfileSchema,
    styleProfileTriggersRerender,
  } = await import("@/lib/style-profile");
  const parsed = styleProfileSchema.parse(input.styleProfile);
  const before = (row.styleProfile as
    | import("@/lib/style-profile").StyleProfile
    | null) ?? null;

  await db
    .update(projects)
    .set({ styleProfile: parsed })
    .where(eq(projects.id, input.projectId));

  const shouldRerender = styleProfileTriggersRerender(before, parsed);
  if (shouldRerender) {
    const { dreamIsInCooldown, renderDreamHero } = await import("@/lib/dream");
    if (!dreamIsInCooldown(row)) {
      try {
        await renderDreamHero(input.projectId);
      } catch (e) {
        console.error("[dream] auto re-render after styleProfile failed:", e);
      }
    }
  }

  revalidateProject(input.projectId);
}

/** Testing tool: wipe everything this user owns (projects + cascades,
 *  properties, foreman memory, tools, invitee memberships) plus the blobs
 *  backing their photos (Vercel Blob has no orphan/cleanup so we must
 *  `del()` them explicitly or they accumulate forever). Keeps the
 *  user/session row so the account stays signed in; redirects to the
 *  empty-state dashboard so the next intake starts clean.
 *  Guarded by an exact-email confirmation in the form (re-checked here). */
export async function resetAccount(formData: FormData) {
  const user = await requireUser();
  const confirm = String(formData.get("confirm") || "").trim().toLowerCase();
  const expected = (user.email ?? "").trim().toLowerCase();
  if (!expected || confirm !== expected) {
    throw new Error("Confirmation email did not match");
  }
  const db = getDb();

  // Collect blob pathnames before the cascade drops the photo rows.
  // Includes user photos AND cached dream-hero images on their projects.
  const [photoRows, dreamRows] = await Promise.all([
    db
      .select({ pathname: photos.pathname })
      .from(photos)
      .innerJoin(projects, eq(photos.projectId, projects.id))
      .where(eq(projects.ownerId, user.id)),
    db
      .select({ pathname: projects.dreamPathname })
      .from(projects)
      .where(eq(projects.ownerId, user.id)),
  ]);
  const pathnames = [
    ...photoRows.map((p) => p.pathname),
    ...dreamRows.map((d) => d.pathname),
  ].filter((p): p is string => Boolean(p));
  if (pathnames.length) {
    try {
      await del(pathnames);
    } catch (e) {
      // DB is the source of truth; a blob failure leaks bytes but the app
      // still ends up in a consistent reset state.
      console.error("[reset] blob delete failed:", e);
    }
  }

  // Project delete cascades to phases / tasks / photos / notes / shopping /
  // time_logs / chat_messages / chat_threads / project_members on those
  // projects. The follow-up deletes cover everything user-scoped that
  // doesn't cascade from project deletion (and invitee rows on OTHER users'
  // projects, which we don't want to leave dangling).
  await db.delete(projects).where(eq(projects.ownerId, user.id));
  await db.delete(properties).where(eq(properties.ownerId, user.id));
  await db.delete(foremanMemories).where(eq(foremanMemories.userId, user.id));
  await db.delete(userTools).where(eq(userTools.userId, user.id));
  await db.delete(projectMembers).where(eq(projectMembers.userId, user.id));

  revalidatePath("/");
  redirect("/");
}
