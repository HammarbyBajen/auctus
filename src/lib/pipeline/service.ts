import { randomBytes } from "node:crypto";
import { and, asc, count, eq, isNull, max } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { coldReason, lead, leadEvent, leadField, pipelineStage, winBackReason } from "@/db/schema";
import { manaStage } from "@/lib/leads/constants";
import { defaultColdReasons, defaultStages, defaultWinBackReasons } from "./defaults";

type Db = typeof defaultDb;

/** Gives a studio the default stages and Cold reasons if it has none yet. Safe to run twice. */
export async function ensureDefaultPipeline(db: Db, studioId: string) {
  await db
    .insert(pipelineStage)
    .values(defaultStages.map((s, position) => ({ studioId, ...s, position })))
    .onConflictDoNothing();
  await db
    .insert(coldReason)
    .values(defaultColdReasons.map((r, position) => ({ studioId, ...r, position })))
    .onConflictDoNothing();
  await db
    .insert(winBackReason)
    .values(defaultWinBackReasons.map((r, position) => ({ studioId, ...r, position })))
    .onConflictDoNothing();
}

/** Adds the "Från Mana" column first on the board, if the studio does not have it yet. Returns its key. */
export async function ensureManaStage(db: Db, studioId: string): Promise<string> {
  const [first] = await db.select({ position: pipelineStage.position }).from(pipelineStage).where(eq(pipelineStage.studioId, studioId)).orderBy(asc(pipelineStage.position)).limit(1);
  await db
    .insert(pipelineStage)
    .values({ studioId, key: manaStage, name: "Från Mana", kind: "open", position: (first?.position ?? 0) - 1 })
    .onConflictDoNothing();
  return manaStage;
}

export async function listWinBackReasons(db: Db, studioId: string) {
  return db
    .select()
    .from(winBackReason)
    .where(eq(winBackReason.studioId, studioId))
    .orderBy(asc(winBackReason.position));
}

/**
 * The studio's stages in pipeline order. Removed ones are left out, unless
 * asked for (old history still names them).
 */
export async function listStages(db: Db, studioId: string, options: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(pipelineStage)
    .where(and(eq(pipelineStage.studioId, studioId), options.includeArchived ? undefined : isNull(pipelineStage.archivedAt)))
    .orderBy(asc(pipelineStage.position));
}

/** The Cold reasons in order. Removed ones are left out, unless asked for (leads keep theirs). */
export async function listColdReasons(db: Db, studioId: string, options: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(coldReason)
    .where(and(eq(coldReason.studioId, studioId), options.includeArchived ? undefined : isNull(coldReason.archivedAt)))
    .orderBy(asc(coldReason.position));
}

/** The studio's own lead fields in order, removed ones left out. */
export async function listLeadFields(db: Db, studioId: string) {
  return db
    .select()
    .from(leadField)
    .where(and(eq(leadField.studioId, studioId), isNull(leadField.archivedAt)))
    .orderBy(asc(leadField.position));
}

// ---- Editing (ticket 07), owners only ----

/**
 * Stages the code relies on, which can be renamed and moved but never removed:
 * where new leads start, where a first contact moves them, the stage the home
 * page counts test trainings in, and the Won and Cold stages.
 */
export const lockedStages = ["new_lead", "contacted", "booked_test_training", "won", "cold"];

export class PipelineError extends Error {
  constructor(public code: "not_found" | "locked" | "has_leads" | "invalid") {
    super(code);
  }
}

/** A key for something new: readable from the name, unique by a short random tail. */
function newKey(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return `${base || "item"}_${randomBytes(3).toString("hex")}`;
}

const cleanName = (name: string) => {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 40) throw new PipelineError("invalid");
  return trimmed;
};

export async function renameStage(db: Db, studioId: string, key: string, name: string) {
  const [updated] = await db
    .update(pipelineStage)
    .set({ name: cleanName(name) })
    .where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.key, key)))
    .returning();
  if (!updated) throw new PipelineError("not_found");
}

/** Adds an open stage, placed last among the open ones (before Medlem and Kall lead). */
export async function addStage(db: Db, studioId: string, name: string) {
  const label = cleanName(name);
  const stages = await listStages(db, studioId, { includeArchived: true });
  const lastOpen = Math.max(-1, ...stages.filter((s) => s.kind === "open").map((s) => s.position));
  const key = newKey(label);
  await db.transaction(async (tx) => {
    for (const s of stages.filter((s) => s.position > lastOpen).sort((a, b) => b.position - a.position)) {
      await tx.update(pipelineStage).set({ position: s.position + 1 }).where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.key, s.key)));
    }
    await tx.insert(pipelineStage).values({ studioId, key, name: label, position: lastOpen + 1, kind: "open" });
  });
  return key;
}

/** Moves an open stage one step up or down among the open stages. Medlem and Kall lead stay last. */
export async function moveStageOrder(db: Db, studioId: string, key: string, direction: "up" | "down") {
  const open = (await listStages(db, studioId)).filter((s) => s.kind === "open");
  const i = open.findIndex((s) => s.key === key);
  if (i === -1) throw new PipelineError("not_found");
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= open.length) return;
  const [a, b] = [open[i], open[j]];
  await db.transaction(async (tx) => {
    await tx.update(pipelineStage).set({ position: b.position }).where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.key, a.key)));
    await tx.update(pipelineStage).set({ position: a.position }).where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.key, b.key)));
  });
}

/** How many leads are in each stage, for showing what removing one would mean. */
export async function leadsPerStage(db: Db, studioId: string): Promise<Map<string, number>> {
  const rows = await db.select({ stage: lead.stage, n: count() }).from(lead).where(eq(lead.studioId, studioId)).groupBy(lead.stage);
  return new Map(rows.map((r) => [r.stage, r.n]));
}

/**
 * Removes a stage. A locked one never; one that still has leads only together
 * with where they go (`moveTo`), which moves them first and notes each move
 * in their history. The stage is hidden, not erased, so history still names it.
 */
export async function removeStage(db: Db, studioId: string, key: string, options: { moveTo?: string | null; authorId?: string | null } = {}) {
  if (lockedStages.includes(key)) throw new PipelineError("locked");
  const stages = await listStages(db, studioId);
  if (!stages.some((s) => s.key === key)) throw new PipelineError("not_found");
  const inStage = await db.select({ id: lead.id }).from(lead).where(and(eq(lead.studioId, studioId), eq(lead.stage, key)));
  const target = options.moveTo ? stages.find((s) => s.key === options.moveTo && s.key !== key) : undefined;
  if (inStage.length > 0 && (!target || target.kind === "cold")) throw new PipelineError("has_leads");
  await db.transaction(async (tx) => {
    if (inStage.length > 0 && target) {
      await tx.update(lead).set({ stage: target.key, updatedAt: new Date() }).where(and(eq(lead.studioId, studioId), eq(lead.stage, key)));
      await tx.insert(leadEvent).values(
        inStage.map((l) => ({ studioId, leadId: l.id, type: "stage_changed", fromStage: key, toStage: target.key, authorId: options.authorId ?? null, via: "settings" })),
      );
    }
    await tx.update(pipelineStage).set({ archivedAt: new Date() }).where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.key, key)));
  });
  return { moved: inStage.length };
}

export async function renameColdReason(db: Db, studioId: string, key: string, name: string) {
  const [updated] = await db
    .update(coldReason)
    .set({ name: cleanName(name) })
    .where(and(eq(coldReason.studioId, studioId), eq(coldReason.key, key)))
    .returning();
  if (!updated) throw new PipelineError("not_found");
}

export async function addColdReason(db: Db, studioId: string, name: string) {
  const label = cleanName(name);
  const [{ last }] = await db.select({ last: max(coldReason.position) }).from(coldReason).where(eq(coldReason.studioId, studioId));
  const key = newKey(label);
  await db.insert(coldReason).values({ studioId, key, name: label, position: (last ?? -1) + 1 });
  return key;
}

/** Hides a Cold reason from the choices; leads that already have it keep it. At least one must remain. */
export async function removeColdReason(db: Db, studioId: string, key: string) {
  const reasons = await listColdReasons(db, studioId);
  if (!reasons.some((r) => r.key === key)) throw new PipelineError("not_found");
  if (reasons.length <= 1) throw new PipelineError("locked");
  await db.update(coldReason).set({ archivedAt: new Date() }).where(and(eq(coldReason.studioId, studioId), eq(coldReason.key, key)));
}

export async function moveColdReasonOrder(db: Db, studioId: string, key: string, direction: "up" | "down") {
  const reasons = await listColdReasons(db, studioId);
  const i = reasons.findIndex((r) => r.key === key);
  if (i === -1) throw new PipelineError("not_found");
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= reasons.length) return;
  const [a, b] = [reasons[i], reasons[j]];
  await db.transaction(async (tx) => {
    await tx.update(coldReason).set({ position: b.position }).where(and(eq(coldReason.studioId, studioId), eq(coldReason.key, a.key)));
    await tx.update(coldReason).set({ position: a.position }).where(and(eq(coldReason.studioId, studioId), eq(coldReason.key, b.key)));
  });
}

/** Choices for a choice field: one per line, tidied, at most 30. */
export function parseOptions(text: string): string[] {
  return [...new Set(text.split("\n").map((o) => o.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 30).map((o) => o.slice(0, 60));
}

export async function addLeadField(db: Db, studioId: string, input: { label: string; type: "text" | "choice"; options: string[] }) {
  const label = cleanName(input.label);
  if (input.type === "choice" && input.options.length < 2) throw new PipelineError("invalid");
  const [{ last }] = await db.select({ last: max(leadField.position) }).from(leadField).where(eq(leadField.studioId, studioId));
  const key = newKey(label);
  await db.insert(leadField).values({ studioId, key, label, type: input.type, options: input.type === "choice" ? input.options : [], position: (last ?? -1) + 1 });
  return key;
}

export async function updateLeadField(db: Db, studioId: string, key: string, input: { label: string; options?: string[] }) {
  const [field] = await db.select().from(leadField).where(and(eq(leadField.studioId, studioId), eq(leadField.key, key))).limit(1);
  if (!field) throw new PipelineError("not_found");
  const options = field.type === "choice" ? (input.options ?? field.options) : [];
  if (field.type === "choice" && options.length < 2) throw new PipelineError("invalid");
  await db.update(leadField).set({ label: cleanName(input.label), options }).where(and(eq(leadField.studioId, studioId), eq(leadField.key, key)));
}

/** Hides a field from leads and forms. Values already saved on leads stay, and come back if it is added again. */
export async function removeLeadField(db: Db, studioId: string, key: string) {
  const [updated] = await db
    .update(leadField)
    .set({ archivedAt: new Date() })
    .where(and(eq(leadField.studioId, studioId), eq(leadField.key, key)))
    .returning();
  if (!updated) throw new PipelineError("not_found");
}

/**
 * Reads the studio's fields from a form (field_<key>), keeping only known
 * fields and, for a choice field, only one of its choices. Empty means unset.
 */
export function readFieldValues(fields: { key: string; type: string; options: string[] }[], form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    const raw = String(form.get(`field_${f.key}`) ?? "").trim().slice(0, 500);
    if (!raw) continue;
    if (f.type === "choice" && !f.options.includes(raw)) continue;
    values[f.key] = raw;
  }
  return values;
}

/** Saves a lead's field values. Values of fields not on the form (removed ones) are kept. */
export async function saveLeadFieldValues(db: Db, studioId: string, leadId: string, form: FormData) {
  const fields = await listLeadFields(db, studioId);
  const [found] = await db.select({ customFields: lead.customFields }).from(lead).where(and(eq(lead.studioId, studioId), eq(lead.id, leadId))).limit(1);
  if (!found) throw new PipelineError("not_found");
  const kept = Object.fromEntries(Object.entries(found.customFields).filter(([k]) => !fields.some((f) => f.key === k)));
  await db
    .update(lead)
    .set({ customFields: { ...kept, ...readFieldValues(fields, form) }, updatedAt: new Date() })
    .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)));
}
