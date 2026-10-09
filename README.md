# Tegen CRM

A lead and retention CRM for CrossFit Tegen, built on top of Mana. See [docs/PRD.md](docs/PRD.md) for the plan and `.scratch/tegen-crm/issues/` for the tickets.

## Getting started

1. Install: `pnpm install`
2. Copy `.env.example` to `.env.local` and fill it in (never commit it).
3. Create the database tables: `pnpm db:migrate`
4. Create the Tegen studio and the first owner: `pnpm db:seed`
5. Run: `pnpm dev`, then open http://localhost:3000

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the app locally |
| `pnpm test` | Run the tests (database tests need `DATABASE_URL`) |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm db:generate` | Create a migration after changing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Create the studio, settings and first owner |
| `pnpm tsx scripts/dev-user.ts` | Create a throwaway local owner (`dev-owner@example.test`) for trying the app. Refuses to run unless the database is on localhost. The password is saved as `DEV_USER_PASSWORD` in `.env.local`. |

Decisions are recorded in [docs/adr](docs/adr).
