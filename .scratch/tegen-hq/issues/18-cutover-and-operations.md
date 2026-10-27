# 18: Review where we land, then go-live

**What to build:** The CRM has run alongside Pipedrive on real leads (a copy from `tegen-web`), with no notifications to Fredrik or Timmy. Together with Erik, review where we landed: does the CRM hold every lead, do its counts match LAB37's reports, and is it ready for the owners? Only after that review do notifications and accounts go to Fredrik and Timmy, and is Pipedrive's future decided.

**Blocked by:** 09, 11, 15

**Status:** in progress (preparation started 2026-10-19): runbook written; lead comparison running; restore not yet tried

- [ ] For an agreed period, every real lead in Notion is also in the CRM, and the counts match LAB37's reports
- [ ] The review with Erik has happened and its decisions are written down (notifications, accounts for Fredrik and Timmy, and whether and when the CRM takes over from Pipedrive)
- [ ] The database provider's point-in-time restore is switched on and a restore has been tried once
- [x] A runbook covers deploy, the Mana key, the intake secret, sync failures and who to call (docs/runbook.md, 2026-10-19)
- [ ] Notifications move from the test channel to the owners only as decided at the review
- [ ] Owners have been walked through the system
- [ ] The day before go-live, the Pipedrive import is replaced once more (`pnpm import:pipedrive --replace`) so stages are current, and the oldest open leads are reviewed once (moved to Kall or parked with "Vänta till", ticket 29), so Home starts clean

Preparation (2026-10-19):
- Runbook: docs/runbook.md (the parts, scheduled jobs, settings and what to do if one leaks, deploy and roll back, what to do when the sync, the intake, email or Discord breaks, restore and privacy, who to ask).
- Lead comparison: Tegen HQ's side since the intake was switched on (Swedish dates): 16 Oct 3 submissions (1 new lead, 2 repeats from the same person), 17 Oct 2 (2 new leads), 18 and 19 Oct none so far; all from the qualification form; 2 test leads; no call turned away (the one refusal on 16 Oct was Tegen HQ's own check before connecting). The Notion lead database that LAB37's reports count from is not reachable from Max's Notion connector, so the other side needs Erik (or access to that database): the same counts per day from Notion, then compare.
- Restore: no Neon CLI or API access from here; the try needs Max in Neon's console (create a branch from an hour ago and put its connection string in a git-ignored env file), then Claude counts against production read-only and the branch is deleted. Also check how long Neon's restore window is.

Import dry run against production (2026-10-27, export of that day, nothing written): a replace would remove the 557 imported leads (none worked on in Tegen HQ) and import 572 (Kall 532, Ny lead 14, Kontaktad 9, Prisinfo 8, Konsultation klar 4, Bokat möte 2, Bokat provträning 2, Avbokat möte 1); left out: won 172, lost 85, Kids 50, other pipeline 2, same person 14. The 16 leads made in Tegen HQ stay; 14 of them are in the export and are matched, not doubled. Two of those had moved on in Pipedrive (Kontaktad, Bokat möte) while still in Ny lead in Tegen HQ, so the import now moves a matched lead still in Ny lead to Pipedrive's stage, with a history entry "via pipedrive" (decided by Max), and the dry run lists how many ("Already in Tegen HQ"). A replace also refuses if staff have worked on imported leads, unless --force. The export files were deleted afterwards.

The day before go-live: a fresh export, then
`pnpm import:pipedrive --deals <deals.csv> --people <people.csv> --replace --env .env.production.local` (dry run), check the counts, then the same with `--apply`; delete the files.
