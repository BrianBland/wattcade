import type { ControlHint, GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import {
  ERAS, GENS, LEGS, MONOS, NEWS, PEPTIDES, PEPTIDE_NEWS, SPECIALS, UPG_TIERS, VIBES, eraOfGen,
  type PeptideDef, type SpecialId,
} from './data';
import { equivalence, fmtJ, fmtW, genBaseCost, genCost, genOut, kardashev, legCost, monoCost, type EconParams } from './econ';

export interface HamsterOpts { seed?: number; autopilot?: boolean; preset?: { gens?: number[]; bank?: number } }

export interface HamsterSave {
  v: 1; gens: number[]; upg: string[]; bank: number; life: number; all: number; seeds: number; rebirths: number;
  vibes: string[]; vibesOn: string[]; miles: string[]; peakW: number; rideS: number;
  pepUses: number; goldens: number; strikes: number; trials: number; maxEra: number; unlocks: string[]; lastPep?: string;
}

export type TabId = 'gens' | 'upgrades' | 'market' | 'vibes' | 'rebirth';
export interface ShopItem {
  key: string; name: string; desc: string; cost: number; costLabel: string; can: boolean;
  owned?: number | boolean; tag?: string; locked?: boolean; on?: boolean;
}
export interface Toast { id: number; t: number; text: string; kind: 'info' | 'milestone' | 'era' | 'event' | 'bad' }
export interface Cue { id: number; name: string }
export interface EffectView { id: string; label: string; left: number; total: number; kind: string; mult: number }
export interface HamsterSnapshot {
  t: number; bank: number; rate: number; hamRate: number; legRate: number; k: number; equiv: string;
  mono: number; monoCap: number; monoTrend: number; era: number; eraName: string; eraBlurb: string;
  gens: Array<{ name: string; owned: number }>; totalOwned: number;
  tabs: Array<{ id: TabId; label: string; badge: boolean }>; tab: TabId; row: number; items: ShopItem[];
  toasts: Toast[]; cues: Cue[]; news: { id: number; text: string };
  effects: EffectView[];
  golden: { left: number; progress: number; need: number; x: number } | null;
  strike: { phase: 'warn' | 'active'; left: number; progress: number; need: number } | null;
  trial: { phase: 'offer' | 'active'; left: number; compliance: number } | null;
  rage: { left: number; progress: number; need: number } | null;
  spin: { left: number; progress: number; need: number; rpm: number } | null;
  cadence: number; power: number; zone: number; hardZone: number; unionOn: boolean;
  pepUses: number; giant: boolean; glow: boolean; vibesOn: string[]; buySeq: number; rebirths: number; seeds: number;
  potentialSeeds: number; armed: boolean;
  hooks: { storm: boolean; golden: boolean };
}

type EffKind = 'all' | 'ham' | 'leg' | 'cheap' | 'nodecay';
interface Effect { id: string; label: string; kind: EffKind; mult: number; from: number; until: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const TAB_LABEL: Record<TabId, string> = { gens: 'Hamsters', upgrades: 'Upgrades', market: 'Black Market', vibes: 'Vibes', rebirth: 'Reincarnate' };

export function createHamsterSim(ctx: GameContext, opts: HamsterOpts = {}): GameSim {
  const T = ctx.tuning;
  const tun = {
    out0: T.num('out0', 1.5, 0.1, 100, 0.1, 'Hamster base output (W)'),
    outStep: T.num('outStep', 11, 2, 30, 0.5, 'Output ratio between generator tiers'),
    cost0: T.num('cost0', 400, 10, 1e5, 10, 'Hamster base cost (J)'),
    costStep: T.num('costStep', 13, 2, 40, 0.5, 'Cost ratio between generator tiers'),
    growth: T.num('growth', 1.15, 1.01, 1.5, 0.01, 'Per-owned cost growth'),
    unionCadence: T.num('unionCadence', 35, 0, 90, 1, 'Hamsters only run while your cadence is at least this (rpm)'),
    zone1Eff: T.num('zone1Eff', 0.5, 0, 1, 0.05, 'Hamster efficiency in Zone 1'),
    monoBase: T.num('monoBase', 2, 1, 10, 0.5, 'Base Mind-Numbing cap'),
    monoGainPerMin: T.num('monoGainPerMin', 0.4, 0.05, 5, 0.05, 'Mind-Numbing gain per minute in Zone 2'),
    monoDecayLowPerMin: T.num('monoDecayLowPerMin', 0.3, 0, 10, 0.05, 'Mind-Numbing decay per minute below zone / coasting'),
    monoDecayHighPerMin: T.num('monoDecayHighPerMin', 0.8, 0, 10, 0.05, 'Mind-Numbing decay per minute above zone'),
    steadyRpm: T.num('steadyRpm', 7, 1, 30, 1, 'Cadence wobble (rpm) still counted as steady'),
    goldenMinS: T.num('goldenMinS', 150, 20, 1800, 10, 'Golden hamster min interval (s)'),
    goldenMaxS: T.num('goldenMaxS', 300, 20, 3600, 10, 'Golden hamster max interval (s)'),
    goldenStayS: T.num('goldenStayS', 25, 5, 120, 1, 'Golden hamster visible for (s)'),
    goldenCatchS: T.num('goldenCatchS', 6, 1, 30, 1, 'Seconds of Zone 4+ to catch a golden hamster'),
    strikeMinS: T.num('strikeMinS', 900, 60, 7200, 30, 'Strike min interval (s)'),
    strikeMaxS: T.num('strikeMaxS', 1500, 60, 7200, 30, 'Strike max interval (s)'),
    strikeS: T.num('strikeS', 60, 10, 300, 5, 'Strike length (s)'),
    strikeNeedS: T.num('strikeNeedS', 35, 5, 300, 1, 'Seconds of Zone 3+ to break a strike'),
    strikeGrade: T.num('strikeGrade', 3, 0, 10, 0.5, 'Extra grade % during a strike'),
    trialMinS: T.num('trialMinS', 1200, 60, 7200, 30, 'Clinical trial min interval (s)'),
    trialMaxS: T.num('trialMaxS', 1800, 60, 7200, 30, 'Clinical trial max interval (s)'),
    trialS: T.num('trialS', 180, 30, 900, 10, 'Clinical trial ERG block length (s)'),
    trialFtp: T.num('trialFtp', 0.8, 0.4, 1.2, 0.05, 'Clinical trial ERG target (FTP fraction)'),
    rageChance: T.num('rageChance', 0.3, 0, 1, 0.05, 'Trenbalone roid-rage chance'),
    rageNeedS: T.num('rageNeedS', 8, 1, 60, 1, 'Seconds of Zone 4+ to calm a roid-raging hamster'),
    spinMinS: T.num('spinMinS', 360, 60, 3600, 30, 'Spin class min interval (s)'),
    spinMaxS: T.num('spinMaxS', 600, 60, 3600, 30, 'Spin class max interval (s)'),
    spinS: T.num('spinS', 45, 10, 180, 5, 'Spin class window (s)'),
    spinNeedS: T.num('spinNeedS', 20, 5, 120, 1, 'Seconds at spin cadence to ace a spin class'),
    spinRpm: T.num('spinRpm', 95, 60, 140, 1, 'Spin class cadence floor (rpm)'),
    inertiaPerEra: T.num('inertiaPerEra', 0.15, 0, 1, 0.05, 'Flywheel grade % added per era'),
    seedBonus: T.num('seedBonus', 0.05, 0, 1, 0.01, 'Production bonus per karmic seed'),
    seedUnitJ: T.num('seedUnitJ', 1e27, 1e15, 1e40, undefined, 'Life energy for the first karmic seed (seeds = cbrt(E/unit))'),
  };
  const econ = (): EconParams => ({ out0: tun.out0(), outStep: tun.outStep(), cost0: tun.cost0(), costStep: tun.costStep(), growth: tun.growth() });

  // ---------- persistent state ----------
  const fresh = (): HamsterSave => ({
    v: 1, gens: GENS.map(() => 0), upg: [], bank: 0, life: 0, all: 0, seeds: 0, rebirths: 0, vibes: [], vibesOn: [], miles: [],
    peakW: 0, rideS: 0, pepUses: 0, goldens: 0, strikes: 0, trials: 0, maxEra: 0, unlocks: [],
  });
  const loaded = ctx.load<HamsterSave>();
  const S: HamsterSave = { ...fresh(), ...(loaded && loaded.v === 1 ? loaded : {}) };
  S.gens = GENS.map((_, i) => S.gens[i] ?? 0);
  if (opts.preset?.gens) opts.preset.gens.forEach((n, i) => { if (i < S.gens.length) S.gens[i] = n; });
  if (opts.preset?.bank) S.bank = opts.preset.bank;
  const upg = new Set(S.upg), miles = new Set(S.miles), unlocks = new Set(S.unlocks), vibes = new Set(S.vibes), vibesOn = new Set(S.vibesOn);
  const autopilot = !!opts.autopilot;

  // ---------- transient ----------
  let t = 0, mono = 1, monoTrend = 0, cadEma = 0, rate = 0, hamRate = 0, legRate = 0, unionOn = false;
  let milesAt = 0, badgeAt = -1, badges: Partial<Record<TabId, boolean>> = {};
  let tab: TabId = 'gens', row = 0, armedUntil = -1, buySeq = 0, saveAt = 30, autoAt = 2, apAt = 1;
  const effects: Effect[] = [];
  const tol: Record<string, number> = {};
  const toasts: Toast[] = []; const cues: Cue[] = []; let toastId = 0, cueId = 0;
  let news = { id: 0, text: NEWS[0][0] }, newsAt = 14;
  let golden: { until: number; progress: number; x: number } | null = null, nextGolden = 40;
  let strike: { phase: 'warn' | 'active'; until: number; progress: number } | null = null, nextStrike = Infinity;
  let trial: { phase: 'offer' | 'active'; until: number; ok: number; total: number } | null = null, nextTrial = Infinity;
  let rage: { until: number; progress: number } | null = null;
  let spin: { until: number; progress: number } | null = null, nextSpin = Infinity;
  const pending: Array<{ type: string; i?: number }> = [];
  const sess = { energy: 0, peakW: 0, peakK: -0.6, gens: 0, upgs: 0, maxMono: 1, goldens: 0, peps: 0, strikesWon: 0, strikesLost: 0, trials: 0, miles: 0, z2S: 0, startEra: S.maxEra };

  ctx.resistance.useVirtualGears(true);

  const toast = (text: string, kind: Toast['kind'] = 'info') => { toasts.push({ id: ++toastId, t, text, kind }); if (toasts.length > 12) toasts.shift(); };
  const cue = (name: string) => { cues.push({ id: ++cueId, name }); if (cues.length > 24) cues.shift(); };
  const setNews = (text: string) => { news = { id: news.id + 1, text }; newsAt = t + 16; };
  const randIn = (a: number, b: number) => a + (b - a) * ctx.rng();
  const has = (sp: SpecialId) => upg.has(`sp:${sp}`);

  // ---------- economy ----------
  const era = () => { let e = 0; S.gens.forEach((n, i) => { if (n > 0) e = Math.max(e, eraOfGen(i)); }); return e; };
  const tiersOwned = (i: number) => UPG_TIERS.reduce((a, _, k) => a + (upg.has(`g:${i}:${k}`) ? 1 : 0), 0);
  const genMult = (i: number) => Math.pow(2, tiersOwned(i)) * (has('cloning') ? 1.5 : 1);
  const legsOwned = () => LEGS.reduce((a, _, k) => a + (upg.has(`leg:${k}`) ? 1 : 0), 0);
  const monosOwned = () => MONOS.reduce((a, _, k) => a + (upg.has(`mono:${k}`) ? 1 : 0), 0);
  const monoCap = () => tun.monoBase() + monosOwned();
  const globalMult = () => (1 + 0.01 * miles.size) * (1 + tun.seedBonus() * S.seeds);
  const effMult = (kind: EffKind) => effects.reduce((m, e) => (e.kind === kind && t >= e.from ? m * e.mult : m), 1);
  const discount = () => effMult('cheap');
  const hamBase = () => { const e = econ(); let s = 0; S.gens.forEach((n, i) => { if (n) s += n * genOut(e, i) * genMult(i); }); return s; };
  const revealed = (i: number) => i === 0 || S.gens[i] > 0 || S.gens[i - 1] > 0 || S.life >= genBaseCost(econ(), i) * 0.3;
  const specialCost = (sp: typeof SPECIALS[number]) => genBaseCost(econ(), sp.era * 3 + 1) * 6;
  const vibeCost = (v: typeof VIBES[number]) => genBaseCost(econ(), v.era * 3) * 2;
  const pepCost = (p: PeptideDef) => Math.max(genBaseCost(econ(), p.era * 3) * 0.5, rate * p.costSec) * (has('dealer') ? 0.6 : 1);
  const upgCost = (i: number, k: number) => genBaseCost(econ(), i) * UPG_TIERS[k].costX;
  const potentialSeeds = () => Math.floor(Math.cbrt(S.life / tun.seedUnitJ()));

  function computeRate(b: Readonly<{ power3s: number; cadence3s: number; effortZone: number }>) {
    unionOn = b.cadence3s >= tun.unionCadence() && b.cadence3s > 0;
    const zoneEff = b.effortZone <= 1 ? tun.zone1Eff() : 1;
    const strikeMult = strike?.phase === 'active' ? 0.1 : 1;
    const rageMult = rage ? -0.25 : 1;
    hamRate = unionOn ? hamBase() * zoneEff * effMult('ham') * strikeMult * rageMult : 0;
    legRate = Math.max(0, b.power3s) * Math.pow(2, legsOwned()) * effMult('leg');
    const m = globalMult() * mono * effMult('all');
    hamRate *= m; legRate *= m;
    rate = hamRate + legRate;
  }

  // ---------- milestones / unlocks ----------
  function milestone(id: string, text: string) {
    if (miles.has(id)) return;
    miles.add(id); sess.miles++;
    toast(`🏆 ${text}  (+1% morale)`, 'milestone'); cue('shrine');
    ctx.emit({ type: 'milestone', data: { id } });
  }
  function unlock(id: string, text: string) {
    if (unlocks.has(id)) return;
    unlocks.add(id); toast(`🔓 ${text}`, 'event'); cue('reward');
  }
  function checkMilestones() {
    const e = era();
    if (e > S.maxEra) {
      S.maxEra = e;
      toast(`🌌 NEW ERA: ${ERAS[e].name}. ${ERAS[e].blurb}`, 'era'); cue('levelup');
      ctx.emit({ type: 'era', data: { era: e } });
      setNews(NEWS[e][0]);
    }
    GENS.forEach((g, i) => {
      if (S.gens[i] >= 1) milestone(`gen${i}`, `First ${g.name}`);
      if (S.gens[i] >= 25) milestone(`gen${i}x25`, `${g.name} ×25`);
      if (S.gens[i] >= 100) milestone(`gen${i}x100`, `${g.name} ×100`);
    });
    const k = kardashev(rate);
    for (let x = -4; x <= 30; x++) if (k >= x / 10 && rate > 0) milestone(`k${x}`, `Kardashev ${(x / 10).toFixed(1)}${x === 0 ? ' — 1 MW!' : x === 10 ? ' — a planet!' : x === 20 ? ' — A STAR!' : ''}`);
    for (const m of [3, 5, 8, 10]) if (mono >= m) milestone(`mono${m}`, `Mind-Numbing ×${m}`);
    for (const n of [1, 10, 50]) if (S.goldens >= n) milestone(`gold${n}`, `${n} golden hamster${n > 1 ? 's' : ''} caught`);
    for (const n of [1, 10, 50]) if (S.pepUses >= n) milestone(`pep${n}`, `${n} peptide${n > 1 ? 's' : ''} administered`);
    for (const n of [1, 5]) if (S.strikes >= n) milestone(`strike${n}`, `${n} strike${n > 1 ? 's' : ''} broken`);
    for (const n of [1, 5]) if (S.trials >= n) milestone(`trial${n}`, `${n} clinical trial${n > 1 ? 's' : ''} survived`);
    // feature unlocks
    if (S.gens[0] >= 1) unlock('golden', 'Golden hamsters now appear. SPRINT (power Z4+) to catch them!');
    if (S.gens[0] >= 5) unlock('spin', 'Gerald signed up for spin classes. Hit the cadence when the instructor shouts.');
    if (S.life >= 3000) unlock('upgrades', 'Upgrades tab unlocked.');
    if (S.gens[1] >= 1) unlock('market', 'A man in a trench coat offers you "seeds". Black Market unlocked.');
    if (S.life >= 2e4) unlock('vibes', 'Vibes tab unlocked. Purely cosmetic. Absolutely essential.');
    if (e >= 2) unlock('strikes', 'The hamsters have unionized. Expect strikes.');
    if (e >= 3) unlock('trials', 'Big Pharma has noticed your hamsters. Clinical trials incoming.');
    if (potentialSeeds() >= 1) unlock('rebirth', 'Reincarnation available. You could come back as a hamster...');
    for (const p of PEPTIDES) if (p.era > 0 && p.era <= e && unlocks.has('market')) unlock(`pep:${p.id}`, `Black Market restock: ${p.name}`);
    if (unlocks.has('strikes') && nextStrike === Infinity) nextStrike = t + randIn(300, 600);
    if (unlocks.has('trials') && nextTrial === Infinity) nextTrial = t + randIn(400, 800);
    if (unlocks.has('spin') && nextSpin === Infinity) nextSpin = t + randIn(120, 300);
  }

  // ---------- shop ----------
  function tabs(): TabId[] {
    const out: TabId[] = ['gens'];
    if (unlocks.has('upgrades')) out.push('upgrades');
    if (unlocks.has('market')) out.push('market');
    if (unlocks.has('vibes')) out.push('vibes');
    if (unlocks.has('rebirth')) out.push('rebirth');
    return out;
  }
  function upgradeItems(): ShopItem[] {
    const e = econ(), items: ShopItem[] = [];
    GENS.forEach((g, i) => UPG_TIERS.forEach((tier, k) => {
      const id = `g:${i}:${k}`;
      if (upg.has(id) || S.gens[i] < tier.own) return;
      const c = upgCost(i, k);
      items.push({ key: id, name: g.upg[k], desc: `${g.name} output ×2`, cost: c, costLabel: fmtJ(c), can: S.bank >= c, tag: g.name });
    }));
    const lk = legsOwned();
    if (lk < LEGS.length) { const c = legCost(lk); items.push({ key: `leg:${lk}`, name: LEGS[lk], desc: 'Your own watts ×2', cost: c, costLabel: fmtJ(c), can: S.bank >= c, tag: 'LEGS' }); }
    const mk = monosOwned();
    if (mk < MONOS.length) { const c = monoCost(mk); items.push({ key: `mono:${mk}`, name: MONOS[mk], desc: `Mind-Numbing cap +1 (→ ×${monoCap() + 1})`, cost: c, costLabel: fmtJ(c), can: S.bank >= c, tag: 'BOREDOM' }); }
    const ce = era();
    for (const sp of SPECIALS) {
      if (upg.has(`sp:${sp.id}`) || sp.era > ce) continue;
      const c = specialCost(sp);
      items.push({ key: `sp:${sp.id}`, name: sp.name, desc: sp.desc, cost: c, costLabel: fmtJ(c), can: S.bank >= c, tag: 'SPECIAL' });
    }
    void e;
    return items.sort((a, b) => a.cost - b.cost);
  }
  function items(tb: TabId): ShopItem[] {
    const e = econ();
    if (tb === 'gens') {
      const out: ShopItem[] = [];
      for (let i = 0; i < GENS.length; i++) {
        if (!revealed(i)) { out.push({ key: `gen:${i}`, name: '???', desc: 'Keep pedaling.', cost: 0, costLabel: '???', can: false, locked: true }); break; }
        const c = genCost(e, i, S.gens[i], 1, discount());
        const each = genOut(e, i) * genMult(i) * globalMult();
        out.push({ key: `gen:${i}`, name: GENS[i].name, desc: `${GENS[i].flavor}  · ${fmtW(each)} each`, cost: c, costLabel: fmtJ(c), can: S.bank >= c, owned: S.gens[i] });
      }
      return out;
    }
    if (tb === 'upgrades') return upgradeItems();
    if (tb === 'market') return PEPTIDES.filter((p) => p.era <= era()).map((p) => {
      const c = pepCost(p), tl = tol[p.id] ?? 0;
      return { key: `pep:${p.id}`, name: p.name, desc: `${p.desc}${tl >= 0.5 ? `  · tolerance ${tl.toFixed(1)}` : ''}`, cost: c, costLabel: fmtJ(c), can: S.bank >= c, tag: p.label };
    });
    if (tb === 'vibes') return VIBES.filter((v) => v.era <= S.maxEra).map((v) => {
      const own = vibes.has(v.id), c = own ? 0 : vibeCost(v);
      return { key: `vibe:${v.id}`, name: v.name, desc: v.desc, cost: c, costLabel: own ? (vibesOn.has(v.id) ? 'ON' : 'OFF') : fmtJ(c), can: own || S.bank >= c, owned: own, on: vibesOn.has(v.id) };
    });
    const ps = potentialSeeds();
    return [{
      key: 'rebirth', name: t < armedUntil ? 'PRESS AGAIN TO CONFIRM' : 'Reincarnate as a Hamster',
      desc: `Lose everything except vibes & milestones. Gain ${ps} karmic seed${ps === 1 ? '' : 's'} (+${Math.round(ps * tun.seedBonus() * 100)}% forever). You have ${S.seeds}.`,
      cost: 0, costLabel: `+${ps} 🌻`, can: ps >= 1,
    }];
  }

  function spend(c: number) { S.bank -= c; buySeq++; }
  function buy(key: string, n = 1): boolean {
    const e = econ();
    const [kind, a, b] = key.split(':');
    if (kind === 'gen') {
      const i = +a; if (!revealed(i)) return false;
      const c = genCost(e, i, S.gens[i], n, discount());
      if (S.bank < c) return false;
      spend(c); S.gens[i] += n; sess.gens += n;
      ctx.emit({ type: 'buy', data: { gen: GENS[i].id, n } });
      return true;
    }
    if (kind === 'g' || kind === 'leg' || kind === 'mono' || kind === 'sp') {
      if (upg.has(key)) return false;
      let c: number;
      if (kind === 'g') { if (S.gens[+a] < UPG_TIERS[+b].own) return false; c = upgCost(+a, +b); }
      else if (kind === 'leg') { if (+a !== legsOwned()) return false; c = legCost(+a); }
      else if (kind === 'mono') { if (+a !== monosOwned()) return false; c = monoCost(+a); }
      else { const sp = SPECIALS.find((x) => x.id === a); if (!sp || sp.era > era()) return false; c = specialCost(sp); }
      if (S.bank < c) return false;
      spend(c); upg.add(key); sess.upgs++;
      return true;
    }
    if (kind === 'pep') {
      const p = PEPTIDES.find((x) => x.id === a); if (!p || p.era > era()) return false;
      const c = pepCost(p); if (S.bank < c) return false;
      spend(c); inject(p, false);
      return true;
    }
    if (kind === 'vibe') {
      const v = VIBES.find((x) => x.id === a); if (!v) return false;
      if (vibes.has(v.id)) { if (vibesOn.has(v.id)) vibesOn.delete(v.id); else vibesOn.add(v.id); return true; }
      const c = vibeCost(v); if (S.bank < c) return false;
      spend(c); vibes.add(v.id); vibesOn.add(v.id);
      return true;
    }
    if (kind === 'rebirth') {
      if (potentialSeeds() < 1) return false;
      if (t >= armedUntil) { armedUntil = t + 5; return true; }
      rebirth(); return true;
    }
    return false;
  }

  function rebirth() {
    const gained = potentialSeeds();
    S.seeds += gained; S.rebirths++;
    S.gens = GENS.map(() => 0); upg.clear(); S.bank = 0; S.life = 0;
    effects.length = 0; golden = null; strike = null; trial = null; rage = null; spin = null; mono = 1; armedUntil = -1;
    ctx.resistance.clear('strike'); ctx.resistance.clear('trial');
    tab = 'gens'; row = 0;
    toast(`☸️ You have been reincarnated as a hamster. +${gained} karmic seeds. The wheel turns.`, 'era'); cue('explode');
    ctx.emit({ type: 'reincarnated', data: { seeds: gained } });
    persist();
  }

  // ---------- peptides ----------
  function addEffect(id: string, label: string, kind: EffKind, mult: number, dur: number, delay = 0) {
    const i = effects.findIndex((e) => e.id === id); if (i >= 0) effects.splice(i, 1);
    effects.push({ id, label, kind, mult, from: t + delay, until: t + delay + dur });
  }
  function inject(p: PeptideDef, free: boolean) {
    const tl = tol[p.id] ?? 0;
    const k = (m: number) => 1 + (m - 1) / (1 + 0.6 * tl);
    tol[p.id] = tl + 1;
    S.pepUses++; sess.peps++; S.lastPep = p.id;
    cue('potion');
    ctx.emit({ type: 'peptide', data: { id: p.id, free } });
    if (S.pepUses % 4 === 1) setNews(PEPTIDE_NEWS[Math.floor(ctx.rng() * PEPTIDE_NEWS.length)]);
    switch (p.id) {
      case 'seeds': addEffect('seeds', 'Sunflower Seeds', 'all', k(1.5), p.dur); break;
      case 'bpc': addEffect('bpc', 'BPC-157: no decay', 'nodecay', 1, p.dur); break;
      case 'tb': addEffect('tb', 'TB-500', 'ham', k(2), p.dur); break;
      case 'pre': addEffect('pre', 'PRE-WORKOUT', 'all', k(6), 30); addEffect('crash', 'The Crash', 'all', 0.5, 30, 30); break;
      case 'ozem': addEffect('ozem', 'Ozempeptide: -25%', 'cheap', 0.75, p.dur); break;
      case 'mk': addEffect('mk', 'MK-677: GIANT', 'leg', k(25), p.dur); break;
      case 'tren':
        addEffect('tren', 'TRENBALONE', 'all', k(15), p.dur);
        if (ctx.rng() < tun.rageChance()) { rage = { until: t + 60, progress: 0 }; toast('😡 ROID RAGE! Gerald is running BACKWARDS. Sprint Z4+ to out-pedal him!', 'bad'); cue('curse'); }
        break;
      case 'vial': {
        const r = ctx.rng();
        if (r < 0.3) { addEffect('vial', 'Vial #4: ×50', 'all', 50, 10); toast('🧪 Vial #4: ×50 for 10 s. Gerald can see sounds.', 'event'); }
        else if (r < 0.55) { addEffect('vial', 'Vial #4: ×3', 'all', 3, 120); toast('🧪 Vial #4: ×3 for 2 min. Gerald is vibrating.', 'event'); }
        else if (r < 0.75) { const pick = pickFreePeptide('vial'); if (pick) { toast(`🧪 Vial #4 was actually ${pick.name}!`, 'event'); inject(pick, true); } }
        else if (r < 0.9) { toast('🧪 Nothing happens. Gerald is now fluent in Mandarin.', 'event'); }
        else { addEffect('vial', 'Vial #4: ×0.5', 'all', 0.5, 30); toast('🧪 Vial #4: Gerald is just lying there. ×0.5 for 30 s.', 'bad'); }
        break;
      }
      case 'stack': addEffect('stack', 'THE SHENZHEN STACK', 'all', k(4), p.dur); break;
    }
  }
  function pickFreePeptide(exclude?: string): PeptideDef | null {
    const pool = PEPTIDES.filter((p) => p.era <= era() && p.id !== exclude && p.id !== 'vial');
    return pool.length ? pool[Math.floor(ctx.rng() * pool.length)] : null;
  }

  // ---------- events ----------
  function updateEvents(dt: Seconds, zone: number, cadence: number) {
    // golden hamster
    if (unlocks.has('golden')) {
      if (!golden && t >= nextGolden && !strike && !trial && !rage && !spin) { golden = { until: t + tun.goldenStayS(), progress: 0, x: ctx.rng() }; toast('🌟 A GOLDEN HAMSTER appeared! Sprint (power Z4+) to catch it!', 'event'); cue('unique'); }
      if (golden) {
        if (zone >= 4) golden.progress += dt;
        if (golden.progress >= tun.goldenCatchS()) { catchGolden(); golden = null; nextGolden = t + randIn(tun.goldenMinS(), tun.goldenMaxS()) * (has('seedsub') ? 0.7 : 1); }
        else if (t >= golden.until) { golden = null; toast('The golden hamster got away. It will be back.', 'info'); nextGolden = t + randIn(tun.goldenMinS(), tun.goldenMaxS()) * (has('seedsub') ? 0.7 : 1); }
      }
    }
    // strike
    if (!strike && t >= nextStrike && !trial) { strike = { phase: 'warn', until: t + 20, progress: 0 }; golden = null; spin = null; toast('📢 Union meeting in progress... the hamsters are about to STRIKE!', 'bad'); cue('bossStart'); setNews('BREAKING: Hamster union votes to strike. Demands "more seeds, fewer wheels".'); }
    if (strike) {
      if (strike.phase === 'warn' && t >= strike.until) {
        strike = { phase: 'active', until: t + tun.strikeS(), progress: 0 };
        ctx.resistance.set({ id: 'strike', mode: 'sim', gradePct: tun.strikeGrade() });
        toast('✊ STRIKE! Hamsters walked out. Carry the grid yourself: hold power Z3+!', 'bad');
      } else if (strike.phase === 'active') {
        if (zone >= 3) strike.progress += dt;
        if (strike.progress >= tun.strikeNeedS()) {
          endStrike(true);
        } else if (t >= strike.until) endStrike(false);
      }
    }
    // clinical trial
    if (!trial && t >= nextTrial && !strike) { trial = { phase: 'offer', until: t + 30, ok: 0, total: 0 }; toast('💉 A pharma rep offers a CLINICAL TRIAL. Press Z to accept (ERG block).', 'event'); cue('select'); }
    if (trial) {
      if (trial.phase === 'offer') {
        if (autopilot) acceptTrial();
        else if (t >= trial.until) { trial = null; nextTrial = t + randIn(tun.trialMinS(), tun.trialMaxS()); toast('The pharma rep leaves. "Your loss."', 'info'); }
      } else {
        trial.total += dt; if (cadence >= 50) trial.ok += dt;
        if (t >= trial.until) {
          const done = trial.ok >= 0.8 * trial.total;
          ctx.resistance.clear('trial');
          if (done) {
            const pay = rate * 600 * (has('trialpro') ? 3 : 1);
            S.bank += pay; S.life += pay; S.all += pay; S.trials++; sess.trials++;
            toast(`💉 Trial complete! +${fmtJ(pay)} and a free sample.`, 'event'); cue('reward');
            const p = pickFreePeptide(); if (p) inject(p, true);
          } else toast('💉 Trial failed: participant "stopped pedaling". No payment.', 'bad');
          ctx.emit({ type: 'clinicalTrial', data: { completed: done } });
          trial = null; nextTrial = t + randIn(tun.trialMinS(), tun.trialMaxS());
        }
      }
    }
    // spin class (cadence, not watts: spin it up in an easy gear)
    if (unlocks.has('spin')) {
      if (!spin && t >= nextSpin && !golden && !strike && !trial && !rage) {
        spin = { until: t + tun.spinS(), progress: 0 };
        toast(`🚴 SPIN CLASS! The instructor wants ${Math.round(tun.spinRpm())}+ rpm. Drop a gear and spin!`, 'event'); cue('select');
      }
      if (spin) {
        if (cadence >= tun.spinRpm()) spin.progress += dt;
        if (spin.progress >= tun.spinNeedS()) {
          addEffect('spin', 'Spin class ×3', 'ham', 3, 90);
          toast('🚴 Class aced! Hamsters inspired: ×3 for 90 s.', 'event'); cue('reward');
          ctx.emit({ type: 'spinClass', data: { completed: true } });
          spin = null; nextSpin = t + randIn(tun.spinMinS(), tun.spinMaxS());
        } else if (t >= spin.until) {
          toast('🚴 Class over. The instructor sighs at your cadence.', 'info');
          ctx.emit({ type: 'spinClass', data: { completed: false } });
          spin = null; nextSpin = t + randIn(tun.spinMinS(), tun.spinMaxS());
        }
      }
    }
    // roid rage
    if (rage) {
      if (zone >= 4) rage.progress += dt;
      if (rage.progress >= tun.rageNeedS()) { rage = null; toast('😌 Gerald calmed down. You out-pedaled a hamster on tren.', 'event'); cue('reward'); }
      else if (t >= rage.until) { rage = null; toast('Gerald wore himself out. Your bank did not enjoy that.', 'info'); }
    }
  }
  function acceptTrial() {
    if (!trial || trial.phase !== 'offer') return;
    trial = { phase: 'active', until: t + tun.trialS(), ok: 0, total: 0 };
    ctx.resistance.set({ id: 'trial', mode: 'erg', ftpFraction: tun.trialFtp(), priority: 2 });
    toast(`💉 Trial accepted. ERG locked at ${Math.round(tun.trialFtp() * 100)}% FTP. Just keep pedaling.`, 'event'); cue('potion');
  }
  function endStrike(won: boolean) {
    ctx.resistance.clear('strike');
    if (won) {
      S.strikes++; sess.strikesWon++;
      const pay = (rate + hamBase() * globalMult()) * 120 * (has('union') ? 2 : 1);
      S.bank += pay; S.life += pay; S.all += pay;
      addEffect('solidarity', 'Solidarity ×3', 'ham', 3, 180);
      toast(`🤝 Strike broken! Hamsters return inspired: ×3 for 3 min, +${fmtJ(pay)}.`, 'event'); cue('reward');
    } else { sess.strikesLost++; toast('Management caved. Hamsters got dental. They return... eventually.', 'bad'); }
    ctx.emit({ type: won ? 'strikeBroken' : 'strikeLost' });
    strike = null; nextStrike = t + randIn(tun.strikeMinS(), tun.strikeMaxS());
  }
  function catchGolden() {
    S.goldens++; sess.goldens++; cue('unique');
    ctx.emit({ type: 'goldenHamster' });
    const r = ctx.rng();
    if (r < 0.45) { addEffect('frenzy', 'HAMSTER FRENZY ×7', 'all', 7, 60); toast('🌟 HAMSTER FRENZY! ×7 for 60 s!', 'event'); }
    else if (r < 0.7) { const pay = Math.max(50, Math.min(S.bank * 0.15, rate * 900)); S.bank += pay; S.life += pay; S.all += pay; toast(`🌟 Lucky! +${fmtJ(pay)}`, 'event'); }
    else if (r < 0.85) { addEffect('quads', 'QUAD STORM ×777 legs', 'leg', 777, 13); toast('🌟 QUAD STORM! Your legs ×777 for 13 s. PEDAL!', 'event'); }
    else { const p = pickFreePeptide(); if (p) { toast(`🌟 The golden hamster dropped a vial: ${p.name}!`, 'event'); inject(p, true); } else addEffect('frenzy', 'HAMSTER FRENZY ×7', 'all', 7, 60); }
  }

  // ---------- monotony ----------
  function updateMono(dt: Seconds, zone: number, hard: number, cadence: number) {
    cadEma += (cadence - cadEma) * Math.min(1, dt / 20);
    const cap = monoCap();
    const frozen = !!(strike?.phase === 'active' || trial?.phase === 'active' || rage || (golden && hard >= 4)) || effects.some((e) => e.kind === 'nodecay' && t >= e.from);
    const prev = mono;
    if (zone === 2 && unionOn) {
      const steady = Math.abs(cadence - cadEma) <= tun.steadyRpm() ? 1 : 0.4;
      mono = Math.min(cap, mono + (tun.monoGainPerMin() / 60) * steady * dt);
      sess.z2S += dt;
    } else if (!frozen) {
      const r = (zone >= 3 ? tun.monoDecayHighPerMin() : tun.monoDecayLowPerMin()) * (has('zen') ? 0.5 : 1);
      mono = Math.max(1, mono - (r / 60) * dt);
    }
    if (mono > cap) mono = Math.max(cap, mono - dt); // cap lowered (rebirth)
    monoTrend = mono - prev;
    sess.maxMono = Math.max(sess.maxMono, mono);
  }

  // ---------- autobuy / autopilot ----------
  function bestGen(budget: number): number {
    const e = econ(); let best = -1, bestV = 0;
    for (let i = 0; i < GENS.length; i++) {
      if (!revealed(i)) break;
      const c = genCost(e, i, S.gens[i], 1, discount());
      if (c > budget) continue;
      const v = genOut(e, i) * genMult(i) / c;
      if (v > bestV) { bestV = v; best = i; }
    }
    return best;
  }
  function autoBuy() {
    if (has('manager')) { for (let n = 0; n < 5; n++) { const i = bestGen(S.bank * 0.25); if (i < 0 || !buy(`gen:${i}`)) break; } }
    if (has('hr')) for (const it of upgradeItems()) if (!it.key.startsWith('sp:') && it.cost <= S.bank * 0.25) buy(it.key);
  }
  /** Greedy best Δwatts/J buyer for headless balance runs. */
  function autopilotStep() {
    const e = econ(), base = Math.max(1, hamBase() + legRate / Math.max(1e-9, globalMult() * mono));
    let bestKey = '', bestV = 0, bestC = Infinity;
    const consider = (key: string, gain: number, c: number) => { const v = gain / c; if (v > bestV) { bestV = v; bestKey = key; bestC = c; } };
    for (let i = 0; i < GENS.length; i++) { if (!revealed(i)) break; consider(`gen:${i}`, genOut(e, i) * genMult(i), genCost(e, i, S.gens[i], 1, discount())); }
    for (const it of upgradeItems()) {
      const [kind, a] = it.key.split(':');
      if (kind === 'g') consider(it.key, S.gens[+a] * genOut(e, +a) * genMult(+a), it.cost);
      else if (kind === 'leg') consider(it.key, legRate / Math.max(1e-9, globalMult() * mono * effMult('all')), it.cost);
      else if (kind === 'mono') consider(it.key, base / monoCap(), it.cost);
      else if (a === 'cloning') consider(it.key, hamBase() / 3, it.cost);
      else if (it.cost <= S.bank * 0.3) buy(it.key);
    }
    if (bestKey && bestC <= S.bank) buy(bestKey);
  }

  // ---------- input ----------
  function handleInput() {
    const inp = ctx.input(), p = inp.pressed;
    const tl = tabs();
    const move = (d: number) => { const i = tl.indexOf(tab); setTab(tl[(i + d + tl.length) % tl.length]); cue('select'); };
    if (p.has('left')) move(-1);
    if (p.has('right')) move(1);
    const list = items(tab);
    if (p.has('up')) { row = Math.max(0, row - 1); cue('select'); }
    if (p.has('down')) { row = Math.min(list.length - 1, row + 1); cue('select'); }
    if (p.has('a')) tryBuy(list, row, 1);
    if (p.has('b')) tryBuy(list, row, 10);
    if (p.has('z')) { if (trial?.phase === 'offer') acceptTrial(); }
    if (p.has('y')) quickInject();
    for (const a of pending.splice(0)) {
      if (a.type === 'tab' && a.i != null && tl[a.i]) { setTab(tl[a.i]); cue('select'); }
      else if (a.type === 'row' && a.i != null) { const l = items(tab); if (a.i === row) tryBuy(l, row, 1); else if (a.i < l.length) { row = a.i; cue('select'); } }
      else if (a.type === 'accept') acceptTrial();
      else if (a.type === 'inject') quickInject();
    }
  }
  function setTab(tb: TabId) {
    tab = tb; armedUntil = -1;
    row = tb === 'gens' ? Math.max(0, items('gens').filter((x) => !x.locked).length - 1) : 0;
  }
  function tryBuy(list: ShopItem[], r: number, n: number) {
    const it = list[r]; if (!it || it.locked) { cue('deny'); return; }
    const ok = buy(it.key, it.key.startsWith('gen:') ? n : 1);
    cue(ok ? (it.key.startsWith('pep:') ? 'potion' : 'buy') : 'deny');
    if (ok) persistSoon();
  }
  function quickInject() {
    const p = PEPTIDES.find((x) => x.id === (S.lastPep ?? 'seeds'));
    if (p && unlocks.has('market') && p.era <= era() && buy(`pep:${p.id}`)) return;
    cue('deny');
  }

  // ---------- persistence ----------
  function persist() {
    S.upg = [...upg]; S.miles = [...miles]; S.unlocks = [...unlocks]; S.vibes = [...vibes]; S.vibesOn = [...vibesOn];
    ctx.save({ ...S, gens: S.gens.slice() });
  }
  function persistSoon() { saveAt = Math.min(saveAt, t + 3); }

  // ---------- main update ----------
  function update(dt: Seconds) {
    t += dt;
    const b = ctx.bike();
    const zone = b.effortZone, cadence = b.cadence3s;
    // short efforts (golden hamster, strikes, rage) also count power zone: HR lags far too much for a 6 s sprint
    const hard = Math.max(zone, Math.min(5, b.powerZone));
    handleInput();
    for (let i = effects.length - 1; i >= 0; i--) if (t >= effects[i].until) effects.splice(i, 1);
    for (const k of Object.keys(tol)) tol[k] = Math.max(0, tol[k] - dt / 480);
    updateEvents(dt, hard, cadence);
    computeRate(b);
    updateMono(dt, zone, hard, cadence);
    const gain = rate * dt;
    S.bank = Math.max(0, S.bank + gain);
    if (gain > 0) { S.life += gain; S.all += gain; sess.energy += gain; }
    if (cadence > 20) S.rideS += dt;
    S.peakW = Math.max(S.peakW, rate); sess.peakW = Math.max(sess.peakW, rate);
    if (rate > 0) sess.peakK = Math.max(sess.peakK, kardashev(rate));
    if (t >= milesAt) { milesAt = t + 0.5; checkMilestones(); }
    if (t >= autoAt) { autoAt = t + 2; autoBuy(); }
    if (autopilot && t >= apAt) { apAt = t + 1; autopilotStep(); }
    if (t >= newsAt) {
      const e = era(), pool = ctx.rng() < 0.6 ? NEWS[e] : NEWS[Math.floor(ctx.rng() * (e + 1))];
      setNews(pool[Math.floor(ctx.rng() * pool.length)]);
    }
    // flywheel inertia: heavier as the empire grows
    const g = tun.inertiaPerEra() * era();
    if (g > 0) ctx.resistance.set({ id: 'inertia', mode: 'sim', gradePct: g }); else ctx.resistance.clear('inertia');
    if (t >= saveAt) { saveAt = t + 30; persist(); }
    ctx.debug('rate W', +rate.toPrecision(4)); ctx.debug('K', +kardashev(rate).toFixed(3)); ctx.debug('mono', +mono.toFixed(2));
    ctx.debug('era', era()); ctx.debug('bank', fmtJ(S.bank));
  }

  function snapshot(): HamsterSnapshot {
    const b = ctx.bike(), e = era(), tl = tabs();
    // "something affordable here" dots: rebuilding every tab is costly, so refresh twice a second
    if (t >= badgeAt) { badgeAt = t + 0.5; badges = {}; for (const id of tl) if (id !== 'gens') badges[id] = items(id).some((x) => x.can && x.owned !== true); }
    const list = items(tab);
    row = clamp(row, 0, Math.max(0, list.length - 1));
    return {
      t, bank: S.bank, rate, hamRate, legRate, k: kardashev(rate), equiv: equivalence(rate),
      mono, monoCap: monoCap(), monoTrend, era: e, eraName: ERAS[e].name, eraBlurb: ERAS[e].blurb,
      gens: GENS.map((g, i) => ({ name: g.name, owned: S.gens[i] })), totalOwned: S.gens.reduce((a, n) => a + n, 0),
      tabs: tl.map((id) => ({ id, label: TAB_LABEL[id], badge: id !== tab && !!badges[id] })),
      tab, row, items: list,
      toasts: toasts.filter((x) => t - x.t < 7), cues: cues.slice(), news,
      effects: effects.filter((x) => t >= x.from).map((x) => ({ id: x.id, label: x.label, left: x.until - t, total: x.until - x.from, kind: x.kind, mult: x.mult })),
      golden: golden ? { left: golden.until - t, progress: golden.progress, need: tun.goldenCatchS(), x: golden.x } : null,
      strike: strike ? { phase: strike.phase, left: strike.until - t, progress: strike.progress, need: tun.strikeNeedS() } : null,
      trial: trial ? { phase: trial.phase, left: trial.until - t, compliance: trial.total > 0 ? trial.ok / trial.total : 1 } : null,
      rage: rage ? { left: rage.until - t, progress: rage.progress, need: tun.rageNeedS() } : null,
      spin: spin ? { left: spin.until - t, progress: spin.progress, need: tun.spinNeedS(), rpm: tun.spinRpm() } : null,
      cadence: b.cadence3s, power: b.power3s, zone: b.effortZone, hardZone: Math.max(b.effortZone, Math.min(5, b.powerZone)), unionOn,
      pepUses: S.pepUses, giant: effects.some((x) => x.id === 'mk'), glow: effects.some((x) => x.id === 'stack' || x.id === 'frenzy'),
      vibesOn: [...vibesOn], buySeq, rebirths: S.rebirths, seeds: S.seeds, potentialSeeds: potentialSeeds(), armed: t < armedUntil,
      hooks: { storm: !!(strike || golden || rage), golden: !!golden },
    };
  }

  function hud(): GameHud {
    const controls: ControlHint[] = [
      { button: 'left', label: 'Previous tab' }, { button: 'right', label: 'Next tab' },
      { button: 'up', label: 'Previous row' }, { button: 'down', label: 'Next row' },
      { button: 'a', label: tab === 'vibes' ? 'Buy / toggle' : tab === 'rebirth' ? 'Reincarnate' : 'Buy', shortLabel: tab === 'vibes' ? 'Toggle' : tab === 'rebirth' ? 'Rebirth' : 'Buy' },
      { button: 'b', label: 'Buy ×10', active: tab === 'gens' },
      { button: 'y', label: 'Re-dose', active: unlocks.has('market') },
      { button: 'z', label: 'Accept trial', shortLabel: 'Trial', active: trial?.phase === 'offer',
        ...(trial?.phase === 'offer' ? { indicator: { label: 'Trial offer', status: 'Available', ready: true } } : {}) },
      { button: 'shiftersL', label: 'Gear' }, { button: 'shiftersR', label: 'Gear' },
    ];
    // short efforts are judged on power (HR can't climb in time); the Z2 grind uses the profile's zone source
    const tz: GameHud['targetZone'] = rage ? { min: 4, max: 5, label: 'Out-pedal Gerald!', source: 'power' }
      : golden ? { min: 4, max: 5, label: 'Catch the golden hamster!', source: 'power' }
      : strike?.phase === 'active' ? { min: 3, max: 5, label: 'Carry the grid!', source: 'power' }
      : trial?.phase === 'active' ? { min: 1, max: 5, label: 'Clinical trial (ERG)' }
      : { min: 2, max: 2, label: `Mind-numbing ×${mono.toFixed(1)}` };
    const tc: GameHud['targetCadence'] = spin ? { min: Math.round(tun.spinRpm()), label: 'Spin class!' }
      : trial?.phase === 'active' ? { min: 50, label: 'Keep the cranks turning' }
      : undefined;
    // Tabs, row purchase and trial acceptance already have native tap targets.
    return { controls, touchControls: ['up', 'down', ...(tab === 'gens' ? ['b' as const] : []), ...(unlocks.has('market') ? ['y' as const] : [])], gears: true, targetZone: tz, targetCadence: tc };
  }

  checkMilestones();
  setTab('gens');
  if (S.maxEra >= 2 || unlocks.has('strikes')) nextStrike = randIn(300, 600);
  if (unlocks.has('trials')) nextTrial = randIn(400, 800);
  toast(loaded ? `Welcome back. Gerald missed you. (He did not stop running. He was not running.)` : 'Meet Gerald. He runs when you run. Pedal to make electricity.', 'info');

  return {
    update, hud, snapshot, isOver: () => false,
    receive(a: unknown) {
      const act = a as { type?: string; i?: number };
      if (act && typeof act.type === 'string' && pending.length < 16) pending.push({ type: act.type, i: act.i });
    },
    summary: () => ({
      'Energy generated': fmtJ(sess.energy),
      'Peak output': fmtW(sess.peakW),
      'Peak Kardashev': +sess.peakK.toFixed(2),
      Era: ERAS[era()].name,
      'Era reached': era() + 1,
      'Generators bought': sess.gens,
      'Upgrades bought': sess.upgs,
      'Max Mind-Numbing': +sess.maxMono.toFixed(2),
      'Minutes in Z2': +(sess.z2S / 60).toFixed(1),
      'Golden hamsters': sess.goldens,
      'Peptides administered': sess.peps,
      'Strikes broken': sess.strikesWon,
      'Strikes lost': sess.strikesLost,
      'Clinical trials': sess.trials,
      'New milestones': sess.miles,
      'Lifetime ride hours': +(S.rideS / 3600).toFixed(1),
      Bank: fmtJ(S.bank),
      'Peak equivalent': equivalence(sess.peakW).replace('≈ ', ''),
    }),
    dispose() { persist(); ctx.resistance.clearAll(); ctx.resistance.useVirtualGears(false); },
  };
}

