// Pure visual gameplay juice engine for Purgatour:
// - Quadratic camera trauma screen shake (comfort-capped for indoor cycling)
// - Elemental impact sparks, kill bursts, and victory confetti particles
// - Pure-visual enemy knockback recoil on damage
// - Screen-edge vignette flashes (hurt, Ward parry, Second Wind, Fired Up)
// - Active HUD buff pills (Fired Up, In Rhythm, Ward, Rally)
import { ELEMENT_COLORS } from '../sim/loot';
import type { DungeonSnapshot } from '../sim/types';

export interface JuiceParticle {
  x: number; y: number;   // world tile coords (or screen 0..1 when screen=true)
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string;
  size: number;
  screen?: boolean;
}

export interface BuffPill {
  id: string;
  label: string;
  color: string;
  fill?: number; // 0..1 optional progress bar
}

export interface EdgeFlash {
  color: string;
  alpha: number;
}

const MAX_PARTICLES = 96;
const MAX_SHAKE_PX = 5.5; // crisp pixel punch without inducing bike-trainer motion sickness

/** Pure deterministic hash in [0, 1) for visual particle spray (never touches sim RNG). */
const vhash = (n: number): number => {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Extract compact active HUD buff pills from a snapshot. Pure. */
export function activeBuffs(s: DungeonSnapshot): BuffPill[] {
  const out: BuffPill[] = [];
  if (s.player.firedUpLeft && s.player.firedUpLeft > 0) {
    out.push({ id: 'fired', label: `FIRED UP ${Math.ceil(s.player.firedUpLeft)}s`, color: '#ff8c2a', fill: Math.min(1, s.player.firedUpLeft / 60) });
  }
  if (s.player.bulletTime) {
    out.push({ id: 'bulletTime', label: 'PHOTO FINISH', color: '#ffd84a' });
  }
  if (s.player.mountainKing) {
    out.push({ id: 'mtnKing', label: 'MTN KING', color: '#ff66a8' });
  }
  if (s.paceBias.bias !== 0) {
    out.push({ id: 'pace', label: s.paceBias.label.toUpperCase(), color: s.paceBias.color });
  }
  if (s.player.warded) {
    out.push({ id: 'ward', label: 'WARD', color: '#7fe7ff' });
  }
  if (s.player.rallied) {
    out.push({ id: 'rally', label: 'RALLY', color: '#ffd84a' });
  }
  return out;
}

export class JuiceEngine {
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  particles: JuiceParticle[] = [];
  edgeFlash: EdgeFlash | null = null;
  private recoil = new Map<number, { dx: number; dy: number; life: number }>();
  private hpSeen = new Map<number, number>();
  private seenCue = -1;
  private prevBossCycle = '';
  private prevBossPhase = 0;
  private prevHurt = 99;
  private prevSwFlash = 0;
  private prevPhase = '';
  private seed = 1;

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  private flash(color: string, alpha: number): void {
    if (!this.edgeFlash || alpha >= this.edgeFlash.alpha) this.edgeFlash = { color, alpha: Math.min(0.6, alpha) };
  }

  private spawnBurst(x: number, y: number, color: string, count: number, speed: number, size = 2, life = 0.32): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const s = this.seed++;
      const a = vhash(s * 3 + 1) * Math.PI * 2;
      const sp = speed * (0.45 + vhash(s * 3 + 2) * 0.85);
      const lf = life * (0.65 + vhash(s * 3 + 3) * 0.65);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: lf, maxLife: lf, color, size });
    }
  }

  private spawnConfetti(count: number): void {
    const colors = ['#ffd84a', '#7fe7ff', '#ff7a9e', '#7dff9a', '#c77dff', '#ffffff'];
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const s = this.seed++;
      const lf = 1.6 + vhash(s * 5 + 1) * 1.2;
      this.particles.push({
        x: 0.1 + vhash(s * 5 + 2) * 0.8,
        y: -0.05 - vhash(s * 5 + 3) * 0.15,
        vx: (vhash(s * 5 + 4) - 0.5) * 0.22,
        vy: 0.22 + vhash(s * 5 + 5) * 0.28,
        life: lf, maxLife: lf,
        color: colors[s % colors.length],
        size: 3,
        screen: true,
      });
    }
  }

  /** Visual recoil offset in tiles for an enemy id. */
  recoilOf(id: number): { dx: number; dy: number } {
    const r = this.recoil.get(id);
    if (!r) return { dx: 0, dy: 0 };
    const k = r.life / 0.12;
    return { dx: r.dx * k, dy: r.dy * k };
  }

  update(s: DungeonSnapshot, dt: number): void {
    const step = Math.max(0, Math.min(0.1, dt));
    const elColor = ELEMENT_COLORS[s.weapon.element] ?? '#ffe8a8';

    // 1. Cue-driven trauma & bursts
    if (this.seenCue < 0) this.seenCue = s.cues.length ? s.cues[s.cues.length - 1].id : 0;
    for (const c of s.cues) {
      if (c.id <= this.seenCue) continue;
      this.seenCue = c.id;
      if (c.name === 'explode') { this.addTrauma(0.45); this.spawnBurst(s.player.x, s.player.y, '#ffd84a', 14, 6.5, 2.5, 0.38); }
      else if (c.name === 'crit') { this.addTrauma(0.16); }
      else if (c.name === 'kill') { this.addTrauma(0.12); }
      else if (c.name === 'bossDie') { this.addTrauma(0.95); this.flash('#ffe08a', 0.48); this.spawnConfetti(28); }
      else if (c.name === 'bossStart') { this.addTrauma(0.42); this.flash('#ff4a5a', 0.25); }
      else if (c.name === 'curse') { this.addTrauma(0.28); this.flash('#b66bff', 0.24); }
      else if (c.name === 'unique') { this.addTrauma(0.22); this.flash('#ffd84a', 0.22); }
    }

    if (s.phase === 'run') {
      // 2. Enemy hit sparks & knockback recoil
      const liveIds = new Set<number>();
      for (const e of s.enemies) {
        liveIds.add(e.id);
        const prev = this.hpSeen.get(e.id);
        if (prev !== undefined && e.hp < prev - 0.5) {
          const heavy = prev - e.hp > e.maxHp * 0.14 || e.kind === 'boss';
          this.spawnBurst(e.x, e.y - e.r * 0.4, elColor, heavy ? 6 : 3, heavy ? 4.8 : 3.2, heavy ? 2 : 1.5, 0.26);
          const dx = e.x - s.player.x, dy = e.y - s.player.y, d = Math.hypot(dx, dy) || 1;
          const push = e.kind === 'boss' ? 0.09 : 0.22;
          this.recoil.set(e.id, { dx: (dx / d) * push, dy: (dy / d) * push, life: 0.12 });
        }
        this.hpSeen.set(e.id, e.hp);
      }
      for (const id of this.hpSeen.keys()) if (!liveIds.has(id)) this.hpSeen.delete(id);

      // 3. Hero hurt & Second Wind feedback
      if (s.player.hurt < 0.06 && this.prevHurt >= 0.06) {
        this.addTrauma(0.38);
        this.flash('#ff3b4a', 0.34);
        this.spawnBurst(s.player.x, s.player.y, '#ff5a6a', 8, 4.5, 2, 0.3);
      }
      this.prevHurt = s.player.hurt;

      if (s.player.secondWindFlash > 0.85 && this.prevSwFlash <= 0.85) {
        this.addTrauma(0.65);
        this.flash('#ffd84a', 0.45);
        this.spawnBurst(s.player.x, s.player.y, '#ffe08a', 20, 7.5, 2.5, 0.55);
      }
      this.prevSwFlash = s.player.secondWindFlash;

      // 4. Boss transitions (Exposed parry / phase stagger)
      const b = s.boss;
      if (b?.active) {
        if (b.cycle === 'exposed' && this.prevBossCycle !== 'exposed') {
          this.addTrauma(s.player.warded ? 0.5 : 0.3);
          this.flash(s.player.warded ? '#7fe7ff' : '#ffe08a', s.player.warded ? 0.34 : 0.2);
          const be = s.enemies.find((e) => e.kind === 'boss');
          if (be) this.spawnBurst(be.x, be.y, s.player.warded ? '#7fe7ff' : '#ffe08a', 16, 6, 2.5, 0.45);
        }
        if (b.phase > this.prevBossPhase && this.prevBossPhase > 0) {
          this.addTrauma(0.55);
          this.flash('#ff8c2a', 0.26);
        }
        this.prevBossCycle = b.cycle;
        this.prevBossPhase = b.phase;
      } else {
        this.prevBossCycle = '';
        this.prevBossPhase = 0;
      }
    } else {
      if (this.prevPhase === 'run' && s.camp?.lastRun?.won) {
        this.flash('#ffd84a', 0.4);
        this.spawnConfetti(42);
      }
      this.hpSeen.clear();
      this.recoil.clear();
      this.prevBossCycle = '';
      this.prevBossPhase = 0;
    }
    this.prevPhase = s.phase;

    // 5. Integrate trauma, screen shake, edge flash, recoil, and particles
    this.trauma = Math.max(0, this.trauma - step * 2.1);
    const mag = this.trauma * this.trauma * MAX_SHAKE_PX;
    if (mag > 0.08) {
      const k = Math.floor(s.t * 60);
      this.shakeX = Math.round((vhash(k * 7 + 1) * 2 - 1) * mag);
      this.shakeY = Math.round((vhash(k * 7 + 2) * 2 - 1) * mag);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    if (this.edgeFlash) {
      this.edgeFlash.alpha -= step * 1.4;
      if (this.edgeFlash.alpha <= 0.01) this.edgeFlash = null;
    }

    for (const [id, r] of this.recoil) {
      r.life -= step;
      if (r.life <= 0) this.recoil.delete(id);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= step;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.screen) {
        p.vx *= 1 - step * 0.5;
        p.vy += step * 0.12;
      } else {
        p.vx *= Math.max(0, 1 - step * 5.5);
        p.vy *= Math.max(0, 1 - step * 5.5);
      }
    }
  }

  reset(): void {
    this.trauma = 0; this.shakeX = 0; this.shakeY = 0;
    this.particles.length = 0; this.edgeFlash = null;
    this.recoil.clear(); this.hpSeen.clear();
    this.seenCue = -1; this.prevBossCycle = ''; this.prevBossPhase = 0;
    this.prevHurt = 99; this.prevSwFlash = 0; this.prevPhase = '';
  }
}
