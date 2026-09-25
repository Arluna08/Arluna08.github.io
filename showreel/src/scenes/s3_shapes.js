// 03 — Shape systems. A 9×5 field of superformula shapes; each beat a new state ripples
// through the grid from a different origin (morph + spin + colour + scale bump), MoGraph style.
// The centre shape then becomes a portal and zooms us into the next scene.
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, prog, curve, TAU, mixHex, hexToRgb } from '../util.js';

const BEAT = 0.46875;
const COLS = 9, ROWS = 5, CELL = 180, RAD = 62, N = 128;
const GX = (W - COLS * CELL) / 2 + CELL / 2, GY = (H - ROWS * CELL) / 2 + CELL / 2;
const CC = 4, CR = 2; // centre cell

const PRESETS = {
  circle: [0, 1, 1, 1],
  squircle: [4, 5, 5, 5],
  star: [5, 2, 7, 7],
  sparkle: [4, 0.5, 0.5, 0.5],
  diamond: [4, 1, 1, 1],
  burst: [12, 2, 6, 6],
  flower: [10, 5, 4, 8],
};
const PROFILES = {};

function superformula(m, n1, n2, n3) {
  const r = new Float32Array(N);
  let mx = 0;
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * TAU;
    const a = Math.pow(Math.abs(Math.cos((m * ph) / 4)), n2) + Math.pow(Math.abs(Math.sin((m * ph) / 4)), n3);
    r[i] = a > 0 ? Math.pow(a, -1 / n1) : 1e6;
    mx = Math.max(mx, r[i]);
  }
  for (let i = 0; i < N; i++) r[i] /= mx;
  return r;
}

// States: which preset + colour each cell takes, when, and where the wave starts.
const STATES = [
  { b: 8.0, shape: () => 'circle', color: () => C.paper, origin: [960, 540] },
  { b: 9.0, shape: (c, r) => ((c + r) % 2 ? 'squircle' : 'star'), color: (c, r) => ((c + r) % 2 ? C.paper : C.lime), origin: [-200, 540] },
  { b: 10.0, shape: (c, r) => ((c + r) % 2 ? 'diamond' : 'sparkle'), color: (c, r) => ((c + r) % 2 ? C.lime : C.paper), origin: [960, 540] },
  { b: 11.0, shape: () => 'burst', color: (c, r) => ((Math.abs(c - CC) + Math.abs(r - CR)) % 2 ? C.paper : C.lime), origin: [2100, 1250] },
];
const WAVE_SPEED = 2600; // px per beat
const MORPH = 0.42; // beats

function cellState(c, r, x, y, b) {
  // returns blended radius profile inputs for this cell at beat b
  let prevShape = 'circle', prevColor = C.paper, shape = 'circle', color = C.paper, k = 1, rot = 0, bump = 0;
  for (let s = 1; s < STATES.length; s++) {
    const st = STATES[s];
    // the centre cell answers each state on the beat so the portal is a clean shape
    const d = c === CC && r === CR ? 0 : Math.hypot(x - st.origin[0], y - st.origin[1]) / WAVE_SPEED;
    const p = prog(b, st.b + d, MORPH);
    if (p <= 0) break;
    prevShape = STATES[s - 1].shape(c, r);
    prevColor = STATES[s - 1].color(c, r);
    shape = st.shape(c, r);
    color = st.color(c, r);
    k = ease.inOutCubic(p);
    rot += (Math.PI / 2) * ease.outBack(p, 2.2);
    bump = Math.sin(Math.PI * p);
    if (p < 1) break;
    prevShape = shape;
    prevColor = color;
    bump = 0;
  }
  if (c === CC && r === CR) { color = C.coral; prevColor = C.coral; }
  return { prevShape, shape, k, rot, bump, color: k >= 1 ? color : mixHex(prevColor, color, k) };
}

function shapePath(ctx, x, y, radius, rot, A, B, k) {
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * TAU;
    const rr = radius * (A[i] + (B[i] - A[i]) * k);
    const a = ph + rot - Math.PI / 2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paramReadout(ctx, b) {
  // live superformula parameters of the centre cell, like a parameter panel
  const x = GX + CC * CELL, y = GY + CR * CELL;
  const st = cellState(CC, CR, x, y, b);
  const A = PRESETS[st.prevShape], B = PRESETS[st.shape];
  const v = A.map((a, i) => lerp(a, B[i], st.k));
  ctx.save();
  ctx.font = '500 14px "Geist Mono"';
  ctx.letterSpacing = '2px';
  ctx.fillStyle = C.paper;
  ctx.globalAlpha = 0.78 * clamp((b - 8.1) / 0.3);
  ctx.textAlign = 'left';
  const txt = 'SUPERFORMULA   r(a) = (|cos(ma/4)|^n2 + |sin(ma/4)|^n3)^(-1/n1)';
  ctx.fillText(txt, 56, 118);
  ctx.globalAlpha *= 0.8;
  ctx.fillText(`m ${v[0].toFixed(2)}   n1 ${v[1].toFixed(2)}   n2 ${v[2].toFixed(2)}   n3 ${v[3].toFixed(2)}`, 56, 142);
  ctx.restore();
}

export default {
  id: 'shapes',
  label: 'SHAPE SYSTEMS',
  from: 8,
  to: 12,
  hud: 'light',

  init() {
    for (const [k, v] of Object.entries(PRESETS)) PROFILES[k] = superformula(...v);
  },

  draw(ctx, t, R) {
    const b = t / BEAT;
    ctx.fillStyle = C.cobalt;
    ctx.fillRect(-300, -300, W + 600, H + 600);

    // construction grid: hairlines + crosses, drawn on from the centre
    const g = curve.snap(prog(b, 7.7, 0.7));
    const gOut = prog(b, 11.45, 0.3);
    if (g > 0) {
      ctx.save();
      ctx.strokeStyle = C.paper;
      ctx.globalAlpha = 0.14 * (1 - gOut);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= COLS; c++) {
        const x = GX - CELL / 2 + c * CELL;
        const h = (ROWS * CELL / 2) * g;
        ctx.moveTo(x, H / 2 - h); ctx.lineTo(x, H / 2 + h);
      }
      for (let r = 0; r <= ROWS; r++) {
        const y = GY - CELL / 2 + r * CELL;
        const w = (COLS * CELL / 2) * g;
        ctx.moveTo(W / 2 - w, y); ctx.lineTo(W / 2 + w, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    const zoom = prog(b, 11.5, 0.5); // portal phase
    const out = (d) => ease.inBack(prog(b, 11.5 + d * 0.12, 0.32), 1.6);

    // shapes
    let portal = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = GX + c * CELL, y = GY + r * CELL;
        const dist = Math.hypot(x - W / 2, y - H / 2);
        const pop = ease.outBack(prog(b, 8.0 + (dist / 1000) * 0.45, 0.45), 2.0);
        if (pop <= 0) continue;
        const st = cellState(c, r, x, y, b);
        const isCentre = c === CC && r === CR;
        let scale = pop * (1 + 0.32 * st.bump) * (1 + 0.07 * Math.sin(TAU * (b * 0.9 - dist / 900)));
        // off-beat breathing on the hats
        scale *= 1 - 0.05 * Math.pow(Math.max(0, Math.cos(TAU * (b - 8.5))), 8) * (b > 8.4 ? 1 : 0);
        let rot = st.rot + (1 - pop) * -1.4 + ((c + r) % 2 ? 0.22 : -0.22) * (b - 8);
        if (isCentre) {
          portal = { x, y, rot, st, scale };
          continue;
        }
        const o = out(dist / 1000);
        if (o >= 1) continue;
        scale *= 1 - o;
        // pushed outward as the portal opens
        const push = 1 + 0.55 * ease.inCubic(zoom);
        const px = W / 2 + (x - W / 2) * push, py = H / 2 + (y - H / 2) * push;
        ctx.fillStyle = st.color;
        shapePath(ctx, px, py, RAD * scale, rot, PROFILES[st.prevShape], PROFILES[st.shape], st.k);
        ctx.fill();
      }
    }

    paramReadout(ctx, b);

    // the portal: centre shape grows past the frame; the next scene lives inside it
    if (portal) {
      const { x, y, st } = portal;
      const grow = ease.inExpo(zoom);
      const radius = RAD * portal.scale * (1 + grow * 44);
      const rot = portal.rot + zoom * 1.2;
      const A = PROFILES[st.prevShape], B = PROFILES[st.shape];
      if (zoom > 0) {
        ctx.save();
        shapePath(ctx, x, y, radius, rot, A, B, st.k);
        ctx.clip();
        R.drawScene('particles', ctx, t);
        ctx.restore();
        ctx.save();
        ctx.lineWidth = 6 + 20 * grow;
        ctx.strokeStyle = C.coral;
        shapePath(ctx, x, y, radius, rot, A, B, st.k);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = st.color;
        shapePath(ctx, x, y, radius, rot, A, B, st.k);
        ctx.fill();
      }
    }
  },
};
