import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import type { DungeonSnapshot } from '../sim/types';
import { CUE_BPM, PHRASE_BEATS, beatS, cueNotes, layerGain, mtof, musicFor, type DungeonCue } from '../render/musicScore';
import { DungeonMusic } from '../render/music';
import { DungeonSound } from '../render/sound';
import { JuiceEngine, activeBuffs } from '../render/juice';

function baseSnap(): DungeonSnapshot {
  const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true } });
  s.step(5);
  return s.sim.snapshot() as DungeonSnapshot;
}

describe('Purgatour AV soundscape (multi-section scores, intensity & Node-safe audio)', () => {
  it('selects camp, zone, ambush, boss (with phase acceleration), victory cues and scales intensity dynamically', () => {
    const run = baseSnap();
    expect(musicFor(run)?.cue).toBe('keep');

    // Calm empty room vs active fired-up skirmish scales dynamic combat intensity
    const calm = musicFor({ ...run, enemies: [], player: { ...run.player, firedUpLeft: 0, rallied: false } })!;
    const intense = musicFor({
      ...run,
      enemies: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1, kind: 'chaser', x: 5 + i, y: 5, r: 0.4, hp: 50, maxHp: 50,
        face: 1, hurt: 9, slowed: false, dot: false, tell: 0, variant: 0, shieldFrac: 0, exposed: false, elite: null,
      })),
      player: { ...run.player, firedUpLeft: 20, rallied: true },
    })!;
    expect(intense.intensity).toBeGreaterThan(calm.intensity + 0.3);

    const catacombs = { ...run, world: { ...run.world, theme: 2 } };
    expect(musicFor(catacombs)?.cue).toBe('catacombs');

    const deep = { ...run, world: { ...run.world, theme: 3 } };
    expect(musicFor(deep)?.cue).toBe('deep');

    const ambush = { ...run, hooks: { ...run.hooks, seg: 'ambush' } };
    expect(musicFor(ambush)?.cue).toBe('boss');

    const bossP1: DungeonSnapshot = { ...run, boss: { name: 'King Gel', hp: 1000, maxHp: 1000, active: true, phase: 1, cycle: 'idle', left: 10, fightT: 15, tide: 0, splits: [0.66, 0.33] } };
    const bossP3: DungeonSnapshot = { ...run, boss: { name: 'King Gel', hp: 200, maxHp: 1000, active: true, phase: 3, cycle: 'exposed', left: 4, fightT: 60, tide: 0, splits: [0.66, 0.33] } };
    expect(musicFor(bossP1)?.cue).toBe('boss');
    expect(musicFor(bossP3)!.tempoScale).toBeGreaterThan(musicFor(bossP1)!.tempoScale);
    expect(musicFor(bossP3)!.intensity).toBeGreaterThan(musicFor(bossP1)!.intensity);

    const camp: DungeonSnapshot = {
      ...run,
      phase: 'camp',
      camp: {
        bank: 0, sel: 0, autoStartS: 45, autoStartLeft: 45, startFloor: 1, maxStartFloor: 1, autoInvest: false,
        erg: true, selectedArchetype: 'rouleur', archetypes: [],
        grimpeur: { unlocked: false, climbs: 0, climbGoal: 3, floor: 1, floorGoal: 4, pct: 0 },
        rows: [], bestFloor: 1, runs: 1,
      },
    };
    expect(musicFor(camp)?.cue).toBe('camp');

    const campWin: DungeonSnapshot = { ...camp, camp: { ...camp.camp!, lastRun: { won: true, floor: 7, startFloor: 1, tier: 0, timeS: 1400, kills: 200, bosses: 7, perks: 6, banked: 3000, level: 12, weapon: 'Bow' } } };
    expect(musicFor(campWin)?.cue).toBe('victory');
  });

  it('produces valid multi-section 64-beat scores with A/B evolution for every theme', () => {
    const cues: DungeonCue[] = ['camp', 'keep', 'catacombs', 'crypt', 'deep', 'boss', 'victory'];
    const unpitched = new Set(['snare', 'hat', 'openhat', 'shaker']);
    for (const cue of cues) {
      expect(CUE_BPM[cue]).toBeGreaterThanOrEqual(80);
      expect(beatS(cue)).toBeGreaterThan(0.3);
      let count = 0;
      const sectionA: number[] = [];
      const sectionB: number[] = [];
      for (let b = 0; b < PHRASE_BEATS; b++) {
        const notes = cueNotes(cue, b);
        for (const n of notes) {
          count++;
          expect(n.dur).toBeGreaterThan(0);
          expect(n.vol).toBeGreaterThan(0);
          expect(n.vol).toBeLessThanOrEqual(1);
          if (n.pan !== undefined) {
            expect(n.pan).toBeGreaterThanOrEqual(-1);
            expect(n.pan).toBeLessThanOrEqual(1);
          }
          if (!unpitched.has(n.inst)) {
            expect(mtof(n.midi)).toBeGreaterThan(20);
            if (b < 16) sectionA.push(n.midi);
            if (b >= 32 && b < 48) sectionB.push(n.midi);
          }
        }
      }
      expect(count).toBeGreaterThan(120);
      // Verify genuine A vs B musical contrast (not a 4-bar loop!)
      expect(sectionA).not.toEqual(sectionB);
    }
    expect(layerGain(undefined, 0.2)).toBe(1);
    expect(layerGain(0.6, 0.3)).toBe(0);
    expect(layerGain(0.6, 0.6)).toBeGreaterThan(0.4);
    expect(layerGain(0.6, 0.85)).toBe(1);
  });

  it('safely runs DungeonMusic and DungeonSound in Node without WebAudio', () => {
    const snap = baseSnap();
    const music = new DungeonMusic();
    const sound = new DungeonSound();
    expect(() => {
      music.update(musicFor(snap), true);
      sound.update(snap);
      sound.dispose();
      music.stop();
    }).not.toThrow();
  });
});

describe('Purgatour visual juice engine', () => {
  it('adds trauma shake, spawns capped hit sparks, recoils damaged enemies, and decays cleanly', () => {
    const snap = baseSnap();
    const juice = new JuiceEngine();
    // Seed initial snapshot so seenCue initializes
    juice.update(snap, 0.033);

    // Simulate a boss explosion + enemy taking damage
    const e0 = snap.enemies[0] ?? { id: 99, kind: 'chaser', x: 5, y: 5, r: 0.4, hp: 100, maxHp: 100, face: 1, hurt: 9, slowed: false, dot: false, tell: 0, variant: 0, shieldFrac: 0 };
    const snapA: DungeonSnapshot = { ...snap, t: snap.t + 0.033, enemies: [e0] };
    juice.update(snapA, 0.033);

    const e1 = { ...e0, hp: e0.hp - 30, hurt: 0.01 };
    const nextId = (snap.cues.at(-1)?.id ?? 0) + 1;
    const snapB: DungeonSnapshot = { ...snapA, t: snapA.t + 0.033, enemies: [e1], cues: [...snapA.cues, { name: 'explode', id: nextId }] };
    juice.update(snapB, 0.033);

    expect(juice.trauma).toBeGreaterThan(0.3);
    expect(juice.particles.length).toBeGreaterThan(0);
    const rec = juice.recoilOf(e1.id);
    expect(Math.hypot(rec.dx, rec.dy)).toBeGreaterThan(0);

    // Decay over 1.5 s
    for (let i = 0; i < 45; i++) juice.update({ ...snapB, t: snapB.t + 0.033 * (i + 1) }, 0.033);
    expect(juice.trauma).toBe(0);
    expect(juice.shakeX).toBe(0);
    expect(juice.shakeY).toBe(0);
    expect(juice.recoilOf(e1.id)).toEqual({ dx: 0, dy: 0 });
  });

  it('extracts active HUD buff pills for Fired Up, Photo Finish, Pace Bias, Ward, and Rally', () => {
    const snap = baseSnap();
    const buffed: DungeonSnapshot = {
      ...snap,
      player: { ...snap.player, firedUpLeft: 42, warded: true, rallied: true, bulletTime: true },
      paceBias: { ...snap.paceBias, bias: 1, label: 'Push Hard', color: '#ff7a2a' },
    };
    const pills = activeBuffs(buffed);
    expect(pills.map((p) => p.id)).toEqual(['fired', 'bulletTime', 'pace', 'ward', 'rally']);
    expect(pills[0].label).toContain('FIRED UP 42s');
  });
});
