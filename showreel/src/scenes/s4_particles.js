// 04 — Particles. 9 000 particles, simulated once at 240 Hz (so any frame can be sampled in any
// order): an explosion, a curl-noise flow field, a spring-loaded formation of the word FLOW,
// then a left-to-right peel into a rotating Fibonacci sphere that the 3D scene inherits.
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, prog, smoothstep, curve, TAU, mulberry32, noise } from '../util.js';
import { drawText } from '../type.js';
import { NP, PCOL, PSIZE, SIGMA, SPHERE_R, sphereAngles, projectPoint, drawDots } from '../sphere.js';

const BEAT = 0.46875;
const T0 = 12 * BEAT, T1 = 16 * BEAT;
const DT = 1 / 240;
const STEPS = Math.ceil((T1 - T0) / DT) + 2;
const CX = W / 2, CY = H / 2;

let POS = null; // STEPS * NP * 2
let HOME = null, TGT = null, DEPART = null;
const X = new Float32Array(NP), Y = new Float32Array(NP), S = new Float32Array(NP), A = new Float32Array(NP);
const tmp = new Float32Array(4);

function sampleWord(R) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const f = R.faces.display;
  const size = 500;
  const cap = (f.capHeight * size) / f.upm;
  drawText(g, f, 'FLOW', { size, x: CX, y: CY + cap / 2 + 6, align: 'center', wght: 900, wdth: 108, fill: '#fff' });
  const data = g.getImageData(0, 0, W, H).data;
  let area = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 127) area++;
  const rng = mulberry32(99);
  let sp = Math.sqrt(area / NP);
  for (let attempt = 0; attempt < 12; attempt++) {
    const pts = [];
    for (let y = sp / 2; y < H; y += sp) {
      for (let x = sp / 2; x < W; x += sp) {
        const px = x + (rng() - 0.5) * sp * 0.6, py = y + (rng() - 0.5) * sp * 0.6;
        const ix = Math.round(px), iy = Math.round(py);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        if (data[(iy * W + ix) * 4 + 3] > 127) pts.push(px, py);
      }
    }
    if (pts.length / 2 >= NP) {
      // drop random extras
      const idx = Array.from({ length: pts.length / 2 }, (_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const out = new Float32Array(NP * 2);
      for (let i = 0; i < NP; i++) { out[i * 2] = pts[idx[i] * 2]; out[i * 2 + 1] = pts[idx[i] * 2 + 1]; }
      return out;
    }
    sp *= 0.97;
  }
  throw new Error('could not sample FLOW');
}

function curl(x, y, t, out) {
  const sc = 0.0017, e = 0.02;
  const nx = x * sc, ny = y * sc, nt = t * 0.45;
  const n1 = noise.noise3(nx, ny + e, nt), n2 = noise.noise3(nx, ny - e, nt);
  const n3 = noise.noise3(nx + e, ny, nt), n4 = noise.noise3(nx - e, ny, nt);
  out[0] = (n1 - n2) / (2 * e);
  out[1] = -(n3 - n4) / (2 * e);
}

function simulate(R) {
  const rng = mulberry32(12);
  HOME = new Float32Array(NP * 2);
  const vx = new Float32Array(NP), vy = new Float32Array(NP);
  const px = new Float32Array(NP), py = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    const a = rng() * TAU, r = 64 * Math.sqrt(rng());
    HOME[i * 2] = CX + Math.cos(a) * r;
    HOME[i * 2 + 1] = CY + Math.sin(a) * r;
    px[i] = HOME[i * 2]; py[i] = HOME[i * 2 + 1];
    const sp = 380 + 2600 * Math.pow(rng(), 1.7);
    vx[i] = Math.cos(a) * sp - Math.sin(a) * sp * 0.35;
    vy[i] = Math.sin(a) * sp + Math.cos(a) * sp * 0.35;
    const u = rng();
    PCOL[i] = u < 0.7 ? 0 : u < 0.88 ? 1 : 2;
    PSIZE[i] = 2.3 + 1.5 * rng();
  }
  const word = sampleWord(R);
  TGT = new Float32Array(NP * 2);
  DEPART = new Float32Array(NP);
  POS = new Float32Array(STEPS * NP * 2);
  const c2 = [0, 0];
  let assigned = false, sphereAssigned = false;

  for (let s = 0; s < STEPS; s++) {
    const t = T0 + s * DT, b = t / BEAT;
    const base = s * NP * 2;
    for (let i = 0; i < NP; i++) { POS[base + i * 2] = px[i]; POS[base + i * 2 + 1] = py[i]; }

    if (!assigned && b >= 13.2) {
      // map particles to letter targets in x order so they sweep in without crossing much
      const pi = Array.from({ length: NP }, (_, i) => i).sort((a, c) => px[a] - px[c]);
      const ti = Array.from({ length: NP }, (_, i) => i).sort((a, c) => word[a * 2] - word[c * 2]);
      for (let k = 0; k < NP; k++) { TGT[pi[k] * 2] = word[ti[k] * 2]; TGT[pi[k] * 2 + 1] = word[ti[k] * 2 + 1]; }
      assigned = true;
    }
    if (!sphereAssigned && b >= 14.9) {
      // each particle takes the sphere point that sits at the same x when the sphere is reached
      const ang = sphereAngles(T1);
      const sx = new Float32Array(NP);
      for (let k = 0; k < NP; k++) { projectPoint(k, ang.ry, ang.rx, SPHERE_R, tmp); sx[k] = tmp[0] + tmp[1] * 0.25; }
      const pi = Array.from({ length: NP }, (_, i) => i).sort((a, c) => (TGT[a * 2] + TGT[a * 2 + 1] * 0.25) - (TGT[c * 2] + TGT[c * 2 + 1] * 0.25));
      const si = Array.from({ length: NP }, (_, i) => i).sort((a, c) => sx[a] - sx[c]);
      let minX = Infinity, maxX = -Infinity;
      for (let k = 0; k < NP; k++) { minX = Math.min(minX, TGT[k * 2]); maxX = Math.max(maxX, TGT[k * 2]); }
      for (let k = 0; k < NP; k++) {
        SIGMA[pi[k]] = si[k];
        DEPART[pi[k]] = 15.0 + 0.5 * ((TGT[pi[k] * 2] - minX) / (maxX - minX)) + 0.06 * rng();
      }
      sphereAssigned = true;
    }

    const flow = smoothstep(12.05, 12.6, b) * (1 - smoothstep(13.3, 13.8, b));
    const attract = assigned ? smoothstep(13.2, 13.75, b) : 0;
    const ang = sphereAngles(t);
    const drag = Math.exp(-1.5 * DT);
    for (let i = 0; i < NP; i++) {
      let x = px[i], y = py[i], u = vx[i], v = vy[i];
      if (flow > 0) {
        curl(x, y, t, c2);
        const k = 1 - Math.exp(-4.0 * flow * DT);
        u += (c2[0] * 520 - u) * k;
        v += (c2[1] * 520 - v) * k;
      }
      u *= drag; v *= drag;
      const dx = x - CX, dy = y - CY;
      const e = (dx / 900) * (dx / 900) + (dy / 520) * (dy / 520);
      if (e > 1) { u -= dx * (e - 1) * 7 * DT; v -= dy * (e - 1) * 7 * DT; }

      let tx = null, ty = 0, w = 0;
      if (sphereAssigned && b >= DEPART[i]) {
        projectPoint(SIGMA[i], ang.ry, ang.rx, SPHERE_R, tmp);
        tx = tmp[0]; ty = tmp[1];
        w = 20 * smoothstep(DEPART[i], DEPART[i] + 0.35, b);
      } else if (attract > 0) {
        tx = TGT[i * 2]; ty = TGT[i * 2 + 1];
        w = 26 * attract;
      }
      if (tx !== null && w > 0) {
        // critically damped spring toward the target
        u += (w * w * (tx - x) - 2 * w * u) * DT;
        v += (w * w * (ty - y) - 2 * w * v) * DT;
      }
      px[i] = x + u * DT;
      py[i] = y + v * DT;
      vx[i] = u; vy[i] = v;
    }
  }
}

export default {
  id: 'particles',
  label: 'PARTICLES',
  from: 12,
  to: 16,
  hud: 'light',

  init(R) {
    simulate(R);
  },

  post(t) {
    const b = t / BEAT;
    return { bloom: 0.3, threshold: 0.66, flash: 0.22 * Math.exp(-Math.max(0, t - 12 * BEAT) * 22) * (b >= 12 ? 1 : 0) };
  },

  draw(ctx, t, R) {
    const b = t / BEAT;
    ctx.fillStyle = C.ink;
    ctx.fillRect(-300, -300, W + 600, H + 600);
    const glow = ctx.createRadialGradient(CX, CY, 0, CX, CY, 900);
    glow.addColorStop(0, 'rgba(46,60,255,0.16)');
    glow.addColorStop(1, 'rgba(46,60,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    if (t < T0) {
      // compressed core, visible through the portal before the blast
      const spin = (t - 11 * BEAT) * 2.4;
      const pulse = 1 + 0.12 * Math.sin(b * TAU * 2);
      for (let i = 0; i < NP; i++) {
        const hx = HOME[i * 2] - CX, hy = HOME[i * 2 + 1] - CY;
        const cs = Math.cos(spin), sn = Math.sin(spin);
        X[i] = CX + (hx * cs - hy * sn) * pulse;
        Y[i] = CY + (hx * sn + hy * cs) * pulse;
        S[i] = PSIZE[i] * 0.8;
        A[i] = 0.9;
      }
      drawDots(ctx, NP, X, Y, S, PCOL, A);
      return;
    }

    const f = clamp((t - T0) / DT, 0, STEPS - 1.001);
    const s0 = Math.floor(f), fr = f - s0;
    const o0 = s0 * NP * 2, o1 = (s0 + 1) * NP * 2;
    const ang = sphereAngles(t);
    const hold = smoothstep(13.7, 14.0, b) * (1 - smoothstep(14.95, 15.2, b));
    const toSphere = smoothstep(15.62, 16.0, b);
    const sweep = (b - 14.35) * 1500; // light sweep across the formed word
    for (let i = 0; i < NP; i++) {
      let x = POS[o0 + i * 2] + (POS[o1 + i * 2] - POS[o0 + i * 2]) * fr;
      let y = POS[o0 + i * 2 + 1] + (POS[o1 + i * 2 + 1] - POS[o0 + i * 2 + 1]) * fr;
      let size = PSIZE[i], a = 0.95;
      if (hold > 0) {
        // lock onto the letterforms, with a faint shimmer
        const tx = TGT[i * 2] + noise.noise3(i * 0.37, 0, t * 3) * 1.6;
        const ty = TGT[i * 2 + 1] + noise.noise3(0, i * 0.37, t * 3) * 1.6;
        x = lerp(x, tx, hold); y = lerp(y, ty, hold);
        const d = Math.abs(TGT[i * 2] - (CX - 900 + sweep));
        const lit = Math.exp(-d * d / 9000);
        size *= 1 + 0.6 * lit;
        a = 0.85 + 0.15 * lit;
      }
      if (b >= 15) {
        projectPoint(SIGMA[i], ang.ry, ang.rx, SPHERE_R, tmp);
        const depth = clamp((tmp[3] + SPHERE_R) / (2 * SPHERE_R));
        const onSphere = Math.max(smoothstep(DEPART[i] + 0.1, DEPART[i] + 0.45, b), toSphere);
        size = lerp(size, PSIZE[i] * tmp[2] * 1.1, onSphere);
        a = lerp(a, lerp(1, 0.28, depth), onSphere);
        x = lerp(x, tmp[0], toSphere);
        y = lerp(y, tmp[1], toSphere);
      }
      X[i] = x; Y[i] = y; S[i] = size; A[i] = a;
    }
    drawDots(ctx, NP, X, Y, S, PCOL, A);

    // shockwave
    const sw = prog(b, 12.0, 0.7);
    if (sw > 0 && sw < 1) {
      ctx.strokeStyle = C.paper;
      ctx.globalAlpha = Math.pow(1 - sw, 1.5) * 0.9;
      ctx.lineWidth = 14 * (1 - sw) + 1;
      ctx.beginPath();
      ctx.arc(CX, CY, 30 + 1300 * ease.outExpo(sw), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // technical caption
    const cp = prog(b, 12.3, 0.5);
    if (cp > 0) {
      const str = '9 000 PARTICLES  /  CURL-NOISE FLOW FIELD  /  SIMULATED AT 240 HZ';
      ctx.font = '500 13px "Geist Mono"';
      ctx.letterSpacing = '2px';
      ctx.fillStyle = C.paper;
      ctx.globalAlpha = 0.6;
      ctx.textAlign = 'left';
      ctx.fillText(str.slice(0, Math.floor(str.length * cp)), 56, H - 96);
      ctx.globalAlpha = 1;
    }
  },
};
