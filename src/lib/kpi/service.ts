import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { manaMembership } from "@/db/schema";
import { memberTrend, monthlyRevenue, type KpiMembership } from "./members";

type Db = typeof defaultDb;

/** The home page's key numbers for a studio, from its Mana mirror. */
export async function getKpi(db: Db, studioId: string, today: string) {
  const memberships: KpiMembership[] = await db
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
  return { trend: memberTrend(memberships, today), revenue: monthlyRevenue(memberships, today), hasData: memberships.length > 0 };
}
