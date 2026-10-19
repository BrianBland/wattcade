const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
const out = process.argv[2] ?? '/tmp/wattcade-player'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${reviewUrl}/dev/rider-motion.html?manual=1`);
  await page.waitForFunction(() => window.__riderFrame);
  const encoder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-f', 'image2pipe', '-vcodec', 'png', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/R2-rider-motion.mp4`], { stdio: ['pipe', 'ignore', 'inherit'] });
  const completed = once(encoder, 'exit');
  let renderMs = 0;
  for (let i = 0; i < 480; i++) {
    const { frame, ms } = await page.evaluate(t => {
      const start = performance.now(); window.__riderFrame(t); const ms = performance.now() - start;
      return { frame: document.querySelector('canvas').toDataURL('image/png').split(',')[1], ms };
    }, i / 60);
    renderMs += ms;
    if (!encoder.stdin.write(Buffer.from(frame, 'base64'))) await once(encoder.stdin, 'drain');
    if (i === 10) await page.screenshot({ path: `${out}/R2-rider-still.png` });
  }
  encoder.stdin.end(); const [code] = await completed;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  if (errors.length) throw new Error(errors.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/R2-rider-motion.mp4`, '-vf', 'fps=30,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none', '-loop', '0', `${out}/R2-rider-motion.gif`]);
  console.log(JSON.stringify({ seconds: 8, fps: 60, meanThreeRiderFrameMs: renderMs / 480, output: out }));
} finally { await browser.close(); }
