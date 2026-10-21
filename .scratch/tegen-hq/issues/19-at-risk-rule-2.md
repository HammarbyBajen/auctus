# 19: At-risk Rule 2 (deferred)

**What to build:** Flags members whose visits in the last 30 days are less than half of their own 3-month average. It waits until Mana has enough history (Mana data starts September 2026, so around January 2027).

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] A member with at least 3 months of history and a drop below 50 percent gets an alert and a task
- [ ] Members without enough history are skipped, not flagged
- [ ] The 50 percent figure is editable by Owners
- [ ] Covered by tests with dated visit data

Meeting with Erik (2026-10-21): a drop in activity is shown in the members module (ticket 36) as its own group, "Tränar mindre", next to the fixed rule's groups from 13, not as alerts and tasks.
