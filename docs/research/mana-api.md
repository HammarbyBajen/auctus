# Mana studio API: research notes

Research date: 2026-10-07. Primary sources only.

- **[S1]** https://www.getmana.app/api/v1/docs (human-readable reference)
- **[S2]** https://www.getmana.app/s/tegen/agents/api.md (agent-facing instructions for the studio with slug `tegen`)
- **[S3]** https://www.getmana.app/api/v1/openapi (OpenAPI 3.0.0 JSON spec, linked from both S1 and S2; fetched in full, about 528 KB, 77 paths)

## 0. Fetch status and method

- S2: fetched fully with WebFetch. Public, no auth needed.
- S1: the page is a client-rendered Scalar API Reference shell. WebFetch returned only the title "Scalar API Reference"; a raw fetch (about 5 KB HTML) contains only theme CSS and a pointer to `/api/v1/openapi`. Its real content is therefore S3. Nothing on S1 itself could be read beyond that.
- S3: WebFetch returned only a partial summary, so the JSON was downloaded with curl and parsed locally. The endpoint listings in section 7 are generated mechanically from S3 (parameters, bodies, response shapes compacted; long descriptions truncated at about 700 characters, long schemas at about 900). Shape notation: `?` = optional field, `|null` = nullable, `[]` = array, `uuid`/`date-time` are string formats. Where a listing is truncated, consult S3 directly.
- No authenticated calls were made (no key available, and S2 says never to request one). All findings are from documentation, not observed live behavior.

## 1. Purpose and overview

- S2: "a JSON HTTP API for one studio", with paths scoped to a studio id. It covers members, bookings, waitlists, memberships, credits, courses, payments, check-ins, venues, rooms and instructors. Status stated as alpha, shapes may change. (S2)
- S3 `info`: title "Mana studio API", version `alpha`. "HTTP API for app and integration clients." Two credentials work: a Supabase user JWT (a signed-in person) and a studio API key (server-to-server). (S3)
- Example studio in S2: CrossFit Tegen, slug `tegen`, id `<studio id>`, timezone `Europe/Stockholm`, currency SEK. (S2)

## 2. Base URL

- `https://www.getmana.app` (S3 `servers`: "This Mana deployment"). S2 example calls use `https://www.getmana.app/api/v1/studios/{studioId}`. All paths below are prefixed `/api/v1`.

## 3. Authentication

- Header on every authenticated call: `Authorization: Bearer <token>`. Endpoints with no `security` in the spec are public and "must be called with no `Authorization` header". (S3 info, S2 curl example)
- Two token types in the same header (S3 `bearerAuth`):
  1. **User access token**: a Supabase Auth JWT, acts as that person, accepts `userId=me`.
  2. **Studio API key**: format `mana_sk_...`, acts as an owner of the one studio that issued it, may name any member of that studio wherever a studio owner/admin/staff may, reaches no other studio.
- Obtaining a key: only a studio **owner**, under Admin > System settings > API keys. For tegen: https://www.getmana.app/s/tegen/admin/system-settings/api-keys. Create a labeled key; it is shown once and never retrievable afterwards (only its prefix is stored). Revocable there, effective on the next request. (S2, S3)
- **Scopes: none.** "There are no per-key scopes", so a key can read and change every member, booking and payment record in its studio. (S3 info and bearerAuth)
- Key restrictions (S2, S3):
  - `userId=me` is rejected: `400` for a query param, `422` for a body field. Name the member explicitly.
  - Endpoints that act on the token holder (friends, friend requests, suggestions, invites and similar social features, per S3 operation text) answer `403 api_key_not_supported`.
  - Users from other studios appear as `404 user_not_found` (S2).
  - Studio operations support keys for server-to-server access (S3 summary of operation text).
- Handling rules (S2): never put a key in browser or mobile code or any shipped bundle; never ask for the key in the agent conversation; store in an env var such as `MANA_API_KEY` in a gitignored `.env.local`; if exposed even briefly, say so and have it revoked immediately. S3 adds: never commit or log it.
- Other error code seen: `403 oauth_token_not_supported` (S3 error enums). Meaning of OAuth tokens is not explained in the sources I parsed (open question).
- The key performs a sign-in on every call; that sign-in has a limit "shared across the deployment" (S3, see rate limits).

## 4. Request and response conventions

(S2 "Wire conventions", S3 schemas)

- JSON; keys `camelCase`; enum values `snake_case`.
- Success: `{ "data": { ... } }`, optionally with metadata.
- Money: integer minor units (S2: 149.50 SEK is `14950`); S3 money objects look like `{ amount: integer, currency: "SEK"-style ISO code }`.
- Dates: ISO-8601 instants; inputs need an explicit offset (S2). S3 uses `date-time` format.
- Several fields and query params are marked deprecated aliases in S3 (for example `from`/`to` as aliases of `fromAt`/`toAt`, `startDate`/`endDate` as aliases of `startsAt`/`endsAt`, `categoryId` replaced by `scheduleCategoryIds`).
- Some responses are cache-controlled (`Cache-Control`, `Vary: Accept-Language` on public FAQ); personal endpoints are described as uncached (`private, no-store`). (S3)

## 5. Pagination

- Lists: `{ "data": { "items": [ ... ] }, "links": { "self", "next", "prev" }, "meta": { "pageIndex", "pageSize", "totalCount" } }`. `links.next` and `links.prev` are nullable URIs; `meta.totalCount` is nullable (S3 example shows `0`, `25`, `null`). (S2, S3)
- Follow `links.next`; `null` means done. (S2)
- Query params `pageSize` and `pageIndex` (integers; `pageSize` is a positive integer in S3; default 25 on at least `GET /studios`; zero-based index is implied by the `pageIndex: 0` example but not stated). Maximum page size: **unknown** (S3 shows only an integer-safe upper bound).
- Some lists are explicitly unpaginated (for example friend suggestions: "there is no pagination", capped by the product). `413 response_too_large` exists as an error. (S3)

## 6. Rate limits, errors, retries

**Rate limits** (S3 info): any endpoint may answer `429 rate_limited`, even if the operation does not list it. "Back off and retry rather than looping." For key requests it can also come from the per-call sign-in, whose limit is shared across the deployment; it means slow down, never an invalid key, and may omit `Retry-After`. Some 429 responses define a `Retry-After` header (seconds), mirrored in `error.details`. Numeric limits (requests per minute and so on): **not documented**.

**Error envelope** (S3): `{ "error": { "code": "snake_case_code", "requestId": "<uuid>", "message"?: string, "details"?: any } }`. Include `requestId` when reporting problems.

**Status codes in S2**: 401 unauthenticated; 403 not authorized or key not supported; 404 not found; 422 validation error; 429 rate limited; 500/502 server errors, safe to retry (reads).

**Retry caution** (S2): do not blindly retry writes; "bookings, cancellations, and checkouts are not deduplicated." Some endpoints are explicitly documented idempotent in S3 (friend/invite removals return `204` regardless; user creation; gym check-in repeat within a 2h window returns the existing record). 

**All error codes appearing in S3, by status:**

- 400: class_events_range_exceeds_max_days, class_events_range_outside_allowed_window, invalid_date_range_order, invalid_path_param, invalid_query_params, late_cancel_consent_not_allowed
- 401: unauthorized
- 403: api_key_not_supported, not_authorized, oauth_token_not_supported, permission_denied
- 404: bundle_not_found, class_credits_not_found, class_event_booking_not_found, class_event_not_found, class_event_wait_list_not_found, class_not_found, company_account_not_found, course_not_found, door_not_found, friend_request_not_found, gym_check_in_not_found, instructor_not_found, integration_not_found, membership_not_found, payment_method_not_found, policy_not_found, qr_code_not_found, room_not_found, specialist_service_booking_not_found, specialist_service_not_found, studio_not_found, transaction_not_found, user_membership_not_found, user_not_found, venue_not_found, voucher_pool_not_found
- 409: already_booked, already_cancelled, booking_max_limit_reached, booking_window_closed, cannot_remove_preferred_method, event_full, feature_disabled, friend_request_reverse_pending, has_active_membership, has_company_account_responsibilities, has_pending_payments, has_studio_responsibilities, has_upcoming_bookings, history_locked, instructor_not_assigned, instructor_unavailable, insufficient_credits, insufficient_funds, is_frozen, late_cancel_consent_required, not_cancelable, not_cancelled, not_checkinable, not_eligible, option_no_longer_available, outside_check_in_window, outside_unlock_hours, qr_code_deleted, receipt_not_available, studio_payment_not_configured, trial_offer_not_available, venue_mismatch, voucher_pool_expired
- 413: file_too_large, response_too_large
- 422: missing_file_part, service_duration_missing, unsupported_media_type, validation_error
- 429: rate_limited
- 500: internal
- 502: vendor_error

## 7. Endpoints (from S3, 77 operations)

Unless an operation says "bearer required", S3 declares no `security`, which the info text defines as public (no Authorization header). Note this is the literal spec reading; for example `POST /studios/{studioId}/users` (create user) is listed as public. Operations marked bearer required accept either credential unless the text says a key is refused. There are no JSON request/response examples in S3 (only one `example` key in the whole file); shapes below are the schemas. Usage example from S2:

```bash
curl -H "Authorization: Bearer $MANA_API_KEY" \
  "https://www.getmana.app/api/v1/studios/<studio id>"
```

#### `GET /api/v1/friends`

- Summary: Get friends  (operationId `getFriends`, tag ['Friends']); auth: bearer required
- Description: Returns the caller’s own friend roster, filtered to the membership of the studio named in `studioId`  -  friendships are Mana-owned and carry no studio, so this resource sits at the v1 root and takes its studio as a required query filter. Bearer + self-only (`userId` = `me` or the caller’s own id); an API key is refused. A friend who hid their activity is still listed, with `befriendedAt` intact and `classesAttendedTogether` `null`. Uncached (`private, no-store`).
- Param `userId` (query, required): string. Required. The literal `me` or the caller’s own user id (uuid). The roster is the caller’s own, so any other value is rejected `403 not_authorized`  -  including for a studio `owner`/`admin`/`staff`. Missing or malformed 
- Param `studioId` (query, required): string. Required. The studio (uuid) whose membership the roster is filtered to  -  only friends who are also its members are returned. Missing or malformed → `400 invalid_query_params`; a studio that does not exist → `404 studio
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string|null, avatarUrl: string:uri|null, activityHidden: boolean, befriendedAt: string:date-time, classesAttendedTogether: integer|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found; 413: response_too_large; 500: internal

#### `POST /api/v1/friends`

- Summary: Accept a friend request  (operationId `acceptFriendRequest`, tag ['Friends']); auth: bearer required
- Description: Accepts the pending request `friendUserId` sent the caller. Accepting **is** creating the friendship  -  the request row is consumed and the friendship created in one transaction, and `DELETE /api/v1/friends/{friendUserId}` is the exact inverse. Takes no studio: the friendship is Mana-owned, and no membership is checked, so a request stays acceptable after its sender has left the studio it was sent in. Only the recipient may accept: a request the caller sent themselves is refused `404`, never accepted. Not idempotent  -  it succeeds only if a pending incoming request was consumed, so a replay after a success, and a pair who are already friends, both answer `404 friend_request_not_found`. A c...
- Request body `application/json` (required): `{friendUserId: string:uuid}`
- Response 204: The request was consumed and the friendship exists. No body  -  read `GET /api/v1/friends` for the r
- Error codes: 401: unauthorized; 403: api_key_not_supported; 404: friend_request_not_found; 422: validation_error; 500: internal

#### `DELETE /api/v1/friends/{friendUserId}`

- Summary: Remove friend  (operationId `deleteFriend`, tag ['Friends']); auth: bearer required
- Description: Removes the friendship between the caller and `friendUserId`. There is one row per pair, so the friendship leaves both members’ rosters at once, in every studio they share  -  friendships are Mana-owned and carry no studio, so this endpoint takes none. Bearer, human only; an API key is refused. Idempotent: a member the caller is not friends with, or a uuid that names nobody, answers the same `204` as a removal that deleted a row, so there is no way to tell the two apart. A client that needs the resulting state re-reads `GET /friends`.
- Param `friendUserId` (path, required): string. Required. The friend to remove (uuid). Not a uuid, the literal `me`, or the caller’s own id → `400 invalid_path_param`.
- Response 204: The friendship is gone. No body, whether or not a row existed.
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported; 500: internal

#### `GET /api/v1/friend-requests`

- Summary: Get friend requests  (operationId `getFriendRequests`, tag ['Friends']); auth: bearer required
- Description: Returns every pending friend request the caller is a party to at the studio named in `studioId`  -  both directions in one list, each row stating its own `direction` (`incoming` means they asked you, `outgoing` means you asked them). Ordered newest request first across the merged set, not grouped by direction. `friend_requests` carries no studio, so this resource sits at the v1 root and the studio filters the caller’s own membership only: a request whose counterparty has since left is still listed and still acceptable, and a caller who is not a member reads an empty list. Rows carry identity alone  -  no timestamp, no studio echo, no counts  -  and a counterparty who hid their activity is st...
- Param `userId` (query, required): string. Required. The literal `me` or the caller’s own user id (uuid). The list is the caller’s own, so any other value is rejected `403 not_authorized`  -  including for a studio `owner`/`admin`/`staff`. Missing or malformed → 
- Param `studioId` (query, required): string. Required. The studio (uuid) whose membership the caller is read under. Only the caller’s membership is checked  -  a request whose counterparty has since left the studio is still listed, and a caller who is not a member 
- Response 200 (`application/json`): `{data: {items: {direction: enum(incoming/outgoing), friendUserId: string:uuid, name: string|null, avatarUrl: string:uri|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found; 413: response_too_large; 500: internal

#### `POST /api/v1/friend-requests`

- Summary: Send a friend request  (operationId `sendFriendRequest`, tag ['Friends']); auth: bearer required
- Description: Asks `friendUserId` to be friends. Both parties must be members of the studio named in `studioId`, and the recipient is sent a studio-branded notification email  -  calling this endpoint causes Mana mail to a member, best-effort, and the response is the same whether or not delivery succeeded. Answers `204`, never `201`: sending is idempotent, so a repeat of the same request, and a pair who are already friends, both succeed without writing a row or sending a second mail. At most one request can exist between two people in either direction; if the counterparty already asked first, the answer is `409` and the action is to accept theirs rather than retry. Bearer, human only; an API key is refuse...
- Param `studioId` (query, required): string. Required today, and transitional. A friend request belongs to no studio, but the send is gated on both parties being members of this one and its notification email is branded from it  -  name, locale, timezone, reply-to,
- Request body `application/json` (required): `{friendUserId: string:uuid}`
- Response 204: The request stands. No body  -  identical whether a row was written, an identical request was alread
- Error codes: 400: invalid_query_params; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: user_not_found, studio_not_found; 409: friend_request_reverse_pending; 422: validation_error; 500: internal

#### `DELETE /api/v1/friend-requests/{friendUserId}`

- Summary: Refuse or withdraw a friend request  (operationId `deleteFriendRequest`, tag ['Friends']); auth: bearer required
- Description: Removes the pending request between the caller and `friendUserId`, whichever way it points  -  refusing one they sent and withdrawing one the caller sent are the same call, so a client needs no direction lookup. Takes no studio: a request carries none, and it stays answerable after either party has left the studio it was sent in. Refusing an **incoming** request also stops the pair being suggested to either side; withdrawing an **outgoing** one records nothing, since changing your mind says nothing about them. Idempotent: a pair with no pending request, and a uuid naming nobody, answer the same `204` as a removal that deleted a row, so there is no way to probe whether a request exists. Beare...
- Param `friendUserId` (path, required): string. Required. The other party to the request (uuid). Case-insensitive. Not a uuid, the literal `me`, or the caller’s own id → `400 invalid_path_param`.
- Response 204: No request stands between the pair. No body, whether or not a row existed.
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported; 500: internal

#### `GET /api/v1/friend-suggestions`

- Summary: Get friend suggestions  (operationId `getFriendSuggestions`, tag ['Friend suggestions']); auth: bearer required
- Description: Returns the caller’s own friend suggestions at the studio named in `studioId`  -  members of it the caller shares at least one mutual friend with, is not already connected to, and has not dismissed. Derived per request, ranked most-connections-first, and capped by the product; there is no pagination. Bearer + self-only (`userId` = `me` or the caller’s own id); an API key is refused. A caller who hid their own activity, or who is not a member of the studio, receives an empty list rather than an error. Uncached (`private, no-store`).
- Param `userId` (query, required): string. Required. The literal `me` or the caller’s own user id (uuid). The feed is the caller’s own, so any other value is rejected `403 not_authorized`  -  including for a studio `owner`/`admin`/`staff`. Missing or malformed → 
- Param `studioId` (query, required): string. Required. The studio (uuid) whose membership the feed is drawn from  -  only its members are suggested. Missing or malformed → `400 invalid_query_params`; a studio that does not exist → `404 studio_not_found`.
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string|null, avatarUrl: string:uri|null, disclosedMutualFriends: object[], mutualFriendCount: integer}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found; 500: internal

#### `DELETE /api/v1/friend-suggestions/{dismissedUserId}`

- Summary: Dismiss a friend suggestion  (operationId `dismissFriendSuggestion`, tag ['Friend suggestions']); auth: bearer required
- Description: Drops one candidate from the caller’s suggestion feed, permanently and in every studio  -  a dismissal carries no studio, and there is no un-dismiss. Idempotent: a replay, a member who is not currently suggested, and a uuid naming nobody all answer `204`. The dismissed member is never told and is not removed from their own feed. Bearer only; an API key is refused.
- Param `dismissedUserId` (path, required): string. The suggested member (uuid) to drop from the caller’s feed. Case-insensitive. The literal `me` and the caller’s own id are rejected `400 invalid_path_param`.
- Response 204: Dismissed. No body.
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported; 500: internal

#### `GET /api/v1/studios`

- Summary: Get studios  (operationId `getStudios`, tag ['Studios']); auth: bearer required
- Param `userId` (query, required): (string:uuid | enum(me)). 
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, slug: string, name: string, maxBookingDaysInAdvance: integer, timezone: string, currency: string, locale: string, features: object, isLive: enum(True)}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params; 401: unauthorized; 403: permission_denied, api_key_not_supported; 429: rate_limited; 500: internal

#### `GET /api/v1/studios/{studioId}`

- Summary: Get studio  (operationId `getStudio`, tag ['Studios']); auth: public (no `security` declared)
- Response 200 (`application/json`): `{data: {id: string:uuid, slug: string, name: string, maxBookingDaysInAdvance: integer, timezone: string, currency: string, locale: string, features: {specialistServicesEnabled: boolean, companyAccountsEnabled: boolean, gymAccessEnabled: boolean, coursesEnabled: boolean, productsEnabled: boolean, socialEnabled: boolean, qrCheckInAvailable: boolean}, isLive: enum(True)}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/faq`

- Summary: Get studio FAQ  (operationId `getStudioFaq`, tag ['Studios']); auth: public (no `security` declared)
- Description: Returns the studio’s FAQ  -  question/answer entries assembled from the studio’s configuration, mirroring the public storefront. Public endpoint  -  no bearer token required. Localized (`Vary: Accept-Language`, falling back to the studio’s own locale); responses may be cached (see `Cache-Control`). Optionally filtered by `category`.
- Param `category` (query, optional): string. Optional comma-separated list of categories to filter by (`memberships`, `credits`, `bookings`, `services`); an item is returned if it matches any of them. Omit for all items. Tokens are exact and case-sensitive; a malfo
- Response 200 (`application/json`): `{data: {items: {id: string, question: string, answer: string, categories: enum(memberships/credits/bookings/services)[]}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/promotion-slides`

- Summary: List promotion slides for a studio  (operationId `getStudioPromotionSlides`, tag ['Studios']); auth: public (no `security` declared)
- Description: Returns the slides of the studio’s start-page promotion carousel, in display order. Empty when the studio has the carousel switched off. Each slide is one image with one link. Public endpoint  -  no bearer token required. Responses may be cached (see `Cache-Control`).
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, imageUrl: string:uri, altText: string, linkUrl: string:uri}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/classes`

- Summary: Get classes  (operationId `getClasses`, tag ['Classes']); auth: bearer required
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, venueId: string:uuid, name: string, description: string|null, creditCost: number|null, scheduleCategoryIds: string:uuid[], singlePurchasePrice: object|null, participantNote: string|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params, invalid_path_param; 401: unauthorized; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/classes/{classId}`

- Summary: Get class  (operationId `getClass`, tag ['Classes']); auth: bearer required
- Response 200 (`application/json`): `{data: {id: string:uuid, venueId: string:uuid, name: string, description: string|null, creditCost: number|null, scheduleCategoryIds: string:uuid[], singlePurchasePrice: {amount: integer, currency: string}|null, participantNote: string|null}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 404: studio_not_found, class_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/class-events`

- Summary: Get class events  (operationId `getClassEvents`, tag ['Classes']); auth: public (no `security` declared)
- Param `fromAt` (query, required): string:date-time. Range start of `startsAt`
- Param `toAt` (query, required): string:date-time. Range end of `startsAt`
- Param `venueId` (query, optional): string:uuid. 
- Param `categoryId` (query, optional): string. Filter by schedule category: one uuid, or a comma-separated list of up to 50 (OR-combined). The param name stays singular  -  there is no `scheduleCategoryIds` param.
- Param `from` (query, optional, deprecated): string:date-time. Deprecated alias of `fromAt`, read only when `fromAt` is absent.
- Param `to` (query, optional, deprecated): string:date-time. Deprecated alias of `toAt`, read only when `toAt` is absent.
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, class: object, startsAt: string:date-time, endsAt: string:date-time, roomId: string:uuid|null, instructorId: string:uuid|null, maxSlots: integer|null, bookedSlots: integer, creditCost: number|null, singlePurchasePrice: object|null, cancellationCutoffAt: string:date-time|null, waitListAutoAssignCutoffSeconds: integer|null, waitListCount: integer}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params, invalid_date_range_order, class_events_range_exceeds_max_days, class_events_range_outside_allowed_window; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/class-events/{classEventId}`

- Summary: Get class event  (operationId `getClassEvent`, tag ['Classes']); auth: public (no `security` declared)
- Response 200 (`application/json`): `{data: {id: string:uuid, class: {id: string:uuid, title: string, description: string|null, venueId: string:uuid, scheduleCategoryIds: string:uuid[]}, startsAt: string:date-time, endsAt: string:date-time, roomId: string:uuid|null, instructorId: string:uuid|null, maxSlots: integer|null, bookedSlots: integer, creditCost: number|null, singlePurchasePrice: {amount: integer, currency: string}|null, cancellationCutoffAt: string:date-time|null, waitListAutoAssignCutoffSeconds: integer|null, waitListCount: integer}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 404: studio_not_found, class_event_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/class-events/{classEventId}/attendees`

- Summary: Get class event attendees  (operationId `getClassEventAttendees`, tag ['Classes']); auth: bearer required
- Description: Attendees of one class event, filtered to what the caller may see. In clear: the caller’s mutual friends and the caller themself, plus every `public` attendee when the caller’s own visibility is `public`. As blur bytes with no identity: other `public` attendees, capped and re-sampled per request. Everyone else is absent. `clearAttendees` always contains the caller when they hold a booking, so a non-empty array does not mean anyone else is present. Empty buckets are an answer  -  for a caller who is not a member of the studio, a studio with social disabled, or an occurrence id that names nothing here.
- Param `userId` (query, required): (string:uuid | enum(me)). `me`, or the caller’s own user id. Required, and self-only.
- Response 200 (`application/json`): `{data: {clearAttendees: {id: string:uuid, name: string|null, avatarUrl: string:uri|null, isFriend: boolean, requestPending: boolean, requestReceived: boolean}[], blurredAttendees: {blurDataUrl: string|null}[], viewerVisibility: enum(public/friends/hidden/unknown), viewerHasAvatar: boolean}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found; 500: internal

#### `POST /api/v1/studios/{studioId}/class-events/{classEventId}/invites`

- Summary: Invite members to a class event  (operationId `createClassEventInvites`, tag ['Classes']); auth: bearer required
- Description: Invites the named members to one occurrence. The caller must hold a live booking on it, and each recipient must be a mutual friend, a member of the studio, not already booked and not hidden  -  an invitation is a nudge to book, and moves no slot. Answers `200` with one entry per requested id, in request order and duplicates included, because each recipient can fail independently: `outcome` is `invited` when that member was eligible and now holds an invitation, and `rejected` when they were not eligible and this call issued them nothing  -  which does not assert they hold no earlier invitation  -  with no reason attached. Inviting somebody another member has already invited is `invited` too. ...
- Request body `application/json` (required): `{invitedUserIds: string:uuid[]}`
- Response 200 (`application/json`): `{data: {results: {invitedUserId: string:uuid, outcome: enum(invited/rejected)}[]}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found, class_event_not_found; 422: validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/class-events/{classEventId}/invites`

- Summary: Get who has been invited to a class event  (operationId `listClassEventInvites`, tag ['Classes']); auth: bearer required
- Description: The members holding an invitation to one occurrence, from any inviter  -  ids only, to drive an invite picker’s already-invited state. Readable only by a member of the studio who holds a live booking on the occurrence; every other caller, and an occurrence that does not exist or belongs to another studio, reads an empty list under a `200`. A recipient who has since booked stays listed. Bearer, human only; an API key is refused. Uncached (`private, no-store`).
- Response 200 (`application/json`): `{data: {items: {invitedUserId: string:uuid}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported; 404: studio_not_found; 413: response_too_large; 500: internal

#### `DELETE /api/v1/studios/{studioId}/class-events/{classEventId}/invites/{invitedUserId}`

- Summary: Dismiss an invitation to a class event  (operationId `deleteClassEventInvite`, tag ['Classes']); auth: bearer required
- Description: Destroys the caller’s own invitation to one occurrence. `invitedUserId` is `me` or the caller’s own id  -  naming anybody else is `403`, with no escape for a studio owner or admin, and an inviter cannot withdraw what they issued. Idempotent: `204` whether or not an invitation existed, and `204` again on a repeat, so it never reports whether an invitation or an occurrence exists. Bearer, human only; an API key is refused.
- Param `invitedUserId` (path, required): string. The invited member: `me`, or the caller’s own user id.
- Response 204: The invitation is gone, or never existed.
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/class-event-bookings`

- Summary: Get class event bookings  (operationId `getClassEventBookings`, tag ['Classes']); auth: bearer required
- Param `userId` (query, optional): (string:uuid | enum(me)). Filter by `userId`, required for studio members but optional for admins
- Param `fromAt` (query, optional): string:date-time. Inclusive lower bound on the booking’s `startsAt`
- Param `toAt` (query, optional): string:date-time. Inclusive upper bound on the booking’s `startsAt`
- Param `status` (query, optional): enum(booked/canceled/canceled_late/checked_in/no_show/wait_list)[]. Filter by `status`, serialized as a comma-separated string (e.g. `booked,canceled,checked_in`)
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Param `from` (query, optional, deprecated): string:date-time. Deprecated alias of `fromAt`, read only when `fromAt` is absent.
- Param `to` (query, optional, deprecated): string:date-time. Deprecated alias of `toAt`, read only when `toAt` is absent.
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, userId: string:uuid, classEventId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, venueId: string:uuid, method: object, status: enum(booked/canceled/canceled_late/checked_in/no_show/wait_list), bookedAt: string:date-time|null, canceledAt: string:date-time|null, checkedInAt: string:date-time|null, noShowAt: string:date-time|null, waitListAt: string:date-time|null, waitListNotificationSentAt: string:date-time|null, waitListPosition: integer|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params, invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, user_not_found; 500: internal

#### `POST /api/v1/studios/{studioId}/class-event-bookings`

- Summary: Create class event booking  (operationId `createClassEventBooking`, tag ['Classes']); auth: bearer required
- Request body `application/json` (required): `{classEventId: string:uuid, userId: (string:uuid | enum(me)), method: ({type: enum(credits), classCreditsId: string:uuid} | {type: enum(membership_credits), classCreditsId: string:uuid} | {type: enum(membership), userMembershipId: string:uuid} | {type: enum(free)} | {type: enum(voucher), voucherPoolId: string:uuid} | {type: enum(company_account_credits), companyAccountId: string:uuid} | {type: enum(membership_credits_pay_as_you_go), classCreditsId: string:uuid, maxShortfallCredits: number})}`
- Response 201 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, classEventId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, venueId: string:uuid, method: {type: enum(admin/bruce/classpass/company_account_credits/credits/free/legacy/membership/membership_credits/membership_credits_pay_as_you_go/payment/voucher/wait_list)}, status: enum(booked/canceled/canceled_late/checked_in/no_show/wait_list), bookedAt: string:date-time|null, canceledAt: string:date-time|null, checkedInAt: string:date-time|null, noShowAt: string:date-time|null, waitListAt: string:date-time|null, waitListNotificationSentAt: string:date-time|null, waitListPosition: integer|null}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied, oauth_token_not_supported; 404: studio_not_found, class_event_not_found, class_credits_not_found, voucher_pool_not_found, company_account_not_found, user_not_found; 409: already_booked, booking_window_closed, event_full, insufficient_funds, booking_max_limit_reached, not_eligible, voucher_pool_expired, option_no_longer_available; 422: validation_error; 500: internal

#### `POST /api/v1/studios/{studioId}/class-event-check-ins`

- Summary: Create a class event check-in  (operationId `createStudioClassEventCheckIn`, tag ['Classes']); auth: bearer required
- Description: Checks the caller in to their own class event booking, using the token of a scanned venue check-in QR code as proof of presence (spec-class-event-check-ins). Bearer + user-scoped (`?userId=me`).  **Admission.** The code must be live and belong to this studio, the booking must be the caller’s own and at the code’s venue, its class must be inside the check-in window (2 hours before start to 2 hours after end), and its status `booked` or `no-show`. A pending no-show fee on the booking is waived.  **Retry-safe.** Answers `200` every time: a repeat for a booking already checked in returns the original `checkedInAt` and writes nothing. Opens no door  -  call `POST …/door-access` for that. Uncached...
- Param `userId` (query, required): string. Required. The literal `me` or the caller’s own user id (uuid). The check-in acts on the authenticated caller and cannot be recorded for anyone else, so any other value is rejected (`403 not_authorized`)  -  including for
- Request body `application/json` (required): `{classEventBookingId: string:uuid, token: string}`
- Response 200 (`application/json`): `{data: {classEventBookingId: string:uuid, checkedInAt: string:date-time}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, qr_code_not_found, class_event_booking_not_found; 409: qr_code_deleted, venue_mismatch, outside_check_in_window, not_checkinable; 422: validation_error; 429: rate_limited; 500: internal

#### `POST /api/v1/studios/{studioId}/checkout`

- Summary: Create checkout  (operationId `createCheckout`, tag ['Checkout']); auth: bearer required
- Description: Mints a payment stub (draft transaction + items  -  no money moved, nothing booked or fulfilled) for a discriminated `kind` and returns a `checkoutUrl` carrying a signed checkout-claim the caller opens in a webview (CHKT §16.1). Bearer + user-scoped body (`userId` = `me` or the caller’s own id). The eight purchase `kind` variants are `single_class`, `class_credits_bundle`, `membership`, `course`, `specialist_credits_bundle`, `trial_offer_single_class`, `trial_offer_1_credit`, `trial_offer_3_credits`; each carries a `returnUrl` (validated against the deploy-time allowlist) plus its per-kind target id. On completion the webview returns to `returnUrl` with `transactionId` appended: no `status` ...
- Request body `application/json` (required): `({kind: enum(single_class), userId: (string:uuid | enum(me)), returnUrl: string, classEventId: string:uuid} | {kind: enum(class_credits_bundle), userId: (string:uuid | enum(me)), returnUrl: string, bundleId: string:uuid} | {kind: enum(membership), userId: (string:uuid | enum(me)), returnUrl: string, membershipId: string:uuid} | {kind: enum(course), userId: (string:uuid | enum(me)), returnUrl: string, courseId: string:uuid} | {kind: enum(specialist_credits_bundle), userId: (string:uuid | enum(me)), returnUrl: string, bundleId: string:uuid} | {kind: enum(trial_offer_single_class), userId: (string:uuid | enum(me)), returnUrl: string, classEventId: string:uuid} | {kind: enum(trial_offer_1_credit), userId: (string:uuid | enum(me)), returnUrl: string} | {kind: enum(trial_offer_3_credits), userId: (string:uuid | enum(me)), returnUrl: string} | {kind: enum(add_card), userId: (string:uuid | enum(`
- Response 200 (`application/json`): `{data: {transactionId: string:uuid|null, price: {amount: integer, currency: string}, checkoutUrl: string:uri, expiresAt: string:date-time}}`
- Response 201 (`application/json`): `{data: {transactionId: string:uuid|null, price: {amount: integer, currency: string}, checkoutUrl: string:uri, expiresAt: string:date-time}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found, class_event_not_found, bundle_not_found, membership_not_found, course_not_found; 409: studio_payment_not_configured, trial_offer_not_available, not_eligible, feature_disabled; 422: validation_error; 500: internal

#### `POST /api/v1/studios/{studioId}/class-event-wait-list`

- Summary: Join class event waitlist  (operationId `joinClassEventWaitList`, tag ['Classes']); auth: bearer required
- Request body `application/json` (required): `{classEventId: string:uuid, userId: (string:uuid | enum(me))}`
- Response 201 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, classEventId: string:uuid, waitListAt: string:date-time|null, waitListNotificationSentAt: string:date-time|null, waitListPosition: integer|null}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, class_event_not_found, user_not_found; 409: already_booked, booking_window_closed, not_eligible; 422: validation_error; 500: internal

#### `DELETE /api/v1/studios/{studioId}/class-event-wait-list/{classEventWaitListId}`

- Summary: Leave class event waitlist  (operationId `leaveClassEventWaitList`, tag ['Classes']); auth: bearer required
- Response 200 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, classEventId: string:uuid, waitListAt: string:date-time|null, waitListNotificationSentAt: string:date-time|null, waitListPosition: integer|null}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, class_event_wait_list_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/class-event-bookings/{classEventBookingId}`

- Summary: Get class event booking  (operationId `getClassEventBooking`, tag ['Classes']); auth: bearer required
- Description: One booking by id, in the same shape as a list item. A member reads only their own bookings  -  another member’s is `404 class_event_booking_not_found`; `owner`/`admin`/`staff` and API keys read any booking in the studio. Per-user state, never cached (`Cache-Control: private, no-store`).
- Response 200 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, classEventId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, venueId: string:uuid, method: {type: enum(admin/bruce/classpass/company_account_credits/credits/free/legacy/membership/membership_credits/membership_credits_pay_as_you_go/payment/voucher/wait_list)}, status: enum(booked/canceled/canceled_late/checked_in/no_show/wait_list), bookedAt: string:date-time|null, canceledAt: string:date-time|null, checkedInAt: string:date-time|null, noShowAt: string:date-time|null, waitListAt: string:date-time|null, waitListNotificationSentAt: string:date-time|null, waitListPosition: integer|null}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, class_event_booking_not_found; 500: internal

#### `DELETE /api/v1/studios/{studioId}/class-event-bookings/{classEventBookingId}`

- Summary: Cancel class event booking  (operationId `cancelClassEventBooking`, tag ['Classes']); auth: bearer required
- Param `lateCancelConsent` (query, optional): enum(true/false). Only required when `late_cancel_consent_required` error code is returned and the booking user is making the request. This is to to ensure consent is given by the when past the regular cancellation window and a late cance
- Response 200 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, classEventId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, venueId: string:uuid, method: {type: enum(admin/bruce/classpass/company_account_credits/credits/free/legacy/membership/membership_credits/membership_credits_pay_as_you_go/payment/voucher/wait_list)}, status: enum(booked/canceled/canceled_late/checked_in/no_show/wait_list), bookedAt: string:date-time|null, canceledAt: string:date-time|null, checkedInAt: string:date-time|null, noShowAt: string:date-time|null, waitListAt: string:date-time|null, waitListNotificationSentAt: string:date-time|null, waitListPosition: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params, late_cancel_consent_not_allowed; 401: unauthorized; 403: permission_denied; 404: studio_not_found, class_event_booking_not_found; 409: already_cancelled, not_cancelable, booking_window_closed, late_cancel_consent_required; 500: internal

#### `GET /api/v1/studios/{studioId}/class-events/{classEventId}/booking-options`

- Summary: Get class event booking options  (operationId `getStudioClassEventBookingOptions`, tag ['Classes']); auth: bearer required
- Description: Returns the ways the caller could book this occurrence (SCH §4.3). Bearer + `userId` returns the user’s eligible options (`mode: initial / additional`); anonymous (no token, no `userId`) returns `mode: unauthenticated` with empty `options`. Uncached (`private, no-store`).
- Param `userId` (query, optional): string. Required when a bearer token is present  -  the literal `me` or the caller’s own id. Booking options are computed for the authenticated caller and cannot be computed for anyone else, so any other value is rejected (`403 
- Response 200 (`application/json`): `{data: {mode: enum(initial/additional/unauthenticated), options: (object | object | object | object | object | object | object | object | object)[]}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: not_authorized; 404: studio_not_found, class_event_not_found; 422: validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/trial-offers`

- Summary: Get studio trial offers  (operationId `getStudioTrialOffers`, tag ['Classes']); auth: bearer required
- Description: Returns the studio’s trial-offer catalog plus the caller’s eligibility. Bearer-optional: anonymous (no token, no `userId`) returns the catalog with `eligible: true`; supplying `userId` (+ bearer) returns per-user eligibility. Uncached (`private, no-store`).
- Param `userId` (query, optional): string. Optional. Omit it for the anonymous catalog (`eligible` defaults to `true`). Supply it  -  with a bearer token  -  as the literal `me`, the caller’s own id, or  -  for a studio `owner`/`admin`/`staff`  -  another member’
- Response 200 (`application/json`): `{data: {eligible: boolean, offers: (object | object | object)[]}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: not_authorized; 404: studio_not_found; 422: validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/user-company-accounts`

- Summary: Get user company accounts  (operationId `listUserCompanyAccounts`, tag ['Company accounts']); auth: bearer required
- Description: Returns the company accounts the target user is a member of in this studio, each with the user’s role (`company_admin / company_member`). Display-only (UCA §12.1): the projection is `{ id, name, role }`  -  never credits, invoicing, or other account details. Bearer + user-scoped (`?userId=me` or the caller’s own id). Ungated: a studio with no accounts returns `items: []`. Uncached (`private, no-store`).
- Param `userId` (query, required): string. Target user. The literal `me`, the caller’s own user id, or  -  for a studio `owner`/`admin`/`staff`  -  another member’s id. Any other caller naming a foreign id → `403 not_authorized`; missing or malformed → `400 inval
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string, role: enum(company_admin/company_member)}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/payment-methods`

- Summary: List stored payment methods  (operationId `listPaymentMethods`, tag ['Payment methods']); auth: bearer required
- Description: Returns the caller’s stored payment methods at this studio (PMT §14.1), each `{ id, lastFour, name, preferred }`. `id` is an opaque vendor token; `name` is a vendor display string (not an enum); `preferred` marks the one method matching the user’s preferred pointer. Bearer + user-scoped (`?userId=me` or the caller’s own id). A studio with no payment store returns `items: []`. Uncached (`private, no-store`).
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Response 200 (`application/json`): `{data: {items: {id: string, lastFour: string, name: string, preferred: boolean}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/payment-methods/{paymentMethodId}`

- Summary: Get payment method  (operationId `getPaymentMethod`, tag ['Payment methods']); auth: bearer required
- Description: One stored payment method (PMT §14.6), in the same shape as a §14.1 list item. `paymentMethodId` is an opaque vendor token  -  an unknown value is `404 payment_method_not_found`, never a `400`. Bearer + user-scoped, self only: name yourself in `userId`; a different `userId` is `403 not_authorized` for every caller, staff included. Per-user state, never cached (`Cache-Control: private, no-store`).
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Response 200 (`application/json`): `{data: {id: string, lastFour: string, name: string, preferred: boolean}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, payment_method_not_found; 500: internal

#### `DELETE /api/v1/studios/{studioId}/payment-methods/{paymentMethodId}`

- Summary: Remove payment method  (operationId `deletePaymentMethod`, tag ['Payment methods']); auth: bearer required
- Description: Removes a stored payment method (PMT §14.3). `paymentMethodId` is an opaque vendor token  -  an unknown value is `404 payment_method_not_found`, never a `400`. The preferred method cannot be removed (`409 cannot_remove_preferred_method`  -  clear or re-point first). Bearer + user-scoped. Success `204`.
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Response 204: The payment method was removed.
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, payment_method_not_found; 409: cannot_remove_preferred_method; 500: internal

#### `PUT /api/v1/studios/{studioId}/payment-methods/preferred`

- Summary: Set preferred payment method  (operationId `setPreferredPaymentMethod`, tag ['Payment methods']); auth: bearer required
- Description: Sets the caller’s preferred payment method (PMT §14.4) to the given `paymentMethodId`. The preferred pointer is a single global per-user value; `PUT` replaces it (re-sending the current value is a `204` no-op). Bearer + user-scoped. Success `204`, no body.
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Request body `application/json` (required): `{paymentMethodId: string}`
- Response 204: The preferred payment method was set.
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found; 422: validation_error; 500: internal

#### `DELETE /api/v1/studios/{studioId}/payment-methods/preferred`

- Summary: Clear preferred payment method  (operationId `clearPreferredPaymentMethod`, tag ['Payment methods']); auth: bearer required
- Description: Clears the caller’s preferred payment method (PMT §14.5). The pointer is a single global per-user value; clearing it applies regardless of which studio’s method it named. Idempotent: clearing an already-null pointer is a `204` no-op. Bearer + user-scoped. Success `204`, no body.
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Response 204: The preferred payment method was cleared (or already absent).
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/class-credit-bundles`

- Summary: Get class credit bundles  (operationId `getClassCreditBundles`, tag ['Classes']); auth: public (no `security` declared)
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string, description: string|null, credits: number, price: object, userPurchaseLimit: integer|null, publicListingPriority: integer|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params, invalid_path_param; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/app/config`

- Summary: Get app config / kill-switch  (operationId `getAppConfig`, tag ['App']); auth: public (no `security` declared)
- Description: First-party `mana-mobile` deployment-lifecycle probe (force-upgrade + maintenance banner). Compares the caller’s `appVersion` against the studio app’s minimum-supported version under SemVer precedence; an unparseable version fails open (`outOfDate: false`). Public endpoint  -  no bearer token required. **Response is per-studio**  -  `studioId` selects the config row (spec-app-config:DEC-per-studio-response); a studio with no config row returns `200 { data: null }` (spec-app-config:DEC-absent-returns-null), never a 404. Uncached (`private, no-store`): a kill-switch must reflect live ops state without CDN delay (spec-app-config:DEC-cache-control).
- Param `platform` (query, required): enum(ios/android). App store target: `ios` or `android`.
- Param `appVersion` (query, required): string. The version the app reports (e.g. `1.2.3`). Compared with SemVer precedence; an unparseable value fails open (`outOfDate: false`).
- Response 200 (`application/json`): `{data: {minSupportedVersion: string, outOfDate: boolean, outOfDateMessage: string|null, maintenanceEnabled: boolean, maintenanceMessage: string|null}|null}`
- Error codes: 400: invalid_path_param, invalid_query_params; 500: internal

#### `GET /api/v1/studios/{studioId}/specialist-services`

- Summary: List specialist services for a studio  (operationId `getStudioSpecialistServices`, tag ['Specialist services']); auth: public (no `security` declared)
- Description: Returns the studio’s public specialist-services catalog (spec-specialist-services §11.1), sorted `name ASC, id ASC`. Archived services are excluded. Instructors are referenced by id (`instructorIds`), not expanded. Public endpoint  -  no bearer token required. Not localized (no `Vary: Accept-Language`); responses may be cached (see `Cache-Control`).
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string, description: string|null, instructorIds: string:uuid[], pricePerCredit: object, vatRate: integer, validityDuration: string, durationMinutes: integer|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/specialist-credit-bundles`

- Summary: List specialist credit bundles for a studio  (operationId `getStudioSpecialistCreditBundles`, tag ['Specialist services']); auth: public (no `security` declared)
- Description: Returns the studio’s public specialist credit-bundle catalog (spec-specialist-services §11.2), sorted `publicListingPriority DESC NULLS LAST, credits DESC, name ASC, id ASC`. Hidden bundles, archived bundles, and bundles whose parent service is archived are excluded. Optionally filter to one service with `?specialistServiceId=`. Public endpoint  -  no bearer token required. Not localized (no `Vary: Accept-Language`); responses may be cached (see `Cache-Control`).
- Param `specialistServiceId` (query, optional): string:uuid. Filter to bundles of a single specialist service.
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, specialistServiceId: string:uuid, name: string, description: string|null, credits: integer, price: object, userPurchaseLimit: integer|null, publicListingPriority: integer|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/specialist-credits`

- Summary: List the caller’s specialist credit balances  (operationId `getStudioSpecialistCredits`, tag ['Specialist services']); auth: bearer required
- Description: Returns the caller’s per-service specialist-credit balances for a studio (spec-specialist-services §11.3)  -  one item per specialist service the user has credit history for, including zero balances, sorted `specialistServiceId ASC`. Two-key items `{ specialistServiceId, balance }`  -  clients resolve service names via §11.1 (`spec-specialist-services:DEC-balances-item-shape`; no `name`/`earliestExpireAt` in v1.0  -  `spec-specialist-services:TODO-2`). Bearer + user-scoped (`userId` = `me` or the caller’s own id). Uncached (`private, no-store`).
- Param `userId` (query, required): string. Required. The literal `me`, the caller’s own user id (uuid), or  -  for a studio `owner`/`admin`/`staff`  -  another member’s id. Any other caller naming a foreign id → `403 not_authorized`; missing or malformed → `400 i
- Response 200 (`application/json`): `{data: {items: {specialistServiceId: string:uuid, balance: number}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/courses`

- Summary: List courses  (operationId `getCourses`, tag ['Courses']); auth: public (no `security` declared)
- Description: Returns the studio’s published course catalog (derived `startsAt`/`endsAt` + `eventCount` per course; per-session listing deferred to a separate `/course-events` endpoint), filtered to courses overlapping the `[fromAt, toAt]` window (`fromAt` defaults to the request time). Public endpoint  -  no bearer token required. Uncached (`private, no-store`): the body carries live enrollment capacity (`participantCount`).
- Param `fromAt` (query, optional): string:date-time. Window lower bound; defaults to the request time.
- Param `toAt` (query, optional): string:date-time. Window upper bound.
- Param `from` (query, optional, deprecated): string:date-time. Deprecated alias of `fromAt`, read only when `fromAt` is absent.
- Param `to` (query, optional, deprecated): string:date-time. Deprecated alias of `toAt`, read only when `toAt` is absent.
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string, description: string|null, venueId: string:uuid, startsAt: string:date-time|null, endsAt: string:date-time|null, eventCount: integer, coverImageUrl: string:uri|null, price: object, maxParticipants: integer|null, participantCount: integer}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params, invalid_date_range_order; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/courses/{courseId}`

- Summary: Get a course by id  (operationId `getCourse`, tag ['Courses']); auth: public (no `security` declared)
- Description: Returns one course in `data`, the same projection as a list item (per-session listing deferred to a separate `/course-events` endpoint). A course that does not exist, is unpublished, is deleted, or belongs to a different studio returns `404 course_not_found` (never `403`); an unlisted course IS returned by id. Public endpoint  -  no bearer token required. Uncached (`private, no-store`).
- Response 200 (`application/json`): `{data: {id: string:uuid, name: string, description: string|null, venueId: string:uuid, startsAt: string:date-time|null, endsAt: string:date-time|null, eventCount: integer, coverImageUrl: string:uri|null, price: {amount: integer, currency: string}, maxParticipants: integer|null, participantCount: integer}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found, course_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/course-events`

- Summary: List course sessions  (operationId `getCourseEvents`, tag ['Courses']); auth: public (no `security` declared)
- Description: Returns the complete, chronologically ordered session list (`start ASC, id ASC`) of the course named by the required `courseId` query param (spec-course-events:INV-2). Sessions carry ids and instants only  -  no strings, no volatile field  -  so the endpoint is publicly cached (`public, s-maxage=60, stale-while-revalidate=300`), unlike `/courses` (spec-course-events:DEC-cached). Session visibility is inherited from the parent course: a course that does not exist, is unpublished, is deleted, or belongs to another studio returns `404 course_not_found` (spec-course-events:INV-1); an unlisted course’s sessions ARE returned by id. Public endpoint  -  no bearer token required.
- Param `courseId` (query, required): string:uuid. The course whose sessions are listed.
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, startsAt: string:date-time, endsAt: string:date-time, roomId: string:uuid|null, instructorId: string:uuid|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 404: studio_not_found, course_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/class-credits`

- Summary: Get user class credits  (operationId `getStudioClassCredits`, tag ['Classes']); auth: bearer required
- Description: Returns the caller’s class-credit pools for a studio  -  the default pool (0..1, as stored) plus the credit pools of their visible memberships. Bearer + user-scoped (`userId` = `me` or the caller’s own id). Uncached (`private, no-store`).
- Param `userId` (query, required): string. Required. The literal `me`, the caller’s own user id (uuid), or  -  for a studio `owner`/`admin`/`staff`  -  another member’s id. Any other caller naming a foreign id → `403 not_authorized`; missing or malformed → `400 i
- Response 200 (`application/json`): `{data: {items: {id: string, userId: string, credits: number, expireDate: string:date, validFromDate: string:date|null, type: enum(default/membership_credits), userMembershipId: string|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/class-credit-transactions`

- Summary: Get user class-credit transactions  (operationId `getStudioClassCreditTransactions`, tag ['Classes']); auth: bearer required
- Description: Returns the caller’s class-credit transaction ledger for exactly one pool, newest-first. Bearer + user-scoped. `userMembershipId` selects the pool (omit for the default pool). Uncached (`private, no-store`). (`fromAt`/`toAt` `created_at` filtering is deferred  -  spec-class-credits:TODO-4.)
- Param `userId` (query, required): string. Required. The literal `me`, the caller’s own user id (uuid), or  -  for a studio `owner`/`admin`/`staff`  -  another member’s id. Any other caller naming a foreign id → `403 not_authorized`; missing or malformed → `400 i
- Param `userMembershipId` (query, optional): string. Optional pool selector (uuid). Omit for the caller’s default pool; supply a membership id for that membership’s credit pool. A non-owned / unknown id yields an empty list  -  never a 404/403 (no existence oracle).
- Response 200 (`application/json`): `{data: {items: {id: string, type: enum(purchase/spend/manual/refund/renew/expire), change: number, balance: number, createdAt: string:date-time}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/voucher-pools`

- Summary: List a member's voucher pools  (operationId `listStudioVoucherPools`, tag ['Vouchers']); auth: bearer required
- Description: Returns the voucher pools (advanced-credit balances) a member holds at the studio, soonest expiry first, one page at a time (`pageSize` 1-200, default 25; `pageIndex` from 0). Follow `links.next` until it is `null`.  **Scope.** `userId=me` for your own pools, or a user id: a studio `owner`/`admin`/`staff` (or an API key) may name any member; anyone else naming a foreign id → `403 not_authorized`.  **Depleted pools.** A pool with no credits left is omitted unless `includeDepleted=true`. An expired pool with credits left is always listed.  **Expiry.** `expiresAt` is the eligibility instant: a class starting at or before it can be paid with the pool. `lastValidDate` is the last usable calendar ...
- Param `userId` (query, required): (string:uuid | enum(me)). The member who holds the pools. `me` for yourself; studio `owner`/`admin`/`staff` (or an API key) may name any member.
- Param `includeDepleted` (query, optional): enum(true/false). Include depleted pools (credit balance 0). Defaults to `false`. Expired pools with credits left are always included.
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string, voucherId: string, name: string, description: string|null, creditBalance: number, creditCost: enum(one_per_class/class_credit_cost), classIds: string[], startsAt: string:date-time, expiresAt: string:date-time, lastValidDate: string:date}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 429: rate_limited; 500: internal

#### `GET /api/v1/studios/{studioId}/voucher-pools/{voucherPoolId}/transactions`

- Summary: List a voucher pool's transactions  (operationId `listStudioVoucherPoolTransactions`, tag ['Vouchers']); auth: bearer required
- Description: Returns one voucher pool’s ledger, newest first, one page at a time (`pageSize` 1-200, default 25; `pageIndex` from 0). Follow `links.next` until it is `null`.  **Scope.** `userId` names the pool’s owner, with the same rules as `GET …/voucher-pools`. A pool that is not that member’s at this studio → `404 voucher_pool_not_found`.  **Items.** `change` is signed. `classEventBookingId` names the booking a `spend` paid for, or the booking whose spend a `refund` restored. Items carry no running balance  -  the pool’s `creditBalance` is the current one. Uncached (`private, no-store`).
- Param `userId` (query, required): (string:uuid | enum(me)). The member who holds the pools. `me` for yourself; studio `owner`/`admin`/`staff` (or an API key) may name any member.
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string, type: enum(purchase/spend/refund/manual/expire/unknown), change: number, createdAt: string:date-time, classEventBookingId: string|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found, voucher_pool_not_found; 429: rate_limited; 500: internal

#### `GET /api/v1/studios/{studioId}/gym-check-ins`

- Summary: List gym check-ins  (operationId `listStudioGymCheckIns`, tag ['Gym']); auth: bearer required
- Description: Returns gym check-ins at the studio, newest first, one page at a time (`pageSize` 1-200, default 25; `pageIndex` from 0). `meta` carries `pageIndex`, `pageSize` and `totalCount`; follow `links.next` until it is `null` (spec-check-ins §18.2).  **Scope.** Name `userId=me` for your own check-ins (the member profile), or a user id: a studio `owner`/`admin`/`staff` (or an API key) may name any member, anyone else naming a foreign id → `403 not_authorized`. Omit `userId` to list every check-in at the studio  -  `owner`/`admin`/`staff` or an API key only; anyone else → `403 not_authorized`.  **Items.** `id` is the `checkInId` the create returns; `expiresAt` is when the check-in stops granting door ...
- Param `userId` (query, optional): (string:uuid | enum(me)). Narrow to one user. Omit to list the whole studio (owner/admin/staff or API key only).
- Param `fromAt` (query, optional): string:date-time. Inclusive lower bound on `createdAt`.
- Param `toAt` (query, optional): string:date-time. Inclusive upper bound on `createdAt`.
- Param `venueId` (query, optional): string:uuid. Narrow to check-ins at one venue.
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string, createdAt: string:date-time, expiresAt: string:date-time, venueId: string, accessType: enum(membership/membership_credit/class_credit/company_credit/manual/single_purchase/unknown), user: object}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params, invalid_date_range_order; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 409: feature_disabled; 500: internal

#### `POST /api/v1/studios/{studioId}/gym-check-ins`

- Summary: Create a gym check-in  (operationId `createStudioGymCheckIn`, tag ['Gym']); auth: bearer required
- Description: Records a gym check-in at a venue and charges the chosen payment option (spec-check-ins §18.1). Bearer + user-scoped (`?userId=me`). A concrete gym-check-in resource  -  the body carries no `target` discriminator. Retry-safe: a repeat within the 2h validity window returns the existing check-in (`200` + `Content-Location`) without a second credit burn; a fresh check-in returns `201` + `Location`. Uncached. A successful check-in does NOT unlock a door (call §19.1 explicitly).
- Param `userId` (query, required): string. Required. The literal `me` or the caller’s own user id (uuid). The check-in acts on the authenticated caller and cannot be recorded for anyone else, so any other value is rejected (`403 not_authorized`)  -  including for
- Request body `application/json` (required): `{venueId: string:uuid, option: ({membership: object} | {membershipCreditPool: object} | {classCredits: object} | {companyAccountCredits: object})}`
- Response 200 (`application/json`): `{data: {id: string, createdAt: string:date-time, expiresAt: string:date-time, venueId: string, accessType: enum(membership/membership_credit/class_credit/company_credit/manual/single_purchase/unknown), user: {id: string, name: string|null, email: string|null}}}`
- Response 201 (`application/json`): `{data: {id: string, createdAt: string:date-time, expiresAt: string:date-time, venueId: string, accessType: enum(membership/membership_credit/class_credit/company_credit/manual/single_purchase/unknown), user: {id: string, name: string|null, email: string|null}}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized, permission_denied; 404: studio_not_found, venue_not_found; 409: feature_disabled, option_no_longer_available; 422: validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/gym-check-ins/{gymCheckInId}`

- Summary: Get gym check-in  (operationId `getStudioGymCheckIn`, tag ['Gym']); auth: bearer required
- Description: One check-in by id, in the same shape as a list item (spec-check-ins §18.3). Visible to the check-in’s member and to `owner`/`admin`/`staff` of the studio (and API keys)  -  the list’s visibility. Anything else is `404 gym_check_in_not_found`. Uncached (`private, no-store`).
- Response 200 (`application/json`): `{data: {id: string, createdAt: string:date-time, expiresAt: string:date-time, venueId: string, accessType: enum(membership/membership_credit/class_credit/company_credit/manual/single_purchase/unknown), user: {id: string, name: string|null, email: string|null}}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, gym_check_in_not_found; 409: feature_disabled; 500: internal

#### `POST /api/v1/studios/{studioId}/participation-imports`

- Summary: Import participation counts  (operationId `createStudioParticipationImports`, tag ['Participation imports']); auth: bearer required
- Description: Bulk imports members' accumulated training-session counts from a previous system, keyed by email (spec-participation-imports §22.1). Bearer + studio-role-privileged: the caller MUST hold `owner` or `admin` at the path studio (there is NO `userId` param  -  the caller acts on the studio, not a user target). Each row's email is resolved server-side against the studio's members; a row that resolves to exactly one member is upserted (absolute-value replace of the offset), and any row that does not becomes a `failures[]` entry (`invalid_email` / `not_studio_member` / `ambiguous_email`)  -  a partial apply that never blocks the good rows. Naturally idempotent: an identical replay rewrites identica...
- Request body `application/json` (required): `{source: string, rows: {email: string, sessionCount: integer}[]}`
- Response 200 (`application/json`): `{data: {imported: integer, failures: {email: string, code: enum(invalid_email/not_studio_member/ambiguous_email)}[]}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found; 422: validation_error; 500: internal

#### `GET /api/v1/friend-bookings`

- Summary: Get friends’ upcoming classes  (operationId `getFriendBookings`, tag ['Friends']); auth: bearer required
- Description: Returns the upcoming class instances the caller’s friends are booked on at the studio named in `studioId`, starting inside the required `fromAt`-`toAt` window  -  one entry per instance, naming every friend booked on it, soonest start first. Not the caller’s own bookings: an instance only the caller booked never appears, and `viewerBooked` annotates the ones a friend brought into the feed. A friend who hid their activity contributes nothing at all  -  no name, no count, and no instance. Bearer + self-only (`userId` = `me` or the caller’s own id); an API key is refused. Uncached (`private, no-store`).
- Param `userId` (query, required): string. Required. The literal `me` or the caller’s own user id (uuid). The feed is the caller’s own, so any other value is rejected `403 not_authorized`  -  including for a studio `owner`/`admin`/`staff`. Missing or malformed → 
- Param `studioId` (query, required): string. Required. The studio (uuid) whose schedule the feed is drawn from  -  only class instances there are returned, and only friends who are also its members contribute. Missing or malformed → `400 invalid_query_params`; a st
- Param `fromAt` (query, required): string:date-time. Required. Start of the window, as an ISO-8601 instant carrying an explicit offset (`2026-09-01T00:00:00Z` or `2026-09-01T02:00:00+02:00`). Instances starting at or after it are returned. Must not be earlier than the curr
- Param `toAt` (query, required): string:date-time. Required. End of the window, as an ISO-8601 instant carrying an explicit offset. Instances starting at or before it are returned. No maximum span is imposed, but a window matching more than 200 class instances answers `4
- Param `from` (query, optional, deprecated): string:date-time. Deprecated alias of `fromAt`, read only when `fromAt` is absent.
- Param `to` (query, optional, deprecated): string:date-time. Deprecated alias of `toAt`, read only when `toAt` is absent.
- Response 200 (`application/json`): `{data: {items: {friendUserId: string:uuid, classEventIds: string:uuid[]}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params, invalid_date_range_order; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/class-event-invites`

- Summary: Get the caller’s class invitations  (operationId `listIncomingClassInvites`, tag ['Classes']); auth: bearer required
- Description: Every invitation the caller holds at the studio named in `studioId`, soonest occurrence first  -  the class, when it starts, and who asked. Only occurrences that are still to come and have not been cancelled, and never one the caller has already booked: booking is the answer to an invitation, so the row drops out of this list while staying in the occurrence’s own invited-member list. `invitedBy` is an array carrying exactly one inviter for as long as the schema stores one. Bearer + self-only (`userId` = `me` or the caller’s own id) with no escape for a studio owner or admin; an API key is refused. A member of no such studio reads an empty list. Uncached (`private, no-store`).
- Param `userId` (query, required): (enum(me) | string:uuid). The subject whose invitations to read. Required, and self-only: `me` or the caller’s own user id.
- Param `studioId` (query, required): string:uuid. The studio whose invitations to read. Required.
- Response 200 (`application/json`): `{data: {items: {classEventId: string:uuid, startsAt: string:date-time, className: string|null, invitedBy: object[]}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params; 401: unauthorized; 403: not_authorized, api_key_not_supported; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/payment-transactions`

- Summary: List payment transactions  (operationId `listPaymentTransactions`, tag ['Payments']); auth: bearer required
- Description: Returns a studio’s payment history, newest-first, one page at a time (`pageSize` 1-100, default 25; `pageIndex` from 0). `meta` carries `pageIndex`, `pageSize` and `totalCount`; follow `links.next` until it is `null`.  **Scope.** Name `userId=me` or a user id for one user’s payments; a studio `owner`/`admin`/`staff` (or an API key) may name another member, any other caller naming a foreign id → `403 not_authorized`. Omit `userId` to list every payment at the studio  -  `owner`/`admin`/`staff` or an API key only; anyone else → `403 not_authorized`.  **Items.** Each item is a `transaction` or an `installment`  -  one paid slice of an installment plan, at the slice’s own amount; a plan never ap...
- Param `userId` (query, optional): (string:uuid | enum(me)). Narrow to one user. Omit to list the whole studio (owner/admin/staff or API key only).
- Param `fromAt` (query, optional): string:date-time. Inclusive lower bound on the instant `dateField` names.
- Param `toAt` (query, optional): string:date-time. Inclusive upper bound on the instant `dateField` names.
- Param `dateField` (query, optional): enum(created_at/paid_at). The instant `fromAt`/`toAt` filter on and items sort by. `paid_at` admits only paid items; `created_at` places an installment by when its plan was created.
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Param `from` (query, optional, deprecated): string:date-time. Deprecated alias of `fromAt`, read only when `fromAt` is absent.
- Param `to` (query, optional, deprecated): string:date-time. Deprecated alias of `toAt`, read only when `toAt` is absent.
- Response 200 (`application/json`): `{data: {items: {type: enum(transaction/installment), id: string, transactionId: string, installment: object|null, user: object|null, createdAt: string:date-time, paidAt: string:date-time|null, status: enum(draft/pending/paid/failed/canceled/refunded/unknown), fulfilled: boolean, price: object, description: string|null, kind: enum(membership/class_credits_bundle/single_class/course/custom/product/specialist_credits_bundle/specialist_service_credits/company_account_credits/trial_offer_single_class/trial_offer_1_credit/trial_offer_3_credits/no_show_fee/late_cancel_fee/voucher/class_credit_pay_as_you_go/unknown)}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params, invalid_date_range_order; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/payment-transactions/{transactionId}`

- Summary: Get payment transaction  (operationId `getPaymentTransaction`, tag ['Payments']); auth: bearer required
- Description: Returns a single owned transaction by id  -  the checkout status-poll target (PTX §16.2). Same closed item as §15.1, always of type `transaction` (spec-payment-transactions:DEC-transaction-response-shape). Bearer + id-scoped: a transaction that is missing, owned by another user (even for a staff caller with RLS visibility), at another studio, or deleted is `404 transaction_not_found`  -  never a `403`, never the body (spec-payment-transactions:INV-2/3/4/10, spec-api-v1-conventions:DEC-not-found-over-forbidden). Reaches states §15.1 hides  -  `draft`/`failed` (spec-payment-transactions:INV-11). Uncached (`private, no-store`).
- Response 200 (`application/json`): `{data: {type: enum(transaction/installment), id: string, transactionId: string, installment: {sequence: integer, total: integer}|null, user: {id: string, name: string|null, email: string|null}|null, createdAt: string:date-time, paidAt: string:date-time|null, status: enum(draft/pending/paid/failed/canceled/refunded/unknown), fulfilled: boolean, price: {amount: integer, currency: string}, description: string|null, kind: enum(membership/class_credits_bundle/single_class/course/custom/product/specialist_credits_bundle/specialist_service_credits/company_account_credits/trial_offer_single_class/trial_offer_1_credit/trial_offer_3_credits/no_show_fee/late_cancel_fee/voucher/class_credit_pay_as_you_go/unknown)}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported; 404: studio_not_found, transaction_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/payment-transactions/{transactionId}/receipt`

- Summary: Get receipt URL  (operationId `getReceiptUrl`, tag ['Payments']); auth: bearer required
- Description: Returns a 60-second signed download URL for an owned transaction’s receipt PDF, plus its `expiresAt` (PTX §15.2, spec-payment-transactions:INV-9, spec-payment-transactions:DEC-receipt-expires-at). Bearer + id-scoped: the owned-transaction guard runs first (foreign / staff-visible / foreign-studio / deleted → `404 transaction_not_found`, no signing side effect; spec-payment-transactions:INV-2/3, spec-payment-transactions:MUSTNOT-receipt-without-ownership). An owned transaction that is neither `paid` nor an installment parent → `409 receipt_not_available` (spec-payment-transactions:DEC-receipt-eligibility-gate). Uncached; do not cache or reuse the URL (spec-payment-transactions:DEC-uncached-us...
- Response 200 (`application/json`): `{data: {url: string, expiresAt: string:date-time}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported; 404: studio_not_found, transaction_not_found; 409: receipt_not_available; 500: internal

#### `GET /api/v1/studios/{studioId}/course-bookings`

- Summary: List a user’s course bookings for a studio  (operationId `getCourseBookings`, tag ['Courses']); auth: bearer required
- Description: Returns the caller’s own course bookings in `data.items` (spec-course-bookings:RESP-envelope)  -  each course enrollment expands to one item per course session (spec-course-bookings:DEC-expansion), sorted `startsAt ASC, courseEventId ASC` (spec-course-bookings:INV-8). Bearer + user-scoped: select the subject with `?userId=me` (or their own id; a studio `owner`/`admin`/`staff` may name another member, any other caller naming a foreign id → `403`, spec-course-bookings:INV-1). Optional `fromAt`/`toAt` window the sessions (a session starting at or after `fromAt` and ending at or before `toAt`; spec-course-bookings:DEC-window-filter). Per-user private state  -  never cached (`Cache-Control: priva...
- Param `userId` (query, required): (string:uuid | enum(me)). Whose course bookings to read: `me` or the caller’s own `userId`
- Param `fromAt` (query, optional): string:date-time. Inclusive lower bound on the session `startsAt`.
- Param `toAt` (query, optional): string:date-time. Inclusive upper bound on the session `endsAt`.
- Param `from` (query, optional, deprecated): string:date-time. Deprecated alias of `fromAt`, read only when `fromAt` is absent.
- Param `to` (query, optional, deprecated): string:date-time. Deprecated alias of `toAt`, read only when `toAt` is absent.
- Response 200 (`application/json`): `{data: {items: {userId: string:uuid, courseId: string:uuid, courseEventId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, roomId: string:uuid|null, instructorId: string:uuid|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params, invalid_date_range_order; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/specialist-service-bookings`

- Summary: List specialist-service bookings  (operationId `getSpecialistServiceBookings`, tag ['Specialist services']); auth: bearer required
- Description: Returns specialist-service bookings, newest-first (by `startsAt`, descending), one page at a time (`pageSize` 1-200, default 50; `pageIndex` from 0). `meta` carries `pageIndex`, `pageSize` and `totalCount`; follow `links.next` until it is `null`.  **Scope.** Omit `userId` for a studio-wide listing: an API key or a studio `owner`/`admin`/`staff` sees every booking, an instructor their own sessions, a member their own bookings  -  row visibility is the database’s, never widened by the endpoint. Name `userId=me` or a user id to narrow to one user; a studio `owner`/`admin`/`staff` (or an API key) may name another member, any other caller naming a foreign id → `403 not_authorized`.  **Filters.** ...
- Param `userId` (query, optional): (string:uuid | enum(me)). Narrow to one user. Omit for a studio-wide listing (an owner/admin/staff or API key sees every booking; an instructor their own sessions; a member their own bookings).
- Param `instructorId` (query, optional): string:uuid. Narrow to bookings with this instructor.
- Param `status` (query, optional): enum(booked/completed/canceled/no_show/refunded). Narrow to bookings whose derived `status` equals this value.
- Param `fromAt` (query, optional): string:date-time. Inclusive lower bound on the booking `startsAt` instant.
- Param `toAt` (query, optional): string:date-time. Inclusive upper bound on the booking `startsAt` instant.
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Param `from` (query, optional, deprecated): string:date-time. Deprecated alias of `fromAt`, read only when `fromAt` is absent.
- Param `to` (query, optional, deprecated): string:date-time. Deprecated alias of `toAt`, read only when `toAt` is absent.
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, userId: string:uuid, specialistServiceId: string:uuid, instructorId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, status: enum(booked/completed/canceled/no_show/refunded), bookedAt: string:date-time, completedAt: string:date-time|null, canceledAt: string:date-time|null, noShowAt: string:date-time|null, refundedAt: string:date-time|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params, invalid_date_range_order; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 500: internal

#### `POST /api/v1/studios/{studioId}/specialist-service-bookings`

- Summary: Create a specialist-service booking  (operationId `createSpecialistServiceBooking`, tag ['Specialist services']); auth: bearer required
- Description: Books a member for a specialist service with an instructor, as staff do in admin. Spends `creditsAmount` (default 1) of the member’s credits for the service.  **Callers.** An API key, or a studio `owner`/`admin`/`staff` bearer. Members cannot book through this endpoint (`403 permission_denied`).  **End time.** `endsAt` defaults to `startsAt` plus the service’s `durationMinutes`; send it to book another length. A service with no duration needs `endsAt` (`422 service_duration_missing`).  **Retries.** Replaying a create that already succeeded answers `200` with the booking it made and spends nothing.
- Request body `application/json` (required): `{userId: (string:uuid | enum(me)), specialistServiceId: string:uuid, instructorId: string:uuid, startsAt: string:date-time, endsAt?: string:date-time, creditsAmount?: number, sendNotification?: boolean, userNote?: string, internalNote?: string}`
- Response 200 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, specialistServiceId: string:uuid, instructorId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, status: enum(booked/completed/canceled/no_show/refunded), bookedAt: string:date-time, completedAt: string:date-time|null, canceledAt: string:date-time|null, noShowAt: string:date-time|null, refundedAt: string:date-time|null, creditsPaid: number, bookedByUserId: string:uuid}}`
- Response 201 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, specialistServiceId: string:uuid, instructorId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, status: enum(booked/completed/canceled/no_show/refunded), bookedAt: string:date-time, completedAt: string:date-time|null, canceledAt: string:date-time|null, noShowAt: string:date-time|null, refundedAt: string:date-time|null, creditsPaid: number, bookedByUserId: string:uuid}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, user_not_found, specialist_service_not_found, instructor_not_found; 409: instructor_not_assigned, instructor_unavailable, insufficient_credits, history_locked; 422: validation_error, service_duration_missing; 500: internal

#### `GET /api/v1/studios/{studioId}/specialist-service-bookings/{specialistServiceBookingId}`

- Summary: Get specialist-service booking  (operationId `getSpecialistServiceBooking`, tag ['Specialist services']); auth: bearer required
- Description: One booking by id, in the same shape as a list item. Visible to the booking’s user, its instructor, and `owner`/`admin`/`staff` of the studio (and API keys, whose subject holds the owner role)  -  the list’s studio-wide visibility. Anything else is `404 specialist_service_booking_not_found`. Uncached (`private, no-store`).
- Response 200 (`application/json`): `{data: {id: string:uuid, userId: string:uuid, specialistServiceId: string:uuid, instructorId: string:uuid, startsAt: string:date-time, endsAt: string:date-time, status: enum(booked/completed/canceled/no_show/refunded), bookedAt: string:date-time, completedAt: string:date-time|null, canceledAt: string:date-time|null, noShowAt: string:date-time|null, refundedAt: string:date-time|null}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, specialist_service_booking_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/venues`

- Summary: Get venues  (operationId `getVenues`, tag ['Venues']); auth: public (no `security` declared)
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string, name: string, address: (object | object | object | object | object | object)}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/venues/{venueId}`

- Summary: Get venue  (operationId `getVenue`, tag ['Venues']); auth: public (no `security` declared)
- Response 200 (`application/json`): `{data: {id: string, name: string, address: ({countryCode: enum(DK), line1: string, line2?: string, postalCode: string, city: string} | {countryCode: enum(FI), line1: string, line2?: string, postalCode: string, city: string} | {countryCode: enum(HU), line1: string, line2?: string, postalCode: string, city: string} | {countryCode: enum(NO), line1: string, line2?: string, postalCode: string, city: string} | {countryCode: enum(ES), line1: string, line2?: string, postalCode: string, city: string, province: string} | {countryCode: enum(SE), line1: string, line2?: string, postalCode: string, city: string})}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found, venue_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/venues/{venueId}/gym-access-options`

- Summary: List gym access options  (operationId `listStudioVenueGymAccessOptions`, tag ['Venues']); auth: bearer required
- Description: The bearer/app "how can I check in at this venue" list: the caller’s eligible ways to pay for a gym check-in at this venue right now (spec-gym-access-options §17.1). Each entry is a single-key option  -  `membership` / `membershipCreditPool` / `classCredits` / `companyAccountCredits`  -  carrying the id(s) the §18.1 check-in write re-resolves and charges. `options[0]` is the recommended primary. The id fields (`userMembershipId`, `creditsId`, `companyAccountId`) are opaque strings: echo them verbatim into the write, never parse them (spec-gym-access-options:MUSTNOT-parse-opaque-ids).  Ineligible options are omitted; an empty `options[]` is a 200, not an error.
- Param `userId` (query, required): string. Required. The literal `me`, the caller’s own id, or  -  for a studio `owner`/`admin`/`staff`  -  another member’s id. Any other caller naming a foreign id → `403 not_authorized`; a malformed non-`me` id or a missing valu
- Response 200 (`application/json`): `{data: {options: (object | object | object | object)[]}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, venue_not_found, user_not_found; 409: feature_disabled; 500: internal

#### `GET /api/v1/studios/{studioId}/rooms`

- Summary: Get rooms  (operationId `getRooms`, tag ['Rooms']); auth: public (no `security` declared)
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, venueId: string:uuid, name: string, capacity: integer}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params, invalid_path_param; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/rooms/{roomId}`

- Summary: Get room  (operationId `getRoom`, tag ['Rooms']); auth: public (no `security` declared)
- Response 200 (`application/json`): `{data: {id: string:uuid, venueId: string:uuid, name: string, capacity: integer}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found, room_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/instructors`

- Summary: Get instructors  (operationId `getInstructors`, tag ['Instructors']); auth: public (no `security` declared)
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string, avatarUrl: string:uri|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_query_params, invalid_path_param; 404: studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/instructors/{instructorId}`

- Summary: Get instructor  (operationId `getInstructor`, tag ['Instructors']); auth: public (no `security` declared)
- Response 200 (`application/json`): `{data: {id: string:uuid, name: string, avatarUrl: string:uri|null}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found, instructor_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/schedule-categories`

- Summary: List schedule categories for a studio  (operationId `getStudioScheduleCategories`, tag ['Schedule categories']); auth: public (no `security` declared)
- Description: Returns the studio’s schedule categories, ordered `sort_order ASC, name ASC, id ASC`. Public endpoint  -  no bearer token required. Responses may be cached (see `Cache-Control`).
- Response 200 (`application/json`): `{data: {items: {id: string:uuid, name: string, sortOrder: integer}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/policies/{type}`

- Summary: Get a studio policy document  (operationId `getPolicyDocument`, tag ['Policies']); auth: public (no `security` declared)
- Description: Returns the legal document for `type`: `terms` (the studio’s booking terms, generated from that studio’s booking settings), or one of Mana’s platform-wide documents  -  `privacy`, `user-terms`, `cookies`, `terms-of-service`, `dpa`, `subprocessors`. For `terms`, the studio’s legal-entity block is attached (or `null` when the studio is not payment-onboarded); every other type always carries `legalEntity: null`. Public endpoint  -  no bearer token required. Single-language today, so no `Vary: Accept-Language` (spec-policy:TODO-2); responses may be cached (see `Cache-Control`).
- Response 200 (`application/json`): `{data: {type: enum(terms/privacy/user-terms/cookies/terms-of-service/dpa/subprocessors), title: string, bodyMarkdown: string, legalEntity: {studioName: string, companyName: string, orgNumber: string|null, address: string|null, phone: string|null, email: string|null}|null}}`
- Error codes: 400: invalid_path_param; 404: policy_not_found, studio_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/memberships`

- Summary: List available memberships for a studio  (operationId `getStudioMemberships`, tag ['Memberships']); auth: public (no `security` declared)
- Description: Returns the studio’s purchasable membership catalog  -  available (not hidden, archived, or deleted) memberships sorted by `public_listing_priority DESC NULLS LAST, name ASC, id ASC`. Public endpoint  -  no bearer token required. Localized (`Vary: Accept-Language`); responses may be cached (see `Cache-Control`).
- Response 200 (`application/json`): `{data: {items: {id: string, name: string, description: string|null, type: enum(standard/credits), price: object, interval: enum(month), commitmentMonths: number|null, creditsPerPeriod: integer|null, creditPeriod: enum(week/month)|null, creditAccessMode: enum(none/all_credit_classes/restricted), classAccess: object[], hasGymAccess: boolean, maxBookingDaysInAdvance: integer|null, publicListingPriority: integer|null}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/memberships/{membershipId}`

- Summary: Get a membership by id  (operationId `getStudioMembership`, tag ['Memberships']); auth: public (no `security` declared)
- Description: Returns one available membership in `data`, the same projection as a list item. A membership that does not exist, is not available (hidden/archived/deleted), or belongs to a different studio returns `404 membership_not_found` (never `403`). Public endpoint  -  no bearer token required. Localized (`Vary: Accept-Language`); responses may be cached.
- Response 200 (`application/json`): `{data: {id: string, name: string, description: string|null, type: enum(standard/credits), price: {amount: integer, currency: string}, interval: enum(month), commitmentMonths: number|null, creditsPerPeriod: integer|null, creditPeriod: enum(week/month)|null, creditAccessMode: enum(none/all_credit_classes/restricted), classAccess: {classId: string, accessType: enum(free/credits)}[], hasGymAccess: boolean, maxBookingDaysInAdvance: integer|null, publicListingPriority: integer|null}}`
- Error codes: 400: invalid_path_param; 404: studio_not_found, membership_not_found; 500: internal

#### `GET /api/v1/studios/{studioId}/user-memberships`

- Summary: List a user’s held memberships for a studio  (operationId `getUserMemberships`, tag ['User memberships']); auth: bearer required
- Description: Returns the caller’s own held `user_memberships` in `data.items` (UMB §8.1), sorted `end_date DESC NULLS FIRST, start_date DESC, id ASC`. Bearer + user-scoped: select the caller with `?userId=me` (or their own id; a foreign id → `403`). Filter with `?status=` (subset of `active,ended,future`; default `active,future`). Per-user private billing state  -  never cached (`Cache-Control: private, no-store`).
- Param `userId` (query, required): string. Target user. The literal `me`, the caller’s own user id, or  -  for a studio `owner`/`admin`/`staff`  -  another member’s id. Any other caller naming a foreign id → `403 not_authorized`; missing or malformed → `400 inval
- Param `status` (query, optional): string. Comma-separated subset of `active`, `ended`, `future`. Defaults to `active,future`. Any other token → `400 invalid_query_params`.
- Response 200 (`application/json`): `{data: {items: {id: string, membershipId: string, name: string, type: enum(standard/credits), status: enum(active/ended/future), startDate: string:date, pendingChange: (object | object), commitmentEndDate: string:date|null, cancelEffectiveDate: string:date|null, invoicedUntilDate: string:date|null, price: object, interval: enum(month), hasGymAccess: boolean, maxBookingDaysInAdvance: integer|null, creditsPerPeriod: integer|null, creditPeriod: enum(week/month)|null, creditAccessMode: enum(none/all_credit_classes/restricted), classAccess: object[], pricePeriods: object[], upcomingPayments: object[]}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, user_not_found; 413: response_too_large; 500: internal

#### `GET /api/v1/studios/{studioId}/user-memberships/{userMembershipId}`

- Summary: Get a held membership  (operationId `getUserMembership`, tag ['User memberships']); auth: bearer required
- Description: One held membership by id (UMB §8.4), in the same projection as a §8.1 list item. Readable by its holder and by `owner`/`admin`/`staff` of the path studio (and API keys, whose subject holds the owner role)  -  the same set §8.1 serves via `userId`. A membership that is missing, not visible to the caller, draft/deleted, or under another studio returns `404 user_membership_not_found`. Per-user private billing state  -  never cached (`Cache-Control: private, no-store`).
- Response 200 (`application/json`): `{data: {id: string, membershipId: string, name: string, type: enum(standard/credits), status: enum(active/ended/future), startDate: string:date, pendingChange: ({kind: enum(cancel), endDate: string:date} | {kind: enum(freeze), freezeDate: string:date}), commitmentEndDate: string:date|null, cancelEffectiveDate: string:date|null, invoicedUntilDate: string:date|null, price: {amount: integer, currency: string}, interval: enum(month), hasGymAccess: boolean, maxBookingDaysInAdvance: integer|null, creditsPerPeriod: integer|null, creditPeriod: enum(week/month)|null, creditAccessMode: enum(none/all_credit_classes/restricted), classAccess: {classId: string, accessType: enum(free/credits)}[], pricePeriods: {fromDate: string:date, toDate: string:date|null, price: object, type: enum(base/percent_discount/unknown), discountPercent: number|null, disableMembership: boolean}[], upcomingPayments: {periodS`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, user_membership_not_found; 500: internal

#### `PATCH /api/v1/studios/{studioId}/user-memberships/{userMembershipId}`

- Summary: Cancel or resume a held membership’s scheduled transition  (operationId `updateUserMembership`, tag ['User memberships']); auth: bearer required
- Description: Schedules an end-of-period cancel (`{ "pendingChange": { "kind": "cancel" } }`) or clears a pending cancel (`{ "pendingChange": null }`) on the caller’s own held membership (UMB §8.2). Bearer + user-scoped; ownership is enforced by RLS  -  a membership that is missing, not owned, draft/deleted, or under another studio returns `404 user_membership_not_found` (never `403`). `pendingChange` is the only writable field; the cancel `endDate` is server-computed. Operates only on an `active` membership (`future`/`ended` → `409 not_cancelable`); a customer may neither set nor clear an admin freeze. Per-user private billing state  -  never cached (`Cache-Control: private, no-store`).
- Request body `application/json` (required): `{pendingChange: (enum(None)|null | {kind: enum(cancel/freeze)})}`
- Response 200 (`application/json`): `{data: {id: string, membershipId: string, name: string, type: enum(standard/credits), status: enum(active/ended/future), startDate: string:date, pendingChange: ({kind: enum(cancel), endDate: string:date} | {kind: enum(freeze), freezeDate: string:date}), commitmentEndDate: string:date|null, cancelEffectiveDate: string:date|null, invoicedUntilDate: string:date|null, price: {amount: integer, currency: string}, interval: enum(month), hasGymAccess: boolean, maxBookingDaysInAdvance: integer|null, creditsPerPeriod: integer|null, creditPeriod: enum(week/month)|null, creditAccessMode: enum(none/all_credit_classes/restricted), classAccess: {classId: string, accessType: enum(free/credits)}[], pricePeriods: {fromDate: string:date, toDate: string:date|null, price: object, type: enum(base/percent_discount/unknown), discountPercent: number|null, disableMembership: boolean}[], upcomingPayments: {periodS`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied, api_key_not_supported; 404: studio_not_found, user_membership_not_found; 409: not_cancelable, already_cancelled, not_cancelled, is_frozen; 422: validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/door-integration`

- Summary: Get a studio’s door integration  (operationId `getStudioDoorIntegration`, tag ['Door integration']); auth: public (no `security` declared)
- Description: Returns the studio-wide door-unlock vendor configuration as an externally-tagged union at `data`: `{ kiion: { doors, unlockHours } }`, `{ parakey: {} }`, or `{ none: {} }`  -  always an object, exactly one key. `unlockHours` days are `{ from, to }` (`HH:mm`), `null` (closed), or `{ from: null, to: null }` (open 24h). No vendor credentials are exposed. Public endpoint  -  no bearer token required. Responses may be cached (see `Cache-Control`).
- Response 200 (`application/json`): `{data: ({kiion: {doors: object[], unlockHours: object}} | {parakey: {}} | {none: {}})}`
- Error codes: 400: invalid_path_param; 404: studio_not_found; 500: internal

#### `POST /api/v1/studios/{studioId}/users`

- Summary: Create a user  (operationId `createStudioUser`, tag ['Auth']); auth: public (no `security` declared)
- Description: Creates a passwordless account for `email` and joins it to `{studioId}`. **Public** endpoint  -  no `Authorization` header (the caller is logged out).  **Sends no email and issues no code.** Call `POST /studios/{studioId}/auth-code-requests` next to have a sign-in code emailed; sign-up is deliberately two calls, so the code  -  and its 60s cooldown  -  live behind exactly one endpoint.  Idempotent and state-uniform: an address that already has an account is joined to the studio instead of created, one that is already a member is left untouched, and all of them answer `204`. There is no "already exists" response  -  the endpoint never reveals whether the address was known.  The account has no...
- Request body `application/json` (required): `{email: string:email}`
- Response 204: The address has an account and belongs to the studio. Empty body  -  no user id, and no signal wheth
- Error codes: 400: invalid_path_param; 404: studio_not_found; 422: validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/users`

- Summary: Get studio users  (operationId `getStudioUsers`, tag ['Studio users']); auth: bearer required
- Param `search` (query, optional): string. Case-insensitive substring match against `profile.name`, `profile.email` and `profile.phone`
- Param `roles` (query, optional): enum(member/staff/admin/owner)[]. Filter by `role`, serialized as a comma-separated string (e.g. `staff,admin,owner`)
- Param `pageSize` (query, optional): integer. 
- Param `pageIndex` (query, optional): integer. 
- Response 200 (`application/json`): `{data: {items: {userId: string:uuid, role: enum(member/staff/admin/owner), profile: object}[]}, links: {self: string:uri, next: string:uri|null, prev: string:uri|null}, meta: {pageIndex: integer, pageSize: integer, totalCount: integer|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 404: studio_not_found; 429: rate_limited; 500: internal

#### `PATCH /api/v1/studios/{studioId}/users`

- Summary: Update current user profile  (operationId `updateUserProfile`, tag ['User profile']); auth: bearer required
- Description: Deprecated  -  use `PATCH /api/v1/users/{userId}` instead. Updates the authenticated user’s profile (USR §3.2). RFC-7396 merge-patch: omit a key to leave it unchanged; `phone: null` clears the stored phone; `displayName`/`socialVisibility` are non-nullable. Writable set is `displayName`, `phone`, `socialVisibility`.
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Request body `application/json` (required): `{displayName?: string, phone?: string|null, socialVisibility?: enum(public/friends/hidden)}`
- Response 200 (`application/json`): `{data: {userId: string, displayName: string|null, email: string|null, phone: string|null, avatarUrl: string:uri|null, socialVisibility: enum(public/friends/hidden), studioRole: enum(member/staff/admin/owner)|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: user_not_found; 422: validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/users/{userId}`

- Summary: Get studio user  (operationId `getStudioUser`, tag ['Studio users']); auth: bearer required
- Response 200 (`application/json`): `{data: {userId: string:uuid, role: enum(member/staff/admin/owner), profile: {name: string|null, email: string:email, phone: string|null, avatarUrl: string:uri|null, socialVisibility: enum(public/friends/hidden)}}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied; 404: studio_not_found, user_not_found; 429: rate_limited; 500: internal

#### `POST /api/v1/studios/{studioId}/users/avatar`

- Summary: Upload current user avatar  (operationId `postUserAvatar`, tag ['User profile']); auth: bearer required
- Description: Deprecated  -  use `POST /api/v1/users/{userId}/avatar` instead.
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Request body `multipart/form-data` (required): `{file: string:binary}`
- Response 200 (`application/json`): `{data: {userId: string, displayName: string|null, email: string|null, phone: string|null, avatarUrl: string:uri|null, socialVisibility: enum(public/friends/hidden), studioRole: enum(member/staff/admin/owner)|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: user_not_found; 413: file_too_large; 422: unsupported_media_type, missing_file_part, validation_error; 500: internal

#### `GET /api/v1/studios/{studioId}/user-stats`

- Summary: Get current user class stats  (operationId `getUserStats`, tag ['User profile']); auth: bearer required
- Description: Class-activity stats for the authenticated user (USR §3.6): rolling/yearly/all-time counts and minutes, a fixed 12-week history, the current streak, and the last booking instant. Windows follow the server clock.
- Param `userId` (query, required): string. Target user. The literal `me`, the caller’s own user id, or  -  for a studio `owner`/`admin`/`staff`  -  another member’s id. Any other caller naming a foreign id → `403 not_authorized`; missing or malformed → `400 inval
- Response 200 (`application/json`): `{data: {classes30Days: {count: integer, minutes: integer}, classesThisYear: {count: integer, minutes: integer}, classesTotal: {count: integer, minutes: integer}, weeklyClasses: {weekStartDate: string:date, count: integer}[], streakWeeks: integer, lastBookingAt: string:date-time|null}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: user_not_found; 500: internal

#### `GET /api/v1/users/{userId}`

- Summary: Get user profile  (operationId `getUser`, tag ['User profile']); auth: bearer required
- Response 200 (`application/json`): `{data: {userId: string:uuid, name: string|null, email: string:email, phone: string|null, avatarUrl: string:uri|null, socialVisibility: enum(public/hidden/friends)}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported; 404: user_not_found; 500: internal

#### `PATCH /api/v1/users/{userId}`

- Summary: Update user profile  (operationId `updateUser`, tag ['User profile']); auth: bearer required
- Request body `application/json` (required): `{name?: string, phone?: string|null, socialVisibility?: enum(public/hidden/friends)}`
- Response 200 (`application/json`): `{data: {userId: string:uuid, name: string|null, email: string:email, phone: string|null, avatarUrl: string:uri|null, socialVisibility: enum(public/hidden/friends)}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied, api_key_not_supported; 404: user_not_found; 422: validation_error; 500: internal

#### `DELETE /api/v1/users/{userId}`

- Summary: Delete user profile  (operationId `deleteUser`, tag ['User profile']); auth: bearer required
- Description: Irreversibly deletes the global Mana user profile and account.
- Response 200 (`application/json`): `{data: {userId: string:uuid}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied, api_key_not_supported; 404: user_not_found; 409: has_active_membership, has_pending_payments, has_upcoming_bookings, has_studio_responsibilities, has_company_account_responsibilities; 500: internal

#### `POST /api/v1/users/{userId}/avatar`

- Summary: Update user profile avatar  (operationId `updateUserAvatar`, tag ['User profile']); auth: bearer required
- Request body `multipart/form-data` (required): `{file: (? | ? | ?)}`
- Response 200 (`application/json`): `{data: {userId: string:uuid, name: string|null, email: string:email, phone: string|null, avatarUrl: string:uri|null, socialVisibility: enum(public/hidden/friends)}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: permission_denied, api_key_not_supported; 404: user_not_found; 413: file_too_large; 422: unsupported_media_type, missing_file_part, validation_error; 500: internal

#### `POST /api/v1/studios/{studioId}/password-recovery-requests`

- Summary: Send a password-recovery email  (operationId `sendStudioPasswordRecoveryLink`, tag ['Auth']); auth: public (no `security` declared)
- Description: Sends a studio-branded password-recovery email for `email`, if it maps to an account. **Public** endpoint  -  no `Authorization` header (the caller is a logged-out user). Past validation, the studio guard, and the per-email throttle it always responds `204` with an empty body  -  **identical** for an existing vs a nonexistent email and whether or not delivery succeeded (account-enumeration is intentionally not possible). `studioId` selects branding + redirect only, never eligibility. Recovery is throttled per email (studio-independent); exceeding the throttle returns `429` with `Retry-After`.
- Request body `application/json` (required): `{email: string:email}`
- Response 204: Accepted. If `email` maps to an account a recovery email is sent (best-effort). Empty body; byte-ide
- Error codes: 400: invalid_path_param; 404: studio_not_found; 422: validation_error; 429: rate_limited; 500: internal

#### `POST /api/v1/studios/{studioId}/auth-code-requests`

- Summary: Request a sign-in code  (operationId `requestStudioAuthCode`, tag ['Auth']); auth: public (no `security` declared)
- Description: Emails a 6-digit one-time sign-in code to `email`. **Public** endpoint  -  no `Authorization` header (the caller is logged out).  This is **sign-in only**: `email` must already be a member of `{studioId}`. An address that is not gets `404 user_not_found`  -  create the account with `POST /studios/{studioId}/users` first, then call this. The `404` is identical for an address with no account anywhere and one with an account but no membership at this studio, so it tells you only whether this studio has that member.  **Verifying the code is client-direct against Supabase, not a mana endpoint**  -  call `verifyOtp({ email, token, type })` on your Supabase client so Supabase attributes brute-force...
- Request body `application/json` (required): `{email: string:email}`
- Response 204: A code was emailed to the member. Empty body  -  the OTP type is always `magiclink`, so nothing vari
- Error codes: 400: invalid_path_param; 404: studio_not_found, user_not_found; 422: validation_error; 429: rate_limited; 500: internal

#### `POST /api/v1/studios/{studioId}/web-session-handoffs`

- Summary: Create a web sign-in link  (operationId `createWebSessionHandoff`, tag ['Auth']); auth: bearer required
- Description: Mints a single-use link that signs the caller in on the web, so an app can open a web page with the user already signed in. Open `data.url` in a browser as-is. The browser gets its own session; the app session is unaffected.  `redirectTo` is where the user lands: a path or URL on this site. Anything else is `422`.  The link expires after one hour or on first use, and minting a new one  -  or requesting an email sign-in code  -  replaces the previous one. Only a user session may call this: API keys and OAuth-issued tokens are refused.
- Request body `application/json` (required): `{redirectTo: string}`
- Response 200 (`application/json`): `{data: {url: string:uri}}`
- Error codes: 400: invalid_path_param; 401: unauthorized; 403: api_key_not_supported, oauth_token_not_supported; 404: studio_not_found; 422: validation_error; 500: internal

#### `POST /api/v1/studios/{studioId}/check-in-qr-codes/lookup`

- Summary: Look up a check-in QR code  (operationId `lookupStudioCheckInQrCode`, tag ['Check-in QR codes']); auth: bearer required
- Description: Resolves the token of a scanned venue check-in poster (`https://<host>/s/{studioSlug}/qr/{token}`, or the legacy `/q/{token}`) to the venue it belongs to and the doors it selects. Writes nothing: checking in and unlocking (`POST …/gym-check-ins`, `POST …/door-access`) are separate requests. A POST only so the token, a door-scoped secret, stays out of URLs and logs; a retry repeats the read. Any signed-in caller may look up a code of the path studio  -  no studio role is required.
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. This operation acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected (`403 not_authorized`)  -  includ
- Request body `application/json` (required): `{token: string}`
- Response 200 (`application/json`): `{data: {venue: {id: string:uuid, name: string}, doors: {id: string, name: string}[]}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized; 404: studio_not_found, qr_code_not_found; 409: qr_code_deleted; 422: validation_error; 429: rate_limited; 500: internal

#### `POST /api/v1/studios/{studioId}/door-access`

- Summary: Unlock a door  (operationId `createStudioDoorAccess`, tag ['Door integration']); auth: bearer required
- Description: Unlocks a Kiion door for the authenticated caller (DAC §19.1). The client reads `doors[]` from the §1.4 door integration and POSTs the tapped door’s opaque `doorId`. Bearer-only, per-user; not a money/slot mutation  -  a retry re-issues the same unlock with no cumulative effect, bounded by a per-(user, door) throttle. Parakey-only studios have no Kiion row and receive `404 integration_not_found`.
- Param `userId` (query, required): string. Target user. The literal `me` or the caller’s own user id. The unlock acts on the authenticated caller and cannot be performed on anyone else’s behalf, so any other value is rejected with `403 permission_denied`  -  incl
- Request body `application/json` (required): `{doorId: string}`
- Response 200 (`application/json`): `{data: {attemptId: string}}`
- Error codes: 400: invalid_path_param, invalid_query_params; 401: unauthorized; 403: not_authorized, permission_denied; 404: studio_not_found, integration_not_found, door_not_found; 409: outside_unlock_hours, not_eligible; 422: validation_error; 429: rate_limited; 500: internal; 502: vendor_error

## 8. Webhooks and events

None found. Neither S2 nor S3 mentions webhooks, event subscriptions or callbacks (S3 searched for "webhook": no hits). Unknown whether any exist outside the sources. The only push-like items are `door-integration` and `web-session-handoffs` endpoints, which are not event feeds.

## 9. Versioning

- Path prefix `/api/v1`; spec `info.version` is `alpha`. S2 states alpha with "potential shape changes". No deprecation policy, changelog or version header is documented. Deprecated aliases are marked inline in S3 (section 4). `GET /studios/{studioId}/app/config` takes `platform` and `appVersion` and acts as an app kill-switch (mobile-app oriented).

## 10. Agent-specific guidance (S2)

- S2 is written for an AI coding agent working on behalf of a studio (tegen). Rules: keep the key out of any client code; do not ask the user to paste the key into the conversation; use `MANA_API_KEY` from gitignored `.env.local`; flag and revoke exposed keys; do not blindly retry non-deduplicated writes; follow `links.next` to completion; back off on 429.
- S2 points agents to the OpenAPI spec (S3) and the reference (S1) and gives the studio id so calls can be scoped. S3's bearerAuth text says full agent instructions live at `/s/{studioSlug}/agents/api.md`, so the doc is per studio; only the `tegen` one was read.

## 11. Discrepancies between sources

1. S1 could not be read as text (JS-rendered), so it cannot be compared directly; it is presumed to render S3.
2. S2 error list says 403 covers "not authorized or key not supported"; S3 distinguishes `not_authorized`, `api_key_not_supported`, `oauth_token_not_supported` and `permission_denied`. S2 omits 400, 409, 413 and the vendor 502 code (S2 lumps 500/502 as retryable; S3 lists 502 as `vendor_error`, with no retry guidance beyond S2).
3. S2 says `userId=me` is "rejected" without detail; S3 specifies `400` for query and `422` for body.
4. S2 says 403 for endpoints acting on the token holder; S3 gives the code `api_key_not_supported`.
5. S2 says keys give "full owner-level access"; S3 adds that no scopes exist (consistent, more explicit).
6. S2 says 500/502 are safe to retry, but S2 also warns writes are not deduplicated; the sources do not reconcile which writes are safe on 5xx (S3 marks only some as idempotent).
7. S2 describes a 404 for other-studio users as `user_not_found`; S3 lists it among 404 codes, consistent.

## 12. Open questions and gaps

- Numeric rate limits, `Retry-After` behavior on key requests (may be omitted), and per-key vs per-IP vs deployment-wide limits: not documented.
- Maximum `pageSize` and whether `pageIndex` is zero-based: not stated explicitly.
- No idempotency-key mechanism documented; dedupe for bookings, cancellations and checkouts is the caller's job.
- No webhooks or event feed documented.
- Meaning and issuance of OAuth tokens (`oauth_token_not_supported`): not documented in what was read.
- Sandbox or test environment: none mentioned. Only the single production deployment is listed in `servers`.
- Whether endpoints with no `security` in S3 (for example `POST /studios/{studioId}/users`) truly reject or ignore an Authorization header, and any abuse controls: not documented beyond the S3 text.
- Truncated schema detail in section 7: consult S3 for complete field lists and enums.
- Other studios' `/s/{slug}/agents/api.md` pages and any other docs under getmana.app were not read.
