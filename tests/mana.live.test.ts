import { describe, expect, it } from "vitest";
import { ManaClient } from "@/lib/mana/client";

/**
 * Checks the real Mana API still has the shape the CRM relies on. It makes
 * two or three read-only requests, so it only runs when asked for:
 *   MANA_LIVE=1 pnpm test tests/mana.live.test.ts
 * It needs MANA_API_KEY and MANA_STUDIO_ID in .env.local. Nothing is printed
 * or stored.
 */
const live = process.env.MANA_LIVE === "1" && Boolean(process.env.MANA_API_KEY) && Boolean(process.env.MANA_STUDIO_ID);

describe.skipIf(!live)("live Mana contract", () => {
  const client = () =>
    new ManaClient({
      baseUrl: "https://www.getmana.app",
      studioId: process.env.MANA_STUDIO_ID!,
      apiKey: process.env.MANA_API_KEY!,
    });

  it("returns people in the shape the sync reads, with a next link or none", async () => {
    const page = await client().getUsersPage(null);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
    if (page.next) expect(new URL(page.next).origin).toBe("https://www.getmana.app");
  }, 30_000);

  it("returns a member's memberships in the shape the sync reads", async () => {
    const c = client();
    const page = await c.getUsersPage(null);
    const member = page.items.find((u) => u.role === "member");
    expect(member).toBeTruthy();
    const memberships = await c.getUserMemberships(member!.userId);
    for (const m of memberships) {
      expect(["active", "ended", "future"]).toContain(m.status);
      expect(m.price.currency).toMatch(/^[A-Z]{3}$/);
    }
  }, 30_000);

  it("returns paid purchases in the shape the win-back reads", async () => {
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const payments = await client().getPaidPayments(since);
    for (const p of payments) {
      expect(typeof p.kind).toBe("string");
      if (p.paidAt) expect(Number.isNaN(Date.parse(p.paidAt))).toBe(false);
    }
  }, 60_000);
});
