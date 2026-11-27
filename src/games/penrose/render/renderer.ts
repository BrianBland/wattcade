/**
 * Penrose Pedals Three.js Renderer (`GameRenderer`).
 * Purely reactive to `PenroseSnapshot` — never mutates simulation state locally.
 * Handles WebGL rendering (`wheelOnTop` pass), procedural Monument Valley soundscape,
 * visible auto-fading micro-toasts, 2-tier hints, direct 3D cap tap buttons,
 * and an in-game Chapter & Level Picker modal, all strictly honoring `insets`.
 */

import * as THREE from 'three';
import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import { CAMPAIGN } from '../campaign';
import { getLevelDef, LEVEL_CATALOG } from '../sim/catalog';
import { clamp } from '../sim/math';
import type { FaceKey, PenroseAction, PenroseSnapshot, SimEvent } from '../sim/types';
import { layout } from './layout';
import { buildLevelScene, type BuiltScene, eventSparkColor } from './sceneBuilder';
import {
  createHazeUniforms,
  createSharedTextures,
  FACE_COLORS,
  type SharedTextures,
  skyCss,
  THEMES,
} from './themes';

const SD = new THREE.Vector3(1, 1, 1).normalize();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const TOAST_KINDS = new Set<SimEvent['kind']>([
  'checkpoint',
  'key',
  'gateOpen',
  'perspJoin',
  'gapHidden',
  'doorMatch',
  'clutchSlip',
  'fall',
  'chapterWin',
]);

const CSS = `
.pp-root { position: absolute; inset: 0; overflow: hidden; font-family: "Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif; color: #23263A; -webkit-user-select: none; user-select: none }
.pp-sky { position: absolute; inset: 0; transition: background .55s ease }
.pp-stage { position: absolute; overflow: hidden }
.pp-stage canvas { display: block }

.pp-badges { position: absolute; inset: 0; pointer-events: none }
.pp-badges .badge { position: absolute; left: 0; top: 0; margin: -24px 0 0 -24px; width: 48px; height: 48px; border: 0; padding: 0; background: transparent; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent }
.pp-badges .badge .disc { display: grid; place-items: center; width: 26px; height: 26px; margin: 11px; border-radius: 50%; background: var(--c); color: #fff; font: 800 13px/1 "Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif; box-shadow: 0 0 0 2.5px rgba(255,255,255,.92), 0 2px 6px rgba(0,0,0,.32); transition: transform .16s ease, box-shadow .16s ease }
.pp-badges .badge.on .disc { transform: scale(1.22); box-shadow: 0 0 0 3px #fff, 0 0 14px var(--c) }
.pp-badges .badge.ready:not(.on) .disc { box-shadow: 0 0 0 2.5px #FFE25A, 0 2px 6px rgba(0,0,0,.32) }

.pp-overlay-top { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 16px 0; pointer-events: none }
.pp-toast { font: 600 13px/1.3 "Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif; color: #1E2235; background: rgba(255,255,255,.86); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: 999px; padding: 5px 14px; box-shadow: 0 3px 12px rgba(0,0,0,.12); opacity: 0; transform: translateY(-6px); transition: opacity .24s ease, transform .24s ease; max-width: 92%; text-align: center }
.pp-toast.show { opacity: 1; transform: translateY(0) }
.pp-toast.warn { background: rgba(255,240,235,.94); color: #7C1E1E; border: 1px solid rgba(220,70,70,.35) }
.pp-toast.gold { background: rgba(255,250,224,.94); color: #4A3400; border: 1px solid rgba(230,175,40,.45) }

.pp-hint { font-size: 13px; line-height: 1.38; color: #1E2235; background: rgba(255,255,255,.88); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: 12px; padding: 7px 14px; max-width: 72ch; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,.14); display: none }
.pp-hint.show { display: block }
.pp-hint .tag { display: inline-block; font: 700 10px/1 ui-monospace, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; background: #2A2640; color: #fff; border-radius: 4px; padding: 2px 6px; margin-right: 7px; vertical-align: 1px }

.pp-fade { position: absolute; inset: 0; opacity: 0; display: grid; place-items: center; text-align: center; pointer-events: none; transition: opacity .35s ease; background: rgba(255,255,255,.18); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px) }
.pp-fade.show { opacity: 1 }
.pp-fade .feb { font: 700 12px ui-monospace, Menlo, monospace; letter-spacing: .16em; text-transform: uppercase; color: #2A2640; opacity: .8 }
.pp-fade .ftt { font-weight: 800; font-size: clamp(26px, 4.6vw, 48px); color: #2A2640; letter-spacing: -.015em; margin-top: 4px; text-shadow: 0 2px 10px rgba(255,255,255,.65) }
.pp-fade.dark .feb, .pp-fade.dark .ftt { color: #FFF8EC; text-shadow: 0 2px 14px rgba(0,0,0,.45) }

.pp-picker { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(16,18,32,.52); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); pointer-events: auto; z-index: 20 }
.pp-picker.open { display: flex }
.pp-picker-card { width: min(760px, 94%); max-height: 88%; display: flex; flex-direction: column; background: rgba(250,248,255,.96); color: #1E2235; border-radius: 16px; box-shadow: 0 18px 48px rgba(0,0,0,.35); overflow: hidden }
.pp-picker-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(30,34,53,.1) }
.pp-picker-head h2 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -.01em }
.pp-picker-head .sub { font-size: 12px; opacity: .68; margin-left: 10px }
.pp-picker-close { border: 0; background: rgba(30,34,53,.09); color: #1E2235; font: 700 13px/1 inherit; border-radius: 8px; padding: 7px 12px; cursor: pointer }
.pp-picker-close:hover { background: rgba(30,34,53,.16) }
.pp-picker-body { overflow-y: auto; padding: 12px 18px 18px; display: flex; flex-direction: column; gap: 14px }
.pp-ch-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px }
.pp-ch-title { font-weight: 800; font-size: 14px }
.pp-ch-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; opacity: .75 }
.pp-vibe { font: 700 10px/1 ui-monospace, Menlo, monospace; text-transform: uppercase; letter-spacing: .06em; padding: 2px 6px; border-radius: 999px; background: rgba(30,34,53,.08) }
.pp-lv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 7px }
.pp-lv-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; border: 1px solid rgba(30,34,53,.12); background: #fff; color: #1E2235; border-radius: 10px; padding: 8px 10px; text-align: left; cursor: pointer; transition: transform .1s ease, border-color .15s ease }
.pp-lv-btn:hover { transform: translateY(-1px); border-color: #3b82ff }
.pp-lv-btn.cur { border-color: #3b82ff; box-shadow: 0 0 0 2px rgba(59,130,255,.25) }
.pp-lv-btn.done { background: #F2FBF5; border-color: rgba(43,217,107,.45) }
.pp-lv-top { width: 100%; display: flex; justify-content: space-between; font: 700 10px/1 ui-monospace, Menlo, monospace; opacity: .65 }
.pp-lv-name { font-size: 12.5px; font-weight: 700; line-height: 1.2 }
`;

function mkEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

function placeBox(e: HTMLElement, b: { x: number; y: number; w: number; h: number }): void {
  e.style.left = `${b.x}px`;
  e.style.top = `${b.y}px`;
  e.style.width = `${b.w}px`;
  e.style.height = `${b.h}px`;
}

export class PenroseRenderer implements GameRenderer {
  private root: HTMLElement | null = null;
  private skyEl: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private badgesEl: HTMLElement | null = null;
  private topOverlayEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private fadeEl: HTMLElement | null = null;
  private fadeEyebrowEl: HTMLElement | null = null;
  private fadeTitleEl: HTMLElement | null = null;
  private pickerEl: HTMLElement | null = null;
  private pickerBodyEl: HTMLElement | null = null;
  private pickerCountEl: HTMLElement | null = null;

  private R3: THREE.WebGLRenderer | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private depthOnlyMat: THREE.MeshBasicMaterial | null = null;
  private textures: SharedTextures | null = null;
  private haze = createHazeUniforms();
  private built: BuiltScene | null = null;

  private send: (a: PenroseAction) => void = () => {};
  private riderColor: string | undefined;
  private reduceMotion = false;
  private insets: Insets = NO_INSETS;
  private ro: ResizeObserver | null = null;
  private cssW = 800;
  private cssH = 600;

  private lastT = 0;
  private elapsed = 0;
  private lastLoadSeq = -1;
  private lastEventId = 0;
  private toastUntil = 0;
  private titleUntil = 0;
  private pickerRenderedKey = '';
  private badgeEls = new Map<string, HTMLButtonElement>();
  private projScratch = new THREE.Vector3();

  mount(
    container: HTMLElement,
    ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets },
  ): void {
    if (ctx.send) this.send = ctx.send as (a: PenroseAction) => void;
    this.riderColor = ctx.profile.color;
    this.insets = ctx.insets ?? NO_INSETS;
    this.reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const root = mkEl('div', 'pp-root', container);
    this.root = root;
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    this.skyEl = mkEl('div', 'pp-sky', root);
    this.stageEl = mkEl('div', 'pp-stage', root);

    // WebGL Renderer + orthographic isometric camera
    const R3 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    R3.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    R3.setClearColor(0x000000, 0);
    R3.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.R3 = R3;
    this.stageEl.appendChild(R3.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.textures = createSharedTextures();

    // Direct 3D cap tap targets sit over the canvas inside stage
    this.badgesEl = mkEl('div', 'pp-badges', this.stageEl);

    // Top overlay inside stage (micro-toast + 2-tier hint)
    this.topOverlayEl = mkEl('div', 'pp-overlay-top', root);
    this.toastEl = mkEl('div', 'pp-toast', this.topOverlayEl);
    this.toastEl.setAttribute('aria-live', 'polite');
    this.hintEl = mkEl('div', 'pp-hint', this.topOverlayEl);

    // Level arrival / win transition card
    this.fadeEl = mkEl('div', 'pp-fade', root);
    const card = mkEl('div', '', this.fadeEl);
    this.fadeEyebrowEl = mkEl('div', 'feb', card);
    this.fadeTitleEl = mkEl('div', 'ftt', card);
    this.fadeEl.setAttribute('aria-live', 'polite');

    // Chapter & Level Picker modal
    this.pickerEl = mkEl('div', 'pp-picker', root);
    this.pickerEl.addEventListener('click', (ev) => {
      if (ev.target === this.pickerEl) this.send({ type: 'closePicker' });
    });
    const pCard = mkEl('div', 'pp-picker-card', this.pickerEl);
    const pHead = mkEl('div', 'pp-picker-head', pCard);
    const titleWrap = mkEl('div', '', pHead);
    const h2 = mkEl('h2', '', titleWrap);
    h2.textContent = 'Chapters & Levels';
    h2.style.display = 'inline';
    this.pickerCountEl = mkEl('span', 'sub', titleWrap);
    const closeBtn = mkEl('button', 'pp-picker-close', pHead);
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.send({ type: 'closePicker' }));
    this.pickerBodyEl = mkEl('div', 'pp-picker-body', pCard);

    this.applyLayout();
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.applyLayout());
      this.ro.observe(container);
    }
  }

  /** Instant readiness — no multi-second startup build stall. */
  ready(): Promise<void> {
    return Promise.resolve();
  }

  setInsets(insets: Insets): void {
    this.insets = insets;
    this.applyLayout();
  }

  resize(): void {
    this.applyLayout();
  }

  private applyLayout(): void {
    if (!this.root || !this.stageEl || !this.topOverlayEl) return;
    const W = this.root.clientWidth || 800;
    const H = this.root.clientHeight || 600;
    const { stage, status } = layout(W, H, this.insets);
    placeBox(this.stageEl, stage);
    placeBox(this.topOverlayEl, { x: status.x, y: status.y, w: status.w, h: Math.max(120, status.h) });
    if (this.pickerEl) placeBox(this.pickerEl, stage);

    this.cssW = stage.w;
    this.cssH = stage.h;
    if (this.R3) this.R3.setSize(stage.w, stage.h, false);
    this.fitCamera();
  }

  private fitCamera(): void {
    if (!this.camera || !this.built) return;
    let [x0, x1, y0, y1] = this.built.bounds;
    const pad = this.built.pad;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);
    const aspect = this.cssW / Math.max(1, this.cssH);
    if (bw / bh < aspect) {
      const nw = bh * aspect;
      x0 -= (nw - bw) / 2;
      x1 += (nw - bw) / 2;
    } else {
      const nh = bw / aspect;
      y0 -= (nh - bh) / 2;
      y1 += (nh - bh) / 2;
    }
    this.camera.left = x0;
    this.camera.right = x1;
    this.camera.top = y1;
    this.camera.bottom = y0;
    this.camera.updateProjectionMatrix();
  }

  private aimCamera(yawRad: number, rollRad: number): void {
    if (!this.camera || !this.built) return;
    const d = SD.clone().applyAxisAngle(Y_AXIS, yawRad);
    this.camera.position.copy(this.built.center).addScaledVector(d, 120);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.built.center);
    if (rollRad) this.camera.rotateZ(rollRad);
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
  }

  private rebuildForSnapshot(snap: PenroseSnapshot): void {
    this.built?.dispose();
    this.built = null;
    this.clearBadges();
    if (!this.textures) return;

    this.built = buildLevelScene(snap, this.haze, this.textures, this.riderColor, this.reduceMotion);
    const th = THEMES[snap.theme] ?? THEMES.dusk;
    if (this.skyEl) this.skyEl.style.background = skyCss(th);

    // Create direct 3D cap tap buttons for every interactive machine
    if (this.badgesEl) {
      for (const cap of this.built.caps) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'badge';
        btn.style.setProperty('--c', FACE_COLORS[cap.key]);
        btn.setAttribute('aria-label', `${cap.key.toUpperCase()}: ${cap.name}`);
        btn.title = `${cap.key.toUpperCase()} — ${cap.name}`;
        const disc = document.createElement('span');
        disc.className = 'disc';
        disc.textContent = cap.key.toUpperCase();
        btn.appendChild(disc);
        const key: FaceKey = cap.key;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.send({ type: 'toggle', key });
        });
        this.badgesEl.appendChild(btn);
        this.badgeEls.set(cap.id, btn);
      }
    }

    // Show brief arrival title banner
    if (this.fadeEyebrowEl && this.fadeTitleEl && this.fadeEl) {
      this.fadeEyebrowEl.textContent = `${snap.chapterName} · ${snap.levelIndex + 1} / ${snap.levelCount}`;
      this.fadeTitleEl.textContent = snap.levelName;
      const darkSky = snap.theme === 'night' || snap.theme === 'brass' || snap.theme === 'prism';
      this.fadeEl.classList.toggle('dark', darkSky);
      this.titleUntil = this.elapsed + 1.35;
    }

    this.fitCamera();
  }

  private clearBadges(): void {
    this.badgeEls.clear();
    if (this.badgesEl) this.badgesEl.textContent = '';
  }

  private showToast(text: string, toneKind: 'normal' | 'warn' | 'gold' = 'normal'): void {
    if (!this.toastEl || !text) return;
    this.toastEl.textContent = text;
    this.toastEl.className = `pp-toast show${toneKind === 'warn' ? ' warn' : toneKind === 'gold' ? ' gold' : ''}`;
    this.toastUntil = this.elapsed + 2.6;
  }

  private processEvents(snap: PenroseSnapshot): void {
    for (const ev of snap.events) {
      if (ev.id <= this.lastEventId) continue;
      this.lastEventId = ev.id;

      if (ev.pos && this.built && (
        ev.kind === 'perspJoin' || ev.kind === 'latch' || ev.kind === 'key' ||
        ev.kind === 'gateOpen' || ev.kind === 'doorMatch' || ev.kind === 'win' || ev.kind === 'chapterWin'
      )) {
        this.built.triggerSpark(ev.pos, eventSparkColor(ev, this.built.theme));
      }

      if (TOAST_KINDS.has(ev.kind) && ev.text) {
        const toneKind = ev.kind === 'fall' || ev.kind === 'clutchSlip'
          ? 'warn'
          : ev.kind === 'chapterWin' || ev.kind === 'perspJoin' || ev.kind === 'gateOpen' || ev.kind === 'checkpoint'
            ? 'gold'
            : 'normal';
        this.showToast(ev.text, toneKind);
      }
    }
  }

  private syncPicker(snap: PenroseSnapshot): void {
    if (!this.pickerEl || !this.pickerBodyEl) return;
    this.pickerEl.classList.toggle('open', snap.pickerOpen);
    if (!snap.pickerOpen) return;

    const key = `${snap.levelIndex}|${snap.done.length}|${snap.clean.length}`;
    if (key === this.pickerRenderedKey) return;
    this.pickerRenderedKey = key;

    const doneSet = new Set(snap.done);
    const cleanSet = new Set(snap.clean);
    if (this.pickerCountEl) {
      this.pickerCountEl.textContent = `${snap.done.length} / ${snap.levelCount} cleared`;
    }

    this.pickerBodyEl.textContent = '';
    CAMPAIGN.forEach((ch, chIdx) => {
      const entries = LEVEL_CATALOG.filter((lv) => lv.chapterIndex === chIdx);
      const cleared = entries.filter((lv) => doneSet.has(lv.id)).length;

      const sec = mkEl('div', '', this.pickerBodyEl!);
      const head = mkEl('div', 'pp-ch-head', sec);
      const title = mkEl('div', 'pp-ch-title', head);
      title.textContent = `${chIdx + 1}. ${ch.name}`;
      const meta = mkEl('div', 'pp-ch-meta', head);
      const vibe = mkEl('span', 'pp-vibe', meta);
      vibe.textContent = ch.vibe;
      const prog = mkEl('span', '', meta);
      prog.textContent = `${cleared}/${entries.length}`;

      const grid = mkEl('div', 'pp-lv-grid', sec);
      for (const lv of entries) {
        const isDone = doneSet.has(lv.id);
        const isClean = cleanSet.has(lv.id);
        const isCur = lv.index === snap.levelIndex;
        const btn = mkEl('button', `pp-lv-btn${isDone ? ' done' : ''}${isCur ? ' cur' : ''}`, grid);
        btn.type = 'button';
        const top = mkEl('div', 'pp-lv-top', btn);
        const num = mkEl('span', '', top);
        num.textContent = `#${lv.index + 1}`;
        const mark = mkEl('span', '', top);
        mark.textContent = isClean ? '★' : isDone ? '✓' : '';
        const name = mkEl('div', 'pp-lv-name', btn);
        name.textContent = getLevelDef(lv.index).name;
        const idx = lv.index;
        btn.addEventListener('click', () => this.send({ type: 'goto', index: idx }));
      }
    });
  }

  private syncBadges(): void {
    if (!this.built || !this.camera) return;
    for (const cap of this.built.caps) {
      const btn = this.badgeEls.get(cap.id);
      if (!btn) continue;
      if (!cap.live) {
        btn.style.display = 'none';
        continue;
      }
      btn.style.display = '';
      this.projScratch.copy(cap.worldPos).project(this.camera);
      const x = ((this.projScratch.x + 1) / 2) * this.cssW;
      const y = ((1 - this.projScratch.y) / 2) * this.cssH;
      btn.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      btn.classList.toggle('on', cap.on);
      btn.classList.toggle('ready', cap.ready);
      btn.setAttribute('aria-pressed', cap.on ? 'true' : 'false');
    }
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>): void {
    const snap = snapshot as PenroseSnapshot | null;
    if (!snap || !this.R3 || !this.camera) return;

    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = this.lastT ? clamp((now - this.lastT) / 1000, 0.001, 0.05) : 1 / 60;
    this.lastT = now;
    this.elapsed += dt;

    if (snap.loadSeq !== this.lastLoadSeq) {
      this.lastLoadSeq = snap.loadSeq;
      this.rebuildForSnapshot(snap);
    }
    if (!this.built) return;

    // 1. Aim camera (level yaw + subtle paddle peek + roll)
    this.aimCamera(snap.yawRad + snap.peekYawRad, snap.rollRad);

    // 2. Sync 3D diorama & portals
    this.built.sync(snap, dt, this.elapsed, this.camera, this.R3);

    // 3. Render base diorama + `wheelOnTop` depth-masked pass
    this.R3.render(this.built.scene, this.camera);
    if (this.built.hasOverlay && this.depthOnlyMat) {
      const prevAC = this.R3.autoClear;
      const prevBg = this.built.scene.background;
      this.R3.autoClear = false;
      this.R3.clearDepth();
      this.built.scene.background = null;
      this.built.scene.overrideMaterial = this.depthOnlyMat;
      this.camera.layers.set(2);
      this.R3.render(this.built.scene, this.camera);
      this.built.scene.overrideMaterial = null;
      this.camera.layers.set(1);
      this.R3.render(this.built.scene, this.camera);
      this.camera.layers.set(0);
      this.built.scene.background = prevBg;
      this.R3.autoClear = prevAC;
    }

    // 4. Sync projected 3D cap tap targets
    this.syncBadges();

    // 5. Process semantic events -> audio + spark bursts + micro-toasts
    this.processEvents(snap);

    // 6. Auto-fade micro-toast
    if (this.toastEl && this.elapsed > this.toastUntil) {
      this.toastEl.classList.remove('show');
    }

    // 7. 2-tier Hint Banner
    if (this.hintEl) {
      if (snap.hintTier > 0 && snap.hintText) {
        this.hintEl.classList.add('show');
        this.hintEl.innerHTML = '';
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = snap.hintTier === 1 ? 'Nudge' : 'Guide';
        this.hintEl.appendChild(tag);
        this.hintEl.appendChild(document.createTextNode(snap.hintText));
      } else {
        this.hintEl.classList.remove('show');
      }
    }

    // 8. Title arrival / win transition card
    if (this.fadeEl) {
      const showWin = snap.state === 'won' && snap.wonT > 0.7;
      if (showWin && this.fadeEyebrowEl && this.fadeTitleEl) {
        this.fadeEyebrowEl.textContent = snap.autopilot ? 'Solved' : 'Cleared';
        this.fadeTitleEl.textContent = snap.levelName;
      }
      this.fadeEl.classList.toggle('show', showWin || this.elapsed < this.titleUntil);
    }

    // 9. Chapter & Level Picker modal
    this.syncPicker(snap);
  }

  ending(): void {}

  unmount(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.built?.dispose();
    this.built = null;
    this.depthOnlyMat?.dispose();
    this.depthOnlyMat = null;
    this.textures?.dispose();
    this.textures = null;
    if (this.R3) {
      this.R3.dispose();
      this.R3.forceContextLoss();
      this.R3 = null;
    }
    this.root?.remove();
    this.root = null;
    this.skyEl = null;
    this.stageEl = null;
    this.badgesEl = null;
    this.topOverlayEl = null;
    this.toastEl = null;
    this.hintEl = null;
    this.fadeEl = null;
    this.pickerEl = null;
    this.pickerBodyEl = null;
    this.badgeEls.clear();
  }
}
