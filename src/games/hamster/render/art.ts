// Small, hand-drawn inventory illustrations. Shared materials with Gerald's world.
import { satellite } from './orbital';
import { FONT, FURS, TAU, hamster, hash, rr } from './draw';
type G = CanvasRenderingContext2D;

export function inventoryArt(g: G, key: string, x: number, y: number, size: number) {
  g.save(); g.translate(x, y); g.scale(size / 56, size / 56);
  const [kind, value] = key.split(':'), idx = Number(value) || 0;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const box = (x: number, y: number, w: number, h: number, fill: string, r = 3) => {
    g.fillStyle = fill; rr(g, x, y, w, h, r); g.fill(); g.strokeStyle = '#221b2d'; g.lineWidth = 1.5; g.stroke();
  };
  const wheel = (cx: number, cy: number, r: number) => {
    g.strokeStyle = '#8e839e'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    g.strokeStyle = '#eee1be'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx - .7, cy - .7, r, 0, TAU); g.stroke();
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
  };
  if (kind === 'gen' || kind === 'g') {
    if (idx < 6) {
      wheel(27, 27, 22);
      g.save(); if (idx === 4) { g.translate(-8, 0); g.scale(1.25, .9); }
      hamster(g, 25, 45, idx === 5 ? 40 : 36, 0, { fur: [FURS.gerald, FURS.gerbil, FURS.guinea, FURS.grey, FURS.white, FURS.guinea][idx], noShadow: true, swole: idx === 3 ? .7 : 0 }); g.restore();
      if (idx === 3) { box(8, 31, 39, 4, '#c4c1cb'); box(8, 25, 6, 16, '#666071'); box(41, 25, 6, 16, '#666071'); }
      if (idx === 5) { box(4, 41, 48, 11, '#8f6447'); g.fillStyle = '#79d1cf'; g.fillRect(7, 41, 42, 3); }
    } else if (idx === 6) {
      box(6, 10, 44, 39, '#b99971'); box(11, 15, 34, 25, '#393044');
      hamster(g, 27, 39, 28, 0, { fur: FURS.gerald, noShadow: true });
      box(5, 40, 46, 5, '#d8b17e'); box(11, 45, 4, 9, '#82644d'); box(41, 45, 4, 9, '#82644d');
      g.fillStyle = '#efbdca'; g.font = `900 8px ${FONT}`; g.textAlign = 'center'; g.fillText('WW', 28, 9);
    } else if (idx === 7) {
      g.strokeStyle = '#eee0bf'; g.lineWidth = 4; g.beginPath(); g.arc(28, 25, 20, 0, TAU); g.stroke();
      g.strokeStyle = '#93859f'; g.lineWidth = 3; g.beginPath(); g.moveTo(28, 45); g.lineTo(28, 53); g.stroke();
      hamster(g, 25, 39, 30, 0, { fur: FURS.pink, shades: true, noShadow: true }); box(39, 29, 10, 17, '#42364f');
    } else if (idx === 8) {
      box(5, 6, 46, 33, '#827887'); box(9, 10, 38, 25, '#263c35');
      g.strokeStyle = '#a7d9a3'; g.lineWidth = 2; g.beginPath(); g.moveTo(13, 29); g.lineTo(23, 23); g.lineTo(30, 27); g.lineTo(44, 14); g.stroke();
      box(16, 42, 25, 11, '#bd9259'); box(23, 38, 11, 5, '#cbb992');
    } else if (idx === 9) {
      box(12, 18, 32, 32, '#9a9b98'); box(16, 23, 24, 19, '#4e4657');
      for (const xx of [18, 38]) { box(xx - 3, 4, 6, 14, '#b9c3b1'); for (let k = 0; k < 3; k++) box(xx - 5, 5 + k * 4, 10, 2, '#ded4b3', 1); }
      g.strokeStyle = '#f2c776'; g.lineWidth = 2; g.beginPath(); g.moveTo(29, 26); g.lineTo(23, 33); g.lineTo(30, 33); g.lineTo(26, 39); g.stroke();
    } else if (idx === 10) {
      box(4, 34, 48, 17, '#548991'); g.fillStyle = '#aaa49d'; g.beginPath(); g.moveTo(12, 10); g.lineTo(39, 10); g.lineTo(48, 48); g.lineTo(7, 48); g.fill();
      g.strokeStyle = '#bdddda'; g.lineWidth = 5; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(19 + k * 8, 19); g.lineTo(19 + k * 8, 46); g.stroke(); }
      box(9, 8, 34, 7, '#d4c4a7');
    } else if (idx === 11) {
      g.strokeStyle = '#e5d8bb'; g.lineWidth = 3; g.beginPath(); g.moveTo(29, 24); g.lineTo(29, 51); g.stroke();
      for (let i = 0; i < 3; i++) { g.save(); g.translate(29, 24); g.rotate(i / 3 * TAU + .3); g.fillStyle = '#e8d9bc'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-8, -15, 0, -23); g.lineTo(3, -5); g.fill(); g.restore(); }
      g.fillStyle = '#b98d60'; g.beginPath(); g.arc(29, 24, 4, 0, TAU); g.fill(); box(17, 49, 24, 4, '#8a8192');
    } else if (idx === 12) {
      g.fillStyle = '#b4ada0'; g.beginPath(); g.moveTo(8, 50); g.quadraticCurveTo(22, 29, 14, 15); g.lineTo(41, 15); g.quadraticCurveTo(34, 30, 48, 50); g.fill();
      g.fillStyle = '#d6cdba'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(24 + i * 5, 10 - i * 3, 6, 0, TAU); g.fill(); }
      box(20, 30, 16, 12, '#e6bd69'); g.fillStyle = '#665052'; g.font = `900 9px ${FONT}`; g.textAlign = 'center'; g.fillText('II', 28, 39);
    } else if (idx < 15) {
      g.strokeStyle = '#8f899c'; g.lineWidth = 9; g.beginPath(); g.ellipse(28, 30, 22, 14, -.3, 0, TAU); g.stroke();
      g.strokeStyle = idx === 13 ? '#9cc9d5' : '#dc9fc4'; g.lineWidth = 3; g.stroke();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; box(25 + Math.cos(a) * 21, 26 + Math.sin(a) * 13, 6, 8, '#c1b2a2'); }
    } else if (idx === 15 || idx === 16) {
      g.fillStyle = idx === 15 ? '#6b9eab' : '#c4754f'; g.beginPath(); g.arc(28, 28, 19, 0, TAU); g.fill();
      if (idx === 15) { g.fillStyle = '#b4bd82'; g.beginPath(); g.moveTo(15, 14); g.lineTo(27, 10); g.lineTo(32, 22); g.lineTo(23, 29); g.lineTo(18, 42); g.lineTo(12, 26); g.fill(); }
      else { for (let i = 0; i < 3; i++) { g.strokeStyle = ['#d89956', '#edbb6b', '#f5df9e'][i]; g.lineWidth = 4; g.beginPath(); g.arc(28, 28, 14 - i * 4, -.6, 2.4); g.stroke(); } }
      g.strokeStyle = '#e6d3a3'; g.lineWidth = 3; g.beginPath(); g.ellipse(28, 28, 26, 9, -.5, 0, TAU); g.stroke();
    } else if (idx === 17) {
      g.fillStyle = '#b9b4aa'; g.beginPath(); g.arc(28, 30, 20, 0, TAU); g.fill();
      for (const [xx, yy, r] of [[18, 37, 5], [34, 42, 3], [14, 25, 3]]) { g.fillStyle = '#8c8990'; g.beginPath(); g.arc(xx, yy, r, 0, TAU); g.fill(); }
      box(25, 13, 17, 15, '#eadcba'); box(29, 18, 9, 6, '#6c8d9a'); g.strokeStyle = '#d5b779'; g.beginPath(); g.moveTo(38, 13); g.lineTo(38, 4); g.lineTo(47, 7); g.stroke();
    } else if (idx === 18) {
      satellite(g, 28, 28, 45, -.4, 'station');
    } else if (idx === 19) {
      g.fillStyle = '#ad8e7b'; g.beginPath(); g.arc(24, 29, 18, .7, TAU - .7); g.lineTo(24, 29); g.fill();
      for (let k = 0; k < 4; k++) box(35 + k * 4, 18 + k * 7, 4, 4, '#cfb891', 1);
      g.strokeStyle = '#e3d3b3'; g.lineWidth = 3; g.beginPath(); g.moveTo(36, 7); g.lineTo(26, 20); g.lineTo(33, 21); g.stroke();
    } else if (idx === 20) {
      g.fillStyle = '#edbd65'; g.beginPath(); g.arc(28, 28, 13, 0, TAU); g.fill();
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; g.save(); g.translate(28 + Math.cos(a) * 22, 28 + Math.sin(a) * 22); g.rotate(a); box(-4, -6, 8, 12, '#718ba3', 1); g.restore(); }
    } else if (idx === 21) {
      g.strokeStyle = '#c38265'; g.lineWidth = 6; g.beginPath(); g.ellipse(28, 28, 24, 9, -.3, 0, TAU); g.stroke();
      g.fillStyle = '#100f1a'; g.beginPath(); g.arc(28, 28, 13, 0, TAU); g.fill(); g.strokeStyle = '#efcf98'; g.lineWidth = 2; g.beginPath(); g.arc(28, 28, 14, Math.PI, TAU); g.stroke();
    } else if (idx === 22) {
      g.strokeStyle = '#b4a4cf'; g.lineWidth = 3;
      for (let arm = 0; arm < 3; arm++) { g.beginPath(); for (let i = 0; i < 36; i++) { const a = arm / 3 * TAU + i * .12, r = i * .65; const xx = 28 + Math.cos(a) * r, yy = 28 + Math.sin(a) * r * .65; if (!i) g.moveTo(xx, yy); else g.lineTo(xx, yy); } g.stroke(); }
      g.fillStyle = '#f0d6a0'; g.beginPath(); g.arc(28, 28, 4, 0, TAU); g.fill();
    } else {
      wheel(28, 28, 23); hamster(g, 26, 43, 33, 0, { fur: FURS.golden, halo: true, noShadow: true });
    }
  } else if (key === 'pep:seeds') {
    box(9, 8, 38, 43, '#c6a16b', 6); box(10, 5, 36, 7, '#dfc18c', 2);
    g.strokeStyle = '#8d6949'; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(13, 9); g.lineTo(43, 9); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#f0dbab'; g.fillRect(13, 20, 30, 22);
    g.fillStyle = '#9d702f'; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.ellipse(28 + Math.cos(a) * 7, 29 + Math.sin(a) * 7, 4, 2, a, 0, TAU); g.fill(); }
    g.fillStyle = '#584331'; g.beginPath(); g.arc(28, 29, 4, 0, TAU); g.fill();
  } else if (key === 'pep:bpc') {
    box(11, 21, 32, 29, '#c4a25d', 5); box(16, 15, 16, 7, '#dbccac', 2);
    g.strokeStyle = '#c4a25d'; g.lineWidth = 5; g.beginPath(); g.moveTo(41, 28); g.lineTo(48, 20); g.lineTo(50, 9); g.stroke();
    g.strokeStyle = '#d7c494'; g.lineWidth = 3; g.beginPath(); g.arc(10, 31, 8, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.fillStyle = '#f1e0b5'; g.fillRect(15, 29, 24, 12); g.fillStyle = '#70513a'; g.font = `900 8px ${FONT}`; g.textAlign = 'center'; g.fillText('JUICE', 27, 38);
  } else if (key === 'pep:pre') {
    box(15, 5, 27, 47, '#b6888f', 6); box(17, 5, 23, 5, '#d9d0bd');
    g.fillStyle = '#f0d496'; g.beginPath(); g.moveTo(32, 14); g.lineTo(22, 31); g.lineTo(30, 30); g.lineTo(23, 44); g.lineTo(38, 25); g.lineTo(29, 26); g.fill();
  } else if (key === 'pep:ozem') {
    box(10, 7, 36, 44, '#d1b980'); box(14, 20, 28, 23, '#f0dfb5');
    g.fillStyle = '#675548'; g.font = `900 13px ${FONT}`; g.textAlign = 'center'; g.fillText('−25%', 28, 36);
    g.strokeStyle = '#7c6d5c'; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(12, 14); g.lineTo(44, 14); g.stroke(); g.setLineDash([]);
  } else if (key === 'pep:mk' || key === 'pep:tren') {
    box(10, 14, 36, 37, key === 'pep:mk' ? '#7c97a0' : '#a16c67', 6); box(9, 7, 38, 10, '#c5b59b');
    box(14, 24, 28, 18, '#e9d7af'); g.fillStyle = '#745149'; g.font = `900 13px ${FONT}`; g.textAlign = 'center'; g.fillText(key === 'pep:mk' ? 'XL' : '!!!', 28, 38);
  } else if (key === 'pep:stack') {
    box(4, 30, 48, 22, '#b2885c'); for (let i = 0; i < 3; i++) { box(8 + i * 15, 11 - i * 3, 11, 30, ['#8da994', '#c69b7b', '#9c8eae'][i]); box(9 + i * 15, 7 - i * 3, 9, 7, '#d0c7b5'); }
    box(17, 37, 23, 10, '#e6d3ad');
  } else if (kind === 'pep' || key === 'tab:market') {
    // Brown-glass stock bottle, crooked paper label and a tamper seal (already broken).
    box(19, 4, 19, 9, '#b8b0a6'); box(14, 14, 29, 38, ['tb', 'mk', 'bpc'].includes(value) ? '#557d73' : '#86552d', 7);
    g.fillStyle = '#d4ab57'; rr(g, 18, 29, 21, 19, 4); g.fill();
    g.fillStyle = '#f4e4ba'; g.save(); g.translate(28, 31); g.rotate(-.1); g.fillRect(-15, -8, 30, 18);
    g.fillStyle = '#54403b'; g.font = `900 8px ${FONT}`; g.textAlign = 'center'; g.fillText(value === 'tb' ? 'OT' : 'LOT ?' , 0, 0); g.fillRect(-9, 4, 18, 1); g.restore();
    g.fillStyle = '#ffe5a6'; g.globalAlpha = .4; rr(g, 17, 17, 3, 10, 1); g.fill(); g.globalAlpha = 1;
    g.fillStyle = '#d3887c'; g.fillRect(26, 5, 4, 14);
  } else if (kind === 'vibe' && ['shades', 'bighead', 'halo', 'fried'].includes(value)) {
    hamster(g, 25, 46, 42, 0, { noShadow: true, fur: value === 'fried' ? FURS.rage : FURS.gerald, shades: value === 'shades', bigHead: value === 'bighead', halo: value === 'halo' });
  } else if (kind === 'vibe' && ['rgb', 'disco', 'hypno'].includes(value)) {
    if (value === 'disco') {
      g.strokeStyle = '#c9bdad'; g.lineWidth = 2; g.beginPath(); g.moveTo(28, 2); g.lineTo(28, 12); g.stroke();
      g.save(); g.beginPath(); g.arc(28, 31, 20, 0, TAU); g.clip();
      for (let i = 0; i < 49; i++) { g.fillStyle = ['#b1bec9', '#dac4cc', '#ebe2c6', '#8d839d'][i % 4]; g.fillRect(7 + i % 7 * 6, 10 + Math.floor(i / 7) * 6, 5, 5); } g.restore();
    } else {
      for (let i = 0; i < 4; i++) { g.strokeStyle = value === 'rgb' ? ['#bd8296', '#cbb77b', '#8fb5a0', '#91a5c7'][i] : i % 2 ? '#d9c6e4' : '#827196'; g.lineWidth = 4; g.beginPath(); g.arc(28, 28, 22 - i * 5, i * .7, TAU - .2 + i * .7); g.stroke(); }
    }
  } else if (kind === 'vibe' && ['confetti', 'lasers', 'tesla', 'shake'].includes(value)) {
    box(16, 31, 25, 18, '#9d8ba7');
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = ['#c69b80', '#b9a2cf', '#95bfad'][i % 3]; g.lineWidth = 2; g.beginPath(); g.moveTo(28, 31); g.lineTo(8 + i * 10, 8 + i % 2 * 10); g.stroke();
      if (value === 'confetti') { g.fillStyle = g.strokeStyle; g.fillRect(5 + i * 10, 5 + i % 2 * 10, 5, 4); }
    }
  } else if (key === 'vibe:comic') {
    box(7, 8, 42, 40, '#e4d4b0'); g.fillStyle = '#725a76'; g.font = 'bold 27px "Comic Sans MS", cursive'; g.textAlign = 'center'; g.fillText('Aa', 28, 36);
  } else if (kind === 'vibe' || key === 'tab:vibes') {
    box(8, 18, 40, 28, '#bba0c8', 7); box(12, 23, 32, 18, '#30243f');
    g.strokeStyle = '#e7be6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(28, 18); g.lineTo(19, 7); g.moveTo(28, 18); g.lineTo(38, 5); g.stroke();
    g.fillStyle = '#e4d3b2'; g.beginPath(); g.arc(21, 31, 4, 0, TAU); g.arc(35, 31, 4, 0, TAU); g.fill();
  } else if (kind === 'mono') {
    box(8, 5, 40, 46, '#d2bd91'); for (let i = 0; i < 5; i++) { g.strokeStyle = '#a58e71'; g.beginPath(); g.moveTo(14 + i * 7, 7); g.lineTo(14 + i * 7, 49); g.stroke(); }
    box(16, 20, 25, 15, '#eee1bf'); g.fillStyle = '#76644f'; g.font = `800 8px ${FONT}`; g.textAlign = 'center'; g.fillText('BEIGE', 28, 30);
  } else if (kind === 'leg') {
    box(19, 5, 14, 28, '#d0b8db', 5); box(13, 32, 33, 16, '#e4b563', 5); g.fillStyle = '#f4e3bc'; g.fillRect(14, 44, 32, 4); g.strokeStyle = '#5a475d'; g.lineWidth = 2; g.beginPath(); g.moveTo(29, 34); g.lineTo(35, 38); g.moveTo(24, 35); g.lineTo(30, 39); g.stroke();
  } else if (kind === 'rebirth' || key === 'tab:rebirth') {
    wheel(28, 28, 20); g.fillStyle = '#c79b50'; g.beginPath(); g.ellipse(28, 28, 7, 13, .4, 0, TAU); g.fill();
  } else {
    box(10, 8, 36, 42, '#b78b60'); box(14, 13, 28, 32, '#f0dfb9'); box(21, 5, 14, 9, '#b3a7b8');
    g.strokeStyle = '#726173'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(20, 23 + i * 7); g.lineTo(36, 23 + i * 7); g.stroke(); }
  }
  g.restore();
}

export function placard(g: G, x: number, y: number, w: number, title: string, sub: string, angle = -.035) {
  g.save(); g.translate(x, y); g.rotate(angle);
  g.fillStyle = 'rgba(24,16,18,.25)'; rr(g, -w / 2 + 3, -21 + 4, w, 48, 3); g.fill();
  g.fillStyle = '#e8d6a7'; rr(g, -w / 2, -21, w, 48, 3); g.fill();
  g.strokeStyle = '#927451'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#75513f'; for (const xx of [-w / 2 + 6, w / 2 - 6]) { g.beginPath(); g.arc(xx, -15, 1.7, 0, TAU); g.fill(); }
  g.textAlign = 'center'; g.fillStyle = '#65413c'; g.font = `900 12px ${FONT}`; g.fillText(title, 0, -1);
  g.font = `600 10px ${FONT}`; g.fillText(sub, 0, 15); g.restore();
}
