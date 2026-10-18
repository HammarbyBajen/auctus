import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ManaClient } from "@/lib/mana/client";
import { ManaError } from "@/lib/mana/errors";

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/mana/${name}.json`, "utf8"));
const KEY = "mana_sk_TEST_KEY_DO_NOT_LEAK";
const base = "https://www.getmana.app";

type Call = { url: string; method: string; at: number; headers: Record<string, string> };

function setup(
  handler: (url: string, call: number) => { status: number; body?: unknown; headers?: Record<string, string> } | "throw",
  options: { minIntervalMs?: number; maxRetries?: number; keyWorked?: boolean } = {},
) {
  let clock = 1_000_000;
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      at: clock,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const result = handler(url, calls.length);
    if (result === "throw") throw new TypeError("network down");
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status,
      headers: { "content-type": "application/json", ...(result.headers ?? {}) },
    });
  }) as typeof fetch;
  const client = new ManaClient({
    baseUrl: base,
    studioId: "studio-1",
    apiKey: KEY,
    fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    ...options,
  });
  return { client, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

const usersUrl = (page: number) => `${base}/api/v1/studios/studio-1/users?pageIndex=${page}&pageSize=100`;

describe("ManaClient", () => {
  it("only ever sends GET requests, with the key in the Authorization header", async () => {
    const { client, calls } = setup((url) => ({
      status: 200,
      body: url.includes("/user-memberships") ? fixture("user-memberships-a") : fixture("users-page-1"),
    }));
    await client.getUsersPage(usersUrl(1));
    await client.getUserMemberships("user-a");
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.every((c) => c.headers.Authorization === `Bearer ${KEY}`)).toBe(true);
  });

  it("starts at the first page of people and returns the next link", async () => {
    const { client, calls } = setup(() => ({ status: 200, body: fixture("users-page-0") }));
    const page = await client.getUsersPage(null);
    expect(calls[0].url).toBe(
      "https://www.getmana.app/api/v1/studios/studio-1/users?pageSize=100&pageIndex=0",
    );
    expect(page.items.map((u) => u.userId)).toEqual(["user-a", "user-b", "user-c"]);
    expect(page.next).toBe(usersUrl(1));
    expect(page.total).toBe(5);
  });

  it("keeps at least the minimum gap between requests", async () => {
    const { client, calls } = setup(() => ({ status: 200, body: fixture("users-page-1") }), { minIntervalMs: 1100 });
    await client.getUsersPage(usersUrl(1));
    await client.getUsersPage(usersUrl(1));
    await client.getUsersPage(usersUrl(1));
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    expect(gaps.every((g) => g >= 1100)).toBe(true);
  });

  it("honours a gap from an earlier step", async () => {
    let clock = 5_000;
    const sleeps: number[] = [];
    const client = new ManaClient({
      baseUrl: base,
      studioId: "studio-1",
      apiKey: KEY,
      lastRequestAt: 4_800, // 200 ms ago
      fetchFn: (async () => new Response(JSON.stringify(fixture("users-page-1")), { status: 200 })) as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    });
    await client.getUsersPage(usersUrl(1));
    expect(sleeps).toEqual([900]);
  });

  it("waits as long as Retry-After says on a 429, then succeeds", async () => {
    const { client, calls, sleeps } = setup((_url, n) =>
      n === 1 ? { status: 429, headers: { "retry-after": "7" } } : { status: 200, body: fixture("users-page-1") },
    );
    const page = await client.getUsersPage(usersUrl(1));
    expect(page.items).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(sleeps).toContain(7000);
  });

  it("backs off with growing pauses on 429 without Retry-After, and gives up after the retries", async () => {
    const { client, calls, sleeps } = setup(() => ({ status: 429 }), { maxRetries: 3 });
    await expect(client.getUsersPage(usersUrl(1))).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toHaveLength(4); // the first try and three retries
    expect(sleeps.filter((s) => s >= 2000)).toEqual([2000, 4000, 8000]);
  });

  it("retries server errors and network failures, which are safe for a read", async () => {
    const { client, calls } = setup((_url, n) => {
      if (n === 1) return { status: 502 };
      if (n === 2) return "throw";
      return { status: 200, body: fixture("users-page-1") };
    });
    await client.getUsersPage(usersUrl(1));
    expect(calls).toHaveLength(3);
  });

  it("does not retry a refused key, and says so without leaking it", async () => {
    const { client, calls } = setup(() => ({ status: 401, body: { error: { code: "unauthorized" } } }));
    const error = await client.getUsersPage(usersUrl(1)).catch((e) => e);
    expect(error).toBeInstanceOf(ManaError);
    expect(error.code).toBe("auth");
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(error)).not.toContain(KEY);
    expect(error.message).not.toContain(KEY);
  });

  it("waits out a 401 once after the key has worked, since Mana's spent budget looks like a dead key", async () => {
    const { client, calls, sleeps } = setup((_url, n) => (n === 2 ? { status: 401 } : { status: 200, body: fixture("users-page-1") }));
    await client.getUsersPage(usersUrl(1));
    await client.getUsersPage(usersUrl(1));
    expect(calls).toHaveLength(3);
    expect(sleeps).toContain(30_000);
  });

  it("calls a 401 that stays after the wait rate limited, not a refused key", async () => {
    const { client, calls } = setup(() => ({ status: 401 }), { keyWorked: true });
    await expect(client.getUsersPage(usersUrl(1))).rejects.toMatchObject({ code: "rate_limited", details: { status: 401 } });
    expect(calls).toHaveLength(2);
  });

  it("leaves a long Retry-After to the caller instead of holding the request open", async () => {
    const { client, calls, sleeps } = setup(() => ({ status: 429, headers: { "retry-after": "600" } }));
    await expect(client.getUsersPage(usersUrl(1))).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toHaveLength(1);
    expect(sleeps.filter((s) => s > 1100)).toEqual([]);
  });

  it("does not retry other client errors", async () => {
    const { client, calls } = setup(() => ({ status: 404 }));
    await expect(client.getUserMemberships("gone")).rejects.toMatchObject({ code: "api", details: { status: 404 } });
    expect(calls).toHaveLength(1);
  });

  it("follows the next link until there is none, when reading a person's memberships", async () => {
    const first = fixture("user-memberships-a");
    first.links.next = `${base}/api/v1/studios/studio-1/user-memberships?page=2`;
    const second = fixture("user-memberships-b");
    const { client, calls } = setup((url) => ({ status: 200, body: url.includes("page=2") ? second : first }));
    const items = await client.getUserMemberships("user-a");
    expect(items.map((m) => m.id)).toEqual(["um-a1", "um-a2", "um-b1"]);
    expect(calls).toHaveLength(2);
  });

  it("refuses to follow a link that leaves Mana, so the key never goes elsewhere", async () => {
    const page = fixture("users-page-0");
    const { client, calls } = setup(() => ({ status: 200, body: page }));
    await expect(client.getUsersPage("https://evil.example/steal")).rejects.toMatchObject({ code: "contract" });
    expect(calls).toHaveLength(0);
  });

  it("never puts the key in any error message", async () => {
    for (const status of [401, 403, 404, 429, 500]) {
      const { client } = setup(() => ({ status }), { maxRetries: 0 });
      const error = await client.getUsersPage(usersUrl(1)).catch((e) => e);
      expect(String(error.message)).not.toContain(KEY);
    }
    const { client } = setup(() => "throw", { maxRetries: 0 });
    expect(String((await client.getUsersPage(usersUrl(1)).catch((e) => e)).message)).not.toContain(KEY);
  });
});

describe("response contracts", () => {
  it("accepts the recorded shapes, including fields we ignore", async () => {
    const { client } = setup(() => ({ status: 200, body: fixture("user-memberships-a") }));
    const items = await client.getUserMemberships("user-a");
    expect(items).toHaveLength(2);
    expect(items[1].pendingChange).toMatchObject({ kind: "cancel" });
  });

  it("fails loudly, naming the field, when a field we rely on is renamed", async () => {
    const page = fixture("users-page-0");
    page.data.items[0].userId = undefined;
    page.data.items[0].id = "x";
    const { client } = setup(() => ({ status: 200, body: page }));
    const error = await client.getUsersPage(null).catch((e) => e);
    expect(error).toMatchObject({ code: "contract" });
    expect(error.message).toContain("data.items.0.userId");
  });

  it("fails loudly on a membership status it does not know", async () => {
    const page = fixture("user-memberships-a");
    page.data.items[0].status = "paused";
    const { client } = setup(() => ({ status: 200, body: page }));
    const error = await client.getUserMemberships("user-a").catch((e) => e);
    expect(error).toMatchObject({ code: "contract" });
    expect(error.message).toContain("status");
  });

  it("fails loudly when a price changes type, without printing values", async () => {
    const page = fixture("user-memberships-a");
    page.data.items[0].price.amount = "149,50";
    const { client } = setup(() => ({ status: 200, body: page }));
    const error = await client.getUserMemberships("user-a").catch((e) => e);
    expect(error).toMatchObject({ code: "contract" });
    expect(error.message).not.toContain("149,50");
  });

  it("fails loudly when the response is not the expected envelope", async () => {
    const { client } = setup(() => ({ status: 200, body: { oops: true } }));
    await expect(client.getUsersPage(null)).rejects.toMatchObject({ code: "contract" });
  });
});
