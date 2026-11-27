// Floor 7 victory sequence visuals: the Checkered Finish Line gantry, your reclaimed pixel road bike,
// and the mounted hero sprinting across the line with a Tour-style hands-up victory salute.
import type { FinishSeqView } from '../sim/types';
import { pixelRing } from './pixel';

/** Draw the checkered Finish Line banner across the exit of The Broom Wagon. */
export function drawFinishLine(gg: CanvasRenderingContext2D, lineX: number, lineY: number, TS: number, t: number): void {
  const cx = Math.round(lineX * TS), cy = Math.round(lineY * TS);
  const halfW = Math.round(TS * 1.45);
  // Checkered floor strip (2 rows x 12 checks)
  const sq = Math.max(4, Math.round(TS / 5));
  const cols = Math.floor((halfW * 2) / sq);
  const x0 = cx - Math.floor((cols * sq) / 2);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      gg.fillStyle = (r + c) % 2 === 0 ? '#f8f8fc' : '#181422';
      gg.fillRect(x0 + c * sq, cy - sq + r * sq, sq, sq);
    }
  }
  // Twin gantry pillars & overhead banner bar
  const postH = Math.round(TS * 1.25), postW = 4;
  const leftX = x0 - postW, rightX = x0 + cols * sq;
  gg.fillStyle = '#3a2b1d';
  gg.fillRect(leftX, cy - postH, postW, postH + 4);
  gg.fillRect(rightX, cy - postH, postW, postH + 4);
  gg.fillStyle = '#ffd84a';
  gg.fillRect(leftX + 1, cy - postH, 2, postH);
  gg.fillRect(rightX + 1, cy - postH, 2, postH);
  // Overhead checkered ribbon banner
  const archY = cy - postH - 6;
  gg.fillStyle = '#181422';
  gg.fillRect(leftX - 2, archY - 1, rightX - leftX + postW + 4, 10);
  for (let c = 0; c < cols; c++) {
    gg.fillStyle = c % 2 === 0 ? '#ffd84a' : '#fff6d0';
    gg.fillRect(x0 + c * sq, archY + 1, sq, 6);
  }
  // Subtle pulsing golden finish glow
  gg.save();
  gg.globalAlpha = 0.25 + 0.15 * Math.sin(t * 5);
  pixelRing(gg, cx, cy, TS * (1.2 + 0.1 * Math.sin(t * 4)), '#ffd84a', true);
  gg.restore();
}

/** Draw the pixel road bike (either parked & glowing, or ridden by the hero toward/across the line). */
export function drawFinishBike(
  gg: CanvasRenderingContext2D,
  x: number,
  y: number,
  TS: number,
  t: number,
  frameColor: string,
  stage: FinishSeqView['stage'],
): void {
  const cx = Math.round(x * TS), cy = Math.round(y * TS);
  const riding = stage !== 'findBike';
  const celebrating = stage === 'celebrate';
  const bob = stage === 'rideToLine' ? Math.round(Math.sin(t * 22) * 1.2) : 0;

  // Ground shadow & parked spotlight halo
  gg.fillStyle = 'rgba(0,0,0,0.45)';
  gg.fillRect(cx - 12, cy + 4, 24, 5);
  if (!riding) {
    pixelRing(gg, cx, cy + 2, TS * (0.75 + 0.08 * Math.sin(t * 5)), '#ffd84a', true);
    // Bouncing golden chevron above parked bike
    const ay = cy - 24 + Math.round(Math.sin(t * 7) * 3);
    gg.fillStyle = '#ffd84a';
    gg.fillRect(cx - 4, ay, 8, 2);
    gg.fillRect(cx - 3, ay + 2, 6, 2);
    gg.fillRect(cx - 1, ay + 4, 2, 2);
  }

  // Wheels (left rear, right front)
  const wy = cy + 2 + bob;
  const drawWheel = (wx: number) => {
    gg.fillStyle = '#181822';
    gg.fillRect(wx - 5, wy - 5, 10, 10);
    gg.fillStyle = '#cfd8e3';
    gg.fillRect(wx - 4, wy - 4, 8, 8);
    gg.fillStyle = '#252130';
    gg.fillRect(wx - 3, wy - 3, 6, 6);
    // Spinning cross spokes
    const phase = stage === 'rideToLine' ? Math.floor(t * 24) % 2 : 0;
    gg.fillStyle = '#ffd84a';
    if (phase === 0) {
      gg.fillRect(wx, wy - 3, 1, 6);
      gg.fillRect(wx - 3, wy, 6, 1);
    } else {
      gg.fillRect(wx - 2, wy - 2, 1, 1); gg.fillRect(wx + 2, wy + 2, 1, 1);
      gg.fillRect(wx + 2, wy - 2, 1, 1); gg.fillRect(wx - 2, wy + 2, 1, 1);
    }
    gg.fillStyle = '#ffffff';
    gg.fillRect(wx, wy, 1, 1);
  };
  drawWheel(cx - 8);
  drawWheel(cx + 8);

  // Road bike diamond frame
  gg.fillStyle = frameColor;
  gg.fillRect(cx - 8, wy - 1, 10, 2);     // chainstay
  gg.fillRect(cx - 4, wy - 8, 10, 2);     // top tube
  gg.fillRect(cx - 4, wy - 8, 2, 8);      // seat tube
  gg.fillRect(cx + 5, wy - 8, 2, 8);      // head tube / fork
  gg.fillRect(cx - 2, wy - 2, 7, 2);      // down tube
  // Golden chainring
  gg.fillStyle = '#ffd84a';
  gg.fillRect(cx - 2, wy - 2, 3, 3);
  // Saddle & drop handlebars
  gg.fillStyle = '#241e2c';
  gg.fillRect(cx - 6, wy - 10, 5, 2);
  gg.fillStyle = '#e8eef5';
  gg.fillRect(cx + 5, wy - 11, 4, 2);
  gg.fillRect(cx + 8, wy - 10, 2, 3);

  if (!riding) return;

  // Mounted hero on the bike
  const hy = wy - 10;
  // Legs / pedaling knees
  const ped = stage === 'rideToLine' ? Math.round(Math.sin(t * 20) * 2) : 0;
  gg.fillStyle = '#2c2638';
  gg.fillRect(cx - 3, hy + 2, 3, 5 + ped);
  gg.fillRect(cx, hy + 3, 3, 5 - ped);
  // Rider torso (jersey in profile color with gold leader stripe)
  gg.fillStyle = frameColor;
  gg.fillRect(cx - 4, hy - 7, 8, 9);
  gg.fillStyle = '#ffd84a';
  gg.fillRect(cx - 4, hy - 3, 8, 2);
  // Helmet & head
  gg.fillStyle = '#f3d2b3';
  gg.fillRect(cx - 2, hy - 12, 5, 5);
  gg.fillStyle = '#ffffff';
  gg.fillRect(cx - 3, hy - 14, 7, 3);
  gg.fillStyle = frameColor;
  gg.fillRect(cx - 2, hy - 14, 5, 1);

  if (celebrating) {
    // Victory salute: both arms raised high in a V!
    const wave = Math.round(Math.sin(t * 14) * 1);
    gg.fillStyle = frameColor;
    gg.fillRect(cx - 7, hy - 13 + wave, 3, 7);
    gg.fillRect(cx + 4, hy - 13 - wave, 3, 7);
    gg.fillStyle = '#f3d2b3';
    gg.fillRect(cx - 7, hy - 15 + wave, 3, 2);
    gg.fillRect(cx + 4, hy - 15 - wave, 3, 2);
    // Victory confetti sparkles around rider
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + t * 2.5, r = 12 + ((t * 16 + i * 5) % 14);
      gg.fillStyle = i % 2 ? '#ffd84a' : '#7fe7ff';
      gg.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(hy - 6 + Math.sin(a) * r * 0.7), 2, 2);
    }
  } else {
    // Aero sprint arms reaching to the drop bars + golden speed streaks behind bike
    gg.fillStyle = frameColor;
    gg.fillRect(cx + 2, hy - 5, 6, 3);
    gg.fillStyle = '#ffd84a';
    for (let i = 0; i < 3; i++) {
      const lx = cx - 14 - ((Math.floor(t * 30) + i * 5) % 10);
      gg.fillRect(lx, wy - 4 + i * 4, 6, 1);
    }
  }
}
