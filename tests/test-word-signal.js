'use strict';
/* Word Signal™ v2.0.0 — node tests for the NEW selection engine + game core.
 * Zero dependencies. Loads the real <script> from index.html into node:vm
 * (the pure WS core is DOM-free; the UI layer is guarded behind
 * `typeof document !== 'undefined'` so it never executes here).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found in index.html'); process.exit(1); }
const js = m[1];
if (/<\/script/i.test(js)) { console.error('FAIL: script contains a nested </script>'); process.exit(1); }

const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(js, sandbox, { filename: 'word-signal-core.js' });
const WS = sandbox.module.exports;
if (!WS || typeof WS.generate !== 'function') {
  console.error('FAIL: WS core did not export from the script');
  process.exit(1);
}

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; /* console.log('  ok - ' + name); */ }
  else { fail++; console.log('  NOT OK - ' + name); }
}

// Theme word lists mirrored from the config block (never invent; tests only read).
const THEME_WORDS = {
  zooted: ['ZOOTED','ZONE','MOSHPIT','GOATED','EMBIID','STUNT','SMOKIN','PAIN'],
  doves: ['DOVES','DIAMONDS','ROSES','MONACO','RAINBOWS','PAINTED','LADY','GOLDEN'],
  futurism: ['ALTRAP','POSTTRAP','FUTURISM','VIRAL','ULTIMATE','PHANTASM','SCORPIONS','SAPPHIRES'],
  diabolique: ['DIABOLIQUE','TOXIC','WARPED','WICKED','SHADOWS','SPIRITS','TEARS','SCARS'],
  catalog: ['SHAKAZULU','FLEXMYFLAME','FLAMERZ','PIXEL','PIVOT','TIEMPO','RETRO','GOATED']
};
const SIZES = [10, 12, 14];

/* ---- 1. grid generation places ALL words, every theme, every size ---- */
console.log('1. grid generation');
Object.keys(THEME_WORDS).forEach((theme) => {
  SIZES.forEach((diffSize) => {
    const words = THEME_WORDS[theme];
    const longest = Math.max(...words.map((w) => w.length));
    const size = Math.max(diffSize, longest + 1);   // same clamp as startGame
    const gen = WS.generate(size, words, 1234);
    ok(gen.placements.length === words.length, `${theme}/${size}: all ${words.length} placed`);
    const placedWords = gen.placements.map((p) => p.word).sort();
    ok(JSON.stringify(placedWords) === JSON.stringify(words.slice().sort()), `${theme}/${size}: word set intact`);
    gen.placements.forEach((p) => {
      const letters = WS.placementLetters(gen.cells, size, p);
      const rev = letters.split('').reverse().join('');
      ok(letters === p.word || rev === p.word, `${theme}/${size}: "${p.word}" findable along its placement`);
      const inBounds = [0, p.word.length - 1].every((k) => {
        const r = p.r + p.dr * k, c = p.c + p.dc * k;
        return r >= 0 && c >= 0 && r < size && c < size;
      });
      ok(inBounds, `${theme}/${size}: "${p.word}" fully in bounds`);
    });
    ok(gen.cells.length === size * size, `${theme}/${size}: grid fully filled`);
    ok(gen.cells.every((ch) => /^[A-Z]$/.test(ch)), `${theme}/${size}: filler is A-Z only`);
  });
});

/* ---- 1b. oversize word (longer than grid) fails loudly, by design ---- */
console.log('1b. oversize word');
{
  let threw = false;
  try { WS.generate(10, ['FLEXMYFLAME'], 1234); }  // 11 letters, 10x10 grid
  catch (e) { threw = /could not place/.test(e.message); }
  ok(threw, '11-letter word on 10x10 throws a clear error (caller clamps size up)');
}
console.log('2. selection validation');
{
  const words = THEME_WORDS.zooted;
  ok(WS.validateSelection('ZOOTED', words).ok, 'forward match ok');
  ok(WS.validateSelection('detooz', words).ok, 'reverse match ok (case-insensitive)');
  ok(WS.validateSelection('detooz', words).word === 'ZOOTED', 'reverse resolves to canonical word');
  ok(!WS.validateSelection('ZO', words).ok, 'too short rejected');
  ok(!WS.validateSelection('', words).ok, 'empty rejected');
  ok(!WS.validateSelection('QQQXZ', words).ok, 'wrong string rejected');
  ok(!WS.validateSelection('ZOOTEDX', words).ok, 'superstring rejected');
}

/* ---- 3. headline defect: drag along a word finds it ---- */
console.log('3. drag-along-word (the headline defect)');
function makeHarness(size, cells) {
  // fake board: 100px cells, rect at origin — pure coordinate math, no DOM
  const CELL = 100;
  const events = [];
  const g = WS.newGesture({
    size,
    rect: () => ({ left: 0, top: 0, width: size * CELL, height: size * CELL }),
    letterAt: (r, c) => WS.letterAt(cells, size, r, c),
    onPaint: (path) => events.push({ t: 'paint', n: path.length }),
    onTap: () => events.push({ t: 'tap' }),
    onCancel: () => events.push({ t: 'cancel' }),
    onSubmit: (sel) => events.push({ t: 'submit', str: sel.str, n: sel.path.length, anchor: sel.anchor, target: sel.target })
  });
  const pt = (r, c) => ({ clientX: c * CELL + CELL / 2, clientY: r * CELL + CELL / 2 });
  return { g, pt, events, CELL };
}
{
  const size = 12, words = THEME_WORDS.zooted;
  const gen = WS.generate(size, words, 42);
  ['forward', 'reverse'].forEach((dirn) => {
    const p = gen.placements[0];
    const cells = [];
    for (let k = 0; k < p.word.length; k++) cells.push({ r: p.r + p.dr * k, c: p.c + p.dc * k });
    if (dirn === 'reverse') cells.reverse();
    const { g, pt, events } = makeHarness(size, gen.cells);
    g.down(Object.assign({ pointerId: 7 }, pt(cells[0].r, cells[0].c)));
    cells.slice(1).forEach((cell) => g.move(Object.assign({ pointerId: 7 }, pt(cell.r, cell.c))));
    const res = g.up(Object.assign({ pointerId: 7 }, pt(cells[cells.length - 1].r, cells[cells.length - 1].c)));
    const sub = events.find((e) => e.t === 'submit');
    ok(res === 'submit' && !!sub, `${dirn}: drag produced a submit`);
    ok(sub && WS.validateSelection(sub.str, words).ok, `${dirn}: submitted "${sub && sub.str}" validates`);
    ok(sub && sub.n === p.word.length, `${dirn}: path length == word length (${p.word.length})`);
    ok(events.some((e) => e.t === 'paint' && e.n > 1), `${dirn}: live ribbon painted during drag`);
  });
}

/* ---- 4. second pointer ignored mid-drag ---- */
console.log('4. second pointer ignored');
{
  const size = 12, words = THEME_WORDS.zooted;
  const gen = WS.generate(size, words, 7);
  const { g, pt, events } = makeHarness(size, gen.cells);
  const p = gen.placements[0];
  ok(g.down(Object.assign({ pointerId: 1 }, pt(p.r, p.c))) === true, 'first pointer claims gesture');
  ok(g.down(Object.assign({ pointerId: 2 }, pt(0, 0))) === false, 'second pointerdown ignored');
  const before = events.filter((e) => e.t === 'paint').length;
  g.move(Object.assign({ pointerId: 2 }, pt(5, 5)));   // intruder move
  ok(events.filter((e) => e.t === 'paint').length === before, 'intruder move ignored');
  ok(g.up({ pointerId: 2, clientX: 0, clientY: 0 }) === false, 'intruder pointerup ignored');
  ok(g.isActive(), 'gesture still owned by first pointer');
  g.move(Object.assign({ pointerId: 1 }, pt(p.r + p.dr, p.c + p.dc)));
  const res = g.up(Object.assign({ pointerId: 1 }, pt(p.r + p.dr, p.c + p.dc)));
  ok(res === 'submit', 'owner pointerup still submits');
  ok(!g.isActive(), 'gesture released after owner up');
}

/* ---- 5. pointercancel is clean ---- */
console.log('5. pointercancel');
{
  const size = 12;
  const gen = WS.generate(size, THEME_WORDS.zooted, 9);
  const { g, pt, events } = makeHarness(size, gen.cells);
  g.down(Object.assign({ pointerId: 3 }, pt(2, 2)));
  g.move(Object.assign({ pointerId: 3 }, pt(2, 5)));
  ok(g.cancel({ pointerId: 3 }) === true, 'cancel accepted');
  ok(!g.isActive(), 'gesture idle after cancel');
  ok(events.some((e) => e.t === 'cancel'), 'onCancel fired (ribbon cleared)');
  ok(!events.some((e) => e.t === 'submit'), 'no submit on cancel');
  // intruder cancel must not kill the real gesture
  g.down(Object.assign({ pointerId: 3 }, pt(2, 2)));
  ok(g.cancel({ pointerId: 99 }) === false, 'intruder cancel ignored');
  ok(g.isActive(), 'real gesture survives intruder cancel');
  g.cancel(null); // blur safety net path
  ok(!g.isActive(), 'blur-style cancel(null) clears gesture');
}

/* ---- 6. tap without movement: no submit, no penalty ---- */
console.log('6. tap-no-move');
{
  const size = 12;
  const gen = WS.generate(size, THEME_WORDS.zooted, 11);
  const { g, pt, events } = makeHarness(size, gen.cells);
  g.down(Object.assign({ pointerId: 5 }, pt(4, 4)));
  const res = g.up(Object.assign({ pointerId: 5 }, pt(4, 4)));
  ok(res === 'tap', 'tap reported as tap, not submit');
  ok(events.some((e) => e.t === 'tap'), 'onTap fired');
  ok(!events.some((e) => e.t === 'submit'), 'no submit on tap');
  // tiny jitter within the same cell is still a tap
  g.down({ pointerId: 5, clientX: 4.5 * 100, clientY: 4.5 * 100 });
  g.move({ pointerId: 5, clientX: 4.6 * 100, clientY: 4.4 * 100 });
  ok(g.up({ pointerId: 5, clientX: 4.6 * 100, clientY: 4.4 * 100 }) === 'tap', 'same-cell jitter is a tap');
}

/* ---- 7. direction snapping: 8 straight lines, constrained ---- */
console.log('7. direction snapping');
{
  const anchor = { r: 6, c: 6 };
  const diag = WS.linePath(anchor, { r: 2, c: 10 }, 12);
  ok(diag.length === 5 && diag.every((p, k) => p.r === 6 - k && p.c === 6 + k), 'diagonal snaps to 45° line');
  const horiz = WS.linePath(anchor, { r: 6, c: 11 }, 12);
  ok(horiz.length === 6 && horiz.every((p) => p.r === 6), 'horizontal stays horizontal');
  const vert = WS.linePath(anchor, { r: 0, c: 6 }, 12);
  ok(vert.length === 7 && vert.every((p) => p.c === 6), 'vertical stays vertical');
  // off-line finger: line extends along the snapped direction only
  const off = WS.linePath(anchor, { r: 3, c: 9 }, 12);
  ok(off.every((p, k) => p.r === 6 - k && p.c === 6 + k), 'off-line finger constrained to snapped line');
  // clipped at grid edge
  const edge = WS.linePath({ r: 0, c: 0 }, { r: -5, c: -5 }, 12);
  ok(edge.length === 1 && edge[0].r === 0 && edge[0].c === 0, 'edge anchor cannot leave grid');
  ok(WS.snapDir(0, 0).dr === 0 && WS.snapDir(0, 0).dc === 0, 'zero delta snaps to zero');
}

/* ---- 8. scoring + time helpers ---- */
console.log('8. scoring');
{
  ok(WS.scoreFor(6, 0) === 60, 'base = 6 letters × 10');
  ok(WS.scoreFor(6, 3) === 75, 'streak bonus added');
  ok(WS.timeBonus(0, 8) === 8 * 45 * 2, 'full time bonus when instant');
  ok(WS.timeBonus(8 * 45 + 99, 8) === 0, 'no bonus past par');
  ok(WS.fmtTime(96) === '1:36', 'fmtTime 96s');
  ok(WS.fmtTime(5) === '0:05', 'fmtTime pads');
}

/* ---- 9. save serialize / deserialize round-trip ---- */
console.log('9. save round-trip');
{
  const size = 12;
  const gen = WS.generate(size, THEME_WORDS.doves, 21);
  const state = {
    themeId: 'doves', diffId: 'normal', cells: gen.cells, size,
    placements: gen.placements, found: ['DOVES'], elapsed: 96, score: 125, streak: 2
  };
  const back = WS.deserialize(WS.serialize(state));
  ok(back && back.found.length === 1 && back.score === 125 && back.elapsed === 96, 'round-trip preserves state');
  ok(back && back.cells.join('') === gen.cells.join(''), 'round-trip preserves grid');
  ok(WS.deserialize('{"v":1}') === null, 'wrong version rejected');
}
try { WS.deserialize('not json'); ok(false, 'malformed json throws-or-nulls safely'); }
catch (e) { ok(true, 'malformed json throws safely (caught by caller)'); }

/* ---- 10. gesture paint change-detection (no per-move churn) ---- */
console.log('10. change-detected painting');
{
  const size = 12;
  const gen = WS.generate(size, THEME_WORDS.catalog, 31);
  const { g, pt, events } = makeHarness(size, gen.cells);
  g.down(Object.assign({ pointerId: 8 }, pt(3, 3)));
  const paints0 = events.filter((e) => e.t === 'paint').length;
  // same cell repeated moves: no new paint events
  for (let i = 0; i < 5; i++) g.move(Object.assign({ pointerId: 8 }, pt(3, 3)));
  ok(events.filter((e) => e.t === 'paint').length === paints0, 'repeated same-cell moves paint nothing new');
  g.move(Object.assign({ pointerId: 8 }, pt(3, 4)));
  ok(events.filter((e) => e.t === 'paint').length === paints0 + 1, 'real extension paints exactly once');
  g.up(Object.assign({ pointerId: 8 }, pt(3, 4)));
}

console.log(`\n${pass}/${pass + fail} PASS${fail ? `, ${fail} FAILED` : ''} (pre-forgiveness)`);
if (fail) process.exit(1);

/* ---- 11. forgiving submit: 1-cell-off anchor (gap/edge touch-down) still finds the word ---- */
console.log('11. forgiving submit (fat-finger anchor retry)');
{
  const size = 12, words = THEME_WORDS.zooted;
  const gen = WS.generate(size, words, 42);
  const lat = (r, c) => WS.letterAt(gen.cells, size, r, c);
  const p = gen.placements[0]; // {r,c,dr,dc,word}
  const target = { r: p.r + p.dr * (p.word.length - 1), c: p.c + p.dc * (p.word.length - 1) };
  // simulate a touch-down 1 cell off the true anchor (thumb landed in a grid gap)
  for (const s of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) {
    const anchor = { r: p.r + s[0], c: p.c + s[1] };
    if (anchor.r < 0 || anchor.c < 0 || anchor.r >= size || anchor.c >= size) continue;
    const directStr = WS.linePath(anchor, target, size).map((q) => lat(q.r, q.c)).join('');
    ok(!WS.validateSelection(directStr, words).ok, `shift ${s}: direct "${directStr}" misses (reproduces the defect)`);
    const r2 = WS.resolveSubmission({ anchor, target, size, letterAt: lat, words, found: [] });
    ok(r2.ok && r2.word === p.word && r2.shifted === true,
      `shift ${s}: retry recovers "${p.word}"`);
  }
  // true non-word stays a miss even with the retry
  const r3 = WS.resolveSubmission({
    anchor: { r: 0, c: 0 }, target: { r: 0, c: 2 }, size,
    letterAt: (r, c) => 'X', words, found: []
  });
  ok(!r3.ok, 'all-X path still misses (no false accept)');
  // already-found direct hit is never re-interpreted into a different word
  const directAnchor = { r: p.r, c: p.c };
  const dv = WS.validateSelection(p.word, words);
  ok(dv.ok, 'direct word validates');
  const r4 = WS.resolveSubmission({ anchor: directAnchor, target, size, letterAt: lat, words, found: [p.word] });
  ok(!r4.ok, 'already-found word is not shifted into another word');
}

/* ---- 12. gesture passes anchor+target to onSubmit; release cell is reported ---- */
console.log('12. gesture submit context');
{
  const size = 12;
  const gen = WS.generate(size, THEME_WORDS.zooted, 42);
  const { g, pt, events } = makeHarness(size, gen.cells);
  const p = gen.placements[0];
  g.down(Object.assign({ pointerId: 11 }, pt(p.r, p.c)));
  for (let k = 1; k < p.word.length; k++) g.move(Object.assign({ pointerId: 11 }, pt(p.r + p.dr * k, p.c + p.dc * k)));
  g.up(Object.assign({ pointerId: 11 }, pt(p.r + p.dr * (p.word.length - 1), p.c + p.dc * (p.word.length - 1))));
  const sub = events.find((e) => e.t === 'submit');
  ok(!!sub && sub.anchor.r === p.r && sub.anchor.c === p.c, 'onSubmit carries the touch-down anchor');
  ok(!!sub && sub.target.r === p.r + p.dr * (p.word.length - 1) && sub.target.c === p.c + p.dc * (p.word.length - 1),
    'onSubmit carries the release target cell');
  ok(!!sub && WS.validateSelection(sub.str, THEME_WORDS.zooted).ok, 'submitted string validates');
}

/* ---- 13. end-to-end through the gesture: off-by-one touch-down finds the word ---- */
console.log('13. gesture-level fat-finger recovery');
{
  const size = 12, words = THEME_WORDS.doves;
  const gen = WS.generate(size, words, 99);
  const lat = (r, c) => WS.letterAt(gen.cells, size, r, c);
  const p = gen.placements.find((q) => q.dr === 0 && q.dc === 1 && q.c > 0 && q.c + q.word.length < size);
  ok(!!p, 'found a horizontal word with room to shift (test precondition)');
  if (p) {
    const CELL = 100;
    const events = [];
    const g = WS.newGesture({
      size,
      rect: () => ({ left: 0, top: 0, width: size * CELL, height: size * CELL }),
      letterAt: lat,
      onPaint: () => {},
      onTap: () => {},
      onCancel: () => {},
      onSubmit: (sel) => {
        // mirror of submitSelection's resolution logic
        let res = WS.validateSelection(sel.str, words);
        if (!res.ok) {
          const r2 = WS.resolveSubmission({ anchor: sel.anchor, target: sel.target, size, letterAt: lat, words, found: [] });
          if (r2.ok) res = { ok: true, word: r2.word };
        }
        events.push({ t: 'submit', word: res.word || null });
      }
    });
    const pt = (r, c) => ({ clientX: c * CELL + CELL / 2, clientY: r * CELL + CELL / 2 });
    // touch down one cell LEFT of the true anchor (gap-side), drag the true word cells
    g.down(Object.assign({ pointerId: 12 }, { clientX: (p.c - 1) * CELL + CELL / 2, clientY: p.r * CELL + CELL / 2 }));
    for (let k = 0; k < p.word.length; k++) g.move(Object.assign({ pointerId: 12 }, pt(p.r, p.c + k)));
    g.up(Object.assign({ pointerId: 12 }, pt(p.r, p.c + p.word.length - 1)));
    const sub = events.find((e) => e.t === 'submit');
    ok(!!sub && sub.word === p.word, `1-cell-off touch-down still submits "${p.word}"`);
  }
}

/* ---- 14. finger trail + scroll lock (Black: "highlighting the motion would
   be helpful", "the screen try's to scroll when the user is selecting letters") ---- */
console.log('14. finger trail + scroll lock');
{
  // trail overlay exists in the shipped markup, above cells, pointer-transparent
  ok(html.includes('<svg id="trail"'), 'trail SVG present in markup');
  ok(html.includes('<polyline id="trailLine"'), 'trail polyline present');
  ok(html.includes('#trail.on'), 'trail visible state styled');
  ok(/#trail\{[^}]*pointer-events:none/.test(html), 'trail never intercepts touches');
  ok(/#trail\{[^}]*z-index:4/.test(html), 'trail paints above the cells');
  // trail lifecycle functions
  for (const fn of ['trailStart', 'trailAdd', 'trailEnd', 'trailRender', 'trailWrapPos']) {
    ok(html.includes('function ' + fn + '('), fn + ' defined');
  }
  // trail starts only when the gesture actually takes the pointer (no second finger)
  ok(/if \(gesture\.down\([^)]*\)\) \{\s*\n?\s*trailStart\(/.test(html),
     'trail starts only on accepted pointerdown');
  // trail follows every accepted move; distance-throttled so no point spam
  ok(/if \(gesture\.move\([^)]*\)\) \{\s*\n?\s*trailAdd\(/.test(html),
     'trail extends on every accepted pointermove');
  ok(html.includes('Math.hypot(p.x - last.x, p.y - last.y) < 10'),
     'trail points distance-throttled');
  // trail ends on every gesture end path (up, cancel, blur, hidden tab)
  const ups = (html.match(/trailEnd\(\)/g) || []).length;
  ok(ups >= 4, `trailEnd on all end paths (found ${ups})`);
  // fast re-drag can never clear the new trail (token guard)
  ok(html.includes('trailToken'), 'trail fade is token-guarded');
  // scroll lock: non-passive touchmove kills webview scroll mid-gesture
  ok(/document\.addEventListener\('touchmove', \(e\) => \{\s*\n?\s*if \(gesture\.isActive\(\)\) e\.preventDefault\(\);?\s*\n?\s*\}, \{ passive: false \}\)/.test(html),
     'non-passive touchmove preventDefault while gesture active');
  // belt and braces: cells themselves refuse scroll; no rubber-banding
  ok(/\.cell\{[^}]*touch-action:none/.test(html), 'cells carry touch-action:none');
  ok(html.includes('overscroll-behavior:none'), 'overscroll-behavior none set');
  // gesture engine exposes isActive for the scroll lock
  ok(html.includes('isActive()'), 'gesture exposes isActive');
}

console.log(`\n${pass}/${pass + fail} PASS${fail ? `, ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
