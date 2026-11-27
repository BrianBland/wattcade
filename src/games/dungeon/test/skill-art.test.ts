import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TuningRegistry } from '../../../core';
import { module } from '../index';
import { ARCHETYPES, ARCHETYPE_ORDER, PACE_MODES } from '../sim/archetypes';
import { SKILL_TREES } from '../sim/skillTree';
import { BRANCH_CRESTS, RELIC_ICONS, SKILL_ICONS, UI_ICONS } from '../render/skillArt';
import { GLYPHS } from '../render/font';

const VALID_TOKENS = new Set(['.', 'k', 'w', 'g', 'G', 'r', 'R', 'o', 'b', 'B', 'v', 'V', 'p', 's', 'S', 'c', 'h', 'd']);

function assertGrid(name: string, rows: readonly string[] | undefined) {
  expect(rows, `missing pixel icon for ${name}`).toBeDefined();
  expect(rows!.length, `${name} height`).toBe(12);
  let opaque = 0;
  for (const r of rows!) {
    expect(r.length, `${name} row width`).toBe(12);
    for (const ch of r) {
      expect(VALID_TOKENS.has(ch), `${name} invalid pixel token '${ch}'`).toBe(true);
      if (ch !== '.') opaque++;
    }
  }
  expect(opaque, `${name} has opaque pixels`).toBeGreaterThan(10);
}

function assertAllGlyphsSupported(label: string, text: string) {
  for (const ch of text) {
    if (ch === ' ') continue;
    expect(ch in GLYPHS, `unsupported pixel-font glyph '${ch}' in ${label}: "${text}"`).toBe(true);
  }
}

describe('skillArt pixel icons & pixel-font glyph coverage', () => {
  it('provides a valid 12x12 pixel art icon for every one of the 45 skill nodes, 9 branches, 3 relics, and 6 UI badges', () => {
    let totalNodes = 0;
    for (const aid of ARCHETYPE_ORDER) {
      assertGrid(`relic:${aid}`, RELIC_ICONS[aid]);
      for (const br of SKILL_TREES[aid]) {
        assertGrid(`branch:${br.id}`, BRANCH_CRESTS[br.id]);
        for (const node of br.nodes) {
          assertGrid(`skill:${node.id}`, SKILL_ICONS[node.id]);
          totalNodes++;
        }
      }
    }
    expect(totalNodes).toBe(45);
    for (const [k, rows] of Object.entries(UI_ICONS)) assertGrid(`ui:${k}`, rows);
  });

  it('uses only characters present in font.ts GLYPHS across all archetype, pace, and skill copy', () => {
    for (const aid of ARCHETYPE_ORDER) {
      const a = ARCHETYPES[aid];
      assertAllGlyphsSupported(`${aid}.name`, a.name);
      assertAllGlyphsSupported(`${aid}.shortName`, a.shortName);
      assertAllGlyphsSupported(`${aid}.subtitle`, a.subtitle);
      assertAllGlyphsSupported(`${aid}.jersey`, a.jersey);
      assertAllGlyphsSupported(`${aid}.workoutTag`, a.workoutTag);
      assertAllGlyphsSupported(`${aid}.ergLabel`, a.ergLabel);
      assertAllGlyphsSupported(`${aid}.gradeLabel`, a.gradeLabel);
      assertAllGlyphsSupported(`${aid}.pitch`, a.pitch);
      assertAllGlyphsSupported(`${aid}.relicName`, a.relicName);
      for (const [seg, tgt] of Object.entries(a.director.targets)) {
        if (tgt?.label) assertAllGlyphsSupported(`${aid}.director.${seg}`, tgt.label);
      }
      for (const br of SKILL_TREES[aid]) {
        assertAllGlyphsSupported(`${aid}.${br.id}.name`, br.name);
        for (const n of br.nodes) {
          assertAllGlyphsSupported(`${n.id}.name`, n.name);
          assertAllGlyphsSupported(`${n.id}.short`, n.short);
          assertAllGlyphsSupported(`${n.id}.detail`, n.detail);
          assertAllGlyphsSupported(`${n.id}.cycling`, n.cycling);
        }
      }
    }
    for (const pm of Object.values(PACE_MODES)) {
      assertAllGlyphsSupported(`pace.${pm.id}.label`, pm.label);
      assertAllGlyphsSupported(`pace.${pm.id}.shortLabel`, pm.shortLabel);
      assertAllGlyphsSupported(`pace.${pm.id}.desc`, pm.desc);
    }
  });

  it('protects unfocused Tier 3 Forks with two-step tap focus and emits distinct audio cues for upgrades, forks, and pace shifts', () => {
    const reg = new TuningRegistry({ profileId: 'skill-ux-test' });
    reg.scoped('dungeon').num('baseDamage', 10, 1, 200, 1);
    reg.set('dungeon.baseDamage', 140);
    const s = createGameSession({
      game: module,
      profile: testProfile(),
      input: new NullInput(),
      fake: { script: 'z2' },
      seed: 5,
      simOpts: { skipCamp: true, invulnerable: true, skills: 'none' },
      tuningRegistry: reg,
    });

    // Pace Bias shifts emit distinct surge / chime / swap cues
    s.sim.receive?.({ type: 'paceBias', bias: 1 });
    s.step(1);
    expect((s.sim.snapshot() as any).cues.some((c: any) => c.name === 'surge')).toBe(true);
    s.sim.receive?.({ type: 'paceBias', bias: -1 });
    s.step(1);
    expect((s.sim.snapshot() as any).cues.some((c: any) => c.name === 'chime')).toBe(true);
    s.sim.receive?.({ type: 'paceBias', bias: 0 });
    s.step(1);
    expect((s.sim.snapshot() as any).cues.some((c: any) => c.name === 'swap')).toBe(true);

    // Earn >= 3 SP by clearing rooms
    for (let i = 0; i < 30 * 60 * 5; i++) {
      s.step(1);
      if ((s.sim.snapshot() as any).skillTree.unspentSP >= 3) break;
    }
    expect((s.sim.snapshot() as any).skillTree.unspentSP).toBeGreaterThanOrEqual(3);

    // Open Full Tree inspector
    s.sim.receive?.({ type: 'openSkillTree' });
    s.step(1);
    expect((s.sim.snapshot() as any).skillTree.offer?.mode).toBe('full');

    // Invest T1 -> T2 (should emit 'upgrade')
    s.sim.receive?.({ type: 'skillPick', nodeId: 'r_b_t1', confirm: true });
    s.step(1);
    s.sim.receive?.({ type: 'skillPick', nodeId: 'r_b_t2', confirm: true });
    s.step(1);
    expect((s.sim.snapshot() as any).cues.some((c: any) => c.name === 'upgrade')).toBe(true);

    // First tap on unfocused Tier 3 Fork focuses it WITHOUT locking it in yet
    s.sim.receive?.({ type: 'skillPick', nodeId: 'r_b_t3a' });
    s.step(1);
    const afterFirstTap = s.sim.snapshot() as any;
    expect(afterFirstTap.skillTree.offer.focusNodeId).toBe('r_b_t3a');
    expect(afterFirstTap.skillTree.forks).toEqual([]);

    // Second tap on now-focused Tier 3 Fork locks it in and emits 'boltOn'
    s.sim.receive?.({ type: 'skillPick', nodeId: 'r_b_t3a' });
    s.step(1);
    const afterSecondTap = s.sim.snapshot() as any;
    expect(afterSecondTap.skillTree.forks).toContain('Aegis Riposte');
    expect(afterSecondTap.cues.some((c: any) => c.name === 'boltOn')).toBe(true);
  });
});
