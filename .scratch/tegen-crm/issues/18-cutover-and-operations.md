# 18: Cutover and operations

**What to build:** Production is ready: the database provider's restore features are switched on, a runbook exists, leadfabrik delivers to the CRM, and Pipedrive stays read-only for two weeks before it is cancelled.

**Blocked by:** 09, 11, 15

**Status:** ready-for-agent

- [ ] The database provider's point-in-time restore is switched on and a restore has been tried once
- [ ] A runbook covers deploy, the Mana key, sync failures and who to call
- [ ] Leadfabrik sends leads to the CRM and Pipedrive is no longer a destination
- [ ] Pipedrive is read-only for two weeks after cutover
- [ ] Owners have been walked through the system
