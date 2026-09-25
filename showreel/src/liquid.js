// GLSL scene: domain-warped fBm "liquid" rendered at half resolution, then a full-resolution
// pass that bends it through glass lenses (magnification, dispersion, rim light, specular),
// with the shader's own source code as the overlay the lenses read.
import { program, quad } from './post.js';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

export const FS_FIELD = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform float t;
uniform float phase;
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x), p1 = vec3(a0.zw, h.y), p2 = vec3(a1.xy, h.z), p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
vec3 pal(float x){
  // ink -> cobalt -> lilac -> coral -> paper
  vec3 c0 = vec3(0.055, 0.055, 0.063), c1 = vec3(0.18, 0.235, 1.0), c2 = vec3(0.72, 0.66, 1.0);
  vec3 c3 = vec3(1.0, 0.357, 0.208), c4 = vec3(0.953, 0.937, 0.902);
  x = clamp(x, 0.0, 1.0);
  if (x < 0.3) return mix(c0, c1, smoothstep(0.0, 0.3, x));
  if (x < 0.52) return mix(c1, c2, smoothstep(0.3, 0.52, x));
  if (x < 0.74) return mix(c2, c3, smoothstep(0.52, 0.74, x));
  return mix(c3, c4, smoothstep(0.74, 1.0, x));
}
void main(){
  vec2 q = vec2(uv.x * 1.7778, uv.y) * 0.85;
  vec2 a = vec2(fbm(vec3(q, t * 0.11)), fbm(vec3(q + vec2(5.2, 1.3), t * 0.11)));
  vec2 b = vec2(fbm(vec3(q + 1.5 * a + vec2(1.7, 9.2), t * 0.15)), fbm(vec3(q + 1.5 * a + vec2(8.3, 2.8), t * 0.15)));
  float f = fbm(vec3(q + 1.9 * b, t * 0.09));
  float v = 0.42 + 1.05 * f + 0.35 * length(b) + phase;
  vec3 col = pal(v);
  // faint contour lines, like a topographic print of the flow
  float bands = abs(fract(v * 7.0) - 0.5);
  col *= 0.95 + 0.05 * smoothstep(0.0, 0.05, bands);
  o = vec4(col, 1.0);
}`;

const FS_LENS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D field;
uniform sampler2D code;
uniform vec4 lens[3];
uniform float codeAmt;
uniform float reveal;
uniform vec2 res;
vec2 toUV(vec2 P){ return vec2(P.x / 1920.0, 1.0 - P.y / 1080.0); }
void main(){
  vec2 P = vec2(uv.x * 1920.0, (1.0 - uv.y) * 1080.0);
  vec3 col = texture(field, uv).rgb;
  float lineVis = step(P.y, reveal * 1140.0);
  float ov = texture(code, uv).a * codeAmt * 0.34 * lineVis;
  float shadow = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 L = lens[i];
    if (L.z < 1.0) continue;
    float rs = length(P - (L.xy + vec2(L.z * 0.06, L.z * 0.16))) / L.z;
    shadow = max(shadow, (1.0 - smoothstep(0.7, 1.3, rs)) * 0.45 * L.w);
  }
  col *= 1.0 - shadow;
  col = mix(col, vec3(0.953, 0.937, 0.902), ov);
  for (int i = 2; i >= 0; i--) {
    vec4 L = lens[i];
    if (L.z < 1.0) continue;
    vec2 d = P - L.xy;
    float rho = length(d) / L.z;
    if (rho >= 1.0) continue;
    float h = sqrt(1.0 - rho * rho);
    float m = mix(0.42, 1.0, rho * rho);
    float disp = 0.035 * rho * rho;
    vec2 Sr = L.xy + d * m * (1.0 - disp);
    vec2 Sg = L.xy + d * m;
    vec2 Sb = L.xy + d * m * (1.0 + disp);
    vec3 g;
    g.r = texture(field, toUV(Sr)).r;
    g.g = texture(field, toUV(Sg)).g;
    g.b = texture(field, toUV(Sb)).b;
    float cr = texture(code, toUV(Sr)).a, cg = texture(code, toUV(Sg)).a, cb = texture(code, toUV(Sb)).a;
    vec3 cc = vec3(cr, cg, cb) * codeAmt * 0.95;
    g = mix(g * 1.08, vec3(0.953, 0.937, 0.902), cc);
    vec3 n = normalize(vec3(d / L.z, h));
    float spec = pow(max(dot(n, normalize(vec3(-0.45, -0.55, 0.7))), 0.0), 48.0);
    float fres = pow(1.0 - h, 3.0);
    g += spec * 0.85 + fres * 0.35;
    g *= 0.92 + 0.08 * h;
    float edge = 1.0 - smoothstep(1.0 - 2.0 / L.z, 1.0, rho);
    col = mix(col, g, edge * L.w);
    break;
  }
  o = vec4(col, 1.0);
}`;

export class Liquid {
  constructor(w, h) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.gl = gl;
    this.vao = quad(gl);
    this.pField = program(gl, FS_FIELD, VS);
    this.pLens = program(gl, FS_LENS, VS);
    this.fw = w; this.fh = h;
    this.fieldTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fieldTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.codeTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.codeTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.lastKey = null;
  }

  // The overlay: this file's own GLSL, set in columns.
  buildCode() {
    const c = document.createElement('canvas');
    c.width = 1920; c.height = 1080;
    const g = c.getContext('2d');
    g.font = '400 15px "Geist Mono"';
    g.fillStyle = '#fff';
    const lines = (FS_FIELD + '\n' + FS_LENS).split('\n').map((l) => l.replace(/^\s+/, (m) => ' '.repeat(Math.min(m.length, 4))));
    let k = 0;
    for (let col = 0; col < 4; col++) {
      for (let y = 132; y < 1080 - 110; y += 21) {
        const line = lines[k++ % lines.length];
        g.fillText(line.slice(0, 50), 56 + col * 462, y);
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.codeTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  render(t, o = {}) {
    const gl = this.gl;
    const key = t.toFixed(6) + JSON.stringify(o);
    if (key === this.lastKey) return this.canvas;
    this.lastKey = key;
    gl.bindVertexArray(this.vao);
    // The noise field is the expensive pass and drifts slowly, so it is only redrawn when its
    // inputs change (once per frame); the lenses are redrawn for every motion-blur sample.
    const fieldKey = `${o.flow ?? t}|${o.phase ?? 0}`;
    if (fieldKey !== this.fieldKey) {
      this.fieldKey = fieldKey;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.viewport(0, 0, this.fw, this.fh);
      gl.useProgram(this.pField.p);
      gl.uniform1f(this.pField.u.t, o.flow ?? t);
      gl.uniform1f(this.pField.u.phase, o.phase ?? 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 1920, 1080);
    gl.useProgram(this.pLens.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.uniform1i(this.pLens.u.field, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.codeTex);
    gl.uniform1i(this.pLens.u.code, 1);
    const L = new Float32Array(12);
    (o.lenses || []).slice(0, 3).forEach((l, i) => L.set([l.x, l.y, l.r, l.k ?? 1], i * 4));
    gl.uniform4fv(this.pLens.u['lens[0]'], L);
    gl.uniform1f(this.pLens.u.codeAmt, o.code ?? 0);
    gl.uniform1f(this.pLens.u.reveal, o.reveal ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
