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

export const projects = pgTable("project", {
  id: uuid().primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** Short tagline shown on cards. */
  summary: text("summary"),
  /** Long-form ground truth the Foreman reads in every conversation
   *  (e.g. "walls are plaster not drywall, 1920s house, no garage"). */
  brief: text("brief"),
  createdAt: now(),
  updatedAt: now(),
});

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
    createdAt: now(),
  },
  (p) => [
    index("photo_project_idx").on(p.projectId),
    index("photo_task_idx").on(p.taskId),
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

/* ------------------------------------------------------------------ */
/*  Relations                                                           */
/* ------------------------------------------------------------------ */

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
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
