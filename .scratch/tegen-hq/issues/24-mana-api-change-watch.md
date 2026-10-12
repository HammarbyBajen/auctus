# 24: Mana API change watch

**What to build:** A daily job checks Mana's public OpenAPI spec and documentation for changes and alerts Max and the owners when something changed, because Mana's API is in alpha and may break the sync without warning.

**Blocked by:** 01

**Status:** done (2026-10-12)

- [x] A daily scheduled job fetches the OpenAPI spec and stores a copy and a hash
- [x] A change in the spec produces an alert showing which endpoints or fields changed
- [x] No alert is sent when nothing changed
- [x] A failure to fetch is reported, not silently ignored
- [x] The job uses no API key (the spec is public)

Notes: the alert is an in-app notice for owners (danger when an endpoint the sync reads changed) with the details under Inställningar → Mana, until someone marks it checked; email or Discord can follow once Erik picks a channel. Wording-only changes save a new copy without an alert. Cron at 02:00 UTC, an hour before the sync (decided by Max, 2026-10-12).
