# 15: Import of lead history

**What to build:** A one-off, rerunnable import of historic leads from a Pipedrive CSV export (Max has asked for one; the preferred source, since it needs no access to Pipedrive), or otherwise from the Tegen Notion lead database or Pipedrive's API, read-only (never writing to either), with notes, activities and stage where the source has them. It uses the same test-lead and duplicate rules as the intake (ticket 09), so the CRM's counts match LAB37's reports. All 573 Pipedrive leads are in scope, the 526 old cold ones as Cold, hidden from the main views by default but searchable.

**Blocked by:** 03, 09

**Status:** ready-for-agent

- [ ] Leads are read from the Pipedrive CSV export (people, leads or deals, and notes and activities if exported), or read-only from Notion or Pipedrive, and nothing is ever written back
- [ ] The CSV file is treated as personal data: kept out of git and deleted after the import
- [ ] Leads are imported with name, email, phone, notes, activities, mapped stage and source where available
- [ ] Test leads (`test-lab37`, `ignorer`, `testlead`) are flagged as tests, and duplicates follow email, then the last 9 phone digits, earliest wins
- [ ] Cold leads are imported as Cold and hidden from the main views by default, but found by search
- [ ] Running the import twice creates no duplicates
- [ ] Unmapped values (for example an unknown source) are reported, not guessed
- [ ] A dry run shows what would be imported
- [ ] The imported count matches LAB37's lead count for the same period
