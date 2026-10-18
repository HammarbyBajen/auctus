# 28: Mana sync with fewer requests

**What to build:** The nightly Mana sync reads every person's memberships one request at a time, so a full pass is about 1,300 to 1,800 requests and takes 20 to 33 minutes. Mana gives each key a budget of requests over a time window, and the sync spends most of it. Read only what can have changed, so the sync is faster and leaves room in the budget for everything else (Timmar, visits, purchases, an extra "Synka nu").

**Blocked by:** none

**Status:** not started (written 2026-10-18)

**Why now:** on 2026-10-17 the nightly sync failed with 429 after an extra full sync had run twelve hours earlier (2026-10-16, after the Pipedrive swap). Since 2026-10-18 a sync waits out the budget instead of failing (pauses of 15 minutes, up to two hours), which treats the symptom; this ticket is the cause.

**What we know:**
- `GET /user-memberships` still needs a `userId` (checked against Mana's spec on 2026-10-15), so there is no studio-wide read of memberships.
- Mana's spec does not say how big the budget is or how long the window is. A spent budget can answer 401 with no Retry-After (LABBETS FEATURE REQUESTS, item 4).
- Most people do not change from one night to the next. Changes show up elsewhere first: payments (`payment-transactions`), bookings and gym check-ins, which we already read cheaply in pages.

**To find out first:**
- Whether the people list (`/users`) or any paged endpoint carries something like `updatedAt` that tells which people changed.
- Which of the people we read have never held a membership (staff aside), and so could be read far less often.
- Roughly how big the budget is: count the requests a sync makes (`requestCount` on the client) and note when Mana starts refusing.

**Possible approach (to confirm with the findings):** each night, read memberships only for people with an active or pending membership, anyone with a payment, booking or check-in since the last sync, and anyone new on the people list; read everyone once a week, on a quiet night, so nothing drifts.

- [ ] The findings above, written into this ticket
- [ ] A nightly sync makes clearly fewer requests (target: under a quarter of today's), with the count recorded on each run
- [ ] The home page numbers and the Hör av dig till list stay the same as with a full pass (compare one night side by side)
- [ ] A full pass still runs on a schedule, so a change Mana does not signal is picked up within a week
- [ ] Tests for which people are read on a partial night
