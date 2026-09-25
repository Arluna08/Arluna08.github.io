// Timeline + camera + finishing parameters. Scenes are plain objects:
// { id, label, from, to (in beats), hud: 'light' | 'dark', init?(reel), draw(ctx, t, reel), post?(t, base) }
import { W, H, BEAT, cut } from './config.js';
import { noise } from './util.js';
import { Hud } from './hud.js';

// Musical accents (in beats) that kick the camera and the lens.
export const HITS = [
  { b: 1.5, s: 0.12 }, { b: 2, s: 0.12 }, { b: 2.5, s: 0.12 }, { b: 3, s: 0.3 },
  { b: 4, s: 1.0 }, { b: 5, s: 0.35 }, { b: 6, s: 0.35 }, { b: 7, s: 0.3 },
  { b: 8, s: 0.55 }, { b: 9, s: 0.2 }, { b: 10, s: 0.2 }, { b: 11, s: 0.2 },
  { b: 12, s: 1.0 }, { b: 14, s: 0.6 }, { b: 15, s: 0.25 },
  { b: 16, s: 0.45 }, { b: 18, s: 0.3 },
  { b: 20, s: 0.9 }, { b: 22, s: 0.25 },
  { b: 24, s: 1.0 }, { b: 25, s: 0.35 }, { b: 26, s: 0.35 }, { b: 27, s: 0.35 },
  { b: 28, s: 1.0 }, { b: 29.5, s: 0.25 }, { b: 31, s: 0.35 },
];

export class Reel {
  constructor(env) {
    Object.assign(this, env);
    this.scenes = [];
    this.byId = {};
    this.hud = new Hud(this);
  }

  add(...scenes) {
    for (const s of scenes) {
      s.index = this.scenes.length;
      this.scenes.push(s);
      this.byId[s.id] = s;
    }
  }

  async init() {
    for (const s of this.scenes) if (s.init) await s.init(this);
  }

  sceneAt(t) {
    let cur = this.scenes[0];
    for (const s of this.scenes) if (t >= cut(s.from) - 1e-9) cur = s;
    return cur;
  }

  // Lets a scene render another one underneath a mask (used by most transitions).
  drawScene(id, ctx, t) {
    ctx.save();
    this.byId[id].draw(ctx, t, this);
    ctx.restore();
  }

  shake(t) {
    let x = 0, y = 0, r = 0, z = 1;
    for (const h of HITS) {
      const dt = t - h.b * BEAT;
      if (dt < 0 || dt > 0.9) continue;
      const e = Math.exp(-dt * 11) * h.s;
      x += noise.noise2(dt * 26, h.b * 7.13) * 18 * e;
      y += noise.noise2(h.b * 3.31 + 40, dt * 26) * 13 * e;
      r += noise.noise2(dt * 19, h.b * 1.7 + 90) * 0.007 * e;
      z += 0.022 * h.s * Math.exp(-dt * 16);
    }
    return { x, y, r, z };
  }

  drawFrame(ctx, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    const s = this.sceneAt(t);
    const sh = this.shake(t);
    ctx.save();
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y);
    ctx.rotate(sh.r);
    ctx.scale(sh.z, sh.z);
    ctx.translate(-W / 2, -H / 2);
    s.draw(ctx, t, this);
    ctx.restore();
    this.hud.draw(ctx, t, s);
  }

  postParams(t, frame) {
    let ca = 0.0005;
    for (const h of HITS) {
      const dt = t - h.b * BEAT;
      if (dt >= 0 && dt < 1) ca += 0.0065 * h.s * Math.exp(-dt * 10);
    }
    const base = { ca, bloom: 0.1, threshold: 0.95, grain: 0.034, vig: 0.26, flash: 0, fade: 1, seed: frame % 997 };
    const s = this.sceneAt(t);
    if (s.post) Object.assign(base, s.post(t, base, this));
    return base;
  }
}
