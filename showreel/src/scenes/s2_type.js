// 02 — Kinetic type. Three words, each animated the way it is defined:
// TIMING drops letter by letter on 32nd notes, SPACING collapses from wide tracking,
// EASING springs open on the variable-width axis. The block is justified by the wdth axis.
// "feeling" arrives last, soft and hand-set, with no formula.
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, prog, curve } from '../util.js';
import { drawText } from '../type.js';

const BEAT = 0.46875;
const WORDS = ['TIMING', 'SPACING', 'EASING'];
const WGHT = 860;
const X0 = 132, X1 = 1788;
const RATIO = 4450; // measure expressed in font units -> sets the size
const NOTES = ['STAGGER / 58 MS', 'TRACKING / 420 -> 0', 'WDTH 62 -> 106 / ELASTIC'];
let L = null;

function typeOn(str, p) {
  return str.slice(0, Math.floor(str.length * clamp(p)));
}

function drawBlock(ctx, t, R) {
  const b = t / BEAT;
  const { f, size, cap, lines } = L;
  ctx.fillStyle = C.coral;
  ctx.fillRect(-300, -300, W + 600, H + 600);

  // TIMING — letters fall (stretching as they accelerate) and squash on landing
  const l0 = lines[0];
  drawText(ctx, f, l0.w, {
    size, x: X0, y: l0.base, wght: WGHT, wdth: l0.wdth, fill: C.ink,
    each: (i) => {
      const land = 4.0 + i * 0.125, fall = 0.3;
      const p = clamp((b - (land - fall)) / fall);
      if (p <= 0) return { skip: true };
      const dt = (b - land) * BEAT;
      let sx = 1 - 0.07 * p * (p < 1 ? 1 : 0), sy = 1 + 0.2 * p * (p < 1 ? 1 : 0);
      if (dt > 0) {
        const k = Math.exp(-dt * 13) * Math.cos(dt * 38);
        sy = 1 - 0.2 * k;
        sx = 1 + 0.08 * k;
      }
      return { y: -(1 - ease.inQuad(p)) * (l0.base + 80), sx, sy };
    },
  });

  // SPACING — tracking collapses from very wide to the justified setting
  const l1 = lines[1];
  if (b >= 5.0) {
    const e = curve.out(prog(b, 5.0, 0.62));
    drawText(ctx, f, l1.w, {
      size, x: X0, y: l1.base, wght: WGHT, wdth: l1.wdth, fill: C.ink,
      each: (i) => ({ x: (i - 3) * 420 * (1 - e), alpha: clamp((b - 5.0) / 0.05) }),
    });
  }

  // EASING — width axis springs open with an elastic overshoot while the weight snaps in
  const l2 = lines[2];
  if (b >= 6.0) {
    const wdth = lerp(62, l2.wdth, ease.outElastic(prog(b, 6.0, 1.05), 0.36));
    const wght = lerp(140, WGHT, ease.outExpo(prog(b, 6.0, 0.45)));
    drawText(ctx, f, l2.w, { size, x: X0, y: l2.base, wght, wdth, fill: C.ink });
  }

  // spec notes, set vertically in the left margin like callouts on a drawing
  ctx.save();
  ctx.font = '500 13px "Geist Mono"';
  ctx.letterSpacing = '2px';
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  lines.forEach((ln, i) => {
    const p = prog(b, 4.15 + i, 0.4);
    if (p <= 0) return;
    ctx.save();
    ctx.translate(X0 - 44, ln.base - cap / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.globalAlpha = 0.8;
    ctx.fillText(typeOn(NOTES[i], p), 0, 4);
    ctx.fillRect(-cap / 2, 14, cap * curve.snap(p), 1.5);
    ctx.restore();
  });
  ctx.restore();

  // "feeling" — the one line with no formula
  if (b >= 7.0) {
    const s = R.faces.serif;
    const fx = 1320, fy = 842, fsz = 330;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(-0.1);
    const each = (i) => {
      const p = ease.outCubic(prog(b, 7.0 + i * 0.05, 0.5));
      return { y: (1 - p) * 70, rot: (1 - p) * 0.35, alpha: clamp(p * 1.6), sx: lerp(0.8, 1, p), sy: lerp(0.8, 1, p) };
    };
    drawText(ctx, s, 'feeling', { size: fsz, x: 0, y: 0, align: 'center', fill: C.coral, stroke: { width: 26, color: C.coral }, each });
    drawText(ctx, s, 'feeling', { size: fsz, x: 0, y: 0, align: 'center', fill: C.paper, each });
    const np = prog(b, 7.35, 0.35);
    if (np > 0) {
      ctx.font = '500 13px "Geist Mono"';
      ctx.letterSpacing = '2px';
      ctx.fillStyle = C.paper;
      ctx.textAlign = 'left';
      ctx.fillText(typeOn('04 / NO FORMULA', np), -372, 86);
    }
    ctx.restore();
  }
}

export default {
  id: 'type',
  label: 'KINETIC TYPE',
  from: 4,
  to: 8,
  hud: 'dark',

  init(R) {
    const f = R.faces.display;
    const size = ((X1 - X0) / RATIO) * f.upm;
    const cap = (f.capHeight * size) / f.upm;
    const gap = 42;
    const top = (H - (cap * 3 + gap * 2)) / 2 + 6;
    const lines = WORDS.map((w, i) => ({
      w,
      base: top + cap * (i + 1) + gap * i,
      wdth: f.fitWidth(w, RATIO, { wght: WGHT }),
    }));
    L = { f, size, cap, gap, lines };
  },

  draw(ctx, t, R) {
    const b = t / BEAT;
    // exit: the frame is sliced into bands that whip off in alternating directions,
    // revealing the next scene already waiting underneath
    if (b >= 7.5) R.drawScene('shapes', ctx, t);
    // gentle push-in for life
    const z = 1 + 0.02 * clamp((b - 4) / 4);
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);

    if (b < 7.5) {
      drawBlock(ctx, t, R);
      return;
    }
    const { lines, cap, gap } = L;
    const cuts = [-400, lines[0].base + gap / 2, lines[1].base + gap / 2, H + 400];
    for (let i = 0; i < 3; i++) {
      const p = curve.whip(prog(b, 7.5 + i * 0.07, 0.4));
      if (p >= 1) continue;
      const dx = (i % 2 ? 1 : -1) * p * 2400;
      ctx.save();
      ctx.translate(dx, 0);
      ctx.beginPath();
      ctx.rect(-400, cuts[i] - 2, W + 800, cuts[i + 1] - cuts[i] + 4);
      ctx.clip();
      drawBlock(ctx, t, R);
      ctx.restore();
    }
  },
};
