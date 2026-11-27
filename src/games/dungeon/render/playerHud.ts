// Handcrafted, boxless top-left Player HUD for Purgatour.
// Mirrors drawBossBar's dark-fantasy pixel craft: an ornate stance-tinted Level Crest anchoring
// a beveled HP bar (with lagging damage chip & ward glow) + integrated violet XP ribbon, floating
// zone/gold header above, generous full-scale Bidon potion sprites below, and a sculpted pixel
// Wing emblem for Second Wind (replacing cramped text inside a heavy rectangle).
import type { DungeonSnapshot } from '../sim/types';
import { charFrame } from './art32';
import { mixHex, pixelPanel } from './chrome';
import { fillText, fillTextShadow, pixelFont, textWidth as textW } from './font';
import type { PlayerHudLayout, Rect } from './layout';

const ZONE_SHORT = ['KEEP', 'CRYPT', 'CATACOMBS', 'DEEP'];

// Handcrafted 7x6 pixel heart (1 = dark outline, 2 = fill, 3 = specular highlight)
const HEART_PIX = [
  ' 11 11 ',
  '1321221',
  '1222221',
  ' 12221 ',
  '  121  ',
  '   1   ',
];

// Handcrafted 13x10 pixel sweeping feathered wing for Second Wind (1 = outline, 2 = deep gold, 3 = bright gold, 4 = highlight)
const WING_PIX = [
  '        1111 ',
  '      1144431',
  '    11443321 ',
  '  1143322111 ',
  ' 14332214321 ',
  ' 1322113321  ',
  ' 122143221   ',
  '  1132211    ',
  '   1211      ',
  '    11       ',
];

// Crisp fallback 9x12 pixel bidon flask when art32 hasn't finished loading
const BIDON_PIX = [
  '   111   ',
  '   141   ',
  '  11111  ',
  ' 1244421 ',
  ' 1343321 ',
  ' 1343321 ',
  ' 1343321 ',
  ' 1333321 ',
  ' 1333321 ',
  ' 1222221 ',
  '  11111  ',
];

export interface PlayerHudState {
  hpChip: number;
  lastHp: number;
  healFlash: number;
}

export function createPlayerHudState(): PlayerHudState {
  return { hpChip: 1, lastHp: -1, healFlash: 0 };
}

export interface PlayerHudResult {
  coinX: number;
  coinY: number;
  boxes: Rect[];
  skillHit?: Rect;
}

export function drawPlayerHud(
  g: CanvasRenderingContext2D,
  s: DungeonSnapshot,
  L: PlayerHudLayout,
  hu: number,
  dpr: number,
  coinPulseT: number,
  state: PlayerHudState,
): PlayerHudResult {
  const p = s.player;
  const q = Math.max(1, Math.round(dpr));
  const hpFrac = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
  const xpFrac = Math.max(0, Math.min(1, p.xp / Math.max(1, p.xpNext)));
  const hpLow = hpFrac < 0.36;
  const hpMid = hpFrac < 0.58;

  // Track lagging damage chip & soft heal shimmer
  if (state.lastHp < 0 || Math.abs(hpFrac - state.hpChip) > 0.65) {
    state.hpChip = hpFrac;
  } else {
    if (p.hp > state.lastHp + 1) state.healFlash = 1;
    state.hpChip = hpFrac > state.hpChip ? hpFrac : state.hpChip + (hpFrac - state.hpChip) * 0.08;
  }
  state.lastHp = p.hp;
  state.healFlash = Math.max(0, state.healFlash - 0.045);

  const boxes: Rect[] = [];

  // 1. Floating Header Line above the HP bar: Zone/Floor left, Coin sprite + count right
  const barX = L.hpBar.x, barW = L.hpBar.w;
  const zoneName = ZONE_SHORT[s.world.theme % ZONE_SHORT.length] ?? 'KEEP';
  const floorShort = `F${s.floor}${s.run ? `/${s.run.floors}` : ''}`;
  const stageTxt = barW > 135 * hu ? `${zoneName} · ${floorShort}` : floorShort;

  g.save();
  g.textAlign = 'left';
  g.font = pixelFont(Math.round(9 * hu));
  const stageX = barX + 6 * hu;
  drawOutlinedText(g, stageTxt, stageX, L.headerY, '#e5d8c2', q);

  // Coin counter right-aligned over the bar (with pulse pop on pickup)
  const cp = Math.max(0, 1 - (s.t - coinPulseT) / 0.28);
  const coinFont = Math.round(10 * hu * (1 + 0.28 * cp));
  g.font = pixelFont(coinFont);
  const coinStr = String(p.coins);
  const coinStrW = textW(g, coinStr);
  const coinNumX = barX + barW - coinStrW;
  drawOutlinedText(g, coinStr, coinNumX, L.headerY, cp > 0 ? '#fff6bd' : '#ffd84a', q);

  // Crisp art32 coin sprite (or pixel gold disc fallback) left of coin count
  const coinSprite = charFrame('item.coin', 0);
  const coinIconSz = Math.round(11 * hu * (1 + 0.22 * cp));
  const coinIconX = coinNumX - coinIconSz * 0.65 - 3 * hu;
  const coinIconY = L.headerY - 3.5 * hu;
  if (coinSprite) {
    g.imageSmoothingEnabled = false;
    const sc = Math.max(1, Math.round((coinIconSz / Math.max(1, coinSprite.height)) * 2) / 2);
    const dw = Math.round(coinSprite.width * sc), dh = Math.round(coinSprite.height * sc);
    g.drawImage(coinSprite, Math.round(coinIconX - dw / 2), Math.round(coinIconY - dh / 2), dw, dh);
  } else {
    drawCoinPip(g, coinIconX, coinIconY, Math.max(2 * q, Math.round(4 * hu)), q);
  }
  boxes.push({ x: stageX - 2 * hu, y: L.headerY - 10 * hu, w: barX + barW - stageX + 4 * hu, h: 12 * hu });

  // 2. Beveled Health Bar (floating, no outer container box!)
  const hx = Math.round(L.hpBar.x), hy = Math.round(L.hpBar.y);
  const hw = Math.round(L.hpBar.w), hh = Math.round(L.hpBar.h);
  const rimCol = p.warded
    ? '#8fd8ff'
    : hpLow
      ? (Math.sin(s.t * 8) > 0 ? '#f06270' : '#a83848')
      : '#9382a3';

  pixelPanel(g, hx - 2 * q, hy - 2 * q, hw + 4 * q, hh + 4 * q, rimCol, '#120e18', q);
  boxes.push({ x: hx - 2 * q, y: hy - 2 * q, w: hw + 4 * q, h: hh + 4 * q });

  // HP bar ramp + lagging damage chip + heal flash
  const ramp = hpLow
    ? ['#7a1d2a', '#cf3e4f', '#ff808b']
    : hpMid
      ? ['#7f4f12', '#d6902e', '#ffd46e']
      : ['#226436', '#3fa85d', '#7be392'];
  const fw = Math.round(hw * hpFrac);
  const cw = Math.round(hw * Math.max(hpFrac, state.hpChip));
  if (cw > fw) {
    g.fillStyle = '#f1e8d6';
    g.fillRect(hx + fw, hy, cw - fw, hh);
  }
  if (fw > 0) {
    g.fillStyle = ramp[1]; g.fillRect(hx, hy, fw, hh);
    g.fillStyle = ramp[2]; g.fillRect(hx, hy, fw, Math.min(2 * q, hh));
    g.fillStyle = ramp[0]; g.fillRect(hx, hy + hh - Math.min(2 * q, hh), fw, Math.min(2 * q, hh));
    // Crisp leading edge highlight
    if (fw > 2 * q && fw < hw) {
      g.fillStyle = '#ffffff88';
      g.fillRect(hx + fw - q, hy, q, hh);
    }
  }
  // Subtle ward / heal / low-HP sheen
  if (p.warded) {
    g.fillStyle = `rgba(143,216,255,${0.18 + 0.12 * Math.sin(s.t * 9)})`;
    g.fillRect(hx, hy, hw, hh);
  } else if (state.healFlash > 0) {
    g.fillStyle = `rgba(180,255,200,${state.healFlash * 0.45})`;
    g.fillRect(hx, hy, fw, hh);
  } else if (hpLow && fw > 0) {
    g.fillStyle = `rgba(255,140,150,${0.12 + 0.14 * Math.max(0, Math.sin(s.t * 8))})`;
    g.fillRect(hx, hy, fw, hh);
  }
  // Over-Shield cyan top ribbon when active (Bottomless Musette / Iron Frame)
  if (p.shield > 0) {
    const sw = Math.min(hw, Math.round(hw * (p.shield / Math.max(1, p.maxHp))));
    g.fillStyle = '#66e0ffdd';
    g.fillRect(hx, hy, sw, Math.max(2 * q, Math.round(3.5 * hu)));
  }
  // Subtle vertical segment notches
  g.fillStyle = '#0b091044';
  for (let xx = 16 * q; xx < hw - 2 * q; xx += 16 * q) g.fillRect(hx + xx, hy + q, q, hh - 2 * q);

  // Small crisp pixel heart + HP readout inside the HP bar
  const heartUnit = Math.max(1, Math.round(hu * 0.9));
  const heartX = hx + 7 * hu;
  const heartY = hy + Math.round((hh - 6 * heartUnit) / 2);
  drawPixelMask(g, HEART_PIX, heartX, heartY, heartUnit, {
    '1': '#120b16',
    '2': hpLow ? '#ff596a' : '#e64c5f',
    '3': '#ffb8c0',
  });
  g.font = pixelFont(Math.round(9.5 * hu));
  g.fillStyle = '#fff';
  const hpTxt = p.shield >= 1
    ? `${Math.min(Math.round(p.maxHp), Math.ceil(Math.max(0, p.hp)))} +${Math.round(p.shield)}`
    : `${Math.min(Math.round(p.maxHp), Math.ceil(Math.max(0, p.hp)))} / ${Math.round(p.maxHp)}`;
  fillTextShadow(g, hpTxt, heartX + 7 * heartUnit + 4 * hu, hy + hh * 0.76);

  // 3. Integrated Arcane XP Ribbon flush beneath the HP bar
  const xx = Math.round(L.xpBar.x), xy = Math.round(L.xpBar.y);
  const xw = Math.round(L.xpBar.w), xh = Math.max(3 * q, Math.round(L.xpBar.h));
  g.fillStyle = '#0b0910'; g.fillRect(xx - q, xy - q, xw + 2 * q, xh + 2 * q);
  g.fillStyle = '#1b1529'; g.fillRect(xx, xy, xw, xh);
  const xfw = Math.round(xw * xpFrac);
  if (xfw > 0) {
    g.fillStyle = '#9f6be0'; g.fillRect(xx, xy, xfw, xh);
    g.fillStyle = '#dfbfff'; g.fillRect(xx, xy, xfw, Math.max(1, Math.min(q, xh - 1)));
    if (xfw > q && xfw < xw) {
      g.fillStyle = '#ffffff';
      g.fillRect(xx + xfw - q, xy, q, xh);
    }
  }
  boxes.push({ x: xx - q, y: xy - q, w: xw + 2 * q, h: xh + 2 * q });

  // 4. Ornate Beveled Level Crest tinted by active Hero Archetype (drawn AFTER bars so it anchors their left edge!)
  const cx = Math.round(L.crest.x), cy = Math.round(L.crest.y), cs = Math.round(L.crest.w);
  const crestRim = mixHex(s.archetype.color, '#e6c684', 0.45);
  drawLevelCrest(g, cx, cy, cs, p.level, crestRim, s.archetype.color, hu, q);
  boxes.push({ x: cx, y: cy, w: cs, h: cs });

  // 5. Generous Floating Bidon Potions (2.5x larger, crisp pixel art, NO box!)
  const potStartX = L.hpBar.x + 8 * hu;
  const potMaxRight = L.wing.x - 8 * hu;
  const potCount = Math.max(1, p.potionCap);
  const idealStep = 19 * hu;
  const potStep = potCount > 1 ? Math.min(idealStep, Math.max(11 * hu, (potMaxRight - potStartX) / (potCount - 1))) : 0;
  const potSprite = charFrame('item.potion', 0);
  const potBaseY = L.potionsY + L.potionSize;

  for (let k = 0; k < p.potionCap; k++) {
    const filled = k < p.potions;
    const isCue = filled && hpLow && k === p.potions - 1;
    const bob = isCue ? Math.sin(s.t * 7.5) * 1.8 * hu : 0;
    const px = potStartX + k * potStep;

    // Grounding shadow oval so bidons float cleanly over bright or dark dungeon floor
    g.fillStyle = filled ? 'rgba(8,6,14,0.58)' : 'rgba(8,6,14,0.28)';
    g.beginPath();
    g.ellipse(Math.round(px), Math.round(potBaseY - 1 * hu), 6.5 * hu, 2.2 * hu, 0, 0, Math.PI * 2);
    g.fill();

    // Subtle pulsing rose halo on the next potion when HP is low
    if (isCue) {
      g.fillStyle = `rgba(255,96,120,${0.18 + 0.16 * Math.sin(s.t * 7.5)})`;
      g.beginPath();
      g.arc(Math.round(px), Math.round(potBaseY - L.potionSize * 0.48 + bob), 9.5 * hu, 0, Math.PI * 2);
      g.fill();
    }

    g.globalAlpha = filled ? 1 : 0.26;
    if (potSprite) {
      g.imageSmoothingEnabled = false;
      const targetH = L.potionSize;
      const sc = Math.max(1, Math.round((targetH / Math.max(1, potSprite.height)) * 2) / 2);
      const dw = Math.round(potSprite.width * sc), dh = Math.round(potSprite.height * sc);
      g.drawImage(potSprite, Math.round(px - dw / 2), Math.round(potBaseY - dh + bob), dw, dh);
    } else {
      const pu = Math.max(1, Math.round(L.potionSize / 12));
      drawPixelMask(g, BIDON_PIX, px - (9 * pu) / 2, potBaseY - 11 * pu + bob, pu, {
        '1': '#0b0910',
        '2': '#2b6cb0',
        '3': '#e04f64',
        '4': '#eef6ff',
      });
    }
    g.globalAlpha = 1;
  }
  boxes.push({
    x: potStartX - 8 * hu,
    y: L.potionsY,
    w: Math.max(18 * hu, (p.potionCap - 1) * potStep + 16 * hu),
    h: L.potionSize,
  });

  // 6. Sculpted Floating Second Wind Wing Emblem (replaces cramped "2nd W" box)
  drawSecondWindWing(g, L.wing, p.secondWind, p.secondWindFlash, s.t, hu, q);
  boxes.push({ ...L.wing });

  // 7. Clickable Skill Points / Build Tree Pill floating cleanly below potions
  let skillHit: Rect | undefined;
  if (p.unspentSP > 0 || s.skillTree.spentSP > 0) {
    const sx = L.bounds.x, sy = L.perkY, sw = L.bounds.w, sh = 15 * hu;
    const pulse = p.unspentSP > 0 ? 0.72 + 0.28 * Math.sin(s.t * 6) : 1;
    g.globalAlpha = pulse;
    pixelPanel(g, sx, sy, sw, sh, p.unspentSP > 0 ? '#ffd84a' : s.archetype.color, p.unspentSP > 0 ? '#423312f0' : '#181326e6', Math.max(1, Math.round(dpr)));
    g.globalAlpha = 1;
    g.font = pixelFont(Math.round(8.5 * hu));
    g.fillStyle = p.unspentSP > 0 ? '#ffd84a' : '#dcd4ec';
    const skTxt = p.unspentSP > 0
      ? `★ +${p.unspentSP} SKILL PT${p.unspentSP > 1 ? 'S' : ''} · TAP / UP`
      : `${s.skillTree.buildTitle} (${s.skillTree.spentSP} SP)`;
    fillTextShadow(g, skTxt, sx + 5 * hu, sy + 10.5 * hu, sw - 10 * hu);
    skillHit = { x: sx, y: sy, w: sw, h: sh };
    boxes.push(skillHit);
  }

  g.restore();
  return { coinX: coinIconX, coinY: coinIconY, boxes, skillHit };
}

function drawLevelCrest(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  sz: number,
  level: number,
  rim: string,
  accent: string,
  hu: number,
  q: number,
): void {
  const lit = mixHex(rim, '#ffffff', 0.38);
  const dim = mixHex(rim, '#000000', 0.48);
  const c2 = 2 * q;

  // Chamfered octagon shield silhouette (dark 1px pixel outline)
  g.fillStyle = '#0a0810';
  g.fillRect(x + c2, y, sz - 2 * c2, sz);
  g.fillRect(x + q, y + q, sz - 2 * q, sz - 2 * q);
  g.fillRect(x, y + c2, sz, sz - 2 * c2);

  // Metallic beveled rim
  g.fillStyle = rim;
  g.fillRect(x + c2, y + q, sz - 2 * c2, sz - 2 * q);
  g.fillRect(x + q, y + c2, sz - 2 * q, sz - 2 * c2);
  g.fillStyle = lit;
  g.fillRect(x + c2, y + q, sz - 2 * c2, q);
  g.fillRect(x + q, y + c2, q, sz - 2 * c2);
  g.fillStyle = dim;
  g.fillRect(x + c2, y + sz - 2 * q, sz - 2 * c2, q);
  g.fillRect(x + sz - 2 * q, y + c2, q, sz - 2 * c2);

  // Deep obsidian shield interior + subtle stance accent top sheen & corner rivets
  g.fillStyle = '#151020';
  g.fillRect(x + c2, y + c2, sz - 2 * c2, sz - 2 * c2);
  g.fillStyle = accent + '38';
  g.fillRect(x + c2, y + c2, sz - 2 * c2, Math.max(2 * q, Math.round(sz * 0.25)));
  g.fillStyle = '#00000044';
  g.fillRect(x + c2, y + sz - c2 - q, sz - 2 * c2, q);

  // Crisp "LV" label over bold centered level numeral (generous top padding)
  g.textAlign = 'center';
  g.font = pixelFont(Math.round(6.5 * hu));
  g.fillStyle = '#d6c29a';
  fillText(g, 'LV', x + sz / 2, y + sz * 0.39);

  const lvStr = String(level);
  g.font = pixelFont(Math.round((lvStr.length > 2 ? 10 : 12.5) * hu));
  g.fillStyle = '#fff6dc';
  fillTextShadow(g, lvStr, x + sz / 2, y + sz * 0.81);
  g.textAlign = 'left';
}

function drawSecondWindWing(
  g: CanvasRenderingContext2D,
  R: Rect,
  charge: number,
  flash: number,
  t: number,
  hu: number,
  q: number,
): void {
  const sw = Math.max(0, Math.min(1, charge));
  const ready = sw >= 1;
  const pu = Math.max(1, Math.round(hu * 1.4));
  const cols = WING_PIX[0].length, rows = WING_PIX.length;
  const wPx = cols * pu, hPx = rows * pu;
  const wx = Math.round(R.x + (R.w - wPx) / 2);
  const wy = Math.round(R.y + Math.max(0, (R.h - hPx) / 2));

  // Subtle stepped pixel-art golden shimmer behind wing when ready (no flat anti-aliased disc)
  if (ready || flash > 0) {
    const pulse = flash > 0 ? Math.min(0.65, flash * 0.65) : 0.14 + 0.1 * Math.sin(t * 4.5);
    const cx = wx + Math.round(wPx / 2), cy = wy + Math.round(hPx / 2);
    const rx = Math.round((wPx * 0.52) / q) * q, ry = Math.round((hPx * 0.45) / q) * q;
    g.fillStyle = `rgba(255,220,120,${pulse})`;
    g.fillRect(cx - rx, cy - Math.round(ry * 0.55), rx * 2, Math.round(ry * 1.1));
    g.fillRect(cx - Math.round(rx * 0.6), cy - ry, Math.round(rx * 1.2), ry * 2);
  }

  // Draw pixel-art wing filling bottom-to-top in molten gold as it recharges
  const fillRow = ready ? 0 : Math.ceil((1 - sw) * rows);
  for (let row = 0; row < rows; row++) {
    const line = WING_PIX[row];
    const lit = row >= fillRow;
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ' ') continue;
      if (ch === '1') g.fillStyle = '#0b0910';
      else if (!lit) g.fillStyle = ch === '4' ? '#605670' : '#3a3347';
      else if (ch === '2') g.fillStyle = ready ? '#c9881d' : '#966820';
      else if (ch === '3') g.fillStyle = ready ? '#ffd562' : '#c99738';
      else g.fillStyle = ready ? '#fff6c4' : '#e6be6a';
      g.fillRect(wx + col * pu, wy + row * pu, pu, pu);
    }
  }

  // Subtle mini progress thread under the wing while recharging; animated pixel glints when ready
  const barW = Math.round(wPx * 0.85), barX = Math.round(wx + (wPx - barW) / 2), barY = wy + hPx + q;
  if (!ready) {
    g.fillStyle = '#0b0910'; g.fillRect(barX - q, barY - q, barW + 2 * q, 3 * q);
    g.fillStyle = '#261f33'; g.fillRect(barX, barY, barW, q);
    g.fillStyle = '#e8b948'; g.fillRect(barX, barY, Math.round(barW * sw), q);
  } else {
    const ph = Math.sin(t * 5.5);
    if (ph > 0.15) {
      g.fillStyle = '#fff9d6';
      g.fillRect(wx + (cols - 2) * pu, wy - q, q, q);
    }
    if (ph < -0.15) {
      g.fillStyle = '#ffe08a';
      g.fillRect(wx + pu, wy + (rows - 3) * pu, q, q);
    }
  }
}

function drawOutlinedText(g: CanvasRenderingContext2D, txt: string, x: number, y: number, color: string, q: number): void {
  const rx = Math.round(x), ry = Math.round(y);
  g.fillStyle = '#0a0810';
  g.fillRect(0, 0, 0, 0);
  fillText(g, txt, rx - q, ry);
  fillText(g, txt, rx + q, ry);
  fillText(g, txt, rx, ry - q);
  fillText(g, txt, rx, ry + q);
  fillText(g, txt, rx + q, ry + q);
  g.fillStyle = color;
  fillText(g, txt, rx, ry);
}

function drawCoinPip(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, q: number): void {
  const x = Math.round(cx), y = Math.round(cy);
  g.fillStyle = '#0b0910'; g.beginPath(); g.arc(x, y, r + q, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d99a1e'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe169'; g.beginPath(); g.arc(x - q * 0.3, y - q * 0.3, r * 0.72, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff9d6'; g.fillRect(x - q, y - Math.round(r * 0.6), q, q);
}

function drawPixelMask(
  g: CanvasRenderingContext2D,
  mask: readonly string[],
  x: number,
  y: number,
  u: number,
  pal: Record<string, string>,
): void {
  const rx = Math.round(x), ry = Math.round(y);
  for (let row = 0; row < mask.length; row++) {
    const line = mask[row];
    for (let col = 0; col < line.length; col++) {
      const c = pal[line[col]];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(rx + col * u, ry + row * u, u, u);
    }
  }
}
