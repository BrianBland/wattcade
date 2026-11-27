// Bespoke layered procedural Foley, combat SFX, and adaptive music controller for Purgatour.
// Shares a single DungeonAudioBus with DungeonMusic so every sword clang, bowstring twang, coin clink,
// and boss war-horn sits inside the same warm stone-hall acoustic space (zero stock 8-bit square beeps).
// Respects global mute, ambient ducking, and disposes cleanly on unmount. Safe to import in Node.
import { audioOut, setAmbient, sfxGraph, stopAmbient } from '../../../audio/sfx';
import type { Element, WeaponStyle } from '../sim/loot';
import type { DungeonSnapshot } from '../sim/types';
import { DungeonAudioBus } from './audioBus';
import { DungeonMusic } from './music';
import { mtof, musicFor } from './musicScore';

const ZONE_BED: ReadonlyArray<{ freq: number; q: number; vol: number }> = [
  { freq: 210, q: 1.3, vol: 0.022 }, // Keep: stone hall draft + distant torch warmth
  { freq: 340, q: 2.1, vol: 0.020 }, // Crypt: hollow damp cathedral echo
  { freq: 480, q: 2.4, vol: 0.018 }, // Catacombs: dry bone-corridor breeze
  { freq: 135, q: 1.0, vol: 0.028 }, // Deep: subterranean volcanic rumble
];

// Pentatonic semitone offsets for musical coin & kill streaks
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

const clampF = (c: BaseAudioContext, hz: number) => Math.max(24, Math.min(c.sampleRate * 0.44, hz));

/** Small organic pitch/filter jitter so repeated shots, hits, and footsteps never sound robotic. */
const jitter = (amount = 0.06) => 1 + (Math.random() * 2 - 1) * amount;

export interface SfxOpts {
  pan?: number;
  vol?: number;
  streak?: number;
  weapon?: WeaponStyle;
  element?: Element;
  parried?: boolean;
}

export class DungeonSound {
  private rack: DungeonAudioBus | null = null;
  private music = new DungeonMusic();
  private lastCue = -1;
  private lastPlayed = new Map<string, number>();
  private prevBossCycle = '';
  private prevBossPhase = 0;
  private prevWarded = false;
  private prevRallied = false;
  private prevRolling = false;
  private prevSecondWindFlash = 0;
  private prevPhase = '';
  private coinStreak = 0;
  private lastCoinT = -9;
  private killStreak = 0;
  private lastKillT = -9;
  private lastShotSfxT = -9;
  private nextDetailAt = 0;

  private ensureRack(): DungeonAudioBus | null {
    const a = audioOut(), sg = sfxGraph();
    if (!a || !sg) return null;
    if (this.rack && this.rack.ctx === a.ctx) return this.rack;
    this.rack?.dispose();
    this.rack = new DungeonAudioBus(a.ctx, a.out, sg.noise);
    this.music.attachBus(this.rack);
    return this.rack;
  }

  private rateOk(key: string, minGapS: number): boolean {
    const c = this.rack?.ctx;
    if (!c) return false;
    const now = c.currentTime;
    const prev = this.lastPlayed.get(key) ?? -99;
    if (now - prev < minGapS) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  update(s: DungeonSnapshot): void {
    const a = audioOut();
    const rack = this.ensureRack();
    // 1. Adaptive multi-section music + subtle zone ambient bed (both auto-duck when external media plays)
    this.music.update(musicFor(s), true);
    if (s.phase === 'run' && !s.skillTree?.offer) {
      const bed = ZONE_BED[s.world.theme % ZONE_BED.length] ?? ZONE_BED[0];
      setAmbient('dungeon-zone', s.boss?.active ? bed.vol * 0.45 : bed.vol, bed.freq, bed.q);
    } else {
      setAmbient('dungeon-zone', 0.013, 175, 1.1); // gentle hearth air in Camp
    }

    // Subtle organic ambient detail accents (hearth crackle, crypt water drop, deep rumble)
    if (rack && a && !a.ducked) {
      const now = rack.ctx.currentTime;
      if (this.nextDetailAt <= 0) this.nextDetailAt = now + 2.5;
      if (now >= this.nextDetailAt) {
        this.nextDetailAt = now + (s.phase === 'camp' ? 1.4 + Math.random() * 2.2 : 3.2 + Math.random() * 4.5);
        if (s.phase === 'camp') playAmbientDetail(rack, 'ember');
        else if (!s.boss?.active && !s.skillTree?.offer) {
          const theme = s.world.theme % 4;
          playAmbientDetail(rack, theme === 1 ? 'drip' : theme === 2 ? 'chain' : theme === 3 ? 'magma' : 'ember');
        }
      }
    }

    // 2. Process sim cues (skip backlog on first mounted frame)
    if (this.lastCue < 0) this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      if (rack) this.handleCue(rack, c.name, s);
    }

    // 3. Snapshot-transition audio matched to visual combat beats
    if (s.phase === 'run') {
      const b = s.boss;
      if (b?.active) {
        if (b.cycle === 'windup' && this.prevBossCycle !== 'windup' && rack) {
          playDungeonSfx(rack, 'bossWindup');
        }
        if (b.cycle === 'exposed' && this.prevBossCycle !== 'exposed' && rack) {
          playDungeonSfx(rack, 'bossExposed', { parried: s.player.warded });
          this.music.duck(0.62, 0.25);
        }
        if (b.phase > this.prevBossPhase && this.prevBossPhase > 0 && rack) {
          playDungeonSfx(rack, 'bossStagger');
          this.music.duck(0.5, 0.35);
        }
        this.prevBossCycle = b.cycle;
        this.prevBossPhase = b.phase;
      } else {
        this.prevBossCycle = '';
        this.prevBossPhase = 0;
      }

      if (s.player.warded && !this.prevWarded && rack) playDungeonSfx(rack, 'wardUp');
      if (s.player.rallied && !this.prevRallied && rack) playDungeonSfx(rack, 'rally');
      if (s.player.rolling && !this.prevRolling && rack && this.rateOk('roll', 0.18)) {
        playDungeonSfx(rack, 'dodgeRoll');
      }
      if (s.player.secondWindFlash > 0.85 && this.prevSecondWindFlash <= 0.85 && rack) {
        playDungeonSfx(rack, 'secondWind');
        this.music.duck(0.45, 0.5);
      }
      this.prevWarded = s.player.warded;
      this.prevRallied = s.player.rallied;
      this.prevRolling = s.player.rolling;
      this.prevSecondWindFlash = s.player.secondWindFlash;

      // Fresh hero projectile sound matched to weapon style & element (rate-limited)
      if (rack && s.t - this.lastShotSfxT > 0.12) {
        const fresh = s.bullets.find((bl) => bl.friendly && !bl.drone && bl.age < 0.05);
        if (fresh && this.rateOk('weapon', 0.085)) {
          this.lastShotSfxT = s.t;
          const pan = Math.max(-0.5, Math.min(0.5, (fresh.x - s.player.x) * 0.18));
          playWeaponSfx(rack, s.weapon.base, s.weapon.element, 0.72, pan);
        }
      }
    } else {
      if (this.prevPhase === 'run' && s.camp?.lastRun?.won && rack) {
        playDungeonSfx(rack, 'victory');
      }
      this.prevBossCycle = '';
      this.prevBossPhase = 0;
      this.prevWarded = false;
      this.prevRallied = false;
      this.prevRolling = false;
      this.prevSecondWindFlash = 0;
    }
    this.prevPhase = s.phase;
  }

  private nearestEnemyPan(s: DungeonSnapshot): number {
    if (!s.enemies?.length) return 0;
    let bestD = 999, dx = 0;
    for (const e of s.enemies) {
      const d = Math.hypot(e.x - s.player.x, e.y - s.player.y);
      if (d < bestD) { bestD = d; dx = e.x - s.player.x; }
    }
    return Math.max(-0.65, Math.min(0.65, dx * 0.11));
  }

  private handleCue(rack: DungeonAudioBus, name: string, s: DungeonSnapshot): void {
    const pan = this.nearestEnemyPan(s);
    switch (name) {
      case 'coin': {
        if (!this.rateOk('coin', 0.032)) return;
        this.coinStreak = s.t - this.lastCoinT < 0.55 ? Math.min(PENTA.length - 1, this.coinStreak + 1) : 0;
        this.lastCoinT = s.t;
        playDungeonSfx(rack, 'coin', { streak: this.coinStreak, pan: (Math.random() - 0.5) * 0.45 });
        return;
      }
      case 'shoot':
      case 'shootHeavy':
      case 'zap':
      case 'flame': {
        if (!this.rateOk('weapon', 0.075)) return;
        this.lastShotSfxT = s.t;
        playWeaponSfx(rack, s.weapon.base, s.weapon.element, 0.9, pan * 0.45);
        return;
      }
      case 'hit': {
        if (!this.rateOk('hit', 0.042)) return;
        if (s.player.warded && s.player.hurt < 0.05) {
          playDungeonSfx(rack, 'wardBlock', { pan: 0 });
        } else {
          playDungeonSfx(rack, 'hit', { element: s.weapon.element, pan });
        }
        return;
      }
      case 'crit': {
        if (!this.rateOk('crit', 0.05)) return;
        playDungeonSfx(rack, 'crit', { element: s.weapon.element, pan });
        return;
      }
      case 'kill': {
        if (!this.rateOk('kill', 0.045)) return;
        this.killStreak = s.t - this.lastKillT < 1.3 ? Math.min(8, this.killStreak + 1) : 0;
        this.lastKillT = s.t;
        playDungeonSfx(rack, 'kill', { streak: this.killStreak, pan });
        return;
      }
      case 'explode': {
        if (!this.rateOk('explode', 0.065)) return;
        playDungeonSfx(rack, 'explode', { pan: pan * 0.5 });
        this.music.duck(0.54, 0.28);
        return;
      }
      case 'hurt': {
        if (!this.rateOk('hurt', 0.14)) return;
        playDungeonSfx(rack, 'hurt');
        this.music.duck(0.62, 0.22);
        return;
      }
      case 'bossStart': {
        if (!this.rateOk('bossStart', 0.35)) return;
        playDungeonSfx(rack, 'bossStart');
        this.music.duck(0.5, 0.45);
        return;
      }
      case 'bossDie': {
        playDungeonSfx(rack, 'bossDie');
        this.music.duck(0.38, 0.8);
        return;
      }
      case 'upgrade': { playDungeonSfx(rack, 'levelup'); return; }
      case 'boltOn': { playDungeonSfx(rack, 'equip'); playDungeonSfx(rack, 'wardBlock', { pan: 0 }); return; }
      case 'payoffSting':
      case 'unlock': { playDungeonSfx(rack, 'unique'); this.music.duck(0.55, 0.5); return; }
      case 'surge': { playDungeonSfx(rack, 'reward'); return; }
      case 'chime': { playDungeonSfx(rack, 'shrine'); return; }
      case 'swap':
      case 'uiMove':
      case 'uiBack': { playDungeonSfx(rack, 'select'); return; }
      default: {
        if (!this.rateOk(name, 0.04)) return;
        playDungeonSfx(rack, name, { pan: 0, element: s.weapon.element, weapon: s.weapon.base });
      }
    }
  }

  dispose(): void {
    this.music.stop();
    this.rack?.dispose();
    this.rack = null;
    stopAmbient();
  }
}

// ---------- Routing helper ----------

function connectSfx(rack: DungeonAudioBus, src: AudioNode, pan = 0, revAmt = 0.28): void {
  const out = pan ? rack.panner(pan) : src;
  if (out !== src) src.connect(out);
  out.connect(rack.sfxIn);
  if (revAmt > 0.01) {
    const rg = rack.ctx.createGain();
    rg.gain.value = revAmt;
    out.connect(rg);
    rg.connect(rack.sfxRevSend);
  }
}

// ---------- 10 Bespoke Weapon Foley Recipes + 5 Elemental Overlays ----------

export function playWeaponSfx(
  rack: DungeonAudioBus,
  style: WeaponStyle,
  element: Element = 'normal',
  vol = 0.9,
  pan = 0,
): void {
  const c = rack.ctx, t0 = c.currentTime, j = jitter(0.065);
  const sum = c.createGain();
  sum.gain.value = vol;

  switch (style) {
    case 'arrow': {
      // Taut bowstring twang + feathered air zip
      const str = c.createOscillator(); str.type = 'triangle';
      str.frequency.setValueAtTime(240 * j, t0);
      str.frequency.exponentialRampToValueAtTime(118 * j, t0 + 0.08);
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.24, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.095);
      str.connect(sg); sg.connect(sum); str.start(t0); str.stop(t0 + 0.11);

      const zip = c.createBufferSource(); zip.buffer = rack.whiteNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.8;
      bp.frequency.setValueAtTime(3400 * j, t0);
      bp.frequency.exponentialRampToValueAtTime(1400 * j, t0 + 0.07);
      const zg = c.createGain();
      zg.gain.setValueAtTime(0.0001, t0); zg.gain.linearRampToValueAtTime(0.22, t0 + 0.012);
      zg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
      zip.connect(bp); bp.connect(zg); zg.connect(sum); zip.start(t0); zip.stop(t0 + 0.1);
      break;
    }
    case 'bolt': {
      // Mechanical crossbow trigger latch click + heavy punchy release
      const clk = c.createBufferSource(); clk.buffer = rack.whiteNoise;
      const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 4200 * j; cf.Q.value = 3.5;
      const cg = c.createGain(); cg.gain.setValueAtTime(0.28, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);
      clk.connect(cf); cf.connect(cg); cg.connect(sum); clk.start(t0); clk.stop(t0 + 0.025);

      const body = c.createOscillator(); body.type = 'sawtooth';
      body.frequency.setValueAtTime(290 * j, t0 + 0.006);
      body.frequency.exponentialRampToValueAtTime(78 * j, t0 + 0.095);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
      const bg = c.createGain(); bg.gain.setValueAtTime(0.26, t0 + 0.006); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      body.connect(lp); lp.connect(bg); bg.connect(sum); body.start(t0 + 0.006); body.stop(t0 + 0.12);
      break;
    }
    case 'flame': {
      // Turbulent flame jet whoosh (low roar + mid flame sweep + bright ember crackle)
      const roar = c.createBufferSource(); roar.buffer = rack.pinkNoise; roar.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(420 * j, t0);
      lp.frequency.exponentialRampToValueAtTime(1150 * j, t0 + 0.07);
      lp.frequency.exponentialRampToValueAtTime(340 * j, t0 + 0.18);
      const rg = c.createGain();
      rg.gain.setValueAtTime(0.0001, t0); rg.gain.linearRampToValueAtTime(0.28, t0 + 0.025);
      rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.19);
      roar.connect(lp); lp.connect(rg); rg.connect(sum); roar.start(t0); roar.stop(t0 + 0.21);

      const sub = c.createOscillator(); sub.type = 'sine';
      sub.frequency.setValueAtTime(115 * j, t0); sub.frequency.exponentialRampToValueAtTime(52, t0 + 0.13);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.16, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      sub.connect(sg); sg.connect(sum); sub.start(t0); sub.stop(t0 + 0.15);
      break;
    }
    case 'star': {
      // Metallic shuriken spin whirr + tight air slice
      const whirr = c.createBufferSource(); whirr.buffer = rack.whiteNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3.2;
      bp.frequency.setValueAtTime(4800 * j, t0); bp.frequency.exponentialRampToValueAtTime(2200 * j, t0 + 0.075);
      const wg = c.createGain(); wg.gain.setValueAtTime(0.18, t0); wg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      whirr.connect(bp); bp.connect(wg); wg.connect(sum); whirr.start(t0); whirr.stop(t0 + 0.09);

      const ring = c.createOscillator(); ring.type = 'sine';
      ring.frequency.setValueAtTime(2650 * j, t0); ring.frequency.exponentialRampToValueAtTime(1900 * j, t0 + 0.07);
      const rg = c.createGain(); rg.gain.setValueAtTime(0.11, t0); rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
      ring.connect(rg); rg.connect(sum); ring.start(t0); ring.stop(t0 + 0.09);
      break;
    }
    case 'spark': {
      // Tesla arc crackle + rapid FM electric snap
      const arc = c.createBufferSource(); arc.buffer = rack.whiteNoise;
      const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 4600 * j; hp.Q.value = 2.0;
      const ag = c.createGain(); ag.gain.setValueAtTime(0.24, t0); ag.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.065);
      arc.connect(hp); hp.connect(ag); ag.connect(sum); arc.start(t0); arc.stop(t0 + 0.075);

      const car = c.createOscillator(); car.type = 'sawtooth';
      car.frequency.setValueAtTime(1650 * j, t0); car.frequency.exponentialRampToValueAtTime(340 * j, t0 + 0.085);
      const mod = c.createOscillator(); mod.frequency.value = 95;
      const mg = c.createGain(); mg.gain.value = 380;
      mod.connect(mg); mg.connect(car.frequency);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const cg = c.createGain(); cg.gain.setValueAtTime(0.13, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      car.connect(lp); lp.connect(cg); cg.connect(sum);
      car.start(t0); car.stop(t0 + 0.1); mod.start(t0); mod.stop(t0 + 0.1);
      break;
    }
    case 'orb': {
      // Arcane crystalline pulse (warm sub bloom + harmonic chime pair)
      for (const [hz, amp, d] of [[330 * j, 0.16, 0.14], [495 * j, 0.12, 0.12], [990 * j, 0.07, 0.1]] as const) {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(hz * 0.92, t0); o.frequency.exponentialRampToValueAtTime(hz * 1.08, t0 + d);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.014);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + d + 0.02);
      }
      break;
    }
    case 'knife': {
      // Razor steel draw/swipe
      const air = c.createBufferSource(); air.buffer = rack.whiteNoise;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200 * j;
      const ag = c.createGain(); ag.gain.setValueAtTime(0.22, t0); ag.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      air.connect(hp); hp.connect(ag); ag.connect(sum); air.start(t0); air.stop(t0 + 0.065);

      const steel = c.createOscillator(); steel.type = 'triangle';
      steel.frequency.setValueAtTime(3400 * j, t0); steel.frequency.exponentialRampToValueAtTime(1600 * j, t0 + 0.06);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.11, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.065);
      steel.connect(sg); sg.connect(sum); steel.start(t0); steel.stop(t0 + 0.075);
      break;
    }
    case 'axe': {
      // Heavy spinning cleaver whoosh + low weight thump
      const wh = c.createBufferSource(); wh.buffer = rack.pinkNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(980 * j, t0); bp.frequency.exponentialRampToValueAtTime(280 * j, t0 + 0.14);
      const wg = c.createGain(); wg.gain.setValueAtTime(0.0001, t0); wg.gain.linearRampToValueAtTime(0.3, t0 + 0.02);
      wg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      wh.connect(bp); bp.connect(wg); wg.connect(sum); wh.start(t0); wh.stop(t0 + 0.16);

      const th = c.createOscillator(); th.type = 'sine';
      th.frequency.setValueAtTime(155 * j, t0); th.frequency.exponentialRampToValueAtTime(55 * j, t0 + 0.11);
      const tg = c.createGain(); tg.gain.setValueAtTime(0.24, t0); tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      th.connect(tg); tg.connect(sum); th.start(t0); th.stop(t0 + 0.13);
      break;
    }
    case 'spear': {
      // Clean piercing lance thrust
      const sw = c.createBufferSource(); sw.buffer = rack.whiteNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.4;
      bp.frequency.setValueAtTime(1600 * j, t0); bp.frequency.exponentialRampToValueAtTime(3600 * j, t0 + 0.045);
      bp.frequency.exponentialRampToValueAtTime(1100 * j, t0 + 0.1);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.22, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      sw.connect(bp); bp.connect(sg); sg.connect(sum); sw.start(t0); sw.stop(t0 + 0.12);

      const snap = c.createOscillator(); snap.type = 'triangle';
      snap.frequency.setValueAtTime(360 * j, t0); snap.frequency.exponentialRampToValueAtTime(135 * j, t0 + 0.06);
      const ng = c.createGain(); ng.gain.setValueAtTime(0.18, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
      snap.connect(ng); ng.connect(sum); snap.start(t0); snap.stop(t0 + 0.08);
      break;
    }
    default: {
      // 'pellet' — crisp sling pop + punchy transient
      const pop = c.createOscillator(); pop.type = 'triangle';
      pop.frequency.setValueAtTime(340 * j, t0); pop.frequency.exponentialRampToValueAtTime(98 * j, t0 + 0.065);
      const pg = c.createGain(); pg.gain.setValueAtTime(0.24, t0); pg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
      pop.connect(pg); pg.connect(sum); pop.start(t0); pop.stop(t0 + 0.085);

      const whip = c.createBufferSource(); whip.buffer = rack.whiteNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 * j; bp.Q.value = 1.6;
      const wg = c.createGain(); wg.gain.setValueAtTime(0.16, t0); wg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
      whip.connect(bp); bp.connect(wg); wg.connect(sum); whip.start(t0); whip.stop(t0 + 0.05);
      break;
    }
  }

  // Subtle elemental overlay tail
  if (element !== 'normal') addElementFlavor(rack, sum, element, t0, 0.55);
  connectSfx(rack, sum, pan, 0.22);
}

function addElementFlavor(rack: DungeonAudioBus, dest: AudioNode, element: Element, t0: number, level: number): void {
  const c = rack.ctx, j = jitter(0.08);
  if (element === 'fire') {
    const s = c.createBufferSource(); s.buffer = rack.pinkNoise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 * j; bp.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(0.14 * level, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    s.connect(bp); bp.connect(g); g.connect(dest); s.start(t0 + 0.01); s.stop(t0 + 0.14);
  } else if (element === 'frost') {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2850 * j;
    const g = c.createGain(); g.gain.setValueAtTime(0.09 * level, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 0.16);
  } else if (element === 'storm') {
    const s = c.createBufferSource(); s.buffer = rack.whiteNoise;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5400;
    const g = c.createGain(); g.gain.setValueAtTime(0.15 * level, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    s.connect(hp); hp.connect(g); g.connect(dest); s.start(t0); s.stop(t0 + 0.06);
  } else if (element === 'venom') {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(280 * j, t0); o.frequency.exponentialRampToValueAtTime(640 * j, t0 + 0.09);
    const g = c.createGain(); g.gain.setValueAtTime(0.1 * level, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 0.12);
  } else if (element === 'arcane') {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 1175 * j;
    const g = c.createGain(); g.gain.setValueAtTime(0.08 * level, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 0.17);
  }
}

// ---------- Bespoke Dungeon Combat, Loot, World & Boss SFX ----------

export function playDungeonSfx(rack: DungeonAudioBus, kind: string, opts: SfxOpts = {}): void {
  const c = rack.ctx, t0 = c.currentTime;
  const vol = opts.vol ?? 1, pan = opts.pan ?? 0, j = jitter(0.06);
  const sum = c.createGain();
  sum.gain.value = vol;

  switch (kind) {
    case 'hit': {
      // Meaty muted impact thud + crisp transient slap
      const thud = c.createOscillator(); thud.type = 'sine';
      thud.frequency.setValueAtTime(145 * j, t0); thud.frequency.exponentialRampToValueAtTime(48 * j, t0 + 0.07);
      const tg = c.createGain(); tg.gain.setValueAtTime(0.28, t0); tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      thud.connect(tg); tg.connect(sum); thud.start(t0); thud.stop(t0 + 0.09);

      const slap = c.createBufferSource(); slap.buffer = rack.whiteNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1950 * j; bp.Q.value = 1.4;
      const sg = c.createGain(); sg.gain.setValueAtTime(0.18, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.032);
      slap.connect(bp); bp.connect(sg); sg.connect(sum); slap.start(t0); slap.stop(t0 + 0.04);

      if (opts.element && opts.element !== 'normal') addElementFlavor(rack, sum, opts.element, t0, 0.45);
      connectSfx(rack, sum, pan, 0.18);
      return;
    }

    case 'crit': {
      // Ringing steel clang + deep sub thump + crystalline ping
      const sub = c.createOscillator(); sub.type = 'sine';
      sub.frequency.setValueAtTime(170 * j, t0); sub.frequency.exponentialRampToValueAtTime(46, t0 + 0.11);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.32, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      sub.connect(sg); sg.connect(sum); sub.start(t0); sub.stop(t0 + 0.13);

      for (const [hz, amp, d] of [[1174.7 * j, 0.17, 0.22], [2349.3 * j, 0.11, 0.18], [3220 * j, 0.08, 0.11]] as const) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = clampF(c, hz);
        const g = c.createGain(); g.gain.setValueAtTime(amp, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + d + 0.02);
      }
      const snap = c.createBufferSource(); snap.buffer = rack.whiteNoise;
      const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3800; hp.Q.value = 1.8;
      const ng = c.createGain(); ng.gain.setValueAtTime(0.2, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
      snap.connect(hp); hp.connect(ng); ng.connect(sum); snap.start(t0); snap.stop(t0 + 0.05);
      connectSfx(rack, sum, pan, 0.36);
      return;
    }

    case 'kill': {
      // Crunchy burst + musical pentatonic confirmation chime (climbs with streak)
      const cr = c.createBufferSource(); cr.buffer = rack.pinkNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.3;
      bp.frequency.setValueAtTime(2200 * j, t0); bp.frequency.exponentialRampToValueAtTime(420, t0 + 0.12);
      const cg = c.createGain(); cg.gain.setValueAtTime(0.22, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
      cr.connect(bp); bp.connect(cg); cg.connect(sum); cr.start(t0); cr.stop(t0 + 0.14);

      const th = c.createOscillator(); th.type = 'sine';
      th.frequency.setValueAtTime(160 * j, t0); th.frequency.exponentialRampToValueAtTime(42, t0 + 0.13);
      const tg = c.createGain(); tg.gain.setValueAtTime(0.26, t0); tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      th.connect(tg); tg.connect(sum); th.start(t0); th.stop(t0 + 0.15);

      const st = opts.streak ?? 0;
      const noteF = mtof(69 + PENTA[st % PENTA.length]);
      const ch = c.createOscillator(); ch.type = 'triangle'; ch.frequency.value = noteF;
      const chg = c.createGain(); chg.gain.setValueAtTime(0.0001, t0 + 0.02);
      chg.gain.linearRampToValueAtTime(0.11, t0 + 0.032);
      chg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      ch.connect(chg); chg.connect(sum); ch.start(t0 + 0.02); ch.stop(t0 + 0.22);
      connectSfx(rack, sum, pan, 0.3);
      return;
    }

    case 'explode': {
      // Cinema-grade Strike / explosion: sub drop + shockwave sweep + crackling debris + hall tail
      const sub = c.createOscillator(); sub.type = 'sine';
      sub.frequency.setValueAtTime(140, t0); sub.frequency.exponentialRampToValueAtTime(28, t0 + 0.34);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.45, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
      sub.connect(sg); sg.connect(sum); sub.start(t0); sub.stop(t0 + 0.42);

      const blast = c.createBufferSource(); blast.buffer = rack.pinkNoise; blast.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
      lp.frequency.setValueAtTime(2800, t0); lp.frequency.exponentialRampToValueAtTime(180, t0 + 0.42);
      const bg = c.createGain(); bg.gain.setValueAtTime(0.42, t0); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.46);
      blast.connect(lp); lp.connect(bg); bg.connect(sum); blast.start(t0); blast.stop(t0 + 0.5);

      const crack = c.createBufferSource(); crack.buffer = rack.whiteNoise;
      const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3400; hp.Q.value = 1.0;
      const cg = c.createGain(); cg.gain.setValueAtTime(0.28, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      crack.connect(hp); hp.connect(cg); cg.connect(sum); crack.start(t0); crack.stop(t0 + 0.07);
      connectSfx(rack, sum, pan, 0.52);
      return;
    }

    case 'hurt': {
      // Visceral body impact + metallic armor crunch
      const th = c.createOscillator(); th.type = 'sine';
      th.frequency.setValueAtTime(125, t0); th.frequency.exponentialRampToValueAtTime(36, t0 + 0.18);
      const tg = c.createGain(); tg.gain.setValueAtTime(0.38, t0); tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      th.connect(tg); tg.connect(sum); th.start(t0); th.stop(t0 + 0.22);

      const gr = c.createOscillator(); gr.type = 'sawtooth';
      gr.frequency.setValueAtTime(185, t0); gr.frequency.exponentialRampToValueAtTime(68, t0 + 0.16);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620;
      const gg = c.createGain(); gg.gain.setValueAtTime(0.22, t0); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      gr.connect(lp); lp.connect(gg); gg.connect(sum); gr.start(t0); gr.stop(t0 + 0.2);

      const cr = c.createBufferSource(); cr.buffer = rack.pinkNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
      const cg = c.createGain(); cg.gain.setValueAtTime(0.22, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      cr.connect(bp); bp.connect(cg); cg.connect(sum); cr.start(t0); cr.stop(t0 + 0.14);
      connectSfx(rack, sum, 0, 0.25);
      return;
    }

    case 'wardBlock': {
      // Crystalline runic shield deflection ping
      for (const [hz, amp, d] of [[987.8, 0.18, 0.22], [1480, 0.14, 0.18], [2960, 0.08, 0.12]] as const) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz * j;
        const g = c.createGain(); g.gain.setValueAtTime(amp, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + d + 0.02);
      }
      connectSfx(rack, sum, 0, 0.42);
      return;
    }

    case 'coin': {
      // Authentic metallic gold coin clink (inharmonic partials climbing D-major pentatonic on streaks!)
      const st = opts.streak ?? 0;
      const baseF = mtof(81 + PENTA[Math.min(PENTA.length - 1, st)]);
      const partials: Array<[number, number, number]> = [[1.0, 0.15, 0.18], [1.68, 0.1, 0.11], [2.49, 0.07, 0.07]];
      for (const [ratio, amp, d] of partials) {
        const pf = baseF * ratio * jitter(0.02);
        if (pf > c.sampleRate * 0.44) continue;
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = pf;
        const g = c.createGain(); g.gain.setValueAtTime(amp, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + d + 0.02);
      }
      // Second micro-clink bounce 42 ms later for real coin feel
      const bounce = c.createOscillator(); bounce.type = 'sine'; bounce.frequency.value = clampF(c, baseF * 1.5);
      const bg = c.createGain(); bg.gain.setValueAtTime(0.11, t0 + 0.042); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      bounce.connect(bg); bg.connect(sum); bounce.start(t0 + 0.042); bounce.stop(t0 + 0.22);
      connectSfx(rack, sum, pan, 0.3);
      return;
    }

    case 'pickup': {
      for (const [hz, d] of [[587.3, 0], [880, 0.055], [1174.7, 0.11]] as const) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
        const g = c.createGain(); g.gain.setValueAtTime(0.15, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
        o.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.2);
      }
      connectSfx(rack, sum, pan, 0.35);
      return;
    }

    case 'equip': {
      // Steel buckle click + warm confirming fifth
      const clk = c.createBufferSource(); clk.buffer = rack.whiteNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 3.2;
      const cg = c.createGain(); cg.gain.setValueAtTime(0.2, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
      clk.connect(bp); bp.connect(cg); cg.connect(sum); clk.start(t0); clk.stop(t0 + 0.03);

      for (const [hz, d] of [[392, 0.02], [587.3, 0.08], [784, 0.14]] as const) {
        const o = c.createOscillator(); o.setPeriodicWave(rack.wave('lute')); o.frequency.value = hz;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        const g = c.createGain(); g.gain.setValueAtTime(0.18, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.24);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.26);
      }
      connectSfx(rack, sum, 0, 0.38);
      return;
    }

    case 'unique': {
      // Sparkling harp glissando + cathedral bell glow
      const notes = [62, 66, 69, 74, 78, 81, 86];
      notes.forEach((m, i) => {
        const dt = i * 0.055;
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.linearRampToValueAtTime(0.16, t0 + dt + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.65);
        o.connect(g); g.connect(sum); o.start(t0 + dt); o.stop(t0 + dt + 0.7);
      });
      connectSfx(rack, sum, 0, 0.65);
      return;
    }

    case 'levelup': {
      // Heroic ascending brass + bell chord
      const chord = [62, 69, 74, 78, 81];
      chord.forEach((m, i) => {
        const dt = i * 0.05;
        const o = c.createOscillator(); o.setPeriodicWave(rack.wave('brass')); o.frequency.value = mtof(m);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t0 + dt);
        lp.frequency.exponentialRampToValueAtTime(2800, t0 + dt + 0.12);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.linearRampToValueAtTime(0.15, t0 + dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.55);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0 + dt); o.stop(t0 + dt + 0.6);
      });
      connectSfx(rack, sum, 0, 0.55);
      return;
    }

    case 'potion': {
      // Cork pop + bubbling liquid sweep + warm healing shimmer
      const cork = c.createOscillator(); cork.type = 'sine';
      cork.frequency.setValueAtTime(260, t0); cork.frequency.exponentialRampToValueAtTime(720, t0 + 0.045);
      const cg = c.createGain(); cg.gain.setValueAtTime(0.22, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      cork.connect(cg); cg.connect(sum); cork.start(t0); cork.stop(t0 + 0.065);

      for (const [d, f0, f1] of [[0.06, 360, 620], [0.13, 440, 780], [0.21, 587, 1175]] as const) {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0, t0 + d); o.frequency.exponentialRampToValueAtTime(f1, t0 + d + 0.12);
        const g = c.createGain(); g.gain.setValueAtTime(0.14, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
        o.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.24);
      }
      connectSfx(rack, sum, 0, 0.42);
      return;
    }

    case 'door': {
      // Heavy stone portcullis grind + low resonant latch thud
      const grind = c.createBufferSource(); grind.buffer = rack.pinkNoise; grind.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(280, t0); bp.frequency.exponentialRampToValueAtTime(140, t0 + 0.28);
      const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t0); gg.gain.linearRampToValueAtTime(0.28, t0 + 0.04);
      gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      grind.connect(bp); bp.connect(gg); gg.connect(sum); grind.start(t0); grind.stop(t0 + 0.33);

      const th = c.createOscillator(); th.type = 'sine';
      th.frequency.setValueAtTime(98, t0 + 0.22); th.frequency.exponentialRampToValueAtTime(38, t0 + 0.36);
      const tg = c.createGain(); tg.gain.setValueAtTime(0.32, t0 + 0.22); tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
      th.connect(tg); tg.connect(sum); th.start(t0 + 0.22); th.stop(t0 + 0.4);
      connectSfx(rack, sum, 0, 0.55);
      return;
    }

    case 'stairs': {
      // 3 echoing stone footsteps + warm resolving descent chord
      [0, 0.13, 0.26].forEach((d, i) => {
        const s = c.createBufferSource(); s.buffer = rack.pinkNoise;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520 - i * 80; bp.Q.value = 1.8;
        const g = c.createGain(); g.gain.setValueAtTime(0.18 - i * 0.03, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.07);
        s.connect(bp); bp.connect(g); g.connect(sum); s.start(t0 + d); s.stop(t0 + d + 0.08);
      });
      [62, 57, 50].forEach((m, i) => {
        const d = 0.08 + i * 0.12;
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
        const g = c.createGain(); g.gain.setValueAtTime(0.14, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.5);
        o.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.55);
      });
      connectSfx(rack, sum, 0, 0.65);
      return;
    }

    case 'shrine': {
      // Mystical singing bowl + choral fifth bloom
      for (const [hz, amp] of [[293.7, 0.16], [440, 0.13], [587.3, 0.1], [880, 0.07]] as const) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(amp, t0 + 0.16);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
        o.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + 1.1);
      }
      connectSfx(rack, sum, 0, 0.72);
      return;
    }

    case 'reward': {
      [62, 66, 69, 74].forEach((m, i) => {
        const d = i * 0.055;
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
        const g = c.createGain(); g.gain.setValueAtTime(0.16, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.34);
        o.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.38);
      });
      connectSfx(rack, sum, 0, 0.48);
      return;
    }

    case 'curse': {
      // Ominous detuned tritone cathedral bell + dark sub swell
      for (const [hz, amp] of [[146.8, 0.22], [207.7, 0.2], [211.0, 0.16], [415.3, 0.1]] as const) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1400, t0); lp.frequency.exponentialRampToValueAtTime(240, t0 + 1.1);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + 1.25);
      }
      connectSfx(rack, sum, 0, 0.75);
      return;
    }

    case 'select': {
      // Warm medieval wooden tap
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(520 * j, t0); o.frequency.exponentialRampToValueAtTime(340 * j, t0 + 0.035);
      const g = c.createGain(); g.gain.setValueAtTime(0.11, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      o.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + 0.055);
      connectSfx(rack, sum, 0, 0.12);
      return;
    }

    case 'buy': {
      playDungeonSfx(rack, 'coin', { streak: 3, vol: 0.75 * vol });
      for (const [hz, d] of [[587.3, 0.05], [880, 0.11]] as const) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
        const g = c.createGain(); g.gain.setValueAtTime(0.14, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
        o.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.24);
      }
      connectSfx(rack, sum, 0, 0.35);
      return;
    }

    case 'deny': {
      // Soft dull wooden double-thud
      for (const [hz, d] of [[170, 0], [135, 0.075]] as const) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460;
        const g = c.createGain(); g.gain.setValueAtTime(0.18, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.08);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.09);
      }
      connectSfx(rack, sum, 0, 0.12);
      return;
    }

    case 'dodgeRoll': {
      const air = c.createBufferSource(); air.buffer = rack.pinkNoise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(520, t0); bp.frequency.exponentialRampToValueAtTime(1600, t0 + 0.06);
      bp.frequency.exponentialRampToValueAtTime(420, t0 + 0.16);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
      air.connect(bp); bp.connect(g); g.connect(sum); air.start(t0); air.stop(t0 + 0.19);
      connectSfx(rack, sum, 0, 0.2);
      return;
    }

    case 'wardUp': {
      // Shimmering runic barrier activation
      [587.3, 880, 1174.7, 1760].forEach((hz, i) => {
        const d = i * 0.035;
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.linearRampToValueAtTime(0.14, t0 + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.36);
        o.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.4);
      });
      connectSfx(rack, sum, 0, 0.55);
      return;
    }

    case 'rally': {
      // Energizing heroic brass horn call (D5 - A5)
      for (const [hz, d, dur] of [[293.7, 0, 0.22], [440, 0.14, 0.42], [587.3, 0.14, 0.42]] as const) {
        const o = c.createOscillator(); o.setPeriodicWave(rack.wave('brass')); o.frequency.value = hz;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(420, t0 + d); lp.frequency.exponentialRampToValueAtTime(2400, t0 + d + 0.08);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0 + d); g.gain.linearRampToValueAtTime(0.18, t0 + d + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + dur);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + dur + 0.05);
      }
      connectSfx(rack, sum, 0, 0.58);
      return;
    }

    case 'secondWind': {
      // Soaring phoenix revival swell + bell burst
      [293.7, 440, 587.3, 740, 880, 1174.7].forEach((hz, i) => {
        const d = i * 0.048;
        const o = c.createOscillator(); o.setPeriodicWave(rack.wave('brass')); o.frequency.value = hz;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.linearRampToValueAtTime(0.16, t0 + d + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.85);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.9);
      });
      connectSfx(rack, sum, 0, 0.72);
      return;
    }

    case 'bossStart': {
      // Deep war-horn blast + ominous timpani rumble
      for (const [hz, det, amp] of [[73.4, -6, 0.28], [73.4, 6, 0.24], [110, 0, 0.16]] as const) {
        const o = c.createOscillator(); o.setPeriodicWave(rack.wave('brass'));
        o.frequency.setValueAtTime(hz * 0.97, t0); o.frequency.exponentialRampToValueAtTime(hz, t0 + 0.12);
        o.detune.value = det;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(220, t0); lp.frequency.exponentialRampToValueAtTime(1150, t0 + 0.22);
        lp.frequency.exponentialRampToValueAtTime(340, t0 + 1.15);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.14);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + 1.3);
      }
      connectSfx(rack, sum, 0, 0.75);
      return;
    }

    case 'bossWindup': {
      // Rising ominous tension brass/strings swell with tremolo
      const o = c.createOscillator(); o.setPeriodicWave(rack.wave('brass'));
      o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(311, t0 + 0.75);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(360, t0); lp.frequency.exponentialRampToValueAtTime(2200, t0 + 0.75);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.2, t0 + 0.65);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.82);
      o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + 0.85);
      connectSfx(rack, sum, 0, 0.5);
      return;
    }

    case 'bossExposed': {
      // Dramatic guard-shatter crystal break + heroic punish chord
      const sh = c.createBufferSource(); sh.buffer = rack.whiteNoise;
      const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 4600; hp.Q.value = 1.6;
      const sg = c.createGain(); sg.gain.setValueAtTime(0.24, t0); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      sh.connect(hp); hp.connect(sg); sg.connect(sum); sh.start(t0); sh.stop(t0 + 0.14);

      const notes = opts.parried ? [523.3, 784, 1046.5, 1568] : [440, 659.3, 880];
      notes.forEach((hz, i) => {
        const d = i * 0.04;
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
        const g = c.createGain(); g.gain.setValueAtTime(0.19, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.45);
        o.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.48);
      });
      connectSfx(rack, sum, 0, 0.6);
      return;
    }

    case 'bossStagger': {
      playDungeonSfx(rack, 'explode', { vol: 0.75 * vol });
      playDungeonSfx(rack, 'bossStart', { vol: 0.65 * vol });
      return;
    }

    case 'bossDie': {
      // Massive collapse boom + triumphant ascending harp/brass cascade
      playDungeonSfx(rack, 'explode', { vol: 1.0 * vol });
      [50, 57, 62, 66, 69, 74, 81].forEach((m, i) => {
        const d = 0.22 + i * 0.065;
        const o = c.createOscillator(); o.setPeriodicWave(rack.wave(i < 3 ? 'brass' : 'lute')); o.frequency.value = mtof(m);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.linearRampToValueAtTime(0.18, t0 + d + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.85);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 0.9);
      });
      connectSfx(rack, sum, 0, 0.75);
      return;
    }

    case 'victory': {
      // Grand Tour finish fanfare
      const notes = [[62, 0], [66, 0.11], [69, 0.22], [74, 0.34], [78, 0.46], [86, 0.6]] as const;
      for (const [m, d] of notes) {
        const o = c.createOscillator(); o.setPeriodicWave(rack.wave('brass')); o.frequency.value = mtof(m);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.linearRampToValueAtTime(0.18, t0 + d + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.95);
        o.connect(lp); lp.connect(g); g.connect(sum); o.start(t0 + d); o.stop(t0 + d + 1.0);
      }
      connectSfx(rack, sum, 0, 0.72);
      return;
    }

    default: {
      // Fallback soft chime for any unrecognized cue
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 660 * j;
      const g = c.createGain(); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.connect(g); g.connect(sum); o.start(t0); o.stop(t0 + 0.14);
      connectSfx(rack, sum, pan, 0.25);
    }
  }
}

/** Subtle organic zone ambience accents (hearth ember crackle, crypt water drop, catacomb chain, deep rumble). */
function playAmbientDetail(rack: DungeonAudioBus, kind: 'ember' | 'drip' | 'chain' | 'magma'): void {
  const c = rack.ctx, t0 = c.currentTime, pan = (Math.random() - 0.5) * 1.1;
  if (kind === 'ember') {
    const s = c.createBufferSource(); s.buffer = rack.whiteNoise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200 + Math.random() * 2400; bp.Q.value = 3.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.018);
    s.connect(bp); bp.connect(g); connectSfx(rack, g, pan, 0.25); s.start(t0); s.stop(t0 + 0.025);
  } else if (kind === 'drip') {
    const f = 1100 + Math.random() * 700;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.75, t0); o.frequency.exponentialRampToValueAtTime(f * 1.45, t0 + 0.055);
    const g = c.createGain(); g.gain.setValueAtTime(0.045, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
    o.connect(g); connectSfx(rack, g, pan, 0.8); o.start(t0); o.stop(t0 + 0.09);
  } else if (kind === 'chain') {
    for (const [d, f] of [[0, 2900], [0.05, 3450]] as const) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * jitter(0.08);
      const g = c.createGain(); g.gain.setValueAtTime(0.022, t0 + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.06);
      o.connect(g); connectSfx(rack, g, pan, 0.65); o.start(t0 + d); o.stop(t0 + d + 0.08);
    }
  } else {
    const s = c.createBufferSource(); s.buffer = rack.pinkNoise; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    s.connect(lp); lp.connect(g); connectSfx(rack, g, pan * 0.4, 0.4); s.start(t0); s.stop(t0 + 1.6);
  }
}
