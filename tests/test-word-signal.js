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
    onSubmit: (str, path) => events.push({ t: 'submit', str, n: path.length })
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

console.log(`\n${pass}/${pass + fail} PASS${fail ? `, ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
