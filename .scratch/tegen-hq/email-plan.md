# Plan: email on Resend (M8)

Based on `docs/research/resend.md` (2026-10-15). Decisions so far are Max's (2026-10-15): all four phases, Max's own Resend account for now, test addresses only until the review with Erik.

## Decided: US storage accepted (Max, 2026-10-15)

**Resend stores all data in the United States** (account data, metadata, logs, and email content for 30 days), whatever sending region is chosen. There is no EU option ([regions](https://resend.com/docs/dashboard/domains/regions), [GDPR](https://resend.com/security/gdpr), both checked 2026-10-15). Transfers rely on the EU SCCs and the EU-US Data Privacy Framework, under a pre-signed DPA. The project rule says data stays in the EU, so this is an exception to it. **Max accepted it on 2026-10-15**, to be documented in Tegen's privacy policy (Tegen is the controller and should agree). Keep as little there as possible: no tracking, ids only in tags, no member lists in Resend before phase 4, no free-text notes in emails. Phase 1 is built now in test mode; real test sends start when the API key is in.

## Facts that shape the plan

- **Another Resend account already holds crossfittegen.se** (eu-west-1), most likely the one `tegen-web` uses for lead emails. A domain can only be in one account, so Tegen HQ sends from a subdomain (for example `mail.crossfittegen.se`), and the main domain and `tegen-web` stay untouched.
- **DNS is on Cloudflare** (registrar One.com). Someone with access adds three records for the subdomain. The main domain's DMARC is `p=quarantine` and covers subdomains too, so the subdomain must be verified before anything is sent.
- **Resend's idempotency keys last 24 hours**, so our own message row is what stops a late retry from sending twice.
- **Resend Automations cannot cancel a single run** and need contacts stored in Resend, so drips run on our side (Vercel Workflow `sleep`, which already powers the first-contact watch).

## Ground rules, enforced in code

1. One module, `src/lib/email/`, is the only place that may import `resend` (a lint rule plus a test, like the Mana client).
2. **Test mode is the default.** In test mode every recipient is replaced with Resend's test address (`delivered@resend.dev`) and the real one is only stored in our log; the UI says so on every send. Live mode needs both an environment variable and an owner's switch, and is not turned on before the review with Erik.
3. Every send writes a message row first, checks the suppression list, then calls Resend with that row's id as the idempotency key.
4. No tracking pixels or click tracking. Tags carry ids only. No member lists in Resend before phase 4.
5. The words are Tegen's: templates are edited by owners in Tegen HQ and start empty. Nothing Claude writes is sent.

## Phase 1: 1-to-1 email from the CRM

What a staff member sees: on a lead and on a row in Hör av dig till, **Skicka e-post** opens a small composer with Tegen's template filled in (subject and text, `{förnamn}`), editable before sending. Replies go to the staff member's own address (Reply-To). The email is logged in the lead's history, or the member's notes, with who sent it and its delivery status.

Build:
- `email_message` (who, to, subject, text, template, lead or member, sender, status, Resend id, timestamps), `email_event` (each webhook event once), `email_suppression` (address, reason: bounced, complained, unsubscribed).
- Templates per purpose in settings: the two at-risk texts move there, plus "Svar till ny lead". Same editor as today.
- React Email layout (logo, text, Tegen's footer), rendered on the server, with a plain-text version.
- `POST /api/email/webhook`: verifies Resend's signature on the raw body; stores events; bounces and complaints go to the suppression list; status shows in the history.
- Settings → E-post: sending address, test mode status, and the suppression list.
- Tests: the guard (no real address reaches Resend in test mode), suppression, idempotency, webhook signature, template filling.

Needs from Max: a Resend API key with sending access (in `.env.local` and Vercel, never pasted in chat), a webhook signing secret, and the subdomain verified (DNS access).

## Phase 2: drips for new leads

A sequence (for example day 0, 2, 7) starts when a lead comes in through the intake. Each step is a Workflow `sleep`, then a re-check: stop if the lead has been contacted, moved on, become a member, replied or unsubscribed. Owners write the texts and switch each step on. Needs: consent wording on `tegen-web`'s forms (leads have not bought anything), and an unsubscribe link and one-click headers in every email.

## Phase 3: win-back and at-risk journeys

Same engine, started by a win-back lead or an at-risk alert. **Conflicts with the PRD** today: at-risk data must never be used to message members automatically (Privacy and GDPR). Changing that needs Max and Tegen's decision and a written legitimate-interest assessment.

## Phase 4: newsletter, replacing Mailchimp

Resend Broadcasts with contacts pushed from Tegen HQ, under a topic nobody is in until they opt in; unsubscribes come back by webhook. Before anything moves: a full Mailchimp export (including unsubscribed contacts), the list size (decides the Resend plan), and Mailchimp's answer on whether archive links survive closing.

## Open with others

- Erik: whose Resend account holds the main domain, and who has Cloudflare access.
- Fredrik/Timmy: all email text, sender name, footer.
- Tegen with legal advice: consent wording, privacy policy, how long after a membership ends offers may be sent.
- Resend support: whether a team can be transferred to Tegen later.
