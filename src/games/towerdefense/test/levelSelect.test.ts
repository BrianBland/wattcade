import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { CAMPAIGN } from '../sim/campaign';
import { BAKED_LEVELS, specKey } from '../sim/baked';
import { generateLevel } from '../sim/generator';
import { levelPreviewSvg, levelSelectHtml, modesHtml } from '../render/levelSelect';
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
    for (const turned of [false, true]) {
      const html = levelSelectHtml(g, turned);
      expect(html.match(/data-command="levelTile"/g)).toHaveLength(CAMPAIGN.length);
      expect(html).toContain(CAMPAIGN[3].name);
      expect(html).toContain(`${CAMPAIGN[3].minutes} min`);
      expect(html.match(/class="td-tile[^"]*locked/g)!.length).toBe(CAMPAIGN.length - 4);
      expect(html).toContain(turned ? 'viewBox="0 0 112 80"' : 'viewBox="0 0 80 112"');
      expect(modesHtml({ ...g, page: 'modes' }, turned)).toContain('td-card');
    }
    const level = BAKED_LEVELS[specKey(CAMPAIGN[0])];
    expect(levelPreviewSvg(level, false).match(/<circle/g)!.length).toBe(level.pads.length + 2);
    // once the next Quick Ride and Endless maps are built, their cards preview them instead of a placeholder
    const modes = { ...g, page: 'modes' as const };
    expect(modesHtml(modes, false)).toContain('td-quick');
    const withMaps = modesHtml(modes, false, { quick: level, endless: BAKED_LEVELS[specKey(CAMPAIGN[1])] });
    expect(withMaps).not.toContain('td-quick');
    expect(withMaps).not.toContain('td-endless');
    expect(withMaps.match(/<svg class="td-map"/g)).toHaveLength(3);
  });
});
