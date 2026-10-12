import { and, eq, gte } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { kpiSnapshot, manaMembership } from "@/db/schema";
import { memberTrend, monthlyRevenue, rollingMonths, snapshotOn, type KpiMembership, type Snapshot } from "./members";

type Db = typeof defaultDb;

async function loadMemberships(db: Db, studioId: string): Promise<KpiMembership[]> {
  return db
    .select({
      manaUserId: manaMembership.manaUserId,
      name: manaMembership.name,
      status: manaMembership.status,
      startDate: manaMembership.startDate,
      pendingChangeKind: manaMembership.pendingChangeKind,
      pendingChangeDate: manaMembership.pendingChangeDate,
      commitmentEndDate: manaMembership.commitmentEndDate,
      cancelEffectiveDate: manaMembership.cancelEffectiveDate,
      priceAmount: manaMembership.priceAmount,
    })
    .from(manaMembership)
    .where(eq(manaMembership.studioId, studioId));
}

/**
 * Saves today's key numbers from the freshly synced mirror. Run after each
 * successful sync; a second run the same day replaces the first.
 */
export async function recordKpiSnapshot(db: Db, studioId: string, today: string): Promise<Snapshot | null> {
  const memberships = await loadMemberships(db, studioId);
  if (memberships.length === 0) return null;
  const snapshot = snapshotOn(memberships, today);
  await db
    .insert(kpiSnapshot)
    .values({ studioId, ...snapshot })
    .onConflictDoUpdate({
      target: [kpiSnapshot.studioId, kpiSnapshot.day],
      set: { payingMembers: snapshot.payingMembers, revenue: snapshot.revenue, byName: snapshot.byName, createdAt: new Date() },
    });
  return snapshot;
}

/** The home page's key numbers for a studio: live from its Mana mirror, with past months from saved snapshots. */
export async function getKpi(db: Db, studioId: string, today: string) {
  const [memberships, snapshots] = await Promise.all([
    loadMemberships(db, studioId),
    db
      .select({ day: kpiSnapshot.day, payingMembers: kpiSnapshot.payingMembers, revenue: kpiSnapshot.revenue, byName: kpiSnapshot.byName })
      .from(kpiSnapshot)
      .where(and(eq(kpiSnapshot.studioId, studioId), gte(kpiSnapshot.day, `${rollingMonths(today)[0]}-01`))),
  ]);
  return { trend: memberTrend(memberships, today, snapshots), revenue: monthlyRevenue(memberships, today), hasData: memberships.length > 0 };
}
