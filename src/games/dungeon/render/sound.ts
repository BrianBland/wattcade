// Complete audio soundscape for Purgatour: procedural music, subtle zone ambience,
// weapon/element-matched shots, boss telegraph/parry/expose audio, and combo-pitched feedback.
import { play, setAmbient, sfxGraph, stopAmbient, type SfxName } from '../../../audio/sfx';
import type { Element, WeaponStyle } from '../sim/loot';
import type { DungeonSnapshot } from '../sim/types';
import { DungeonMusic } from './music';
import { musicFor } from './musicScore';

const CUE_GAP: Partial<Record<SfxName, number>> = {
  shoot: 0.06, shootHeavy: 0.09, zap: 0.06, flame: 0.08, hit: 0.04, crit: 0.06, coin: 0.035, kill: 0.05,
};

const ELEMENT_PITCH: Record<Element, number> = {
  normal: 1, fire: 0.92, frost: 1.18, storm: 1.28, venom: 0.84, arcane: 1.12,
};

const STYLE_SFX: Record<WeaponStyle, { name: SfxName; pitch: number; vol: number }> = {
  pellet: { name: 'shoot', pitch: 0.95, vol: 0.72 },
  arrow: { name: 'shoot', pitch: 1.22, vol: 0.65 },
  bolt: { name: 'shootHeavy', pitch: 1.25, vol: 0.7 },
  flame: { name: 'flame', pitch: 0.95, vol: 0.85 },
  star: { name: 'whoosh', pitch: 1.6, vol: 0.45 },
  spark: { name: 'zap', pitch: 1.15, vol: 0.75 },
  orb: { name: 'chime', pitch: 0.72, vol: 0.42 },
  knife: { name: 'whoosh', pitch: 1.9, vol: 0.42 },
  axe: { name: 'shootHeavy', pitch: 0.78, vol: 0.78 },
  spear: { name: 'whoosh', pitch: 1.25, vol: 0.6 },
};

const ZONE_BED: ReadonlyArray<{ freq: number; q: number; vol: number }> = [
  { freq: 240, q: 1.4, vol: 0.025 }, // Keep: low stone hall draft + torch warmth
  { freq: 380, q: 2.2, vol: 0.024 }, // Crypt: hollow damp echo
  { freq: 520, q: 2.6, vol: 0.022 }, // Catacombs: dry bone-corridor wind
  { freq: 150, q: 1.1, vol: 0.032 }, // Deep: subterranean lava rumble
];

export class DungeonSound {
  private music = new DungeonMusic();
  private lastCue = -1;
  private prevBossCycle = '';
  private prevBossPhase = 0;
  private prevWarded = false;
  private prevRallied = false;
  private prevSecondWindFlash = 0;
  private prevPhase = '';
  private coinStreak = 0;
  private lastCoinT = -9;
  private lastShotSfxT = -9;

  update(s: DungeonSnapshot): void {
    // 1. Procedural music + subtle zone ambient bed (both auto-duck when media plays)
    this.music.update(musicFor(s), true);
    if (s.phase === 'run' && !s.perks?.offer) {
      const bed = ZONE_BED[s.world.theme % ZONE_BED.length] ?? ZONE_BED[0];
      setAmbient('dungeon-zone', s.boss?.active ? bed.vol * 0.5 : bed.vol, bed.freq, bed.q);
    } else {
      setAmbient('dungeon-zone', 0.014, 190, 1.2); // gentle hearth rumble in Camp
    }

    // 2. Process sim cues (skip backlog on first mounted frame)
    if (this.lastCue < 0) this.lastCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) {
      if (c.id <= this.lastCue) continue;
      this.lastCue = c.id;
      this.playCue(c.name, s);
    }

    // 3. Snapshot-transition audio matched to visual combat beats
    if (s.phase === 'run') {
      const b = s.boss;
      if (b?.active) {
        if (b.cycle === 'windup' && this.prevBossCycle !== 'windup') this.playBossWindup();
        if (b.cycle === 'exposed' && this.prevBossCycle !== 'exposed') this.playBossExposed(s.player.warded);
        if (b.phase > this.prevBossPhase && this.prevBossPhase > 0) this.playBossStagger();
        this.prevBossCycle = b.cycle;
        this.prevBossPhase = b.phase;
      } else {
        this.prevBossCycle = '';
        this.prevBossPhase = 0;
      }
      if (s.player.warded && !this.prevWarded) this.playWardUp();
      if (s.player.rallied && !this.prevRallied) play('horn', { vol: 0.7, pitch: 1.25 });
      if (s.player.secondWindFlash > 0.85 && this.prevSecondWindFlash <= 0.85) this.playSecondWind();
      this.prevWarded = s.player.warded;
      this.prevRallied = s.player.rallied;
      this.prevSecondWindFlash = s.player.secondWindFlash;

      // Fresh hero projectile sound matched to weapon style & element (rate-limited)
      if (s.t - this.lastShotSfxT > 0.13) {
        const fresh = s.bullets.some((bl) => bl.friendly && !bl.drone && bl.age < 0.05);
        if (fresh) {
          this.lastShotSfxT = s.t;
          const st = STYLE_SFX[s.weapon.base] ?? STYLE_SFX.pellet;
          const elP = ELEMENT_PITCH[s.weapon.element] ?? 1;
          play(st.name, { vol: st.vol * 0.65, pitch: st.pitch * elP, minGapS: 0.09 });
        }
      }
    } else {
      if (this.prevPhase === 'run' && s.camp?.lastRun?.won) this.playVictoryFanfare();
      this.prevBossCycle = '';
      this.prevBossPhase = 0;
      this.prevWarded = false;
      this.prevRallied = false;
      this.prevSecondWindFlash = 0;
    }
    this.prevPhase = s.phase;
  }

  private playCue(name: string, s: DungeonSnapshot): void {
    if (name === 'coin') {
      // Escalate pitch slightly on rapid coin pickups (coin rain / chest burst)
      this.coinStreak = s.t - this.lastCoinT < 0.45 ? Math.min(10, this.coinStreak + 1) : 0;
      this.lastCoinT = s.t;
      play('coin', { vol: 0.85, pitch: 1 + this.coinStreak * 0.05, minGapS: 0.03 });
      return;
    }
    if (name === 'shoot' || name === 'shootHeavy' || name === 'zap' || name === 'flame') {
      const st = STYLE_SFX[s.weapon.base] ?? STYLE_SFX.pellet;
      const elP = ELEMENT_PITCH[s.weapon.element] ?? 1;
      play(st.name, { vol: st.vol, pitch: st.pitch * elP, minGapS: CUE_GAP[st.name] ?? 0.07 });
      return;
    }
    if (name === 'explode') {
      play('explode', { vol: 0.9, minGapS: 0.06 });
      this.playStrikeBoom();
      return;
    }
    if (name === 'crit') {
      play('crit', { vol: 0.9, pitch: 1.05, minGapS: 0.05 });
      return;
    }
    play(name as SfxName, { minGapS: CUE_GAP[name as SfxName] });
  }

  private playStrikeBoom(): void {
    const g = sfxGraph(); if (!g) return;
    const { ctx: c, out } = g, now = c.currentTime;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(34, now + 0.28);
    gn.gain.setValueAtTime(0.32, now); gn.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    o.connect(gn); gn.connect(out); o.start(now); o.stop(now + 0.32);
  }

  private playWardUp(): void {
    const g = sfxGraph(); if (!g) return;
    const { ctx: c, out } = g, now = c.currentTime;
    for (const [f, d] of [[587.3, 0], [880, 0.04], [1174.7, 0.09]] as const) {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, now + d);
      gn.gain.setValueAtTime(0.0001, now + d); gn.gain.exponentialRampToValueAtTime(0.14, now + d + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.32);
      o.connect(gn); gn.connect(out); o.start(now + d); o.stop(now + d + 0.35);
    }
  }

  private playBossWindup(): void {
    const g = sfxGraph(); if (!g) return;
    const { ctx: c, out } = g, now = c.currentTime;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(110, now); o.frequency.exponentialRampToValueAtTime(330, now + 0.75);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    gn.gain.setValueAtTime(0.0001, now); gn.gain.exponentialRampToValueAtTime(0.14, now + 0.25);
    gn.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    o.connect(lp); lp.connect(gn); gn.connect(out); o.start(now); o.stop(now + 0.82);
  }

  private playBossExposed(parried: boolean): void {
    const g = sfxGraph(); if (!g) return;
    const { ctx: c, out } = g, now = c.currentTime;
    const freqs = parried ? [523.3, 784, 1046.5, 1568] : [440, 659.3, 880];
    freqs.forEach((f, i) => {
      const t0 = now + i * 0.045, o = c.createOscillator(), gn = c.createGain();
      o.type = parried ? 'triangle' : 'sine'; o.frequency.setValueAtTime(f, t0);
      gn.gain.setValueAtTime(0.18, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      o.connect(gn); gn.connect(out); o.start(t0); o.stop(t0 + 0.45);
    });
  }

  private playBossStagger(): void {
    play('thunder', { vol: 0.55, pitch: 1.3 });
    play('bossStart', { vol: 0.6, pitch: 1.15 });
  }

  private playSecondWind(): void {
    const g = sfxGraph(); if (!g) return;
    const { ctx: c, out } = g, now = c.currentTime;
    [293.7, 440, 587.3, 740, 880].forEach((f, i) => {
      const t0 = now + i * 0.055, o = c.createOscillator(), gn = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t0);
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.16, t0 + 0.04);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      o.connect(gn); gn.connect(out); o.start(t0); o.stop(t0 + 0.74);
    });
  }

  private playVictoryFanfare(): void {
    play('festival', { vol: 1.0 });
    play('cheer', { vol: 0.75 });
  }

  dispose(): void {
    this.music.stop();
    stopAmbient();
  }
}
