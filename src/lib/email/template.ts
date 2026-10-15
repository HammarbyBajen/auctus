/**
 * Tegen's email templates (M8): owners write them in Tegen HQ, and
 * {förnamn} and {namn} are filled in with the person's name. Pure, so it is
 * tested on its own.
 */

/** The first word of a name, for "Hej Anna". */
export function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function fillTemplate(text: string, name: string | null): string {
  const values: Record<string, string> = { förnamn: firstName(name), namn: (name ?? "").trim() };
  return text.replace(/\{(förnamn|namn)\}/g, (_, key: string) => values[key] ?? "");
}

/** The paragraphs of a plain-text email: split on blank lines, single line breaks kept. */
export function paragraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
