# 23: Salary (WFM): lock month and export

**What to build:** Fredrik locks a month and exports names and hours for the accountant. The month is refreshed from Mana just before locking, and a locked month then does not change when data or rules change afterwards. Acceptance is that one real month matches his hand count.

**Blocked by:** 22

**Status:** built (2026-10-14), waiting for Fredrik's October hand count and Mana's hidden classes

- [x] Locking prompts a refresh from Mana first if the last pull is old
- [x] Locking freezes the month's figures and records who locked it and when
- [x] Edits to people, rules or Mana data after locking do not change a locked month
- [x] Export gives names and hours (hours per class type, free hours, hours to pay) as a file the accountant can open
- [x] A locked month can be unlocked only by an Owner, and that is recorded
- [ ] The October 2026 list matches what Fredrik counted by hand
- [ ] Hidden classes (Tegenbutik, NSI, Tegenmöte, Goalreview/Inbody) are counted once Mana adds `includeHidden=true` to `class-events`
- [x] Month data from September 2026 is marked as migration test data

Decided by Max (2026-10-14):
1. Only hours from Mana sessions linked to a person (instructor) are counted. No hand-entered hours for now (Tegenbutik, Tegenmöte and NSI have no scheduled sessions and are left out).
2. A free class is a whole group class the coach holds unpaid in exchange for training for free. Counted in classes, not hours, and only group classes (class events) count; PT, Onramp and Kids do not. The free ones are the first of each week, in time order.
3. When someone covers a class, the instructor is changed in Mana, so Mana's instructor is the one who held it.
4. PT and Onramp bookings count only when completed.
5. Export as both Excel and CSV, hours as decimals, one column per class type.
6. The check against Fredrik's October hand count waits.

Changed later (2026-10-14/15): ticket 22 was dropped, so there are no free classes or hours to pay; every hour counts and owners tick which categories count. The export has one column per counted category and "Timmar totalt". Decision 1 above changed too: hidden classes such as Tegenbutik do have scheduled sessions in Mana, but the public API leaves hidden classes out. Erik has asked Mana for `GET class-events?includeHidden=true` with an `isHidden` field; the API watch will show when it lands, and then `getClassEvents` is updated.
