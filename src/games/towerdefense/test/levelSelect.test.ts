import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { CAMPAIGN } from '../sim/campaign';
import { BAKED_LEVELS, specKey } from '../sim/baked';
import { generateLevel } from '../sim/generator';
import { levelImage, levelSelectHtml, modesHtml } from '../render/levelSelect';
import { loadingHtml, loadingStage, swipeStep } from '../render/panels';
import type { GarageView, TdSnapshot } from '../sim/types';

const snap = (s: ReturnType<typeof createGameSession>) => s.sim.snapshot() as TdSnapshot;
const saveWith = (cleared: number) => ({ v: 4, runs: 3, campaign: Object.fromEntries(CAMPAIGN.slice(0, cleared).map((c, i) => [c.id, (i % 3) + 1])) });
const menu = (cleared: number, input = new TimelineInput([])) => {
  const s = createGameSession({ game: module, profile: testProfile({ gameData: { towerdefense: saveWith(cleared) } }), input, fake: { script: 'z2' }, seed: 1 });
  s.step(1);
  return s;
};

describe('baked campaign maps', () => {
  it('cover every campaign level under its spec key', () => {
    for (const c of CAMPAIGN) expect(BAKED_LEVELS[specKey(c)], c.name).toMatchObject({ seed: c.seed, roadStyle: c.roadStyle, style: c.ground, name: c.name });
  });
  it('match the generator (rebake with scripts/td-bake-campaign.ts when this fails)', () => {
    for (const i of [0, 4, 10, 24]) {
      const c = CAMPAIGN[i];
      expect(BAKED_LEVELS[specKey(c)], c.name).toEqual({ ...generateLevel(c.seed, { style: c.roadStyle, ground: c.ground, pads: c.pads }).level, name: c.name });
    }
  }, 30_000);
});

describe('level select', () => {
  it('Campaign opens a grid on the next level; arrows move by level and by ground; locked levels preview but do not start', () => {
    const s = menu(6, new TimelineInput([
      { t: 0.1, press: 'a' }, { t: 0.15, release: 'a' },        // Campaign card → grid
      { t: 0.3, press: 'down' }, { t: 0.35, release: 'down' },  // next ground row: a locked level
      { t: 0.5, press: 'a' }, { t: 0.55, release: 'a' },        // denied
    ]));
    s.step(6);
    let g = snap(s).garage!;
    expect(g.page).toBe('campaign'); expect(g.open).toBe(6);
    s.step(6); g = snap(s).garage!;
    expect(g.levelSel).toBe(11); expect(g.levels[11].locked).toBe(true);
    s.step(6); expect(snap(s).phase).toBe('garage');
    s.sim.receive!({ type: 'levelTile', index: 2 }); s.step(1);
    expect(snap(s).garage!.levelSel).toBe(2);
    s.sim.receive!({ type: 'levelTile', index: 2 }); s.step(1); // tapping the selected tile rides it
    expect(snap(s).phase).toBe('run'); expect(snap(s).run!.name).toBe(CAMPAIGN[2].name);
  });
  it('B goes back to the ride select; finishing a campaign level returns to the grid on the next level', () => {
    const s = menu(2);
    s.sim.receive!({ type: 'levelTile', index: 0 }); s.step(1);
    expect(snap(s).garage!.page).toBe('campaign');
    s.sim.receive!({ type: 'levelBack' }); s.step(1);
    expect(snap(s).garage!.page).toBe('modes');
    expect(snap(s).garage!.rows.map((r) => r.kind)).toEqual(['campaign', 'quick', 'start', 'intensity', 'unlocks']);
  });
  it('draws tiles, a large preview with the level facts, and mode cards', () => {
    const s = menu(3);
    s.sim.receive!({ type: 'levelTile', index: 3 }); s.step(1);
    const g: GarageView = snap(s).garage!;
    const art = (l: { id: string }, preview: boolean) => l.id === BAKED_LEVELS[specKey(CAMPAIGN[3])].id ? `blob:${preview ? 'big' : 'tile'}` : null;
    const html = levelSelectHtml(g, art);
    expect(html.match(/class="td-tile[^"]*" data-command="levelTile"/g)).toHaveLength(CAMPAIGN.length);
    expect(html).toContain(CAMPAIGN[3].name);
    expect(html).toContain(`${CAMPAIGN[3].minutes} min`);
    expect(html.match(/class="td-tile[^"]*locked/g)!.length).toBe(CAMPAIGN.length - 4);
    // real art where it is made (the big preview uses the big image), a waiting tile in the ground colour elsewhere
    expect(html).toContain('src="blob:big"'); expect(html).toContain('src="blob:tile"');
    expect(html.match(/td-map-wait/g)).toHaveLength(CAMPAIGN.length - 1);
    expect(html).not.toContain('<svg');
    // the grid can take its own pictures (landscape-shaped in portrait) while the big preview keeps the page's
    const split = levelSelectHtml(g, art, () => 'blob:grid');
    expect(split.match(/src="blob:grid"/g)).toHaveLength(CAMPAIGN.length);
    expect(split).toContain('src="blob:big"'); expect(split).not.toContain('src="blob:tile"');
    expect(modesHtml({ ...g, page: 'modes' })).toContain('td-card');
    const level = BAKED_LEVELS[specKey(CAMPAIGN[0])];
    expect(levelImage(level, undefined)).toContain('--ground:#3d4038');
    expect(levelImage(level, () => 'blob:x')).toBe('<img class="td-map" src="blob:x" alt="" draggable="false">');
    // once the next Quick Ride and Endless maps are built, their cards show them instead of a placeholder
    const modes = { ...g, page: 'modes' as const };
    expect(modesHtml(modes)).toContain('td-quick');
    const withMaps = modesHtml(modes, { quick: level, endless: BAKED_LEVELS[specKey(CAMPAIGN[1])] }, () => 'blob:card');
    expect(withMaps).not.toContain('td-quick');
    expect(withMaps).not.toContain('td-endless');
    expect(withMaps.match(/<img class="td-map"/g)).toHaveLength(3);
  });
});

describe('level loading', () => {
  it('a renderer that gates loads holds a new level (time, trainer, input) until levelReady', () => {
    const s = menu(3);
    s.sim.receive!({ type: 'loadGate' });
    s.sim.receive!({ type: 'levelTile', index: 2 }); s.step(1);
    s.sim.receive!({ type: 'levelStart' }); s.step(1);
    expect(snap(s).phase).toBe('run'); expect(snap(s).loading).toBe(true);
    const t = snap(s).t, lull = snap(s).lull;
    s.step(60);
    expect(snap(s).t).toBe(t); expect(snap(s).lull).toBe(lull); expect(snap(s).loading).toBe(true);
    expect(s.sim.hud!().targetZone?.label).toBe('Preparing the level');
    s.sim.receive!({ type: 'levelReady' }); s.step(1);
    expect(snap(s).loading).toBe(false); expect(snap(s).t).toBeGreaterThan(t);
  });
  it('gives up waiting after levelLoadMaxS, and never waits without a gate', () => {
    const s = menu(3);
    s.sim.receive!({ type: 'loadGate' });
    s.sim.receive!({ type: 'levelTile', index: 0 }); s.step(1);
    s.sim.receive!({ type: 'levelStart' }); s.step(1);
    expect(snap(s).loading).toBe(true);
    s.step(Math.ceil(12 * 30) + 2);
    expect(snap(s).loading).toBe(false);
    const free = menu(3);
    free.sim.receive!({ type: 'levelTile', index: 0 }); free.step(1);
    free.sim.receive!({ type: 'levelStart' }); free.step(1);
    expect(snap(free).loading).toBe(false);
  });
  it('the loading card names the level and shows its picture and a progress bar', () => {
    const s = menu(3);
    s.sim.receive!({ type: 'levelTile', index: 2 }); s.step(1);
    s.sim.receive!({ type: 'levelStart' }); s.step(1);
    const html = loadingHtml(snap(s), (_l, preview) => (preview ? 'blob:big' : null));
    expect(html).toContain(CAMPAIGN[2].name); expect(html).toContain('Campaign');
    expect(html).toContain('src="blob:big"'); expect(html).toContain('role="progressbar"');
    expect(loadingStage(0)).not.toBe(loadingStage(0.5)); expect(loadingStage(1)).toBe('Waking the hive');
  });
});

describe('touch steppers', () => {
  it('a card\'s own ◀ ▶ (garageStep) steps the campaign level and the Quick Ride length without starting a ride', () => {
    const s = menu(3);
    const quick = () => snap(s).garage!.rows[1].name;
    expect(quick()).toContain('20 min');
    s.sim.receive!({ type: 'garageStep', row: 1, step: 1 }); s.step(1);
    expect(snap(s).phase).toBe('garage'); expect(snap(s).garage!.sel).toBe(1); expect(quick()).not.toContain('20 min');
    s.sim.receive!({ type: 'garageStep', row: 1, step: -1 }); s.step(1);
    expect(quick()).toContain('20 min');
    const before = snap(s).garage!.campaignSel;
    s.sim.receive!({ type: 'garageStep', row: 0, step: -1 }); s.step(1);
    expect(snap(s).garage!.campaignSel).toBe(before - 1); expect(snap(s).phase).toBe('garage');
    s.sim.receive!({ type: 'garageStep', row: 0, step: 7 }); s.step(1); // malformed: ignored
    expect(snap(s).garage!.campaignSel).toBe(before - 1);
  });
  it('New map rerolls the Quick Ride seed (the card previews the next map) without starting it', () => {
    const s = menu(3);
    const seed = snap(s).nextMaps[0].seed;
    s.sim.receive!({ type: 'quickReroll' }); s.step(1);
    expect(snap(s).phase).toBe('garage'); expect(snap(s).nextMaps[0].seed).toBe(seed + 1); expect(snap(s).garage!.sel).toBe(1);
  });
  it('the Quick Ride card carries ◀ ▶ buttons, the level picture only a swipe; a sideways swipe is a step, a scroll is not', () => {
    const s = menu(3);
    const g = snap(s).garage!;
    const modes = modesHtml(g);
    expect(modes.match(/data-command="garageStep"/g)).toHaveLength(2); // the Quick Ride card (Campaign opens the grid)
    expect(modes).toContain('data-command="quickReroll"');
    const grid = levelSelectHtml({ ...g, page: 'campaign', levelSel: 0 });
    expect(grid).toContain('data-swipe="levelTile"');
    expect(grid).not.toContain('td-step'); // the tiles pick levels
    expect(swipeStep(-80, 10)).toBe(1); expect(swipeStep(80, -5)).toBe(-1);
    expect(swipeStep(30, 0)).toBe(0); expect(swipeStep(60, 80)).toBe(0);
  });
});
