# 09: Lead intake from tegen-web

**What to build:** An endpoint that `tegen-web` POSTs every real lead to, as a sixth destination next to email, Discord, Notion, Pipedrive and Meta (which all keep working unchanged). Max gives Erik the URL and a shared secret, and Erik adds the POST in `tegen-web`. The CRM does not change `tegen-web`. Leads land in the pipeline with their source and attribution, test leads are flagged, and duplicates follow LAB37's rules so the counts match LAB37's reports.

**Blocked by:** 02, and access to `tegen-web`'s payload schemas (`contactPayloadSchema`, `qualificationPayloadSchema` in `src/lib/qualification-schema.ts`) and `formatAttribution` (`src/lib/notion-leads.ts`).

**Status:** done (2026-10-19)

- [x] The endpoint accepts the contact and qualification payloads exactly as `tegen-web` sends them (contract tests against the real schemas), from all four routes (`/api/contact`, `/api/qualification`, `/api/chat`, `/api/escalate`)
- [x] Requests without the shared secret are refused, and the secret is compared in constant time
- [x] The endpoint is reachable from `tegen-web` despite Vercel's Deployment Protection (a bypass for this path or protection off for production), and nothing else is opened up
- [x] The raw payload is stored with its timestamp, and a retry of the same lead never creates a second one
- [x] The attribution string is stored exactly as received and parsed into fields: UTM source and medium, campaign (`kampanj:`), click ids (`gclid:`, `fbclid:` and others), `ref: <host>` and `Direkt / okänd`. It is never cleaned up and click ids are never shortened
- [x] Leads containing `test-lab37`, `ignorer` or `testlead` are flagged as tests and left out of lists, the home page and counts
- [x] Duplicates match on email first, then the last 9 digits of the phone number, and the earliest lead wins (the same rules as LAB37's reports). Manual entry uses the same rule
- [x] No notification reaches Fredrik or Timmy: anything the CRM sends goes to the project's own test channel until the review (ticket 18)
- [x] Tested with throwaway records only, never with a real lead
- [x] Max sends Erik the URL and the secret, and Erik switches on the copy
- [x] The five existing destinations are confirmed to still work (confirmed by Max 2026-10-19)
- [x] The first real (non-test) lead arrives through the intake

Notes (2026-10-13): Erik said he only needs the endpoint and will connect to it, so Tegen HQ defines the contract (docs/lead-intake.md) instead of copying tegen-web's schemas. POST /api/leads/intake with Authorization: Bearer <LEAD_INTAKE_SECRET>, compared in constant time. Body: id (sender's lead id; a retry is recognised by claiming it first), route (contact, qualification, chat, escalate), name, email/phone, message, attribution (stored as received and parsed), landingPage, submittedAt, answers; extra fields are accepted and stored. Sources: contact → Kontaktformulär, qualification → Kvalificeringsformulär, chat and escalate → Chatbot. Test leads are logged as submissions only, never made into leads. A repeat from a known person lands on their lead (email, then phone, as manual entry). The message and answers become a "Från webben" note. No notifications. Privacy deletion removes submissions too. Inställningar → Inkommande leads shows the address, whether the secret is set, and the latest submissions. Still to confirm in production: Deployment Protection lets the call through, and the five existing destinations keep working once Erik switches it on.

Update (2026-10-16): Erik connected tegen-web. His test lead arrived at 09:23:50 UTC (fields id, name, email, route) and was flagged as a test, so Deployment Protection lets the call through. Calls the intake turns away are now kept under Inställningar → Inkommande leads ("Avvisade anrop", reason only), since Vercel Hobby keeps logs for about an hour. No real lead through the intake yet as of 2026-10-18.

Update (2026-10-18): 5 real submissions so far (16 Oct 19:58 to 17 Oct 10:47), all from the qualification form: 3 new leads and 2 repeats from the same person within minutes, merged into their lead. Each came with name, email, phone, the answers (mål, erfarenhet), attribution and when it was sent; most also with the landing page. Attribution parsed as UTM source and medium, campaign and click ids, and once as "Direkt / okänd". Nothing turned away. Max saw the same lead in Pipedrive. The Discord test channel got one "overdue first contact" post per new lead (Tegen still works leads in Pipedrive, so none was contacted in Tegen HQ).

Done (2026-10-19): Max confirmed the other destinations (email, Discord, Notion, Meta, Pipedrive) still work with Tegen HQ as the sixth.
