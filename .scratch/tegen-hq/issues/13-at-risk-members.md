# 13: At-risk members (30-day rule)

**What to build:** Paying members with no check-in or class booking in 30 days appear on the landing page and become tasks, so owners can ask how they are doing. Alerts are staff-only.

**Blocked by:** 10, 04, 05

**Status:** done (2026-10-13)

- [x] Detection runs once a day (Hobby cron), and the landing page shows the latest result
- [x] Visits are synced from Mana check-ins and class bookings
- [x] A paying member with no visit in 30 days gets one alert and one task
- [x] Members on a freeze never trigger an alert
- [x] An alert can be dismissed with a reason and does not return for that reason
- [x] The 30-day threshold is editable by Owners
- [x] Nothing is ever shown to members or sent to them

Notes (decided by Max, 2026-10-13): at-risk members get their own list on Home ("Hör av dig till") instead of leads and tasks, so members stay out of the sales pipeline. Each row: name, last visit (or start of paying), memberships, Ring, Kontaktad, Avfärda with a reason (semester, skada eller sjukdom, annat). A handled alert comes back only after a new visit and a new absence. A visit is a gym check-in or a past class that is booked or checked in (Tegen rarely checks people in, so past bookings mostly stay "booked"); cancelled, no-show and wait list are not. Customers only (Mana role member). The threshold (7-180 days) is under Inställningar → Mana. Still to do outside the code: state the use of attendance data in Tegen's privacy policy (PRD, GDPR section).
