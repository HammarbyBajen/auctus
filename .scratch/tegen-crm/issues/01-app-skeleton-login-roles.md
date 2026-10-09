# 01: App skeleton with login and roles

**What to build:** A deployed Swedish-language web app where an owner signs in with email and password (or an email link) through Better Auth (Clerk was the alternative) and lands on an empty home page. Owner and Staff roles exist and are enforced. This is the tracer bullet through database, auth, UI, tests and deployment.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] A user can sign in and sign out, and an unknown email cannot sign in
- [x] Owner and Staff roles exist, and a Staff user cannot open the settings area
- [x] UI strings are in Swedish and live in translation files
- [x] Core tables carry a studio id, and the Mana credentials and thresholds are settings, not code
- [ ] The app runs in the chosen hosting setup and the test suite runs in CI (pending: Vercel database and environment variables, CI run)
- [x] Everything runs on Vercel (app, Marketplace Postgres in an EU region, background jobs), and the decision, the provider choice and the Better Auth choice are recorded as ADRs
- [x] The UI is simple and in plain Swedish for users who are not very digital: few buttons per screen, no technical terms, and it also works on a phone
- [x] The decision to start on Vercel Hobby (daily cron, 5-minute function limit) is recorded, with a note to revisit Pro
- [x] Owner and Staff are fixed roles with no per-person overrides, and the Better Auth choice is recorded
