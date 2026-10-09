# 15: Import of lead history

**What to build:** A one-off, rerunnable import of historic leads from a Pipedrive CSV export (Max has asked for one; the preferred source, since it needs no access to Pipedrive), or otherwise from the Tegen Notion lead database or Pipedrive's API, read-only (never writing to either), with notes, activities and stage where the source has them. It uses the same test-lead and duplicate rules as the intake (ticket 09), so the CRM's counts match LAB37's reports. Decided with Max (2026-10-09): only open deals ("Pågående") in the TEGEN SÄLJ 2026 pipeline. Won and lost deals and the Kids pipeline are left out. AVBOKAT MÖTE gets its own stage, Avbokat möte, as in Pipedrive (decided 2026-10-09). Open KALL deals come in as Kall lead with the reason Annat. API and Marknadsplats sources become "Pipedrive", with the original in a note. Run: `pnpm import:pipedrive --deals <deals.csv> --people <people.csv> [--apply]`.

**Blocked by:** 03, 09

**Status:** done (imported to production 2026-10-09: 555 leads, 6 merged as duplicates)

- [x] Leads are read from the Pipedrive CSV export (people, leads or deals, and notes and activities if exported), or read-only from Notion or Pipedrive, and nothing is ever written back
- [x] The CSV file is treated as personal data: kept out of git and deleted after the import
- [x] Leads are imported with name, email, phone, notes, activities, mapped stage and source where available
- [x] Test leads (`test-lab37`, `ignorer`, `testlead`) are flagged as tests, and duplicates follow email, then the last 9 phone digits, earliest wins
- [x] Cold leads are imported as Cold and hidden from the main views by default, but found by search
- [x] Running the import twice creates no duplicates
- [x] Unmapped values (for example an unknown source) are reported, not guessed
- [x] A dry run shows what would be imported
- [ ] The imported count matches LAB37's lead count for the same period
