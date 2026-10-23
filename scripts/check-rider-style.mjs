const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
// Real Canvas validation and review stills. Requires local Vite on port 5199.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? '/tmp/wattcade-player';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${reviewUrl}/dev/capture.html?game=warmup&manual=1&hour=14`);
  await page.waitForFunction(() => window.__advance);
  const summary = await page.evaluate(async () => {
    const { drawRider } = await import('/src/cosmetics/draw/rider.ts');
    const { riderLook, withItem } = await import('/src/cosmetics/unlocks.ts');
    const { itemsIn, item: currentItem } = await import('/src/cosmetics/catalog.ts');
    const { ORIGINAL_ITEMS } = await import('/src/cosmetics/legacyCatalog.ts');
    // Historical art comparisons are separate from the playable catalog.
    const item = (slot, id) => currentItem(slot, id) ?? ORIGINAL_ITEMS.find(it => it.slot === slot && it.id === id);
    const base = riderLook({ color: '#27bcb8', level: 50, achievements: [] });
    const c = document.createElement('canvas'); c.width = 360; c.height = 180;
    const g = c.getContext('2d', { willReadFrequently: true });
    let frames = 0;
    const check = (look, gear, crank, speed = 8, trailer = false) => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
      g.setTransform(2, 0, 0, 2, 240, 120); g.globalAlpha = 0.7; g.imageSmoothingEnabled = true;
      drawRider(g, look, crank, crank * 10, { t: crank * 2, speed, gear, trailer });
      const m = g.getTransform();
      if (m.a !== 2 || m.e !== 240 || g.globalAlpha !== 0.7 || !g.imageSmoothingEnabled) throw new Error('Rider changed caller canvas state');
      const pixels = g.getImageData(0, 0, c.width, c.height).data;
      let count = 0, top = c.height, bottom = 0, left = c.width, right = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (pixels[(y * c.width + x) * 4 + 3] < 24) continue;
        count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (count < 100) throw new Error(`Empty rider: ${look.bike}/${look.hat}`);
      if (left <= 20 || right >= 327 || top <= 12 || bottom >= 155) throw new Error(`Clipped sprite: ${look.bike}/${look.hat}/${look.trail}/${gear} (${left},${top},${right},${bottom})`);
      frames++;
    };
    for (const bike of itemsIn('bike')) for (const gear of [null, 'bubble', 'scuba']) for (let phase = 0; phase < 8; phase++) {
      // Tall hat on every posture, including tandem, recumbent and runners.
      check(withItem(withItem(base, bike), item('hat', 'wizard')), gear, phase / 8);
    }
    for (const slot of ['hat', 'jersey', 'pet', 'trail', 'paint']) for (const it of itemsIn(slot)) {
      for (const gear of [null, 'bubble', 'scuba']) check(withItem(base, it), gear, 0.22);
    }
    for (const bike of ['tandem', 'tallbike', 'cargo']) for (const trail of itemsIn('trail')) {
      check(withItem(withItem(base, item('bike', bike)), trail), 'bubble', 0.5, 22, true);
    }
    // Base art is a true cutout, not a magnified antialiased silhouette.
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.setTransform(2, 0, 0, 2, 240, 120); g.globalAlpha = 1;
    drawRider(g, base, 0.22, 2, { t: 1, speed: 6 });
    const solid = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < solid.length; i += 4) if (solid[i] !== 0 && solid[i] !== 255) throw new Error('Soft antialias coverage on solid rider');
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1000;
    document.body.replaceChildren(canvas);
    const p = canvas.getContext('2d');
    p.fillStyle = '#f4f0e5'; p.fillRect(0, 0, 1200, 1000);
    p.fillStyle = '#182132'; p.font = 'bold 28px sans-serif'; p.fillText('R2 / REVISED CLUB RIDER', 36, 46);
    p.font = '17px sans-serif'; p.fillText('Real shared renderer · flat shapes · one pixel grid · existing cosmetics', 36, 75);
    const looks = [base, withItem(base, item('jersey', 'polka')),
      withItem(withItem(base, item('jersey', 'stars')), item('hat', 'wizard')),
      withItem(withItem(base, item('jersey', 'cape')), item('bike', 'cruiser'))];
    const labels = ['Club', 'Polka Dots', 'Starry Night + Wizard', 'Superhero + Cruiser'];
    for (let i = 0; i < looks.length; i++) {
      const x = 150 + i * 300;
      p.save(); p.translate(x, 305); p.scale(7, 7); drawRider(p, looks[i], 0.22, 2, { t: 1, speed: 6 }); p.restore();
      p.fillStyle = '#182132'; p.font = '18px sans-serif'; p.textAlign = 'center'; p.fillText(labels[i], x, 337);
      // World scale, enlarged 3x just like the world's low-res buffer.
      const world = document.createElement('canvas'); world.width = 50; world.height = 42;
      const w = world.getContext('2d'); w.translate(25, 39); drawRider(w, looks[i], 0.22, 2, { t: 1, speed: 6 });
      p.imageSmoothingEnabled = false; p.drawImage(world, x - 75, 360, 150, 126);
    }
    p.textAlign = 'left'; p.fillStyle = '#182132'; p.font = '16px sans-serif'; p.fillText('Above: world buffer at 3×. Below: pose / gear checks from the same renderer.', 36, 512);
    p.fillStyle = '#171f2e'; p.fillRect(0, 540, 1200, 460);
    const poses = ['tandem', 'recumbent', 'tallbike', 'cargo'];
    for (let i = 0; i < poses.length; i++) {
      let look = withItem(base, item('bike', poses[i]));
      if (i === 2) look = withItem(look, item('hat', 'wizard'));
      if (i === 3) look = withItem(look, item('pet', 'corgi'));
      const x = 150 + i * 300;
      p.save(); p.translate(x, 865); p.scale(6, 6); drawRider(p, look, 0.35, 4, { t: 1, speed: 6, gear: i === 0 ? 'bubble' : i === 1 ? 'scuba' : null }); p.restore();
      p.fillStyle = '#f4f0e5'; p.font = '18px sans-serif'; p.textAlign = 'center'; p.fillText(item('bike', poses[i]).name, x, 905);
    }
    p.textAlign = 'left'; p.font = '16px sans-serif'; p.fillStyle = '#afc1d1'; p.fillText(`${frames} real Canvas frames checked: catalogue, pedal cycle, gear, trailer and caller state`, 36, 965);
    return { frames, bikes: itemsIn('bike').length };
  });
  if (errors.length) throw new Error(errors.join('\n'));
  await page.screenshot({ path: `${out}/rider-style-proof.png` });
  console.log(JSON.stringify(summary));
} finally { await browser.close(); }
