# 07: Settings: stages, reasons and custom fields

**What to build:** Owners rename, reorder, add and remove pipeline stages and Cold reasons, and add custom fields to leads (for example goal, injury, interest).

**Blocked by:** 03

**Status:** done (2026-10-13)

- [x] Stages and Cold reasons can be edited by Owners only
- [x] Removing a stage that has leads requires moving those leads first
- [x] Custom fields can be added and appear on the lead and in the create form
- [x] Existing leads keep their data after edits

Notes: Inställningar → Steg, anledningar och fält. Renaming keeps the internal key. Open stages reorder among themselves; Medlem and Kall lead stay last. New stages are open stages. Locked from removal (the code relies on them): new_lead, contacted, booked_test_training, won, cold. Removing hides (archived_at) so old history still names it; a stage with leads needs a target stage, and each move is noted in the lead's history (via "settings"). A Cold reason can be removed while leads keep it, but at least one remains. Custom fields: text or choice (2-30 choices), on the lead page ("Mer om leaden") and the new-lead form, stored in lead.custom_fields; a removed field is hidden and its values are kept. Not yet: custom fields in search, and the Pipedrive import's stage map still uses the default keys (it is a one-off).
