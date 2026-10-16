import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("lead intake", () => {
  const tag = `intake-${Date.now()}`;
  let studioId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let intake: typeof import("@/lib/intake/service");
  let POST: (request: Request) => Promise<Response>;
  const email = (n: string) => `${n}-${tag}@example.test`;
  const post = (body: unknown, secret = "test-secret") =>
    POST(
      new Request("http://localhost:3000/api/leads/intake", {
        method: "POST",
        headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    intake = await import("@/lib/intake/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Intake" }).returning();
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioId);
    process.env.LEAD_INTAKE_SECRET = "test-secret";
    process.env.LEAD_INTAKE_STUDIO = tag;
    ({ POST } = await import("@/app/api/leads/intake/route"));
  });

  afterAll(async () => {
    await db.delete(schema.leadSubmission).where(eq(schema.leadSubmission.studioId, studioId));
    await db.delete(schema.intakeRejection).where(eq(schema.intakeRejection.studioId, studioId));
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("refuses requests without the right secret, bad JSON and an invalid body", async () => {
    expect((await post({ id: "x" }, "")).status).toBe(401);
    expect((await post({ id: "x" }, "wrong")).status).toBe(401);
    expect((await post("{not json")).status).toBe(400);
    const invalid = await post({ id: "x", route: "contact", name: "Anna" });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).issues[0].path).toBe("email");
  });

  it("notes each call it turned away and why, never what it said", async () => {
    const rejected = await intake.recentRejections(db, studioId);
    // Newest first: the invalid body, bad JSON, the wrong secret, no secret.
    expect(rejected.map((r) => [r.reason, r.detail, r.route])).toEqual([
      ["invalid_payload", null, "contact"],
      ["invalid_json", null, null],
      ["unauthorized", "wrong", null],
      ["unauthorized", "missing", null],
    ]);
    expect(rejected[0].issues).toEqual([{ path: "email", message: "email or phone is required" }]);
    // Nothing the sender wrote is kept.
    expect(JSON.stringify(rejected)).not.toContain("Anna");
    const malformed = await POST(new Request("http://localhost:3000/api/leads/intake", { method: "POST", headers: { authorization: "test-secret", "user-agent": "node" }, body: "{}" }));
    expect(malformed.status).toBe(401);
    const [latest] = await intake.recentRejections(db, studioId, 1);
    expect([latest.detail, latest.userAgent]).toEqual(["malformed", "node"]);
  });

  it("keeps only the latest 200 turned-away calls, since anyone can call the address", async () => {
    const start = Date.now() + 60_000;
    for (let i = 0; i < intake.keptRejections + 3; i++) {
      await intake.recordRejection(db, studioId, { reason: "too_large", bytes: i }, new Date(start + i * 1000));
    }
    const kept = await intake.recentRejections(db, studioId, 1000);
    expect(kept).toHaveLength(intake.keptRejections);
    // The newest stay, the oldest went.
    expect(kept[0].bytes).toBe(intake.keptRejections + 2);
    expect(kept.every((r) => r.reason === "too_large")).toBe(true);
  });

  it("creates a lead with its source, attribution and message, and a retry changes nothing", async () => {
    const body = {
      id: `${tag}-1`,
      route: "qualification",
      name: "Anna Webb",
      email: email("anna"),
      message: "Vill börja träna",
      attribution: "facebook / paid · kampanj: Höst · fbclid: IwAR3x",
      answers: { mål: "Styrka" },
      submittedAt: "2026-10-13T08:00:00Z",
    };
    const first = await post(body);
    expect(first.status).toBe(201);
    const { leadId } = await first.json();
    const [row] = await db.select().from(schema.lead).where(eq(schema.lead.id, leadId));
    expect(row).toMatchObject({
      source: "qualification",
      stage: "new_lead",
      attribution: body.attribution,
      attributionParsed: { utmSource: "facebook", utmMedium: "paid", campaign: "Höst", clickIds: { fbclid: "IwAR3x" } },
      createdAt: new Date("2026-10-13T08:00:00Z"),
    });
    const notes = await db.select().from(schema.leadNote).where(eq(schema.leadNote.leadId, leadId));
    expect(notes.map((n) => n.body)).toEqual([`${intake.webNotePrefix} (qualification): Vill börja träna\nmål: Styrka`]);

    const retry = await post(body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ status: "already_received", leadId });
    expect(await db.select().from(schema.lead).where(eq(schema.lead.studioId, studioId))).toHaveLength(1);
  });

  it("adds a repeat from the same person to their lead instead of making a second", async () => {
    const res = await post({ id: `${tag}-2`, route: "chat", name: "Anna W", email: email("ANNA"), message: "Hej igen" });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("duplicate");
    expect(await db.select().from(schema.lead).where(eq(schema.lead.studioId, studioId))).toHaveLength(1);
  });

  it("keeps test leads as submissions only, never as leads", async () => {
    const res = await post({ id: `${tag}-3`, route: "contact", name: "Testlead Erik", email: email("erik") });
    expect(await res.json()).toEqual({ status: "test" });
    expect(await db.select().from(schema.lead).where(eq(schema.lead.studioId, studioId))).toHaveLength(1);
    const recent = await intake.recentSubmissions(db, studioId);
    expect(recent.map((r) => r.outcome)).toEqual(["test", "duplicate", "created"]);
  });

  it("removes the stored submissions when the person is deleted on request", async () => {
    const { deletePerson } = await import("@/lib/privacy/service");
    const [p] = await db.select().from(schema.person).where(eq(schema.person.studioId, studioId));
    await deletePerson(db, studioId, p.id, null as never);
    const left = await db.select().from(schema.leadSubmission).where(eq(schema.leadSubmission.studioId, studioId));
    expect(left.map((s) => s.outcome)).toEqual(["test"]);
  });
});
