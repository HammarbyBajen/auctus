# Prompt: research Resend for Tegen HQ

Use this as the brief for a research pass (the `research` skill, or a background agent). Output: `docs/research/resend.md`, with a source link for every fact.

---

You are researching how Tegen HQ (Next.js 16 App Router, Drizzle on Neon Postgres in the EU, Better Auth, Vercel Hobby with Workflow, Mana as the system of record) should send email through **Resend**. Read primary sources only: resend.com/docs, the Resend API reference, the `resend` npm package and its changelog, react.email docs, and Swedish/EU sources (IMY, the Swedish Marketing Act, GDPR text) for consent. Note the date and version of everything you read; the Resend API changes.

## Ground rules from the project (do not plan around them)
- Mana stays the system of record; nothing writes to Mana, Pipedrive or Notion.
- No email to real members or leads while building: sends go to test addresses only, until the review with Erik (ticket 18).
- Keys only in `.env.local` and Vercel, never in code, Notion or Discord. Data stays in the EU.
- Copy is written by Fredrik, Timmy and Erik. Nothing Claude writes is sent to members.
- Hobby: each cron runs at most once a day; delayed work uses Vercel Workflow (`sleep`).

## Decided by Max (2026-10-15)
- **Scope: all four uses**, to be planned in phases: (1) 1-to-1 emails staff send from the CRM to a lead or an at-risk member, with Tegen's template, logged in the history; (2) drip sequences for new leads; (3) win-back and at-risk journeys; (4) the newsletter, replacing Mailchimp. Note that the PRD lists replacing Mailchimp as out of scope while the Notion sprint 3 plan includes it: flag what that changes.
- **Account: Max's own Resend account for now**, moved to Tegen later. Find out how a domain, contacts, templates and webhooks move between Resend accounts or teams, and what breaks.
- **DNS: nobody knows yet who controls crossfittegen.se.** Plan both a subdomain and the main domain, and say how to find out who manages the DNS (registrar and name servers, from public lookups).
- **Test addresses only** until the review with Erik: nothing reaches a real member or lead, manual or automatic. The plan must make that impossible by construction, not by habit.

## Questions to answer
1. **Account and region.** Can a Resend account send from an EU region, and does that keep data in the EU? What is stored and for how long (logs, bodies, recipients)? Is there a DPA, and what does the free and lowest paid plan include (sends per day/month, domains, audiences, broadcasts)?
2. **Domain.** What DNS records does Resend need for crossfittegen.se (SPF, DKIM, DMARC, return path), and can a subdomain (for example `mail.crossfittegen.se`) be used so the main domain's reputation and Google Workspace mail are untouched?
3. **Sending from Next.js.** The current way to send from a server action or route handler with the `resend` SDK; idempotency keys (so a retried Workflow step never sends twice); batch sending; rate limits and the errors for them; scheduled sends (`scheduledAt`) and how far ahead.
4. **Templates.** React Email with Next.js 16 and React 19: rendering on the server, plain-text versions, previewing locally. Can templates be edited by non-developers (Resend templates in the dashboard vs React Email in the repo)? What fits "Fredrik writes the text, developers own the layout"?
5. **Events back.** Webhooks for delivered, bounced, complained, opened, clicked: payload, signature verification (Svix), retries. What do we need to store so a bounced or complaining address is never mailed again?
6. **Audiences, broadcasts, unsubscribe.** Resend Audiences/Contacts and Broadcasts vs keeping lists in our own database. How one-click unsubscribe (RFC 8058 `List-Unsubscribe-Post`) works with Resend, and what Gmail and Yahoo's 2024 bulk-sender rules require.
7. **Consent in Sweden.** When may a gym email (a) a lead who filled in a contact form, (b) a paying member, (c) a former member, about (i) things they asked for, (ii) news and offers? Soft opt-in under the Swedish Marketing Act (marknadsföringslagen 19 §) and GDPR's legitimate interest; what must every email contain.
8. **Drips and journeys.** How others build a sequence (day 0, 2, 7) on Resend: Resend's own automation features if any, versus our own scheduler (Workflow `sleep`, one row per step). How to stop a sequence when the person replies, books or becomes a member.
9. **Mailchimp.** What Tegen would lose or need to move if Resend replaced Mailchimp for the newsletter (list export, unsubscribed contacts, archive). Only facts; the decision is Max's.
10. **Testing.** Resend's test addresses (`delivered@resend.dev` and friends), a sandbox or test mode, and how to make sure no real address is mailed from a preview or local build.

## Skills to load while working
Found with `npx skills find` (2026-10-15). Install the first three before building; read the fourth for the consent and content questions.
- `resend/resend-skills@resend` (official, 22.1K installs): the SDK, sending, domains, webhooks.
- `resend/react-email@react-email` (official, 9.5K): templates.
- `resend/email-best-practices@email-best-practices` (official, 7.9K): deliverability, unsubscribe, bulk-sender rules.
- `coreyhaines31/marketingskills@churn-prevention` (116K): how win-back and at-risk emails are usually sequenced. Structure only: the words come from Tegen.

Not needed: `resend-cli`, `agent-email-inbox` (receiving mail), generic cold-email skills (Tegen does not cold-email).

## What to hand back
- A short answer to each question above, with sources.
- A recommended setup for Tegen HQ (region, subdomain, templates, where consent and unsubscribes are stored, how drips are scheduled), with the trade-offs.
- A list of what Max, Erik or Fredrik must decide or provide (DNS access, sender name and address, copy, consent wording).
- Anything in the Resend docs that contradicts the ground rules above.
