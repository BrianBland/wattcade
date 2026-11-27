// Pure HUD layout for the run screen. The shell owns action indicators and touch controls.
// One slim row sits bottom-left above the shell HUD, beside floating actions when space permits:
// the active stance + weapon (`card`), chips for the other stances (`stance`), then the equipped gear sockets (`gear`;
// these wrap onto a row above the card when the screen is too narrow).
export interface Rect { x: number; y: number; w: number; h: number }
export interface RunLayout { playH: number; card: Rect; stance: Rect; gear: Rect }
export interface PlayerHudLayout {
  bounds: Rect;
  crest: Rect;
  headerY: number;
  hpBar: Rect;
  xpBar: Rect;
  potionsY: number;
  potionSize: number;
  wing: Rect;
  perkY: number;
  buffY: number;
  toastY: number;
}

/** Boxless top-left player HUD geometry: ornate Level Crest anchoring beveled HP/XP bars,
 *  floating stage/gold header, full-scale Bidon potions, Second Wind wing emblem, and SP pill. */
export function playerHudLayout(W: number, H: number, hu: number, hasSkillBadge = false, hasBuffs = false): PlayerHudLayout {
  const pad = 14 * hu;
  const maxW = Math.max(150 * hu, Math.min(206 * hu, W - 2 * pad));
  const crestSz = 32 * hu;
  const headerH = 12 * hu;
  const barX = pad + crestSz - 2 * hu;
  const barW = Math.max(110 * hu, maxW - (barX - pad));
  const hpH = 14 * hu;
  const xpH = 4 * hu;
  const barTop = pad + headerH;
  const crestY = barTop - 5 * hu;
  const potionsY = barTop + hpH + xpH + 6 * hu;
  const potionSize = 21 * hu;
  const wingW = 24 * hu, wingH = 19 * hu;
  const boundsH = (potionsY + potionSize) - pad;
  const perkY = pad + boundsH + 5 * hu;
  const perkH = hasSkillBadge ? 18 * hu : 0;
  const buffY = perkY + perkH + (hasSkillBadge ? 3 * hu : 0);
  const buffH = hasBuffs ? 18 * hu : 0;
  const toastY = buffY + buffH + 4 * hu;
  void H;
  return {
    bounds: { x: pad, y: pad, w: barX + barW - pad, h: boundsH },
    crest: { x: pad, y: crestY, w: crestSz, h: crestSz },
    headerY: pad + 9 * hu,
    hpBar: { x: barX, y: barTop, w: barW, h: hpH },
    xpBar: { x: barX, y: barTop + hpH + 1 * hu, w: barW, h: xpH },
    potionsY,
    potionSize,
    wing: { x: barX + barW - wingW, y: potionsY + 1 * hu, w: wingW, h: wingH },
    perkY,
    buffY,
    toastY,
  };
}

/** Small screens put the boss below the status/minimap row instead of squeezing its name beside it. */
export function bossHudLayout(W: number, H: number, insetBottom: number, hu: number): Rect {
  const pad = 14 * hu, compact = W < 700 * hu;
  const w = compact ? W - 2 * pad : Math.min(W * 0.4, 420 * hu);
  const x = compact ? pad : Math.max(W / 2 - w / 2, pad + 216 * hu);
  const h = 48 * hu, y = Math.max(0, Math.min(pad + (compact ? 106 * hu : 0), H - insetBottom - h));
  return { x, y, w: Math.max(0, Math.min(w, W - pad - x)), h };
}

export function runLayout(W: number, H: number, insetBottom: number, u: number, nChips = 2, occlusions?: readonly Rect[], nGear = 4): RunLayout {
  const pad = 8 * u, base = H - insetBottom, h = 28 * u, chip = 34 * u, gap = 3 * u, sock = h;
  const chipsW = nChips > 0 ? nChips * chip + (nChips - 1) * gap : 0;
  const gearW = nGear > 0 ? nGear * sock + (nGear - 1) * gap : 0;
  const cardW = Math.min(200 * u, Math.max(0, W - 2 * pad - chipsW - gap));
  const oneRow = pad + cardW + gap + chipsW + 2 * gap + gearW + pad <= W;
  // Use the free space beside floating actions, but stay above any HUD that spans the inventory.
  const rowRight = pad + cardW + gap + chipsW + (oneRow ? 2 * gap + gearW : 0);
  const occupied = occlusions?.filter(r => r.x < rowRight + pad && r.x + r.w > 0);
  const rowBase = occupied?.length ? Math.min(...occupied.map(r => r.y)) : base;
  const y = rowBase - pad - h;
  const card = { x: pad, y, w: cardW, h };
  const stance = { x: pad + cardW + gap, y, w: chipsW, h };
  const gear = oneRow ? { x: stance.x + chipsW + 2 * gap, y, w: gearW, h } : { x: pad, y: y - h - gap, w: gearW, h };
  return { playH: Math.min(base - pad - h, gear.y) - 4 * u, card, stance, gear };
}
