/**
 * Paying members and monthly revenue from the Mana mirror (ticket 26).
 *
 * A membership counts on a day when it costs more than 0 kr, has started, has
 * not ended (a cancellation's date is the last day) and is not frozen (from
 * the day a freeze starts). A paying member is a person with at least one
 * counting membership, so Basic plus a locker is one member. Förvaringsbox
 * counts like any other membership (decided 2026-10-09). Monthly revenue is
 * the sum of today's prices of the counting memberships: what members are
 * signed up to pay, not what was collected.
 */

export type KpiMembership = {
  manaUserId: string;
  name: string;
  status: string; // active, ended or future
  startDate: string; // YYYY-MM-DD
  pendingChangeKind: string | null; // cancel or freeze
  pendingChangeDate: string | null; // YYYY-MM-DD
  commitmentEndDate: string | null; // YYYY-MM-DD
  cancelEffectiveDate: string | null; // YYYY-MM-DD, the day notice was given
  priceAmount: number | null; // öre per month
};

export type MonthPoint = {
  /** The month, YYYY-MM. */
  month: string;
  /** The day the count is taken: the month's last day, or today for this month. */
  asOf: string;
  count: number;
};

export type MemberTrend = {
  /** Membership names that can be filtered on, most held first. */
  names: string[];
  /** Twelve months, oldest first, for everyone ("") and for each name. */
  series: Record<string, MonthPoint[]>;
};

/**
 * A membership's last day: a cancellation's date, or for an ended membership
 * without one (it simply ran out) its commitment end, else the day notice was
 * given. undefined while it runs on; null when it ended on an unknown day,
 * which cannot be placed in time and so never counts.
 */
function lastDay(m: KpiMembership): string | null | undefined {
  if (m.pendingChangeKind === "cancel" && m.pendingChangeDate) return m.pendingChangeDate;
  if (m.status !== "ended") return undefined;
  return m.commitmentEndDate ?? m.cancelEffectiveDate ?? null;
}

export function countsOn(m: KpiMembership, day: string): boolean {
  if ((m.priceAmount ?? 0) <= 0) return false;
  if (m.startDate > day) return false;
  if (m.pendingChangeKind === "freeze" && m.pendingChangeDate && m.pendingChangeDate <= day) return false;
  const last = lastDay(m);
  if (last !== undefined) return last !== null && day <= last;
  return true;
}

/** People holding at least one counting membership on a day, optionally only of one name. */
export function payingMembersOn(memberships: KpiMembership[], day: string, name?: string): number {
  const people = new Set<string>();
  for (const m of memberships) {
    if ((name === undefined || m.name === name) && countsOn(m, day)) people.add(m.manaUserId);
  }
  return people.size;
}

/** The key numbers as they stand on a day, as saved after each sync. Revenue is in öre. */
export type Snapshot = { day: string; payingMembers: number; revenue: number; byName: Record<string, number> };

export function snapshotOn(memberships: KpiMembership[], day: string): Snapshot {
  const byName: Record<string, number> = {};
  for (const name of new Set(memberships.filter((m) => countsOn(m, day)).map((m) => m.name))) {
    byName[name] = payingMembersOn(memberships, day, name);
  }
  return {
    day,
    payingMembers: payingMembersOn(memberships, day),
    revenue: memberships.reduce((sum, m) => (countsOn(m, day) ? sum + (m.priceAmount ?? 0) : sum), 0),
    byName,
  };
}

/** Today's monthly revenue in kronor: the sum of the counting memberships' prices. */
export function monthlyRevenue(memberships: KpiMembership[], today: string): number {
  return memberships.reduce((sum, m) => (countsOn(m, today) ? sum + (m.priceAmount ?? 0) : sum), 0) / 100;
}

function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** The twelve months ending with today's, oldest first, as YYYY-MM. */
export function rollingMonths(today: string, count = 12): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Paying members at the end of each of the last twelve months (today for this
 * one). A past month uses its last saved snapshot when there is one, so the
 * line keeps what was true then; otherwise it is rebuilt from the memberships'
 * start and end dates. Months before Mana show 0.
 */
export function memberTrend(memberships: KpiMembership[], today: string, snapshots: Snapshot[] = []): MemberTrend {
  const months = rollingMonths(today);
  const asOf = (month: string) => (month === today.slice(0, 7) ? today : lastDayOfMonth(month));
  const held = new Map<string, number>();
  for (const m of memberships) if (countsOn(m, today)) held.set(m.name, (held.get(m.name) ?? 0) + 1);
  const names = [...held.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sv")).map(([n]) => n);

  const lastSnapshot = new Map<string, Snapshot>();
  for (const s of [...snapshots].sort((a, b) => a.day.localeCompare(b.day))) lastSnapshot.set(s.day.slice(0, 7), s);
  const thisMonth = today.slice(0, 7);

  const seriesFor = (name?: string) =>
    months.map((month) => {
      const saved = month === thisMonth ? undefined : lastSnapshot.get(month);
      if (saved) {
        return { month, asOf: saved.day, count: name === undefined ? saved.payingMembers : (saved.byName[name] ?? 0) };
      }
      return { month, asOf: asOf(month), count: payingMembersOn(memberships, asOf(month), name) };
    });
  const series: Record<string, MonthPoint[]> = { "": seriesFor() };
  for (const name of names) series[name] = seriesFor(name);
  return { names, series };
}

/** Change from last month to this one as a share (0.05 = 5 %), or null when last month had none. */
export function monthOverMonth(points: MonthPoint[]): number | null {
  const current = points.at(-1)?.count ?? 0;
  const previous = points.at(-2)?.count ?? 0;
  return previous === 0 ? null : (current - previous) / previous;
}
