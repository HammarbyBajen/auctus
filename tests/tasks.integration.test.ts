import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("tasks and assignment", () => {
  const tag = `task-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let userA1: string;
  let userA2: string;
  let userB: string;
  let leads: typeof import("@/lib/leads/service");
  let tasks: typeof import("@/lib/tasks/service");
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let counter = 0;

  async function newLead(studioId = studioA) {
    counter += 1;
    const { lead } = await leads.createOrMatchLead(db, studioId, {
      name: `Person ${counter}`,
      email: `p${counter}-${tag}@example.test`,
      source: "manual",
    });
    return lead;
  }

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    leads = await import("@/lib/leads/service");
    tasks = await import("@/lib/tasks/service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    const rows = await db
      .insert(schema.studio)
      .values([
        { slug: `${tag}-a`, name: "A" },
        { slug: `${tag}-b`, name: "B" },
      ])
      .returning();
    studioA = rows[0].id;
    studioB = rows[1].id;
    await ensureDefaultPipeline(db, studioA);
    await ensureDefaultPipeline(db, studioB);
    userA1 = `${tag}-u1`;
    userA2 = `${tag}-u2`;
    userB = `${tag}-u3`;
    await db.insert(schema.user).values([
      { id: userA1, name: "Fredrik", email: `${tag}-1@example.test`, studioId: studioA },
      { id: userA2, name: "Timmy", email: `${tag}-2@example.test`, studioId: studioA },
      { id: userB, name: "Annan", email: `${tag}-3@example.test`, studioId: studioB },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(inArray(schema.lead.studioId, [studioA, studioB]));
    await db.delete(schema.person).where(inArray(schema.person.studioId, [studioA, studioB]));
    await db.delete(schema.user).where(inArray(schema.user.id, [userA1, userA2, userB]));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("creates a task with a title and due date that belongs to a lead and starts open", async () => {
    const lead = await newLead();
    const created = await tasks.createTask(db, studioA, lead.id, { title: "  Ring på torsdag ", dueDate: "2026-10-15" }, userA1);
    expect(created.title).toBe("Ring på torsdag");
    expect(created.dueDate).toBe("2026-10-15");
    expect(created.leadId).toBe(lead.id);
    expect(created.doneAt).toBeNull();
  });

  it("lists open tasks soonest first, then finished tasks", async () => {
    const lead = await newLead();
    const late = await tasks.createTask(db, studioA, lead.id, { title: "Sent", dueDate: "2026-10-20" }, null);
    const early = await tasks.createTask(db, studioA, lead.id, { title: "Tidigt", dueDate: "2026-10-10" }, null);
    const finished = await tasks.createTask(db, studioA, lead.id, { title: "Klar", dueDate: "2026-10-05" }, null);
    await tasks.setTaskDone(db, studioA, finished.id, true, userA1);
    const { open, done } = await tasks.listTasksForLead(db, studioA, lead.id);
    expect(open.map((t) => t.id)).toEqual([early.id, late.id]);
    expect(done.map((t) => t.id)).toEqual([finished.id]);
    expect(done[0].doneByName).toBe("Fredrik");
  });

  it("marks a task done and reopens it", async () => {
    const lead = await newLead();
    const created = await tasks.createTask(db, studioA, lead.id, { title: "X", dueDate: "2026-10-12" }, null);
    expect((await tasks.setTaskDone(db, studioA, created.id, true, userA1)).doneAt).toBeInstanceOf(Date);
    const reopened = await tasks.setTaskDone(db, studioA, created.id, false, userA1);
    expect(reopened.doneAt).toBeNull();
    expect(reopened.doneById).toBeNull();
  });

  it("counts open and overdue tasks per lead as of today", async () => {
    const lead = await newLead();
    await tasks.createTask(db, studioA, lead.id, { title: "Försenad", dueDate: "2026-10-08" }, null);
    await tasks.createTask(db, studioA, lead.id, { title: "Idag", dueDate: "2026-10-09" }, null);
    await tasks.createTask(db, studioA, lead.id, { title: "Senare", dueDate: "2026-10-11" }, null);
    const doneOverdue = await tasks.createTask(db, studioA, lead.id, { title: "Redan klar", dueDate: "2026-10-01" }, null);
    await tasks.setTaskDone(db, studioA, doneOverdue.id, true, null);

    const row = (await leads.listLeads(db, studioA, "2026-10-09")).find((r) => r.lead.id === lead.id);
    expect(row?.openTasks).toBe(3);
    expect(row?.overdueTasks).toBe(1);
    // The same tasks a day later: "idag" has become overdue.
    const later = (await leads.listLeads(db, studioA, "2026-10-10")).find((r) => r.lead.id === lead.id);
    expect(later?.overdueTasks).toBe(2);
  });

  it("deletes a task", async () => {
    const lead = await newLead();
    const created = await tasks.createTask(db, studioA, lead.id, { title: "Bort", dueDate: "2026-10-12" }, null);
    await tasks.deleteTask(db, studioA, created.id);
    expect((await tasks.listTasksForLead(db, studioA, lead.id)).open).toHaveLength(0);
  });

  it("leaves a lead unassigned by default, and assigns and unassigns on request", async () => {
    const lead = await newLead();
    expect(lead.assignedToId).toBeNull();
    const assigned = await tasks.assignLead(db, studioA, lead.id, userA2);
    expect(assigned.assignedToId).toBe(userA2);
    expect((await leads.getLead(db, studioA, lead.id))?.assigneeName).toBe("Timmy");
    expect((await leads.listLeads(db, studioA)).find((r) => r.lead.id === lead.id)?.assigneeName).toBe("Timmy");
    const cleared = await tasks.assignLead(db, studioA, lead.id, null);
    expect(cleared.assignedToId).toBeNull();
  });

  it("only offers people from the same studio, and refuses to assign someone else's", async () => {
    const users = await tasks.listStudioUsers(db, studioA);
    expect(users.map((u) => u.name)).toEqual(["Fredrik", "Timmy"]);
    const lead = await newLead();
    await expect(tasks.assignLead(db, studioA, lead.id, userB)).rejects.toMatchObject({ code: "user_not_found" });
  });

  it("keeps studios apart for tasks and assignment", async () => {
    const leadB = await newLead(studioB);
    const taskB = await tasks.createTask(db, studioB, leadB.id, { title: "B", dueDate: "2026-10-12" }, null);
    await expect(
      tasks.createTask(db, studioA, leadB.id, { title: "Nej", dueDate: "2026-10-12" }, null),
    ).rejects.toMatchObject({ code: "lead_not_found" });
    await expect(tasks.setTaskDone(db, studioA, taskB.id, true, null)).rejects.toMatchObject({ code: "task_not_found" });
    await expect(tasks.deleteTask(db, studioA, taskB.id)).rejects.toMatchObject({ code: "task_not_found" });
    await expect(tasks.assignLead(db, studioA, leadB.id, userA1)).rejects.toMatchObject({ code: "lead_not_found" });
    expect((await tasks.listTasksForLead(db, studioB, leadB.id)).open).toHaveLength(1);
  });
});
