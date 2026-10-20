(() => {
'use strict';

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const faNum = n => Math.round(n).toLocaleString('fa-IR');
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return [c, c.getContext('2d')]; };
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------------------------------------------------------------- notation parser
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC = { '#': 1, b: -1, k: -0.5, s: 0.5, '': 0 };
function parsePitch(s) {
  const m = /^([A-Ga-g])(#|b|k|s)?(\d)$/.exec(s);
  if (!m) return NaN;
  return 12 * (+m[3] + 1) + SEMI[m[1].toUpperCase()] + ACC[m[2] || ''];
}
function parseDur(s) {
  if (s === undefined || s === '') return 1;
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return a / b; }
  return Number(s);
}
// Returns { events, error } where events = [{ notes: [midi], dur } | { rest: true, dur }]
function parseSong(text) {
  const toks = text.replace(/[|،,]/g, ' ').split(/\s+/).filter(Boolean);
  const events = [];
  for (const tok of toks) {
    const [head, d] = tok.split(':');
    const dur = parseDur(d);
    if (!(dur > 0) || dur > 16) return { error: tok };
    if (head === 'r' || head === '-') { events.push({ rest: true, dur }); continue; }
    const notes = head.split('+').map(parsePitch);
    if (!notes.length || notes.some(n => !isFinite(n) || n < 21 || n > 108)) return { error: tok };
    events.push({ notes, dur });
  }
  if (!events.some(e => !e.rest)) return { error: '' };
  return { events };
}

// ---------------------------------------------------------------- canvas & layout
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, dpr = 1;
const COLS = 4;
const B = { x: 0, w: 0, colW: 0, rowH: 0 };
const START_ROW = 1; // first tile sits one row above the bottom edge
let bgC = null;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  B.w = Math.min(W, H * 0.62);
  B.x = (W - B.w) / 2;
  B.colW = B.w / COLS;
  B.rowH = H / 4;
  buildBg();
}

// ---------------------------------------------------------------- themes & background patterns
// Bright, kid-friendly palettes built around the Anatomyar brand (orange + blue). Each lane has its own
// candy colour: [top, bottom, lip].
const THEMES = {
  classic: {
    bg1: '#ece6ff', bg2: '#e4f0ff', line: 'rgba(36,83,166,.10)', glyph: 'rgba(36,83,166,.07)', beat: '#2453a6', hit: '#f7941d', text: '#1f2a4d',
    tiles: [['#ffb057', '#f7731d', '#c4520e'], ['#5b8cff', '#2453a6', '#1a3b7a'], ['#b28bff', '#7c3aed', '#5b21b6'], ['#3ee0a0', '#0ea371', '#077a54']],
  },
  iranian: {
    bg1: '#fff3e0', bg2: '#e2faf6', line: 'rgba(15,118,110,.13)', glyph: 'rgba(15,118,110,.08)', beat: '#0f766e', hit: '#14b8a6', text: '#1f2a4d',
    tiles: [['#3fe0cc', '#0f9488', '#0b6e66'], ['#ffad4d', '#e2661a', '#a9470c'], ['#5b9bff', '#1e4fc2', '#163a8f'], ['#ff8cc6', '#d42a7f', '#9b1c5c']],
  },
};
let theme = THEMES.classic;

// Eight-point star (khatam) lattice for Iranian songs; faint staff lines for classical ones.
function buildBg() {
  const [c, g] = mk(W * dpr, H * dpr);
  g.scale(dpr, dpr);
  const grd = g.createLinearGradient(0, 0, W * 0.3, H);
  grd.addColorStop(0, theme.bg2); grd.addColorStop(1, theme.bg1);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = theme.line; g.lineWidth = 1.5;
  if (theme === THEMES.iranian) {
    const s = 72;
    for (let y = -s; y < H + s; y += s) for (let x = -s; x < W + s; x += s) {
      const cx = x + (Math.floor(y / s) % 2 ? s / 2 : 0), cy = y;
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU - Math.PI / 2, r = i % 2 ? s * 0.2 : s * 0.34;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.stroke();
      g.beginPath(); g.arc(cx, cy, s * 0.08, 0, TAU); g.stroke();
    }
  } else {
    for (let k = 0; k < 4; k++) {
      const y0 = H * (0.15 + k * 0.22);
      for (let l = 0; l < 5; l++) { g.beginPath(); g.moveTo(0, y0 + l * 10); g.lineTo(W, y0 + l * 10); g.stroke(); }
    }
  }
  // scattered music notes (same layout every time)
  g.fillStyle = theme.glyph; g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = ['♪', '♫', '♩', '♬'];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0, n = Math.round((W * H) / 26000); i < n; i++) {
    const x = rnd() * W, y = rnd() * H, sz = 22 + rnd() * 34;
    g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.8);
    g.font = `900 ${Math.round(sz)}px Vazirmatn, sans-serif`; g.fillText(glyphs[i % 4], 0, 0); g.restore();
  }
  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(255,255,255,.35)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  bgC = c;
}

// ---------------------------------------------------------------- game state
let mode = 'menu'; // menu | loading | ready | play | fail | over | pause
let song = null, events = [], firstLapTiles = 0;
let tiles = [], nextIdx = 0, genRow = 0, genEvent = 0, genLap = 1, lastCol = -1;
let pos = 0, baseSpeed = 3, speedMul = 1, score = 0, hits = 0, lap = 1, failT = 0, fail = null;
let streak = 0, maxStreak = 0, judged = { perfect: 0, great: 0, ok: 0 };
let flash = 0; // brief glow when the multiplier goes up
let hold = null; // the long tile under a finger: { tl, id, voices, off }
let floats = [];
let t = 0, ripples = [], menuTiles = [];
let best = store.get('nava.best', {});
let mine = store.get('nava.mine', []);

const allSongs = () => SONGS.concat(mine.map(s => ({ ...s, cat: 'mine' })));
const ACC_VEL = 0.42, TONBAK_VEL = 0.55;
const speedNow = () => baseSpeed * speedMul * (1 + Math.min(0.6, hits * 0.0035)); // rows per second

// Rhythm model: one row = `rowBeat` beats, and tiles are spaced by the real length of each note, so
// tapping tiles as they arrive reproduces the song's rhythm. Tile height is capped so long notes stay
// tappable without filling the screen.
let rowBeat = 1, songLen = 0;
const rows = dur => dur / rowBeat;
const tileRows = dur => clamp(dur / rowBeat, 0.5, 3);

// The accompaniment follows a song clock (in beats). Each tap sets the clock to that note's time;
// between taps it runs at the song's tempo and waits at the next untapped note, so the left hand keeps
// steady time when the player does and never runs ahead of them.
// The tonbak rides the same clock, so it keeps time with the player too.
let accList = [], accPtr = 0, accLap = 0, clockT = 0, clockOn = false, hasAcc = false;
function buildTiming(acc, meter) {
  let t0 = 0;
  for (const e of events) { e.t0 = t0; t0 += e.dur; }
  songLen = t0;
  accList = [];
  if (acc) { let at = 0; for (const a of acc) { if (!a.rest) accList.push({ at, notes: a.notes }); at += a.dur; } }
  hasAcc = accList.length > 0;
  if (meter) accList.push(...tonbakPart(meter));
  accList.sort((a, b) => a.at - b.at);
  accPtr = 0; accLap = 0; clockT = 0; clockOn = false;
}

// ---- tonbak
// Meter = the most common bar length (in beats) between the song's bar lines; a shorter or longer first
// bar is a pickup. Songs can also set `meter: n` (and `pickup`) themselves.
function detectMeter(s) {
  if (s.meter) return { len: s.meter, offset: s.pickup ? s.meter - s.pickup : 0 };
  const bars = s.notes.split('|').map(seg => { const p = parseSong(seg); return p.events ? totalBeats(p.events) : 0; }).filter(b => b > 0);
  if (bars.length < 3) return { len: 4, offset: 0 };
  const count = {};
  for (const b of bars.slice(1, -1)) count[b] = (count[b] || 0) + 1;
  const len = +Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  if (!(len >= 2 && len <= 12)) return { len: 4, offset: 0 };
  const pick = +(bars[0] % len).toFixed(3);
  return { len, offset: pick ? len - pick : 0 };
}
// strokes per bar: [beat, stroke, velocity]
const TONBAK = {
  2: [[0, 'tom', 1], [1, 'bak', 0.6]],
  3: [[0, 'tom', 1], [1, 'bak', 0.55], [2, 'bak', 0.62]],
  4: [[0, 'tom', 1], [1, 'bak', 0.6], [2, 'tom', 0.78], [2.5, 'bak', 0.35], [3, 'bak', 0.62]],
  6: [[0, 'tom', 1], [2, 'bak', 0.55], [3, 'tom', 0.75], [4, 'bak', 0.45], [5, 'bak', 0.6]],
  12: [[0, 'tom', 1], [2, 'bak', 0.5], [3, 'bak', 0.6], [5, 'bak', 0.45], [6, 'tom', 0.8], [8, 'bak', 0.5], [9, 'bak', 0.6], [11, 'bak', 0.45]],
};
function barPattern(n) {
  if (TONBAK[n]) return TONBAK[n];
  const p = [[0, 'tom', 1]];
  for (let k = 1; k < n; k++) p.push([k, n % 2 === 0 && k === n / 2 ? 'tom' : 'bak', n % 2 === 0 && k === n / 2 ? 0.75 : 0.5]);
  return p;
}
function tonbakPart({ len, offset }) {
  const out = [], pat = barPattern(len);
  // riz: a quick finger roll fills the last beat of every fourth bar, leading into the next downbeat
  const sub = baseSpeed > 3.5 ? 2 : 4;
  for (let bar = 0, start = -offset; start < songLen - 1e-9; bar++, start += len) {
    const fill = bar % 4 === 3;
    for (const [b, kind, vel] of pat) {
      if (fill && b >= len - 1) continue;
      const at = start + b;
      if (at >= -1e-9 && at < songLen - 1e-9) out.push({ at, drum: kind, vel });
    }
    if (fill) for (let i = 0; i < sub; i++) {
      const at = start + len - 1 + i / sub;
      if (at >= 0 && at < songLen - 1e-9) out.push({ at, drum: 'riz', vel: 0.35 + 0.5 * (i / sub) });
    }
  }
  return out;
}
let tonbakOn = store.get('nava.tonbak', true);
const tileTime = tl => tl.ev.t0 + (tl.lap - 1) * songLen;
const accAt = () => accList[accPtr].at + accLap * songLen;
function accNext() { if (++accPtr >= accList.length) { accPtr = 0; accLap++; } }
function runClock(dt) {
  if (!clockOn || !accList.length) return;
  const bps = speedNow() * rowBeat;
  const nt = nextTile();
  const limit = nt ? tileTime(nt) : Infinity;
  const target = Math.min(clockT + dt * bps, limit);
  // schedule a little ahead for sample-accurate timing, but never past the note the player owes us
  const horizon = Math.min(target + 0.15 * bps, limit);
  while (accAt() < horizon - 1e-9) {
    const a = accList[accPtr], delay = (accAt() - clockT) / bps;
    if (a.drum) Sound.drum(a.drum, a.vel * TONBAK_VEL, delay);
    else Sound.playAt(inst, a.notes, ACC_VEL, delay);
    accNext();
  }
  clockT = target;
}
function syncClock(T) {
  // the player moved on: drop what was queued for later and jump to the tapped note
  Sound.cancelPending();
  while (accAt() < T - 1e-9) accNext();
  clockT = T; clockOn = true;
}

function genTiles(untilRow) {
  while (genRow < untilRow) {
    if (genEvent >= events.length) {
      genEvent = 0; genLap++;
      tiles.push({ marker: genLap, b: genRow });
      genRow += 0.6;
    }
    const e = events[genEvent++];
    if (e.rest) { genRow += rows(e.dur); continue; }
    let col;
    do { col = (Math.random() * COLS) | 0; } while (col === lastCol);
    lastCol = col;
    const q = e.notes[0] % 1 ? quarterName(e.notes[0]) : null;
    tiles.push({ col, b: genRow, h: tileRows(e.dur), notes: e.notes, ev: e, tapped: false, tt: 0, lap: genLap, q });
    genRow += rows(e.dur);
  }
}

// tile screen rect: bottom at H - rowH*START_ROW - (b - pos)*rowH
const tileBottom = tl => H - B.rowH * START_ROW - (tl.b - pos) * B.rowH;
const nextTile = () => { while (nextIdx < tiles.length && (tiles[nextIdx].marker || tiles[nextIdx].tapped)) nextIdx++; return tiles[nextIdx]; };

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const ui = {
  menu: $('menu'), list: $('songList'), tabs: document.querySelectorAll('.tab'), addBtn: $('btnAdd'),
  hud: $('hud'), btnBack: $('btnBack'), score: $('score'), combo: $('combo'), overStats: $('overStats'), progFill: $('progFill'), progStars: document.querySelectorAll('#prog .st'), btnSound: $('btnSound'),
  pause: $('pause'), btnResume: $('btnResume'), btnQuit: $('btnQuit'),
  over: $('over'), overTitle: $('overTitle'), overScore: $('overScore'), overStars: $('overStars'), overBest: $('overBest'), newBest: $('newBest'),
  btnRetry: $('btnRetry'), btnSongs: $('btnSongs'),
  loading: $('loading'), loadBar: $('loadBar'),
  editor: $('editor'), edTitle: $('edTitle'), edNotes: $('edNotes'), edAccomp: $('edAccomp'), edSpeed: $('edSpeed'), edErr: $('edErr'),
  starTotal: $('starTotal'), daily: $('daily'), instPick: $('instPick'), lesson: $('lesson'), toast: $('toast'), overNews: $('overNews'),
  edFile: $('edFile'), edQuarter: $('edQuarter'), edImport: $('edImport'),
  splash: $('splash'), btnStart: $('btnStart'), help: $('help'), btnHelp: $('btnHelp'), btnHelpOk: $('btnHelpOk'),
  edInst: document.querySelectorAll('[data-inst]'), btnPreview: $('btnPreview'), btnSave: $('btnSave'), btnCancel: $('btnCancel'),
};
const show = (el, on) => { el.hidden = !on; };
let tab = store.get('nava.tab', 'classic');

// ---------------------------------------------------------------- progression
// Stars from the built-in songs (plus one per daily challenge) unlock harder songs and new instruments.
// Your own songs are never locked.
const INSTS = {
  piano: { name: 'پیانو', unlock: 0 },
  santur: { name: 'سنتور', unlock: 0 },
  tar: { name: 'تار', unlock: 5 },
  kamancheh: { name: 'کمانچه', unlock: 12 },
};
let instPick = store.get('nava.inst', 'auto'); // 'auto' = each song's own instrument
let inst = 'piano';                              // instrument of the song being played
let daily = store.get('nava.daily', {});
const totalStars = () => SONGS.reduce((a, s) => a + ((best[s.id] || {}).stars || 0), 0) + (daily.bonus || 0);
const songOpen = s => !s.unlock || totalStars() >= s.unlock;
const instOpen = i => totalStars() >= INSTS[i].unlock;
let toastT = 0;
function toast(text) {
  ui.toast.textContent = text; show(ui.toast, true);
  clearTimeout(toastT); toastT = setTimeout(() => show(ui.toast, false), 2200);
}

// Daily challenge: one song and one goal per day, the same for the whole day.
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const GOALS = [
  { t: 'combo', n: 15 }, { t: 'combo', n: 30 }, { t: 'perfect', n: 25 }, { t: 'acc', n: 80 }, { t: 'stars', n: 3 },
];
function goalText(g) {
  return g.t === 'combo' ? `به کمبوی ${faNum(g.n)} برس`
    : g.t === 'perfect' ? `${faNum(g.n)} ضربه‌ی «عالی» بزن`
    : g.t === 'acc' ? `دقت ریتم ${faNum(g.n)}٪ یا بیشتر (دست‌کم ۲۰ کاشی)`
    : 'سه ستاره بگیر';
}
function dailyToday() {
  const key = dayKey(new Date());
  if (daily.day !== key || !SONGS.some(s => s.id === daily.song)) {
    let h = 7;
    for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const pool = SONGS.filter(songOpen);
    daily = { ...daily, day: key, song: pool[h % pool.length].id, goal: GOALS[(h >>> 8) % GOALS.length], done: false };
    store.set('nava.daily', daily);
  }
  return daily;
}
const accuracy = () => hits ? Math.round((100 * (judged.perfect + judged.great * 0.6)) / hits) : 0;
function goalMet(g) {
  return g.t === 'combo' ? maxStreak >= g.n : g.t === 'perfect' ? judged.perfect >= g.n
    : g.t === 'acc' ? hits >= 20 && accuracy() >= g.n : starsFor() >= g.n;
}
function renderTop() {
  ui.starTotal.textContent = '★ ' + faNum(totalStars());
  const d = dailyToday(), s = SONGS.find(x => x.id === d.song);
  ui.daily.className = 'daily' + (d.done ? ' done' : '');
  ui.daily.innerHTML = `<span class="k">🎯 چالش امروز</span><b>${esc(s.title)}</b><small>${goalText(d.goal)}${d.done ? '' : ' · جایزه: ۱★'}</small>
    <span class="s">${d.done ? '✓' : d.streak && d.last === dayKey(new Date(Date.now() - 864e5)) ? `🔥<br>${faNum(d.streak)} روز` : ''}</span>`;
  ui.instPick.innerHTML = `<button data-tonbak class="tonbak${tonbakOn ? ' on' : ''}" aria-pressed="${tonbakOn}">🥁 تنبک</button><span class="sep"></span>` + [['auto', 'ساز آهنگ']].concat(Object.entries(INSTS).map(([k, v]) => [k, v.name])).map(([k, name]) => {
    const locked = k !== 'auto' && !instOpen(k);
    return `<button data-pick="${k}" class="${instPick === k ? 'on' : ''}${locked ? ' locked' : ''}">${locked ? `🔒 ${name} ${faNum(INSTS[k].unlock)}★` : name}</button>`;
  }).join('');
}
ui.daily.addEventListener('click', () => startSong(SONGS.find(x => x.id === dailyToday().song)));
ui.instPick.addEventListener('click', e => {
  if (e.target.closest('[data-tonbak]')) {
    tonbakOn = !tonbakOn; store.set('nava.tonbak', tonbakOn);
    if (tonbakOn) { Sound.init(); Sound.drum('tom', 0.6, 0); Sound.drum('bak', 0.45, 0.22); Sound.drum('bak', 0.5, 0.33); }
    toast(tonbakOn ? 'تنبک همراه روشن شد' : 'تنبک همراه خاموش شد');
    renderTop();
    return;
  }
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  const k = b.dataset.pick;
  if (k !== 'auto' && !instOpen(k)) { toast(`${INSTS[k].name} با ${faNum(INSTS[k].unlock)} ستاره باز می‌شود؛ ${faNum(INSTS[k].unlock - totalStars())} ستاره‌ی دیگر لازم است.`); return; }
  instPick = k; store.set('nava.inst', k);
  if (k !== 'auto') { Sound.init(); Sound.chime(k, [62, 66, 69], 0.12); }
  renderTop();
});

// Persian note names for the dastgah lesson and quarter-tone tiles
const FA_NOTE = { C: 'دو', D: 'ر', E: 'می', F: 'فا', G: 'سل', A: 'لا', B: 'سی' };
const FA_ACC = { '#': ' دیز', b: ' بمل', k: ' کُرن', s: ' سُری', '': '' };
const PC_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
function quarterName(m) {
  const up = Math.round(m + 0.5);
  return PC_LETTER[up % 12] ? FA_NOTE[PC_LETTER[up % 12]] + ' کُرن' : FA_NOTE[PC_LETTER[(up - 1) % 12]] + ' سُری';
}
function showLesson(s) {
  const d = s.dastgah;
  if (!d) { show(ui.lesson, false); return; }
  const chips = d.scale.split(/\s+/).map((tok, i) => {
    const [, L, a] = /^([A-G])(#|b|k|s)?/.exec(tok);
    const q = a === 'k' || a === 's';
    return `<span class="${q ? 'q' : ''}${i === 0 ? ' t' : ''}">${FA_NOTE[L]}${FA_ACC[a || '']}</span>`;
  }).join('');
  ui.lesson.innerHTML = `<h3>دستگاه ${esc(d.name)} <small>· پایه روی ${esc(d.tonic)}</small></h3>
    <div class="scale">${chips}</div><p>${esc(d.about)}</p>
    <div class="legend">نُت‌های فیروزه‌ای ربع‌پرده‌اند؛ روی کاشی‌شان هم نامشان نوشته شده.</div>`;
  show(ui.lesson, true);
}

const ICONS = {
  piano: '<svg viewBox="0 0 32 32"><rect x="3" y="7" width="26" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 7v18M16 7v18M22.5 7v18" stroke="currentColor" stroke-width="1.6"/><rect x="7.5" y="7" width="4" height="10" rx="1" fill="currentColor"/><rect x="14" y="7" width="4" height="10" rx="1" fill="currentColor"/><rect x="20.5" y="7" width="4" height="10" rx="1" fill="currentColor"/></svg>',
  tar: '<svg viewBox="0 0 32 32"><path d="M16 3v13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 3.5h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 15c-4.5 0-6.5 2.4-6.5 5.8 0 4 2.9 7.2 6.5 7.2s6.5-3.2 6.5-7.2c0-3.4-2-5.8-6.5-5.8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 17.5c-2 0-3 1.2-3 3M16 17.5c2 0 3 1.2 3 3" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>',
  kamancheh: '<svg viewBox="0 0 32 32"><path d="M16 2.5v12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="19.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 25.5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 11l22 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  santur: '<svg viewBox="0 0 32 32"><path d="M4 23 9 9h14l5 14z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 13h16M7 16.5h18M6 20h20" stroke="currentColor" stroke-width="1.2"/><path d="M11 4l4 7M21 4l-4 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const LEVELS = { 1: 'آسان', 2: 'متوسط', 3: 'سخت' };
const starsHtml = n => [0, 1, 2].map(i => `<span class="${i < n ? 'on' : ''}">★</span>`).join('');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderList() {
  renderTop();
  ui.tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  show(ui.addBtn, tab === 'mine');
  const list = allSongs().filter(s => s.cat === tab);
  if (!list.length) {
    ui.list.innerHTML = `<p class="empty"><span class="big">🎼</span>هنوز آهنگی نساخته‌ای.<br>با دکمه‌ی «ساختن آهنگ تازه» یک ملودی بنویس، مثلاً یک ترانه‌ی محلی ایرانی.</p>`;
    return;
  }
  ui.list.innerHTML = list.map(s => {
    const b = best[s.id] || { score: 0, stars: 0 };
    const lvl = s.level ? `<i class="lvl l${s.level}">${LEVELS[s.level]}</i>` : '';
    const locked = !songOpen(s);
    return `<button class="song ${s.inst}${locked ? ' locked' : ''}" data-id="${esc(s.id)}">
      <span class="ic">${ICONS[s.inst] || ICONS.piano}</span>
      <span class="meta"><b>${esc(s.title)}</b><small>${lvl}<span>${esc(s.by || (s.inst === 'santur' ? 'سنتور' : 'پیانو'))}</span></small></span>
      <span class="res">${locked ? `<span class="lock">🔒 ${faNum(s.unlock)}★</span>` : `<span class="stars">${starsHtml(b.stars)}</span><small>${b.score ? faNum(b.score) : ''}</small>`}
        ${s.cat === 'mine' ? `<span class="acts"><span class="edit" data-edit="${esc(s.id)}" aria-label="ویرایش">✎</span><span class="del" data-del="${esc(s.id)}" aria-label="حذف">×</span></span>` : ''}</span>
    </button>`;
  }).join('');
}

ui.tabs.forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; store.set('nava.tab', tab); renderList(); }));
ui.list.addEventListener('click', e => {
  const ed = e.target.closest('[data-edit]');
  if (ed) { e.stopPropagation(); openEditor(mine.find(m => m.id === ed.dataset.edit)); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const s = mine.find(m => m.id === del.dataset.del);
    if (s && confirm(`«${s.title}» حذف شود؟`)) { mine = mine.filter(m => m !== s); store.set('nava.mine', mine); renderList(); }
    return;
  }
  const card = e.target.closest('.song');
  if (!card) return;
  const s = allSongs().find(x => x.id === card.dataset.id);
  if (!songOpen(s)) {
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    toast(`با ${faNum(s.unlock)} ستاره باز می‌شود؛ ${faNum(s.unlock - totalStars())} ستاره‌ی دیگر از آهنگ‌های باز بگیر.`);
    return;
  }
  startSong(s);
});

function syncSound() { ui.btnSound.classList.toggle('muted', !Sound.enabled); }
ui.btnSound.addEventListener('click', () => { Sound.toggle(); syncSound(); });
syncSound();

ui.btnBack.addEventListener('click', () => { if (mode === 'play') pauseGame(); else if (mode === 'ready') toMenu(); });
ui.btnResume.addEventListener('click', resumeGame);
ui.btnQuit.addEventListener('click', toMenu);
ui.btnRetry.addEventListener('click', () => startSong(song));
ui.btnSongs.addEventListener('click', toMenu);

// splash (first tap also unlocks audio on phones) and the how-to-play card
function closeSplash() {
  if (ui.splash.hidden) return;
  Sound.init();
  show(ui.splash, false);
  if (!store.get('nava.helped', false)) { store.set('nava.helped', true); show(ui.help, true); }
}
ui.btnStart.addEventListener('click', closeSplash);
ui.btnHelp.addEventListener('click', () => show(ui.help, true));
ui.btnHelpOk.addEventListener('click', () => show(ui.help, false));
ui.help.addEventListener('click', e => { if (e.target === ui.help) show(ui.help, false); });

// ---------------------------------------------------------------- flow
async function startSong(s) {
  if (!s) return;
  Sound.init();
  song = s;
  const parsed = parseSong(s.notes);
  if (parsed.error !== undefined) return;
  events = parsed.events;
  rowBeat = s.rowBeat || 1;
  const acc = s.accomp ? parseSong(s.accomp).events : null;
  baseSpeed = (s.speed || 3) * (H > W ? 1 : 0.95);
  buildTiming(acc, tonbakOn ? detectMeter(s) : null);
  inst = instPick !== 'auto' && instOpen(instPick) ? instPick : s.inst;
  theme = inst === 'piano' ? THEMES.classic : THEMES.iranian;
  buildBg();
  show(ui.menu, false); show(ui.over, false); show(ui.pause, false);
  Confetti.clear();
  mode = 'loading';
  show(ui.loading, true);
  ui.loadBar.style.transform = 'scaleX(0)';
  const midis = events.concat(acc || []).flatMap(e => e.notes || []);
  await Sound.preload(inst, midis, p => { ui.loadBar.style.transform = `scaleX(${p})`; });
  show(ui.loading, false);
  tiles = []; nextIdx = 0; genRow = 0; genEvent = 0; genLap = 1; lastCol = -1;
  pos = 0; score = 0; hits = 0; hold = null; floats = [];
  streak = 0; maxStreak = 0; judged = { perfect: 0, great: 0, ok: 0 }; flash = 0; lap = 1; speedMul = 1; fail = null; ripples = [];
  genTiles(12);
  // a song that opens with rests: start with its first tile in the usual place, not above the screen
  const first = tiles.find(o => !o.marker);
  if (first) { pos = first.b; genTiles(pos + 12); }
  firstLapTiles = events.filter(e => !e.rest).length;
  hudScore = -1; hudProg = -1; hudStreak = -1;
  mode = 'ready';
  show(ui.hud, true);
  showLesson(s);
}

function toMenu() {
  mode = 'menu';
  show(ui.lesson, false);
  hold = null;
  Sound.cancelPending();
  show(ui.hud, false); show(ui.over, false); show(ui.pause, false); show(ui.loading, false);
  show(ui.menu, true);
  theme = THEMES[tab === 'iranian' ? 'iranian' : 'classic'];
  buildBg();
  renderList();
}

function pauseGame() { if (mode !== 'play') return; if (hold) endHold(false); mode = 'pause'; Sound.cancelPending(); show(ui.pause, true); }
function resumeGame() {
  if (mode !== 'pause') return;
  show(ui.pause, false);
  Sound.resume();
  mode = 'play';
}

const starsFor = () => Math.min(3, Math.floor((3 * hits) / firstLapTiles + 1e-9));

function triggerFail(kind, tile, x, y) {
  mode = 'fail'; failT = 0;
  fail = { kind, tile, x, y, fromPos: pos, toPos: pos };
  // scroll back so the missed tile sits just above the bottom edge
  if (kind === 'miss') fail.toPos = tile.b + START_ROW - 0.3;
  clockOn = false;
  if (hold) endHold(false);
  Sound.fail();
  if (navigator.vibrate) navigator.vibrate([50, 40, 80]);
}

function finishRun() {
  mode = 'over';
  const stars = starsFor();
  const starsBefore = totalStars();
  const prev = best[song.id] || { score: 0, stars: 0 };
  const isBest = score > prev.score;
  best[song.id] = { score: Math.max(prev.score, score), stars: Math.max(prev.stars, stars) };
  store.set('nava.best', best);
  const pick = a => a[(Math.random() * a.length) | 0];
  ui.overTitle.textContent = stars >= 3 ? (lap > 2 ? 'استادانه! 🏆' : pick(['شاهکار! 🤩', 'فوق‌العاده! 🌟', 'آفرین، عالی بود! 🎉']))
    : stars === 2 ? pick(['خیلی خوب بود! 😃', 'داری حرفه‌ای می‌شوی! 🎹'])
    : stars === 1 ? pick(['آفرین، ادامه بده! 💪', 'شروع خوبی بود! 🙂'])
    : pick(['اشکالی ندارد، دوباره امتحان کن! 🙂', 'یک بار دیگر؛ این بار بهتر می‌شود! 💪']);
  ui.overScore.textContent = faNum(score);
  ui.overStars.innerHTML = starsHtml(stars) + (lap > 1 ? `<em>دور ${faNum(lap)}</em>` : '');
  ui.overBest.textContent = faNum(best[song.id].score);
  const acc = accuracy();
  const news = [];
  const d = dailyToday();
  if (song.id === d.song && !d.done && goalMet(d.goal)) {
    const today = dayKey(new Date()), yest = dayKey(new Date(Date.now() - 864e5));
    daily = { ...d, done: true, streak: d.last === yest ? (d.streak || 0) + 1 : 1, last: today, bonus: (d.bonus || 0) + 1 };
    store.set('nava.daily', daily);
    news.push(`🎯 چالش امروز انجام شد! +۱★${daily.streak > 1 ? ` · ${faNum(daily.streak)} روز پشت‌سرهم 🔥` : ''}`);
  }
  const after = totalStars();
  for (const s of SONGS) if (s.unlock > starsBefore && s.unlock <= after) news.push(`🔓 آهنگ تازه باز شد: ${esc(s.title)}`);
  for (const k in INSTS) if (INSTS[k].unlock > starsBefore && INSTS[k].unlock <= after) news.push(`🔓 ساز تازه باز شد: ${INSTS[k].name}`);
  ui.overNews.innerHTML = news.join('<br>');
  show(ui.overNews, news.length > 0);
  ui.overStats.innerHTML = `عالی <b>${faNum(judged.perfect)}</b> · خوب <b>${faNum(judged.great)}</b> · بیشترین کمبو <b>${faNum(maxStreak)}</b><br>دقت ریتم <b>${faNum(acc)}٪</b>`;
  show(ui.newBest, isBest && score > 0);
  show(ui.hud, false); show(ui.over, true);
  if (stars > 0 || news.length) Confetti.burst(stars >= 3 ? 160 : stars === 2 ? 90 : 50);
  ui.btnRetry.disabled = true;
  setTimeout(() => { ui.btnRetry.disabled = false; }, 500);
}

// ---------------------------------------------------------------- input
canvas.addEventListener('pointerdown', e => {
  if (mode !== 'play' && mode !== 'ready') return;
  const x = e.clientX, y = e.clientY;
  if (x < B.x || x > B.x + B.w) return;
  const col = Math.floor((x - B.x) / B.colW);
  const tl = nextTile();
  if (!tl) return;
  const bottom = tileBottom(tl), top = bottom - tl.h * B.rowH;
  const slop = B.rowH * 0.3;
  if (col === tl.col && y >= top - slop && y <= bottom + slop) {
    hit(tl, x, y, e.pointerId);
  } else {
    // ignore taps on tiles already played
    for (const o of tiles) {
      if (o.marker || !o.tapped || o.col !== col) continue;
      const ob = tileBottom(o);
      if (y <= ob && y >= ob - o.h * B.rowH) return;
    }
    if (mode === 'ready') return;
    triggerFail('wrong', null, x, y);
  }
});

// Long tiles (longer than one row) must be held: the fill climbs to the finger as the tile slides down,
// the note sounds for as long as the finger stays, and holding to the top earns a bonus.
const isLong = tl => tl.h > 1.01;

// Timing: a tile is due when its bottom reaches the line one row above the screen's bottom edge
// (pos === tile.b), which is exactly when the song's rhythm wants it. On-time taps build the streak.
const POINTS = { perfect: 3, great: 2, ok: 1 };
const JUDGE_TEXT = { perfect: 'عالی!', great: 'خوب!' };
const STEPS = [[50, 4], [25, 3], [10, 2]];
const mult = () => { for (const [n, m] of STEPS) if (streak >= n) return m; return 1; };
function judge(tl) {
  const err = Math.abs(pos - tl.b) / speedNow(); // seconds early or late
  return err <= 0.1 ? 'perfect' : err <= 0.2 ? 'great' : 'ok';
}
function hit(tl, x, y, id) {
  if (hold) endHold(); // a new tile with another finger ends the previous hold
  tl.tapped = true; tl.tt = 0;
  hits++;
  const j = mode === 'ready' ? 'perfect' : judge(tl);
  judged[j]++;
  if (j === 'ok') streak = 0;
  else {
    const before = mult();
    streak++; maxStreak = Math.max(maxStreak, streak);
    if (mult() > before) { flash = 1; Sound.chime(inst, [tl.notes[0] + 12, tl.notes[0] + 19], 0.07); }
  }
  score += POINTS[j] * mult();
  if (tl.q) floats.push({ x, y: y - B.rowH * 0.8, t: 0, text: tl.q, j: 'q' });
  if (j !== 'ok' && mode !== 'ready') floats.push({ x, y: y - B.rowH * 0.35, t: 0, text: JUDGE_TEXT[j], j });
  if (tl.lap > lap) { lap = tl.lap; speedMul = Math.pow(1.14, lap - 1); Sound.chime(inst, [tl.notes[0] + 12]); }
  if (accList.length) syncClock(tileTime(tl));
  const voices = Sound.play(inst, tl.notes, 0.95, hasAcc ? 0.8 : 0.62);
  if (isLong(tl)) {
    // rows between the tile's bottom and the touch point: the fill starts there, under the finger
    const off = clamp((tileBottom(tl) - y) / B.rowH, 0, tl.h);
    hold = { tl, id, voices, off, p0: pos };
    tl.fill = off; tl.holding = true;
  }
  ripples.push({ x, y, t: 0, col: tl.col });
  if (mode === 'ready') { mode = 'play'; show(ui.lesson, false); }
  nextIdx++;
  runClock(0);
}

function endHold(done) {
  const { tl, voices } = hold;
  hold = null;
  tl.holding = false; tl.tt = 0;
  if (done) {
    tl.full = true;
    const bonus = Math.max(1, Math.round(tl.h - 1)) * mult();
    score += bonus;
    const bx = B.x + (tl.col + 0.5) * B.colW, by = tileBottom(tl) - tl.h * B.rowH;
    floats.push({ x: bx, y: Math.max(40, by), t: 0, text: '+' + faNum(bonus) });
    ripples.push({ x: bx, y: Math.max(40, by), t: 0, col: tl.col });
  } else {
    Sound.release(voices);
  }
}
const liftHold = e => { if (hold && hold.id === e.pointerId) endHold(false); };
window.addEventListener('pointerup', liftHold);
window.addEventListener('pointercancel', liftHold);

window.addEventListener('keyup', e => { if (hold && hold.id === e.code) endHold(false); });
window.addEventListener('keydown', e => {
  if ((mode === 'play' || mode === 'ready') && ['KeyD', 'KeyF', 'KeyJ', 'KeyK'].includes(e.code)) {
    const col = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'].indexOf(e.code);
    const tl = nextTile();
    if (!tl) return;
    const bottom = tileBottom(tl);
    if (e.repeat) { e.preventDefault(); return; }
    if (col === tl.col) hit(tl, B.x + (col + 0.5) * B.colW, bottom - B.rowH * 0.5, e.code);
    else if (mode === 'play') triggerFail('wrong', null, B.x + (col + 0.5) * B.colW, bottom - B.rowH * 0.5);
    e.preventDefault();
  } else if (!ui.splash.hidden && (e.code === 'Enter' || e.code === 'Space')) {
    closeSplash(); e.preventDefault();
  } else if (e.code === 'Escape') {
    if (!ui.help.hidden) show(ui.help, false);
    else if (mode === 'play') pauseGame(); else if (mode === 'pause') resumeGame();
  } else if (e.code === 'Space' && mode === 'over' && !ui.btnRetry.disabled) { startSong(song); e.preventDefault(); }
});

// ---------------------------------------------------------------- editor (my songs)
let edInst = 'santur', previewTimer = null, editingId = null;
function openEditor(s) {
  editingId = s ? s.id : null;
  ui.edTitle.value = s ? s.title : '';
  ui.edNotes.value = s ? s.notes : '';
  ui.edAccomp.value = s ? s.accomp || '' : '';
  ui.edSpeed.value = s ? s.speed : 3;
  ui.edErr.textContent = '';
  importMsg(IMPORT_HINT);
  setInst(s ? s.inst : 'santur');
  show(ui.editor, true);
}
function setInst(i) { edInst = i; ui.edInst.forEach(b => b.classList.toggle('on', b.dataset.inst === i)); }
ui.edInst.forEach(b => b.addEventListener('click', () => setInst(b.dataset.inst)));
ui.addBtn.addEventListener('click', () => openEditor(null));
ui.btnCancel.addEventListener('click', () => { stopPreview(); show(ui.editor, false); });

const totalBeats = ev => ev.reduce((a, e) => a + e.dur, 0);
const fmtBeats = b => (Math.round(b * 100) / 100).toLocaleString('fa-IR');
// Returns { mel, acc } or null (and shows the problem) when either line cannot be used.
function validate() {
  const p = parseSong(ui.edNotes.value);
  if (p.error !== undefined) {
    ui.edErr.textContent = p.error ? `ملودی: این بخش را نفهمیدم «${p.error}»` : 'دست‌کم یک نُت ملودی بنویس.';
    return null;
  }
  let acc = null;
  if (ui.edAccomp.value.trim()) {
    const a = parseSong(ui.edAccomp.value);
    if (a.error !== undefined) {
      ui.edErr.textContent = a.error ? `همراهی: این بخش را نفهمیدم «${a.error}»` : 'همراهی فقط سکوت دارد.';
      return null;
    }
    const tm = totalBeats(p.events), ta = totalBeats(a.events);
    if (Math.abs(tm - ta) > 1e-6) {
      ui.edErr.textContent = `طول همراهی (${fmtBeats(ta)} ضرب) با ملودی (${fmtBeats(tm)} ضرب) برابر نیست.`;
      return null;
    }
    acc = a.events;
  }
  ui.edErr.textContent = '';
  return { mel: p.events, acc };
}
function stopPreview() {
  clearTimeout(previewTimer); previewTimer = null;
  Sound.cancelPending();
  ui.btnPreview.textContent = 'شنیدن';
}
// Plays both lines on their shared timeline at the tempo the speed slider implies.
ui.btnPreview.addEventListener('click', async () => {
  if (previewTimer) { stopPreview(); return; }
  const v = validate();
  if (!v) return;
  Sound.init();
  ui.btnPreview.textContent = '…';
  await Sound.preload(edInst, v.mel.concat(v.acc || []).flatMap(e => e.notes || []));
  const secPerBeat = 1 / (+ui.edSpeed.value || 3); // one beat = one row
  const schedule = (evs, vel) => { let at = 0; for (const e of evs) { if (!e.rest) Sound.playAt(edInst, e.notes, vel, at * secPerBeat); at += e.dur; } return at; };
  const len = schedule(v.mel, 0.95);
  if (v.acc) schedule(v.acc, ACC_VEL);
  ui.btnPreview.textContent = 'توقف';
  previewTimer = setTimeout(stopPreview, len * secPerBeat * 1000 + 300);
});
// ---- file -> notes (runs locally, see convert.js)
const IMPORT_HINT = ui.edImport.textContent;
function importMsg(text, cls = '') { ui.edImport.textContent = text; ui.edImport.className = 'hint' + (cls ? ' ' + cls : ''); }
ui.edFile.addEventListener('change', async () => {
  const file = ui.edFile.files[0];
  ui.edFile.value = '';
  if (!file) return;
  stopPreview();
  const isMidi = /\.midi?$/i.test(file.name) || /midi/.test(file.type);
  const box = ui.edFile.parentElement;
  box.classList.add('busy');
  const STEPS = { load: 'آماده کردن شنونده…', decode: 'خواندن فایل…', listen: 'گوش دادن و نُت‌نویسی' };
  try {
    const r = isMidi ? await Convert.fromMidi(file)
      : await Convert.fromAudio(file, { quarterTones: ui.edQuarter.checked }, (st, p) =>
        importMsg(STEPS[st] + (st === 'listen' ? ` ${faNum(Math.round(p * 100))}٪` : '')));
    if (!ui.edTitle.value.trim()) ui.edTitle.value = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
    ui.edNotes.value = r.melody;
    ui.edAccomp.value = r.accomp;
    ui.edSpeed.value = r.speed;
    ui.edErr.textContent = '';
    importMsg(`${faNum(r.count)} نُت ملودی${r.accomp ? ' + همراهی' : ''} · تمپو حدود ${faNum(r.bpm)}` +
      (r.cut ? ' · فقط ۲:۳۰ دقیقه‌ی اول' : '') + '. نُت‌نویسی خودکار تقریبی است؛ با «شنیدن» گوش کن و اگر لازم بود دستی درستش کن.', 'ok');
  } catch (e) {
    importMsg(e.message === 'decode' ? 'این فایل را نتوانستم بخوانم. mp3، wav، m4a، ogg یا MIDI امتحان کن.'
      : e.message === 'empty' ? 'نُتی در این فایل پیدا نشد.'
      : e.message === 'lib' ? 'بارگذاری ابزار نُت‌نویسی نشد؛ اتصال را بررسی کن و دوباره امتحان کن.'
      : 'تبدیل ناموفق بود: ' + e.message, 'bad');
  } finally {
    box.classList.remove('busy');
  }
});

ui.btnSave.addEventListener('click', () => {
  const v = validate();
  if (!v) return;
  const title = ui.edTitle.value.trim() || 'آهنگ من';
  const data = {
    title, inst: edInst, speed: clamp(+ui.edSpeed.value || 3, 1.5, 6),
    notes: ui.edNotes.value.trim(), accomp: ui.edAccomp.value.trim() || undefined,
    by: edInst === 'santur' ? 'سنتور · ساخته‌ی شما' : 'پیانو · ساخته‌ی شما',
  };
  const existing = mine.find(m => m.id === editingId);
  if (existing) Object.assign(existing, data);
  else mine.push({ id: 'u' + Date.now(), ...data });
  store.set('nava.mine', mine);
  stopPreview();
  show(ui.editor, false);
  renderList();
});

// ---------------------------------------------------------------- update
function update(dt) {
  t += dt;
  for (const r of ripples) r.t += dt;
  ripples = ripples.filter(r => r.t < 0.5);
  for (const tl of tiles) if (tl.tapped && !tl.holding) tl.tt += dt;
  for (const f of floats) f.t += dt;
  flash = Math.max(0, flash - dt * 1.8);
  floats = floats.filter(f => f.t < 0.9);

  if (mode === 'play') {
    pos += speedNow() * dt;
    runClock(dt);
    if (hold) {
      hold.tl.fill = Math.min(hold.tl.h, hold.off + pos - hold.p0);
      if (hold.tl.fill >= hold.tl.h - 0.02) endHold(true);
    }
    genTiles(pos + 10);
    const tl = nextTile();
    // missed: the tile slid half-way off the bottom untapped
    if (tl && tileBottom(tl) - tl.h * B.rowH * 0.5 > H) triggerFail('miss', tl);
    // drop tiles that are long gone
    let cut = 0;
    while (cut < nextIdx && tileBottom(tiles[cut]) - (tiles[cut].h || 0) * B.rowH > H + B.rowH) cut++;
    if (cut > 16) { tiles.splice(0, cut); nextIdx -= cut; }
  } else if (mode === 'fail') {
    failT += dt;
    if (fail.kind === 'miss') {
      const k = Math.min(1, failT / 0.35);
      pos = lerp(fail.fromPos, fail.toPos, 1 - Math.pow(1 - k, 3));
    }
    if (failT > 1.3) finishRun();
  } else if (mode === 'menu') {
    if (Math.random() < dt * 1.6) menuTiles.push({ col: (Math.random() * COLS) | 0, y: -B.rowH, v: rand(60, 110), h: Math.random() < 0.3 ? 2 : 1 });
    for (const m of menuTiles) m.y += m.v * dt;
    menuTiles = menuTiles.filter(m => m.y < H + B.rowH);
  }
}
// ---------------------------------------------------------------- render
const tileColor = col => theme.tiles[((col % COLS) + COLS) % COLS];
// Candy tile: lane colour gradient, a darker lip at the bottom for a chunky 3-D feel, a glossy top band
// and a music-note (or khatam star for Iranian songs) on the playable part.
function drawTile(x, y, w, h, tl, alpha, col) {
  const pad = 3, r = Math.min(16, w * 0.16);
  const [c1, c2, lip] = tileColor(tl ? tl.col : col);
  const ix = x + pad, iw = w - pad * 2, iy = y + pad, ih = h - pad * 2;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = lip;
  rrect(ctx, ix, iy + 4, iw, ih - 4, r); ctx.fill();
  const grd = ctx.createLinearGradient(0, iy, 0, iy + ih);
  grd.addColorStop(0, c1); grd.addColorStop(1, c2);
  ctx.fillStyle = grd;
  rrect(ctx, ix, iy, iw, ih - 5, r); ctx.fill();
  ctx.globalAlpha = alpha * 0.28; ctx.fillStyle = '#fff';
  rrect(ctx, ix + 5, iy + 5, iw - 10, Math.min(16, ih * 0.16), r * 0.6); ctx.fill();
  // symbol in the bottom row (where the finger goes)
  const rowH = Math.min(h, B.rowH);
  const cx = x + w / 2, cy = y + h - rowH / 2 - 2;
  if (!(tl && tl.h > 1.01)) {
    ctx.globalAlpha = alpha * 0.9; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    if (theme === THEMES.iranian) {
      const s = Math.min(w, rowH) * 0.17; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU - Math.PI / 2, rr = i % 2 ? s * 0.55 : s; i ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.stroke();
    } else {
      ctx.font = `900 ${Math.round(Math.min(w * 0.34, rowH * 0.34, 40))}px Vazirmatn, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♪', cx, cy);
    }
  }
  if (tl && tl.q) {
    // quarter-tone tile: its Persian name, so players learn where koron and sori fall
    ctx.globalAlpha = alpha; ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(Math.min(w * 0.17, 15))}px Vazirmatn, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tl.q, x + w / 2, y + Math.min(h, B.rowH) * 0.26);
  }
  if (tl && tl.h > 1.01) {
    ctx.globalAlpha = alpha * 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.setLineDash([2, 9]);
    ctx.beginPath(); ctx.moveTo(cx, y + B.rowH * 0.3); ctx.lineTo(cx, y + h - B.rowH * 0.5 - 16); ctx.stroke();
    ctx.setLineDash([]);
    // "hold" marker: a ring where the finger goes down
    ctx.globalAlpha = alpha * 0.95; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, y + h - B.rowH * 0.5, Math.min(w * 0.16, 14), 0, TAU); ctx.stroke();
    ctx.font = `800 ${Math.round(Math.min(w * 0.13, 13))}px Vazirmatn, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText('نگه دار', cx, y + h - B.rowH * 0.5 + Math.min(w * 0.16, 14) + 12);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(bgC, 0, 0, W, H);

  // lanes
  ctx.fillStyle = 'rgba(255,255,255,.38)';
  ctx.fillRect(B.x, 0, B.w, H);
  ctx.strokeStyle = theme.line; ctx.lineWidth = 1.5;
  for (let i = 0; i <= COLS; i++) { const x = Math.round(B.x + i * B.colW) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

  if (mode === 'menu') {
    for (const m of menuTiles) drawTile(B.x + m.col * B.colW, m.y, B.colW, B.rowH * m.h, null, 0.3, m.col);
    return;
  }
  if (mode === 'loading') return;

  // the lanes warm up as the streak grows, and flash when the multiplier steps up
  const heat = Math.min(1, streak / 50);
  if (heat > 0 || flash > 0) {
    const g = ctx.createLinearGradient(0, H, 0, H * 0.35);
    g.addColorStop(0, theme.hit); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = heat * 0.16 + flash * 0.35; ctx.fillStyle = g;
    ctx.fillRect(B.x, H * 0.35, B.w, H * 0.65);
    ctx.globalAlpha = 1;
  }
  // beat line: a tile landing its bottom edge here is exactly on the beat
  const ly = H - B.rowH * START_ROW;
  ctx.globalAlpha = 0.3 + heat * 0.3 + flash * 0.4; ctx.strokeStyle = theme.beat; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.moveTo(B.x, ly); ctx.lineTo(B.x + B.w, ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  for (const tl of tiles) {
    const bottom = tileBottom(tl);
    if (tl.marker) {
      if (bottom < -20 || bottom > H + 20) continue;
      ctx.fillStyle = theme.beat; ctx.globalAlpha = 0.9;
      ctx.font = `900 ${Math.round(Math.min(B.rowH * 0.14, 26))}px Vazirmatn, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`🚀 دور ${faNum(tl.marker)} · سریع‌تر!`, B.x + B.w / 2, bottom - B.rowH * 0.3);
      ctx.globalAlpha = 1;
      continue;
    }
    const h = tl.h * B.rowH, top = bottom - h;
    if (bottom < 0 || top > H) continue;
    const x = B.x + tl.col * B.colW;
    if (tl.holding) {
      drawTile(x, top, B.colW, h, tl, 1);
      const fh = tl.fill * B.rowH;
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff';
      rrect(ctx, x + 6, bottom - fh + 1, B.colW - 12, fh - 9, 12); ctx.fill();
      ctx.globalAlpha = 0.9 + Math.sin(t * 18) * 0.1; ctx.fillStyle = theme.hit;
      ctx.beginPath(); ctx.arc(x + B.colW / 2, bottom - fh + 8, Math.min(B.colW * 0.12, 9), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (tl.tapped) {
      const a = Math.max(0, (tl.full ? 0.7 : 0.45) - tl.tt * 0.9);
      if (a > 0) {
        ctx.globalAlpha = a; ctx.fillStyle = tileColor(tl.col)[0];
        rrect(ctx, x + 3, top + 3, B.colW - 6, h - 6, 14); ctx.fill();
        ctx.globalAlpha = 1;
      }
      continue;
    }
    let alpha = 1;
    if (fail && fail.tile === tl) {
      const blink = Math.sin(failT * 22) > 0;
      drawTile(x, top, B.colW, h, tl, 1);
      if (blink) { ctx.globalAlpha = 0.8; ctx.fillStyle = '#ef4461'; rrect(ctx, x + 3, top + 3, B.colW - 6, h - 6, 14); ctx.fill(); ctx.globalAlpha = 1; }
      continue;
    }
    drawTile(x, top, B.colW, h, tl, alpha);
    if (mode === 'ready' && tl === tiles.find(o => !o.marker)) {
      // pulsing "start" badge on the first tile
      const pulse = 1 + Math.sin(t * 5) * 0.06;
      const bw = Math.min(B.colW * 0.8, 110), bh = Math.min(B.rowH * 0.3, 40);
      ctx.save(); ctx.translate(x + B.colW / 2, bottom - B.rowH / 2); ctx.scale(pulse, pulse);
      ctx.fillStyle = '#fff'; rrect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = tileColor(tl.col)[1];
      ctx.font = `900 ${Math.round(Math.min(B.colW * 0.2, 22))}px Vazirmatn, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('شروع 👆', 0, 1);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // wrong tap
  if (fail && fail.kind === 'wrong') {
    const col = Math.floor((fail.x - B.x) / B.colW);
    const blink = Math.sin(failT * 22) > 0;
    ctx.globalAlpha = blink ? 0.8 : 0.4; ctx.fillStyle = '#ef4461';
    rrect(ctx, B.x + col * B.colW + 3, fail.y - B.rowH / 2 + 3, B.colW - 6, B.rowH - 6, 14); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ripples
  for (const r of ripples) {
    const k = r.t / 0.5;
    ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = tileColor(r.col)[1]; ctx.lineWidth = 5 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, 10 + k * B.colW * 0.6, 0, TAU); ctx.stroke();
  }
  // hold bonuses
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(Math.min(B.colW * 0.3, 32))}px Vazirmatn, sans-serif`;
  ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
  for (const f of floats) {
    ctx.globalAlpha = 1 - f.t / 0.9;
    ctx.fillStyle = f.j === 'perfect' ? '#f7731d' : f.j === 'great' ? '#2453a6' : f.j === 'q' ? '#0f766e' : theme.text;
    const sc = f.j ? 0.75 + Math.min(1, f.t * 8) * 0.25 : 1;
    ctx.save(); ctx.translate(f.x, f.y - f.t * 50); ctx.scale(sc, sc); ctx.strokeText(f.text, 0, 0); ctx.fillText(f.text, 0, 0); ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- HUD
let hudScore = -1, hudProg = -1, hudStreak = -1;
function updateHud() {
  if (mode !== 'play' && mode !== 'ready' && mode !== 'fail') return;
  if (score !== hudScore) { hudScore = score; ui.score.textContent = faNum(score); }
  if (streak !== hudStreak) {
    const m = mult();
    ui.combo.innerHTML = streak >= 3 ? `کمبو <b>${faNum(streak)}</b>${m > 1 ? `<i>×${faNum(m)}</i>` : ''}` : '';
    ui.combo.classList.toggle('on', streak >= 3);
    if (streak > hudStreak && streak >= 3 && (streak % 5 === 0 || STEPS.some(([n]) => n === streak))) {
      ui.combo.classList.remove('pop'); void ui.combo.offsetWidth; ui.combo.classList.add('pop');
    }
    hudStreak = streak;
  }
  const prog = Math.min(1, hits / firstLapTiles);
  if (prog !== hudProg) {
    hudProg = prog;
    ui.progFill.style.transform = `scaleX(${prog})`;
    ui.progStars.forEach((s, i) => s.classList.toggle('on', prog >= (i + 1) / 3 - 1e-9));
  }
}

// ---------------------------------------------------------------- confetti (results screen)
const Confetti = (() => {
  const c = document.getElementById('fx'), g = c.getContext('2d');
  const COLORS = ['#f7941d', '#2453a6', '#8b5cf6', '#22c55e', '#ff5fa2', '#ffc93c', '#14b8a6'];
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let parts = [], clean = true;
  function size() { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); clean = true; }
  function burst(n) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * rand(0.45, 0.8),
        vx: (fromLeft ? 1 : -1) * rand(180, 520), vy: -rand(380, 820),
        r: rand(0, TAU), vr: rand(-8, 8), w: rand(7, 13), h: rand(4, 8),
        col: COLORS[i % COLORS.length], life: rand(2.2, 3.4), t: 0,
      });
    }
  }
  function step(dt) {
    if (!parts.length && clean) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    clean = !parts.length;
    if (clean) return;
    for (const p of parts) {
      p.t += dt; p.vy += 900 * dt; p.vx *= 1 - 0.9 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      g.globalAlpha = Math.max(0, Math.min(1, (p.life - p.t) / 0.5));
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7))); g.restore();
    }
    g.globalAlpha = 1;
    parts = parts.filter(p => p.t < p.life && p.y < H + 40);
  }
  return { size, burst, step, clear: () => { parts = []; } };
})();

// ---------------------------------------------------------------- lifecycle
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pauseGame(); Sound.suspend(); }
  else Sound.resume();
});
window.addEventListener('resize', () => { resize(); Confetti.size(); });
window.addEventListener('orientationchange', () => setTimeout(() => { resize(); Confetti.size(); }, 250));
window.addEventListener('contextmenu', e => e.preventDefault());
// block page scrolling over the game, but let menus and panels that do not fit the screen scroll
document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll, textarea, .panel')) e.preventDefault(); }, { passive: false });

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) return;
  if (mode !== 'pause') update(dt);
  render();
  Confetti.step(dt);
  updateHud();
}

resize();
Confetti.size();
toMenu();
// canvas text uses the web font: redraw the background once it is ready
if (document.fonts && document.fonts.load) document.fonts.load('900 20px Vazirmatn').then(buildBg, () => {});
requestAnimationFrame(frame);
})();
