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
const urlPattern = /https?:\/\/[^\s<>"]+/g;
// A Swedish personal identity number: (19|20)YYMMDD-NNNN, with or without the dash.
const personalNumberPattern = /\b(?:19|20)?\d{6}[-+]?\d{4}\b/g;
// Seven or more digits with spaces, dashes, dots or brackets between them.
const phonePattern = /[+(]?\d[\d\s().-]{5,}\d/g;

/** A phone number starts with 0, + or a bracket (070..., +46..., (070)); "17.30-18.30" and amounts do not. */
const looksLikePhone = (m: string) => {
  const t = m.trim();
  return (t.match(/\d/g) ?? []).length >= 7 && /^[0+(]/.test(t) && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(t);
};

/** A web address without its query or fragment, where click ids and tracking live. */
const withoutTracking = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[länk]";
  }
};

/**
 * Takes email addresses, phone numbers and personal identity numbers out of a
 * text, and tracking out of web addresses (the website's own lead note carries
 * the landing page with its click ids).
 */
export function withoutContactDetails(text: string): string {
  return text
    .replace(emailPattern, "[e-post]")
    .replace(urlPattern, withoutTracking)
    // Phones first: 0701234567 also reads as an ID number from 2007, and is a phone.
    .replace(phonePattern, (m) => (looksLikePhone(m) ? "[telefon]" : m))
    .replace(personalNumberPattern, "[personnummer]");
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
