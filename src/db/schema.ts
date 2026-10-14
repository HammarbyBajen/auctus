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

/** A web lead's attribution, parsed (ticket 09). Click ids are kept whole. */
export type ParsedAttribution = {
  utmSource?: string;
  utmMedium?: string;
  campaign?: string;
  clickIds?: Record<string, string>;
  ref?: string;
  direct?: boolean;
};

export type Thresholds = {
  /** Hours a new lead may wait for first contact (the 24-hour promise). */
  firstContactHours: number;
  /** Amber warning when this many hours remain before the deadline. */
  warnHoursBeforeDeadline: number;
  /** A lead with no activity this many days in one stage counts as stalled. */
  stalledDays: number;
  /** ISO weekdays (1 = Monday ... 7 = Sunday) the first-contact clock runs (ticket 06). */
  clockDays: number[];
  /** Single days off (YYYY-MM-DD) the clock skips, such as public holidays. */
  daysOff: string[];
};

// (Older rows may also hold an unused atRiskDays; the at-risk threshold is its own column, studio_settings.at_risk_days.)
export const defaultThresholds: Thresholds = {
  firstContactHours: 24,
  warnHoursBeforeDeadline: 4,
  stalledDays: 7,
  clockDays: [1, 2, 3, 4, 5, 6, 7],
  daysOff: [],
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
  /** A paying member with no visit for this many days is at risk (ticket 13). */
  atRiskDays: integer("at_risk_days").notNull().default(30),
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
    /** Set when an owner removes the stage (ticket 07). Hidden from choices, kept so old history can still name it. */
    archivedAt: timestamp("archived_at"),
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
    /** Set when an owner removes the reason (ticket 07). Leads that have it keep it. */
    archivedAt: timestamp("archived_at"),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.key] })],
);

/**
 * A field the studio adds to its leads (ticket 07), such as goal, injury or
 * interest. Text, or one of a list of choices. Values live on the lead
 * (lead.custom_fields). A removed field is hidden and its values are kept.
 */
export const leadField = pgTable(
  "lead_field",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    /** text or choice */
    type: text("type").notNull().default("text"),
    /** The choices, for a choice field. */
    options: jsonb("options").$type<string[]>().notNull().default([]),
    position: integer("position").notNull(),
    archivedAt: timestamp("archived_at"),
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
    /** Where an imported lead came from, for example "pipedrive:person:123", so a rerun of the import skips it. */
    externalRef: text("external_ref"),
    /** The studio's own fields (ticket 07), by field key. */
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    /** Where a web lead came from, exactly as tegen-web sent it (ticket 09). Never cleaned up. */
    attribution: text("attribution"),
    /** The same, split into UTM source and medium, campaign, click ids and referrer. */
    attributionParsed: jsonb("attribution_parsed").$type<ParsedAttribution>(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("lead_studio_created_idx").on(table.studioId, table.createdAt),
    index("lead_person_idx").on(table.personId, table.createdAt),
    uniqueIndex("lead_studio_external_ref_idx").on(table.studioId, table.externalRef),
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
/**
 * One lead as tegen-web sent it to the intake endpoint (ticket 09): the raw
 * body, when it arrived and the sender's own id, so a retry is recognised.
 * Test leads are kept here only, never made into leads.
 */
export const leadSubmission = pgTable(
  "lead_submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    /** The sender's id for the lead; the same id twice is one lead. */
    senderId: text("sender_id").notNull(),
    /** contact, qualification, chat or escalate */
    route: text("route").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    payload: jsonb("payload").notNull(),
    isTest: boolean("is_test").notNull().default(false),
    /** created, duplicate (added to an existing lead) or test */
    outcome: text("outcome").notNull(),
    leadId: uuid("lead_id").references(() => lead.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("lead_submission_sender_idx").on(table.studioId, table.senderId),
    index("lead_submission_received_idx").on(table.studioId, table.receivedAt),
  ],
);

/**
 * A personal link for choosing a password (ticket 14): sent by an owner to a
 * new user, or to someone who has forgotten theirs. Only a hash of the token
 * is stored; the link is shown once when it is made. One use, then it is gone.
 */
export const userInvite = pgTable("user_invite", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

/**
 * A record that a person was permanently deleted (ticket 17), so an erasure
 * request can be shown to have been carried out. It holds no personal data:
 * only when, by whom and how much went.
 */
export const deletionLog = pgTable("deletion_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studio.id, { onDelete: "cascade" }),
  deletedAt: timestamp("deleted_at").notNull().defaultNow(),
  deletedById: text("deleted_by_id").references(() => user.id, { onDelete: "set null" }),
  leads: integer("leads").notNull(),
  notes: integer("notes").notNull(),
  tasks: integer("tasks").notNull(),
});

/**
 * A class booking or gym check-in, mirrored from Mana (ticket 13). Only what
 * the at-risk rule needs: who, when, and how a booking went. A past booking
 * that is booked or checked in counts as a visit; cancelled, no-show and wait
 * list do not.
 */
export const manaVisit = pgTable(
  "mana_visit",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    /** Mana's booking id, or "gym:" and the check-in id. */
    id: text("id").notNull(),
    manaUserId: text("mana_user_id").notNull(),
    at: timestamp("at").notNull(),
    /** class or gym */
    kind: text("kind").notNull(),
    /** For a class: booked, checked_in, canceled, canceled_late, no_show or wait_list. A gym check-in is checked_in. */
    status: text("status").notNull(),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.studioId, table.id] }),
    index("mana_visit_user_idx").on(table.studioId, table.manaUserId, table.at),
  ],
);

/**
 * A paying member who has not been in for a while (ticket 13), for staff to
 * check on. Never shown or sent to the member. Open until someone marks them
 * contacted or dismisses it with a reason, or until they come back or stop
 * paying (resolved).
 */
export const atRiskAlert = pgTable(
  "at_risk_alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    manaUserId: text("mana_user_id").notNull(),
    /** The last visit when the alert was made; null when there has been none. A new alert needs a newer visit. */
    lastVisitAt: timestamp("last_visit_at"),
    /** open, contacted, dismissed or resolved */
    status: text("status").notNull().default("open"),
    /** Why it was dismissed: holiday, injury or other. */
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    handledAt: timestamp("handled_at"),
    handledById: text("handled_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("at_risk_alert_studio_idx").on(table.studioId, table.status)],
);

/** A copy of Mana's public OpenAPI spec, kept each time its content changes (ticket 24). */
export const manaApiSpec = pgTable("mana_api_spec", {
  /** sha256 of the spec written with sorted keys. */
  hash: text("hash").primaryKey(),
  spec: jsonb("spec").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

/**
 * One daily check of Mana's API spec: whether it could be read, and what
 * changed since the last copy. A change waits for an owner to mark it checked.
 */
export const manaApiCheck = pgTable(
  "mana_api_check",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkedAt: timestamp("checked_at").notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    hash: text("hash"),
    /** Why the spec could not be read, when it could not. */
    error: text("error"),
    /** What was added and removed, when something that matters changed. */
    changes: jsonb("changes").$type<{ added: string[]; removed: string[]; touchesSync: boolean }>(),
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedById: text("acknowledged_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("mana_api_check_checked_idx").on(table.checkedAt)],
);

/**
 * The home page's key numbers as they were on a day, saved after each Mana
 * sync (ticket 26). The trend reads past months from here, so a freeze or a
 * price change that Mana no longer shows does not rewrite history.
 */
export const kpiSnapshot = pgTable(
  "kpi_snapshot",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    /** The day in Tegen's time zone, YYYY-MM-DD. */
    day: date("day", { mode: "string" }).notNull(),
    payingMembers: integer("paying_members").notNull(),
    /** Monthly revenue in öre. */
    revenue: integer("revenue").notNull(),
    /** Paying members per membership name. */
    byName: jsonb("by_name").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.day] })],
);

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

// ---- Salary (WFM) module (tickets 20-23): coach hours from Mana, names and hours only, no money ----

/**
 * A coach, straight from Mana's instructors (id and name, kept from the latest
 * pull), plus the one thing Mana does not know: their free-class deal.
 */
export const salaryInstructor = pgTable(
  "salary_instructor",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    seenAt: timestamp("seen_at").notNull().defaultNow(),
    /** Group classes a week held unpaid, in exchange for training for free. */
    freeClassesPerWeek: integer("free_classes_per_week").notNull().default(0),
    /** From when the free classes apply (YYYY-MM-DD). Empty means from the start. */
    activeFrom: date("active_from", { mode: "string" }),
    notes: text("notes").notNull().default(""),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.id] })],
);

/** A month of salary work: when it was last pulled from Mana, and whether it is locked (with its frozen figures). */
export const salaryMonth = pgTable(
  "salary_month",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    /** YYYY-MM */
    month: text("month").notNull(),
    pulledAt: timestamp("pulled_at"),
    pulledById: text("pulled_by_id").references(() => user.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at"),
    lockedById: text("locked_by_id").references(() => user.id, { onDelete: "set null" }),
    /** The month's figures as they were when locked; a locked month shows these and nothing else. */
    snapshot: jsonb("snapshot"),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.month] })],
);

/**
 * One session of coach work pulled from Mana for a month: a group class, a
 * PT or Onramp booking, or a Kids course session. Replaced on every pull, so
 * a class removed in Mana disappears here too.
 */
export const salaryWork = pgTable(
  "salary_work",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    /** Source and Mana id, for example "class:<id>". */
    id: text("id").notNull(),
    /** class, service or course */
    source: text("source").notNull(),
    /** What the rules key on, for example "class:<class id>" or "service:<service id>". */
    typeKey: text("type_key").notNull(),
    typeLabel: text("type_label").notNull(),
    instructorId: text("instructor_id"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    /** For a PT or Onramp booking: completed, booked, canceled, refunded or no_show. */
    status: text("status"),
  },
  (table) => [
    primaryKey({ columns: [table.studioId, table.month, table.id] }),
    index("salary_work_month_idx").on(table.studioId, table.month, table.startsAt),
  ],
);

/** Whether a kind of work is paid. Unset (null) until an owner decides; unset types are flagged, never dropped. */
export const salaryTypeRule = pgTable(
  "salary_type_rule",
  {
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studio.id, { onDelete: "cascade" }),
    typeKey: text("type_key").notNull(),
    label: text("label").notNull(),
    source: text("source").notNull(),
    paid: boolean("paid"),
  },
  (table) => [primaryKey({ columns: [table.studioId, table.typeKey] })],
);

/** Who locked or unlocked a month, and when. */
export const salaryLog = pgTable("salary_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studio.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  /** lock or unlock */
  action: text("action").notNull(),
  at: timestamp("at").notNull().defaultNow(),
  byId: text("by_id").references(() => user.id, { onDelete: "set null" }),
});
