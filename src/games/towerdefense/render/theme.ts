// Dynamo Defense chrome: bevelled tread-plate panels, hex bolts, riveted straps, brass nameplates and lamp-lit keys, to sit with the painted outpost,
// crates and pipework. One palette for the DOM panels (CSS custom properties) and the canvas workshop.

export const TD = {
  plateHi: '#2b251d', plate: '#1d1914', plateLo: '#120f0c', well: '#0b0907',
  edge: '#6e5130', edgeDim: '#43321f', brass: '#e8b24a', brassHi: '#ffdb8e', brassLo: '#9a6a28', copper: '#c8743c',
  text: '#f2e7d0', dim: '#b9a685', mute: '#7d6e58', ink: '#140f08',
  hp: '#9ccf45', hpHi: '#cdf27a', bad: '#ff5a3a',
  blue: '#5cc8ff', red: '#ff6a3d', purple: '#cf7dff',
} as const;

/** Custom properties on `.td-hud`; the CSS below only refers to these. */
export const THEME_VARS = Object.entries(TD).map(([k, v]) => `--td-${k}:${v};`).join('');

/** A domed hex bolt: dark socket ring, brass dome and a specular dot. */
const bolt = (x: string, y: string) => `radial-gradient(circle at ${x} ${y}, ${TD.brassHi} 0 1.2px, ${TD.brass} 2px, ${TD.brassLo} 3.4px, #000 4.2px, #6e513066 5px, transparent 5.6px)`;
/** Four corner bolts, layered over any plate background. */
export const RIVETS = [bolt('10px', '10px'), bolt('calc(100% - 10px)', '10px'), bolt('10px', 'calc(100% - 10px)'), bolt('calc(100% - 10px)', 'calc(100% - 10px)')].join(',');
/** Small rivets for little plates and keys. */
const rivet = (x: string, y: string) => `radial-gradient(circle at ${x} ${y}, ${TD.brassHi} 0 .8px, ${TD.brassLo} 1.6px, #000a 2.2px, transparent 2.8px)`;
const SMALL_RIVETS = [rivet('6px', '50%'), rivet('calc(100% - 6px)', '50%')].join(',');
/** Diamond tread plate with grime pooled in the corners. */
export const PLATE = [
  'radial-gradient(120% 90% at 50% 40%, transparent 55%, #00000073)',
  'repeating-linear-gradient(45deg, #ffffff07 0 2px, transparent 2px 9px)',
  'repeating-linear-gradient(-45deg, #00000026 0 2px, transparent 2px 9px)',
  `linear-gradient(180deg, ${TD.plateHi}f4, ${TD.plate}f2 45%, ${TD.plateLo}f4)`,
].join(',');
/** A riveted steel strap: a dark band with a lit top edge and a rivet every 28px. */
export const STRAP = `radial-gradient(circle at 14px 50%, ${TD.brassHi} 0 .8px, ${TD.brassLo} 1.6px, #000 2.3px, transparent 2.8px) 0 0 / 28px 100% repeat-x, linear-gradient(180deg, #5c4c3a, #2b231b 35%, #1a140f)`;
/** Bevelled steel frame colours: lit top-left, shaded bottom-right. */
const BEVEL = `border-style:solid; border-color:#7a6650 #2b231b #15100c #5c4c3a;`;

export const THEME_CSS = `
.td-hud { ${THEME_VARS} --fg:var(--td-text); --dim:var(--td-dim); color:var(--td-text); }
.td-hud .panel, .td-hud .td-loading-card { background:${RIVETS}, ${PLATE}; border-width:3px; ${BEVEL} border-radius:0;
  box-shadow:inset 0 0 0 1px #000, inset 0 2px 0 1px #ffdca014, inset 0 0 22px #000a, 0 0 0 1px #000, 0 12px 28px #000c; -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); }
.td-hud small { color:var(--td-dim); }
/* gauges: a recessed well, a lit fill and tick marks over both */
.td-hud .bar { position:relative; height:9px; border-radius:0; background:var(--td-well); border:1px solid #000; box-shadow:inset 0 2px 3px #000, 0 1px 0 #ffdca01a; }
.td-hud .bar::after { content:''; position:absolute; inset:0; background:repeating-linear-gradient(90deg, transparent 0 9px, #000b 9px 11px); pointer-events:none; }
.td-hud .bar > i { background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 45%, var(--td-brassLo)); box-shadow:0 0 8px #e8b24a77; }
.td-hud .td-hp .bar > i { background:linear-gradient(180deg, var(--td-hpHi), var(--td-hp) 50%, #5f8a22); box-shadow:0 0 8px #9ccf4577; }
.td-hud .td-hp.low .bar > i { background:repeating-linear-gradient(135deg, var(--td-bad) 0 6px, #a3241a 6px 12px); box-shadow:0 0 10px #ff5a3a99; }
.td-hud .td-stat b { color:var(--td-text); font-style:normal; font-stretch:condensed; letter-spacing:.04em; text-shadow:0 2px 0 #000; }
.td-hud .td-stat small, .td-hud .td-current small { font-weight:700; letter-spacing:.12em; }
.td-hud .td-scrap, .td-hud .td-scrap b { color:var(--td-brass); }
.td-hud .td-current { box-shadow:inset 6px 0 0 -1px var(--brood), inset 7px 0 12px -6px var(--brood), inset 0 0 0 1px #000, inset 0 0 22px #000a, 0 0 0 1px #000, 0 12px 28px #000c; }
.td-hud .td-current b, .td-hud .td-count { font-style:normal; font-stretch:condensed; font-weight:900; letter-spacing:.06em; text-shadow:0 0 12px color-mix(in srgb, var(--brood) 50%, transparent), 0 2px 0 #000; }
.td-hud .td-event { gap:10px; }
.td-hud .td-event b { color:var(--td-brass); font-style:normal; font-stretch:condensed; font-weight:900; letter-spacing:.1em; text-shadow:0 3px 0 #000, 0 0 20px #e8b24a66; -webkit-text-stroke:1px #000a; }
.td-hud .td-event b::after { content:''; display:block; height:8px; width:min(260px, 70%); margin:8px auto 0; background:${STRAP}; border:1px solid #000; box-shadow:0 2px 0 #000; }
.td-hud .td-event span { color:var(--td-text); text-shadow:0 1px 3px #000; }
.td-hud .td-objective h3 { color:var(--td-brass); font-style:normal; font-stretch:condensed; font-weight:900; letter-spacing:.07em; text-shadow:0 2px 0 #000; }
.td-hud .td-objective-main > small, .td-hud .td-loading-card > small { align-self:flex-start; padding:3px 12px; border-radius:0; background:${SMALL_RIVETS}, linear-gradient(180deg, #3a3024, #241d16); border:1px solid #000;
  box-shadow:inset 0 1px 0 #ffdca026; color:var(--td-brass); font-weight:800; letter-spacing:.14em; }
.td-hud .td-crew { border-top:2px solid #000; box-shadow:0 -1px 0 #ffdca014; }
.td-hud .td-menu h2, .td-hud .td-loading-card h2 { font-style:normal; font-stretch:condensed; font-weight:900; text-transform:uppercase; letter-spacing:.1em;
  background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 55%, var(--td-copper)); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 2px 0 #000); }
.td-hud .td-menu header { position:relative; padding-bottom:12px; border-bottom:0; }
.td-hud .td-menu header::after { content:''; position:absolute; left:0; right:0; bottom:0; height:8px; background:${STRAP}; border:1px solid #000; box-shadow:0 1px 0 #ffdca014; }
.td-hud .td-menu header > b { padding:2px 10px; border-radius:0; background:linear-gradient(180deg, #3a3024, #241d16); border:1px solid #000; box-shadow:inset 0 1px 0 #ffdca026;
  color:var(--td-brass); font-size:18px; text-shadow:0 0 10px #e8b24a66; padding-inline:14px; }
.td-hud .td-menu p { color:var(--td-dim); }
.td-hud .td-menu > small { color:var(--td-mute); font-weight:700; }
/* keys: bevelled steel with depth; the selected one is lit and shows a lamp */
.td-hud .td-menu .btn, .td-hud .td-tile { position:relative; background:linear-gradient(180deg, #3a3128, #221c16 45%, #17120e); border-width:2px; ${BEVEL} border-radius:0;
  box-shadow:inset 0 0 0 1px #000, inset 0 1px 0 1px #ffdca01a, 0 3px 0 #000, 0 4px 6px #0008; -webkit-backdrop-filter:none; backdrop-filter:none; color:var(--td-text); }
.td-hud .td-menu .btn:active:not(:disabled), .td-hud .td-tile:active { transform:translateY(2px); box-shadow:inset 0 0 0 1px #000, 0 1px 0 #000; }
.td-hud .td-menu .btn small { color:var(--td-dim); }
.td-hud .td-menu .btn:not(:disabled):hover { border-color:#8a7558 #3a2f23 #1c1510 #6c5a45; }
.td-hud .td-menu .btn.selected, .td-hud .td-tile.selected { border-color:var(--td-brassHi) var(--td-brass) var(--td-brassLo) var(--td-brass); background:linear-gradient(180deg, #4a3a22, #2a2116 50%, #1b150f);
  box-shadow:inset 0 0 0 1px #000, inset 0 0 18px #e8b24a33, 0 3px 0 #000, 0 0 18px #e8b24a66; }
.td-hud .td-menu .btn.selected::after, .td-hud .td-tile.selected::after { content:''; position:absolute; top:6px; right:6px; width:9px; height:9px; border-radius:50%; z-index:2;
  background:radial-gradient(circle at 40% 35%, #fff6d0, #ffb020 45%, #8a4f00); border:1px solid #000; box-shadow:0 0 8px #ffb020, 0 0 2px #ffb020; }
.td-hud .td-menu .btn.selected > span { color:var(--td-brassHi); }
.td-hud .td-menu .btn.selected small { color:var(--td-text); }
.td-hud .td-menu .btn:disabled { filter:saturate(.3); }
.td-hud .td-map { border-radius:0; box-shadow:inset 0 0 0 1px #000; outline:1px solid #ffdca01a; outline-offset:-1px; }
.td-hud .td-card-pic, .td-hud .td-preview-pic, .td-hud .td-loading-art { border-radius:0; box-shadow:0 0 0 1px #000, 0 0 0 3px #4a3e30, 0 0 0 4px #000; }
.td-hud .td-card-art { background:${PLATE}; color:var(--td-mute); border-radius:0; }
.td-hud .td-endless { color:var(--td-purple); } .td-hud .td-quick { color:var(--td-brass); }
.td-hud .td-preview h3 { color:var(--td-brass); font-stretch:condensed; font-weight:900; text-transform:uppercase; letter-spacing:.08em; text-shadow:0 2px 0 #000; }
/* ground names on engraved brass nameplates */
.td-hud .td-ground { --lab:96px; }
.td-hud .td-ground > span { justify-self:stretch; padding:5px 12px; clip-path:polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px); white-space:nowrap; overflow:hidden; font-size:10px; border-radius:0; text-align:center; background:${SMALL_RIVETS}, linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 45%, var(--td-brassLo));
  border:1px solid #000; box-shadow:inset 0 1px 0 #fff8, 0 2px 0 #000; color:var(--td-ink); font-weight:900; text-shadow:0 1px 0 #ffe9b8; letter-spacing:.05em; }
.td-hud[data-narrow="true"] .td-ground { --lab:66px; }
.td-hud[data-narrow="true"] .td-ground > span { padding:4px 2px; font-size:8.5px; letter-spacing:0; background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 45%, var(--td-brassLo)); }
.td-hud .td-tile b { color:var(--td-text); text-shadow:0 1px 0 #000, 0 0 4px #000; }
.td-hud .td-tile i { color:var(--td-brass); }
.td-hud .td-tile.next:not(.selected) { border-color:var(--td-copper) #7a4420 #4a2810 #a35e30; }
.td-hud .td-tile.locked i { color:var(--td-mute); }
.td-hud .td-step, .td-hud .td-reroll { border:2px solid #000; color:var(--td-ink); background:radial-gradient(circle at 35% 30%, var(--td-brassHi), var(--td-brass) 45%, var(--td-brassLo));
  box-shadow:inset 0 1px 0 #fff6, inset 0 -2px 0 #0005, 0 0 0 2px #3a2f23, 0 3px 6px #000c; text-shadow:0 1px 0 #ffe9b8; -webkit-backdrop-filter:none; backdrop-filter:none; }
.td-hud .td-reroll { border-radius:0; background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 50%, var(--td-brassLo)); font-weight:900; letter-spacing:.04em; }
.td-hud .td-step:active, .td-hud .td-reroll:active { background:var(--td-brassHi); color:var(--td-ink); }
.td-hud .td-loading-art::after { background:linear-gradient(115deg, transparent 35%, #ffd98a2e 50%, transparent 65%) 0 0 / 300% 100%; }
.td-hud .td-loading-bar { height:12px; border-radius:0; background:var(--td-well); border:1px solid #000; box-shadow:inset 0 2px 3px #000, 0 0 0 2px #3a2f23; }
.td-hud .td-loading-bar > i { border-radius:0; background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 50%, var(--td-brassLo)); box-shadow:0 0 12px #e8b24a88; }
.td-hud .td-loading-status b { color:var(--td-text); }
`;
