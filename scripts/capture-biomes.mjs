import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const style = process.argv[2] ?? 'remastered', base = process.argv[3] ?? 'http://localhost:5199';
if (!['classic', 'remastered'].includes(style)) throw Error('Choose classic or remastered');
const out = `artifacts/overworld/${style}`; mkdirSync(out, {recursive: true});
const ids = ['countryside', 'seaside', 'underwater', 'jungle', 'desert', 'volcano', 'snow', 'moon', 'driveIn'];
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox']});
try {
  const page = await browser.newPage({viewport: {width: 1228, height: 900}, deviceScaleFactor: 2});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { performance.now = () => 10000; });
  for (const hour of [15, 21]) {
    await page.goto(`${base}/dev/biomes.html?hour=${hour}&art=${style}&manual=1`);
    await page.waitForFunction(() => window.__biomeReady);
    for (const id of ids) {
      await page.evaluate(id => window.__biomeRender(id), id);
      await page.locator('#scene').screenshot({path: `${out}/${id}-${hour === 15 ? 'day' : 'night'}.png`});
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log(JSON.stringify({style, scenes: 9, clocks: 2, pageErrors: 0, output: out}));
} finally { await browser.close(); }
