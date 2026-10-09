# 0006: Pipeline stages and Cold reasons are data with stable keys

Status: accepted, 2026-10-09

## Decision
Stages (`pipeline_stage`) and Cold reasons (`cold_reason`) are rows in the database, one set per studio, each with a stable `key` and an editable `name`, order and kind (open, won or cold). A lead stores its stage by key, and the database checks that the key exists for that studio. Stage moves and logged contacts are recorded in `lead_event` and shown together with notes as the lead's history.

## Why
The owners will rename, reorder and add stages and reasons (ticket 07). Storing them as data from the start means that ticket only needs editing screens, and renaming a stage never touches a lead. The kind lets code treat "Won" and "Cold" specially without relying on their names.

## Consequences
- Every studio must have its stages. `ensureDefaultPipeline` creates the defaults and is used by the seed script.
- Removing a stage that has leads must first move those leads (ticket 07), because the database refuses to delete a stage that is in use.
- Logging a contact on a lead still in the first stage moves it to "contacted", so one tap is enough. Other stage changes are never automatic.
