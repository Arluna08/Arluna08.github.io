// Shared state between the particle scene and the 3D scene: the particles end their life
// exactly on the points of a rotating Fibonacci sphere, which the 3D scene picks up.
import { W, H } from './config.js';

export const NP = 9000;
export const PCOL = new Uint8Array(NP); // 0 paper, 1 coral, 2 lime
export const PSIZE = new Float32Array(NP);
export const SIGMA = new Uint32Array(NP); // particle -> sphere point
export const FIB = new Float32Array(NP * 3);

const GOLD = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < NP; i++) {
  const y = 1 - (i / (NP - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = GOLD * i;
  FIB[i * 3] = Math.cos(th) * r;
  FIB[i * 3 + 1] = y;
  FIB[i * 3 + 2] = Math.sin(th) * r;
}

export const CAM = { D: 1500, cx: W / 2, cy: H / 2 };
export const SPHERE_R = 300;

// Sphere orientation for t <= 7.5 s (beat 16). The 3D scene continues from these values.
export function sphereAngles(t) {
  return { ry: 1.05 * t, rx: 0.38 + 0.06 * Math.sin(t * 1.3) };
}

// Rotate unit point k by (ry, rx), scale by radius, project. Writes into out[0..3] = sx, sy, scale, z.
export function projectPoint(k, ry, rx, radius, out, D = CAM.D, cx = CAM.cx, cy = CAM.cy) {
  const x = FIB[k * 3], y = FIB[k * 3 + 1], z = FIB[k * 3 + 2];
  const cyr = Math.cos(ry), syr = Math.sin(ry);
  const x1 = x * cyr + z * syr, z1 = -x * syr + z * cyr;
  const cxr = Math.cos(rx), sxr = Math.sin(rx);
  const y2 = y * cxr - z1 * sxr, z2 = y * sxr + z1 * cxr;
  const X = x1 * radius, Y = y2 * radius, Z = z2 * radius;
  const s = D / (D + Z);
  out[0] = cx + X * s;
  out[1] = cy + Y * s;
  out[2] = s;
  out[3] = Z;
  return out;
}

// Batched dot renderer: buckets by colour and alpha so 9 000 squares cost a handful of state changes.
const PAL = [[243, 239, 230], [255, 91, 53], [214, 255, 63]];
const LEVELS = 8;
const buckets = Array.from({ length: 3 * LEVELS }, () => []);
const styles = [];
for (let c = 0; c < 3; c++) for (let l = 0; l < LEVELS; l++) styles.push(`rgba(${PAL[c][0]},${PAL[c][1]},${PAL[c][2]},${((l + 1) / LEVELS).toFixed(3)})`);

export function drawDots(ctx, n, X, Y, S, COL, A) {
  for (const bk of buckets) bk.length = 0;
  for (let i = 0; i < n; i++) {
    const a = A ? A[i] : 1;
    if (a <= 0.02) continue;
    const lv = Math.min(LEVELS - 1, Math.floor(a * LEVELS));
    buckets[COL[i] * LEVELS + lv].push(i);
  }
  for (let k = 0; k < buckets.length; k++) {
    const list = buckets[k];
    if (!list.length) continue;
    ctx.fillStyle = styles[k];
    for (let j = 0; j < list.length; j++) {
      const i = list[j], s = S[i];
      ctx.fillRect(X[i] - s / 2, Y[i] - s / 2, s, s);
    }
  }
}
