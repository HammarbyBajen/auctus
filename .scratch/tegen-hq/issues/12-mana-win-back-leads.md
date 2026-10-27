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

Changed by Max (2026-10-26), after the first night made 31 leads in Ny lead: members who give notice or plan a freeze are still members, so they no longer become leads but go on the Medlemmar list as "Säger upp" and "Fryser" (with the last day or the freeze date; Avfärda asks why, from the studio's win-back reasons; a row closes by itself when the notice or freeze is gone, and comes back only if its date changes). Ended memberships, day passes and klippkort still become leads, now in their own first column "Från Mana" with no first-contact deadline; on Home they show only when a task is due, plus a line with how many wait in the column, and they no longer count in "Nya den här veckan".


Tidied in production (2026-10-26, approved by Max): the 15 untouched ended and day-pass leads from that night moved to "Från Mana"; the 16 untouched notice and freeze leads (no events, tasks, owner or added notes) were deleted, the people kept, and the same 16 now show under Medlemmar as "Säger upp" and "Fryser". Four Handbok guides were updated to match (Svara på en ny lead, Leads från Mana, Medlemmar: hör av dig till, Assistenten).

Moved by Max (2026-10-27): "Remove Mana from Leads module." Mana makes no leads at all now. Ended memberships, day passes and klippkort go on the Medlemmar list as "Har slutat", "Dagpass" and "Klippkort" (at_risk_alert.cause ended, day_pass, klippkort), each with what Mana showed as its first note (at_risk_note kind "mana"); handled once per signal as before (mana_signal); one open row per member and kind, and one per buyer (a Dagpass row becomes a Klippkort row when the card runs low); closed by itself when the person holds a membership again. Someone who is an open lead still gets a note on their lead (and for a klippkort, a task); one dismissed as a lead in the last 90 days is left alone (not for a klippkort). Avfärda asks why, from the studio's win-back reasons ("Varför slutar eller pausar de?" / "Varför blir de inte medlem?"). Staff add a lead by hand when someone wants to talk membership. Removed from Leads: the Från Mana column, Home's line about it, the "Varför slutade de?" panel and its Home reason, and the hand-picked source "Mana, vill vi vinna tillbaka". The existing Mana leads were moved to Medlemmar with their notes, logged contacts, tasks (as notes) and owner (.scratch/tegen-hq/move-mana-leads.ts); people were kept. lead.win_back_reason is unused now, to be dropped. The owners' facts now count only those away as "away", and tally why people left from Medlemmar.
