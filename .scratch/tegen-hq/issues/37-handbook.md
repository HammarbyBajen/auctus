# 37: Handbok: Tegen's routines (SOPs)

**What to build:** A place in Tegen HQ for the studio's routines (SOPs): how we open and close, how we call a new lead, a trial, a new member. Tegen has none written yet; this gives them somewhere to write them, find them on the gym floor, and keep them up to date.

**Blocked by:** none

**Status:** live (2026-10-23)

**Decided by Max (2026-10-23):**
- Called **Handbok**.
- Owners write, plus staff the owners choose; everyone reads.
- A simple editor, like a document: headings, lists, checklists, bold, italic, links. No codes to learn.
- Categories (owners keep the list) and a search across all text.
- Change history: who changed what and when, read any earlier version, bring it back.
- Not now: "read and understood", review reminders, starter templates.
- On phones the bottom bar becomes Hem, Leads, Medlemmar, Mer; Mer opens Handbok, Rapport, Timmar and Inställningar (the ones the person may see).

**Built (2026-10-23):**
- /handbok: routines by category, with a search that finds any part of a word in the title or text (Å, Ä, Ö folded); "Ny rutin" for editors.
- A routine's page, with "Ändrad 23 okt. 09:24 av Max"; Redigera and Historik for editors. Checklists can be ticked while reading (not saved).
- The editor (Tiptap 3.31.4): Rubrik, Underrubrik, Fetstil, Kursiv, Punktlista, Numrerad lista, Checklista, Citat, Länk, Ångra, Gör om.
- Every save with a change keeps a version; Historik lists them and shows any one; "Ta tillbaka den här versionen" saves it again as a new version. Removing a routine hides it, with its history.
- Inställningar → Handbok: categories (add, rename, move, remove when empty) and who besides the owners may write.
- Safety: the server checks every saved document against what the editor allows (unknown content dropped, links only to the web, email or phone) and checks it again before showing it. The text is drawn from the stored document, never as raw HTML.
- New tables handbook_category, handbook_page, handbook_version; studio_settings.handbook_editor_ids (migration 0030).

**Later, if wanted:** images in routines (needs a file store, e.g. Vercel Blob), read-and-understood, review reminders, starter templates, the assistant answering from the handbook (ticket 30 phase E).

- [x] Owners and chosen staff write; everyone reads
- [x] Editor with headings, lists, checklists and links
- [x] Categories and search
- [x] Change history with restore
- [x] Phone: Mer menu
- [x] Tests (document checks, permissions, versions, search, categories)
- [x] Migration 0030 in production (Max), copy approved (Max), then pushed
