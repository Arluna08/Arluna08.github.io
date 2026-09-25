#!/usr/bin/env node
// Offline renderer: drives headless Chromium frame by frame and writes motion-blurred PNGs.
//   node tools/render.mjs --frames=0-899 --sub=8 --shutter=0.5 --workers=4 --out=frames [--skip-existing]
// --frames accepts "a-b", "a-b:step" or "a,b,c".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const sub = parseInt(args.sub ?? 8, 10);
const shutter = parseFloat(args.shutter ?? 0.5);
const workers = parseInt(args.workers ?? 4, 10);
const outDir = path.resolve(args.out ?? 'frames');

function parseFrames(s) {
  const out = [];
  for (const part of String(s).split(',')) {
    const [range, step] = part.split(':');
    const [a, b] = range.split('-').map(Number);
    for (let f = a; f <= (b ?? a); f += Number(step ?? 1)) out.push(f);
  }
  return out;
}
const frames = parseFrames(args.frames ?? '0-899');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}

fs.mkdirSync(outDir, { recursive: true });
// Interleave frames across workers: shader-heavy shots are clustered in time, so contiguous
// chunks would leave one worker doing all the expensive frames. --skip-existing resumes a run.
const todo = args['skip-existing']
  ? frames.filter((f) => !fs.existsSync(path.join(outDir, `f${String(f).padStart(4, '0')}.png`)))
  : frames;
const chunks = Array.from({ length: workers }, (_, i) => todo.filter((_, k) => k % workers === i));
let done = 0;
const t0 = Date.now();

await Promise.all(
  chunks.map(async (list, w) => {
    if (!list.length) return;
    const browser = await chromium.launch({
      args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-frame-rate-limit'],
    });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[w${w}]`, m.text()); });
    page.on('pageerror', (e) => console.error(`[w${w}] pageerror`, e));
    await page.goto(`http://127.0.0.1:${port}/index.html?render=1`);
    await page.waitForFunction(() => window.REEL_READY || window.REEL_ERROR, null, { timeout: 300000 });
    const err = await page.evaluate(() => window.REEL_ERROR);
    if (err) throw new Error(err);
    const cdp = await page.context().newCDPSession(page);
    for (const f of list) {
      await page.evaluate(([f, s, sh]) => window.REEL.renderFrame(f, s, sh), [f, sub, shutter]);
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
      });
      fs.writeFileSync(path.join(outDir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
      done++;
      if (done % 25 === 0 || done === todo.length) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${todo.length} frames  ${el.toFixed(0)}s  eta ${((el / done) * (todo.length - done)).toFixed(0)}s`);
      }
    }
    await browser.close();
  }),
);
server.close();
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outDir}`);
