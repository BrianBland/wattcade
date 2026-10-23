import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Run against Vite: CHROME_REVIEW_URL=http://127.0.0.1:5173 node scripts/check-chrome.mjs
const base = process.env.CHROME_REVIEW_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const [width, height] of [[320,568], [390,844], [844,390], [1180,820]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => errors.push(error.message));
    for (const view of ['connect', 'riders', 'pause', 'achievement']) {
      await page.goto(`${base}/dev/chrome-review.html?game=warmup&manual=1&fake=0&legend=0&view=${view}`);
      await page.waitForFunction(() => window.__chromeReview?.ready && window.__hudLive?.ready);
      await page.waitForTimeout(350);
      const result = await page.evaluate(view => {
        const hud = document.querySelector('.hud.hud-ribbon').getBoundingClientRect();
        const cta = [...document.querySelectorAll('.chrome-ui button')].find(b => b.textContent.includes('Continue'));
        const smallButtons = [...document.querySelectorAll('.chrome-ui button')].filter(b => b.getBoundingClientRect().width && b.getBoundingClientRect().height < 43.9).map(b => b.textContent);
        return { overflow: document.documentElement.scrollWidth > innerWidth, ctaBottom: view === 'connect' ? cta?.getBoundingClientRect().bottom : null, hudTop: hud.top, smallButtons, controllerHints: !!document.querySelector('.chrome-ui .key-hints') };
      }, view);
      const context = `${width}×${height} ${view}`;
      assert.equal(result.overflow, false, `${context}: horizontal overflow`);
      assert.deepEqual(result.smallButtons, [], `${context}: touch buttons below 44px`);
      assert.equal(result.controllerHints, false, `${context}: physical labels without a controller`);
      if (result.ctaBottom != null) assert.ok(result.ctaBottom <= result.hudTop, `${context}: Continue obscured by HUD`);
      if (view === 'connect') {
        const setup = page.locator('.media-server-connection');
        assert.equal(await setup.getAttribute('open'), null, `${context}: optional setup should start collapsed`);
        assert.equal(await page.getByLabel('Media server URL').isVisible(), false);
        await page.getByLabel('Media server setup', { exact: true }).click();
        await page.getByLabel('Media server URL').scrollIntoViewIfNeeded();
        assert.equal(await page.getByLabel('Media server URL').isVisible(), true);
        await page.getByLabel('Media server setup', { exact: true }).click();
        assert.equal(await page.getByLabel('Media server URL').isVisible(), false);
        await page.getByLabel('Media server setup', { exact: true }).focus();
        await page.keyboard.press('Enter');
        assert.equal(await setup.getAttribute('open'), '', `${context}: keyboard should expand once`);
        await page.keyboard.press('Enter');
        assert.equal(await setup.getAttribute('open'), null, `${context}: keyboard should collapse once`);
      }
      if (view === 'riders') {
        await page.locator('.rider-entry').nth(2).click();
        assert.equal(await page.locator('.rider-details h2').innerText(), 'Rowan');
        await page.getByRole('button', { name: 'Ride as Rowan' }).click();
        await page.waitForSelector('.toast');
      }
      if (view === 'pause') await page.getByRole('button', { name: /Finish ride/ }).scrollIntoViewIfNeeded();
      if (view === 'achievement') await page.waitForSelector('.achievement-toast');
      console.log(`PASS ${context}`);
    }
    await page.close();
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
} finally { await browser.close(); }
