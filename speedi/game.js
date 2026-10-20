(() => {
'use strict';

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
};
const shade = (hex, amt) => {
  const f = amt < 0 ? v => v * (1 + amt) : v => v + (255 - v) * amt;
  const [r, g, b] = hexRgb(hex);
  return `rgb(${f(r) | 0},${f(g) | 0},${f(b) | 0})`;
};
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  return [c, c.getContext('2d')];
};
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const faNum = n => Math.round(n).toLocaleString('fa-IR');

// ---------------------------------------------------------------- world constants
const SEG = 200;              // segment length (world units)
const ROAD_W = 2000;          // half road width
const DRAW = 220;             // segments drawn ahead
const RUMBLE = 3;             // segments per colour band
const CAR_W = 860;
const CAR_LEN = 950;
const LANES = [-2 / 3, 0, 2 / 3];
const EDGE = 0.86;            // max |playerX| before hitting the rail
const STEER = 2.4;
const CENTRIFUGAL = 0.11;
const FOLLOW = 0.72;          // how much the camera follows the car sideways
const BASE_SPEED = 11000;
const MAX_BASE_SPEED = 16000;
const NITRO_MULT = 1.45;
const NITRO_TIME = 2.8;
const KMH = 0.018;
const LAMP_W = 800;
const FOG = '#3a1450';
const FOG_STEPS = 48;
const FOG_DENSITY = 3.4;

// ---------------------------------------------------------------- canvas & metrics
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, dpr = 1, dprCap = Math.min(window.devicePixelRatio || 1, 2);
let horizonY, yP, F, PZ, CAM_H;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const portrait = H > W * 1.05;
  horizonY = H * (portrait ? 0.4 : 0.47);
  yP = H * (portrait ? 0.9 : 0.93);
  const halfRoadPx = portrait ? W * 0.58 : Math.min(W * 0.42, H * 0.9);
  F = portrait ? W * 0.95 : W * 0.6;
  PZ = F * ROAD_W / halfRoadPx;
  CAM_H = (yP - horizonY) * ROAD_W / halfRoadPx;
  buildBackground();
}

// ---------------------------------------------------------------- palette (pre-mixed with fog)
const fogRamp = hex => Array.from({ length: FOG_STEPS + 1 }, (_, i) => mix(hex, FOG, i / FOG_STEPS));
const PAL = {
  ground: [fogRamp('#150b28'), fogRamp('#1a0e30')],
  road: [fogRamp('#2c2842'), fogRamp('#28243c')],
  rumble: [fogRamp('#ff2e88'), fogRamp('#f1e8ff')],
  lane: fogRamp('#dcd4ff'),
  edge: fogRamp('#39f3ff'),
};

// ---------------------------------------------------------------- track
const segs = [];
const segAt = i => segs[((i % segs.length) + segs.length) % segs.length];

function buildTrack() {
  const lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0);
  const add = (curve, y) => segs.push({ curve, y1: lastY(), y2: y, sp: [], lamp: false });
  const easeIn = (a, b, p) => a + (b - a) * p * p;
  const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
  const road = (enter, hold, leave, curve, hill) => {
    const y0 = lastY(), y1 = y0 + hill * SEG, tot = enter + hold + leave;
    for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), easeInOut(y0, y1, n / tot));
    for (let n = 0; n < hold; n++) add(curve, easeInOut(y0, y1, (enter + n) / tot));
    for (let n = 0; n < leave; n++) add(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n) / tot));
  };

  road(40, 60, 40, 0, 0);
  for (let k = 0; k < 34; k++) {
    const len = 30 + ((Math.random() * 50) | 0);
    let hill = pick([0, 0, 0, 12, -12, 24, -24]);
    if (Math.abs(lastY() / SEG + hill) > 40) hill = -hill;
    road(len, len + ((Math.random() * 40) | 0), len, pick([0, 0, 1.5, -1.5, 3, -3, 4.5, -4.5]), hill);
  }
  road(60, 40, 60, 0, -lastY() / SEG);
  road(40, 40, 40, 0, 0);
  segs[segs.length - 1].y2 = 0;

  segs.forEach((s, i) => {
    if (i % 12 === 0) {
      s.lamp = true;
      s.sp.push({ k: 'lampL', o: -1.14, w: LAMP_W }, { k: 'lampR', o: 1.14, w: LAMP_W });
    } else if (i % 6 === 0 && Math.random() < 0.75) {
      s.sp.push({ k: Math.random() < 0.5 ? 'palmA' : 'palmB', o: (Math.random() < 0.5 ? -1 : 1) * rand(1.55, 2.6), w: 1500 * rand(0.85, 1.2) });
    }
    if (Math.random() < 0.05) {
      s.sp.push({ k: Math.random() < 0.5 ? 'palmA' : 'palmB', o: (Math.random() < 0.5 ? -1 : 1) * rand(2.8, 4.5), w: 1500 * rand(0.9, 1.3) });
    }
  });
}

// ---------------------------------------------------------------- art (pre-rendered sprites)
const ART = {};

function mirror(sp) {
  const [c, g] = mk(sp.c.width, sp.c.height);
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(sp.c, 0, 0);
  return { c, ax: c.width - sp.ax, ay: sp.ay, cw: sp.cw };
}

function radial(size, stops) {
  const [c, g] = mk(size, size);
  const r = size / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return c;
}

function carShadow(g, X, Y, CW) {
  g.save();
  g.translate(X(0.5), Y(0.985)); g.scale(1, 0.13);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, CW * 0.62);
  rg.addColorStop(0, 'rgba(0,0,0,.7)'); rg.addColorStop(0.7, 'rgba(0,0,0,.45)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, CW * 0.62, 0, Math.PI * 2); g.fill();
  g.restore();
}

function makeTraffic(color, type) {
  const T = {
    sedan: { h: 0.52, roof: 0.05, belt: 0.45, tIn: 0.2, bIn: 0.1, lights: 'h' },
    hatch: { h: 0.58, roof: 0.05, belt: 0.5, tIn: 0.17, bIn: 0.08, lights: 'v' },
    suv: { h: 0.68, roof: 0.04, belt: 0.52, tIn: 0.1, bIn: 0.05, lights: 'v' },
  }[type];
  const CW = 260, pad = 32, HC = CW * T.h;
  const [c, g] = mk(CW + pad * 2, HC + pad * 2);
  const X = u => pad + u * CW, Y = v => pad + v * HC;

  carShadow(g, X, Y, CW);
  g.fillStyle = '#07070b';
  rrect(g, X(0.06), Y(0.72), CW * 0.17, HC * 0.28, 6); g.fill();
  rrect(g, X(0.77), Y(0.72), CW * 0.17, HC * 0.28, 6); g.fill();

  const bodyTop = T.belt - 0.05;
  let lg = g.createLinearGradient(0, Y(bodyTop), 0, Y(0.9));
  lg.addColorStop(0, shade(color, 0.28)); lg.addColorStop(0.35, color); lg.addColorStop(1, shade(color, -0.6));
  g.fillStyle = lg;
  rrect(g, X(0.015), Y(bodyTop), CW * 0.97, Y(0.9) - Y(bodyTop), CW * 0.06); g.fill();

  lg = g.createLinearGradient(0, Y(T.roof), 0, Y(T.belt));
  lg.addColorStop(0, shade(color, 0.1)); lg.addColorStop(1, shade(color, -0.35));
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(X(T.bIn), Y(T.belt));
  g.lineTo(X(T.tIn), Y(T.roof + 0.04));
  g.quadraticCurveTo(X(T.tIn + 0.01), Y(T.roof), X(T.tIn + 0.06), Y(T.roof));
  g.lineTo(X(1 - T.tIn - 0.06), Y(T.roof));
  g.quadraticCurveTo(X(1 - T.tIn - 0.01), Y(T.roof), X(1 - T.tIn), Y(T.roof + 0.04));
  g.lineTo(X(1 - T.bIn), Y(T.belt));
  g.closePath(); g.fill();

  // rear window with reflection
  const wi = 0.05;
  g.save();
  g.beginPath();
  g.moveTo(X(T.bIn + wi), Y(T.belt - 0.03));
  g.lineTo(X(T.tIn + wi * 0.8), Y(T.roof + 0.07));
  g.lineTo(X(1 - T.tIn - wi * 0.8), Y(T.roof + 0.07));
  g.lineTo(X(1 - T.bIn - wi), Y(T.belt - 0.03));
  g.closePath();
  lg = g.createLinearGradient(0, Y(T.roof), 0, Y(T.belt));
  lg.addColorStop(0, '#39406a'); lg.addColorStop(1, '#0b0e1d');
  g.fillStyle = lg; g.fill(); g.clip();
  g.fillStyle = 'rgba(255,255,255,.09)';
  g.beginPath(); g.moveTo(X(0.3), Y(0)); g.lineTo(X(0.45), Y(0)); g.lineTo(X(0.3), Y(T.belt)); g.lineTo(X(0.15), Y(T.belt)); g.fill();
  g.restore();

  g.strokeStyle = shade(color, -0.5); g.lineWidth = 2;
  g.beginPath(); g.moveTo(X(0.05), Y(T.belt + 0.03)); g.lineTo(X(0.95), Y(T.belt + 0.03)); g.stroke();

  // tail lights
  g.save();
  g.shadowColor = '#ff1030'; g.shadowBlur = 22; g.fillStyle = '#ff2640';
  const lights = T.lights === 'h'
    ? [[0.04, T.belt + 0.07, 0.24, 0.1], [0.72, T.belt + 0.07, 0.24, 0.1]]
    : [[0.035, T.belt - 0.02, 0.09, 0.22], [0.875, T.belt - 0.02, 0.09, 0.22]];
  for (const [u, v, w, h] of lights) { rrect(g, X(u), Y(v), CW * w, HC * h, 4); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(255,190,200,.85)';
  for (const [u, v, w, h] of lights) { rrect(g, X(u + w * 0.2), Y(v + h * 0.3), CW * w * 0.6, HC * h * 0.3, 3); g.fill(); }

  g.fillStyle = '#e8e4d4';
  rrect(g, X(0.4), Y(0.62), CW * 0.2, HC * 0.1, 3); g.fill();
  g.fillStyle = shade(color, -0.65);
  rrect(g, X(0.03), Y(0.8), CW * 0.94, HC * 0.085, 5); g.fill();

  return { c, ax: pad + CW / 2, ay: pad + HC, cw: CW, h: HC / CW };
}

function makePlayer(color) {
  const CW = 440, pad = 44, HC = CW * 0.46;
  const [c, g] = mk(CW + pad * 2, HC + pad * 2);
  const X = u => pad + u * CW, Y = v => pad + v * HC;

  carShadow(g, X, Y, CW);

  // tyres
  for (const u of [0.035, 0.805]) {
    const lg = g.createLinearGradient(X(u), 0, X(u + 0.16), 0);
    lg.addColorStop(0, '#050507'); lg.addColorStop(0.5, '#1b1b22'); lg.addColorStop(1, '#050507');
    g.fillStyle = lg; rrect(g, X(u), Y(0.6), CW * 0.16, HC * 0.4, 10); g.fill();
  }

  // body
  let lg = g.createLinearGradient(0, Y(0.32), 0, Y(0.9));
  lg.addColorStop(0, shade(color, 0.45)); lg.addColorStop(0.3, color); lg.addColorStop(0.75, shade(color, -0.35)); lg.addColorStop(1, shade(color, -0.7));
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(X(0), Y(0.8));
  g.lineTo(X(0), Y(0.52));
  g.quadraticCurveTo(X(0), Y(0.35), X(0.1), Y(0.33));
  g.lineTo(X(0.9), Y(0.33));
  g.quadraticCurveTo(X(1), Y(0.35), X(1), Y(0.52));
  g.lineTo(X(1), Y(0.8));
  g.quadraticCurveTo(X(1), Y(0.88), X(0.92), Y(0.88));
  g.lineTo(X(0.08), Y(0.88));
  g.quadraticCurveTo(X(0), Y(0.88), X(0), Y(0.8));
  g.fill();

  // cabin
  lg = g.createLinearGradient(0, Y(0.02), 0, Y(0.36));
  lg.addColorStop(0, shade(color, 0.15)); lg.addColorStop(1, shade(color, -0.45));
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(X(0.17), Y(0.37));
  g.lineTo(X(0.3), Y(0.06));
  g.quadraticCurveTo(X(0.32), Y(0.02), X(0.37), Y(0.02));
  g.lineTo(X(0.63), Y(0.02));
  g.quadraticCurveTo(X(0.68), Y(0.02), X(0.7), Y(0.06));
  g.lineTo(X(0.83), Y(0.37));
  g.closePath(); g.fill();

  g.save();
  g.beginPath();
  g.moveTo(X(0.23), Y(0.33)); g.lineTo(X(0.33), Y(0.08)); g.lineTo(X(0.67), Y(0.08)); g.lineTo(X(0.77), Y(0.33)); g.closePath();
  lg = g.createLinearGradient(0, Y(0.08), 0, Y(0.33));
  lg.addColorStop(0, '#3b4677'); lg.addColorStop(1, '#070914');
  g.fillStyle = lg; g.fill(); g.clip();
  g.fillStyle = 'rgba(255,255,255,.1)';
  g.beginPath(); g.moveTo(X(0.36), Y(0)); g.lineTo(X(0.46), Y(0)); g.lineTo(X(0.36), Y(0.4)); g.lineTo(X(0.26), Y(0.4)); g.fill();
  g.restore();

  // spoiler
  g.fillStyle = '#0d0d14';
  rrect(g, X(0.28), Y(0.3), CW * 0.03, HC * 0.1, 2); g.fill();
  rrect(g, X(0.69), Y(0.3), CW * 0.03, HC * 0.1, 2); g.fill();
  lg = g.createLinearGradient(0, Y(0.25), 0, Y(0.31));
  lg.addColorStop(0, '#34343f'); lg.addColorStop(1, '#0a0a10');
  g.fillStyle = lg;
  rrect(g, X(0.05), Y(0.245), CW * 0.9, HC * 0.065, 6); g.fill();

  // highlight crease
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(X(0.06), Y(0.4)); g.lineTo(X(0.94), Y(0.4)); g.stroke();

  // LED light bar
  g.save();
  g.shadowColor = '#ff1a3a'; g.shadowBlur = 26; g.fillStyle = '#ff2442';
  rrect(g, X(0.04), Y(0.44), CW * 0.22, HC * 0.11, 6); g.fill();
  rrect(g, X(0.74), Y(0.44), CW * 0.22, HC * 0.11, 6); g.fill();
  rrect(g, X(0.24), Y(0.475), CW * 0.52, HC * 0.035, 3); g.fill();
  g.restore();
  g.fillStyle = '#ffc4cc';
  rrect(g, X(0.06), Y(0.475), CW * 0.18, HC * 0.035, 3); g.fill();
  rrect(g, X(0.76), Y(0.475), CW * 0.18, HC * 0.035, 3); g.fill();

  // plate
  g.fillStyle = '#f2efe4';
  rrect(g, X(0.41), Y(0.58), CW * 0.18, HC * 0.1, 3); g.fill();
  g.fillStyle = '#1a1a22';
  g.font = `800 ${HC * 0.07}px Orbitron, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SPEEDI', X(0.5), Y(0.632));

  // diffuser + exhausts
  g.fillStyle = '#0a0a10';
  rrect(g, X(0.14), Y(0.72), CW * 0.72, HC * 0.16, 8); g.fill();
  g.strokeStyle = '#23232d'; g.lineWidth = 3;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(X(0.14 + i * 0.12), Y(0.73)); g.lineTo(X(0.14 + i * 0.12), Y(0.87)); g.stroke(); }
  const exhausts = [0.27, 0.35, 0.65, 0.73];
  for (const u of exhausts) {
    const r = CW * 0.028;
    const rg = g.createRadialGradient(X(u), Y(0.8), r * 0.2, X(u), Y(0.8), r);
    rg.addColorStop(0, '#000'); rg.addColorStop(0.6, '#111'); rg.addColorStop(0.75, '#c9c9d6'); rg.addColorStop(1, '#55556a');
    g.fillStyle = rg; g.beginPath(); g.arc(X(u), Y(0.8), r, 0, Math.PI * 2); g.fill();
  }

  return { c, ax: pad + CW / 2, ay: pad + HC, cw: CW, h: HC / CW, exhausts: exhausts.map(u => [u - 0.5, 0.8 - 1]) };
}

function makeLamp() {
  const CW = 200, HC = 820, pad = 70;
  const [c, g] = mk(CW + pad * 2, HC + pad * 2);
  const X = u => pad + u * CW, Y = v => pad + v * HC;

  const lg = g.createLinearGradient(X(0.06), 0, X(0.14), 0);
  lg.addColorStop(0, '#1c1830'); lg.addColorStop(0.5, '#4a4266'); lg.addColorStop(1, '#16122a');
  g.fillStyle = lg;
  g.fillRect(X(0.07), Y(0.07), CW * 0.06, HC * 0.93);
  g.fillRect(X(0.04), Y(0.97), CW * 0.12, HC * 0.03);

  g.strokeStyle = '#3a3356'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X(0.1), Y(0.1));
  g.quadraticCurveTo(X(0.12), Y(0.025), X(0.35), Y(0.025));
  g.lineTo(X(0.86), Y(0.032)); g.stroke();

  g.fillStyle = '#2a2444';
  rrect(g, X(0.72), Y(0.024), CW * 0.25, HC * 0.03, 6); g.fill();

  const gx = X(0.845), gy = Y(0.058);
  let rg = g.createRadialGradient(gx, gy, 0, gx, gy, 68);
  rg.addColorStop(0, 'rgba(255,220,170,.95)'); rg.addColorStop(0.25, 'rgba(255,160,80,.5)'); rg.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(gx, gy, 68, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff6e6';
  rrect(g, X(0.75), Y(0.05), CW * 0.19, HC * 0.012, 4); g.fill();

  return { c, ax: X(0.1), ay: Y(1), cw: CW };
}

function makePalm(seed) {
  const CW = 300, HC = 620, pad = 20;
  const [c, g] = mk(CW + pad * 2, HC + pad * 2);
  const X = u => pad + u * CW, Y = v => pad + v * HC;
  const bend = seed === 1 ? 0.1 : -0.06;
  const top = [X(0.5 + bend), Y(0.2)];

  // trunk
  g.fillStyle = '#12071f';
  g.beginPath();
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = lerp(X(0.5), top[0], t) + Math.sin(t * Math.PI) * CW * bend * 0.6;
    const y = lerp(Y(1), top[1], t);
    pts.push([x, y, lerp(11, 6, t)]);
  }
  pts.forEach(([x, y, w], i) => (i ? g.lineTo(x - w, y) : g.moveTo(x - w, y)));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0] + pts[i][2], pts[i][1]);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,79,160,.45)'; g.lineWidth = 2;
  g.beginPath(); pts.forEach(([x, y, w], i) => (i ? g.lineTo(x + w, y) : g.moveTo(x + w, y))); g.stroke();

  // fronds
  const angles = [-2.9, -2.4, -1.9, -1.35, -0.85, -0.35, 0.15, 3.35];
  for (const a0 of angles) {
    const a = a0 + (seed === 1 ? 0.08 : -0.05);
    const L = CW * rand(0.42, 0.52);
    const ex = top[0] + Math.cos(a) * L, ey = top[1] + Math.sin(a) * L * 0.45 + L * 0.35;
    const cx = top[0] + Math.cos(a) * L * 0.5, cy = top[1] - L * 0.28 + Math.sin(a) * L * 0.2;
    const nx = -Math.sin(a) * 16, ny = Math.cos(a) * 9;
    g.fillStyle = '#16092a';
    g.beginPath();
    g.moveTo(top[0], top[1]);
    g.quadraticCurveTo(cx - nx, cy - ny, ex, ey);
    g.quadraticCurveTo(cx + nx, cy + ny + 10, top[0], top[1] + 4);
    g.fill();
    g.strokeStyle = 'rgba(255,79,160,.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(top[0], top[1]); g.quadraticCurveTo(cx - nx, cy - ny, ex, ey); g.stroke();
  }
  return { c, ax: X(0.5), ay: Y(1), cw: CW };
}

function makeCone() {
  const [c, g] = mk(256, 256);
  for (let i = 0; i < 6; i++) {
    const spread = 1 - i * 0.12;
    const lg = g.createLinearGradient(0, 256, 0, 0);
    lg.addColorStop(0, 'rgba(255,245,225,0.22)'); lg.addColorStop(0.6, 'rgba(255,240,210,0.07)'); lg.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(128 - 40 * spread, 256); g.lineTo(128 - 128 * spread, 0);
    g.lineTo(128 + 128 * spread, 0); g.lineTo(128 + 40 * spread, 256);
    g.closePath(); g.fill();
  }
  return c;
}

function buildArt() {
  const colors = ['#3f7fe0', '#d9dbe6', '#c83a3a', '#2fa579', '#7650d8', '#2c313f'];
  ART.traffic = [];
  for (const t of ['sedan', 'hatch', 'suv']) for (const col of colors) ART.traffic.push(makeTraffic(col, t));
  ART.player = makePlayer('#ffc814');
  ART.lampL = makeLamp();
  ART.lampR = mirror(ART.lampL);
  ART.palmA = makePalm(1);
  ART.palmB = mirror(makePalm(2));
  ART.pool = radial(128, [[0, 'rgba(255,150,70,.9)'], [0.5, 'rgba(255,110,60,.3)'], [1, 'rgba(255,90,60,0)']]);
  ART.under = radial(128, [[0, 'rgba(57,243,255,.9)'], [0.5, 'rgba(57,200,255,.3)'], [1, 'rgba(57,160,255,0)']]);
  ART.flame = radial(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(140,220,255,.95)'], [0.55, 'rgba(90,120,255,.45)'], [1, 'rgba(255,80,40,0)']]);
  ART.spark = radial(32, [[0, 'rgba(255,255,220,1)'], [0.4, 'rgba(255,190,90,.8)'], [1, 'rgba(255,120,40,0)']]);
  ART.cone = makeCone();
}

// ---------------------------------------------------------------- background (sky, sun, mountains)
const BG = {};
function ridge(w, h, seed, amp) {
  const [c, g] = mk(w, h);
  const ks = [[2, 1], [3, 0.6], [5, 0.35], [9, 0.18], [17, 0.08], [29, 0.04]];
  const ph = ks.map(() => Math.random() * Math.PI * 2);
  const yAt = x => {
    let v = 0;
    ks.forEach(([k, a], i) => { v += a * Math.sin((x / w) * Math.PI * 2 * k + ph[i]); });
    return h - (0.45 + v * 0.28) * amp * h;
  };
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 3) g.lineTo(x, yAt(x));
  g.lineTo(w, h); g.closePath();
  return [c, g, yAt];
}

function buildBackground() {
  const w = Math.ceil(W * dpr), hz = Math.ceil(horizonY * dpr);

  // sky
  let [c, g] = mk(w, hz + 2);
  let lg = g.createLinearGradient(0, 0, 0, hz);
  lg.addColorStop(0, '#05021a'); lg.addColorStop(0.5, '#190838'); lg.addColorStop(0.82, '#461362'); lg.addColorStop(1, '#9c2d6c');
  g.fillStyle = lg; g.fillRect(0, 0, w, hz + 2);
  const nStars = Math.round((W * horizonY) / 1400);
  for (let i = 0; i < nStars; i++) {
    const y = Math.pow(Math.random(), 1.6) * hz * 0.8;
    g.globalAlpha = (1 - y / hz) * rand(0.3, 1);
    g.fillStyle = Math.random() < 0.15 ? '#9ff3ff' : '#ffffff';
    const s = rand(0.6, 1.6) * dpr;
    g.fillRect(Math.random() * w, y, s, s);
  }
  g.globalAlpha = 1;

  // sun
  const r = Math.min(W, H) * 0.2 * dpr, cx = w / 2, cy = hz - r * 0.35;
  let rg = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.6);
  rg.addColorStop(0, 'rgba(255,80,150,.45)'); rg.addColorStop(1, 'rgba(255,80,150,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, hz + 2);
  const [sc, sg] = mk(r * 2 + 4, r * 2 + 4);
  lg = sg.createLinearGradient(0, 0, 0, r * 2);
  lg.addColorStop(0, '#fff27a'); lg.addColorStop(0.45, '#ffa043'); lg.addColorStop(1, '#ff2e88');
  sg.fillStyle = lg; sg.beginPath(); sg.arc(r + 2, r + 2, r, 0, Math.PI * 2); sg.fill();
  sg.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 7; k++) {
    const y = r + 2 + r * (0.12 + k * 0.13);
    sg.fillRect(0, y, r * 2 + 4, (1 + k * 1.1) * dpr * (r / (90 * dpr)));
  }
  g.drawImage(sc, cx - r - 2, cy - r - 2);
  BG.sky = c;

  // mountains (tileable, 2x screen width)
  const mw = w * 2;
  let yAt;
  [c, g, yAt] = ridge(mw, Math.ceil(H * 0.13 * dpr), 1, 1);
  lg = g.createLinearGradient(0, 0, 0, c.height);
  lg.addColorStop(0, '#34125a'); lg.addColorStop(1, '#4a1a66');
  g.fillStyle = lg; g.fill();
  g.strokeStyle = 'rgba(255,79,216,.75)'; g.lineWidth = 1.5 * dpr;
  g.beginPath(); for (let x = 0; x <= mw; x += 3) (x ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x))); g.stroke();
  BG.far = c;

  [c, g, yAt] = ridge(mw, Math.ceil(H * 0.08 * dpr), 2, 1);
  lg = g.createLinearGradient(0, 0, 0, c.height);
  lg.addColorStop(0, '#1d0a36'); lg.addColorStop(1, '#3a1450');
  g.fillStyle = lg; g.fill();
  g.strokeStyle = 'rgba(122,92,255,.8)'; g.lineWidth = 1.5 * dpr;
  g.beginPath(); for (let x = 0; x <= mw; x += 3) (x ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x))); g.stroke();
  BG.near = c;

  // vignette
  [c, g] = mk(w, Math.ceil(H * dpr));
  rg = g.createRadialGradient(w / 2, c.height * 0.55, Math.min(w, c.height) * 0.35, w / 2, c.height * 0.55, Math.max(w, c.height) * 0.75);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = rg; g.fillRect(0, 0, w, c.height);
  BG.vignette = c;
}

// ---------------------------------------------------------------- game state
let mode = 'menu';
let t = 0;
let position = 0, speed = 0, playerX = 0, steer = 0;
let nitro = 0.35, nitroOn = false, nitroFx = 0;
let elapsed = 0, distance = 0, bonus = 0, nearCount = 0, combo = 0, comboT = 0;
let crashT = 0, spin = 0, spinV = 0, slideV = 0, flash = 0;
let shake = 0, edgeTouch = false, bgOff = 0;
let best = +store.get('speedi.best', 0) || 0;
let cars = [], nextSpawnZ = 0, lastFree = [0, 1, 2], trafficV = 0;
const popups = [], sparks = [];
const streaks = Array.from({ length: 34 }, () => ({ a: Math.random() * Math.PI * 2, d: Math.random(), v: rand(0.8, 1.6), w: rand(1, 2.4) }));

const baseMax = () => lerp(BASE_SPEED, MAX_BASE_SPEED, Math.min(1, elapsed / 180));
const score = () => Math.floor(distance * KMH / 3.6) + bonus;

// ---------------------------------------------------------------- input
let keyL = false, keyR = false, touchSteer = 0;
const pointers = new Map();
function refreshTouch() {
  let l = false, r = false;
  for (const p of pointers.values()) { if (p.side < 0) l = true; else r = true; }
  touchSteer = (r ? 1 : 0) - (l ? 1 : 0);
}
const steerInput = () => clamp(touchSteer + (keyR ? 1 : 0) - (keyL ? 1 : 0), -1, 1);

window.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  if (e.target.closest('.overlay, .icon-btn')) return;
  if (e.target.closest('#btnNitro')) { triggerNitro(); return; }
  pointers.set(e.pointerId, { side: e.clientX < W / 2 ? -1 : 1, y0: e.clientY, t0: performance.now(), fired: false });
  refreshTouch();
});
window.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.side = e.clientX < W / 2 ? -1 : 1;
  if (!p.fired && p.y0 - e.clientY > 45 && performance.now() - p.t0 < 450) { p.fired = true; triggerNitro(); }
  refreshTouch();
});
const release = e => { if (pointers.delete(e.pointerId)) refreshTouch(); };
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('contextmenu', e => e.preventDefault());
// block page scrolling during play, but let a panel that does not fit (short landscape phones) scroll
document.addEventListener('touchmove', e => { if (!e.target.closest('.panel')) e.preventDefault(); }, { passive: false });

window.addEventListener('keydown', e => {
  const k = e.code;
  if (e.repeat && mode !== 'play') { e.preventDefault(); return; }
  if (k === 'ArrowLeft' || k === 'KeyA') keyL = true;
  else if (k === 'ArrowRight' || k === 'KeyD') keyR = true;
  else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
    if (mode === 'play') triggerNitro();
    else if (mode === 'menu' || (mode === 'over' && !ui.btnRestart.disabled)) startRun();
    else if (mode === 'pause') resumeGame();
  } else if (k === 'Enter') {
    if (mode === 'menu' || (mode === 'over' && !ui.btnRestart.disabled)) startRun();
    else if (mode === 'pause') resumeGame();
  } else if (k === 'Escape' || k === 'KeyP') {
    if (mode === 'play') pauseGame(); else if (mode === 'pause') resumeGame();
  } else if (k === 'KeyM') toggleSound();
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
});

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('score'), best: $('best'), speed: $('speed'),
  nitroBtn: $('btnNitro'), nitroRing: $('nitroRing'),
  menu: $('menu'), menuBest: $('menuBest'), over: $('over'), pause: $('pause'),
  finalScore: $('finalScore'), overBest: $('overBest'), newBest: $('newBest'),
  finalDist: $('finalDist'), finalNear: $('finalNear'),
  btnStart: $('btnStart'), btnRestart: $('btnRestart'), btnResume: $('btnResume'),
  btnPause: $('btnPause'), btnSound: $('btnSound'),
};
const RING = 2 * Math.PI * 30;
ui.nitroRing.style.strokeDasharray = RING.toFixed(1);

function show(el, on) { el.hidden = !on; }
function syncSoundBtn() { ui.btnSound.classList.toggle('muted', !Sound.enabled); }
function toggleSound() { Sound.toggle(); syncSoundBtn(); }

ui.btnStart.addEventListener('click', startRun);
ui.btnRestart.addEventListener('click', startRun);
ui.btnResume.addEventListener('click', resumeGame);
ui.btnPause.addEventListener('click', pauseGame);
ui.btnSound.addEventListener('click', () => { toggleSound(); if (Sound.enabled) Sound.click(); });
ui.menuBest.textContent = faNum(best);
syncSoundBtn();

function requestFullscreen() {
  const el = document.documentElement;
  if (!matchMedia('(pointer: coarse)').matches || document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function startRun() {
  Sound.init(); Sound.startMusic(); Sound.setMood('full'); Sound.engineStart(); Sound.click();
  requestFullscreen();
  cars = []; popups.length = 0; sparks.length = 0; pointers.clear(); refreshTouch();
  elapsed = 0; distance = 0; bonus = 0; nearCount = 0; combo = 0; comboT = 0;
  nitro = 0.35; nitroOn = false; spin = 0; spinV = 0; slideV = 0; crashT = 0; flash = 0;
  if (mode === 'over') { playerX = 0; steer = 0; }
  trafficV = baseMax() * 0.45;
  nextSpawnZ = position + PZ + 14000; lastFree = [0, 1, 2];
  mode = 'play';
  show(ui.menu, false); show(ui.over, false); show(ui.pause, false); show(ui.hud, true);
  ui.best.textContent = best ? 'BEST ' + best.toLocaleString('en-US') : '';
}

function pauseGame() {
  if (mode !== 'play') return;
  mode = 'pause'; pointers.clear(); refreshTouch();
  keyL = keyR = false; // a key held while pausing would otherwise keep steering after resume
  show(ui.pause, true);
  Sound.suspend();
}
function resumeGame() {
  if (mode !== 'pause') return;
  Sound.resume();
  mode = 'play';
  show(ui.pause, false);
}

function triggerNitro() {
  if (mode !== 'play' || nitroOn || nitro < 0.2) return;
  nitroOn = true; Sound.nitro(); shake = Math.max(shake, 0.35);
}

function crash(car) {
  mode = 'crash'; crashT = 0; nitroOn = false;
  const dir = playerX * ROAD_W < car.x * ROAD_W ? -1 : 1;
  spinV = dir * (3 + speed / 6000);
  slideV = dir * 0.5;
  car.push = speed * 0.35;
  shake = 1; flash = 1;
  const px = playerScreen.x, py = playerScreen.y - playerScreen.h * 0.6;
  for (let i = 0; i < 28; i++) {
    sparks.push({ x: px + rand(-20, 20), y: py, vx: rand(-420, 420), vy: rand(-520, -80), life: rand(0.4, 0.9), t: 0 });
  }
  const pz = position + PZ;
  cars = cars.filter(c => c === car || c.z > pz);
  Sound.crash();
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
}

function gameOver() {
  mode = 'over';
  const sc = score();
  const isBest = sc > best;
  if (isBest) { best = sc; store.set('speedi.best', String(best)); }
  ui.finalScore.textContent = faNum(sc);
  ui.overBest.textContent = faNum(best);
  ui.menuBest.textContent = faNum(best);
  ui.finalDist.textContent = (distance * KMH / 3.6 / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  ui.finalNear.textContent = faNum(nearCount);
  show(ui.newBest, isBest && sc > 0);
  show(ui.hud, false); show(ui.over, true);
  ui.btnRestart.disabled = true;
  setTimeout(() => { ui.btnRestart.disabled = false; }, 800);
  Sound.setMood('muffled');
}

function nearMiss() {
  combo = comboT > 0 ? combo + 1 : 1;
  comboT = 2.6;
  const pts = 100 * combo;
  bonus += pts; nearCount++;
  nitro = Math.min(1, nitro + 0.12);
  popups.push({ t: 0, pts, combo });
  if (popups.length > 3) popups.shift();
  Sound.nearMiss(combo);
}

// ---------------------------------------------------------------- traffic
function spawnTraffic() {
  const far = position + (DRAW - 6) * SEG;
  const d = Math.min(1, elapsed / 150);
  while (nextSpawnZ < far) {
    let blocked;
    if (Math.random() < 0.12 + 0.33 * d) {
      const cands = [0, 1, 2].filter(f => lastFree.every(l => Math.abs(l - f) <= 1));
      const free = pick(cands);
      blocked = [0, 1, 2].filter(l => l !== free);
    } else {
      blocked = [pick([0, 1, 2])];
    }
    for (const l of blocked) {
      cars.push({ z: nextSpawnZ + (blocked.length > 1 ? rand(-150, 150) : 0), x: LANES[l], sp: pick(ART.traffic), passed: false, push: 0 });
    }
    lastFree = [0, 1, 2].filter(l => !blocked.includes(l));
    const gap = blocked.length > 1 ? lerp(6000, 4400, d) : lerp(3800, 2600, d);
    nextSpawnZ += gap * rand(0.85, 1.4);
  }
}

// ---------------------------------------------------------------- update
function update(dt) {
  t += dt;
  const pz = position + PZ;
  const pSeg = segAt(Math.floor(pz / SEG));
  const spNorm = speed / BASE_SPEED;

  if (mode === 'menu') {
    speed += (7000 - speed) * Math.min(1, dt * 0.8);
    const target = Math.sin(t * 0.35) * 0.3;
    steer = clamp((target - playerX) * 5, -1, 1);
    playerX += (target - playerX) * Math.min(1, dt * 1.5);
  } else if (mode === 'play') {
    elapsed += dt;
    const bm = baseMax();
    if (nitroOn) {
      nitro -= dt / NITRO_TIME;
      if (nitro <= 0) { nitro = 0; nitroOn = false; }
    } else {
      nitro = Math.min(1, nitro + dt / 45);
    }
    const top = bm * (nitroOn ? NITRO_MULT : 1);
    const rate = speed < top ? (nitroOn ? 1.8 : 0.6) : 1.5;
    speed += (top - speed) * Math.min(1, rate * dt);

    steer += (steerInput() - steer) * Math.min(1, dt * 11);
    playerX += steer * STEER * dt * (0.5 + 0.5 * Math.min(1, spNorm));
    playerX -= CENTRIFUGAL * pSeg.curve * Math.min(spNorm, 1.5) * Math.min(spNorm, 1.5) * dt;

    edgeTouch = Math.abs(playerX) > EDGE;
    if (edgeTouch) {
      playerX = clamp(playerX, -EDGE, EDGE);
      speed *= 1 - 0.7 * dt;
      shake = Math.max(shake, 0.25);
      if (Math.random() < dt * 30) {
        sparks.push({ x: playerScreen.x + Math.sign(playerX) * playerScreen.w * 0.5, y: playerScreen.y - 4, vx: -Math.sign(playerX) * rand(40, 200), vy: rand(-240, -60), life: rand(0.25, 0.5), t: 0 });
      }
    }

    trafficV = bm * 0.45;
    distance += speed * dt;
    if (comboT > 0) comboT -= dt;

    const pxw = playerX * ROAD_W;
    for (const c of cars) {
      const dz = c.z - pz;
      const dx = Math.abs(c.x * ROAD_W - pxw);
      if (Math.abs(dz) < CAR_LEN && dx < CAR_W * 0.86) { crash(c); break; }
      if (!c.passed && dz < -CAR_LEN) {
        c.passed = true;
        if (dx < CAR_W * 1.36 && speed > bm * 0.6) nearMiss();
      }
    }
  } else if (mode === 'crash' || mode === 'over') {
    crashT += dt;
    speed *= Math.exp(-2.4 * dt);
    spin += spinV * dt; spinV *= Math.exp(-1.6 * dt);
    playerX = clamp(playerX + slideV * dt, -EDGE, EDGE); slideV *= Math.exp(-2 * dt);
    steer *= Math.exp(-4 * dt);
    edgeTouch = false;
    if (mode === 'crash' && crashT > 1.3) gameOver();
  }

  if (mode !== 'pause') {
    position += speed * dt;
    if (mode !== 'menu') {
      for (const c of cars) {
        c.z += (trafficV + c.push) * dt;
        c.push *= Math.exp(-1.5 * dt);
      }
      nextSpawnZ += trafficV * dt;
      if (mode === 'play') spawnTraffic();
      cars = cars.filter(c => c.z > position - 400 && c.z < position + DRAW * SEG + 8000);
    }
  }

  nitroFx += ((nitroOn ? 1 : 0) - nitroFx) * Math.min(1, dt * 4);
  bgOff += pSeg.curve * spNorm * dt * 0.01;
  shake *= Math.exp(-5 * dt);
  flash *= Math.exp(-4 * dt);
  for (const p of popups) p.t += dt;
  while (popups.length && popups[0].t > 1.2) popups.shift();
  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t > sparks[i].life) sparks.splice(i, 1);

  Sound.engineUpdate(speed / (MAX_BASE_SPEED * NITRO_MULT), nitroOn, edgeTouch, mode === 'play' || mode === 'crash');
}

// ---------------------------------------------------------------- render
const P = {};
['cx1', 'y1', 'w1', 's1', 'cx2', 'y2', 'w2', 's2', 'clip', 'fog'].forEach(k => { P[k] = new Float32Array(DRAW); });
const P_OK = new Uint8Array(DRAW);
const buckets = Array.from({ length: DRAW }, () => []);
const playerScreen = { x: 0, y: 0, w: 0, h: 0 };

function poly(x1, y1, x2, y2, x3, y3, x4, y4, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath(); ctx.fill();
}

function drawSprite(sp, worldW, x, y, scale, clipY, alpha) {
  const s = worldW * scale / sp.cw;
  const dw = sp.c.width * s;
  if (dw < 1.2) return;
  const left = x - sp.ax * s, top = y - sp.ay * s, dh = sp.c.height * s;
  if (left > W || left + dw < 0 || top >= clipY) return;
  ctx.globalAlpha = alpha;
  if (top + dh > clipY) {
    const sh = (clipY - top) / s;
    if (sh > 1) ctx.drawImage(sp.c, 0, 0, sp.c.width, sh, left, top, dw, sh * s);
  } else {
    ctx.drawImage(sp.c, left, top, dw, dh);
  }
}

function drawBackground() {
  ctx.drawImage(BG.sky, 0, 0, W, horizonY + 2 / dpr);
  const layer = (img, factor, y) => {
    const iw = img.width / dpr, ih = img.height / dpr;
    let off = ((bgOff * factor * iw) % iw + iw) % iw;
    ctx.drawImage(img, -off, y - ih, iw, ih);
    if (iw - off < W) ctx.drawImage(img, iw - off, y - ih, iw, ih);
  };
  layer(BG.far, 0.5, horizonY + 1);
  layer(BG.near, 1, horizonY + 1);
  ctx.fillStyle = PAL.ground[0][FOG_STEPS];
  ctx.fillRect(0, horizonY, W, H - horizonY);
}

function render() {
  const sh = mode === 'pause' ? 0 : shake; // shake only decays in update(), so freeze it while paused
  const sx = (Math.random() - 0.5) * sh * 10, sy = (Math.random() - 0.5) * sh * 8;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.translate(sx, sy);
  drawBackground();

  const baseIdx = Math.floor(position / SEG);
  const basePct = (position - baseIdx * SEG) / SEG;
  const pz = position + PZ;
  const pIdx = Math.floor(pz / SEG), pPct = (pz - pIdx * SEG) / SEG;
  const pn = pIdx - baseIdx;
  const pSeg = segAt(pIdx);
  const camY = lerp(pSeg.y1, pSeg.y2, pPct) + CAM_H;
  const f = F * (1 - 0.07 * nitroFx);

  // curve offset at the player's z so the camera stays centred on the car
  let x = 0, dx = -segAt(baseIdx).curve * basePct;
  let xp = 0;
  { let xx = 0, ddx = dx; for (let n = 0; n < pn; n++) { xx += ddx; ddx += segAt(baseIdx + n).curve; } xp = xx + ddx * pPct; }
  const camX = xp + playerX * ROAD_W * FOLLOW;

  // project (front to back)
  let maxy = H;
  for (let n = 0; n < DRAW; n++) {
    const seg = segAt(baseIdx + n);
    const z1 = (baseIdx + n) * SEG - position, z2 = z1 + SEG;
    P.clip[n] = maxy;
    P_OK[n] = z1 > 1 ? 1 : 0;
    const s1 = f / Math.max(z1, 1), s2 = f / z2;
    P.s1[n] = s1; P.s2[n] = s2;
    P.cx1[n] = W / 2 + (x - camX) * s1;
    P.cx2[n] = W / 2 + (x + dx - camX) * s2;
    P.y1[n] = horizonY + (camY - seg.y1) * s1;
    P.y2[n] = horizonY + (camY - seg.y2) * s2;
    P.w1[n] = ROAD_W * s1; P.w2[n] = ROAD_W * s2;
    const d = n / DRAW;
    P.fog[n] = 1 - Math.exp(-d * d * FOG_DENSITY);
    x += dx; dx += seg.curve;
    if (P_OK[n]) maxy = Math.min(maxy, P.y1[n], P.y2[n]);
  }

  // road (back to front)
  for (let n = DRAW - 1; n >= 0; n--) {
    if (!P_OK[n]) continue;
    const y1 = P.y1[n], y2 = P.y2[n] - 0.6;
    if (y2 >= y1 || y1 < 0 || y2 > H) continue;
    const i = baseIdx + n;
    const band = Math.floor(i / RUMBLE) & 1;
    const fi = Math.min(FOG_STEPS, (P.fog[n] * FOG_STEPS) | 0);
    const x1 = P.cx1[n], w1 = P.w1[n], x2 = P.cx2[n], w2 = P.w2[n];

    ctx.fillStyle = PAL.ground[band][fi];
    ctx.fillRect(0, y2, W, y1 - y2);
    const r1 = w1 * 0.07, r2 = w2 * 0.07;
    const rc = PAL.rumble[band][fi];
    poly(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, rc);
    poly(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, rc);
    poly(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, PAL.road[band][fi]);

    const e1 = w1 * 0.018, e2 = w2 * 0.018, ec = PAL.edge[fi];
    poly(x1 - w1, y1, x1 - w1 + e1, y1, x2 - w2 + e2, y2, x2 - w2, y2, ec);
    poly(x1 + w1, y1, x1 + w1 - e1, y1, x2 + w2 - e2, y2, x2 + w2, y2, ec);

    if ((i & 7) < 4) {
      const l1 = w1 * 0.022, l2 = w2 * 0.022, lc = PAL.lane[fi];
      for (const k of [-1 / 3, 1 / 3]) {
        const a = x1 + w1 * 2 * k, b = x2 + w2 * 2 * k;
        poly(a - l1, y1, a + l1, y1, b + l2, y2, b - l2, y2, lc);
      }
    }
  }

  // additive light: lamp pools + headlights
  ctx.globalCompositeOperation = 'lighter';
  for (let n = 3; n < DRAW - 4; n++) {
    if (!P_OK[n] || !segAt(baseIdx + n).lamp) continue;
    if (P.y1[n] > P.clip[n] + 1) continue;
    const yb = P.y1[n - 3], yt = P.y2[n + 3], h = yb - yt;
    if (h < 1) continue;
    const pw = P.w1[n] * 0.85;
    ctx.globalAlpha = 0.5 * (1 - P.fog[n]);
    for (const side of [-1, 1]) ctx.drawImage(ART.pool, P.cx1[n] + side * 0.8 * P.w1[n] - pw, yt, pw * 2, h);
  }
  const nNear = Math.min(DRAW - 1, pn + 5), nFar = Math.min(DRAW - 1, pn + 34);
  if (mode !== 'over' && P_OK[nNear] && P.y1[nFar] < P.clip[nFar]) {
    const yN = P.y1[nNear], yF = P.y1[nFar];
    const half = P.w1[nFar] * 0.55;
    const cxF = P.cx1[nFar] + playerX * P.w1[nFar];
    const cxN = P.cx1[nNear] + playerX * P.w1[nNear];
    ctx.globalAlpha = 0.9;
    ctx.drawImage(ART.cone, (cxF + cxN) / 2 - half * 1.6, yF, half * 3.2, yN - yF);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // sprites (back to front)
  for (const b of buckets) b.length = 0;
  for (const c of cars) {
    const n = Math.floor(c.z / SEG) - baseIdx;
    if (n >= 0 && n < DRAW) buckets[n].push(c);
  }
  if (pn >= 0 && pn < DRAW) buckets[pn].push(null);

  for (let n = DRAW - 1; n >= 0; n--) {
    if (!P_OK[n]) continue;
    const seg = segAt(baseIdx + n);
    const a = 1 - P.fog[n] * 0.92;
    for (const s of seg.sp) {
      drawSprite(ART[s.k], s.w, P.cx1[n] + s.o * P.w1[n], P.y1[n], P.s1[n], P.clip[n], a);
    }
    const bk = buckets[n];
    if (!bk.length) continue;
    bk.sort((p, q) => (q ? q.z : pz) - (p ? p.z : pz));
    for (const c of bk) {
      if (c === null) { ctx.globalAlpha = 1; drawPlayer(n, pPct); continue; }
      const pct = (c.z - Math.floor(c.z / SEG) * SEG) / SEG;
      const cx = lerp(P.cx1[n], P.cx2[n], pct), w = lerp(P.w1[n], P.w2[n], pct);
      const y = lerp(P.y1[n], P.y2[n], pct), s = lerp(P.s1[n], P.s2[n], pct);
      drawSprite(c.sp, CAR_W, cx + c.x * w, y, s, P.clip[n], a);
    }
  }
  ctx.globalAlpha = 1;

  drawFx();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(BG.vignette, 0, 0, W, H);
  if (flash > 0.02) {
    ctx.globalAlpha = flash * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  }
}

function drawPlayer(n, pct) {
  const sp = ART.player;
  const cx = lerp(P.cx1[n], P.cx2[n], pct), w = lerp(P.w1[n], P.w2[n], pct);
  const s = lerp(P.s1[n], P.s2[n], pct);
  let y = lerp(P.y1[n], P.y2[n], pct);
  const x = cx + playerX * w;
  const spN = speed / BASE_SPEED;
  y += Math.sin(t * 38) * 0.5 * Math.min(1, spN) + (edgeTouch ? (Math.random() - 0.5) * 3 : 0);
  const k = CAR_W * 1.04 * s / sp.cw;
  const cw = sp.c.width * k, ch = sp.c.height * k;
  const bodyW = sp.cw * k, bodyH = bodyW * sp.h;
  playerScreen.x = x; playerScreen.y = y; playerScreen.w = bodyW; playerScreen.h = bodyH;

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.08;
  ctx.drawImage(ART.under, x - bodyW * 0.7, y - bodyH * 0.2, bodyW * 1.4, bodyH * 0.45);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(x, y - bodyH * 0.45);
  ctx.rotate(steer * 0.035 + spin);
  ctx.drawImage(sp.c, -sp.ax * k, -sp.ay * k + bodyH * 0.45, cw, ch);

  if (nitroFx > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [u, v] of sp.exhausts) {
      const fx = u * bodyW, fy = v * bodyH + bodyH * 0.45;
      const r = bodyW * rand(0.07, 0.11) * nitroFx;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(ART.flame, fx - r, fy - r * 0.8, r * 2, r * 2.2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawFx() {
  if (nitroFx > 0.02) {
    const cx = W / 2, cy = horizonY, R = Math.max(W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(170,240,255,1)';
    for (const s of streaks) {
      s.d += s.v * 0.02 * (speed / BASE_SPEED);
      if (s.d > 1.3) { s.d = 0.25; s.a = Math.random() * Math.PI * 2; }
      const r0 = s.d * R * 0.8, r1 = r0 + R * 0.12 * s.d;
      ctx.globalAlpha = nitroFx * 0.35 * Math.min(1, (s.d - 0.25) * 3);
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0 * 0.7);
      ctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1 * 0.7);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  if (sparks.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      ctx.globalAlpha = 1 - s.t / s.life;
      ctx.drawImage(ART.spark, s.x - 5, s.y - 5, 10, 10);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  for (const p of popups) {
    const a = p.t < 0.12 ? p.t / 0.12 : 1 - Math.max(0, (p.t - 0.7) / 0.5);
    const pop = 1 + Math.max(0, 0.18 - p.t) * 2;
    const fs = Math.min(W, H) * 0.075 * pop;
    const y = H * 0.3 - p.t * 36;
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${fs}px Orbitron, sans-serif`;
    ctx.direction = 'ltr';
    ctx.fillText('+' + p.pts, W / 2, y);
    ctx.shadowColor = '#39f3ff';
    ctx.fillStyle = '#9ff8ff';
    ctx.font = `900 ${fs * 0.55}px Vazirmatn, sans-serif`;
    ctx.direction = 'rtl';
    ctx.fillText(p.combo > 1 ? `لایی ×${faNum(p.combo)}` : 'لایی!', W / 2, y - fs * 0.95);
    ctx.shadowBlur = 0;
  }
  ctx.direction = 'ltr';
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- HUD
let hudScore = -1, hudSpeed = -1, hudNitro = -1, hudState = '';
function updateHud() {
  if (mode !== 'play' && mode !== 'crash') return;
  const sc = score();
  if (sc !== hudScore) { hudScore = sc; ui.score.textContent = sc.toLocaleString('en-US'); }
  const kmh = Math.round(speed * KMH);
  if (kmh !== hudSpeed) { hudSpeed = kmh; ui.speed.textContent = kmh; }
  const nq = Math.round(nitro * 200);
  if (nq !== hudNitro) { hudNitro = nq; ui.nitroRing.style.strokeDashoffset = (RING * (1 - nitro)).toFixed(1); }
  const st = nitroOn ? 'on' : nitro >= 0.2 ? 'ready' : '';
  if (st !== hudState) {
    hudState = st;
    ui.nitroBtn.classList.toggle('on', st === 'on');
    ui.nitroBtn.classList.toggle('ready', st === 'ready');
  }
}

// ---------------------------------------------------------------- adaptive resolution
const QUALITY = [2, 1.5, 1.25, 1];
let perfAcc = 0, perfN = 0;
function trackPerf(dt) {
  if (mode !== 'play') { perfAcc = 0; perfN = 0; return; }
  perfAcc += dt; perfN++;
  if (perfN < 150) return;
  const avg = perfAcc / perfN;
  perfAcc = 0; perfN = 0;
  if (avg > 1 / 45) {
    const next = QUALITY.find(q => q < dpr - 0.01);
    if (next) { dprCap = next; resize(); }
  }
}

// ---------------------------------------------------------------- lifecycle
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pauseGame(); Sound.suspend(); }
  else if (mode !== 'pause') Sound.resume();
});
window.addEventListener('blur', () => { keyL = keyR = false; if (mode === 'play') pauseGame(); });
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) return;
  if (mode !== 'pause') update(dt);
  render();
  updateHud();
  trackPerf(dt);
}

buildTrack();
buildArt();
resize();
speed = 7000;
requestAnimationFrame(frame);
if (document.fonts) document.fonts.ready.then(() => { ART.player = makePlayer('#ffc814'); });
})();
