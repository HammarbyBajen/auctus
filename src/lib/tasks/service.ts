import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { lead, task, user } from "@/db/schema";

type Db = typeof defaultDb;

export class TaskError extends Error {
  constructor(public code: "lead_not_found" | "task_not_found" | "user_not_found") {
    super(code);
  }
}

async function requireLead(db: Db, studioId: string, leadId: string) {
  const [found] = await db
    .select({ id: lead.id })
    .from(lead)
    .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)))
    .limit(1);
  if (!found) throw new TaskError("lead_not_found");
}

export async function createTask(
  db: Db,
  studioId: string,
  leadId: string,
  input: { title: string; dueDate: string },
  createdById: string | null,
) {
  await requireLead(db, studioId, leadId);
  const [created] = await db
    .insert(task)
    .values({ studioId, leadId, title: input.title.trim(), dueDate: input.dueDate, createdById })
    .returning();
  return created;
}

/** Marks a task done (or open again). */
export async function setTaskDone(
  db: Db,
  studioId: string,
  taskId: string,
  done: boolean,
  userId: string | null,
) {
  const [updated] = await db
    .update(task)
    .set(done ? { doneAt: new Date(), doneById: userId } : { doneAt: null, doneById: null })
    .where(and(eq(task.studioId, studioId), eq(task.id, taskId)))
    .returning();
  if (!updated) throw new TaskError("task_not_found");
  return updated;
}

export async function deleteTask(db: Db, studioId: string, taskId: string) {
  const deleted = await db
    .delete(task)
    .where(and(eq(task.studioId, studioId), eq(task.id, taskId)))
    .returning({ id: task.id });
  if (deleted.length === 0) throw new TaskError("task_not_found");
}

/** Open tasks first (soonest due first), then the finished ones (latest first). */
export async function listTasksForLead(db: Db, studioId: string, leadId: string) {
  // A query builder is single-use, so each list gets its own.
  const query = () =>
    db
      .select({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        doneAt: task.doneAt,
        doneByName: user.name,
      })
      .from(task)
      .leftJoin(user, eq(user.id, task.doneById));
  const [open, done] = await Promise.all([
    query()
      .where(and(eq(task.studioId, studioId), eq(task.leadId, leadId), isNull(task.doneAt)))
      .orderBy(asc(task.dueDate), asc(task.createdAt)),
    query()
      .where(and(eq(task.studioId, studioId), eq(task.leadId, leadId), isNotNull(task.doneAt)))
      .orderBy(desc(task.doneAt)),
  ]);
  return { open, done };
}

/** People who can be given a lead: everyone with an account in the studio. */
export async function listStudioUsers(db: Db, studioId: string) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.studioId, studioId))
    .orderBy(asc(user.name));
}

/** Gives a lead to a person, or to nobody (null). The person must belong to the same studio. */
export async function assignLead(db: Db, studioId: string, leadId: string, userId: string | null) {
  await requireLead(db, studioId, leadId);
  if (userId) {
    const [found] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.studioId, studioId)))
      .limit(1);
    if (!found) throw new TaskError("user_not_found");
  }
  const [updated] = await db
    .update(lead)
    .set({ assignedToId: userId, updatedAt: new Date() })
    .where(eq(lead.id, leadId))
    .returning();
  return updated;
}
