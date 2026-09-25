// WebGL2 back end: sub-frame accumulation (real motion blur, averaged in linear light)
// followed by a finishing pass: bloom, radial chromatic aberration, vignette, film grain.

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS_ACC = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D src; uniform float w;
void main(){
  vec3 c = texture(src, vec2(uv.x, 1.0 - uv.y)).rgb;
  o = vec4(pow(c, vec3(2.2)) * w, w);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 texel; uniform float thr;
void main(){
  vec3 c = texture(src, uv + texel * vec2(-1.0, -1.0)).rgb
         + texture(src, uv + texel * vec2( 1.0, -1.0)).rgb
         + texture(src, uv + texel * vec2(-1.0,  1.0)).rgb
         + texture(src, uv + texel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(thr, thr + 0.4, l), 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir;
void main(){
  vec3 c = texture(src, uv).rgb * 0.2270270270;
  c += texture(src, uv + dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(src, uv - dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(src, uv + dir * 3.2307692308).rgb * 0.0702702703;
  c += texture(src, uv - dir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

const FS_FINAL = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D acc; uniform sampler2D bl1; uniform sampler2D bl2;
uniform float ca, bloom, grain, vig, flash, fade, seed;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * ca * (0.35 + 2.4 * r2);
  vec3 c;
  c.r = texture(acc, uv - off).r;
  c.g = texture(acc, uv).g;
  c.b = texture(acc, uv + off).b;
  c += (texture(bl1, uv).rgb * 0.6 + texture(bl2, uv).rgb * 0.8) * bloom;
  c = mix(c, vec3(1.0), flash);
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  c *= 1.0 - vig * smoothstep(0.08, 0.55, r2);
  float g = hash(gl_FragCoord.xy + seed * vec2(113.17, 71.31)) + hash(gl_FragCoord.xy * 1.37 + seed * vec2(31.7, 17.3)) - 1.0;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += g * grain * (0.55 + 0.9 * l * (1.0 - l));
  o = vec4(c * fade, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
export function program(gl, fs, vs = VS) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}
export function quad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return vao;
}

function target(gl, w, h, internal, format, type) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}

export class Post {
  constructor(canvas, W, H) {
    this.W = W; this.H = H;
    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    this.gl = gl;
    this.vao = quad(gl);
    this.pAcc = program(gl, FS_ACC);
    this.pBright = program(gl, FS_BRIGHT);
    this.pBlur = program(gl, FS_BLUR);
    this.pFinal = program(gl, FS_FINAL);

    this.src = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const F = gl.RGBA16F;
    this.acc = target(gl, W, H, F);
    this.q1 = target(gl, W / 4, H / 4, F);
    this.q2 = target(gl, W / 4, H / 4, F);
    this.e1 = target(gl, W / 8, H / 8, F);
    this.e2 = target(gl, W / 8, H / 8, F);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  draw(prog, fb, w, h, uniforms, textures) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    let unit = 0;
    for (const [name, tex] of Object.entries(textures || {})) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(prog.u[name], unit++);
    }
    for (const [name, v] of Object.entries(uniforms || {})) {
      if (prog.u[name] == null) continue;
      if (Array.isArray(v)) (v.length === 2 ? gl.uniform2fv : gl.uniform3fv).call(gl, prog.u[name], v);
      else gl.uniform1f(prog.u[name], v);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.acc.fb);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Add one sub-frame (a 2D canvas) with the given weight.
  add(canvas, weight) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.draw(this.pAcc, this.acc.fb, this.W, this.H, { w: weight }, { src: this.src });
    gl.disable(gl.BLEND);
  }

  finish(p) {
    const W = this.W, H = this.H;
    if (p.bloom > 0) {
      this.draw(this.pBright, this.q1.fb, W / 4, H / 4, { texel: [1 / W, 1 / H], thr: p.threshold ?? 0.72 }, { src: this.acc.tex });
      this.draw(this.pBlur, this.q2.fb, W / 4, H / 4, { dir: [4 / W, 0] }, { src: this.q1.tex });
      this.draw(this.pBlur, this.q1.fb, W / 4, H / 4, { dir: [0, 4 / H] }, { src: this.q2.tex });
      this.draw(this.pBlur, this.e1.fb, W / 8, H / 8, { dir: [16 / W, 0] }, { src: this.q1.tex });
      this.draw(this.pBlur, this.e2.fb, W / 8, H / 8, { dir: [0, 16 / H] }, { src: this.e1.tex });
    }
    this.draw(
      this.pFinal, null, W, H,
      {
        ca: p.ca ?? 0, bloom: p.bloom ?? 0, grain: p.grain ?? 0.03, vig: p.vig ?? 0.2,
        flash: p.flash ?? 0, fade: p.fade ?? 1, seed: p.seed ?? 0,
      },
      { acc: this.acc.tex, bl1: this.q1.tex, bl2: this.e2.tex },
    );
  }
}
