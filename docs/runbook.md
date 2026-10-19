# Tegen HQ runbook

How Tegen HQ runs, and what to do when something breaks. For whoever keeps it running (today Max at LAB37). Written 2026-10-19 for go-live (ticket 18).

## The parts

| Part | Where | Notes |
|---|---|---|
| The app | Vercel, project `auctus`, region **fra1** (Frankfurt) | https://auctus-eight.vercel.app. Hobby plan. Every push to `main` deploys to production in about a minute. |
| Database | Neon (through Vercel's integration), **eu-central-1** (Frankfurt) | Postgres. Schema changes are Drizzle migrations in `drizzle/`. |
| Members and visits | Mana (getmana.app), read only | One key (`MANA_API_KEY`). Tegen HQ never writes to Mana. Mana's API is in alpha and has no contact for API questions. |
| Leads from the website | tegen-web (LAB37, Erik) posts each lead to `POST /api/leads/intake` | Tegen HQ is the sixth destination; email, Discord #tegen-leads, Notion, Pipedrive and Meta keep working without it. Contract: `docs/lead-intake.md`. |
| Email | Resend, Erik's account (the one tegen-web uses) | Test mode: every email goes to Resend's test address until `EMAIL_LIVE=true` and an owner switches it on. |
| Notices | Discord webhook, a test channel only Max and Erik see | Overdue first contact, and the morning summary. |

## Scheduled jobs (Vercel Cron, `vercel.json`)

| Job | UTC | Stockholm (summer / winter) | What it does |
|---|---|---|---|
| `/api/cron/mana-api-watch` | 02:00 | 04:00 / 03:00 | Reads Mana's API spec and notes changes (Inställningar → Mana). |
| `/api/cron/mana-sync` | 03:00 | 05:00 / 04:00 | Mirrors members and memberships, visits and day passes; then moves leads who joined to Medlem, finds win-backs and at-risk members, and saves the day's numbers. Partial most nights, a full pass on the night to Monday (ticket 28). |
| `/api/cron/daily-summary` | 05:00 | 07:00 / 06:00 | Posts the morning summary to Discord. |

A job can be started by hand with `vercel crons run <path>` (it uses Vercel's own secret). Avoid extra Mana syncs: the key has a request budget (about 1,000 a day, not documented by Mana) shared with everything else.

## Settings and secrets

Set in Vercel (`vercel env add NAME production --sensitive`, pasted in the terminal, never in a chat or a file in the repo), then redeploy (push, or redeploy in Vercel). Locally they live in the git-ignored `.env.local` and `.env.production.local`.

| Name | What | If it leaks or must change |
|---|---|---|
| `DATABASE_URL` (and Neon's other `PG*` / `POSTGRES_*`) | The database | Rotate the password in Neon; Vercel's integration updates the variables. |
| `BETTER_AUTH_SECRET` | Signs sign-in sessions | Set a new one: everyone is signed out and signs in again. |
| `MANA_API_KEY` | Reading Mana | Make a new key in Mana's studio admin, set it, redeploy; the next sync shows whether it works. |
| `LEAD_INTAKE_SECRET` | What tegen-web sends as `Authorization: Bearer` | Change it in Tegen HQ and in tegen-web at the same time (Erik); until both match, calls are turned away and listed under Inställningar → Inkommande leads. Leads still reach the other five destinations. |
| `RESEND_API_KEY` | Sending email (Erik's account) | Erik makes a new key; set it here. |
| `RESEND_WEBHOOK_SECRET` | Checking Resend's delivery reports | Not set yet (waiting for Erik); without it delivery statuses do not come back. |
| `EMAIL_LIVE` | `true` lets email reach real people (with an owner's switch) | Unset today on purpose: test mode. |
| `DISCORD_WEBHOOK_URL` | Notices to the test channel | Make a new webhook in Discord, set it. |
| `CRON_SECRET` | Lets only Vercel Cron start the jobs | Set a new one; Vercel uses it automatically. |

## Deploying and rolling back

- Deploy: push to `main`. Check with `vercel ls auctus` (the table is printed on stderr: use `2>&1`) or in Vercel's dashboard.
- Roll back: in Vercel, open an earlier production deployment and promote it (or `vercel rollback`). A rollback does not undo a database migration.
- Database changes: `pnpm db:generate` makes a migration from `src/db/schema.ts`; production is migrated by hand, before the code that needs it goes out:
  `(set -a; . ./.env.production.local; set +a; pnpm db:migrate)`
  Migrations only add or drop; write them so the code running before them still works for the minute between migrating and deploying.

## When something breaks

**The Mana sync failed or is late** (red banner in the app, or Inställningar → Mana shows "Misslyckades")
1. Read the reason under Inställningar → Mana.
2. "Mana-nyckeln fungerar inte": the key is wrong or revoked. Check it in Mana, set a new one.
3. "frågar för ofta (429)" or "förfrågningar är slut": Mana's request budget is spent. The sync already pauses 15 minutes at a time for up to two hours; if it still failed, wait for the next night. Do not run extra syncs.
4. A message naming a field or an unexpected value: Mana's API changed. Check Inställningar → Mana (the API watch) and the contract in `src/lib/mana/contracts.ts`.
5. "Synka nu" runs a partial pass on weekdays; the full pass runs on the night to Monday.

**Leads from the website are not arriving**
1. Inställningar → Inkommande leads: the latest submissions, and calls that were turned away with the reason (no secret, wrong secret, wrong format).
2. Nothing listed at all: tegen-web is not calling. Ask Erik (the other five destinations show whether leads are coming in at all).
3. Vercel keeps function logs for about an hour on Hobby, so look soon.

**Email is not sent or shows "Misslyckades"**
1. The lead or member page shows each email and its status. Test mode sends only to Resend's test address.
2. "Misslyckades" with a reason: usually the sender address or the key. Check Inställningar → E-post.
3. An address on the suppression list (bounced or reported as spam) gets nothing; that is on purpose.

**Discord notices stopped**: check `DISCORD_WEBHOOK_URL` and that the webhook still exists in the channel.

**The app is down or slow**: Vercel's dashboard (deployments, functions), then Neon's (is the database up). The first page after a quiet spell can take a second while the database wakes.

## Data, restore and privacy

- No separate backups (decided with Erik). Neon keeps a restore window (point-in-time restore); the leads also exist in Notion and Pipedrive. Check the length of the window in Neon: project → Settings → (history / restore window).
- **Restoring:** in Neon, create a branch from a point in time before the problem, check it, then restore the main branch from it (Neon: Restore). Restoring replaces everything after that point, including real work done since; prefer copying back only what was lost.
- **Try a restore once** (ticket 18): create a branch from an hour ago, point a git-ignored env file at it, count leads, people and members against production with a read-only script, then delete the branch.
- **Deleting a person** on request: Inställningar → Integritet, or "Radera personen" on the lead. It removes the person, their leads, notes, tasks, submissions and emails; a suppressed email address stays so they are never mailed again; Mana data comes back from Mana (erasure there is done in Mana).
- Personal data never goes into the repo, Notion or chat; scripts against production print counts only.

## Who to ask

| Area | Who |
|---|---|
| Tegen HQ itself (code, Vercel, Neon) | Max (LAB37) |
| tegen-web, the intake secret on their side, Resend, Discord, Pipedrive | Erik (LAB37) |
| How Tegen works, staff accounts, what to change | Fredrik and Timmy (CrossFit Tegen) |
| Mana | Through Tegen's account; Mana has no contact for API questions (Erik, 2026-10) |

Phone numbers and emails are kept outside the repo.
