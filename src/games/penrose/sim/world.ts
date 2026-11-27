/**
 * Pure deterministic level player (SimWorld) for Penrose Pedals.
 * Owns wheel physics, screen-space perspective joins, hidden gaps, station checkpoints,
 * key/gate progression, signed trainer resistance, and semantic event emission.
 */

import {
  cameraDepth, clamp, DEG, lerp, makeIsoBasis, projectDir, projectPoint, segHit2D,
  unprojectCam, V, v2Add, v2Dist, v2Dot, v2Norm, v2Scale, v2Sub, v3Dist, v3Lerp, v3Neg, v3Norm, v3Sub,
  type IsoBasis, type Mat4, type Vec2, type Vec3,
} from './math';
import type { SimRoad } from './road';
import type {
  BikeInput, BuiltSimLevel, FaceKey, MachineSnapshot, SimEvent, SimLevelDef, SimTunables, WheelState,
} from './types';

const TOL = 0.2;
const GRAV = 13;
const WHEEL_RADIUS = 0.37;
const MAX_EVENTS = 64;

export interface WorldCallbacks {
  onWon: (solvedByAutopilot: boolean) => void;
  onFell: () => void;
}

export class SimWorld {
  readonly def: SimLevelDef;
  readonly built: BuiltSimLevel;
  readonly wheel: WheelState;

  state: 'play' | 'won' | 'restart' = 'play';
  wonT = 0;
  restartT = 0;
  autopilot = false;

  yawDeg = 0;
  rollDeg = 0;
  peekYawRad = 0;
  cubeRotY = 0;
  cubeSink = 0;
  wallIndex = 0;

  spawnPos: Vec3 = [0, 0, 0];
  spawnNormal: Vec3 = [0, 1, 0];
  speedRatio = 1;
  inCruiseBand = false;
  lastLoad = 0;
  lastSlopeGrade = 0;
  lastCadence = 0;

  private events: SimEvent[] = [];
  private nextEventId = 1;
  private centerW: Vec3;
  private basis: IsoBasis;
  private projKey = '';
  private prevHiddenState = new Map<string, boolean>();
  private goalRoad: SimRoad | undefined;
  private wheelSpeedScale = 1;

  constructor(def: SimLevelDef, built: BuiltSimLevel, private cbs: WorldCallbacks) {
    this.def = def;
    this.built = built;
    const fr = built.frameOverride ?? def;
    this.centerW = V(fr.center[0], fr.center[1], fr.center[2]);
    this.yawDeg = def.yaws[0] ?? 0;
    this.basis = makeIsoBasis(this.centerW, this.yawDeg * DEG, 0);
    this.projKey = this.makeProjKey();
    this.refreshRoads(true);

    const sp = built.spawn();
    const f = sp.road.at(sp.s);
    this.spawnPos = f.p;
    this.spawnNormal = f.n;

    this.wheel = {
      mode: 'spawn',
      t: 0,
      road: sp.road,
      s: sp.s,
      dir: sp.dir,
      spin: 0,
      pos: f.p,
      normal: f.n,
      heading: sp.dir > 0 ? f.d : v3Neg(f.d),
      fallPos: [0, 0],
      fallVel: [0, 0],
      fallCamZ: 0,
      fallFrom: null,
      hopA: [0, 0, 0],
      hopB: [0, 0, 0],
      hopLen: 1,
      hopTo: null,
      lastStation: sp.road.stationIndex !== undefined ? { road: sp.road, s: sp.s, dir: sp.dir, index: sp.road.stationIndex } : null,
    };

    this.goalRoad = built.roads.find((r) => r.goal);
  }

  private makeProjKey(): string {
    return `${this.yawDeg.toFixed(3)}|${this.rollDeg.toFixed(3)}`;
  }

  private refreshRoads(force = false): void {
    const cam = this.built.cameraState?.();
    if (cam) {
      this.yawDeg = cam.yawDeg;
      this.rollDeg = cam.rollDeg;
      this.cubeRotY = cam.cubeRotY ?? 0;
      this.cubeSink = cam.cubeSink ?? 0;
      this.wallIndex = cam.wallIndex ?? 0;
    } else {
      const camM = this.built.machines.find((m) => m.kind === 'camera');
      const gyroM = this.built.machines.find((m) => m.kind === 'gyro');
      if (camM) this.yawDeg = camM.value;
      if (gyroM) this.rollDeg = gyroM.value;
    }
    const key = this.makeProjKey();
    const changed = force || key !== this.projKey;
    if (changed) {
      this.projKey = key;
      this.basis = makeIsoBasis(this.centerW, this.yawDeg * DEG, this.rollDeg * DEG);
    }
    for (const r of this.built.roads) {
      r.refresh(this.basis, this.projKey, changed);
    }
  }

  emit = (e: Omit<SimEvent, 'id'>): void => {
    this.events.push({ ...e, id: this.nextEventId++ });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  };

  recentEvents(): SimEvent[] {
    return this.events.slice();
  }

  /** Find the live machine bound to face key (handles multi-storey levels like The Cube). */
  machineFor(key: FaceKey) {
    const list = this.built.machines.filter((m) => m.key === key);
    return list.find((m) => !m.live || m.live()) ?? list[0];
  }

  toggleMachine(key: FaceKey, dirHint: -1 | 0 | 1, tun: SimTunables): boolean {
    const m = this.machineFor(key);
    if (!m) return false;
    this.autopilot = false;
    if (m.press) {
      m.press(dirHint);
    } else {
      m.on = !m.on;
      this.emit({ kind: m.on ? 'engage' : 'disengage', pos: m.capPos });
    }
    return true;
  }

  /** Step simulation by fixed dt (1/30 s). */
  step(dt: number, rawBike: BikeInput, peekTargetRad: number, tun: SimTunables): void {
    // Smooth visual-only paddle peek
    this.peekYawRad += (peekTargetRad - this.peekYawRad) * Math.min(1, dt * 10);

    // Apply autopilot overrides cleanly without touching external bike state
    const bike: BikeInput = { ...rawBike };
    if (this.autopilot && this.state === 'play' && this.wheel.mode !== 'win') {
      const out = { cad: 80, ftp: 0.78, gearScale: 1.0 };
      this.built.solve(this.wheel, out);
      bike.cadence = out.cad;
      bike.ftpFraction = out.ftp;
      bike.gearScale = out.gearScale;
      bike.sprinting = out.ftp >= 1.15;
    }
    this.lastCadence = bike.cadence;

    // 1. Refresh road transforms & iso projections
    this.refreshRoads(false);

    // 2. Step machines & accumulate signed load
    let load = 0;
    for (const m of this.built.machines) {
      const drive = m.on && bike.cadence > 5 ? (bike.cadence / 60) * dt * bike.gearScale : 0;
      const ld = m.tick(dt, drive, bike, tun, this.emit);
      load += ld;
    }
    this.lastLoad = clamp(load, -0.5, 1.5);

    // Re-refresh dynamic roads moved by machines before wheel step
    this.refreshRoads(false);

    // 3. Cruise band tracking
    if (this.def.cruise && this.state === 'play') {
      const [lo, hi] = this.def.cruise;
      this.inCruiseBand = bike.cadence >= lo && bike.cadence <= hi;
    } else {
      this.inCruiseBand = false;
    }

    // 4. Cadence-coupled wheel speed (pauses gracefully when stopped pedaling!)
    const targetScale = this.autopilot
      ? 1.0
      : bike.cadence < 12
        ? 0
        : lerp(tun.wheelSpeedMin, tun.wheelSpeedMax, clamp((bike.cadence - 50) / 50, 0, 1));
    this.wheelSpeedScale += (targetScale - this.wheelSpeedScale) * Math.min(1, dt * 6);
    this.speedRatio = this.wheelSpeedScale;

    // 5. Substep wheel movement (max 10ms substeps for exact fork/end detection)
    if (this.state === 'play') {
      const sub = Math.max(1, Math.ceil(dt / 0.01));
      const sdt = dt / sub;
      for (let i = 0; i < sub; i++) {
        this.stepWheel(sdt, tun);
      }
      if (this.wheel.mode === 'spawn' && this.wheel.t >= 0.85) {
        this.wheel.mode = 'road';
      }
    } else if (this.state === 'won') {
      this.wonT += dt;
    } else if (this.state === 'restart') {
      this.restartT += dt;
    }

    // 6. Update wheel world pose & road slope grade
    this.updateWheelPose();
    if (this.wheel.mode === 'road' && this.wheelSpeedScale > 0.05) {
      const pitchSin = this.wheel.heading[1]; // world +Y is up
      this.lastSlopeGrade = clamp(pitchSin, -0.35, 1.0) * tun.gradeSlopeMax;
    } else {
      this.lastSlopeGrade = 0;
    }

    // 7. Keys & gates
    this.stepKeysAndGates(dt);

    // 8. Custom level tick (Cube wall turns, hidden-gap edge notifications, etc.)
    this.built.onTick?.(dt, this.wheel, bike, this.emit);
    this.checkHiddenGapTransitions();

    // 9. Win / Fall transitions
    if (this.wheel.mode === 'win' && this.wheel.t > 0.5 && this.state === 'play') {
      this.state = 'won';
      this.wonT = 0;
      this.cbs.onWon(this.autopilot);
    }
    if (this.wheel.mode === 'dead' && this.wheel.t > 0.35 && this.state === 'play') {
      const cp = this.built.checkpoint?.() ?? (this.wheel.lastStation && this.wheel.lastStation.index > 0 ? this.wheel.lastStation : null);
      if (cp) {
        const f = cp.road.at(cp.s);
        this.spawnPos = f.p;
        this.spawnNormal = f.n;
        this.wheel.mode = 'spawn';
        this.wheel.t = 0;
        this.wheel.road = cp.road;
        this.wheel.s = cp.s;
        this.wheel.dir = cp.dir;
        this.emit({ kind: 'checkpoint', pos: f.p, text: 'Back to last checkpoint' });
        this.cbs.onFell();
      } else {
        this.state = 'restart';
        this.restartT = 0;
        this.cbs.onFell();
      }
    }
  }

  private attach(r: SimRoad, s: number, dir: 1 | -1): void {
    const W = this.wheel;
    W.mode = 'road';
    W.road = r;
    W.s = s;
    W.dir = dir;
    if (r.stationIndex !== undefined && r.stationIndex > 0) {
      if (!W.lastStation || r.stationIndex > W.lastStation.index) {
        W.lastStation = { road: r, s: Math.min(1, r.L * 0.25), dir: 1, index: r.stationIndex };
        this.emit({ kind: 'checkpoint', pos: r.at(s).p, text: `Checkpoint ${r.stationIndex}` });
      }
    }
  }

  private enter(r: SimRoad, k: 0 | 1): void {
    this.attach(r, k ? r.L : 0, k ? -1 : 1);
  }

  private startFall(e: { p: Vec3; out: Vec3 }, msg: string | undefined, speed: number): void {
    const W = this.wheel;
    W.mode = 'fall';
    W.t = 0;
    W.fallPos = projectPoint(e.p, this.basis);
    const out2 = projectDir(e.out, this.basis);
    W.fallVel = v2Scale(out2, Math.max(0.8, speed) * 0.45);
    W.fallCamZ = cameraDepth(e.p, this.basis);
    W.fallFrom = W.road;
    this.emit({ kind: 'fall', pos: e.p, text: msg || 'Off the edge' });
  }

  private atEnd(k: 0 | 1, speed: number): void {
    const W = this.wheel;
    const r = W.road;
    const e = r.end(k);

    // 1. Goal reached!
    if (r.goal && k === 1) {
      W.mode = 'win';
      W.t = 0;
      this.emit({ kind: 'win', pos: e.p, text: 'Home' });
      return;
    }

    // 2. Explicit joins
    for (const j of r.joins) {
      if (j.k === k) {
        this.attach(j.to, j.s, j.dir);
        return;
      }
    }

    // 3. Active gaps (hidden behind curtain, locked clutch bridge, dark gap)
    for (const gp of r.gaps) {
      if (gp.k === k && gp.when()) {
        W.mode = 'hop';
        W.t = 0;
        W.hopA = e.p;
        W.hopB = gp.to.end(gp.toK).p;
        W.hopLen = Math.max(0.01, v3Dist(W.hopA, W.hopB));
        W.hopTo = { road: gp.to, k: gp.toK };
        if (gp.kind === 'hidden') this.emit({ kind: 'gapHidden', pos: e.p, text: gp.text });
        return;
      }
    }

    // 4. 3D coincident road ends
    for (const kk of [0, 1] as const) {
      for (const B of this.built.roads) {
        if (B === r) continue;
        const be = B.end(kk);
        if (v3Dist(be.p, e.p) < 0.18) {
          const opposing = -(be.out[0] * e.out[0] + be.out[1] * e.out[1] + be.out[2] * e.out[2]) > 0.75;
          if ((B.turntable && kk === 0) || (r.turntable && k === 0) || opposing) {
            if (B.turnBack && B.solid && !B.solid()) {
              W.dir = (W.dir * -1) as 1 | -1;
              return;
            }
            this.enter(B, kk);
            return;
          }
        }
      }
    }

    // 5. Perspective join (screen-space coincident ends with matching heading!)
    const es = projectPoint(e.p, this.basis);
    const eo = projectDir(e.out, this.basis);
    for (const kk of [0, 1] as const) {
      for (const B of this.built.roads) {
        if (B === r && kk === k) continue;
        const be = B.end(kk);
        const bs = projectPoint(be.p, this.basis);
        if (v2Dist(bs, es) < TOL) {
          const bo = projectDir(v3Neg(be.out), this.basis);
          if (v2Dot(bo, eo) > 0.85) {
            this.emit({ kind: 'perspJoin', pos: e.p, text: 'Joined by perspective' });
            this.enter(B, kk);
            return;
          }
        }
      }
    }

    // 6. Fail-safe bounce end
    if (r.bounce) {
      W.dir = (W.dir * -1) as 1 | -1;
      return;
    }

    // 7. Fall!
    this.startFall(e, r.getEdgeText(), speed);
  }

  private stepWheel(dt: number, tun: SimTunables): void {
    const W = this.wheel;
    W.t += dt;
    const speed = tun.wheelSpeedBase * this.wheelSpeedScale;

    if (W.mode === 'road') {
      if (speed <= 1e-4) return;
      const r = W.road;
      const prev = W.s;
      W.s += W.dir * speed * dt;
      W.spin += (speed * dt) / WHEEL_RADIUS;

      // Check forks crossed this substep
      for (const f of r.forks) {
        if (f.dir !== W.dir) continue;
        const crossed = W.dir > 0 ? prev < f.s && W.s >= f.s : prev > f.s && W.s <= f.s;
        if (!crossed || !f.when()) continue;
        const tgt = typeof f.to === 'function' ? f.to() : f.to;
        if (f.toS !== undefined) {
          const ts = typeof f.toS === 'function' ? f.toS() : f.toS;
          const tDir = f.toDir ?? W.dir;
          if (f.slide) {
            W.mode = 'hop';
            W.t = 0;
            W.hopA = r.at(W.s).p;
            W.hopB = tgt.at(ts).p;
            W.hopLen = Math.max(0.01, v3Dist(W.hopA, W.hopB)) / f.slide;
            W.hopTo = { road: tgt, s: ts, dir: tDir };
          } else {
            this.attach(tgt, ts, tDir);
            if (f.text?.includes('door')) this.emit({ kind: 'portal', pos: tgt.at(ts).p, text: f.text });
          }
        } else {
          this.enter(tgt, f.toK ?? 0);
        }
        return;
      }

      if (r.solid && !r.solid()) {
        const f = r.at(W.s);
        this.startFall({ p: f.p, out: W.dir > 0 ? f.d : v3Neg(f.d) }, r.goneText, speed);
        return;
      }
      if (r.blowBack && r.blowBack(W.dir)) {
        W.dir = (W.dir * -1) as 1 | -1;
        return;
      }
      if (r.closed) {
        if (W.s >= r.L) W.s -= r.L;
        else if (W.s < 0) W.s += r.L;
      } else if (W.dir > 0 && W.s >= r.L) {
        this.atEnd(1, speed);
      } else if (W.dir < 0 && W.s <= 0) {
        this.atEnd(0, speed);
      }
    } else if (W.mode === 'hop') {
      const hopSpeed = Math.max(tun.wheelSpeedBase * 0.85, speed);
      W.spin += (hopSpeed * dt) / WHEEL_RADIUS;
      if (W.t * hopSpeed >= W.hopLen && W.hopTo) {
        const to = W.hopTo;
        if (to.s !== undefined) this.attach(to.road, to.s, to.dir ?? 1);
        else this.enter(to.road, to.k ?? 0);
      }
    } else if (W.mode === 'fall') {
      const gv: Vec2 = [0, -1];
      W.fallVel = v2Add(W.fallVel, v2Scale(gv, GRAV * dt));
      const prev = W.fallPos;
      W.fallPos = v2Add(W.fallPos, v2Scale(W.fallVel, dt));
      W.spin += (tun.wheelSpeedBase * dt) / WHEEL_RADIUS;

      let hit: { t: number; B: SimRoad; s: number; dir: 1 | -1 } | null = null;
      for (const B of this.built.roads) {
        if (B === W.fallFrom && W.t < 0.3 && !B.selfCatch) continue;
        if (B.solid && !B.solid()) continue;
        for (let j = 0; j < B.q.length - 1; j++) {
          if (B === W.fallFrom && W.t < 0.3 && B.cum[j + 1] > B.L - 1.5) continue;
          const h = segHit2D(prev, W.fallPos, B.q[j], B.q[j + 1]);
          if (!h || (hit && h[0] >= hit.t)) continue;
          if (v2Dot(B.qn[j], gv) < -0.25) {
            const tan = v2Sub(B.q[j + 1], B.q[j]);
            const dir: 1 | -1 = B.landDir ?? (v2Dot(tan, W.fallVel) >= 0 ? 1 : -1);
            hit = { t: h[0], B, s: lerp(B.cum[j], B.cum[j + 1], h[1]), dir };
          }
        }
      }
      if (hit) {
        this.attach(hit.B, hit.s, hit.dir);
        this.emit({ kind: 'perspJoin', pos: hit.B.at(hit.s).p, text: 'Landed on the road below' });
      } else if (W.t > 1.5) {
        W.mode = 'dead';
        W.t = 0;
      }
    }
  }

  private updateWheelPose(): void {
    const W = this.wheel;
    if (W.mode === 'road' || W.mode === 'spawn' || W.mode === 'win') {
      const f = W.road.at(W.s);
      W.pos = f.p;
      W.normal = f.n;
      W.heading = W.dir > 0 ? f.d : v3Neg(f.d);
    } else if (W.mode === 'hop') {
      const k = clamp((W.t * Math.max(1.4, 1.85 * this.wheelSpeedScale)) / Math.max(0.01, W.hopLen), 0, 1);
      W.pos = v3Lerp(W.hopA, W.hopB, k);
      W.heading = v3Norm(v3Sub(W.hopB, W.hopA));
    } else if (W.mode === 'fall' || W.mode === 'dead') {
      W.pos = unprojectCam(W.fallPos[0], W.fallPos[1], W.fallCamZ, this.basis);
    }
  }

  private stepKeysAndGates(dt: number): void {
    const { keys, gates } = this.built;
    if (!keys.length && !gates.length) return;
    let held = 0;
    for (const k of keys) {
      if (!k.got && v3Dist(this.wheel.pos, k.pos) < 0.72) {
        k.got = true;
        const count = keys.filter((x) => x.got).length;
        this.emit({ kind: 'key', pos: k.pos, text: `Key ${count} of ${keys.length}`, pitch: 0.9 + count * 0.16 });
      }
      if (k.got) {
        held++;
        k.anim = Math.min(1, k.anim + dt * 2.5);
      }
    }
    const allGot = keys.length > 0 && held === keys.length;
    for (const g of gates) {
      if (allGot && !g.open) {
        g.open = true;
        this.emit({ kind: 'gateOpen', pos: g.pos, text: 'All keys collected — gate open!' });
      }
      const target = g.open ? -Math.PI / 2 : 0;
      g.angle += clamp(target - g.angle, -2.2 * dt, 2.2 * dt);
    }
  }

  private checkHiddenGapTransitions(): void {
    const gaps = this.built.hiddenGaps?.();
    if (!gaps) return;
    gaps.forEach((g, idx) => {
      const key = String(idx);
      const prev = this.prevHiddenState.get(key);
      if (prev === false && g.hidden) {
        this.emit({ kind: 'gapHidden', pos: v3Lerp(g.a, g.b, 0.5) });
      }
      this.prevHiddenState.set(key, g.hidden);
    });
  }

  goalPose(): { pos: Vec3; normal: Vec3; dir: Vec3 } | null {
    if (!this.goalRoad) return null;
    const f = this.goalRoad.at(this.goalRoad.L);
    return { pos: f.p, normal: f.n, dir: f.d };
  }

  machineSnapshots(): MachineSnapshot[] {
    return this.built.machines.map((m) => ({
      id: m.id,
      kind: m.kind,
      mode: m.mode,
      key: m.key,
      name: m.name,
      on: m.on,
      live: !m.live || m.live(),
      value: m.value,
      progress: m.progress,
      ready: m.ready,
      status: m.status,
      capPos: m.capPos,
      capNormal: m.capNormal,
      size: m.size,
      transform: m.transform?.(),
      extra: m.extra?.(),
    }));
  }

  roadTransforms(): Record<string, Mat4> {
    const out: Record<string, Mat4> = {};
    for (const r of this.built.roads) {
      if (r.groupId && r.transform && !out[r.groupId]) {
        out[r.groupId] = r.transform();
      }
    }
    for (const m of this.built.machines) {
      const gid = `g_${m.id}`;
      if (m.transform && !out[gid]) {
        out[gid] = m.transform();
      }
    }
    return out;
  }

  /** Effective trainer grade % (base + signed machine/wind load + road slope). */
  computeGradePct(tun: SimTunables): number {
    const g = tun.gradeBase + tun.gradePerLoad * this.lastLoad + this.lastSlopeGrade;
    return Math.round(clamp(g, -2, 12) * 10) / 10;
  }

  getViewDirD(): Vec3 {
    return this.basis.D;
  }
}
