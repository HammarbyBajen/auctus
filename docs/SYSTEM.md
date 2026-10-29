# Tegen HQ: what has been built

Written for an AI agent (or a new developer) opening this repository for the first time. It says what the system is, how the pieces fit, what the rules are, and where to look. It describes the state on 2026-10-28. For the original plan read `docs/PRD.md`; for operating it read `docs/runbook.md`; for how it should look read `docs/DESIGN.md`; for the history of each feature read the tickets (37, each with its decisions), kept outside the repo in `../Auctus-notes/tegen-hq/issues/`.

## What it is

Tegen HQ is a CRM for one gym, CrossFit Tegen in Stockholm, built by Max (LAB37) for the two owners, Fredrik and Timmy, and their coaches. It does two jobs:

1. **Leads:** everyone who wants to start training, from first contact to member or cold.
2. **Members:** everyone who already trains, found in Mana (the gym's booking and membership system), with a list of those who need a word from staff.

Around those: a wiki for routines (Handbok), coach hours for payroll (Timmar), a report page (Rapport), and an AI assistant. The guiding question for every change is: does it help Fredrik and Timmy sell more or work less. Features for their own sake are not built.

Swedish throughout the UI (`src/messages/sv.json`, read through `t()` in `src/lib/i18n.ts`). Code, comments, commits and tickets are in English. UI copy is written or approved by Max.

## Stack

Next.js 16 App Router (server actions, no API layer of its own except the four routes below), React 19, Tailwind v4, Base UI, Drizzle ORM on Postgres (Neon in production, local Postgres in development), better-auth for sign-in, Vercel (region fra1) with Vercel Cron and Vercel Workflow for the nightly jobs, Resend for email, the Anthropic SDK for the assistant, Tiptap for the wiki editor, Vitest for tests. One studio in the database (`studio` table) with everything scoped by `studio_id`; the code is written for several but only Tegen exists.

Read `node_modules/next/dist/docs/` before writing Next.js code: this version differs from older ones (`AGENTS.md`).

## The shape of the code

```
src/app/(app)/        pages and server actions, one folder per module (leads, medlemmar, handbok, rapport, timmar, installningar)
src/app/api/          the only HTTP endpoints: leads/intake (website → lead), email/webhook (Resend events),
                      cron/{mana-sync, mana-api-watch, daily-summary}, auth/[...all]
src/lib/<module>/     all logic, pure where it can be (calc files) and database-facing in service.ts files
src/db/schema.ts      every table, with a comment per column that matters (48 tables)
src/workflows/        the nightly Mana sync as Vercel Workflow steps
drizzle/              migrations, numbered; 0035 is the latest
tests/                one file per module; *.integration.test.ts need DATABASE_URL
scripts/              seed, dev user, Pipedrive import; scripts/_*.ts are ignored by git (temporary)
docs/                 PRD, design system, runbook, lead-intake contract, ADRs, this file
../Auctus-notes/     tickets and working notes, outside the repo (not on GitHub), never personal data
```

Every page calls `requireUser()` or `requirePermission(resource, action)` from `src/lib/session.ts`. Roles are two: `owner` and `staff`, fixed in `src/lib/permissions.ts`. The role is read fresh from the database on every request, so a change applies at once.

## Modules, what each does

**Leads** (`src/lib/leads`, `src/lib/pipeline`, `src/lib/tasks`, `src/lib/home`). A `person` (name, email, phone, link to Mana) can have several `lead`s over time. A lead has a stage (`pipeline_stage`, editable by owners: Ny lead, Kontaktad, Bokat möte, Bokat provträning, Konsultation klar, Prisinformation, Medlem, Kall lead), a source, notes, logged contacts, tasks with due dates, and an assignee. People are matched by email, then phone; a known person whose latest lead is open gets a note on it instead of a second lead; one whose latest lead is cold gets a fresh lead. Leads arrive from the website (`POST /api/leads/intake`, contract in `docs/lead-intake.md`, shared secret, idempotent per sender id), by hand, or came from a Pipedrive import. Mana makes no leads. Home shows what needs attention: first-contact deadline (24 h, owners set it), tasks due, leads standing still per stage. The rules are pure functions in `src/lib/home/attention.ts`.

**Members** (`src/lib/mana`). Every night the sync mirrors Mana: members, memberships, visits (class bookings and gym check-ins), day-pass and klippkort purchases, and klippkort balances. From that it keeps the Medlemmar list (`at_risk_alert` rows, one per member and cause): `away` (no visit in 30 days), `new` (a new member 10 days without a visit), `never` (no visit at all), `cancelling` and `freezing` (notice given or freeze ahead in Mana, with the date), `ended` (membership ended), `day_pass` and `klippkort` (training without a membership; a klippkort row appears when the card runs low). Each row carries notes, logged contacts, an assignee, and is dismissed with a reason. Rows close by themselves when the cause is gone; a row staff handled stays closed until a new visit, a row that closed by itself comes back. Milestones (100/250/500/1000 classes, 10/26/52 weeks in a row) are their own list. A lead whose person buys a membership in Mana moves to Medlem by itself.

**Handbok** (`src/lib/handbook`). A wiki of routines in categories, Tiptap documents stored as JSON, every save a version, archive and restore, conflict check on save, editors chosen by owners. The assistant reads it to answer questions. A "Tegen HQ" category holds guides for using the app itself.

**Timmar** (`src/lib/salary`). Coach hours per month from Mana's class events, PT bookings and course sessions, per category; owners tick which categories count. Each coach has a gross pay per hour; the month shows hours × rate. Locking a month freezes its figures (hours and rates) as a snapshot; only an owner can unlock. Export as Excel or CSV. A locked month can be emailed to the accountant with the file attached.

**Rapport** (`src/lib/reports`, `src/lib/kpi`). Leads per month and source, conversion, first-contact times, paying members and revenue per month from Mana, with a snapshot per day (`kpi_snapshot`). Owners can ask the assistant questions here.

**Email** (`src/lib/email`). One-to-one email from a lead or a member row, through Resend, with templates per Medlemmar group. Three modes: `dry_run` (no key), `test` (everything goes to Resend's test address), `live` (needs the server flag, an owner's switch and a sender on Tegen's domain). Production is in test mode until Erik sets the sender (ticket 27). Delivery events come back through the webhook; a hard bounce suppresses the address.

**Assistant** (`src/lib/ai`). Only `client.ts` talks to Anthropic. Every call is logged in `ai_suggestion` with its cost, checked against a monthly cap first, and is only ever a suggestion a person approves. What it does: a short summary of a lead before a call, proposed steps from a note after a call, email drafts in Tegen's tone, answers to owners' questions from a bundle of figures (`facts.ts`), a Monday summary to Discord. Before anything is sent, `privacy.ts` removes contact details, personal numbers, and any note or form answer that mentions health (a word list plus the studio's own words); private notes never go.

**Settings** (`src/app/(app)/installningar`). Owners only: stages and reasons, time limits, users, email, assistant, Handbok editors, milestones, the Mana connection (and whether Mana's signals go to Medlemmar), privacy deletion.

**Privacy** (`src/lib/privacy`). Deleting a person removes their leads, notes, history, tasks, emails, web submissions, member notes, alerts, milestones and AI rows, and logs counts only. Suppressed email addresses stay so nobody is mailed again.

## The nightly jobs (Vercel Cron, UTC)

- 02:00 `mana-api-watch`: compares Mana's API spec with the last copy and warns on the Mana settings page if something the sync reads changed.
- 03:00 `mana-sync`: a Vercel Workflow (`src/workflows/mana-sync.ts`). Steps: visits and purchases, then members in batches (partial most nights: only who can have changed; full on Mondays), klippkort balances, member stats for milestones, then after-sync (link people to Mana, move leads to Medlem, Medlemmar rows, milestones, the day's KPI snapshot). Mana rate-limits, so the run paces itself, pauses when told to, and never runs twice at once. A failing visit sync leaves the Medlemmar list untouched that night; a failure after the sync marks the night failed.
- 05:00 `daily-summary`: yesterday's numbers to Discord; on Mondays the assistant's weekly summary too.

Each cron route needs `Bearer CRON_SECRET`. Runs are in `sync_run` with progress; the Mana settings page shows them.

## Rules that are not obvious from the code

- Nothing writes to Mana, Pipedrive or Notion. Mana is read only.
- Production data changes are made by Max, with an explicit yes; scripts against production print counts, never personal data. Personal data never goes into the repo, tickets, Notion or chat.
- Secrets live in `.env.local` (local) and Vercel (production), never in the repo. The Mana key is used only by background jobs.
- Push only when Max says "push". Migrations in production are run by Max.
- Time is Stockholm time for every day boundary (`src/lib/tasks/dates.ts`, `src/lib/home/time.ts`); the database stores UTC.
- No em dashes anywhere. Empty values are written as words, never a dash. A test enforces the design rules (`tests/design-invariants.test.ts`).
- Test email addresses end in `example.test`.

## Where things stand (2026-10-28)

Live in production and used: everything above. Not yet gone live as the only system: Fredrik and Timmy still work leads in Pipedrive until the cutover (ticket 18); Tegen HQ is kept in step with a Pipedrive import until then (`scripts/import-pipedrive.ts`, which refuses to replace leads staff have worked on). Waiting on others: the live email sender and webhook secret (Erik, ticket 27), the October hours check (Fredrik, ticket 23), Notion lead counts for the comparison (Erik, ticket 18). Deferred: a second at-risk rule needing three months of visit history (ticket 19, January), trial offers in Mana (ticket 32), an MCP server so staff can use their own agent (ticket 30 phase F).

## If you are an agent asked to change something

1. Read the ticket in `../Auctus-notes/tegen-hq/issues/` for the module (ask Max if you do not have it); decisions and the reasons are there.
2. Find the rule in `src/lib/<module>/`, change it once in the shared code, and update the test beside it (`tests/<module>*.test.ts`). Database tests need a local `DATABASE_URL`.
3. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`.
4. Copy shown to users goes in `src/messages/sv.json` and is approved by Max before it ships.
5. Do not push, run production migrations, or change production data without Max's say-so.
