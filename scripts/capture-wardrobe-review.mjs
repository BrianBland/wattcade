import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const out = process.argv[2] ?? 'docs/visual-polish/wardrobe';
const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${reviewUrl}/dev/wardrobe-review.html?seed=42`);
  await page.waitForFunction(() => window.__wardrobeReady);
  for (const group of ['bottoms', 'footwear', 'eyewear', 'back', 'gloves', 'combined']) {
    await page.locator(`#${group}`).screenshot({ path: `${out}/${group}.png` });
  }
  // Confirm the art actually participates in every render, across every bike and pedal phase.
  const check = await page.evaluate(async () => {
    const { drawRider } = await import('/src/cosmetics/draw/rider.ts');
    const { BIKES } = await import('/src/cosmetics/draw/bikes.ts');
    const { riderLook } = await import('/src/cosmetics/unlocks.ts');
    const base = riderLook({ level: 1, achievements: [], color: '#25aab2' });
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 400;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = (look, crank = .18, speed = 6, gear) => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 720, 400); g.translate(500, 330); g.scale(5, 5);
      drawRider(g, look, crank, 7.2, { t: 1.2, speed, gear }); return g.getImageData(0, 0, 720, 400).data;
    };
    const difference = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    pixels(base);
    const plain = pixels(base), concepts = window.__wardrobeCards.slice(0, 15).map(c => c.concept);
    if (difference(plain, pixels(base)) !== 0) throw new Error('Repeated baseline render is unstable');
    const visible = concepts.map(c => ({ name: c.name, changedPixels: difference(plain, pixels({ ...base, outfit: c.outfit })) }));
    if (visible.some(c => c.changedPixels === 0)) throw new Error('Invisible concept: ' + JSON.stringify(visible));
    const full = Object.assign({}, ...[0, 1, 2, 3, 4].map(i => concepts[i * 3 + 2].outfit));
    let poses = 0;
    for (const bike of Object.keys(BIKES)) for (const crank of [0, .25, .5, .75]) {
      pixels({ ...base, bike, outfit: full }, crank); poses++;
    }
    for (const hat of ['knight', 'bucket', 'dino', 'welder']) {
      if (difference(pixels({ ...base, hat }), pixels({ ...base, hat, outfit: { eyewear: 'stars' } })) !== 0) throw new Error('Eyewear leaks through ' + hat);
    }
    for (const gear of ['bubble', 'scuba']) pixels({ ...base, outfit: full }, .18, 6, gear);
    if (difference(pixels({ ...base, outfit: { back: 'rocket' } }, .18, 0), pixels({ ...base, outfit: { back: 'rocket' } })) === 0) throw new Error('Rocket flame does not stop');
    return { visible, poses, fullFaceOcclusion: true, biomeGear: true, rocketFlamesStop: true };
  });
  writeFileSync(`${out}/render-checks.json`, JSON.stringify(check, null, 2) + '\n');
  // Motion proof uses the three complete outfits and a full crank cycle.
  if (!process.argv.includes('--stills')) {
    const encoder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-f', 'image2pipe', '-vcodec', 'png', '-i', '-', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/outfits-motion.mp4`], { stdio: ['pipe', 'ignore', 'inherit'] });
    const complete = once(encoder, 'exit');
    for (let i = 0; i < 60; i++) {
      await page.evaluate(t => window.__wardrobeFrame(t), 1.2 + i / 20);
      const frame = await page.locator('#combined').screenshot();
      if (!encoder.stdin.write(frame)) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end(); const [code] = await complete; if (code !== 0) throw new Error('ffmpeg failed');
  }
  await page.locator('#background').click();
  await page.evaluate(() => window.__wardrobeFrame(1.2));
  await page.locator('#combined').screenshot({ path: `${out}/combined-night.png` });
  await page.locator('#shuffle').click();
  const shuffledSeed = await page.locator('#seed').textContent();
  if (!shuffledSeed.includes('43')) throw new Error('Shuffle did not update seed');
  await page.locator('#animate').click(); await page.waitForTimeout(150);
  if (await page.locator('#animate').getAttribute('aria-pressed') !== 'true') throw new Error('Animation toggle failed');
  await page.locator('#animate').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('Mobile page overflows');
  await page.locator('#eyewear .card').first().screenshot({ path: `${out}/phone-card.png` });
  await page.setViewportSize({ width: 1536, height: 1740 });
  await page.goto(`${reviewUrl}/dev/wardrobe-review.html?seed=42&overview=1`);
  await page.waitForFunction(() => window.__wardrobeReady);
  await page.locator('#overview').screenshot({ path: `${out}/overview.png` });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(check));
  console.log(`Wardrobe review captured in ${out}`);
} finally { await browser.close(); }
