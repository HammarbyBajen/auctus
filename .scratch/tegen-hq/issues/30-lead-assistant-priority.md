# 30: An assistant that weighs leads (later version)

**What to build:** An assistant reads each open lead and its history (the form answers, the message, where they came from, calls, notes, emails, stage, time since last contact) and gives it a weight, so Home ranks the leads most likely to join, and those cooling off, higher. It helps Fredrik and Timmy pick who to call; it never acts on a lead by itself.

**Blocked by:** 29 (Home's groups and order), 18 (go-live: the history has to be worked in Tegen HQ before there is anything to read)

**Status:** later (idea from Max, 2026-10-19). Not to be built before Tegen HQ has a few months of its own lead history.

**Why later:** today almost all history is in Pipedrive, and the leads in Tegen HQ carry one import note each. A weight needs real calls, notes and outcomes to read, and outcomes (who became a member) to check itself against.

**Ideas to settle before building:**
- **What it reads:** the qualification answers (mål, erfarenhet), the message, attribution (campaign, ad click), stage and time in it, the contact history and notes, emails sent and their status, and whether they are already in Mana.
- **What it gives back:** a weight (for example hot, warm, cooling) and one short reason in Swedish that staff can see ("Frågade om pris i går, har inte bokat"), never a bare number. Staff can override it, and the override sticks.
- **Where it shows:** it orders the quiet group on Home (ticket 29) and can lift a lead into the top group; deadlines still come first.
- **When it runs:** after something happens on a lead (a new message, a logged call) and once a night, not on every page load.
- **Checking it works:** compare its weights with who actually joined over a period; start by showing the weight beside today's order before letting it change the order.
- **Privacy:** lead data, including free text, would be sent to an AI provider. Needs a data processing agreement, a mention in Tegen's privacy policy, as little data as possible per call (no phone numbers or emails), and nothing about health beyond what the person wrote themselves. Decide whether member data from Mana may be included.
- **Cost:** a small model per lead change; estimate from the number of leads per month before building.

- [ ] Decide what it reads and what it may never send (privacy review)
- [ ] A weight with a short reason per open lead, stored and shown on the lead and on Home
- [ ] Staff can override a weight; the assistant does not undo an override
- [ ] Runs on changes and nightly, with a cost cap
- [ ] Checked against real outcomes before it changes Home's order
