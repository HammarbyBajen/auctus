# 23: Salary (WFM): lock month and export

**What to build:** Fredrik locks a month and exports names and hours for the accountant. The month is refreshed from Mana just before locking, and a locked month then does not change when data or rules change afterwards. Acceptance is that one real month matches his hand count.

**Blocked by:** 22

**Status:** ready-for-agent

- [ ] Locking prompts a refresh from Mana first if the last pull is old
- [ ] Locking freezes the month's figures and records who locked it and when
- [ ] Edits to people, rules or Mana data after locking do not change a locked month
- [ ] Export gives names and hours (hours per class type, free hours, hours to pay) as a file the accountant can open
- [ ] A locked month can be unlocked only by an Owner, and that is recorded
- [ ] The October 2026 list matches what Fredrik counted by hand
- [ ] Month data from September 2026 is marked as migration test data
