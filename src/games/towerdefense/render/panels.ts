// DOM foreground: the shell's font with the game's own riveted-plate theme (theme.ts). The map stays Canvas 2D.
import { knownLevel } from '../sim/levelCache';
import { BOSS_ESCALATION } from '../sim/boss';
import { WEAPONS, WEAPON_NAME, type Element } from '../sim/defs';
import type { RadarBlip, RadarView, TdSnapshot } from '../sim/types';
import { powerState, roman, tierGain } from '../sim/tiers';
import type { Box, TdLayout } from './layout';
import { STAGE_NAME, flowLabel, rideObjective } from './objectives';
import { levelImage, levelSelectHtml, modesHtml, styleName, type ArtLookup } from './levelSelect';
import type { TdLevel } from '../sim/level';
import { THEME_CSS } from './theme';

export interface Hit extends Box { action: unknown }
/** Below this width the HUD goes narrow: one column of ride-select cards, with landscape-shaped pictures. */
export const NARROW_W = 560;
/** The loading card's live parts: how far the level's art is (0..1) and its picture. */
export interface LoadingView { progress: number }
/** A level's picture for one orientation (`preview`: the big one when it exists). */
export type TdArt = (level: TdLevel, turned: boolean, preview: boolean) => string | null;

const CSS = `
.td-hud { position:absolute; inset:0; pointer-events:none; color:var(--fg); font:inherit; }
.td-hud [hidden] { display:none!important; }
.td-box { position:absolute; box-sizing:border-box; }
.td-hud .panel { padding:10px 16px; }
.td-status { display:grid; grid-template-columns:1fr 1fr auto; gap:18px; align-items:center; }
.td-hud small { color:var(--dim); font-size:12px; letter-spacing:1px; text-transform:uppercase; }
.td-stat { min-width:0; }
.td-stat b { font-size:clamp(18px,2.5vw,26px); font-weight:900; font-style:italic; font-variant-numeric:tabular-nums; }
.td-stat small { margin-left:8px; }
.td-stat .bar { height:5px; margin-top:5px; }
.td-hud .bar > i { transition:none; }
.td-hp .bar > i { background:var(--lime); }
.td-hp.low .bar > i { background:var(--bad); }
.td-scrap { text-align:right; color:var(--warn); }
.td-current { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); grid-template-areas:"brood tier next" "guide tier next"; gap:4px 14px; align-items:center; }
.td-brood { grid-area:brood; min-width:0; }
.td-brood b { display:block; color:var(--brood); font-size:clamp(16px,2vw,22px); font-style:italic; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.td-current small { display:block; margin-top:3px; }
.td-tier { grid-area:tier; display:flex; align-items:center; gap:8px; min-width:0; pointer-events:auto; }
.td-gate { flex:1 1 auto; width:150px; min-width:110px; display:flex; flex-direction:column; gap:3px; padding:3px 4px 4px; background:var(--td-well); border:1px solid #000; border-radius:3px; box-shadow:inset 0 2px 5px #000, 0 1px 0 #ffdca014; }
.td-slots { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:3px; align-items:end; }
.td-slots > * { position:relative; display:grid; place-items:center; height:16px; font-size:10px; font-weight:800; font-style:normal; line-height:1; letter-spacing:.03em; color:var(--td-mute); border:1px solid #000; border-radius:2px;
  background:linear-gradient(180deg, #ffffff08, transparent 60%), var(--td-plateLo); box-shadow:inset 0 1px 0 #ffdca00f; transition:background .2s, height .2s; }
.td-slots > :nth-child(2) { height:18px; } .td-slots > :nth-child(3) { height:19px; } .td-slots > :nth-child(4) { height:21px; } .td-slots > :nth-child(5) { height:23px; }
.td-slots > .lit { color:#2a1c0a; background:linear-gradient(180deg, #c9964a, #8f6327); box-shadow:inset 0 1px 0 #ffdb8e55; }
.td-slots > b { color:var(--td-ink); font-size:12px; background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 50%, var(--td-brassLo)); box-shadow:inset 0 1px 0 #fff9, 0 0 10px #e8b24aaa; text-shadow:none; }
.td-slots > .call { outline:1px solid var(--td-copper); outline-offset:1px; box-shadow:0 0 8px #c8743c88; }
.td-slots > span.call:not(.lit) { color:#e59a62; }
.td-load { position:relative; height:4px; border-radius:1px; background:#000; overflow:hidden; }
.td-load > i { display:block; height:100%; background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass)); box-shadow:0 0 6px #e8b24a88; transition:width .3s; }
.td-load.short > i { background:linear-gradient(180deg, #ff8a5c, var(--td-copper)); box-shadow:none; }
.td-key { flex:none; width:34px; height:34px; display:grid; place-items:center; padding:0 0 2px; border:1px solid #000; border-radius:4px; cursor:pointer; color:var(--td-brass); font:900 20px/1 system-ui, sans-serif;
  background:linear-gradient(180deg, #ffffff10, transparent 45%), var(--td-plateHi); box-shadow:inset 0 1px 0 #ffdca026, inset 0 -2px 0 #0007, 0 2px 0 #000; }
.td-key:active { transform:translateY(1px); box-shadow:inset 0 2px 4px #000; }
.td-key.cue { color:var(--td-ink); background:linear-gradient(180deg, var(--td-brassHi), var(--td-brass) 50%, var(--td-brassLo)); box-shadow:inset 0 1px 0 #fff8, inset 0 -2px 0 #0005, 0 2px 0 #000, 0 0 12px #e8b24a99; animation:td-cue 1.2s ease-in-out infinite; }
@keyframes td-cue { 50% { box-shadow:inset 0 1px 0 #fff8, inset 0 -2px 0 #0005, 0 2px 0 #000, 0 0 18px 2px #ffdb8ecc; } }
.td-tier-read { flex:none; display:flex; flex-direction:column; align-items:flex-end; gap:2px; line-height:1; }
.td-tier-read strong { font-size:17px; font-weight:900; font-variant-numeric:tabular-nums; color:var(--td-text); text-shadow:0 2px 0 #000; }
.td-hud .td-tier-read small { margin:0; font-size:9px; letter-spacing:.12em; color:var(--td-dim); }
.td-next { grid-area:next; min-width:0; justify-self:end; }
.td-guide { grid-area:guide; min-width:0; display:flex; flex-direction:column; gap:4px; }
.td-meter { position:relative; height:10px; border-radius:2px; background:linear-gradient(90deg, #4a1d12 0%, #2a1a12 100%); box-shadow:inset 0 1px 3px #000; }
.td-band { position:absolute; top:0; bottom:0; background:linear-gradient(180deg, #8fd16a, #4f8f36); box-shadow:0 0 8px #8fd16a55; border-radius:1px; }
.td-needle { position:absolute; top:-3px; bottom:-3px; width:3px; margin-left:-1.5px; background:#fff; box-shadow:0 0 4px #000, 0 0 6px #fff8; border-radius:1px; }
.td-guide.under .td-needle { background:#ff8a5c; } .td-guide.over .td-needle { background:var(--td-brassHi); }
.td-hud .td-verdict { margin:0; font-size:13px; line-height:1.25; color:var(--td-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.td-verdict strong { color:var(--td-text); }
.td-guide.on .td-verdict strong { color:#9be27a; } .td-guide.under .td-verdict strong { color:#ff9a6c; } .td-guide.over .td-verdict strong { color:var(--td-brassHi); }
.td-hud .td-gain { margin:0; font-size:12px; color:var(--td-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.td-charge { position:relative; height:16px; border-radius:2px; background:#160d22; box-shadow:inset 0 1px 3px #000; overflow:hidden; }
.td-charge > i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(180deg, #c790ff, #7a3fd0); }
.td-charge.ready > i { box-shadow:0 0 10px #c790ff; animation:td-charge-pulse 0.9s ease-in-out infinite alternate; }
@keyframes td-charge-pulse { from { filter:brightness(1); } to { filter:brightness(1.35); } }
.td-hud:not([data-column=true]) .td-charge { height:6px; } .td-hud:not([data-column=true]) .td-charge > span { display:none; }
.td-charge > span { position:relative; display:block; padding-left:6px; font-size:10px; line-height:16px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:#f3e8ff; text-shadow:0 1px 2px #000; }
.td-next { color:var(--dim); font-size:15px; text-align:right; }
.td-next > .td-radar { width:min(260px, 100%); margin-left:auto; text-align:left; }
.td-next > span { display:block; }
.td-hud .td-current.incoming { padding:8px 16px; }
.td-current.incoming .td-brood b { font-size:26px; line-height:1.05; }
.td-count { display:block; color:var(--brood); font-size:28px; font-weight:900; font-variant-numeric:tabular-nums; line-height:1; }
.td-event { display:flex; flex-direction:column; justify-content:center; gap:8px; text-align:center; text-shadow:0 2px 4px var(--bg); overflow:auto; }
.td-event b { font-size:clamp(24px,3.4vw,38px); color:var(--neon); text-transform:uppercase; }
.td-event span { font-size:18px; }
.td-objective { display:flex; flex-direction:column; gap:12px; overflow:auto; pointer-events:auto; overscroll-behavior:contain; }
.td-objective-main { flex:1; display:flex; flex-direction:column; justify-content:center; gap:10px; }
.td-objective h3 { margin:0; color:var(--neon); font-size:24px; line-height:1.15; font-style:italic; text-transform:uppercase; }
.td-objective p { margin:0; font-size:15px; line-height:1.4; overflow-wrap:anywhere; }
.td-objective-detail { color:var(--dim); }
.td-objective .bar { height:6px; }
.td-crew { border-top:1px solid var(--line); padding-top:12px; }
/* Enemy radar: one fuzzy blip per spawn group, placed by when it comes into the turret's reach and sized by its HP; overlapping
   blips add up. Horizontal: in reach on the left, +90 s on the right, roads as rows; vertical (the landscape card): in reach
   at the bottom, roads as columns. Gliders share the road columns, marked with a chevron. */
.td-radar { position:relative; display:flex; flex-direction:column; gap:3px; min-width:0; }
.td-radar-head { display:flex; justify-content:space-between; gap:8px; }
.td-hud .td-radar-head small { margin:0; font-size:10px; letter-spacing:.08em; }
.td-radar-head b { font-size:11px; color:var(--td-text); text-transform:uppercase; letter-spacing:.06em; }
.td-radar-well { position:relative; overflow:hidden; background:var(--td-well); border:1px solid #000; border-radius:3px; box-shadow:inset 0 2px 5px #000; }
.td-radar.h { gap:2px; }
.td-radar.h .td-radar-well { height:28px; }
.td-radar.v .td-radar-well { flex:1; min-height:104px; }
.td-scope { position:absolute; inset:4px; isolation:isolate; }
.td-radar.h .td-scope { inset:2px 4px; }
.td-rlane { position:absolute; background:#e8b24a0b; }
.td-radar.v .td-rlane { top:0; bottom:0; left:calc(var(--x) * 100% - var(--w) * 50%); width:calc(var(--w) * 100%); }
.td-radar.h .td-rlane { left:0; right:0; top:calc(var(--x) * 100% - var(--w) * 50%); height:calc(var(--w) * 100%); }
.td-rtick { position:absolute; border:0 dashed #e8b24a30; }
.td-radar.v .td-rtick { left:0; right:0; bottom:calc(var(--p) * 100%); border-top-width:1px; }
.td-radar.h .td-rtick { top:0; bottom:0; left:calc(var(--p) * 100%); border-left-width:1px; }
.td-radar.v .td-scope::after, .td-radar.h .td-scope::after { content:''; position:absolute; background:#e8b24a8c; }
.td-radar.v .td-scope::after { left:0; right:0; bottom:0; height:2px; }
.td-radar.h .td-scope::after { top:0; bottom:0; left:0; width:2px; }
.td-blip { --c:#4aa8ff; position:absolute; width:calc(var(--k) * var(--bmax)); aspect-ratio:1; border-radius:50%; opacity:.85;
  background:radial-gradient(circle, var(--c) 0 16%, color-mix(in srgb, var(--c) 50%, transparent) 34%, color-mix(in srgb, var(--c) 12%, transparent) 54%, transparent 70%); }
.td-radar.v .td-blip { --bmax:36px; left:calc(var(--x) * 100%); bottom:calc(var(--p) * 100%); transform:translate(-50%, 50%); }
.td-radar.h .td-blip { --bmax:20px; left:calc(var(--p) * 100%); top:calc(var(--x) * 100%); transform:translate(-50%, -50%); }
/* the enemies' own body colours (sprites COL), not the lighter UI tints: purple has to read as violet, not pink */
.td-blip.red { --c:#ff5a3c; } .td-blip.purple { --c:#a95cff; }
/* Stalkers rotate through the three colours, like the aliens themselves */
@property --c { syntax:'<color>'; inherits:false; initial-value:#4aa8ff; }
.td-blip.prism { animation:td-prism 12s linear infinite; }
@keyframes td-prism { 0%, 28% { --c:#4aa8ff; } 33%, 61% { --c:#ff5a3c; } 66%, 94% { --c:#a95cff; } 100% { --c:#4aa8ff; } }
@media (prefers-reduced-motion: reduce) { .td-blip.prism { animation-duration:36s; } }
.td-blip.air { opacity:.8; background:radial-gradient(circle, color-mix(in srgb, var(--c) 35%, transparent) 0, transparent 65%); }
.td-blip.air::after { content:''; position:absolute; left:50%; top:50%; width:5px; height:5px; border:solid #cfeefc; border-width:1.5px 0 0 1.5px; }
.td-radar.v .td-blip.air::after { transform:translate(-50%, -25%) rotate(225deg); }
.td-radar.h .td-blip.air::after { transform:translate(-25%, -50%) rotate(-45deg); }
.td-blip.boss { width:var(--bmax); border:2px dashed var(--td-gold, #ffd24a); mix-blend-mode:normal; box-shadow:0 0 8px #ffd24a66; opacity:.9;
  background:radial-gradient(circle, #fff8e8 0 8%, var(--c) 26%, transparent 70%); }
.td-radar.v .td-blip.boss { --bmax:30px; } .td-radar.h .td-blip.boss { --bmax:18px; }
.td-radar-axis { display:flex; justify-content:space-between; }
.td-radar-lanes { display:flex; padding:0 4px; }
.td-radar-lanes small { flex:1 1 0; text-align:center; }
.td-hud .td-radar-axis small, .td-hud .td-radar-lanes small { margin:0; font-size:9px; letter-spacing:.06em; }
.td-objective .td-radar.v { flex:1 1 140px; }
.td-bossbar { --bb:var(--td-blue); display:flex; flex-direction:column; justify-content:center; gap:3px; padding:4px 10px 5px; pointer-events:none;
  background:linear-gradient(#0b0907e6, #0b0907b3); border:1px solid #000; border-bottom-color:color-mix(in srgb, var(--bb) 60%, #000); border-radius:4px; box-shadow:0 3px 10px #0009; }
.td-bossbar.red { --bb:var(--td-red); } .td-bossbar.purple { --bb:var(--td-purple); }
.td-bb-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; line-height:1; white-space:nowrap; overflow:hidden; }
.td-bb-head b { font-size:15px; letter-spacing:.06em; text-transform:uppercase; color:var(--bb); text-shadow:0 1px 0 #000; }
.td-hud .td-bb-head small { margin:0; font-size:11px; letter-spacing:.05em; color:var(--td-text); opacity:.85; overflow:hidden; text-overflow:ellipsis; }
.td-bb-track { position:relative; height:12px; background:var(--td-well); border:1px solid #000; border-radius:2px; box-shadow:inset 0 1px 3px #000; overflow:hidden; }
.td-bb-track > i { position:absolute; left:0; top:0; bottom:0; width:calc(var(--k) * 100%); background:linear-gradient(color-mix(in srgb, var(--bb) 70%, #fff), var(--bb) 45%, color-mix(in srgb, var(--bb) 60%, #000)); transition:width .25s; }
.td-bb-track > u { position:absolute; left:0; top:0; height:4px; width:calc(var(--k) * 100%); background:#e6d0ffcc; }
.td-bb-track > s { position:absolute; top:-1px; bottom:-1px; left:calc(var(--at) * 100%); width:2px; margin-left:-1px; background:#000; box-shadow:1px 0 0 #ffdca033; }
.td-bossbar.telegraph .td-bb-track { box-shadow:inset 0 1px 3px #000, 0 0 0 1px #ffd24a99; }
.td-bossbar.exposed { border-color:#ffd24a; animation:td-bb-flash .5s ease-in-out infinite alternate; }
.td-bossbar.exposed .td-bb-track > i { background:linear-gradient(#fff6c8, #ffd24a 45%, #b8861a); }
@keyframes td-bb-flash { from { box-shadow:0 0 6px #ffd24a66; } to { box-shadow:0 0 18px #ffd24acc; } }
@media (prefers-reduced-motion: reduce) { .td-bossbar.exposed { animation:none; box-shadow:0 0 14px #ffd24aaa; } }
.td-crew b { display:block; margin-bottom:5px; font-size:14px; }
.td-crew p { color:var(--dim); font-size:13px; }
.td-hud[data-objective-compact=true] .td-objective { gap:8px; }
.td-hud[data-objective-compact=true] .td-objective-main { gap:6px; }
.td-hud[data-objective-compact=true] .td-objective h3 { font-size:20px; }
.td-hud[data-objective-compact=true] .td-objective p { font-size:13px; }
.td-hud[data-objective-compact=true] .td-crew { padding-top:8px; }
.td-hud[data-objective-compact=true] .td-crew p { font-size:12px; }
.td-menu { pointer-events:auto; overflow:auto; display:flex; flex-direction:column; gap:8px; overscroll-behavior:contain; }
.td-menu header { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.td-menu h2 { margin:0; color:var(--neon); font-size:28px; font-style:italic; }
.td-menu p { margin:0; color:var(--dim); }
.td-menu .btn { flex-shrink:0; width:100%; text-align:left; display:flex; justify-content:space-between; padding:8px 12px; font-size:16px; }
.td-menu .btn small { display:block; font-size:12px; text-transform:none; letter-spacing:0; }
.td-menu .selected { border-color:var(--neon); }
.td-map { display:block; width:100%; height:100%; border-radius:6px; object-fit:cover; }
.td-map-wait { background:linear-gradient(100deg, transparent 30%, rgba(255,255,255,.08) 50%, transparent 70%) 0 0 / 250% 100%, var(--ground, #2b2d30); animation:td-shimmer 1.4s linear infinite; }
@keyframes td-shimmer { from { background-position:100% 0, 0 0; } to { background-position:-150% 0, 0 0; } }
.td-loading { display:grid; place-items:center; pointer-events:auto; }
.td-loading-card { width:min(440px, 100%); max-height:100%; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; padding:14px; overflow:hidden; animation:td-rise .3s ease-out; }
@keyframes td-rise { from { opacity:0; transform:translateY(12px) scale(.98); } to { opacity:1; transform:none; } }
.td-loading-art { position:relative; overflow:hidden; border-radius:10px; aspect-ratio:var(--map-aspect); max-height:46vh; box-shadow:0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px var(--glass-line); }
.td-loading-art .td-map { position:absolute; inset:0; border-radius:0; animation:td-drift 9s ease-in-out infinite alternate; }
.td-loading-art::after { content:''; position:absolute; inset:0; background:linear-gradient(115deg, transparent 35%, rgba(130,240,255,.18) 50%, transparent 65%) 0 0 / 300% 100%; animation:td-sweep 2.2s ease-in-out infinite; }
@keyframes td-drift { from { transform:scale(1.04); } to { transform:scale(1.12) translate(-1.5%, 1%); } }
@keyframes td-sweep { from { background-position:100% 0; } to { background-position:-100% 0; } }
.td-loading-card small { color:var(--dim); }
.td-loading-card h2 { margin:0; color:var(--neon); font-size:clamp(22px,3.2vw,30px); font-style:italic; line-height:1.1; }
.td-loading-card p { margin:0; color:var(--dim); font-size:14px; }
.td-loading-bar { position:relative; height:8px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; }
.td-loading-bar > i { position:absolute; inset:0 auto 0 0; border-radius:inherit; background:linear-gradient(90deg, var(--neon), #ffd24a); box-shadow:0 0 12px var(--neon); transition:width .25s ease-out; }
.td-loading-bar > i::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent) 0 0 / 40% 100% no-repeat; animation:td-glint 1.1s linear infinite; }
@keyframes td-glint { from { background-position:-40% 0; } to { background-position:140% 0; } }
.td-loading-status { display:flex; justify-content:space-between; gap:8px; font-size:13px; color:var(--dim); }
.td-loading-status b { color:var(--fg); font-weight:700; }
.td-hud[data-wide="true"] .td-loading-card { width:min(620px, 100%); display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); align-items:center; column-gap:16px; }
.td-hud[data-wide="true"] .td-loading-art { grid-row:span 5; max-height:none; }
@media (prefers-reduced-motion: reduce) { .td-loading-art .td-map, .td-loading-art::after, .td-loading-bar > i::after, .td-map-wait { animation:none; } }
.td-cards { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; flex-shrink:0; }
.td-hud[data-narrow="true"] .td-cards { grid-template-columns:1fr; }
.td-menu .td-card { flex-direction:column; justify-content:flex-start; gap:8px; padding:8px; cursor:pointer; }
.td-card-pic, .td-preview-pic { position:relative; touch-action:pan-y; }
.td-card-pic { width:100%; }
.td-card-pic > .td-map, .td-card-pic > .td-card-art { width:100%; }
.td-hud[data-narrow="true"] .td-card-pic > .td-map, .td-hud[data-narrow="true"] .td-card-pic > .td-card-art { aspect-ratio:112 / 80; }
.td-card[data-swipe] { touch-action:pan-y; }
.td-step { position:absolute; top:50%; width:44px; height:44px; margin-top:-22px; display:grid; place-items:center; padding:0 0 3px; border-radius:50%; border:1px solid var(--glass-line); background:rgba(8,10,18,.62); color:var(--fg); font:700 30px/1 system-ui, sans-serif; cursor:pointer; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); box-shadow:0 2px 8px rgba(0,0,0,.4); pointer-events:auto; }
.td-step.prev { left:6px; } .td-step.next { right:6px; }
.td-step:active { background:var(--neon); color:#05101a; }
.td-reroll { position:absolute; top:6px; right:6px; min-height:36px; padding:0 12px; border-radius:99px; border:1px solid var(--glass-line); background:rgba(8,10,18,.62); color:var(--fg); font:700 13px/1 inherit; cursor:pointer; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
.td-reroll:active { background:var(--neon); color:#05101a; }
.td-card .td-map, .td-card-art { width:100%; aspect-ratio:var(--map-aspect); height:auto; }
.td-card-art { display:grid; place-items:center; border-radius:6px; background:#1b1d26; font-size:44px; font-weight:800; color:var(--dim); }
.td-endless { color:var(--pink); } .td-quick { color:var(--neon); }
/* Campaign page: the selected level's picture and facts on top, the ground × level grid filling the rest. The tiles
   take the largest size that fits the grid's box (container units), so neither axis is left mostly empty. */
.td-menu.td-campaign { overflow:auto; }
.td-levels { flex:1 1 auto; min-height:420px; display:flex; flex-direction:column; gap:12px; container-type:size; }
.td-preview { flex:0 0 auto; height:clamp(150px, 36cqh, 460px); display:grid; grid-template-columns:auto minmax(0,1fr); grid-template-rows:minmax(0,1fr); gap:14px; align-items:stretch; }
.td-preview-pic { height:100%; min-height:0; aspect-ratio:var(--map-aspect); max-width:58cqw; justify-self:start; overflow:hidden; border-radius:3px; }
.td-preview-pic > .td-map { width:100%; height:100%; }
.td-preview h3 { margin:0 0 4px; color:var(--neon); font-size:20px; }
.td-preview-text { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; }
.td-preview-text p { font-size:13px; margin:0 0 4px; }
.td-preview-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:auto; padding-top:8px; }
.td-menu .td-preview-actions .btn { width:auto; flex:0 1 150px; min-width:108px; justify-content:center; }
.td-grid { flex:1 1 0; min-height:0; display:flex; flex-direction:column; justify-content:center; gap:6px; container-type:size; }
.td-hud[data-wide="true"] .td-levels { flex-direction:row; align-items:stretch; }
.td-hud[data-wide="true"] .td-preview { order:2; flex:0 0 34%; height:auto; grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); align-content:start; }
.td-hud[data-wide="true"] .td-preview-pic { width:100%; height:auto; max-width:none; }
.td-hud[data-wide="true"] .td-menu .td-preview-actions .btn { flex:1 1 0; }
.td-ground { --lab:84px; --gap:6px; display:grid; grid-template-columns:var(--lab) repeat(5, minmax(0,64px)); gap:var(--gap); align-items:center; justify-content:center; }
@supports (container-type:size) {
  .td-ground { grid-template-columns:var(--lab) repeat(5, min(calc((100cqw - var(--lab) - 5 * var(--gap)) / 5), calc(((100cqh - 5 * var(--gap)) / 6 - 8px) * 1.4))); }
}
.td-hud[data-narrow="true"] .td-ground { --lab:62px; --gap:4px; }
.td-hud[data-narrow="true"] .td-ground > span { font-size:9px; letter-spacing:0; }
.td-ground > span { font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.06em; }
.td-tile { position:relative; padding:3px; border-radius:8px; border:1px solid var(--glass-line); background:var(--panel-solid); color:var(--fg); font:inherit; cursor:pointer; min-height:44px; }
.td-tile .td-map { aspect-ratio:112 / 80; height:auto; }
.td-tile b { position:absolute; left:6px; top:5px; font-size:11px; text-shadow:0 1px 2px #000; }
.td-tile i { position:absolute; left:3px; right:3px; bottom:3px; padding:8px 0 2px; border-radius:0 0 3px 3px; background:linear-gradient(transparent, #000c); font-style:normal; font-size:11px; line-height:1; color:#ffd24a; text-align:center; pointer-events:none; }
.td-tile.selected { border-color:var(--neon); box-shadow:0 0 0 2px var(--neon); }
.td-tile.next:not(.selected) { border-color:#ffd24a; }
.td-tile.locked .td-map { opacity:.35; filter:grayscale(.8); }
.td-tile.locked i { color:var(--dim); }
.td-hud[data-narrow=true] .td-stat small { display:block; margin:0; font-size:10px; letter-spacing:0; }
.td-hud[data-narrow=true] .td-status { gap:12px; }
.td-hud[data-narrow=true] .panel { padding:8px 12px; }
.td-hud[data-narrow=true] .td-current { grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"brood next" "tier tier" "guide guide"; align-content:center; gap:5px 10px; }
.td-hud[data-narrow=true] .td-current .td-brood b { font-size:18px; }
.td-hud[data-narrow=true] .td-next { font-size:13px; }
.td-hud[data-narrow=true] .td-count { font-size:22px; }
.td-hud[data-column=true] .td-status { grid-template-columns:1fr; gap:8px; align-content:center; }
.td-hud[data-column=true] .td-scrap { text-align:left; }
.td-hud[data-column=true] .td-current { grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"brood next" "tier tier" "guide guide" "detail detail"; align-content:center; gap:8px 10px; }
.td-hud[data-column=true] .td-next { display:contents; }
.td-hud[data-column=true] .td-next > strong { grid-area:next; justify-self:end; }
.td-hud[data-column=true] .td-next > small, .td-hud[data-column=true] .td-next > span { grid-area:detail; margin:0; text-align:left; font-size:13px; }
.td-hud[data-column=true] .td-next > small { font-size:11px; }
.td-hud[data-column=true] .td-current .td-brood b { font-size:21px; line-height:1.1; }
.td-hud[data-column=true] .td-slots > * { height:18px; font-size:11px; } .td-hud[data-column=true] .td-slots > :nth-child(2) { height:20px; } .td-hud[data-column=true] .td-slots > :nth-child(3) { height:22px; }
.td-hud[data-column=true] .td-slots > :nth-child(4) { height:24px; } .td-hud[data-column=true] .td-slots > :nth-child(5) { height:26px; } .td-hud[data-column=true] .td-slots > b { font-size:13px; }
.td-hud[data-column=true] .td-key { width:38px; height:38px; }
.td-hud[data-column=true] .td-stat b { font-size:22px; }
.td-hud[data-compact=true] .td-status, .td-hud[data-compact=true] .td-current { overflow:auto; pointer-events:auto; overscroll-behavior:contain; padding:6px 10px; }
.td-hud[data-compact=true] .td-status { grid-template-columns:1fr auto; gap:4px 8px; }
.td-hud[data-compact=true] .td-status > :first-child { grid-column:1 / -1; }
.td-hud[data-compact=true] .td-stat b { font-size:18px; }
.td-hud[data-compact=true] .td-stat small, .td-hud[data-compact=true] .td-current small { font-size:10px; letter-spacing:0; }
.td-hud[data-compact=true] .td-stat small { margin-left:4px; }
.td-hud[data-compact=true] .td-current { gap:4px 8px; }
.td-hud[data-compact=true] .td-tier-read { display:none; }
.td-hud[data-compact=true] .td-current .td-brood b { font-size:16px; }
.td-hud[data-compact=true] .td-current .td-count { font-size:24px; }
`;

const color = (e: Element) => `var(--td-${e})`;

type ScopeSize = { w: number; h: number };
/** The scope's inner size in CSS px when the HUD hasn't measured it yet (and in tests). */
export const SCOPE_DEFAULT: Record<'h' | 'v', ScopeSize> = { v: { w: 220, h: 110 }, h: { w: 260, h: 24 } };
const BLIP_MAX = { v: 36, h: 20 }, BOSS_SIZE = { v: 30, h: 18 };
export interface PlacedBlip { blip: RadarBlip; p: number; x: number; k: number }
/**
 * Lays the radar's blips out: `p` (0 = in reach, 1 = the far edge) comes from the arrival time and never moves;
 * across, each blip starts at a stable spot in its road's column and slides sideways, within the column, to the
 * nearest place where it doesn't overlap a blip already placed (the boss first, then older groups). When a column
 * is too crowded for that, it takes the spot with the most room.
 */
export function layoutRadar(r: RadarView, dir: 'h' | 'v', size: ScopeSize = SCOPE_DEFAULT[dir]): PlacedBlip[] {
  const cols = Math.max(1, r.roads), along = dir === 'v' ? size.h : size.w, across = dir === 'v' ? size.w : size.h;
  const colOf = (b: RadarBlip) => Math.min(b.lane < 0 ? b.key % cols : b.lane, cols - 1);
  const placed: Array<{ a: number; c: number; rad: number }> = [], out: PlacedBlip[] = [];
  const order = [...r.blips].sort((a, b) => Number(!!b.boss) - Number(!!a.boss) || a.key - b.key || a.lane - b.lane || a.etaS - b.etaS);
  for (const b of order) {
    const p = Math.min(1, Math.max(0, b.etaS / r.horizonS));
    const k = b.boss ? 1 : 0.3 + 0.7 * Math.sqrt(Math.min(1, b.hp / Math.max(1, r.scale)));
    const rad = (b.boss ? BOSS_SIZE[dir] * 0.5 : k * BLIP_MAX[dir] * 0.32), a = p * along;
    const col = colOf(b), lo = (col / cols) * across + Math.min(rad, across / cols / 2), hi = ((col + 1) / cols) * across - Math.min(rad, across / cols / 2);
    const jitter = b.boss ? 0 : (((b.key * 0.618034 + (b.lane + 1) * 0.37) % 1) - 0.5) * 0.6;
    const want = Math.min(hi, Math.max(lo, ((col + 0.5 + jitter) / cols) * across));
    const room = (c: number) => placed.reduce((m, q) => Math.min(m, Math.hypot(q.a - a, q.c - c) - q.rad - rad), Infinity);
    let best = want, bestRoom = room(want);
    if (bestRoom < 1) search: for (let d = 1; d <= hi - lo; d++) for (const c of [want - d, want + d]) {
      if (c < lo || c > hi) continue;
      const rm = room(c);
      if (rm >= 1) { best = c; break search; }
      if (rm > bestRoom) { best = c; bestRoom = rm; }
    }
    placed.push({ a, c: best, rad });
    out.push({ blip: b, p, x: across > 0 ? best / across : 0.5, k });
  }
  return out;
}

/**
 * The enemy radar (sim `radar`): one soft blip per spawn group, placed by when it comes into the turret's reach
 * (the base line) and across by which road it takes (Gliders share the road columns, with a chevron), sized by its
 * HP against the recent peak blip and laid out so blips don't overlap. A boss is a gold ringed blip; Stalkers cycle
 * colour. Every blip enters at the far edge.
 */
export function radarHtml(s: TdSnapshot, dir: 'h' | 'v', size?: ScopeSize): string {
  const r = s.radar;
  if (!r) return '';
  const horizon = r.horizonS, cols = Math.max(1, r.roads), cw = 1 / cols;
  const f3 = (n: number) => n.toFixed(3);
  const lanes = Array.from({ length: cols }, (_, i) => `<i class="td-rlane" style="--x:${f3((i + 0.5) * cw)};--w:${f3(cw * 0.8)}"></i>`).join('');
  const ticks = [30, 60].filter((x) => x < horizon).map((x) => `<i class="td-rtick" style="--p:${f3(x / horizon)}"></i>`).join('');
  const blips = layoutRadar(r, dir, size).sort((a, b) => b.p - a.p).map(({ blip: b, p, x, k }) => b.boss
    ? `<b class="td-blip boss ${b.color}" style="--p:${f3(p)};--x:${f3(x)}" title="Boss"></b>`
    : `<i class="td-blip ${b.color}${b.lane < 0 ? ' air' : ''}" style="--p:${f3(p)};--x:${f3(x)};--k:${f3(k)}"></i>`).join('');
  const head = `<div class="td-radar-head"><small>${dir === 'h' ? `Incoming · ${horizon}s` : 'Incoming'}</small><b>${r.boss && r.boss.inS > 0 ? `Boss in ${Math.ceil(r.boss.inS)}s` : r.lead ? `${r.lead} leads` : 'Clear'}</b></div>`;
  const axis = `<div class="td-radar-axis"><small>+${horizon}s</small><small>in reach</small></div>`;
  const names = cols > 1 ? `<div class="td-radar-lanes">${Array.from({ length: cols }, (_, i) => `<small>Road ${i + 1}</small>`).join('')}</div>` : '';
  return `<div class="td-radar ${dir}" role="img" aria-label="Enemy radar, next ${horizon} seconds, ${r.blips.length} groups incoming${r.lead ? `, ${r.lead} leads` : ''}">${head}`
    + `${dir === 'v' ? axis : ''}<div class="td-radar-well"><div class="td-scope">${lanes}${ticks}${blips}</div></div>${dir === 'v' ? names : ''}</div>`;
}
// Snapshot strings are game-owned, but garage descriptions may contain a profile-derived value.
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The gearbox: five stepped slots I–V (lit up to the current tier, copper-marked at the tier the flow calls for),
 * an output strip (how much of the tier's rated power the rider is making: what fills the shots), the rated %FTP,
 * and touch keys. The key toward the called tier glows.
 */
export function tierHtml(s: TdSnapshot): string {
  const name = roman(s.tier), call = s.suggestedTier, out = Math.max(0, s.tierOutput ?? 1);
  const slots = Array.from({ length: s.tierCount }, (_, i) => {
    const t = i + 1, cls = `${t < s.tier ? 'lit' : ''}${t === call ? ' call' : ''}`.trim(), attr = cls ? ` class="${cls}"` : '';
    return t === s.tier ? `<b${attr}>${roman(t)}</b>` : `<span${attr}>${roman(t)}</span>`;
  }).join('');
  const key = (step: -1 | 1) => `<button class="td-key${(step > 0 ? call > s.tier : call < s.tier) ? ' cue' : ''}" data-command="tier" data-step="${step}" aria-label="Tier ${step > 0 ? 'up' : 'down'}">${step > 0 ? '+' : '−'}</button>`;
  return `<div class="td-tier" aria-label="Intensity tier ${name} of ${s.tierCount}${call !== s.tier ? `, ride calls for ${roman(call)}` : ''}">${key(-1)}`
    + `<div class="td-gate"><div class="td-slots">${slots}</div><div class="td-load${out < 0.85 ? ' short' : ''}" title="Output"><i style="width:${(Math.min(1, out) * 100).toFixed(0)}%"></i></div></div>`
    + `${key(1)}<div class="td-tier-read"><strong>${watts(s, s.tierFtp)} W</strong><small>at ${s.power.refRpm} rpm</small></div></div>`;
}

/** Watts for a share of the rider's FTP, rounded to 5. */
const watts = (s: Pick<TdSnapshot, 'power'>, ftp: number) => Math.max(0, Math.round((ftp * s.power.ftpW) / 5) * 5);

/**
 * The power guide under the gearbox: a meter of the rider's watts against the selected tier (shortfall, the
 * full-power band from its rated watts to the effort cap, and beyond it), one line saying where they are and what to
 * do, and what the next tier would add. The Railgun also shows its charge: it fires a full pulse when charged, and
 * spends a sliver of it on a quick snap at a small alien.
 */
export function guideHtml(s: TdSnapshot, full = true): string {
  const p = s.power, rated = s.tierFtp, top = rated * p.cap, scale = top * 1.3;
  const ps = powerState(p.nowFtp, rated, p.cap), at = (ftp: number) => `${(Math.min(1, Math.max(0, ftp / scale)) * 100).toFixed(1)}%`;
  const short = Math.round(Math.min(1, ps.share) * 100);
  const verdict = s.swapLeft > 0 ? `<strong>Mounting</strong> · turret silent ${Math.ceil(s.swapLeft)}s`
    : ps.state === 'under' ? `<strong>${watts(s, ps.gapFtp)} W under</strong> · shots at ${short}%`
    : ps.state === 'over' && s.tier < s.tierCount ? `<strong>Over the cap</strong> · shift up to ${roman(Math.max(s.tier + 1, s.suggestedTier))}`
    : `<strong>Full power</strong> · ${watts(s, rated)}–${watts(s, top)} W`;
  const next = s.tier < s.tierCount ? `${roman(s.tier + 1)}: ${tierGain(s.weapon, s.tier, s.tier + 1)}` : 'Top tier';
  const meter = `<div class="td-meter" role="meter" aria-label="Power against tier ${roman(s.tier)}" aria-valuemin="0" aria-valuemax="${watts(s, scale)}" aria-valuenow="${watts(s, p.nowFtp)}">`
    + `<i class="td-band" style="left:${at(rated)};width:calc(${at(top)} - ${at(rated)})"></i><b class="td-needle" style="left:${at(p.nowFtp)}"></b></div>`;
  const rail = s.weapon === 'rail'
    ? `<div class="td-charge${s.railProgress >= 1 ? ' ready' : ''}" title="The Railgun banks your watts: a full pulse when charged, quick snaps at small aliens spend a sliver"><i style="width:${(s.railProgress * 100).toFixed(0)}%"></i><span>${s.railProgress >= 1 ? 'Pulse ready' : `Charging ${Math.floor(s.railProgress * 100)}%`}</span></div>`
    : '';
  return `<div class="td-guide ${s.swapLeft > 0 ? 'mount' : ps.state}">${meter}<p class="td-verdict">${verdict}</p>${rail}${full ? `<p class="td-gain">${esc(next)}</p>` : ''}</div>`;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/**
 * The boss health bar along the top of the field: its name and phase, HP in its colour with a notch at each phase
 * gate, purple's plates as a thin band on top, a gold flash while it is Exposed, and how long until it breaks through.
 */
export function bossBarHtml(b: NonNullable<TdSnapshot['boss']>): string {
  const notches = Array.from({ length: b.phaseCount - 1 }, (_, i) => `<s style="--at:${((i + 1) / b.phaseCount).toFixed(3)}"></s>`).join('');
  const state = b.exposed ? `Exposed · ${Math.ceil(b.windowLeftS)}s · tier V` : b.telegraph ? `Opening in ${Math.ceil(b.windowLeftS)}s`
    : b.pending ? `Phase ${b.phase + 1} in ${Math.ceil(b.countdownS)}s` : `Phase ${b.phase}/${b.phaseCount}`;
  const escape = b.escapeS > 0 ? ` · breaks through in ${b.escapeS < 60 ? `${Math.ceil(b.escapeS)}s` : mmss(b.escapeS)}` : '';
  return `<div class="td-bb-head"><b>${esc(b.name)}</b><small>${esc(state + escape)}</small></div>`
    + `<div class="td-bb-track" role="progressbar" aria-label="${esc(b.name)} health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(b.hp * 100)}">`
    + `<i style="--k:${b.hp.toFixed(4)}"></i>${b.shield > 0 ? `<u style="--k:${b.shield.toFixed(3)}"></u>` : ''}${notches}</div>`;
}

export class TdHud {
  readonly root = document.createElement('div');
  private status = this.box('td-status panel');
  private current = this.box('td-current panel');
  private event = this.box('td-event');
  private bossBar = this.box('td-bossbar');
  private objective = this.box('td-objective panel');
  private menu = this.box('td-menu panel');
  private loadingCard = this.box('td-loading');
  /** Level pictures for the menus and the loading card (the renderer's LevelArt). */
  art: TdArt | null = null;
  private markup = new WeakMap<HTMLElement, string>();

  constructor(private send?: (a: unknown) => void) {
    this.root.className = 'td-hud';
    const style = document.createElement('style'); style.textContent = CSS + THEME_CSS; this.root.append(style);
    this.root.addEventListener('pointerdown', this.onSwipeStart);
    this.root.addEventListener('pointerup', this.onSwipeEnd);
    this.root.addEventListener('pointercancel', () => { this.swipe = null; });
    this.root.addEventListener('keydown', e => { // the cards are role=button divs (they hold ◀ ▶ buttons)
      const el = e.target as HTMLElement;
      if ((e.key === 'Enter' || e.key === ' ') && el.getAttribute?.('role') === 'button') { e.preventDefault(); el.click(); }
    });
    this.root.addEventListener('click', e => {
      if (this.swiped) { this.swiped = false; e.preventDefault(); e.stopPropagation(); return; } // the click that ends a swipe
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-command]');
      if (!button || (button as HTMLButtonElement).disabled) return;
      const index = Number(button.dataset.index);
      if (button.dataset.command === 'garageRow') this.send?.({ type: 'garageRow', row: index });
      if (button.dataset.command === 'quickReroll') this.send?.({ type: 'quickReroll' });
      if (button.dataset.command === 'garageStep') this.send?.({ type: 'garageStep', row: index, step: Number(button.dataset.step) });
      if (button.dataset.command === 'levelTile') this.send?.({ type: 'levelTile', index });
      if (button.dataset.command === 'levelStart') this.send?.({ type: 'levelStart' });
      if (button.dataset.command === 'levelBack') this.send?.({ type: 'levelBack' });
      if (button.dataset.command === 'tier') this.send?.({ type: Number(button.dataset.step) > 0 ? 'tierUp' : 'tierDown' });
    });
  }

  private swipe: { id: number; x: number; y: number; el: HTMLElement } | null = null;
  private swiped = false;
  /** A sideways swipe on a card or the level picture steps it (left = next), like ◀ ▶. */
  private onSwipeStart = (e: PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-swipe]');
    this.swipe = el && !(e.target as HTMLElement).closest('.td-step') ? { id: e.pointerId, x: e.clientX, y: e.clientY, el } : null;
  };
  private onSwipeEnd = (e: PointerEvent) => {
    const sw = this.swipe; this.swipe = null;
    if (!sw || sw.id !== e.pointerId) return;
    const s = swipeStep(e.clientX - sw.x, e.clientY - sw.y);
    if (!s) return;
    this.swiped = true; setTimeout(() => { this.swiped = false; }, 400);
    const index = Number(sw.el.dataset.index);
    if (sw.el.dataset.swipe === 'garageStep') this.send?.({ type: 'garageStep', row: index, step: s });
    else if (sw.el.dataset.swipe === 'levelTile') {
      const to = index + s;
      if (to >= 0 && to <= Number(sw.el.dataset.max)) this.send?.({ type: 'levelTile', index: to });
    }
  };

  private box(className: string) {
    const el = document.createElement('div'); el.className = `td-box ${className}`; this.root.append(el); return el;
  }
  private place(el: HTMLElement, b: Box) {
    Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
  }
  private scope: Partial<Record<'h' | 'v', ScopeSize>> = {};
  private html(el: HTMLElement, html: string) {
    if (this.markup.get(el) === html) return;
    const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset : null;
    const scroll = el.scrollTop;
    el.innerHTML = html; this.markup.set(el, html);
    // the radar lays blips out in real pixels: remember its scope's size for the next frame
    for (const sc of el.querySelectorAll<HTMLElement>('.td-radar > .td-radar-well > .td-scope')) {
      const dir = sc.closest('.td-radar')!.classList.contains('v') ? 'v' : 'h';
      if (sc.clientWidth > 0 && sc.clientHeight > 0) this.scope[dir] = { w: sc.clientWidth, h: sc.clientHeight };
    }
    if (focused?.command) el.querySelector<HTMLElement>(`[data-command="${focused.command}"]${focused.index === undefined ? '' : `[data-index="${focused.index}"]`}`)?.focus({ preventScroll: true });
    el.scrollTop = scroll;
  }
  resize(L: TdLayout, W: number) {
    this.root.dataset.narrow = String(W < NARROW_W);
    this.root.dataset.wide = String(L.field.turned);
    this.root.style.setProperty('--map-aspect', L.field.turned ? '112 / 80' : '80 / 112');
        this.root.dataset.column = String(L.column);
    this.root.dataset.compact = String(L.column && L.UH < 360);
    this.root.dataset.objectiveCompact = String(!!L.objective && L.objective.h < 280);
    for (const [el, box] of [[this.status, L.status], [this.current, L.current], [this.event, L.brood], [this.bossBar, L.bossBar], [this.menu, L.garage], [this.loadingCard, L.garage]] as const) this.place(el, box);
    if (L.objective) this.place(this.objective, L.objective);
  }
  render(s: TdSnapshot, L: TdLayout, W: number, loading: LoadingView | null = null) {
    this.resize(L, W);
    const turned = L.field.turned, art: ArtLookup = (l, preview) => this.art?.(l, turned, preview) ?? null;
    const cardTurned = turned || W < NARROW_W, cardArt: ArtLookup = (l, preview) => this.art?.(l, cardTurned, preview) ?? null;
    this.loadingCard.hidden = !loading;
    if (loading) {
      this.html(this.loadingCard, loadingHtml(s, art));
      const p = Math.max(0, Math.min(1, loading.progress)), bar = this.loadingCard.querySelector<HTMLElement>('.td-loading-bar');
      if (bar) {
        bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        (bar.firstElementChild as HTMLElement).style.width = `${Math.max(4, p * 100).toFixed(1)}%`;
        const status = this.loadingCard.querySelector('.td-loading-status')!;
        status.firstElementChild!.textContent = `${loadingStage(p)}…`; status.lastElementChild!.textContent = `${Math.round(p * 100)}%`;
      }
    }
    const run = s.phase === 'run' && !loading, bd = s.brood;
    for (const el of [this.status, this.current]) el.hidden = !run;
    const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100))}%`;
    const f = s.flow, segK = f ? 1 - f.leftS / Math.max(1, f.leftS + s.waveElapsed) : 0;
    this.html(this.status, `<div class="td-stat"><b>${f && f.stage !== 'warm-up' ? `ROUND ${f.set}${f.sets ? `<small>/${f.sets}</small>` : ''}` : 'WARM-UP'}</b><small>${s.lull > 0 ? `Starts in ${Math.ceil(s.lull)}s` : f ? `${f.stage === 'warm-up' ? '' : `${STAGE_NAME[f.stage]} · `}${Math.ceil(f.leftS)}s` : ''}</small><div class="bar"><i style="width:${pct(segK)}"></i></div></div><div class="td-stat td-hp ${s.baseHp / s.baseMaxHp < .25 ? 'low' : ''}"><b>${Math.ceil(s.baseHp)}<small>/ ${s.baseMaxHp} BASE</small></b><div class="bar"><i style="width:${pct(s.baseHp / s.baseMaxHp)}"></i></div></div><div class="td-stat td-scrap"><b>${s.scrap}</b><small>Scrap</small></div>`);
    this.current.style.setProperty('--brood', color(bd.color));
    const incoming = bd.countdownS > 0;
    this.current.classList.toggle('incoming', incoming);
    // The radar sits here (portrait, phones); the landscape column shows it upright in the objective card instead.
    const forecast = incoming
      ? `<strong class="td-count">${Math.ceil(bd.countdownS)}s</strong><small>${esc(flowLabel(s))} · get ready</small>`
      : L.objective ? '' : radarHtml(s, 'h', this.scope.h);
    const counters = { gatling: 'blue', flame: 'red', rail: 'purple' }[s.weapon];
    this.html(this.current, `<div class="td-brood"><b>${WEAPON_NAME[s.weapon]}</b><small>strong vs ${counters}</small></div>${run ? tierHtml(s) + guideHtml(s, !!L.column) : ''}<div class="td-next">${forecast}</div>`);
    const boss = s.boss, bn = s.banner;
    let headline = '', sub = '';
    if (boss) {
      headline = boss.pending ? `Phase ${boss.phase + 1} in ${Math.ceil(boss.countdownS)}s` : boss.charge === 'warn' ? 'Ram charge incoming' : boss.charge === 'on' ? 'Ram charging' : boss.exposed ? `Exposed · ${Math.ceil(boss.windowLeftS)}s` : boss.telegraph ? `Sprint in ${Math.ceil(boss.windowLeftS)}s` : '';
      sub = boss.pending ? BOSS_ESCALATION[boss.color] : boss.charge ? 'Tier IV+ fire bogs the charge down' : 'Shift to V or sprint for ×1.5 damage';
    }
    const intro = s.fx.some((f) => f.kind === 'bossIntro' && s.t - f.t0 < f.life); // the canvas name card owns this moment
    this.bossBar.hidden = !run || !boss || boss.id === 0 || !!s.workshop;
    if (boss && boss.id) {
      this.bossBar.className = `td-box td-bossbar ${boss.color}${boss.exposed ? ' exposed' : boss.telegraph ? ' telegraph' : ''}`;
      this.html(this.bossBar, bossBarHtml(boss));
    }
    if (!headline && bn && s.t - bn.t0 < 4 && !intro) { headline = bn.text; sub = bn.sub; }
    this.event.hidden = !!L.objective || !run || incoming || !!s.workshop || !headline;
    this.html(this.event, `<b>${esc(headline)}</b><span>${esc(sub)}</span>`);
    this.objective.hidden = !L.objective || !run || !!s.workshop;
    if (L.objective) {
      const o = rideObjective(s);
      this.html(this.objective, `<div class="td-objective-main">${o.label ? `<small>${esc(o.label)}</small>` : ''}<h3>${esc(o.title)}</h3><p>${esc(o.target)}</p>${o.progress === undefined ? '' : `<div class="bar" role="progressbar" aria-label="Effort progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(o.progress * 100)}"><i style="width:${pct(o.progress)}"></i></div>`}<p class="td-objective-detail">${esc(o.detail)}</p></div>${radarHtml(s, 'v', this.scope.v)}`);
    }
    this.menu.hidden = !s.garage;
    if (s.garage) {
      const gv = s.garage;
      const sel = this.menu.querySelector<HTMLElement>('.selected');
      const previous = sel ? `${sel.dataset.command === 'levelTile' ? 'L' : ''}${sel.dataset.index}` : undefined;
      const auto = gv.breatherLeft > 0 ? `Take a breather · ${Math.ceil(gv.breatherLeft)}s` : `Pedal to start in ${Math.ceil(gv.autoLeft)}s`;
      const head = `<header><h2>${esc(gv.title)}</h2><b>${gv.stars}★</b></header><p>${esc(gv.subtitle)}</p>`;
      const results = gv.rows.some((r) => r.kind === 'next' || r.kind === 'finish');
      const body = gv.page === 'campaign'
        ? `<small>${auto} · ◀▶▲▼ choose · A ride · B back</small>${levelSelectHtml(gv, art, (l, preview) => this.art?.(l, true, preview) ?? null)}`
        : results
          ? `<small>${auto} · ▲▼ choose · A select · B start</small>${gv.rows.map((r, i) => `<button class="btn ${i === gv.sel ? 'selected' : ''}" data-command="garageRow" data-index="${i}"><span>${esc(r.name)}<small>${esc(r.desc)}</small></span></button>`).join('')}`
          : `<small>${auto} · ▲▼ choose · A select · B start</small>${modesHtml(gv, { quick: s.nextMaps?.[0] && knownLevel(s.nextMaps[0]), endless: s.nextMaps?.[1] && knownLevel(s.nextMaps[1]) }, cardArt)}`;
      this.menu.classList.toggle('td-campaign', gv.page === 'campaign');
      this.html(this.menu, head + body);
      const now = gv.page === 'campaign' ? `L${gv.levelSel}` : String(gv.sel);
      if (previous !== now) this.menu.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }
  }
}

/** A finished drag as a step: a mostly sideways move of 40+ px; left = next (+1), right = previous (-1), else 0. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 40 && Math.abs(dx) > 1.5 * Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0;
}

/** What the loading card says about where the work is. */
export function loadingStage(progress: number): string {
  return progress < 0.12 ? 'Unpacking the ground kit' : progress < 0.8 ? 'Laying the road' : progress < 1 ? 'Raising the outpost' : 'Waking the hive';
}
/** The card over the menu while a level's art is made: its picture, name, facts and a progress bar (set live by render). */
export function loadingHtml(s: TdSnapshot, art: ArtLookup): string {
  const l = s.level, run = s.run;
  const kicker = run ? (run.kind === 'campaign' ? 'Campaign' : 'Quick Ride') : 'Endless';
  const facts = run ? `${run.minutes} min · ${run.waves} waves · ${l.pads.length} pads · ${styleName(l.roadStyle ?? '')} road`
    : `Sets forever · ${l.pads.length} pads${l.roadStyle ? ` · ${styleName(l.roadStyle)} road` : ''}`;
  const name = run?.name ?? l.name;
  return `<div class="td-loading-card panel" role="status" aria-live="polite"><div class="td-loading-art">${levelImage(l, art, true)}</div>`
    + `<small>${esc(kicker)} · next up</small><h2>${esc(name)}</h2><p>${esc(facts)}</p>`
    + `<div class="td-loading-bar" role="progressbar" aria-label="Preparing the level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:4%"></i></div>`
    + `<div class="td-loading-status"><b>${loadingStage(0)}…</b><span>0%</span></div></div>`;
}

export function matchupCopy(s: Pick<TdSnapshot, 'matchup'>, element: Element): string {
  const strong = WEAPONS.reduce((a, b) => s.matchup[b][element] > s.matchup[a][element] ? b : a);
  const resisted = WEAPONS.reduce((a, b) => s.matchup[b][element] < s.matchup[a][element] ? b : a);
  return `${element.toUpperCase()} BROOD · ${WEAPON_NAME[strong].toUpperCase()} ✓ · ${WEAPON_NAME[resisted].toUpperCase()} ✗`;
}
