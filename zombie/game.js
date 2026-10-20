(() => {
'use strict';

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const TAU = Math.PI * 2;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const faNum = n => Math.round(n).toLocaleString('fa-IR');
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
};
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, dpr = 1, dprCap = Math.min(window.devicePixelRatio || 1, 2), zoom = 1;
let darkC, darkG, darkScale = 0.5;
const TILE = 240;
let tileC = null;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  zoom = clamp(Math.min(W, H) / 330, 1, 2.4);
  [darkC, darkG] = mk(W * dpr * darkScale, H * dpr * darkScale);
  buildGround();
}

// ---------------------------------------------------------------- drawing primitives (current ctx = g)
let g = ctx;
let FL = 0; // hit-flash amount; >0 paints bodies white
const col = c => (FL > 0.5 ? '#ffffff' : c);
function ell(x, y, rx, ry, c) { g.fillStyle = col(c); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
function circ(x, y, r, c) { g.fillStyle = col(c); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function rr(x, y, w, h, r, c) {
  r = Math.min(r, w / 2, h / 2);
  g.fillStyle = col(c);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
}
function limb(x1, y1, x2, y2, w, c) {
  g.strokeStyle = col(c); g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function poly(pts, c) {
  g.fillStyle = col(c); g.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1]));
  g.closePath(); g.fill();
}
function shadow(rx, ry, a = 0.45) { g.fillStyle = `rgba(0,0,0,${a})`; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill(); }

// ---------------------------------------------------------------- characters
// All characters are drawn at the origin (feet), facing +x, about 60 units tall.
function leg(hx, hy, len, ang, w, pants, shoe) {
  const fx = hx + Math.sin(ang) * len, fy = hy + Math.cos(ang) * len;
  limb(hx, hy, fx, fy, w, pants);
  ell(fx + 2, fy + 1, w * 0.75, w * 0.45, shoe);
}

function drawSurvivor(p) {
  const m = p.moveAmt, w = p.walk;
  const bob = Math.abs(Math.sin(w)) * 2.2 * m;
  shadow(15, 5);
  // legs
  leg(-3, -18, 16, Math.sin(w + Math.PI) * 0.55 * m, 6.5, '#232b42', '#121318');
  leg(3, -18, 16, Math.sin(w) * 0.55 * m, 6.5, '#2d3756', '#17181e');
  g.save();
  g.translate(0, -bob);
  // backpack
  rr(-17, -38, 10, 19, 4, '#4f5d34');
  rr(-17, -38, 4, 19, 3, '#3d4828');
  rr(-16, -27, 8, 5, 2, '#5f6e40');
  // torso (jacket)
  rr(-10, -38, 21, 23, 8, '#e0702a');
  rr(-10, -38, 7, 23, 6, '#b8561c');
  rr(3, -37, 7, 21, 6, '#f08a3e');
  limb(4, -36, 4, -17, 1.4, '#7a3510');
  rr(-10, -20, 21, 5, 2.5, '#9c4515');
  // head
  const hx = 2, hy = -50;
  circ(hx - 7, hy + 1, 3.2, '#d39a74');
  circ(hx, hy, 13.5, '#f2c39a');
  ell(hx - 4, hy + 8, 6, 3, '#e8b58c');
  // hair
  g.fillStyle = col('#3e2616');
  g.beginPath();
  g.arc(hx, hy - 1, 14, Math.PI * 0.95, Math.PI * 2.05);
  g.lineTo(hx + 13, hy - 3);
  g.lineTo(hx + 9, hy - 6);
  g.lineTo(hx + 6, hy - 3);
  g.lineTo(hx + 2, hy - 7);
  g.lineTo(hx - 3, hy - 4);
  g.lineTo(hx - 12, hy + 3);
  g.closePath(); g.fill();
  // headband + tails
  const flap = Math.sin(p.t * 12) * 3 * (0.4 + m);
  poly([hx - 13, hy - 5, hx - 22, hy - 9 + flap, hx - 21, hy - 5 + flap, hx - 13, hy - 2], '#b8232b');
  poly([hx - 13, hy - 3, hx - 20, hy + 1 + flap * 0.7, hx - 18, hy + 3 + flap * 0.7, hx - 12, hy - 1], '#9c1c23');
  g.save(); g.beginPath(); g.arc(hx, hy, 13.6, 0, TAU); g.clip();
  rr(hx - 15, hy - 8, 30, 4.5, 1, '#d6333a');
  g.restore();
  // face
  ell(hx + 7, hy + 1, 2, 2.8, '#1c1512');
  circ(hx + 7.6, hy, 0.8, '#ffffff');
  limb(hx + 5, hy - 3.5, hx + 9.5, hy - 3, 1.3, '#3e2616');
  ell(hx + 4, hy + 5.5, 2.5, 1.3, '#f0a08a');
  limb(hx + 9, hy + 7.5, hx + 12, hy + 7, 1.2, '#8a4a3a');
  g.restore();
}

function drawGun(p, ang, flash) {
  // drawn in the character's (possibly mirrored) space, around the shoulder
  g.save();
  g.translate(1, -30 - Math.abs(Math.sin(p.walk)) * 2.2 * p.moveAmt);
  g.rotate(ang);
  limb(0, 0, 11, 1, 6.5, '#e0702a');
  circ(12, 1.5, 3.2, '#f2c39a');
  rr(8, -2, 19, 6, 2, '#23262d');
  rr(10, -3, 12, 3, 1.5, '#3a3f4a');
  rr(11, 3, 4, 7, 1.5, '#1a1c21');
  rr(18, 3, 3, 5, 1, '#1a1c21');
  limb(10, -1.8, 25, -1.8, 1, '#6d7585');
  if (flash > 0) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = flash;
    const s = 0.7 + Math.random() * 0.5;
    g.fillStyle = '#ffd36b';
    g.beginPath();
    g.moveTo(27, 1);
    g.lineTo(34 * s + 4, -5 * s); g.lineTo(33, 1); g.lineTo(34 * s + 4, 7 * s);
    g.closePath(); g.fill();
    g.fillStyle = '#fff6d8';
    g.beginPath(); g.arc(29, 1, 3.5 * s, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

// ---- zombies: bold-outline cartoon style (big head, bulging mismatched eyes, hunched)
const OL = '#1b1f15';
const LW = 1.7;
let EYES_ONLY = false;

const ZSKIN = {
  walker: [['#98a585', '#76836a'], ['#a2ab86', '#80896a'], ['#8fa283', '#6f8065']],
  runner: [['#a6ab9c', '#83887a'], ['#9fa9a6', '#7c8683']],
  brute: [['#8d9b70', '#6c7953']],
};
const ZOUTFIT = {
  walker: ['#5f6a78', '#6b6f52', '#5c4f6b', '#4e5f5a', '#6d5a48'],
  runner: ['#b04a3a', '#3f7a5c', '#c79a2e', '#4d5fa0'],
  brute: ['#46618f', '#5c6b3f'],
};
const ZTIE = ['#2f6f8f', '#6f8f3f', '#b08a2c', '#7a4a8a', '#3a3a3a'];

function fs(c, lw = LW) {
  if (EYES_ONLY) return;
  g.fillStyle = col(c); g.fill();
  g.lineWidth = lw; g.strokeStyle = OL; g.lineJoin = 'round'; g.stroke();
}
// closed shape through the given points, rounded with quadratic curves
function smooth(pts) {
  const n = pts.length / 2;
  const mx = i => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
  const my = i => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
  g.beginPath();
  g.moveTo(mx(n - 1), my(n - 1));
  for (let i = 0; i < n; i++) g.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx(i), my(i));
  g.closePath();
}
function limbO(x1, y1, x2, y2, w, c) {
  if (EYES_ONLY) return;
  g.lineCap = 'round';
  g.strokeStyle = OL; g.lineWidth = w + LW * 2;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.strokeStyle = col(c); g.lineWidth = w;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function ellO(x, y, rx, ry, c, lw) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); fs(c, lw); }

function zLeg(ang, pants, torn, skin) {
  g.save(); g.rotate(ang);
  if (torn) {
    limbO(0, 8, 0.5, 17, 3.2, skin[0]);
    smooth([-4.8, -2, 4.8, -2, 4.8, 8, 2.8, 10.8, 1, 8.6, -1.4, 11.4, -3.2, 9, -4.8, 10]);
  } else {
    smooth([-4.8, -2, 4.8, -2, 5.3, 13.5, 3.4, 16.8, 1.4, 14.6, -1, 17.4, -3.2, 15, -5, 16]);
  }
  fs(pants);
  smooth([-4.5, 15.4, 2.5, 14.8, 8.5, 15.6, 11.5, 18.2, 10.6, 21.2, -4.2, 21.2, -5.6, 18.6]);
  fs('#6a4a2f');
  if (!EYES_ONLY) { g.strokeStyle = '#3f2a18'; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, 19.6); g.lineTo(10.4, 19.6); g.stroke(); }
  g.restore();
}

function zHand(skin, s = 1) {
  g.save(); g.scale(s, s);
  for (const [x, a] of [[-1.2, 0.25], [1.2, 0.05], [3.4, -0.2]]) limbO(x, 3, x + Math.sin(a) * 3, 7.2, 1.9, skin[0]);
  smooth([-3.2, -1, 3.4, -1.4, 5, 2.2, 3, 4.6, -2.4, 4.4, -4, 2]);
  fs(skin[0]);
  g.restore();
}

function zArm(ang, sleeve, skin, cuffCol, handScale, shortSleeve) {
  g.save(); g.rotate(ang);
  limbO(0.5, shortSleeve ? 5 : 10, 1.2, 17, 3.4, skin[0]);
  if (shortSleeve) { smooth([-3.6, -2.4, 3.8, -2.4, 4.2, 5, 1, 7, -3, 5.4]); fs(sleeve); }
  else {
    smooth([-3.8, -2.4, 3.8, -2.4, 4.4, 10.4, -3.4, 11.2]); fs(sleeve);
    g.beginPath(); g.moveTo(-3.3, 8.6); g.lineTo(4.2, 8); g.lineTo(4.4, 10.4); g.lineTo(-3.4, 11.2); g.closePath(); fs(cuffCol, 1.2);
  }
  g.translate(1.3, 18);
  zHand(skin, handScale);
  g.restore();
}

function zEye(x, y, r, lx, ly, big) {
  if (EYES_ONLY) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5;
    g.drawImage(GLOW_EYE_Y, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.9;
    g.fillStyle = '#f4f1dc'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.lineWidth = LW; g.strokeStyle = OL; g.stroke();
  } else {
    g.beginPath(); g.arc(x, y, r, 0, TAU); fs('#f4f1dc');
    // lower-lid shading gives the "bulging" look
    g.save(); g.beginPath(); g.arc(x, y, r - 0.8, 0, TAU); g.clip();
    g.fillStyle = 'rgba(120,120,90,.25)'; g.beginPath(); g.ellipse(x - r * 0.2, y + r * 0.55, r, r * 0.55, 0, 0, TAU); g.fill();
    g.restore();
  }
  const pr = big ? r * 0.2 : r * 0.26;
  g.fillStyle = '#121212';
  g.beginPath(); g.arc(x + lx * r * 0.45, y + ly * r * 0.45, pr, 0, TAU); g.fill();
  g.globalAlpha = 1;
}

function zHead(z, R, skin, style) {
  const seed = z.seed;
  // lumpy skull outline
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r2 = R * (1 + 0.045 * Math.sin(i * 2.3 + seed * 5));
    pts.push(Math.cos(a) * r2 * 1.04, Math.sin(a) * r2 * (style === 'brute' ? 0.9 : 0.96));
  }
  ellO(-R * 0.72, R * 0.08, R * 0.2, R * 0.28, skin[1], 1.4);
  smooth(pts); fs(skin[0]);
  if (!EYES_ONLY) {
    g.save(); smooth(pts); g.clip();
    g.fillStyle = col(skin[1]);
    g.beginPath(); g.ellipse(-R * 0.45, R * 0.55, R * 0.95, R * 0.7, -0.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.beginPath(); g.ellipse(R * 0.1, -R * 0.55, R * 0.55, R * 0.25, -0.2, 0, TAU); g.fill();
    g.restore();
    smooth(pts); g.lineWidth = LW; g.strokeStyle = OL; g.stroke();
    // hair strands / stitches
    g.strokeStyle = OL; g.lineCap = 'round';
    if (style === 'brute') {
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-R * 0.7, -R * 0.35); g.quadraticCurveTo(-R * 0.1, -R * 0.95, R * 0.4, -R * 0.75); g.stroke();
      for (let i = 0; i < 5; i++) {
        const t2 = i / 4, x = lerp(-R * 0.6, R * 0.3, t2), y = -R * (0.45 + Math.sin(t2 * Math.PI) * 0.42);
        g.beginPath(); g.moveTo(x - 1.2, y - 1.6); g.lineTo(x + 1.2, y + 1.6); g.stroke();
      }
    } else {
      g.lineWidth = 0.9;
      for (let i = 0; i < z.hairN; i++) {
        const a = -2.4 + i * 0.32 + Math.sin(seed + i) * 0.1;
        const bx = Math.cos(a) * R * 0.98, by = Math.sin(a) * R * 0.94;
        g.beginPath(); g.moveTo(bx, by);
        g.quadraticCurveTo(bx + Math.cos(a) * 4, by + Math.sin(a) * 5 - 2, bx + Math.cos(a) * 6 + Math.sin(seed * 3 + i) * 2, by + Math.sin(a) * 7);
        g.stroke();
      }
    }
    // brow ridge & wrinkle
    g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(R * 0.05, -R * 0.52); g.quadraticCurveTo(R * 0.45, -R * 0.68, R * 0.95, -R * 0.45); g.stroke();
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-R * 0.1, -R * 0.72); g.quadraticCurveTo(R * 0.2, -R * 0.8, R * 0.45, -R * 0.74); g.stroke();

    // mouth
    const jaw = z.jaw * (style === 'runner' ? 1.4 : 1);
    const mx0 = R * 0.28, mx1 = R * 1.08, my0 = R * 0.34;
    g.beginPath();
    g.moveTo(mx0, my0);
    g.quadraticCurveTo((mx0 + mx1) / 2, my0 - R * 0.08, mx1, my0 - R * 0.04);
    g.lineTo(mx1 - R * 0.06, my0 + R * (0.34 + jaw * 0.2));
    g.quadraticCurveTo((mx0 + mx1) / 2, my0 + R * (0.46 + jaw * 0.25), mx0 + R * 0.08, my0 + R * (0.28 + jaw * 0.15));
    g.closePath();
    fs('#6e1c1f', 1.4);
    g.fillStyle = '#4a0f12';
    g.beginPath(); g.ellipse((mx0 + mx1) / 2 + R * 0.05, my0 + R * (0.28 + jaw * 0.14), R * 0.22, R * 0.08, 0, 0, TAU); g.fill();
    // a few uneven teeth with gaps
    const teeth = style === 'brute' ? [[0.42, 0.2, 0.18], [0.78, 0.22, 0.2]] : [[0.4, 0.17, 0.2], [0.63, 0.15, 0.14], [0.86, 0.14, 0.22]];
    for (const [tx, tw, th] of teeth) { g.beginPath(); g.rect(R * tx, my0 - R * 0.04, R * tw, R * th); fs('#f1ead0', 1); }
    if (style === 'brute') {
      for (const tx of [0.5, 0.82]) { g.beginPath(); g.rect(R * tx, my0 + R * (0.24 + jaw * 0.18), R * 0.14, -R * 0.18); fs('#f1ead0', 1); }
    }
    // nostrils
    g.fillStyle = OL;
    g.beginPath(); g.ellipse(R * 1.0, R * 0.12, R * 0.05, R * 0.08, 0.3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(R * 0.84, R * 0.14, R * 0.045, R * 0.07, 0.3, 0, TAU); g.fill();
  }

  // eyes (also drawn in the eyes-only pass, so they read in the dark)
  const eb = style === 'brute' ? 0.24 : style === 'runner' ? 0.36 : 0.3;
  const ef = style === 'brute' ? 0.32 : style === 'runner' ? 0.42 : 0.44;
  const [small, big] = z.eyeSwap ? [ef * 0.8, eb * 1.2] : [eb, ef];
  zEye(R * 0.22, -R * 0.2, R * small, z.lx, z.ly, false);
  zEye(R * 0.78, -R * 0.12, R * big, z.lx * 0.6, z.ly, true);
}

function drawZombie(z, pass) {
  EYES_ONLY = pass === 'eyes';
  const w = z.walk, m = z.moveAmt, sk = z.skin;
  const type = z.type;
  if (!EYES_ONLY) shadow(type === 'brute' ? 21 : 14, type === 'brute' ? 6.5 : 5);
  g.save();
  if (type === 'brute') g.scale(1.42, 1.42);

  const runner = type === 'runner';
  const bob = Math.abs(Math.sin(w)) * (runner ? 2.6 : 1.8) * m;
  const swing = runner ? 0.75 : type === 'brute' ? 0.32 : 0.42;
  const L = z.lunge || 0;
  const lean = (runner ? 0.42 : type === 'brute' ? 0.12 : 0.22) + L * 0.28;
  const hipY = -21;

  // legs
  g.save(); g.translate(-2.2, hipY - bob * 0.3);
  zLeg(Math.sin(w + Math.PI) * swing * m * (runner ? 1 : 0.7), shadeHex(z.pants, -18), !runner, sk);
  g.restore();
  g.save(); g.translate(2.2, hipY - bob * 0.3);
  zLeg(Math.sin(w) * swing * m, z.pants, runner, sk);
  g.restore();

  g.save(); g.translate(0, hipY - bob); g.rotate(lean + Math.sin(w * 2) * 0.03 * m);

  // back arm
  const sway = Math.sin(w * 0.5 + z.seed) * 0.12;
  const backA = lerp(runner ? -0.3 + Math.sin(w) * 0.9 * m : -0.55 + sway, -1.5, L);
  g.save(); g.translate(type === 'walker' ? 0 : 4, -17); zArm(backA, shadeHex(z.outfit, -22), [sk[1], sk[1]], shadeHex(z.outfit, -30), type === 'brute' ? 1.5 : 1, runner); g.restore();

  // torso
  if (type === 'walker') {
    const jacket = [-8.5, 2, -9.5, -9, -7.6, -19, 1.5, -22.5, 10, -20.5, 12.2, -10, 10.8, 2, 1, 3.6];
    smooth(jacket); fs(z.outfit);
    if (!EYES_ONLY) {
      g.save(); smooth(jacket); g.clip();
      g.fillStyle = col(shadeHex(z.outfit, -24)); g.fillRect(-12, -24, 8, 30);
      g.restore();
      smooth(jacket); g.lineWidth = LW; g.strokeStyle = OL; g.stroke();
    }
    g.beginPath(); g.moveTo(-0.6, -22.2); g.lineTo(7.4, -21.4); g.lineTo(3.6, -7); g.closePath(); fs('#d8d8cc', 1.3);
    smooth([1.9, -21, 4.7, -21, 5.6, -8.4, 3.8, -5, 1.8, -8.6]); fs(z.tie, 1.3);
    if (!EYES_ONLY) {
      g.strokeStyle = shadeHex(z.tie, 60); g.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(2, -17 + i * 4); g.lineTo(5.4, -19 + i * 4); g.stroke(); }
    }
    g.beginPath(); g.rect(2.1, -21.4, 2.8, 2.6); fs(shadeHex(z.tie, -20), 1.1);
    if (!EYES_ONLY) { g.strokeStyle = OL; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-1.4, -22); g.lineTo(2.6, -6); g.lineTo(5, -1.5); g.stroke(); }
    g.beginPath(); g.moveTo(-5.6, -9); g.lineTo(-2.6, -12); g.lineTo(-1.4, -8.8); g.lineTo(0.6, -11); g.lineTo(0.4, -6.4); g.lineTo(-4.6, -5.6); g.closePath(); fs(sk[0], 1.1);
  } else if (runner) {
    smooth([-7, 2, -8, -10, -6, -19.5, 2, -22, 9, -19.5, 10, -9, 8.4, 1.5, 0, 3]); fs(z.outfit);
    g.beginPath(); g.moveTo(-5, 3); g.lineTo(-3.4, -1); g.lineTo(-1.2, 2.4); g.lineTo(1.4, -1.4); g.lineTo(3.6, 2.6); g.lineTo(6, -0.4); g.lineTo(8, 2); fs(shadeHex(z.outfit, -30), 1.1);
    ellO(4, -9, 3, 2.2, '#7a2222', 1);
    if (!EYES_ONLY) { g.fillStyle = '#f1ead0'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillText(String(z.num), 2.5, -11); }
  } else {
    smooth([-12, 3, -13.5, -10, -10, -21, 2, -24.5, 12, -21.5, 15, -9, 13, 3, 0, 5]); fs('#c9b89a');
    smooth([-10, 3.4, -10.5, -12, 11.5, -12, 12.2, 3.4, 0, 5]); fs(z.outfit);
    limbO(-6, -12, -5, -22, 2.4, z.outfit);
    limbO(8, -12, 7, -22, 2.4, z.outfit);
    ellO(-6, -12.4, 1.6, 1.6, '#d9c27a', 1); ellO(8, -12.4, 1.6, 1.6, '#d9c27a', 1);
    g.beginPath(); g.rect(-3, -7, 7, 5); fs(shadeHex(z.outfit, -15), 1.1);
    ellO(4, -17, 2.6, 1.8, '#7a2222', 1);
  }

  // neck + head, pushed forward of the body
  const R = runner ? 12.8 : type === 'brute' ? 11.5 : 14;
  const hx = runner ? 9 : type === 'brute' ? 7 : 8.5, hy = runner ? -30 : type === 'brute' ? -31 : -35;
  limbO(4, -20, hx - 3, hy + R * 0.6, runner ? 4 : 5.5, sk[1]);
  g.save();
  g.translate(hx + L * 4, hy + Math.sin(w * 0.5 + z.seed) * 0.6 + L * 2);
  g.rotate(-lean * 0.6 + Math.sin(w * 0.5 + z.seed * 2) * 0.05);
  zHead(z, R, sk, type);
  g.restore();

  // front arm hangs limp in front of the body
  const frontA = lerp(runner ? -0.3 + Math.sin(w + Math.PI) * 0.9 * m : -0.45 - sway, -1.65, L);
  g.save(); g.translate(type === 'walker' ? 10 : 6, -17); zArm(frontA, z.outfit, sk, type === 'walker' ? '#d8d8cc' : shadeHex(z.outfit, -20), type === 'brute' ? 1.6 : 1.05, runner); g.restore();

  g.restore();
  g.restore();
  EYES_ONLY = false;
}

function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => clamp(v + amt, 0, 255);
  return '#' + ((1 << 24) | (f(n >> 16 & 255) << 16) | (f(n >> 8 & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

// ---------------------------------------------------------------- scenery
function drawGrave(o) {
  shadow(15, 4, 0.5);
  if (o.v === 0) {
    rr(-11, -30, 22, 30, 3, '#555b69');
    g.fillStyle = '#6f7686';
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(-9, -20); g.arc(0, -20, 9, Math.PI, 0); g.lineTo(9, 0); g.closePath(); g.fill();
    rr(-3.5, -24, 7, 1.8, 1, '#4a4f5b'); rr(-1, -27, 2, 8, 1, '#4a4f5b');
    rr(-6, -14, 12, 1.4, 0.7, '#4a4f5b'); rr(-5, -10, 10, 1.4, 0.7, '#4a4f5b');
  } else if (o.v === 1) {
    rr(-3.5, -34, 9, 34, 2, '#50566a');
    rr(-4, -34, 8, 34, 2, '#6a7184');
    rr(-11, -26, 22, 7, 2, '#6a7184');
    rr(-11, -21, 22, 2, 1, '#50566a');
  } else {
    g.save(); g.rotate(-0.18);
    rr(-10, -24, 20, 24, 4, '#4f5563');
    rr(-8, -24, 16, 24, 4, '#646b7b');
    rr(-5, -16, 10, 1.4, 0.7, '#474c58');
    g.restore();
  }
  ell(-6, -2, 5, 2, '#2f4a2a'); ell(5, -1, 4, 1.6, '#35532f');
  circ(-4, -18 + o.v, 1.5, '#4f6e3c'); circ(3, -9, 1.2, '#4f6e3c');
}

function drawTree(o) {
  shadow(26, 8, 0.45);
  g.strokeStyle = '#1f1916'; g.lineCap = 'round';
  const s = o.s;
  g.lineWidth = 11 * s;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4 * s, -40 * s, 3 * s, -80 * s); g.stroke();
  g.lineWidth = 3 * s; g.strokeStyle = '#2d2420';
  g.beginPath(); g.moveTo(2 * s, -4 * s); g.quadraticCurveTo(-1 * s, -40 * s, 4 * s, -76 * s); g.stroke();
  g.strokeStyle = '#1f1916';
  for (const [x1, y1, x2, y2, cx, cy, lw] of o.br) {
    g.lineWidth = lw * s;
    g.beginPath(); g.moveTo(x1 * s, y1 * s); g.quadraticCurveTo(cx * s, cy * s, x2 * s, y2 * s); g.stroke();
  }
  g.lineWidth = 4 * s;
  g.beginPath(); g.moveTo(-6 * s, -2 * s); g.lineTo(-14 * s, 2 * s); g.moveTo(5 * s, -1 * s); g.lineTo(13 * s, 3 * s); g.stroke();
}

function drawBush(o) {
  shadow(20, 6, 0.4);
  for (const [x, y, r, c] of o.b) circ(x, y, r, c);
}

function drawLamp() {
  shadow(10, 3.5, 0.5);
  rr(-5, -6, 10, 6, 2, '#1c1d24');
  rr(-2, -84, 4, 80, 2, '#262833');
  rr(-1, -84, 1.5, 80, 1, '#3a3d4c');
  rr(-7, -94, 14, 10, 3, '#262833');
  rr(-5, -92, 10, 7, 2, '#ffdca0');
  poly([-8, -94, 8, -94, 4, -99, -4, -99], '#1c1d24');
}

function drawPumpkin() {
  shadow(10, 3.5, 0.45);
  ell(-5, -8, 6, 8, '#c25a12'); ell(5, -8, 6, 8, '#c25a12'); ell(0, -8, 7, 8.5, '#e06d18');
  rr(-1.5, -19, 3, 5, 1, '#3d4a1f');
  poly([-6, -11, -3, -11, -4.5, -8], '#ffd35a'); poly([3, -11, 6, -11, 4.5, -8], '#ffd35a');
  poly([-5, -5, 5, -5, 3, -2, 0, -4, -3, -2], '#ffd35a');
}

function drawMedkit(p) {
  const bob = Math.sin(p.t * 3) * 2;
  shadow(9, 3, 0.4);
  g.translate(0, -8 + bob);
  rr(-9, -8, 18, 13, 3, '#f1f1f1');
  rr(-9, 1, 18, 4, 2, '#c9c9c9');
  rr(-2, -6, 4, 9, 1, '#d6333a'); rr(-5.5, -3.5, 11, 4, 1, '#d6333a');
  rr(-4, -11, 8, 3, 1.5, '#9a9a9a');
}

// ---------------------------------------------------------------- ground tile
function buildGround() {
  const s = zoom * dpr;
  const [c, tg] = mk(TILE * s, TILE * s);
  tg.scale(s, s);
  const r = seeded(7);
  tg.fillStyle = '#1a2319'; tg.fillRect(0, 0, TILE, TILE);
  const wrap = fn => { for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) { tg.save(); tg.translate(ox, oy); fn(); tg.restore(); } };
  for (let i = 0; i < 14; i++) {
    const x = r() * TILE, y = r() * TILE, rx = 14 + r() * 30, ry = rx * (0.4 + r() * 0.3), c2 = r() < 0.5 ? 'rgba(40,34,24,.55)' : 'rgba(30,44,30,.6)';
    wrap(() => { tg.fillStyle = c2; tg.beginPath(); tg.ellipse(x, y, rx, ry, 0, 0, TAU); tg.fill(); });
  }
  for (let i = 0; i < 900; i++) {
    const x = r() * TILE, y = r() * TILE, l = 2 + r() * 4, lean = (r() - 0.5) * 3;
    const cc = ['#243322', '#2b3c27', '#1e2a1c', '#314530'][(r() * 4) | 0];
    wrap(() => { tg.strokeStyle = cc; tg.lineWidth = 0.8; tg.beginPath(); tg.moveTo(x, y); tg.lineTo(x + lean, y - l); tg.stroke(); });
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * TILE, y = r() * TILE, rad = 0.8 + r() * 1.6;
    wrap(() => { tg.fillStyle = '#3a3f3a'; tg.beginPath(); tg.ellipse(x, y, rad * 1.3, rad, 0, 0, TAU); tg.fill(); tg.fillStyle = '#4c524b'; tg.beginPath(); tg.ellipse(x - 0.3, y - 0.3, rad * 0.7, rad * 0.5, 0, 0, TAU); tg.fill(); });
  }
  tileC = c;
}

// ---------------------------------------------------------------- light sprites
const LIGHT = (() => {
  const [c, lg] = mk(128, 128);
  const grd = lg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.45, 'rgba(0,0,0,.8)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  lg.fillStyle = grd; lg.fillRect(0, 0, 128, 128);
  return c;
})();
const CONE = (() => {
  const [c, cg] = mk(256, 256);
  const grd = cg.createRadialGradient(0, 128, 0, 0, 128, 256);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.6, 'rgba(0,0,0,.75)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  cg.fillStyle = grd;
  cg.beginPath(); cg.moveTo(0, 128); cg.arc(0, 128, 256, -0.42, 0.42); cg.closePath(); cg.fill();
  return c;
})();
const glowSprite = (r, gcol) => {
  const [c, gg] = mk(r * 2, r * 2);
  const grd = gg.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, gcol); grd.addColorStop(1, 'rgba(0,0,0,0)');
  gg.fillStyle = grd; gg.fillRect(0, 0, r * 2, r * 2);
  return c;
};
const GLOW_WARM = glowSprite(64, 'rgba(255,190,110,.55)');
const GLOW_ORANGE = glowSprite(64, 'rgba(255,140,40,.7)');
const GLOW_MUZZLE = glowSprite(64, 'rgba(255,210,120,.8)');
const GLOW_EYE_Y = glowSprite(16, 'rgba(255,220,90,.9)');
const GLOW_RED = glowSprite(64, 'rgba(255,60,60,.5)');

// ---------------------------------------------------------------- world decor (procedural chunks)
const CHUNK = 360;
const chunks = new Map();
function chunkAt(cx, cy) {
  const key = cx + ',' + cy;
  let ch = chunks.get(key);
  if (ch) return ch;
  const r = seeded((cx * 73856093) ^ (cy * 19349663) ^ 0x5bd1e995);
  ch = [];
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const x = cx * CHUNK + r() * CHUNK, y = cy * CHUNK + r() * CHUNK;
    if (Math.hypot(x, y) < 90) continue;
    const k = r();
    if (k < 0.42) ch.push({ k: 'grave', x, y, v: Math.floor(r() * 3) });
    else if (k < 0.6) {
      const br = [];
      for (let b = 0; b < 4; b++) {
        const y1 = -45 - b * 9, side = b % 2 ? 1 : -1;
        br.push([1, y1, side * (18 + r() * 14), y1 - 18 - r() * 16, side * 8, y1 - 16, 4 - b * 0.6]);
      }
      ch.push({ k: 'tree', x, y, s: 0.9 + r() * 0.4, br });
    } else if (k < 0.8) {
      const b = [];
      for (let j = 0; j < 7; j++) b.push([(r() - 0.5) * 26, -6 - r() * 12, 6 + r() * 6, ['#16281a', '#1c3321', '#223d27'][j % 3]]);
      b.sort((p, q) => p[1] - q[1]);
      ch.push({ k: 'bush', x, y, b });
    } else if (k < 0.9) ch.push({ k: 'lamp', x, y, light: true });
    else if (k < 0.96) ch.push({ k: 'pumpkin', x, y, light: true });
    else ch.push({ k: 'grave', x, y, v: 2 });
  }
  if (chunks.size > 600) chunks.clear();
  chunks.set(key, ch);
  return ch;
}
const DECOR_DRAW = { grave: drawGrave, tree: drawTree, bush: drawBush, lamp: drawLamp, pumpkin: drawPumpkin };

// ---------------------------------------------------------------- game state
let mode = 'menu', t = 0;
const cam = { x: 0, y: 0 };
let shake = 0, hurtFx = 0;
let player, zombies = [], bullets = [], parts = [], decals = [], pickups = [];
let wave = 0, toSpawn = 0, spawnT = 0, breakT = 0, kills = 0, score = 0;
let best = +store.get('undead.best', 0) || 0;
let groanT = 2;

const BITE_WINDUP = 0.42, BITE_COOLDOWN = 0.5;

const UPGRADES = [
  { k: 'mag', label: 'خشاب بزرگ‌تر' },
  { k: 'rate', label: 'شلیک و خشاب‌گذاری سریع‌تر' },
  { k: 'multi', label: 'گلوله‌ی دوتایی' },
  { k: 'dmg', label: 'گلوله‌ی قوی‌تر' },
  { k: 'speed', label: 'سرعت بیشتر' },
  { k: 'pierce', label: 'گلوله‌ی نافذ' },
  { k: 'hp', label: 'جان بیشتر' },
  { k: 'mag', label: 'خشاب بزرگ‌تر' },
  { k: 'rate', label: 'شلیک و خشاب‌گذاری سریع‌تر' },
  { k: 'multi', label: 'گلوله‌ی سه‌تایی' },
  { k: 'dmg', label: 'گلوله‌ی قوی‌تر' },
];

function newPlayer() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 12, hp: 100, maxHp: 100, speed: 112, grab: 0,
    walk: 0, moveAmt: 0, face: 1, aim: 0, t: 0, inv: 0, flash: 0, cool: 0,
    rate: 5, dmg: 1, multi: 1, pierce: 0, range: 340, up: 0, dead: 0,
    mag: 12, ammo: 12, reload: 0, reloadTime: 1.1, firing: false, aiming: false,
  };
}

function startReload() {
  const p = player;
  if (p.reload > 0 || p.ammo === p.mag) return;
  p.reload = p.reloadTime;
  Sound.reload();
}

function makeZombie(type, x, y) {
  const skins = ZSKIN[type];
  const hpMul = 1 + (wave - 1) * 0.12;
  // [hp, speed, radius, bite damage] — runners outpace the player on purpose
  const base = { walker: [3, 44, 11, 9], runner: [2, 122, 10, 7], brute: [14, 33, 18, 22] }[type];
  return {
    type, x, y, r: base[2], hp: Math.ceil(base[0] * hpMul), maxHp: 0,
    speed: base[1] * (1 + Math.min(0.35, (wave - 1) * 0.03)) * rand(0.9, 1.1),
    dmg: base[3], skin: pick(skins), outfit: pick(ZOUTFIT[type]), tie: pick(ZTIE),
    pants: pick(['#3d5a8a', '#46507a', '#4d4a3e', '#3a5560']), hairN: 3 + ((Math.random() * 4) | 0),
    eyeSwap: Math.random() < 0.3, lx: rand(-0.6, 0.9), ly: rand(-0.5, 0.6), num: 1 + ((Math.random() * 98) | 0),
    walk: Math.random() * TAU, moveAmt: 1, face: 1, flash: 0, kx: 0, ky: 0, seed: Math.random() * 10,
    jaw: 0, dead: 0, dieDir: 1, tx: x, ty: y, atk: 0, lunge: 0,
  };
}

// ---------------------------------------------------------------- input
// Twin-stick: left half of the screen moves, right half aims and fires.
// With a mouse: aim with the pointer, hold the button to fire.
const keys = new Set();
const STICK_R = 52;
const newStick = () => ({ id: null, ox: 0, oy: 0, dx: 0, dy: 0 });
const moveStick = newStick(), aimStick = newStick();
const mouse = { x: 0, y: 0, down: false, active: false };
const isTouch = matchMedia('(pointer: coarse)').matches;

function resetInput() {
  for (const s of [moveStick, aimStick]) { s.id = null; s.dx = s.dy = 0; }
  mouse.down = false;
  keys.clear(); // a key held while pausing would otherwise keep walking after resume
}

window.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; }
  if (mode !== 'play') return;
  if (e.target.closest('.overlay, .icon-btn')) return;
  if (e.pointerType === 'mouse') {
    mouse.active = true;
    if (e.button === 0) mouse.down = true;
    return;
  }
  const s = e.clientX < W / 2 ? moveStick : aimStick;
  if (s.id !== null) return;
  s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.dx = s.dy = 0;
});
window.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; if (mode === 'play') mouse.active = true; return; }
  for (const s of [moveStick, aimStick]) {
    if (e.pointerId !== s.id) continue;
    let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      // drag the base along so direction changes stay responsive
      s.ox += dx * (1 - STICK_R / d); s.oy += dy * (1 - STICK_R / d);
      dx = e.clientX - s.ox; dy = e.clientY - s.oy;
    }
    s.dx = dx / STICK_R; s.dy = dy / STICK_R;
  }
});
const endPointer = e => {
  if (e.pointerType === 'mouse') { if (e.button === 0 || e.type === 'pointercancel') mouse.down = false; return; }
  for (const s of [moveStick, aimStick]) if (e.pointerId === s.id) { s.id = null; s.dx = s.dy = 0; }
};
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('contextmenu', e => e.preventDefault());
// block page scrolling during play, but let a panel that does not fit (short landscape phones) scroll
document.addEventListener('touchmove', e => { if (!e.target.closest('.panel')) e.preventDefault(); }, { passive: false });

window.addEventListener('keydown', e => {
  if (e.repeat && mode !== 'play') { e.preventDefault(); return; }
  const k = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k)) keys.add(k);
  else if (k === 'Enter' || k === 'Space') {
    if (mode === 'menu' || (mode === 'over' && !ui.btnRestart.disabled)) startRun();
    else if (mode === 'pause') resumeGame();
  } else if (k === 'Escape' || k === 'KeyP') {
    if (mode === 'play') pauseGame(); else if (mode === 'pause') resumeGame();
  } else if (k === 'KeyM') toggleSound();
  else if (k === 'KeyR') { if (mode === 'play') startReload(); }
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));

function moveInput() {
  let x = moveStick.dx, y = moveStick.dy;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
  const d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  return [x, y];
}

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('score'), ammo: $('ammo'), ammoText: $('ammoText'), wave: $('waveLabel'), hpFill: $('hpFill'), hpText: $('hpText'),
  banner: $('banner'), bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub'),
  menu: $('menu'), menuBest: $('menuBest'), over: $('over'), pause: $('pause'),
  finalScore: $('finalScore'), finalWave: $('finalWave'), finalKills: $('finalKills'), overBest: $('overBest'), newBest: $('newBest'),
  btnStart: $('btnStart'), btnRestart: $('btnRestart'), btnResume: $('btnResume'), btnPause: $('btnPause'), btnSound: $('btnSound'),
};
const show = (el, on) => { el.hidden = !on; };
const syncSoundBtn = () => ui.btnSound.classList.toggle('muted', !Sound.enabled);
function toggleSound() { Sound.toggle(); syncSoundBtn(); }
ui.btnStart.addEventListener('click', startRun);
ui.btnRestart.addEventListener('click', startRun);
ui.btnResume.addEventListener('click', resumeGame);
ui.btnPause.addEventListener('click', pauseGame);
ui.btnSound.addEventListener('click', () => { toggleSound(); if (Sound.enabled) Sound.click(); });
ui.menuBest.textContent = faNum(best);
syncSoundBtn();

let bannerTimer = 0;
function banner(title, sub) {
  ui.bannerTitle.textContent = title;
  ui.bannerSub.textContent = sub || '';
  show(ui.banner, false);
  void ui.banner.offsetWidth;
  show(ui.banner, true);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => show(ui.banner, false), 2200);
}

function requestFullscreen() {
  const el = document.documentElement;
  if (!matchMedia('(pointer: coarse)').matches || document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function startRun() {
  Sound.init(); Sound.startMusic(); Sound.setMood('full'); Sound.click();
  requestFullscreen();
  const keepX = player.x, keepY = player.y;
  player = newPlayer(); player.x = keepX; player.y = keepY;
  zombies = []; bullets = []; parts = []; pickups = [];
  wave = 0; kills = 0; score = 0; hurtFx = 0;
  resetInput();
  mode = 'play';
  nextWave();
  show(ui.menu, false); show(ui.over, false); show(ui.pause, false); show(ui.hud, true);
}

function nextWave() {
  wave++;
  toSpawn = 5 + wave * 4;
  spawnT = 1.2;
  breakT = 0;
  banner(`موج ${faNum(wave)}`, wave === 1 ? 'تا صبح زنده بمون' : '');
  Sound.wave();
}

function pauseGame() {
  if (mode !== 'play') return;
  mode = 'pause'; resetInput();
  show(ui.pause, true);
  Sound.suspend();
}
function resumeGame() {
  if (mode !== 'pause') return;
  Sound.resume();
  mode = 'play';
  show(ui.pause, false);
}

function gameOver() {
  mode = 'over';
  const isBest = score > best;
  if (isBest) { best = score; store.set('undead.best', String(best)); }
  ui.finalScore.textContent = faNum(score);
  ui.finalWave.textContent = faNum(wave);
  ui.finalKills.textContent = faNum(kills);
  ui.overBest.textContent = faNum(best);
  ui.menuBest.textContent = faNum(best);
  show(ui.newBest, isBest && score > 0);
  show(ui.hud, false); show(ui.over, true); show(ui.banner, false);
  ui.btnRestart.disabled = true;
  setTimeout(() => { ui.btnRestart.disabled = false; }, 900);
  Sound.setMood('muffled');
}

function applyUpgrade() {
  const u = UPGRADES[player.up % UPGRADES.length];
  const loop = Math.floor(player.up / UPGRADES.length);
  player.up++;
  switch (u.k) {
    case 'rate': player.rate *= 1.2; player.reloadTime *= 0.85; break;
    case 'mag': player.mag += 6; player.ammo = player.mag; player.reload = 0; break;
    case 'multi': player.multi = Math.min(5, player.multi + 1); break;
    case 'dmg': player.dmg += 1; break;
    case 'speed': player.speed *= 1.12; break;
    case 'pierce': player.pierce += 1; break;
    case 'hp': player.maxHp += 25; player.hp += 25; break;
  }
  player.hp = Math.min(player.maxHp, player.hp + 20);
  player.ammo = player.mag; player.reload = 0;
  Sound.upgrade();
  return loop > 0 && u.k === 'multi' ? 'گلوله‌ی بیشتر' : u.label;
}

// ---------------------------------------------------------------- spawning
// Just off-screen; while the player is moving, mostly in front of them so running away runs into more.
function spawnPos() {
  const R = Math.hypot(W / zoom / 2, H / zoom / 2) + 40;
  const moving = Math.hypot(player.vx, player.vy) > 30;
  const a = moving && Math.random() < 0.7 ? Math.atan2(player.vy, player.vx) + rand(-0.9, 0.9) : Math.random() * TAU;
  return [player.x + Math.cos(a) * R, player.y + Math.sin(a) * R];
}

function spawnZombie() {
  let type = 'walker';
  const r = Math.random();
  if (wave >= 3 && r < Math.min(0.2, 0.06 + wave * 0.015)) type = 'brute';
  else if (r < Math.min(0.5, 0.1 + wave * 0.06)) type = 'runner';
  const [x, y] = spawnPos();
  zombies.push(makeZombie(type, x, y));
}

function blood(x, y, n, dirx = 0, diry = 0, h = 26) {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(diry, dirx) + rand(-0.9, 0.9), s = rand(40, 160);
    parts.push({ k: 'blood', x, y, z: h, vx: Math.cos(a) * s + rand(-30, 30), vy: Math.sin(a) * s * 0.6 + rand(-20, 20), vz: rand(20, 120), life: rand(0.4, 0.8), t: 0, r: rand(1.2, 2.6) });
  }
}
function decal(x, y, r) {
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push([rand(-r, r), rand(-r, r) * 0.5, rand(r * 0.3, r * 0.7)]);
  decals.push({ x, y, blobs, t: 0 });
  if (decals.length > 90) decals.shift();
}

// ---------------------------------------------------------------- update
function update(dt) {
  t += dt;
  const p = player;
  p.t += dt;

  // --- player movement
  let mx = 0, my = 0;
  if (mode === 'play') [mx, my] = moveInput();
  const mag = Math.min(1, Math.hypot(mx, my));
  p.vx = lerp(p.vx, mx * p.speed, Math.min(1, dt * 12));
  p.vy = lerp(p.vy, my * p.speed, Math.min(1, dt * 12));
  if (mode === 'play') {
    const slow = Math.max(0.3, 1 - 0.28 * (p.grab || 0));
    p.x += p.vx * slow * dt; p.y += p.vy * slow * dt;
  }
  p.moveAmt = lerp(p.moveAmt, mode === 'play' ? mag : 0, Math.min(1, dt * 10));
  p.walk += dt * (6 + 8 * p.moveAmt) * p.moveAmt;
  if (Math.abs(p.vx) > 8) p.face = Math.sign(p.vx);
  p.inv = Math.max(0, p.inv - dt);
  p.flash = Math.max(0, p.flash - dt * 14);

  // --- zombies
  const px = p.x, py = p.y;
  let grabs = 0;
  const leash = Math.hypot(W / zoom / 2, H / zoom / 2) + 220;
  for (const z of zombies) {
    if (z.dead) { z.dead += dt; z.flash = Math.max(0, z.flash - dt * 12); continue; }
    let dx, dy;
    if (mode === 'menu') {
      if (Math.hypot(z.tx - z.x, z.ty - z.y) < 12) { const a = Math.random() * TAU, d = rand(120, 220); z.tx = px + Math.cos(a) * d; z.ty = py + Math.sin(a) * d; }
      dx = z.tx - z.x; dy = z.ty - z.y;
    } else { dx = px - z.x; dy = py - z.y; }
    let d = Math.hypot(dx, dy) || 1;
    // stragglers left far behind come back from the direction the player is heading
    if (mode === 'play' && d > leash) {
      const [nx, ny] = spawnPos();
      z.x = nx; z.y = ny; dx = px - z.x; dy = py - z.y; d = Math.hypot(dx, dy) || 1;
    }
    const inReach = mode === 'play' && d < z.r + p.r + 6;
    const sp = inReach ? 0 : z.speed * (mode === 'menu' ? 0.5 : 1) * (mode === 'over' ? 0.4 : 1);
    z.x += (dx / d) * sp * dt + z.kx * dt;
    z.y += (dy / d) * sp * dt + z.ky * dt;
    z.kx *= Math.exp(-8 * dt); z.ky *= Math.exp(-8 * dt);
    if (Math.abs(dx) > 4) z.face = Math.sign(dx);
    z.walk += dt * (z.type === 'runner' ? 13 : z.type === 'brute' ? 4.5 : 5.5);
    z.flash = Math.max(0, z.flash - dt * 12);
    z.jaw = 0.5 + 0.5 * Math.sin(t * 7 + z.seed * 3);

    // bite: stop, wind up (lunge), then chomp; each zombie on you also slows you down
    if (mode === 'play' && d < z.r + p.r + 6) {
      grabs++;
      if (z.atk === 0 && Math.random() < 0.5) Sound.groan(0.16, z.type === 'brute' ? 0.7 : 1.15);
      z.atk += dt;
      if (z.atk >= BITE_WINDUP) {
        z.atk = -BITE_COOLDOWN;
        if (p.inv <= 0) {
          p.hp -= z.dmg; p.inv = 0.22; hurtFx = 1; shake = Math.max(shake, z.type === 'brute' ? 0.9 : 0.55);
          p.vx += (-dx / d) * 90; p.vy += (-dy / d) * 90;
          blood(p.x, p.y, 8, -dx, -dy, 30);
          Sound.bite(); Sound.hurt();
          if (navigator.vibrate) navigator.vibrate(z.type === 'brute' ? 90 : 45);
          if (p.hp <= 0) { p.hp = 0; Sound.death(); blood(p.x, p.y, 20); decal(p.x, p.y, 14); gameOver(); }
        }
      }
    } else if (z.atk > 0) z.atk = Math.max(0, z.atk - dt * 2);
    else if (z.atk < 0) z.atk = Math.min(0, z.atk + dt);
    z.lunge = z.atk > 0 ? Math.min(1, z.atk / BITE_WINDUP) : Math.max(0, z.lunge - dt * 5);
    if (z.lunge > 0) z.jaw = Math.max(z.jaw, z.lunge);
  }
  p.grab = grabs;
  // separation
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i]; if (a.dead) continue;
    for (let j = i + 1; j < zombies.length; j++) {
      const b = zombies[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5, nx = dx / d, ny = dy / d;
        const wa = b.type === 'brute' ? 0.8 : 0.5, wb = 1 - wa;
        a.x -= nx * push * wa * 2; a.y -= ny * push * wa * 2;
        b.x += nx * push * wb * 2; b.y += ny * push * wb * 2;
      }
    }
  }
  zombies = zombies.filter(z => z.dead < 1.6 && Math.hypot(z.x - px, z.y - py) < 1400);

  if (mode === 'play') {
    // --- aiming & shooting (player-controlled)
    p.cool -= dt;
    let aimA = null;
    p.firing = false;
    const aMag = Math.hypot(aimStick.dx, aimStick.dy);
    if (aimStick.id !== null && aMag > 0.25) {
      aimA = Math.atan2(aimStick.dy, aimStick.dx);
      p.firing = true;
      // light aim assist for thumbs: snap to a zombie within a narrow cone
      let bestD = p.range, snap = null;
      for (const z of zombies) {
        if (z.dead) continue;
        const d = Math.hypot(z.x - px, z.y - py);
        if (d > bestD) continue;
        const za = Math.atan2(z.y - py, z.x - px);
        if (Math.abs(angDiff(za, aimA)) < 0.16) { bestD = d; snap = za; }
      }
      if (snap !== null) aimA = snap;
    } else if (mouse.active) {
      const sx = (px - cam.x) * zoom + W / 2, sy = (py - 26 - cam.y) * zoom + H / 2;
      aimA = Math.atan2(mouse.y - sy, mouse.x - sx);
      p.firing = mouse.down;
    }
    p.aiming = aimA !== null;
    if (aimA !== null) {
      p.aim = aimA;
      p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
    } else {
      // gun and flashlight follow the walking direction
      const moveA = mag > 0.2 ? Math.atan2(p.vy, p.vx) : (p.face > 0 ? 0 : Math.PI);
      p.aim += angDiff(moveA, p.aim) * Math.min(1, dt * 10);
    }

    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) { p.reload = 0; p.ammo = p.mag; }
    } else if (p.firing && p.cool <= 0 && p.ammo > 0) {
      p.cool = 1 / p.rate;
      p.ammo--;
      const spread = 0.13;
      for (let i = 0; i < p.multi; i++) {
        const a = p.aim + (i - (p.multi - 1) / 2) * spread + rand(-0.035, 0.035);
        bullets.push({ x: px + Math.cos(a) * 24, y: py + Math.sin(a) * 24, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, life: p.range / 720 + 0.05, pierce: p.pierce, hit: [] });
      }
      p.flash = 1;
      p.vx -= Math.cos(p.aim) * 18; p.vy -= Math.sin(p.aim) * 18;
      parts.push({ k: 'shell', x: px, y: py, z: 28, vx: -Math.cos(p.aim) * 40 + rand(-30, 30), vy: rand(-20, 20), vz: rand(60, 110), life: 1.2, t: 0, rot: 0 });
      Sound.shot();
      if (p.ammo === 0) startReload();
    }

    // --- waves
    if (toSpawn > 0) {
      spawnT -= dt;
      const alive = zombies.filter(z => !z.dead).length;
      if (spawnT <= 0 && alive < 45) {
        spawnZombie(); toSpawn--;
        spawnT = Math.max(0.22, 1.05 - wave * 0.07) * rand(0.6, 1.3);
        if (wave > 2 && Math.random() < 0.25 && toSpawn > 0) { spawnZombie(); toSpawn--; }
      }
    } else if (!zombies.some(z => !z.dead)) {
      if (breakT === 0) {
        breakT = 3.2;
        score += wave * 100;
        banner('موج تمام شد!', '+ ' + applyUpgrade());
      }
      breakT -= dt;
      if (breakT <= 0) nextWave();
    }

    groanT -= dt;
    if (groanT <= 0) {
      groanT = rand(1.5, 4);
      const near = zombies.find(z => !z.dead && Math.hypot(z.x - px, z.y - py) < 260);
      if (near) Sound.groan(0.12, near.type === 'brute' ? 0.7 : 1);
    }
  }

  // --- bullets
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const z of zombies) {
      if (z.dead || b.hit.includes(z)) continue;
      const dx = z.x - b.x, dy = z.y - b.y;
      if (dx * dx + dy * dy < (z.r + 4) * (z.r + 4)) {
        b.hit.push(z);
        z.hp -= player.dmg; z.flash = 1;
        const kb = z.type === 'brute' ? 60 : 180;
        const bl = Math.hypot(b.vx, b.vy);
        z.kx += (b.vx / bl) * kb; z.ky += (b.vy / bl) * kb;
        blood(z.x, z.y, 5, b.vx, b.vy, z.type === 'brute' ? 34 : 26);
        Sound.hit();
        if (z.hp <= 0) killZombie(z, b.vx);
        if (b.pierce-- <= 0) { b.life = 0; break; }
      }
    }
  }
  bullets = bullets.filter(b => b.life > 0);

  // --- pickups
  for (const k of pickups) {
    k.t += dt;
    if (mode === 'play' && Math.hypot(k.x - px, k.y - py) < 22) {
      k.taken = true;
      p.hp = Math.min(p.maxHp, p.hp + 30);
      Sound.pickup();
    }
  }
  pickups = pickups.filter(k => !k.taken && k.t < 20);

  // --- particles
  for (const q of parts) {
    q.t += dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.z += q.vz * dt; q.vz -= 420 * dt;
    if (q.z <= 0) {
      q.z = 0; q.vx *= 0.5; q.vy *= 0.5; q.vz = q.k === 'shell' ? -q.vz * 0.3 : 0;
      if (q.k === 'blood' && !q.landed) { q.landed = true; if (Math.random() < 0.25) decal(q.x, q.y, rand(2, 4)); }
    }
    if (q.k === 'shell') q.rot += dt * 18 * (q.z > 0 ? 1 : 0);
  }
  parts = parts.filter(q => q.t < q.life);
  for (const d of decals) d.t += dt;

  // --- camera
  cam.x = lerp(cam.x, p.x, Math.min(1, dt * 6));
  cam.y = lerp(cam.y, p.y - 10 - menuOffset(), Math.min(1, dt * 6));
  shake *= Math.exp(-7 * dt);
  hurtFx *= Math.exp(-3 * dt);
}

// On the portrait menu, the panel covers the middle, so show the survivor lower on screen.
const menuOffset = () => (mode === 'menu' && H > W ? (H * 0.27) / zoom : 0);

function killZombie(z, dir) {
  z.dead = 0.0001; z.dieDir = dir >= 0 ? 1 : -1;
  kills++;
  score += { walker: 10, runner: 15, brute: 60 }[z.type];
  blood(z.x, z.y, z.type === 'brute' ? 18 : 10, 0, 0);
  decal(z.x, z.y, z.type === 'brute' ? 16 : 11);
  shake = Math.max(shake, z.type === 'brute' ? 0.5 : 0.18);
  if (Math.random() < 0.3) Sound.groan(0.14, z.type === 'brute' ? 0.65 : 1.1);
  if (Math.random() < (z.type === 'brute' ? 0.5 : 0.06) && mode === 'play') pickups.push({ x: z.x, y: z.y, t: 0 });
}

// ---------------------------------------------------------------- render
function worldTransform(sx, sy) {
  const k = zoom * dpr;
  ctx.setTransform(k, 0, 0, k, (W / 2 - cam.x * zoom + sx) * dpr, (H / 2 - cam.y * zoom + sy) * dpr);
}

function drawActor(fn, obj, x, y, face, extra) {
  g.save();
  g.translate(x, y);
  if (face < 0) g.scale(-1, 1);
  fn(obj, extra);
  g.restore();
}

function render() {
  g = ctx;
  const sh = mode === 'pause' ? 0 : shake; // shake only decays in update(), so freeze it while paused
  const sx = (Math.random() - 0.5) * sh * 12, sy = (Math.random() - 0.5) * sh * 12;
  worldTransform(sx, sy);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const halfW = W / zoom / 2 + 40, halfH = H / zoom / 2 + 40;
  const x0 = cam.x - halfW, x1 = cam.x + halfW, y0 = cam.y - halfH, y1 = cam.y + halfH + 60;

  // ground
  for (let tx = Math.floor(x0 / TILE) * TILE; tx < x1; tx += TILE)
    for (let ty = Math.floor(y0 / TILE) * TILE; ty < y1; ty += TILE)
      ctx.drawImage(tileC, tx, ty, TILE + 0.6, TILE + 0.6);

  // blood decals
  for (const d of decals) {
    if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
    ctx.globalAlpha = Math.max(0, 0.85 - d.t / 40);
    ctx.fillStyle = '#4a0d0d';
    for (const [bx, by, r] of d.blobs) { ctx.beginPath(); ctx.ellipse(d.x + bx, d.y + by, r, r * 0.55, 0, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;

  // collect visible scenery + actors, y-sorted
  const list = [];
  const lights = [];
  const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK), cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor((y1 + 100) / CHUNK);
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    for (const o of chunkAt(cx, cy)) {
      if (o.x < x0 - 60 || o.x > x1 + 60 || o.y < y0 || o.y > y1 + 120) continue;
      list.push({ y: o.y, o, kind: 'decor' });
      if (o.k === 'lamp') lights.push([o.x, o.y - 88, 150, GLOW_WARM, 1]);
      if (o.k === 'pumpkin') lights.push([o.x, o.y - 8, 60, GLOW_ORANGE, 0.8 + Math.sin(t * 9 + o.x) * 0.15]);
    }
  }
  for (const k of pickups) list.push({ y: k.y, o: k, kind: 'pickup' });
  for (const z of zombies) if (z.x > x0 - 40 && z.x < x1 + 40 && z.y > y0 && z.y < y1 + 80) list.push({ y: z.y, o: z, kind: 'zombie' });
  if (mode !== 'over') list.push({ y: player.y, o: player, kind: 'player' });
  list.sort((a, b) => a.y - b.y);

  for (const it of list) {
    const o = it.o;
    if (it.kind === 'decor') { drawActor(DECOR_DRAW[o.k], o, o.x, o.y, 1); }
    else if (it.kind === 'pickup') {
      g.save(); g.translate(o.x, o.y); g.globalAlpha = o.t > 17 ? (Math.sin(o.t * 20) > 0 ? 1 : 0.3) : 1; drawMedkit(o); g.restore(); g.globalAlpha = 1;
    } else if (it.kind === 'zombie') {
      g.save(); g.translate(o.x, o.y);
      if (o.dead) {
        const k = Math.min(1, o.dead / 0.3);
        g.rotate(o.dieDir * k * Math.PI / 2 * 0.95);
        g.globalAlpha = o.dead > 0.9 ? Math.max(0, 1 - (o.dead - 0.9) / 0.7) : 1;
      }
      if (o.face < 0) g.scale(-1, 1);
      FL = o.flash;
      drawZombie(o, 'body');
      FL = 0;
      g.restore(); g.globalAlpha = 1;
    } else {
      const p = o;
      const blink = p.inv > 0 && Math.sin(p.t * 40) > 0;
      g.save(); g.translate(p.x, p.y);
      if (blink) g.globalAlpha = 0.55;
      if (p.face < 0) g.scale(-1, 1);
      const aimLocal = p.face < 0 ? Math.PI - p.aim : p.aim;
      const a = Math.atan2(Math.sin(aimLocal), Math.cos(aimLocal));
      const aimBehind = Math.abs(a) > Math.PI / 2;
      if (aimBehind) drawGun(p, a, p.flash);
      drawSurvivor(p);
      if (!aimBehind) drawGun(p, a, p.flash);
      g.restore(); g.globalAlpha = 1;
    }
  }

  // bullets (tracers)
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of bullets) {
    const l = Math.hypot(b.vx, b.vy);
    ctx.strokeStyle = 'rgba(255,220,140,.9)'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y - 26); ctx.lineTo(b.x - b.vx / l * 16, b.y - 26 - b.vy / l * 16); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // particles
  for (const q of parts) {
    if (q.k === 'blood') {
      ctx.fillStyle = q.z > 0 ? '#8e1212' : '#5a0d0d';
      ctx.beginPath(); ctx.arc(q.x, q.y - q.z, q.r, 0, TAU); ctx.fill();
    } else {
      ctx.save(); ctx.translate(q.x, q.y - q.z); ctx.rotate(q.rot);
      ctx.fillStyle = '#d9a441'; ctx.fillRect(-2, -1, 4, 2);
      ctx.restore();
    }
  }

  // ---- darkness with lights
  const m = dpr * darkScale;
  darkG.setTransform(1, 0, 0, 1, 0, 0);
  darkG.globalCompositeOperation = 'source-over';
  darkG.fillStyle = 'rgba(6,8,22,0.8)';
  darkG.fillRect(0, 0, darkC.width, darkC.height);
  darkG.globalCompositeOperation = 'destination-out';
  const toDark = (x, y) => [((x - cam.x) * zoom + W / 2 + sx) * m, ((y - cam.y) * zoom + H / 2 + sy) * m];
  const hole = (x, y, r, a = 1) => {
    const [dx, dy] = toDark(x, y), rr2 = r * zoom * m;
    darkG.globalAlpha = a;
    darkG.drawImage(LIGHT, dx - rr2, dy - rr2, rr2 * 2, rr2 * 2);
  };
  const p = player;
  if (mode !== 'over') {
    hole(p.x, p.y - 20, 175, 1);
    hole(p.x, p.y - 20, 90, 1);
    const [dx, dy] = toDark(p.x, p.y - 26);
    const len = 330 * zoom * m;
    darkG.save(); darkG.translate(dx, dy); darkG.rotate(p.aim);
    darkG.globalAlpha = 0.95;
    darkG.drawImage(CONE, 0, -len / 2, len, len);
    darkG.restore();
    if (p.flash > 0) hole(p.x + Math.cos(p.aim) * 30, p.y - 26 + Math.sin(p.aim) * 30, 140, p.flash);
  } else {
    hole(p.x, p.y, 90, 0.8);
  }
  for (const [x, y, r, , a] of lights) { hole(x, y + 60, r, a * 0.9); hole(x, y, r * 0.5, a); }
  for (const k of pickups) hole(k.x, k.y - 8, 40, 0.8);
  // faint moonlight
  darkG.globalAlpha = 1;
  darkG.globalCompositeOperation = 'source-over';

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(darkC, 0, 0, canvas.width, canvas.height);

  // additive glows on top of darkness
  worldTransform(sx, sy);
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, spr, a] of lights) {
    ctx.globalAlpha = a;
    ctx.drawImage(spr, x - r * 0.5, y - r * 0.5, r, r);
  }
  if (p.flash > 0 && mode === 'play') {
    ctx.globalAlpha = p.flash * 0.9;
    const fx = p.x + Math.cos(p.aim) * 30, fy = p.y - 28 + Math.sin(p.aim) * 30;
    ctx.drawImage(GLOW_MUZZLE, fx - 50, fy - 50, 100, 100);
  }
  for (const k of pickups) { ctx.globalAlpha = 0.6 + Math.sin(k.t * 4) * 0.2; ctx.drawImage(GLOW_RED, k.x - 24, k.y - 34, 48, 48); }
  // zombie eyes stay visible in the dark
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  g = ctx;
  for (const z of zombies) {
    if (z.dead || z.x < x0 || z.x > x1 || z.y < y0 || z.y > y1 + 80) continue;
    g.save(); g.translate(z.x, z.y); if (z.face < 0) g.scale(-1, 1);
    drawZombie(z, 'eyes');
    g.restore();
  }
  ctx.globalAlpha = 1;

  // player health ring under the feet
  if (mode === 'play') {
    const f = p.hp / p.maxHp;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 17, 6, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = f > 0.5 ? '#6ee07a' : f > 0.25 ? '#f2c14e' : '#ff4d4d';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 17, 6, 0, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();

    // laser sight while aiming (visible in the dark)
    if (p.aiming && p.reload <= 0) {
      const mx0 = p.x + Math.cos(p.aim) * 30, my0 = p.y - 26 + Math.sin(p.aim) * 30;
      const grd = ctx.createLinearGradient(mx0, my0, mx0 + Math.cos(p.aim) * 150, my0 + Math.sin(p.aim) * 150);
      grd.addColorStop(0, 'rgba(255,60,60,.7)'); grd.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = grd; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(mx0, my0); ctx.lineTo(mx0 + Math.cos(p.aim) * 150, my0 + Math.sin(p.aim) * 150); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    // reload ring above the head
    if (p.reload > 0) {
      const k = 1 - p.reload / p.reloadTime;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.arc(p.x, p.y - 76, 8, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffd36b';
      ctx.beginPath(); ctx.arc(p.x, p.y - 76, 8, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    }
  }

  // screen-space overlays
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const low = mode === 'play' ? clamp(1 - p.hp / p.maxHp, 0, 1) : 0;
  const hv = Math.max(hurtFx, low > 0.6 ? (low - 0.6) * 1.5 * (0.6 + 0.4 * Math.sin(t * 6)) : 0);
  if (hv > 0.02) {
    const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(160,0,0,0)'); grd.addColorStop(1, `rgba(160,0,0,${0.6 * hv})`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  }
  if (mode === 'play' && isTouch) {
    const sb = Math.min(110, H * 0.16);
    drawStick(moveStick, 70 + 16, H - sb, 'rgba(255,255,255,.35)', null);
    drawStick(aimStick, W - 70 - 16, H - sb, 'rgba(255,90,80,.55)', 'crosshair');
  }
  if (mode === 'play' && mouse.active && !isTouch) {
    ctx.strokeStyle = mouse.down ? '#ff5a4a' : 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, TAU);
    ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 14);
    ctx.stroke();
  }
}

// Active sticks appear where the thumb landed; idle ones show as faint hints at their home spot.
function drawStick(s, hx, hy, knobCol, icon) {
  const on = s.id !== null;
  const ox = on ? s.ox : hx, oy = on ? s.oy : hy;
  ctx.globalAlpha = on ? 0.95 : 0.4;
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(ox, oy, STICK_R, 0, TAU); ctx.fill(); ctx.stroke();
  const kx = ox + s.dx * STICK_R, ky = oy + s.dy * STICK_R;
  ctx.fillStyle = knobCol;
  ctx.beginPath(); ctx.arc(kx, ky, 22, 0, TAU); ctx.fill();
  if (icon) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(kx, ky, 8, 0, TAU);
    ctx.moveTo(kx - 13, ky); ctx.lineTo(kx - 4, ky); ctx.moveTo(kx + 4, ky); ctx.lineTo(kx + 13, ky);
    ctx.moveTo(kx, ky - 13); ctx.lineTo(kx, ky - 4); ctx.moveTo(kx, ky + 4); ctx.lineTo(kx, ky + 13);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- HUD
let hudScore = -1, hudHp = -1, hudWave = -1, hudAmmo = '';
function updateHud() {
  if (mode !== 'play') return;
  const am = player.reload > 0 ? 'R' : player.ammo + '/' + player.mag;
  if (am !== hudAmmo) {
    hudAmmo = am;
    ui.ammo.classList.toggle('reloading', player.reload > 0);
    ui.ammo.classList.toggle('low', player.reload <= 0 && player.ammo <= Math.ceil(player.mag * 0.25));
    ui.ammoText.textContent = player.reload > 0 ? 'پر کردن…' : `${player.ammo} / ${player.mag}`;
  }
  if (score !== hudScore) { hudScore = score; ui.score.textContent = score.toLocaleString('en-US'); }
  if (wave !== hudWave) { hudWave = wave; ui.wave.textContent = `موج ${faNum(wave)}`; }
  const hp = Math.ceil(player.hp) + player.maxHp * 1000;
  if (hp !== hudHp) {
    hudHp = hp;
    const f = player.hp / player.maxHp;
    ui.hpFill.style.transform = `scaleX(${f})`;
    ui.hpFill.style.background = f > 0.5 ? 'linear-gradient(90deg,#3fbf5a,#8ef08c)' : f > 0.25 ? 'linear-gradient(90deg,#d99a1e,#f2c14e)' : 'linear-gradient(90deg,#b3232a,#ff5a5a)';
    ui.hpText.textContent = Math.ceil(player.hp);
  }
}

// ---------------------------------------------------------------- adaptive resolution
const QUALITY = [2, 1.5, 1.25, 1];
let perfAcc = 0, perfN = 0;
function trackPerf(dt) {
  if (mode !== 'play') { perfAcc = 0; perfN = 0; return; }
  perfAcc += dt; perfN++;
  if (perfN < 150) return;
  const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
  if (avg > 1 / 45) { const next = QUALITY.find(q => q < dpr - 0.01); if (next) { dprCap = next; resize(); } }
}

// ---------------------------------------------------------------- lifecycle
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pauseGame(); Sound.suspend(); }
  else if (mode !== 'pause') Sound.resume();
});
window.addEventListener('blur', () => { keys.clear(); mouse.down = false; if (mode === 'play') pauseGame(); });
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) return;
  if (mode !== 'pause') update(dt);
  render();
  updateHud();
  trackPerf(dt);
}

player = newPlayer();
resize();
for (let i = 0; i < 6; i++) {
  const a = Math.random() * TAU, d = rand(140, 240);
  wave = 1 + (i % 3);
  const z = makeZombie(['walker', 'walker', 'runner', 'walker', 'brute', 'walker'][i], Math.cos(a) * d, Math.sin(a) * d);
  zombies.push(z);
}
wave = 0;
cam.x = 0; cam.y = -10 - menuOffset();
requestAnimationFrame(frame);
})();
