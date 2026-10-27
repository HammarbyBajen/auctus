export const leadSources = ["manual", "contact_form", "chat_bot"] as const;
export type LeadSource = (typeof leadSources)[number];

export function isLeadSource(value: string): value is LeadSource {
  return (leadSources as readonly string[]).includes(value);
}

/** Stages become an editable table in a later ticket. Until then every lead starts here. */
export const initialStage = "new_lead";
