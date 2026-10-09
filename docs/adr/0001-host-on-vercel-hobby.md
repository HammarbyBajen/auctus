# 0001: Host everything on Vercel, starting on the Hobby plan

Status: accepted, 2026-10-08

## Decision
The web app, the Postgres database (from the Vercel Marketplace, EU region) and the background jobs all run on Vercel. No Lab37 office server is used. The project starts on the Hobby plan.

## Why
Erik and Max chose Vercel for the app, and answered that no backups or extra servers are needed for now. One platform means nothing for Lab37 to maintain.

## Consequences
- Hobby allows cron jobs only once a day, at an imprecise time within the hour, and a function or workflow step may run for at most 5 minutes. The CRM is designed for that: the attention views are calculated when a page opens, the Mana sync and detection run daily, and owners can press "Sync now". Long jobs continue in further steps.
- Vercel describes Hobby as non-commercial. Revisit upgrading to Pro before Tegen's business relies on the CRM, or if we need cron more often than daily.
- Backups are not set up. Switch on the database provider's built-in restore. Notion (leadfabrik sink) and Pipedrive still hold the leads.
- The database region must be in the EU. Check it in the Marketplace setup screen (Frankfurt is available at Supabase, Neon's regions are to be confirmed).
