// Dynamo Defense chrome: riveted gunmetal plates, brass trim and warm lamp light, to sit with the painted outpost,
// crates and pipework. One palette for the DOM panels (CSS custom properties) and the canvas workshop.

export const TD = {
  plateHi: '#2b251d', plate: '#1d1914', plateLo: '#120f0c', well: '#0b0907',
  edge: '#6e5130', edgeDim: '#43321f', brass: '#e8b24a', brassHi: '#ffdb8e', brassLo: '#9a6a28', copper: '#c8743c',
  text: '#f2e7d0', dim: '#b9a685', mute: '#7d6e58', ink: '#140f08',
  hp: '#9ccf45', hpHi: '#cdf27a', bad: '#ff5a3a',
  blue: '#5cc8ff', red: '#ff6a3d', purple: '#cf7dff', yellow: '#f6ea62',
} as const;

/** Each tower's colour in the workshop: its brood colour, and hazard yellow for the neutral Mortar. */
export const TOWER_TINT = { tesla: TD.blue, flamer: TD.red, lens: TD.purple, mortar: TD.yellow } as const;

/** Custom properties on `.td-hud`; the CSS below only refers to these. */
export const THEME_VARS = Object.entries(TD).map(([k, v]) => `--td-${k}:${v};`).join('');

const rivet = (x: string, y: string) => `radial-gradient(circle at ${x} ${y}, ${TD.brassHi} 0 1px, ${TD.brassLo} 1.8px, #000a 2.6px, transparent 3.2px)`;
/** Four corner rivets, layered over any plate background. */
export const RIVETS = [rivet('8px', '8px'), rivet('calc(100% - 8px)', '8px'), rivet('8px', 'calc(100% - 8px)'), rivet('calc(100% - 8px)', 'calc(100% - 8px)')].join(',');
/** A brushed gunmetal plate. */
export const PLATE = `repeating-linear-gradient(90deg, #ffffff05 0 1px, transparent 1px 3px), linear-gradient(180deg, ${TD.plateHi}f2, ${TD.plate}f0 40%, ${TD.plateLo}f2)`;

export const THEME_CSS = `
.td-hud { ${THEME_VARS} --fg:var(--td-text); --dim:var(--td-dim); color:var(--td-text); }
.td-hud .panel, .td-hud .td-loading-card { background:${RIVETS}, ${PLATE}; border:1px solid var(--td-edge); border-radius:6px;
  box-shadow:inset 0 1px 0 #ffdca01f, inset 0 0 0 3px #0006, inset 0 0 0 4px #c99a4e22, 0 10px 26px #000a; -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); }
.td-hud small { color:var(--td-dim); }
.td-hud .bar { height:7px; border-radius:2px; background:var(--td-well); border:1px solid #000; box-shadow:inset 0 1px 3px #000, 0 1px 0 #ffdca014; }
.td-hud .bar > i { background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 45%, var(--td-brassLo)); box-shadow:0 0 6px #e8b24a66; }
.td-hud .td-hp .bar > i { background:linear-gradient(180deg, var(--td-hpHi), var(--td-hp) 50%, #5f8a22); box-shadow:0 0 6px #9ccf4566; }
.td-hud .td-hp.low .bar > i { background:repeating-linear-gradient(135deg, var(--td-bad) 0 6px, #a3241a 6px 12px); box-shadow:0 0 8px #ff5a3a99; }
.td-hud .td-stat b { color:var(--td-text); font-style:normal; letter-spacing:.02em; text-shadow:0 2px 0 #000; }
.td-hud .td-scrap, .td-hud .td-scrap b { color:var(--td-brass); }
.td-hud .td-current { box-shadow:inset 4px 0 0 var(--brood), inset 0 1px 0 #ffdca01f, inset 0 0 0 3px #0006, 0 10px 26px #000a; }
.td-hud .td-current b, .td-hud .td-count { font-style:normal; letter-spacing:.03em; text-shadow:0 0 12px color-mix(in srgb, var(--brood) 45%, transparent), 0 2px 0 #000; }
.td-hud .td-event b { color:var(--td-brass); font-style:normal; letter-spacing:.05em; text-shadow:0 2px 0 #000, 0 0 18px #e8b24a55; -webkit-text-stroke:1px #0008; }
.td-hud .td-event span { color:var(--td-text); text-shadow:0 1px 3px #000; }
.td-hud .td-objective h3 { color:var(--td-brass); font-style:normal; letter-spacing:.04em; text-shadow:0 2px 0 #000; }
.td-hud .td-crew { border-top:1px solid var(--td-edgeDim); box-shadow:0 -1px 0 #ffdca00d; }
.td-hud .td-menu h2, .td-hud .td-loading-card h2 { font-style:normal; text-transform:uppercase; letter-spacing:.06em;
  background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 55%, var(--td-copper)); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 2px 0 #000); }
.td-hud .td-menu header { padding-bottom:6px; border-bottom:1px solid var(--td-edgeDim); box-shadow:0 1px 0 #ffdca00d; }
.td-hud .td-menu header > b { color:var(--td-brass); font-size:18px; text-shadow:0 0 10px #e8b24a66; }
.td-hud .td-menu p { color:var(--td-dim); }
.td-hud .td-menu > small { color:var(--td-mute); }
.td-hud .td-menu .btn, .td-hud .td-tile { background:linear-gradient(180deg, #ffffff08, transparent 40%), var(--td-plateLo); border:1px solid var(--td-edgeDim); border-radius:5px;
  box-shadow:inset 0 1px 0 #ffdca012, 0 2px 0 #000; -webkit-backdrop-filter:none; backdrop-filter:none; color:var(--td-text); }
.td-hud .td-menu .btn small { color:var(--td-dim); }
.td-hud .td-menu .btn:not(:disabled):hover { border-color:var(--td-edge); }
.td-hud .td-menu .btn.selected, .td-hud .td-tile.selected { border-color:var(--td-brass); background:linear-gradient(180deg, #e8b24a1f, transparent 55%), var(--td-plate);
  box-shadow:0 0 0 1px var(--td-brass), 0 0 16px #e8b24a55, inset 0 1px 0 #ffdb8e33; }
.td-hud .td-menu .btn.selected > span { color:var(--td-brassHi); }
.td-hud .td-menu .btn.selected small { color:var(--td-text); }
.td-hud .td-map { border-radius:3px; box-shadow:inset 0 0 0 1px #000; outline:1px solid #ffdca01a; outline-offset:-1px; }
.td-hud .td-card-art { background:${PLATE}; color:var(--td-mute); border-radius:3px; }
.td-hud .td-endless { color:var(--td-purple); } .td-hud .td-quick { color:var(--td-brass); }
.td-hud .td-preview h3 { color:var(--td-brass); text-transform:uppercase; letter-spacing:.05em; }
.td-hud .td-ground > span { color:var(--td-brass); opacity:.8; }
.td-hud .td-tile b { color:var(--td-text); }
.td-hud .td-tile i { color:var(--td-brass); }
.td-hud .td-tile.next:not(.selected) { border-color:var(--td-copper); box-shadow:0 0 0 1px #c8743c88, 0 2px 0 #000; }
.td-hud .td-tile.locked i { color:var(--td-mute); }
.td-hud .td-step, .td-hud .td-reroll { border:1px solid #000; color:var(--td-ink); background:radial-gradient(circle at 35% 30%, var(--td-brassHi), var(--td-brass) 45%, var(--td-brassLo));
  box-shadow:inset 0 1px 0 #fff6, inset 0 -2px 0 #0005, 0 2px 6px #000c; text-shadow:0 1px 0 #ffe9b8; -webkit-backdrop-filter:none; backdrop-filter:none; }
.td-hud .td-reroll { border-radius:4px; background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 50%, var(--td-brassLo)); }
.td-hud .td-step:active, .td-hud .td-reroll:active { background:var(--td-brassHi); color:var(--td-ink); }
.td-hud .td-loading-art { border-radius:4px; box-shadow:0 10px 30px #000a, inset 0 0 0 1px var(--td-edge); }
.td-hud .td-loading-art::after { background:linear-gradient(115deg, transparent 35%, #ffd98a2e 50%, transparent 65%) 0 0 / 300% 100%; }
.td-hud .td-loading-card small { color:var(--td-brass); letter-spacing:.12em; }
.td-hud .td-loading-bar { height:10px; border-radius:2px; background:var(--td-well); border:1px solid #000; box-shadow:inset 0 1px 3px #000; }
.td-hud .td-loading-bar > i { border-radius:1px; background:repeating-linear-gradient(135deg, #ffffff22 0 6px, transparent 6px 12px), linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 50%, var(--td-brassLo)); box-shadow:0 0 12px #e8b24a88; }
.td-hud .td-loading-status b { color:var(--td-text); }
`;
