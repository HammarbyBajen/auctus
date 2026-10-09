# 10: Mana connection and member sync

**What to build:** A background job (Vercel Cron and Workflow) reads members and memberships from Mana (read-only) on a gentle schedule and the app shows when the last sync succeeded or that it is failing. The Mana key lives only in the worker's environment.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Members and their memberships are mirrored into the CRM database
- [x] The sync runs once a day by cron, and an owner can start it with a Sync now button
- [x] A run longer than the 5-minute limit continues in further steps instead of failing
- [x] The worker throttles itself to under one request per second per gym (the known Mana limit) and shares that budget across all sync jobs
- [x] Paging follows the next link until done, and 429 responses are backed off
- [x] The CRM has no code path that writes to Mana
- [x] The app shows last successful sync and an error banner when it fails
- [x] Contract tests on recorded Mana responses fail loudly if the response shape changes
- [x] The key is never logged or sent to the browser

## Verified, and what is still to check on Vercel

Verified locally with a real run against Tegen's Mana (460 people, 424 members, 14 minutes, read-only): the sync, the steps, the throttle, the banner and "Synka nu". Contract tests run against synthetic fixtures, and `MANA_LIVE=1 pnpm test tests/mana.live.test.ts` checks the real API on demand.

Still to check once deployed, because it cannot be tried locally:
- `MANA_API_KEY` and `CRON_SECRET` are set as Vercel environment variables, and "Enable access to System Environment Variables" is switched on.
- The first "Synka nu" on the live site completes (a step must stay under Hobby's 5-minute limit).
- Vercel Cron starts the daily run despite Deployment Protection.
