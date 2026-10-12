import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Start Vite, then: node scripts/check-rider-render.mjs [http://localhost:5199]
// Exercises real canvas rendering; the unit art checks use a stub context.
const out = 'artifacts/cosmetics';
mkdirSync(out, { recursive: true });
const framesDir = mkdtempSync(join(tmpdir(), 'rider-frames-'));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 980 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.argv[2] ?? 'http://localhost:5199'}/dev/rider.html?hour=15`);
  await page.waitForFunction(() => window.__riderReady);
  await page.locator('#pause').check();
  const result = await page.evaluate(async () => {
    const { drawRider } = await import('/src/cosmetics/draw/rider.ts');
    const { riderLook, withItem } = await import('/src/cosmetics/unlocks.ts');
    const { ITEMS } = await import('/src/cosmetics/catalog.ts');
    const base = riderLook({ level: 1, achievements: [], color: '#27c5c7' });
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    let cases = 0;
    for (const artMode of ['legacy', 'rich']) for (const it of ITEMS.filter(it => it.slot !== 'ship' && it.slot !== 'title')) {
      for (const gear of [null, 'bubble', 'scuba']) for (const phase of [0, .25, .5, .75]) {
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 512, 512);
        g.translate(300, 350); g.scale(5, 5);
        drawRider(g, withItem({ ...base, artMode }, it), phase, 12, { t: 2, speed: 6, gear, trailer: true });
        cases++;
      }
    }
    const frame = (phase, t = 1, artMode = 'rich') => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 512, 512);
      g.translate(256, 350); g.scale(10, 10);
      drawRider(g, { ...base, artMode }, phase, 3, { t, speed: 0 });
      return c.toDataURL();
    };
    const frames = Array.from({ length: 16 }, (_, i) => frame(i / 16));
    if (new Set(frames).size !== 16) throw Error('Pedal frames did not change');
    if (frame(.25, 1) !== frame(.25, 5)) throw Error('Stationary crank moved with wall clock');
    const legacyFrames = Array.from({ length: 16 }, (_, i) => frame(i / 16, 1, 'legacy'));
    if (new Set(legacyFrames).size !== 16) throw Error('Legacy pedal frames did not change');
    if (frame(.25, 1, 'legacy') !== frame(.25, 5, 'legacy')) throw Error('Legacy stationary crank moved');
    return { cases, frames };
  });
  for (let i = 0; i < 16; i++) {
    writeFileSync(join(framesDir, `f${String(i).padStart(2, '0')}.png`), Buffer.from(result.frames[i].split(',')[1], 'base64'));
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '16', '-i', join(framesDir, 'f%02d.png'),
    '-vf', 'split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128',
    '-loop', '0', join(out, 'player-pedal-loop.gif')]);
  await page.screenshot({ path: join(out, 'player-implemented.png'), fullPage: true });
  for (const [selector, name] of [['#study', 'player-pedal-phases'], ['#gallery', 'player-bike-poses']]) {
    await page.locator(selector).screenshot({ path: join(out, `${name}.png`) });
  }
  await page.locator('#biome').selectOption('desert'); await page.waitForTimeout(100);
  await page.locator('#scene').screenshot({ path: join(out, 'player-desert.png') });
  for (const id of ['road', 'recumbent', 'tandem', 'tallbike', 'hobbyhorse', 'ufo']) {
    await page.locator('#bike').selectOption(id); await page.waitForTimeout(60);
  }
  await page.locator('#bike').selectOption('road'); await page.locator('#cadence').fill('0');
  await page.locator('#pause').uncheck(); await page.waitForTimeout(80);
  const a = await page.locator('#gallery canvas').first().evaluate(c => c.toDataURL());
  await page.waitForTimeout(80);
  const b = await page.locator('#gallery canvas').first().evaluate(c => c.toDataURL());
  if (a !== b) throw Error('Zero-cadence preview animates legs');
  await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(100);
  await page.screenshot({ path: join(out, 'player-portrait.png') });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(JSON.stringify({ browserRenderCases: result.cases, artModes: ['legacy', 'rich'], distinctPedalFramesPerMode: 16,
    stationaryCrank: 'passed', zeroCadence: 'passed', alternateBikeSelections: 'passed',
    portrait: 'passed', consoleErrors: errors.length }));
} finally {
  await browser.close();
  rmSync(framesDir, { recursive: true, force: true });
}
