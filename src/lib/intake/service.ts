import { and, desc, eq, notInArray } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { intakeRejection, lead, leadNote, leadSubmission, person } from "@/db/schema";
import { createOrMatchLead } from "@/lib/leads/service";
import type { LeadSource } from "@/lib/leads/constants";
import { intakePayloadSchema, intakeRoutes, isTestLead, parseAttribution, sourceForRoute, type IntakePayload } from "./contract";

type Db = typeof defaultDb;

export type IntakeResult =
  | { status: "created"; leadId: string }
  | { status: "duplicate"; leadId: string }
  | { status: "test" }
  | { status: "already_received"; leadId: string | null }
  | { status: "invalid"; issues: { path: string; message: string }[] };

/** The note a web lead's message and answers become in its history, so they are read where everything else is. */
export const webNotePrefix = "Från webben";

function noteFor(p: IntakePayload): string | null {
  const lines: string[] = [];
  if (p.message) lines.push(p.message);
  for (const [key, value] of Object.entries(p.answers ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  if (p.landingPage) lines.push(`Sida: ${p.landingPage}`);
  return lines.length > 0 ? `${webNotePrefix} (${p.route}): ${lines.join("\n")}` : null;
}

/**
 * Takes one lead from tegen-web (ticket 09). Every valid body is stored as it
 * came. The same sender id again is a retry and changes nothing. A test lead
 * is stored only. Otherwise the person is matched like any other lead (email,
 * then phone): a new person gets a new lead with its source and attribution;
 * someone already known gets the submission added to their latest lead.
 */
export async function receiveLead(db: Db, studioId: string, body: unknown, now: Date = new Date()): Promise<IntakeResult> {
  const parsed = intakePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  const p = parsed.data;

  // Claim the sender's id first: a retry (even one arriving at the same moment) finds it taken and changes nothing.
  const test = isTestLead(p);
  const [claim] = await db
    .insert(leadSubmission)
    .values({ studioId, senderId: p.id, route: p.route, receivedAt: now, payload: body as object, isTest: test, outcome: test ? "test" : "pending" })
    .onConflictDoNothing()
    .returning({ id: leadSubmission.id });
  if (!claim) {
    const [seen] = await db
      .select({ leadId: leadSubmission.leadId })
      .from(leadSubmission)
      .where(and(eq(leadSubmission.studioId, studioId), eq(leadSubmission.senderId, p.id)))
      .limit(1);
    return { status: "already_received", leadId: seen?.leadId ?? null };
  }
  if (test) return { status: "test" };

  try {
    const { lead: theLead, duplicate } = await createOrMatchLead(db, studioId, {
      name: p.name,
      email: p.email,
      phone: p.phone,
      source: sourceForRoute[p.route] as LeadSource,
    });
    if (!duplicate) {
      const createdAt = p.submittedAt ? new Date(p.submittedAt) : now;
      await db
        .update(lead)
        .set({ attribution: p.attribution, attributionParsed: parseAttribution(p.attribution), createdAt, updatedAt: createdAt })
        .where(eq(lead.id, theLead.id));
    }
    const note = noteFor(p);
    if (note) await db.insert(leadNote).values({ studioId, leadId: theLead.id, body: note, createdAt: now });
    await db
      .update(leadSubmission)
      .set({ outcome: duplicate ? "duplicate" : "created", leadId: theLead.id })
      .where(eq(leadSubmission.id, claim.id));
    return duplicate ? { status: "duplicate", leadId: theLead.id } : { status: "created", leadId: theLead.id };
  } catch (error) {
    // Let the sender's retry try again from scratch.
    await db.delete(leadSubmission).where(eq(leadSubmission.id, claim.id));
    throw error;
  }
}

/** The latest submissions, for checking that the connection works (Inställningar → Inkommande leads). */
export async function recentSubmissions(db: Db, studioId: string, limit = 25) {
  return db
    .select({
      id: leadSubmission.id,
      route: leadSubmission.route,
      receivedAt: leadSubmission.receivedAt,
      isTest: leadSubmission.isTest,
      outcome: leadSubmission.outcome,
      leadId: leadSubmission.leadId,
      name: person.name,
    })
    .from(leadSubmission)
    .leftJoin(lead, eq(lead.id, leadSubmission.leadId))
    .leftJoin(person, eq(person.id, lead.personId))
    .where(eq(leadSubmission.studioId, studioId))
    .orderBy(desc(leadSubmission.receivedAt))
    .limit(limit);
}

/** How many turned-away calls are kept: anyone can call the address, so the table must not grow without end. */
export const keptRejections = 200;

export type Rejection = {
  reason: "unauthorized" | "invalid_json" | "invalid_payload" | "too_large";
  detail?: string | null;
  /** The parsed body, if there was one: only its route is kept. */
  body?: unknown;
  issues?: { path: string; message: string }[];
  userAgent?: string | null;
  bytes?: number | null;
};

/**
 * Notes a call the intake turned away, so a sender whose leads never arrive
 * can be seen (Inställningar → Inkommande leads). Keeps the route, the field
 * names and messages, and what called; never the body or the secret. Only
 * the latest `keptRejections` stay.
 */
export async function recordRejection(db: Db, studioId: string, r: Rejection, now: Date = new Date()) {
  const named = r.body && typeof r.body === "object" ? (r.body as { route?: unknown }).route : undefined;
  const route = typeof named === "string" && (intakeRoutes as readonly string[]).includes(named) ? named : null;
  await db.insert(intakeRejection).values({
    studioId,
    receivedAt: now,
    reason: r.reason,
    detail: r.detail ?? null,
    route,
    issues: r.issues?.slice(0, 20).map((i) => ({ path: i.path.slice(0, 100), message: i.message.slice(0, 200) })) ?? null,
    userAgent: r.userAgent ? r.userAgent.slice(0, 120) : null,
    bytes: r.bytes ?? null,
  });
  const keep = db
    .select({ id: intakeRejection.id })
    .from(intakeRejection)
    .where(eq(intakeRejection.studioId, studioId))
    .orderBy(desc(intakeRejection.receivedAt))
    .limit(keptRejections);
  await db.delete(intakeRejection).where(and(eq(intakeRejection.studioId, studioId), notInArray(intakeRejection.id, keep)));
}

export async function recentRejections(db: Db, studioId: string, limit = 25) {
  return db.select().from(intakeRejection).where(eq(intakeRejection.studioId, studioId)).orderBy(desc(intakeRejection.receivedAt)).limit(limit);
}
