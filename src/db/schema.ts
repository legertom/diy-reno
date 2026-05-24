import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

const uuid = () => text().$defaultFn(() => crypto.randomUUID());
const now = () =>
  timestamp({ mode: "date", withTimezone: true }).defaultNow().notNull();

/* ------------------------------------------------------------------ */
/*  Auth.js (next-auth) tables — names must match the Drizzle adapter   */
/* ------------------------------------------------------------------ */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (a) => [primaryKey({ columns: [a.provider, a.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (v) => [primaryKey({ columns: [v.identifier, v.token] })],
);

/* ------------------------------------------------------------------ */
/*  Application domain                                                  */
/* ------------------------------------------------------------------ */

export const memberRole = pgEnum("member_role", ["owner", "editor", "viewer"]);
export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);
export const chatRole = pgEnum("chat_role", ["user", "assistant"]);

/** A user's personal inventory of tools they already own. */
export const userTools = pgTable(
  "user_tool",
  {
    id: uuid().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("user_tool_unique").on(t.userId, t.name),
    index("user_tool_user_idx").on(t.userId),
  ],
);

/** The physical place. Entered once, reused by every project on it.
 *  Sharing/authz stay at the project level — Property is the organizing
 *  parent only. Floor-plan / measurement fields are nullable until the
 *  Phase 5 ingestion lands. */
export const properties = pgTable(
  "property",
  {
    id: uuid().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** apartment | house | other — free-text; constrained in the UI. */
    type: text("type"),
    /** condo | co-op | owned | rented. */
    ownership: text("ownership"),
    location: text("location"),
    /** Nullable until floor-plan ingestion (Phase 5). */
    floorPlanUrl: text("floor_plan_url"),
    /** Rooms/spaces stub — populated by later measurement work. */
    rooms: jsonb("rooms")
      .$type<{ name: string; notes?: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: now(),
    updatedAt: now(),
  },
  (p) => [index("property_owner_idx").on(p.ownerId)],
);

export const projects = pgTable(
  "project",
  {
    id: uuid().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The place this work is on. Nullable so the introduction of
     *  Property is a non-destructive migration; the backfill nests every
     *  existing project under an auto-created Property. set null on delete
     *  so removing a Property never destroys live project data. */
    propertyId: text("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    /** Short tagline shown on cards. */
    summary: text("summary"),
    /** Long-form ground truth the Foreman reads in every conversation
     *  (e.g. "walls are plaster not drywall, 1920s house, no garage").
     *  Plain-text fallback — kept in sync with briefStructured and consumed
     *  by the Foreman system prompt unchanged. */
    brief: text("brief"),
    /** Editorial spec-sheet brief. Shape lives in src/lib/brief.ts as
     *  StructuredBrief / structuredBriefSchema (Zod). Nullable until a brief
     *  is polished — the UI falls back to rendering `brief` plain text. */
    briefStructured: jsonb("brief_structured").$type<
      import("@/lib/brief").StructuredBrief
    >(),
    /** Phase 5.2: the structured choices that produce the dream hero
     *  image (palette + finishes + vibe + reference images). Shape lives
     *  in src/lib/style-profile.ts. */
    styleProfile: jsonb("style_profile").$type<
      import("@/lib/style-profile").StyleProfile
    >(),
    /** Cached dream-hero image URL (public Blob asset). Generated once
     *  per major decision, served from CDN at zero AI spend per view. */
    dreamImageUrl: text("dream_image_url"),
    /** Blob pathname kept alongside the URL so the old asset can be
     *  del()'d when a re-render replaces it (Blob has no orphan
     *  cleanup). */
    dreamPathname: text("dream_pathname"),
    /** The exact prompt that produced the cached image — drives the
     *  "why this image?" panel. */
    dreamPrompt: text("dream_prompt"),
    /** When the cached image was rendered. Used by the dreamTriggers
     *  cooldown so the dream doesn't flicker on rapid edits. */
    dreamRenderedAt: timestamp("dream_rendered_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: now(),
    updatedAt: now(),
  },
  (p) => [index("project_property_idx").on(p.propertyId)],
);

export const projectMembers = pgTable(
  "project_member",
  {
    id: uuid().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Null until the invited person signs in with this email. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    role: memberRole("role").notNull().default("viewer"),
    createdAt: now(),
  },
  (m) => [
    uniqueIndex("member_project_email_idx").on(m.projectId, m.email),
    index("member_user_idx").on(m.userId),
  ],
);

export const phases = pgTable(
  "phase",
  {
    id: uuid().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (p) => [index("phase_project_idx").on(p.projectId)],
);

export const tasks = pgTable(
  "task",
  {
    id: uuid().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phaseId: text("phase_id").references(() => phases.id, {
      onDelete: "set null",
    }),
    /** Original key from the legacy planner (e.g. "t2-scrape1"). */
    refKey: text("ref_key"),
    num: text("num").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    hoursEstimate: text("hours_estimate"),
    status: taskStatus("status").notNull().default("todo"),
    /** Free label carried from the legacy plan: tom / friends / all. */
    assigneeLabel: text("assignee_label"),
    assigneeUserId: text("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    highlighted: boolean("highlighted").notNull().default(false),
    position: integer("position").notNull().default(0),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: now(),
    updatedAt: now(),
  },
  (t) => [
    index("task_project_idx").on(t.projectId),
    index("task_phase_idx").on(t.phaseId),
  ],
);

/** Tools / materials / safety / steps / tips for a task. */
export const taskGuides = pgTable("task_guide", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  tools: jsonb("tools").$type<string[]>().notNull().default([]),
  materials: jsonb("materials").$type<string[]>().notNull().default([]),
  safety: jsonb("safety").$type<string[]>().notNull().default([]),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  tips: jsonb("tips").$type<string[]>().notNull().default([]),
});

export const notes = pgTable(
  "note",
  {
    id: uuid().primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: now(),
  },
  (n) => [index("note_task_idx").on(n.taskId)],
);

export const shoppingItems = pgTable(
  "shopping_item",
  {
    id: uuid().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    quantity: text("quantity"),
    purchased: boolean("purchased").notNull().default(false),
    addedById: text("added_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: now(),
  },
  (s) => [index("shopping_project_idx").on(s.projectId)],
);

export const timeLogs = pgTable(
  "time_log",
  {
    id: uuid().primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    /** Null while a timer is still running. */
    endedAt: timestamp("ended_at", { mode: "date", withTimezone: true }),
    seconds: integer("seconds"),
    note: text("note"),
    createdAt: now(),
  },
  (t) => [
    index("timelog_task_idx").on(t.taskId),
    index("timelog_running_idx").on(t.userId, t.endedAt),
  ],
);

export const photos = pgTable(
  "photo",
  {
    id: uuid().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    uploaderId: text("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    pathname: text("pathname").notNull(),
    caption: text("caption"),
    /** EXIF capture moment, parsed client-side at upload. Null when EXIF
     *  is absent (screenshots, web downloads). Timeline ordering falls
     *  back to createdAt. */
    takenAt: timestamp("taken_at", { mode: "date", withTimezone: true }),
    /** EXIF Orientation (1–8). Used only as a display hint; Blob storage
     *  is unmodified. Null when EXIF is absent or already baked in. */
    orientation: integer("orientation"),
    /** Free-text reference to a room name on the project's Property.
     *  Rooms today are JSONB names on Property (schema above), not first-
     *  class entities — name match is the right fidelity. */
    roomName: text("room_name"),
    /** Manual reorder position. Existing rows default to 0; timeline
     *  secondary-sorts by takenAt then createdAt. */
    position: integer("position").notNull().default(0),
    createdAt: now(),
  },
  (p) => [
    index("photo_project_idx").on(p.projectId),
    index("photo_task_idx").on(p.taskId),
    index("photo_taken_at_idx").on(p.takenAt),
  ],
);

/** Persisted AI chat — one shared thread per task (or project). */
export const chatMessages = pgTable(
  "chat_message",
  {
    id: uuid().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    role: chatRole("role").notNull(),
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** AI SDK UIMessage parts (text + file parts). */
    parts: jsonb("parts").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: now(),
  },
  (c) => [index("chat_task_idx").on(c.taskId, c.createdAt)],
);

/** Durable Foreman memory — survives transcript resets. Scoped to a user
 *  and one of: their account ("user"), a property, or a project. Written by
 *  the Foreman's remember/forget tools and injected into the prompt. */
export const foremanMemories = pgTable(
  "foreman_memory",
  {
    id: uuid().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "user" | "property" | "project" — free-text, constrained in code. */
    scope: text("scope").notNull(),
    /** The id of the user / property / project this memory pertains to. */
    scopeId: text("scope_id").notNull(),
    body: text("body").notNull(),
    createdAt: now(),
  },
  (m) => [
    index("foreman_memory_user_idx").on(m.userId),
    index("foreman_memory_scope_idx").on(m.scope, m.scopeId),
  ],
);

/** Per-thread rolling summary for transcript compaction. One row per
 *  (project, task) or (project, project-level) thread — same keying as
 *  chat_message. Cleared by "start fresh"; memory above is not. */
export const chatThreads = pgTable(
  "chat_thread",
  {
    id: uuid().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    /** Running summary of older turns rolled out of the verbatim window. */
    summary: text("summary"),
    updatedAt: now(),
  },
  (c) => [index("chat_thread_idx").on(c.projectId, c.taskId)],
);

/* ------------------------------------------------------------------ */
/*  Relations                                                           */
/* ------------------------------------------------------------------ */

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  owner: one(users, { fields: [properties.ownerId], references: [users.id] }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  property: one(properties, {
    fields: [projects.propertyId],
    references: [properties.id],
  }),
  members: many(projectMembers),
  phases: many(phases),
  tasks: many(tasks),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  phase: one(phases, { fields: [tasks.phaseId], references: [phases.id] }),
  guide: one(taskGuides, {
    fields: [tasks.id],
    references: [taskGuides.taskId],
  }),
  notes: many(notes),
  timeLogs: many(timeLogs),
  photos: many(photos),
}));

export const phasesRelations = relations(phases, ({ one, many }) => ({
  project: one(projects, {
    fields: [phases.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
}));

export type User = typeof users.$inferSelect;
export type UserTool = typeof userTools.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Phase = typeof phases.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskGuide = typeof taskGuides.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type TimeLog = typeof timeLogs.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ForemanMemory = typeof foremanMemories.$inferSelect;
export type ChatThread = typeof chatThreads.$inferSelect;
