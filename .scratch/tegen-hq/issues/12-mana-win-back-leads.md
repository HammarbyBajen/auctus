# 12: Win-back leads from Mana

**What to build:** Cancellations, freezes, ended memberships and day-pass or credit buyers without a membership create leads automatically, each with its own source. Staff pick a reason when they handle one.

**Blocked by:** 10, 03

**Status:** ready-for-agent

- [ ] Detection runs once a day (Hobby cron)
- [ ] Each trigger creates a lead with its own source (cancelled, freeze, ended, day pass)
- [ ] No new lead is created for a person who is already an open lead or was recently dismissed
- [ ] Handling a win-back lead prompts for a reason from an editable list (injury, illness, moved away, found another gym, price, no time, other)
- [ ] Unhandled win-back leads appear on the landing page
- [ ] Rules are covered by tests
