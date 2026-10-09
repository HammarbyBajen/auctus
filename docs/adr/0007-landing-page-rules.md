# 0007: How the landing page decides what needs attention

Status: accepted, 2026-10-09

## Decision
The home page is built from one pure function (`buildAttention` in `src/lib/home/attention.ts`) that takes leads, open tasks, the current time and the thresholds, and returns the ordered list. The database code only loads the data.

## Rules
- **Uncontacted:** a lead still in the first stage has `firstContactHours` (24) from the moment it arrived. Amber at `warnHoursBeforeDeadline` (4) hours or less, red once the time has passed.
- **Tasks:** open tasks due today (amber) or earlier (red).
- **Stalled:** a lead past the first stage with no activity for `stalledDays` (7) and no open task. A lead with an open task counts as handled, even if the task is far ahead. Creating or finishing a task counts as activity.
- **Never shown:** won and cold leads.
- **Order:** overdue first contact, overdue task, amber first contact, task due today, stalled, then new leads with plenty of time. Within a kind, the most overdue (or closest to the limit) comes first.
- **One row per lead:** a lead with several reasons shows once, under its most urgent one, with all the reasons listed.
- **Mine or all:** "mine" keeps leads assigned to me and unassigned leads. "all" keeps everything, with other people's leads greyed out.
- **Counts:** new this week (since Monday 00:00), booked test trainings (current stage), and new members this month (moves to a won stage since the 1st).

## Time zone
"Today", "this week" and "this month" follow Tegen's calendar in Europe/Stockholm, including the days the clocks change.

Timestamps in the database are stored without a time zone. The application writes and reads them as UTC, and the database writes "now" (the default for created-at columns) in its own zone. They only agree when **the database runs in UTC**, which Neon and the CI database do. A local database in another zone (for example Europe/Stockholm) makes new leads look hours in the future. A test (`tests/timezone.integration.test.ts`) fails loudly if the database is not in UTC. For a local database, run `ALTER DATABASE tegen_crm SET timezone TO 'UTC';`. Moving the columns to `timestamptz` is the longer-term fix if that assumption ever has to change.

## Not yet
Weekend and day-off rules for the 24-hour clock, and editable thresholds, come with ticket 06. The thresholds already come from the studio's settings, with defaults. Mana win-back leads and at-risk members join the list with tickets 12 and 13.
