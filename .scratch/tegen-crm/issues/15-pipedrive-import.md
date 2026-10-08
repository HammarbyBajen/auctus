# 15: Pipedrive import

**What to build:** A one-off, rerunnable import brings all 573 Pipedrive leads into the CRM with their notes, activities and stage. The 526 old cold leads are imported too, as Cold, hidden from the main views by default but searchable.

**Blocked by:** 03, 09

**Status:** ready-for-agent

- [ ] All leads are imported with name, email, phone, notes, activities and mapped stage
- [ ] Cold leads are imported as Cold and hidden from the main views by default, but found by search
- [ ] Running the import twice creates no duplicates
- [ ] Unmapped values (for example an unknown source) are reported, not guessed
- [ ] A dry run shows what would be imported
