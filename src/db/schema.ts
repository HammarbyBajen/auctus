import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * One row per gym. v1 has a single studio (Tegen). Every core table carries a
 * studio id so a second gym can be added later without a rewrite.
 */
export const studio = pgTable("studio", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Thresholds = {
  /** Hours a new lead may wait for first contact (the 24-hour promise). */
  firstContactHours: number;
  /** Amber warning when this many hours remain before the deadline. */
  warnHoursBeforeDeadline: number;
  /** A lead with no activity this many days in one stage counts as stalled. */
  stalledDays: number;
  /** A paying member with no visit for this many days is at risk. */
  atRiskDays: number;
};

export const defaultThresholds: Thresholds = {
  firstContactHours: 24,
  warnHoursBeforeDeadline: 4,
  stalledDays: 7,
  atRiskDays: 30,
};

/** Settings, not code: thresholds and the Mana connection details. The Mana API key itself stays in the environment. */
export const studioSettings = pgTable("studio_settings", {
  studioId: uuid("studio_id")
    .primaryKey()
    .references(() => studio.id, { onDelete: "cascade" }),
  manaStudioId: text("mana_studio_id"),
  manaBaseUrl: text("mana_base_url").notNull().default("https://www.getmana.app"),
  thresholds: jsonb("thresholds").$type<Thresholds>().notNull().default(defaultThresholds),
  /** Whether leads are made from Mana signals (cancellations, freezes, ended memberships, day passes). Off until an owner turns it on. */
  winBackEnabled: boolean("win_back_enabled").notNull().default(false),
  /**
   * Add-ons (for example a locker) by Mana membership id. They still count as a
   * membership and in MRR, but keeping one does not count as staying when
   * someone cancels their gym membership, so a win-back lead is still made.
   */
  addOnMembershipIds: jsonb("add_on_membership_ids").$type<string[]>().notNull().default([]),
  /** Mana memberships that are not real memberships (for example a locker), by Mana membership id. */
  ignoredMembershipIds: jsonb("ignored_membership_ids").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Better Auth tables (with the admin plugin fields). Names follow Better Auth's defaults.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studio.id),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Login rate-limit counters, stored in the database because serverless instances do not share memory. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Pipeline stages of a studio, in order. Leads refer to them by key (kept stable when a stage is renamed). */
export const pipelineStage = pgTable(
  "pipeline_stage",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    /** open: still being worked, won: became a member, cold: not going to join. */
    kind: text("kind").notNull().default("open"),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.key] })],
);

/** The reasons offered when a lead is marked Cold. */
export const coldReason = pgTable(
  "cold_reason",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.key] })],
);

/** The reasons offered when a win-back lead is handled (why someone left or paused). */
export const winBackReason = pgTable(
  "win_back_reason",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.key] })],
);

/** A real person: contact details live here, once, however many leads they have over time. */
export const person = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id),
    name: text("name").notNull(),
    email: text("email"),
    /** Lower-cased email, used to recognise the same person across forms. */
    emailNormalized: text("email_normalized"),
    phone: text("phone"),
    /** Phone reduced to a comparable form (see lib/leads/matching.ts). */
    phoneNormalized: text("phone_normalized"),
    /** The same person in Mana, once matched by email or phone. */
    manaUserId: text("mana_user_id"),
    /** When this person was last looked up live in Mana (to avoid asking on every page view). */
    manaCheckedAt: timestamp("mana_checked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("person_studio_mana_idx").on(table.studioId, table.manaUserId),
    index("person_studio_email_idx").on(table.studioId, table.emailNormalized),
    index("person_studio_phone_idx").on(table.studioId, table.phoneNormalized),
  ],
);

/** One chapter of a person's contact with the gym: how they came in and where they are in the process. */
export const lead = pgTable(
  "lead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    source: text("source").notNull().default("manual"),
    stage: text("stage").notNull().default("new_lead"),
    /** Who is working this lead. Optional: an unassigned lead belongs to nobody in particular. */
    assignedToId: text("assigned_to_id").references(() => user.id, { onDelete: "set null" }),
    /** Why the lead went cold. Set only while the lead is in a cold stage. */
    coldReason: text("cold_reason"),
    /** For a win-back lead: why the person left or paused, picked by whoever handles it. */
    winBackReason: text("win_back_reason"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("lead_studio_created_idx").on(table.studioId, table.createdAt),
    index("lead_person_idx").on(table.personId, table.createdAt),
    foreignKey({
      columns: [table.studioId, table.stage],
      foreignColumns: [pipelineStage.studioId, pipelineStage.key],
    }),
    foreignKey({
      columns: [table.studioId, table.coldReason],
      foreignColumns: [coldReason.studioId, coldReason.key],
    }),
    foreignKey({
      columns: [table.studioId, table.winBackReason],
      foreignColumns: [winBackReason.studioId, winBackReason.key],
    }),
  ],
);

export const leadNote = pgTable(
  "lead_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("lead_note_lead_idx").on(table.leadId, table.createdAt)],
);

/** What happened to a lead: a stage move or a logged contact. Shown together with notes as the lead's history. */
export const leadEvent = pgTable(
  "lead_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    /** stage_changed or contact_logged */
    type: text("type").notNull(),
    fromStage: text("from_stage"),
    toStage: text("to_stage"),
    coldReason: text("cold_reason"),
    /** For contact_logged: called, no_answer, emailed or booked. */
    outcome: text("outcome"),
    /** Set when the CRM did it by itself, for example "mana" for an automatic Won. */
    via: text("via"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("lead_event_lead_idx").on(table.leadId, table.createdAt)],
);

/** A follow-up on a lead ("ring på torsdag") with a due date. */
export const task = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** A calendar day in Tegen's time zone, written YYYY-MM-DD. */
    dueDate: date("due_date", { mode: "string" }).notNull(),
    /** Set when the task is done, empty while it is still open. */
    doneAt: timestamp("done_at"),
    doneById: text("done_by_id").references(() => user.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("task_lead_idx").on(table.leadId),
    index("task_studio_open_idx").on(table.studioId, table.doneAt, table.dueDate),
  ],
);

// ---- Mana mirror (read-only copy of what Mana knows about members) ----

/** A person with an account in the studio's Mana (member, staff or owner). Only what the CRM needs is kept. */
export const manaMember = pgTable(
  "mana_member",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    manaUserId: text("mana_user_id").notNull(),
    role: text("role").notNull(),
    name: text("name"),
    email: text("email"),
    emailNormalized: text("email_normalized"),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    /** The sync run that last saw this person. People Mana no longer returns are removed. */
    lastRunId: text("last_run_id").notNull(),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.studioId, table.manaUserId] }),
    index("mana_member_email_idx").on(table.studioId, table.emailNormalized),
    index("mana_member_phone_idx").on(table.studioId, table.phoneNormalized),
  ],
);

/** A membership a person holds (or held, or will hold) in Mana. */
export const manaMembership = pgTable(
  "mana_membership",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    manaUserId: text("mana_user_id").notNull(),
    membershipId: text("membership_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    /** active, ended or future */
    status: text("status").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    commitmentEndDate: date("commitment_end_date", { mode: "string" }),
    cancelEffectiveDate: date("cancel_effective_date", { mode: "string" }),
    /** A scheduled change: cancel or freeze, and the day it happens. */
    pendingChangeKind: text("pending_change_kind"),
    pendingChangeDate: date("pending_change_date", { mode: "string" }),
    priceAmount: integer("price_amount"),
    priceCurrency: text("price_currency"),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.studioId, table.id] }),
    index("mana_membership_user_idx").on(table.studioId, table.manaUserId),
  ],
);

export type SyncProgress = {
  phase: "users" | "memberships";
  /** Where the next page of people starts, until all pages are read. */
  nextUrl: string | null;
  usersSeen: number;
  usersTotal: number | null;
  /** The last person whose memberships were read. The next one comes after it. */
  memberCursor: string | null;
  membersDone: number;
  membersTotal: number | null;
  /** When the last request to Mana was made, so spacing holds across steps. */
  lastRequestAt: number | null;
};

/** One run of the Mana sync. Only one can be running per studio at a time. */
export const syncRun = pgTable(
  "sync_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("mana"),
    /** running, succeeded or failed */
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    /** Refreshed after every request, so a run that stops moving can be told apart from a slow one. */
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    /** A short, safe message. Never contains the key or personal data. */
    error: text("error"),
    progress: jsonb("progress").$type<SyncProgress>().notNull(),
  },
  (table) => [
    index("sync_run_studio_idx").on(table.studioId, table.startedAt),
    uniqueIndex("sync_run_one_running")
      .on(table.studioId, table.kind)
      .where(sql`status = 'running'`),
  ],
);

/**
 * A Mana signal that has been turned into a lead (or deliberately skipped), so
 * the same cancellation, freeze, ended membership or day pass never makes a
 * second lead, even after the first one is closed.
 */
export const manaSignal = pgTable(
  "mana_signal",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    /** What happened: cancelled, freeze, ended or day_pass. */
    kind: text("kind").notNull(),
    /** The membership (or, for a day pass, the payment) in Mana that the signal is about. */
    manaRef: text("mana_ref").notNull(),
    manaUserId: text("mana_user_id").notNull(),
    /** The lead it became, or empty when it was skipped (for example the person is already an open lead). */
    leadId: uuid("lead_id").references(() => lead.id, { onDelete: "set null" }),
    /** Why no lead was made, when skipped. */
    skipped: text("skipped"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.kind, table.manaRef] })],
);

/** A recent day pass, clip card or single-class purchase from Mana, kept so buyers without a membership can be found. */
export const manaPurchase = pgTable(
  "mana_purchase",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    manaUserId: text("mana_user_id").notNull(),
    /** Mana's kind of item: class_credits_bundle or single_class. */
    kind: text("kind").notNull(),
    description: text("description"),
    paidAt: timestamp("paid_at").notNull(),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.studioId, table.id] }),
    index("mana_purchase_user_idx").on(table.studioId, table.manaUserId),
  ],
);
