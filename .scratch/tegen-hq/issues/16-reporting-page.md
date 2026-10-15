# 16: Reporting page

**What to build:** One page shows leads per source and month, conversion to Won, and average time to first contact.

**Blocked by:** 09, 11

**Status:** done (2026-10-15)

- [x] Leads per source and per month are shown
- [x] Conversion from lead to Won is shown
- [x] Average time to first contact is shown
- [x] Numbers match a hand count on a small test data set

Notes (2026-10-15): Rapport (/rapport, everyone who works leads; in the sidebar, and on a phone from the Leads page). Twelve months, leads per source and month by the month they came in. Won is the first move to a Won stage. First contact is a person's first logged call or email, or moving the lead out of the first stage (not what the CRM does by itself); shown as median, average and the share within the first-contact limit from Tidsgränser (following the days the clock runs). Leads imported from Pipedrive count in leads per source but not in conversion or contact time: the import left out won deals, and their history was written on the day of the import. Checked against hand counts in tests/report.test.ts and tests/report.integration.test.ts.
