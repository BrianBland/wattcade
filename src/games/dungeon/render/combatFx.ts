// Crisp pixel-art battlefield spectacle for Purgatour:
// 1. Boss ground telegraphs during windup (variant-matched slam ring, chainring sweep, or scythe cleave cone)
//    with a final-beat gold flash so riders can read & Ward-parry attacks right on the dungeon floor.
// 2. Diegetic hero effort & combat auras (In Rhythm cadence ring, Ward runic barrier, Rally wind chevrons, Fired Up embers).
import type { DungeonSnapshot, EnemyView } from '../sim/types';
import { pixelRing } from './pixel';

export type TelegraphShape = 'slam' | 'sweep' | 'cone';

/** Pure mapping from boss variant to ground telegraph shape & radius (in tiles). */
export function bossTelegraphSpec(variant: number): { shape: TelegraphShape; radiusTiles: number; halfAngle: number } {
  const v = ((variant % 7) + 7) % 7;
  if (v === 0 || v === 3) return { shape: 'slam', radiusTiles: 3.4, halfAngle: Math.PI };
  if (v === 2) return { shape: 'sweep', radiusTiles: 4.1, halfAngle: Math.PI };
  return { shape: 'cone', radiusTiles: 4.6, halfAngle: 0.68 };
}

/**
 * Draw crisp pixel-art floor telegraph underneath the boss while winding up a big attack.
 * Drawn on the world floor layer (below actors) so the rider reads incoming strikes intuitively.
 */
export function drawBossTelegraph(
  g: CanvasRenderingContext2D,
  bossE: EnemyView,
  boss: NonNullable<DungeonSnapshot['boss']>,
  heroX: number,
  heroY: number,
  TS: number,
  t: number,
  windupTotalS = 2.0,
): void {
  if (!boss.active || boss.cycle !== 'windup') return;
  const spec = bossTelegraphSpec(bossE.variant);
  const progress = Math.max(0.05, Math.min(1, 1 - boss.left / Math.max(0.4, windupTotalS)));
  const parryWindow = progress >= 0.65;
  const flash = parryWindow && Math.sin(t * 28) > 0;

  const bx = Math.round(bossE.x * TS), by = Math.round(bossE.y * TS);
  const maxR = spec.radiusTiles * TS;
  const fillR = maxR * (0.25 + 0.75 * progress);
  const edgeCol = flash ? '#fff4b0' : parryWindow ? '#ffd84a' : '#ff5a3a';
  const fillCol = parryWindow ? 'rgba(255, 195, 64, 0.16)' : 'rgba(255, 72, 54, 0.15)';
  const innerCol = parryWindow ? 'rgba(255, 224, 138, 0.28)' : 'rgba(255, 92, 64, 0.25)';

  g.save();
  if (spec.shape === 'cone') {
    const aim = Math.atan2(heroY - bossE.y, heroX - bossE.x);
    const a0 = aim - spec.halfAngle, a1 = aim + spec.halfAngle;
    // Outer danger wedge
    g.fillStyle = fillCol;
    g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, maxR, a0, a1); g.closePath(); g.fill();
    // Rising charge wedge
    g.fillStyle = innerCol;
    g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, fillR, a0, a1); g.closePath(); g.fill();
    // Crisp stepped outline
    g.strokeStyle = edgeCol; g.lineWidth = Math.max(1, Math.round(TS * 0.06));
    g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, maxR, a0, a1); g.closePath(); g.stroke();
    // Leading charge arc
    g.strokeStyle = flash ? '#ffffff' : '#ffaa55';
    g.beginPath(); g.arc(bx, by, fillR, a0, a1); g.stroke();
  } else {
    // Radial slam or sweeping chainring danger zone
    g.fillStyle = fillCol;
    g.beginPath(); g.arc(bx, by, maxR, 0, Math.PI * 2); g.fill();
    g.fillStyle = innerCol;
    g.beginPath(); g.arc(bx, by, fillR, 0, Math.PI * 2); g.fill();

    pixelRing(g, bx, by, maxR, edgeCol, true);
    pixelRing(g, bx, by, fillR, flash ? '#ffffff' : '#ff9a44', false);

    if (spec.shape === 'sweep') {
      // Rotating chainring danger spokes
      g.strokeStyle = edgeCol; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const ang = t * 5 + (k * Math.PI) / 2;
        g.beginPath();
        g.moveTo(bx + Math.cos(ang) * (maxR * 0.3), by + Math.sin(ang) * (maxR * 0.3));
        g.lineTo(bx + Math.cos(ang) * maxR, by + Math.sin(ang) * maxR);
        g.stroke();
      }
    } else {
      // Slam impact crosshair ticks
      g.fillStyle = edgeCol;
      const d = Math.round(maxR * 0.65);
      g.fillRect(bx - d - 2, by - 1, 4, 2);
      g.fillRect(bx + d - 2, by - 1, 4, 2);
      g.fillRect(bx - 1, by - d - 2, 2, 4);
      g.fillRect(bx - 1, by + d - 2, 2, 4);
    }
  }
  g.restore();
}

/**
 * Draw subtle diegetic rider-effort and defense auras around the hero on the battlefield
 * (In Rhythm stance cadence pips, Ward octagonal runic barrier, Rally wind streaks, Fired Up embers).
 */
export function drawHeroEffortFx(
  g: CanvasRenderingContext2D,
  s: DungeonSnapshot,
  TS: number,
  t: number,
): void {
  const p = s.player;
  const hx = Math.round(p.x * TS), hy = Math.round(p.y * TS);
  const footY = hy + Math.round(p.r * TS * 0.85);
  const rx = Math.round(p.r * TS * 1.45), ry = Math.round(p.r * TS * 0.75);

  g.save();
  // 1. In Rhythm: subtle rotating stance-tinted cadence ring pips at the hero's feet
  if (s.stance.styleOn && !s.stance.styleHidden) {
    g.fillStyle = s.stance.color;
    for (let i = 0; i < 6; i++) {
      const ang = t * 3.4 + (i * Math.PI) / 3;
      const px = Math.round(hx + Math.cos(ang) * rx);
      const py = Math.round(footY + Math.sin(ang) * ry);
      g.globalAlpha = 0.55 + 0.3 * Math.sin(t * 7 + i);
      g.fillRect(px - 1, py - 1, 2, 2);
    }
    g.globalAlpha = 1;
  }

  // 2. Ward active: crisp octagonal runic defense shell around the hero
  if (p.warded) {
    const r = Math.round(p.r * TS * 1.65);
    g.strokeStyle = Math.sin(t * 14) > 0 ? '#d2f4ff' : '#7fe7ff';
    g.lineWidth = Math.max(1, Math.round(TS * 0.05));
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = t * 1.6 + (i * Math.PI) / 4;
      const px = hx + Math.cos(ang) * r, py = hy + Math.sin(ang) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.stroke();
  }

  // 3. Rally active: energetic sky-cyan speed sparkles around hero
  if (p.rallied) {
    g.fillStyle = '#8fd8ff';
    for (let i = 0; i < 4; i++) {
      const ph = (t * 2.6 + i * 0.25) % 1;
      const px = Math.round(hx + Math.cos(i * 1.7 + t * 5) * rx * 1.1);
      const py = Math.round(footY - ph * TS * 0.9);
      g.globalAlpha = (1 - ph) * 0.75;
      g.fillRect(px, py, 2, 1);
    }
    g.globalAlpha = 1;
  }

  // 4. Fired Up (post-sprint power buff): rising golden-orange embers
  if ((p.firedUpLeft ?? 0) > 0) {
    for (let i = 0; i < 5; i++) {
      const ph = (t * 1.8 + i * 0.21) % 1;
      const px = Math.round(hx + Math.sin(t * 4 + i * 2.1) * rx * 0.9);
      const py = Math.round(footY - ph * TS * 1.05);
      g.globalAlpha = (1 - ph) * 0.85;
      g.fillStyle = i % 2 ? '#ffe08a' : '#ff8a2a';
      g.fillRect(px, py, 1, 2);
    }
    g.globalAlpha = 1;
  }
  g.restore();
}
