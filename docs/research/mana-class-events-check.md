# Mana class events: live check for the Salary (WFM) module

Checked 2026-10-08 against the public `GET /studios/{id}/class-events` endpoint (no key used). Read-only, a handful of calls.

## Findings

- **A full month fits in one request.** October 2026 returned 167 events in one page (`pageSize` 200, `totalCount` 167, no next link). A whole month is therefore one call, but the code must still follow `links.next` in case a month ever exceeds 200.
- **History starts at the migration.** September 2026 (40 events) and 1 to 7 October (38 events, including days already passed) returned fine. March 2026 returned `400 class_events_range_outside_allowed_window`. Max confirmed in Mana that the earliest visible classes are from 7 September 2026, when Tegen migrated from Wondr. So the refusal is most likely the start of Tegen's data, not a rolling window that hides older months. (Not fully proven: probes for June, August and December came back empty and were not retried.) September 7 onward is migration test data, and October is the first real month.
- **Real lengths are in the data.** Each event has `startsAt` and `endsAt`. October shows 60 minutes for every event except one Företagsklass of 120 minutes, so the hours must be computed from the timestamps and not assumed.
- **Instructor is a plain id, and the name comes from `instructors`.** All 167 October events had an instructor (21 distinct). The instructors endpoint lists 27 names (first names only, for example "Ludvig B", "Ludvig P"), which Fredrik links to People.
- **No cancel or status field exists on a class event.** The only related field is `cancellationCutoffAt`, which is the member-booking cutoff, not a cancelled flag. Max cannot find any class cancelled since September in Mana, so there is no known example to test. Erik will be asked. Until then, assume a cancelled class either disappears from the list or stays and looks normal, and show the pull time and the class list so Fredrik can spot one.
- **Class types seen in October:** CrossFit (111), CrossFit Basic (14), Företagsklass (9), Hyrox (8), Team (8), Olympic Weightlifting (5), Gymnastics (4), Kondition (4), Strength (4).
- **Not seen in the public list:** Tegenbutik, NSI, PT60 and Tegenmöte. Max can see NSI, PT60 and similar types in the Mana admin, and assumes they are internal or private classes that the API only returns with the key (Företagsklass did appear publicly, so visibility varies by class). Tegenmöte and Tegenbutik do not appear to be classes in Mana at all, which conflicts with the Notion note that shop work is a custom class called Tegenbutik. To be verified with the key.
- **Schedule categories** (public) are: All classes, CrossFit, Hyrox, OLY, Gymnastics, Conditioning, Strength, Team. They are not the same as class titles, so class type rules should key on the class title.

## Consequences for the module

1. The Salary (WFM) module should pull a month on demand and follow `links.next`, as planned.
2. Hours must come from `endsAt` minus `startsAt`.
3. The locked snapshot is still the permanent record, since Mana data may change and the module must not depend on it after the 15th.
4. Two things remain: how a cancelled class shows (Erik), and, with the key, whether NSI, PT60 and the other private types appear in `class-events` and where Tegenbutik and Tegenmöte are recorded.

## Key check (2026-10-08, with the studio API key, read-only)

- The key works and sees the same 167 October class events as the public call. It shows **no extra events**, so the key does not unlock hidden classes in `class-events`.
- `GET /classes` lists 15 classes: CrossFit, CrossFit Basic, Företagsklass, Goalreview/Inbody, Gymnastics, Hyrox, Kondition, NSI, Olympic Weightlifting, PT30, PT60, Strength, Team, **Tegenbutik** and **Tegenmöte**. So Tegenbutik and Tegenmöte **are** classes, as the Notion page says. But none of NSI, PT30, PT60, Tegenbutik, Tegenmöte or Goalreview/Inbody has a single scheduled event in September, October or November. Either nobody schedules them as class events yet, or Fredrik tracks that work elsewhere.
- **Personal training and Onramp are specialist services, not class events.** `GET /specialist-services` returns Onramp (30 min), Personlig Träning 30min and Personlig Träning 60min. `GET /specialist-service-bookings` returns 15 bookings (14 in October, 1 in September) with `instructorId`, `startsAt`, `endsAt` and a `status`: completed (6), booked (4), refunded (4), canceled (1). It also has `canceledAt`, `completedAt`, `noShowAt` and `refundedAt`. This is the only place where cancellations are visible.
- **Kids courses are a third source.** `GET /courses` lists 3 Tegen Kids courses (12 sessions each, 4 October to 20 December). `GET /course-events?courseId=...` returns each session with `instructorId`, `startsAt` and `endsAt`.
- So coaches' hours can come from three Mana sources: class events, specialist service bookings (PT, Onramp) and course events (Kids). The Notion page only mentions class events.
