// Dramatic dark-fantasy Biome Arrival Title Card shown briefly whenever descending onto a new stage.
// Pure spec & envelope math (unit-tested) + crisp pixel-art banner renderer.
import { displayText, displayWidth, fillText, pixelFont } from './font';

export interface BiomeBannerSpec {
  title: string;
  subtitle: string;
  color: string;
  accent: string;
}

export interface BiomeBannerState {
  floor: number;
  shownAt: number;
}

export const BIOME_BANNER_DUR_S = 2.6;

const ZONE_FLAVOR: Record<string, { color: string; accent: string; sub: string }> = {
  'The Keep':        { color: '#ffd84a', accent: '#ff9a3a', sub: 'Torchlit stone halls' },
  'The Catacombs':   { color: '#e6c280', accent: '#b8884a', sub: 'Echoing bone corridors' },
  'The Crypt':       { color: '#7fe7d4', accent: '#48b8a8', sub: 'Damp gothic vaults' },
  'The Deep':        { color: '#c77dff', accent: '#ff7a2a', sub: 'Volcanic abyssal forge' },
  'The Broom Wagon': { color: '#ff6a78', accent: '#ffd84a', sub: 'The Grim Sweeper awaits' },
};

/** Build stage title, subtitle, and biome accent palette. Pure. */
export function biomeBannerSpec(
  floor: number,
  totalFloors: number,
  zoneName: string,
  tierName: string,
  isFinal: boolean,
): BiomeBannerSpec {
  const fl = ZONE_FLAVOR[zoneName] ?? { color: '#ffd84a', accent: '#b58ad9', sub: 'Descend and reclaim your bike' };
  const prefix = isFinal ? 'FINAL STAGE' : `STAGE ${floor}/${totalFloors}`;
  return {
    title: `${prefix} · ${zoneName.toUpperCase()}`,
    subtitle: `${tierName}  ·  ${fl.sub}`,
    color: fl.color,
    accent: fl.accent,
  };
}

/** Smooth 0..1 opacity envelope: fast fade-in (0.32 s), steady hold, gentle dissolve (0.65 s). Pure. */
export function biomeBannerAlpha(ageS: number, totalS = BIOME_BANNER_DUR_S): number {
  if (ageS < 0 || ageS >= totalS) return 0;
  if (ageS < 0.32) return ageS / 0.32;
  if (ageS > totalS - 0.65) return Math.max(0, (totalS - ageS) / 0.65);
  return 1;
}

export function drawBiomeBanner(
  g: CanvasRenderingContext2D,
  spec: BiomeBannerSpec,
  ageS: number,
  W: number,
  playH: number,
  hu: number,
  dpr: number,
): void {
  const alpha = biomeBannerAlpha(ageS);
  if (alpha <= 0.01) return;

  const q = Math.max(1, Math.round(dpr));
  const cy = Math.round(W < 640 * hu ? Math.max(playH * 0.30, 132 * hu) : playH * 0.24);
  const rise = (1 - Math.min(1, ageS / 0.32)) * 8 * hu;
  const y = Math.round(cy + rise);

  g.save();
  g.globalAlpha = alpha;

  // Soft translucent obsidian veil band behind title (boxless feathered gradient, not a heavy frame)
  const bandH = Math.round(52 * hu);
  const grad = g.createLinearGradient(0, y - bandH * 0.55, 0, y + bandH * 0.6);
  grad.addColorStop(0, 'rgba(9, 7, 15, 0)');
  grad.addColorStop(0.28, 'rgba(9, 7, 15, 0.72)');
  grad.addColorStop(0.72, 'rgba(9, 7, 15, 0.72)');
  grad.addColorStop(1, 'rgba(9, 7, 15, 0)');
  g.fillStyle = grad;
  g.fillRect(0, Math.round(y - bandH * 0.55), W, Math.round(bandH * 1.15));

  // Crisp ornamental horizontal rule with diamond finials
  const ruleW = Math.min(W * 0.68, Math.round(310 * hu)) * Math.min(1, ageS / 0.38);
  const rx0 = Math.round(W / 2 - ruleW / 2), rx1 = Math.round(W / 2 + ruleW / 2);
  const ry = Math.round(y + 5 * hu);
  g.fillStyle = '#0a0810';
  g.fillRect(rx0 - q, ry - q, rx1 - rx0 + 2 * q, 3 * q);
  g.fillStyle = spec.accent;
  g.fillRect(rx0, ry, rx1 - rx0, q);
  // Center diamond finial
  const dr = Math.max(2 * q, Math.round(3 * hu));
  g.fillStyle = spec.color;
  g.beginPath();
  g.moveTo(W / 2, ry - dr); g.lineTo(W / 2 + dr, ry + q * 0.5);
  g.lineTo(W / 2, ry + dr + q); g.lineTo(W / 2 - dr, ry + q * 0.5);
  g.closePath();
  g.fill();

  // Stage display title
  const maxSc = Math.max(1, Math.min(Math.round(2.4 * dpr), Math.floor((W - 36 * hu) / Math.max(1, displayWidth(spec.title, 1)))));
  displayText(g, spec.title, W / 2, Math.round(y - 11 * maxSc - 3 * hu), maxSc, spec.color, true);

  // Subtitle below rule
  g.textAlign = 'center';
  g.font = pixelFont(Math.round(10 * hu));
  g.fillStyle = '#0a0810';
  fillText(g, spec.subtitle, W / 2 + q, ry + 14 * hu + q, W - 28 * hu);
  g.fillStyle = '#e5dac8';
  fillText(g, spec.subtitle, W / 2, ry + 14 * hu, W - 28 * hu);

  g.restore();
}
