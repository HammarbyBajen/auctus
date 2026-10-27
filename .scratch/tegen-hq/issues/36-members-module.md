# 36: Members: a module of its own, with a summary on Home

**What to build:** A members page (its own place in the menu) that gathers every member who needs a word from staff, in groups that can be filtered: Aldrig incheckade and Slutade komma (ticket 13), Tränar mindre (19), Nya medlemmar (34) and Milstolpar (35). Home shows a short summary instead of today's full Hör av dig till list: a count per group, each linking to the members page filtered to that group, so an owner sees the state of the members at a glance.

**Blocked by:** 13 (built). The groups from 19, 34 and 35 are added as those tickets are built.

**Status:** done (2026-10-27, Max)

**Why:** from Max's meeting with Erik (2026-10-21): "missing" members, by the fixed rule and by a drop in activity, belong in their own module where different groups can be filtered, and should show up on Home as a summary for the owner. Members stay out of the sales pipeline (Max's call for 13).

**Decided by Max (2026-10-21):** Home shows the summary only, with counts per group linking to the members page; the list itself moves there.

**Decided by Max (2026-10-21):** the page is called Medlemmar. On phones it takes Ny lead's place in the bottom bar (Hem, Leads, Medlemmar, Timmar, Inställningar); Ny lead is reached from the Leads page, whose button now shows on phones too.

**Built (2026-10-21):** /medlemmar with today's list moved unchanged (Mina/Alla, groups, Fördela, Ring, E-post, Logga kontakt, Avfärda, notes); its links and filters use the page's own address (?visa=mina&grupp=aldrig|borta&alla=1). Home shows a "Hör av dig till" card under the key numbers with a count per group that has anyone (following Mina/Alla), each linking to the filtered page, and "Öppna Medlemmar". The card is hidden when nobody is on the list. Page header buttons now wrap at phone width instead of running past the edge (every page).

- [x] A members page in the menu, with today's Hör av dig till list (Ring, E-post, Logga kontakt, Avfärda, Tillbaka senast, notes, Fördela) moved there unchanged
- [x] Filters per group, and Mina / Alla as on Home
- [x] Home shows a count per group, each a link to the filtered page
- [x] Groups from 34 and 35 slot in (19 adds its own group when it is built, January)
- [x] Tests (the existing at-risk tests; the page was tried on localhost with made-up members)
