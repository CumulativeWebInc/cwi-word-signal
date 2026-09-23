/* Fake-DOM harness: runs the real index.html <script> in node:vm with a
   minimal DOM stub, so the drag-selection paths can be driven with synthetic
   PointerEvents. No npm deps, fully deterministic. */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const HTML_PATH = process.argv[2] || path.join(__dirname, "..", "index.html");
const CELL = 40, SIZE = 12;

class FakeClassList {
  constructor(el) { this._el = el; }
  get _s() { return this._el._classSet; }
  add(...c) { c.forEach((x) => this._s.add(x)); }
  remove(...c) { c.forEach((x) => this._s.delete(x)); }
  contains(x) { return this._s.has(x); }
  toggle(x, force) {
    if (force === undefined) force = !this._s.has(x);
    if (force) this._s.add(x); else this._s.delete(x);
    return force;
  }
  toString() { return [...this._s].join(" "); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this._classSet = new Set();
    this.classList = new FakeClassList(this);
    Object.defineProperty(this, "className", {
      get: () => [...this._classSet].join(" "),
      set: (v) => {
        this._classSet.clear();
        String(v).split(/\s+/).filter(Boolean).forEach((x) => this._classSet.add(x));
      },
    });
    this.textContent = "";
    this.id = "";
    this.parentElement = null;
    this._listeners = {};
    this._attrs = {};
    const store = {};
    this.style = new Proxy(store, {
      get(t, k) { return k === "setProperty" ? (n, v) => { t[n] = v; } : t[k]; },
      set(t, k, v) { t[k] = v; return true; },
    });
    Object.defineProperty(this, "offsetWidth", { get: () => 100 });
    Object.defineProperty(this, "innerHTML", {
      get: () => "",
      set: () => { this.children = []; },
    });
  }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) { this.children.splice(i, 1); c.parentElement = null; }
    return c;
  }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  removeEventListener(t, f) {
    const a = this._listeners[t];
    if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
  }
  dispatchEvent(e) {
    e.target = e.target || this;
    for (const f of (this._listeners[e.type] || []).slice()) f.call(this, e);
    // bubble to window
    if (this !== __window && __window._listeners[e.type])
      for (const f of __window._listeners[e.type].slice()) f.call(__window, e);
    return true;
  }
  _walk(cb) { for (const c of this.children) { cb(c); c._walk(cb); } }
  _matches(sel) {
    // supports: ".cls", ".cls1.cls2", "tag", "tag.cls", '[data-word="X"]'
    const mWord = sel.match(/^\[data-word="([^"]+)"\]$/);
    if (mWord) return this.dataset.word === mWord[1];
    const parts = sel.split(".");
    let tag = parts[0] === "" ? null : parts[0].toUpperCase();
    const classes = parts.slice(tag ? 1 : 1);
    if (tag && this.tagName !== tag) return false;
    return classes.every((c) => c === "" || this.classList.contains(c));
  }
  querySelectorAll(sel) {
    const out = [];
    this._walk((el) => { if (el._matches(sel)) out.push(el); });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k]; }
  removeAttribute(k) { delete this._attrs[k]; }
  getBoundingClientRect() { return { left: 0, top: 0, width: CELL, height: CELL }; }
  // pointer capture stubs (jsdom-less env has none; real code try/catches)
  setPointerCapture() { this._captured = true; }
  releasePointerCapture() { this._captured = false; }
  hasPointerCapture() { return !!this._captured; }
}

const __window = {
  _listeners: {},
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
  removeEventListener() {},
  innerWidth: 800, innerHeight: 600,
  // matchMedia intentionally undefined -> reduceMotion=false (matches desktop)
};
const __store = new Map();
const localStorage = {
  getItem: (k) => (__store.has(k) ? __store.get(k) : null),
  setItem: (k, v) => __store.set(k, String(v)),
  removeItem: (k) => __store.delete(k),
};

const byId = {};
function ensure(id) {
  if (!byId[id]) { byId[id] = new FakeElement("div"); byId[id].id = id; }
  return byId[id];
}
function cellAt(r, c) {
  const board = ensure("board");
  return board.children[r * SIZE + c] || null;
}
const document = {
  getElementById: (id) => ensure(id),
  createElement: (t) => new FakeElement(t),
  elementFromPoint: (x, y) => {
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || c >= SIZE || r < 0 || r >= SIZE) return null;
    return cellAt(r, c);
  },
  readyState: "complete",
  addEventListener() {},
  documentElement: new FakeElement("html"),
};
function getComputedStyle() {
  return {
    getPropertyValue: (n) =>
      n === "--word-colors"
        ? "#fbbf24,#22d3ee,#ec4899,#a3e635,#fb923c,#a78bfa,#2dd4bf,#f472b6"
        : "",
  };
}

function makeCtx(opts) {
  opts = opts || {};
  // fresh page per context: clear the element registry, window listeners,
  // and storage (mirrors a real page load; prevents cross-test leakage)
  for (const k of Object.keys(byId)) delete byId[k];
  __window._listeners = {};
  __store.clear();
  const sandbox = {
    document, window: __window, localStorage, getComputedStyle,
    navigator: {},
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => 0,
    performance: { now: () => Date.now() },
    URLSearchParams: URLSearchParams, // native in browsers; vm contexts lack it
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  if (opts.location) __window.location = { search: opts.location };
  else delete __window.location;
  // deterministic RNG inside the game
  vm.runInContext(
    `Math.random = (function(){ let s = 123456789; return function(){ s = (s*1664525+1013904223)>>>0; return s/4294967296; }; })();`,
    ctx
  );
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("no <script> found in " + HTML_PATH);
  vm.runInContext(m[1], ctx, { filename: "game.js" });
  // tag cells with geometry for elementFromPoint-independent checks
  vm.runInContext(
    `startGame("zooted","Zooted Zone", THEMES[0].words);
     (function(){ const b = document.getElementById("board");
       for (let i=0;i<b.children.length;i++){ const el=b.children[i];
         const r=+el.dataset.r, c=+el.dataset.c;
         el.getBoundingClientRect = function(){ return {left:c*${CELL}, top:r*${CELL}, width:${CELL}, height:${CELL}}; };
       } })();`,
    ctx
  );
  return ctx;
}

function pev(type, o) {
  return {
    type, clientX: o.x, clientY: o.y,
    pointerId: o.id === undefined ? 1 : o.id,
    pointerType: o.ptype || "mouse",
    button: o.button === undefined ? 0 : o.button,
    bubbles: true,
    _pd: false,
    preventDefault() { this._pd = true; },
  };
}
const ctr = (r, c) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });
function fire(ctx, el, ev) {
  el.dispatchEvent(ev);
}
function board(ctx) {
  return vm.runInContext(`document.getElementById("board")`, ctx);
}
function state(ctx, expr) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx));
}
// drag along an explicit cell path; returns events fired
function dragPath(ctx, path, opts = {}) {
  const b = board(ctx);
  const id = opts.id === undefined ? 1 : opts.id;
  const ptype = opts.ptype || "mouse";
  const first = path[0], p0 = ctr(first[0], first[1]);
  fire(ctx, b, pev("pointerdown", { x: p0.x, y: p0.y, id, ptype, button: 0 }));
  for (let i = 1; i < path.length; i++) {
    const p = ctr(path[i][0], path[i][1]);
    fire(ctx, b, pev("pointermove", { x: p.x, y: p.y, id, ptype }));
  }
  if (opts.cancel) fire(ctx, b, pev("pointercancel", { x: 0, y: 0, id, ptype }));
  else {
    const last = path[path.length - 1], pl = ctr(last[0], last[1]);
    fire(ctx, b, pev("pointerup", { x: pl.x, y: pl.y, id, ptype }));
  }
}
function placements(ctx) { return state(ctx, "Game.placements"); }
function gameState(ctx) {
  return state(ctx, "({found:Game.found, score:Game.score, streak:Game.streak, dragging:Game.dragging})");
}

module.exports = {
  makeCtx, dragPath, placements, gameState, state, board, fire, pev, ctr,
  ensure, CELL, SIZE, HTML_PATH,
};
