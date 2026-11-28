// Dual-mode Level-Up Skill Picker & Full 3-Branch Diablo Skill Tree + Pause Build Inspector.
// Pure layout math guarantees every panel, card, node, and button stays above H - insetBottom.
import type { ArchetypeView, SkillNodeView, SkillTreeView } from '../sim/types';
import type { Rect } from './layout';
import { pixelPanel, pixelMeter, pixelSocket, pixelGem, mixHex } from './chrome';
import { fillText, fillTextShadow, displayText, displayWidth, pixelFont, textWidth } from './font';
import { drawSkillIcon } from './skillArt';

export type SkillUiHit =
  | { rect: Rect; action: { type: 'skillCard'; i: number } }
  | { rect: Rect; action: { type: 'skillPick'; nodeId: string; confirm?: boolean } }
  | { rect: Rect; action: { type: 'skillMode'; mode: 'quick' | 'full' } }
  | { rect: Rect; action: { type: 'skillClose' } };

export interface QuickPickLayout {
  titleY: number;
  subY: number;
  cards: Rect[];
  modeBtn: Rect;
  closeBtn: Rect;
  timerY: number;
  hintY: number;
  stacked: boolean;
}

export function quickPickLayout(W: number, H: number, insetBottom: number, u: number, n = 3): QuickPickLayout {
  const pad = 12 * u, gap = 10 * u, base = H - insetBottom;
  const stacked = W < (3 * 185 + 4 * 12) * u;
  const titleY = Math.min(12 * u, base * 0.025);
  const subY = titleY + (stacked ? 30 : 34) * u;
  const btnH = 24 * u;
  let modeBtn: Rect, closeBtn: Rect;
  if (stacked) {
    const bw = Math.max(64 * u, (W - 2 * pad - 8 * u) / 2);
    const by = subY + 8 * u;
    modeBtn = { x: pad, y: by, w: bw, h: btnH };
    closeBtn = { x: pad + bw + 8 * u, y: by, w: bw, h: btnH };
  } else {
    const btnW = Math.min(126 * u, (W - 3 * pad) * 0.42);
    modeBtn = { x: W - pad - btnW * 2 - 6 * u, y: Math.max(6 * u, titleY + 4 * u), w: btnW, h: btnH };
    closeBtn = { x: W - pad - btnW, y: Math.max(6 * u, titleY + 4 * u), w: btnW, h: btnH };
  }
  const top = Math.max(subY + 12 * u, modeBtn.y + btnH + 8 * u);
  const footerH = 38 * u, bottom = Math.max(top, base - footerH);
  const avail = Math.max(0, bottom - top);
  const cards: Rect[] = [];
  if (!stacked) {
    const count = Math.max(1, n);
    const cw = Math.min(264 * u, (W - 2 * pad - (count - 1) * gap) / count);
    const ch = Math.min(206 * u, avail);
    const x0 = W / 2 - (count * cw + (count - 1) * gap) / 2;
    const y0 = top + Math.max(0, (avail - ch) / 2);
    for (let i = 0; i < count; i++) cards.push({ x: x0 + i * (cw + gap), y: y0, w: cw, h: ch });
  } else {
    const count = Math.max(1, n);
    const cw = Math.min(W - 2 * pad, 500 * u);
    const ch = Math.max(0, Math.min(116 * u, (avail - (count - 1) * gap) / count));
    const y0 = top + Math.max(0, (avail - (count * ch + (count - 1) * gap)) / 2);
    for (let i = 0; i < count; i++) cards.push({ x: W / 2 - cw / 2, y: y0 + i * (ch + gap), w: cw, h: ch });
  }
  return { titleY, subY, cards, modeBtn, closeBtn, timerY: base - 28 * u, hintY: base - 9 * u, stacked };
}

export interface FullTreeLayout {
  header: Rect;
  modeBtn: Rect;
  closeBtn: Rect;
  columns: Rect[];
  /** Node rects indexed [branchIdx][nodeIdx] (5 nodes: T1, T2, ForkA, ForkB, T4) */
  nodes: Rect[][];
  inspector: Rect;
  investBtn: Rect;
}

export function fullTreeLayout(W: number, H: number, insetBottom: number, u: number): FullTreeLayout {
  const pad = 10 * u, gap = 8 * u, base = H - insetBottom;
  const headerH = 40 * u;
  const header: Rect = { x: pad, y: pad, w: Math.max(0, W - 2 * pad), h: headerH };
  const btnW = Math.min(112 * u, Math.max(68 * u, header.w * 0.22)), btnH = 24 * u;
  const closeBtn: Rect = { x: header.x + header.w - btnW - 4 * u, y: header.y + (headerH - btnH) / 2, w: btnW, h: btnH };
  const modeBtn: Rect = { x: closeBtn.x - btnW - 6 * u, y: closeBtn.y, w: btnW, h: btnH };

  const inspH = Math.min(76 * u, Math.max(54 * u, base * 0.165));
  const inspector: Rect = { x: pad, y: Math.max(header.y + headerH + gap, base - pad - inspH), w: Math.max(0, W - 2 * pad), h: inspH };
  const invW = Math.min(144 * u, Math.max(92 * u, inspector.w * 0.28)), invH = Math.min(36 * u, inspH - 12 * u);
  const investBtn: Rect = { x: inspector.x + inspector.w - invW - 8 * u, y: inspector.y + (inspH - invH) / 2, w: invW, h: invH };

  const treeTop = header.y + headerH + gap;
  const treeH = Math.max(40 * u, inspector.y - gap - treeTop);
  const colW = Math.max(0, (W - 2 * pad - 2 * gap) / 3);
  const columns: Rect[] = [];
  const nodes: Rect[][] = [];

  for (let b = 0; b < 3; b++) {
    const cx = pad + b * (colW + gap);
    const col: Rect = { x: cx, y: treeTop, w: colW, h: treeH };
    columns.push(col);

    const colHead = 26 * u;
    const innerX = cx + 6 * u, innerW = Math.max(0, colW - 12 * u);
    const innerTop = treeTop + colHead, innerH = Math.max(0, treeH - colHead - 6 * u);
    const rowGap = Math.max(5 * u, Math.min(13 * u, innerH * 0.05));
    const rowH = Math.max(16 * u, (innerH - 3 * rowGap) / 4);
    const y1 = innerTop;
    const y2 = y1 + rowH + rowGap;
    const y3 = y2 + rowH + rowGap;
    const y4 = y3 + rowH + rowGap;
    const forkGap = 4 * u, forkW = Math.max(0, (innerW - forkGap) / 2);

    nodes.push([
      { x: innerX, y: y1, w: innerW, h: rowH },                  // T1
      { x: innerX, y: y2, w: innerW, h: rowH },                  // T2
      { x: innerX, y: y3, w: forkW, h: rowH },                   // T3 Fork A
      { x: innerX + forkW + forkGap, y: y3, w: forkW, h: rowH }, // T3 Fork B
      { x: innerX, y: y4, w: innerW, h: rowH },                  // T4 Capstone
    ]);
  }

  return { header, modeBtn, closeBtn, columns, nodes, inspector, investBtn };
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && textWidth(g, t) > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Crisp beveled diamond rank pips (filled = invested, gold outline = next rank, dark = remaining). */
function drawRankPips(g: CanvasRenderingContext2D, rightX: number, cy: number, rank: number, maxRank: number, color: string, q: number, previewNext = false) {
  const r = Math.max(3, Math.round(3.5 * q));
  const step = r * 2 + Math.max(3, Math.round(3 * q));
  for (let i = 0; i < maxRank; i++) {
    const cx = Math.round(rightX - (maxRank - 1 - i) * step);
    const y0 = Math.round(cy);
    const filled = i < rank;
    const next = previewNext && i === rank;
    g.fillStyle = '#0c0914';
    g.beginPath(); g.moveTo(cx, y0 - r - 1); g.lineTo(cx + r + 1, y0); g.lineTo(cx, y0 + r + 1); g.lineTo(cx - r - 1, y0); g.fill();
    g.fillStyle = filled ? color : next ? '#ffd84a' : '#2d263d';
    g.beginPath(); g.moveTo(cx, y0 - r); g.lineTo(cx + r, y0); g.lineTo(cx, y0 + r); g.lineTo(cx - r, y0); g.fill();
    if (filled || next) {
      g.fillStyle = '#ffffffaa';
      g.fillRect(cx - 1, y0 - r + 1, 2, 2);
    } else {
      pixelGem(g, cx, y0, '#443a5a', Math.max(1, Math.round(q * 0.7)));
    }
  }
}

export function drawSkillOverlay(
  g: CanvasRenderingContext2D,
  st: SkillTreeView,
  arch: ArchetypeView,
  W: number,
  H: number,
  insetBottom: number,
  u: number,
  dpr: number,
  t: number,
): SkillUiHit[] {
  if (!st.offer) return [];
  return st.offer.mode === 'quick'
    ? drawQuickPickOverlay(g, st, arch, W, H, insetBottom, u, dpr, t)
    : drawFullTreeOverlay(g, st, arch, W, H, insetBottom, u, dpr, t);
}

function drawQuickPickOverlay(
  g: CanvasRenderingContext2D,
  st: SkillTreeView,
  arch: ArchetypeView,
  W: number,
  H: number,
  insetBottom: number,
  u: number,
  dpr: number,
  t: number,
): SkillUiHit[] {
  const o = st.offer!;
  const L = quickPickLayout(W, H, insetBottom, u, o.cards.length);
  const q = Math.max(1, Math.round(dpr * Math.max(1, u / dpr)));
  const hits: SkillUiHit[] = [];
  const fade = Math.min(1, o.age / 0.25);

  g.save();
  g.globalAlpha = 0.85 * fade; g.fillStyle = '#08060f'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;

  // Title & safety subline
  const titleTxt = `LEVEL UP · ${st.unspentSP} SP`;
  const titleMaxW = L.stacked ? W - 28 * u : W * 0.52;
  const tq = Math.max(2, Math.min(Math.round(3.2 * dpr), Math.floor(titleMaxW / Math.max(1, displayWidth(titleTxt, 1)))));
  displayText(g, titleTxt, 14 * u, L.titleY, tq, '#ffd84a', false);

  g.textAlign = 'left'; g.font = pixelFont(Math.round(11 * u)); g.fillStyle = '#8fd8ff';
  const buildSub = st.spentSP > 0 ? `${st.buildTitle} · ${o.reason} · Flat road` : `${arch.name} · ${o.reason} · Trainer held flat`;
  fillTextShadow(g, buildSub, 14 * u, L.subY, L.stacked ? W - 28 * u : Math.max(80 * u, L.modeBtn.x - 20 * u));

  // Top-right toggle buttons ([Y] Full Tree & [B] Bank)
  pixelPanel(g, L.modeBtn.x, L.modeBtn.y, L.modeBtn.w, L.modeBtn.h, '#ffd84a', '#281f38f4', q);
  g.textAlign = 'center'; g.font = pixelFont(Math.round(10 * u)); g.fillStyle = '#ffd84a';
  fillTextShadow(g, '[Y] FULL TREE', L.modeBtn.x + L.modeBtn.w / 2, L.modeBtn.y + L.modeBtn.h * 0.68, L.modeBtn.w - 8 * u);
  hits.push({ rect: L.modeBtn, action: { type: 'skillMode', mode: 'full' } });

  pixelPanel(g, L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h, '#746481', '#181320f0', q);
  g.fillStyle = '#d8d0e0';
  fillTextShadow(g, '[B] BANK SP', L.closeBtn.x + L.closeBtn.w / 2, L.closeBtn.y + L.closeBtn.h * 0.68, L.closeBtn.w - 8 * u);
  hits.push({ rect: L.closeBtn, action: { type: 'skillClose' } });

  // 3 Quick-Pick Cards with bespoke pixel-art icon medallions, rank pips & synergy strip
  o.cards.forEach((c, i) => {
    const R = L.cards[i]; if (!R || R.h <= 0) return;
    hits.push({ rect: R, action: { type: 'skillCard', i } });
    const sel = i === o.sel, rise = sel ? Math.round(5 * u) : 0, y = R.y - rise;
    const isKey = c.tier === 4, isFork = !!c.fork;
    const borderCol = isKey ? '#ffd84a' : sel ? mixHex(c.branchColor, '#ffffff', 0.3) : mixHex(c.branchColor, '#3a3243', 0.45);

    if (sel || isKey) {
      g.globalAlpha = (sel ? 0.34 : 0.16) + 0.14 * Math.sin(t * 5 + i);
      g.fillStyle = isKey ? '#ffd84a' : c.branchColor;
      g.fillRect(R.x - 3 * q, y - 3 * q, R.w + 6 * q, R.h + 6 * q);
      g.globalAlpha = 1;
    }
    pixelPanel(g, R.x, y, R.w, R.h, borderCol, sel ? '#231b32f8' : '#14101ff2', q);
    // Top accent bar
    g.fillStyle = isKey ? '#ffd84a' : c.branchColor;
    g.fillRect(Math.round(R.x + 3 * q), Math.round(y + 3 * q), Math.round(R.w - 6 * q), 2 * q);

    const px = R.x + 10 * u, mw = R.w - 20 * u;

    if (L.stacked) {
      // Compact horizontal card layout for narrow/phone viewports
      const sock = Math.min(48 * u, R.h - 18 * u);
      const sx = px, sy = y + (R.h - sock) / 2;
      pixelSocket(g, sx, sy, sock, sock, q);
      if (isKey) { g.strokeStyle = '#ffd84a'; g.lineWidth = q; g.strokeRect(sx - q, sy - q, sock + 2 * q, sock + 2 * q); }
      drawSkillIcon(g, c.nodeId, sx + sock / 2, sy + sock / 2, sock - 6 * q, c.branchColor);

      const tx = sx + sock + 10 * u, tw = R.x + R.w - 10 * u - tx;
      g.textAlign = 'left'; g.font = pixelFont(Math.round(9 * u)); g.fillStyle = isKey ? '#ffd84a' : c.branchColor;
      const tag = isKey ? `${c.branchName.toUpperCase()} · KEYSTONE` : isFork ? `${c.branchName.toUpperCase()} · FORK ${c.fork}` : `${c.branchName.toUpperCase()} · T${c.tier}`;
      fillTextShadow(g, tag, tx, y + 17 * u, tw - 36 * u);
      drawRankPips(g, R.x + R.w - 14 * u, y + 14 * u, c.rank, c.maxRank, c.branchColor, q, true);

      g.textAlign = 'left'; g.font = pixelFont(Math.round(13 * u)); g.fillStyle = isKey ? '#fff4b8' : '#fff';
      fillTextShadow(g, c.name, tx, y + 34 * u, tw);

      g.font = pixelFont(Math.round(9.5 * u)); g.fillStyle = '#ffe8b0';
      let dy = y + 48 * u;
      for (const ln of wrap(g, c.detail, tw).slice(0, 2)) {
        fillText(g, ln, tx, dy, tw); dy += 12 * u;
      }

      // Bottom cycling strip
      g.font = pixelFont(Math.round(8.5 * u));
      g.fillStyle = isFork ? '#ff8b7a' : '#8fd8ff';
      const foot = isFork ? `! Locks Fork ${c.fork === 'A' ? 'B' : 'A'} for run · ${c.cycling}` : c.cycling;
      fillText(g, foot, tx, y + R.h - 9 * u, tw);
    } else {
      // Rich vertical card layout for desktop / tablet
      // Row 1: Branch · Tier tag + Next Rank
      const topY = y + 19 * u;
      g.textAlign = 'left'; g.font = pixelFont(Math.round(9.5 * u)); g.fillStyle = isKey ? '#ffd84a' : c.branchColor;
      const tag = isKey ? `${c.branchName.toUpperCase()} · KEYSTONE` : isFork ? `${c.branchName.toUpperCase()} · FORK ${c.fork}` : `${c.branchName.toUpperCase()} · TIER ${c.tier}`;
      fillTextShadow(g, tag, px, topY, mw - 42 * u);
      g.textAlign = 'right'; g.fillStyle = '#ddd';
      fillTextShadow(g, `${c.rank}->${c.rank + 1}/${c.maxRank}`, R.x + R.w - 10 * u, topY);

      // Row 2: Framed Pixel Art Medallion + Name + Rank Gems
      const sock = Math.round(44 * u);
      const sx = px, sy = y + 27 * u;
      // Subtle glow behind medallion
      g.fillStyle = mixHex(isKey ? '#ffd84a' : c.branchColor, '#14101f', 0.72);
      g.fillRect(Math.round(sx - 2 * q), Math.round(sy - 2 * q), sock + 4 * q, sock + 4 * q);
      pixelSocket(g, sx, sy, sock, sock, q);
      if (isKey) { g.strokeStyle = '#ffd84a'; g.lineWidth = q; g.strokeRect(sx - q, sy - q, sock + 2 * q, sock + 2 * q); }
      drawSkillIcon(g, c.nodeId, sx + sock / 2, sy + sock / 2, sock - 6 * q, c.branchColor);

      const nx = sx + sock + 10 * u, nw = R.x + R.w - 10 * u - nx;
      g.textAlign = 'left'; g.font = pixelFont(Math.round(15.5 * u)); g.fillStyle = isKey ? '#fff4b8' : '#ffffff';
      const nameLines = wrap(g, c.name, nw).slice(0, 2);
      nameLines.forEach((ln, li) => fillTextShadow(g, ln, nx, sy + 18 * u + li * 16 * u, nw));
      // Rank gems below name inside header block
      drawRankPips(g, nx + (c.maxRank - 1) * Math.round(10 * q) + 4 * q, sy + sock - 4 * u, c.rank, c.maxRank, c.branchColor, q, true);

      // Divider rule
      const divY = Math.round(sy + sock + 8 * u);
      g.fillStyle = mixHex(c.branchColor, '#14101f', 0.65);
      g.fillRect(Math.round(px), divY, Math.round(mw), Math.max(1, q));

      // Row 3: Effect detail copy
      let ty = divY + 15 * u;
      g.textAlign = 'left'; g.font = pixelFont(Math.round(10.5 * u)); g.fillStyle = '#ffe8b0';
      const reserveBottom = (isFork ? 46 : 32) * u;
      for (const ln of wrap(g, c.detail, mw).slice(0, 4)) {
        if (ty > y + R.h - reserveBottom) break;
        fillText(g, ln, px, ty, mw);
        ty += 14 * u;
      }

      // Optional Fork Lock Warning Pill
      if (isFork) {
        const wy = y + R.h - 44 * u, wh = 16 * u;
        pixelPanel(g, px, wy, mw, wh, '#c95050', '#2b1218ee', q);
        g.textAlign = 'left'; g.font = pixelFont(Math.round(8.5 * u)); g.fillStyle = '#ff9898';
        fillText(g, `! Locks Fork ${c.fork === 'A' ? 'B' : 'A'} for this run`, px + 6 * u, wy + 11.5 * u, mw - 12 * u);
      }

      // Row 4: Cycling synergy pill strip at card bottom
      const stripH = 20 * u, stripY = y + R.h - stripH - 5 * u;
      g.fillStyle = mixHex(c.branchColor, '#0d0a16', 0.82);
      g.fillRect(Math.round(px), Math.round(stripY), Math.round(mw), Math.round(stripH));
      g.fillStyle = c.branchColor;
      g.fillRect(Math.round(px), Math.round(stripY), Math.max(2, 2 * q), Math.round(stripH));
      g.textAlign = 'left'; g.font = pixelFont(Math.round(9 * u)); g.fillStyle = '#9fe8ff';
      fillText(g, c.cycling, px + 7 * u, stripY + 13.5 * u, mw - 12 * u);
    }
  });

  // Countdown bar & controls hint
  if (o.autoS > 0) {
    const left = Math.max(0, o.autoS - o.age);
    const bw = Math.min(360 * u, W * 0.65);
    pixelMeter(g, W / 2 - bw / 2, L.timerY, bw, 6 * u, left / o.autoS, '#ffd84a', dpr);
    g.textAlign = 'center'; g.font = pixelFont(Math.round(10 * u)); g.fillStyle = '#d4cce4';
    fillTextShadow(g, `Tap a card or D-pad + A · Y Full Tree · auto-pick in ${Math.ceil(left)}s`, W / 2, L.hintY, W - 24 * u);
  } else {
    g.textAlign = 'center'; g.font = pixelFont(Math.round(10 * u)); g.fillStyle = '#d4cce4';
    fillTextShadow(g, 'Tap a card or D-pad + A · Y Full Tree · B Resume ride', W / 2, L.hintY, W - 24 * u);
  }

  g.restore();
  return hits;
}

function drawFullTreeOverlay(
  g: CanvasRenderingContext2D,
  st: SkillTreeView,
  arch: ArchetypeView,
  W: number,
  H: number,
  insetBottom: number,
  u: number,
  dpr: number,
  t: number,
): SkillUiHit[] {
  const o = st.offer!;
  const L = fullTreeLayout(W, H, insetBottom, u);
  const q = Math.max(1, Math.round(dpr * Math.max(1, u / dpr)));
  const hits: SkillUiHit[] = [];

  g.save();
  g.globalAlpha = 0.88; g.fillStyle = '#07060d'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;

  // Header bar with archetype emblem + build title + Boss Relic status
  pixelPanel(g, L.header.x, L.header.y, L.header.w, L.header.h, mixHex(arch.color, '#3a3243', 0.35), '#171222f6', q);
  const badgeS = L.header.h - 8 * q;
  pixelPanel(g, L.header.x + 5 * q, L.header.y + 4 * q, badgeS, badgeS, mixHex(arch.color, '#000', 0.2), arch.color, q);
  const bls = Math.max(1, Math.floor((badgeS - 4 * q) / 10));
  displayText(g, arch.shortName[0], L.header.x + 5 * q + badgeS / 2, L.header.y + 4 * q + (badgeS - 10 * bls) / 2 + bls / 2, bls, mixHex(arch.color, '#ffffff', 0.25), true);

  const hx = L.header.x + 10 * q + badgeS;
  const hMaxW = Math.max(60 * u, (o.cards.length > 0 ? L.modeBtn.x : L.closeBtn.x) - hx - 10 * u);
  g.textAlign = 'left'; g.font = pixelFont(Math.round(13 * u)); g.fillStyle = arch.color;
  const titleLine = st.spentSP > 0 ? `${arch.name.toUpperCase()} · ${st.buildTitle}` : arch.name.toUpperCase();
  fillTextShadow(g, titleLine, hx, L.header.y + 16 * u, hMaxW);

  g.font = pixelFont(Math.round(9.5 * u)); g.fillStyle = st.unspentSP > 0 ? '#ffd84a' : '#a8c8e8';
  const par = (st.paragonRanks ?? 0) > 0 ? ` · Paragon +${st.paragonRanks}` : '';
  const sub = `${st.unspentSP} SP ready · ${st.spentSP} spent${par}${st.relicName ? ` · Relic: ${st.relicName}` : ''} · Flat road`;
  fillText(g, sub, hx, L.header.y + 31 * u, hMaxW);

  if (o.cards.length > 0) {
    pixelPanel(g, L.modeBtn.x, L.modeBtn.y, L.modeBtn.w, L.modeBtn.h, '#ffd84a', '#261e34f0', q);
    g.textAlign = 'center'; g.font = pixelFont(Math.round(9.5 * u)); g.fillStyle = '#ffd84a';
    fillTextShadow(g, '[Y] QUICK PICK', L.modeBtn.x + L.modeBtn.w / 2, L.modeBtn.y + L.modeBtn.h * 0.68, L.modeBtn.w - 6 * u);
    hits.push({ rect: L.modeBtn, action: { type: 'skillMode', mode: 'quick' } });
  }

  pixelPanel(g, L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h, '#746481', '#181320f0', q);
  g.textAlign = 'center'; g.font = pixelFont(Math.round(9.5 * u)); g.fillStyle = '#e0d8ec';
  fillTextShadow(g, '[B] RESUME', L.closeBtn.x + L.closeBtn.w / 2, L.closeBtn.y + L.closeBtn.h * 0.68, L.closeBtn.w - 6 * u);
  hits.push({ rect: L.closeBtn, action: { type: 'skillClose' } });

  let focusedNode: SkillNodeView | null = null;
  let focusedBranchColor = arch.color;
  let focusedBranchName = arch.name;

  // 3 Diablo-Style Branch Columns
  st.branches.forEach((b, bi) => {
    const C = L.columns[bi];
    const rects = L.nodes[bi];
    const activeCol = b.nodes.some((n) => n.id === o.focusNodeId);
    const hasRelic = st.relicBranchName === b.name;
    pixelPanel(g, C.x, C.y, C.w, C.h, activeCol ? b.color : mixHex(b.color, '#2e263c', 0.65), activeCol ? '#151020f4' : '#110d1af0', q);

    // Column Header: Branch Crest + Name + Relic Badge + Points
    const crestSize = Math.round(16 * u);
    drawSkillIcon(g, b.id, C.x + 8 * u + crestSize / 2, C.y + 13 * u, crestSize, b.color);
    g.textAlign = 'left'; g.font = pixelFont(Math.round(10.5 * u)); g.fillStyle = b.color;
    fillTextShadow(g, b.name.toUpperCase(), C.x + 12 * u + crestSize, C.y + 17 * u, C.w - 62 * u - crestSize);

    if (hasRelic) {
      drawSkillIcon(g, arch.id, C.x + C.w - 44 * u, C.y + 13 * u, 14 * u, '#ffd84a');
    }
    g.textAlign = 'right'; g.font = pixelFont(Math.round(9.5 * u)); g.fillStyle = b.points > 0 ? '#ffd84a' : '#888';
    fillText(g, `${b.points} pts`, C.x + C.w - 8 * u, C.y + 17 * u);

    // Dependency Connector Pipes (lit in branch color when unlocked, muted when locked)
    const [r1, r2, r3a, r3b, r4] = rects;
    const [n1, n2, n3a, n3b, n4] = b.nodes;
    const lit12 = n1.rank > 0;
    const lit23 = n2.rank > 0;
    const litA = lit23 && n3a.state !== 'locked-out';
    const litB = lit23 && n3b.state !== 'locked-out';
    const lit4A = n3a.rank > 0;
    const lit4B = n3b.rank > 0;
    const midX = Math.round(r1.x + r1.w / 2);
    const pipeW = Math.max(2, 2 * q);
    const pipe = (lit: boolean, gold = false) => (gold ? '#ffd84a' : lit ? b.color : '#2e273c');

    // T1 -> T2
    g.fillStyle = pipe(lit12);
    g.fillRect(midX - Math.floor(pipeW / 2), Math.round(r1.y + r1.h), pipeW, Math.max(1, Math.round(r2.y - (r1.y + r1.h))));

    // T2 -> Fork A & Fork B split
    const mid23 = Math.round((r2.y + r2.h + r3a.y) / 2);
    const ax = Math.round(r3a.x + r3a.w / 2), bx = Math.round(r3b.x + r3b.w / 2);
    g.fillStyle = pipe(lit23);
    g.fillRect(midX - Math.floor(pipeW / 2), Math.round(r2.y + r2.h), pipeW, Math.max(1, mid23 - Math.round(r2.y + r2.h)));
    // Left arm -> Fork A
    g.fillStyle = pipe(litA, n3a.rank > 0);
    g.fillRect(ax, mid23, Math.max(1, midX - ax + Math.floor(pipeW / 2)), pipeW);
    g.fillRect(ax - Math.floor(pipeW / 2), mid23, pipeW, Math.max(1, Math.round(r3a.y) - mid23));
    // Right arm -> Fork B
    g.fillStyle = pipe(litB, n3b.rank > 0);
    g.fillRect(midX - Math.floor(pipeW / 2), mid23, Math.max(1, bx - midX + pipeW), pipeW);
    g.fillRect(bx - Math.floor(pipeW / 2), mid23, pipeW, Math.max(1, Math.round(r3b.y) - mid23));

    // Fork A & Fork B -> T4 Capstone converge
    const mid34 = Math.round((r3a.y + r3a.h + r4.y) / 2);
    g.fillStyle = pipe(lit4A, lit4A);
    g.fillRect(ax - Math.floor(pipeW / 2), Math.round(r3a.y + r3a.h), pipeW, Math.max(1, mid34 - Math.round(r3a.y + r3a.h)));
    g.fillRect(ax, mid34, Math.max(1, midX - ax + Math.floor(pipeW / 2)), pipeW);
    g.fillStyle = pipe(lit4B, lit4B);
    g.fillRect(bx - Math.floor(pipeW / 2), Math.round(r3b.y + r3b.h), pipeW, Math.max(1, mid34 - Math.round(r3b.y + r3b.h)));
    g.fillRect(midX - Math.floor(pipeW / 2), mid34, Math.max(1, bx - midX + pipeW), pipeW);
    g.fillStyle = pipe(lit4A || lit4B, n4.rank > 0);
    g.fillRect(midX - Math.floor(pipeW / 2), mid34, pipeW, Math.max(1, Math.round(r4.y) - mid34));

    // Draw all 5 Nodes with bespoke pixel icons + rank gems
    b.nodes.forEach((n, ni) => {
      const R = rects[ni];
      const focused = n.id === o.focusNodeId;
      if (focused) { focusedNode = n; focusedBranchColor = b.color; focusedBranchName = b.name; }
      hits.push({ rect: R, action: { type: 'skillPick', nodeId: n.id } });

      const isKey = n.tier === 4;
      const isFork = !!n.fork;
      const isLockedOut = n.state === 'locked-out';
      const isLocked = n.state === 'locked';
      const isInvested = n.state === 'invested' || n.state === 'maxed';

      const border = focused
        ? '#ffffff'
        : n.state === 'maxed'
        ? '#ffd84a'
        : n.state === 'invested'
        ? b.color
        : isLockedOut
        ? '#4e232a'
        : n.state === 'available'
        ? mixHex(b.color, '#4a4258', 0.35)
        : '#2b2438';

      const fill = isLockedOut
        ? '#140b10ee'
        : n.state === 'maxed'
        ? mixHex(isKey ? '#ffd84a' : b.color, '#171122', 0.72)
        : isInvested
        ? mixHex(b.color, '#161120', 0.8)
        : focused
        ? '#261e36f8'
        : n.state === 'available'
        ? '#191426f2'
        : '#110d19e8';

      if (focused && st.unspentSP > 0 && (n.state === 'available' || n.state === 'invested')) {
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 6);
        g.fillStyle = isKey ? '#ffd84a' : b.color;
        g.fillRect(R.x - 2 * q, R.y - 2 * q, R.w + 4 * q, R.h + 4 * q);
        g.globalAlpha = 1;
      }

      pixelPanel(g, R.x, R.y, R.w, R.h, border, fill, q);

      const tallNarrow = R.w < 140 * u && R.h >= 62 * u;
      if (tallNarrow) {
        // Portrait phone / narrow column: clean centered icon-first medallion card (full copy in bottom inspector)
        const sock = Math.round(Math.min(R.w - 10 * u, R.h * (isFork ? 0.34 : 0.42), (isFork ? 30 : 38) * u));
        const cx = R.x + R.w / 2;
        const sy = R.y + (isFork ? 16 : 9) * u;
        if (isFork) {
          g.textAlign = 'center'; g.font = pixelFont(Math.round(8 * u));
          g.fillStyle = isLockedOut ? '#c85860' : b.color;
          fillTextShadow(g, `FORK ${n.fork}`, cx, R.y + 12 * u, R.w - 6 * u);
        }
        pixelSocket(g, cx - sock / 2, sy, sock, sock, q);
        if (isKey && !isLocked) { g.strokeStyle = '#ffd84a'; g.lineWidth = q; g.strokeRect(cx - sock / 2 - q, sy - q, sock + 2 * q, sock + 2 * q); }
        drawSkillIcon(g, n.id, cx, sy + sock / 2, sock - 4 * q, b.color, { dim: isLocked, lockedOut: isLockedOut });

        const rankY = R.y + R.h - 7 * u;
        const labelY = Math.min(sy + sock + 12 * u, rankY - 11 * u);
        g.textAlign = 'center'; g.font = pixelFont(Math.round((isFork ? 8 : 9) * u));
        g.fillStyle = isLockedOut ? '#8e555e' : isLocked ? '#9a90ad' : isKey ? '#ffd84a' : '#ffffff';
        const shortName = isFork ? n.name.split(' ')[0] : n.name;
        fillTextShadow(g, shortName, cx, labelY, R.w - 8 * u);

        if (isLockedOut) {
          g.font = pixelFont(Math.round(7.5 * u)); g.fillStyle = '#d45a64';
          fillText(g, 'LOCKED', cx, rankY, R.w - 6 * u);
        } else {
          const pipW = (n.maxRank - 1) * Math.round(10 * q);
          drawRankPips(g, cx + pipW / 2, rankY - 2 * u, n.rank, n.maxRank, isKey ? '#ffd84a' : b.color, q, false);
        }
        g.textAlign = 'left';
        return;
      }

      // Desktop / tablet horizontal node layout: left icon socket + title/short + right rank pips
      const compactFork = isFork && R.w < 135 * u;
      const sock = Math.round(Math.min(R.h - 10 * u, compactFork ? 22 * u : 32 * u));
      const showSock = sock >= 14 * u && R.w >= 64 * u;
      const sx = R.x + 5 * u, sy = R.y + (R.h - sock) / 2;
      if (showSock) {
        pixelSocket(g, sx, sy, sock, sock, q);
        if (isKey && !isLocked) { g.strokeStyle = '#ffd84a'; g.lineWidth = q; g.strokeRect(sx - q, sy - q, sock + 2 * q, sock + 2 * q); }
        drawSkillIcon(g, n.id, sx + sock / 2, sy + sock / 2, sock - 4 * q, b.color, { dim: isLocked, lockedOut: isLockedOut });
      }

      const tx = showSock ? sx + sock + 7 * u : R.x + 6 * u;
      const tw = R.x + R.w - 6 * u - tx;
      const twoRow = R.h >= 34 * u;
      const titleY = twoRow ? R.y + R.h * 0.42 : R.y + R.h * 0.62;
      const subRowY = R.y + R.h * 0.78;

      // Top line: Node Title + Rank Status
      g.textAlign = 'left';
      g.font = pixelFont(Math.round((isFork ? 9.5 : 11) * u));
      g.fillStyle = isLockedOut ? '#8e555e' : isLocked ? '#9a90ad' : isKey ? '#ffd84a' : '#ffffff';
      const label = isFork ? `${n.fork}: ${n.name}` : isKey ? `★ ${n.name}` : n.name;
      const rightReserve = isLockedOut ? 18 * u : 30 * u;
      fillTextShadow(g, label, tx, titleY, Math.max(24 * u, tw - rightReserve));

      if (isLockedOut) {
        g.textAlign = 'right'; g.font = pixelFont(Math.round(8.5 * u)); g.fillStyle = '#d45a64';
        fillText(g, 'X', R.x + R.w - 6 * u, titleY);
      } else {
        g.textAlign = 'right'; g.font = pixelFont(Math.round(8.5 * u));
        g.fillStyle = n.state === 'maxed' ? '#ffd84a' : n.rank > 0 ? b.color : '#a49cb4';
        fillText(g, `${n.rank}/${n.maxRank}`, R.x + R.w - 6 * u, titleY);
      }

      // Bottom line: Short effect summary + beveled diamond rank pips
      if (twoRow) {
        g.textAlign = 'left'; g.font = pixelFont(Math.round((isFork ? 8 : 8.5) * u));
        g.fillStyle = isLockedOut ? '#7a4b52' : isLocked ? '#7d7491' : '#d8cfe8';
        const shortTxt = isLockedOut ? 'Locked out (sibling Fork)' : n.short;
        const pipReserve = !isFork && !isLockedOut ? (n.maxRank * 11 + 8) * u : 2 * u;
        fillText(g, shortTxt, tx, subRowY, Math.max(24 * u, tw - pipReserve));
        if (!isFork && !isLockedOut) {
          drawRankPips(g, R.x + R.w - 10 * u, subRowY - 3 * u, n.rank, n.maxRank, isKey ? '#ffd84a' : b.color, q, false);
        }
      }
    });
  });

  // Bottom Node Inspector Strip with large Icon Medallion + Full Detail + Action Button
  pixelPanel(g, L.inspector.x, L.inspector.y, L.inspector.w, L.inspector.h, focusedBranchColor, '#171222f8', q);
  if (focusedNode) {
    const fn = focusedNode as SkillNodeView;
    const isLocked = fn.state === 'locked', isLockedOut = fn.state === 'locked-out';
    const isock = Math.round(Math.min(48 * u, L.inspector.h - 14 * u));
    const isx = L.inspector.x + 9 * u, isy = L.inspector.y + (L.inspector.h - isock) / 2;
    pixelSocket(g, isx, isy, isock, isock, q);
    drawSkillIcon(g, fn.id, isx + isock / 2, isy + isock / 2, isock - 6 * q, focusedBranchColor, { dim: isLocked, lockedOut: isLockedOut });

    const textX = isx + isock + 10 * u;
    const textWMax = Math.max(80 * u, L.investBtn.x - textX - 10 * u);
    g.textAlign = 'left'; g.font = pixelFont(Math.round(12 * u)); g.fillStyle = fn.tier === 4 ? '#ffd84a' : '#fff';
    const head = `${focusedBranchName} · ${fn.fork ? `Fork ${fn.fork}: ` : fn.tier === 4 ? 'Capstone: ' : ''}${fn.name} (${fn.rank}/${fn.maxRank})`;
    fillTextShadow(g, head, textX, L.inspector.y + 19 * u, textWMax);

    g.font = pixelFont(Math.round(10 * u)); g.fillStyle = '#ffe8b0';
    fillTextShadow(g, fn.detail, textX, L.inspector.y + 37 * u, textWMax);

    g.font = pixelFont(Math.round(9 * u)); g.fillStyle = isLockedOut ? '#ff6b6b' : fn.fork ? '#ffb88a' : '#9fe8ff';
    const line3 = isLockedOut
      ? 'Locked out for this run - sibling Fork already chosen.'
      : `${fn.cycling}${fn.fork && fn.rank === 0 ? ` · Exclusive Fork: locks Fork ${fn.fork === 'A' ? 'B' : 'A'} for this run.` : ''}`;
    fillText(g, line3, textX, L.inspector.y + L.inspector.h - 10 * u, textWMax);

    const canBuy = st.unspentSP > 0 && (fn.state === 'available' || fn.state === 'invested');
    const confirmWarn = canBuy && !!fn.fork && fn.rank === 0;
    pixelPanel(g, L.investBtn.x, L.investBtn.y, L.investBtn.w, L.investBtn.h, canBuy ? (confirmWarn ? '#ff9a3c' : '#ffd84a') : '#4a4258', canBuy ? '#3d2f14f6' : '#1b1626f0', q);
    g.textAlign = 'center'; g.font = pixelFont(Math.round(10 * u)); g.fillStyle = canBuy ? (confirmWarn ? '#ffd088' : '#ffd84a') : '#888';
    const bTxt = fn.state === 'maxed' ? 'MAXED ✓' : isLockedOut ? 'LOCKED OUT' : isLocked ? `NEED TIER ${fn.tier - 1}` : canBuy ? (confirmWarn ? '[A] LOCK FORK' : '[A] INVEST 1 SP') : '0 SP LEFT';
    fillTextShadow(g, bTxt, L.investBtn.x + L.investBtn.w / 2, L.investBtn.y + L.investBtn.h * 0.65, L.investBtn.w - 8 * u);
    if (canBuy) hits.push({ rect: L.investBtn, action: { type: 'skillPick', nodeId: fn.id, confirm: true } });
  }

  g.restore();
  return hits;
}
