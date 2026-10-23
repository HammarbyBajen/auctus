/**
 * How every instruction to the assistant is put together (ticket 30): who it
 * is, what it gets, its task, and the rules that always hold. The shared
 * rules live here once, so a change to one reaches every kind of help; each
 * kind adds only what is its own. Written in Swedish, like the answers.
 */

/** Who Tegen is, as the assistant is told. */
export const tegen = "CrossFit Tegen, ett CrossFit-gym i Stockholm";

/**
 * Health: never, when the text is about or to one person; for the owners'
 * figures, never about a named person, while reasons counted in the figures
 * (for example "skada eller sjukdom" as a reason to pause) may be named as numbers.
 */
type Health = "never" | "not_about_a_person";

const shared = (health: Health) => [
  "Skriv på svenska.",
  "Använd bara det som står i underlaget. Hitta aldrig på fakta, priser, erbjudanden, tider, datum eller orsaker. Saknas något, säg det hellre än att gissa.",
  health === "never"
    ? "Nämn aldrig hälsa, skador eller sjukdom, även om något tyder på det."
    : "Nämn aldrig hälsa, skador eller sjukdom hos en namngiven person. Skäl som räknas i siffrorna går bra att nämna som antal.",
  "Personer anges bara med förnamn. Gissa aldrig efternamn eller kontaktuppgifter.",
];

export type PromptParts = {
  /** Who the assistant is in this task and whom it helps, in a sentence or two. */
  role: string;
  /** What it gets, as JSON. */
  input: string;
  /** The line that leads into the task's own rules, e.g. "Skriv en kort förberedelse:". */
  task: string;
  /** The rules that are this task's own. */
  rules: string[];
  health?: Health;
};

/** One system prompt: the role, what comes in, the task's rules, then the rules that always hold. */
export function systemPrompt({ role, input, task, rules, health = "never" }: PromptParts): string {
  const list = (items: string[]) => items.map((r) => `- ${r}`).join("\n");
  return `${role}\n\n${input}\n\n${task}\n${list(rules)}\n\nGäller alltid:\n${list(shared(health))}`;
}
