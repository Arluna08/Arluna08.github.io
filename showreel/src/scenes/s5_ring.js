// 05 — 3D type. The particle sphere keeps spinning while two rings of type orbit it like a
// gyroscope. Every glyph is a real outline placed with a per-glyph affine derived from a
// hand-rolled perspective projection (no 3D engine). Ends with a dolly straight through it.
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, prog, smoothstep, curve, TAU, noise } from '../util.js';
import { NP, PCOL, PSIZE, SIGMA, FIB, SPHERE_R, CAM, sphereAngles, drawDots } from '../sphere.js';

const BEAT = 0.46875;
const X = new Float32Array(NP), Y = new Float32Array(NP), S = new Float32Array(NP), A = new Float32Array(NP);

const RINGS = [
  { text: 'MOTION DESIGN • ', face: 'display', size: 92, wght: 820, wdth: 112, R: 540, tiltX: -0.32, tiltZ: -0.16, col: C.paper, start: 16.0, spin: -0.55 },
  { text: 'made entirely in code — ', face: 'serif', size: 104, R: 455, tiltX: 0.22, tiltZ: 1.02, col: C.coral, start: 16.9, spin: 0.7 },
];

function rotX(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rotZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

function layoutRing(R, ring) {
  const face = R.faces[ring.face];
  const circ = TAU * ring.R;
  let text = ring.text;
  const unit = face.width(text, { wght: ring.wght, wdth: ring.wdth }) * (ring.size / face.upm);
  const reps = Math.max(1, Math.round(circ / unit));
  text = ring.text.repeat(reps);
  const run = face.run(text, ring.wght ?? 400, ring.wdth ?? 100);
  const sc = ring.size / face.upm;
  const extra = (circ - run.width * sc) / run.glyphs.length;
  let x = 0;
  const glyphs = run.glyphs.map((g) => {
    const adv = g.adv * sc + extra;
    const o = { g, mid: x + adv / 2, adv: g.adv * sc, path: face.path(g, run.key) };
    x += adv;
    return o;
  });
  ring.glyphs = glyphs;
  ring.sc = sc;
  ring.cap = ((face.capHeight || face.xHeight) * ring.size) / face.upm;
  if (ring.face === 'serif') ring.cap = (face.xHeight * ring.size) / face.upm;
}

function project(x, y, z, D, out) {
  const s = D / (D + z);
  out.x = CAM.cx + x * s;
  out.y = CAM.cy + y * s;
  out.s = s;
  out.z = z;
  return out;
}

function ringSpin(ring, b) {
  let a = ring.spin * (b - 16);
  for (const k of [17, 18, 19]) a += Math.sign(ring.spin) * 0.42 * ease.outExpo(prog(b, k, 0.55));
  return a;
}

function camD(b) {
  return lerp(CAM.D, 40, ease.inCubic(prog(b, 19.0, 0.9)));
}

const p0 = {}, pT = {}, pU = {};
function drawRing(ctx, ring, b, D, front, base) {
  const spin = ringSpin(ring, b);
  const appear = (k, n) => ease.outBack(prog(b, ring.start + (k / n) * 0.5, 0.35), 1.8);
  const n = ring.glyphs.length;
  for (let k = 0; k < n; k++) {
    const gl = ring.glyphs[k];
    const sa = appear(k, n);
    if (sa <= 0.001) continue;
    const th = spin + gl.mid / ring.R;
    // local frame on the ring: centre, tangent (reading direction), up
    let Cp = [ring.R * Math.cos(th), 0, ring.R * Math.sin(th)];
    let T = [-Math.sin(th), 0, Math.cos(th)];
    let U = [0, -1, 0];
    Cp = rotZ(rotX(Cp, ring.tiltX), ring.tiltZ);
    T = rotZ(rotX(T, ring.tiltX), ring.tiltZ);
    U = rotZ(rotX(U, ring.tiltX), ring.tiltZ);
    const half = ring.cap / 2;
    const B = [Cp[0] - U[0] * half, Cp[1] - U[1] * half, Cp[2] - U[2] * half];
    if (D + B[2] < 60) continue;
    project(B[0], B[1], B[2], D, p0);
    project(B[0] + T[0], B[1] + T[1], B[2] + T[2], D, pT);
    project(B[0] + U[0], B[1] + U[1], B[2] + U[2], D, pU);
    const ex = pT.x - p0.x, ey = pT.y - p0.y, ux = pU.x - p0.x, uy = pU.y - p0.y;
    const det = ex * -uy - ey * -ux;
    const isFront = det > 0;
    if (isFront !== front) continue;
    const sc = ring.sc * sa;
    const depth = clamp((B[2] + ring.R) / (2 * ring.R));
    ctx.globalAlpha = (front ? lerp(1, 0.75, depth) : lerp(0.34, 0.14, depth)) * clamp(sa);
    ctx.fillStyle = ring.col;
    ctx.setTransform(base);
    ctx.transform(ex * sc, ey * sc, -ux * sc, -uy * sc, p0.x - ex * gl.adv * sa / 2, p0.y - ey * gl.adv * sa / 2);
    ctx.fill(gl.path);
  }
  ctx.globalAlpha = 1;
}

function guide(ctx, ring, b, D) {
  const a = smoothstep(ring.start - 0.1, ring.start + 0.4, b) * (1 - smoothstep(19.3, 19.7, b));
  if (a <= 0) return;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const th = (i / 120) * TAU;
    let P = [ring.R * 1.12 * Math.cos(th), 0, ring.R * 1.12 * Math.sin(th)];
    P = rotZ(rotX(P, ring.tiltX), ring.tiltZ);
    project(P[0], P[1], P[2], D, p0);
    if (i === 0) ctx.moveTo(p0.x, p0.y); else ctx.lineTo(p0.x, p0.y);
  }
  ctx.strokeStyle = ring.col;
  ctx.globalAlpha = 0.18 * a;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export default {
  id: 'ring',
  label: '3D TYPE',
  from: 16,
  to: 20,
  hud: 'light',

  init(R) {
    for (const r of RINGS) layoutRing(R, r);
  },

  post(t) {
    const b = t / BEAT;
    return { bloom: 0.2, threshold: 0.82, flash: Math.pow(smoothstep(19.84, 20.0, b), 2) };
  },

  draw(ctx, t, R) {
    const b = t / BEAT;
    ctx.fillStyle = C.ink;
    ctx.fillRect(-300, -300, W + 600, H + 600);
    const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 900);
    glow.addColorStop(0, 'rgba(46,60,255,0.16)');
    glow.addColorStop(1, 'rgba(46,60,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const D = camD(b);
    const base = ctx.getTransform();

    // back halves of the rings
    for (const r of RINGS) guide(ctx, r, b, D);
    for (const r of RINGS) drawRing(ctx, r, b, D, false, base);
    ctx.setTransform(base);

    // sphere: same projection as the particle scene, plus beat-driven displacement
    const ang = sphereAngles(t);
    let pulse = 0;
    for (const k of [18, 18.5, 19]) if (b >= k) pulse += Math.exp(-(b - k) * 7);
    const cyr = Math.cos(ang.ry), syr = Math.sin(ang.ry), cxr = Math.cos(ang.rx), sxr = Math.sin(ang.rx);
    const body = smoothstep(16.0, 16.3, b) * (1 - smoothstep(19.35, 19.6, b));
    if (body > 0) {
      const rr = SPHERE_R * (D / Math.sqrt(D * D - SPHERE_R * SPHERE_R));
      ctx.fillStyle = 'rgba(12,12,22,0.86)';
      ctx.globalAlpha = body;
      ctx.beginPath();
      ctx.arc(CAM.cx, CAM.cy, rr * 0.985, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < NP; i++) {
      const k = SIGMA[i];
      const fx = FIB[k * 3], fy = FIB[k * 3 + 1], fz = FIB[k * 3 + 2];
      let rad = SPHERE_R;
      if (pulse > 0) rad *= 1 + 0.2 * pulse * noise.noise3(fx * 1.7, fy * 1.7, fz * 1.7 + b * 0.8);
      const x1 = fx * cyr + fz * syr, z1 = -fx * syr + fz * cyr;
      const y2 = fy * cxr - z1 * sxr, z2 = fy * sxr + z1 * cxr;
      const Xw = x1 * rad, Yw = y2 * rad, Zw = z2 * rad;
      if (D + Zw < 8) { A[i] = 0; continue; }
      const s = D / (D + Zw);
      const depth = clamp((Zw + SPHERE_R) / (2 * SPHERE_R));
      X[i] = CAM.cx + Xw * s;
      Y[i] = CAM.cy + Yw * s;
      S[i] = Math.min(46, PSIZE[i] * s * 1.1);
      A[i] = lerp(1, 0.28, depth) * (s > 4 ? clamp(1.6 - s / 12) : 1);
    }
    drawDots(ctx, NP, X, Y, S, PCOL, A);

    // front halves
    for (const r of RINGS) drawRing(ctx, r, b, D, true, base);
    ctx.setTransform(base);

    const cp = prog(b, 16.3, 0.5) * (1 - smoothstep(19.3, 19.5, b));
    if (cp > 0) {
      const str = 'REAL-TIME 3D  /  PERSPECTIVE MATH BY HAND  /  NO 3D ENGINE';
      ctx.font = '500 13px "Geist Mono"';
      ctx.letterSpacing = '2px';
      ctx.fillStyle = C.paper;
      ctx.globalAlpha = 0.6;
      ctx.textAlign = 'left';
      ctx.fillText(str.slice(0, Math.floor(str.length * clamp(cp * 1.5))), 56, H - 96);
      ctx.globalAlpha = 1;
    }
  },
};
