# 25: Design pass

**What to build:** One consistent look and feel across the CRM once the main screens exist: Tegen's colours and logo, shared buttons, cards and form fields, and a check against the web design and accessibility guidelines (the `web-design-guidelines` skill). It includes watching Fredrik or Timmy use it for a few minutes and fixing what trips them up.

**Blocked by:** 11, 12, 13 (the main screens should exist first). Should land before 18 (cutover).

**Status:** done

- [x] Shared components (button, card, form field, banner) replace the repeated styling in the pages
- [x] Tegen's colours and type are used, and the result works on a phone and a laptop (the official logo file is still to be added)
- [x] The guideline review is done and its findings are fixed or written down as decisions (ADR 0009)
- [x] Text sizes, contrast and tap targets suit people who are not very digital
- [ ] Fredrik or Timmy has tried the main flow (new lead, call, move stage, task) and their feedback is handled

## Update 2026-10-09: now follows docs/DESIGN.md (LAB37 baseline), see ADR 0010
The Tegen-branded pass was replaced by LAB37's neutral shell. Done: Base UI components, tokens, two themes, springs, split-pane leads, Tier 1 login, still skeletons, a design-invariants test, measured focus rings and contrast at 390 px and desktop. Open: the GAPs in ADR 0010 ([TEXT] copy, wordmark, MRR hero, input border token), and a try-out with Fredrik or Timmy.
