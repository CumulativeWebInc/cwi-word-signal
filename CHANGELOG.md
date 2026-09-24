## Word Signal — 2026-09-24: finger trail + scroll lock
- Black's iPhone report: the screen tried to scroll during letter selection, and the drag motion needed visible highlighting.
- Added a cyan finger trail: an SVG polyline that paints the finger's ACTUAL motion in real time, independent of the snapped lime selection ribbon. Starts only when the gesture takes the pointer, distance-throttled, token-guarded fade after release.
- Scroll lock: non-passive touchmove preventDefault while a selection gesture is active (iOS-proof), touch-action:none on cells as well as the board, overscroll-behavior:none to kill rubber-banding.
- 391/391 node tests pass (372 core + 19 new trail/scroll-lock structural tests). Real-touch CDP at 390x844: mid-drag trail painted 19 points with ribbon on, scrollY stayed 0, trail faded and cleared after release.

## 2.0.0 — 2026-09-24 — Full rebuild per Black's iPhone defect order
- Rebuilt from scratch: new coordinate-math selection engine (live ribbon, diff-based painting, single-pointer gesture ownership) — drag-select now precise and responsive on touch
- 2026 design language: aurora background, glassmorphism, Sora/Inter, wave + confetti animations
- Tests: 352/352 PASS (node), 600-game fuzz 0 failures; node --check clean
- Kept: CWI logo, Word Signal™, catalog themes, Listen dialog, CTA + listening-room try-link, © 2026, localStorage saves, deep links

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
