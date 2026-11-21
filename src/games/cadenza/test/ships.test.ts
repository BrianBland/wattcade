import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import { selectedShip, shipHandling, unlockedShips } from '../ships';
import { MENU, type CadenzaSnapshot, type CadenzaSave } from '../sim/sim';

describe('Cadenza-local ships', () => {
  it('preserves unlocked old selections and rejects locked or unknown ships', () => {
    expect(unlockedShips(testProfile()).map(s=>s.id)).toEqual(['triad']);
    expect(selectedShip(testProfile({ achievements: ['cz_sets'], cosmetics: {loadout:{ship:'lancer'}} }))).toBe('lancer');
    expect(selectedShip(testProfile({cosmetics:{loadout:{ship:'manta'}}}))).toBe('triad');
    expect(selectedShip(testProfile({achievements:['cz_sets','cz_launches'],gameData:{cadenza:{ship:'manta'}},cosmetics:{loadout:{ship:'lancer'}}}))).toBe('manta');
  });
  it('cycles unlocked ships by touch, rejects locked actions, and persists the selection when starting', () => {
    const saves:CadenzaSave[]=[];
    const s=createGameSession({game:module,profile:testProfile({achievements:['cz_sets']}),input:new NullInput(),onSave:d=>saves.push(d as CadenzaSave)});
    s.sim.receive?.({type:'ship',value:'manta'});s.step(1);
    expect((s.sim.snapshot() as CadenzaSnapshot).ship).toBe('triad');
    s.sim.receive?.({type:'ship'});s.step(1);
    expect((s.sim.snapshot() as CadenzaSnapshot).ship).toBe('lancer');
    expect((s.sim.snapshot() as CadenzaSnapshot).menu?.ships.find(i=>i.id==='manta')?.locked).toBe(true);
    s.sim.receive?.({type:'start'});s.step(1);
    expect(saves.at(-1)?.ship).toBe('lancer');
  });
  it('every ship slides at the same speed; they differ in what a graze collects and whether a clipped mine bites', () => {
    const ride = (ship: 'triad' | 'lancer' | 'manta', pull: number, color: number) => {
      const s = createGameSession({ game: module, profile: testProfile({ achievements: ['cz_sets', 'cz_launches'], gameData: { cadenza: { ship } } }), input: new TimelineInput([{ t: 0, paddleR: pull }]), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'pro' } });
      (s.sim.snapshot() as CadenzaSnapshot).track.blocks.splice(0, (s.sim.snapshot() as CadenzaSnapshot).track.blocks.length, { t: 2, lane: 0, color, zone: 0 });
      s.step(90);
      const snap = s.sim.snapshot() as CadenzaSnapshot;
      return { x: snap.x, collected: s.sim.summary().collected as number, greysHit: s.sim.summary().greysHit as number };
    };
    const slide = (ship: 'triad' | 'lancer' | 'manta') => {
      const s = createGameSession({ game: module, profile: testProfile({ achievements: ['cz_sets', 'cz_launches'], gameData: { cadenza: { ship } } }), input: new TimelineInput([{ t: 0.2, paddleR: 1 }]), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'pro' } });
      s.step(6);
      const snap = s.sim.snapshot() as CadenzaSnapshot;
      return snap.x / ((snap.lanes - 1) / 2);
    };
    expect(slide('lancer')).toBeCloseTo(slide('triad'), 5);
    expect(slide('manta')).toBeCloseTo(slide('triad'), 5);
    // 0.8 of a lane is past the nearest-lane line: only Manta's wing reaches it.
    expect(ride('manta', 0.8, 2).collected).toBe(1);
    expect(ride('triad', 0.8, 2).collected).toBe(0);
    expect(ride('lancer', 0.8, 2).collected).toBe(0);
    // 0.4 of a lane clips the mine. Lancer slips it; Triad and Manta do not.
    expect(ride('lancer', 0.4, -1).greysHit).toBe(0);
    expect(ride('triad', 0.4, -1).greysHit).toBe(1);
    expect(ride('manta', 0.4, -1).greysHit).toBe(1);
    expect(shipHandling('triad')).toMatchObject({ lanes: 3, catch: 0, mine: 0.5 });
    expect(ride('lancer', 0, 2).x).toBe(0);
    const wide = createGameSession({ game: module, profile: testProfile({ achievements: ['cz_sets'], gameData: { cadenza: { ship: 'lancer' } } }), input: new NullInput(), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'casual' } });
    expect((wide.sim.snapshot() as CadenzaSnapshot).lanes).toBe(5);
    const narrow = createGameSession({ game: module, profile: testProfile({ gameData: { cadenza: { ship: 'triad' } } }), input: new NullInput(), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'elite' } });
    expect((narrow.sim.snapshot() as CadenzaSnapshot).lanes).toBe(3);
  });
  it('lets the controller choose a ship before the countdown', () => {
    const input=new TimelineInput([{t:0,press:'up'},{t:.1,press:'right'}]);
    const s=createGameSession({game:module,profile:testProfile({achievements:['cz_sets']}),input});s.step(5);
    const snap=s.sim.snapshot() as CadenzaSnapshot;
    expect(snap.menu?.row).toBe(MENU.ship);expect(snap.ship).toBe('lancer');
  });
});
