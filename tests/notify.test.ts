import { describe, expect, it } from "vitest";
import { postToDiscord } from "@/lib/notify/discord";
import { overdueMessage, summaryMessage } from "@/lib/notify/messages";

const hook = "https://discord.com/api/webhooks/123/abc-DEF_1";

describe("posting to Discord", () => {
  it("does nothing without a webhook, or with an address that is not Discord's", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    expect(await postToDiscord("Hej", { url: "", fetchFn })).toBe("disabled");
    expect(await postToDiscord("Hej", { url: "https://evil.example/api/webhooks/1/x", fetchFn })).toBe("disabled");
    expect(calls).toBe(0);
  });

  it("posts the text with every mention switched off", async () => {
    let sent: { url: string; body: unknown } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    expect(await postToDiscord("@everyone hej", { url: hook, fetchFn })).toBe("sent");
    expect(sent).toEqual({ url: hook, body: { content: "@everyone hej", allowed_mentions: { parse: [] } } });
  });

  it("reports a refused or failed post without throwing", async () => {
    expect(await postToDiscord("Hej", { url: hook, fetchFn: (async () => new Response(null, { status: 429 })) as typeof fetch })).toBe("failed");
    expect(
      await postToDiscord("Hej", {
        url: hook,
        fetchFn: (async () => {
          throw new Error(`network down for ${hook}`);
        }) as typeof fetch,
      }),
    ).toBe("failed");
  });
});

describe("what is posted", () => {
  it("says a lead missed its first contact, with a link and no personal data", () => {
    const text = overdueMessage({
      source: "contact_form",
      createdAt: new Date("2026-10-14T08:00:00Z"),
      deadline: new Date("2026-10-15T08:00:00Z"),
      url: "https://tegen.example/leads/abc",
    });
    expect(text).toContain("Kontaktformulär");
    expect(text).toContain("14 okt. 2026 10:00");
    expect(text).toContain("15 okt. 2026 10:00");
    expect(text.endsWith("https://tegen.example/leads/abc")).toBe(true);
  });

  it("sums up the morning", () => {
    const text = summaryMessage({
      day: "2026-10-15",
      newYesterday: { chat_bot: 1, contact_form: 2 },
      overdueFirstContact: 1,
      tasksOverdue: 2,
      tasksToday: 3,
      atRisk: 5,
      sync: { ok: true, at: new Date("2026-10-15T03:04:00Z") },
      url: "https://tegen.example/",
    });
    expect(text.split("\n")).toEqual([
      "Tegen HQ, läget 15 okt.",
      "• Nya leads i går: 3 (Kontaktformulär 2, Chatbot 1)",
      "• Försenad första kontakt: 1",
      "• Uppgifter: 2 försenade, 3 i dag",
      "• Medlemmar som riskerar att sluta: 5",
      "• Mana-synken gick bra 15 okt. 2026 05:04",
      "https://tegen.example/",
    ]);
  });

  it("says when nothing came in, and when the sync failed", () => {
    const text = summaryMessage({
      day: "2026-10-15",
      newYesterday: {},
      overdueFirstContact: 0,
      tasksOverdue: 0,
      tasksToday: 0,
      atRisk: 0,
      sync: { ok: false, at: new Date("2026-10-15T03:04:00Z") },
      url: "https://tegen.example/",
    });
    expect(text).toContain("• Inga nya leads i går");
    expect(text).toContain("• Mana-synken misslyckades 15 okt. 2026 05:04");
  });
});
