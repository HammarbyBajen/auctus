# 12: Win-back leads from Mana

**What to build:** Cancellations, freezes, ended memberships and day-pass or credit buyers without a membership create leads automatically, each with its own source. Staff pick a reason when they handle one.

**Blocked by:** 10, 03

**Status:** done

- [x] Detection runs once a day (Hobby cron)
- [x] Each trigger creates a lead with its own source (cancelled, freeze, ended, day pass)
- [x] No new lead is created for a person who is already an open lead or was recently dismissed
- [x] Handling a win-back lead prompts for a reason from an editable list (injury, illness, moved away, found another gym, price, no time, other)
- [x] Unhandled win-back leads appear on the landing page
- [x] Rules are covered by tests

## Rules decided while building

- Off by default: an owner switches it on under Inställningar, Koppling till Mana, "Leads från Mana". The backlog (current pending cancellations and freezes, memberships ended in the last 30 days, day-pass buyers from the last 30 days) becomes leads after the next sync.
- Cancelled: an active membership with a cancellation scheduled, unless the person has another membership that carries on (a plan switch is not leaving). The end day comes from the scheduled cancel. Mana's `cancelEffectiveDate` is only the notice date and is never used as an end date.
- Freeze: an active membership with a freeze scheduled.
- Ended: ended in the last 30 days, with nothing that carries on.
- Day pass: a paid day pass, clip card or drop-in class (`class_credits_bundle`, `single_class`) in the last 30 days, by someone with no membership. A new prospect, so no "why did they leave" prompt.
- Each signal becomes a lead once (recorded in `mana_signal`), even after the lead is closed. A person who is already an open lead gets a note instead. A person moved to a cold stage in the last 90 days is left alone.
- Add-ons: memberships marked as an add-on on the Mana page (Förvaringsbox, set in production on 2026-10-09) do not keep someone "in". Someone who cancels their gym membership but keeps a locker still gets a win-back lead. Lockers still count as a membership for Won and MRR.
