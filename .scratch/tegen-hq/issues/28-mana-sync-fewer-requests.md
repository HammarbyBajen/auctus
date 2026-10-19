# 28: Mana sync with fewer requests

**What to build:** The nightly Mana sync reads every person's memberships one request at a time, so a full pass is about 1,300 to 1,800 requests and takes 20 to 33 minutes. Mana gives each key a budget of requests over a time window, and the sync spends most of it. Read only what can have changed, so the sync is faster and leaves room in the budget for everything else (Timmar, visits, purchases, an extra "Synka nu").

**Blocked by:** none

**Status:** built (2026-10-19), not yet seen in production: check the first partial night and the first Monday full pass

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

- [x] The findings above, written into this ticket (below, 2026-10-19)
- [x] A nightly sync makes clearly fewer requests, with the count recorded on each run (target changed by Max to about 40% fewer with the same accuracy; see below)
- [ ] The home page numbers and the Hör av dig till list stay the same as with a full pass (compare the first partial nights with the Monday full pass after them)
- [x] A full pass still runs on a schedule, so a change Mana does not signal is picked up within a week (the night to Monday, or when the last full pass is a week old)
- [x] Tests for which people are read on a partial night

**Findings (2026-10-19):**
- The sync makes about **475 requests** a night (5 pages of people, then one per person; 470 people), not the 1,300 to 1,800 first estimated from its run time. Runs took 12 to 33 minutes mostly because every database write crossed the Atlantic (functions in iad1, Neon in Frankfurt); since 2026-10-19 the app runs in fra1.
- On 2026-10-17 Mana refused after 47 people, after two full syncs (about 930 requests) in the 12 hours before. The budget may be around 1,000 requests a day; Mana does not document it. The same key is also used by lead pages (a lookup per view), the Timmar pull, visits, payments, the API watch, and local checks from Max's machine.
- `/users` carries no "changed at" and no membership data. `user-memberships` still needs a `userId`. `payment-transactions` can be read studio-wide by date (already fetched nightly for day passes); a cancellation or a freeze is not a payment.
- Of 470 people: 258 hold a current (active or future) membership, 203 never held one, 9 only ended ones.

**Decided by Max (2026-10-19):** about 40% fewer requests with the same accuracy (not ~70% with cancellations up to 3 days late); the full pass on the night to Monday; a lead page asks Mana about a person at most once a day.

**Built (2026-10-19):** a partial run reads memberships for everyone with a current membership, anyone new in Mana, and anyone who paid for anything or checked in or booked since the last run (visits and payments are now read before the member pass; if the payments cannot be read the run falls back to full). Each run records its mode and request count, shown under Inställningar → Mana. Expected: about 280 requests a night instead of 475.
