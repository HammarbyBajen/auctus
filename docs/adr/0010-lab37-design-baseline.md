# 0010: The UI follows LAB37's internal design baseline

Status: accepted, 2026-10-09. Supersedes 0009.

## Decision
The UI follows [docs/DESIGN.md](../DESIGN.md), derived from the LAB37 Internal Design Baseline v3.9. Tegen HQ is an internal staff tool, so it carries LAB37's neutral shell and no client brand: pure grey surfaces, colour only for status, depth from lightness and shadow, Geist type, shadcn/ui on Base UI, motion with springs, and dark and light themes that both work. This replaces the Tegen-branded design from ADR 0009 (Tegen's colours and fonts).

## How it is built
- **Tokens** are copied verbatim from DESIGN.md into `src/app/globals.css`. Change them there first.
- **Primitives** live in `src/components/app`: `Page`, `Surface`/`Panel`/`Well`, `MicroLabel`, `Chip`, `EmptyState`, `Notice`, `Stagger`, `Mark`, `NativeSelect`, plus the buttons in `src/components/ui/button.tsx` (`Button`, `ButtonLink`, `ButtonAnchor`, all with the press spring).
- **Theme** follows the device unless the user picks light or dark (a cookie). A small script in the head sets it before the first paint.
- **Motion:** `src/lib/motion.ts` holds the three springs. One staggered entrance per route, opacity-only under reduced motion, and never hiding content when JavaScript does not run.
- **Leads** is a split pane: the list on the left (needs action first, then all), the selected lead or the new-lead form on the right. With nothing selected, the right pane shows the next leads to call.
- **Numbers and dates** go through `src/lib/format.ts` (`sv-SE`).
- **Invariants** are pinned by `tests/design-invariants.test.ts`, which fails the build on drift (focus rings, font sizes, radii, raw colours, tints, opacity on muted text, big shadows, glass, `transition-all`, other fonts or icon sets, dashes as empty values).

## GAPs raised (DESIGN.md asks for these to be flagged, not invented)
1. **Input borders.** The `--input` token measures 1.42:1 (light) and 1.12:1 (dark), below the 3:1 required. A `.control-border` utility mixes existing tokens instead (3.89:1 and 3.45:1). To be settled by Erik.
2. **Home hero.** The owners' hero is MRR and paying members (ticket 26, waiting for Erik to confirm the definitions). Until then the hero is the list of leads that need action. Staff need their own hero (D2).
3. **Wordmark (D1).** A typographic stand-in ("TH" tile and "Tegen HQ") until Erik and Max decide.
4. **Copy.** New strings are `[TEXT]` until Max and Erik write them (see `src/messages/sv.json`).
5. **Invariants test.** Written from the description of Erik's test, not from his file. Worth comparing with his once available.
6. **Default theme (D4).** The device decides. Whether the front desk should default to light is for Max to test with staff.
