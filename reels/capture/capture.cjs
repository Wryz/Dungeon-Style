/*
 * Films one fight for a reel: the game (dev server, `?dev`) in headless Chromium, stepped
 * frame by frame through director.js, frames streamed into ffmpeg; then the fight's sounds
 * rendered offline in sync. Writes <out>/<name>.mp4 (silent video), <name>.wav (game audio)
 * and <name>.json (the shot, its sound log and its moments).
 *
 *   NODE_PATH=$(npm root -g) node reels/capture/capture.cjs '<shot json>' [outDir]
 *
 * Shot: { name, round, weapon?, armour?, enemyHp?, seconds (max), tail (after the KO),
 *         camAngle?, camDist?, camRise?, fov?, buttons?, pressGap?, reach? }
 * Needs the dev server running: npx vite --port 5173
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const shot = JSON.parse(process.argv[2]);
const outDir = path.resolve(process.argv[3] ?? path.join(__dirname, '..', 'out'));
const W = 1080;
const H = 1920;
const FPS = 30;
const port = 5200 + (process.pid % 700);
const base = process.env.GAME_URL ?? 'http://localhost:5173/';
fs.mkdirSync(outDir, { recursive: true });
const file = (ext) => path.join(outDir, `${shot.name}.${ext}`);

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-vf', 'vflip', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', file('mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });

let wav = null;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const done = () => {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
    };
    if (req.url === '/frame') {
      if (body.length !== W * H * 4) console.warn(`frame of ${body.length} bytes`);
      if (ff.stdin.write(body)) done();
      else ff.stdin.once('drain', done);
    } else if (req.url === '/wav') {
      wav = body;
      done();
    } else done();
  });
});

(async () => {
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log(`[${shot.name}] pageerror: ${e.message}`));
  page.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && console.log(`[${shot.name}] ${m.text()}`));
  // The game's own loop never runs: frames are stepped by hand.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
  });
  await page.addInitScript({ path: path.join(__dirname, 'director.js') });
  await page.goto(`${base}?dev`);
  await page.waitForFunction(() => window.game && window.game.sfx, null, { timeout: 180000, polling: 500 });
  await page.addStyleTag({ content: '#ui, .tp-dfwv { display: none !important; }' });
  await page.evaluate((o) => window.__reel.setup(o), shot);

  const t0 = Date.now();
  let st;
  for (;;) {
    st = await page.evaluate(async (port) => {
      const buf = window.__reel.step();
      await fetch(`http://127.0.0.1:${port}/frame`, { method: 'POST', body: buf });
      return window.__reel.state();
    }, port);
    if (st.frame % 30 === 0) console.log(`[${shot.name}] ${st.t.toFixed(1)}s  phase=${st.phase} alive=${st.alive} ko=${st.koAt}  (${((Date.now() - t0) / st.frame).toFixed(0)} ms/frame)`);
    const over = st.koAt >= 0 ? st.t >= st.koAt + (shot.tail ?? 4) : st.alive === 0 && st.t > 3;
    if (over || st.t >= (shot.seconds ?? 40) || st.shopOpen) break;
  }
  const seconds = st.frame / FPS;
  await page.evaluate(async ({ port, seconds }) => {
    const bytes = await window.__reel.renderAudio(seconds);
    await fetch(`http://127.0.0.1:${port}/wav`, { method: 'POST', body: bytes });
  }, { port, seconds });
  const log = await page.evaluate(() => ({ events: window.__reel.events, marks: window.__reel.marks, koAt: window.__reel.koAt }));
  fs.writeFileSync(file('json'), JSON.stringify({ shot, seconds, fps: FPS, ...log }, null, 1));
  if (wav) fs.writeFileSync(file('wav'), wav);
  await browser.close();
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  server.close();
  console.log(`[${shot.name}] done: ${seconds.toFixed(1)}s, ${log.marks.length} moments, ${log.events.length} sounds, KO at ${log.koAt}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
