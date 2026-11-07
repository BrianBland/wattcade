import { writeFileSync } from 'node:fs';
import { makeRoad, score, type Design, type P } from './lib.ts';
import { PAD_R, TURRET_R, FIELD_W, FIELD_H } from '../../src/games/towerdefense/sim/road';
const K = 6, OX = 3, OY = 14;
const X = (x: number) => +((x + OX) * K).toFixed(1), Y = (y: number) => +((y + OY) * K).toFixed(1);
const poly = (pts: P[]) => pts.map(p => `${X(p.x)},${Y(p.y)}`).join(' ');
/** One mock as an SVG panel: road (bridges drawn over), pads with Flamer reach, turret, Glider lines, metrics. */
export function panel(d: Design, pads: P[], note = '') {
  const R = makeRoad(d), s = score(d, R, pads);
  const W = (FIELD_W + 2 * OX) * K, H = (FIELD_H + OY + 3) * K;
  const vis = R.line.filter(p => p.y >= -14);
  const road = (pts: P[], extra = '') => `<polyline points="${poly(pts)}" fill="none" stroke="#3b3328" stroke-width="${(d.hw + d.shoulder) * 2 * K}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>
<polyline points="${poly(pts)}" fill="none" stroke="#a5835a" stroke-width="${d.hw * 2 * K}" stroke-linecap="round" stroke-linejoin="round"/>`;
  // bridge decks: the first pass over each crossing, redrawn on top with a shadow and rails
  const decks = (d.bridges ?? []).map(b => {
    const near = (p: P) => Math.hypot(p.x - b.x, p.y - b.y) < 2;
    const idx = d.over === 'last' ? R.line.findLastIndex(near) : R.line.findIndex(near);
    if (idx < 0) return '';
    let a = idx, z = idx;
    while (a > 0 && Math.hypot(R.line[a].x - b.x, R.line[a].y - b.y) < d.hw * 3.2) a--;
    while (z < R.line.length - 1 && Math.hypot(R.line[z].x - b.x, R.line[z].y - b.y) < d.hw * 3.2) z++;
    const seg = R.line.slice(a, z + 1);
    return `<polyline points="${poly(seg)}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="${(d.hw + 2.2) * 2 * K}" transform="translate(5,7)"/>
<polyline points="${poly(seg)}" fill="none" stroke="#6b5a48" stroke-width="${(d.hw + 1.4) * 2 * K}"/>
<polyline points="${poly(seg)}" fill="none" stroke="#c9a77a" stroke-width="${d.hw * 2 * K}"/>
<polyline points="${poly(seg)}" fill="none" stroke="#2a2018" stroke-width="2" stroke-dasharray="3 7"/>
${under(b, seg)}`;
  }).join('\n');
  // the pass under the deck, drawn as an x-ray outline so its traffic stays readable
  function under(b: P, deck: P[]) {
    const pts = R.line.filter(p => Math.hypot(p.x - b.x, p.y - b.y) < d.hw * 3.2 && !deck.includes(p));
    return pts.length ? `<polyline points="${poly(pts)}" fill="none" stroke="#7dffb0" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="5 4"/>` : '';
  }
  const flyers = d.flyers.map(f => `<line x1="${X(f.x)}" y1="${Y(f.y)}" x2="${X(d.turret.x)}" y2="${Y(d.turret.y)}" stroke="#9bdcff" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="6 6"/>`).join('');
  const padSvg = pads.map((p, i) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${15 * K}" fill="#ff7a3a" fill-opacity="0.05" stroke="#ff7a3a" stroke-opacity="0.4" stroke-width="1.2"/>
<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${PAD_R * K}" fill="#5e4a33" stroke="#7dffb0" stroke-width="2.5"/>`).join('\n');
  const lines = [
    `${d.name}${note ? ' · ' + note : ''}`,
    `road ${(d.hw * 2).toFixed(0)} wide · turret r ${d.tr ?? TURRET_R} · length ${s.length} · self-clear ${s.selfClear}`,
    `Flamer reach ${(s.flame * 100).toFixed(0)}% · gap ${s.gap} · two-pass pads ${s.twoPass}/${pads.length}`,
    `near turret at ${(s.closeAt * 100).toFixed(0)}% of the walk · ${(s.closeShare * 100).toFixed(0)}% of road within 35`,
  ];
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 110}"><rect width="100%" height="100%" fill="#181c24"/>
<rect x="${X(0)}" y="${Y(0)}" width="${FIELD_W * K}" height="${FIELD_H * K}" fill="#232833" stroke="#3a4150"/>
${road(vis)}
${decks}
${flyers}
<circle cx="${X(d.turret.x)}" cy="${Y(d.turret.y)}" r="${35 * K}" fill="none" stroke="#ffd24a" stroke-opacity="0.35" stroke-dasharray="7 6" stroke-width="1.5"/>
<circle cx="${X(d.turret.x)}" cy="${Y(d.turret.y)}" r="${(d.tr ?? TURRET_R) * K}" fill="#8a6d2a" stroke="#ffd24a" stroke-width="3"/>
${padSvg}
${lines.map((l, i) => `<text x="10" y="${H + 24 + i * 24}" font-size="${i ? 15 : 18}" font-family="sans-serif" fill="${i ? '#cfe3ff' : '#fff'}">${l.replace(/&/g, '&amp;')}</text>`).join('\n')}</svg>`, score: s };
}
export function sheet(file: string, panels: string[]) {
  panels.forEach((svg, i) => writeFileSync(`${file}-${i}.svg`, svg));
}
