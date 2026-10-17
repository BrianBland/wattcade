import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PADS, TOWERS, laneAt, laneLength, lanePolyline } from '../sim/defs';
import { LIGHT_BUDGET, along, boundedLights, cableRoute, pulsePosition, strokeCrossings, strokeTimes, TOWER_CABLE_X, laneXAtY, trenchStrip } from '../render/battlefieldMath';
import { layout } from '../render/layout';
const map = JSON.parse(readFileSync('public/td/environment/map-layout.json', 'utf8'));
describe('painted battlefield registration', () => {
  it('every plateau pad clears all trench shoulders and still reaches its lane with every tower', () => {
    for (const pad of PADS) {
      let assigned = Infinity;
      for (let l = 0; l < 3; l++) {
        const distance = Math.min(...lanePolyline(l,1).map(p => Math.hypot(pad.x-p.x,pad.y-p.y)));
        // Clear of its own lane's gravel shoulder. The lanes split, so a pad may sit near another lane.
        if (l === pad.lane) { expect(distance).toBeGreaterThanOrEqual(9.2 + 2); assigned = distance; }
      }
      for (const tower of Object.values(TOWERS)) expect(assigned).toBeLessThan(tower.range);
    }
  });
  it('trench strips maintain floor width around the curved lane, including both ends', () => {
    const n=80, half=6.5;
    for(let l=0;l<3;l++) {
      const strip=trenchStrip(l,half,n);
      expect(strip).toHaveLength(2*(n+1));
      for(let i=0;i<=n;i++) {
        const a=strip[i],b=strip[strip.length-1-i],p=laneAt(l,laneLength(l)*i/n);
        expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeCloseTo(13,6);
        expect((a.x+b.x)/2).toBeCloseTo(p.x,6);
        expect((a.y+b.y)/2).toBeCloseTo(p.y,6);
      }
    }
  });
  it('outpost art, including its padded frame, fits above the HUD across orientations', () => {
    for(const [w,h] of [[1366,1024],[820,1180],[390,844],[844,390]]) for(const inset of [0,90,160]) {
      const l=layout(w,h,inset);
      const bottom=l.field.y+(90+26/2)*l.field.s/100;
      expect(bottom).toBeLessThanOrEqual(h-inset);
    }
  });
});
describe('pedal strokes and connected cable pulses', () => {
  it('emits once at each half revolution, with no pulses when cadence stops or resets', () => {
    expect(strokeCrossings(10.1,10.4)).toBe(0);
    expect(strokeCrossings(10.4,10.5)).toBe(1);
    expect(strokeCrossings(10.5,11)).toBe(1);
    expect(strokeCrossings(10,12)).toBe(4);
    expect(strokeCrossings(12,12)).toBe(0);
    expect(strokeCrossings(12,0)).toBe(0);
    expect(strokeCrossings(0,1000)).toBeLessThanOrEqual(8);
    expect(strokeTimes(10,11,5,6)).toEqual([5.5,6]);
    expect(strokeTimes(11,11,6,7)).toEqual([]);
  });
  it('travels by distance, reaches the socket, and expires independently of cadence', () => {
    expect(pulsePosition(0,55)).toBe(0);
    expect(pulsePosition(0.5,55)).toBe(0.5);
    expect(pulsePosition(1,55)).toBe(1);
    expect(pulsePosition(1.01,55)).toBeNull();
    expect(pulsePosition(-1,55)).toBeNull();
    for(const p of PADS) { const route=cableRoute(p.id); expect(along(route,1)).toEqual({x:p.x,y:p.y}); expect(route[0]).toEqual({x:50,y:90}); expect(route.some(q=>q.x===p.x+TOWER_CABLE_X&&q.y===p.y)).toBe(true); }
    expect(along([{x:0,y:0},{x:10,y:0},{x:10,y:30}],0.5)).toEqual({x:10,y:10});
  });
});
describe('lane split', () => {
  it('the lanes meet under the turret and stay apart on the way in', () => {
    const ends = [0, 1, 2].map(l => laneAt(l, laneLength(l)));
    for (const e of ends) expect(Math.hypot(e.x - 50, e.y - 90)).toBeLessThan(1e-6);
    const mid = [0, 1, 2].map(l => laneAt(l, laneLength(l) * 0.5));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(mid[i].x - mid[j].x, mid[i].y - mid[j].y)).toBeGreaterThan(12);
  });
});
describe('light-map budget', () => {
  it('a busy wave cannot grow light work beyond the fixed budget; static lights retain priority', () => {
    const sources=Array.from({length:1000},(_,i)=>i);
    const lights=boundedLights(sources);
    expect(lights).toHaveLength(LIGHT_BUDGET);
    expect(lights[0]).toBe(0);
    expect(boundedLights(sources,0)).toEqual([]);
    expect(boundedLights([1,2])).toEqual([1,2]);
  });
});

describe('incremental alien frame baking', () => {
  it('publishes rest poses fairly, bakes only one pose per pump, and clears in-progress work on resize', async () => {
    const { FrameCache } = await import('../render/aliens/puppets');
    type FrameSet = import('../render/aliens/puppets').FrameSet;
    type Puppet = import('../render/aliens/puppets').Puppet;
    const a = { walk: [] } as unknown as FrameSet, b = { walk: [] } as unknown as FrameSet;
    let poses = 0;
    function* steps(p: Puppet): Generator<FrameSet> { for (let i=0;i<3;i++) { poses++; yield p.species.id === 'skitter' ? a : b; } }
    const puppets = new Map([['skitter', { species: { id: 'skitter' } }], ['warrior', { species: { id: 'warrior' } }]]) as unknown as Map<import('../render/aliens/species').SpeciesId, Puppet>;
    const cache = new FrameCache(puppets, steps);
    expect(cache.get('skitter', 20, '#fff')).toBeNull();
    expect(cache.get('skitter', 20, '#fff')).toBeNull();
    cache.get('warrior', 40, '#fff'); expect(cache.pending).toBe(2);
    cache.pump(); expect(poses).toBe(1); expect(cache.get('skitter',20,'#fff')).toBe(a);
    cache.pump(); expect(poses).toBe(2); expect(cache.get('warrior',40,'#fff')).toBe(b);
    cache.clear(); expect(cache.pending).toBe(0); cache.pump(); expect(poses).toBe(2);
    expect(cache.get('skitter',20,'#fff')).toBeNull();
  });
});
