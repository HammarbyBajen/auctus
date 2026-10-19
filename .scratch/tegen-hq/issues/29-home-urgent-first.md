# 29: Home: what is urgent first, the rest quiet

**What to build:** The home page lists every lead that needs attention in one list, so nothing stands out (25 on 2026-10-19). Split it by urgency, rank by how close a lead is to joining, let staff park a lead that is waiting on the lead, and judge "stalled" per stage.

**Blocked by:** none. Matters most from go-live (18); until then Fredrik and Timmy work leads in Pipedrive, so Tegen HQ cannot see what they did and most of the list is leads they are handling there.

**Status:** not started (designed with Max 2026-10-19)

**What we saw (2026-10-19, production):** 25 leads: 8 first contact overdue (5 imported still at Ny lead, 3 new from the website), 17 stalled (imported leads in later stages with no activity or task in Tegen HQ). 22 of the 25 came from the Pipedrive import, 15 older than a month.

**Decided by Max (2026-10-19):**
1. **Two groups.** "Nu" at the top: first contact overdue or due soon, and tasks overdue or due today, as today. Below it, quieter: leads without a next step (stalled, and win-backs with no known reason), at most 5, then "Visa alla".
2. **Order within a group:** by urgency as today; when equal, closest to joining first (later stage), then newest.
3. **Parking a lead ("Vänta till").** Leads are mostly left because the lead asked to wait or staff are waiting for a reply. "Vänta till" on a lead takes a date (quick picks 1 week, 2 weeks, 1 month, or a day) and a short why; it creates a follow-up task for that day with the note, so the lead counts as handled until then and shows in tasks. Logging a call or an email already resets the stalled clock.
4. **Stalled per stage.** Each open stage has its own limit, editable by owners with the stages. Suggested defaults, to check with Fredrik and Timmy: Kontaktad 3 days, Prisinfo 5, Konsultation klar 5, Bokat möte 3, Bokad provträning 3, Avbokat möte 2; any other open stage 7 (today's single limit).

- [ ] Home shows "Nu" and the quieter group separately; the quieter group shows 5 and "Visa alla"
- [ ] Ties are broken by stage (closest to joining first), then newest; covered by tests
- [ ] "Vänta till" on the lead page creates a dated follow-up task with the note; the lead leaves Home until that day
- [ ] Each open stage has a stalled limit under Inställningar, with the defaults above; a lead is stalled by its own stage's limit
- [ ] Mina and Alla still work as today; "Visa alla" keeps the chosen scope
- [ ] Copy written or approved by Max

Not in this ticket: lead scoring from the qualification answers or ad source (could rank website leads later), and automatic "waiting for reply" timers beyond the stalled clock.
