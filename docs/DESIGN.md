# Tegen CRM: design guideline

Version 1, 2026-10-09. Derived from the LAB37 Internal Design Baseline v3.9
(`apps/DESIGN.md` in Erik's workspace), which is the source this file follows.
Where the baseline contradicts itself, this file takes the baseline's newer
rule and says so.

**For Claude Code working in this repo:** read this file before writing any
UI. Every rule here is a requirement unless it says "default". When something
you need is not covered, write `GAP: <what>` in your summary and ask, instead
of inventing a value.

---

## 1. What this app is, visually

Tegen CRM is an internal tool for the staff of CrossFit Tegen: leads, members,
the MRR dashboard, coach hours. It is NOT member-facing and carries no client
brand. It uses LAB37's neutral shell: pure grey surfaces (no hue, no tint),
colour only where it means something, and depth made from lightness and
shadow rather than outlines.

Reference products: Linear (restraint, motion), Notion (neutral with a few
signature moments), Vercel dashboard (clear type).

---

## 2. Stack

| Layer | Use | Never |
|---|---|---|
| Components | shadcn/ui on `@base-ui/react` (shadcn `base-nova`) | Radix for new work, hand-rolled dialogs/menus/popovers |
| Styling | Tailwind v4, CSS-first (`@theme` in `globals.css`) | `tailwind.config.*`, CSS-in-JS |
| Motion | `motion` (`import { motion } from "motion/react"`) | `framer-motion` (old name), GSAP |
| Icons | `lucide-react` only | a second icon set, emoji as icons |
| Fonts | Geist Sans + Geist Mono via `next/font` | any other face |

Version floors: `@base-ui/react` 1.8+, `tailwindcss` 4.3+, `lucide-react` 1.5+,
`motion` 12+.

You copy shadcn components into the repo and own them. Restyle them to the
tokens below; do not leave shadcn's default theme in place (its 0.5rem radius
and plain grey are the most recognisable "generated app" look there is).

---

## 3. Composing a screen

Following every token rule can still produce a generic screen. These rules
make the screen designed, not just correct.

**3.1 One hero per screen.** Before writing code, name the one thing the user
came for. It gets the most size, contrast and the best position. Everything
else visibly recedes. For this app:

| Screen | Hero |
|---|---|
| Home (owner, admin, studio manager) | MRR and number of paying members, with the trend |
| Home (trainer) | `GAP:` trainers must not see MRR, so their home needs its own hero. Propose one; never show an empty slot where MRR would be |
| Leads | the list of leads that need action now |
| Member | who the person is and the state of their membership |
| Coach hours | the per-coach hours table for the month |
| Settings | the form |

**3.2 Content leads.** Data sits at the top at a generous size. Navigation,
filters and toolbars are compressed around it, never the other way round.

**3.3 No card on a void.** A single centred card on an empty page is banned.
Login, empty states and first-run screens lead with something real (a dimmed
product view, a muted texture), never nothing. Never use a real member's data
for that.

**3.4 Asymmetry by default.** Left-aligned page titles, split panes (list on
the left, detail on the right). Centre things only as a last resort.

**3.5 Two surface tiers.** Decide which tier a screen is before designing it.

- **Tier 1, signature screens:** login, first run, empty states. Allowed:
  display-size type (2xl and up), a staggered entrance, elevation 3-4.
- **Tier 2, workhorse screens:** dashboard, tables, member pages, settings,
  forms. Full restraint: no display type, no imagery, at most one subtle
  stagger on route load. Almost all of this app is Tier 2.

**3.6 Squint test before calling a screen done.**
1. One obvious focal point? (Squint: what do you see first?)
2. Less than about 40% of the viewport empty? If not, recompose.
3. Cover the logo: is it still recognisably this app?
4. Does the loading skeleton match the final layout exactly (zero shift)?
5. Is every control focus-visible and AA contrast verified (section 10)?
6. Does it work at 390px wide (iPhone) with no horizontal scroll?

---

## 4. Colour

**Colour is functional, never decorative.** The shell has no brand colour.
Hues appear only for status (success, warning, error) and in charts.
Hover, active and selected states are lightness shifts on the grey scale,
never a hue change. The primary button is the near-white (dark theme) or
near-black (light theme) neutral.

**Count before you colour.** If a mark is true of most rows, it is not a
signal. A status that applies to 8 out of 10 leads gets no hue; separate it
with weight or an icon instead. Aim for about four hues on any one screen.
Name what each hue means and hold it to that.

**Identity is set in type, not colour.** Which coach or which membership type
a row belongs to is not a state, so it does not get a colour.

**Status chips are tints, never solid fills.** Text in the status colour, the
background is that same colour at 12% (light) / 16% (dark), via `.chip-tint`.
At most one tinted chip per row by default (for example: only an OVERDUE
follow-up is tinted, an on-time date stays plain text).

**Never hardcode a colour in a component.** Always a CSS variable. A raw hex
or `text-white` in a component is a bug.

---

## 5. Depth

Surfaces stack by getting lighter. Never two neighbouring surfaces at the same
value, and never a 1px outline as the only thing separating them.

- **The canvas is the extreme surface; chrome steps in toward grey from it.**
  In light theme the sidebar is darker than the canvas, in dark theme it is
  lighter. (This is the baseline's rule 2i. The baseline's Part 2 token block
  still shows the older "sidebar below canvas" values; 2i replaced them.)
- **Content steps up** from the canvas: cards, then popovers.
- **A well goes down.** A container that content sits in (a kanban column, a
  grouped list background) uses `--well`, never `--card`. Never nest two wells.
- **Elevated surfaces use three things together:** the lightness step, a
  two-layer shadow from the `.elevation-1..4` utilities, and the 1px inset top
  edge light baked into them. Never Tailwind's `shadow-lg` / `shadow-xl`.
- **No glass.** No `backdrop-filter` on panels or cards. It also breaks
  `position: fixed` children (menus re-anchor to the card). A plain scrim
  behind a dialog is fine.
- **Off-white ceiling:** near-white text stops at L 0.90. Brighter glares on
  dark grounds.

---

## 6. Tokens

Pure neutral, chroma 0, OKLCH. Both themes are first-class: build and check
every screen in both. Default: dark, per the baseline; follow the system
setting when the user has not chosen.

Contrast was computed for every text token against every surface it can sit
on (2026-10-09). All text pairs clear WCAG AA 4.5:1. If you change a ground,
re-check everything that sits on it.

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  /* Light. Canvas is the extreme; the rail steps DOWN toward grey (5). */
  --rail:                       oklch(0.935 0 0); /* #e9e9e9 sidebar + page gutter */
  --background:                 oklch(0.97 0 0);  /* #f5f5f5 canvas */
  --well:                       oklch(0.94 0 0);  /* #ebebeb trough content sits in */
  --well-border:                oklch(0.90 0 0);
  --card:                       oklch(0.995 0 0); /* #fdfdfd */
  --popover:                    oklch(1 0 0);
  --secondary:                  oklch(0.95 0 0);
  --muted:                      oklch(0.95 0 0);
  --accent:                     oklch(0.92 0 0);  /* hover / active lift */
  --border:                     oklch(0.90 0 0);
  --input:                      oklch(0.88 0 0);
  --ring:                       oklch(0.45 0 0);

  --foreground:                 oklch(0.205 0 0); /* #171717 */
  --card-foreground:            oklch(0.205 0 0);
  --popover-foreground:         oklch(0.205 0 0);
  --secondary-foreground:       oklch(0.205 0 0);
  --accent-foreground:          oklch(0.205 0 0);
  --muted-foreground:           oklch(0.50 0 0);  /* #636363, AA on every light ground */

  --primary:                    oklch(0.205 0 0);
  --primary-foreground:         oklch(0.97 0 0);

  --destructive:                oklch(0.52 0.19 27);
  --destructive-foreground:     oklch(0.97 0 0);
  --warning:                    oklch(0.50 0.11 70);
  --warning-foreground:         oklch(0.97 0 0);
  --success:                    oklch(0.48 0.13 145);
  --success-foreground:         oklch(0.97 0 0);

  --chart-1: oklch(0.45 0 0);   /* neutral first: the main series */
  --chart-2: oklch(0.48 0.13 145);
  --chart-3: oklch(0.50 0.11 70);
  --chart-4: oklch(0.52 0.19 27);
  --chart-5: oklch(0.48 0.16 250);

  --sidebar:                    var(--rail);
  --sidebar-foreground:         oklch(0.205 0 0);
  --sidebar-primary:            oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.97 0 0);
  --sidebar-accent:             oklch(0.905 0 0); /* one step from the rail, not a jump */
  --sidebar-accent-foreground:  oklch(0.205 0 0);
  --sidebar-border:             oklch(0.90 0 0);
  --sidebar-ring:               oklch(0.45 0 0);

  --radius: 0.75rem;
}

.dark {
  /* Dark. Canvas is the extreme; the rail steps UP toward grey (5). */
  --rail:                       oklch(0.25 0 0);  /* #222222 */
  --background:                 oklch(0.215 0 0); /* #191919 canvas */
  --well:                       oklch(0.235 0 0); /* #1e1e1e */
  --well-border:                oklch(0.28 0 0);
  --card:                       oklch(0.30 0 0);  /* #2e2e2e */
  --popover:                    oklch(0.33 0 0);  /* #353535 */
  --secondary:                  oklch(0.33 0 0);
  --muted:                      oklch(0.33 0 0);
  --accent:                     oklch(0.345 0 0); /* hover / active lift */
  --border:                     oklch(0.38 0 0);
  --input:                      oklch(0.33 0 0);
  --ring:                       oklch(0.72 0 0);

  /* Every near-white stops at the 0.90 ceiling (5). */
  --foreground:                 oklch(0.90 0 0);  /* #dedede */
  --card-foreground:            oklch(0.90 0 0);
  --popover-foreground:         oklch(0.90 0 0);
  --secondary-foreground:       oklch(0.90 0 0);
  --accent-foreground:          oklch(0.90 0 0);
  --muted-foreground:           oklch(0.72 0 0);  /* #a4a4a4, AA up to the hover fill */

  --primary:                    oklch(0.90 0 0);
  --primary-foreground:         oklch(0.215 0 0);

  --destructive:                oklch(0.74 0.16 22);
  --destructive-foreground:     oklch(0.215 0 0);
  --warning:                    oklch(0.75 0.15 80);
  --warning-foreground:         oklch(0.215 0 0);
  --success:                    oklch(0.72 0.18 145);
  --success-foreground:         oklch(0.215 0 0);

  --chart-1: oklch(0.72 0 0);
  --chart-2: oklch(0.72 0.18 145);
  --chart-3: oklch(0.75 0.15 80);
  --chart-4: oklch(0.74 0.16 22);
  --chart-5: oklch(0.68 0.13 230);

  --sidebar:                    var(--rail);
  --sidebar-foreground:         oklch(0.90 0 0);
  --sidebar-primary:            oklch(0.90 0 0);
  --sidebar-primary-foreground: oklch(0.215 0 0);
  --sidebar-accent:             oklch(0.285 0 0);
  --sidebar-accent-foreground:  oklch(0.90 0 0);
  --sidebar-border:             oklch(0.30 0 0);
  --sidebar-ring:               oklch(0.72 0 0);
}

@theme inline {
  --color-rail: var(--rail);
  --color-well: var(--well);
  --color-well-border: var(--well-border);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  /* Two steps below xs, because a dense CRM table needs them. Defined once
     here so nobody invents 9, 10 and 11px on the same screen. */
  --text-2xs: 0.6875rem; /* 11px: table metadata, deltas, chips */
  --text-3xs: 0.625rem;  /* 10px: column heads, timestamps */
  --tracking-label: 0.14em; /* the ONE tracking for uppercase labels */

  /* Name every radius step. Leave none to Tailwind's defaults (7). */
  --radius-xs: 3px;                          /* dots, skeleton bars, inline marks */
  --radius-sm: calc(var(--radius) - 4px);    /* 8px: inputs, chips */
  --radius-md: calc(var(--radius) - 2px);    /* 10px: buttons, nav rows */
  --radius-lg: var(--radius);                /* 12px: cards */
  --radius-xl: calc(var(--radius) + 4px);    /* 16px: popovers, dialogs */
  --radius-2xl: calc(var(--radius) + 8px);   /* 20px: the app window only, never a card */
}

@layer utilities {
  .elevation-1 { box-shadow: inset 0 1px 0 oklch(1 0 0 / .04), 0 1px 2px oklch(0 0 0 / .30), 0 1px 1px oklch(0 0 0 / .20); }
  .elevation-2 { box-shadow: inset 0 1px 0 oklch(1 0 0 / .05), 0 2px 6px oklch(0 0 0 / .34), 0 1px 2px oklch(0 0 0 / .24); }
  .elevation-3 { box-shadow: inset 0 1px 0 oklch(1 0 0 / .06), 0 8px 20px oklch(0 0 0 / .40), 0 2px 6px oklch(0 0 0 / .28); }
  .elevation-4 { box-shadow: inset 0 1px 0 oklch(1 0 0 / .07), 0 20px 48px oklch(0 0 0 / .50), 0 6px 16px oklch(0 0 0 / .32); }

  /* Status chip: the fill follows the chip's own text colour. */
  .chip-tint       { background-color: color-mix(in oklch, currentColor 12%, transparent); }
  .dark .chip-tint { background-color: color-mix(in oklch, currentColor 16%, transparent); }

  /* The one focus ring. Use this class, never hand-write the outline (10). */
  .focus-ring {
    outline: none;
    &:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  }
}
```

Elevation use: `.elevation-1` cards, `.elevation-2` sticky bars and hovered
cards, `.elevation-3` popovers and menus, `.elevation-4` dialogs.

---

## 7. Type

```
3xs  10px   column heads, timestamps
2xs  11px   table metadata, deltas, chips
xs   12px   labels, secondary metadata
sm   14px   body, table rows, nav items
base 16px   form labels, card titles
lg   18px   section headings
xl   20px   page titles (font-semibold)
2xl+        Tier 1 screens only, never a dashboard page title
```

- **Geist Sans for all words and all business numbers.** MRR, member counts,
  hours and prices are sans with `tabular-nums`.
- **Geist Mono only for technical values:** ids, API keys, URLs, `<kbd>`, and
  axis ticks inside a chart. Never for headings, nav or descriptions. Never
  mono money next to sans money.
- **`tabular-nums` on every number that changes**, so columns do not jitter.
- Headings `lg` and up get `tracking-tight`. Tier 1 display type gets
  `tracking-tighter` and `text-wrap: balance`.
- Uppercase labels use `tracking-[var(--tracking-label)]`, nothing else.
- Lower a text's importance with size and weight, **never with opacity**
  (`opacity-60` on muted text drops it to about 2.5:1 and fails AA).

**Numbers and dates are Swedish-formatted.** Use `Intl.NumberFormat("sv-SE")`
and `Intl.DateTimeFormat("sv-SE")` everywhere, through one helper module.
Percent has a non-breaking space before the sign ("10 %").

**Empty values are a word, not a dash.** Never render an em dash or a lone
"-" for missing data. Tegen's existing convention for an unknown lead source
is "Direkt / okänd"; reuse it for attribution.

---

## 8. Layout, spacing, motion

**Spacing:** every gap and padding is a multiple of 4px. Page padding
`px-6 lg:px-8 py-8` (`px-4` under 640px). An off-grid value means the layout
is wrong.

**Grids:** card grids auto-fill, never fixed column counts:
`grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]`.

**Tables** are the main surface of this app. Sticky header on `--card`,
row hover is `--accent`, numbers right-aligned with `tabular-nums`, column
heads at `3xs` uppercase with the label tracking. One table header style in
the whole app (section 9).

**Motion is springs, not durations.** One file, `lib/motion.ts`:

```ts
export const springs = {
  snappy:   { type: "spring", stiffness: 520, damping: 34 }, // press, toggle, chip
  standard: { type: "spring", stiffness: 400, damping: 34 }, // panels, drawers, popovers, dialogs
  gentle:   { type: "spring", stiffness: 280, damping: 32 }, // route entrance
} as const;
```

- Every interactive element gets a press state: `whileTap={{ scale: 0.97 }}`
  with `springs.snappy`.
- One staggered entrance per route (`staggerChildren: 0.05`, gentle spring,
  small y offset). Never re-run it on state changes.
- Animate `transform` and `opacity` only.
- Loading is a skeleton that matches the final layout, never a spinner on
  data and never an animation.
- No looping animation anywhere in the UI.
- `prefers-reduced-motion`: springs become plain opacity fades.

**Empty states** are a designed moment: a muted mark or product view, an `sm`
title, an `xs` description, one clear action. One shared `EmptyState`
component.

---

## 9. Primitives, and pinning them with a test

**If a class string appears three times, it is a primitive.** Put it in one
place (a component or a utility class) and use that. Expected primitives:
`.focus-ring`, `.chip-tint`, a `Page` frame, a `Surface` (card), a
`TableHead`, a `Label` (micro label), `EmptyState`, the number formatter.

Then pin them with a test. Erik's hq app has
`src/test/design-invariants.test.ts`, which fails the build on: a
hand-written focus ring, an arbitrary font size (`text-[13px]`), a radius off
the named scale, bare `rounded`, a raw hex in a component, a hand-rolled
status tint, opacity on `--muted-foreground`. Ask Erik for a copy and adapt it
in week one; it is far cheaper than sweeping 100 copies later.

**Grep the source, then audit the render.** Some drift only shows in computed
styles. Once a sprint, walk the DOM of each route and list any
`border-radius`, `font-size` or colour that is not on the token scale.

---

## 10. Accessibility (hard floor)

- **WCAG AA:** 4.5:1 for text, 3:1 for icons, borders of inputs and focus
  rings. Measure, do not eyeball. The tokens in section 6 pass; anything you
  add must be measured.
- **Every interactive element has a visible focus ring** via `.focus-ring`.
- **Tailwind v4 trap:** `outline-none focus-visible:outline-2` draws NOTHING,
  because `outline-none` sets a style variable that survives into the focus
  state. If you write focus styles as utilities, always include
  `focus-visible:outline-solid`. Verify by focusing a control and reading
  `getComputedStyle(el).outlineStyle`, not by reading the class list.
- `overflow-hidden` on a container clips focus rings: use an inset ring there.
- Icon-only buttons get an `aria-label`. Colour is never the only signal (a
  status has a word or an icon too).
- Every form input has a real `<label>`. Placeholder text is never the label.
- Touch targets at least 44x44px on anything used on a phone.
- Keyboard: every flow (add lead, change status, lock a month) works without
  a mouse. Base UI gives you focus traps and keyboard handling in dialogs and
  menus; do not replace them.

---

## 11. Identity without colour

"No brand colour" must not mean "no identity". Define each of these once:

- **A real mark.** Not a lucide icon. A deliberately set typographic
  wordmark (weight, tracking, a tile shape chosen on purpose). `GAP:` the
  product name and the wordmark are Erik's and Max's call.
- **One signature motion.** One recognisable moment built with the springs
  (for example the moment a month of coach hours is locked).
- **One ownable detail.** Something a user would recognise with the logo
  covered: a corner treatment, an icon habit, a texture.

---

## 12. Never (stop if you are about to write one)

- `shadow-lg` / `shadow-xl` on cards or buttons
- `rounded-2xl` or larger on a card
- a blue or gradient primary button
- glass / `backdrop-filter` on panels, or a coloured gradient behind the app
- a hardcoded hex or `text-white` in a component
- a placeholder used as a label
- elements that move sideways on hover
- solid, saturated status badges (use `.chip-tint`)
- emoji as icons, or a stock icon as the logo
- a centred card on an empty page
- opacity on text that is already muted
- an em dash or "-" for empty data
- copy you made up: UI text and labels are written or approved by Max and
  Erik; leave `[TEXT]` where a string is missing

---

## 13. Open decisions

| # | Question | Owner |
|---|---|---|
| D1 | Product name and wordmark | Erik + Max |
| D2 | Trainer homepage hero (they cannot see MRR) | Max proposes |
| D3 | UI language: Swedish, English, or both | Erik |
| D4 | Default theme: the baseline says dark; Tegen staff may prefer light at the front desk | Max tests with staff |

---

## Where this came from

LAB37 Internal Design Baseline v3.9 (2026-10-08): Part 0 (composition), Part 1
(principles, including 1.11 accessibility and 1.14 stack) and Part 2 (the
neutral shell), with Part 2's tokens re-derived under rules 2e (radius 0.75rem,
not shadcn's 0.5rem) and 2i (canvas is the extreme, chrome steps toward grey),
and contrast re-measured for the new ramp. Security and privacy rules for
this app (it stores members' personal data, so it is Tier 2) live in the LAB37
app baseline, not here.
