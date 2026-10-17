// Single-road layout sketches for Dynamo Defense. Plain vectors over the real status rows and the
// measured shell HUD band, in whatever viewport the page has. ?v=A|B|C picks a variant; ?hud=px overrides.
// ?side=0 keeps landscape status rows on top; ?flame=cone|range|lob; ?lock=1 shows a paddle-stepped target lock.
type P = { x: number; y: number };
interface Variant { name: string; note: string; road: P[]; pads: P[]; flyers: P[]; smooth?: boolean }

/** World units: x across the field, y from the spawn edge (0) to behind the turret (H). */
const W = 80, H = 112;
const TURRET: P = { x: 40, y: 101 }, TURRET_R = 11;
const ROAD_HW = 5.5, SHOULDER = 1.25, PAD_R = 4.2, FILLET = 9;
const FLAME = { range: 45, half: 0.3 };
const TESLA = 24, MORTAR = 36;
const SPEED = { Skitter: 4.6, Ram: 2.8, Glider: 8.5 };

const VARIANTS: Record<string, Variant> = {
  D: {
    name: 'D · Organic serpentine', note: 'Three uneven crossings on a spline; pockets of different sizes give pads different jobs.', smooth: true,
    road: [{ x: 66, y: -10 }, { x: 63, y: 2 }, { x: 44, y: 9 }, { x: 22, y: 5 }, { x: 9, y: 17 }, { x: 16, y: 32 }, { x: 40, y: 36 }, { x: 62, y: 38 }, { x: 72, y: 50 }, { x: 62, y: 62 }, { x: 38, y: 60 }, { x: 18, y: 64 }, { x: 12, y: 78 }, { x: 24, y: 88 }, TURRET],
    pads: [{ x: 32, y: 21 }, { x: 66, y: 20 }, { x: 54, y: 50 }, { x: 7, y: 48 }, { x: 32, y: 76 }, { x: 56, y: 79 }, { x: 30, y: 48 }, { x: 10, y: 97 }],
    flyers: [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }],
  },
  A: {
    name: 'A · Serpentine', note: 'Three full-width legs. Longest road; every gap holds a row of pads.',
    road: [{ x: 70, y: -8 }, { x: 70, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 34 }, { x: 70, y: 34 }, { x: 70, y: 60 }, { x: 10, y: 60 }, { x: 10, y: 86 }, { x: TURRET.x, y: 86 }, TURRET],
    pads: [{ x: 26, y: 21 }, { x: 54, y: 21 }, { x: 26, y: 47 }, { x: 54, y: 47 }, { x: 27, y: 73 }, { x: 62, y: 76 }, { x: 64, y: 96 }, { x: 16, y: 99 }],
    flyers: [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }],
  },
  B: {
    name: 'B · Zigzag', note: 'Diagonal legs make wedge pockets; a pad in a wedge covers both legs.',
    road: [{ x: 72, y: -8 }, { x: 72, y: 6 }, { x: 9, y: 28 }, { x: 71, y: 52 }, { x: 9, y: 74 }, { x: TURRET.x, y: 88 }, TURRET],
    pads: [{ x: 14, y: 8 }, { x: 62, y: 30 }, { x: 16, y: 51 }, { x: 66, y: 72 }, { x: 46, y: 28.6 }, { x: 34, y: 51.4 }, { x: 18, y: 92 }, { x: 64, y: 95 }],
    flyers: [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }],
  },
  C: {
    name: 'C · Switchback + final straight', note: 'Two legs, then a long head-on run the flamer can rake end to end.',
    road: [{ x: 10, y: -8 }, { x: 10, y: 12 }, { x: 70, y: 12 }, { x: 70, y: 40 }, { x: 10, y: 40 }, { x: 10, y: 60 }, { x: TURRET.x, y: 60 }, TURRET],
    pads: [{ x: 28, y: 26 }, { x: 54, y: 26 }, { x: 25, y: 74 }, { x: 55, y: 74 }, { x: 24, y: 92 }, { x: 56, y: 92 }, { x: 56, y: 57 }, { x: 72, y: 74 }],
    flyers: [{ x: 6, y: -6 }, { x: 40, y: -6 }, { x: 74, y: -6 }],
  },
};

/** Centripetal Catmull-Rom through every waypoint, sampled about every half unit. */
function splineLine(pts: P[]): P[] {
  const out: P[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const d = (a: P, b: P) => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 2));
    for (let j = 1; j <= n; j++) {
      const t = t1 + (t2 - t1) * j / n;
      const L = (a: P, b: P, ta: number, tb: number) => ({ x: ((tb - t) * a.x + (t - ta) * b.x) / (tb - ta), y: ((tb - t) * a.y + (t - ta) * b.y) / (tb - ta) });
      const a1 = L(p0, p1, t0, t1), a2 = L(p1, p2, t1, t2), a3 = L(p2, p3, t2, t3);
      const b1 = L(a1, a2, t0, t2), b2 = L(a2, a3, t1, t3);
      out.push(L(b1, b2, t1, t2));
    }
  }
  return out;
}
/** Waypoints with quadratic fillets at each interior corner, sampled about every half unit. */
function roadLine(pts: P[]): P[] {
  const out: P[] = [pts[0]];
  const lerp = (a: P, b: P, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const line = (a: P, b: P) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2)); for (let i = 1; i <= n; i++) out.push(lerp(a, b, i / n)); };
  let from = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const r = Math.min(FILLET, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const p0 = lerp(b, a, r / Math.hypot(b.x - a.x, b.y - a.y)), p2 = lerp(b, c, r / Math.hypot(c.x - b.x, c.y - b.y));
    line(from, p0);
    for (let j = 1; j <= 16; j++) { const t = j / 16; out.push(lerp(lerp(p0, b, t), lerp(b, p2, t), t)); }
    from = p2;
  }
  line(from, pts[pts.length - 1]);
  return out;
}
const length = (l: P[]) => l.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - l[i].x, p.y - l[i].y), 0);
/** Distance along the road, ending where it enters the turret deck. */
function walked(l: P[]) { let s = 0; for (let i = 1; i < l.length; i++) { if (Math.hypot(l[i].x - TURRET.x, l[i].y - TURRET.y) < TURRET_R) break; s += Math.hypot(l[i].x - l[i - 1].x, l[i].y - l[i - 1].y); } return s; }
const nearest = (l: P[], p: P) => Math.min(...l.map(q => Math.hypot(q.x - p.x, q.y - p.y)));
/** Road length inside a ring, a rough measure of how much of the road a pad covers. */
const covered = (l: P[], p: P, r: number) => l.slice(1).reduce((s, q, i) => s + (Math.hypot(q.x - p.x, q.y - p.y) < r && q.y > -2 && Math.hypot(q.x - TURRET.x, q.y - TURRET.y) > TURRET_R ? Math.hypot(q.x - l[i].x, q.y - l[i].y) : 0), 0);

const q = new URLSearchParams(location.search);
const v = VARIANTS[q.get('v') ?? 'A'] ?? VARIANTS.A;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const dpr = Math.min(2, devicePixelRatio || 1);

function draw() {
  const SW = innerWidth, SH = innerHeight;
  canvas.width = SW * dpr; canvas.height = SH * dpr;
  const g = canvas.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Status rows and HUD band as measured on dev/towerdefense.html (legend off is the taller HUD).
  const pad = 12, statusH = 64, currentH = SW < 560 ? 88 : 60;
  const top = pad + statusH + pad + currentH + pad;
  const hud = Number(q.get('hud') ?? (SW > SH ? 168 : 188)), UH = SH - hud;
  const turned = SW > SH;
  // Landscape can stack the status rows in a column behind the turret, so the field gets the full height and
  // the spawn edge stays clear on the right.
  const side = turned && q.get('side') !== '0', sideW = 260;
  const area = side ? { x: 2 * pad + sideW, y: pad, w: SW - 3 * pad - sideW, h: UH - 2 * pad } : { x: pad, y: top, w: SW - 2 * pad, h: UH - pad - top };
  // One uniform scale. Landscape turns the field so the spawn edge is on the right and the turret on the left.
  const k = turned ? Math.min(area.h / W, area.w / H) : Math.min(area.w / W, area.h / H);
  const fw = (turned ? H : W) * k, fh = (turned ? W : H) * k;
  const ox = turned ? (side ? SW - pad - H * k : area.x) : area.x + (area.w - fw) / 2, oy = turned ? area.y + (area.h - fh) / 2 : area.y + area.h - fh;
  const S = (p: P) => turned ? { x: ox + (H - p.y) * k, y: oy + p.x * k } : { x: ox + p.x * k, y: oy + p.y * k };

  // Bleed (painting margin) and the gameplay rectangle.
  g.fillStyle = '#141820'; g.fillRect(0, 0, SW, SH);
  g.fillStyle = '#1f2630'; g.fillRect(ox, oy, fw, fh);
  g.strokeStyle = '#3b4656'; g.setLineDash([6, 4]); g.lineWidth = 1; g.strokeRect(ox, oy, fw, fh); g.setLineDash([]);
  const hive = turned ? g.createLinearGradient(ox + fw, 0, ox + fw * 0.55, 0) : g.createLinearGradient(0, oy, 0, oy + fh * 0.45);
  hive.addColorStop(0, 'rgba(110,50,160,0.35)'); hive.addColorStop(1, 'rgba(110,50,160,0)');
  g.fillStyle = hive; g.fillRect(ox, oy, fw, fh);

  const line = v.smooth ? splineLine(v.road) : roadLine(v.road);
  const stroke = (pts: P[], width: number, color: string, dash: number[] = []) => {
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach((p, i) => { const s = S(p); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); g.stroke(); g.setLineDash([]);
  };
  // Clip the road to the screen field so the spawn run-in reads as coming from off the map.
  // Inside the field at full strength; the run-in through the bleed is faded (painting margin).
  for (const inside of [false, true]) {
    g.save(); g.beginPath(); g.rect(0, 0, SW, SH); g.rect(ox, oy, fw, fh); if (inside) { g.restore(); g.save(); g.beginPath(); g.rect(ox, oy, fw, fh); g.clip(); } else { g.clip('evenodd'); g.globalAlpha = 0.35; }
    stroke(line, (ROAD_HW + SHOULDER) * 2 * k, '#5a5040');
    stroke(line, ROAD_HW * 2 * k, '#b4946a');
    stroke(line, Math.max(1, 0.25 * k), 'rgba(60,40,20,0.5)', [2 * k, 2 * k]);
    g.restore();
  }
  // Direction ticks every 12 units.
  g.fillStyle = 'rgba(60,40,20,0.7)';
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
    if (acc < 12) continue; acc = 0;
    const a = S(line[i - 1]), b = S(line[i]), ang = Math.atan2(b.y - a.y, b.x - a.x), s = 1.6 * k;
    g.save(); g.translate(b.x, b.y); g.rotate(ang); g.beginPath(); g.moveTo(s, 0); g.lineTo(-s, -s); g.lineTo(-s, s); g.closePath(); g.fill(); g.restore();
  }

  // Flyers: straight to the turret.
  for (const f of v.flyers) {
    stroke([f, TURRET], Math.max(1.5, 0.35 * k), 'rgba(120,220,255,0.6)', [1.5 * k, 1.5 * k]);
    const s = S(f); g.fillStyle = '#7fdcff'; g.beginPath(); g.arc(s.x, s.y, 1.4 * k, 0, Math.PI * 2); g.fill();
  }

  // Flame cone, aimed back up the final run.
  const last = line.filter(p => Math.hypot(p.x - TURRET.x, p.y - TURRET.y) > TURRET_R + 4).pop()!;
  const aim = Math.atan2(last.x - TURRET.x, TURRET.y - last.y);
  const flame = q.get('flame') ?? 'cone';
  const wedge = (range: number, half: number, fill: string, edge: string) => {
    const cone: P[] = [TURRET]; for (let i = 0; i <= 12; i++) { const a = aim - half + (2 * half * i) / 12; cone.push({ x: TURRET.x + Math.sin(a) * range, y: TURRET.y - Math.cos(a) * range }); }
    g.fillStyle = fill; g.strokeStyle = edge; g.lineWidth = 1.5;
    g.beginPath(); cone.forEach((p, i) => { const s = S(p); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); g.closePath(); g.fill(); g.stroke();
  };
  const label = (text: string, p: P, color = '#ffd2a8') => { const s = S(p); g.fillStyle = color; g.font = `700 ${Math.max(11, 2.2 * k)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, s.x, s.y); };
  if (flame === 'range') {
    // The throttle sets the reach: a short wide fan when enemies are on the doorstep, a narrow jet at full reach.
    wedge(46, 0.13, 'rgba(255,120,40,0.14)', 'rgba(255,140,60,0.55)');
    wedge(30, 0.3, 'rgba(255,120,40,0.18)', 'rgba(255,140,60,0.55)');
    wedge(17, 0.75, 'rgba(255,120,40,0.24)', 'rgba(255,160,80,0.8)');
    label('wide · short', { x: TURRET.x + 14, y: TURRET.y - 21 }); label('jet · long', { x: TURRET.x + 9, y: TURRET.y - 48 });
  } else if (flame === 'lob') {
    // Fireballs arc over the pads and leave a burning strip on the road; flyers pass over it untouched.
    const at = (d: number) => { let s = 0; for (let i = 1; i < line.length; i++) { s += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y); if (s >= d) return { p: line[i], i }; } return { p: line[line.length - 1], i: line.length - 1 }; };
    for (const [d, r] of [[150, 1], [118, 0.8], [190, 0.6]] as const) {
      const { p: hit, i } = at(d);
      const burn = line.slice(Math.max(0, i - 14), i + 14);
      g.save(); g.globalAlpha = r; stroke(burn, ROAD_HW * 1.6 * k, 'rgba(255,90,30,0.55)'); g.restore();
      const a = S(TURRET), b = S(hit), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 18 * k };
      g.strokeStyle = 'rgba(255,170,90,0.8)'; g.setLineDash([1.2 * k, 1.2 * k]); g.lineWidth = Math.max(1.5, 0.3 * k);
      g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(mid.x, mid.y, b.x, b.y); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffb060'; g.beginPath(); g.arc(b.x, b.y, 1.4 * k, 0, Math.PI * 2); g.fill();
    }
    label('burning ground', { x: 40, y: 47 });
  } else wedge(FLAME.range, FLAME.half, 'rgba(255,120,40,0.22)', 'rgba(255,140,60,0.7)');

  if (q.get('lock') === '1') {
    // A column of enemies on the road; the paddles step the lock one enemy closer or further.
    const total = walked(line), spots = [0.25, 0.38, 0.5, 0.6, 0.72, 0.86].map(f => f * total);
    let acc2 = 0, j = 0; const marks: P[] = [];
    for (let i = 1; i < line.length && j < spots.length; i++) { acc2 += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y); if (acc2 >= spots[j]) { marks.push(line[i]); j++; } }
    marks.forEach((m, i) => {
      const s = S(m); g.fillStyle = i === 3 ? '#ff6a6a' : '#b06ad8'; g.beginPath(); g.arc(s.x, s.y, 1.8 * k, 0, Math.PI * 2); g.fill();
      if (i === 3) { g.strokeStyle = '#fff'; g.lineWidth = 2; for (let r = 0; r < 4; r++) { const a0 = r * Math.PI / 2 + 0.3; g.beginPath(); g.arc(s.x, s.y, 3.4 * k, a0, a0 + 0.9); g.stroke(); } }
    });
    label('◀ paddle: closer', { x: marks[4].x + 10, y: marks[4].y + 7 }, '#ffffff');
    label('paddle: further ▶', { x: marks[2].x + 2, y: marks[2].y + 8 }, '#ffffff');
  }

  // Pads: red when they crowd the road (same clearance rule as the three-lane pads).
  const need = ROAD_HW + SHOULDER + PAD_R + 1;
  v.pads.forEach((p, i) => {
    const s = S(p), ok = nearest(line, p) >= need && Math.hypot(p.x - TURRET.x, p.y - TURRET.y) >= TURRET_R + PAD_R + 2;
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.setLineDash([3, 3]); g.lineWidth = 1;
    g.beginPath(); g.arc(s.x, s.y, TESLA * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = ok ? '#2f6f5a' : '#8a2f2f'; g.strokeStyle = ok ? '#7fe0b8' : '#ff8080'; g.lineWidth = 2;
    g.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2 + Math.PI / 6; const x = s.x + Math.cos(a) * PAD_R * k, y = s.y + Math.sin(a) * PAD_R * k; j ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e8fff4'; g.font = `700 ${Math.max(10, 2.6 * k)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), s.x, s.y);
  });

  // Turret deck.
  const t = S(TURRET);
  g.fillStyle = '#6a5426'; g.strokeStyle = '#ffcf5a'; g.lineWidth = 3;
  g.beginPath(); g.arc(t.x, t.y, TURRET_R * k, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#ffe9a8'; g.font = `800 ${Math.max(11, 2.8 * k)}px system-ui`; g.textAlign = 'center'; g.fillText('TURRET', t.x, t.y);

  // Shell chrome on top.
  g.fillStyle = 'rgba(20,24,40,0.88)'; g.strokeStyle = '#4a5370'; g.lineWidth = 1;
  const sx = pad;
  const boxes = side
    ? [{ x: sx, y: pad, w: sideW, h: 118, t: ['WAVE 3 · 1:42 left', 'BASE 100 / 100', 'SCRAP 54'] }, { x: sx, y: pad * 2 + 118, w: sideW, h: 84, t: ['RED BROOD · FLAMER', 'Next: BLUE → Gatling'] }, { x: sx, y: pad * 3 + 202, w: sideW, h: UH - pad * 4 - 202, t: [] }]
    : [{ x: pad, y: pad, w: SW - 2 * pad, h: statusH, t: [] }, { x: pad, y: pad * 2 + statusH, w: SW - 2 * pad, h: currentH, t: [] }];
  for (const r of boxes) {
    g.fillRect(r.x, r.y, r.w, r.h); g.strokeRect(r.x, r.y, r.w, r.h);
    g.save(); g.fillStyle = '#e6ecff'; g.font = '800 16px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle';
    r.t.forEach((line, i) => g.fillText(line, r.x + 16, r.y + 26 + i * 32)); g.restore(); g.fillStyle = 'rgba(20,24,40,0.88)';
  }
  g.fillStyle = 'rgba(24,35,51,0.94)'; g.fillRect(0, UH, SW, hud); g.strokeStyle = '#5a6a88'; g.beginPath(); g.moveTo(0, UH); g.lineTo(SW, UH); g.stroke();
  g.fillStyle = '#a5bbcc'; g.font = '600 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`Shell HUD · ${hud}px`, SW / 2, UH + hud / 2);
  g.textAlign = 'left';
  const road = walked(line), fly = Math.hypot(v.flyers[1].x - TURRET.x, v.flyers[1].y - TURRET.y);
  const cover = v.pads.map(p => Math.round(covered(line, p, TESLA)));
  // Sketch notes: in the status rows, or in the spare bottom of the side column.
  const notes = [v.name, v.note,
    `road ${Math.round(road)} u · Skitter ${Math.round(road / SPEED.Skitter)} s · Ram ${Math.round(road / SPEED.Ram)} s`,
    `Glider flies ${Math.round(fly)} u (${Math.round(fly / SPEED.Glider)} s)`,
    `${k.toFixed(1)} px/unit · Tesla road per pad: ${cover.join('/')} u`];
  const nx = side ? sx + 16 : pad * 2, ny = side ? pad * 3 + 202 + 26 : pad + 22, gap = side ? 22 : 0;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  notes.forEach((n, i) => {
    g.fillStyle = i ? '#b8c4dc' : '#e6ecff'; g.font = i ? '500 12px system-ui' : '800 16px system-ui';
    if (side) { g.fillText(n, nx, ny + i * gap, sideW - 28); return; }
    if (i === 3) return;
    const pos = [[pad + 22], [pad + 46], [pad * 2 + statusH + 20], [pad * 2 + statusH + 20], [pad * 2 + statusH + 40]][i][0];
    g.fillText(i === 2 ? `${n} · ${notes[3]}` : n, nx, pos);
  });
}
addEventListener('resize', draw); draw();
export {};
