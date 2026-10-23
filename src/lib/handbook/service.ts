import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/db";
import { handbookCategory, handbookPage, handbookVersion, studioSettings, user } from "@/db/schema";
import { cleanDocument, plainText, sameDocument } from "./document";

/**
 * Handbok (ticket 37): the studio's routines. Everyone on the staff reads;
 * owners and the people they choose write. Every save keeps a version, so
 * the history shows who changed what and when, and an earlier version can be
 * brought back. A removed routine is hidden, not erased.
 */

type Db = typeof defaultDb;

export class HandbookError extends Error {
  constructor(public code: "not_found" | "invalid" | "category_in_use") {
    super(code);
  }
}

/** Whether a person may write in Handbok: an owner, or someone the owners chose. */
export async function canEditHandbook(db: Db, me: { id: string; studioId: string; role?: string | null }): Promise<boolean> {
  if (me.role === "owner") return true;
  const [row] = await db.select({ ids: studioSettings.handbookEditorIds }).from(studioSettings).where(eq(studioSettings.studioId, me.studioId)).limit(1);
  return (row?.ids ?? []).includes(me.id);
}

export async function getHandbookEditors(db: Db, studioId: string): Promise<string[]> {
  const [row] = await db.select({ ids: studioSettings.handbookEditorIds }).from(studioSettings).where(eq(studioSettings.studioId, studioId)).limit(1);
  return row?.ids ?? [];
}

export async function setHandbookEditors(db: Db, studioId: string, ids: string[]) {
  await db.update(studioSettings).set({ handbookEditorIds: [...new Set(ids)], updatedAt: new Date() }).where(eq(studioSettings.studioId, studioId));
}

// ---- Categories ----

export async function listCategories(db: Db, studioId: string) {
  return db.select().from(handbookCategory).where(eq(handbookCategory.studioId, studioId)).orderBy(asc(handbookCategory.position), asc(handbookCategory.name));
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 80);

export async function createCategory(db: Db, studioId: string, name: string) {
  const value = cleanName(name);
  if (!value) throw new HandbookError("invalid");
  const [last] = await db
    .select({ position: handbookCategory.position })
    .from(handbookCategory)
    .where(eq(handbookCategory.studioId, studioId))
    .orderBy(desc(handbookCategory.position))
    .limit(1);
  const [created] = await db.insert(handbookCategory).values({ studioId, name: value, position: (last?.position ?? -1) + 1 }).returning();
  return created;
}

export async function renameCategory(db: Db, studioId: string, id: string, name: string) {
  const value = cleanName(name);
  if (!value) throw new HandbookError("invalid");
  const [done] = await db
    .update(handbookCategory)
    .set({ name: value })
    .where(and(eq(handbookCategory.studioId, studioId), eq(handbookCategory.id, id)))
    .returning({ id: handbookCategory.id });
  if (!done) throw new HandbookError("not_found");
}

/** Moves a category one step up or down the list. */
export async function moveCategory(db: Db, studioId: string, id: string, direction: "up" | "down") {
  const list = await listCategories(db, studioId);
  const from = list.findIndex((c) => c.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= list.length) return;
  const order = [...list];
  [order[from], order[to]] = [order[to], order[from]];
  await db.transaction(async (tx) => {
    for (const [position, c] of order.entries()) await tx.update(handbookCategory).set({ position }).where(eq(handbookCategory.id, c.id));
  });
}

/** Removes an empty category. Routines removed earlier from it go with it, history and all. */
export async function deleteCategory(db: Db, studioId: string, id: string) {
  await db.transaction(async (tx) => {
    const [inUse] = await tx
      .select({ id: handbookPage.id })
      .from(handbookPage)
      .where(and(eq(handbookPage.studioId, studioId), eq(handbookPage.categoryId, id), isNull(handbookPage.deletedAt)))
      .limit(1);
    if (inUse) throw new HandbookError("category_in_use");
    await tx.delete(handbookPage).where(and(eq(handbookPage.studioId, studioId), eq(handbookPage.categoryId, id), isNotNull(handbookPage.deletedAt)));
    await tx.delete(handbookCategory).where(and(eq(handbookCategory.studioId, studioId), eq(handbookCategory.id, id)));
  });
}

// ---- Routines ----

export type PageInput = { title: string; categoryId: string; content: unknown };

const cleanTitle = (title: string) => title.trim().replace(/\s+/g, " ").slice(0, 150);

async function checkInput(db: Db, studioId: string, input: PageInput) {
  const title = cleanTitle(input.title);
  if (!title) throw new HandbookError("invalid");
  let content;
  try {
    content = cleanDocument(input.content);
  } catch {
    throw new HandbookError("invalid");
  }
  const [category] = await db
    .select({ id: handbookCategory.id })
    .from(handbookCategory)
    .where(and(eq(handbookCategory.studioId, studioId), eq(handbookCategory.id, input.categoryId)))
    .limit(1);
  if (!category) throw new HandbookError("invalid");
  return { title, content, text: plainText(content), categoryId: category.id };
}

export async function createPage(db: Db, studioId: string, authorId: string, input: PageInput) {
  const values = await checkInput(db, studioId, input);
  return db.transaction(async (tx) => {
    const [page] = await tx.insert(handbookPage).values({ studioId, ...values, createdById: authorId, updatedById: authorId }).returning();
    await tx.insert(handbookVersion).values({ studioId, pageId: page.id, title: values.title, content: values.content, text: values.text, createdById: authorId });
    return page;
  });
}

/** Saves a change, and keeps it as a version unless nothing changed. */
export async function updatePage(db: Db, studioId: string, id: string, authorId: string, input: PageInput, now: Date = new Date()) {
  const values = await checkInput(db, studioId, input);
  await db.transaction(async (tx) => {
    const [page] = await tx
      .select()
      .from(handbookPage)
      .where(and(eq(handbookPage.studioId, studioId), eq(handbookPage.id, id), isNull(handbookPage.deletedAt)))
      .limit(1);
    if (!page) throw new HandbookError("not_found");
    const sameText = page.title === values.title && sameDocument(page.content, values.content);
    if (sameText && page.categoryId === values.categoryId) return;
    await tx.update(handbookPage).set({ ...values, updatedAt: now, updatedById: authorId }).where(eq(handbookPage.id, id));
    // A move to another category is not a new version of the text.
    if (!sameText) {
      await tx.insert(handbookVersion).values({ studioId, pageId: id, title: values.title, content: values.content, text: values.text, createdById: authorId, createdAt: now });
    }
  });
}

export async function deletePage(db: Db, studioId: string, id: string, now: Date = new Date()) {
  const [done] = await db
    .update(handbookPage)
    .set({ deletedAt: now })
    .where(and(eq(handbookPage.studioId, studioId), eq(handbookPage.id, id), isNull(handbookPage.deletedAt)))
    .returning({ id: handbookPage.id });
  if (!done) throw new HandbookError("not_found");
}

const updatedBy = alias(user, "updated_by");

/** One routine, with who changed it last. */
export async function getPage(db: Db, studioId: string, id: string) {
  const [row] = await db
    .select({ page: handbookPage, category: handbookCategory.name, updatedByName: updatedBy.name })
    .from(handbookPage)
    .innerJoin(handbookCategory, eq(handbookCategory.id, handbookPage.categoryId))
    .leftJoin(updatedBy, eq(updatedBy.id, handbookPage.updatedById))
    .where(and(eq(handbookPage.studioId, studioId), eq(handbookPage.id, id), isNull(handbookPage.deletedAt)))
    .limit(1);
  return row ?? null;
}

export type PageListItem = { id: string; title: string; categoryId: string; updatedAt: Date; excerpt: string };

/** How much text a search hit shows around the word found. */
const excerptLength = 140;

function excerpt(text: string, query: string | null): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!query) return flat.slice(0, excerptLength);
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return flat.slice(0, excerptLength);
  // Start a little before the hit, at the beginning of a word.
  let start = Math.max(0, at - 40);
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    start = space >= 0 && space < at ? space + 1 : start;
  }
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + excerptLength)}`;
}

/**
 * The routines, by category; with a query, only those whose title or text
 * holds it (anywhere in a word, so "skåp" finds "omklädningsskåpet").
 */
export async function listPages(db: Db, studioId: string, query: string | null = null): Promise<PageListItem[]> {
  const q = query?.trim() || null;
  const pattern = q ? `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  // Lower case, with Å, Ä, Ö and É folded by hand: a database in the C locale leaves them as they are.
  const folded = (column: typeof handbookPage.title | typeof handbookPage.text) => sql`translate(lower(${column}), 'ÅÄÖÉÜ', 'åäöéü')`;
  const rows = await db
    .select({ id: handbookPage.id, title: handbookPage.title, categoryId: handbookPage.categoryId, updatedAt: handbookPage.updatedAt, text: handbookPage.text })
    .from(handbookPage)
    .where(
      and(
        eq(handbookPage.studioId, studioId),
        isNull(handbookPage.deletedAt),
        pattern ? or(sql`${folded(handbookPage.title)} like ${pattern}`, sql`${folded(handbookPage.text)} like ${pattern}`) : undefined,
      ),
    )
    .orderBy(sql`lower(${handbookPage.title})`);
  return rows.map(({ text, ...r }) => ({ ...r, excerpt: excerpt(text, q) }));
}

// ---- History ----

const versionBy = alias(user, "version_by");

/** Every saved version, newest first. */
export async function listVersions(db: Db, studioId: string, pageId: string) {
  return db
    .select({ id: handbookVersion.id, title: handbookVersion.title, createdAt: handbookVersion.createdAt, byName: versionBy.name })
    .from(handbookVersion)
    .leftJoin(versionBy, eq(versionBy.id, handbookVersion.createdById))
    .where(and(eq(handbookVersion.studioId, studioId), eq(handbookVersion.pageId, pageId)))
    .orderBy(desc(handbookVersion.createdAt));
}

export async function getVersion(db: Db, studioId: string, pageId: string, versionId: string) {
  const [row] = await db
    .select()
    .from(handbookVersion)
    .where(and(eq(handbookVersion.studioId, studioId), eq(handbookVersion.pageId, pageId), eq(handbookVersion.id, versionId)))
    .limit(1);
  return row ?? null;
}

/** Brings back an earlier version: saved as a new version, so nothing in between is lost. */
export async function restoreVersion(db: Db, studioId: string, pageId: string, versionId: string, authorId: string, now: Date = new Date()) {
  const version = await getVersion(db, studioId, pageId, versionId);
  const current = await getPage(db, studioId, pageId);
  if (!version || !current) throw new HandbookError("not_found");
  await updatePage(db, studioId, pageId, authorId, { title: version.title, categoryId: current.page.categoryId, content: version.content }, now);
}

