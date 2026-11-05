// Seaside sound checks (#197): renders each music cue offline to a WAV to listen to, then rides a few scenes in the real
// game with audio unlocked and checks the mix comes up without errors.
//   npx tsx scripts/seaside-sound-review.ts [--cue-s 40]
// WAVs go to $OUT (default /tmp/seaside-sound; never committed). CHROMIUM_PATH selects a local browser.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const flag = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CUE_S = flag('cue-s', 40);
const out = process.env.OUT ?? '/tmp/seaside-sound'; mkdirSync(out, { recursive: true });
const SCENES: Array<[string, number]> = [['highway', 0.2], ['pier', 0.3], ['belly', 0.4], ['drill1', 0.3], ['boardwalk', 0.5], ['bridge', 0.5], ['fan', 0.2], ['wings', 0.4], ['angel', 0.3]];
const server = await createServer({ server: { port: 5316, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors: string[] = [];
try {
  const page = await browser.newPage();
  await page.addInitScript('window.__name = (f) => f'); // tsx names the helpers inside evaluate()
  page.on('pageerror', (e) => errors.push(`cues: ${e.message}`));
  await page.goto(`${base}/dev/seaside-play.html?scene=title&speed=0`);
  for (const cue of ['title', 'bigOne', 'island', 'earth', 'liftoff']) {
    const b64 = await page.evaluate(async ([cue, secs]) => {
      const score = await import('/src/games/seaside/render/musicScore.ts' as string), music = await import('/src/games/seaside/render/music.ts' as string);
      const sr = 44100, c = new OfflineAudioContext(1, sr * (secs as number), sr), bus = c.createGain();
      bus.gain.setValueAtTime(0, 0); bus.gain.linearRampToValueAtTime(1, 3); bus.gain.setValueAtTime(1, (secs as number) - 4); bus.gain.linearRampToValueAtTime(0, (secs as number) - 0.1);
      bus.connect(c.destination);
      const spb = score.beatS(cue);
      for (let beat = 0, t = 0.1; t < (secs as number) - 1; beat++, t += spb) for (const n of score.cueNotes(cue, beat)) music.playNote(c, bus, n, t + (n.at ?? 0) * spb, spb);
      const pcm = (await c.startRendering()).getChannelData(0), wav = new DataView(new ArrayBuffer(44 + pcm.length * 2));
      const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); wav.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true);
      wav.setUint16(22, 1, true); wav.setUint32(24, sr, true); wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
      str(36, 'data'); wav.setUint32(40, pcm.length * 2, true);
      let peak = 0;
      for (let i = 0; i < pcm.length; i++) { peak = Math.max(peak, Math.abs(pcm[i])); wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true); }
      const bytes = new Uint8Array(wav.buffer); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { data: btoa(bin), peak };
    }, [cue, CUE_S] as const);
    writeFileSync(join(out, `cue-${cue}.wav`), Buffer.from(b64.data, 'base64'));
    console.log(`cue ${cue.padEnd(8)} peak ${b64.peak.toFixed(2)} → ${join(out, `cue-${cue}.wav`)}`);
    if (b64.peak < 0.02 || b64.peak > 1) errors.push(`cue ${cue}: peak ${b64.peak.toFixed(3)}`);
  }
  await page.close();
  for (const [scene, progress] of SCENES) {
    const p = await browser.newPage({ viewport: { width: 800, height: 600 } });
    p.on('pageerror', (e) => errors.push(`${scene}: ${e.message}`));
    await p.goto(`${base}/dev/seaside-play.html?scene=${scene}&progress=${progress}&speed=0&cash=150&creel=1`);
    await p.waitForFunction(() => (window as any).__session, null, { timeout: 120_000 });
    await p.mouse.click(400, 300);
    const live = await p.evaluate(async () => {
      const sfx = await import('/src/audio/sfx.ts' as string), voices = await import('/src/audio/voices.ts' as string);
      sfx.unlockAudio(); const w = window as any;
      for (let i = 0; i < 12; i++) { w.__session.step(10); await new Promise((r) => requestAnimationFrame(r)); }
      return { running: !!sfx.sfxGraph(), voices: voices.voiceCount() };
    });
    console.log(`${scene.padEnd(10)} audio ${live.running ? 'running' : 'OFF'} · ${live.voices} voices`);
    if (!live.running) errors.push(`${scene}: audio did not start`);
    await p.close();
  }
} finally { await browser.close(); await server.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
