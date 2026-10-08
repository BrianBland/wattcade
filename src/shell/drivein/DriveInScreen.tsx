import { useEffect, useRef, useState } from 'preact/hooks';
import { duckAmbient, play } from '../../audio/sfx';
import { channelById } from './channels';
import { easeRect, screenRect, type Rect } from './layout';
import { FRESH, onPlayEvent, retryDelayMs, START_TIMEOUT_MS, type PlayEvent, type PlayState } from './playback';
import { fillStatic } from './staticFx';
import { flipChannel, getDriveIn, setDriveInSound, skipBadChannel, subscribeDriveIn } from './store';
import { mountYouTube } from './youtube';
import { toast } from '../components/Toasts';

/** Called by the warm-up stage every frame (before it renders the canvas) so the DOM video and the canvas frame share one rect. */
export interface DriveInApi { tick(dt: number, W: number, H: number, insetBottom: number, blend: number): Rect | null }

const HLS = 'application/vnd.apple.mpegurl';
const supportsHls = () => typeof document !== 'undefined' && !!document.createElement('video').canPlayType(HLS);
const pad = (n: number) => String(n).padStart(2, '0');
/** The awake lobby menu (top bar + game carousel or the Drive-In toggle) as a box from the top of the page, or null while the menus sleep. */
function measureMenu(W: number): Rect | null {
  const root = document.querySelector('.screens:not(.asleep)');
  if (!root) return null;
  let bottom = 0;
  root.querySelectorAll('.topbar, .carousel, .di-toggle-row').forEach((el) => { bottom = Math.max(bottom, el.getBoundingClientRect().bottom); });
  return bottom > 0 ? { x: 0, y: 0, w: W, h: bottom } : null;
}

type Status = 'loading' | 'ready' | 'playing' | 'searching';

/**
 * The Drive-In screen: a native-HLS <video> over the canvas frame, TV static between channels, a green VCR OSD,
 * a "tap for sound" chip and the channel bar. Muted autoplay (iOS); the first tap unmutes and the choice is remembered.
 */
export function DriveInScreen({ api, visible }: { api: { current: DriveInApi | null }; visible: boolean }) {
  const [, force] = useState(0);
  useEffect(() => subscribeDriveIn(() => force((n) => n + 1)), []);
  const st = getDriveIn(), ch = channelById(st.dial.id);
  const active = st.on && visible;
  const hlsSupported = useRef(supportsHls()).current;
  const isYouTube = ch.kind === 'youtube', supported = isYouTube || hlsSupported;

  const wrap = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), snow = useRef<HTMLCanvasElement>(null);
  const youtubeHost = useRef<HTMLDivElement>(null), youtube = useRef<ReturnType<typeof mountYouTube> | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [muted, setMuted] = useState(true);
  const [burst, setBurst] = useState(false);
  const [osd, setOsd] = useState<{ text: string; k: number } | null>(null);
  const live = useRef({ active, sound: st.sound, isYouTube }); live.current = { active, sound: st.sound, isYouTube };

  // layout: one rect shared with the canvas frame; eased so it glides when the menus wake or sleep
  useEffect(() => {
    let cur: Rect | null = null, menu: Rect | null = null, n = 0, show = 0;
    api.current = {
      tick(dt, W, H, inset, blend) {
        const root = wrap.current, b = bar.current;
        if (!root || !b) return null;
        if (!live.current.active) { root.style.visibility = b.style.visibility = 'hidden'; cur = null; return null; }
        if (n++ % 8 === 0) menu = measureMenu(W);
        const target = screenRect(W, H, inset, { menuBox: menu, minH: live.current.isYouTube ? 200 : undefined });
        if (target) cur = easeRect(cur, target, dt);
        show += ((target ? 1 : 0) - show) * (1 - Math.exp(-10 * dt));   // fades out while awake menus leave no room
        if (!cur || show < 0.02) { root.style.visibility = b.style.visibility = 'hidden'; return null; }
        root.style.visibility = b.style.visibility = 'visible';
        root.style.transform = `translate(${cur.x}px,${cur.y}px)`; root.style.width = `${cur.w}px`; root.style.height = `${cur.h}px`;
        b.style.transform = `translate(${cur.x}px,${cur.y + cur.h + 6}px)`; b.style.width = `${cur.w}px`;
        const o = String(Math.max(0, Math.min(1, (blend - 0.4) / 0.4)) * show);
        root.style.opacity = b.style.opacity = o;
        return cur;
      },
    };
    return () => { api.current = null; };
  }, []);

  // channel flip effects: click + static burst + OSD (not on the first show)
  const lastFlips = useRef(st.flips);
  useEffect(() => {
    if (st.flips === lastFlips.current) return;
    lastFlips.current = st.flips;
    if (!active) return;
    play('chStatic');
    setBurst(true); const a = setTimeout(() => setBurst(false), 400);
    setOsd({ text: `CH ${pad(ch.number)} ${ch.name}`, k: st.flips }); const b = setTimeout(() => setOsd(null), 2000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [st.flips]);

  // playback of the current channel
  useEffect(() => {
    const v = video.current;
    if (!active || isYouTube || !supported || !v) { setStatus('loading'); return; }
    let pst: PlayState = FRESH, timer = 0, retry = 0, stall = 0, gone = false;
    const feed = (ev: PlayEvent) => {
      const r = onPlayEvent(pst, ev); pst = r.st;
      if (r.action === 'retry') { setStatus('searching'); clearTimeout(retry); retry = window.setTimeout(start, retryDelayMs(pst.fails)); }
      else if (r.action === 'skip') { setStatus('searching'); skipBadChannel(); }
    };
    const tryPlay = () => { v.muted = !live.current.sound || v.muted; void v.play().catch(() => { if (!v.muted) { v.muted = true; void v.play().catch(() => {}); } }); };
    function start() {
      if (gone) return;
      clearTimeout(timer); setStatus((s) => (s === 'playing' ? s : 'loading'));
      v!.src = ch.url; v!.load(); feed('loaded'); tryPlay(); // reloading the same URL fetches a fresh playlist
      timer = window.setTimeout(() => feed('timeout'), START_TIMEOUT_MS);
    }
    const onPlaying = () => { clearTimeout(timer); clearTimeout(stall); setStatus('playing'); feed('playing'); };
    const onStalled = () => { clearTimeout(stall); const t0 = v.currentTime; stall = window.setTimeout(() => { if (v.currentTime === t0 && !gone) feed('stalled'); }, 8000); };
    const onError = () => feed('error'), onEnded = () => feed('ended');
    const duck = () => { setMuted(v.muted); duckAmbient('drivein', !v.paused && !v.muted); };
    v.addEventListener('playing', onPlaying); v.addEventListener('stalled', onStalled); v.addEventListener('error', onError); v.addEventListener('ended', onEnded);
    for (const e of ['volumechange', 'pause', 'play', 'playing']) v.addEventListener(e, duck);
    start();
    return () => {
      gone = true; clearTimeout(timer); clearTimeout(retry); clearTimeout(stall);
      v.removeEventListener('playing', onPlaying); v.removeEventListener('stalled', onStalled); v.removeEventListener('error', onError); v.removeEventListener('ended', onEnded);
      for (const e of ['volumechange', 'pause', 'play', 'playing']) v.removeEventListener(e, duck);
      v.pause(); v.removeAttribute('src'); v.load(); duckAmbient('drivein', false);
    };
  }, [active, ch.id, supported]);

  useEffect(() => {
    if (!active || ch.kind !== 'youtube' || !youtubeHost.current) return;
    setStatus('loading'); setMuted(true);
    const controller = mountYouTube(youtubeHost.current, ch.videoId, ch.name, {
      ready: () => setStatus('ready'),
      state: (playing, silent) => {
        setStatus(playing ? 'playing' : 'ready'); setMuted(silent);
        duckAmbient('drivein', playing && !silent);
      },
      sound: setDriveInSound,
      error: (reason, code) => {
        console.warn('[Drive-In] YouTube channel failed', { channel: ch.id, videoId: ch.videoId, reason, code });
        toast(`${ch.name}: ${reason}`);
        setStatus('searching'); skipBadChannel();
      },
    });
    youtube.current = controller;
    return () => { controller.destroy(); youtube.current = null; duckAmbient('drivein', false); };
  }, [active, ch.id]);

  useEffect(() => {
    if (!st.sound) { youtube.current?.mute(); if (video.current) video.current.muted = true; }
  }, [st.sound, ch.id]);

  // first tap anywhere unmutes if the rider chose sound earlier (iOS needs a gesture); `[` / `]` flip channels
  useEffect(() => {
    const unlock = () => {
      if (live.current.active && live.current.sound && live.current.isYouTube) { youtube.current?.unmute(); return; }
      const v = video.current;
      if (live.current.active && live.current.sound && v && v.muted) { v.muted = false; void v.play().catch(() => { v.muted = true; }); }
    };
    const key = (e: KeyboardEvent) => { if (!live.current.active) return; if (e.key === ']') flipChannel(1); else if (e.key === '[') flipChannel(-1); else unlock(); };
    window.addEventListener('click', unlock, true); window.addEventListener('touchend', unlock, true); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', unlock, true); window.removeEventListener('touchend', unlock, true); window.removeEventListener('keydown', key); };
  }, []);

  // static: a burst on every flip, and while the channel is loading or searching
  const showSnow = active && supported && (burst || (!isYouTube && status !== 'playing'));
  useEffect(() => {
    const c = snow.current; if (!c || !showSnow) return;
    const g = c.getContext('2d')!, img = g.createImageData(c.width, c.height);
    const draw = () => { fillStatic(img.data, c.width, c.height, performance.now() / 1000, Math.random); g.putImageData(img, 0, 0); };
    draw(); const id = setInterval(draw, 60);
    return () => clearInterval(id);
  }, [showSnow]);

  const unmute = () => {
    if (isYouTube) { setDriveInSound(true); youtube.current?.unmute(); return; }
    const v = video.current; if (!v) return;
    v.muted = false; setDriveInSound(true);
    void v.play().catch(() => { v.muted = true; });
  };

  return (
    <div class="drivein">
      <div class="di-screen" ref={wrap} style={{ visibility: 'hidden' }}>
        {isYouTube ? <div class="di-youtube" ref={youtubeHost} /> : <video ref={video} playsInline muted autoplay disablePictureInPicture />}
        {showSnow && <canvas class="di-snow" ref={snow} width={192} height={108} />}
        {!supported && <div class="di-card"><b>CH {pad(ch.number)} · {ch.name}</b><span>This channel needs Safari / iPad</span><small>Flip to another channel, or open Wattcade on the iPad.</small></div>}
        {supported && status === 'searching' && <div class="di-card ghost"><b>Searching…</b><span>CH {pad(ch.number)} · {ch.name}</span></div>}
        {osd && <div class="di-osd" key={osd.k}>{osd.text}</div>}
        {supported && muted && (status === 'playing' || status === 'ready') && <button type="button" class="di-sound" onClick={unmute}>🔈 Tap for sound</button>}
      </div>
      <div class="di-bar" ref={bar} style={{ visibility: 'hidden' }}>
        <button type="button" aria-label="Previous channel" onClick={() => flipChannel(-1)}>◀</button>
        <span class="di-ch"><b>CH {pad(ch.number)}</b> · {ch.name}</span>
        <button type="button" aria-label="Next channel" onClick={() => flipChannel(1)}>▶</button>
        <a class="di-credit" href={ch.credit.url} target="_blank" rel="noopener noreferrer">{ch.credit.text}</a>
      </div>
    </div>
  );
}
