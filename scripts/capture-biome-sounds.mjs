const reviewUrl = process.env.REVIEW_URL ?? 'http://127.0.0.1:5199';
// Audition the actual WebAudio voices at their configured soundscape levels.
// This short review sampler intentionally brings infrequent calls closer together.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = process.argv[2] ?? '/tmp/wattcade-biomes';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.goto(`${reviewUrl}/dev/biome-review.html?manual=1`);
  const encoded = await page.evaluate(async () => {
    const { play, unlockAudio, audioOut, setSoundEnabled } = await import('/src/audio/sfx.ts');
    const { SOUNDSCAPE } = await import('/src/games/warmup/render/soundscape.ts');
    setSoundEnabled(true); unlockAudio();
    const audio = audioOut(); if (!audio) throw new Error('Audio graph unavailable');
    await audio.ctx.resume();
    const destination = audio.ctx.createMediaStreamDestination(); audio.out.connect(destination);
    const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks = [];
    const done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = resolve; });
    recorder.start();
    for (const [at, biome, name] of [[0.1, 'autumn', 'songbird'], [1.3, 'autumn', 'windGust'], [2.1, 'marsh', 'croak'], [3, 'marsh', 'plop'], [3.8, 'market', 'bell'], [4.7, 'sky', 'whale'], [6.8, 'sky', 'birdChirp']]) {
      setTimeout(() => {
        const v = SOUNDSCAPE[biome].find(v => v.sfx === name);
        play(v.sfx, { vol: v.vol, pitch: v.pitch ? (v.pitch[0] + v.pitch[1]) / 2 : 1 });
      }, at * 1000);
    }
    await new Promise(resolve => setTimeout(resolve, 8100)); recorder.stop(); await done;
    const bytes = new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
    audio.out.disconnect(destination);
    let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary);
  });
  writeFileSync(`${out}/B-sounds.webm`, Buffer.from(encoded, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/B-sounds.webm`, '-c:a', 'aac', '-b:a', '128k', `${out}/B-sounds.m4a`]);
  console.log('Captured actual bird, frog, splash, bell, wind and sky-whale voices as a standalone sound sampler.');
} finally { await browser.close(); }
