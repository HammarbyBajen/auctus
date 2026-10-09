# 18: Review where we land, then go-live

**What to build:** The CRM has run alongside Pipedrive on real leads (a copy from `tegen-web`), with no notifications to Fredrik or Timmy. Together with Erik, review where we landed: does the CRM hold every lead, do its counts match LAB37's reports, and is it ready for the owners? Only after that review do notifications and accounts go to Fredrik and Timmy, and is Pipedrive's future decided.

**Blocked by:** 09, 11, 15

**Status:** ready-for-agent

- [ ] For an agreed period, every real lead in Notion is also in the CRM, and the counts match LAB37's reports
- [ ] The review with Erik has happened and its decisions are written down (notifications, accounts for Fredrik and Timmy, and whether and when the CRM takes over from Pipedrive)
- [ ] The database provider's point-in-time restore is switched on and a restore has been tried once
- [ ] A runbook covers deploy, the Mana key, the intake secret, sync failures and who to call
- [ ] Notifications move from the test channel to the owners only as decided at the review
- [ ] Owners have been walked through the system
