// Bespoke 12x12 pixel-art icons for all 45 Skill Tree nodes, 9 Branch Crests,
// 3 Boss Trophy Relics, and UI badges. Rasterised once to offscreen canvases
// with a crisp 1px dark outline and integer nearest-neighbor blitting.

import { mixHex } from './chrome';

export interface PixelIcon {
  rows: readonly string[];
  accent?: string;
}

const BASE_PAL: Record<string, string> = {
  k: '#100c18',
  w: '#fff7e6',
  g: '#ffd84a',
  G: '#b88622',
  r: '#ff6654',
  R: '#a82828',
  o: '#ff9a3c',
  b: '#5ce1ff',
  B: '#25769c',
  v: '#7dff8a',
  V: '#2d8a46',
  p: '#c98aff',
  s: '#c8d0dc',
  S: '#6a7284',
};

/** 12x12 pixel-art templates for every skill node ID (all 45 nodes across Rouleur, Puncheur, Grimpeur).
 *  Palette tokens:
 *  'c' = branch primary color, 'h' = bright branch highlight, 'd' = dark branch shade,
 *  'w' = cream/white highlight, 'g'/'G' = gold, 'r'/'R' = crimson, 'o' = orange,
 *  'b'/'B' = cyan/blue, 'v'/'V' = emerald, 's'/'S' = steel, 'k' = dark ink, '.' = transparent.
 */
export const SKILL_ICONS: Record<string, readonly string[]> = {
  // ═══ ROULEUR — BULWARK ═══
  r_b_t1: [ // Iron Frame: reinforced kite shield with crossbar
    '..hhhhhhhh..',
    '.hccccccccd.',
    '.hcwsccswcd.',
    '.hcwsccswcd.',
    '.hccwwwwccd.',
    '.hcccwwcccd.',
    '..hccwwccd..',
    '..hccwwccd..',
    '...hccccd...',
    '...hccccd...',
    '....hccd....',
    '.....dd.....',
  ],
  r_b_t2: [ // Spiked Spokes: thorny spiked wheel
    '.....ww.....',
    '.w...cc...w.',
    '..w.hccw.w..',
    '...hccccd...',
    '..hcSwwScd..',
    'wwccwggwccww',
    '..ccwggwcc..',
    '..dcSwwScd..',
    '...dccccd...',
    '..w.dccd.w..',
    '.w...dd...w.',
    '.....ww.....',
  ],
  r_b_t3a: [ // Aegis Riposte: shield bursting with shockwave rays
    'w....ww....w',
    '.w..hwwh..w.',
    '....hccw....',
    '..hhcccchh..',
    '.hccwwwwccd.',
    'wwcwgwwgwccw',
    '.dccwwwwccd.',
    '..ddccccdd..',
    '....dccd....',
    '.w..dwwd..w.',
    'w....ww....w',
    '............',
  ],
  r_b_t3b: [ // Iron Curtain: fortified crenellated wall + heal cross
    'hh..hhhh..hh',
    'cc..cccc..cc',
    'cccccccccccc',
    'cdddddddddd.',
    'ccchhwwhhccc',
    'ccchhwwhhccc',
    'ccwwwwwwwwcc',
    'ccchhwwhhccc',
    'cddddddddddc',
    'cccccccccccc',
    'dddddddddddd',
    '............',
  ],
  r_b_t4: [ // Unbreakable Peloton (Capstone): crowned golden fortress shield
    '.g...gg...g.',
    '.gg.gggg.gg.',
    '.gggggggggg.',
    '..hccccccd..',
    '.hcwwwwwwcd.',
    '.hcwggggwcd.',
    '.hcwgwwgwcd.',
    '..hcggggcd..',
    '..hccccccd..',
    '...hccccd...',
    '....hccd....',
    '.....gg.....',
  ],

  // ═══ ROULEUR — MOMENTUM ═══
  r_m_t1: [ // Diesel Cadence: spinning crank & pedal cadence ring
    '....hhhh....',
    '..hhcccchh..',
    '.hcc....ccd.',
    '.hc..ww..cd.',
    'hc..wccw..cd',
    'hc..wggw..cd',
    'hc..wccw..cd',
    '.dc..ww..cd.',
    '.dcc....ccd.',
    '..ddccccdd..',
    '....dddd....',
    '............',
  ],
  r_m_t2: [ // Drafting Blades: twin toothed chainring sawblades
    '....w..w....',
    '..w.hchc.w..',
    '.w.hccccd.w.',
    '..hccwwccd..',
    'w.hcw..wcd.w',
    '..hcw..wcd..',
    '..dcw..wcd..',
    'w.dcw..wcd.w',
    '..dccwwccd..',
    '.w.dccccd.w.',
    '..w.dcdc.w..',
    '....w..w....',
  ],
  r_m_t3a: [ // Turbine Ring: electrified spinning ring
    '....b..w....',
    '..bbhchcbb..',
    '.b.hccccd.b.',
    'b.hccbbccd.b',
    '..hcbwwbcd..',
    'w.hcbwwbcd.w',
    '..dcbwwbcd..',
    'b.dccbbccd.b',
    '.b.dccccd.b.',
    '..bbdcdbbb..',
    '....w..b....',
    '............',
  ],
  r_m_t3b: [ // Slipstream Pull: inward spiral vortex
    '....hhhh....',
    '..hhcccchh..',
    '.hcc....cch.',
    'hc..hhhh..ch',
    'hc.hc..ch.cd',
    'hc.hcwwch.cd',
    'dc.hcwwch.cd',
    'dc.dc..cd.cd',
    'dc..dddd..cd',
    '.dcc....ccd.',
    '..ddccccdd..',
    '....dddd....',
  ],
  r_m_t4: [ // Perpetual Flywheel (Capstone): blazing solar chainring
    '.o...ww...o.',
    '..o.ooho.o..',
    '.o.ooccoo.o.',
    '..oocggcoo..',
    'o.ocgwwgco.o',
    'w.ocw..wco.w',
    'w.ocw..wco.w',
    'o.ocgwwgco.o',
    '..oocggcoo..',
    '.o.ooccoo.o.',
    '..o.oooo.o..',
    '.o...ww...o.',
  ],

  // ═══ ROULEUR — FEED ZONE ═══
  r_f_t1: [ // Extra Bidon: cycling water bottle with nozzle
    '....ssss....',
    '....swws....',
    '...ssssss...',
    '..hcccccch..',
    '.hccwwwwccd.',
    '.hccccccccd.',
    '.hcwwwwwwcd.',
    '.hccccccccd.',
    '.hccddddccd.',
    '.hccccccccd.',
    '..dddddddd..',
    '............',
  ],
  r_f_t2: [ // Iso-Mix: sparkling electrolyte flask
    '....ssss....',
    '....swws....',
    '...hcccch...',
    '..hccwwccd..',
    '.hccw..wccd.',
    '.hccvwwvccd.',
    '.hcvvvvvvcd.',
    '.hcvwvvvccd.',
    '.hcvvvvvvcd.',
    '..dvvvvvvd..',
    '...dddddd...',
    '............',
  ],
  r_f_t3a: [ // Sugar Rush: lightning-charged gel packet
    '......gg....',
    '.....ggw....',
    '....ggw.....',
    '...gggggg...',
    '..hcwwwwch..',
    '..hccggccd..',
    '..hccggccd..',
    '..hccwwccd..',
    '...dccccd...',
    '...dggccd...',
    '....gg......',
    '............',
  ],
  r_f_t3b: [ // Second Wind: rising emerald/gold phoenix wings
    'w..........w',
    'ww........ww',
    'hww......wwh',
    '.hccw..wcch.',
    '.hcccwwccch.',
    '..hccggcch..',
    '..hccwwcch..',
    '...hcggch...',
    '....hwwh....',
    '....gccg....',
    '.....gg.....',
    '............',
  ],
  r_f_t4: [ // Bottomless Musette (Capstone): golden glowing feed bag + shield aura
    '....gggg....',
    '...g....g...',
    '..g.bbbb.g..',
    '.g.bwwwwb.g.',
    '.gggggggggg.',
    '.gccwwwwccg.',
    '.gccwggwccg.',
    '.gccwwwwccg.',
    '.gccccccccg.',
    '.gddddddddg.',
    '..gggggggg..',
    '............',
  ],

  // ═══ PUNCHEUR — BREAKAWAY ═══
  p_b_t1: [ // Snap Attack: piercing crit chevron bolt
    '........ww..',
    '.......hww..',
    '......hccw..',
    '.....hcccw..',
    '....hccww...',
    '..hhccww....',
    '.hcccww.....',
    'hcccww......',
    'dddww.......',
    '..ww........',
    '.w..........',
    '............',
  ],
  p_b_t2: [ // Redline Surge: revving redline tachometer dial
    '...hhhhhh...',
    '..hcrrrrch..',
    '.hcrr..rrch.',
    '.hcr....rrh.',
    'hcc..ww..rrd',
    'hcc..wrr.rrd',
    'hcc..ww..rrd',
    '.dcc....rrd.',
    '.dccc..rrrd.',
    '..dddddddd..',
    '............',
    '............',
  ],
  p_b_t3a: [ // Solo Breakaway: razor-sharp crosshair dagger
    '.....ww.....',
    '....hwwh....',
    '....hccw....',
    '....hccw....',
    '.r..hccw..r.',
    'rrr.hccw.rrr',
    '.r..hccw..r.',
    '...gggggg...',
    '.....gg.....',
    '.....gg.....',
    '....gggg....',
    '............',
  ],
  p_b_t3b: [ // Pack Finisher: explosive radial shrapnel starburst
    'w....rr....w',
    '.w..ooor..w.',
    '..o.oggo.o..',
    '...ogwwgo...',
    'r.ogwwwwgo.r',
    'rrgwwwwwwgrr',
    'r.ogwwwwgo.r',
    '...ogwwgo...',
    '..o.oggo.o..',
    '.w..rooo..w.',
    'w....rr....w',
    '............',
  ],
  p_b_t4: [ // Photo Finish (Capstone): golden winged stopwatch / checkered flash
    '....gggg....',
    '..w.gggg.w..',
    '.wwhccccdww.',
    'wwhcwggwcdww',
    '.whcwgwwcdw.',
    '..hcwggwcd..',
    '..hccwwccd..',
    '..hccggccd..',
    '...hccccd...',
    '....gggg....',
    '.....gg.....',
    '............',
  ],

  // ═══ PUNCHEUR — STORMCRAFT ═══
  p_s_t1: [ // Static Charge: jagged lightning bolt
    '......www...',
    '.....hccw...',
    '....hccw....',
    '...hccw.....',
    '..hcccccw...',
    '..hcccccw...',
    '.....hccw...',
    '....hccw....',
    '...hccw.....',
    '..hccw......',
    '..www.......',
    '............',
  ],
  p_s_t2: [ // Shatter Volley: 3-way piercing storm shard fan
    '.....ww.....',
    '.w..hccw..w.',
    '.hw.hccw.wh.',
    '..hcwccwch..',
    '..hccwwcch..',
    '...hcwwch...',
    '...hcwwch...',
    '....hwwh....',
    '....hccw....',
    '.....cc.....',
    '.....dd.....',
    '............',
  ],
  p_s_t3a: [ // Ball Lightning: crackling plasma sphere
    '....b..b....',
    '..bbhwwhbb..',
    '.b.hccccd.b.',
    'b.hcwwwwcd.b',
    '.bhcwbbwcdh.',
    '.bhcwbwwcdh.',
    '.bhcwbbwcdh.',
    'b.dcwwwwcd.b',
    '.b.dccccd.b.',
    '..bbdccdbb..',
    '....b..b....',
    '............',
  ],
  p_s_t3b: [ // Forked Arc: Y-splitting twin lightning arcs
    '.ww......ww.',
    '..hww..wwh..',
    '...hccwch...',
    '....hwwh....',
    '....hccw....',
    '....hwwh....',
    '...hccwch...',
    '..hww..wwh..',
    '.ww......ww.',
    'w..........w',
    '............',
    '............',
  ],
  p_s_t4: [ // Thunderhead (Capstone): stormcloud unleashing golden skybolt
    '...ssssss...',
    '..swwwwwws..',
    '.swwsssswws.',
    '.ssssssssss.',
    '..SSggggSS..',
    '....ggg.....',
    '...gggw.....',
    '..gggggg....',
    '....gggw....',
    '...ggw......',
    '..ww........',
    '............',
  ],

  // ═══ PUNCHEUR — SLIPSTREAM ═══
  p_l_t1: [ // Light Wheels: aero winged wheel
    '......wwww..',
    '....hhcccw..',
    '..hhccww....',
    '.hcc..ww....',
    '.hc.hccw....',
    'hc.hcwwch...',
    'hc.hcwwch...',
    '.dc.dccd....',
    '.dcc..dd....',
    '..ddccdd....',
    '....dd......',
    '............',
  ],
  p_l_t2: [ // Lead-Out Dash: speed-trail sprint boot
    '....hhhh....',
    '...hcccch...',
    '..hccwwcc...',
    'ww.hccccd...',
    '....hccccd..',
    'www..hccccd.',
    '.....hccccch',
    'ww..hccccccw',
    '....dddddddd',
    '............',
    '............',
    '............',
  ],
  p_l_t3a: [ // Phantom Cadence: twin spectral ghost silhouettes
    '..hh....ww..',
    '.hccw..hccw.',
    '.hccw..hccw.',
    '..cc....cc..',
    '.hccc..hccc.',
    'hccccwhccccw',
    'hccccwhccccw',
    '.dccc..dccc.',
    '.dc.c..dc.c.',
    '.d..d..d..d.',
    '............',
    '............',
  ],
  p_l_t3b: [ // Vampiric Sprint: crimson droplet with white fang glint
    '.....rr.....',
    '....rrrr....',
    '...rrwwrr...',
    '..rrwrrwrr..',
    '..rrrrrrrr..',
    '.rrrwrrrrrr.',
    '.rrrwrrrrrr.',
    '.rrrrrrrrrr.',
    '..rRRRRRRr..',
    '...RRRRRR...',
    '....RRRR....',
    '............',
  ],
  p_l_t4: [ // Untouchable Crit (Capstone): radiant phantom star-shield
    '.....ww.....',
    '....hwwh....',
    '...hccccd...',
    '.wwhcggcdww.',
    'wwhcgwwgcdww',
    '.wwhcggcdww.',
    '...hccccd...',
    '....hwwh....',
    '...hccwcd...',
    '..ww....ww..',
    '............',
    '............',
  ],

  // ═══ GRIMPEUR — CRUCIBLE ═══
  g_c_t1: [ // Ember Crank: roaring flame crest
    '.....oo.....',
    '....ooor....',
    '...ooworr...',
    '..oowwworr..',
    '..oowwworr..',
    '.rrwwgwwrrr.',
    '.rrwgggwrrr.',
    '.rrwgggwrrr.',
    '..rrgggrrr..',
    '...rRRRRr...',
    '....RRRR....',
    '............',
  ],
  g_c_t2: [ // Cinder Wake: scorching ember wave
    '........oo..',
    '......oowr..',
    '....oowrrr..',
    '..oowrr..o..',
    '.oowrr.oowr.',
    'oowrr.oowrr.',
    'rwrr.oowrr..',
    'rrr.rwrrr...',
    '.rr.rrrr....',
    '..R.RRR.....',
    '............',
    '............',
  ],
  g_c_t3a: [ // Pyre Detonation: erupting magma bomb
    '.....ww.....',
    '....o..o....',
    '...rgggg....',
    '..rrooorr...',
    '.rroowoorr..',
    '.rrowwworr..',
    '.rrowwworr..',
    '.rroowoorr..',
    '..rrooorr...',
    '...rrrrr....',
    '....RRR.....',
    '............',
  ],
  g_c_t3b: [ // Magma Slam: molten warhammer impact
    '..rrrrrrrr..',
    '.roowwwwoor.',
    '.rrowggworr.',
    '.rroowwoorr.',
    '..rrrrrrrr..',
    '.....ss.....',
    '.....ss.....',
    '....ssss....',
    '..oo.ss.oo..',
    '.ooorssrooo.',
    'rrrrrssrrrrr',
    '............',
  ],
  g_c_t4: [ // Volcanic Ascent (Capstone): erupting caldera peak
    '...o.ww.o...',
    '..ooowwooo..',
    '...roggor...',
    '....rgg.....',
    '...srrrrs...',
    '..ssroorss..',
    '.sssroorsss.',
    '.sssrrrrsss.',
    'sssssrrsssss',
    'SSSSSSSSSSSS',
    '............',
    '............',
  ],

  // ═══ GRIMPEUR — BIG RING ═══
  g_r_t1: [ // Heavy Gear: massive steel/gold cogwheel
    '....gggg....',
    '..g.gccg.g..',
    '.gggccccggg.',
    '..gccwwccg..',
    'ggccw..wccgg',
    'ggccw..wccgg',
    'ggccw..wccgg',
    '..gccwwccg..',
    '.gggccccggg.',
    '..g.gccg.g..',
    '....gggg....',
    '............',
  ],
  g_r_t2: [ // Guard Breaker: cracked shield split in half
    '.hhhh..hhhh.',
    'hccc....cccd',
    'hccw.gg.wccd',
    'hcc..gg..ccd',
    '.hcc.gg.ccd.',
    '.hcc.gg.ccd.',
    '..hc.gg.cd..',
    '..hc.gg.cd..',
    '...h.gg.d...',
    '....gggg....',
    '.....gg.....',
    '............',
  ],
  g_r_t3a: [ // Anvil Drop: heavy blacksmith anvil crashing down
    '....wwww....',
    '.....ww.....',
    'ssssssssssss',
    '.swwwwwwwws.',
    '..ssssssss..',
    '....ssss....',
    '...ssssss...',
    '..sSSSSSSs..',
    '.SSSSSSSSSS.',
    'oo........oo',
    '.ooo....ooo.',
    '............',
  ],
  g_r_t3b: [ // Sunder Cleave: triple sweeping battle-arc
    '........ww..',
    '......hwww..',
    '....hcccww..',
    '..hccww.cw..',
    '.hccw..hccw.',
    'hccw..hccw..',
    'dcw..hccw...',
    '....hccw....',
    '...hccw.....',
    '..dcww......',
    '..ww........',
    '............',
  ],
  g_r_t4: [ // Titan Torque (Capstone): radiant golden oversized sprocket
    '.w..gggg..w.',
    '..ggwwwwgg..',
    '.ggwggggwgg.',
    'ggwgwwwwgwgg',
    'gggwggggwggg',
    'ggwgw..wgwgg',
    'ggwgw..wgwgg',
    'gggwggggwggg',
    'ggwgwwwwgwgg',
    '.ggwggggwgg.',
    '..ggwwwwgg..',
    '.w..gggg..w.',
  ],

  // ═══ GRIMPEUR — KING OF THE MOUNTAINS ═══
  g_k_t1: [ // Summit Sight: red polka-dot peak flag
    '....rr......',
    '....rrww....',
    '....rrrrrr..',
    '....rrwwrr..',
    '....rrrr....',
    '....ss......',
    '...ssss.....',
    '..sswwss....',
    '.sswwwwss...',
    'ssssssssss..',
    'SSSSSSSSSS..',
    '............',
  ],
  g_k_t2: [ // High Altitude: mountain crest with glowing heart/shield
    '.....ww.....',
    '....wwww....',
    '...wwssww...',
    '..ssrrrrss..',
    '.ssrrwwrrss.',
    '.ssrrrrrrss.',
    'ssssrrrrssss',
    'sssssrrsssss',
    'ssssssssssss',
    'SSSSSSSSSSSS',
    '............',
    '............',
  ],
  g_k_t3a: [ // Hors Categorie: steep jagged HC peak with lightning aura
    '.....gg.....',
    '....gwwg....',
    '...ggwwgg...',
    '..r.wwww.r..',
    '.rr.wrrw.rr.',
    '..ssrrrrss..',
    '.ssrrwwrrss.',
    'ssrrrrrrrrss',
    'ssssssssssss',
    'SSSSSSSSSSSS',
    '............',
    '............',
  ],
  g_k_t3b: [ // Polka Executioner: crimson executioner greataxe
    '..rrr..rrr..',
    '.rwwr..rwwr.',
    'rwwwsssswwwr',
    'rwwwsssswwwr',
    '.rrr.ss.rrr.',
    '.....ss.....',
    '.....ss.....',
    '.....ss.....',
    '....ssss....',
    '....gggg....',
    '.....gg.....',
    '............',
  ],
  g_k_t4: [ // Crown of the Col (Capstone): radiant polka-dot mountain crown
    '............',
    'w....ww....w',
    'gg..gggg..gg',
    'ggg.gggg.ggg',
    'ggwggggggwgg',
    'ggrrggggrrgg',
    'gggrrgggrrgg',
    'gggggggggggg',
    'gwwwwwwwwwwg',
    'GGGGGGGGGGGG',
    '............',
    '............',
  ],
};

/** 9 Branch Crests (compact emblems for Camp cards & branch headers). */
export const BRANCH_CRESTS: Record<string, readonly string[]> = {
  bulwark: SKILL_ICONS.r_b_t1,
  momentum: SKILL_ICONS.r_m_t2,
  feedzone: SKILL_ICONS.r_f_t1,
  breakaway: SKILL_ICONS.p_b_t1,
  stormcraft: SKILL_ICONS.p_s_t1,
  slipstream: SKILL_ICONS.p_l_t1,
  crucible: SKILL_ICONS.g_c_t1,
  bigring: SKILL_ICONS.g_r_t1,
  kom: SKILL_ICONS.g_k_t4,
};

/** 3 Boss Trophy Relics (awarded on first boss defeat per run). */
export const RELIC_ICONS: Record<string, readonly string[]> = {
  rouleur: SKILL_ICONS.r_m_t4,   // Diesel Flywheel
  puncheur: SKILL_ICONS.p_s_t4,  // Spark-Plug Cassette
  grimpeur: SKILL_ICONS.g_r_t4,  // Col Crest Pinion
};

/** UI utility icons (padlock, fork split, keystone star, pace bias icons). */
export const UI_ICONS: Record<'lock' | 'fork' | 'keystone' | 'cool' | 'cruise' | 'push', readonly string[]> = {
  lock: [
    '....ssss....',
    '...s....s...',
    '...s....s...',
    '..gggggggg..',
    '..gwwwwwwg..',
    '..gggkgggk..',
    '..gggkkggg..',
    '..gggkkggg..',
    '..gggggggg..',
    '..GGGGGGGG..',
    '............',
    '............',
  ],
  fork: [
    '.ww......ww.',
    'wwww....wwww',
    '.cc......cc.',
    '..cc....cc..',
    '...cc..cc...',
    '....cccc....',
    '.....cc.....',
    '.....cc.....',
    '.....cc.....',
    '.....dd.....',
    '............',
    '............',
  ],
  keystone: [
    '.....gg.....',
    '....gwwg....',
    '...gwwwwg...',
    '..ggwggwgg..',
    '.ggwwggwwgg.',
    'ggwwwwwwwwgg',
    '.ggwwggwwgg.',
    '..ggwggwgg..',
    '...gwwwwg...',
    '....gwwg....',
    '.....gg.....',
    '............',
  ],
  cool: [
    '.....bb.....',
    '..b..bb..b..',
    '...b.ww.b...',
    '....bwwb....',
    'bbwwbwwbwwbb',
    '....bwwb....',
    '...b.ww.b...',
    '..b..bb..b..',
    '.....bb.....',
    '............',
    '............',
    '............',
  ],
  cruise: [
    '....gggg....',
    '..ggwwwwgg..',
    '.ggw....wgg.',
    '.gw..gg..wg.',
    'ggw.gwwg.wgg',
    'ggw.gwwg.wgg',
    '.gw..gg..wg.',
    '.ggw....wgg.',
    '..ggwwwwgg..',
    '....gggg....',
    '............',
    '............',
  ],
  push: [
    '.....oo.....',
    '....ooor....',
    '...ooworr...',
    '..rrwwwrrr..',
    '.rrwwgwwrrr.',
    '.rrwgggwrrr.',
    '..rrgggrrr..',
    '...rrrrrr...',
    '....RRRR....',
    '............',
    '............',
    '............',
  ],
};

const iconCache = new Map<string, HTMLCanvasElement>();

export function clearSkillArtCache() {
  iconCache.clear();
}

function compileIcon(rows: readonly string[], accent: string, dim: boolean, lockedOut: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const h = rows.length, w = rows[0]?.length ?? 12;
  const cw = w + 2, ch = h + 2;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d')!;
  const hi = mixHex(accent, '#ffffff', 0.42);
  const dark = mixHex(accent, '#0a0812', 0.45);
  const pal: Record<string, string> = { ...BASE_PAL, c: accent, h: hi, d: dark };

  // 1px dark outline behind all opaque pixels
  g.fillStyle = '#0d0916';
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      if (row[x] === '.' || !pal[row[x]]) continue;
      g.fillRect(x, y + 1, 3, 1);
      g.fillRect(x + 1, y, 1, 3);
    }
  }
  // Fill pixel colors (desaturated when dim or lockedOut)
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch0 = row[x];
      if (ch0 === '.' || !pal[ch0]) continue;
      let col = pal[ch0];
      if (lockedOut) col = mixHex(col, '#261b26', 0.72);
      else if (dim) col = mixHex(col, '#1d1828', 0.52);
      g.fillStyle = col;
      g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  // Diagonal crimson strike on locked-out fork icons
  if (lockedOut) {
    g.fillStyle = '#c8424a';
    for (let i = 1; i < Math.min(cw, ch) - 1; i++) {
      g.fillRect(i, i, 1, 1);
      g.fillRect(cw - 1 - i, i, 1, 1);
    }
  }
  return c;
}

export function getSkillIconCanvas(
  id: string,
  accent: string,
  opts: { dim?: boolean; lockedOut?: boolean } = {},
): HTMLCanvasElement | null {
  const rows = SKILL_ICONS[id] ?? BRANCH_CRESTS[id] ?? RELIC_ICONS[id] ?? (UI_ICONS as Record<string, readonly string[]>)[id];
  if (!rows) return null;
  const key = `${id}|${accent}|${opts.dim ? 1 : 0}|${opts.lockedOut ? 1 : 0}`;
  let cached = iconCache.get(key);
  if (cached) return cached;
  const built = compileIcon(rows, accent, !!opts.dim, !!opts.lockedOut);
  if (built) iconCache.set(key, built);
  return built;
}

/** Draw a crisp integer-scaled pixel icon centered in the target box. */
export function drawSkillIcon(
  g: CanvasRenderingContext2D,
  id: string,
  cx: number,
  cy: number,
  maxSize: number,
  accent: string,
  opts: { dim?: boolean; lockedOut?: boolean } = {},
) {
  const img = getSkillIconCanvas(id, accent, opts);
  if (!img) return;
  const sc = Math.max(1, Math.floor(maxSize / Math.max(img.width, img.height)));
  const dw = img.width * sc, dh = img.height * sc;
  g.save();
  g.imageSmoothingEnabled = false;
  g.drawImage(img, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);
  g.restore();
}
