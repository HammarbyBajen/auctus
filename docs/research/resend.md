# Resend: research notes

Research date: 2026-10-15. Every page below was read on that date. Brief: resend-research-prompt.md in the notes folder outside the repo.

Method note: pages were read with WebFetch (summarised by a small model) and WebSearch restricted to official domains. Where a page did not say something, this note says "unknown" or "not stated". The installed skills (`.claude/skills/resend`, `react-email`, `email-best-practices`) were read as background only, and every fact taken from them was checked against the primary source. Where they disagree, the primary source wins (see "Where the skills disagree with the docs" at the end). Numbers should be checked again on the page before they are hard-coded, because the Resend API changes often.

Versions seen: `resend` npm 6.33.0 (latest on 2026-10-15, released 14 Oct per GitHub) [R44, R45]. React Email docs as published on 2026-10-15 (no version number shown) [R46]. `workflow` 5.1.0 and Next.js 16.4.0 docs from this repo's `node_modules`.

## Sources

Resend (resend.com)
- [R1] https://resend.com/pricing
- [R2] https://resend.com/docs/dashboard/domains/regions (no date shown)
- [R3] https://resend.com/security/gdpr (last updated 2026-10-12)
- [R4] https://resend.com/legal/dpa (last updated 2025-12-31)
- [R5] https://resend.com/legal/subprocessors (last updated 2026-08-27)
- [R6] https://resend.com/docs/knowledge-base/account-quotas-and-limits
- [R7] https://resend.com/docs/api-reference/emails/send-email
- [R8] https://resend.com/docs/dashboard/emails/idempotency-keys
- [R9] https://resend.com/docs/api-reference/rate-limit
- [R10] https://resend.com/docs/api-reference/errors
- [R11] https://resend.com/docs/dashboard/emails/schedule-email
- [R12] https://resend.com/docs/api-reference/emails/send-batch-emails
- [R13] https://resend.com/docs/dashboard/emails/send-test-emails
- [R14] https://resend.com/docs/dashboard/webhooks/event-types
- [R15] https://resend.com/docs/webhooks/emails/bounced
- [R16] https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
- [R17] https://resend.com/docs/dashboard/webhooks/retries-and-replays
- [R18] https://resend.com/docs/dashboard/emails/email-suppressions
- [R19] https://resend.com/docs/dashboard/domains/introduction
- [R20] https://resend.com/docs/add-a-domain
- [R21] https://resend.com/docs/knowledge-base/cloudflare
- [R22] https://resend.com/docs/dashboard/domains/dmarc
- [R23] https://resend.com/docs/dashboard/domains/tracking
- [R24] https://resend.com/docs/knowledge-base/warming-up
- [R25] https://resend.com/docs/dashboard/domains/manage-domains
- [R26] https://resend.com/docs/dashboard/domains/claim
- [R27] https://resend.com/docs/knowledge-base/domain-already-registered
- [R28] https://resend.com/changelog/domain-claim (created 2026-06-04, updated 2026-07-09)
- [R29] https://resend.com/docs/dashboard/settings/team
- [R30] https://resend.com/docs/dashboard/audiences/contacts
- [R31] https://resend.com/docs/api-reference/contacts/create-contact
- [R32] https://resend.com/docs/api-reference/contacts/create-contact-import (search snippet only, not fetched)
- [R33] https://resend.com/changelog/exports-general-availability (search snippet only, not fetched)
- [R34] https://resend.com/docs/dashboard/broadcasts/introduction
- [R35] https://resend.com/docs/dashboard/topics/introduction
- [R36] https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
- [R37] https://resend.com/docs/knowledge-base/should-i-add-an-unsubscribe-link
- [R38] https://resend.com/docs/dashboard/settings/unsubscribe-page
- [R39] https://resend.com/docs/dashboard/automations/introduction
- [R40] https://resend.com/docs/dashboard/automations/runs
- [R41] https://resend.com/docs/dashboard/automations/wait-for-event
- [R42] https://resend.com/docs/dashboard/automations/send-email
- [R43] https://resend.com/blog/introducing-automations (search snippet: dated 2026-04-13)
- [R44] https://registry.npmjs.org/resend/latest
- [R45] https://github.com/resend/resend-node/releases
- [R46] https://resend.com/docs/dashboard/templates/introduction
- [R47] https://resend.com/docs/dashboard/api-keys/introduction

React Email (react.email)
- [E1] https://react.email/docs/utilities/render
- [E2] https://react.email/docs/getting-started/manual-setup
- [E3] https://react.email/docs/integrations/resend
- [E4] https://react.email/docs/cli

Law and authorities
- [L1] Marknadsföringslag (2008:486), 19 to 21 §§, riksdagen.se, "Ändrad: t.o.m. SFS 2022:656": https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/marknadsforingslag-2008486_sfs-2008-486/
- [L2] Konsumentverket, Marknadsföringslagen (konsument), "Granskad: 23 mars 2026": https://www.konsumentverket.se/lagar/marknadsforingslagen-konsument/
- [L3] IMY, Intresseavvägning, "Senast uppdaterad: 15 juni 2026": https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/intresseavvagning/
- [L4] IMY, Hur gör jag för att ett företag ska sluta skicka reklam till mig, "Senast uppdaterad: 15 april 2021": https://www.imy.se/vanliga-fragor-och-svar/hur-gor-jag-for-att-ett-foretag-ska-sluta-skicka-reklam-till-mig/
- [L5] GDPR article 21, read on https://gdpr-info.eu/art-21-gdpr/ (a mirror; the EUR-Lex page returned no text to the fetch tool)
- [L6] GDPR recitals in Swedish on IMY (skäl 47): https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/beaktandesatser/
- [L7] RFC 7489 (DMARC), section 6.3: https://www.rfc-editor.org/rfc/rfc7489.html

Mailbox providers
- [G1] Google, Email sender guidelines: https://support.google.com/a/answer/81126 (no date; requirements in force since 2024-02-01)
- [G2] Google, Email sender guidelines FAQ: https://support.google.com/a/answer/14229414
- [Y1] Yahoo, Sender best practices: https://senders.yahooinc.com/best-practices/

Mailchimp
- [M1] https://mailchimp.com/help/view-export-contacts/
- [M2] https://mailchimp.com/help/export-back-up-data/
- [M3] https://mailchimp.com/help/about-email-campaign-archives-and-pages/

Local and public lookups
- [W1] Workflow 5.1.0 docs in `node_modules/workflow/docs/`: `foundations/errors-and-retries.mdx`, `foundations/idempotency.mdx`, `api-reference/workflow/get-step-metadata.mdx`, `api-reference/workflow/sleep.mdx`
- [N1] Next.js 16.4 docs in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Webhooks section) and `02-guides/backend-for-frontend.md` (body can be read once)
- [D1] Public DNS (`dig`) and the .se registry whois (`whois.iis.se`) for crossfittegen.se, run 2026-10-15
- [P1] This repo: `docs/PRD.md`, `src/db/schema.ts`, `src/workflows/first-contact.ts`

## What the public lookups show about crossfittegen.se [D1]

This changes several answers below, so it comes first.

- Registrar: One.com. The domain expires 2026-12-20 (registry-lock off).
- DNS is hosted at Cloudflare (name servers `emerson.ns.cloudflare.com` and `eva.ns.cloudflare.com`). Whoever has the Cloudflare account for the zone controls the DNS. The registrar account at One.com controls which name servers are used.
- Mail for the main domain is Google Workspace (MX `aspmx.l.google.com` and the alt hosts). SPF on the main domain is `v=spf1 include:_spf.google.com ~all`. A Google DKIM key is published.
- DMARC on the main domain is `v=DMARC1; p=quarantine`, with no `rua` (nobody gets reports) and no `sp` tag. Without `sp`, the `p` policy also applies to every subdomain [L7]. So mail from a new subdomain must pass DMARC or it goes to spam.
- **The main domain is already verified in a Resend account.** `resend._domainkey.crossfittegen.se` has a DKIM key, and `send.crossfittegen.se` has the Resend SPF record and MX `feedback-smtp.eu-west-1.amazonses.com`. That is the pattern Resend asks for [R21], in the Ireland region. This is most likely the Resend account `tegen-web` uses for lead emails (PRD: "an email via Resend" [P1]), but whose account it is cannot be seen from DNS.
- Mailchimp also signs for the main domain (`k1._domainkey` points to `dkim2.mcsv.net`).
- No Resend records exist yet on `mail.`, `updates.`, `news.`, `nyhetsbrev.` or `hq.` subdomains.
- No Mailchimp sign-up form was found in the HTML of the home page. Other pages were not checked.

How to repeat the lookup: `dig NS crossfittegen.se`, `dig MX crossfittegen.se`, `dig TXT _dmarc.crossfittegen.se`, and `whois -h whois.iis.se crossfittegen.se`. Then ask Erik (LAB37 set up `tegen-web`'s Resend records, so someone has Cloudflare access) and Fredrik or Timmy (the One.com account).

## 1. Account and region

- **Sending region.** Resend has four sending regions: us-east-1, eu-west-1 (Ireland), sa-east-1 and ap-northeast-1. The region is chosen per domain when it is added. To change it, delete the domain, add it again and update DNS [R2].
- **Data does not stay in the EU.** Resend says "All account data, including email metadata, logs, and API records, is stored in the United States" regardless of the sending region. Choosing eu-west-1 only means mail is sent from Ireland [R2]. The GDPR page says "there is no setting today that moves stored data to the EU" [R3]. All 22 subprocessors are listed in the USA [R5].
- **What is stored and for how long.** Email data is kept for 30 days on Free, Pro and Scale: email content and metadata, delivery status and events, logs and metrics [R6, R3]. Enterprise can negotiate retention [R6]. After account termination, remaining data is deleted within 90 days, and backups persist for 7 days [R3, R4].
- **DPA.** A GDPR article 28 DPA is in force for every account, pre-signed at sign-up, downloadable from the Documents page [R3]. Transfers rely on the EU SCCs and the EU-US Data Privacy Framework. Primary processing is in the United States. Resend gives 14 days' notice before adding a subprocessor [R4]. Resend is a processor for customer data and an independent controller for account data [R4]. For data subject requests about recipients, the customer (Tegen) is responsible [R3].
- **Plans.** [R1, R6]
  - Free (transactional): 3,000 emails per month, 100 per day (resets at midnight UTC), 3 domains, 30-day retention.
  - Pro (transactional): $20 per month for 50,000 emails or $35 for 100,000, no daily limit, 10 domains.
  - Marketing plans are priced by contacts, not emails: Free up to 1,000 contacts, Pro marketing from $40 per month for 5,000 contacts. Broadcasts only go to contacts, and broadcast sends do not count against the transactional quota [R1].
  - Automation runs: 10,000 included on every plan listed, then $0.0015 per run [R1].
  - Number of broadcasts per plan: not stated. Number of team members: not stated [R1].
- **Rate limit.** 10 requests per second per team, shared by all API keys [R9, R6].
- **Account health.** Keep bounces under 4% and spam complaints under 0.08%, or sending may be paused [R6].

## 2. Domain

- **Records Resend asks for (sending only)** [R21, R20]:
  - MX on `send.<domain>` to `feedback-smtp.<region>.amazonses.com`, priority 10.
  - TXT (SPF) on `send.<domain>`: `v=spf1 include:amazonses.com ~all`.
  - TXT (DKIM) on `resend._domainkey.<domain>`, value copied from the dashboard.
  - The exact values come from the domain's Records tab and must match what Resend generated [R20]. On Cloudflare, the DKIM record must be "DNS only" [R21].
  - Verification often takes 15 minutes and can take up to 72 hours [R20].
- **Return path.** Defaults to `send.<domain>`; a custom name is optional [R20, R19].
- **DMARC.** Not required by Resend. Resend suggests starting with `p=none` and a `rua` address, then moving to quarantine and reject [R22]. A verified Resend domain passes SPF and DKIM [R22].
- **Subdomain.** Resend recommends sending from one or more subdomains, each verified on its own [R19, R20]. For Tegen, a subdomain such as `mail.crossfittegen.se` puts the records at `send.mail`, `resend._domainkey.mail` (Cloudflare names; inferred from the pattern in [R21]). Nothing on the main domain changes, so Google Workspace mail and the existing `tegen-web` Resend setup are untouched. The main domain's DMARC `p=quarantine` still applies to the subdomain [L7]; Resend's DKIM for the subdomain is signed with the subdomain itself, which should pass relaxed alignment (inference, test with one real send to a team mailbox and read the `dmarc=pass` header, as [R22] suggests).
- **Main domain instead.** The main domain is already verified in another Resend account [D1]. "A domain can only be active on one Resend account at a time" [R27]. Using it in Max's account would need a claim, which "releases the domain from the previous team" [R26]. That would most likely break `tegen-web`'s lead emails until its account set up the domain again. Recommendation: do not use the main domain.
- **Open and click tracking.** Off by default. Open tracking adds a pixel, click tracking rewrites links via a tracking subdomain. Resend recommends tracking opens only for broadcasts and leaving tracking off for transactional mail [R23].
- **Warm-up.** A new domain should start at up to 150 emails on day 1, rising to 2,000 by day 7 [R24]. Tegen's volume is far below that for phases 1 to 3.

## 3. Sending from Next.js

- **SDK.** `resend` 6.33.0, Node 20 or later, `@react-email/render` as an optional peer [R44]. `resend.emails.send({ from, to, subject, html | text | react | template })`. Up to 50 `to` addresses. If `text` is left out, Resend generates it from the HTML [R7]. The Node SDK returns `{ data, error }` (shown in [R7]'s example); the skill says it does not throw, which matches the example but was not stated in the docs read.
- **Where.** Only on the server. A server action or a route handler both work; the API key must never reach the browser. Use the existing `server-only` import pattern.
- **Idempotency.** Send an `Idempotency-Key` (SDK: `idempotencyKey` option). 1 to 256 characters, kept for 24 hours. Same key and same body returns the first response without sending again. Same key and a different body returns 409 `invalid_idempotent_request`. A request still in progress returns 409 `concurrent_idempotent_requests`, which is safe to retry later [R8, R10]. Batch sends accept one key for the whole batch [R8].
- **Workflow retries.** A step is retried up to 3 times by default. Each step has a `stepId` that stays the same across retries, and the Workflow docs suggest it as the idempotency key for external calls [W1]. Because Resend forgets keys after 24 hours, a step retried later than that could send twice. The CRM's own message row (unique per person and purpose) must be the lasting guard; the Resend key covers the short window.
- **Batch.** Up to 100 emails per call, counted as one request. Attachments are not supported in batch [R12, R6]. Batch is idempotent per key [R8].
- **Rate limits and errors.** 429 `rate_limit_exceeded` (10 requests per second), 429 `daily_quota_exceeded` (Free only, resets midnight UTC), 429 `monthly_quota_exceeded`. Headers: `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`, `retry-after` [R9, R10]. 403 `validation_error` covers an unverified `from` domain and the testing-domain limit [R10].
- **Scheduled sends.** `scheduled_at` takes ISO 8601 or natural language ("in 1 min") [R7]. Up to 30 days ahead. A scheduled email can be rescheduled or cancelled; once cancelled it cannot be rescheduled. Batch emails can be scheduled one by one. SMTP sends cannot be scheduled [R11].

## 4. Templates

- **React Email.** Install `react-email` (plus `@react-email/ui` as a dev dependency for the preview). Templates live in an `emails` folder. `email dev` starts a preview at port 3000 by default, and `--port` and `--dir` change that [E2, E4]. Next.js also uses 3000, so the preview needs another port. React 19 and Next.js 16 are not mentioned on these pages, so compatibility is unknown from the docs (the `resend` package itself lists React 19.3.0 as a dev dependency [R44]).
- **Rendering on the server.** `await render(<Template />)` gives HTML; `toPlainText(html)` gives the plain-text version; `data-skip-in-text="true"` hides an element from the text version [E1]. The SDK can also take `react: <Template />` and render it for you [E3, R7].
- **Do not use `email resend setup`.** It stores the Resend API key in the user's home directory [E4], which breaks the "keys only in `.env.local` and Vercel" rule.
- **Resend templates (dashboard).** Resend has a no-code template editor with full version history. Templates can also be created from a React Email file, the API, or HTML [R46]. Sends reference a published template by id or alias and pass variables; `html`, `text` and `react` cannot be combined with `template`. `FIRST_NAME`, `LAST_NAME`, `EMAIL` and `UNSUBSCRIBE_URL` are reserved variable names [R7]. Who can edit is not stated, beyond team membership [R46].
- **Fit for "Fredrik writes the text, developers own the layout".** Three options:
  1. React Email layout in the repo, with the Swedish text stored in the CRM's database and edited by owners in Inställningar. The CRM already does this for the Hör av dig till templates (`src/db/schema.ts` [P1]). Layout cannot be broken by editors; the text is versioned in our database; previews run locally and in the CRM.
  2. Resend dashboard templates edited by Fredrik directly. No CRM work for editing, but Fredrik needs a Resend login, layout and text are mixed (he can break the layout), and member-facing copy lives in Resend (US).
  3. React Email for everything, with developers pasting Fredrik's text. Simplest, but every text change needs a deploy.
  Option 1 matches the rule best and reuses an existing pattern.

## 5. Events back (webhooks)

- **Events.** `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced` (permanent rejection), `email.complained`, `email.opened`, `email.clicked`, `email.failed`, `email.scheduled`, `email.suppressed`, `email.received`; also `contact.created/updated/deleted`, `contact.topics.updated`, `suppression.added/removed`, `domain.*`, `topic.*` [R14].
- **Payload (bounced).** Top level `type` and `created_at`; `data` holds `email_id`, `broadcast_id`, `template_id`, `from`, `to` (array), `subject`, `tags`, and `bounce` with `type` (`Permanent` or `Temporary`), `subType` (for example `Suppressed`, `MessageRejected`), `message` and `diagnosticCode` [R15].
- **Verification.** `resend.webhooks.verify({ payload, headers, webhookSecret })` with the raw body and the `svix-id`, `svix-timestamp`, `svix-signature` headers; it throws if invalid. The Svix library works too [R16]. In a Next.js route handler, read the body once with `await request.text()` [N1, R16].
- **Retries.** Failed deliveries are retried immediately, then after 5 s, 5 min, 30 min, 2 h, 5 h, 10 h and 10 h. An endpoint that keeps failing is disabled and the team is emailed. Messages can be replayed from the dashboard [R17]. Retries keep the same `svix-id`, so it can be used to drop duplicates [R14]. The timeout, what counts as success, ordering and source IPs are not stated in the pages read [R17].
- **Suppression in Resend.** Hard bounces and complaints are added to a team-wide suppression list automatically; manual additions are possible. It applies to all domains of the team, for transactional mail and broadcasts. No expiry is stated. Removal is in the dashboard or API (up to 100 at a time). The list can be downloaded as CSV [R18]. Gmail and Google Workspace may not send complaint events [R18].
- **What we must store.** A table of events keyed by `svix-id` (unique), and a suppression table keyed by the normalised address with reason (`hard_bounce`, `complaint`, `unsubscribe`, `objection`, `manual`), time and source event. Write to it on `email.bounced` with `bounce.type = Permanent`, `email.complained`, and `suppression.added`. Check it before every send. Keep Resend's own list as a second layer. Our table also survives a move to another Resend team (Resend's does not move, see "Moving between accounts").
- **Hosting.** The webhook route, like lead intake, must be reachable through Vercel's Deployment Protection (PRD [P1]).

## 6. Audiences, broadcasts, unsubscribe

- **Contacts.** A contact has `email`, `first_name`, `last_name`, `unsubscribed` (global: off for all broadcasts), custom `properties`, `segments` and `topics` [R31]. Segments group contacts; the older "Audience" model can be migrated to the new Contacts model [R30]. Contacts can be imported by CSV (column mapping includes `unsubscribed`, upsert or skip on conflict, files up to 200 MB) [R32, snippet only] and exported as CSV [R33, snippet only].
- **Broadcasts.** Bulk marketing mail to a segment, composed in a no-code editor that "all members of your team" can use, with scheduling, test sends before any contacts exist, and delivery, open and click stats [R34]. A broadcast can be limited to a topic [R35].
- **Topics.** Per-topic opt-in or opt-out, shown on Resend's hosted unsubscribe page if public. The default (opt-in or opt-out) cannot be changed later [R35]. Note Resend's wording: "opt-in" means contacts get the mail unless they unsubscribe [R35]. For mail that needs prior consent, the "opt-out" default is the one that matches Swedish law (contacts get nothing until they subscribe).
- **Unsubscribe with Resend.** For broadcasts and automations, Resend handles unsubscribes once `{{{RESEND_UNSUBSCRIBE_URL}}}` is in the email [R37, R38]. The hosted unsubscribe page is shared by every domain of the team and can be branded; removing "Powered by Resend" needs Pro [R38]. Language options are not stated [R38]. Whether broadcasts add the `List-Unsubscribe` and `List-Unsubscribe-Post` headers automatically is **not confirmed** in the official pages read (a third-party guide says yes). Check a test broadcast's raw headers.
- **Unsubscribe on our own sends.** Add `List-Unsubscribe: <https://…>` through `headers` on the send call; for bulk mail also `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The URL must accept a POST and answer 200 or 202 with a blank page; a GET shows the normal unsubscribe page; mail must stop within 48 hours [R36]. Transactional mail is generally exempt from an unsubscribe link [R37].
- **Gmail (2024 rules).** All senders: SPF or DKIM, TLS, valid forward and reverse DNS, RFC 5322, spam rate under 0.3% in Postmaster Tools [G1]. Senders of about 5,000 or more messages a day to personal Gmail accounts: SPF and DKIM, DMARC (policy may be `none`), From aligned with SPF or DKIM, and one-click unsubscribe (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`) plus a visible link for marketing and subscribed mail [G1]. Unsubscribes should be processed within 48 hours. Transactional mail is excluded. Once a bulk sender, always a bulk sender [G2].
- **Yahoo.** Same shape: SPF or DKIM and spam rate under 0.3% for all; bulk senders need SPF and DKIM, DMARC at least `p=none` that passes, alignment, one-click unsubscribe (RFC 8058 POST "highly recommended", mailto "acceptable") and unsubscribes honoured within 2 days [Y1].
- Tegen will not reach 5,000 a day, but meeting the bulk rules anyway costs little and Resend's own complaint limit (0.08%) is stricter [R6].

## 7. Consent in Sweden

The law, in short:
- **Main rule.** A business may use email for marketing to a natural person only if the person consented in advance (MFL 19 § first paragraph) [L1]. Konsumentverket: "Ett företag får bara kontakta dig i marknadsföringssyfte via e-post eller sms om du godkänt det." [L2]
- **Soft opt-in.** If the business got the email address "i samband med försäljning av en produkt" to the person, consent is not needed when (1) the person has not objected to marketing by email, (2) the marketing is for the business's own similar products, and (3) the person is clearly given a free and simple way to object both when the address is collected and in every later marketing message (MFL 19 § second paragraph) [L1]. Konsumentverket lists the same three conditions [L2].
- **Every marketing email** must contain a valid address the recipient can use to ask for the marketing to stop (MFL 20 §) [L1].
- **GDPR.** Direct marketing can be a legitimate interest (recital 47) [L6, L3], but the balancing test still applies, including what the person can reasonably expect [L3]. A person may object at any time, and the data must then no longer be used for marketing (article 21(2) and 21(3)) [L5, L4]. IMY: "Ni måste alltid upphöra med direktmarknadsföring om den registrerade invänder" [L3].
- The sources read do not say how long a soft opt-in lasts after the customer relationship ends, nor how the rules treat a reply to a person's own question. Both are **unknown** here and are questions for whoever gives Tegen legal advice.

Applied to Tegen (a reading of the sources above, not legal advice):

| | (i) Things they asked for | (ii) News and offers |
|---|---|---|
| (a) Lead from a contact form, no purchase | They asked to be contacted, so a personal reply about their request is what they expect. Whether a reply counts as "marknadsföring" is not settled by the sources read. | Needs prior consent (19 § first paragraph): no purchase, so soft opt-in does not apply. A drip with offers is marketing. `tegen-web`'s forms would need a consent box (Erik's code). |
| (b) Paying member | Service mail about their membership is not marketing. | Soft opt-in can apply (they bought), for Tegen's own similar services, if they were given a way to say no when the address was collected (in Mana or at sign-up: unknown) and in every email. |
| (c) Former member, day-pass or credit buyer | Mail about the old purchase only. | Soft opt-in can apply on the same conditions (they bought). How long after leaving is unknown. A former member who said no, or who unsubscribed in Mailchimp, must not get it. |

What every marketing email should contain: who it is from (CrossFit Tegen), a working way to say no in the email itself (link and a reply address) [L1, L2], and for list mail the one-click unsubscribe headers [G1, Y1]. The privacy policy must cover the emails and the legitimate-interest basis (PRD already plans this for at-risk alerts [P1]).

Note on at-risk members: the PRD says attendance-based alerts are "never used to message members automatically" [P1]. Phase 3 (automatic at-risk journeys) contradicts that and needs a new decision and assessment.

## 8. Drips and journeys

- **Resend Automations** (launched 2026-04-13 [R43]): triggered by a custom event the app sends; steps are delay, wait for event, condition, send email (from a published template), contact update, add to segment [R39]. `wait_for_event` has a timeout of at most 30 days and branches on "event received" or "timeout", with filters on event and contact fields [R41]. If a contact unsubscribes, the remaining send steps are skipped automatically [R40]. Stopping an automation stops new runs, but "Existing in-progress runs will continue to completion"; cancelling a single run through the API is not described [R40]. Resend does not add an unsubscribe link to automation emails; it must be in the template [R42]. Recipients are contacts (the step sends "to the contact"; whether non-contacts work is not stated) [R42]. Runs are priced per run after 10,000 [R1].
- **Our own scheduler** (Workflow, as `first-contact.ts` already does [P1]): one workflow per person and sequence, `sleep` until the next step [W1], and before each send a step that re-reads the database: still a lead, not booked, not a member, not replied, not unsubscribed, not suppressed, sequence not stopped, sending mode allows it. One row per planned step (person, sequence, step, due, status, Resend id) makes the plan visible in the CRM and makes duplicates impossible with a unique key.
- **Stopping.** With our own scheduler, "stop" is just a database state checked before each send; Mana sync (member found), stage changes (booked, Won, Cold) and staff actions (replied, logged contact) all set it. With Resend Automations, every stop reason must be pushed to Resend as an event or contact property, and runs already in progress cannot be cancelled one by one through the API [R40].
- **Replies.** Replies go to the `reply_to` mailbox (Google Workspace), which the CRM cannot see. Stop-on-reply therefore needs staff to log "svarade" (the existing log-contact action) unless inbound mail is added later (Resend has `email.received` [R14], out of scope in the brief).
- Recommendation: our own scheduler for phases 2 and 3. The stop conditions live in our database and Mana sync, the copy stays in the CRM, and it keeps contacts out of Resend until phase 4.

## 9. Mailchimp (facts only)

- **Export.** Owners and Admins can export an audience as CSV (a ZIP with one CSV per status when several): subscribed, non-subscribed, unsubscribed and cleaned. Exports include `OPTIN_TIME`, `OPTIN_IP`, `CONFIRM_TIME`, `CONFIRM_IP`, and a marketing permissions column for GDPR-enabled audiences. Not included: signup source, engagement, purchase history, full profile history. Export files are available for 30 days. Archived contacts export separately [M1].
- **Full account export.** One per 24 hours; includes audiences per status, campaigns (CSV plus HTML and TXT files), reports (opens, clicks, unsubscribes, per-contact activity) and templates as HTML [M2]. Drag-and-drop templates cannot be exported individually (search snippet only).
- **Campaign archive.** A shareable page of the 20 most recent emails, and hosted URLs for each sent email [M3]. What happens to those links after the account is closed is not stated [M3, M2]: **unknown**, ask Mailchimp.
- **What must move.** The unsubscribed and cleaned lists are the most important: they must be loaded into the CRM's suppression table (and Resend's, if Broadcasts are used) before the first newsletter, or people who said no will be mailed again. Consent evidence (`OPTIN_TIME`, `CONFIRM_TIME`, permissions) should be kept with the person.
- **What Tegen would lose.** Mailchimp's reports and engagement history (unless exported), its hosted archive (unknown after closing), and any Mailchimp sign-up forms (none found on the home page; other pages unknown). Mailchimp's DKIM record on the main domain [D1] would become unused.
- **Scope conflict.** The PRD lists "Replacing or syncing Mailchimp" and "Email or SMS automation and campaign tools" as out of scope for v1 [P1]. Sprint 3 in Notion includes it (per the brief). Phases 2 to 4 are therefore a scope change: the PRD's Out of Scope list, the privacy assumptions and the at-risk rule all need updating before they are built.

## 10. Testing

- **Test addresses.** `delivered@resend.dev`, `bounced@resend.dev` (SMTP 550 5.1.1), `complained@resend.dev`, all with `+label` support (for example `delivered+lead42@resend.dev`), and `suppressed@resend.dev` (no labels). They count against the sending quota [R13].
- **No sandbox or test mode** is described [R13]. The closest thing is the testing domain: without a verified domain, Resend only lets you send to your own account address (403 "You can only send testing emails to your own email address") [R10]. The API reference sends from `onboarding@resend.dev` to `delivered@resend.dev` in its example [R7], so test addresses appear to work without a domain, but this is not stated as a rule.
- **API keys.** A key's value is shown once. Keys can be limited to a domain, and a key can be limited to sending only [R47, R10]. Keys cannot be limited to recipients (not mentioned in [R47]), so recipient safety must be in our code.
- Do not test with made-up addresses at real providers: they bounce and count against the 4% limit [R6].

## Moving between accounts (Max's account now, Tegen's later)

- Teams are separate, each with its own API keys, billing and usage. One login can belong to several teams. Admins can invite people, update payment and delete the team [R29]. Transferring team ownership is not described [R29]: **unknown**, ask Resend support.
- **Domain.** Active in one team at a time. To move it between teams you control: delete it in the old team and add it again in the new one. For a team you do not control: claim it with a TXT record; the claim expires in 7 days; it can be blocked by `grace_period`, `recent_owner_activity` or `pending_scheduled_emails` [R25, R26, R27]. With recent sending activity, support must release it [R28]. After a claim, Resend shows records to add again [R28]; whether DKIM keys change is not stated in the docs read (the skill says they do). Expect a DNS change and a short gap either way.
- **Contacts:** export CSV and import CSV [R32, R33]. **Suppressions:** download as CSV [R18]; adding them in the new team goes through the API or dashboard. **Templates, webhooks, topics, segments, broadcasts, API keys, unsubscribe page:** no transfer is described in the pages read, so they must be created again (webhooks get a new signing secret, so `.env` changes). **Email history and logs** stay behind (30 days anyway) [R6].
- What breaks on a move: new API key and webhook secret in Vercel; scheduled emails in the old team (they also block a claim [R26]); tracked links if tracking was on and the domain is removed [R23]; Resend-side suppressions unless re-imported.
- Cheapest path (inference): create a separate Resend team called "Tegen HQ" from day one, never mixed with Max's other projects, keep consent and suppressions in the CRM's database, keep layouts in the repo. A later move is then "invite Tegen's admin and hand over billing" (if Resend allows it) or, at worst, re-add one subdomain, two env values and a CSV of suppressions.

## Recommended setup for Tegen HQ

1. **Account.** A dedicated Resend team "Tegen HQ" under Max's login, Free plan while building (100 per day is plenty for tests). Move to Pro ($20) when real sending starts if volume needs it [R1].
2. **Region and data.** Domain in eu-west-1 (Ireland). Accept and document that Resend stores metadata, logs and email content for 30 days in the US under the SCCs and DPF [R2, R3, R4]. Reduce what goes there: tracking off, tags hold ids only, no member lists in Resend contacts before phase 4, no free-text notes in emails.
3. **Domain.** `mail.crossfittegen.se` (name to be decided) on the Cloudflare zone: `send.mail` MX and SPF, `resend._domainkey.mail` DKIM, DNS only [R21]. Do not touch the main domain: it carries Google Workspace and another team's Resend setup [D1]. Ask whoever owns the zone to add `rua` to the main DMARC record so failures are visible.
4. **Sender.** `From: CrossFit Tegen <hej@mail.crossfittegen.se>` (example) and `Reply-To` the staff member's own Workspace address, so answers land where Fredrik and Timmy already read mail.
5. **One send module.** `src/lib/email/` is the only place that imports `resend` (enforced with an ESLint `no-restricted-imports` rule). Every send goes through it: guard, suppression check, consent check, message row, idempotency key `email/<messageRowId>` [R8], then Resend.
6. **Templates.** React Email layout in the repo; Swedish text in the CRM's database, edited by owners (as the Hör av dig till templates are today); HTML and text both rendered on the server [E1]. Preview with `email dev --port 3001` [E4].
7. **Events.** `/api/webhooks/resend` verifies with `resend.webhooks.verify` on the raw body [R16], stores events by `svix-id`, updates the message row, and writes bounces, complaints and suppressions to our own suppression table [R14, R15, R18].
8. **Consent and unsubscribes in our database.** A consent table (person, purpose, basis: consent or soft opt-in or legitimate interest, the exact wording shown, source, time) and the suppression table are the source of truth. Our own `List-Unsubscribe` URL plus `List-Unsubscribe-Post` on every non-transactional send, handled by a CRM route that answers POST with 200 and stops mail at once [R36, G1].
9. **Drips and journeys.** Workflow `sleep` with one row per planned step and a re-check before every send [W1]. Not Resend Automations, for the reasons in question 8.
10. **Newsletter (phase 4).** Most likely Resend Broadcasts with a topic whose default is "opt-out" (no mail until subscribed) [R35], contacts pushed from the CRM (only people with consent or soft opt-in), and `contact.updated` / `contact.topics.updated` webhooks back to the CRM [R14]. Fredrik composes in Resend's editor. The alternative is our own batch sends with our own unsubscribe, which keeps lists out of Resend but needs a newsletter editor in the CRM.

Trade-offs:
- Resend keeps data in the US. If Tegen requires EU storage for email content, Resend does not meet it today [R3], and another provider would be needed (not researched here).
- Text in our database means building a small editor and preview in the CRM, but Fredrik never needs a Resend login for phases 1 to 3 and the layout cannot drift.
- Our own scheduler is more code than Resend Automations, but stop rules use data only the CRM has, and no contact list has to live in Resend.
- Broadcasts for the newsletter give a ready editor, unsubscribe page and stats, at the cost of member lists in Resend (US) and two places that know who unsubscribed (kept in step by webhooks).

## Making "test addresses only" impossible to break

Layers, each enough on its own:
1. **Mode switch, default safe.** `EMAIL_MODE` is `test` unless set to `live`. Only the production environment may ever hold `live`, and it stays `test` until the review with Erik (ticket 18). Flipping it is a review checklist item.
2. **Recipient rewrite in test mode.** In `test`, the send module replaces every recipient with `delivered+<messageRowId>@resend.dev` (or a short allowlist of Max's own test inboxes from env), and records the intended recipient only in our own log. Staff can click "Skicka" on a real-looking record in dev or production and nothing leaves for a real person. A unit test feeds real-looking addresses and asserts that only `@resend.dev` or allowlisted addresses reach the client.
3. **Single import point.** ESLint forbids importing `resend` outside `src/lib/email/`; the wrapper is the only path.
4. **Keys per environment.** Local development has no Resend key by default (the module logs instead of sending). Preview deployments get a sending-only key [R10] and are forced to `test` regardless of env. Keys live only in `.env.local` and Vercel.
5. **Nothing real inside Resend.** No real contacts are imported into Resend before the review, so a dashboard broadcast (which bypasses our code) has no one real to reach.
6. **Optional provider-side lock.** Until the DNS records are added, the Resend team has no verified domain, so Resend itself refuses any recipient other than the account's own address [R10].

## Phased plan

**Phase 1: 1-to-1 email from the CRM (lead or at-risk member).**
- Replace the "E-post opens your mail program" action with "Skicka" through the send module, using Tegen's template text, logged in the person's history, with `Reply-To` the staff member.
- Build: subdomain and DNS, Resend team, send module with test mode, message table, webhook route, suppression table, React Email layout, preview.
- Consent: a reply to a lead's own request, or a personal message to a member. Still include who it is from and how to say no, since an at-risk "come back" email may count as marketing.
- Exit: Erik's review (ticket 18) with only test addresses used.

**Phase 2: lead drip sequences.**
- Needs a consent checkbox and wording on `tegen-web`'s forms, stored with the lead (Erik), because leads have not bought anything.
- Workflow per lead and sequence (for example day 0, 2, 7), one row per step, stop on booked, member, Won, Cold, replied (logged by staff), unsubscribed, suppressed.
- One-click unsubscribe headers and footer link on every drip email.

**Phase 3: win-back and at-risk journeys.**
- Needs a PRD change: today the PRD says at-risk data is never used to message members automatically [P1].
- Basis: soft opt-in for members and former customers (if they were offered a way to say no when the address was collected), plus a written legitimate-interest assessment.
- Same scheduler and stop rules; stop when the member checks in again (from Mana sync).

**Phase 4: newsletter replacing Mailchimp.**
- Needs a PRD change (Mailchimp is out of scope today [P1]).
- Full Mailchimp account export; load unsubscribed and cleaned addresses into the suppression table first; keep consent timestamps.
- Decide Broadcasts (Resend editor, contacts in Resend) or own batch sends. Likely Marketing plan pricing by contact count [R1].
- Check that broadcasts carry `List-Unsubscribe-Post` (not confirmed in the docs).

## What Max, Erik or Fredrik must decide or provide

- **DNS access (Erik, Fredrik or Timmy).** Who has the Cloudflare account for crossfittegen.se and who has the One.com account. The domain renews on 2026-12-20 [D1].
- **Existing Resend account (Erik).** Whose Resend team holds the main domain (eu-west-1) that `tegen-web` uses, and whether the CRM should be a separate team (Max's decision so far) or a subdomain in that team.
- **Subdomain name (Max with Fredrik).** For example `mail.`, `hej.` or `post.crossfittegen.se`.
- **Sender name and address, and Reply-To (Fredrik and Timmy).** For example "CrossFit Tegen" from `hej@mail…`, replies to each staff member or to one shared inbox.
- **DMARC on the main domain (DNS owner).** Add a `rua` address for reports; keep `p=quarantine`.
- **Copy (Fredrik, Timmy, Erik).** Every template, drip step, footer and unsubscribe text in Swedish.
- **Consent wording (Tegen, with legal advice).** The checkbox text on `tegen-web` forms, the soft opt-in notice at sign-up (does Mana show one?), the privacy policy text, and the legitimate-interest assessment.
- **Legal open questions (Tegen's adviser).** Whether a reply to a lead's request is marketing; how long after membership ends soft opt-in lasts; whether 1-to-1 at-risk emails count as marketing.
- **Scope (Max).** Approve the PRD changes for phases 2 to 4 (automation, at-risk messaging, Mailchimp).
- **Data in the US (Max with Tegen as controller).** Accept Resend's US storage with SCCs and DPF, or require EU storage (which rules Resend out).
- **Plan and cost (Max, later Tegen).** Free while building; Pro transactional and possibly a Marketing plan once the newsletter list size is known (Tegen's Mailchimp list size is unknown).
- **Mailchimp (Fredrik or whoever owns it).** An account export before anything is closed, and whether the archive links must keep working.
- **Hand-over (Max).** Ask Resend support whether team ownership can be transferred, before choosing between "hand over the team" and "re-create in Tegen's team".

## Contradictions with the ground rules

1. **"Data stays in the EU."** Resend stores all account data, email metadata, logs and email content (30 days) in the US, whatever the sending region [R2, R3, R6]. This is the main conflict. It needs an explicit decision.
2. **"Keys only in `.env.local` and Vercel."** React Email's `email resend setup` saves the key in the home directory [E4]; the Resend skill suggests `export RESEND_API_KEY=…` in a shell. Use neither.
3. **"Test addresses only."** Resend has no test mode [R13]. Broadcasts sent from the dashboard bypass our code. Hence the layers above and no real contacts in Resend before the review.
4. **PRD scope.** Mailchimp replacement and email automation are out of scope in the PRD, and at-risk data must never message members automatically [P1]. Phases 2 to 4 need the PRD changed first.
5. **"Nothing writes to Mana, Pipedrive or Notion."** Nothing in Resend requires that. No conflict.
6. **Erasure requests.** Deleting a person in the CRM (PRD story 54) does not delete their Resend contact or the copies of sent emails kept for 30 days; Tegen answers data subject requests itself [R3]. The delete function should also remove the Resend contact once contacts exist there. Whether a sent email's stored content can be deleted early is unknown.
7. **Hobby limits.** No conflict: delays use Workflow `sleep`, and Resend's `scheduled_at` (up to 30 days) could also be used for single delayed sends [R11].

## Where the skills disagree with the docs

- Rate limit: the Resend skill says 2 requests per second; the docs say 10 per second per team [R9, R6].
- Batch scheduling: the skill says batch does not support `scheduled_at`; the scheduling docs say each email in a batch can be scheduled [R11]. The batch reference only rules out attachments [R12].
- Bounce types: the skill says `Transient`; the docs say `Permanent` and `Temporary` [R15].
- DKIM: the skill's domain notes speak of DKIM CNAMEs; the docs and the live DNS for crossfittegen.se use a TXT record [R21, D1].
- Domain claims: the skill says a claim issues new DKIM keys; the docs read do not say so [R26, R28].
- Broadcast headers: a third-party guide says broadcasts add one-click headers automatically; the official pages read do not confirm it [R36, R37, R38].

No instructions aimed at the researcher were found in the pages or skill files read.
