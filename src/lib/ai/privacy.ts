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
 * Signs of health information, as word stems. A stem is caught anywhere in a
 * word, since Swedish puts the health word last in a compound ("skad" catches
 * skada, ryggskada and knäskadan). A stem of three letters or fewer would
 * catch too much that way ("ont" is in "kontakt"), so it is caught as a whole
 * word or at the end of one (ont, ryggont, magont). Both fail on the safe
 * side: "medicinboll" is held back too. A term of several words ("mår illa")
 * is caught as written. Body parts are left out on purpose:
 * "axel" and "knä" are training words ("axelpress", "knäböj").
 */
export const healthTerms = [
  "skad", "ont", "värk", "smärt", "sjuk", "förkyl", "feber", "influensa", "covid", "corona", "smitt",
  "operer", "operation", "rehab", "fysio", "naprapat", "kiropraktor", "läkar", "vårdcentral", "akuten",
  "medicin", "diagnos", "terapi", "psyk", "gravid", "förlossning", "missfall", "utbränd", "utmatt",
  "depression", "deprimer", "ångest", "stress", "cancer", "diabet", "astma", "hjärt", "blodtryck", "migrän",
  "yrsel", "illamå", "kräk", "bruten", "brutit", "bröt", "fraktur", "stuk", "sträckning", "ryggskott",
  "nackspärr", "hjärnskakning", "menisk", "korsband", "diskbråck", "ischias", "tennisarmbåge", "inflamm",
  "allergi", "epilepsi", "mår illa", "mår dåligt",
] as const;

/** Stems this short are caught only as a whole word or at the end of one. */
const shortTermLength = 3;

/** A word as typed into the list: lower case, without the * that terms once ended with. */
const cleanTerm = (raw: string) => raw.trim().toLowerCase().replace(/\*+$/, "").trim();

/** Which word of a text was caught, and by which term. */
export type HealthMatch = { term: string; word: string };

const matcher = (terms: readonly string[]) => {
  const list = [...new Set(terms.map(cleanTerm).filter(Boolean))];
  return (text: string): HealthMatch | null => {
    const lower = text.toLowerCase();
    // A term of several words ("ont i") is looked for as it is written.
    for (const term of list) if (/\s/.test(term) && lower.includes(term)) return { term, word: term };
    for (const word of lower.match(/\p{L}+/gu) ?? []) {
      for (const term of list) {
        if (term.length <= shortTermLength ? word === term || word.endsWith(term) : word.includes(term)) return { term, word };
      }
    }
    return null;
  };
};

/** The first sign of health information in a text, if any (the built-in terms plus the studio's own). */
export function healthMatch(text: string, extraTerms: readonly string[] = []): HealthMatch | null {
  return matcher([...healthTerms, ...extraTerms])(text);
}

/** Whether a text shows signs of health information (the built-in terms plus the studio's own). */
export function mentionsHealth(text: string, extraTerms: readonly string[] = []): boolean {
  return healthMatch(text, extraTerms) !== null;
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
    if (note.private || health(note.body) !== null) withheld += 1;
    else sent.push({ ...note, body: withoutContactDetails(note.body) });
  }
  return { sent, withheld };
}

/** The first word of a name: enough for "Hej Anna" and for telling leads apart, without the full name. */
export function firstNameOnly(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}
