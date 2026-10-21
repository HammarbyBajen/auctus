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

Follow-up (decided by Max, 2026-10-14), before the first members appear on 24 October (every membership started on 23 September, the move to Mana): each row gets Ring, E-post (opens the staff member's own mail program with Tegen's template for the group filled in; templates under Inställningar → Mana, empty until Tegen writes them), Logga kontakt (Pratade med dem takes them off the list; Inget svar and Mejlade eller sms:ade stay, counted as tries), Avfärda with a reason, an optional "Tillbaka senast" day after which they return if still away, and a note. Every note is kept per member across alerts and shown under Historik. The list splits into Aldrig incheckade (no visit at all in Mana) and Slutade komma, shows 10 before Visa alla, and can be shared among staff (Fördela) or assigned per row; Mina on Home shows mine and nobody's. Privacy deletion removes the notes too.

Status note (2026-10-18): built and live; the list starts filling around 24 October. 69 paying members have no visit at all since the move. Mana's "Last seen" is the last sign-in to Mana, not a visit, and the API does not give it, so the list uses gym check-ins and class bookings only. Open with Fredrik or Timmy: how Basic members get into the gym (only through Mana, or also an old Wondr tag, a door code or being let in). That decides whether the 69 have stopped coming or only need help with Mana, and whether the Discord post with the at-risk count says so.

Meeting with Erik (2026-10-21): a rule for people with no visit in the last 21 days. Covered already: owners set the number of days (7 to 180) under Inställningar → Mana, so 21 needs no change (Max). The list moves to a members module of its own, with a summary on Home (ticket 36).
