// Render live HUD state fixtures over the real game/controls. Review output stays outside Git.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const output = process.env.TD_OBJECTIVE_REVIEW_OUT ?? '/tmp/towerdefense-objective';
await mkdir(output, { recursive: true });
const base = process.env.TOWERDEFENSE_BASE ?? 'http://127.0.0.1:5208';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
  for (const [name, width, height] of [['landscape', 1180, 820], ['pro', 1366, 1024], ['small-tablet', 1024, 768], ['portrait', 820, 1180], ['short', 844, 390]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/dev/towerdefense.html?manual=1&sec=531&seed=1&legend=0`);
    await page.waitForFunction(() => window.__td, null, { timeout: 120000 });
    await page.evaluate(async () => {
      const { TdHud } = await import('/src/games/towerdefense/render/panels.ts');
      document.querySelector('.td-hud').remove();
      window.__objectiveHud = new TdHud(); document.getElementById('field').append(window.__objectiveHud.root);
    });
    for (const legend of [false, true]) {
      await page.evaluate(on => window.__td.legend(on), legend); await page.waitForTimeout(250);
      for (const state of ['steady', 'announced', 'effort', 'won', 'boss-warning', 'boss-switch', 'boss-exposed', 'recovery', 'easy', 'crew-off']) {
        const check = await page.evaluate(({ state }) => {
          const initial = window.__td.snapshot(), L = window.__td.ui().layout;
          const effort = { kind: 'grind', state: 'active', wave: 2, countdownS: 6, heldS: 5, needS: 20, leftS: 28, minRpm: 60, maxRpm: 75, minFtp: .85, maxFtp: 2, targetFtp: .9 };
          const boss = { id: 1, phase: 1, phaseCount: 3, color: 'purple', weapon: 'rail', next: null, countdownS: 7, telegraph: true, exposed: false, windowLeftS: 4, sprintBoost: false };
          const s = { ...initial, phase: 'run', garage: null, workshop: null, boss: null, effort: null, banner: null,
            set: { set: 2, pos: 2, role: 'work' }, brood: { ...initial.brood, countdownS: 0 }, autoCrew: true,
            constructionDone: false, suggestion: { wave: 2, kind: 'upgrade', pad: 1, tower: 'flamer', level: 3, targetLevel: 5, cost: 280, label: 'Upgrade Flamethrower to Lv 5 · South ridge' } };
          if (['effort', 'announced', 'won'].includes(state)) s.effort = { ...effort, state: state === 'effort' ? 'active' : state, heldS: state === 'won' ? 20 : 5 };
          if (state.startsWith('boss-')) s.boss = { ...boss, telegraph: state === 'boss-warning', exposed: state === 'boss-exposed', next: state === 'boss-switch' ? 'red' : null };
          if (state === 'recovery') s.brood.countdownS = 25;
          if (state === 'easy') s.set = { set: 2, pos: 5, role: 'easy' };
          if (state === 'crew-off') s.autoCrew = false;
          window.__objectiveHud.render(s, L, innerWidth);
          const card = document.querySelector('.td-objective'), event = document.querySelector('.td-event');
          const r = card.getBoundingClientRect();
          return { expectedCard: !!L.objective, visible: !card.hidden, eventHidden: event.hidden,
            contained: card.hidden || card.scrollHeight <= card.clientHeight + 1 && card.scrollWidth <= card.clientWidth + 1,
            bottom: r.bottom, limit: L.UH, text: card.textContent,
            progress: card.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') };
        }, { state });
        assert.equal(check.visible, check.expectedCard);
        assert.ok(check.contained, `${name} ${state} copy fits without scrolling`);
        if (check.visible) {
          assert.ok(check.eventHidden, 'No duplicate central effort/boss announcement');
          assert.ok(check.bottom <= check.limit + 0.5);
          if (state === 'effort') assert.equal(check.progress, '25');
          if (state === 'boss-warning') assert.ok(check.text.includes('ERG push'));
          if (state === 'boss-switch') assert.ok(check.text.includes('Fireball next'));
          if (state === 'recovery') assert.ok(check.text.includes('Recover'));
          if (state === 'crew-off') assert.ok(check.text.includes('Auto-crew off'));
        }
        if (name === 'landscape' && ['steady', 'effort', 'boss-warning', 'recovery'].includes(state))
          await page.screenshot({ path: `${output}/${state}-${legend ? 'controller' : 'touch'}.jpg`, type: 'jpeg', quality: 88 });
        results.push({ name, legend, state, ...check });
      }
    }
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.__td.dispose()); await page.close();
    console.log(`${name}: objective/crew states fit in both control modes; compact fallback preserved`);
  }
  await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2) + '\n');
} finally { await browser.close(); }
