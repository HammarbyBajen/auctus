# 17: Privacy tools

**What to build:** Owners can permanently delete a person and everything linked to them, and review a list of Cold leads with no activity for 24 months. Nothing is deleted without an Owner confirming.

**Blocked by:** 03

**Status:** done (2026-10-13)

- [x] Delete removes the person, lead, notes, tasks, submissions and alerts
- [x] Deletion asks for confirmation and is Owner-only
- [x] A review list shows Cold leads inactive for 24 months
- [x] No automatic deletion happens

Notes: "Radera personen …" on the lead page (owners) opens a confirmation page with a required box, checked on the server too. Deleted: the person, all their leads with notes, history and tasks, and at-risk alerts. Kept: the Mana mirror (comes back on the next sync; erasure in Mana is done in Mana) and the record of which Mana events made a win-back lead, so the same event cannot recreate the person. A deletion_log row with no personal data records each deletion. The review list (Inställningar → Integritet och radering) leaves out people who also have an open or more recent lead. Lead submissions (ticket 09) must be added to the deletion when 09 is built. In production the list is empty until May 2027 (oldest cold activity 2025-05-13).
