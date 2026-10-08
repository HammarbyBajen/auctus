# CrossFit Tegen: research notes

Research date: 2026-10-07. Primary sources only: the studio's own website pages and its own Mana API docs (already captured in `mana-api.md`, not re-fetched here).

Method note: pages were read with WebFetch (summarised by a small model) plus raw `curl` of `/go?start=1` and `/medlem` to inspect embedded scripts and strings. Where a claim comes only from a summarised fetch, treat wording as approximate. Nothing was submitted to any form.

Sources:
- [T1] https://crossfittegen.se/ (home)
- [T2] https://crossfittegen.se/medlem
- [T3] https://crossfittegen.se/schema
- [T4] https://crossfittegen.se/go?start=1 (consultation page)
- [T5] https://crossfittegen.se/kontakt
- [T6] https://crossfittegen.se/om-oss
- [T7] https://crossfittegen.se/traning
- [M] https://www.getmana.app/s/tegen/agents/api.md (via `mana-api.md`)

## 1. What the business is

- CrossFit gym in Solna Centrum, founded 2012; CrossFit, Hyrox, personal training, group classes, 24/7 open gym for members. (T1, T6)
- Address: Solna Torg 1, 171 45 Solna. Phone 08-27 70 24. Email info@crossfittegen.se. (T1, T5)
- Rating shown: 4.8/5 from 97 Google reviews. (T1, T4)
- Co-owners named Fredrik and Timmy, who also coach; over 25 coaches and staff; three facilities (named Fran for strength, Murph for group classes, Helen for retail/cafe); TegenRehab (chiropractic) mentioned. (T6)
- Shop and health cafe on site (smoothies, bowls, coffee, supplements, apparel, equipment). Shop hours: Mon-Thu 10-19, Fri 10-18, Sat 10-15, Sun closed. Gym itself is 24/7 for members. (T1, T5)
- Site navigation paths (T1): /traning, /crossfit, /hyrox, /grupptraning, /pt, /bootcamp, /kids, /foretag, /kostradgivning, /om-oss, /butik, /nyborjarguide, /tegenfitnessclub, /jobb, /schema, /kontakt, /vad-ar-crossfit, /vad-ar-en-pt, /medlem.

## 2. Offerings (T7, T1)

- CrossFit (60-minute coached classes), Hyrox, group training ("40+ weekly classes"), bootcamp, CrossFit Kids, personal training (one-on-one, duo, small group), corporate training, nutrition counselling, 24/7 open gym (with membership), Tegen Fitness Club membership, shop and cafe.
- Class types seen in the live schedule (T3): CrossFit, Hyrox, Team, Olympic Weightlifting, Gymnastics, Strength, Kondition.

## 3. Memberships and prices

Published prices (T1, T3):
- Day pass: 250 SEK.
- 10-credit package: 2,400 SEK.

Memberships (T2):
- /medlem names three levels in a goal-tracking section: Basic, Performance, High End. **No prices or per-tier differences are shown.** Prices: unknown (not published on the site; T4 uses the phrase "Pris vid konsultation", price at consultation).
- Stated benefits: unlimited class access, 24/7 open gym, coach support, community events, personal "On Ramp" introduction, goal tracking with InBody measurements, shop/cafe discounts.
- No binding period is emphasised ("Ingen bindning", T4), but actual contract terms are unknown.
- /traning shows no prices for PT, Kids, corporate etc. Unknown.

## 4. How leads and members sign up or book today

Lead funnel (T2, T4):
1. Prospect clicks "Boka gratis konsultation", which goes to the on-site page `/go?start=1` (served directly by crossfittegen.se with HTTP 200, no redirect observed with curl).
2. T4 promises a free, no-obligation 30-minute conversation and "we'll contact you within 24 hours". The page copy states the consultation picks the right membership together with the prospect.
3. Then "On Ramp" introduction, then training in classes or open gym, then regular goal reviews (T2).

Consultation form on T4 (from page strings): name, e-mail, phone (phone optional, with placeholder "070 123 45 67"). The submit endpoint, where submissions are stored, and who is notified are **unknown** (not visible without inspecting network traffic or submitting).

Contact form on /kontakt (T5): name (required), email (required), phone (optional), message (required); "responses within 24 hours". Backend unknown.

Member and class booking (T3, T1):
- The public /schema page lists upcoming classes by date with time, class type and spots left or full plus waitlist size. It says data is pulled live from Mana, with links to "see full schedule and your bookings" at Mana.
- Member login and account: https://www.getmana.app/s/tegen/account (T1, T4, T2).
- Non-members can buy a day pass or 10-credit pack (T3); exact purchase flow (Mana checkout vs on-site) not verified.

## 5. Tooling visible on the site

- **Mana** (getmana.app): booking, memberships, classes, credits. The site's privacy text lists "Bokningssystem (Mana) for managing memberships and classes" as a data recipient. (T4 raw page, T1, T3). Studio slug `tegen`; account URL above; API notes in `mana-api.md` (studio id `0ce2dee6-f72a-4d48-8421-bf9a22203e0c` per [M]).
- **Website built by LAB37** (lab37.io) (T1 footer credit via fetch; raw HTML of T2 also links lab37.io).
- **Google Tag Manager** (container id GTM-MQTKC5QV seen in raw HTML of T2), **Google Analytics**, **Meta pixel / Facebook Connect**, **Cloudflare Web Analytics**. (T2/T4 raw HTML and T4 privacy text)
- Privacy text (T4) states that on form submit, email and phone are shared in hashed form with Meta and Google Ads for ad measurement, plus technical data such as IP address (truncated in my capture; read the page for the full wording).
- Google Maps link to the gym place page (T4).
- **No CRM detected** (no Pipedrive, HubSpot, etc. references found in the raw HTML of /medlem and /go). Absence in HTML does not prove none is used server-side.
- Social: Instagram @crossfittegen, Facebook facebook.com/crossfittegen, TikTok @crossfittegen. (T1)

## 6. Relevance to a Mana-to-CRM sync

- Mana already holds members, bookings, memberships and credits for Tegen (see `mana-api.md`); the website consultation and contact forms are a separate lead source whose storage is unknown.
- Funnel stages visible on the site map naturally to CRM stages: consultation requested, consultation held, On Ramp, member, goal review. These stage names are my reading of T2, not Tegen's CRM terms.

## Open questions

- Where do `/go?start=1` and `/kontakt` submissions go (email only, database, Mana, a CRM)? Who handles them within the 24 hours?
- What are the prices for Basic, Performance, High End, PT, Kids, bootcamp and corporate? Contract and notice terms?
- Does Mana capture consultation leads (prospects without membership) or only members/users with accounts?
- Is the day pass / credit purchase done in Mana checkout (see `POST /studios/{id}/checkout` in `mana-api.md`)?
- Is the consultation scheduled into a calendar slot, or just a callback request? (T4 says "contacted within 24 hours", which suggests callback.)
- Which of the three facilities (Fran, Murph, Helen) map to Mana venues/rooms?
- Does Tegen already use any CRM or email tool (newsletter provider, etc.)?
- Full text of the privacy page for data-processing roles (relevant to GDPR when syncing member data to a CRM).
