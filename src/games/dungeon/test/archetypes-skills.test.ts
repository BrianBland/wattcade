import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TuningRegistry } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import { DEFAULT_CFG } from '../sim/director';
import {
  ARCHETYPES, ARCHETYPE_ORDER, PACE_MODES, archetypeDirectorCfg, grimpeurProgress, isArchetypeUnlocked,
} from '../sim/archetypes';
import {
  SKILL_TREES, computeTreeMods, deriveBuildTitle, investSkillNode, nodeState, quickPickCards, type SkillRanks,
} from '../sim/skillTree';
import { quickPickLayout, fullTreeLayout } from '../render/skillTreeUi';
import { campLayout } from '../render/campUi';
import type { DungeonSnapshot } from '../sim/types';

class PadInput {
  private queued = new Set<Button>();
  private st: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' };
  press(b: Button) { this.queued.add(b); }
  beginTick() {
    this.st = { ...this.st, pressed: new Set(this.queued), held: new Set(this.queued), released: new Set() };
    this.queued.clear();
  }
  state(): InputState { return this.st; }
}

describe('Hero Archetypes & Workout Control', () => {
  it('starts with Rouleur and Puncheur unlocked and locks Grimpeur until Floor 4 or 10 climbs', () => {
    expect(isArchetypeUnlocked('rouleur', { bestFloor: 1, climbs: 0 })).toBe(true);
    expect(isArchetypeUnlocked('puncheur', { bestFloor: 1, climbs: 0 })).toBe(true);
    expect(isArchetypeUnlocked('grimpeur', { bestFloor: 3, climbs: 9 })).toBe(false);
    expect(isArchetypeUnlocked('grimpeur', { bestFloor: 4, climbs: 0 })).toBe(true);
    expect(isArchetypeUnlocked('grimpeur', { bestFloor: 1, climbs: 10 })).toBe(true);
    expect(grimpeurProgress({ bestFloor: 1, climbs: 5 }).pct).toBeCloseTo(0.5, 2);
  });

  it('produces genuinely distinct ERG and Grade workout profiles per archetype and respects mid-ride Pace Bias', () => {
    const r = archetypeDirectorCfg(DEFAULT_CFG, 'rouleur', 0);
    const p = archetypeDirectorCfg(DEFAULT_CFG, 'puncheur', 0);
    const g = archetypeDirectorCfg(DEFAULT_CFG, 'grimpeur', 0);

    // Puncheur has punchier shorter sprints; Grimpeur has steepest sustained climbs; Rouleur has smooth aerobic base
    expect(p.targets.ambush.erg).toBeGreaterThan(r.targets.ambush.erg);
    expect(p.ambushS).toBeLessThan(r.ambushS);
    expect(g.targets.boss.grade).toBeGreaterThan(r.targets.boss.grade);
    expect(g.targets.explore.grade).toBeGreaterThan(p.targets.explore.grade);

    // Pace Bias shifts active segments (both ERG & Grade) while keeping warmup/cooldown safe
    const rCool = archetypeDirectorCfg(DEFAULT_CFG, 'rouleur', -1);
    const rPush = archetypeDirectorCfg(DEFAULT_CFG, 'rouleur', 1);
    expect(rCool.targets.explore.erg).toBeLessThan(r.targets.explore.erg);
    expect(rPush.targets.explore.erg).toBeGreaterThan(r.targets.explore.erg);
    expect(rCool.targets.ambush.grade).toBeLessThan(r.targets.ambush.grade);
    expect(rPush.targets.ambush.grade).toBeGreaterThan(r.targets.ambush.grade);
    expect(rPush.targets.warmup.erg).toBe(r.targets.warmup.erg);
    expect(rCool.targets.cooldown.erg).toBe(r.targets.cooldown.erg);
  });
});

describe('Diablo-Style 3-Branch Skill Trees & Mutually Exclusive Forks', () => {
  it('defines 3 branches x 5 nodes for every launch archetype and strictly locks sibling forks for the run', () => {
    for (const id of ARCHETYPE_ORDER) {
      const branches = SKILL_TREES[id];
      expect(branches).toHaveLength(3);
      for (const b of branches) {
        expect(b.nodes).toHaveLength(5);
        const [t1, t2, fa, fb, t4] = b.nodes;
        const ranks: SkillRanks = {};

        // Tier prerequisites enforced
        expect(nodeState(id, ranks, t1.id)).toBe('available');
        expect(nodeState(id, ranks, t2.id)).toBe('locked');
        expect(nodeState(id, ranks, fa.id)).toBe('locked');
        expect(nodeState(id, ranks, t4.id)).toBe('locked');

        // Invest T1 -> unlocks T2 -> invest T2 -> unlocks both Forks
        expect(investSkillNode(id, ranks, t1.id)).toBe(true);
        expect(nodeState(id, ranks, t2.id)).toBe('available');
        expect(investSkillNode(id, ranks, t2.id)).toBe(true);
        expect(nodeState(id, ranks, fa.id)).toBe('available');
        expect(nodeState(id, ranks, fb.id)).toBe('available');

        // Picking Fork A permanently locks out Fork B and unlocks Capstone T4
        expect(investSkillNode(id, ranks, fa.id)).toBe(true);
        expect(nodeState(id, ranks, fa.id)).toBe('maxed');
        expect(nodeState(id, ranks, fb.id)).toBe('locked-out');
        expect(investSkillNode(id, ranks, fb.id)).toBe(false);
        expect(nodeState(id, ranks, t4.id)).toBe('available');
        expect(investSkillNode(id, ranks, t4.id)).toBe(true);
        expect(nodeState(id, ranks, t4.id)).toBe('maxed');
      }
    }
  });

  it('generates 3 branch-diverse Quick-Pick cards, derives build titles, and applies Boss Trophy +1 branch bonus', () => {
    const ranks: SkillRanks = {};
    const initial = quickPickCards('rouleur', ranks);
    expect(initial).toHaveLength(3);
    expect(new Set(initial.map((c) => c.branch.id)).size).toBe(3);

    investSkillNode('rouleur', ranks, 'r_b_t1');
    investSkillNode('rouleur', ranks, 'r_b_t2');
    investSkillNode('rouleur', ranks, 'r_m_t1');
    investSkillNode('rouleur', ranks, 'r_m_t2');
    expect(deriveBuildTitle('rouleur', ranks)).toBe('Aegis-Flywheel Rouleur');

    const baseMods = computeTreeMods('rouleur', ranks, { cadence: 85, powerZone: 2, effortZone: 2, sprinting: false, firedUp: false, climbing: false });
    const relicMods = computeTreeMods('rouleur', ranks, { cadence: 85, powerZone: 2, effortZone: 2, sprinting: false, firedUp: false, climbing: false, relicBonusBranches: [0] });
    expect(relicMods.armorAdd).toBeGreaterThan(baseMods.armorAdd);
    expect(relicMods.thornsPct).toBeGreaterThan(baseMods.thornsPct);
  });
});

describe('Sim integration: Archetype Select, Pace Control, Room-Clear Auto-Popup & Pause Build Inspector', () => {
  it('lets the rider switch unlocked archetypes in Camp, blocks locked Grimpeur, and adjusts Pace Bias mid-ride via D-pad L/R', () => {
    const pad = new PadInput();
    const s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed: 5 });
    const snap = () => s.sim.snapshot() as DungeonSnapshot;

    expect(snap().archetype.id).toBe('rouleur');
    // Tapping locked Grimpeur stays on Rouleur
    s.sim.receive?.({ type: 'selectArchetype', id: 'grimpeur' });
    s.step(1);
    expect(snap().archetype.id).toBe('rouleur');

    // Selecting unlocked Puncheur switches archetype
    s.sim.receive?.({ type: 'selectArchetype', id: 'puncheur' });
    s.step(1);
    expect(snap().archetype.id).toBe('puncheur');

    // Begin run
    pad.press('b');
    s.step(1);
    expect(snap().phase).toBe('run');
    expect(snap().paceBias.bias).toBe(0);

    // D-pad Right -> Push Hard (+1); D-pad Left twice -> Cool Off (-1)
    pad.press('right'); s.step(1);
    expect(snap().paceBias.bias).toBe(1);
    expect(snap().paceBias.id).toBe(PACE_MODES[1].id);
    pad.press('left'); s.step(1);
    pad.press('left'); s.step(1);
    expect(snap().paceBias.bias).toBe(-1);
    expect(snap().paceBias.id).toBe(PACE_MODES[-1].id);
  });

  it('exposes Pause Menu Build Inspector via menuActions() and toggles Full Tree / Quick-Pick cleanly', () => {
    const reg = new TuningRegistry({ profileId: 'skill-pause' });
    const pad = new PadInput();
    const s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed: 5, simOpts: { skipCamp: true }, tuningRegistry: reg });
    const snap = () => s.sim.snapshot() as DungeonSnapshot;

    const actions = s.sim.menuActions?.() ?? [];
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('build-tree');

    // Trigger Pause Menu extension action -> opens Full Tree Build Inspector on flat recovery road
    s.sim.receive?.(actions[0].action);
    s.step(1);
    expect(snap().skillTree.offer).not.toBeNull();
    expect(snap().skillTree.offer?.mode).toBe('full');
    expect(snap().skillTree.offer?.manual).toBe(true);
    expect(s.sim.hud!().touchControls).toEqual([]);

    // Close with B -> returns cleanly to run
    pad.press('b');
    s.step(1);
    expect(snap().skillTree.offer).toBeNull();
    expect(s.sim.hud!().touchControls).toEqual(['left', 'right', 'a', 'b', 'y', 'z']);
  });
});

describe('Inset-safe pure UI layouts (Quick-Pick, Full Tree & Camp)', () => {
  const viewports: Array<[number, number, number, number]> = [
    [1280, 800, 100, 1.2],
    [1180, 820, 90, 1.2],
    [820, 1180, 120, 1.2],
    [390, 844, 100, 1],
    [640, 480, 60, 1],
  ];

  for (const [W, H, inset, u] of viewports) {
    it(`${W}x${H} (inset ${inset}): keeps Quick-Pick, Full Tree, and Camp UI above H - inset`, () => {
      const lim = H - inset + 1e-6;
      const qp = quickPickLayout(W, H, inset, u, 3);
      for (const r of [...qp.cards, qp.modeBtn, qp.closeBtn]) {
        expect(r.y + r.h).toBeLessThanOrEqual(lim);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
      }
      expect(qp.hintY).toBeLessThanOrEqual(lim);

      const ft = fullTreeLayout(W, H, inset, u);
      for (const r of [ft.header, ft.modeBtn, ft.closeBtn, ft.inspector, ft.investBtn, ...ft.columns, ...ft.nodes.flat()]) {
        expect(r.y + r.h).toBeLessThanOrEqual(lim);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
      }

      const cp = campLayout(W, H, inset, u, true);
      for (const r of [...cp.archCards, cp.rowsArea, ...(cp.resultBox ? [cp.resultBox] : [])]) {
        expect(r.y + r.h).toBeLessThanOrEqual(lim);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
      }
      expect(cp.hintY).toBeLessThanOrEqual(lim);
    });
  }
});
