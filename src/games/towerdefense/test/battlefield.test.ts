import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PADS, TOWERS, laneAt, laneLength, lanePolyline } from '../sim/defs';
import { LIGHT_BUDGET, along, boundedLights, cableRoute, pulsePosition, strokeCrossings, strokeTimes, TOWER_CABLE_X, laneXAtY, trenchStrip } from '../render/battlefieldMath';
import { layout } from '../render/layout';
const map = JSON.parse(readFileSync('public/td/environment/map-layout.json', 'utf8'));
describe('painted battlefield registration', () => {
  it('simulation uses the exact asset curves and plateau pad positions together', () => {
    for (const lane of map.lanes) {
      const c = lane.controls;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const weights = [(1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3];
        const p = lanePolyline(lane.id, 1)[t*160];
        expect(p.x).toBeCloseTo(c.reduce((sum: number, q: number[], i: number) => sum+q[0]*weights[i],0), 8);
        expect(p.y).toBeCloseTo(c.reduce((sum: number, q: number[], i: number) => sum+q[1]*weights[i],0), 8);
      }
    }
    for (const p of map.pads) expect(PADS[p.id]).toEqual({id:p.id,lane:p.lane,x:p.position[0],y:p.position[1],near:p.near});
  });
  it('every plateau pad clears all trench shoulders and still reaches its lane with every tower', () => {
    for (const pad of PADS) {
      let assigned = Infinity;
      for (let l = 0; l < 3; l++) {
        const distance = Math.min(...lanePolyline(l,1).map(p => Math.hypot(pad.x-p.x,pad.y-p.y)));
        expect(distance).toBeGreaterThanOrEqual(6.5+1.25+4.2+1-0.02);
        if (l === pad.lane) assigned = distance;
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
describe('cables through inner plateau corridors', () => {
  it('inner cables stay between lane centrelines, including their smoothed bends', () => {
    for(const id of [1,2,3,5]) {
      const left=id===1||id===3?0:1, p=PADS[id];
      for(const q of cableRoute(id)) {
        if(q.y>86 || q.y<p.y)continue;
        expect(q.x).toBeGreaterThan(laneXAtY(left,q.y));
        expect(q.x).toBeLessThan(laneXAtY(left+1,q.y));
      }
    }
  });
  it('outer routes stay on the outside of their lane after leaving the shared outpost apron', () => {
    for(const id of [0,4]) for(const q of cableRoute(id)) {
      if(Math.hypot(q.x-50,q.y-90)<18)continue;
      if(id===0)expect(q.x).toBeLessThan(laneXAtY(0,q.y));
      else expect(q.x).toBeGreaterThan(laneXAtY(2,q.y));
    }
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
