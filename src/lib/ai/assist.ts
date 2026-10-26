import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@/db";
import { studioSettings } from "@/db/schema";
import { contactOutcomes } from "@/lib/pipeline/defaults";
import { listColdReasons, listStages } from "@/lib/pipeline/service";
import { todayInStockholm } from "@/lib/tasks/dates";
import { askAi, type AiResult, type AiTransport } from "./client";
import { notesForAi } from "./privacy";
import { systemPrompt, tegen } from "./prompts";
import { briefSchema, type Brief } from "./brief";
import { leadContext, stepSchema, type Actor, type Step } from "./tools";

export type { Brief } from "./brief";

/**
 * Phase B of the assistant (ticket 30): a brief before a call, and steps from
 * a note after one. Both start from what a person asks for, never on their
 * own, and both only suggest: the brief is read, the steps are approved one
 * by one (applySteps in ./tools).
 */

type Db = typeof defaultDb;

// ---- Before the call ----

export const briefSystem = systemPrompt({
  role: `Du hjälper personalen på ${tegen} inför ett samtal med en lead: någon som visat intresse för att börja träna.`,
  input:
    "Du får en sammanfattning av leaden som JSON: förnamn, steg i säljprocessen, när och varifrån leaden kom, svar från formuläret på webben, vad som hänt (kontakter, stegbyten och anteckningar) och öppna uppgifter. Anteckningar som innehåller känsliga uppgifter har hållits tillbaka och räknas bara.",
  task: "Skriv en kort sammanfattning, så att personen slipper läsa igenom historiken. Inget manus:",
  rules: [
    "Det viktigaste först, i två eller tre korta meningar: vem det är, vad de vill och var det står.",
    "Fakta bara om de tillför något utöver sammanfattningen, högst fyra, nyast först.",
    "Vardagligt och kort, som en kollega som snabbt sätter någon in i läget.",
    "Saknas något viktigt (till exempel att ingen kontakt tagits än), säg det rakt ut.",
    "Nästa steg i några ord. Oftast att boka en provträning eller ett möte.",
  ],
});

/** Asks for a short summary of a lead before getting in touch. */
export async function callBrief(db: Db, actor: Actor, leadId: string, transport?: AiTransport, now: Date = new Date()): Promise<AiResult<Brief>> {
  const context = await leadContext(db, actor, leadId, now);
  return askAi(
    db,
    { studioId: actor.studioId, userId: actor.id, kind: "call_brief", leadId },
    { system: briefSystem, prompt: JSON.stringify({ today: todayInStockholm(now), lead: context }), schema: briefSchema, effort: "low" },
    transport,
    now,
  );
}

// ---- After the call ----

const proposalSchema = z.object({
  steps: z.array(stepSchema).describe("The steps that follow from the note, in order. Leave out anything the note does not support."),
  explanation: z.string().describe("One short sentence in Swedish on why these steps."),
});
export type StepProposal = { steps: Step[]; explanation: string };

export const stepsSystem = systemPrompt({
  role: `Du hjälper personalen på ${tegen} att föra in vad som hände efter ett samtal eller en kontakt med en lead.`,
  input:
    "Du får leadens läge som JSON, listan med steg i säljprocessen (key och namn), skälen för att markera en lead som kall, vilka kontaktutfall som finns, dagens datum, och anteckningen personalen just skrev.",
  task: "Föreslå de steg som anteckningen faktiskt ger stöd för. Hellre färre steg än fel steg:",
  rules: [
    "log_contact: om anteckningen visar att en kontakt togs. Välj utfall bland de givna (called = pratade med dem, no_answer = svarade inte, emailed = mejlade eller sms:ade, booked = bokade en tid).",
    "add_note: anteckningen, renskriven kort och sakligt. Ta med det viktiga, inget nytt.",
    'create_task: om något ska göras ett visst datum (ring tillbaka, påminn, följ upp). dueDate i formatet ÅÅÅÅ-MM-DD, räknat från dagens datum; "torsdag" betyder närmaste torsdag efter i dag.',
    "move_stage: bara om anteckningen tydligt visar att leaden kommit till ett annat steg. Använd key från listan. Kall kräver ett skäl (coldReason, key från listan); annars är coldReason null.",
  ],
});

export type StepsResult = AiResult<StepProposal> | { status: "held_back" };

/**
 * Asks for the steps that follow from a note. A note marked private, or with
 * signs of health information, is never sent: the person logs it by hand.
 * Steps that name a stage or a reason the studio does not have are dropped.
 */
export async function stepsFromNote(
  db: Db,
  actor: Actor,
  leadId: string,
  note: { body: string; private: boolean },
  transport?: AiTransport,
  now: Date = new Date(),
): Promise<StepsResult> {
  const [settings] = await db.select({ ai: studioSettings.aiSettings }).from(studioSettings).where(eq(studioSettings.studioId, actor.studioId)).limit(1);
  const filtered = notesForAi([note], settings?.ai?.healthTerms ?? []);
  if (filtered.sent.length === 0) return { status: "held_back" };

  const [context, stages, reasons] = await Promise.all([
    leadContext(db, actor, leadId, now),
    listStages(db, actor.studioId),
    listColdReasons(db, actor.studioId),
  ]);
  const prompt = JSON.stringify({
    today: todayInStockholm(now),
    lead: context,
    stages: stages.map((s) => ({ key: s.key, name: s.name, kind: s.kind })),
    coldReasons: reasons.map((r) => ({ key: r.key, name: r.name })),
    contactOutcomes,
    note: filtered.sent[0].body,
  });
  const result = await askAi(db, { studioId: actor.studioId, userId: actor.id, kind: "after_call", leadId }, { system: stepsSystem, prompt, schema: proposalSchema, effort: "low" }, transport, now);
  if (result.status !== "ok") return result;

  const steps = await usableSteps(db, actor.studioId, result.output.steps);
  return { ...result, output: { steps, explanation: result.output.explanation } };
}

/**
 * The proposed steps that can be carried out: a stage the studio has, a Cold
 * move only with one of its reasons, and a reason only on a Cold move. Run
 * again when the steps are approved, on the stored suggestion.
 */
export async function usableSteps(db: Db, studioId: string, proposed: unknown): Promise<Step[]> {
  const parsed = z.array(stepSchema).safeParse(proposed);
  if (!parsed.success) return [];
  const [stages, reasons] = await Promise.all([listStages(db, studioId), listColdReasons(db, studioId)]);
  const stageKeys = new Set(stages.map((s) => s.key));
  const coldKeys = new Set(stages.filter((s) => s.kind === "cold").map((s) => s.key));
  const reasonKeys = new Set(reasons.map((r) => r.key));
  return parsed.data
    .filter((step) => {
      if (step.type !== "move_stage") return true;
      if (!stageKeys.has(step.stage)) return false;
      return coldKeys.has(step.stage) ? Boolean(step.coldReason && reasonKeys.has(step.coldReason)) : true;
    })
    .map((step) => (step.type === "move_stage" && !coldKeys.has(step.stage) ? { ...step, coldReason: null } : step));
}
