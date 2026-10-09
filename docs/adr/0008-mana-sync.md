# 0008: How the CRM reads from Mana

Status: accepted, 2026-10-09

## Decision
The CRM keeps a read-only copy of Mana's people and memberships (`mana_member`, `mana_membership`) and refreshes it with a sync. The sync never writes to Mana.

## How it works
- **One client, GET only** (`src/lib/mana/client.ts`). It has no method that could change anything in Mana, and tests scan the code to keep it that way. The key is read in one server-only file and is never logged, put in an error message or reachable from a client component.
- **Gentle on Mana.** Requests are at least 1.1 seconds apart (Mana allows about one per second per gym). A 429 waits for `Retry-After`, or backs off 2, 4, 8 seconds and so on. Server errors and network failures on a read are retried, a refused key is not. A link that leaves Mana's address is never followed, so the key cannot be sent elsewhere.
- **Strict about what comes back.** Each response is checked against a contract (`contracts.ts`). Mana's API is in alpha, so if a field is renamed or a status we do not know appears, the sync fails with the name of the field instead of quietly storing wrong data. A live check (`MANA_LIVE=1 pnpm test tests/mana.live.test.ts`) tests the real API on demand.
- **What is copied.** For people: name, email, phone and role. For memberships: name, type, status, start date, cancel and commitment dates, a pending cancel or freeze, and the price. Avatars and social settings are not kept.
- **Resumable.** A run reads all pages of people (following the next link), then one request per member (staff and owners have no memberships fetched). Progress is saved after every request. About 460 people take roughly 9 minutes, more than the 5 minutes a Vercel Hobby step may run, so the work is a Vercel Workflow of steps of about 200 seconds. A step that is cut off continues from the saved progress.
- **One run at a time**, enforced by the database (a unique index on running runs). A run that has not moved for 3 minutes is declared dead and replaced.
- **When.** Vercel Cron starts it daily at 03:00 UTC (`vercel.json`, protected by `CRON_SECRET`), and an owner can press "Synka nu".
- **Visible.** A banner on every page shows a running sync, a failed one with its reason, a sync that has never run, or data older than 36 hours.

## Setup notes
- The Mana studio id is stored in the studio settings (set by `pnpm db:seed` from `MANA_STUDIO_ID`). The API key is only an environment variable (`MANA_API_KEY`).
- On Vercel, "Enable access to System Environment Variables" must be switched on in the project's environment variable settings, or Workflow cannot find its backend.
- The proxy must not intercept `/.well-known/workflow/`.
- Deployment Protection can block Vercel Cron. If the daily sync does not start, check that first.

## Consequences
Data is as fresh as the last sync (at most about a day, or minutes after "Synka nu"). Tickets 11, 12, 13 and the Salary module build on this copy and on the same client.
