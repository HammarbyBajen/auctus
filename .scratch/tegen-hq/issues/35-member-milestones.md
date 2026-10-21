# 35: Member milestones

**What to build:** A short note to staff when a member reaches a milestone (50th or 100th class, a long weekly streak), so they can congratulate them, and have a natural reason to talk (a friend who might join, a longer membership).

**Blocked by:** 27 (sending email), 36 (where it shows)

**Status:** idea (2026-10-21)

**What we know:**
- Mana's `GET /user-stats?userId=` gives classesTotal, classesThisYear, streakWeeks and lastBookingAt, one request per person (about 470 a night for everyone: too many for the budget, see 28). Our own visits mirror starts with the move to Mana (23 September), so it cannot count a 100th class on its own; read user-stats once, then count on from our visits.

**Meeting with Erik (2026-10-21):** the owner sets up the milestones and the message themselves, and it must be easy. Decided by Max: the message is sent by staff with one click (Tegen HQ fills in the owner's template, a person presses Skicka); fully automatic can come later, once it has proven itself. Milestones show as a group in the members module (ticket 36).

**Needs first:** real email sending (ticket 27: Erik's webhook secret, the sender address on crossfittegen.se). Today nothing is ever sent to members; a milestone email is the first thing that is, so check that Tegen's privacy policy covers it (it is a service message to a member, not marketing, if it only congratulates).

- [ ] Owners set up milestone rules without help: what counts (classes in total, classes this year, weeks in a row) and the number, as simple fields, no codes
- [ ] Owners write the message per rule, with the member's first name and the milestone filled in, and see a preview
- [ ] A member who reaches a milestone shows up in the Milstolpar group (ticket 36) with the message ready; one click sends it, and it is logged
- [ ] One message per milestone per member, never twice
- [ ] Tests
