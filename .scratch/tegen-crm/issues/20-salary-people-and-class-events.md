# 20: Salary (WFM): people and class events

**What to build:** Owners open a People page, link each coach to a Mana instructor and enter free classes per week, active-from date and notes. Owners pick a month and pull its coach work from Mana on demand: class events, specialist service bookings (PT, Onramp) and Kids course events (each with instructor, start and end), with a Refresh action and a last-pulled time. It is meant to be run close to the 15th, so no daily sync is needed. A first per-person list shows total real hours for the month. Owner-only.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] A chosen month is pulled on demand from all three sources (class events, specialist service bookings, course events) and show their real start and end
- [ ] Pulling follows the next link until done (a month was 167 events in one page, but must not assume it)
- [ ] Hours come from the end minus the start timestamps, not from a fixed class length
- [ ] Refreshing re-pulls the month, replaces the earlier data (so cancelled classes disappear) and shows the last-pulled time
- [ ] A People record has name, linked Mana instructor, free classes per week, active from and notes
- [ ] A month view lists each person with total hours calculated from real minutes (a 30-minute class counts 30)
- [ ] Only Owners can see the page
- [ ] The pull respects Mana's maximum date range per request (a month may need several requests) and the one-request-per-second budget
