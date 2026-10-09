# 26: MRR and paying members on the home page

**What to build:** The gym's main KPI at the top of the home page: MRR from recurring memberships and the number of paying members, each with a trend line back to September 2026, plus new and lost paying members this month. Owners see it, Staff (trainers) do not.

**Blocked by:** 10

**Status:** ready-for-agent (check the definitions with Erik first, see the open questions)

Definitions (from Erik's notes, decided 2026-10-08 where marked):
- MRR: the sum of the monthly price of every active recurring membership with a price above 0, at the price that applies today (a discount period lowers it).
- Paying member: a person with at least one such membership. 0 kr memberships (coach deals, staff) do not count.
- Frozen memberships do not count (decided).
- Visible to Owners, not to Staff (decided: admin, owner and studio manager see it, trainers do not; the CRM has Owner and Staff for now).
- MRR is what members are signed up to pay, not what was collected (failed charges are not in the Mana API).

- [ ] The Mana mirror keeps each membership's price periods (discounts and freezes), and the sync keeps fetching ended memberships too (without them the count only goes up, the Bionic HQ bug)
- [ ] MRR and paying members are calculated by one pure, tested function following the definitions above
- [ ] One snapshot per day is stored from the day this ships, and the months back to September 2026 are rebuilt from start, end and price-period dates
- [ ] The home page shows MRR and paying members with a trend line, and new and lost paying members this month
- [ ] Staff do not see it, Owners do
- [ ] Today's numbers are checked against Mana by hand before the tile is trusted, and the result is written down
- [ ] Bionic HQ's `src/lib/members/paying.ts` has been read as reference (needs access)
