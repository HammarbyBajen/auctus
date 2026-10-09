/**
 * The stages and Cold reasons every new studio starts with. They are stored as
 * data (see the pipeline_stage and cold_reason tables), so owners can rename,
 * reorder and add to them later. The keys are stable and never change.
 */
export type StageKind = "open" | "won" | "cold";

export const defaultStages: { key: string; name: string; kind: StageKind }[] = [
  { key: "new_lead", name: "Ny lead", kind: "open" },
  { key: "contacted", name: "Kontaktad", kind: "open" },
  { key: "booked_meeting", name: "Bokat möte", kind: "open" },
  { key: "booked_test_training", name: "Bokat provträning", kind: "open" },
  { key: "consultation_done", name: "Konsultation klar", kind: "open" },
  { key: "price_info", name: "Prisinformation", kind: "open" },
  { key: "won", name: "Medlem", kind: "won" },
  { key: "cold", name: "Kall lead", kind: "cold" },
];

export const defaultColdReasons: { key: string; name: string }[] = [
  { key: "price", name: "Pris" },
  { key: "location", name: "Läge eller avstånd" },
  { key: "no_response", name: "Svarar inte" },
  { key: "not_interested", name: "Inte intresserad längre" },
  { key: "other_gym", name: "Valde en annan anläggning" },
  { key: "other", name: "Annat" },
];

/** What happened after contacting someone: one tap on the lead page. */
export const contactOutcomes = ["called", "no_answer", "emailed", "booked"] as const;
export type ContactOutcome = (typeof contactOutcomes)[number];
