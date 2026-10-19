const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const out = process.argv[2] ?? '/tmp/wattcade-biomes'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let clock = 1000;
    performance.now = () => clock;
    window.__vclock = ms => { clock += ms; };
  });
  const opts = encodeURIComponent(JSON.stringify({ startBiome: 11, startDistance: 500, terrainSeed: 17 }));
  const url = `${reviewUrl}/dev/capture.html?game=warmup&manual=1&hour=14&opts=${opts}`;
  await page.goto(url); await page.waitForFunction(() => window.__advance);
  await page.evaluate(() => window.__advance(1000));
  await page.screenshot({ path: `${out}/sky-islands.png` });

  const gallery = await page.evaluate(async () => {
    const { gardenIsland } = await import('/src/games/warmup/render/worldPolish.ts');
    const { jaggedSkyRock } = await import('/src/games/warmup/render/skyRock.ts');
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 820;
    const g = canvas.getContext('2d'); g.fillStyle = '#f4f0e5'; g.fillRect(0, 0, 1440, 820);
    g.fillStyle = '#182132'; g.font = 'bold 28px system-ui'; g.fillText('SKY ISLANDS / OVERLAPPING CLIFF FRAGMENTS', 24, 38);
    const buf = document.createElement('canvas'); buf.width = 480; buf.height = 250;
    const p = buf.getContext('2d'); p.fillStyle = '#dcd7ec'; p.fillRect(0, 0, 480, 250);
    const seeds = [2, 5, 11, 18, 29, 41];
    seeds.forEach((seed, i) => {
      const x = 80 + (i % 3) * 160, y = 52 + Math.floor(i / 3) * 120;
      gardenIsland(p, x, y, 32 + (i % 3) * 8, seed, 8);
    });
    // Clipping inside the new rock painter must not escape to its caller.
    p.save(); p.setTransform(1, 0, 0, 1, 3, 7); p.globalAlpha = .67;
    jaggedSkyRock(p, -600, 100, () => 20, 3, 50);
    const m = p.getTransform();
    if (m.e !== 3 || m.f !== 7 || Math.abs(p.globalAlpha - .67) > .00001) throw new Error('Rock painter leaked caller state');
    p.restore(); p.fillStyle = '#dcd7ec'; p.fillRect(0, 246, 480, 4);
    g.imageSmoothingEnabled = false; g.drawImage(buf, 0, 70, 1440, 750);
    g.fillStyle = '#52616b'; g.font = '17px system-ui';
    seeds.forEach((seed, i) => { g.fillText(`Seed ${seed} · shared game art`, 25 + (i % 3) * 480, 412 + Math.floor(i / 3) * 360); });
    return canvas.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(`${out}/island-variants.png`, Buffer.from(gallery, 'base64'));

  await page.goto(`${url}&sec=15&color=%2319b5bc`); await page.waitForFunction(() => window.__advance);
  await page.evaluate(() => { for (let i = 0; i < 450; i++) window.__advance(1000 / 30); });
  const encoder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-f', 'image2pipe', '-vcodec', 'png', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/sky-islands-motion.mp4`], { stdio: ['pipe', 'ignore', 'inherit'] });
  const complete = once(encoder, 'exit');
  for (let i = 0; i < 240; i++) {
    await page.evaluate(() => window.__advance(1000 / 30));
    const frame = await page.screenshot();
    if (!encoder.stdin.write(frame)) await once(encoder.stdin, 'drain');
    if (i === 30) await page.screenshot({ path: `${out}/sky-in-motion.png` });
  }
  encoder.stdin.end(); const [code] = await complete;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Captured actual sky scene, six seeded variants and eight seconds of motion; caller state retained.');
} finally { await browser.close(); }
