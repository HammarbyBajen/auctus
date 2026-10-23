import { describe, expect, it } from "vitest";
import { briefSystem, stepsSystem } from "@/lib/ai/assist";
import { draftSystem } from "@/lib/ai/drafts";
import { answerSystem, summarySystem } from "@/lib/ai/owner";
import { systemPrompt, tegen } from "@/lib/ai/prompts";

const prompts = { briefSystem, stepsSystem, draftSystem, answerSystem, summarySystem };

describe("the assistant's instructions (ticket 30)", () => {
  it("are built the same way: role, input, task, then the rules that always hold", () => {
    expect(systemPrompt({ role: "R", input: "I", task: "T:", rules: ["a", "b"] })).toBe(
      "R\n\nI\n\nT:\n- a\n- b\n\nGäller alltid:\n- Skriv på svenska.\n- Använd bara det som står i underlaget. Hitta aldrig på fakta, priser, erbjudanden, tider, datum eller orsaker. Saknas något, säg det hellre än att gissa.\n- Nämn aldrig hälsa, skador eller sjukdom, även om något tyder på det.\n- Personer anges bara med förnamn. Gissa aldrig efternamn eller kontaktuppgifter.",
    );
  });

  it("all say who Tegen is and carry the shared rules", () => {
    for (const [name, prompt] of Object.entries(prompts)) {
      expect(prompt, name).toContain(tegen);
      expect(prompt, name).toContain("Gäller alltid:");
      expect(prompt, name).toContain("Skriv på svenska.");
      expect(prompt, name).toContain("Hitta aldrig på fakta");
    }
  });

  it("never mention health, except that owners may see reasons as counts, never about a named person", () => {
    for (const prompt of [briefSystem, stepsSystem, draftSystem, summarySystem]) expect(prompt).toContain("Nämn aldrig hälsa, skador eller sjukdom, även om något tyder på det.");
    expect(answerSystem).toContain("Nämn aldrig hälsa, skador eller sjukdom hos en namngiven person.");
    expect(answerSystem).not.toContain("även om något tyder på det");
  });
});
