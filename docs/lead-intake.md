# Lead intake: sending leads from tegen-web to Tegen HQ

Tegen HQ takes a copy of every lead as a sixth destination, next to the email, Discord, Notion, Pipedrive and Meta steps, which keep working unchanged. Tegen HQ sends nothing on from here: the lead lands in its pipeline and on its home page.

## Endpoint

```
POST https://<tegen-hq-address>/api/leads/intake
Authorization: Bearer <secret>
Content-Type: application/json
```

Max sends the address and the secret separately. Keep the secret server-side, for example in an environment variable such as `TEGEN_HQ_INTAKE_SECRET`.

## Body

One JSON object per lead, from any of the four routes:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Your id for this lead. Sending the same id again is treated as a retry and changes nothing, so retries are safe. |
| `route` | `"contact"`, `"qualification"`, `"chat"` or `"escalate"` | yes | Which tegen-web route the lead came through. |
| `name` | string | yes | |
| `email` | string or null | one of email/phone | |
| `phone` | string or null | one of email/phone | Any format; Tegen HQ normalises it for matching. |
| `message` | string or null | no | What the person wrote. |
| `attribution` | string or null | no | Exactly as `formatAttribution` builds it, for example `facebook / paid · kampanj: Höst · fbclid: …`, `ref: google.se` or `Direkt / okänd`. Stored as received; click ids are never shortened. |
| `landingPage` | string or null | no | |
| `submittedAt` | ISO 8601 string or null | no | When the person sent it. Arrival time if left out. |
| `answers` | object or null | no | Qualification answers or anything else worth keeping, as key/value pairs. |

Extra fields are accepted and stored with the rest of the body, so sending more than this never breaks anything.

Example:

```json
{
  "id": "qual_2026-10-13_8f3a",
  "route": "qualification",
  "name": "Anna Andersson",
  "email": "anna@example.com",
  "phone": "070-123 45 67",
  "message": "Vill börja träna i höst",
  "attribution": "facebook / paid · kampanj: Höst 2026 · fbclid: IwAR3x…",
  "landingPage": "https://crossfittegen.se/prova-pa",
  "submittedAt": "2026-10-13T08:00:00+02:00",
  "answers": { "mål": "Styrka", "erfarenhet": "Nybörjare" }
}
```

## Responses

| Status | Body | Meaning |
|---|---|---|
| `201` | `{ "status": "created", "leadId": "…" }` | A new lead. |
| `200` | `{ "status": "duplicate", "leadId": "…" }` | The person was already known (same email, otherwise same phone); the submission was added to their lead. |
| `200` | `{ "status": "already_received", "leadId": "…" }` | This `id` was received before. Nothing changed. |
| `200` | `{ "status": "test" }` | A test lead (contains `test-lab37`, `ignorer` or `testlead`). Logged, never made into a lead. |
| `400` | `{ "error": "invalid_payload", "issues": [{ "path": "email", "message": "…" }] }` | The body does not match the table above. |
| `400` | `{ "error": "invalid_json" }` | Not JSON. |
| `401` | `{ "error": "unauthorized" }` | Missing or wrong secret. |
| `413` | `{ "error": "too_large" }` | Over 64 kB. |

A `5xx` or a timeout can be retried with the same `id`.

Every call that is turned away (401, 400 or 413) is noted in Tegen HQ under Inställningar → Inkommande leads, with the reason (no secret sent, wrong format, wrong secret, which fields were wrong) and the time, but never what was sent. So if leads do not arrive, Max can see whether your calls reach Tegen HQ and why they are refused.

Please make the call so that a failure here never affects the other five destinations (for example, fire it last and catch errors), since Tegen HQ is not yet the system anyone relies on.

## Trying it

Send a test lead first. Anything containing `testlead` is logged and shows under Inställningar → Inkommande leads in Tegen HQ, without creating a lead:

```bash
curl -i -X POST "https://<tegen-hq-address>/api/leads/intake" \
  -H "Authorization: Bearer $TEGEN_HQ_INTAKE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-1","route":"contact","name":"Testlead Erik","email":"testlead@example.com"}'
```

Expected: `200 {"status":"test"}`.
