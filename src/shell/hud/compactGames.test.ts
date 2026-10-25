import { expect, it } from 'vitest';
import { allGames } from '../../games/registry';
import { createGameSession, NullInput, testProfile } from '../../core';
import { synthTimeline } from '../../media/synth/queue';
import { buildPad, compactButtons } from './padModel';

it('preserves every mapped button and game-specific shifter across all eight games and menu/play states', () => {
  for (const game of allGames) for (const playing of [false, true]) {
    const s = createGameSession({ game, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' },
      media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) },
      simOpts: { autopilot: playing, skipGarage: playing } });
    try {
      s.step(30);
      const hud = s.sim.hud?.() ?? {}, pad = buildPad(hud.controls ?? [], !!hud.gears);
      for (const cluster of [pad.left.stick, pad.right.stick, pad.left.shift, pad.right.shift]) {
        if (!cluster) continue;
        const actual = compactButtons(cluster);
        expect(new Set(actual.map(b => b.id)), `${game.id}: ${cluster.kind}`).toEqual(new Set(cluster.buttons.filter(b => b.mapped).map(b => b.id)));
        for (const b of actual) {
          const original = (hud.controls ?? []).find(h => h.button === b.id);
          if (original) { expect(b.touch).toBe(original.touch); expect(b.cooldown).toBe(original.cooldown); expect(b.active).toBe(original.active); }
        }
        if (cluster.kind === 'dpad') expect(actual.every(b => ['left','right','up','down'].includes(b.id))).toBe(true);
        if (cluster.kind === 'face') expect(actual.every(b => ['a','b','y','z'].includes(b.id))).toBe(true);
      }
      if (playing && ['cadenza','watershed','starfighter','dungeon'].includes(game.id)) expect(compactButtons(pad.left.stick).map(b => b.id)).toEqual(['left','right']);
      if (hud.controls?.some(h => h.button === 'paddles')) expect(pad.left.paddle.mapped).toBe(true);
      if (game.id === 'cadenza' && playing) expect(compactButtons(pad.right.stick).map(b => [b.id, b.label])).toEqual([['z','Left'],['a','Right']]);
    } finally { s.sim.dispose?.(); }
  }
});

it('keeps individual arrow actions together, face buttons ordered, and non-gear shifters usable', () => {
  const hints = [
    { button:'a' as const,label:'Build' },{button:'down' as const,label:'Workshop'},
    {button:'b' as const,label:'Overcharge'},{button:'y' as const,label:'Slow field'},{button:'z' as const,label:'Rail'},
    {button:'up' as const,label:'Hold sprint'},{button:'left' as const,label:'Closer'},{button:'right' as const,label:'Further'},
    {button:'shiftUpR' as const,label:'Dash'},{button:'shiftDnR' as const,label:'Potion'},
  ];
  const pad=buildPad(hints,true);
  expect(compactButtons(pad.left.stick).map(b=>b.label)).toEqual(['Closer','Further','Hold sprint','Workshop']);
  expect(compactButtons(pad.right.stick).map(b=>b.id)).toEqual(['a','b','y','z']);
  expect(pad.right.shift?.gears).not.toBe(true);
  expect(compactButtons(pad.right.shift!).map(b=>b.label)).toEqual(['Potion','Dash']);
});
