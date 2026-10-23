import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe.skipIf(!hasDb)("Handbok (ticket 37)", () => {
  const tag = `hb-${Date.now()}`;
  let studioId: string;
  let otherStudio: string;
  const ownerId = `${tag}-owner`;
  const staffId = `${tag}-staff`;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let hb: typeof import("@/lib/handbook/service");

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    hb = await import("@/lib/handbook/service");
    const studios = await db.insert(schema.studio).values([{ slug: tag, name: "HB" }, { slug: `${tag}-b`, name: "HB B" }]).returning();
    [studioId, otherStudio] = studios.map((s) => s.id);
    await db.insert(schema.studioSettings).values([{ studioId }, { studioId: otherStudio }]);
    await db.insert(schema.user).values([
      { id: ownerId, name: "Ägare", email: `${ownerId}@example.test`, emailVerified: true, role: "owner", studioId },
      { id: staffId, name: "Coach", email: `${staffId}@example.test`, emailVerified: true, role: "staff", studioId },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.handbookPage).where(eq(schema.handbookPage.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.studioId, studioId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await db.delete(schema.studio).where(eq(schema.studio.id, otherStudio));
    await pool.end();
  });

  it("lets owners write, and staff only when the owners chose them", async () => {
    const owner = { id: ownerId, studioId, role: "owner" };
    const staff = { id: staffId, studioId, role: "staff" };
    expect(await hb.canEditHandbook(db, owner)).toBe(true);
    expect(await hb.canEditHandbook(db, staff)).toBe(false);
    await hb.setHandbookEditors(db, studioId, [staffId]);
    expect(await hb.canEditHandbook(db, staff)).toBe(true);
    await hb.setHandbookEditors(db, studioId, []);
    expect(await hb.canEditHandbook(db, staff)).toBe(false);
  });

  it("keeps a version for every change, and can bring an earlier one back", async () => {
    const cat = await hb.createCategory(db, studioId, "  Öppna   och stänga ");
    expect(cat.name).toBe("Öppna och stänga");
    const page = await hb.createPage(db, studioId, ownerId, { title: "Stänga", categoryId: cat.id, content: doc("Släck lamporna") });
    await hb.updatePage(db, studioId, page.id, staffId, { title: "Stänga", categoryId: cat.id, content: doc("Släck lamporna och lås") }, new Date(Date.now() + 1000));
    // Saving without a change makes no version.
    await hb.updatePage(db, studioId, page.id, staffId, { title: "Stänga", categoryId: cat.id, content: doc("Släck lamporna och lås") }, new Date(Date.now() + 2000));
    const versions = await hb.listVersions(db, studioId, page.id);
    expect(versions.map((v) => v.byName)).toEqual(["Coach", "Ägare"]);
    const found = await hb.getPage(db, studioId, page.id);
    expect(found).toMatchObject({ category: "Öppna och stänga", updatedByName: "Coach" });
    expect(found?.page.text).toBe("Släck lamporna och lås");

    await hb.restoreVersion(db, studioId, page.id, versions[1].id, ownerId, new Date(Date.now() + 3000));
    expect((await hb.getPage(db, studioId, page.id))?.page.text).toBe("Släck lamporna");
    expect(await hb.listVersions(db, studioId, page.id)).toHaveLength(3);
  });

  it("finds routines by any part of a word, in the title or the text, and not another studio's", async () => {
    const [cat] = await hb.listCategories(db, studioId);
    await hb.createPage(db, studioId, ownerId, { title: "Ny medlem", categoryId: cat.id, content: doc("Visa omklädningsskåpen och 100% av passen") });
    expect((await hb.listPages(db, studioId, "skåp")).map((p) => p.title)).toEqual(["Ny medlem"]);
    expect((await hb.listPages(db, studioId, "STÄNG")).map((p) => p.title)).toEqual(["Stänga"]);
    // % and _ are searched for as written.
    expect((await hb.listPages(db, studioId, "100%")).map((p) => p.title)).toEqual(["Ny medlem"]);
    expect(await hb.listPages(db, studioId, "_")).toEqual([]);
    expect(await hb.listPages(db, otherStudio, "skåp")).toEqual([]);
    const [hit] = await hb.listPages(db, studioId, "skåp");
    expect(hit.excerpt).toContain("omklädningsskåpen");
  });

  it("refuses a category from another studio, and an empty title", async () => {
    const other = await hb.createCategory(db, otherStudio, "Annan");
    await expect(hb.createPage(db, studioId, ownerId, { title: "X", categoryId: other.id, content: doc("x") })).rejects.toThrow("invalid");
    const [cat] = await hb.listCategories(db, studioId);
    await expect(hb.createPage(db, studioId, ownerId, { title: "  ", categoryId: cat.id, content: doc("x") })).rejects.toThrow("invalid");
  });

  it("removes a routine from the list but keeps it, and removes a category only when it is empty", async () => {
    const [cat] = await hb.listCategories(db, studioId);
    await expect(hb.deleteCategory(db, studioId, cat.id)).rejects.toThrow("category_in_use");
    for (const p of await hb.listPages(db, studioId)) await hb.deletePage(db, studioId, p.id);
    expect(await hb.listPages(db, studioId)).toEqual([]);
    expect(await db.select().from(schema.handbookPage).where(eq(schema.handbookPage.studioId, studioId))).toHaveLength(2);
    await hb.deleteCategory(db, studioId, cat.id);
    expect(await hb.listCategories(db, studioId)).toEqual([]);
    expect(await db.select().from(schema.handbookPage).where(eq(schema.handbookPage.studioId, studioId))).toHaveLength(0);
  });

  it("moves categories up and down", async () => {
    const a = await hb.createCategory(db, studioId, "A");
    const b = await hb.createCategory(db, studioId, "B");
    await hb.moveCategory(db, studioId, b.id, "up");
    expect((await hb.listCategories(db, studioId)).map((c) => c.name)).toEqual(["B", "A"]);
    await hb.moveCategory(db, studioId, b.id, "up");
    expect((await hb.listCategories(db, studioId)).map((c) => c.name)).toEqual(["B", "A"]);
    await hb.deleteCategory(db, studioId, a.id);
    await hb.deleteCategory(db, studioId, b.id);
  });
});
