import { afterEach, describe, expect, it } from 'vitest';
import { createGameSession, NullInput, SCRIPTS, testProfile, TuningRegistry } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import { STANCES } from '../sim/stances';
import { loadArt } from '../render/art32';

class TriggerInput {
  private queued = new Set<Button>();
  private st: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' };
  press(b: Button) { this.queued.add(b); }
  beginTick() {
    this.st = { ...this.st, pressed: new Set(this.queued), held: new Set(this.queued), released: new Set() };
    this.queued.clear();
  }
  state(): InputState { return this.st; }
}

describe('Purgatour P0 regressions', () => {
  afterEach(() => {
    for (const k of ['test-erg-spin105', 'test-erg-soft', 'test-erg-surge']) delete SCRIPTS[k];
  });
  it('treats only initial pre-run Camp as inMenu and locks post-death Camp inputs during the DNF banner', () => {
    const reg = new TuningRegistry({ profileId: 'p0-camp' });
    reg.set('dungeon.enemyDamageScale', 3);
    reg.scoped('dungeon').num('playerHp', 100, 20, 500, 10);
    reg.set('dungeon.playerHp', 20);
    reg.scoped('dungeon').num('secondWindCdS', 540, 30, 1800, 10);
    reg.set('dungeon.secondWindCdS', 1800);

    const pad = new TriggerInput();
    const s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed: 5, tuningRegistry: reg });
    const snap = () => s.sim.snapshot() as any;

    expect(snap().phase).toBe('camp');
    expect(s.sim.inMenu!()).toBe(true);
    expect(s.sim.hud!().touchControls).toEqual([]);

    // Start first descent with B
    pad.press('b');
    s.step(1);
    expect(snap().phase).toBe('run');
    expect(s.sim.inMenu!()).toBe(false);
    expect(s.sim.hud!().touchControls).toEqual(['left', 'right', 'a', 'b', 'y', 'z']);

    // Ride until first death returns to Camp
    for (let i = 0; i < 30 * 60 * 20 && snap().stats.deaths === 0; i++) s.step(1);
    expect(snap().stats.deaths).toBe(1);
    expect(snap().phase).toBe('camp');
    expect(s.sim.inMenu!()).toBe(false);
    expect(s.sim.hud!().touchControls).toEqual([]);

    // During the 2.1 s DNF lock, pressing B or tapping camp row 0 must not immediately restart
    s.step(30); // 1.0 s
    pad.press('b');
    s.sim.receive?.({ type: 'campRow', row: 0 });
    s.step(1);
    expect(snap().phase).toBe('camp');

    // Once past 2.1 s, pressing B starts the next run
    s.step(40); // total > 2.3 s
    pad.press('b');
    s.step(1);
    expect(snap().phase).toBe('run');
  });

  it('emits only a single SECOND WIND banner when Second Wind triggers', () => {
    const reg = new TuningRegistry({ profileId: 'p0-sw' });
    reg.set('dungeon.enemyDamageScale', 3);
    reg.scoped('dungeon').num('playerHp', 100, 20, 500, 10);
    reg.set('dungeon.playerHp', 20);
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true }, tuningRegistry: reg });
    const snap = () => s.sim.snapshot() as any;
    let banners = -1;
    for (let i = 0; i < 30 * 60 * 15 && banners < 0; i++) {
      s.step(1);
      const p = snap();
      if (p.player.secondWindFlash > 0.9) {
        banners = p.fx.filter((f: any) => f.kind === 'banner' && f.text === 'SECOND WIND').length;
      }
    }
    expect(banners).toBe(1);
  });

  it('clears combat resistance grades and hides touch controls when the post-boss perk offer opens', () => {
    const reg = new TuningRegistry({ profileId: 'p0-perk-grade' });
    reg.scoped('dungeon').num('baseDamage', 10, 1, 200, 1);
    reg.set('dungeon.baseDamage', 120);
    reg.scoped('dungeon').num('playerHp', 100, 20, 500, 10);
    reg.set('dungeon.playerHp', 500);
    reg.scoped('dungeon').num('perkOfferDelayS', 2.5, 0.1, 10, 0.1);
    reg.set('dungeon.perkOfferDelayS', 0.2);

    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 7, simOpts: { skipCamp: true, erg: false }, tuningRegistry: reg });
    let opened = false;
    for (let i = 0; i < 30 * 60 * 15 && !opened; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as any;
      if (snap.perks?.offer) {
        opened = true;
        s.step(30); // allow ResistanceMixer's 750 ms command rate limit to flush
        expect(s.sim.hud!().touchControls).toEqual([]);
        const dbg = s.mixer.debug();
        const ids = dbg.activeEffects.map((e: { id: string }) => e.id);
        expect(ids).not.toContain('boss-surge');
        expect(ids).not.toContain('swamp');
        expect(ids).not.toContain('wounded');
        expect(ids).not.toContain('curse-mire');
        const cmd = dbg.lastCommand as { gradePct?: number } | null | undefined;
        expect(cmd?.gradePct).toBe(0);
      }
    }
    expect(opened).toBe(true);
  });

  it('honestly gates Strike usable/active on whether an enemy is within Strike reach', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true } });
    s.step(1);
    const s0 = s.sim.snapshot() as any;
    expect(s0.actions.find((a: any) => a.id === 'strike').usable).toBe(false);
    expect(s.sim.hud!().controls!.find((c) => c.button === 'a')!.active).toBe(false);

    let sawInReach = false;
    for (let i = 0; i < 30 * 120 && !sawInReach; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as any;
      const act = snap.actions.find((a: any) => a.id === 'strike');
      const hudA = s.sim.hud!().controls!.find((c) => c.button === 'a')!;
      expect(hudA.active).toBe(act.usable);
      if (act.usable) sawInReach = true;
    }
    expect(sawInReach).toBe(true);
  });

  it('lets ERG riders shatter curses by spinning 100+ rpm for 5 s', () => {
    SCRIPTS['test-erg-spin105'] = { ...SCRIPTS.z2, name: 'test-erg-spin105', cadence: () => 105 };
    const reg = new TuningRegistry({ profileId: 'p0-erg-curse' });
    reg.scoped('dungeon').num('curseChance', 0.08, 0, 1, 0.01);
    reg.set('dungeon.curseChance', 1);
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'test-erg-spin105' }, seed: 5, simOpts: { skipCamp: true, erg: true, invulnerable: true }, tuningRegistry: reg });

    let sawCurseToast = false, shattered = false, curseStartTick = -1;
    for (let i = 0; i < 30 * 60 * 4 && !shattered; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as any;
      if (curseStartTick < 0 && snap.curse) {
        curseStartTick = i;
        sawCurseToast = snap.toasts.some((t: any) => /Spin 100\+ rpm for 5s/i.test(t.text));
      }
      if (curseStartTick >= 0 && !snap.curse && snap.toasts.some((t: any) => /shattered/i.test(t.text))) {
        shattered = true;
        // Must shatter well before the 40-50 s natural expiry
        expect(i - curseStartTick).toBeLessThan(30 * 10);
      }
    }
    expect(sawCurseToast).toBe(true);
    expect(shattered).toBe(true);
  });

  it('drives ERG wattage from active shrines and requires ERG surge power for Exposed x2 boss damage', () => {
    const profile = testProfile(); // FTP 200
    const ftp = profile.ftp;
    const shrineErg: Record<string, number> = { fury: 0.85, sprint: 1.22, whirl: 0.6, endurance: 0.65 };

    // 1. Active shrines set the ERG target wattage when not in boss surge
    const reg = new TuningRegistry({ profileId: 'p0-erg-shrine' });
    reg.scoped('dungeon').num('baseDamage', 10, 1, 200, 1);
    reg.set('dungeon.baseDamage', 80);
    const s = createGameSession({ game: module, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 11, simOpts: { skipCamp: true, erg: true, invulnerable: true }, tuningRegistry: reg });
    let checkedShrine = false;
    for (let i = 0; i < 30 * 60 * 10 && !checkedShrine; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as any;
      const act = snap.shrines.find((sh: any) => sh.state === 'active');
      if (act && !snap.hooks.bossShield) {
        s.step(30); // allow ResistanceMixer's 750 ms command rate limit to flush
        const snap2 = s.sim.snapshot() as any;
        const still = snap2.shrines.find((sh: any) => sh.state === 'active');
        if (still && !snap2.hooks.bossShield) {
          const cmd = s.mixer.debug().lastCommand as { watts?: number } | null | undefined;
          expect(cmd?.watts).toBeCloseTo(shrineErg[still.kind] * ftp, 0);
          checkedShrine = true;
        }
      }
    }
    expect(checkedShrine).toBe(true);

    // 2. Soft-pedaling in ERG mode does NOT get the Exposed x2 sprint damage multiplier
    SCRIPTS['test-erg-soft'] = { ...SCRIPTS.z2, name: 'test-erg-soft', powerFtp: () => 0.45, cadence: () => 85 };
    SCRIPTS['test-erg-surge'] = { ...SCRIPTS.z2, name: 'test-erg-surge', powerFtp: () => 1.15, cadence: () => 85 };
    const measureExposedDmg = (script: string) => {
      const r = new TuningRegistry({ profileId: `p0-${script}` });
      r.scoped('dungeon').num('bossBigEveryS', 20, 6, 60, 1);
      r.set('dungeon.bossBigEveryS', 6);
      const sess = createGameSession({ game: module, profile, input: new NullInput(), fake: { script }, seed: 5, simOpts: { skipCamp: true, erg: true, invulnerable: true }, tuningRegistry: r });
      let hitDmg = 0;
      for (let i = 0; i < 30 * 60 * 10 && hitDmg === 0; i++) {
        const prevHp = (sess.sim.snapshot() as any).boss?.hp ?? 0;
        sess.step(1);
        const cur = sess.sim.snapshot() as any;
        if (cur.boss && cur.boss.cycle === 'exposed' && prevHp > cur.boss.hp) {
          hitDmg = prevHp - cur.boss.hp;
        }
      }
      return hitDmg;
    };
    const softHit = measureExposedDmg('test-erg-soft');
    const surgeHit = measureExposedDmg('test-erg-surge');
    expect(softHit).toBeGreaterThan(0);
    expect(surgeHit).toBeGreaterThan(0);
    // Power ratio alone is 1.15 / 0.45 = 2.55x; with the x2 Exposed surge bonus only on surgeHit, ratio is > 4x
    expect(surgeHit / softHit).toBeGreaterThan(3.8);
  });

  it('fixes stale shield metadata/roles and exposes an async renderer.ready() backed by art32 loadArt()', async () => {
    expect(module.blurb.toLowerCase()).not.toContain('shield');
    expect(module.tags).toEqual(expect.arrayContaining(['zone2', 'intervals', 'sprint', 'erg']));
    expect(STANCES.arcanist.role).toBe('expose-extender');
    await expect(loadArt()).resolves.toBeUndefined();
    const renderer = await module.loadRenderer();
    expect(typeof renderer.ready).toBe('function');
    await expect(renderer.ready!()).resolves.toBeUndefined();
  });
});
