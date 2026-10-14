# 20: Salary (WFM): people and class events

**What to build:** Owners open a People page, link each coach to a Mana instructor and enter free classes per week, active-from date and notes. Owners pick a month and pull its coach work from Mana on demand: class events, specialist service bookings (PT, Onramp) and Kids course events (each with instructor, start and end), with a Refresh action and a last-pulled time. It is meant to be run close to the 15th, so no daily sync is needed. A first per-person list shows total real hours for the month. Owner-only.

**Blocked by:** 10

**Status:** done (2026-10-14)

- [x] A chosen month is pulled on demand from all three sources (class events, specialist service bookings, course events) and show their real start and end
- [x] Pulling follows the next link until done (a month was 167 events in one page, but must not assume it)
- [x] Hours come from the end minus the start timestamps, not from a fixed class length
- [x] Refreshing re-pulls the month, replaces the earlier data (so cancelled classes disappear) and shows the last-pulled time
- [x] A People record has name, linked Mana instructor, free classes per week, active from and notes
- [x] A month view lists each person with total hours calculated from real minutes (a 30-minute class counts 30)
- [x] Only Owners can see the page
- [x] The pull respects Mana's maximum date range per request (a month may need several requests) and the one-request-per-second budget

Decided by Max (2026-10-14):
1. Only hours from Mana sessions linked to a person (instructor) are counted. No hand-entered hours for now (Tegenbutik, Tegenmöte and NSI have no scheduled sessions and are left out).
2. A free class is a whole group class the coach holds unpaid in exchange for training for free. Counted in classes, not hours, and only group classes (class events) count; PT, Onramp and Kids do not. The free ones are the first of each week, in time order.
3. When someone covers a class, the instructor is changed in Mana, so Mana's instructor is the one who held it.
4. PT and Onramp bookings count only when completed.
5. Export as both Excel and CSV, hours as decimals, one column per class type.
6. The check against Fredrik's October hand count waits.
