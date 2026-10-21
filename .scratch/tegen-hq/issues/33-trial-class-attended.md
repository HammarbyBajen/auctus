# 33: Did the trial class happen?

**What to build:** When a lead is at "Bokat provträning", look in Mana's bookings for whether they came. If they came: a task the day after to ask them to join. If they did not show: a task to rebook. Today Fredrik and Timmy have to remember and check by hand.

**Blocked by:** none. Most useful from go-live (18).

**Status:** idea (2026-10-21)

**What we know:**
- Class bookings are synced nightly (ticket 13): who, which class, and how it went (booked, checked in, no-show, cancelled).
- A lead is matched to a Mana person by mana_user_id or email; a website lead has to make a Mana account to book, so the match usually exists by the trial.
- Tegen rarely checks people in, so a past booking that stays "booked" counts as attended (as in ticket 13).

- [ ] A lead at Bokat provträning with a past booking gets a "came" or "did not show" task the day after
- [ ] Nothing for leads without a Mana match
- [ ] Tests
