import { and, eq, inArray, like, desc } from "drizzle-orm";
import { db } from "@/db";
import { atRiskAlert, atRiskNote, lead, leadEvent, leadNote, manaMembership, manaPurchase, manaSignal, person, pipelineStage, task } from "@/db/schema";
import { todayInStockholm } from "@/lib/tasks/dates";

// Moves Mana's leads to Medlemmar (decided by Max, 2026-10-27: "Move all to Medlemmar").
// Each lead becomes a Medlemmar row (Har slutat, Dagpass, Klippkort...) with its notes, logged contacts and tasks
// carried over as notes, its owner kept; then the lead is removed and the "Från Mana" column with it.
// People are kept. One transaction: all or nothing. DRY=1 counts without writing.
// To run: copy to scripts/, then run with the database's env loaded and NODE_OPTIONS="--conditions=react-server".
const causeOf: Record<string, string> = {
  mana_ended: "ended",
  mana_win_back: "ended",
  mana_day_pass: "day_pass",
  mana_klippkort: "klippkort",
  mana_cancelled: "cancelling",
  mana_freeze: "freezing",
};
const contactKind: Record<string, string> = { called: "answered", booked: "answered", no_answer: "no_answer", emailed: "messaged" };
const dry = process.env.DRY === "1";

(async () => {
  const counts = { leads: 0, rows: 0, joined: 0, notes: 0, contacts: 0, tasks: 0, stageRemoved: 0 };
  await db.transaction(async (tx) => {
    const found = await tx
      .select({ lead, manaUserId: person.manaUserId, stageKind: pipelineStage.kind })
      .from(lead)
      .innerJoin(person, eq(person.id, lead.personId))
      .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)))
      .where(like(lead.source, "mana_%"))
      .orderBy(lead.createdAt);
    for (const { lead: l, manaUserId, stageKind } of found) {
      const cause = causeOf[l.source];
      if (!cause || !manaUserId) throw new Error(`cannot move a lead: source ${l.source}, linked to Mana: ${Boolean(manaUserId)}`);
      counts.leads++;

      // The day on the row: the last day of an ended membership, the day a day pass was bought.
      const [signal] = await tx.select().from(manaSignal).where(eq(manaSignal.leadId, l.id)).limit(1);
      let changeDate: string | null = null;
      if (cause === "ended" && signal) {
        const [m] = await tx.select().from(manaMembership).where(and(eq(manaMembership.studioId, l.studioId), eq(manaMembership.id, signal.manaRef))).limit(1);
        changeDate = m?.pendingChangeKind === "cancel" ? m.pendingChangeDate : null;
      }
      if (cause === "day_pass") {
        const [p] = await tx.select().from(manaPurchase).where(and(eq(manaPurchase.studioId, l.studioId), eq(manaPurchase.manaUserId, manaUserId))).orderBy(desc(manaPurchase.paidAt)).limit(1);
        changeDate = p ? todayInStockholm(p.paidAt) : null;
      }
      const status = stageKind === "won" ? "resolved" : stageKind === "cold" ? "dismissed" : "open";

      // One open row per member and kind: a lead for someone already on the list joins their row.
      const [open] =
        status === "open"
          ? await tx
              .select({ id: atRiskAlert.id })
              .from(atRiskAlert)
              .where(and(eq(atRiskAlert.studioId, l.studioId), eq(atRiskAlert.manaUserId, manaUserId), eq(atRiskAlert.cause, cause), eq(atRiskAlert.status, "open")))
              .limit(1)
          : [];
      let alertId = open?.id;
      if (alertId) counts.joined++;
      else {
        [{ id: alertId }] = await tx
          .insert(atRiskAlert)
          .values({
            studioId: l.studioId,
            manaUserId,
            cause,
            changeDate,
            status,
            createdAt: l.createdAt,
            assignedToId: l.assignedToId,
            handledAt: status === "open" ? null : l.updatedAt,
          })
          .returning({ id: atRiskAlert.id });
        counts.rows++;
      }

      const base = { studioId: l.studioId, manaUserId, alertId };
      for (const n of await tx.select().from(leadNote).where(eq(leadNote.leadId, l.id)).orderBy(leadNote.createdAt)) {
        const fromMana = n.authorId === null && n.body.startsWith("Mana: ");
        await tx.insert(atRiskNote).values({
          ...base,
          kind: fromMana ? "mana" : "note",
          body: fromMana ? n.body.replace(/^Mana: /, "").replace(/Credit bundle: /, "") : n.body,
          private: n.private,
          createdAt: n.createdAt,
          createdById: n.authorId,
        });
        counts.notes++;
      }
      for (const e of await tx.select().from(leadEvent).where(and(eq(leadEvent.leadId, l.id), eq(leadEvent.type, "contact_logged")))) {
        await tx.insert(atRiskNote).values({ ...base, kind: contactKind[e.outcome ?? ""] ?? "note", body: "", createdAt: e.createdAt, createdById: e.authorId });
        counts.contacts++;
      }
      for (const tk of await tx.select().from(task).where(eq(task.leadId, l.id))) {
        await tx.insert(atRiskNote).values({ ...base, kind: "note", body: `Uppgift: ${tk.title} (${tk.dueDate}${tk.doneAt ? ", klar" : ""})`, createdAt: tk.createdAt });
        counts.tasks++;
      }
    }

    if (found.length > 0) await tx.delete(lead).where(inArray(lead.id, found.map((f) => f.lead.id)));
    const left = await tx.select({ id: lead.id }).from(lead).where(eq(lead.stage, "from_mana")).limit(1);
    if (left.length === 0) counts.stageRemoved = (await tx.delete(pipelineStage).where(eq(pipelineStage.key, "from_mana")).returning()).length;
    if (dry) throw new Error("dry run");
  }).catch((e) => {
    if (e.message !== "dry run") throw e;
  });
  console.log(JSON.stringify({ dry, ...counts }));
  process.exit(0);
})().catch((e) => {
  console.log("error:", String(e.message).slice(0, 300));
  process.exit(1);
});
