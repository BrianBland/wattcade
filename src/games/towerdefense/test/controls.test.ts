import { LEVEL_0 } from '../sim/level';
import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import type { TdSnapshot } from '../sim/types';
import { levelGeometry } from '../sim/level';

class Pad {
  held = new Set<Button>(); private pressed = new Set<Button>(); private released = new Set<Button>();
  private st: InputState = { held: this.held, pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' };
  down(b: Button) { this.held.add(b); this.pressed.add(b); }
  up(b: Button) { this.held.delete(b); this.released.add(b); }
  tap(b: Button) { this.down(b); this.up(b); }
  beginTick() { this.st = { ...this.st, pressed: this.pressed, released: this.released }; this.pressed = new Set(); this.released = new Set(); }
  state() { return this.st; }
}
const snap = (s: ReturnType<typeof createGameSession>) => s.sim.snapshot() as TdSnapshot;
const geo = levelGeometry(LEVEL_0);
function rig(stars = 99) {
  const pad = new Pad(), s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed: 1,
    simOpts: { stars, skipGarage: true, level: LEVEL_0 } });
  s.tuning.set('towerdefense.startScrap', 1000);
  s.tuning.set('towerdefense.baseHp', 1000); // isolate input behavior from falling mid-gesture
  s.step(1);
  const press = (b: Button) => { pad.tap(b); s.step(1); };
  return { s, pad, press };
}

describe('weapon switching (Y / B / Z)', () => {
  it('a face button mounts its weapon; the turret holds fire while it mounts; the mounted one is a no-op', () => {
    const { s, press } = rig();
    s.step(30 * 50); // the first wave is on the road
    expect(snap(s).weapon).toBe('gatling');
    press('z');
    expect(snap(s).weapon).toBe('rail'); expect(snap(s).swapLeft).toBeGreaterThan(2.9);
    const dealt = () => Number(s.debugValues().dealt_rail ?? 0);
    const before = dealt();
    s.step(30 * 2.8); expect(dealt()).toBe(before); // silent while mounting (3 s)
    s.step(30 * 3); expect(snap(s).swapLeft).toBe(0);
    press('z'); expect(snap(s).swapLeft).toBe(0); // already mounted
    press('b'); expect(snap(s).weapon).toBe('flame');
    press('y'); expect(snap(s).weapon).toBe('gatling'); // a change of mind restarts the mount
    expect(snap(s).swapLeft).toBeGreaterThan(2.9);
    const switched = s.finish().events.filter((e) => e.type === 'weaponSwitched').map((e) => e.data?.weapon);
    expect(switched).toEqual(['rail', 'flame', 'gatling']);
  });
  it('a rider keeps the weapon they chose across waves; bots mount the brood weapon by themselves', () => {
    const { s } = rig();
    for (let i = 0; i < 30 * 400 && snap(s).wave < 3; i++) s.step(1);
    expect(snap(s).wave).toBeGreaterThanOrEqual(3);
    expect(s.finish().events.some((e) => e.type === 'weaponSwitched')).toBe(false);
    const bot = createGameSession({ game: module, profile: testProfile(), input: new Pad(), fake: { script: 'z2' }, seed: 1, simOpts: { stars: 99, skipGarage: true, level: LEVEL_0, weapon: 'auto' } });
    for (let i = 0; i < 30 * 400 && (bot.sim.snapshot() as TdSnapshot).wave < 3; i++) bot.step(1);
    expect(bot.finish().events.some((e) => e.type === 'weaponSwitched')).toBe(true);
  });
  it('the HUD shows Y / B / Z weapon chips with the mounted one ready and a mount in progress filling', () => {
    const { s, press } = rig();
    const chips = () => s.sim.hud!().controls!.filter((c) => ['y', 'b', 'z'].includes(c.button));
    expect(chips().map((c) => c.shortLabel)).toEqual(['Gatling', 'Fireball', 'Railgun']);
    expect(chips()[0].indicator).toMatchObject({ status: 'Mounted', ready: true });
    press('b');
    const mounting = chips()[1].indicator;
    expect(mounting).toMatchObject({ status: 'Mounting', ready: false }); expect((mounting as { fill: number }).fill).toBeLessThan(0.1);
    expect(s.sim.hud!().touchControls).toEqual(['y', 'b', 'z']);
  });
});

describe('pad cursor and build menu', () => {
  const at = (i: number) => (i === geo.basePad ? geo.base : geo.pads[i]);
  it('the D-pad moves the cursor to the nearest pad that way on screen, in portrait and landscape', () => {
    for (const turned of [false, true]) {
      const { s, press } = rig();
      s.sim.receive!({ type: 'padOrder', turned }); s.step(1);
      const screen = (i: number) => turned ? { x: -at(i).y, y: at(i).x } : { x: at(i).x, y: at(i).y };
      for (const [b, dx, dy] of [['right', 1, 0], ['down', 0, 1], ['left', -1, 0], ['up', 0, -1]] as const) {
        const from = snap(s).padCursor;
        press(b);
        const to = snap(s).padCursor, a = screen(from), c = screen(to);
        if (to === from) continue; // nothing lies that way
        const vx = c.x - a.x, vy = c.y - a.y;
        expect((vx * dx + vy * dy) / Math.hypot(vx, vy)).toBeGreaterThanOrEqual(0.5);
      }
      expect(snap(s).workshop).toBeNull();
    }
  });
  it('A opens the menu at the cursor; the D-pad walks the 2x2 grid to Exit, and A on Exit closes it', () => {
    const { s, press } = rig();
    const empty = geo.pads.find((p) => !snap(s).towers.some((t) => t.pad === p.id))!.id;
    for (let i = 0; i < 40 && snap(s).padCursor !== empty; i++) press(['right', 'down', 'left', 'up'][i % 4] as Button);
    s.sim.receive!({ type: 'pad', pad: empty }); s.step(1); s.sim.receive!({ type: 'close' }); s.step(1); // touch tap moves the cursor too
    expect(snap(s).padCursor).toBe(empty);
    press('a');
    const ws = () => snap(s).workshop!;
    expect(ws().pad).toBe(empty); expect(ws().rows).toHaveLength(4);
    const walk = (b: Button) => { press(b); return ws().row; };
    while (ws().row !== 0) walk('up');
    expect(walk('right')).toBe(1); expect(walk('down')).toBe(3); expect(walk('down')).toBe(4); // Exit
    expect(walk('left')).toBe(4); expect(walk('down')).toBe(0); expect(walk('up')).toBe(4);
    expect(walk('up')).toBe(2);
    walk('down'); press('a');
    expect(snap(s).workshop).toBeNull(); expect(snap(s).towers.some((t) => t.pad === empty)).toBe(false);
  });
  it('A builds the highlighted tower; weapon buttons still switch with the menu open', () => {
    const { s, press } = rig();
    press('a');
    const pad = snap(s).workshop!.pad, row = snap(s).workshop!.row;
    press('z'); expect(snap(s).weapon).toBe('rail'); expect(snap(s).workshop).not.toBeNull();
    press('a');
    expect(snap(s).towers.find((t) => t.pad === pad)?.kind).toBe(snap(s).workshop!.rows.length ? ['tesla', 'flamer', 'lens', 'mortar'][row] : undefined);
  });
  it('the Mortar is earned at 4★: locked rows cannot be built', () => {
    const { s, press } = rig(0);
    press('a');
    const rows = snap(s).workshop!.rows, mortar = rows.findIndex((r) => r.tower === 'mortar');
    expect(rows[mortar]).toMatchObject({ locked: true, affordable: false, desc: 'Unlocks at 4★' });
    s.sim.receive!({ type: 'row', row: mortar, pad: snap(s).workshop!.pad, revision: snap(s).workshop!.revision }); s.step(1);
    expect(snap(s).towers).toHaveLength(0);
    expect(rig(4).s.sim.snapshot()).toBeTruthy();
  });
  it('pause discards queued taps and the button that resumes play', () => {
    const { s, pad } = rig();
    s.sim.receive!({ type: 'weapon', weapon: 'rail', epoch: snap(s).inputEpoch }); s.sim.receive!({ type: 'inputCancel' });
    pad.tap('b'); s.step(1);
    expect(snap(s).weapon).toBe('gatling');
    pad.tap('b'); s.step(1); expect(snap(s).weapon).toBe('flame');
  });
});
