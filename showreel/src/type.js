// Glyph-level typography on top of fontkit. Text is drawn from real outlines so variable
// axes (wght / wdth) can be animated continuously, per glyph, at any size.
import { create } from '../vendor/fontkit.mjs';
import { clamp } from './util.js';

const NO_LIGA = { liga: false, clig: false, calt: false };

function toPath2D(commands) {
  const p = new Path2D();
  for (const c of commands) {
    const a = c.args;
    switch (c.command) {
      case 'moveTo': p.moveTo(a[0], -a[1]); break;
      case 'lineTo': p.lineTo(a[0], -a[1]); break;
      case 'quadraticCurveTo': p.quadraticCurveTo(a[0], -a[1], a[2], -a[3]); break;
      case 'bezierCurveTo': p.bezierCurveTo(a[0], -a[1], a[2], -a[3], a[4], -a[5]); break;
      case 'closePath': p.closePath(); break;
    }
  }
  return p;
}

// Flatten an outline into polylines (font units, y down) for sampling and draw-on effects.
function toPolylines(commands, step = 12) {
  const out = [];
  let cur = null, px = 0, py = 0, sx = 0, sy = 0;
  const push = (x, y) => cur.push(x, -y);
  for (const c of commands) {
    const a = c.args;
    if (c.command === 'moveTo') {
      if (cur && cur.length > 2) out.push(cur);
      cur = []; px = sx = a[0]; py = sy = a[1]; push(px, py);
    } else if (c.command === 'lineTo') {
      const n = Math.max(1, Math.ceil(Math.hypot(a[0] - px, a[1] - py) / step));
      for (let i = 1; i <= n; i++) push(px + ((a[0] - px) * i) / n, py + ((a[1] - py) * i) / n);
      px = a[0]; py = a[1];
    } else if (c.command === 'quadraticCurveTo') {
      const n = Math.max(2, Math.ceil((Math.hypot(a[0] - px, a[1] - py) + Math.hypot(a[2] - a[0], a[3] - a[1])) / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(u * u * px + 2 * u * t * a[0] + t * t * a[2], u * u * py + 2 * u * t * a[1] + t * t * a[3]);
      }
      px = a[2]; py = a[3];
    } else if (c.command === 'bezierCurveTo') {
      const n = Math.max(3, Math.ceil((Math.hypot(a[0] - px, a[1] - py) + Math.hypot(a[2] - a[0], a[3] - a[1]) + Math.hypot(a[4] - a[2], a[5] - a[3])) / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(
          u * u * u * px + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t * t * t * a[4],
          u * u * u * py + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t * t * t * a[5],
        );
      }
      px = a[4]; py = a[5];
    } else if (c.command === 'closePath') {
      if (cur) { push(sx, sy); out.push(cur); cur = null; }
    }
  }
  if (cur && cur.length > 2) out.push(cur);
  return out;
}

export class Face {
  constructor(font) {
    this.font = font;
    this.upm = font.unitsPerEm;
    this.axes = font.variationAxes || {};
    this.hasAxes = Object.keys(this.axes).length > 0;
    this.capHeight = font.capHeight;
    this.xHeight = font.xHeight;
    this.ascent = font.ascent;
    this.descent = font.descent;
    this.instances = new Map();
    this.runs = new Map();
    this.paths = new Map();
    this.polys = new Map();
  }

  static async load(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    return new Face(create(new Uint8Array(buf)));
  }

  key(wght = 400, wdth = 100) {
    if (!this.hasAxes) return '-';
    return `${Math.round(wght * 2) / 2}|${Math.round(wdth * 4) / 4}`;
  }

  instance(wght = 400, wdth = 100) {
    if (!this.hasAxes) return this.font;
    const k = this.key(wght, wdth);
    let f = this.instances.get(k);
    if (!f) {
      const s = {};
      if (this.axes.wght) s.wght = clamp(Math.round(wght * 2) / 2, this.axes.wght.min, this.axes.wght.max);
      if (this.axes.wdth) s.wdth = clamp(Math.round(wdth * 4) / 4, this.axes.wdth.min, this.axes.wdth.max);
      f = this.font.getVariation(s);
      this.instances.set(k, f);
    }
    return f;
  }

  // Shaped run (kerning on, ligatures off so glyph i always maps to character i).
  run(text, wght = 400, wdth = 100) {
    const key = this.key(wght, wdth);
    const rk = text + '\u0000' + key;
    let r = this.runs.get(rk);
    if (r) return r;
    const lay = this.instance(wght, wdth).layout(text, NO_LIGA);
    let x = 0;
    const glyphs = lay.glyphs.map((g, i) => {
      const p = lay.positions[i];
      const o = { g, id: g.id, x: x + p.xOffset, y: p.yOffset, adv: p.xAdvance };
      x += p.xAdvance;
      return o;
    });
    r = { glyphs, width: x, key };
    this.runs.set(rk, r);
    return r;
  }

  path(gl, key) {
    const k = gl.id + '\u0000' + key;
    let p = this.paths.get(k);
    if (!p) {
      p = toPath2D(gl.g.path.commands);
      this.paths.set(k, p);
    }
    return p;
  }

  polylines(gl, key) {
    const k = gl.id + '\u0000' + key;
    let p = this.polys.get(k);
    if (!p) {
      p = toPolylines(gl.g.path.commands);
      this.polys.set(k, p);
    }
    return p;
  }

  bbox(gl) {
    return gl.g.path.bbox; // font units, y up
  }

  width(text, { wght = 400, wdth = 100, tracking = 0 } = {}) {
    const r = this.run(text, wght, wdth);
    return r.width + tracking * this.upm * (r.glyphs.length - 1);
  }

  // Find the wdth value that makes `text` exactly `target` font units wide (clamped to axis range).
  fitWidth(text, target, { wght = 400, tracking = 0 } = {}) {
    const ax = this.axes.wdth;
    if (!ax) return 100;
    let lo = ax.min, hi = ax.max;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (this.width(text, { wght, wdth: mid, tracking }) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
}

// Draw a string glyph by glyph. Positions are in px, y is the baseline.
// o.each(i, info) may return per-glyph { x, y, sx, sy, rot, alpha, fill, skip } (pivot: glyph baseline centre).
export function drawText(ctx, face, text, o) {
  const s = o.size / face.upm;
  const run = face.run(text, o.wght ?? 400, o.wdth ?? 100);
  const n = run.glyphs.length;
  const track = (o.tracking || 0) * face.upm;
  const width = (run.width + track * (n - 1)) * s;
  let x0 = o.x;
  if (o.align === 'center') x0 -= width / 2;
  else if (o.align === 'right') x0 -= width;
  const baseAlpha = o.alpha ?? 1;
  for (let i = 0; i < n; i++) {
    const g = run.glyphs[i];
    const gx = x0 + (g.x + track * i) * s;
    const adv = g.adv * s;
    const tr = o.each ? o.each(i, { x: gx, cx: gx + adv / 2, adv, n, g, s }) : null;
    if (tr && tr.skip) continue;
    const a = baseAlpha * (tr && tr.alpha != null ? tr.alpha : 1);
    if (a <= 0.001) continue;
    ctx.save();
    ctx.translate(gx + adv / 2 + (tr?.x || 0), o.y + (tr?.y || 0) - g.y * s);
    if (tr?.rot) ctx.rotate(tr.rot);
    ctx.scale(s * (tr?.sx ?? 1), s * (tr?.sy ?? 1));
    ctx.translate(-g.adv / 2, 0);
    ctx.globalAlpha = a;
    ctx.fillStyle = tr?.fill || o.fill || '#fff';
    ctx.fill(face.path(g, run.key));
    if (o.stroke) {
      ctx.lineWidth = o.stroke.width / s;
      ctx.strokeStyle = o.stroke.color;
      ctx.stroke(face.path(g, run.key));
    }
    ctx.restore();
  }
  return { width, x0, run, s };
}

// Layout info without drawing: glyph boxes in px for a given placement.
export function layoutText(face, text, o) {
  const s = o.size / face.upm;
  const run = face.run(text, o.wght ?? 400, o.wdth ?? 100);
  const n = run.glyphs.length;
  const track = (o.tracking || 0) * face.upm;
  const width = (run.width + track * (n - 1)) * s;
  let x0 = o.x;
  if (o.align === 'center') x0 -= width / 2;
  else if (o.align === 'right') x0 -= width;
  const glyphs = run.glyphs.map((g, i) => {
    const gx = x0 + (g.x + track * i) * s;
    const bb = face.bbox(g);
    return {
      g, i, x: gx, adv: g.adv * s, cx: gx + (g.adv * s) / 2,
      left: gx + bb.minX * s, right: gx + bb.maxX * s,
      top: o.y - bb.maxY * s, bottom: o.y - bb.minY * s,
    };
  });
  return { width, x0, s, run, glyphs };
}
