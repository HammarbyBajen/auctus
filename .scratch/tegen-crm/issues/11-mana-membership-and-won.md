# 11: Mana membership on leads and automatic Won

**What to build:** When a lead's email or phone matches a Mana member, the lead shows their membership and moves to Won automatically.

**Blocked by:** 10, 03

**Status:** ready-for-agent

- [x] A matching member is linked to the lead by email, then phone
- [x] The lead shows the member's actual membership
- [x] Opening a lead checks Mana for that person right away, so Won does not wait for the daily sync
- [x] The lead moves to Won once, and the move is recorded in the history
- [x] A lead with no Mana match is unchanged
- [x] Matching and Won detection are covered by tests

## Rules decided while building

- Matching: email first (exactly one Mana person), then phone only if exactly one Mana person has that number.
- A membership counts when it is active or upcoming and not unticked on the Mana page ("Vad räknas som medlemskap?"). Förvaringsbox should be unticked.
- Automatic Won only when a counting membership started on or after the day the lead came in, so an existing member who gets in touch is shown as "Redan medlem" but not closed. It happens at most once per lead, so an owner who moves it back is not overridden. Unticking a membership later does not undo a Won that already happened.
- Checked after every sync, and live (in the background, at most every 10 minutes per person) when a lead is opened.
