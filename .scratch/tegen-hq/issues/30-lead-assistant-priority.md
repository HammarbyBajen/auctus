# 30: AI in Tegen HQ: a built-in assistant first, then "connect your own agent" (MCP)

**What to build:** AI that helps staff work leads and members: a brief before a call, turning a quick note into the right steps after it, who to call today and why, drafts of messages, and answers to owners' questions plus a weekly summary. First as an assistant built into Tegen HQ on an API key Max supplies; later as an MCP server so staff (Tegen's first, other gyms' later) can connect their own agent and subscription.

**Blocked by:** 18 (go-live) for most of its value: until leads are worked in Tegen HQ there is little history to read. Phase A can start before.

**Status:** phase A live (switched off until a key is set); phase B built (2026-10-20), to be tried against the real model on demo leads; phases C to F not started

**Decided by Max (2026-10-19):**
- Built-in assistant first, on Max's API key. The MCP server comes after and reuses the same tools.
- "Connect your own agent" is for Tegen's staff first and other gyms later, so everything stays scoped per studio and per person (it already is: every row carries a studio).
- All four uses matter: before/after a call, who to call today, drafting messages, questions and a weekly summary.

**Ground rules:**
- The AI suggests, a person decides. It never sends a message, moves a lead or changes data by itself; every suggestion is approved with one click, and logged (what was suggested, by which model, who approved).
- Every suggestion shows its reason in plain Swedish, never a bare score. Staff can override a weight and the override sticks.
- Only the personal data each task needs (GDPR data minimization): no phone numbers or email addresses unless the task needs them; member data from Mana only where the use needs it.
- Absence: that someone is away and until when ("Tillbaka senast", a freeze's dates) may be sent; the reason for a health-related absence (injury, illness and the like, GDPR special category) is not (decided by Max, 2026-10-19).
- Notes go through a filter before anything is sent (decided by Max, 2026-10-19). It fails on the safe side: a note with signs of health information (a Swedish word list Tegen can extend: skada, opererad, gravid, sjuk and so on) is left out whole, not edited; phone numbers and email addresses are removed from the notes that pass; staff can mark a note as private, and it is never sent. The filter runs in Tegen HQ, never by asking the AI. Tegen should also check that its privacy policy covers storing health-related absence reasons at all, AI or not.
- Needs before going live: a data processing agreement with the AI provider, a line in Tegen's privacy policy, and a check of where the provider processes data (Tegen HQ itself runs in the EU since 2026-10-19).
- One guarded door: one module talks to the AI provider (as with email, a lint rule and a test keep it that way); the key is read there only; a monthly cost cap.

**Phases:**

A. **Foundation.** A tool layer in Tegen HQ, written once and used by both the assistant and the MCP server: get a lead with its history, list who needs attention, list at-risk members, log a contact, add a note, create a task, suggest a stage, draft an email. Each tool checks the person's role, as the pages do. The AI module, the privacy filter (what may be sent, including the note filter and a "private" mark on notes), the log of suggestions, and the cost cap.

B. **Before and after a call.** On the lead page: a short brief (where they came from, form answers, what happened so far, a suggested opening). After a call: a written or dictated note becomes a proposed set of steps (logged call, note, task with a date, stage move) to approve.

C. **Who to call today.** A weight with a short reason per open lead and per at-risk member, after something happens on a lead and once a night (batch, cheaper). It orders the quiet group on Home (ticket 29) and Hör av dig till; deadlines still come first. First shown beside today's order and checked against who actually joined, before it changes the order.

D. **Drafting messages.** Email and text drafts in Tegen's tone, from the templates (ticket 27) and the lead's history; always sent by a person.

E. **Questions and a weekly summary.** Owners ask in plain Swedish ("how many from the Höst campaign joined?", "why did people leave in October?"), answered from Tegen HQ's own data with the numbers shown. A weekly summary to the owners (Discord or email).

F. **MCP server.** The same tools exposed over MCP at a Tegen HQ address, signed in per person with OAuth so an agent has exactly that person's permissions; works with the Claude apps and Claude Code. Write tools still need the person's approval in their agent. Tegen's staff first; other gyms when Tegen HQ serves more than one studio.

**Model and cost:** to measure on Tegen's own leads before choosing (Max decides). For scale: weighing about 50 open leads a night is roughly $0.50 a night on Claude Opus 5.5 (about $15 a month), half that through the batch API, and far less on Claude Haiku 5.5. The system prompt and tool definitions are cached to keep repeated calls cheap.

- [x] Phase A: the tool layer with role checks, the AI module behind one door, the privacy filter, the suggestion log and the cost cap
- [x] The note filter: health signs leave a note out whole, contact details removed, private notes never sent; tested with real-looking Swedish notes
- [ ] Privacy: data processing agreement, privacy policy line, where data is processed
- [ ] Phase B: brief before a call; note to proposed steps after a call
- [ ] Phase C: weights with reasons, checked against outcomes before they change Home's order
- [ ] Phase D: message drafts
- [ ] Phase E: questions and a weekly summary for owners
- [ ] Phase F: MCP server with per-person sign-in

Phase A, built (2026-10-19):
- `src/lib/ai/privacy.ts`: the filter (52 built-in Swedish words, prefix matching with `*`, short words whole only; body parts left out because they are training words too), contact details taken out, private notes held back, first names only.
- `src/lib/ai/tools.ts`: `leadContext` (stage, dates, where they came from without click ids, form answers that pass the filter, outcomes and stage moves, filtered notes and task titles, Mana memberships), `attentionList`, `atRiskList`; `stepSchema` (log a contact, add a note, create a task, move a stage) and `applySteps`, which runs approved steps through the normal services as the person who approved them. Each checks the role.
- `src/lib/ai/client.ts`: the only importer of `@anthropic-ai/sdk` (lint rule, test); `askAi` checks the monthly cap (default 20 USD) and logs every call in `ai_suggestion` with tokens and cost; structured output; server-side fallback on a refusal; `decideSuggestion` records accepted or rejected. Default model `claude-opus-5-5`, changeable with `AI_MODEL` (Max's call, to measure).
- Inställningar → Assistent: on or off, this month's cost against the cap, the cap, and the studio's own words. The "Privat" box on a note shows only once a key is set.
- To switch it on later: `vercel env add ANTHROPIC_API_KEY production --sensitive` (and optionally `AI_MODEL`), after the data processing agreement and the privacy policy line.

Phase B, built (2026-10-20): "Inför samtalet" panel on an open lead with "Förbered samtalet" (summary, facts, an opening line, questions, the goal; stored in ai_suggestion as call_brief and shown again until the lead changes), and "Föreslå steg" by the note field (proposed steps to tick, saved as the person, all or nothing, from the stored suggestion; unusable steps dropped; private or health notes not sent). Instructions to the model in Swedish in src/lib/ai/assist.ts, effort low. Tested with a stand-in model, then tried against the real model locally on a made-up demo lead (2026-10-20): the brief opens with the caller's first name; a note gave a contact, a cleaned note, a stage move and a task; with the task unticked, "Spara valda" saved the other three as the person, and no task was made. About 1 to 2 cents and 3 to 11 seconds a call. Left: Max looks over the wording, then the production key once the privacy points are done.
