import { and, eq, exists, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { emailMessage, lead, leadEvent, leadNote, person, task } from "@/db/schema";
import { normalizeEmail, normalizePhone } from "@/lib/leads/matching";

type Db = typeof defaultDb;
/** The database, or a transaction on it, so an import can run inside a larger change. */
type Conn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * One-off import of open leads from a Pipedrive export (ticket 15): a deals
 * CSV (stage, status, pipeline, source) joined on the contact person's id to a
 * people CSV (email and phone). Only open deals ("Pågående") in the adult
 * sales pipeline come in. Won deals are members, lost deals and the Kids
 * pipeline are left out on purpose. Nothing is ever written back to Pipedrive.
 */

/** Pipedrive stage (column "Fas") to Tegen HQ stage. Anything else is reported, not guessed. */
export const stageMap: Record<string, string> = {
  "NYA LEADS": "new_lead",
  "NY LEAD": "new_lead",
  KONTAKTAD: "contacted",
  KONTAKTADE: "contacted",
  "AVBOKAT MÖTE": "cancelled_meeting",
  "BOKAT MÖTE": "booked_meeting",
  "BOKAT PROVTRÄNING": "booked_test_training",
  "INBOKAD PÅ PROVTRÄNING": "booked_test_training",
  "KONSULTATION GENOMFÖRD": "consultation_done",
  PRISINFO: "price_info",
  KALL: "cold",
};

/**
 * Pipedrive source origin (column "Källans ursprung") to a Tegen HQ source.
 * "API" and "Marknadsplats" are integrations whose real channel the export
 * does not say, so they become "pipedrive" and the original is kept in a note.
 */
export const sourceMap: Record<string, string> = {
  Webbformulär: "contact_form",
  Dialogrobot: "chat_bot",
  "Skapats manuellt": "manual",
};
export const fallbackSource = "pipedrive";

/** The only pipeline imported. Kids and the customer pipelines are left out. */
export const salesPipeline = "TEGEN SÄLJ 2026";
const openStatus = "Pågående";
/** Pipedrive keeps no reason for its open cold deals, so they get "Annat". */
const coldReasonForImport = "other";
const testMarkers = /test-lab37|ignorer|testlead/i;

export type ImportLead = {
  ref: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  coldReason: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  note: string | null;
};

export type ImportPlan = {
  leads: ImportLead[];
  /** How many deals were left out, by reason. */
  skipped: Record<string, number>;
  /** Values the import does not know, with counts. Reported, never guessed. */
  unmapped: { stages: Record<string, number>; sources: Record<string, number> };
};

/** Parses CSV text (quoted fields, CRLF, a leading BOM). The delimiter is ";" or ",", whichever the header uses more. */
export function parseCsv(text: string): Record<string, string>[] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.slice(0, input.search(/\r?\n/) >>> 0);
  const delimiter = firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows;
  return data
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((name, i) => [name.trim(), (r[i] ?? "").trim()])));
}

/** "2025-03-25 10:11" in Tegen's time zone to an instant. */
export function stockholmDateTime(value: string): Date {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/.exec(value);
  if (!match) throw new Error(`Unexpected Pipedrive date: ${value}`);
  const asUtc = Date.parse(`${match[1]}T${match[2]}:${match[3]}:00Z`);
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(asUtc - offsetHours * 3_600_000);
    const local = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(candidate);
    if (local === `${match[1]} ${match[2]}:${match[3]}`) return candidate;
  }
  return new Date(asUtc - 3_600_000);
}

/** The first value of a cell that may hold several ("a, b"), without Excel's leading apostrophe. */
function firstValue(cell: string | undefined): string | null {
  const value = (cell ?? "").split(",")[0].replace(/^'/, "").trim();
  return value === "" ? null : value;
}

function firstPhone(p: Record<string, string>): string | null {
  for (const column of ["Person - Telefon - Mobil", "Person - Telefon - Annan", "Person - Telefon - Arbete", "Person - Telefon - Hem"]) {
    const value = firstValue(p[column]);
    if (value && normalizePhone(value)) return value;
  }
  return null;
}

function firstEmail(p: Record<string, string>): string | null {
  for (const column of ["Person - E-post - Arbete", "Person - E-post - Hem", "Person - E-post - Annan"]) {
    const value = firstValue(p[column]);
    if (value && value.includes("@")) return value;
  }
  return null;
}

function bump(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

/** Works out what would be imported, without touching the database (the dry run). */
export function planImport(dealsCsv: string, peopleCsv: string): ImportPlan {
  const deals = parseCsv(dealsCsv);
  const people = new Map(parseCsv(peopleCsv).map((p) => [p["Person - ID"], p]));
  const skipped: Record<string, number> = {};
  const unmapped = { stages: {} as Record<string, number>, sources: {} as Record<string, number> };

  // One lead per person: prefer an open stage over cold, then the newest deal.
  const chosen = new Map<string, { deal: Record<string, string>; stage: string }>();
  for (const deal of deals) {
    const status = deal["Affär - Status"];
    if (status !== openStatus) {
      bump(skipped, status === "Vunnen" ? "won" : status === "Förlorad" ? "lost" : `status: ${status}`);
      continue;
    }
    if (deal["Affär - Pipeline"] !== salesPipeline) {
      bump(skipped, deal["Affär - Pipeline"] === "KIDS 2026" ? "kids" : "other_pipeline");
      continue;
    }
    const stage = stageMap[deal["Affär - Fas"]];
    if (!stage) {
      bump(unmapped.stages, deal["Affär - Fas"]);
      bump(skipped, "unmapped_stage");
      continue;
    }
    const personId = deal["Affär - Kontaktpersonens id"];
    if (!people.has(personId)) {
      bump(skipped, "person_missing");
      continue;
    }
    const previous = chosen.get(personId);
    const better =
      !previous ||
      (previous.stage === "cold" && stage !== "cold") ||
      ((previous.stage === "cold") === (stage === "cold") &&
        deal["Affär - Affär skapad"] > previous.deal["Affär - Affär skapad"]);
    if (previous) bump(skipped, "same_person");
    if (better) chosen.set(personId, { deal, stage });
  }

  const leads: ImportLead[] = [];
  for (const [personId, { deal, stage }] of chosen) {
    const p = people.get(personId)!;
    const name = p["Person - Namn"] || deal["Affär - Kontaktperson"];
    const email = firstEmail(p);
    const phone = firstPhone(p);
    if (testMarkers.test(`${name} ${email ?? ""} ${deal["Affär - Namn"]}`)) {
      bump(skipped, "test_lead");
      continue;
    }
    if (!email && !phone) {
      bump(skipped, "no_contact_details");
      continue;
    }
    const origin = deal["Affär - Källans ursprung"];
    const source = sourceMap[origin];
    if (!source) bump(unmapped.sources, origin || "(empty)");
    const noteParts = [
      `Från Pipedrive: ${deal["Affär - Fas"]}`,
      source ? null : `källa ${origin || "okänd"}`,
      deal["Affär - INFO"] || null,
    ].filter(Boolean);
    leads.push({
      ref: `pipedrive:person:${personId}`,
      name,
      email,
      phone,
      stage,
      coldReason: stage === "cold" ? coldReasonForImport : null,
      source: source ?? fallbackSource,
      createdAt: stockholmDateTime(deal["Affär - Affär skapad"]),
      updatedAt: stockholmDateTime(deal["Affär - Uppdaterat klockan"]),
      note: noteParts.join(", "),
    });
  }
  return { leads, skipped, unmapped };
}

export type ImportResult = { created: number; alreadyImported: number; matchedExisting: number };

/**
 * Writes the planned leads. Safe to run twice: a lead already imported (same
 * Pipedrive person) is skipped, and so is anyone the CRM already has a lead
 * for (matched by email, then phone, like the intake), so nothing is doubled.
 */
export async function applyImport(db: Conn, studioId: string, leads: ImportLead[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, alreadyImported: 0, matchedExisting: 0 };
  const refs = leads.map((l) => l.ref);
  const done = new Set(
    refs.length === 0
      ? []
      : (
          await db
            .select({ ref: lead.externalRef })
            .from(lead)
            .where(and(eq(lead.studioId, studioId), inArray(lead.externalRef, refs)))
        ).map((r) => r.ref),
  );

  for (const item of leads) {
    if (done.has(item.ref)) {
      result.alreadyImported++;
      continue;
    }
    await db.transaction(async (tx) => {
      const emailNormalized = normalizeEmail(item.email);
      const phoneNormalized = normalizePhone(item.phone);
      let [existing] = emailNormalized
        ? await tx
            .select()
            .from(person)
            .where(and(eq(person.studioId, studioId), eq(person.emailNormalized, emailNormalized)))
            .limit(1)
        : [];
      if (!existing && phoneNormalized) {
        [existing] = await tx
          .select()
          .from(person)
          .where(and(eq(person.studioId, studioId), eq(person.phoneNormalized, phoneNormalized)))
          .limit(1);
      }
      if (existing) {
        const [hasLead] = await tx.select({ id: lead.id }).from(lead).where(eq(lead.personId, existing.id)).limit(1);
        if (hasLead) {
          result.matchedExisting++;
          return;
        }
      }
      const thePerson =
        existing ??
        (
          await tx
            .insert(person)
            .values({
              studioId,
              name: item.name,
              email: item.email,
              emailNormalized,
              phone: item.phone,
              phoneNormalized,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            })
            .returning()
        )[0];
      const [created] = await tx
        .insert(lead)
        .values({
          studioId,
          personId: thePerson.id,
          source: item.source,
          stage: item.stage,
          coldReason: item.coldReason,
          externalRef: item.ref,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })
        .returning();
      await tx.insert(leadEvent).values({
        studioId,
        leadId: created.id,
        type: "stage_changed",
        toStage: item.stage,
        coldReason: item.coldReason,
        via: "pipedrive",
        createdAt: item.updatedAt,
      });
      if (item.note) {
        await tx.insert(leadNote).values({ studioId, leadId: created.id, body: item.note, createdAt: item.createdAt });
      }
      result.created++;
    });
  }
  return result;
}

/** worked: imported leads someone has worked on in Tegen HQ, whose work a replace would delete. */
export type ReplaceCounts = { leads: number; persons: number; kept: number; worked: number };

/** Leads that came from a Pipedrive import, and the people who have no other lead. */
const importedLead = (studioId: string) => and(eq(lead.studioId, studioId), isNotNull(lead.externalRef));
const onlyImported = (db: Conn, studioId: string) =>
  and(
    eq(person.studioId, studioId),
    exists(db.select({ one: sql`1` }).from(lead).where(and(eq(lead.personId, person.id), isNotNull(lead.externalRef)))),
    notExists(db.select({ one: sql`1` }).from(lead).where(and(eq(lead.personId, person.id), isNull(lead.externalRef)))),
  );

/**
 * Work done in Tegen HQ on a lead: what the import never writes. A note or a
 * history entry by a person, a task, an owner or an email. (The import's own
 * note and stage, and Mana's moves to Medlem, have no author.)
 */
const worked = (db: Conn) =>
  or(
    isNotNull(lead.assignedToId),
    exists(db.select({ one: sql`1` }).from(leadNote).where(and(eq(leadNote.leadId, lead.id), isNotNull(leadNote.authorId)))),
    exists(db.select({ one: sql`1` }).from(leadEvent).where(and(eq(leadEvent.leadId, lead.id), isNotNull(leadEvent.authorId)))),
    exists(db.select({ one: sql`1` }).from(task).where(eq(task.leadId, lead.id))),
    exists(db.select({ one: sql`1` }).from(emailMessage).where(eq(emailMessage.leadId, lead.id))),
  );

/** What a replace would remove, how many leads made in Tegen HQ stay, and how many imported leads have been worked on. */
export async function previewReplace(db: Conn, studioId: string): Promise<ReplaceCounts> {
  // One after another: inside a transaction they share one connection.
  const [leads] = await db.select({ n: sql<number>`count(*)::int` }).from(lead).where(importedLead(studioId));
  const [persons] = await db.select({ n: sql<number>`count(*)::int` }).from(person).where(onlyImported(db, studioId));
  const [kept] = await db.select({ n: sql<number>`count(*)::int` }).from(lead).where(and(eq(lead.studioId, studioId), isNull(lead.externalRef)));
  const [workedOn] = await db.select({ n: sql<number>`count(*)::int` }).from(lead).where(and(importedLead(studioId), worked(db)));
  return { leads: leads.n, persons: persons.n, kept: kept.n, worked: workedOn.n };
}

export class ImportError extends Error {
  constructor(public code: "worked_on", public count: number) {
    super(`${count} imported leads have been worked on in Tegen HQ (notes, logged contacts, tasks, an owner or emails); a replace would delete that work`);
  }
}

/**
 * Swaps the earlier Pipedrive import for a new export, so stages match
 * Pipedrive without comparing the two (2026-10-16). Every lead that came from
 * an import goes, with its notes, history and tasks, and so does each person
 * who had no other lead; then the new export is imported. One transaction:
 * if anything fails, nothing has changed. Leads made in Tegen HQ (by hand,
 * from the website, win-backs) stay, and the import matches against them so
 * nobody is doubled. Moves to Medlem that Mana made come back on the next sync.
 * Refuses when staff have worked on any imported lead, unless forced: once
 * Tegen HQ is in use, a plain import (no replace) adds what is new instead.
 */
export async function replaceImport(db: Db, studioId: string, leads: ImportLead[], { force = false }: { force?: boolean } = {}) {
  return db.transaction(async (tx) => {
    const removed = await previewReplace(tx, studioId);
    if (removed.worked > 0 && !force) throw new ImportError("worked_on", removed.worked);
    // Which people go is read before the leads are deleted, since the leads are what tells.
    const people = await tx.select({ id: person.id }).from(person).where(onlyImported(tx, studioId));
    await tx.delete(lead).where(importedLead(studioId));
    for (let i = 0; i < people.length; i += 500) {
      await tx.delete(person).where(inArray(person.id, people.slice(i, i + 500).map((p) => p.id)));
    }
    const imported = await applyImport(tx, studioId, leads);
    return { removed, imported };
  });
}
