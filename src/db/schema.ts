import {
  index,
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
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
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("lead_studio_created_idx").on(table.studioId, table.createdAt),
    index("lead_person_idx").on(table.personId, table.createdAt),
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
