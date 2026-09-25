// 06 — Shaders. A domain-warped fBm liquid in the reel's palette, a wall of the shader's own
// source code, and glass lenses that refract both (magnification, dispersion, specular).
import { W, H, C } from '../config.js';
import { clamp, ease, lerp, prog, smoothstep, curve } from '../util.js';

const BEAT = 0.46875;
const T20 = 20 * BEAT;

export function liquidParams(t) {
  const b = t / BEAT;
  const lt = Math.max(0, t - T20);
  // the field advances per frame (see Liquid.render); lenses move continuously
  const ltq = Math.max(0, Math.floor(t * 60 + 1e-6) / 60 - T20);
  const flow = 4.0 + ltq * 0.75 + 2.6 * (1 - Math.exp(-ltq * 5));
  const code = smoothstep(20.2, 20.7, b);
  const reveal = ease.outCubic(prog(b, 20.2, 0.9));
  const kick = Math.exp(-(b % 1) * 7) * (b >= 20.5 ? 1 : 0);

  const enter = curve.out(prog(b, 20.1, 1.0));
  const px = 960 + 430 * Math.sin(1.15 * lt - 0.4), py = 560 + 150 * Math.sin(2.1 * lt + 0.3);
  const l1 = { x: lerp(-380, px, enter), y: lerp(820, py, enter), r: 270 * (1 + 0.05 * kick), k: 1 };
  const s2 = ease.outBack(prog(b, 22.0, 0.45), 2.2);
  const a2 = 2.3 * lt + 1.0;
  const l2 = { x: l1.x + 360 * Math.cos(a2), y: l1.y + 300 * Math.sin(a2), r: 158 * s2 * (1 + 0.06 * kick), k: clamp(s2 * 3) };
  const s3 = ease.outBack(prog(b, 23.0, 0.4), 2.2);
  const a3 = -3.1 * lt;
  const l3 = { x: l1.x + 270 * Math.cos(a3), y: l1.y + 250 * Math.sin(a3), r: 98 * s3 * (1 + 0.07 * kick), k: clamp(s3 * 3) };
  return { flow, phase: 0.03 * Math.sin(ltq * 1.7), code, reveal, lenses: [l1, l2, l3] };
}

export default {
  id: 'shader',
  label: 'SHADERS',
  from: 20,
  to: 24,
  hud: 'light',

  init(R) {
    R.liquid.buildCode();
  },

  post(t) {
    const lt = t - T20;
    return { bloom: 0.14, threshold: 0.9, flash: lt >= 0 ? Math.exp(-lt * 10) : 0 };
  },

  draw(ctx, t, R) {
    const b = t / BEAT;
    const img = R.liquid.render(t, liquidParams(t));
    ctx.fillStyle = C.ink;
    ctx.fillRect(-300, -300, W + 600, H + 600);
    ctx.drawImage(img, -W * 0.015, -H * 0.015, W * 1.03, H * 1.03);

    // keep the HUD legible over bright liquid
    const top = ctx.createLinearGradient(0, 0, 0, 170);
    top.addColorStop(0, 'rgba(14,14,16,0.55)');
    top.addColorStop(1, 'rgba(14,14,16,0)');
    ctx.fillStyle = top;
    ctx.fillRect(-40, -40, W + 80, 210);
    const bot = ctx.createLinearGradient(0, H, 0, H - 190);
    bot.addColorStop(0, 'rgba(14,14,16,0.6)');
    bot.addColorStop(1, 'rgba(14,14,16,0)');
    ctx.fillStyle = bot;
    ctx.fillRect(-40, H - 190, W + 80, 230);

    const cp = prog(b, 20.4, 0.5);
    if (cp > 0) {
      const str = 'GLSL  /  DOMAIN-WARPED FBM  /  REFRACTION + DISPERSION';
      ctx.font = '500 13px "Geist Mono"';
      ctx.letterSpacing = '2px';
      ctx.fillStyle = C.paper;
      ctx.globalAlpha = 0.72;
      ctx.textAlign = 'left';
      ctx.fillText(str.slice(0, Math.floor(str.length * clamp(cp * 1.4))), 56, H - 96);
      ctx.globalAlpha = 1;
    }
  },
};
