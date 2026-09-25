// 01 — Squash & stretch. A coral ball hops across "motıon" (dotless i), each letter
// flinching under the impact, and lands as the missing i-dot. Then it irises open.
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, tween, TAU, curve } from '../util.js';
import { drawText, layoutText } from '../type.js';

const WORD = 'motıon';
const SIZE = 440;
const BASE = 676;
const BALL = 25;
let G = null;

function topOf(face, gl, key, s, gx) {
  const polys = face.polylines(gl, key);
  let minY = Infinity;
  for (const p of polys) for (let i = 1; i < p.length; i += 2) minY = Math.min(minY, p[i]);
  let sx = 0, n = 0;
  for (const p of polys) for (let i = 0; i < p.length; i += 2) if (p[i + 1] < minY + 36) { sx += p[i]; n++; }
  return { x: gx + (sx / n) * s, y: BASE + minY * s };
}

function build(R) {
  const face = R.faces.serif;
  const lay = layoutText(face, WORD, { size: SIZE, x: W / 2 + 10, y: BASE, align: 'center' });
  const key = lay.run.key, s = lay.s;
  const tops = lay.glyphs.map((g) => topOf(face, g.g, key, s, g.x));

  // Where a real "i" keeps its dot: take the highest contour of the dotted glyph.
  const iRun = face.run('i');
  let dot = null;
  for (const p of face.polylines(iRun.glyphs[0], iRun.key)) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
    }
    if (!dot || y1 < dot.y1) dot = { x0, x1, y0, y1 };
  }
  const gi = lay.glyphs[3];
  const dcx = gi.x + ((dot.x0 + dot.x1) / 2) * s;
  const dcy = BASE + ((dot.y0 + dot.y1) / 2) * s;
  const dr = ((dot.x1 - dot.x0) / 2) * s;
  const gap = tops[3].y - (dcy + dr);
  const restY = tops[3].y - Math.max(gap, 16) - BALL;
  const slant = Math.tan((-(face.font.italicAngle || -12) * Math.PI) / 180);
  const rest = { x: dcx + (dcy - restY) * slant, y: restY };

  // Ball keyframes (beats): enter, hop on m / o / t, drop into the dot position.
  const K = [
    { b: 0.5, x: -80, y: 300, h: 70 },
    { b: 1.5, x: tops[0].x, y: tops[0].y - BALL, h: 160 },
    { b: 2.0, x: tops[1].x, y: tops[1].y - BALL, h: 175 },
    { b: 2.5, x: tops[2].x, y: tops[2].y - BALL, h: 150 },
    { b: 3.0, x: rest.x, y: rest.y, h: 0 },
  ];
  const maxR = Math.hypot(Math.max(rest.x, W - rest.x), Math.max(rest.y, H - rest.y)) + 80;
  G = { face, lay, key, tops, rest, K, maxR };
}

const CONTACTS = [1.5, 2.0, 2.5, 3.0];

function ballAt(b) {
  const K = G.K;
  if (b < K[0].b) return null;
  for (let i = 0; i < K.length - 1; i++) {
    const a = K[i], z = K[i + 1];
    if (b <= z.b) {
      const d = z.b - a.b;
      const u = (b - a.b) / d;
      return {
        x: lerp(a.x, z.x, u),
        y: lerp(a.y, z.y, u) - 4 * a.h * u * (1 - u),
        vx: (z.x - a.x) / d,
        vy: (z.y - a.y) / d - (4 * a.h * (1 - 2 * u)) / d,
      };
    }
  }
  return { x: G.rest.x, y: G.rest.y, vx: 0, vy: 0 };
}

function drawWord(ctx, b, t, fill) {
  const { face, lay } = G;
  drawText(ctx, face, WORD, {
    size: SIZE, x: W / 2 + 10, y: BASE, align: 'center', fill,
    each: (i) => {
      const rise = tween(b, 0.85 + i * 0.075, 0.55, curve.out);
      // flinch when the ball lands on this letter (letters 0..3 take a hit)
      let sy = 1, sx = 1;
      if (i < 4) {
        const dt = t - CONTACTS[i] * 0.46875;
        if (dt > 0) {
          const k = Math.exp(-dt * 11) * Math.cos(dt * 34) * (i === 3 ? 0.9 : 1);
          sy = 1 - 0.16 * k;
          sx = 1 + 0.07 * k;
        }
      }
      return { y: (1 - rise) * SIZE * 0.95, sx, sy };
    },
  });
}

export default {
  id: 'intro',
  label: 'SQUASH & STRETCH',
  from: 0,
  to: 4,
  hud: 'light',
  init(R) { build(R); },

  draw(ctx, t, R) {
    const b = t / 0.46875;
    ctx.fillStyle = C.ink;
    ctx.fillRect(-200, -200, W + 400, H + 400);

    // slow push-in that accelerates as the iris opens
    const { rest } = G;
    const z = 1 + 0.035 * clamp(b / 3.5) + 0.1 * tween(b, 3.5, 0.5, ease.inExpo);
    ctx.translate(rest.x, rest.y);
    ctx.scale(z, z);
    ctx.translate(-rest.x, -rest.y);

    // baseline rule the letters grow out of
    const ruleIn = tween(b, 0.45, 0.5, curve.snap);
    const ruleOut = tween(b, 1.5, 0.6, ease.inOutCubic);
    if (ruleIn > 0 && ruleOut < 1) {
      const half = (G.lay.width / 2 + 60) * ruleIn;
      ctx.fillStyle = C.paper;
      ctx.globalAlpha = 0.35 * (1 - ruleOut);
      ctx.fillRect(W / 2 + 10 - half, BASE + 2, half * 2, 2);
      ctx.globalAlpha = 1;
    }

    // the word, revealed through a mask at the baseline
    ctx.save();
    ctx.beginPath();
    ctx.rect(-400, -400, W + 800, BASE + 400 + 4);
    ctx.clip();
    drawWord(ctx, b, t, C.paper);
    ctx.restore();

    // ripples where the ball touches down
    for (let i = 0; i < 3; i++) {
      const p = (t - CONTACTS[i] * 0.46875) / 0.42;
      if (p <= 0 || p >= 1) continue;
      const k = G.tops[i];
      const rx = BALL * (1.1 + 3.6 * ease.outCubic(p));
      ctx.strokeStyle = C.coral;
      ctx.globalAlpha = Math.pow(1 - p, 2) * 0.9;
      ctx.lineWidth = 2.5 * (1 - p) + 0.6;
      ctx.beginPath();
      ctx.ellipse(k.x, k.y - 2, rx, rx * 0.24, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // spark burst when the dot clicks into place
    const sp = (t - 3.0 * 0.46875) / 0.34;
    if (sp > 0 && sp < 1) {
      ctx.strokeStyle = C.coral;
      ctx.lineCap = 'round';
      ctx.lineWidth = 5 * (1 - sp) + 1;
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        const r0 = BALL + 16 + 70 * ease.outQuart(sp);
        const r1 = BALL + 16 + 96 * ease.outExpo(sp);
        ctx.beginPath();
        ctx.moveTo(rest.x + Math.cos(a) * r0, rest.y + Math.sin(a) * r0);
        ctx.lineTo(rest.x + Math.cos(a) * r1, rest.y + Math.sin(a) * r1);
        ctx.stroke();
      }
    }

    // the ball: stretch along velocity in flight, squash on contact, settle on a spring
    const p = ballAt(b);
    if (!p) return;
    let squash = 0;
    for (const c of CONTACTS) if (b > c - 0.02) squash = Math.max(squash, Math.exp(-Math.pow((b - c) / 0.07, 2)));
    const since = t - 3.0 * 0.46875;
    if (since > 0) squash = Math.exp(-since * 15) * Math.cos(since * 42) * 0.9;
    const speed = Math.hypot(p.vx, p.vy);
    const stretch = 1 + 0.42 * clamp(speed / 1700) * (1 - Math.min(1, Math.abs(squash)));
    let r = BALL;
    // iris: anticipate, then swallow the frame
    const ant = tween(b, 3.5, 0.14, ease.inOutQuad);
    const grow = tween(b, 3.64, 0.36, ease.inExpo);
    r *= 1 - 0.22 * ant;
    r = lerp(r, G.maxR, grow);

    ctx.save();
    ctx.translate(p.x, p.y + BALL * 0.36 * Math.max(0, squash));
    ctx.scale(1 + 0.36 * squash, 1 - 0.36 * squash);
    if (grow <= 0) {
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.scale(stretch, 1 / stretch);
    }
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();

    // inside the growing circle the word flips to ink — it becomes the next scene's palette
    if (grow > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.clip();
      ctx.beginPath();
      ctx.rect(-400, -400, W + 800, BASE + 400 + 4);
      ctx.clip();
      drawWord(ctx, b, t, C.ink);
      ctx.restore();
    }
  },
};
