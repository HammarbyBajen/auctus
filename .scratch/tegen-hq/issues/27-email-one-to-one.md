# 27: Email (M8 phase 1): 1-to-1 email from the CRM

**What to build:** Staff email a lead or a member on the Hör av dig till list from Tegen HQ, starting from Tegen's template, through Resend. Plan: .scratch/tegen-hq/email-plan.md. Research: docs/research/resend.md.

**Blocked by:** 13

**Status:** built (2026-10-15), in test mode; waiting for a Resend API key, a webhook secret and a verified subdomain

- [x] One module talks to Resend (lint rule and a test); the key and webhook secret are read there only, server-side
- [x] Test mode by default: every email goes to Resend's test address; live needs both EMAIL_LIVE=true on the server and an owner's switch; without a key nothing is sent at all
- [x] Each email is written before sending and its id is the idempotency key; it is listed on the lead with its status
- [x] A real send to a lead counts as a contact (Mejlade) with the subject in the history; to a member, a try in their notes; a test send logs nothing on the person
- [x] Resend's webhook is verified on the raw body; each event is handled once; hard bounces and spam complaints of live emails go on a suppression list that is checked before every send
- [x] Templates (new leads; members never seen and members who stopped coming) and the sender are set under Inställningar → E-post, by owners
- [x] Deleting a person deletes their emails; a suppressed address stays so they are never mailed again
- [ ] A test send through Resend once the key is in (Max)
- [ ] The subdomain verified in Resend (Cloudflare access, Erik)
- [ ] Copy for the templates and the footer (Fredrik, Timmy)

Decided by Max (2026-10-15): Resend's storage in the US is accepted and documented (an exception to "data stays in the EU"); Max's own Resend account for now; test addresses only until the review with Erik.
