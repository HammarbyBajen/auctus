# 22: Salary (WFM): free classes and hours to pay

**What to build:** Each person's free classes per week come off their hours, and the month view shows name, hours per class type, free hours and hours to pay. Tegenbutik never counts toward free classes.

**Blocked by:** 21

**Status:** dropped (2026-10-14), see the note at the end

- [x] Free classes per week are deducted per week and booked to the month each class falls in, so a week spanning two months is split correctly
- [x] Tegenbutik hours are always paid and never use up free classes
- [x] The view shows name, hours per class type, free hours and hours to pay
- [x] Free classes only apply from the person's active-from date
- [x] Calculation is covered by tests, including a week that spans two months and a part-time deal

Decided by Max (2026-10-14):
1. Only hours from Mana sessions linked to a person (instructor) are counted. No hand-entered hours for now (Tegenbutik, Tegenmöte and NSI have no scheduled sessions and are left out).
2. A free class is a whole group class the coach holds unpaid in exchange for training for free. Counted in classes, not hours, and only group classes (class events) count; PT, Onramp and Kids do not. The free ones are the first of each week, in time order.
3. When someone covers a class, the instructor is changed in Mana, so Mana's instructor is the one who held it.
4. PT and Onramp bookings count only when completed.
5. Export as both Excel and CSV, hours as decimals, one column per class type.
6. The check against Fredrik's October hand count waits.

Dropped by Max (2026-10-14): free classes were the wrong idea for counting hours. The Timmar view only shows the hours each coach held classes and courses; nothing is taken off.
