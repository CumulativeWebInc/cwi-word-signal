/* Word Signal™ — regression tests (node, zero deps).
   Run: node tests/run-tests.js
   Covers the 2026-09-23 rework: the drag-select root-cause fix
   (dragStart-as-element NaN bug), the gesture-hygiene fixes
   (active-pointer tracking, cancel, safety nets), and the pure game logic.
   The fake DOM lives in tests/fake-dom.js and runs the REAL index.html script. */
"use strict";
const H = require("./fake-dom.js");
const vm = require("vm");

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, evidence) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; failures.push(name); console.log("FAIL " + name + (evidence ? "  :: " + evidence : "")); }
}
function quiet(ctx) {
  // stop the game's timers so node can exit; keep everything else live
  vm.runInContext("stopTimer(); stopAutosave();", ctx);
}
function freshCtx(opts) { const c = H.makeCtx(opts); quiet(c); return c; }
function sel(ctx) {
  return H.state(ctx, "({activeId:Sel.activeId, start:Sel.start, n:Sel.cells.length})");
}
function game(ctx) {
  return H.state(ctx, "({found:Game.found, score:Game.score, streak:Game.streak, words:Game.words.length})");
}
function dragWord(ctx, idx, opts) {
  opts = opts || {};
  const p = H.placements(ctx)[idx];
  H.dragPath(ctx, p.cells.map(([r, c]) => [r, c]),
    { id: opts.id === undefined ? 1 : opts.id, ptype: opts.ptype || "mouse" });
  return p.word;
}

/* ================= PURE LOGIC ================= */
(function pure() {
  const ctx = freshCtx();
  // P1: grid generation — every word placed, letters match, over many seeds
  let ok = true, detail = "";
  for (let s = 0; s < 50 && ok; s++) {
    const r = H.state(ctx,
      `(function(){ const rng = makeRng(${1000 + s});
        const ws = pickWords(THEMES[2].words, 8, rng);
        const g = generateGrid(ws, 12, rng);
        for(const p of g.placements)
          for(let i=0;i<p.word.length;i++)
            if(g.letters[p.cells[i][0]][p.cells[i][1]] !== p.word[i]) return "mismatch:"+p.word;
        return g.placements.length === ws.length ? "ok" : "count"; })()`);
    if (r !== "ok") { ok = false; detail = "seed " + s + ": " + r; }
  }
  check("P1 generateGrid places all words with matching letters (50 seeds)", ok, detail);

  // P2: validateSelection — forward, reversed, wrong length, found-skip, <3
  const v = H.state(ctx, `(function(){
    const rng = makeRng(42);
    const g = generateGrid(["STUNT","ZOOTED"], 12, rng);
    const p = g.placements[0];
    const fwd = p.cells.map(c=>({r:c[0],c:c[1]}));
    const rev = fwd.slice().reverse();
    const short = fwd.slice(0,2);
    const r1 = validateSelection(fwd, g.placements, []);
    const r2 = validateSelection(rev, g.placements, []);
    const r3 = validateSelection(short, g.placements, []);
    const r4 = validateSelection(fwd, g.placements, [p.word]);
    const bad = fwd.map((c,i)=>({r:c.r, c:(c.c+1)%12}));
    const r5 = validateSelection(bad, g.placements, []);
    return JSON.stringify({f:!!r1 && r1.word===p.word, r:!!r2 && r2.word===p.word,
      s:r3===null, fnd:r4===null || r4.word!==p.word, b:r5===null});
  })()`);
  const pv = JSON.parse(v);
  check("P2 validateSelection fwd/rev/short/found/wrong", pv.f && pv.r && pv.s && pv.fnd && pv.b, v);

  // P3/P4: win, scoring, time, sanitize
  const s = H.state(ctx, `(function(){
    return JSON.stringify({
      win: isWin([{word:"A"},{word:"B"}], ["A","B"]) && !isWin([{word:"A"}], []),
      score: scoreForFind(5,1) === 50+5*15 && scoreForFind(5,3) === 50+5*15+2*25,
      time: timeBonus(0) === 600*5 && timeBonus(9999) === 0,
      fmt: formatTime(65) === "1:05" && formatTime(600) === "10:00",
      san: sanitizeWord("ab!") === null && sanitizeWord("abc") === "ABC",
      cust: JSON.stringify(parseCustomWords('["FUTURISM","MOSHPIT","GOATED"]'))
    });
  })()`);
  const sv = JSON.parse(s);
  check("P3 isWin/scoreForFind/timeBonus/formatTime/sanitize/parseCustom",
    sv.win && sv.score && sv.time && sv.fmt && sv.san &&
    sv.cust === '["FUTURISM","MOSHPIT","GOATED"]', s);
})();

/* ================= SELECTION: FIXED INPUT PATHS ================= */
(function selection() {
  // T1: mouse drag along a placed word finds it (the primary defect, fixed)
  {
    const ctx = freshCtx();
    const word = dragWord(ctx, 0, { id: 1, ptype: "mouse" });
    const g = game(ctx);
    const strokes = H.state(ctx, 'document.getElementById("board-wrap").querySelectorAll(".word-stroke").length');
    const bankFound = H.state(ctx, 'document.getElementById("bank-list").querySelectorAll("li.found").length');
    check("T1 mouse drag along a placed word finds it",
      g.found.includes(word) && g.score > 0 && strokes === 1 && bankFound === 1,
      `word=${word} found=${JSON.stringify(g.found)} score=${g.score} strokes=${strokes}`);
  }
  // T2: touch drag finds it too
  {
    const ctx = freshCtx();
    const word = dragWord(ctx, 1, { id: 9, ptype: "touch" });
    const g = game(ctx);
    check("T2 touch drag along a placed word finds it",
      g.found.includes(word), `word=${word} found=${JSON.stringify(g.found)}`);
  }
  // T3: second pointer mid-drag is ignored (no clobber)
  {
    const ctx = freshCtx();
    const ps = H.placements(ctx);
    const b = H.board(ctx);
    const a0 = H.ctr(ps[0].cells[0][0], ps[0].cells[0][1]);
    const b0 = H.ctr(ps[1].cells[0][0], ps[1].cells[0][1]);
    H.fire(ctx, b, H.pev("pointerdown", { x: a0.x, y: a0.y, id: 7, ptype: "touch", button: 0 }));
    const before = sel(ctx);
    H.fire(ctx, b, H.pev("pointerdown", { x: b0.x, y: b0.y, id: 1, ptype: "mouse", button: 0 }));
    const during = sel(ctx);
    // finish the FIRST gesture along its word
    const path = ps[0].cells.map(([r, c]) => [r, c]);
    for (let i = 1; i < path.length; i++) {
      const q = H.ctr(path[i][0], path[i][1]);
      H.fire(ctx, b, H.pev("pointermove", { x: q.x, y: q.y, id: 7, ptype: "touch" }));
    }
    const last = path[path.length - 1], pl = H.ctr(last[0], last[1]);
    H.fire(ctx, b, H.pev("pointerup", { x: pl.x, y: pl.y, id: 7, ptype: "touch" }));
    const g = game(ctx);
    check("T3 second pointer mid-drag ignored; first gesture completes",
      before.activeId === 7 && during.activeId === 7 &&
      JSON.stringify(before.start) === JSON.stringify(during.start) &&
      g.found.includes(ps[0].word),
      `start before=${JSON.stringify(before.start)} during=${JSON.stringify(during.start)} found=${JSON.stringify(g.found)}`);
  }
  // T4: pointercancel mid-drag submits nothing and cleans up
  {
    const ctx = freshCtx();
    const ps = H.placements(ctx);
    const path = ps[0].cells.slice(0, 4).map(([r, c]) => [r, c]);
    H.dragPath(ctx, path, { id: 9, ptype: "touch", cancel: true });
    const g = game(ctx), s = sel(ctx);
    const draggingCls = H.state(ctx,
      'document.getElementById("board").querySelectorAll(".cell.dragging").length');
    const ribbonVisible = H.state(ctx,
      `(function(){ const w = document.getElementById("board-wrap");
         const kids = []; w._walk(el=>{ if(el.id==="drag-ribbon") kids.push(el); });
         return kids.length ? kids[0].style.display : "missing"; })()`);
    check("T4 pointercancel mid-drag: no submit, clean state, ribbon hidden",
      g.found.length === 0 && s.activeId === null && draggingCls === 0 && ribbonVisible !== "block",
      `found=${JSON.stringify(g.found)} activeId=${s.activeId} draggingCls=${draggingCls} ribbon=${ribbonVisible}`);
  }
  // T5: rapid re-drag — wrong then correct, each resolves independently
  {
    const ctx = freshCtx();
    const ps = H.placements(ctx);
    H.dragPath(ctx, [[0, 0], [0, 1], [0, 2], [0, 3]], { id: 1, ptype: "mouse" });
    const s1 = game(ctx);
    const shake = H.state(ctx, 'document.getElementById("board").classList.contains("shake")');
    const word = dragWord(ctx, 2, { id: 1, ptype: "mouse" });
    const s2 = game(ctx);
    check("T5 rapid re-drag: wrong penalized+shake, correct then found",
      s1.found.length === 0 && s1.streak === 0 && shake === true &&
      s2.found.includes(word) && s2.streak === 1,
      `after wrong: ${JSON.stringify(s1)} shake=${shake}; after correct: found=${JSON.stringify(s2.found)}`);
  }
  // T6: tap (down+up, no move) submits nothing, no penalty
  {
    const ctx = freshCtx();
    const ps = H.placements(ctx);
    const b = H.board(ctx);
    const c0 = H.ctr(ps[0].cells[0][0], ps[0].cells[0][1]);
    H.fire(ctx, b, H.pev("pointerdown", { x: c0.x, y: c0.y, id: 1, ptype: "mouse", button: 0 }));
    H.fire(ctx, b, H.pev("pointerup", { x: c0.x, y: c0.y, id: 1, ptype: "mouse", button: 0 }));
    const g = game(ctx), s = sel(ctx);
    check("T6 tap without drag: no submit, no penalty, gesture closed",
      g.found.length === 0 && g.score === 0 && s.activeId === null, JSON.stringify(g));
  }
  // T7: pointerup from a non-active pointer is ignored
  {
    const ctx = freshCtx();
    const ps = H.placements(ctx);
    const b = H.board(ctx);
    const word = ps[3].word;
    const path = ps[3].cells.map(([r, c]) => [r, c]);
    const c0 = H.ctr(path[0][0], path[0][1]);
    H.fire(ctx, b, H.pev("pointerdown", { x: c0.x, y: c0.y, id: 7, ptype: "touch", button: 0 }));
    const pl = H.ctr(path[0][0], path[0][1]);
    H.fire(ctx, b, H.pev("pointerup", { x: pl.x, y: pl.y, id: 99, ptype: "mouse" })); // stranger
    const mid = sel(ctx);
    for (let i = 1; i < path.length; i++) {
      const q = H.ctr(path[i][0], path[i][1]);
      H.fire(ctx, b, H.pev("pointermove", { x: q.x, y: q.y, id: 7, ptype: "touch" }));
    }
    const le = H.ctr(path[path.length - 1][0], path[path.length - 1][1]);
    H.fire(ctx, b, H.pev("pointerup", { x: le.x, y: le.y, id: 7, ptype: "touch" }));
    const g = game(ctx);
    check("T7 stray pointerup ignored; owning pointer completes the word",
      mid.activeId === 7 && g.found.includes(word),
      `mid-gesture activeId=${mid.activeId} found=${JSON.stringify(g.found)}`);
  }
  // T8: live ribbon follows the drag and hides on release
  {
    const ctx = freshCtx();
    const ps = H.placements(ctx);
    const b = H.board(ctx);
    const path = ps[0].cells.slice(0, 4).map(([r, c]) => [r, c]);
    const c0 = H.ctr(path[0][0], path[0][1]);
    H.fire(ctx, b, H.pev("pointerdown", { x: c0.x, y: c0.y, id: 1, ptype: "mouse", button: 0 }));
    const c1 = H.ctr(path[2][0], path[2][1]);
    H.fire(ctx, b, H.pev("pointermove", { x: c1.x, y: c1.y, id: 1, ptype: "mouse" }));
    const ribbon = H.state(ctx,
      `(function(){ const w = document.getElementById("board-wrap");
         const kids = []; w._walk(el=>{ if(el.id==="drag-ribbon") kids.push(el); });
         if(!kids.length) return "missing";
         return kids[0].style.display + "|" + kids[0].style.width; })()`);
    const cl = H.ctr(path[3][0], path[3][1]);
    H.fire(ctx, b, H.pev("pointerup", { x: cl.x, y: cl.y, id: 1, ptype: "mouse" }));
    const after = H.state(ctx,
      `(function(){ const w = document.getElementById("board-wrap");
         const kids = []; w._walk(el=>{ if(el.id==="drag-ribbon") kids.push(el); });
         return kids.length ? kids[0].style.display : "missing"; })()`);
    const [disp, width] = ribbon.split("|");
    check("T8 live ribbon visible mid-drag with width, hidden after",
      ribbon !== "missing" && disp === "block" && parseFloat(width) > 0 && after === "none",
      `mid-drag ribbon=${ribbon} after=${after}`);
  }
  // T9: reversed drag also finds the word
  {
    const ctx = freshCtx();
    const ps = H.placements(ctx);
    const word = ps[4].word;
    const rev = ps[4].cells.slice().reverse().map(([r, c]) => [r, c]);
    H.dragPath(ctx, rev, { id: 1, ptype: "mouse" });
    const g = game(ctx);
    check("T9 reversed drag finds the word", g.found.includes(word),
      `word=${word} found=${JSON.stringify(g.found)}`);
  }
})();

/* ================= DEEP LINKS ================= */
(function deeplinks() {
  const ctx = freshCtx({ location: "?theme=doves&difficulty=hard&skipintro=1" });
  const theme = H.state(ctx, "selectedTheme && selectedTheme.id");
  const wpg = H.state(ctx, "CONFIG.wordsPerGame");
  const openHidden = H.state(ctx, 'document.getElementById("open").style.display');
  check("T10 deep links: theme preselect + difficulty + skipintro",
    theme === "doves" && wpg === 10 && openHidden === "none",
    `theme=${theme} wordsPerGame=${wpg} open.display=${openHidden}`);
  const q = H.state(ctx, 'JSON.stringify(readDeepLinks())');
  check("T11 readDeepLinks parses query", q === '{"theme":"doves","difficulty":"hard","skipintro":"1"}', q);
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log("failures: " + failures.join(", "));
process.exit(fail ? 1 : 0);
