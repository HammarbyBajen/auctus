import { describe, expect, it } from "vitest";
import { canonical, diffSpecs, specHash, specLines } from "@/lib/mana/api-watch";

const spec = (membershipFields: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  openapi: "3.0.0",
  info: { title: "Mana", version: "alpha" },
  paths: {
    "/api/v1/studios/{studioId}/user-memberships": {
      get: {
        description: "Memberships",
        parameters: [
          { name: "studioId", in: "path", required: true, schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { items: { type: "array", items: { type: "object", required: ["id"], properties: membershipFields } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/friends": { get: { responses: { "200": { description: "Friends" } } } },
    ...extra,
  },
});

const fields = {
  id: { type: "string" },
  status: { type: "string", enum: ["active", "ended", "future"] },
  pendingChange: { type: "object", nullable: true, properties: { kind: { type: "string", enum: ["cancel", "freeze"] } } },
};

describe("specLines", () => {
  it("lists endpoints, parameters and nested response fields with type, values, nullable and required", () => {
    const lines = specLines(spec(fields));
    const um = "GET /api/v1/studios/{studioId}/user-memberships";
    expect(lines).toContain(um);
    expect(lines).toContain("GET /api/v1/friends");
    expect(lines).toContain(`${um} · param path studioId: string required`);
    expect(lines).toContain(`${um} · param query status: string`);
    expect(lines).toContain(`${um} · 200 application/json data.items[].id: string required`);
    expect(lines).toContain(`${um} · 200 application/json data.items[].status: string [active|ended|future]`);
    expect(lines).toContain(`${um} · 200 application/json data.items[].pendingChange: object nullable`);
    expect(lines).toContain(`${um} · 200 application/json data.items[].pendingChange.kind: string [cancel|freeze]`);
  });

  it("follows $ref and allOf", () => {
    const withRef = {
      openapi: "3.0.0",
      components: { schemas: { Price: { type: "object", properties: { amount: { type: "integer" } } } } },
      paths: { "/p": { get: { responses: { "200": { content: { "application/json": { schema: { allOf: [{ $ref: "#/components/schemas/Price" }] } } } } } } } },
    };
    expect(specLines(withRef)).toContain("GET /p · 200 application/json amount: integer");
  });

  it("refuses something that is not an OpenAPI spec", () => {
    expect(() => specLines({ hello: "world" })).toThrow();
  });
});

describe("hash and diff", () => {
  it("hashes content, not key order", () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(specHash({ a: 1, b: 2 })).toBe(specHash({ b: 2, a: 1 }));
  });

  it("finds nothing that matters when only the wording changed", () => {
    const reworded = spec(fields);
    reworded.paths["/api/v1/studios/{studioId}/user-memberships"].get.description = "Every membership";
    expect(diffSpecs(spec(fields), reworded)).toBeNull();
  });

  it("shows added and removed fields, and flags a change to an endpoint the sync reads", () => {
    const changed = spec({ ...fields, status: { type: "string", enum: ["active", "ended", "future", "paused"] }, endDate: { type: "string" } });
    const diff = diffSpecs(spec(fields), changed);
    const um = "GET /api/v1/studios/{studioId}/user-memberships · 200 application/json data.items[]";
    expect(diff?.removed).toEqual([`${um}.status: string [active|ended|future]`]);
    expect(diff?.added).toEqual([`${um}.endDate: string`, `${um}.status: string [active|ended|future|paused]`]);
    expect(diff?.touchesSync).toBe(true);
  });

  it("does not flag a new endpoint the sync does not read", () => {
    const diff = diffSpecs(spec(fields), spec(fields, { "/api/v1/news": { get: { responses: {} } } }));
    expect(diff).toEqual({ added: ["GET /api/v1/news"], removed: [], touchesSync: false });
  });
});

describe("what the watch covers", () => {
  it("covers every Mana endpoint the client reads", async () => {
    const { readFileSync } = await import("node:fs");
    const { syncEndpoints } = await import("@/lib/mana/api-watch");
    const read = [...readFileSync("src/lib/mana/client.ts", "utf8").matchAll(/studioUrl\("(\/[a-z-]+)"/g)].map((m) => `GET /api/v1/studios/{studioId}${m[1]}`);
    expect(read.length).toBeGreaterThan(0);
    for (const endpoint of read) expect(syncEndpoints, endpoint).toContain(endpoint);
  });
});
