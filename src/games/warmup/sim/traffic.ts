import type { RiderLook } from '../../../cosmetics/types';
import { makeRng } from '../../../core/rng';
import { cruisingSpeed, rideSpeed, type RidePhysics } from './physics';

/** Only identity and appearance cross from the local profile store into the ride. */
export interface LocalRider { id: string; name: string; look: RiderLook }
export interface RoadRider extends LocalRider {
  d: number; v: number; crankRevs: number; age: number;
}
export interface RiderView { behindM: number; aheadM: number }
export const RIDER_LIFETIME_S = 120;
const ENCOUNTER_INTERVAL_S = 5 * 60;

/** Occasional, same-direction encounters; independent RNG leaves the player's ride unchanged. */
export class WarmupTraffic {
  private roster: readonly LocalRider[] = [];
  private riders: RoadRider[] = [];
  private rng: () => number;
  private untilNext = ENCOUNTER_INTERVAL_S;
  private lastId = '';
  view: RiderView = { behindM: 20, aheadM: 40 };

  constructor(seed: number, private activeId: string) {
    this.rng = makeRng(seed ^ 0x71de);
  }

  setRiders(roster: readonly LocalRider[]) {
    const seen = new Set([this.activeId]);
    this.roster = roster.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id); return true;
    });
    // Profile deletion/equipping takes effect without restarting the warm-up.
    this.riders = this.riders.flatMap(r => {
      const peer = this.roster.find(p => p.id === r.id);
      return peer ? [{ ...r, ...peer }] : [];
    });
  }

  update(dt: number, d: number, v: number, watts: number, physics: RidePhysics, gradeAt: (d: number) => number) {
    for (const r of this.riders) {
      r.age += dt;
      r.v = rideSpeed(r.v, watts, gradeAt(r.d), physics, dt);
      r.d += r.v * dt;
      r.crankRevs += dt * 75 / 60;
    }
    this.riders = this.riders.filter(r => r.age < RIDER_LIFETIME_S &&
      r.d - d > -this.view.behindM - 12 && r.d - d < this.view.aheadM + 12);
    this.untilNext -= dt;
    if (this.untilNext > 0) return;
    this.untilNext = ENCOUNTER_INTERVAL_S;
    if (this.riders.length >= 3) return;
    const available = this.roster.filter(p => !this.riders.some(r => r.id === p.id));
    const fresh = available.filter(p => p.id !== this.lastId);
    const pool = fresh.length ? fresh : available;
    if (!pool.length) return;
    const peer = pool[Math.floor(this.rng() * pool.length)];
    const cruise = cruisingSpeed(watts, gradeAt(d), physics);
    // Enter from the edge we will naturally cross: slower riders ahead, faster ones behind.
    const rd = d + (v >= cruise ? this.view.aheadM + 4 : -this.view.behindM - 4);
    this.riders.push({ ...peer, d: rd, v: cruisingSpeed(watts, gradeAt(rd), physics),
      crankRevs: this.rng(), age: 0 });
    this.lastId = peer.id;
  }

  snapshot(): RoadRider[] { return this.riders.map(r => ({ ...r })); }
}
