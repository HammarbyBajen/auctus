import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  lead,
  leadEvent,
  manaMember,
  manaMembership,
  person,
  pipelineStage,
  studioSettings,
  syncRun,
} from "@/db/schema";
import { moveLeadStage } from "@/lib/leads/service";
import { normalizeEmail, normalizePhone } from "@/lib/leads/matching";
import { todayInStockholm } from "@/lib/tasks/dates";
import { autoWinMembership, countingMemberships, pickManaMatch } from "./membership";
import { replaceMemberships, upsertMembers, type ManaSource } from "./sync";

type Db = typeof defaultDb;

export async function getIgnoredMembershipIds(db: Db, studioId: string): Promise<string[]> {
  const [row] = await db
    .select({ ids: studioSettings.ignoredMembershipIds })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  return row?.ids ?? [];
}

/** Links a CRM person to their Mana person (email first, then a phone only one person has). */
export async function matchPerson(db: Db, studioId: string, personId: string): Promise<string | null> {
  const [p] = await db
    .select()
    .from(person)
    .where(and(eq(person.studioId, studioId), eq(person.id, personId)))
    .limit(1);
  if (!p) return null;
  const byEmail = p.emailNormalized
    ? await db
        .select({ manaUserId: manaMember.manaUserId })
        .from(manaMember)
        .where(and(eq(manaMember.studioId, studioId), eq(manaMember.emailNormalized, p.emailNormalized)))
    : [];
  const byPhone = p.phoneNormalized
    ? await db
        .select({ manaUserId: manaMember.manaUserId })
        .from(manaMember)
        .where(and(eq(manaMember.studioId, studioId), eq(manaMember.phoneNormalized, p.phoneNormalized)))
    : [];
  const match = pickManaMatch(byEmail, byPhone)?.manaUserId ?? null;
  if (match !== p.manaUserId) {
    await db.update(person).set({ manaUserId: match }).where(eq(person.id, p.id));
  }
  return match;
}

/** Matches every person in the studio. Run after a sync. */
export async function matchAllPeople(db: Db, studioId: string) {
  const people = await db.select({ id: person.id }).from(person).where(eq(person.studioId, studioId));
  for (const p of people) await matchPerson(db, studioId, p.id);
}

/** The Mana person and their memberships, for showing on a lead. */
export async function getManaInfo(db: Db, studioId: string, manaUserId: string | null) {
  if (!manaUserId) return null;
  const [member] = await db
    .select()
    .from(manaMember)
    .where(and(eq(manaMember.studioId, studioId), eq(manaMember.manaUserId, manaUserId)))
    .limit(1);
  if (!member) return null;
  const memberships = await db
    .select()
    .from(manaMembership)
    .where(and(eq(manaMembership.studioId, studioId), eq(manaMembership.manaUserId, manaUserId)))
    .orderBy(asc(manaMembership.startDate));
  const ignored = await getIgnoredMembershipIds(db, studioId);
  return { member, memberships, ignored, counting: countingMemberships(memberships, ignored) };
}

/**
 * Moves a lead to Won by itself when its person has started a membership
 * since the lead came in (see `autoWinMembership`). Returns true when it did.
 */
export async function detectWonForLead(db: Db, studioId: string, leadId: string): Promise<boolean> {
  const [row] = await db
    .select({ lead, kind: pipelineStage.kind, manaUserId: person.manaUserId })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)))
    .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)))
    .limit(1);
  if (!row || !row.manaUserId) return false;

  const info = await getManaInfo(db, studioId, row.manaUserId);
  if (!info) return false;

  const wonStages = await db
    .select({ key: pipelineStage.key })
    .from(pipelineStage)
    .where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.kind, "won")))
    .orderBy(asc(pipelineStage.position));
  if (wonStages.length === 0) return false;

  const [earlier] = await db
    .select({ id: leadEvent.id })
    .from(leadEvent)
    .where(
      and(
        eq(leadEvent.leadId, leadId),
        eq(leadEvent.via, "mana"),
        inArray(
          leadEvent.toStage,
          wonStages.map((s) => s.key),
        ),
      ),
    )
    .limit(1);

  const winner = autoWinMembership({
    stageKind: row.kind as "open" | "won" | "cold",
    leadCreatedDay: todayInStockholm(row.lead.createdAt),
    alreadyAutoWon: Boolean(earlier),
    counting: info.counting,
  });
  if (!winner) return false;
  await moveLeadStage(db, studioId, leadId, wonStages[0].key, { via: "mana" });
  return true;
}

/** Checks every lead that is not won yet and has a Mana person. Run after a sync. */
export async function detectWonForStudio(db: Db, studioId: string): Promise<number> {
  const candidates = await db
    .select({ id: lead.id })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)))
    .where(and(eq(lead.studioId, studioId), ne(pipelineStage.kind, "won")));
  let won = 0;
  for (const c of candidates) if (await detectWonForLead(db, studioId, c.id)) won += 1;
  return won;
}

/** After a full sync: link people to Mana and move new members' leads to Won. */
export async function afterSync(db: Db, studioId: string) {
  await matchAllPeople(db, studioId);
  return detectWonForStudio(db, studioId);
}

/** How long a live lookup counts as fresh, so opening a lead again does not ask Mana again. */
export const liveCheckFreshMs = 10 * 60_000;

/**
 * Looks one person up in Mana right now (by email, otherwise by phone), saves
 * what Mana says about them, and moves their leads to Won if they have become a
 * member. A couple of requests at most, and skipped if done recently.
 * Returns whether anything on the lead may have changed.
 */
export async function refreshPersonFromMana(
  db: Db,
  source: ManaSource & { searchUsers(term: string): Promise<Parameters<typeof upsertMembers>[2]> },
  studioId: string,
  personId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [p] = await db
    .select()
    .from(person)
    .where(and(eq(person.studioId, studioId), eq(person.id, personId)))
    .limit(1);
  if (!p) return false;
  if (p.manaCheckedAt && now.getTime() - p.manaCheckedAt.getTime() < liveCheckFreshMs) return false;

  // Search by email, or by the phone's last nine digits (Mana stores +46..., the CRM may hold 07...).
  const term = p.email ?? (p.phoneNormalized ? p.phoneNormalized.replace(/\D/g, "").slice(-9) : null);
  await db.update(person).set({ manaCheckedAt: now }).where(eq(person.id, p.id));
  if (!term) return false;

  const found = (await source.searchUsers(term)).filter(
    (u) =>
      (p.emailNormalized && normalizeEmail(u.profile.email) === p.emailNormalized) ||
      (p.phoneNormalized && normalizePhone(u.profile.phone) === p.phoneNormalized),
  );
  if (found.length === 0) return false;

  const [lastRun] = await db
    .select({ id: syncRun.id })
    .from(syncRun)
    .where(and(eq(syncRun.studioId, studioId), eq(syncRun.status, "succeeded")))
    .orderBy(desc(syncRun.startedAt))
    .limit(1);
  await upsertMembers(db, studioId, found, lastRun?.id ?? "live", { keepRunId: true });
  for (const u of found.filter((x) => x.role === "member")) {
    await replaceMemberships(db, studioId, u.userId, await source.getUserMemberships(u.userId));
  }

  const before = p.manaUserId;
  const linked = await matchPerson(db, studioId, p.id);
  const leads = await db.select({ id: lead.id }).from(lead).where(eq(lead.personId, p.id));
  let won = false;
  for (const l of leads) won = (await detectWonForLead(db, studioId, l.id)) || won;
  return won || linked !== before || Boolean(linked);
}

/** The kinds of membership seen in Mana, with how many are active, for the "what counts" setting. */
export async function listMembershipKinds(db: Db, studioId: string) {
  const rows = await db
    .select({
      membershipId: manaMembership.membershipId,
      name: manaMembership.name,
      status: manaMembership.status,
    })
    .from(manaMembership)
    .where(eq(manaMembership.studioId, studioId));
  const kinds = new Map<string, { membershipId: string; name: string; active: number }>();
  for (const r of rows) {
    const k = kinds.get(r.membershipId) ?? { membershipId: r.membershipId, name: r.name, active: 0 };
    if (r.status === "active") k.active += 1;
    kinds.set(r.membershipId, k);
  }
  return [...kinds.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

/** Saves which memberships do not count, then re-checks leads (a change can make someone a member). */
export async function saveIgnoredMemberships(db: Db, studioId: string, ignoredIds: string[]) {
  await db
    .update(studioSettings)
    .set({ ignoredMembershipIds: [...new Set(ignoredIds)].sort(), updatedAt: new Date() })
    .where(eq(studioSettings.studioId, studioId));
  return detectWonForStudio(db, studioId);
}
