# 35: Member milestones

**What to build:** A short note to staff when a member reaches a milestone (50th or 100th class, a long weekly streak), so they can congratulate them, and have a natural reason to talk (a friend who might join, a longer membership).

**Blocked by:** 27 (sending email), 36 (where it shows)

**Status:** built (2026-10-23); waiting on migration 0031 in production and Max's look at the copy. Real sending waits for ticket 27 (test mode until then)

**What we know:**
- Mana's `GET /user-stats?userId=` gives classesTotal, classesThisYear, streakWeeks and lastBookingAt, one request per person (about 470 a night for everyone: too many for the budget, see 28). Our own visits mirror starts with the move to Mana (23 September), so it cannot count a 100th class on its own; read user-stats once, then count on from our visits.

**Meeting with Erik (2026-10-21):** the owner sets up the milestones and the message themselves, and it must be easy. Decided by Max: the message is sent by staff with one click (Tegen HQ fills in the owner's template, a person presses Skicka); fully automatic can come later, once it has proven itself. Milestones show as a group in the members module (ticket 36).

**Needs first:** real email sending (ticket 27: Erik's webhook secret, the sender address on crossfittegen.se). Today nothing is ever sent to members; a milestone email is the first thing that is, so check that Tegen's privacy policy covers it (it is a service message to a member, not marketing, if it only congratulates).

- [x] Owners set up milestone rules without help: what counts (classes in total, weeks in a row) and the number, as simple fields, no codes
- [x] Owners write the message per rule, with the member's first name and the milestone filled in, and see a preview
- [x] A member who reaches a milestone shows up in the Milstolpar group (ticket 36) with the message ready; one click sends it, and it is logged
- [x] One message per milestone per member, never twice
- [x] Tests
- [ ] Migration 0031 in production (Max), copy approved, pushed; real sending with ticket 27

**Decided by Max (2026-10-23):** classes in total and weeks in a row; defaults 100, 250, 500, 1000 classes and 10, 26, 52 weeks; a row on Medlemmar until handled (gone after 30 days); the owners' message plus "Föreslå mejl" when the assistant is on.

**What we learnt (2026-10-23):** Mana's `user-stats` has each member's whole history (the three most active: 883, 953 and 688 classes) and counts gym check-ins as classes; its weeks in a row include the current week.

**Built (2026-10-23):**
- Each night, Mana's figures (classes in total, weeks in a row) are read for up to 60 paying members (one request each) until all are read, then again after 30 days.
- Tegen HQ counts on from the visits it syncs (classes booked or checked in, and gym check-ins). A milestone counts only when it is crossed since the last night, so nobody is congratulated on an old one, and a milestone added later applies from then on. Once per member and milestone.
- Medlemmar → Milstolpar: name, the milestone, when, memberships; E-post (the owners' message filled in, "Föreslå mejl" with the assistant), Ring, Klar, Hoppa över. Gone after 30 days if nobody acts. Home's summary counts them.
- Inställningar → Milstolpar: each milestone's message ({förnamn}, {antal}) with a preview, on or off, remove; add a milestone.
- New tables milestone_rule, member_stats, milestone_hit (migration 0031); privacy deletion removes a member's milestones and figures.
