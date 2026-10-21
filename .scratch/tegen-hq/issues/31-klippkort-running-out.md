# 31: Klippkort running out: offer a membership

**What to build:** When someone without a membership is close to the end of their klippkort, staff get a nudge to call them about a membership, while they are still coming. Today nothing happens when the klipp run out; the person either buys another card, or drifts away.

**Blocked by:** none

**Status:** live (2026-10-21); works once Max switches on leads from Mana

**Why:** a klippkort buyer already trains at Tegen and pays for it; they are the warmest people there are for a membership. Raised by Max on 2026-10-21 from Mana's new vouchers endpoint.

**What we know (2026-10-21, production):**
- Tegen sells "Klippkort" in Mana as a class credit bundle: 10 classes, 2 400 kr, valid a year. Also "Tegen Day Pass" (1 credit, 250 kr) and two personal training products (1 credit each), all class credit bundles. One voucher exists in Mana (the new vouchers endpoint, 2026-10-21).
- Since the move to Mana: 4 people bought a Klippkort, 1 a Day Pass, 3 a single class. One Klippkort holder had 5 left after about four weeks.
- `GET /class-credits?userId=` gives a person's balance and expiry date (one request per person); `class-credit-transactions` gives purchases and spends with the balance after each. The balance is one pool per person: credits from different bundles add up.
- Win-back (ticket 12) already makes a "day pass" lead when a person without a membership buys credits or a class, once per person. It is switched off in production (2026-10-21), so none of these 8 people became leads.
- Because a Klippkort is valid a year, "running out" will nearly always come before "expiring".

**Decided by Max (2026-10-21):**
- The nudge comes at 2 klipp left (or when a card with klipp left expires within 14 days).
- It is a task, due the same day. A task belongs to a lead: on the person's open lead if there is one, otherwise on a new lead with source "Mana: klippkort snart slut".
- Owners pick which Mana products are klippkort (Inställningar → Mana → Klippkort). Until they pick: products with 5 or more classes, which today is Klippkort only.
- It follows the win-back switch, and Max switches win-back on himself. A dry run on 2026-10-21 said the first night would make up to 31 leads: 9 cancellations, 7 freezes, 9 ended memberships, 6 drop-in or klippkort buyers.

**Built (2026-10-21):**
- Each night, after the member pass: Mana's product list (1 request), then, with win-back on, what each klippkort holder without a membership has left (1 request each, at most 60 a night). A card that was empty at the last read is not read again until the person buys another.
- The nudge goes through win-back, once per card bought, with a note ("Mana: 2 klipp kvar på Klippkort (köpt 26 sep.). Inget medlemskap.") and a task ("Erbjud medlemskap: 2 klipp kvar"). Unlike the other win-back signals, it does not skip someone dismissed in the last 90 days: they still train and pay.
- Klippkort purchases are kept 400 days (a card is valid a year); drop-ins still 60.
- New: table mana_credit_balance, studio_settings.mana_credit_bundles and klippkort_bundle_ids (migration 0029).

- [x] People holding class credits without a current membership are read nightly (one request each), within the Mana budget
- [x] A nudge when the balance reaches the threshold, once per card bought
- [x] A task on their open lead or a new Klippkort lead, with the balance, the product and when it was bought
- [x] Tests with a balance going down over nights
- [x] Migration 0029 run in production (Max), copy approved (Max), then pushed
