// 07 — UI + data motion. The shader shot shrinks into a tile of a bento grid; six live tiles
// re-flow into a new layout on every beat. Layout changes are superposed spring step responses,
// so interrupted motion stays physically continuous. Everything then collapses into the dot.
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, prog, smoothstep, spring, curve, bezier, hash, rrect, TAU, mixHex } from '../util.js';
import { drawText } from '../type.js';
import { liquidParams } from './s6_shader.js';

const BEAT = 0.46875;
const GX = 56, GY = 108, GW = W - 112, GH = 866, GAP = 16;
const UW = (GW - 11 * GAP) / 12, UH = (GH - 5 * GAP) / 6;
const IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LAYOUTS = [
  { A: [0, 0, 6, 4], B: [6, 0, 3, 3], C: [9, 0, 3, 3], D: [6, 3, 6, 3], E: [0, 4, 3, 2], F: [3, 4, 3, 2] },
  { B: [0, 0, 4, 4], E: [0, 4, 4, 2], A: [4, 0, 4, 3], D: [4, 3, 4, 3], C: [8, 0, 4, 4], F: [8, 4, 4, 2] },
  { C: [0, 0, 7, 4], D: [7, 0, 5, 2], E: [7, 2, 5, 2], A: [7, 4, 5, 2], B: [0, 4, 3, 2], F: [3, 4, 4, 2] },
  { F: [0, 0, 5, 4], A: [5, 0, 4, 4], D: [9, 0, 3, 3], E: [9, 3, 3, 3], B: [0, 4, 2, 2], C: [2, 4, 7, 2] },
];
const BG = { B: C.lime, C: C.ink, D: C.cobalt, E: C.coral, F: C.lilac };
const INK_LABEL = { B: true, E: true, F: true };
const LABEL = { A: 'SHADERS', B: 'SQUASH & STRETCH', C: 'DATA / LIVE SORT', D: 'GRAPH EDITOR', E: 'UI MOTION', F: 'VARIABLE TYPE' };

const unit = ([c, r, w, h]) => [GX + c * (UW + GAP), GY + r * (UH + GAP), w * UW + (w - 1) * GAP, h * UH + (h - 1) * GAP];
const FULL = [-W * 0.015, -H * 0.015, W * 1.03, H * 1.03];

function rectOf(id, i, t) {
  const b = t / BEAT;
  const L0 = unit(LAYOUTS[0][id]);
  let prev = id === 'A' ? FULL : [L0[0] + L0[2] / 2, L0[1] + L0[3] / 2, 0, 0];
  const r = prev.slice();
  for (let k = 0; k < LAYOUTS.length; k++) {
    const target = unit(LAYOUTS[k][id]);
    const start = (24 + k + (k === 0 ? 0.02 : 0.035) * i) * BEAT;
    const s = spring(t - start, k === 0 ? 2.0 : 2.5, 0.6);
    for (let j = 0; j < 4; j++) r[j] += (target[j] - prev[j]) * s;
    prev = target;
  }
  // collapse into the dot
  const c = ease.inExpo(prog(b, 27.5 + i * 0.018, 0.4));
  const dot = [W / 2 - 23, H / 2 - 23, 46, 46];
  for (let j = 0; j < 4; j++) r[j] = lerp(r[j], dot[j], c);
  const settle = id === 'A' ? clamp(spring(t - 24 * BEAT, 2.0, 0.9)) : 1;
  return { x: r[0], y: r[1], w: Math.max(0, r[2]), h: Math.max(0, r[3]), rad: lerp(28 * settle, 23, c), c };
}

function label(ctx, r, id) {
  ctx.font = '500 12px "Geist Mono"';
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.fillStyle = INK_LABEL[id] ? C.ink : C.paper;
  ctx.globalAlpha = 0.85;
  ctx.fillText(LABEL[id], r.x + 20, r.y + 30);
  ctx.textAlign = 'right';
  ctx.fillText(String(IDS.indexOf(id) + 1).padStart(2, '0'), r.x + r.w - 20, r.y + 30);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- tile contents
function tileLiquid(ctx, r, t, R) {
  const img = R.liquid.render(t, liquidParams(t));
  const s = Math.max(r.w / W, r.h / H);
  ctx.drawImage(img, r.x + (r.w - W * s) / 2, r.y + (r.h - H * s) / 2, W * s, H * s);
}

function tileBall(ctx, r, t) {
  const b = t / BEAT;
  const m = Math.min(r.w, r.h);
  const floor = r.y + r.h * 0.8;
  const br = m * 0.1;
  const tau = ((b % 1) + 1) % 1;
  const hgt = 1 - Math.pow(2 * tau - 1, 2);
  const k = Math.exp(-Math.pow(Math.min(tau, 1 - tau) / 0.07, 2));
  const cx = r.x + r.w * 0.5 + Math.sin(b * Math.PI * 0.5) * r.w * 0.22;
  const cy = floor - br - hgt * r.h * 0.4 + br * 0.4 * k;
  const stretch = 1 + 0.3 * Math.abs(2 * tau - 1) * (1 - k);
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.18 * (1 - 0.6 * hgt);
  ctx.beginPath();
  ctx.ellipse(cx, floor, br * (1.25 - 0.5 * hgt), br * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillRect(r.x + r.w * 0.1, floor, r.w * 0.8, 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale((1 + 0.4 * k) / stretch, (1 - 0.4 * k) * stretch);
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, TAU);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();
}

function chartValues(k) {
  return Array.from({ length: 8 }, (_, i) => 0.18 + 0.82 * hash(i + k * 17, 5));
}
function tileChart(ctx, r, t) {
  const n = 8;
  const val = new Array(n).fill(0), slot = [...Array(n).keys()];
  let pv = chartValues(0).map(() => 0), ps = [...Array(n).keys()];
  for (let k = 0; k < 4; k++) {
    const v = chartValues(k);
    const order = [...Array(n).keys()].sort((a, c) => v[c] - v[a]);
    const sl = new Array(n);
    order.forEach((i, rank) => (sl[i] = rank));
    const s = spring(t - (24 + k + 0.1) * BEAT, 2.6, 0.55);
    for (let i = 0; i < n; i++) {
      val[i] += (v[i] - pv[i]) * s;
      slot[i] += (sl[i] - ps[i]) * s;
    }
    pv = v;
    ps = sl;
  }
  const padX = r.w * 0.08, top = r.y + 64, bottom = r.y + r.h - 34;
  const cw = (r.w - padX * 2) / n;
  const bw = cw * 0.62;
  let maxI = 0;
  for (let i = 1; i < n; i++) if (val[i] > val[maxI]) maxI = i;
  ctx.fillStyle = C.paper;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(r.x + padX, bottom, r.w - padX * 2, 1.5);
  ctx.globalAlpha = 1;
  ctx.font = '500 12px "Geist Mono"';
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const x = r.x + padX + slot[i] * cw + (cw - bw) / 2;
    const h = Math.max(0, val[i]) * (bottom - top - 22);
    ctx.fillStyle = i === maxI ? C.coral : C.paper;
    ctx.fillRect(x, bottom - h, bw, h);
    if (bw > 18) ctx.fillText(String(Math.round(val[i] * 100)), x + bw / 2, bottom - h - 8);
  }
}

const CURVES = [[0.83, 0, 0.17, 1], [0.34, 1.56, 0.64, 1], [0.7, 0, 0.84, 0], [0.16, 1, 0.3, 1]];
function tileGraph(ctx, r, t) {
  const b = t / BEAT;
  const cp = [0, 0, 0, 0];
  let prev = CURVES[0];
  for (let j = 0; j < 4; j++) cp[j] = prev[j];
  for (let k = 1; k < 4; k++) {
    const s = spring(t - (24 + k + 0.05) * BEAT, 2.4, 0.6);
    for (let j = 0; j < 4; j++) cp[j] += (CURVES[k][j] - prev[j]) * s;
    prev = CURVES[k];
  }
  const size = Math.min(r.w * 0.6, r.h - 110);
  if (size < 20) return;
  const gx = r.x + (r.w - size) / 2 - Math.min(40, r.w * 0.06), gy = r.y + 62 + (r.h - 110 - size) / 2 + size;
  const P = (u, v) => [gx + u * size, gy - v * size];
  ctx.strokeStyle = C.paper;
  ctx.globalAlpha = 0.14;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const [ax, ay] = P(i / 4, 0), [bx, by] = P(i / 4, 1);
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    const [cx0, cy0] = P(0, i / 4), [cx1, cy1] = P(1, i / 4);
    ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  const p0 = P(0, 0), p1 = P(cp[0], cp[1]), p2 = P(cp[2], cp[3]), p3 = P(1, 1);
  ctx.strokeStyle = C.lime;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(...p0); ctx.lineTo(...p1);
  ctx.moveTo(...p3); ctx.lineTo(...p2);
  ctx.stroke();
  ctx.strokeStyle = C.paper;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(...p0);
  ctx.bezierCurveTo(...p1, ...p2, ...p3);
  ctx.stroke();
  ctx.fillStyle = C.lime;
  for (const p of [p1, p2]) { ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, TAU); ctx.fill(); }
  // a dot riding the curve in real time, and its value on the right as a preview
  const fn = bezier(...cp);
  const tau = ((b % 1) + 1) % 1;
  const v = fn(tau);
  const d = P(tau, v);
  ctx.fillStyle = C.paper;
  ctx.beginPath(); ctx.arc(d[0], d[1], 9, 0, TAU); ctx.fill();
  const px = gx + size + Math.min(70, r.w * 0.1);
  ctx.globalAlpha = 0.3;
  ctx.fillRect(px - 1, gy - size, 2, size);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.coral;
  ctx.beginPath(); ctx.arc(px, gy - v * size, 12, 0, TAU); ctx.fill();
  ctx.font = '500 12px "Geist Mono"';
  ctx.letterSpacing = '1px';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.paper;
  ctx.globalAlpha = 0.8;
  ctx.fillText(`cubic-bezier(${cp.map((x) => x.toFixed(2)).join(', ')})`, r.x + 20, r.y + r.h - 22);
  ctx.globalAlpha = 1;
}

function tileUI(ctx, r, t) {
  const b = t / BEAT;
  const m = clamp(Math.min(r.w / 380, r.h / 250), 0.2, 1.6);
  // toggle, flips on every beat
  let on = 0;
  for (let k = 0; k < 5; k++) on += (k % 2 ? -1 : 1) * spring(t - (24 + k) * BEAT, 3.2, 0.55);
  const tw = 120 * m, th = 64 * m;
  const tx = r.x + r.w * 0.5 - tw - 30 * m, ty = r.y + r.h * 0.34;
  ctx.fillStyle = mixHex(C.paper, C.ink, clamp(on));
  ctx.beginPath(); rrect(ctx, tx, ty, tw, th, th / 2); ctx.fill();
  ctx.fillStyle = mixHex(C.ink, C.paper, clamp(on));
  const kx = tx + th / 2 + on * (tw - th);
  const squish = 1 + 0.25 * Math.abs(Math.sin(Math.PI * clamp(on)));
  ctx.beginPath(); ctx.ellipse(kx, ty + th / 2, (th / 2 - 7 * m) * squish, th / 2 - 7 * m, 0, 0, TAU); ctx.fill();
  // button, pressed on the off-beats with a ripple
  const bw = 150 * m, bh = 64 * m, bx = r.x + r.w * 0.5 + 10 * m, by = ty;
  const ph = ((b - 0.5) % 1 + 1) % 1;
  const press = b > 24.4 ? Math.exp(-ph * 9) : 0;
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh / 2);
  ctx.scale(1 - 0.08 * press, 1 - 0.08 * press);
  ctx.fillStyle = C.ink;
  ctx.beginPath(); rrect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); rrect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.clip();
  if (b > 24.4) {
    ctx.fillStyle = C.paper;
    ctx.globalAlpha = 0.25 * (1 - ph);
    ctx.beginPath(); ctx.arc(bw * 0.15, 0, bw * 1.1 * ease.outCubic(ph), 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.fillStyle = C.paper;
  ctx.font = `600 ${Math.round(18 * m)}px "Geist Mono"`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'center';
  ctx.fillText('HIRE ME', 0, 6 * m);
  ctx.restore();
  // slider easing between stops
  const stops = [0.15, 0.82, 0.38, 0.95, 0.6];
  let sv = stops[0];
  for (let k = 1; k < stops.length; k++) sv += (stops[k] - stops[k - 1]) * spring(t - (23.5 + k) * BEAT, 2.2, 0.7);
  const sx = r.x + r.w * 0.16, sw = r.w * 0.68, sy = r.y + r.h * 0.72;
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(sx, sy - 3 * m, sw, 6 * m);
  ctx.globalAlpha = 1;
  ctx.fillRect(sx, sy - 3 * m, sw * sv, 6 * m);
  ctx.fillStyle = C.paper;
  ctx.beginPath(); ctx.arc(sx + sw * sv, sy, 16 * m, 0, TAU); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3 * m; ctx.stroke();
}

function tileType(ctx, r, t, R) {
  const b = t / BEAT;
  const f = R.faces.display;
  const wght = 500 + 400 * Math.sin(b * Math.PI * 0.5);
  const wdth = clamp(92 + 34 * Math.sin(b * Math.PI * 0.5 + 1.4), 62, 125);
  const size = Math.min(r.h * 0.62, r.w * 0.42);
  if (size < 8) return;
  const cap = (f.capHeight * size) / f.upm;
  drawText(ctx, f, 'Aa', { size, x: r.x + r.w / 2, y: r.y + r.h / 2 + cap / 2 + 4, align: 'center', wght, wdth, fill: C.ink });
  ctx.font = '500 12px "Geist Mono"';
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.8;
  ctx.fillText(`WGHT ${Math.round(wght)}   WDTH ${Math.round(wdth)}`, r.x + 20, r.y + r.h - 22);
  ctx.globalAlpha = 1;
}

export default {
  id: 'bento',
  label: 'UI + DATA MOTION',
  from: 24,
  to: 28,
  hud: 'dark',
  hudAt(t) {
    return t / BEAT > 27.82 ? 'light' : 'dark';
  },

  post(t) {
    return { bloom: 0.08, threshold: 0.95, vig: 0.16 };
  },

  draw(ctx, t, R) {
    const b = t / BEAT;
    ctx.fillStyle = C.paper;
    ctx.fillRect(-300, -300, W + 600, H + 600);

    // ink iris opening from the centre as the tiles are swallowed
    const iris = ease.inCubic(prog(b, 27.56, 0.44));
    if (iris > 0) {
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 40 + 1150 * iris, 0, TAU);
      ctx.fill();
    }

    // draw the big tiles first so the springing small ones pass over them
    const rects = IDS.map((id, i) => ({ id, i, r: rectOf(id, i, t) }));
    rects.sort((a, c) => c.r.w * c.r.h - a.r.w * a.r.h);
    for (const { id, r } of rects) {
      if (r.w < 1 || r.h < 1) continue;
      ctx.save();
      ctx.beginPath();
      rrect(ctx, r.x, r.y, r.w, r.h, r.rad);
      ctx.clip();
      if (id === 'A') tileLiquid(ctx, r, t, R);
      else {
        ctx.fillStyle = BG[id];
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const fade = 1 - clamp(r.c * 2.2);
      if (fade > 0) {
        ctx.globalAlpha = fade;
        if (id === 'B') tileBall(ctx, r, t);
        else if (id === 'C') tileChart(ctx, r, t);
        else if (id === 'D') tileGraph(ctx, r, t);
        else if (id === 'E') tileUI(ctx, r, t);
        else if (id === 'F') tileType(ctx, r, t, R);
        ctx.globalAlpha = fade;
        if (r.w > 160 && r.h > 90) label(ctx, r, id);
        ctx.globalAlpha = 1;
      }
      if (r.c > 0) {
        ctx.fillStyle = C.coral;
        ctx.globalAlpha = clamp(r.c * 1.6);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  },
};
