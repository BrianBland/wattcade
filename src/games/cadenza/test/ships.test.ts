import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';
import { SHIPS, selectedShip, shipLanes, unlockedShips } from '../ships';
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
  it('gives each ship its lanes: Triad 3, Lancer 3, Manta 5', () => {
    expect(SHIPS.map(s => [s.id, s.lanes])).toEqual([['triad', 3], ['lancer', 3], ['manta', 5]]);
    expect(shipLanes('manta')).toBe(5); expect(shipLanes('triad')).toBe(3);
  });
  it('switching Triad to Manta in the menu rides 5 lanes; a locked Manta falls back to 3', () => {
    const s=createGameSession({game:module,profile:testProfile({achievements:['cz_launches']}),input:new NullInput()});
    expect((s.sim.snapshot() as CadenzaSnapshot).lanes).toBe(3);
    s.sim.receive?.({type:'ship',value:'manta'});s.step(1);
    const menu=(s.sim.snapshot() as CadenzaSnapshot).menu!;
    expect(menu.ship).toBe('manta'); expect(menu.ships.find(i=>i.id==='manta')?.lanes).toBe(5);
    s.sim.receive?.({type:'start'});s.step(1);
    expect((s.sim.snapshot() as CadenzaSnapshot).lanes).toBe(5); expect((s.sim.snapshot() as CadenzaSnapshot).track.lanes).toBe(5);
    const locked=createGameSession({game:module,profile:testProfile({gameData:{cadenza:{ship:'manta'}}}),input:new NullInput(),simOpts:{difficulty:'elite'}});
    expect((locked.sim.snapshot() as CadenzaSnapshot).ship).toBe('triad');
    expect((locked.sim.snapshot() as CadenzaSnapshot).lanes).toBe(3);
  });
  it('lets the controller choose a ship before the countdown', () => {
    const input=new TimelineInput([{t:0,press:'up'},{t:.1,press:'right'}]);
    const s=createGameSession({game:module,profile:testProfile({achievements:['cz_sets']}),input});s.step(5);
    const snap=s.sim.snapshot() as CadenzaSnapshot;
    expect(snap.menu?.row).toBe(MENU.ship);expect(snap.ship).toBe('lancer');
  });
});
