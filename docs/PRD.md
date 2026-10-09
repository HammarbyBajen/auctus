# PRD: Tegen CRM

Status: draft v1, 2026-10-07, updated 2026-10-09 with Erik's notes on lead intake and the MRR KPI
Owner: Max (Lab37)
Sources: grilling session, [research/tegen.md](research/tegen.md), [research/mana-api.md](research/mana-api.md), [research/pipedrive.md](research/pipedrive.md), [questions-for-erik.md](questions-for-erik.md)

## Problem Statement

CrossFit Tegen's two owners, Fredrik and Timmy, follow up leads in Pipedrive every day. Pipedrive is a general B2B sales tool, and it knows nothing about the gym. Their members, memberships, bookings and payments live in Mana (they moved from Wondr in September 2026), so the owners cannot see in one place whether a lead became a member, who is drifting away, or who cancelled and could be won back.

Leads arrive through four routes in Lab37's `tegen-web` (`/api/contact`, `/api/qualification`, `/api/chat` and `/api/escalate`): the contact form, the qualification flow and the website chat bot. Each lead goes to five places: an email via Resend, Discord #tegen-leads, Notion (which LAB37's ad reporting counts leads from), Pipedrive (where Timmy works every day) and the Meta Conversions API (which feeds the ads). This is revenue-critical LAB37 code. The site promises contact within 24 hours, but nothing in the tools makes an overdue lead visible. Tegen pays for a tool shaped for a different business and still fills the gaps by hand.

## Solution

A small web CRM built for Tegen, on top of Mana. In v1 it does three jobs:

1. **Lead pipeline.** Leads arrive as a copy from `tegen-web`, move through Tegen's real sales steps, and the landing page always shows which leads need action first (overdue or close to the 24-hour promise, due tasks, stalled leads).
2. **Member link to Mana.** The CRM reads members, memberships and attendance from Mana (read-only). When a lead shows up as a Mana member, the lead is marked Won automatically.
3. **Retention.** From Mana data the CRM creates win-back leads (cancellations, freezes, ended memberships, day-pass buyers who never joined) and flags members who have stopped coming, so the owners can reach out personally.

A fourth, separate job is the **Salary (WFM) module**, kept apart from the lead and retention CRM and referred to by that name: coach salary hours. Fredrik counts every coach's hours from the Mana schedule by hand each month for salary reporting. The CRM does that count for him (names and hours only, no money).

**The CRM replaces nothing for now.** It becomes the sixth destination for leads, next to the five existing ones, which keep working unchanged, Pipedrive included. Whether and when it takes over from Pipedrive is decided at a review once the CRM has run on real leads ("Review where we land"). Until then it sends no notifications to Fredrik or Timmy, only to the project's own test channel. The product direction is a growth layer on top of Mana for gyms generally (leads, CRM, marketing, retention), but v1 is Tegen only.

On top of that, the landing page carries the gym's main KPI: **MRR from recurring memberships and the number of paying members, with their trend**, so the owners see at a glance whether paying members are growing.

## User Stories

### Receiving and finding leads
1. As an owner, I want every new lead from the contact form and chat bot (and anything entered manually) to appear in the CRM automatically, so that nothing depends on someone copying it.
2. As an owner, I want a repeat submission from the same person to be added to their existing lead instead of creating a second one, so that my list stays clean.
3. As an owner, I want leads matched by email first and then by the last 9 digits of the phone number, with the earliest lead winning, so that people who use different forms are recognised and the CRM counts leads the same way as LAB37's reports.
4. As an owner, I want to see where each lead came from (contact form, chat bot, Mana win-back, manual), so that I know which channels work.
5. As an owner, I want the ad campaign information stored on web leads (the attribution: UTM source and medium, campaign, and click ids such as gclid and fbclid, or the referring site, or direct), kept exactly as sent, so that I can later see which ads produce members.
6. As a staff member, I want to add a lead by hand (phone call, walk-in) and choose its source, so that every lead is in one place.
7. As an owner, I want to search leads by name, email or phone, so that I can find someone quickly when they call.
8. As an owner, I want to filter leads by stage, source, assignee and date, so that I can work through a specific group.
9. As an owner, I want to open a lead and see its full history (notes, tasks, stage changes, form submissions), so that I know what has already been said.
9b. As an owner, I want test leads (containing `test-lab37`, `ignorer` or `testlead`) marked as tests and kept out of the lists and counts, so that testing never looks like real demand.

### Working the pipeline
10. As an owner, I want leads to move through New lead, Contacted, Booked meeting, Booked test training, Consultation done, Price info, then Won or Cold, so that the CRM matches how Tegen actually sells.
11. As an owner, I want to move a lead between stages with one action, so that updating the CRM is fast enough to actually happen.
12. As an owner, I want to record a reason when I mark a lead Cold, so that I learn why people do not join.
13. As an owner, I want to add notes to a lead, so that we remember what was agreed on a call.
14. As an owner, I want to create a follow-up task on a lead with a due date, so that I am reminded to act.
15. As an owner, I want to optionally assign a lead to Fredrik or Timmy, so that we do not both call the same person.
16. As an owner, I want a lead assigned to someone else to stay visible to me but greyed out, so that I know it is handled without losing the overview, and unassigned leads to look normal to both of us.
16b. As an owner, I want this visibility rule to become a setting in a later version (for example hide, grey out or show normally), so that it can fit other gyms and team sizes.
17. As an owner, I want to reopen a Cold lead when they come back, so that their history is preserved.

### Landing page: what needs attention
19. As an owner, I want the first page after login to list the leads that need action most urgently, so that I can start my day there.
20. As an owner, I want new leads that have not been contacted to show in amber when less than 4 hours remain on the 24-hour promise and in red when it has passed, so that I never miss it.
21. As an owner, I want tasks that are due today or overdue on the landing page, so that follow-ups are not forgotten.
22. As an owner, I want leads stuck in one stage for 7 days without activity to be highlighted, so that they do not go stale.
23. As an owner, I want unhandled Mana win-back leads and members at risk surfaced here too, so that retention work gets noticed.
24. As an owner, I want to switch between "mine" and "all" on this page, so that I can focus on my own leads.
25. As an owner, I want a small row of counts (new this week, booked tests, won this month), so that I get a sense of how the month is going.
26. As an owner, I want to change the 24-hour, 4-hour and 7-day thresholds, so that the page matches our habits.
26b. As an owner, I want rules for weekends and days off (for example the 24-hour clock does not run on Sundays, or only counts opening days), so that a lead arriving on Saturday night is not shown as overdue unfairly.

### Mana: members and Won detection
27. As an owner, I want the CRM to show whether a lead is already a Mana member and which membership they hold, so that I do not pitch someone who has signed up.
28. As an owner, I want a lead to be moved to Won automatically when the person appears in Mana as a member, so that I do not update it twice.
29. As an owner, I want the Won lead to show the actual membership from Mana, so that conversion reports reflect real sign-ups.
30. As an owner, I want the sync to keep running quietly in the background and to show me when it last succeeded, so that I can trust the data.
31. As an owner, I want to be told on the screen when the Mana sync is failing, so that I do not act on stale data without knowing.

### Win-back leads from Mana
32. As an owner, I want a lead to be created when a member cancels or freezes a membership, so that I can reach out personally.
33. As an owner, I want leads created when a membership has ended or when someone bought a day pass or credits and never took a membership, so that interested people are not lost.
34. As an owner, I want each of these to have its own source label (Mana: cancelled, Mana: freeze, Mana: ended, Mana: day pass), so that I can see which type is worth following up.
35. As an owner, I want to be prompted to pick a reason when I handle a win-back lead, because Mana does not provide it. The reasons are editable and start with: injury, illness, moved away, found another gym and will not return, price, no time, other.
36. As an owner, I want no win-back lead created if the person is already an open lead or was recently dismissed, so that I am not nagged about the same person.

### Retention: members drifting away
37. As an owner, I want to see a short list of paying members with no check-in or class booking in 30 days, so that I can ask how they are doing.
38. As an owner, I want each at-risk member to become a task for me, so that it fits into my normal follow-up flow.
39. As an owner, I want to dismiss an at-risk alert with a reason, so that I do not see it again for something that is explained (holiday, injury).
40. As an owner, I want members on a freeze to be left out of alerts, so that I do not chase people who are away on purpose.
41. As an owner, I want to change the 30-day threshold, so that it can match our reality.
42. As an owner, I want a second rule later, flagging members whose visits in the last 30 days are less than half of their own 3-month average, so that I catch a slow drop-off and not only a full stop.
43. As an owner, I want these alerts to be visible only to staff and never shown to members, so that the feature does not feel like surveillance.

### Accounts and access
44. As an owner, I want to sign in with an email and password (or an email link), so that I can get in from my phone or the front desk without a Google account.
45. As an owner, I want to give a staff member access to leads without access to settings, so that the front desk can help without changing configuration.
46. As an owner, I want to deactivate a user, so that someone who leaves loses access immediately.

### Customisation
47. As an owner, I want to rename, reorder, add and remove pipeline stages, so that the CRM follows our process if it changes.
48. As an owner, I want to define the reasons used for Cold leads, so that reporting uses our words.
49. As an owner, I want to add custom fields to leads (for example goal, injury, interest), so that we can record what matters to us.

### Import, review and go-live
50. As an owner, I want the lead history read from the Tegen Notion lead database or Pipedrive (read-only, never written to) with notes, activities and stage where available, so that nothing in progress is lost.
51. As an owner, I want all historic leads imported, including the old cold ones, using the same test-lead and duplicate rules as new leads, so that the history is kept and the counts match LAB37's reports.
52. As an owner, I want the CRM to run alongside Pipedrive on real leads until a review decides where we land, so that nothing breaks for Timmy while we find out whether the CRM is better.

### KPI: MRR and paying members
66. As an owner, I want MRR from recurring memberships and the number of paying members at the top of the home page, so that I see at a glance whether the gym is growing.
67. As an owner, I want a trend line for both, back to September 2026 (when Tegen moved to Mana), so that I see the direction and not only today's number.
68. As an owner, I want new paying members and lost paying members this month next to the trend, so that the change can be explained.
69. As an owner, I want trainers (Staff) not to see MRR, so that revenue stays with the people who run the business.

### Reporting
53. As an owner, I want one report page with leads per source and month, conversion to Won, and average time to first contact, so that I can see whether we are doing better.

### Salary (WFM) module: coach hours
56. As an owner, I want a month's class events pulled from the Mana schedule on demand, close to the 15th when Mana's schedule is settled and cancelled classes are reflected, with their real start and end, so that hours are the actual length (a 30-minute class counts 30 minutes).
57. As an owner, I want a People list (name, linked Mana instructor, free classes per week, active from, notes), so that each coach's deal is recorded in one place.
58. As an owner, I want to mark each class type as paid or not paid (for example PT60, NSI, Tegenmöte and Företagsklass), so that the rules are mine to decide.
59. As an owner, I want coaches who coach one class a week for free in exchange for a membership to have those hours deducted, and paid only for classes beyond that, so that the list matches the deal.
60. As an owner, I want Tegenbutik (shop work, paid by the hour) never to count toward free classes, so that shop hours are always paid.
61. As an owner, I want a month view listing name, hours per class type, free hours and hours to pay, so that I can read the answer at a glance.
62. As an owner, I want a class with no instructor and a class type with no rule yet to be flagged, so that nothing is silently left out of the count.
63. As an owner, I want to lock a month and export names and hours for the accountant, so that the figures reported on the 15th cannot change afterwards.
64. As an owner, I want a week that spans two months to count free classes per week and book each class to the month it falls in, so that the monthly totals are consistent.
65. As an owner, I want this module visible to Owners only, because it concerns pay.

### Privacy
54. As an owner, I want to permanently delete a person and everything linked to them on request, so that we can honour a GDPR erasure request.
55. As an owner, I want leads that have been Cold with no activity for 24 months to be flagged for review, so that we do not keep personal data forever. Deletion always needs an owner to confirm.

## Implementation Decisions

### Design principles
- **Simple for people who are not very digital.** Fredrik and Timmy work physically and are not heavy computer users. Their routine is: see a new lead, send an email, phone the person, note what happened. The CRM is built around exactly that. Contact details are one click away (the phone number opens the dialler, the email address opens the mail app), logging what happened takes one tap, the landing page answers "who should I contact now", and there is little to fill in and no technical language. Swedish throughout. It works fine on a phone, but it is not a mobile-first product.

### Architecture
- **One CRM web app per gym.** v1 is deployed for Tegen only. The same codebase can later be deployed separately for other gyms, each with its own database and Mana key. A `studio_id` column is carried on core tables, and the Mana credentials, thresholds and branding are kept in settings and not in code, so that multi-tenant remains possible later. Multi-tenant is not built now.
- **Stack.** TypeScript, Next.js, Postgres. Swedish UI with strings kept in translation files, English code and docs. EU data residency. Sign-in with Better Auth (decided), with no Google sign-in (see Auth and roles).
- **Hosting.** Everything runs on Vercel: the web app, a Postgres database from the Vercel Marketplace (Neon, Supabase or Prisma Postgres, in an EU region such as Frankfurt, to be confirmed in the setup screen) and the background jobs. No office server is used, and the CRM gets its address from Vercel. The decision is recorded as an ADR.
- **Background jobs.** Vercel Cron triggers the Mana sync and the win-back and at-risk detection, and a Vercel Workflow splits long jobs into steps so a full pass (about one second per member) survives the function time limit and can retry. The project starts on Vercel's Hobby plan as a hobby project: cron jobs run once a day at an imprecise time, and a function or workflow step may run for at most 5 minutes. That is enough here, because the deadline and attention views are calculated when the page is opened (no cron needed), the Mana sync and detection jobs run daily, and an owner can also press "Sync now" or open a lead to refresh it on demand. Vercel's terms describe Hobby as non-commercial, so moving to Pro should be reconsidered before the CRM is relied on by Tegen's business. Only the background jobs hold the Mana key.
- **Sources of truth.** Mana is the source of truth for members, memberships, bookings and payments. For leads, `tegen-web` sends every lead to five destinations, and Notion is what LAB37's reports count from. The CRM is a sixth destination and the working system for the sales process: pipeline stage, notes, tasks, assignment and win-back and at-risk alerts. The CRM never writes to Mana, Notion or Pipedrive.
- **Lead pipe today.** `tegen-web` (LAB37 code, revenue-critical) takes leads on `/api/contact`, `/api/qualification`, `/api/chat` and `/api/escalate` and sends each to Resend email, Discord, Notion, Pipedrive and the Meta Conversions API. Erik adds one more step that POSTs each lead to the CRM. The CRM does not change `tegen-web`.

### Modules
- **Lead intake.** An HTTP endpoint that `tegen-web` POSTs every lead to, authenticated with a shared secret. Max gives Erik the URL and the secret. The body follows `contactPayloadSchema` and `qualificationPayloadSchema` from `tegen-web`'s `src/lib/qualification-schema.ts`. The attribution string (built by `formatAttribution` in `tegen-web`'s `src/lib/notion-leads.ts`: UTM as `source / medium`, then `kampanj:`, `gclid:`, `fbclid:` and so on joined with " · ", `ref: <host>` when only the referring site is known, `Direkt / okänd` for direct) is stored exactly as received and parsed into fields, never cleaned up, and click ids are never shortened. Leads containing `test-lab37`, `ignorer` or `testlead` are flagged as tests and left out of lists and counts. Duplicates match on email first, then the last 9 digits of the phone, and the earliest lead wins, the same rules as LAB37's reports. A retry of the same lead never creates a second one. The endpoint must be reachable despite Vercel's Deployment Protection (a bypass for this path, or protection off for production). It sends no notifications to Fredrik or Timmy: only to the project's own test channel until the review. Never test it with a real lead, only throwaway records.
- **Pipeline.** Stages (ordered, editable), lead state, stage history, Cold reasons, tasks, notes, assignment (optional).
- **Attention engine.** Computes the landing-page priority list from deadlines, due tasks, stalled leads, unhandled win-backs and at-risk alerts. Thresholds and weekend or day-off rules (which days the deadline clock runs) come from settings. Assigned-to-someone-else leads are shown greyed out for the other owner.
- **Mana API change watch.** Mana's API is alpha. A daily job fetches the public OpenAPI spec and documentation, compares it with the last copy and alerts Max and the owners when it changes, so the adapter's contract tests are updated before the sync breaks.
- **Mana adapter.** A single module that wraps the Mana API (users, memberships, user-memberships, gym check-ins, class bookings, membership catalogue). It handles pagination by following `links.next`, backs off on 429, never blindly retries writes (it has none), and hides Mana's field names behind CRM concepts so the alpha API can change in one place.
- **Sync.** Pulls Mana data on a gentle schedule into local tables (members, memberships, visits). Runs incrementally where Mana allows and tracks last success per job. Mana has no webhooks, and its rate limit is about one request per second per gym (about 3,600 an hour), so the worker throttles itself to stay under one request per second with some margin. The user-memberships endpoint is per member, so a full pass over N members takes about N seconds. Syncs are incremental where possible and spread over time, and the numbers are measured before they are tightened.
- **Win-back detection.** Creates a lead when a membership gains a pending cancel or freeze, ends, or when a day pass or credit pack buyer has no membership. Each type has its own source. Skips people who are already open leads or were recently dismissed.
- **At-risk detection.** Rule 1: an active paying member with no check-in or class booking in the last 30 days, excluding members on a freeze. Rule 2 (added once about 3 months of history exists, since Mana data starts in September 2026): last-30-day visits below 50 percent of the member's own 3-month average. Each alert creates a task and can be dismissed with a reason.
- **Won detection.** When a lead's email or phone matches a Mana member with an active membership, the lead moves to Won and shows the actual membership.
- **Auth and roles.** Better Auth (decided) with email and password or email link, stored in the CRM's own EU database. Clerk was rejected because it hosts user data in the US only. Roles in v1 are fixed: Owner (everything, including settings, users, thresholds, stages and fields) and Staff (leads and tasks, no settings). Roles are fixed and not editable, and there are no per-person permission overrides in v1. Only Owners see the Salary (WFM) module. A role editor and per-person permissions are deferred. Better Auth's access control supports adding them later.
- **Settings.** Stages, Cold reasons, custom fields, thresholds, Mana connection, users.
- **Import.** A one-off, rerunnable script that reads historic leads from the Tegen Notion lead database or Pipedrive, read-only (never writing to either), with notes, activities and stage where the source has them. It applies the same test-lead and duplicate rules as the intake, so the counts match LAB37's reports. The 573 Pipedrive leads (526 of them old and cold) are the known volume.
- **Salary (WFM) module.** A separate module from the CRM. It pulls a chosen month of coach work from three Mana sources on demand: class events, specialist service bookings (personal training and Onramp, which carry a status such as completed, booked, canceled or refunded) and Kids course events. Each has an instructor, a start and an end. The month view has a Refresh action and shows the last-pulled time. It is meant to be run close to the 15th, after the month has ended, because class data in Mana may not be up to date until then and cancelled classes must be reflected. No continuous daily sync is needed. Locking stores a frozen snapshot, so a locked month does not depend on Mana afterwards. A People list links each coach to a Mana instructor and holds free classes per week, active-from date and notes. A class-type rule table marks each type paid or not paid. The monthly calculation takes real minutes per event, applies each person's free classes per week (counted per week and booked to the month each class falls in, Tegenbutik excluded), and returns per person: hours per class type, free hours and hours to pay. Classes with no instructor and class types with no rule are flagged. A month can be locked (frozen snapshot) and exported as names and hours. No money is calculated. September 2026 is migration test data, and October 2026 is the first real month. Owners only.
- **KPI: MRR and paying members.** MRR is the sum of the monthly price of every active recurring membership with a price above 0, using the price that applies today (a discount period lowers it). Frozen memberships do not count (decided by Erik, 2026-10-08). A paying member is a person with at least one such membership. 0 kr memberships (coach deals, staff) do not count. MRR is what members are signed up to pay, not what was collected: failed card charges do not show up in the Mana API. The source is the Mana membership mirror, which already includes ended memberships (without them the count only ever goes up, a known bug in Bionic HQ). The mirror must also keep each membership's price periods, since they hold discounts and freezes. Mana keeps no history, so one snapshot is stored per day from the day this is built, and the months back to September 2026 are rebuilt from start, end and price-period dates (before September Tegen was on Wondr). Next to the trend: new and lost paying members this month. Visible to Owners only, not to Staff (trainers). Today's numbers are checked against Mana by hand before it is trusted. Bionic HQ's `src/lib/members/paying.ts` is the reference.
- **Reporting.** One page with leads per source and month, conversion to Won and average time to first contact. UTM and landing page data are stored from day one so source-to-member reports are possible later.
- **Privacy tools.** Hard delete of a person and linked data, and a review list for 24-month inactive Cold leads.

### Data model (concepts only)
- Person (name, email, phone, link to the Mana person), Lead (person, stage, source, assignee, attribution kept as sent plus parsed UTM and click ids, test flag, custom fields, Cold reason), Lead submission (raw payload, timestamp, sender's lead id), Stage, Task, Note, Stage history, Alert (win-back or at-risk, status, dismissal reason), Mana member (mirrored), Mana membership (mirrored, with price periods), Visit (mirrored check-in or booking), KPI snapshot (one per day: MRR and paying members), Sync run, User, Settings. All carry `studio_id`.

### Mana API constraints that shape the design
- Auth is a single studio API key with no scopes (full owner access), shown once on creation, already issued to Lab37 (created by a Mana owner). It must only exist in the worker's environment, never in browser code or logs.
- The API is alpha, has no sandbox, no webhooks, and a rate limit of about one request per second per gym.
- Cancellation or freeze is visible (pending change and end dates), but the reason is not. Reasons are typed in by staff.
- Memberships do not have a lead concept, and prospects do not exist as Mana users: a person only appears in Mana after signing up or buying something. A lead therefore has no Mana record until it converts, and matching a lead to a member (by email, then phone) can only happen after sign-up or purchase. Day-pass and credit buyers do appear as users, which is what makes those win-back leads possible.

### Privacy and GDPR (assumptions, to be confirmed)
- Tegen is the data controller, Lab37 the processor. A data processing agreement must be in place before real data is loaded.
- Retention. Cold leads with no activity for 24 months are flagged for review, and a delete function exists for erasure requests. Importing the old cold leads makes this review list large from day one, so the owners should look at it early.
- At-risk alerts use members' own attendance data for retention under legitimate interest. This must be stated in Tegen's privacy policy, staff-only, never used to message members automatically, and a short written assessment is kept.
- EU hosting only, and the Mana key is restricted to the background jobs. Backups are not requested for now, but the database provider's built-in restore features should be switched on, and Notion plus Pipedrive still hold the leads.

### Deliberate non-decisions
- The pipeline's exact stage names are those agreed in the grilling and are editable.
- The tech choices are recommended and not yet verified in a running setup (database region and the Hobby limits on cron and workflow are to be confirmed).

## Testing Decisions

- **What a good test looks like.** Tests check behaviour that an owner would notice (a lead appears, a lead turns Won, an alert is created, an overdue lead is first on the page). They do not check how functions are wired.
- **Highest seam.** The lead-intake endpoint and the Mana adapter. Intake is tested with real-shaped payloads, and the Mana adapter is tested against recorded Mana responses (no live key in tests). Everything inside, including matching, stages, detection and the attention list, is exercised through these two edges plus the database.
- **Modules to test.** Matching and duplicate handling, stage transitions, the attention list ordering and thresholds, win-back creation rules (including no duplicates and recent dismissals), at-risk rules (30-day rule, freeze exclusion, the later 50 percent rule), Won detection, import idempotency, role permissions, and hard delete.
- **Mana sync.** Contract-style tests that fail loudly if Mana's response shape changes, because the API is alpha.
- **Prior art.** None yet, this is a new project.

Per the to-spec method, please confirm that these two seams are the ones you expect before implementation starts.

## Out of Scope (v1)

- Email or SMS automation and campaign tools (planned for a later phase, with a provider, consent handling and Swedish marketing rules).
- Any writing to Mana.
- A member-facing portal.
- Bookings or a calendar inside the CRM (follow-up is tasks with due dates).
- Replacing or syncing Mailchimp.
- A full reporting module.
- Any salary or money calculation (the Salary (WFM) module only produces names and hours).
- Importing any Wondr history.
- A shared knowledge base for the chat agent, the reply file and the Mana guide.
- Multi-tenant (several gyms in one app).
- Sending new-lead notifications to Fredrik or Timmy from the CRM before the review (`tegen-web` keeps doing this through email and Discord).
- Changing `tegen-web`, Notion or Pipedrive in any way.

## Open Questions

Tracked in [questions-for-erik.md](questions-for-erik.md).

1. **Intake payload.** Access to `tegen-web`'s `contactPayloadSchema`, `qualificationPayloadSchema` and `formatAttribution` (the repository, or copies of the three). It blocks lead intake.
2. **Test channel.** Which channel is "our own test channel" for notifications until the review (for example a Discord channel only Max sees).
3. **MRR reference.** Access to Bionic HQ's `src/lib/members/paying.ts`, read as reference.
4. **MRR edge cases.** Whether recurring add-ons with a price, such as Förvaringsbox, count in MRR and make someone a paying member. How Mana shows a membership that is frozen today (probably a price period with `disableMembership`), to be checked against the API.
5. Whether Mana has webhooks or exports, and whether a daily request limit exists beyond the known one request per second. Mana has no contact and no sandbox, so the CRM is tested read-only against the live studio and with recorded responses, and the Mana documentation and OpenAPI spec are checked daily for changes.
6. The data processing agreement and the privacy policy wording for attendance-based alerts.
7. The exact meaning of Mana's ended memberships and day-pass data, to be validated against the live API.
8. Salary (WFM) module: how coaches' hours for NSI, PT30, PT60, Tegenbutik and Tegenmöte are recorded (they exist as classes but have no scheduled events), and which PT and Onramp booking statuses count as worked (Max asks Fredrik or Timmy).

## Further Notes

- **Milestones (suggested).** M1 Foundations (login, roles, stages, manual leads, tasks, landing page). M2 Intake (endpoint for `tegen-web`, duplicate and test-lead rules, attribution). M3 Mana (sync, membership display, Won detection). M4 Import, then "Review where we land" with Erik (only after that do notifications and accounts go to Fredrik and Timmy, and is Pipedrive's future decided). M0 (any time): daily Mana API change watch. M5 Retention (win-back leads, at-risk Rule 1). M6 Reporting and polish. M2b KPI: MRR and paying members on the home page. M7 Salary (WFM) module (can be built any time after ticket 10, since it only needs the Mana connection; no deadline, and Erik decides whether to aim for the 15th). Rule 2 and automation follow later.
- **Why not off-the-shelf.** Gym CRMs exist, but the point is a thin layer fitted to Tegen's process and to Mana, which Lab37 can extend into a product.
- **Recommended skills for the build phase** (not installed): `anthropics/skills@frontend-design`, `vercel-labs/agent-skills@web-design-guidelines`, `mattpocock/skills@domain-modeling`, `wshobson/agents@architecture-decision-records`.
