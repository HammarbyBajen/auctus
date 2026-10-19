/**
 * What may be sent to an AI provider (ticket 30). GDPR's data minimization:
 * only what a task needs. Health information (injury, illness, pregnancy and
 * the like) is a special category and is never sent: a note that shows signs
 * of it is left out whole, not edited, so a miss of the filter can only leave
 * out too much. Phone numbers and email addresses are taken out of the notes
 * that pass, and a note marked private is never sent. Pure, so it is tested
 * on its own; it never asks an AI whether something may be sent to an AI.
 */

/**
 * Signs of health information. A term ending in `*` matches any word that
 * starts with it ("skad*" catches skada, skadad, skadan); the others match a
 * whole word only, so short words do not catch longer ones. Body parts are
 * left out on purpose: "axel" and "knä" are training words too ("axelpress",
 * "knäböj"); "ont" and the injury words catch "ont i knät".
 */
export const healthTerms = [
  "skad*", "ont", "värk*", "smärt*", "sjuk*", "förkyl*", "feber", "influensa", "covid", "corona",
  "opererad*", "operation*", "opereras", "rehab*", "fysio*", "naprapat*", "kiropraktor*", "läkar*", "sjukhus*",
  "vårdcentral*", "akuten", "medicin*", "diagnos*", "gravid*", "förlossning*", "missfall", "utbränd*",
  "utmatt*", "depression*", "deprimerad*", "ångest*", "stress*", "cancer*", "diabetes", "astma*", "hjärt*",
  "migrän*", "bruten", "brutit", "fraktur*", "stukat", "stukning*", "menisk*", "korsband*", "diskbråck*",
  "ischias", "tennisarmbåge", "inflammation*", "inflammerad*", "allergi*", "epilepsi*", "graviditet*",
] as const;

const matcher = (terms: readonly string[]) => {
  const whole = new Set<string>();
  const prefixes: string[] = [];
  for (const raw of terms) {
    const term = raw.trim().toLowerCase();
    if (!term) continue;
    if (term.endsWith("*")) prefixes.push(term.slice(0, -1));
    else whole.add(term);
  }
  return (text: string) =>
    (text.toLowerCase().match(/\p{L}+/gu) ?? []).some((word) => whole.has(word) || prefixes.some((p) => word.startsWith(p)));
};

/** Whether a text shows signs of health information (the built-in terms plus the studio's own). */
export function mentionsHealth(text: string, extraTerms: readonly string[] = []): boolean {
  return matcher([...healthTerms, ...extraTerms])(text);
}

const emailPattern = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;
// Seven or more digits, allowing spaces, dashes and a leading +: Swedish mobile and landline numbers.
const phonePattern = /\+?\d[\d\s-]{5,}\d/g;

/** Takes email addresses and phone numbers out of a text. */
export function withoutContactDetails(text: string): string {
  return text
    .replace(emailPattern, "[e-post]")
    // A date (2026-11-03) looks like a number with dashes; it stays.
    .replace(phonePattern, (m) => (/^\d{4}-\d{1,2}-\d{1,2}$/.test(m.trim()) ? m : "[telefon]"));
}

export type NoteForAi = { body: string; private?: boolean | null };

/**
 * The notes that may be sent, cleaned, and how many were held back. Private
 * notes and notes with signs of health information are held back whole.
 */
export function notesForAi<T extends NoteForAi>(notes: T[], extraTerms: readonly string[] = []): { sent: (T & { body: string })[]; withheld: number } {
  const health = matcher([...healthTerms, ...extraTerms]);
  const sent: (T & { body: string })[] = [];
  let withheld = 0;
  for (const note of notes) {
    if (note.private || health(note.body)) withheld += 1;
    else sent.push({ ...note, body: withoutContactDetails(note.body) });
  }
  return { sent, withheld };
}

/** The first word of a name: enough for "Hej Anna" and for telling leads apart, without the full name. */
export function firstNameOnly(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}
