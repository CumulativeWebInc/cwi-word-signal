# Word Signal™ — changelog

## 1.1.0 — 2026-09-23
- Controller rework: fixed the drag-select defect Black reported on iPhone — `pointerdown`
  stored a DOM element where the line-walk expected `{r,c}`, so every pointermove emptied the
  selection (puzzle sequences could not link). Selection now uses a dedicated gesture module:
  numeric `{r,c}` anchors, single active-pointer ownership, pointer capture, window-level
  `pointerup`/`pointercancel`/`blur` safety nets, `touch-action:none` on the grid plus
  `touch-action:manipulation` on the body, change-detected cell painting, and a live drag ribbon.
- Fixed `?skipintro=1` leaving the intro overlay visible over the setup screen.
- Interface elevation: semantic design tokens, Sora + Inter typography, glass panels, aurora
  background, HUD progress bar, animated score count-up, word-found wave + sparkles, guarded
  haptics, refined intro/outro/win screens. Official CWI logo byte-identical; brand, catalog,
  listening-room CTA, skippable listen dialog, ©/™/license header, and localStorage-only saves
  all preserved.
- Deep links: `?theme=<zooted|doves|futurism|diabolique|catalog>`,
  `?difficulty=<easy|normal|hard>`, `?new=1`, `?autostart=1`, `?skipintro=1`.
- Regression suite: `tests/run-tests.js` (14/14 green: 50-seed placement, selection,
  win/scoring, mouse/touch drags, second-pointer conflict, pointercancel, rapid re-drag,
  tap, stray pointerup, ribbon, reverse drag, deep links).

## 1.0.0 — 2026-09-23
- Launch: Word Signal™ ships as one self-contained `index.html` on GitHub Pages.
- Official CWI logo, brand CSS variables, © 2026 Cumulative Web Inc, ™ on the game name, proprietary license header.
- Listen dialog with verified Spotify + Apple Music artist links (skippable, never auto-plays).
- CTA + working CWI listening-room try-link.
- localStorage-only persistence; no backend, no accounts, no secrets, no eval.
- Twenty Minds run: `TWENTY-MINDS-3GAMES-2026-09-23.md` (decision: ship under the full gate stack).
- Name screening: `NAME-RESEARCH-2026-09-23.md` (web/trademark/app-store sweep; no exact-title collisions found).
- Independent verifier: SHIP on fix cycle 0 (logic, links, secrets, security, legal gates all PASS).
