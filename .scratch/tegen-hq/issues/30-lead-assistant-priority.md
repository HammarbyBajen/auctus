# 30: AI in Tegen HQ: a built-in assistant first, then "connect your own agent" (MCP)

**What to build:** AI that helps staff work leads and members: a brief before a call, turning a quick note into the right steps after it, who to call today and why, drafts of messages, and answers to owners' questions plus a weekly summary. First as an assistant built into Tegen HQ on an API key Max supplies; later as an MCP server so staff (Tegen's first, other gyms' later) can connect their own agent and subscription.

**Blocked by:** 18 (go-live) for most of its value: until leads are worked in Tegen HQ there is little history to read. Phase A can start before.

**Status:** planned with Max (2026-10-19); not started

**Decided by Max (2026-10-19):**
- Built-in assistant first, on Max's API key. The MCP server comes after and reuses the same tools.
- "Connect your own agent" is for Tegen's staff first and other gyms later, so everything stays scoped per studio and per person (it already is: every row carries a studio).
- All four uses matter: before/after a call, who to call today, drafting messages, questions and a weekly summary.

**Ground rules:**
- The AI suggests, a person decides. It never sends a message, moves a lead or changes data by itself; every suggestion is approved with one click, and logged (what was suggested, by which model, who approved).
- Every suggestion shows its reason in plain Swedish, never a bare score. Staff can override a weight and the override sticks.
- As little personal data as possible per call: no phone numbers or email addresses unless the task needs them. Notes about injuries or illness are health data (GDPR special category) and are never sent. Member data from Mana only where the use needs it.
- Needs before going live: a data processing agreement with the AI provider, a line in Tegen's privacy policy, and a check of where the provider processes data (Tegen HQ itself runs in the EU since 2026-10-19).
- One guarded door: one module talks to the AI provider (as with email, a lint rule and a test keep it that way); the key is read there only; a monthly cost cap.

**Phases:**

A. **Foundation.** A tool layer in Tegen HQ, written once and used by both the assistant and the MCP server: get a lead with its history, list who needs attention, list at-risk members, log a contact, add a note, create a task, suggest a stage, draft an email. Each tool checks the person's role, as the pages do. The AI module, the privacy filter (what may be sent), the log of suggestions, and the cost cap.

B. **Before and after a call.** On the lead page: a short brief (where they came from, form answers, what happened so far, a suggested opening). After a call: a written or dictated note becomes a proposed set of steps (logged call, note, task with a date, stage move) to approve.

C. **Who to call today.** A weight with a short reason per open lead and per at-risk member, after something happens on a lead and once a night (batch, cheaper). It orders the quiet group on Home (ticket 29) and Hör av dig till; deadlines still come first. First shown beside today's order and checked against who actually joined, before it changes the order.

D. **Drafting messages.** Email and text drafts in Tegen's tone, from the templates (ticket 27) and the lead's history; always sent by a person.

E. **Questions and a weekly summary.** Owners ask in plain Swedish ("how many from the Höst campaign joined?", "why did people leave in October?"), answered from Tegen HQ's own data with the numbers shown. A weekly summary to the owners (Discord or email).

F. **MCP server.** The same tools exposed over MCP at a Tegen HQ address, signed in per person with OAuth so an agent has exactly that person's permissions; works with the Claude apps and Claude Code. Write tools still need the person's approval in their agent. Tegen's staff first; other gyms when Tegen HQ serves more than one studio.

**Model and cost:** to measure on Tegen's own leads before choosing (Max decides). For scale: weighing about 50 open leads a night is roughly $0.50 a night on Claude Opus 5.5 (about $15 a month), half that through the batch API, and far less on Claude Haiku 5.5. The system prompt and tool definitions are cached to keep repeated calls cheap.

- [ ] Phase A: the tool layer with role checks, the AI module behind one door, the privacy filter, the suggestion log and the cost cap
- [ ] Privacy: data processing agreement, privacy policy line, where data is processed
- [ ] Phase B: brief before a call; note to proposed steps after a call
- [ ] Phase C: weights with reasons, checked against outcomes before they change Home's order
- [ ] Phase D: message drafts
- [ ] Phase E: questions and a weekly summary for owners
- [ ] Phase F: MCP server with per-person sign-in
