// Broadcast-style overlay: name, section label with a decode effect, beat lights,
// progress rail and a running SMPTE timecode. Drawn on top of every scene, never shaken.
import { W, H, FPS, BEAT, cut, C } from './config.js';
import { clamp, ease, hash, tween } from './util.js';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/+*<>_';
const M = 56; // outer margin

function typeOn(str, p) {
  const n = Math.floor(str.length * clamp(p));
  return str.slice(0, n);
}

function decode(str, t, t0, seed) {
  const age = t - t0;
  let s = '';
  const frame = Math.floor(t * 30);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ' || age > 0.05 + i * 0.018) s += ch;
    else if (age < i * 0.006) s += '';
    else s += GLYPHS[Math.floor(hash(frame * 131 + i, seed) * GLYPHS.length)];
  }
  return s;
}

export class Hud {
  constructor(reel) {
    this.reel = reel;
  }

  draw(ctx, t, scene) {
    const R = this.reel;
    const hud = scene.hudAt ? scene.hudAt(t) : scene.hud;
    if (hud === 'none') return;
    const col = hud === 'dark' ? C.ink : C.paper;
    const b = t / BEAT;
    const intro = tween(t, 0.05, 0.55, ease.outCubic);
    const alpha = scene.hudAlpha ? scene.hudAlpha(t) : 1;
    if (alpha <= 0) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '2px';

    // ---- top left: name
    ctx.font = '600 17px "Geist Mono"';
    ctx.textAlign = 'left';
    const name = typeOn('CLAUDE', intro * 2);
    ctx.fillText(name, M, 66);
    const nw = ctx.measureText('CLAUDE').width;
    ctx.font = '400 17px "Geist Mono"';
    ctx.globalAlpha = alpha * 0.62;
    ctx.fillText(typeOn('/ MOTION DESIGNER', intro * 1.4 - 0.2), M + nw + 14, 66);

    // ---- top right: reel + beat lights
    ctx.globalAlpha = alpha * 0.62;
    ctx.textAlign = 'right';
    ctx.fillText(typeOn('SHOWREEL 2026', intro * 1.6 - 0.3), W - M, 66);
    ctx.globalAlpha = alpha;
    const bx = W - M - ctx.measureText('SHOWREEL 2026').width - 36;
    const beatInBar = Math.floor(b) % 4;
    for (let i = 0; i < 4; i++) {
      const x = bx - (3 - i) * 16;
      const on = i === beatInBar && t > 0.2;
      const pulse = on ? 1 - clamp((b - Math.floor(b)) * 1.6) : 0;
      ctx.globalAlpha = alpha * (on ? 0.55 + 0.45 * pulse : 0.28) * clamp(intro * 3 - i * 0.3);
      ctx.fillRect(x - 5, 56, 10, 10);
    }

    // ---- bottom left: section index + decoded label
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'left';
    const idx = String(scene.index + 1).padStart(2, '0') + ' / 08';
    const t0 = cut(scene.from);
    ctx.font = '600 17px "Geist Mono"';
    ctx.fillText(decode(idx, t, Math.max(t0, 0.1), 7), M, H - 50);
    ctx.font = '400 17px "Geist Mono"';
    ctx.globalAlpha = alpha * 0.62;
    ctx.fillText(decode(scene.label, t, Math.max(t0, 0.2) + 0.04, 11), M + 118, H - 50);

    // ---- bottom right: timecode with a blinking record dot
    const f = Math.floor(t * FPS + 1e-6);
    const ss = Math.floor(f / FPS), ff = f % FPS;
    const tc = `00:00:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
    ctx.globalAlpha = alpha * clamp(intro * 2 - 0.4);
    ctx.font = '500 17px "Geist Mono"';
    ctx.textAlign = 'right';
    ctx.fillText(tc, W - M, H - 50);
    const tw = ctx.measureText(tc).width;
    const blink = (b % 1) < 0.5 ? 1 : 0.25;
    ctx.fillStyle = C.coral;
    ctx.globalAlpha = alpha * blink * clamp(intro * 2 - 0.4);
    ctx.beginPath();
    ctx.arc(W - M - tw - 18, H - 56, 5, 0, Math.PI * 2);
    ctx.fill();

    // ---- bottom centre: progress rail, one segment per section
    const railW = 520, rx = (W - railW) / 2, ry = H - 57, gap = 6;
    const segW = (railW - gap * 7) / 8;
    const railIn = tween(t, 0.15, 0.6, ease.outExpo);
    for (let i = 0; i < 8; i++) {
      const sx = rx + i * (segW + gap);
      const s = R.scenes[i];
      const a = cut(s.from), z = cut(s.to);
      const fill = clamp((t - a) / (z - a));
      ctx.fillStyle = col;
      ctx.globalAlpha = alpha * 0.22 * railIn;
      ctx.fillRect(sx, ry, segW * railIn, 3);
      if (fill > 0) {
        ctx.globalAlpha = alpha * 0.95;
        ctx.fillRect(sx, ry, segW * fill, 3);
      }
    }
    ctx.restore();
  }
}
