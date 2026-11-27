// Camp UI: Start-of-Run Hero Archetype Select (with live Hero Portraits, Branch Crests & ERG/Grade workout bars),
// End-of-Run Build Trophy Card & Grimpeur unlock progress, and Camp Upgrades.
// Pure layout guarantees everything stays above H - insetBottom.
import type { CampView } from '../sim/types';
import { ARCHETYPES, type ArchetypeId } from '../sim/archetypes';
import { SKILL_TREES } from '../sim/skillTree';
import type { Rect } from './layout';
import { pixelPanel, pixelMeter, pixelSocket, mixHex } from './chrome';
import { fillText, fillTextShadow, displayText, pixelFont, textWidth as textW } from './font';
import { runResultLine } from './runResult';
import { artReady } from './art32';
import { drawHero32 } from './actors32';
import { drawSkillIcon } from './skillArt';

export type CampUiHit =
  | { rect: Rect; action: { type: 'selectArchetype'; id: ArchetypeId } }
  | { rect: Rect; action: { type: 'campRow'; row: number } };

export interface CampLayout {
  titleY: number;
  bankY: number;
  ergBtn: Rect;
  resultBox: Rect | null;
  archCards: Rect[];
  rowsArea: Rect;
  rowH: number;
  maxRows: number;
  hintY: number;
  compact: boolean;
}

const ARCH_PREVIEW_WEAPON = {
  rouleur: { base: 'bolt', element: 'arcane', rarity: 2, variant: 1 },
  puncheur: { base: 'spark', element: 'storm', rarity: 2, variant: 1 },
  grimpeur: { base: 'flame', element: 'fire', rarity: 2, variant: 1 },
} as const;

export function campLayout(W: number, H: number, insetBottom: number, u: number, hasResult: boolean): CampLayout {
  const UH = Math.max(120 * u, H - insetBottom);
  const compact = W < 680 * u;
  const pad = 12 * u;
  const titleY = 10 * u;
  const bankY = 48 * u;
  const ergBtnW = Math.min(96 * u, W * 0.24), ergBtnH = 20 * u;
  const ergBtn: Rect = { x: Math.min(W - pad - ergBtnW, W / 2 + Math.min(W - 2 * pad, 820 * u) / 2 - ergBtnW), y: titleY + 6 * u, w: ergBtnW, h: ergBtnH };

  let curY = bankY + 12 * u;
  let resultBox: Rect | null = null;
  if (hasResult) {
    const rh = (compact ? 46 : 40) * u;
    resultBox = { x: pad, y: curY, w: Math.min(W - 2 * pad, 820 * u), h: rh };
    resultBox.x = W / 2 - resultBox.w / 2;
    curY += rh + 8 * u;
  }

  const archW = Math.min(W - 2 * pad, 820 * u);
  const archX0 = W / 2 - archW / 2;
  const archGap = 8 * u;
  const archH = Math.min(compact ? 98 * u : 118 * u, Math.max(76 * u, UH * 0.26));
  const cardW = (archW - 2 * archGap) / 3;
  const archCards: Rect[] = [0, 1, 2].map((i) => ({ x: archX0 + i * (cardW + archGap), y: curY, w: cardW, h: archH }));
  curY += archH + 10 * u;

  const hintH = 22 * u;
  const hintY = UH - 10 * u;
  const availRowsH = Math.max(40 * u, UH - hintH - 6 * u - curY);
  const rowH = (compact ? 38 : 27) * u;
  const maxRows = Math.max(3, Math.floor(availRowsH / rowH));
  const rowsW = Math.min(W - 2 * pad, 680 * u);
  const rowsArea: Rect = { x: W / 2 - rowsW / 2, y: curY, w: rowsW, h: availRowsH };

  return { titleY, bankY, ergBtn, resultBox, archCards, rowsArea, rowH, maxRows, hintY, compact };
}

/** Render a crisp integer-scaled Hero Archetype sprite inside a portrait socket. */
function drawHeroPortrait(
  gg: CanvasRenderingContext2D,
  id: ArchetypeId,
  box: Rect,
  t: number,
  active: boolean,
  locked: boolean,
  q: number,
) {
  const def = ARCHETYPES[id];
  // Warm/tinted spotlight behind active hero
  pixelSocket(gg, box.x, box.y, box.w, box.h, q);
  if (active) {
    gg.fillStyle = mixHex(def.color, '#120e1c', 0.78);
    gg.fillRect(Math.round(box.x + 2 * q), Math.round(box.y + 2 * q), Math.round(box.w - 4 * q), Math.round(box.h - 4 * q));
  }
  // Subtle stone pedestal floor line inside socket
  const footY = Math.round(box.y + box.h - 7 * q);
  gg.fillStyle = active ? mixHex(def.color, '#20182d', 0.55) : '#282136';
  gg.fillRect(Math.round(box.x + 4 * q), footY, Math.round(box.w - 8 * q), Math.max(2, 2 * q));

  if (artReady()) {
    const scale = Math.max(1, Math.min(2, Math.floor((box.h - 10 * q) / 26)));
    gg.save();
    gg.beginPath();
    gg.rect(Math.round(box.x + 2 * q), Math.round(box.y + 2 * q), Math.round(box.w - 4 * q), Math.round(box.h - 4 * q));
    gg.clip();
    if (locked) gg.globalAlpha = 0.42;
    gg.imageSmoothingEnabled = false;
    gg.scale(scale, scale);
    drawHero32(gg, (box.x + box.w / 2) / scale, (footY + 1) / scale, {
      angle: Math.PI * 0.5,
      moving: active,
      t: active ? t * 0.65 : 0,
      stance: def.chassis,
      kit: def.kit,
      hurt: false,
      weapon: ARCH_PREVIEW_WEAPON[id],
      kick: 0,
    });
    gg.restore();
  } else {
    // Fallback emblem when chars.png is not loaded (e.g. headless unit test)
    drawSkillIcon(gg, id, box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) - 6 * q, def.color, { dim: locked });
  }

  if (locked) {
    drawSkillIcon(gg, 'lock', box.x + box.w / 2, box.y + box.h / 2 + 2 * q, Math.min(box.w, box.h) * 0.62, '#ffd84a');
  }
}

export function drawCampUi(
  gg: CanvasRenderingContext2D,
  c: CampView,
  W: number,
  H: number,
  insetBottom: number,
  u: number,
  dpr: number,
  t: number,
): CampUiHit[] {
  const L = campLayout(W, H, insetBottom, u, Boolean(c.lastRun || c.lastDeath));
  const q = Math.max(1, Math.round(dpr * Math.max(1, u / dpr)));
  const hits: CampUiHit[] = [];

  displayText(gg, c.lastRun?.won ? 'PODIUM VICTORY' : 'PURGATOUR CAMP', W / 2, L.titleY, Math.max(2, Math.round(3.2 * dpr)), '#ffd84a', true);

  // Inline ERG / Grade quick-toggle pill in top-right of Camp header (when wide enough)
  const ergRowIdx = c.rows.findIndex((r) => r.kind === 'erg');
  if (!L.compact && ergRowIdx >= 0) {
    const E = L.ergBtn;
    pixelPanel(gg, E.x, E.y, E.w, E.h, c.erg ? '#66e0ff' : '#ffd84a', '#1b1628ee', q);
    gg.textAlign = 'center'; gg.font = pixelFont(Math.round(9 * u));
    gg.fillStyle = c.erg ? '#66e0ff' : '#ffd84a';
    fillTextShadow(gg, c.erg ? 'ERG MODE' : 'GRADE MODE', E.x + E.w / 2, E.y + E.h * 0.68, E.w - 8 * u);
    hits.push({ rect: E, action: { type: 'campRow', row: ergRowIdx } });
  }

  gg.textAlign = 'center';
  gg.fillStyle = '#ddd'; gg.font = pixelFont(Math.round(11.5 * u));
  fillTextShadow(
    gg,
    `Bank ● ${c.bank}  ·  Best floor ${c.bestFloor}/${c.floors ?? 7}  ·  ${c.wins ? `Wins ${c.wins}  ·  ` : ''}Runs ${c.runs}  ·  ${c.erg ? 'ERG' : 'Grade'}`,
    W / 2, L.bankY, W - 24 * u,
  );

  // End-of-Run Build Trophy Card & Hero Unlock Banner
  if (L.resultBox) {
    const R = L.resultBox;
    const won = !!c.lastRun?.won;
    const unlockedNow = !!c.lastRun?.heroUnlocked;
    const accent = unlockedNow ? '#ffd84a' : won ? '#7dff8a' : '#ff7a7a';
    pixelPanel(gg, R.x, R.y, R.w, R.h, accent, won ? '#16281ef2' : '#26141cf2', q);

    const iconS = Math.round(R.h - 10 * u);
    const ix = R.x + 8 * u, iy = R.y + (R.h - iconS) / 2;
    const relicArch = (c.lastRun?.archetype as ArchetypeId | undefined) ?? c.selectedArchetype;
    pixelSocket(gg, ix, iy, iconS, iconS, q);
    drawSkillIcon(gg, unlockedNow ? 'grimpeur' : relicArch, ix + iconS / 2, iy + iconS / 2, iconS - 4 * q, accent);

    const tx = ix + iconS + 10 * u, tw = R.x + R.w - 10 * u - tx;
    gg.textAlign = 'left'; gg.font = pixelFont(Math.round(11 * u));
    gg.fillStyle = won ? '#7dff8a' : '#ff9a9a';
    const line1 = c.lastRun
      ? `${c.lastRun.buildTitle ?? c.lastRun.archetype ?? 'Run'} · ${runResultLine(c.lastRun, L.compact)}`
      : `Fell on floor ${c.lastDeath!.floor} · ● ${c.lastDeath!.banked} coins banked.`;
    fillTextShadow(gg, line1, tx, R.y + 15 * u, tw);

    const forksTxt = unlockedNow
      ? `★ NEW HERO UNLOCKED: ${c.lastRun!.heroUnlocked!.toUpperCase()}! Select below to ride.`
      : c.lastRun?.capstones?.length
      ? `★ ${c.lastRun.capstones.join(', ')}${c.lastRun.forks?.length ? `  ·  Forks: ${c.lastRun.forks.join(', ')}` : ''}`
      : c.lastRun?.forks?.length
      ? `Forks: ${c.lastRun.forks.join(', ')}`
      : c.grimpeur.unlocked
      ? 'All 3 Launch Heroes Unlocked!'
      : `Grimpeur unlock: Floor ${c.grimpeur.floor}/${c.grimpeur.floorGoal} or ${c.grimpeur.climbs}/${c.grimpeur.climbGoal} climbs`;
    gg.font = pixelFont(Math.round(9.5 * u)); gg.fillStyle = '#ffd84a';
    fillText(gg, forksTxt, tx, R.y + R.h - 8 * u, tw);
  }

  // 3 Hero Archetype Showcase Cards (Hero Portrait + Live ERG/Grade Graph + Branch Crests)
  c.archetypes.forEach((a, i) => {
    const R = L.archCards[i]; if (!R) return;
    hits.push({ rect: R, action: { type: 'selectArchetype', id: a.id } });
    const sel = c.selectedArchetype === a.id;
    const border = sel ? a.color : a.unlocked ? mixHex(a.color, '#4a4258', 0.55) : '#3f384c';
    const fill = sel ? mixHex(a.color, '#191424', 0.8) : a.unlocked ? '#161221f0' : '#120f19e4';
    if (sel) {
      gg.globalAlpha = 0.28 + 0.14 * Math.sin(t * 4); gg.fillStyle = a.color;
      gg.fillRect(R.x - 2 * q, R.y - 2 * q, R.w + 4 * q, R.h + 4 * q); gg.globalAlpha = 1;
    }
    pixelPanel(gg, R.x, R.y, R.w, R.h, border, fill, q);
    gg.fillStyle = a.unlocked ? a.color : '#665c72';
    gg.fillRect(Math.round(R.x + 2 * q), Math.round(R.y + 2 * q), Math.round(R.w - 4 * q), 2 * q);

    const padX = 7 * u;
    const showPortrait = !L.compact && R.w >= 190 * u;
    const pW = showPortrait ? Math.round(46 * u) : 0;
    const pH = showPortrait ? Math.round(Math.min(62 * u, R.h - 32 * u)) : 0;
    if (showPortrait) {
      drawHeroPortrait(gg, a.id, { x: R.x + padX, y: R.y + 9 * u, w: pW, h: pH }, t, sel, !a.unlocked, q);
    }

    const px = R.x + padX + (showPortrait ? pW + 8 * u : 0);
    const mw = R.x + R.w - padX - px;

    // Header: Hero Name + Status Badge
    gg.textAlign = 'left'; gg.font = pixelFont(Math.round(12 * u));
    gg.fillStyle = a.unlocked ? '#fff' : '#9a90a6';
    fillTextShadow(gg, a.shortName.toUpperCase(), px, R.y + 18 * u, mw - 42 * u);

    gg.textAlign = 'right'; gg.font = pixelFont(Math.round(8.5 * u));
    gg.fillStyle = sel ? '#7dff8a' : a.unlocked ? a.color : '#ff8c5a';
    fillTextShadow(gg, sel ? 'ACTIVE' : a.unlocked ? a.jersey.split(' ')[0] : 'LOCKED', R.x + R.w - padX, R.y + 18 * u);

    // Workout Tag & ERG/Grade Range
    gg.textAlign = 'left'; gg.font = pixelFont(Math.round(8.5 * u));
    gg.fillStyle = a.unlocked ? '#ffe8b0' : '#8a8096';
    fillText(gg, `${a.workoutTag} · ${c.erg ? a.ergLabel : a.gradeLabel}`, px, R.y + 31 * u, mw);

    if (!a.unlocked) {
      gg.fillStyle = '#ff9a5a'; gg.font = pixelFont(Math.round(8.5 * u));
      fillText(gg, `F${c.grimpeur.floor}/${c.grimpeur.floorGoal} or ${c.grimpeur.climbs}/${c.grimpeur.climbGoal} climbs`, px, R.y + 47 * u, mw);
      pixelMeter(gg, px, R.y + 53 * u, mw, 7 * u, a.unlockPct, '#ff6e5a', q);
    } else {
      // Mini 12-bar Workout Intensity Profile with subtle guide lines
      const vals = c.erg ? a.profileErg : a.profileGrade;
      const minV = c.erg ? 42 : 0, maxV = c.erg ? 124 : 8;
      const chartY = R.y + 38 * u, chartH = Math.max(16 * u, (showPortrait ? pH + 9 * u - 38 * u : R.h - 60 * u));
      // Subtle horizontal reference lines
      gg.fillStyle = '#ffffff12';
      gg.fillRect(Math.round(px), Math.round(chartY + chartH * 0.5), Math.round(mw), 1);
      gg.fillRect(Math.round(px), Math.round(chartY + chartH - 1), Math.round(mw), 1);
      const bw = Math.max(2, (mw - (vals.length - 1) * 2) / vals.length);
      vals.forEach((v, vi) => {
        const frac = Math.max(0.14, Math.min(1, (v - minV) / (maxV - minV)));
        const bh = Math.round(chartH * frac);
        const bx = Math.round(px + vi * (bw + 2));
        const col = frac > 0.72 ? '#ff7a2a' : frac > 0.45 ? a.color : '#5aa9ff';
        gg.fillStyle = col;
        gg.fillRect(bx, Math.round(chartY + chartH - bh), Math.floor(bw), bh);
        gg.fillStyle = '#ffffff44';
        gg.fillRect(bx, Math.round(chartY + chartH - bh), Math.floor(bw), 1);
      });
    }

    // Bottom Strip: 3 Branch Crest Pixel Icons (+ Names when wide enough)
    const footY = R.y + R.h - 19 * u;
    gg.fillStyle = '#ffffff14';
    gg.fillRect(Math.round(R.x + padX), Math.round(footY - 3 * u), Math.round(R.w - 2 * padX), 1);
    const bSlotW = (R.w - 2 * padX) / 3;
    const showBranchNames = R.w >= 165 * u;
    a.branches.forEach((br, bi) => {
      const bx = R.x + padX + bi * bSlotW;
      const iconS = Math.round((showBranchNames ? 13 : 14) * u);
      const cy = footY + 7 * u;
      const brId = SKILL_TREES[a.id][bi]?.id ?? a.id;
      if (showBranchNames) {
        drawSkillIcon(gg, brId, bx + iconS / 2, cy, iconS, br.color, { dim: !a.unlocked });
        gg.textAlign = 'left'; gg.font = pixelFont(Math.round(8 * u));
        gg.fillStyle = a.unlocked ? '#d6cde4' : '#7d748c';
        fillText(gg, br.name, bx + iconS + 3 * u, cy + 3 * u, Math.max(20 * u, bSlotW - iconS - 5 * u));
      } else {
        drawSkillIcon(gg, brId, bx + bSlotW / 2, cy, iconS, br.color, { dim: !a.unlocked });
      }
    });
  });

  // Camp Setup & Upgrades List
  const first = Math.max(0, Math.min(c.sel - Math.floor(L.maxRows / 2), c.rows.length - L.maxRows));
  const lx = L.rowsArea.x, lw = L.rowsArea.w;
  c.rows.slice(first, first + L.maxRows).forEach((r, i) => {
    const idx = first + i, y = L.rowsArea.y + i * L.rowH, sel = idx === c.sel;
    const rect: Rect = { x: lx, y, w: lw, h: L.rowH - 4 * u };
    hits.push({ rect, action: { type: 'campRow', row: idx } });
    pixelPanel(gg, rect.x, rect.y, rect.w, rect.h, sel ? '#ffd84a' : '#493c59', sel ? '#493925ee' : '#181320ee', q);
    if (sel) { gg.fillStyle = '#ffd84a'; gg.fillRect(rect.x + 4 * dpr, rect.y + 5 * dpr, 2 * dpr, Math.max(2 * dpr, rect.h - 10 * dpr)); }

    const baseline = y + (L.compact ? 16 : 16.5) * u;
    const costX = lx + lw - 10 * u, levelX = costX - 78 * u;
    let descRight = lx + lw - 10 * u;
    gg.textAlign = 'right';
    if (r.kind === 'upgrade') {
      gg.font = pixelFont(Math.round(10.5 * u));
      const lv = `Lv ${r.level}/${r.max}`;
      descRight = levelX - textW(gg, lv) - 10 * u;
      gg.fillStyle = '#ddd'; fillText(gg, lv, levelX, baseline);
      gg.fillStyle = r.cost === undefined ? '#7dff5a' : r.affordable ? '#ffd84a' : '#775';
      gg.font = pixelFont(Math.round(11 * u));
      fillText(gg, r.cost === undefined ? 'MAX' : `● ${r.cost}`, costX, baseline, 70 * u);
    }
    gg.textAlign = 'left'; gg.font = pixelFont(Math.round(11.5 * u));
    gg.fillStyle = r.kind === 'start' ? '#7dff5a' : r.kind === 'archetype' ? '#ffd84a' : '#fff';
    fillText(gg, r.name, lx + 10 * u, baseline, L.compact ? descRight - lx - 10 * u : 168 * u);
    gg.font = pixelFont(Math.round(10 * u)); gg.fillStyle = '#bbb';
    const descX = lx + (L.compact ? 10 : 182) * u;
    fillText(gg, r.desc, descX, L.compact ? y + 30 * u : baseline, Math.max(40 * u, (L.compact ? lx + lw - 10 * u : descRight) - descX));
  });

  // Bottom hint
  gg.textAlign = 'center'; gg.font = pixelFont(Math.round(10 * u)); gg.fillStyle = '#c8c0d4';
  const left = Math.ceil(c.autoStartLeft);
  fillTextShadow(gg, `Tap hero or row · D-pad L/R switch hero · A select · B start (${left}s auto)`, W / 2, L.hintY, W - 24 * u);
  gg.textAlign = 'left';
  return hits;
}
