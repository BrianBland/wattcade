import { fillText, strokeText, pixelFont } from '../src/games/dungeon/render/font';
import { pixelPanel, pixelMeter } from '../src/games/dungeon/render/chrome';
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module as game } from '../src/games/dungeon';
import type { DungeonSnapshot } from '../src/games/dungeon/sim/types';
import { ELEMENT_COLORS, WEAPON_CLASS_NAMES, type Rarity } from '../src/games/dungeon/sim/loot';
import { BOSS_ART, sprite2 } from '../src/games/dungeon/render/sprites';
import { ELEMENTS, WEAPON_STYLES, heldWeapon } from '../src/games/dungeon/render/weapons';
import { buildBackground } from '../src/games/dungeon/render/renderer';
import { TILE } from '../src/games/dungeon/sim/world';
import type { BulletView } from '../src/games/dungeon/sim/types';
import { drawPixelFx, projectileSprite } from '../src/games/dungeon/render/effects';
const q = new URLSearchParams(location.search),
  app = document.getElementById('app')!;
const profile = testProfile({
    color: '#4cc9f0'
  }),
  session = createGameSession({
    game,
    profile,
    input: new NullInput(),
    fake: {
      script: q.get('script') ?? 'sprints'
    },
    seed: Number(q.get('seed') ?? 11),
    simOpts: {
      autopilot: true,
      invulnerable: true
    }
  });
session.step(Number(q.get('sec') ?? 150) * 30);
const r = await game.loadRenderer(),
  c = document.createElement('canvas');
let view = q.get('view') ?? 'armory',
  tier = Number(q.get('tier') ?? 0),
  t = 1,
  live = false;
(document.getElementById('tier') as HTMLSelectElement).value = String(tier);
const resize = () => {
  if (live) r.resize?.(app.clientWidth, app.clientHeight);else {
    c.width = app.clientWidth;
    c.height = app.clientHeight;
  }
};
const names = WEAPON_STYLES.map(base => WEAPON_CLASS_NAMES[base]);
function gallery() {
  const g = c.getContext('2d')!,
    W = c.width,
    H = c.height;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#211b2d';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'top';
  if (view === 'armory') {
    const cw = (W - 48) / 10,
      rh = Math.min(118, (H - 100) / ELEMENTS.length),
      sc = Math.max(1, Math.min(4, Math.floor(cw / 26)));
    g.font = pixelFont(13);
    g.fillStyle = '#f1e4c9';
    names.forEach((n, i) => fillText(g, n, 24 + i * cw, 16, cw - 5));
    ELEMENTS.forEach((element, j) => WEAPON_STYLES.forEach((base, i) => {
      const x = Math.round(24 + i * cw),
        y = Math.round(50 + j * rh),
        col = ELEMENT_COLORS[element];
      g.fillStyle = '#3d304e';
      g.fillRect(x, y, cw - 6, rh - 8);
      g.fillStyle = col;
      g.font = pixelFont(11);
      fillText(g, element, x + 8, y + 5);
      const w = heldWeapon({
        base,
        element,
        rarity: tier * 2 as Rarity,
        variant: tier
      });
      g.drawImage(w, x + 5, y + 24, w.width * sc, w.height * sc);
      const b = projectileSprite({
        style: base,
        color: col,
        angle: 0,
        age: t,
        variant: tier
      });
      g.drawImage(b, x + cw * .55, y + 25, b.width * sc, b.height * sc);
      g.save();
      g.translate(x + cw * .65, y + rh - 30);
      g.scale(2, 2);
      drawPixelFx(g, {
        kind: 'hit',
        x: 0,
        y: 0,
        t0: Math.floor(t),
        life: 1,
        color: col
      }, t, 16);
      g.restore();
    }));
    g.fillStyle = '#c9bbd8';
    g.font = pixelFont(13);
    fillText(g, 'Element colors the inlay and shots. Rarity colors the fittings. Base / runed / mythic have different silhouettes.', 24, H - 32);
  } else if (view === 'effects') {
    effectGallery(g, W, H);
  } else if (view === 'terrain') {
    terrainGallery(g, W, H);
  } else if (view === 'type') {
    typeGallery(g, W, H);
  } else {
    const labels = ['Slime Monarch', 'Bone Lord', 'Ogre Warchief', 'Arch Necromancer', 'Bone King', 'Frost Wyrm'],
      cw = (W - 48) / 6,
      sc = Math.max(1, Math.min(5, Math.floor((cw - 16) / 34))),
      rowH = Math.min(260, (H - 120) / 2);
    BOSS_ART.forEach((b, i) => {
      const x = Math.round(24 + i * cw);
      g.font = pixelFont(15);
      g.fillStyle = '#efe4d0';
      fillText(g, labels[i], x, 20, cw - 8);
      for (const [j, st] of (['idle', 'attack'] as const).entries()) {
        const y = 70 + j * rowH,
          sp = sprite2(b.art, st, 0, b.pal, false, b.scale);
        g.fillStyle = '#3a2e49';
        for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) g.fillRect(x + xx * 16 * sc, y + yy * 16 * sc, 16 * sc - 1, 16 * sc - 1);
        g.drawImage(sp, x, y, sp.width * sc, sp.height * sc);
        g.fillStyle = '#b9a9c9';
        g.font = pixelFont(11);
        fillText(g, st === 'idle' ? 'IDLE' : 'WIND-UP', x, y + 36 * sc);
      }
    });
    g.fillStyle = '#d2c1df';
    g.font = pixelFont(13);
    fillText(g, 'Every boss: native 32 × 32 artwork. Hero: 16 × 16. All enlarged at the same integer scale.', 24, H - 36);
  }
}
function typeGallery(g: CanvasRenderingContext2D, W: number, H: number) {
  const pad = 32, width = Math.min(W - pad * 2, 1100), x = Math.round((W - width) / 2);
  g.font = pixelFont(40); g.fillStyle = '#ffd84a';
  fillText(g, 'CRANK CRAWLER', x, 28, width);
  g.font = pixelFont(20); g.fillStyle = '#eee5d3';
  fillText(g, 'Pixel lettering, from combat to camp.', x, 80, width);
  const panel = (y: number, height: number, label: string) => {
    pixelPanel(g, x, y, width, height, '#655572', '#171320', 2);
    g.font = pixelFont(10); g.fillStyle = '#b8a6c9';
    fillText(g, label, x + 18, y + 14);
  };
  panel(128, 126, 'ITEMS / MIXED CASE');
  g.font = pixelFont(20); g.fillStyle = '#ffd84a';
  fillText(g, 'Keen Scattergun of Thunder', x + 18, 164, width - 36);
  g.fillStyle = '#7fe7ff';
  fillText(g, 'Runed Dagger of Rime', x + 18, 196, width - 36);
  g.font = pixelFont(10); g.fillStyle = '#ccc';
  fillText(g, 'Lv12 +2 · frost · 7 projectiles · piercing ✓', x + 18, 230, width - 36);
  panel(274, 126, 'COMBAT / NUMBERS');
  g.font = pixelFont(40); g.strokeStyle = '#100d1c';
  for (const [i, label, color] of [[0, '128', '#eee5d3'], [1, '256!', '#ffd84a'], [2, '-42', '#ff6b8a']] as const) {
    const xx = x + 18 + i * Math.min(220, width / 3);
    strokeText(g, label, xx, 312); g.fillStyle = color; fillText(g, label, xx, 312);
  }
  g.font = pixelFont(20); g.fillStyle = '#ffb66b';
  fillText(g, 'Big attack coming: Ward to parry', x + 18, 368, width - 36);
  panel(420, 126, 'HUD / COMPACT LABELS');
  pixelMeter(g, x + 18, 458, Math.min(320, width - 36), 16, .76, '#73bd78', 1);
  g.font = pixelFont(10); g.fillStyle = '#fff';
  fillText(g, '158 / 208', x + 24, 462);
  fillText(g, 'Lv12 F3   ● 1280   2nd W', x + 18, 490, width - 36);
  g.fillStyle = '#c9a7ff';
  fillText(g, '☠ Blood Debt · 32s   ★ Unique   ×2 damage', x + 18, 516, width - 36);
  if (H > 700) {
    panel(566, 124, 'ALPHABET / PUNCTUATION');
    g.font = pixelFont(20); g.fillStyle = '#eee5d3';
    fillText(g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', x + 18, 600, width - 36);
    fillText(g, 'abcdefghijklmnopqrstuvwxyz', x + 18, 632, width - 36);
    fillText(g, '0123456789  + - % / : ! ? …', x + 18, 664, width - 36);
  }
}
const effectStudies: Array<{
  label: string;
  style: BulletView['style'];
  color: string;
  variant: number;
}> = [{
  label: 'Slime spray',
  style: 'enemy',
  color: '#ff5a5a',
  variant: 0
}, {
  label: 'Shuriken',
  style: 'star',
  color: ELEMENT_COLORS.normal,
  variant: 2
}, {
  label: 'Steel shot',
  style: 'pellet',
  color: ELEMENT_COLORS.normal,
  variant: 0
}, {
  label: 'Silver blaster',
  style: 'flame',
  color: ELEMENT_COLORS.normal,
  variant: 0
}, {
  label: 'Boltcaster',
  style: 'spark',
  color: ELEMENT_COLORS.normal,
  variant: 1
}, {
  label: 'Steel orb',
  style: 'orb',
  color: ELEMENT_COLORS.normal,
  variant: 0
}];
function effectGallery(g: CanvasRenderingContext2D, W: number, H: number) {
  const cw = (W - 48) / 6,
    rh = Math.min(145, (H - 75) / 5),
    sc = Math.max(1, Math.min(7, Math.floor(cw / 25)));
  effectStudies.forEach((b, i) => {
    const x = 24 + i * cw;
    g.fillStyle = '#f1e4c9';
    g.font = pixelFont(15);
    fillText(g, b.label, x, 16, cw - 8);
    for (let row = 0; row < 5; row++) {
      const age = row === 0 ? t : (row - 1) / 10 + .01,
        sp = projectileSprite({
          ...b,
          angle: 0,
          age
        }),
        y = 50 + row * rh;
      g.fillStyle = '#342a43';
      g.fillRect(x, y, cw - 8, rh - 8);
      g.drawImage(sp, Math.round(x + (cw - 8 - sp.width * sc) / 2), Math.round(y + (rh - 35 - sp.height * sc) / 2), sp.width * sc, sp.height * sc);
      g.fillStyle = row === 0 ? '#c9f1bf' : '#b5a5c7';
      g.font = pixelFont(12);
      fillText(g, row === 0 ? 'LIVE' : `FRAME ${row}`, x + 10, y + rh - 31);
    }
  });
  g.fillStyle = '#c9bbd8';
  g.font = pixelFont(13);
  fillText(g, 'Discrete glints and spin frames. The projectile center and collision radius stay fixed.', 24, H - 26);
}
const terrainPreviews: HTMLCanvasElement[] = [];
function terrainGallery(g: CanvasRenderingContext2D, W: number, H: number) {
  const cw = (W - 60) / 2,
    rh = (H - 60) / 2,
    sc = Math.max(1, Math.min(3, Math.floor(cw / (14 * 16)), Math.floor((rh - 50) / (10 * 16))));
  const labels = ['Slate crypt', 'Overgrown vault', 'Sandstone halls', 'Violet catacomb'];
  for (let i = 0; i < 4; i++) {
    if (!terrainPreviews[i]) {
      const world = structuredClone(session.sim.snapshot() as DungeonSnapshot).world;
      world.w = 14;
      world.h = 10;
      world.theme = i;
      world.rooms = [];
      world.tiles = Array(140).fill(TILE.FLOOR);
      for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) if (x === 0 || y <= 1 || y === 9 || x === 13) world.tiles[y * 14 + x] = TILE.WALL;
      for (let y = 5; y < 8; y++) for (let x = 9; x < 13; x++) world.tiles[y * 14 + x] = TILE.SWAMP;
      for (let y = 5; y < 7; y++) for (let x = 3; x < 5; x++) world.tiles[y * 14 + x] = TILE.PIT;
      world.tiles[3 * 14 + 7] = TILE.PILLAR;
      const bg = buildBackground(world),
        c = document.createElement('canvas');
      c.width = 14 * 16;
      c.height = 10 * 16;
      bg.draw(c.getContext('2d')!, 0, 0, c.width, c.height, 1);
      bg.release();
      terrainPreviews[i] = c;
    }
    const x = 20 + i % 2 * (cw + 20),
      y = 20 + Math.floor(i / 2) * rh;
    g.fillStyle = '#eee0cf';
    g.font = pixelFont(15);
    fillText(g, labels[i], x, y);
    const c = terrainPreviews[i];
    g.drawImage(c, x, y + 30, c.width * sc, c.height * sc);
    const hero = sprite2('hero');
    g.drawImage(hero, x + 6 * 16 * sc, y + 30 + 4 * 16 * sc, hero.width * sc, hero.height * sc);
  }
}
function render() {
  if (live) r.render(session.sim.snapshot(), session.bikeStore.get(), session.ctx.input());else gallery();
}
function select(v: string) {
  if (live) r.unmount();
  live = v === 'live';
  view = v;
  app.replaceChildren();
  if (live) {
    r.mount(app, {
      profile,
      insets: {
        top: 0,
        left: 0,
        right: 0,
        bottom: Number(q.get('inset') ?? 0)
      }
    });
  } else app.append(c);
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  resize();
  render();
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.onclick = () => select(b.dataset.view!));
document.getElementById('tier')!.onchange = e => {
  tier = Number((e.target as HTMLSelectElement).value);
  render();
};
let accumulator = 0;
const advance = (seconds: number) => {
  t += seconds;
  if (live) {
    accumulator += seconds;
    const steps = Math.floor(accumulator * 30);
    accumulator -= steps / 30;
    if (steps) session.step(steps);
  }
  render();
};
(window as unknown as {
  __dungeon: unknown;
}).__dungeon = {
  advance,
  snapshot: () => session.sim.snapshot() as DungeonSnapshot,
  renderSnapshot: (snapshot: DungeonSnapshot, paddles?: { paddleL: number; paddleR: number }) => {
    if (live) r.render(snapshot, session.bikeStore.get(), { ...session.ctx.input(), ...paddles });
  },
  select,
  dispose: () => {
    r.unmount();
    app.replaceChildren();
  }
};
window.addEventListener('resize', () => {
  resize();
  render();
});
select(view);
if (!q.has('manual')) {
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(.1, (now - last) / 1000);
    last = now;
    advance(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
