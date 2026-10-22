import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const base = process.env.DUNGEON_BASE ?? 'http://127.0.0.1:5173',
  out = '/tmp/dungeon-smoke';
await mkdir(out, {
  recursive: true
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox']
});
async function worldScale(page) {
  return page.evaluate(async () => {
    // Chromium can acknowledge/coalesce touch moves before delivering their pointer events to the page.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.querySelector('#app canvas'), proto = CanvasRenderingContext2D.prototype, original = proto.drawImage;
    let scale;
    proto.drawImage = function(image, ...args) {
      if (this.canvas === canvas && image instanceof HTMLCanvasElement && args.length === 4 && args[0] === 0 && args[1] === 0 && args[2] >= canvas.width && args[3] >= canvas.height) scale = args[2] / image.width;
      return original.call(this, image, ...args);
    };
    try { window.__dungeon.advance(0); return scale; } finally { proto.drawImage = original; }
  });
}
try {
  for (const [name, width, height, dpr] of [['landscape', 1280, 800, 1], ['ipad', 1024, 768, 2], ['portrait', 820, 1180, 2], ['phone', 390, 844, 1]]) {
    const page = await browser.newPage({
        viewport: {
          width,
          height
        },
        deviceScaleFactor: dpr
      }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/dev/dungeon.html?manual=1&view=live&sec=180&inset=100`);
    await page.waitForFunction(() => window.__dungeon);
    const result = await page.evaluate(() => {
      const timings = [];
      for (let n = 0; n < 120; n++) {
        const t = performance.now();
        window.__dungeon.advance(1 / 30);
        timings.push(performance.now() - t);
      }
      const c = document.querySelector('#app canvas'),
        hud = window.__dgHud,
        ratio = c.width / c.clientWidth;
      return {
        timings: timings.sort((a, b) => a - b),
        hud,
        ratio,
        phase: window.__dungeon.snapshot().phase
      };
    });
    assert.equal(result.phase, 'run');
    assert.equal(result.ratio, dpr);
    const fractional = await page.evaluate(() => {
      const before = window.__dungeon.snapshot().t;
      for (let i = 0; i < 120; i++) window.__dungeon.advance(1 / 120);
      return window.__dungeon.snapshot().t - before;
    });
    assert.ok(fractional > 0.8 && fractional <= 1.01, 'fractional preview frames accumulate into fixed simulation steps');
    const framing = await page.evaluate(() => {
      const snapshot = structuredClone(window.__dungeon.snapshot()), room = snapshot.world.rooms[snapshot.room];
      const boss = snapshot.boss, enemy = snapshot.enemies.find(e => e.kind === 'boss');
      if (!boss || !enemy) throw new Error('camera fixture needs the seeded boss encounter');
      snapshot.cues = []; snapshot.fx = []; snapshot.toasts = [];
      snapshot.ai.path = []; snapshot.boss = null;
      snapshot.enemies = snapshot.enemies.filter(e => e.kind !== 'boss');
      snapshot.player.x = room.x0 + 4; snapshot.player.y = room.y0 + 3;
      const canvas = document.querySelector('#app canvas'), frames = [], translations = new Map();
      const proto = CanvasRenderingContext2D.prototype, drawImage = proto.drawImage, translate = proto.translate;
      // Inspect actual world composites and camera transforms, rather than a reported zoom setting.
      proto.translate = function(x, y) {
        if (!translations.has(this.canvas)) translations.set(this.canvas, { x, y });
        return translate.call(this, x, y);
      };
      proto.drawImage = function(image, ...args) {
        if (this.canvas === canvas && image instanceof HTMLCanvasElement && args.length === 4 &&
            args[0] === 0 && args[1] === 0 && args[2] >= canvas.width && args[3] >= canvas.height) {
          frames.push({ scale: args[2] / image.width, cameraX: translations.get(image)?.x });
        }
        return drawImage.call(this, image, ...args);
      };
      const render = (paddleL = 0, paddleR = 0) => {
        translations.clear(); snapshot.t += 1 / 60;
        window.__dungeon.renderSnapshot(snapshot, { paddleL, paddleR });
      };
      try {
        for (const [w, h, isBoss] of [[9, 7, false], [21, 7, false], [9, 15, false], [9, 7, true]]) {
          room.w = w; room.h = h; room.boss = isBoss; render();
        }
        room.boss = false;
        snapshot.boss = { ...boss, active: true };
        snapshot.enemies.push({ ...enemy, x: snapshot.player.x + 20, y: snapshot.player.y });
        render(); // A distant boss used to trigger both zoom and the camera's distance snap.
        snapshot.boss = null; snapshot.enemies = snapshot.enemies.filter(e => e.kind !== 'boss');
        render();
        const automatic = frames.splice(0);
        render(1, 0); render(1, 0); render(-1, 0); render(0, 0);
        render(0, 1); render(0, -1); render(0, 0);
        return { automatic, paddles: frames.splice(0) };
      } finally {
        proto.drawImage = drawImage; proto.translate = translate;
        window.__dungeon.advance(0);
      }
    });
    assert.equal(framing.automatic.length, 6, 'all room/boss transitions render a world composite');
    assert.equal(new Set(framing.automatic.map(f => f.scale)).size, 1, 'room size and boss start/end never change world zoom');
    const defaultScale = framing.automatic[0].scale, pulls = framing.paddles.map(f => f.scale);
    assert.ok(pulls[0] > defaultScale && pulls[4] > defaultScale, 'either paddle zooms in with positive deflection');
    assert.equal(pulls[1], pulls[0], 'holding a paddle does not repeat zoom');
    assert.equal(pulls[2], defaultScale, 'left paddle reverses to zoom out');
    assert.equal(pulls[5], defaultScale, 'right paddle reverses to zoom out');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const bounds = await page.locator('#app canvas').boundingBox(), cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
    const fingers = span => [{ id: 1, x: cx - span / 2, y: cy }, { id: 2, x: cx + span / 2, y: cy }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(80) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(160) });
    assert.ok(await worldScale(page) > defaultScale, 'spreading fingers zooms the game in');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(40) });
    assert.ok(await worldScale(page) < defaultScale, 'pinching fingers zooms the game out');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(80) });
    assert.equal(await worldScale(page), defaultScale, 'returning to the initial span restores the original zoom');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(80).slice(0, 1) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(160).slice(0, 1) });
    assert.equal(await worldScale(page), defaultScale, 'single-finger movement after cancellation cannot continue an old pinch');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => window.visualViewport.scale), 1, 'pinching zooms the game, not the browser page');
    await cdp.detach();
    const focusShift = Math.abs(framing.automatic[4].cameraX - framing.automatic[3].cameraX);
    assert.ok(focusShift > 0 && focusShift < 9 * 16, 'camera eases toward a distant boss instead of snapping to the midpoint');
    for (const [x, y, w, h] of result.hud.boxes) assert.ok(y + h <= result.hud.H - 100 * dpr + 1, 'foreground clears bottom HUD inset');
    await page.screenshot({
      path: `${out}/${name}.png`
    });
    assert.deepEqual(errors, []);
    console.log(`${name}: clean console, HUD inset clear, stable zoom, bidirectional paddles/pinch zoom and eased boss framing, median frame ${result.timings[60].toFixed(2)} ms`);
    await page.setViewportSize({
      width: height,
      height: width
    });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.evaluate(() => window.__dungeon.advance(1 / 30));
    const rotatedScale = await worldScale(page);
    if (name === 'phone') assert.equal(rotatedScale, defaultScale, 'phone portrait/landscape keep the same actor size');
    await page.screenshot({ path: `${out}/${name}-rotated.png` });
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.__dungeon.dispose());
    assert.equal(await page.locator('#app canvas').count(), 0);
    await page.close();
  }
  const p = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    }
  });
  await p.goto(`${base}/dev/dungeon.html?manual=1&view=armory&tier=1`);
  await p.waitForFunction(() => window.__dungeon);
  await p.screenshot({
    path: `${out}/armory.png`
  });
  await p.evaluate(() => window.__dungeon.select('terrain'));
  await p.screenshot({
    path: `${out}/terrain.png`
  });
  await p.evaluate(() => window.__dungeon.select('effects'));
  await p.screenshot({
    path: `${out}/effects.png`
  });
  const glyphAudit = await p.evaluate(async () => {
    const { fillText, pixelFont, textLayout } = await import('/src/games/dungeon/render/font.ts');
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const g = canvas.getContext('2d');
    g.font = pixelFont(20); g.fillStyle = '#fff';
    fillText(g, 'fgyjpq✓', 11.3, 31.2);
    const layout = textLayout('fgyjpq✓', 20, 11.3, 31.2), pixels = g.getImageData(0, 0, 256, 64).data;
    let ink = 0, descender = false;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) {
      const alpha = pixels[(y * 256 + x) * 4 + 3];
      if (alpha !== 0 && alpha !== 255) throw new Error('text has antialiased edges');
      if (alpha) {
        ink++;
        if (x < layout.x || x >= layout.x + layout.width || y < layout.y || y >= layout.y + 9 * layout.scale) throw new Error('glyph exceeds measured bounds');
        if (y >= layout.y + 7 * layout.scale) descender = true;
      }
    }
    return { ink, descender };
  });
  assert.ok(glyphAudit.ink > 0 && glyphAudit.descender, 'bitmap text has sharp edges, accurate bounds and complete descenders');
  const frames = out + '/frames';
  await mkdir(frames, {
    recursive: true
  });
  const hashes = [];
  for (let i = 0; i < 24; i++) {
    await p.evaluate(() => window.__dungeon.advance(1 / 12));
    hashes.push(await p.locator('#app canvas').evaluate(c => c.toDataURL()));
    await p.screenshot({
      path: `${frames}/f${String(i).padStart(2, '0')}.png`,
      clip: {
        x: 0,
        y: 64,
        width: 1440,
        height: 204
      }
    });
  }
  assert.ok(new Set(hashes).size >= 4, 'projectile animation changes rendered pixels');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', frames + '/f%02d.png', '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none', '-loop', '0', `${out}/projectiles.gif`]);
  await p.evaluate(() => window.__dungeon.select('type'));
  await p.screenshot({ path: `${out}/typography.png` });
  await p.evaluate(() => window.__dungeon.select('bosses'));
  await p.screenshot({
    path: `${out}/bosses.png`
  });
  await p.evaluate(() => window.__dungeon.select('live'));
  const boss = await p.evaluate(() => {
    for (let i = 0; i < 900; i++) {
      window.__dungeon.advance(1 / 3);
      const s = window.__dungeon.snapshot();
      if (s.boss?.active && s.boss.cycle === 'windup') return s.enemies.find(e => e.kind === 'boss');
    }
    return null;
  });
  assert.ok(boss?.tell > 0, 'actual boss wind-up reaches authored attack art');
  await p.screenshot({
    path: `${out}/gameplay.png`
  });
  await p.close();
  const camp = await browser.newPage({
    viewport: {
      width: 1024,
      height: 768
    }
  });
  const errors = [];
  camp.on('pageerror', e => errors.push(e.message));
  await camp.goto(`${base}/dev/capture.html?game=dungeon&manual=1&sec=0`);
  await camp.waitForFunction(() => window.__advance);
  await camp.evaluate(() => window.__advance(33));
  await camp.screenshot({
    path: `${out}/camp.png`
  });
  assert.deepEqual(errors, []);
  await camp.close();
  console.log('Armory, six bosses, live wind-up, typography and camp captured. Bitmap text edges/bounds verified.');
} finally {
  await browser.close();
}
