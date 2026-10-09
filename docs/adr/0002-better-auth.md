# 0002: Better Auth for sign-in, with no Google login

Status: accepted, 2026-10-08

## Decision
Use Better Auth with email and password. Users and sessions live in the CRM's own Postgres database. There is no Google sign-in and no public sign-up: owners add users.

## Why
Clerk was the alternative, but it stores user data in the US only and cannot be hosted in the EU. Better Auth keeps everything in our own EU database, is free, and has role-based access control built in.

## Consequences
- Login goes through the HTTP auth endpoint, not a server action, so Better Auth's rate limiting protects against password guessing. Counters are stored in the database because serverless instances do not share memory.
- The proxy only checks that a session cookie exists. Every page makes the real check on the server.
- An email-link option is not built yet, because it needs an email provider. Add it with the email work in a later ticket.
- We re-run the schema generation whenever a Better Auth plugin is added or removed.
