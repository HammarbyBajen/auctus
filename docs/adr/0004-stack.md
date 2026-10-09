# 0004: Next.js, TypeScript, Drizzle and Postgres

Status: accepted, 2026-10-08

## Decision
Next.js 16 (App Router) with TypeScript and Tailwind, Drizzle ORM on Postgres through the `pg` driver, Vitest for tests, pnpm as the package manager, and Swedish strings in `src/messages/sv.json`.

## Why
It runs well on Vercel, is the stack the team knows, and Drizzle gives typed SQL and plain migrations that work with any Marketplace Postgres (Neon or Supabase). Cache Components is switched off: the CRM is dynamic and per-user, so prerendering gives nothing and adds complexity.

## Consequences
- Core tables carry a `studio_id`, and thresholds and Mana connection details live in a settings table, so a second gym is possible later (one deployment per gym).
- The Mana API key is an environment variable and is only used by the background jobs.
- Migrations are run with `pnpm db:migrate` and are not part of the Vercel build.
- If the database becomes Neon, consider the `@neondatabase/serverless` driver for lower connection overhead.
