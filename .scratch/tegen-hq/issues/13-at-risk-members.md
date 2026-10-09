# 13: At-risk members (30-day rule)

**What to build:** Paying members with no check-in or class booking in 30 days appear on the landing page and become tasks, so owners can ask how they are doing. Alerts are staff-only.

**Blocked by:** 10, 04, 05

**Status:** ready-for-agent

- [ ] Detection runs once a day (Hobby cron), and the landing page shows the latest result
- [ ] Visits are synced from Mana check-ins and class bookings
- [ ] A paying member with no visit in 30 days gets one alert and one task
- [ ] Members on a freeze never trigger an alert
- [ ] An alert can be dismissed with a reason and does not return for that reason
- [ ] The 30-day threshold is editable by Owners
- [ ] Nothing is ever shown to members or sent to them
