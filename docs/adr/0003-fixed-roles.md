# 0003: Two fixed roles, Owner and Staff

Status: accepted, 2026-10-08

## Decision
v1 has exactly two roles, Owner and Staff, defined in code (`src/lib/permissions.ts`). There are no per-person permission overrides and no role editor. Owners can do everything, including settings, users and the Salary (WFM) module. Staff can work with leads and tasks.

## Why
There are two to five users. Editable roles add a lot of complexity for little value. Better Auth's access control lets us add per-person permissions or a role editor later without a rewrite.

## Consequences
New features add a resource and the actions each role may perform. A role editor and per-person permissions are deferred.
