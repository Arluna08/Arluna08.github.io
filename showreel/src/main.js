// Boot: load faces, build the reel, then either play live (with the soundtrack) or expose a
// deterministic frame renderer for the offline pipeline (?render).
import { W, H, FPS, FRAMES, DURATION } from './config.js';
import { Face } from './type.js';
import { Post } from './post.js';
import { Reel } from './engine.js';
import { Liquid } from './liquid.js';
import intro from './scenes/s1_intro.js';
import type from './scenes/s2_type.js';
import shapes from './scenes/s3_shapes.js';
import particles from './scenes/s4_particles.js';
import ring from './scenes/s5_ring.js';
import shader from './scenes/s6_shader.js';
import bento from './scenes/s7_bento.js';
import endcard from './scenes/s8_end.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');

async function loadCssFonts() {
  const faces = [
    new FontFace('Geist Mono', 'url(fonts/GeistMono-VF.ttf)', { weight: '100 900' }),
    new FontFace('Archivo', 'url(fonts/Archivo-VF.ttf)', { weight: '100 900', stretch: '62% 125%' }),
    new FontFace('Instrument Serif', 'url(fonts/InstrumentSerif-Italic.ttf)', { style: 'italic' }),
  ];
  await Promise.all(faces.map(async (f) => document.fonts.add(await f.load())));
}

async function boot() {
  const [display, serif, mono] = await Promise.all([
    Face.load('fonts/Archivo-VF.ttf'),
    Face.load('fonts/InstrumentSerif-Italic.ttf'),
    Face.load('fonts/GeistMono-VF.ttf'),
    loadCssFonts(),
  ]);
  const work = document.createElement('canvas');
  work.width = W;
  work.height = H;
  const ctx = work.getContext('2d', { alpha: false, willReadFrequently: RENDER });
  const out = document.getElementById('out');
  const post = new Post(out, W, H);
  const liquid = new Liquid(W / 2, H / 2);

  const reel = new Reel({ faces: { display, serif, mono }, post, liquid, work });
  reel.add(intro, type, shapes, particles, ring, shader, bento, endcard);
  await reel.init();

  const renderFrame = (f, sub = 1, shutter = 0.5) => {
    post.begin();
    for (let s = 0; s < sub; s++) {
      const t = (f + (sub === 1 ? 0 : ((s + 0.5) / sub) * shutter)) / FPS;
      reel.drawFrame(ctx, t);
      post.add(work, 1 / sub);
    }
    post.finish(reel.postParams(f / FPS, f));
  };

  window.REEL = { renderFrame, frames: FRAMES, fps: FPS, reel };
  window.REEL_READY = true;
  if (RENDER) {
    document.body.classList.add('render');
    return;
  }
  startPlayer(renderFrame);
}

function startPlayer(renderFrame) {
  const audio = document.getElementById('audio');
  const ui = document.getElementById('ui');
  let playing = false, t0 = performance.now(), tPaused = 0;
  const still = params.get('t');
  const now = () => {
    if (still != null) return parseFloat(still);
    if (audio && !audio.paused && audio.readyState >= 2) return audio.currentTime;
    return playing ? ((performance.now() - t0) / 1000) % DURATION : tPaused;
  };
  const tick = () => {
    const t = Math.min(now(), DURATION - 1 / FPS);
    renderFrame(Math.floor(t * FPS));
    requestAnimationFrame(tick);
  };
  const play = () => {
    playing = true;
    t0 = performance.now() - tPaused * 1000;
    if (audio) {
      audio.currentTime = tPaused;
      audio.play().catch(() => {});
    }
    ui.classList.add('hidden');
  };
  const pause = () => {
    tPaused = now();
    playing = false;
    if (audio) audio.pause();
    ui.classList.remove('hidden');
  };
  if (audio) audio.addEventListener('ended', () => { tPaused = 0; playing = false; audio.currentTime = 0; play(); });
  document.addEventListener('click', () => (playing ? pause() : play()));
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
  });
  requestAnimationFrame(tick);
}

boot().catch((e) => {
  console.error(e);
  window.REEL_ERROR = String(e && e.stack || e);
});
