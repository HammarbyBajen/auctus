import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { manaCreditBalance, manaMember, manaMembership, manaPurchase, studioSettings } from "@/db/schema";
import { formatDay, formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { todayInStockholm } from "@/lib/tasks/dates";
import { getIgnoredMembershipIds } from "./leads";
import { customerRole } from "./membership";
import { balanceOf, keepBundlePurchasesDays, klippkortNudge, purchaseDescription, watchedBundles, type CreditBundle, type CreditPool } from "./klippkort";
import { isDayPassProspect } from "./winback";

type Db = typeof defaultDb;

const DAY = 86_400_000;
/** At most this many people are read a night, those read longest ago first; the rest wait a night (Mana's budget, ticket 28). */
const maxReadsPerNight = 60;
/** A balance older than this is not acted on: the night's read failed, and the next one will tell. */
const freshBalanceMs = 2 * DAY;

type Holder = { manaUserId: string; purchase: { id: string; description: string; paidAt: Date } };

/**
 * Customers without a membership who bought a watched bundle within the last
 * 400 days, each with their latest such purchase. The same rule as a day-pass
 * buyer (ticket 12), over a klippkort's lifetime instead of 30 days.
 */
export async function klippkortHolders(db: Db, studioId: string, now: Date = new Date()): Promise<Holder[]> {
  const [settings] = await db
    .select({ bundles: studioSettings.manaCreditBundles, picked: studioSettings.klippkortBundleIds, addOns: studioSettings.addOnMembershipIds })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  const descriptions = watchedBundles(settings?.bundles ?? [], settings?.picked ?? null).map(purchaseDescription);
  if (descriptions.length === 0) return [];

  const purchases = await db
    .select({ id: manaPurchase.id, manaUserId: manaPurchase.manaUserId, description: manaPurchase.description, paidAt: manaPurchase.paidAt })
    .from(manaPurchase)
    .innerJoin(manaMember, and(eq(manaMember.studioId, studioId), eq(manaMember.manaUserId, manaPurchase.manaUserId), eq(manaMember.role, customerRole)))
    .where(
      and(
        eq(manaPurchase.studioId, studioId),
        eq(manaPurchase.kind, "class_credits_bundle"),
        inArray(manaPurchase.description, descriptions),
        gte(manaPurchase.paidAt, new Date(now.getTime() - keepBundlePurchasesDays * DAY)),
      ),
    )
    .orderBy(desc(manaPurchase.paidAt));
  const latest = new Map<string, (typeof purchases)[number]>();
  for (const p of purchases) if (!latest.has(p.manaUserId)) latest.set(p.manaUserId, p);
  if (latest.size === 0) return [];

  const ignored = [...(await getIgnoredMembershipIds(db, studioId)), ...(settings?.addOns ?? [])];
  const memberships = await db
    .select()
    .from(manaMembership)
    .where(and(eq(manaMembership.studioId, studioId), inArray(manaMembership.manaUserId, [...latest.keys()])));
  const today = todayInStockholm(now);
  return [...latest.values()]
    .filter((p) =>
      isDayPassProspect(
        memberships.filter((m) => m.manaUserId === p.manaUserId),
        ignored,
        todayInStockholm(p.paidAt),
        today,
        keepBundlePurchasesDays,
      ),
    )
    .map((p) => ({ manaUserId: p.manaUserId, purchase: { id: p.id, description: p.description ?? "", paidAt: p.paidAt } }));
}

/**
 * Refreshes the studio's bundle list (one request), then, when win-back is on,
 * what each klippkort holder has left (one request each). A holder whose card
 * was empty at the last read, with nothing bought since, is not read again.
 */
export async function syncKlippkort(
  db: Db,
  source: { getCreditBundles(): Promise<CreditBundle[]>; getClassCredits(manaUserId: string): Promise<CreditPool[]> },
  studioId: string,
  now: Date = new Date(),
): Promise<{ read: number }> {
  const bundles = (await source.getCreditBundles()).map(({ id, name, credits }) => ({ id, name, credits }));
  const [settings] = await db
    .update(studioSettings)
    .set({ manaCreditBundles: bundles })
    .where(eq(studioSettings.studioId, studioId))
    .returning({ enabled: studioSettings.winBackEnabled });
  if (!settings?.enabled) return { read: 0 };

  const holders = await klippkortHolders(db, studioId, now);
  if (holders.length === 0) return { read: 0 };
  const known = new Map(
    (
      await db
        .select()
        .from(manaCreditBalance)
        .where(and(eq(manaCreditBalance.studioId, studioId), inArray(manaCreditBalance.manaUserId, holders.map((h) => h.manaUserId))))
    ).map((b) => [b.manaUserId, b]),
  );
  const toRead = holders
    .filter((h) => {
      const last = known.get(h.manaUserId);
      return !last || last.credits > 0 || last.readAt < h.purchase.paidAt;
    })
    .sort((a, b) => (known.get(a.manaUserId)?.readAt.getTime() ?? 0) - (known.get(b.manaUserId)?.readAt.getTime() ?? 0))
    .slice(0, maxReadsPerNight);

  for (const h of toRead) {
    const balance = balanceOf(await source.getClassCredits(h.manaUserId));
    const values = { credits: balance.credits, expireDate: balance.expireDate, readAt: now };
    await db
      .insert(manaCreditBalance)
      .values({ studioId, manaUserId: h.manaUserId, ...values })
      .onConflictDoUpdate({ target: [manaCreditBalance.studioId, manaCreditBalance.manaUserId], set: values });
  }
  return { read: toRead.length };
}

export type KlippkortSignal = { manaRef: string; manaUserId: string; detail: string; task: string };

/**
 * The holders worth a call today, from the balances read in the last two
 * days: once per card bought (the purchase is the reference).
 */
export async function klippkortSignals(db: Db, studioId: string, now: Date = new Date()): Promise<KlippkortSignal[]> {
  const holders = await klippkortHolders(db, studioId, now);
  if (holders.length === 0) return [];
  const balances = new Map(
    (
      await db
        .select()
        .from(manaCreditBalance)
        .where(
          and(
            eq(manaCreditBalance.studioId, studioId),
            inArray(manaCreditBalance.manaUserId, holders.map((h) => h.manaUserId)),
            gte(manaCreditBalance.readAt, new Date(now.getTime() - freshBalanceMs)),
          ),
        )
    ).map((b) => [b.manaUserId, b]),
  );
  const today = todayInStockholm(now);
  return holders.flatMap((h) => {
    const balance = balances.get(h.manaUserId);
    // A balance read before this card was bought says nothing about it.
    if (!balance || balance.readAt < h.purchase.paidAt) return [];
    const nudge = klippkortNudge(balance, today);
    if (!nudge) return [];
    const name = h.purchase.description.replace(/^Credit bundle: /, "");
    const bought = formatDay(todayInStockholm(h.purchase.paidAt));
    const left = Math.floor(nudge.credits);
    const n = formatNumber(left);
    return [
      {
        manaRef: h.purchase.id,
        manaUserId: h.manaUserId,
        detail:
          nudge.kind === "expiring"
            ? t("klippkort.noteExpiring", { name, n, date: formatDay(nudge.expireDate), bought })
            : t(left === 0 ? "klippkort.noteEmpty" : "klippkort.noteFewLeft", { name, n, bought }),
        task:
          nudge.kind === "expiring"
            ? t("klippkort.taskExpiring", { date: formatDay(nudge.expireDate) })
            : t(left === 0 ? "klippkort.taskEmpty" : "klippkort.taskFewLeft", { n }),
      },
    ];
  });
}
