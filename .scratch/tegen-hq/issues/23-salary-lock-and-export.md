# 23: Salary (WFM): lock month and export

**What to build:** Fredrik locks a month and exports names and hours for the accountant. The month is refreshed from Mana just before locking, and a locked month then does not change when data or rules change afterwards. Acceptance is that one real month matches his hand count.

**Blocked by:** 22

**Status:** built (2026-10-14); hidden classes fetched since 2026-10-23; waiting for Fredrik's October hand count and his word on hidden PT

- [x] Locking prompts a refresh from Mana first if the last pull is old
- [x] Locking freezes the month's figures and records who locked it and when
- [x] Edits to people, rules or Mana data after locking do not change a locked month
- [x] Export gives names and hours (hours per class type, free hours, hours to pay) as a file the accountant can open
- [x] A locked month can be unlocked only by an Owner, and that is recorded
- [ ] The October 2026 list matches what Fredrik counted by hand
- [x] Hidden classes (Tegenbutik, NSI, Tegenmöte, Goalreview/Inbody) are fetched now that Mana has `includeHidden=true` on `class-events` (2026-10-23); owners tick which count
- [ ] Fredrik says whether the hidden PT60/PT30 classes are paid hours, and whether they double the PT bookings
- [x] Month data from September 2026 is marked as migration test data

Decided by Max (2026-10-14):
1. Only hours from Mana sessions linked to a person (instructor) are counted. No hand-entered hours for now (Tegenbutik, Tegenmöte and NSI have no scheduled sessions and are left out).
2. A free class is a whole group class the coach holds unpaid in exchange for training for free. Counted in classes, not hours, and only group classes (class events) count; PT, Onramp and Kids do not. The free ones are the first of each week, in time order.
3. When someone covers a class, the instructor is changed in Mana, so Mana's instructor is the one who held it.
4. PT and Onramp bookings count only when completed.
5. Export as both Excel and CSV, hours as decimals, one column per class type.
6. The check against Fredrik's October hand count waits.

Changed later (2026-10-14/15): ticket 22 was dropped, so there are no free classes or hours to pay; every hour counts and owners tick which categories count. The export has one column per counted category and "Timmar totalt". Decision 1 above changed too: hidden classes such as Tegenbutik do have scheduled sessions in Mana, but the public API leaves hidden classes out. Erik has asked Mana for `GET class-events?includeHidden=true` with an `isHidden` field; the API watch will show when it lands, and then `getClassEvents` is updated.

Hidden classes (2026-10-23): Mana added `includeHidden` and `isHidden` to `class-events` on 2026-10-23 (API watch). One week (13 to 19 October) had 14 hidden classes besides the 33 visible ones: Tegenbutik 5, NSI 1, PT60 5, PT30 3, all with an instructor. Of the 8 hidden PT classes, 2 start at the same time with the same coach as a PT booking (which Timmar already counts) and 6 match no booking, so PT may be entered both ways. Decided by Max: Timmar now fetches hidden classes; each hidden class type is its own category marked "(dold)" and starts unticked, so nothing is counted twice until an owner ticks it. Fredrik ticks Tegenbutik and NSI under Timmar; PT stays unticked until he has said how PT is entered in Mana.

Timlön and the accountant (2026-10-28, decided by Max): each coach has a gross pay per hour (salary_instructor.hourly_rate_ore, migration 0034), set in a Timlön panel on Timmar; every class pays the same. The month shows "Att betala" per coach (hours × rate) and a total, "Ingen timlön" where none is set, and the export gains "Timlön (kr)" and "Att betala (kr)" columns (empty, never 0, without a rate). A locked month freezes the rate with the hours. The accountant's address (studio_settings.accountant_email, migration 0035) is set on the same page; a locked month has "Skicka till revisorn", which emails the Excel file with a fixed subject and body (logged on the month as "sent", shown by the button so nobody sends twice). Until the live sender exists (ticket 27) it goes to Resend's test address. Looked at Accounted (accounted.se): a REST API and an MCP server with payroll tools, every write approved by a person, nothing found for importing hours; so no Accounted code yet, and the next step for an agent is a JSON export of a locked month at a stable URL (not built).
