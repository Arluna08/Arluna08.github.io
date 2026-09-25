// 08 — End card. The dot that opened the reel comes back, writes the name like a pen tip,
// and lands as its full stop. Role and credits follow; the dot keeps the pulse to the end.
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, prog, smoothstep, curve, TAU } from '../util.js';
import { drawText, layoutText } from '../type.js';

const BEAT = 0.46875;
const NAME = 'Claude';
const SIZE = 340;
const BASE = 566;
const DOT = 23;
let L = null;

const SWEEP0 = 28.52, SWEEP1 = 29.12, LAND = 29.5;

function dotAt(b) {
  const { xs, xe, dotX, dotY } = L;
  const cx = W / 2, cy = H / 2;
  if (b < 28.3) return { x: cx, y: cy, vx: 0, vy: 0 };
  if (b < SWEEP0) {
    const p = curve.snap(prog(b, 28.3, SWEEP0 - 28.3));
    return { x: lerp(cx, xs, p), y: lerp(cy, BASE - 150, p) - Math.sin(Math.PI * p) * 60, vx: -1, vy: 0 };
  }
  if (b < SWEEP1) {
    const u = (b - SWEEP0) / (SWEEP1 - SWEEP0);
    const p = ease.inOutSine(u);
    return { x: lerp(xs, xe, p), y: BASE - 150 + Math.sin(u * TAU * 2.5) * 34, vx: 1, vy: 0 };
  }
  if (b < LAND) {
    const u = (b - SWEEP1) / (LAND - SWEEP1);
    const x = lerp(xe, dotX, u);
    const y = lerp(BASE - 150, dotY, u) - 4 * 120 * u * (1 - u);
    return { x, y, vx: 1, vy: 1 };
  }
  return { x: dotX, y: dotY, vx: 0, vy: 0 };
}

export default {
  id: 'end',
  label: 'AVAILABLE FOR WORK',
  from: 28,
  to: 32,
  hud: 'light',

  init(R) {
    const f = R.faces.serif;
    const probe = layoutText(f, NAME, { size: SIZE, x: 0, y: BASE });
    const gap = 8;
    const total = probe.width + gap + DOT * 2;
    const x0 = (W - total) / 2 - 6;
    const lay = layoutText(f, NAME, { size: SIZE, x: x0, y: BASE });
    L = {
      f, x0, lay,
      dotX: x0 + lay.width + gap + DOT, dotY: BASE - DOT,
      xs: x0 - 40, xe: x0 + lay.width + 30,
    };
  },

  post() {
    return { bloom: 0.12, threshold: 0.9, vig: 0.3 };
  },

  draw(ctx, t, R) {
    const b = t / BEAT;
    ctx.fillStyle = C.ink;
    ctx.fillRect(-300, -300, W + 600, H + 600);
    const z = 1 + 0.03 * ease.outCubic(prog(b, 28, 4));
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);

    const d = dotAt(b);
    const { f, x0, lay } = L;

    // name, revealed behind the travelling dot
    const reveal = b >= SWEEP1 ? W : d.x + 6;
    if (b >= SWEEP0 - 0.05) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-300, -300, reveal + 300, H + 600);
      ctx.clip();
      drawText(ctx, f, NAME, {
        size: SIZE, x: x0, y: BASE, fill: C.paper,
        each: (i, info) => {
          const u = clamp((info.cx - L.xs) / (L.xe - L.xs));
          const pass = SWEEP0 + (Math.acos(1 - 2 * u) / Math.PI) * (SWEEP1 - SWEEP0);
          const p = ease.outExpo(prog(b, pass - 0.04, 0.4));
          return { y: (1 - p) * 60, rot: (1 - p) * 0.12 };
        },
      });
      ctx.restore();
    }

    // role + rule + credits
    const ruleP = curve.snap(prog(b, 29.55, 0.45));
    if (ruleP > 0) {
      ctx.fillStyle = C.paper;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(W / 2 - 290 * ruleP, 622, 580 * ruleP, 1.5);
      ctx.globalAlpha = 1;
    }
    if (b >= 29.55) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, 700);
      ctx.clip();
      drawText(ctx, R.faces.display, 'MOTION DESIGNER', {
        size: 40, x: W / 2, y: 690, align: 'center', wght: 700, wdth: 125, tracking: 0.32, fill: C.paper,
        each: (i) => ({ y: (1 - ease.outExpo(prog(b, 29.6 + i * 0.025, 0.5))) * 50 }),
      });
      ctx.restore();
    }
    const cp = prog(b, 29.95, 0.9);
    if (cp > 0) {
      const str = 'SHOWREEL 2026  ·  900 FRAMES  ·  60 FPS  ·  MADE ENTIRELY IN CODE';
      ctx.font = '500 15px "Geist Mono"';
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'left';
      const full = ctx.measureText(str).width;
      const shown = str.slice(0, Math.floor(str.length * cp));
      const x = W / 2 - full / 2;
      ctx.fillStyle = C.paper;
      ctx.globalAlpha = 0.58;
      ctx.fillText(shown, x, 752);
      if (b % 0.5 < 0.3) {
        const cw = ctx.measureText(shown).width;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = C.coral;
        ctx.fillRect(x + cw + 4, 738, 9, 17);
      }
      ctx.globalAlpha = 1;
    }

    // the dot: pop on arrival, stretch while travelling, squash on landing, then keep the pulse
    let sx = 1, sy = 1, r = DOT;
    const pop = prog(b, 28.0, 0.35);
    if (b < 28.35) r *= 1 + 0.9 * Math.sin(Math.PI * pop) * Math.exp(-pop * 2);
    if (b >= SWEEP0 && b < LAND) { sx = 1.25; sy = 0.82; }
    const since = (b - LAND) * BEAT;
    if (since > 0) {
      const k = Math.exp(-since * 13) * Math.cos(since * 40);
      sx = 1 + 0.4 * k;
      sy = 1 - 0.4 * k;
    }
    for (const k of [30, 31]) if (b >= k) r *= 1 + 0.16 * Math.exp(-(b - k) * 9);
    // ripple on landing and on the final hit
    for (const k of [LAND, 31]) {
      const p = (b - k) / 0.9;
      if (p > 0 && p < 1) {
        ctx.strokeStyle = C.coral;
        ctx.globalAlpha = Math.pow(1 - p, 2) * 0.8;
        ctx.lineWidth = 2.5 * (1 - p) + 0.5;
        ctx.beginPath();
        ctx.arc(L.dotX, L.dotY, DOT + 90 * ease.outExpo(p), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.save();
    ctx.translate(d.x, d.y + (since > 0 ? DOT * (1 - sy) : 0));
    ctx.scale(sx, sy);
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
};
