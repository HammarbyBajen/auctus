# Pipedrive: research notes

Research date: 2026-10-07. Official sources only (pipedrive.com, developers.pipedrive.com, pipedrive.readme.io which hosts Pipedrive's own developer docs, support.pipedrive.com).

Method note: pages were read with WebFetch (summarised by a small model) and WebSearch snippets restricted to official domains. Numbers copied from summaries should be re-checked against the pages before being hard-coded. https://www.pipedrive.com/en/pricing returned HTTP 403 to fetch, so plan prices come from search-result text attributed to that page and to support articles; treated as unverified.

Sources:
- [P1] https://developers.pipedrive.com/docs/api/v1 (API reference landing; also .../Persons, /Deals, /Leads, /Activities, /Organizations, /Pipelines, /Stages, /Products)
- [P2] https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting
- [P3] https://pipedrive.readme.io/docs/core-api-concepts-authentication
- [P4] https://pipedrive.readme.io/docs/marketplace-scopes-and-permissions-explanations
- [P5] https://pipedrive.readme.io/docs/guide-for-webhooks-v2
- [P6] https://pipedrive.readme.io/docs/core-api-concepts-custom-fields
- [P7] https://pipedrive.readme.io/docs/pipedrive-api-v2-migration-guide
- [P8] https://support.pipedrive.com/en/article/usage-limits-in-pipedrive
- [P9] https://support.pipedrive.com/en/article/new-pipedrive-plans
- [P10] https://support.pipedrive.com/en/article/how-many-workflows-can-i-have-in-pipedrive (and /workflow-automation)
- [P11] https://support.pipedrive.com/en/article/importing-data-into-pipedrive-with-spreadsheets and https://support.pipedrive.com/en/article/exporting-data-from-pipedrive
- [P12] https://www.pipedrive.com/en/pricing (not fetchable; search snippet only)
- [P13] https://developers.pipedrive.com/changelog/post/breaking-changes-token-based-rate-limits-for-api-requests (seen in search results, not fetched)

## 1. Core data model

From the API reference sections [P1] and endpoint pages:
- **Persons**: individual contacts. Linked to organizations, deals, activities.
- **Organizations**: companies.
- **Deals**: sales opportunities with value, pipeline and stage, status; can link a person and organization; support products, discounts, followers, participants, installments.
- **Leads**: potential deals held in the Leads Inbox. Must be linked to a person or organization (or both). Fields: title, value, expected close date, owner, labels, visibility, channel; custom fields are shared with deals. Convert lead to deal is an asynchronous job with a conversion id and a status endpoint; on success notes, files and activities move to the deal and the lead is marked deleted. (Leads page)
- **Activities**: "appointments/tasks/events on a calendar" tied to a deal, lead, person and organization. Fields include type, subject, due_date, due_time, person_id, deal_id, lead_id, owner_id, done, location, participants, attendees. (Activities page)
- **Pipelines**: ordered collections of **stages**. (Pipelines page)
- **Products**: catalog items, with variations, images, followers; attachable to deals (deal products). (Products page)
- Also present: notes, files, users, projects/boards/phases/tasks, mail, goals, webhooks. (P1, P5)

## 2. REST API

- Versions: v1 and v2 coexist. v2 is available for products, deal products, pipelines, stages, deals, persons, organizations, activities, fields, projects, boards, phases, templates, tasks. (P7) Leads remain mostly on `/api/v1/leads` (CRUD) with `/api/v2/leads/search` and convert endpoints. (Leads page) v1 deprecation date: not stated in what I read.
- Base URL: `https://{companydomain}.pipedrive.com/api/v2/` (company-specific domain). (P3). Whether `https://api.pipedrive.com` is still accepted: unknown from my reads.
- v2 changes: PUT replaced by PATCH; offset pagination replaced by cursor; custom fields moved into a `custom_fields` object (e.g. `"custom_fields": {"<key>": {"value": 2300, "currency": "EUR"}}`). (P7)
- Format: JSON; CORS supported; OpenAPI 3 specs published; official client libraries for Node.js and PHP; recommends a sandbox account for testing. (P1)

Representative endpoints (from the pages above):
- Persons: `GET/POST /api/v2/persons`, `GET/PATCH/DELETE /api/v2/persons/{id}`, `GET /api/v2/persons/search`, `PUT /api/v1/persons/{id}/merge`, `GET /api/v1/persons/{id}/changelog|files|flow|mailMessages|products`.
- Organizations: `GET/POST /api/v2/organizations`, `GET/PATCH/DELETE /api/v2/organizations/{id}`, `GET /api/v2/organizations/search`, merge via `PUT /api/v1/organizations/{id}/merge`.
- Deals: `GET/POST /api/v2/deals`, `GET/PATCH/DELETE /api/v2/deals/{id}`, `GET /api/v2/deals/archived`, `GET /api/v2/deals/search`, discounts, followers, `POST /api/v2/deals/{id}/convert/lead`, v1 participants, products/duplicate/merge/timeline/summary.
- Leads: `GET/POST /api/v1/leads`, `GET/PATCH/DELETE /api/v1/leads/{id}` (path shapes per page; PATCH and DELETE take the id), `GET /api/v1/leads/archived`, `GET /api/v2/leads/search`, `POST /api/v2/leads/{id}/convert/deal`.
- Activities: `GET/POST /api/v2/activities`, `GET/PATCH/DELETE /api/v2/activities/{id}`.
- Pipelines: `GET/POST /api/v2/pipelines`, `GET/PATCH/DELETE /api/v2/pipelines/{id}`.
- Stages: `GET/POST /api/v2/stages`, `GET/PATCH/DELETE /api/v2/stages/{id}`.
- Products: `GET/POST /api/v2/products`, `GET/PATCH/DELETE /api/v2/products/{id}`, `/search`, variations, images, duplicate.
- Custom fields: `/dealFields`, `/personFields`, `/organizationFields`, `/productFields`, `/projectFields` (POST create, PATCH update, DELETE). (P6)
- Webhooks: `POST /v1/webhooks`. (P5)

**Pagination**: v2 lists use `cursor` and `limit`; default 100, maximum 500; cursor is an opaque string for the next page. v1 uses `start` and `limit` (Persons, Leads pages). Search endpoints support cursor. (Persons page, P7)

**Upsert**: no native upsert endpoint was seen in the pages read. To avoid duplicates, search by email first (`/persons/search`) or store the external id in a custom field. (inference, not documented as a pattern in what I read)

## 3. Rate limits (token-based) [P2]

- Since 2024-12-02 token-based daily budgets apply (changelog [P13]; date from search snippet).
- Daily budget = 30,000 base tokens x plan multiplier x number of seats (+ purchased top-ups). Multipliers: Lite 1x, Growth 2x, Premium 5x, Ultimate 7x. Resets at midnight server time. (P2). [P8] lists the same as per-seat tokens: Lite 30,000, Growth 60,000, Premium 150,000, Ultimate 210,000, max 100M.
- Token cost per call: get one entity 2, get list 20, update one 10, delete one 6, delete list 10, search 40. v2 endpoints cost less than v1 (Activities page shows v2 costs of 10 list, 1 get, 5 create, 5 update, 3 delete, which differ from the generic table, so use per-endpoint docs).
- Burst limits per rolling 2 seconds: with API token Lite 20, Growth 40, Premium 100, Ultimate 120; with OAuth apps Lite 80, Growth 160, Premium 400, Ultimate 480; Search API 10 per 2 seconds on all plans.
- Headers: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `x-daily-requests-left` (API token only).
- Exceeding: 429. Repeated 429s can lead to 403 via Cloudflare blocking. Admin emails at 75% and 100% of budget.
- Practical note: a booking sync that polls would burn budget; webhooks plus targeted writes are cheaper. Example arithmetic (mine, from P2): a Lite single seat has 30,000 tokens/day, i.e. 1,500 list calls or 3,000 single updates.

## 4. Authentication and scopes

- **API token**: sent in the `x-api-token` header; tied to one user and company and gives access to all of that user's data; one active token per user; regenerating breaks integrations using the old one. (P3) The page I read mentions no query-parameter option; older docs used `?api_token=`, status now unknown.
- **OAuth 2.0**: for apps (marketplace); guides "OAuth 2.0 overview" and "OAuth authorization" referenced but not read in detail. OAuth apps get higher burst limits (P2).
- **Scopes** (P4): base; deals:read/full; contacts:read/full; activities:read/full; mail:read/full; products:read/full; deal-fields:full; contact-fields:full; product-fields:full; project-fields:full; leads:read/full; projects:read/full; admin (pipelines, stages, fields, activity types, users, webhooks); users:read; recents:read; search:read; webhooks:read/full; phone-integration; video-calls; messengers-integration; goals:read/full.
- An API token carries the user's permissions with no scope narrowing; a dedicated service user with limited permissions would be the mitigation (inference, not from a source).

## 5. Webhooks [P5]

- Events = `event_action` x `event_object`. Actions: create, change, delete. Objects: activity, deal, deal_installment, deal_product, lead, note, organization, person, pipeline, product, stage, user, board, phase, project, task. Wildcards allowed (`*.*`, `*.deal`).
- Payload v2: `meta` (action, entity, user_id, timestamp, attempt, change_source app or api), `data` (current entity, related ids), `previous` (changed fields only on update). Default version 2.0.
- Setup: `POST /v1/webhooks` with `subscription_url` (public, no redirects), `event_action`, `event_object`, optional `user_id`, `http_auth_user`/`http_auth_password` (HTTP basic), name, version. Or UI: Settings > Tools and apps > Webhooks. Admins manage all; users their own.
- Limits: 40 webhooks per user; any 2XX is success; retries after 3, 30, 150 seconds; webhook banned 30 minutes after 10 consecutive first-attempt failures; auto-deleted after 3 consecutive days without successful delivery.
- `change_source` helps avoid sync loops (ignore events caused by our own API writes). (inference from field name)

## 6. Custom fields [P6]

- Keys are 40-character hashes, different per account, cannot be renamed (display name can). Created via API per entity (list in section 2).
- 16 types: varchar, varchar_auto, text, double, monetary, enum, set, user, org, people, phone, time, timerange, date, daterange, address.
- `edit_flag` true marks custom fields. Fields cannot be copied across accounts; recreate them (new keys).
- Limits by plan [P8]: Lite 30, Growth 100, Premium 300, Ultimate 500 (Enterprise 1,000, legacy naming).

## 7. Automations [P10]

- Available on Growth and above (Lite: none). Active automations: Growth 50, Premium 150, Ultimate 250.
- Event triggers on deal, person, activity, lead, organization, project (added, updated, deleted); date triggers on deal, person, activity, organization.
- Up to 10 actions per automation; wait/delay/if-else step limits per plan (Growth 3 each; Premium/Ultimate 10 wait and delay; if/else 10 Premium, 20 Ultimate).
- Execution caps: 10,000 per 10 minutes company-wide, 5,000 per 10 minutes per automation; 40 email actions per minute.
- Whether automations can call an outbound webhook or HTTP action: not confirmed in what I read.

## 8. Import and export [P11]

- Import: XLS, XLSX, CSV; one tab per import; header row; max 50,000 rows and 50 MB; records: people, organizations, leads, deals, projects, activities, notes, products. Path: account menu > Tools and apps > Import data > Import from spreadsheet. People need a name; organizations need a name; deals and leads need a linked person or organization. A separate article covers updating existing data from a spreadsheet.
- Export: XLSX or CSV of deals, organizations, people, leads, products, activities, projects, notes, files; path Tools and apps > Export data.

## 9. Plans and API access

- Plans (2025 names): Lite, Growth, Premium, Ultimate (formerly Essential, Advanced, Professional/Power, Enterprise). (P9)
- Search-result text attributed to the pricing page [P12] (unverified): Lite $14, Growth $39, Premium $59, Ultimate $79 per seat per month billed annually; "all plans include API access". Prices for SEK/EUR not verified.
- API access is by token budget scaling with plan and seats (section 3), not gated per plan from what I read.
- Record caps (leads plus deals) per seat: Lite 2,500, Growth 5,000, Premium 15,000, Ultimate 20,000, max 300,000 combined. (P8)
- Premium adds LeadBooster (chatbot, live chat, web forms) and team inbox. (P9)

## 10. Syncing from an external booking system (Mana) into Pipedrive

Documented building blocks (not an official recipe):
- Create/update persons via `POST /api/v2/persons` and `PATCH /api/v2/persons/{id}`; look up by email via `/api/v2/persons/search` (40 tokens per search, 10 searches per 2 s).
- Store Mana ids (user id, membership id) in person or deal custom fields (key hashes must be looked up per account via `/personFields`, `/dealFields`).
- Model leads as `leads` or as deals in a pipeline whose stages reflect the funnel; bookings and check-ins as activities (`type`, `due_date`, `person_id`, `done`).
- Memberships could be deals with products attached (Products + deal products endpoints).
- Inbound changes from Pipedrive via webhooks (`change.person`, `create.deal`, etc.).
- Budget for token costs and burst limits when backfilling; import via spreadsheet is an alternative for the initial load (50,000 row cap).
- Mana side: see `mana-api.md` (studio API key, no webhooks documented there as far as I noted; check that file).

## Open questions

- Official v1 sunset date, and whether `api.pipedrive.com` still works or only the company-domain base URL.
- Exact current prices in SEK and what each plan includes (the pricing page was not fetchable); confirm "all plans include API access".
- Is there an upsert or a unique-key mechanism on persons (e.g. by email or external id)? Not found.
- Does the v2 API cover leads yet (only search/convert seen)? Leads pagination in v1 is offset based.
- Can Automations make outbound HTTP calls, and is there a native "Webhooks" action vs the event webhooks above?
- OAuth 2.0 specifics (token lifetime, refresh, marketplace listing requirement) were not read; is OAuth required for a private single-customer integration, or is an API token fine?
- Token costs per v2 endpoint (the generic table and the Activities page disagree); read each endpoint page for exact figures.
- Recommended pattern for recording history (activities vs notes) for many booking events, given record and token budgets.
- Data residency and GDPR terms for storing Swedish member data (not researched).
