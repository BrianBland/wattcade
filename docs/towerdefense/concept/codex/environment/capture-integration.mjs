// Run against towerdefense-concept-art's unmodified dev integration page.
// Usage: node capture-integration.mjs [http://127.0.0.1:5174]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');
const root = fileURLToPath(new URL('./proofs/current/', import.meta.url));
await mkdir(root, { recursive: true });
const base = process.argv[2] ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const captures = [];
  for (const [name, params] of [
    ['ipad-full-rim', 'panels=0&alien=1.25&bluetint=0.5&rim=0.45'],
    ['ipad-full-no-rim', 'panels=0&alien=1.25&bluetint=0.5&rim=0'],
    ['ipad-panels-rim', 'panels=1&alien=1.25&bluetint=0.5&rim=0.45'],
  ]) {
    const url = `${base}/dev/td-integration.html?${params}`;
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true);
    await page.screenshot({ path: `${root}${name}.png` });
    captures.push({ file: `proofs/current/${name}.png`, url, viewport: [1366, 1024], deviceScaleFactor: 2, pixels: [2732, 2048] });
  }
  await page.goto(`${base}/dev/td-integration.html?panels=0&alien=1.25&bluetint=0.5&rim=0.45`);
  await page.waitForFunction(() => window.__ready === true);
  const lateral = await page.evaluate(async () => {
    const { loadRig, SPECS, place } = await import('/dev/td-rig.ts');
    const { KINDS } = await import('/src/games/towerdefense/sim/defs.ts');
    const m = await (await fetch('/td/environment/map-layout.json')).json();
    const bg = new Image(); bg.src = '/td/environment/background.webp'; await bg.decode();
    const rig = await loadRig(SPECS.find(s => s.id === 'warrior'));
    const cv = document.getElementById('c'), g = cv.getContext('2d');
    const k = 8.84, fx = 241, fy = 10, dpr = 2, px = KINDS.brute.radius * 2.6 * k * 1.25;
    const bez = (c, t) => c[0].map((_, i) => (1-t)**3*c[0][i]+3*(1-t)**2*t*c[1][i]+3*(1-t)*t*t*c[2][i]+t**3*c[3][i]);
    const at = (li, u, lat) => {
      const c = m.lanes[li].controls, p = bez(c, u), a = bez(c, u-.0001), b = bez(c, u+.0001);
      const heading = Math.atan2(b[1]-a[1], b[0]-a[0]);
      return { p: [p[0]-Math.sin(heading)*lat, p[1]+Math.cos(heading)*lat], heading };
    };
    const distance = (p, curve) => {
      let best = Infinity;
      for (let i=1; i<curve.length; i++) {
        const a=curve[i-1], b=curve[i], dx=b[0]-a[0],dy=b[1]-a[1];
        const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
        best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));
      }
      return best;
    };
    const texture = document.createElement('canvas'); texture.width=bg.width; texture.height=bg.height;
    const tg=texture.getContext('2d');tg.drawImage(bg,0,0);const rgb=tg.getImageData(0,0,bg.width,bg.height).data;
    const solid = document.createElement('canvas'); solid.width=256;solid.height=256;
    const sg=solid.getContext('2d',{willReadFrequently:true});
    let maxDistance=0, checkedPixels=0, outsideFloor=0, nonDirtPixels=0; const cases=[];
    for(let li=0;li<3;li++) for(const lat of [-2.25,2.25]) {
      let worst=0, outside=0, count=0, nonDirt=0;
      for(const u of [.25,.4,.55,.7]) {
        const {p,heading}=at(li,u,lat);
        const curve=Array.from({length:101},(_,i)=>bez(m.lanes[li].controls,u-.13+i*.0026));
        for(let phase=0;phase<16;phase++) {
          sg.setTransform(1,0,0,1,0,0);sg.clearRect(0,0,256,256);
          sg.scale(dpr,dpr);
          place(sg,rig,64,64,heading,px,{t:phase/(16*rig.spec.gaitHz)});
          const a=sg.getImageData(0,0,256,256).data;
          for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
            const j=(y*256+x)*4;
            // Exclude faint glow, soft shadow, and antialiased fringe; retain solid legs/body.
            if(a[j+3]<192) continue;
            const wp=[p[0]+(x/dpr-64)/k,p[1]+(y/dpr-64)/k];
            const dist=distance(wp,curve);worst=Math.max(worst,dist);count++;
            if(dist>6.5)outside++;
            const bx=Math.round(318+wp[0]*9),by=Math.round(32+wp[1]*9),bi=(by*bg.width+bx)*4;
            if(!(rgb[bi]>rgb[bi+1]*1.14 && rgb[bi+1]>rgb[bi+2]*1.08))nonDirt++;
          }
        }
      }
      maxDistance=Math.max(maxDistance,worst);checkedPixels+=count;outsideFloor+=outside;nonDirtPixels+=nonDirt;
      cases.push({lane:li,lateralOffset:lat,poses:64,solidPixels:count,maxCentrelineDistance:worst,outside13UnitFloor:outside,nonWarmFloorPixels:nonDirt});
    }
    // Six actual walking puppets on the exported painting, two per lane at the extremes.
    g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#1b1814';g.fillRect(0,0,1366,1024);
    const scale=884/900;g.drawImage(bg,fx-318*scale,fy-32*scale,bg.width*scale,bg.height*scale);
    for(let li=0;li<3;li++) for(const [lat,u,t] of [[-2.25,.38,.19],[2.25,.61,.43]]) {
      const {p,heading}=at(li,u,lat);
      place(g,rig,fx+p[0]*k,fy+p[1]*k,heading,px,{t},{rim:.45,rimPx:1});
      g.fillStyle='#e5d9c9';g.font='600 12px system-ui';
      g.fillText(`L${li+1} ${lat>0?'+':''}${lat}`,fx+p[0]*k+48,fy+p[1]*k);
    }
    g.fillStyle='rgba(8,10,14,.92)';g.fillRect(0,904,1366,120);
    g.fillStyle='#e8ded0';g.font='600 16px system-ui';
    g.fillText('Real Warrior rigs · 78px body length · maximum lateral offsets ±2.25 units · floor width 13',16,935);
    g.font='14px system-ui';g.fillText(`384 gait poses measured · solid legs/body max distance ${maxDistance.toFixed(3)} / 6.5 units · outside floor ${outsideFloor} pixels`,16,960);
    return {rig:'warrior-parts',sizeFrom:'KINDS.brute.radius × 2.6 × 1.25',bodyLengthCssPixels:px,
      phaseSamples:16,parameterSamples:[.25,.4,.55,.7],poses:384,alphaThreshold:192,
      excludes:'faint glow, shadow and antialias fringe',maxCentrelineDistance:maxDistance,
      minimumFloorMargin:6.5-maxDistance,checkedPixels,outsideFloor,nonDirtPixels,cases};
  });
  await page.screenshot({ path: `${root}warrior-max-offset.png` });
  const assetHashes = await page.evaluate(async () => {
    const result = {};
    for (const path of ['/td/environment/background.webp','/td/environment/map-layout.json',
      '/td/towers/tesla/manifest.json','/td/towers/mortar/manifest.json','/td/towers/prism/manifest.json','/td/outpost/manifest.json']) {
      const bytes=await (await fetch(path)).arrayBuffer();
      result[path]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    }
    return result;
  });
  await writeFile(`${root}integration-validation.json`,JSON.stringify({captures,lateral,assetHashes,errors},null,2)+'\n');
  console.log(JSON.stringify({captures:captures.length,errors,lateral}));
  if(errors.length || lateral.outsideFloor || lateral.nonDirtPixels) process.exitCode=1;
} finally { await browser.close(); }
