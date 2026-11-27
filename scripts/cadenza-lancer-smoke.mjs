// Lancer (band ship) smoke: band-shape shaders compile and stay finite (low highlight, flow post, reduced flash), and the
// band FX graph in a real (offline) AudioContext sums flat, ducks a band and adds flow without clicks.
// Run against npm run dev. Override CADENZA_TEST_URL / CHROMIUM_PATH as needed. CADENZA_SCREENSHOT=path saves a frame.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(`${process.env.CADENZA_TEST_URL ?? 'http://127.0.0.1:5173'}/dev/cadenza.html?script=z2&sec=44&autopilot=1&speed=0&ship=lancer`);
  await page.waitForTimeout(800);
  const sec = Number(process.env.CADENZA_SEC ?? 44);
  const results = await page.evaluate(async (sec) => {
    const { CadenzaRenderer } = await import('/src/games/cadenza/render/renderer.ts');
    const { createGameSession, NullInput, testProfile } = await import('/src/core/index.ts');
    const { module } = await import('/src/games/cadenza/index.ts');
    const { synthTimeline } = await import('/src/media/synth/queue.ts');
    const profile = testProfile({ achievements: ['cz_sets'], gameData: { cadenza: { ship: 'lancer' } } });
    const timeline = synthTimeline({ style: 'rock', songs: 1, seed: 1 });
    const session = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, media: { timeline }, simOpts: { difficulty: 'pro', autopilot: true } });
    session.step(sec * 30);
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;background:black'; document.body.append(host);
    const fx = [];
    const r = new CadenzaRenderer(); r.mount(host, { profile, musicFx: (f) => fx.push(f) });
    const snap = session.sim.snapshot(), bike = session.bikeStore.get(), input = session.ctx.input();
    let invalid = 0, checks = 0;
    const check = () => {
      r.post.render();
      const target = r.post.composer.renderTarget2, pixels = new Uint16Array(target.width * target.height * 4);
      r.renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
      for (const v of pixels) if ((v & 0x7c00) === 0x7c00) invalid++;
      checks++;
    };
    const variants = [
      { low: [false, false, false], flow: 0, reducedFlash: false },
      { low: [true, false, true], flow: 0, reducedFlash: false },
      { low: [false, false, false], flow: 1, reducedFlash: false, flowOn: true },
      { low: [true, true, true], flow: 1, reducedFlash: true, flowOn: true },
    ];
    for (const v of variants) for (const dp of [0, 0.2, 0.5]) {
      const s = { ...snap, p: snap.p + dp, reducedFlash: v.reducedFlash, bands: { ...snap.bands, low: v.low, flow: v.flow, flowOn: !!v.flowOn } };
      r.render(s, bike, input); check();
    }
    r.render({ ...snap, bands: { ...snap.bands, low: [true, false, false], flow: 0, flowOn: false } }, bike, input); r.post.render();
    const shapes = r.blocks.group.children.filter((c) => c.isInstancedMesh).map((m) => m.geometry.type);
    window.__smokeRenderer = r;

    // Band FX in a real AudioContext: white noise through the engine's master.
    const { MixEngine } = await import('/src/media/player/engine.ts');
    const render = async (setFx, hz = 0) => {
      const sr = 44100, ctx = new OfflineAudioContext(1, sr * 3, sr), engine = new MixEngine({ ctx, resolveUrl: async () => '' });
      const buf = ctx.createBuffer(1, sr * 3, sr), d = buf.getChannelData(0); let seed = 1;
      for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = hz ? 0.3 * Math.sin((2 * Math.PI * hz * i) / sr) : (seed / 2147483647 - 0.5) * 0.5; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(engine.master); src.start();
      setFx(engine, ctx);
      return (await ctx.startRendering()).getChannelData(0);
    };
    const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
    const dry = await render(() => {});
    const flat = await render((e) => e.setFx({ degrade: 0, bands: [1, 1, 1], flow: 0, beatS: 0.5 }));
    // an 80 Hz tone: ducking the lows to 0.18 (≈ −15 dB) takes it down; a 5 kHz tone is untouched by it
    const low = await render(() => {}, 80), lowDucked = await render((e) => e.setFx({ degrade: 0, bands: [0.18, 1, 1], flow: 0, beatS: 0.5 }), 80);
    const high = await render(() => {}, 5000), highDucked = await render((e) => e.setFx({ degrade: 0, bands: [0.18, 1, 1], flow: 0, beatS: 0.5 }), 5000);
    const ducked = lowDucked;
    const wet = await render((e) => e.setFx({ degrade: 0, bands: [1, 1, 1], flow: 1, beatS: 0.5 }));
    const A = 44100, B = 44100 * 3;
    let finite = true; for (const x of [flat, ducked, wet]) for (const v of x) if (!Number.isFinite(v)) { finite = false; break; }
    return { invalid, checks, shapes, fxCalls: fx.length, lastFx: fx.at(-1), audio: {
      flatDb: 20 * Math.log10(rms(flat, A, B) / rms(dry, A, B)), duckedDb: 20 * Math.log10(rms(lowDucked, A, B) / rms(low, A, B)),
      highUnderLowDuckDb: 20 * Math.log10(rms(highDucked, A, B) / rms(high, A, B)),
      wetDb: 20 * Math.log10(rms(wet, A, B) / rms(dry, A, B)), finite } };
  }, sec);
  if (process.env.CADENZA_SCREENSHOT) await page.screenshot({ path: process.env.CADENZA_SCREENSHOT });
  await page.evaluate(() => window.__smokeRenderer.unmount());
  console.log(JSON.stringify({ results, errors }, null, 1));
  const a = results.audio;
  if (errors.length || results.invalid || results.shapes.length !== 5 || !results.lastFx?.bands || Math.abs(a.flatDb) > 0.1 || a.duckedDb > -10 || Math.abs(a.highUnderLowDuckDb) > 0.3 || a.wetDb < 0.03 || !a.finite) process.exitCode = 1;
} finally { await browser.close(); }
