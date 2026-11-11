// Highway 1 traffic (pure): a car comes the other way or overtakes every so often. Cars live in route metres and move
// on their own (they don't depend on how fast you ride), spawned from a seeded schedule on the story clock. A car
// slows for a rider who is out in its lane (pulling across to the turnout and back) and only passes once you're clear.
import { hash2 } from '../voxel/noise';

/** Car lanes (m right of the centre line), travelling with you and toward you. */
export const CAR_LANE = { with: 1.75, toward: -1.75 } as const;
/** Car models in traffic.ts's builder (render/morning.ts). */
export const CAR_MODELS = 4;
export const CAR_COLOURS = 6;

export interface Car { id: number; s: number; dir: 1 | -1; v: number; cruise: number; model: number; colour: number }

export interface TrafficOpts {
  /** Seconds between possible cars, the chance one comes, and the share coming toward you. */ slotS: number; chance: number; toward: number;
  /** Where cars appear: ahead (oncoming) and behind (overtaking), m from the rider. */ ahead: number; behind: number;
  /** Road metres cars may drive on. */ road: [number, number];
}
export const TRAFFIC: TrafficOpts = { slotS: 16, chance: 0.6, toward: 0.6, ahead: 520, behind: 140, road: [0, 7580] };

export class Traffic {
  cars: Car[] = [];
  private slot = -1;
  private next = 0;
  constructor(private o: TrafficOpts = TRAFFIC, private seed = 7) {}

  /**
   * Advance `dt` story seconds with the rider at route metres `s` and lateral `lat`; `on` = traffic runs (the highway
   * scenes). Returns the cars on the road.
   */
  step(t: number, dt: number, s: number, lat: number, on: boolean): Car[] {
    const o = this.o;
    const slot = Math.floor(t / o.slotS);
    if (slot !== this.slot) { // one roll per slot (a jump in time skips the slots in between)
      this.slot = slot;
      const h = (k: number) => hash2(slot, k, this.seed);
      const dir: 1 | -1 = h(2) < o.toward ? -1 : 1;
      const at = dir < 0 ? s + o.ahead : s - o.behind;
      if (on && h(1) < o.chance && at > o.road[0] && at < o.road[1] && this.cars.length < 4) {
        const cruise = 19 + 7 * h(3);
        this.cars.push({ id: this.next++, s: at, dir, v: cruise, cruise, model: Math.floor(h(4) * CAR_MODELS), colour: Math.floor(h(5) * CAR_COLOURS) });
      }
    }
    if (!on) { this.cars = []; return this.cars; }
    const inRoad = lat < 3.2 && lat > -6; // off the shoulder, in the lanes (crossing to the turnout and back)
    for (const c of this.cars) {
      const gap = (s - c.s) * c.dir; // metres from the car's nose to the rider, along its way
      const blocked = inRoad && gap > -3 && gap < 80;
      const want = blocked ? Math.max(0, Math.min(c.cruise, (gap - 9) * 0.7)) : c.cruise;
      c.v += (want - c.v) * Math.min(1, dt * (want < c.v ? 2.2 : 0.6));
      c.s += c.dir * c.v * dt;
    }
    this.cars = this.cars.filter((c) => Math.abs(c.s - s) < o.ahead + 80 && c.s > o.road[0] - 40 && c.s < o.road[1] + 40);
    return this.cars;
  }
}
