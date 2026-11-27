// Sleek 2-column Camp UI, custom pixel-art upgrade icons, and celebratory Podium Run-Result card.
// Leaves generous vertical breathing room for Purgatour's flickering Keep guardroom campfire scene
// while keeping every control and hit target strictly above the shell HUD inset (`UH`).
import type { CampView } from '../sim/types';
import { pixelPanel } from './chrome';
import { displayText, fillText, fillTextShadow, pixelFont, textWidth as textW } from './font';
import { runResultLine } from './runResult';

export interface CampHit { x: number; y: number; w: number; h: number; row: number }

export interface CampLayout {
  compact: boolean;
  cols: 1 | 2;
  gridX: number;
  gridY: number;
  gridW: number;
  cardW: number;
  cardH: number;
  gapX: number;
  gapY: number;
  maxVisible: number;
  summaryY: number;
  summaryH: number;
  menuBottom: number;
  hintTop: number;
}

/** Pure layout for Camp UI; guarantees all cards and hint lines stay strictly above `UH = H - insetBottom`. */
export function campGridLayout(W: number, UH: number, u: number, dpr: number, totalRows: number, hasResult: boolean): CampLayout {
  const compact = W < 680 * dpr;
  const cols: 1 | 2 = compact ? 1 : 2;
  const padX = 16 * u;
  const gridW = Math.min(W - 2 * padX, (compact ? 420 : 680) * u);
  const gridX = Math.round(W / 2 - gridW / 2);
  const summaryY = Math.round(74 * u);
  const summaryH = hasResult ? Math.round((compact ? 30 : 34) * u) : 0;
  const gridY = Math.round(summaryY + (hasResult ? summaryH + 8 * u : 4 * u));
  const hintTop = Math.round(UH - (compact ? 36 : 26) * u);

  const gapX = Math.round(8 * u);
  const gapY = Math.round(5 * u);
  const cardW = cols === 2 ? Math.floor((gridW - gapX) / 2) : Math.floor(gridW);
  const cardH = Math.round((compact ? 38 : 34) * u);

  // Reserve space at the bottom so the Keep campfire + hero remain clearly visible below the cards
  const fireReserve = Math.min(UH * 0.34, Math.max(84 * u, (hintTop - gridY) * 0.32));
  const availH = Math.max(cardH, hintTop - gridY - fireReserve);
  const maxVisualRows = Math.max(2, Math.floor((availH + gapY) / (cardH + gapY)));
  const maxVisible = Math.min(totalRows, maxVisualRows * cols);
  const usedVisualRows = Math.max(1, Math.ceil(maxVisible / cols));
  const menuBottom = gridY + usedVisualRows * (cardH + gapY) - gapY;

  return { compact, cols, gridX, gridY, gridW, cardW, cardH, gapX, gapY, maxVisible, summaryY, summaryH, menuBottom, hintTop };
}

const ICONS: Record<string, { pal: Record<string, string>; mask: readonly string[] }> = {
  might:    { pal: { '1': '#0a0810', '2': '#cfd8e6', '3': '#ff9a3a' }, mask: ['     11', '    121', '   121 ', ' 1121  ', ' 131   ', '1311   ', '11     '] },
  vitality: { pal: { '1': '#0a0810', '2': '#e64c5f', '3': '#ffb8c0' }, mask: [' 11 11 ', '1321221', '1222221', '1222221', ' 12221 ', '  121  ', '   1   '] },
  regen:    { pal: { '1': '#0a0810', '2': '#58d678', '3': '#c8ffd6' }, mask: ['   1   ', '  131  ', ' 13221 ', '1322221', '1222221', ' 12221 ', '  111  '] },
  flask:    { pal: { '1': '#0a0810', '2': '#4c8ae0', '3': '#ff5c72', '4': '#eef6ff' }, mask: ['  111  ', '  141  ', ' 14441 ', ' 12421 ', ' 13331 ', ' 12221 ', '  111  '] },
  fortune:  { pal: { '1': '#0a0810', '2': '#f0b030', '3': '#fff4b0' }, mask: ['  111  ', ' 13221 ', '1323221', '1223221', '1222221', ' 12221 ', '  111  '] },
  luck:     { pal: { '1': '#0a0810', '2': '#7fe7ff', '3': '#ffffff' }, mask: ['   1   ', '  131  ', ' 13221 ', '1322221', ' 12221 ', '  121  ', '   1   '] },
  scholar:  { pal: { '1': '#0a0810', '2': '#b58ad9', '3': '#f0d6ff' }, mask: [' 11111 ', '1322221', '1333321', '1322221', '1333321', '1222221', ' 11111 '] },
  arcanist: { pal: { '1': '#0a0810', '2': '#c77dff', '3': '#ffffff' }, mask: ['  111  ', ' 13221 ', '1332221', '1222221', '1222221', ' 12221 ', '  111  '] },
  delve:    { pal: { '1': '#0a0810', '2': '#e6c280', '3': '#ffd84a' }, mask: ['111    ', '1311   ', '12311  ', '122311 ', '1222311', '1222221', '1111111'] },
  start:    { pal: { '1': '#0a0810', '2': '#7dff5a', '3': '#e2ff99' }, mask: [' 11    ', ' 131   ', ' 1321  ', ' 13221 ', ' 1221  ', ' 121   ', ' 11    '] },
  tier:     { pal: { '1': '#0a0810', '2': '#ffd84a', '3': '#fff6c4' }, mask: ['1 111 1', '1133311', '1322221', '1222221', ' 12221 ', ' 11111 ', '       '] },
  floor:    { pal: { '1': '#0a0810', '2': '#8fd8ff', '3': '#e0f6ff' }, mask: [' 11111 ', ' 13221 ', ' 12221 ', ' 11111 ', ' 1     ', ' 1     ', ' 1     '] },
  gear:     { pal: { '1': '#0a0810', '2': '#b8aec4', '3': '#ffffff' }, mask: ['  1 1  ', ' 13221 ', '1221221', ' 12221 ', '1221221', ' 12221 ', '  1 1  '] },
};

function iconKeyFor(r: CampView['rows'][number]): string {
  if (r.kind === 'upgrade' && r.id && ICONS[r.id]) return r.id;
  if (r.kind === 'start') return 'start';
  if (r.kind === 'tier') return 'tier';
  if (r.kind === 'floor') return 'floor';
  return 'gear';
}

function drawMiniIcon(g: CanvasRenderingContext2D, key: string, x: number, y: number, pu: number): void {
  const ic = ICONS[key] ?? ICONS.gear;
  const rx = Math.round(x), ry = Math.round(y);
  for (let row = 0; row < ic.mask.length; row++) {
    const line = ic.mask[row];
    for (let col = 0; col < line.length; col++) {
      const colHex = ic.pal[line[col]];
      if (!colHex) continue;
      g.fillStyle = colHex;
      g.fillRect(rx + col * pu, ry + row * pu, pu, pu);
    }
  }
}

/**
 * Render the upgraded Camp overlay (header, Podium/DNF summary card, sleek 2-col card grid, and footer hint).
 * Returns the clickable `CampHit` rects for pointer interaction.
 */
export function drawCampOverlay(
  g: CanvasRenderingContext2D,
  c: CampView,
  L: CampLayout,
  W: number,
  u: number,
  dpr: number,
): CampHit[] {
  const q = Math.max(1, Math.round(dpr));
  const fs = Math.round(13.5 * u);
  const won = !!c.lastRun?.won;

  // 1. Title + crisp floating status bar (Bank · Best · Wins · Runs)
  displayText(g, won ? 'STAGE FINISHED' : 'CAMP', W / 2, Math.round(14 * u), Math.max(2, Math.round(3.6 * dpr)), won ? '#ffe08a' : '#ffd84a', true);
  g.textAlign = 'center';
  g.font = pixelFont(Math.round(12 * u));
  const statsTxt = `Bank ● ${c.bank}   ·   Best F${c.bestFloor}${c.floors ? `/${c.floors}` : ''}   ·   ${c.wins ? `Wins ${c.wins}   ·   ` : ''}Runs ${c.runs}`;
  g.fillStyle = '#0a0810'; fillText(g, statsTxt, W / 2 + q, 59 * u + q, W - 24 * u);
  g.fillStyle = '#dfd4c4'; fillText(g, statsTxt, W / 2, 59 * u, W - 24 * u);

  // 2. Celebratory Podium / Run-Result Summary Card (when returning from a descent)
  if (L.summaryH > 0 && (c.lastRun || c.lastDeath)) {
    const borderCol = won ? '#ffd84a' : '#d65c6c';
    const fillCol = won ? '#2a2112ee' : '#24131bee';
    pixelPanel(g, L.gridX, L.summaryY, L.gridW, L.summaryH, borderCol, fillCol, dpr);
    g.textAlign = 'center';
    g.font = pixelFont(Math.round((L.compact ? 10 : 11.5) * u));
    const line = c.lastRun
      ? runResultLine(c.lastRun, L.compact)
      : L.compact
        ? `Fell on Floor ${c.lastDeath!.floor} · All coins banked`
        : `Fell on Floor ${c.lastDeath!.floor} · Every coin was banked — upgrade and descend again`;
    g.fillStyle = won ? '#ffe694' : '#ff9ca6';
    fillTextShadow(g, line, W / 2, L.summaryY + L.summaryH * 0.68, L.gridW - 18 * u);
  }

  // 3. Scroll window centered on selected row, snapped to full rows of `L.cols`
  const vis = L.maxVisible;
  const selRow = Math.floor(c.sel / L.cols);
  const totalVisualRows = Math.ceil(c.rows.length / L.cols);
  const visVisualRows = Math.max(1, Math.floor(vis / L.cols));
  const firstVisualRow = Math.max(0, Math.min(selRow - Math.floor(visVisualRows / 2), totalVisualRows - visVisualRows));
  const firstIdx = firstVisualRow * L.cols;
  const slice = c.rows.slice(firstIdx, firstIdx + vis);

  const hits: CampHit[] = [];
  const iconPu = Math.max(1, Math.round(u * 2.1));

  slice.forEach((r, i) => {
    const idx = firstIdx + i;
    const col = i % L.cols;
    const vRow = Math.floor(i / L.cols);
    const x = L.gridX + col * (L.cardW + L.gapX);
    const y = L.gridY + vRow * (L.cardH + L.gapY);
    const sel = idx === c.sel;
    const isStart = r.kind === 'start';

    hits.push({ x, y, w: L.cardW, h: L.cardH, row: idx });

    const border = sel ? '#ffd84a' : isStart ? '#56b847' : '#534566';
    const fill = sel ? '#433522f0' : isStart ? '#1a2e1ef0' : '#181322e8';
    pixelPanel(g, x, y, L.cardW, L.cardH, border, fill, dpr);
    if (sel) {
      g.fillStyle = '#ffd84a';
      g.fillRect(Math.round(x + 3 * q), Math.round(y + 5 * q), 2 * q, Math.max(2 * q, Math.round(L.cardH - 10 * q)));
    }

    // Crisp pixel icon
    const ix = x + 9 * u, iy = y + (L.cardH - 7 * iconPu) / 2;
    drawMiniIcon(g, iconKeyFor(r), ix, iy, iconPu);

    const textX = ix + 7 * iconPu + 7 * u;
    const rightX = x + L.cardW - 8 * u;

    // Right side: level & cost badge (for upgrades)
    let nameMaxW = rightX - textX - 4 * u;
    if (r.kind === 'upgrade') {
      g.textAlign = 'right';
      g.font = pixelFont(Math.round(11 * u));
      const costTxt = r.cost === undefined ? 'MAX' : `● ${r.cost}`;
      g.fillStyle = r.cost === undefined ? '#7dff5a' : r.affordable ? '#ffd84a' : '#7a7068';
      fillTextShadow(g, costTxt, rightX, y + 14.5 * u);
      const cw = textW(g, costTxt);

      g.font = pixelFont(Math.round(9.5 * u));
      g.fillStyle = '#c8bed4';
      const lvTxt = `Lv ${r.level}/${r.max}`;
      fillText(g, lvTxt, rightX, y + 27 * u);
      nameMaxW = Math.max(40 * u, rightX - textX - Math.max(cw, textW(g, lvTxt)) - 8 * u);
    }

    // Left side: crisp title + compact description
    g.textAlign = 'left';
    g.font = pixelFont(Math.round(fs * 0.92));
    g.fillStyle = isStart ? '#8aff6e' : sel ? '#fff6dc' : '#f0eaf6';
    fillTextShadow(g, r.name, textX, y + 14.5 * u, nameMaxW);

    g.font = pixelFont(Math.round(9.5 * u));
    g.fillStyle = '#b4a8c4';
    fillText(g, r.desc, textX, y + 27.5 * u, nameMaxW);
  });

  // Scroll indicator pips if more rows sit above/below
  if (firstIdx > 0 || firstIdx + vis < c.rows.length) {
    g.textAlign = 'center';
    g.font = pixelFont(Math.round(9 * u));
    g.fillStyle = '#9e92b0';
    const arrows = `${firstIdx > 0 ? '▲ ' : ''}${Math.min(c.rows.length, firstIdx + vis)}/${c.rows.length}${firstIdx + vis < c.rows.length ? ' ▼' : ''}`;
    fillText(g, arrows, W / 2, L.menuBottom + 11 * u);
  }

  // 4. Footer hint line strictly above the shell HUD inset
  g.textAlign = 'center';
  g.font = pixelFont(Math.round((L.compact ? 11 : 12.5) * u));
  g.fillStyle = '#0a0810';
  const left = Math.ceil(c.autoStartLeft);
  const hint = L.compact
    ? `Tap card to buy · B start · Auto ${left}s`
    : `Tap a card or D-pad + Z to buy · B begin  —  auto-start in ${left}s of pedaling`;
  fillText(g, hint, W / 2 + q, L.hintTop + 14 * u + q, W - 20 * u);
  g.fillStyle = '#d4cadc';
  fillText(g, hint, W / 2, L.hintTop + 14 * u, W - 20 * u);
  g.textAlign = 'left';

  return hits;
}
