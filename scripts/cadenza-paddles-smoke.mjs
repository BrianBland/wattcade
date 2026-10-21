// Run against npm run dev. Exercises the real pause menu, InputHub and simulation together.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CADENZA_TEST_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const errors = [], results = [];
try {
  await mkdir('out/cadenza-paddles', { recursive: true });
  for (const [width, height] of [[1180, 820], [820, 1180], [844, 390], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', e => errors.push(e.message));
    // Keep the dev page's WebGL ride stopped; the trial below owns the session and real menu loop.
    await page.route('**/dev/cadenza.ts', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(`${base}/dev/cadenza.html?script=z2&sec=20&speed=0`);
    await page.addStyleTag({ url: `${base}/src/styles/main.css` });
    await page.evaluate(async () => {
      const { PauseMenu } = await import('/src/shell/screens/PauseMenu.tsx');
      // Use Vite's versioned module URL so hooks and rendering share the same Preact instance.
      const preactUrl = performance.getEntriesByType('resource').map(r => r.name).find(url => /\/preact\.js\?/.test(url));
      const { h, render } = await import(preactUrl);
      const { input } = await import('/src/shell/services.ts');
      const { createGameSession, testProfile } = await import('/src/core/index.ts');
      const { module } = await import('/src/games/cadenza/index.ts');
      const { synthTimeline } = await import('/src/media/synth/queue.ts');
      const profile = testProfile(); profile.id = 'paddle-smoke';
      input.applySettings(profile.settings);
      const session = createGameSession({ game: module, profile, input, fake: { script: 'z2' }, media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, simOpts: { difficulty: 'pro' } });
      session.pause();
      const host = document.createElement('div'); document.body.append(host);
      window.__paddleTrial = { session, input, resumes: 0 };
      render(h(PauseMenu, { tuning: session.tuning, legendOn: true, onLegend() {}, onHelp() {}, onQuit() {}, onRestart() {}, onExtension() {}, onResume() { window.__paddleTrial.resumes++; session.resume(); render(null, host); } }), host);
    });
    await page.getByRole('button', { name: 'Paddle steering', exact: true }).click();
    await page.getByRole('heading', { name: 'Paddle steering' }).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `out/cadenza-paddles/${width}x${height}.png` });
    const bounds = await page.locator('.paddle-settings').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
    // Defaults are continuous + linear. Touch toggles and numeric entry update the live registry.
    await page.getByRole('button', { name: 'Continuous', exact: true }).click();
    await page.getByRole('button', { name: 'Linear', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Paddle deadzone' }).fill('0');
    await page.getByRole('spinbutton', { name: 'Lane switch threshold' }).fill('20');
    const tuned = await page.evaluate(() => {
      const { session, input } = window.__paddleTrial;
      input.setControllerState({ buttons: new Set(), paddleL: 0, paddleR: 50 });
      session.step(30);
      return { mode: session.tuning.get('cadenza.paddleMode'), curve: session.tuning.get('cadenza.paddleCurve'), deadzone: session.tuning.get('cadenza.paddleDeadzone'), threshold: session.tuning.get('cadenza.paddleSwitchThreshold'), lane: session.sim.snapshot().x, resumes: window.__paddleTrial.resumes };
    });
    assert.deepEqual(tuned, { mode: 'stepped', curve: 'quadratic', deadzone: 0, threshold: 20, lane: 1, resumes: 0 });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForTimeout(150); // allow the parent menu's input subscription to mount
    // Actual menu input delivery (same path as the controller) reopens the focused action.
    await page.evaluate(async () => { const { deliverMenuPresses } = await import('/src/shell/menuInput.ts'); deliverMenuPresses(new Set(['a'])); });
    await page.getByRole('heading', { name: 'Paddle steering' }).waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole('spinbutton', { name: 'Paddle deadzone' }).inputValue(), '0');
    // Move focus to Resume with the controller; it must scroll into view in short landscape.
    for (const button of ['down', 'down', 'down', 'down', 'right']) {
      await page.evaluate(async button => { const { deliverMenuPresses } = await import('/src/shell/menuInput.ts'); deliverMenuPresses(new Set([button])); }, button);
      await page.waitForTimeout(40);
    }
    const resume = page.getByRole('button', { name: 'Resume' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `out/cadenza-paddles/${width}x${height}-resume.png` });
    const resumeBounds = await resume.boundingBox();
    assert(resumeBounds.y >= 0 && resumeBounds.y + resumeBounds.height <= height);
    await page.evaluate(async () => { const { deliverMenuPresses } = await import('/src/shell/menuInput.ts'); deliverMenuPresses(new Set(['a'])); });
    await page.locator('.paddle-settings').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__paddleTrial.resumes), 1);
    // Construct the rider's next session using persisted browser storage.
    const saved = await page.evaluate(async () => {
      const { TuningRegistry } = await import('/src/core/tuning.ts');
      const t = new TuningRegistry({ profileId: 'paddle-smoke' }).scoped('cadenza');
      return [t.choice('paddleMode', 'continuous', ['stepped', 'continuous'])(), t.choice('paddleCurve', 'linear', ['linear', 'quadratic'])(), t.num('paddleDeadzone', 15, 0, 60, 1)(), t.num('paddleSwitchThreshold', 30, 5, 90, 1)()];
    });
    assert.deepEqual(saved, ['stepped', 'quadratic', 0, 20]);
    results.push({ width, height, tuned, saved });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
