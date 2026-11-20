import { expect, it } from 'vitest';
import { LAP, courses } from '../sim/track';
import {
  canCollectOnArrival,
  collectorGear,
  crossCollector,
  forkCycle,
  stations,
  stripCentre,
  stormWidth,
} from '../sim/stormglass';

it('shows the machine off the riding surface and has a warning before each descent', () => {
  const exhibit = stations[0],
    gear = collectorGear();
  expect(
    crossCollector(
      gear,
      exhibit.at - 2,
      exhibit.at + 2,
      exhibit.side * stripCentre,
      4.5 - exhibit.offset,
      1 / 30,
    ),
  ).toBeUndefined();
  expect(gear.lastPass).toBe(-1);
  for (const station of stations) {
    expect(forkCycle(station, 2.3 - station.offset + 6.4)).toMatchObject({ down: 0, live: false });
    expect(forkCycle(station, 2.3 - station.offset + 6.4).warning).toBeGreaterThan(0);
    expect(forkCycle(station, 4.5 - station.offset)).toMatchObject({ down: 1, live: true });
    expect(forkCycle(station, 6.2 - station.offset)).toMatchObject({ down: 0, live: false });
  }
});

it.each(stations.filter((s) => !s.exhibit))(
  'resolves the $at collector once per pass and keeps the inside open',
  (station) => {
    const gear = collectorGear(),
      line = station.side * stripCentre,
      gate = station.at,
      dt = 1 / 30;
    const live = 4.5 - station.offset,
      open = 6.2 - station.offset;
    expect(crossCollector(gear, gate - 3, gate - 1, line, live, dt)).toBe('hit');
    expect(gear.drag).toBeGreaterThan(1);
    expect(crossCollector(gear, gate - 1, gate - 1, line, live, dt)).toBeUndefined();
    expect(crossCollector(gear, gate - 1, gate + 2, line, open, dt)).toBeUndefined();
    expect(crossCollector(gear, LAP + gate - 2, LAP + gate + 2, line, open, 2)).toBe('clear');
    expect(gear).toMatchObject({ clears: 1, hits: 1, drag: 0 });
    for (let i = 0; i < 64; i++) {
      const centre = collectorGear();
      expect(crossCollector(centre, gate - 2, gate + 2, 0, i / 10, dt)).toBeUndefined();
      expect(centre).toMatchObject({ hits: 0, clears: 0 });
    }
  },
);

it('bases the line call on the entire crossing at the current pace', () => {
  const station = stations[1];
  expect(canCollectOnArrival(station, 40, 20, 4.5 - station.offset)).toBe(true);
  expect(canCollectOnArrival(station, 40, 20, 2.5 - station.offset)).toBe(false);
  expect(canCollectOnArrival(station, 2, 1, 2.6 - station.offset)).toBe(false);
  expect(canCollectOnArrival(station, 10, 0, 0)).toBe(false);
});

it('passes beneath the starting deck and preserves a continuous centre through the pinch', () => {
  const course = courses[2],
    high = course.world(0, 0);
  let gap = Infinity,
    clearance = 0;
  for (let d = 400; d <= 680; d += 0.25) {
    const p = course.world(d, 0),
      horizontal = Math.hypot(p.x - high.x, p.z - high.z);
    if (horizontal < gap) {
      gap = horizontal;
      clearance = high.y - p.y;
    }
  }
  expect(gap).toBeLessThan(0.2);
  expect(clearance).toBeCloseTo(40, 0);
  expect(stormWidth(545)).toBeLessThan(stormWidth(0));
  for (const s of stations.filter((s) => !s.exhibit))
    expect(stormWidth(s.at)).toBeGreaterThan(stripCentre + 0.34);
});
