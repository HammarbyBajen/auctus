# 24: Mana API change watch

**What to build:** A daily job checks Mana's public OpenAPI spec and documentation for changes and alerts Max and the owners when something changed, because Mana's API is in alpha and may break the sync without warning.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A daily scheduled job fetches the OpenAPI spec and stores a copy and a hash
- [ ] A change in the spec produces an alert showing which endpoints or fields changed
- [ ] No alert is sent when nothing changed
- [ ] A failure to fetch is reported, not silently ignored
- [ ] The job uses no API key (the spec is public)
