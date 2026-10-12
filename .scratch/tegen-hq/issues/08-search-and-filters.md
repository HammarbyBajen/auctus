# 08: Search and filters

**What to build:** Staff find a lead quickly by name, email or phone and filter the list by stage, source, assignee and date.

**Blocked by:** 02

**Status:** done (2026-10-12)

- [x] Search matches name, email and phone, partially and case-insensitively
- [x] Filters combine and can be cleared
- [x] The URL keeps the filters so a view can be shared and reloaded

Notes: results come from every stage, members and cold leads included, so search reaches anyone; clearing returns to the board. Name and email match with ICU case folding (a plain C database does not fold Å/Ä/Ö). The stage filter is `fas` in the address, since `steg` picks the phone tab and the cold view.
