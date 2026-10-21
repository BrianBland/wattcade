// Writes the single-road paint guides, and review images for any finished paintings.
//   npm run dev -- --port 5203 &   then   node scripts/td-paint-guide.mjs
// Set TD_PAINT_GUIDE_OUT=/tmp/td-review to keep validation separate from approved art history.
// Always:  docs/towerdefense/paint-guide/{portrait,landscape}-guide.png
//          docs/towerdefense/paint-guide/{portrait,landscape}-guide-mock.png   (real sprites on the flat guide)
// For each public/td/environment/road/{portrait,landscape}.webp that exists:
//          <orientation>-check.png       the game's road edges, pads and apron over the painting
//          <orientation>-clearings.json  each painted clearing's offset from its pad and radius, in world units
//          <orientation>-mock.png        the game's real outpost, towers and aliens over the painting, sim size
//          <orientation>-mock-zoom.png   the same at about in-game iPad resolution, cropped to the lower field
//          <orientation>-hud-<device>.png the painting and sprites under the real status rows and shell HUD
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5203';
const out = process.env.TD_PAINT_GUIDE_OUT ?? 'docs/towerdefense/paint-guide'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
const shoot = async (file, query, long, zoom = false) => {
  const s = long / 1536, [w, h] = query.includes('portrait') ? [1024 * s, 1536 * s] : [1536 * s, 1024 * s];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on('pageerror', e => errors.push(e));
  await page.goto(`${base}/dev/td-sketch.html?${query}&long=${long}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  if (errors.length) throw errors[0];
  let clip = { x: 0, y: 0, width: w, height: h };
  if (zoom) {
    const f = JSON.parse(await page.evaluate(() => document.body.dataset.focus)), size = 1200;
    clip = { x: Math.max(0, Math.min(w - size, f.x - size / 2)), y: Math.max(0, Math.min(h - size, f.y - size / 2)), width: size, height: size };
  }
  await page.screenshot({ path: `${out}/${file}`, clip });
  const clearings = await page.evaluate(() => document.body.dataset.clearings);
  if (clearings && !query.includes('mock')) {
    const o = query.includes('landscape') ? 'landscape' : 'portrait', list = JSON.parse(clearings);
    writeFileSync(`${out}/${o}-clearings.json`, JSON.stringify(list, null, 1) + '\n');
    for (const c of list) console.log(`  clearing ${c.pad}: off by ${c.off} units (dx ${c.dx}, dy ${c.dy}), radius ${c.r}${c.off > 0.3 || Math.abs(c.r - 4.8) > 0.4 ? '  <- fix' : ''}`);
  }
  await page.close();
  console.log(`${out}/${file}`);
};
try {
  for (const o of ['portrait', 'landscape']) {
    await shoot(`${o}-guide.png`, `guide=${o}`, 1536);
    await shoot(`${o}-guide-mock.png`, `guide=${o}&mock=1`, 1536);
    if (!existsSync(`public/td/environment/road/${o}.webp`)) continue;
    const check = `guide=${o}&check=/td/environment/road/${o}.webp`;
    await shoot(`${o}-check.png`, check, 1536);
    await shoot(`${o}-mock.png`, `${check}&mock=1`, 1536);
    await shoot(`${o}-mock-zoom.png`, `${check}&mock=1`, 3072, true);
    const devices = o === 'portrait' ? [['ipad', 820, 1180], ['ipad-pro', 1024, 1366], ['phone', 390, 844]] : [['ipad', 1180, 820], ['ipad-pro', 1366, 1024]];
    for (const [device, w, h] of devices) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
      const errors = []; page.on('pageerror', e => errors.push(e));
      await page.goto(`${base}/dev/towerdefense.html?manual=1&sec=8&crew=0&legend=0&compose=/td/environment/road/${o}.webp`, { waitUntil: 'networkidle' });
      await page.waitForSelector('body[data-compose]', { timeout: 120000 });
      if (errors.length) throw errors[0];
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${o}-hud-${device}.png` });
      await page.close();
      console.log(`${out}/${o}-hud-${device}.png`);
    }
  }
} finally { await browser.close(); }
