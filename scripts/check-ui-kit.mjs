import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base = process.env.CHROME_REVIEW_URL ?? 'http://127.0.0.1:5173';
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox']
  });
  try {
    for (const [width, height] of [[320, 568], [1180, 820]]) {
      const p = await b.newPage({
        viewport: {
          width,
          height
        },
        reducedMotion: 'reduce'
      });
      await p.goto(`${base}/dev/ui-kit.html`);
      await p.waitForFunction(() => window.__uiKitReady);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await p.getByRole('button', {
        name: 'Primary',
        exact: true
      }).focus();
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('1 primary'));
      await p.getByRole('tab', {
        name: 'Overview',
        exact: true
      }).focus();
      await p.keyboard.press('ArrowRight');
      assert.equal(await p.getByRole('tab', {
        name: 'Progress',
        exact: true
      }).getAttribute('aria-selected'), 'true');
      await p.getByRole('tab', {
        name: 'Progress',
        exact: true
      }).press('ArrowRight');
      assert.equal(await p.getByRole('tab', {
        name: 'Overview',
        exact: true
      }).getAttribute('aria-selected'), 'true');
      await p.getByRole('button', {
        name: 'Button help',
        exact: true
      }).click();
      assert.equal(await p.getByRole('tooltip').isVisible(), true);
      await p.keyboard.press('Escape');
      assert.equal(await p.getByRole('tooltip').count(), 0);
      assert.equal(await p.locator('.ui-spinner').first().evaluate(e => getComputedStyle(e).animationName), 'none');
      const small = await p.locator('button').evaluateAll(bs => bs.filter(x => x.getBoundingClientRect().height < 43.9).map(x => x.textContent));
      assert.deepEqual(small, []);
      console.log('PASS UI gallery', width, height);
      await p.close();
    }
  } finally {
    await b.close();
  }
})();
