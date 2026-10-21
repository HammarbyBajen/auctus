# 32: Trial offer buyers in Mana become leads

**What to build:** Someone who buys a trial offer in the Mana app (Mana's kinds trial_offer_single_class, trial_offer_1_credit, trial_offer_3_credits) never fills in the website form, so they never become a lead. Make them leads, with their own source, so staff follow them up like a website lead.

**Blocked by:** none (shares the nightly payments read with 12 and 28)

**Status:** idea (2026-10-21)

**What we know:**
- The payments step already reads every payment since the last run; today only class_credits_bundle and single_class are kept (`dayPassKinds`), so trial offers are dropped.
- `GET /trial-offers` lists the studio's offers. Not yet checked whether Tegen has any switched on.

- [ ] Check whether Tegen sells trial offers in Mana, and how many were bought since the move
- [ ] A trial offer purchase makes a lead (or a note on an open lead), once per person
- [ ] Not tied to the win-back switch, unless Max decides otherwise
- [ ] Tests
