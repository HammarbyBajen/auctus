# 10: Mana connection and member sync

**What to build:** A background job (Vercel Cron and Workflow) reads members and memberships from Mana (read-only) on a gentle schedule and the app shows when the last sync succeeded or that it is failing. The Mana key lives only in the worker's environment.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Members and their memberships are mirrored into the CRM database
- [ ] The sync runs once a day by cron, and an owner can start it with a Sync now button
- [ ] A run longer than the 5-minute limit continues in further steps instead of failing
- [ ] The worker throttles itself to under one request per second per gym (the known Mana limit) and shares that budget across all sync jobs
- [ ] Paging follows the next link until done, and 429 responses are backed off
- [ ] The CRM has no code path that writes to Mana
- [ ] The app shows last successful sync and an error banner when it fails
- [ ] Contract tests on recorded Mana responses fail loudly if the response shape changes
- [ ] The key is never logged or sent to the browser
