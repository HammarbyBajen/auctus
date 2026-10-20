# 26: MRR and paying members on the home page

**What to build:** The gym's main KPI at the top of the home page: MRR from recurring memberships and the number of paying members, with a rolling 12-month trend (months before Mana, 23 Sep 2026, show 0), plus new and lost paying members this month. Owners see it, Staff (trainers) do not.

**Blocked by:** 10

**Status:** done (2026-10-20)

Definitions (from Erik's notes, decided 2026-10-08 where marked):
- MRR: the sum of the monthly price of every active recurring membership with a price above 0, at the price that applies today (a discount period lowers it).
- Paying member: a person with at least one such membership. 0 kr memberships (coach deals, staff) do not count.
- Förvaringsbox (a 50 kr per month locker) counts in MRR and as a membership, so a locker-only person is a paying member (decided by Max, 2026-10-09). At the time of deciding: 45 active lockers, 2,250 kr per month, 2 locker-only people.
- Frozen memberships do not count (decided).
- Visible to Owners, not to Staff (decided: admin, owner and studio manager see it, trainers do not; the CRM has Owner and Staff for now).
- MRR is what members are signed up to pay, not what was collected (failed charges are not in the Mana API).

- [x] The Mana mirror keeps each membership's price periods (discounts and freezes), and the sync keeps fetching ended memberships too (without them the count only goes up, the Bionic HQ bug)
- [x] MRR and paying members are calculated by one pure, tested function following the definitions above
- [x] One snapshot per day is stored from the day this ships, and the months back to September 2026 are rebuilt from start, end and price-period dates
- [x] The home page shows MRR and paying members with a trend line, and new and lost paying members this month
- [x] Staff do not see it, Owners do
- [x] Today's numbers are checked against Mana by hand before the tile is trusted, and the result is written down (2026-10-11: September matches Mana's membership report exactly once staff memberships are synced: Basic 200 new, 2 ended, 198 at the end; Förvaringsbox 55; Fri träning 35; Basic (12mån) 15; Performance (löpande) 10. Home page that day: 233 paying members on 30 Sep, 231 today, revenue 377 395 kr.)
- [x] ~~Bionic HQ's `src/lib/members/paying.ts` has been read as reference~~ dropped by Max (2026-10-20): the numbers are checked against Mana's own report

Price periods (decided by Max, 2026-10-15): discounts, freezes and Mana's price for the period all count. A freeze period (disableMembership) means not paying and nothing in revenue: it disappears from "pending change" once it has started, which is why 11 frozen memberships were counted before. A discount counts at the discounted price (a member at 100 % off is still a member, at 0 kr). Another price for a period is that price. A period at 0 that is neither a discount nor a freeze is already paid (the months paid in Wondr before the move, a year paid up front) and counts at the ordinary price; otherwise October would show almost no revenue. Checked on 2026-10-15 against Mana live: 234 → 225 paying members, 382 280 → 358 905 kr.

Open decision (frozen by Max, 2026-10-16), to come back to:
- A: contracted monthly revenue (what members are signed up for, today's rule) or B: what Mana expects to be paid this month. The difference is the 0 kr periods that are neither a discount nor a freeze: today they count at the ordinary price (the months paid up front in Wondr). Max questioned that as design ("isn't it bad design to not look at what's actually being paid?"); the proposal is to narrow that exception to the members from the Wondr move.
- Chart (2026-10-15/18): "Alla" counts people, the filters count holders of each membership, so the filters add up to more than Alla (noted under the chart; Förvaringsbox stays counted). The chart now has 12 months on the axis, starts its line at the first month with data (September), and its y axis fits the data (at least 5 % below the lowest month).

Decided by Max (2026-10-20), replacing the prepaid rule of 2026-10-15: nobody pays in advance (a 12-month membership is paid month by month), so a 0 kr period that is neither a discount nor a freeze is 0 kr in revenue, as Mana says. Such a membership still counts as a paying member while the period has an end (payments start then, like a 100 % discount), but not when the 0 kr period has no end date. The A/B question is settled: revenue is what members are to pay this month by Mana's price periods. Effect on 2026-10-20: revenue 334 030 kr (was 360 600 kr; 17 memberships in a 0 kr period, 26 570 kr), paying members 224 (was 226; the two open-ended 0 kr memberships, both Basic). Past days keep their saved snapshots.
