export const leadSources = ["manual", "contact_form", "chat_bot", "mana_win_back"] as const;

/** Sources the CRM sets by itself when Mana shows someone leaving, pausing or only buying day passes. */
export const manaSignalSources = ["mana_cancelled", "mana_freeze", "mana_ended", "mana_day_pass", "mana_klippkort"] as const;
export type ManaSignalSource = (typeof manaSignalSources)[number];

/**
 * A win-back lead: someone who left or paused (a cancellation, freeze or ended
 * membership in Mana, or a win-back entered by hand). These ask why. A day-pass
 * buyer is a new prospect, not someone leaving, so it does not.
 */
export function isWinBackSource(source: string): boolean {
  return ["mana_win_back", "mana_cancelled", "mana_freeze", "mana_ended"].includes(source);
}
export type LeadSource = (typeof leadSources)[number];

export function isLeadSource(value: string): value is LeadSource {
  return (leadSources as readonly string[]).includes(value);
}

/** Stages become an editable table in a later ticket. Until then every lead starts here. */
export const initialStage = "new_lead";
