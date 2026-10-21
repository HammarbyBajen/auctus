/**
 * Klippkort running out (ticket 31). Someone without a membership who trains
 * on a klippkort is the warmest prospect there is: when the card is nearly
 * used up, or about to expire with classes left, staff get a task to offer a
 * membership. Pure, so the rules are tested on their own.
 */

/** A class credit bundle sold in Mana: Klippkort, Day Pass, personal training... */
export type CreditBundle = { id: string; name: string; credits: number };

/** Nudge when this many classes or fewer are left. */
export const fewLeft = 2;
/** Nudge when a card with classes left expires within this many days. */
export const expiresWithinDays = 14;
/** A klippkort is valid a year in Mana; purchases are kept a little longer than that. */
export const keepBundlePurchasesDays = 400;
/** Bundles with at least this many classes are watched until owners pick (a Day Pass or one PT session is not a klippkort). */
const defaultMinCredits = 5;

/** The bundles watched: the owners' pick, or until they have picked, the ones with several classes. */
export function watchedBundles(bundles: CreditBundle[], picked: string[] | null): CreditBundle[] {
  return picked === null ? bundles.filter((b) => b.credits >= defaultMinCredits) : bundles.filter((b) => picked.includes(b.id));
}

/** Mana's payment description for a bundle ("Credit bundle: Klippkort"): a payment names the bundle, it does not link to it. */
export const purchaseDescription = (bundle: Pick<CreditBundle, "name">) => `Credit bundle: ${bundle.name}`;

export type CreditPool = { credits: number; type: string; expireDate?: string | null };
export type Balance = { credits: number; expireDate: string | null };

/**
 * What a person has left on their own cards. Mana keeps one pool per purchase
 * kind; credits that come with a membership are not a klippkort. The expiry is
 * the soonest among pools that still have classes.
 */
export function balanceOf(pools: CreditPool[]): Balance {
  const own = pools.filter((p) => p.type === "default");
  const credits = own.reduce((total, p) => total + p.credits, 0);
  const expiries = own.filter((p) => p.credits > 0 && p.expireDate).map((p) => p.expireDate!.slice(0, 10)).sort();
  return { credits, expireDate: expiries[0] ?? null };
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export type Nudge = { kind: "few_left"; credits: number } | { kind: "expiring"; credits: number; expireDate: string };

/** Whether a balance is worth a call today: few classes left, or classes left on a card about to expire. */
export function klippkortNudge(balance: Balance, today: string): Nudge | null {
  if (balance.credits <= fewLeft) return { kind: "few_left", credits: Math.max(0, balance.credits) };
  if (balance.expireDate && balance.expireDate <= addDays(today, expiresWithinDays)) {
    return { kind: "expiring", credits: balance.credits, expireDate: balance.expireDate };
  }
  return null;
}
