import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/visual-polish/wardrobe/implemented';
const url = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const slot of ['featured', 'bottoms']) {
    await page.goto(`${url}/dev/wardrobe-catalog.html?slot=${slot}`);
    await page.waitForFunction(() => window.__catalogReady);
    await page.locator('#board').screenshot({ path: `${out}/${slot}.png` });
    if (slot === 'featured') {
      const png = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 736; c.height = 608;
        c.getContext('2d').drawImage(document.querySelector('#board'), 400, 102, 368, 304, 0, 0, 736, 608);
        return c.toDataURL().split(',')[1];
      });
      writeFileSync(`${out}/censored-blocks.png`, Buffer.from(png, 'base64'));
    }
  }
  const { png, ...checks } = await page.evaluate(async () => {
    const { drawCensor } = await import('/src/cosmetics/draw/censor.ts');
    const { drawRider } = await import('/src/cosmetics/draw/rider.ts');
    const { drawCosmeticItem } = await import('/src/cosmetics/draw/items.ts');
    const { BIKES } = await import('/src/cosmetics/draw/bikes.ts');
    const { ITEMS } = await import('/src/cosmetics/catalog.ts');
    const { riderLook, withItem } = await import('/src/cosmetics/unlocks.ts');
    const item = ITEMS.find(i => i.id === 'w_censored_blocks');
    const look = withItem(riderLook({ color: '#27bcb8', level: 1, achievements: [] }), item);
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d', { willReadFrequently: true });
    const pixel = (x, y) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    const check = (value, message) => { if (!value) throw new Error(message); };
    let backgrounds = 0, transforms = 0, poses = 0;
    // A real scene sample changes with the underlying colors and retains alpha.
    for (const color of ['#0033ff', '#ff2200', '#00ee33']) {
      g.resetTransform(); g.clearRect(0, 0, 400, 300); g.fillStyle = color; g.fillRect(0, 0, 400, 300);
      g.translate(200, 120); g.scale(12, 12);
      drawCensor(g, [0, 0], 1.2);
      const got = pixel(200, 140), expected = color.match(/\w\w/g).map(ch => parseInt(ch, 16));
      check(got[3] === 255 && expected.every((n, i) => Math.abs(n - got[i]) < 11), 'Censor did not sample the scene');
      backgrounds++;
    }
    g.resetTransform(); g.clearRect(0, 0, 400, 300); g.globalAlpha = .4;
    g.fillStyle = '#2288bb'; g.fillRect(0, 0, 400, 300); g.translate(180, 140); g.scale(12, 12);
    drawCensor(g, [0, 0], 1);
    check(Math.abs(pixel(180, 140)[3] - 102) <= 1 && g.globalAlpha === .4, 'Caller alpha applied twice');
    g.globalAlpha = 1;
    // Coarsen actual high-frequency scenery, including rotated and reflected cameras.
    for (const [angle, mirror] of [[0, 1], [.3, 1], [-.2, -1]]) {
      g.resetTransform(); g.clearRect(0, 0, 400, 300);
      for (let x = 0; x < 400; x++) { g.fillStyle = x % 2 ? '#aacc22' : '#2244cc'; g.fillRect(x, 0, 1, 300); }
      const untouched = pixel(4, 4);
      g.translate(180, 140); g.rotate(angle); g.scale(12 * mirror, 10);
      g.globalAlpha = .6; g.imageSmoothingEnabled = true;
      const before = g.getTransform().toString();
      drawCensor(g, [0, 0], .3);
      check(before === g.getTransform().toString() && g.globalAlpha === .6 && g.imageSmoothingEnabled, 'Caller state changed');
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
        const at = (dx, dy) => {
          const p = g.getTransform().transformPoint({ x: -3.5 + (col + .5) * 1.4 + dx, y: -1 + (row + .5) * 1.4 + dy });
          return pixel(p.x, p.y);
        };
        check(at(0, 0).join() === at(.2, .2).join(), 'Block still contains sharp background detail');
      }
      check(pixel(4, 4).join() === untouched.join(), 'Effect escaped its region');
      transforms++;
    }
    // Clipping and transparent preview canvases must survive the replacement pass.
    g.resetTransform(); g.globalAlpha = 1; g.clearRect(0, 0, 400, 300);
    g.fillStyle = '#37a8bb'; g.fillRect(160, 130, 30, 20);
    g.save(); g.beginPath(); g.rect(160, 130, 30, 20); g.clip();
    g.translate(180, 140); g.scale(12, 12); drawCensor(g, [0, 0], 1); g.restore();
    check(pixel(155, 140)[3] === 0 && pixel(175, 140)[3] > 0, 'Clip or transparent background lost');
    g.resetTransform(); g.clearRect(0, 0, 400, 300); g.translate(180, 140); g.scale(12, 12);
    drawCensor(g, [0, 0], 1);
    check(pixel(175, 140)[3] === 0, 'Noise painted into an empty transparent scene');
    for (const bike of Object.keys(BIKES)) for (const phase of [0, .25, .5, .75]) {
      g.resetTransform(); g.clearRect(0, 0, 400, 300); g.translate(230, 210); g.scale(3, 3);
      g.globalAlpha = .7; g.imageSmoothingEnabled = true;
      const before = g.getTransform().toString();
      drawRider(g, { ...look, bike }, phase, 7.2, { t: 1.2, speed: 6 });
      check(before === g.getTransform().toString() && g.globalAlpha === .7 && g.imageSmoothingEnabled, 'Rider changed caller state');
      poses++;
    }
    const proof = document.createElement('canvas'); proof.width = 1200; proof.height = 850;
    const p = proof.getContext('2d'); p.fillStyle = '#eeeade'; p.fillRect(0, 0, 1200, 850);
    p.fillStyle = '#233342'; p.font = 'bold 27px system-ui'; p.fillText('CENSOR / ACTUAL SCENE PIXELATION', 28, 45);
    p.font = '16px system-ui'; p.fillText('Bare cartoon body underneath · bike and scenery sampled together · same item on every panel', 28, 75);
    const labels = ['Bright scene / road bike', 'Night scene / cruiser', 'Tilted and mirrored camera / BMX', 'Shelf preview / background through the blocks'];
    for (let i = 0; i < 4; i++) {
      const x = 20 + i % 2 * 590, y = 105 + Math.floor(i / 2) * 365;
      p.save(); p.beginPath(); p.rect(x, y, 570, 340); p.clip();
      p.fillStyle = i === 1 ? '#18273c' : '#d7e4c0'; p.fillRect(x, y, 570, 340);
      for (let u = 0; u < 570; u += 5) {
        p.fillStyle = i === 1 ? '#40566e' : '#93b47d'; p.fillRect(x + u, y + 70, 2, 215);
      }
      p.fillStyle = i === 1 ? '#8190b0' : '#678a70'; p.fillRect(x, y + 255, 570, 85);
      p.translate(x + 285, y + 270);
      if (i === 2) { p.rotate(-.12); p.scale(-1, 1); }
      p.scale(i === 3 ? 12 : 7.5, i === 3 ? 12 : 7.5);
      if (i === 3) drawCosmeticItem(p, item, look, 1.2);
      else drawRider(p, { ...look, bike: ['road', 'cruiser', 'bmx'][i] }, .18, 7.2, { t: 1.2, speed: 6 });
      p.restore(); p.fillStyle = i === 1 ? '#eef2ff' : '#233342'; p.font = 'bold 17px system-ui'; p.fillText(labels[i], x + 16, y + 28);
    }
    return { backgrounds, transforms, poses, clipping: true, transparency: true, callerState: true, png: proof.toDataURL().split(',')[1] };
  });
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(`${out}/censor-scene-proof.png`, Buffer.from(png, 'base64'));
  writeFileSync(`${out}/censor-checks.json`, JSON.stringify(checks, null, 2) + '\n');
  console.log(JSON.stringify(checks));
} finally { await browser.close(); }
