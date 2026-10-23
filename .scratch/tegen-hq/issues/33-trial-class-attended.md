# 33: Did the trial class happen?

**What to build:** When a lead is at "Bokat provträning", look in Mana's bookings for whether they came. If they came: a task the day after to ask them to join. If they did not show: a task to rebook. Today Fredrik and Timmy have to remember and check by hand.

**Blocked by:** none. Most useful from go-live (18).

**Status:** built (2026-10-23); waiting on Max's look at the copy

**What we know:**
- Class bookings are synced nightly (ticket 13): who, which class, and how it went (booked, checked in, no-show, cancelled).
- A lead is matched to a Mana person by mana_user_id or email; a website lead has to make a Mana account to book, so the match usually exists by the trial.
- Tegen rarely checks people in, so a past booking that stays "booked" counts as attended (as in ticket 13).

**Decided by Max (2026-10-23):** trials are booked outside Mana (only 1 of the 4 leads at Bokat provträning could be found in Mana), so Mana cannot tell whether the lead came. Instead staff note the trial's date, and get a task the day after.

**Built (2026-10-23):** on a lead at Bokat provträning with no open task, the Uppgifter panel asks "När är provträningen?" (a date from two weeks back to three months ahead, today filled in). Saving adds a note "Provträning 28 okt." and a task "Hör hur provträningen gick" for the day after (or today, if that has passed). With a task open the question gives way. The stage change itself is unchanged.

- [x] A lead at Bokat provträning gets a follow-up task the day after the trial
- [x] Works without Mana (trials are booked outside it)
- [x] Tests (the date rules)
