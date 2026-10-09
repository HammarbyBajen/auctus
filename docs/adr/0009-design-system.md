# 0009: Design system: shadcn/ui in Tegen's brand

Status: superseded by 0010 (2026-10-09)

## Decision
The UI uses shadcn/ui (Radix flavour, Nova preset) as a base, restyled to Tegen's brand portal, and is reviewed against the Vercel web interface guidelines.

## Brand (from the CrossFit Tegen brand portal, 2026)
- **Colours.** Dark Green `#1E231E`, Black and White carry the design: the top bar, primary buttons and text. Mid Green `#729070` is the focus ring, Light Green `#A6D0A1` marks "member" and the main "+ Ny lead" action. Mid Grey and Light Grey are used for details only. They are too light for small text on white (Mid Grey is about 3.7:1), so secondary text uses `#565A56`, which reaches 4.5:1. Red and amber are functional urgency colours, not brand colours.
- **Type.** Page titles in Roboto Condensed Black Italic, uppercase (`.heading-display`). Section labels, buttons and navigation in Abel, uppercase (`.label-caps`). Body text in Roboto, at 16 px or more. All three come from Google Fonts through `next/font`, so Next serves them from the app.
- **Logo.** A typographic "TEGEN HQ" stands in until the official wordmark file is added.

## Layout
- **Phone:** a dark top bar with the wordmark and sign-out, and a bottom tab bar (Hem, Leads, "+ Ny lead", Inställningar) within reach of the thumb, respecting safe areas. Lists are cards. On a lead the call and email buttons come first.
- **Desktop:** navigation in the top bar. The lead list is a table, and the lead page has two columns (the work on the left, Mana, assignee and details in a column that stays in view).

## Rules taken from the guidelines
At least 44 px tap targets, visible focus rings, a skip link, labels and the right `type`, `inputmode` and `autocomplete` on every field, no spellcheck on email, "Sparar…" while saving, errors next to the field with focus moved there, a two-step confirmation for deleting, tabular numbers, `theme-color` and `color-scheme`, no zoom blocking, no `transition-all`, reduced motion respected, and scroll padding under the sticky bar.

## Deliberate exceptions
- Swedish sentence case instead of English Title Case.
- The login email field shows an example address instead of a placeholder ending in "…".
- Long lists use `content-visibility` for now. Paging comes with search (ticket 08).
- No warning before leaving a form with unsaved changes yet.

## Consequences
New screens are built from the shared components in `src/components/app` and `src/components/ui`, not with one-off styling. The shadcn tool generated imports from `"cn"`, so files it adds later must be checked and pointed at `@/lib/utils`.
