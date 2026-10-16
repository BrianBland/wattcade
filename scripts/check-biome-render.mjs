import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5199';
const out = 'artifacts/overworld/remastered'; mkdirSync(out, { recursive: true });
const ids = ['countryside', 'seaside', 'underwater', 'jungle', 'desert', 'volcano', 'snow', 'moon'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1228, height: 900 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { performance.now = () => 10000; });
  let transitions = 0;
  for (const viewport of [{ width: 1228, height: 900 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(viewport);
    for (const artMode of ['rich', 'legacy']) for (const hour of [15, 21]) {
      await page.goto(`${base}/dev/biomes.html?hour=${hour}&art=${artMode}&manual=1`); await page.waitForFunction(() => window.__biomeReady);
      for (const id of ids) for (const mix of [0, .01, .25, .49, .5, .51, .75, .99, 1]) {
        await page.evaluate(([id, mix]) => window.__biomeRender(id, mix), [id, mix]);
        const opaque = await page.locator('#scene canvas').evaluate(c => {
          const g = c.getContext('2d'), data = g.getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
          return true;
        });
        if (!opaque) throw Error(`Transparent gap in ${id} transition ${mix}, hour ${hour}`);
        transitions++;
        if (artMode === 'rich' && viewport.width === 1228 && hour === 15 && mix === .5) {
          await page.locator('#scene').screenshot({ path: `${out}/transition-${id}.png` });
        }
      }
      await page.evaluate(() => window.__biomeRender('driveIn'));
      if (artMode === 'rich' && viewport.width === 820 && hour === 15) await page.locator('#scene').screenshot({ path: `${out}/driveIn-portrait.png` });
    }
  }
  await page.locator('#art').selectOption('rich');
  // Test motion between pixel boundaries, where nearest-neighbor/snapped art previously stalled.
  const motion = await page.evaluate(async () => {
    const { prop, backdrop, loadSceneArt } = await import('/src/games/warmup/render/remastered/art.ts');
    const { LOOKS } = await import('/src/games/warmup/render/remastered/biomes.ts');
    await loadSceneArt();
    const c = document.createElement('canvas'); c.width = c.height = 384;
    const g = c.getContext('2d');
    let spriteCases = 0, maxCentroidError = 0;
    for (const name of ['oak', 'slenderOak', 'farmhouse', 'barn', 'jungleTree', 'palm']) for (const flip of [false, true]) {
      let origin;
      const frames = new Set();
      for (let i = 0; i < 16; i++) {
        g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 192, 192);
        prop(g, name, 96 + i / 32, 150, 60, flip);
        const pixels = g.getImageData(0, 0, 384, 384).data;
        let mass = 0, moment = 0;
        for (let j = 3; j < pixels.length; j += 4) { mass += pixels[j]; moment += pixels[j] * (Math.floor(j / 4) % 384); }
        const centre = moment / mass;
        origin ??= centre;
        maxCentroidError = Math.max(maxCentroidError, Math.abs(centre - origin - i / 16));
        frames.add(c.toDataURL()); spriteCases++;
      }
      if (frames.size !== 16) throw Error(`${name}: subpixel movement stalls`);
    }
    if (maxCentroidError > .04) throw Error(`Sprite centroid jumps: ${maxCentroidError}`);
    const panoramas = new Set();
    for (let i = 0; i < 16; i++) {
      g.clearRect(0, 0, 192, 192); backdrop(g, 'countryside', 192, 150, 70 + i / 32, 100);
      panoramas.add(c.toDataURL());
    }
    if (panoramas.size !== 16) throw Error('Distant scenery subpixel movement stalls');
    // Check actual scene placement: a stationary tree must move only with parallax, never snap or bob.
    const original = LOOKS.countryside.midProp, placements = [];
    LOOKS.countryside.midProp = (g, h, x, y, t) => { placements.push({h, x, y}); original(g, h, x, y, t); };
    try {
      window.__biomeRender('countryside', 0, 600); const first = placements.splice(0);
      window.__biomeRender('countryside', 0, 600.02);
      const fixed = first.find(p => p.x > 90 && p.x < 150);
      const moved = placements.find(p => p.h === fixed.h);
      if (Math.abs(moved.x - fixed.x + .09) > 1e-8 || moved.y !== fixed.y) throw Error('World scenery snapped or bobbed while riding');
    } finally { LOOKS.countryside.midProp = original; }
    return { spriteCases, maxCentroidError: +maxCentroidError.toFixed(4), panoramaFrames: panoramas.size, worldPlacement: 'passed' };
  });
  const props = await page.evaluate(async () => {
    const { LOOKS } = await import('/src/games/warmup/render/remastered/biomes.ts');
    const { DRIVE_IN } = await import('/src/games/warmup/render/remastered/driveIn.ts');
    const { LOOKS: CLASSIC_LOOKS } = await import('/src/games/warmup/render/classic/biomes.ts');
    const { DRIVE_IN: CLASSIC_DRIVE_IN } = await import('/src/games/warmup/render/classic/driveIn.ts');
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    let cases = 0;
    for (const look of [...Object.values(LOOKS), DRIVE_IN, ...Object.values(CLASSIC_LOOKS), CLASSIC_DRIVE_IN]) for (let k = 0; k < 64; k++) {
      const h = k / 64;
      for (const t of [0, 1.5, 20]) {
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 128, 128);
        look.midProp(g, h, 64, 100, t); look.foreProp(g, h, 40, 115);
        const m = g.getTransform();
        if (m.a !== 1 || m.b || m.c || m.d !== 1 || m.e || m.f || g.globalAlpha !== 1) throw Error('Prop leaked drawing state');
        cases++;
      }
    }
    // Repeat an isolated seeded tree/rock prop: pattern and geometry must not redraw randomly.
    const stable = [];
    for (let i = 0; i < 2; i++) {
      g.clearRect(0, 0, 128, 128); LOOKS.countryside.midProp(g, .2, 64, 100, 3); stable.push(c.toDataURL());
    }
    if (stable[0] !== stable[1]) throw Error('Static scenery changes between identical draws');
    return cases;
  });
  await page.setViewportSize({ width: 1228, height: 900 });
  await page.goto(`${base}/dev/biomes.html?hour=15&manual=1`); await page.waitForFunction(() => window.__biomeReady);
  const legacyPage = await browser.newPage({ viewport: { width: 1228, height: 900 }, deviceScaleFactor: 2 });
  await legacyPage.addInitScript(() => { performance.now = () => 10000; });
  legacyPage.on('pageerror', e => errors.push(e.message));
  let atlasRequests = 0;
  legacyPage.on('request', r => { if (new URL(r.url()).pathname.startsWith('/overworld/')) atlasRequests++; });
  await legacyPage.goto(`${base}/dev/biomes.html?hour=15&art=legacy&manual=1`);
  await legacyPage.waitForFunction(() => window.__biomeReady);
  const legacyBefore = await legacyPage.locator('#scene canvas').evaluate(c => c.toDataURL());
  if (atlasRequests) throw Error('Legacy mode requested rich art');
  await legacyPage.evaluate(async () => { const { loadSceneArt } = await import('/src/games/warmup/render/remastered/art.ts'); await loadSceneArt(); window.__biomeRender('countryside'); });
  const legacyAfter = await legacyPage.locator('#scene canvas').evaluate(c => c.toDataURL());
  if (legacyBefore !== legacyAfter) throw Error('Loaded rich atlases changed legacy art');
  await legacyPage.locator('#art').selectOption('rich');
  const richFrame = await legacyPage.locator('#scene canvas').evaluate(c => c.toDataURL());
  if (richFrame === legacyAfter) throw Error('Changing art mode had no visual effect');
  await legacyPage.locator('#art').selectOption('legacy');
  if (await legacyPage.locator('#scene canvas').evaluate(c => c.toDataURL()) !== legacyBefore) throw Error('Returning to legacy changed the scene');
  await legacyPage.close();
  // Use a second page with a real performance clock, avoiding the frozen capture clock.
  const timingPage = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
  timingPage.on('pageerror', e => errors.push(e.message));
  await timingPage.goto(`${base}/dev/biomes.html?hour=15&manual=1`); await timingPage.waitForFunction(() => window.__biomeReady);
  const timing = await timingPage.evaluate(async ids => {
    const result = {};
    for (const id of [...ids, 'driveIn']) {
      const samples = [];
      for (let i = 0; i < 40; i++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now(); window.__biomeRender(id, .5);
        if (i >= 10) samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      result[id] = { medianMs: +samples[Math.floor(samples.length * .5)].toFixed(2), p95Ms: +samples[Math.floor(samples.length * .95)].toFixed(2) };
    }
    return result;
  }, ids);
  // Missing artwork must leave the real renderer usable, without a blank canvas or rejected mount.
  const fallbackPage = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  fallbackPage.on('pageerror', e => errors.push(e.message));
  await fallbackPage.route('**/overworld/remastered/*.png', route => route.abort());
  await fallbackPage.route('**/dev/biomes.html?fallback=1', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0"><div id="scene" style="width:1180px;height:820px"></div><script type="module">
      import { WarmupRenderer } from '/src/games/warmup/render/renderer.ts';
      import { sceneArtReady } from '/src/games/warmup/render/remastered/art.ts';
      import { createGameSession, NullInput, testProfile } from '/src/core/index.ts';
      import { module as game } from '/src/games/warmup/index.ts';
      const profile = testProfile(), session = createGameSession({ game, profile, input: new NullInput(), fake: {script:'z2'}, seed:1 });
      session.step(30); const r = new WarmupRenderer(); r.mount(document.querySelector('#scene'), {profile});
      setTimeout(() => { r.render(session.sim.snapshot(), session.bikeStore.get(), session.ctx.input()); window.__fallbackReady = !sceneArtReady(); }, 250);
    </script></body></html>`,
  }));
  await fallbackPage.goto(`${base}/dev/biomes.html?fallback=1`);
  await fallbackPage.waitForFunction(() => window.__fallbackReady);
  const fallbackOpaque = await fallbackPage.locator('#scene canvas').evaluate(c => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
    return true;
  });
  if (!fallbackOpaque) throw Error('Artwork failure left the game canvas transparent');
  if (errors.length) throw Error(errors.join('\n'));
  const result = { artModes: ['legacy', 'rich'], classicAssetIndependence: 'passed', modeSwitch: 'passed', subpixelMotion: motion, transitions, propCases: props, seededProps: 'stable', failedAssetFallback: 'passed', pageErrors: errors.length, timing };
  writeFileSync(`${out}/validation.json`, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} finally { await browser.close(); }
