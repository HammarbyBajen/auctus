# 21: Salary (WFM): class type rules and flags

**What to build:** Owners mark each class type as paid or not paid. The month view flags a class with no instructor and a class type with no rule yet.

**Blocked by:** 20

**Status:** done (2026-10-14)

- [x] Every class type, specialist service (PT30, PT60, Onramp) and course found in Mana shows up in a rules list as unset until Fredrik decides
- [x] Class types marked not paid do not count toward hours to pay
- [x] Specialist bookings count only for the statuses Fredrik chooses (for example completed), and canceled, refunded and no-show bookings are shown separately
- [x] Classes without an instructor are flagged in the month view
- [x] Class types without a rule are flagged and not silently dropped

Decided by Max (2026-10-14):
1. Only hours from Mana sessions linked to a person (instructor) are counted. No hand-entered hours for now (Tegenbutik, Tegenmöte and NSI have no scheduled sessions and are left out).
2. A free class is a whole group class the coach holds unpaid in exchange for training for free. Counted in classes, not hours, and only group classes (class events) count; PT, Onramp and Kids do not. The free ones are the first of each week, in time order.
3. When someone covers a class, the instructor is changed in Mana, so Mana's instructor is the one who held it.
4. PT and Onramp bookings count only when completed.
5. Export as both Excel and CSV, hours as decimals, one column per class type.
6. The check against Fredrik's October hand count waits.

Changed by Max (2026-10-14): no paid or unpaid rules. Every category (class, PT service, course) counts from the start, and owners untick the ones that should not count, right in the month view. The choice is kept until changed.
