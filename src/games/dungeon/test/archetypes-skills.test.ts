import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TuningRegistry } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import { DEFAULT_CFG } from '../sim/director';
import {
  ARCHETYPES, ARCHETYPE_ORDER, archetypeDirectorCfg, grimpeurProgress, isArchetypeUnlocked,
} from '../sim/archetypes';
import {
  SKILL_TREES, computeTreeMods, deriveBuildTitle, investSkillNode, maxTreePoints, nodeState, quickPickCards, type SkillRanks,
} from '../sim/skillTree';
import { applyStatus, emptyStatuses, evaluateTerrainLoad, tickStatuses } from '../sim/statusEffects';
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

describe('Hero Archetypes & Diegetic Terrain / Status Effects', () => {
  it('starts with Rouleur and Puncheur unlocked and locks Grimpeur until Floor 4 or 10 climbs', () => {
    expect(isArchetypeUnlocked('rouleur', { bestFloor: 1, climbs: 0 })).toBe(true);
    expect(isArchetypeUnlocked('puncheur', { bestFloor: 1, climbs: 0 })).toBe(true);
    expect(isArchetypeUnlocked('grimpeur', { bestFloor: 3, climbs: 9 })).toBe(false);
    expect(isArchetypeUnlocked('grimpeur', { bestFloor: 4, climbs: 0 })).toBe(true);
    expect(isArchetypeUnlocked('grimpeur', { bestFloor: 1, climbs: 10 })).toBe(true);
    expect(grimpeurProgress({ bestFloor: 1, climbs: 5 }).pct).toBeCloseTo(0.5, 2);
  });

  it('produces genuinely distinct ERG and Grade workout profiles per archetype', () => {
    const r = archetypeDirectorCfg(DEFAULT_CFG, 'rouleur');
    const p = archetypeDirectorCfg(DEFAULT_CFG, 'puncheur');
    const g = archetypeDirectorCfg(DEFAULT_CFG, 'grimpeur');

    // Puncheur has punchier shorter sprints; Grimpeur has steepest sustained climbs; Rouleur has smooth aerobic base
    expect(p.targets.ambush.erg).toBeGreaterThan(r.targets.ambush.erg);
    expect(p.ambushS).toBeLessThan(r.ambushS);
    expect(g.targets.boss.grade).toBeGreaterThan(r.targets.boss.grade);
    expect(g.targets.explore.grade).toBeGreaterThan(p.targets.explore.grade);
  });

  it('turns status debuffs and heavy encounters into real trainer load that soft-pedaling bogs down on and wattage overcomes', () => {
    const st = emptyStatuses();
    expect(applyStatus(st, 'slimed', 4)).toBe(true);
    expect(applyStatus(st, 'headwind', 3)).toBe(true);

    const soft = evaluateTerrainLoad({
      statuses: st, baseErg: 0.65, inCombat: true, hasElite: false, isAmbush: false, bossActive: false, bossPhase: 1, ftpFraction: 0.5,
    });
    const push = evaluateTerrainLoad({
      statuses: st, baseErg: 0.65, inCombat: true, hasElite: false, isAmbush: false, bossActive: false, bossPhase: 1, ftpFraction: 1.15,
    });

    expect(soft.extraGrade).toBeGreaterThanOrEqual(5);
    expect(soft.extraErg).toBeGreaterThanOrEqual(0.15);
    expect(soft.bogged).toBe(true);
    expect(soft.moveMult).toBeLessThan(0.75);
    expect(soft.dmgMult).toBeLessThan(0.9);

    expect(push.bogged).toBe(false);
    expect(push.moveMult).toBeGreaterThan(soft.moveMult);
    expect(push.dmgMult).toBeGreaterThan(1);

    // Boss phases escalate mountain-climb grade
    const p1 = evaluateTerrainLoad({ statuses: emptyStatuses(), baseErg: 0.7, inCombat: true, hasElite: false, isAmbush: false, bossActive: true, bossPhase: 1, ftpFraction: 0.85 });
    const p3 = evaluateTerrainLoad({ statuses: emptyStatuses(), baseErg: 0.7, inCombat: true, hasElite: false, isAmbush: false, bossActive: true, bossPhase: 3, ftpFraction: 0.85 });
    expect(p3.extraGrade).toBeGreaterThan(p1.extraGrade);

    tickStatuses(st, 5);
    expect(st.slimed.left).toBe(0);
    expect(st.headwind.left).toBe(0);
  });
});

describe('Diablo-Style 3-Branch Skill Trees (27 SP depth) & Mutually Exclusive Forks', () => {
  it('defines 3 branches x 5 nodes (27 SP total per archetype) and strictly locks sibling forks for the run', () => {
    for (const id of ARCHETYPE_ORDER) {
      const branches = SKILL_TREES[id];
      expect(branches).toHaveLength(3);
      expect(maxTreePoints(id)).toBe(27);
      for (const b of branches) {
        expect(b.nodes).toHaveLength(5);
        const [t1, t2, fa, fb, t4] = b.nodes;
        expect(t1.maxRank).toBe(3);
        expect(t2.maxRank).toBe(3);
        expect(fa.maxRank).toBe(2);
        expect(fb.maxRank).toBe(2);
        expect(t4.maxRank).toBe(1);
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

        // Picking Fork A (2 ranks) permanently locks out Fork B on rank 1 and unlocks Capstone T4
        expect(investSkillNode(id, ranks, fa.id)).toBe(true);
        expect(nodeState(id, ranks, fa.id)).toBe('invested');
        expect(nodeState(id, ranks, fb.id)).toBe('locked-out');
        expect(investSkillNode(id, ranks, fb.id)).toBe(false);
        expect(investSkillNode(id, ranks, fa.id)).toBe(true);
        expect(nodeState(id, ranks, fa.id)).toBe('maxed');
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

describe('Sim integration: Archetype Select, 14-Segment Snake Wyrm, Monotonic Orbit Blades & Pause Build Inspector', () => {
  it('lets the rider switch unlocked archetypes in Camp and blocks locked Grimpeur', () => {
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

    // Begin run — no manual left/right pace buttons
    pad.press('b');
    s.step(1);
    expect(snap().phase).toBe('run');
    expect(s.sim.hud!().touchControls).toEqual(['a', 'b', 'y', 'z']);
  });

  it('spawns the 14-segment articulated Snake Wyrm on Floor 6 (Headwind Wyrm) that slithers smoothly around the arena', () => {
    const reg = new TuningRegistry({ profileId: 'wyrm-test' });
    reg.scoped('dungeon').num('baseDamage', 10, 1, 200, 1);
    reg.set('dungeon.baseDamage', 120);
    const s = createGameSession({
      game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 7,
      simOpts: { floor: 6, skipCamp: true, invulnerable: true, skills: 'none' }, tuningRegistry: reg,
    });
    let sawWyrm = false;
    let firstHead: { x: number; y: number } | null = null;
    let movedHead = false;
    for (let i = 0; i < 30 * 60 * 6; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as DungeonSnapshot;
      if (snap.wyrmSegs && snap.wyrmSegs.length === 14) {
        sawWyrm = true;
        if (!firstHead) firstHead = { x: snap.wyrmSegs[0].x, y: snap.wyrmSegs[0].y };
        else if (Math.hypot(snap.wyrmSegs[0].x - firstHead.x, snap.wyrmSegs[0].y - firstHead.y) > 1.5) {
          movedHead = true;
          break;
        }
      }
    }
    expect(sawWyrm).toBe(true);
    expect(movedHead).toBe(true);
  });

  it('spins orbiting chainring sawblades monotonically forward even when cadence fluctuates', () => {
    const reg = new TuningRegistry({ profileId: 'orbit-mono' });
    reg.scoped('dungeon').num('baseDamage', 10, 1, 200, 1);
    reg.set('dungeon.baseDamage', 140);
    const s = createGameSession({
      game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'intervals' }, seed: 5,
      simOpts: { skipCamp: true, invulnerable: true, skills: 'none' }, tuningRegistry: reg,
    });
    // Earn 2 SP and invest Rouleur Drafting Blades (r_m_t1 -> r_m_t2)
    for (let i = 0; i < 30 * 60 * 4; i++) {
      s.step(1);
      if ((s.sim.snapshot() as DungeonSnapshot).skillTree.unspentSP >= 2) break;
    }
    s.sim.receive?.({ type: 'openSkillTree' });
    s.step(1);
    s.sim.receive?.({ type: 'skillPick', nodeId: 'r_m_t1', confirm: true });
    s.step(1);
    s.sim.receive?.({ type: 'skillPick', nodeId: 'r_m_t2', confirm: true });
    s.step(1);
    s.sim.receive?.({ type: 'skillClose' });
    s.step(1);

    let prevAng: number | null = null;
    let checked = 0;
    for (let i = 0; i < 180; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as DungeonSnapshot;
      if (!snap.frozen && snap.orbit.length > 0) {
        const ang = Math.atan2(snap.orbit[0].y - snap.player.y, snap.orbit[0].x - snap.player.x);
        if (prevAng !== null) {
          let delta = ang - prevAng;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          // Strictly forward, smooth per-tick step (no wild reversals or multi-radian jumps)
          expect(delta).toBeGreaterThanOrEqual(0);
          expect(delta).toBeLessThan(0.35);
          if (delta > 0) checked++;
        }
        prevAng = ang;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('never interrupts mid-floor room clears with a skill popup, opening only manually or at the start of a new floor', () => {
    const reg = new TuningRegistry({ profileId: 'skill-floor-gate' });
    reg.scoped('dungeon').num('baseDamage', 10, 1, 200, 1);
    reg.set('dungeon.baseDamage', 160);
    reg.scoped('dungeon').num('skillOfferDelayS', 0.55, 0, 5, 0.1);
    reg.set('dungeon.skillOfferDelayS', 0.15);
    const s = createGameSession({
      game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 7,
      simOpts: { skipCamp: true, invulnerable: true }, tuningRegistry: reg,
    });
    let bankedOnFloor1 = false;
    let openedOnFloor1 = false;
    let openedOnFloor2 = false;
    for (let i = 0; i < 30 * 60 * 6; i++) {
      s.step(1);
      const snap = s.sim.snapshot() as DungeonSnapshot;
      if (snap.floor === 1) {
        if (snap.skillTree.unspentSP > 0 && snap.stats.roomsCleared >= 2) bankedOnFloor1 = true;
        if (snap.skillTree.offer) openedOnFloor1 = true;
      } else if (snap.floor === 2 && snap.skillTree.offer) {
        openedOnFloor2 = true;
        expect(snap.skillTree.offer.reason).toContain('Floor 2');
        break;
      }
    }
    expect(bankedOnFloor1).toBe(true);
    expect(openedOnFloor1).toBe(false);
    expect(openedOnFloor2).toBe(true);
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
    expect(s.sim.hud!().touchControls).toEqual(['a', 'b', 'y', 'z']);
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
