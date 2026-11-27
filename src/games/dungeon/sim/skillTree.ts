// Diablo-style 3-Branch Skill Tree Engine (pure, deterministic).
// Every launch archetype has 3 branches × 5 nodes:
//   Tier 1 (0/2) -> Tier 2 (0/2) -> Tier 3 Mutually Exclusive Fork A vs Fork B (0/1) -> Tier 4 Capstone Keystone (0/1).
// Choices in Tier 3 permanently lock out the sibling fork for the entire run.
import { ARCHETYPES, type ArchetypeId } from './archetypes';

export type SkillTier = 1 | 2 | 3 | 4;
export type NodeState = 'locked' | 'available' | 'invested' | 'maxed' | 'locked-out';

export interface SkillNodeDef {
  id: string;
  branchId: string;
  tier: SkillTier;
  fork?: 'A' | 'B';
  pair?: string;
  maxRank: number;
  name: string;
  short: string;
  detail: string;
  cycling: string;
}

export interface SkillBranchDef {
  id: string;
  name: string;
  theme: string;
  color: string;
  titleWord: string;
  nodes: readonly SkillNodeDef[];
}

export type SkillRanks = Partial<Record<string, number>>;

export const SKILL_TREES: Record<ArchetypeId, readonly SkillBranchDef[]> = {
  rouleur: [
    {
      id: 'bulwark', name: 'Bulwark', theme: 'Ward & Retaliation', color: '#ffd84a', titleWord: 'Aegis',
      nodes: [
        { id: 'r_b_t1', branchId: 'bulwark', tier: 1, maxRank: 2, name: 'Iron Frame', short: '+12/24% Armor & Ward absorb', detail: '+12% / +24% Armor; Ward absorbs heavy blows with wider shield radius.', cycling: 'Always active in ERG & Grade.' },
        { id: 'r_b_t2', branchId: 'bulwark', tier: 2, maxRank: 2, name: 'Spiked Spokes', short: '45/90% Thorns retaliation', detail: 'Taking or blocking a hit lashes nearby foes for 45% / 90% weapon dmg.', cycling: '+25% thorns radius in Z2+.' },
        { id: 'r_b_t3a', branchId: 'bulwark', tier: 3, fork: 'A', pair: 'r_b_t3b', maxRank: 1, name: 'Aegis Riposte', short: 'Ward block -> 220% nova + Exposed', detail: 'Blocking a hit with Ward fires a 220% shockwave and extends boss Exposed (+2s).', cycling: 'Great for active Ward parry timing.' },
        { id: 'r_b_t3b', branchId: 'bulwark', tier: 3, fork: 'B', pair: 'r_b_t3a', maxRank: 1, name: 'Iron Curtain', short: 'Ward +60% dur & heals 8% HP', detail: 'Ward lasts +60% longer and heals 8% max HP when it expires.', cycling: 'Relaxed steady Z2 protection.' },
        { id: 'r_b_t4', branchId: 'bulwark', tier: 4, maxRank: 1, name: 'Unbreakable Peloton', short: '3rd block -> free Rally + 2.5× Thorns', detail: 'CAPSTONE: Every 3rd blocked hit triggers a free Rally burst and 3s of 2.5× Thorns.', cycling: 'Turns ambushes into effortless retaliation.' },
      ],
    },
    {
      id: 'momentum', name: 'Momentum', theme: 'Cadence & Auras', color: '#5ad8ff', titleWord: 'Flywheel',
      nodes: [
        { id: 'r_m_t1', branchId: 'momentum', tier: 1, maxRank: 2, name: 'Diesel Cadence', short: 'Z2+ 75rpm -> +8/16% atk speed', detail: 'Smooth pedaling (75+ rpm, Z2+) builds Steady for +8% / +16% fire rate & aura size.', cycling: 'Rewards smooth pedaling in ERG & Grade.' },
        { id: 'r_m_t2', branchId: 'momentum', tier: 2, maxRank: 2, name: 'Drafting Blades', short: '1 / 2 orbiting chainrings', detail: 'Summons 1 / 2 orbiting chainrings slicing melee foes automatically.', cycling: 'Orbit speed scales with cadence.' },
        { id: 'r_m_t3a', branchId: 'momentum', tier: 3, fork: 'A', pair: 'r_m_t3b', maxRank: 1, name: 'Turbine Ring', short: '85+ rpm doubles blade hits + Shock', detail: 'Above 85 rpm, orbiting blades hit twice as fast and arc lightning.', cycling: 'Cadence burst without wattage spike.' },
        { id: 'r_m_t3b', branchId: 'momentum', tier: 3, fork: 'B', pair: 'r_m_t3a', maxRank: 1, name: 'Slipstream Pull', short: 'Aura pulls foes in + 35% slow', detail: 'Every 3s your aura draws ranged foes inward and slows them by 35%.', cycling: 'Pulls enemies into Thorns & blades.' },
        { id: 'r_m_t4', branchId: 'momentum', tier: 4, maxRank: 1, name: 'Perpetual Flywheel', short: 'Max Steady -> Blazing Halo burn', detail: 'CAPSTONE: Continuous pedaling ignites blades into a Blazing Halo burning nearby foes.', cycling: 'Rewards unbroken pedaling.' },
      ],
    },
    {
      id: 'feedzone', name: 'Feed Zone', theme: 'Sustain & Bidons', color: '#7dff8a', titleWord: 'Musette',
      nodes: [
        { id: 'r_f_t1', branchId: 'feedzone', tier: 1, maxRank: 2, name: 'Extra Bidon', short: '+1 / +2 Potions & Armor buff', detail: '+1 / +2 max Potions. Drinking a Potion grants +15% Armor for 4s.', cycling: 'Deep sustain for endurance rides.' },
        { id: 'r_f_t2', branchId: 'feedzone', tier: 2, maxRank: 2, name: 'Iso-Mix', short: '+35/70% Z2 Regen & Rally CD', detail: 'Zone 2 regen ticks +35% / +70% faster and speeds Rally recharge +10% / +20%.', cycling: 'Rewards disciplined Zone 2 riding.' },
        { id: 'r_f_t3a', branchId: 'feedzone', tier: 3, fork: 'A', pair: 'r_f_t3b', maxRank: 1, name: 'Sugar Rush', short: 'Potion triggers 8s Fired Up', detail: 'Drinking a Potion triggers 8s of Fired Up (+40% dmg, faster shots).', cycling: 'On-demand burst from bidons.' },
        { id: 'r_f_t3b', branchId: 'feedzone', tier: 3, fork: 'B', pair: 'r_f_t3a', maxRank: 1, name: 'Second Wind', short: '1×/floor cheat death + bidon', detail: 'Once per floor, lethal damage saves you at 35% HP with knockback.', cycling: 'Safety net on deep floors.' },
        { id: 'r_f_t4', branchId: 'feedzone', tier: 4, maxRank: 1, name: 'Bottomless Musette', short: 'Auto-refill bidons + Over-Shield', detail: 'CAPSTONE: Gain +1 Potion every 2 cleared rooms; overhealing builds up to +35% Over-Shield.', cycling: 'Turns Z2 regen into an extra HP shield.' },
      ],
    },
  ],

  puncheur: [
    {
      id: 'breakaway', name: 'Breakaway', theme: 'Sprints & Crits', color: '#ff9a3c', titleWord: 'Breakaway',
      nodes: [
        { id: 'p_b_t1', branchId: 'breakaway', tier: 1, maxRank: 2, name: 'Snap Attack', short: '+10/20% Crit; Z4+ -> 100% Crit', detail: '+10% / +20% Crit Chance; surging into Z4+ guarantees Crits on your next 2 / 4 shots.', cycling: 'Works on both Grade sprints & ERG surges.' },
        { id: 'p_b_t2', branchId: 'breakaway', tier: 2, maxRank: 2, name: 'Redline Surge', short: 'Fired Up +8/16s & +25/50% Crit', detail: 'Fired Up lasts +8s / +16s longer and boosts Crit Damage by +25% / +50%.', cycling: 'Longer reward from short crit efforts.' },
        { id: 'p_b_t3a', branchId: 'breakaway', tier: 3, fork: 'A', pair: 'p_b_t3b', maxRank: 1, name: 'Solo Breakaway', short: '+45% dmg vs Bosses & isolated', detail: '+45% bonus damage to Bosses and isolated enemies; crits shred shields.', cycling: 'Melts Boss Exposed windows.' },
        { id: 'p_b_t3b', branchId: 'breakaway', tier: 3, fork: 'B', pair: 'p_b_t3a', maxRank: 1, name: 'Pack Finisher', short: 'Sprint kills explode (140% AoE)', detail: 'Kills while Fired Up or sprinting detonate for 140% AoE and add +2s Fired Up.', cycling: 'Wipes ambush rooms in one sprint.' },
        { id: 'p_b_t4', branchId: 'breakaway', tier: 4, maxRank: 1, name: 'Photo Finish', short: 'Z5 / Exposed -> 4s Bullet Time', detail: 'CAPSTONE: Crossing into Z5 or Striking an Exposed Boss grants 4s of ×1.8 attack speed & 100% Crits.', cycling: 'Ultimate Z5 sprint climax.' },
      ],
    },
    {
      id: 'stormcraft', name: 'Stormcraft', theme: 'Lightning & Shards', color: '#64d8ff', titleWord: 'Thunderhead',
      nodes: [
        { id: 'p_s_t1', branchId: 'stormcraft', tier: 1, maxRank: 2, name: 'Static Charge', short: 'Every 4th/3rd shot -> Chain Bolt', detail: 'Every 4th / 3rd attack discharges Chain Lightning arcing to 3 foes for 65% dmg.', cycling: 'Faster cadence = more lightning.' },
        { id: 'p_s_t2', branchId: 'stormcraft', tier: 2, maxRank: 2, name: 'Shatter Volley', short: 'Shots fire 1 / 2 storm shards', detail: 'Every primary volley adds 1 / 2 piercing storm shards in a tight fan.', cycling: 'Effortless clear during Z2 cruise.' },
        { id: 'p_s_t3a', branchId: 'stormcraft', tier: 3, fork: 'A', pair: 'p_s_t3b', maxRank: 1, name: 'Ball Lightning', short: 'Chains spawn drifting Storm Orb', detail: 'Chain Lightning launches a slow piercing Storm Orb zapping foes along the lane.', cycling: 'Corridor pressure between sprints.' },
        { id: 'p_s_t3b', branchId: 'stormcraft', tier: 3, fork: 'B', pair: 'p_s_t3a', maxRank: 1, name: 'Forked Arc', short: '6 bounces + Conductive (+20%)', detail: 'Lightning bounces 6 times (can hit Boss twice) and applies +20% Conductive.', cycling: 'Stacks with Breakaway crit bursts.' },
        { id: 'p_s_t4', branchId: 'stormcraft', tier: 4, maxRank: 1, name: 'Thunderhead', short: 'Every Crit calls a 220% Skybolt', detail: 'CAPSTONE: Every Crit calls down a 220% Skybolt stun; triggers chain shockwaves.', cycling: 'Turns crit sprints into a storm.' },
      ],
    },
    {
      id: 'slipstream', name: 'Slipstream', theme: 'Evasion & Tempo', color: '#84ff9a', titleWord: 'Phantom',
      nodes: [
        { id: 'p_l_t1', branchId: 'slipstream', tier: 1, maxRank: 2, name: 'Light Wheels', short: '+10/20% Dodge & +10/20% Speed', detail: '+10% / +20% Dodge Chance and +10% / +20% fire rate.', cycling: 'Always-on agility & tempo.' },
        { id: 'p_l_t2', branchId: 'slipstream', tier: 2, maxRank: 2, name: 'Lead-Out Dash', short: 'Dodge/Kill cuts CDs by 1.5/3s', detail: 'Dodging an attack or slaying a foe shaves 1.5s / 3.0s off Strike & Rally cooldowns.', cycling: 'Keeps active buttons snapping.' },
        { id: 'p_l_t3a', branchId: 'slipstream', tier: 3, fork: 'A', pair: 'p_l_t3b', maxRank: 1, name: 'Phantom Cadence', short: '95+ rpm -> +30% Dodge + echoes', detail: 'Spinning 95+ rpm grants +30% Dodge and fires spectral echo shots.', cycling: 'High-cadence fast-leg defense.' },
        { id: 'p_l_t3b', branchId: 'slipstream', tier: 3, fork: 'B', pair: 'p_l_t3a', maxRank: 1, name: 'Vampiric Sprint', short: 'Z4+ Crits heal 4% Max HP', detail: 'Crits during Z4+ or Fired Up heal 4% Max HP (0.8s internal cooldown).', cycling: 'Glass-cannon sustain during efforts.' },
        { id: 'p_l_t4', branchId: 'slipstream', tier: 4, maxRank: 1, name: 'Untouchable Crit', short: 'Dodge -> 160% Counter + Momentum', detail: 'CAPSTONE: Dodging fires an instant 160% Counter-Bolt and stacks +5% dmg (up to 10×).', cycling: 'High-cadence invulnerability engine.' },
      ],
    },
  ],

  grimpeur: [
    {
      id: 'crucible', name: 'Crucible', theme: 'Fire & Explosions', color: '#ff6b4a', titleWord: 'Volcanic',
      nodes: [
        { id: 'g_c_t1', branchId: 'crucible', tier: 1, maxRank: 2, name: 'Ember Strike', short: 'Hits Burn 40/80% over 3s', detail: 'Attacks ignite enemies for 40% / 80% weapon damage over 3s.', cycling: 'Steady burn ticks across long climbs.' },
        { id: 'g_c_t2', branchId: 'crucible', tier: 2, maxRank: 2, name: 'Cinder Wake', short: 'Rally & Strike scorch area', detail: 'Strike & Rally sear nearby enemies with heavy Burn and 35% slow.', cycling: 'Controls packs during steep ambushes.' },
        { id: 'g_c_t3a', branchId: 'crucible', tier: 3, fork: 'A', pair: 'g_c_t3b', maxRank: 1, name: 'Pyre Detonation', short: 'Burning deaths explode (180%)', detail: 'Burning enemies explode on death for 180% fire AoE and spread Burn.', cycling: 'Chain-reacts ambush rooms.' },
        { id: 'g_c_t3b', branchId: 'crucible', tier: 3, fork: 'B', pair: 'g_c_t3a', maxRank: 1, name: 'Magma Slam', short: 'Strike blasts +60% wider + lava', detail: 'Strike radius +60% and slams molten shockwaves dealing bonus Boss burn.', cycling: 'Heavy stationary Boss DPS.' },
        { id: 'g_c_t4', branchId: 'crucible', tier: 4, maxRank: 1, name: 'Volcanic Ascent', short: 'Z3+ climb -> Caldera Aura Eruption', detail: 'CAPSTONE: While climbing (Z3+ or Ambush/Boss), radiate a Caldera Aura that erupts every 2.5s.', cycling: 'Rewards grinding Z3-Z4 climbs.' },
      ],
    },
    {
      id: 'bigring', name: 'Big Ring', theme: 'Torque & Heavy Crits', color: '#ffb84a', titleWord: 'Titan',
      nodes: [
        { id: 'g_r_t1', branchId: 'bigring', tier: 1, maxRank: 2, name: 'Heavy Gear', short: '<82 rpm Z3+ -> +25/50% Crush', detail: 'High-torque pedaling (<82 rpm, Z3+) converts hits into Crushing Blows (+25% / +50% dmg).', cycling: 'Torque-driven climbing power (ERG & Grade).' },
        { id: 'g_r_t2', branchId: 'bigring', tier: 2, maxRank: 2, name: 'Guard Breaker', short: 'Shatters shields (+40/80%)', detail: 'Crushing Blows deal +40% / +80% vs shields and extend Boss stun windows.', cycling: 'Crushes armored & shielded foes.' },
        { id: 'g_r_t3a', branchId: 'bigring', tier: 3, fork: 'A', pair: 'g_r_t3b', maxRank: 1, name: 'Anvil Drop', short: '3rd shot -> 240% Heavy Slam', detail: 'Every 3rd attack crashes down as a 240% Heavy Slam that slows/staggers foes.', cycling: 'Rhythmic heavy climbing blows.' },
        { id: 'g_r_t3b', branchId: 'bigring', tier: 3, fork: 'B', pair: 'g_r_t3a', maxRank: 1, name: 'Sunder Cleave', short: 'Wide 3-bolt cleave + Bleed', detail: 'Attacks sweep a wide 3-bolt arc piercing frontal enemies and applying Bleed.', cycling: 'Turns heavy hits into room cleave.' },
        { id: 'g_r_t4', branchId: 'bigring', tier: 4, maxRank: 1, name: 'Titan Torque', short: 'Crushing Blows 100% Crit & -2s CD', detail: 'CAPSTONE: Crushing Blows always Crit with knockback and shave 2s off Rally & Strike cooldowns.', cycling: 'Huge payoff for standing torque climbs.' },
      ],
    },
    {
      id: 'kom', name: 'KOM', theme: 'Boss Slayer', color: '#ff66a8', titleWord: 'Summit',
      nodes: [
        { id: 'g_k_t1', branchId: 'kom', tier: 1, maxRank: 2, name: 'Summit Sight', short: '+15/30% dmg vs Elites & Boss', detail: 'Deal +15% / +30% bonus damage to Elites and Floor Bosses.', cycling: 'Shines on every boss climb.' },
        { id: 'g_k_t2', branchId: 'kom', tier: 2, maxRank: 2, name: 'High Altitude', short: '+14/28% Armor & heal on climbs', detail: '+14% / +28% Armor and Life-on-Hit during Ambush and Boss segments.', cycling: 'Rock-solid during Z4 blocks.' },
        { id: 'g_k_t3a', branchId: 'kom', tier: 3, fork: 'A', pair: 'g_k_t3b', maxRank: 1, name: 'Hors Categorie', short: 'Exposed +50% dur & +35% dmg', detail: 'Boss Exposed windows last +50% longer and take +35% amplified damage.', cycling: 'Maximizes boss punish efforts.' },
        { id: 'g_k_t3b', branchId: 'kom', tier: 3, fork: 'B', pair: 'g_k_t3a', maxRank: 1, name: 'Polka Executioner', short: '+60% dmg under 30% HP + heal', detail: 'Enemies under 30% HP (Bosses under 22%) take +60% damage and restore 3% HP on kill.', cycling: 'Strong finish over the crest.' },
        { id: 'g_k_t4', branchId: 'kom', tier: 4, maxRank: 1, name: 'Crown of the Col', short: 'Elite kill -> +35% stats + 25% heal', detail: 'CAPSTONE: Slaying an Elite or exposing a Boss grants 12s Mountain King (+35% dmg, +25% speed, 20% heal).', cycling: 'Snowballs late-floor momentum.' },
      ],
    },
  ],
};

export function getArchetypeBranches(archId: ArchetypeId): readonly SkillBranchDef[] {
  return SKILL_TREES[archId];
}

export function getNodeById(archId: ArchetypeId, nodeId: string): { branch: SkillBranchDef; node: SkillNodeDef } | null {
  for (const branch of SKILL_TREES[archId]) {
    for (const node of branch.nodes) {
      if (node.id === nodeId) return { branch, node };
    }
  }
  return null;
}

export function getNodeRank(ranks: SkillRanks, nodeId: string): number {
  return ranks[nodeId] ?? 0;
}

export function branchPoints(branch: SkillBranchDef, ranks: SkillRanks): number {
  let sum = 0;
  for (const n of branch.nodes) sum += getNodeRank(ranks, n.id);
  return sum;
}

export function totalSpentPoints(archId: ArchetypeId, ranks: SkillRanks): number {
  let sum = 0;
  for (const b of SKILL_TREES[archId]) sum += branchPoints(b, ranks);
  return sum;
}

export function nodeState(archId: ArchetypeId, ranks: SkillRanks, nodeId: string): NodeState {
  const found = getNodeById(archId, nodeId);
  if (!found) return 'locked';
  const { branch, node } = found;
  const r = getNodeRank(ranks, node.id);
  if (node.pair && getNodeRank(ranks, node.pair) > 0) return 'locked-out';
  if (r >= node.maxRank) return 'maxed';

  const t1 = branch.nodes.find((n) => n.tier === 1)!;
  const t2 = branch.nodes.find((n) => n.tier === 2)!;
  const forks = branch.nodes.filter((n) => n.tier === 3);
  let prereq = true;
  if (node.tier === 2) prereq = getNodeRank(ranks, t1.id) >= 1;
  else if (node.tier === 3) prereq = getNodeRank(ranks, t2.id) >= 1;
  else if (node.tier === 4) prereq = forks.some((f) => getNodeRank(ranks, f.id) >= 1);

  if (!prereq) return 'locked';
  return r > 0 ? 'invested' : 'available';
}

export function canInvestNode(archId: ArchetypeId, ranks: SkillRanks, nodeId: string, unspentSP: number): boolean {
  if (unspentSP <= 0) return false;
  const st = nodeState(archId, ranks, nodeId);
  return st === 'available' || st === 'invested';
}

/** Mutates `ranks` in place if valid; returns true when invested. Strictly locks sibling forks. */
export function investSkillNode(archId: ArchetypeId, ranks: SkillRanks, nodeId: string): boolean {
  const st = nodeState(archId, ranks, nodeId);
  if (st !== 'available' && st !== 'invested') return false;
  ranks[nodeId] = (ranks[nodeId] ?? 0) + 1;
  return true;
}

export interface QuickPickCard {
  branch: SkillBranchDef;
  node: SkillNodeDef;
  rank: number;
  siblingForkName?: string;
}

/**
 * Generates up to 3 bike-friendly Quick-Pick cards (1 per branch, prioritizing unlocked Forks & Capstones).
 * If a branch is fully maxed, fills from any remaining investable nodes across other branches (including sibling forks).
 */
export function quickPickCards(archId: ArchetypeId, ranks: SkillRanks): QuickPickCard[] {
  const branches = SKILL_TREES[archId];
  const cards: QuickPickCard[] = [];
  const usedIds = new Set<string>();

  for (const branch of branches) {
    const avail = branch.nodes.filter((n) => {
      const st = nodeState(archId, ranks, n.id);
      return st === 'available' || st === 'invested';
    });
    if (!avail.length) continue;
    // Prioritize highest unlocked tier (Capstone > Fork > T2 > T1)
    avail.sort((a, b) => b.tier - a.tier);
    const chosen = avail[0];
    usedIds.add(chosen.id);
    const pairNode = chosen.pair ? branch.nodes.find((n) => n.id === chosen.pair) : undefined;
    cards.push({ branch, node: chosen, rank: getNodeRank(ranks, chosen.id), siblingForkName: pairNode?.name });
  }

  // If fewer than 3 branches had available nodes (e.g., 1 branch maxed), offer another open node (such as Fork B)
  if (cards.length < 3) {
    for (const branch of branches) {
      for (const n of branch.nodes) {
        if (cards.length >= 3) break;
        if (usedIds.has(n.id)) continue;
        const st = nodeState(archId, ranks, n.id);
        if (st === 'available' || st === 'invested') {
          usedIds.add(n.id);
          const pairNode = n.pair ? branch.nodes.find((x) => x.id === n.pair) : undefined;
          cards.push({ branch, node: n, rank: getNodeRank(ranks, n.id), siblingForkName: pairNode?.name });
        }
      }
    }
  }
  return cards;
}

/** Smart highlight index for hands-off auto-pick: prefers Capstones -> Forks -> deepest invested branch. */
export function suggestQuickPick(archId: ArchetypeId, ranks: SkillRanks, cards: readonly QuickPickCard[]): number {
  if (!cards.length) return 0;
  let bestIdx = 0;
  let bestScore = -1;
  cards.forEach((c, i) => {
    const pts = branchPoints(c.branch, ranks);
    const score = c.node.tier * 20 + pts * 3 + (c.rank > 0 ? 4 : 0) + (i === 0 ? 1 : 0);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestIdx;
}

/** Auto-derived run build title from dominant invested branches (e.g. "Aegis-Flywheel Rouleur"). */
export function deriveBuildTitle(archId: ArchetypeId, ranks: SkillRanks): string {
  const arch = ARCHETYPES[archId];
  const sorted = [...SKILL_TREES[archId]].sort((a, b) => branchPoints(b, ranks) - branchPoints(a, ranks));
  const p0 = branchPoints(sorted[0], ranks);
  const p1 = branchPoints(sorted[1], ranks);
  if (p0 === 0) return arch.name;
  if (p1 >= 2) return `${sorted[0].titleWord}-${sorted[1].titleWord} ${arch.shortName}`;
  return `${sorted[0].titleWord} ${arch.shortName}`;
}

export function chosenForksAndCapstones(archId: ArchetypeId, ranks: SkillRanks): { forks: string[]; capstones: string[] } {
  const forks: string[] = [];
  const capstones: string[] = [];
  for (const b of SKILL_TREES[archId]) {
    for (const n of b.nodes) {
      if (getNodeRank(ranks, n.id) <= 0) continue;
      if (n.tier === 3) forks.push(n.name);
      if (n.tier === 4) capstones.push(n.name);
    }
  }
  return { forks, capstones };
}

export interface TreeModCtx {
  cadence: number;
  powerZone: number;
  effortZone: number;
  sprinting: boolean;
  firedUp: boolean;
  climbing: boolean; // ambush or boss segment (or grade >= 4)
  relicBonusBranches?: readonly number[]; // Boss Trophy +1 rank bonus to Tier 1/2 in those branch indices
}

export interface TreeMods {
  armorAdd: number;
  wardDurMult: number;
  wardEndHeal: number;
  thornsPct: number;
  thornsRadiusMult: number;
  aegisRiposte: boolean;
  unbreakablePeloton: boolean;
  fireRateAdd: number;
  orbitBlades: number;
  turbineShock: boolean;
  slipstreamPull: boolean;
  blazingHalo: boolean;
  potionCapAdd: number;
  potionArmorBonus: number;
  z2RegenMult: number;
  rallyCdMult: number;
  sugarRush: boolean;
  secondWindTree: boolean;
  bottomlessMusette: boolean;
  critAdd: number;
  z4CritCharges: number;
  firedUpAddS: number;
  critDmgMult: number;
  soloBossDmg: number;
  packFinisher: boolean;
  photoFinish: boolean;
  staticEvery: number;
  shatterShards: number;
  ballLightning: boolean;
  forkedArc: boolean;
  thunderhead: boolean;
  dodgeAdd: number;
  leadOutCd: number;
  phantomCadence: boolean;
  vampiricSprint: boolean;
  untouchableCrit: boolean;
  emberBurnPct: number;
  cinderWake: boolean;
  pyreDetonation: boolean;
  magmaSlam: boolean;
  volcanicAscent: boolean;
  crushingDmgAdd: number;
  guardBreakerMult: number;
  anvilDrop: boolean;
  sunderCleave: boolean;
  titanTorque: boolean;
  bossEliteDmg: number;
  highAltitudeLoh: number;
  horsExposedDurMult: number;
  horsExposedDmgAdd: number;
  polkaExecute: boolean;
  crownOfCol: boolean;
  /** Visual kit overlays activated by invested trees (reuses 32px art atlas). */
  overlays: string[];
}

export function computeTreeMods(archId: ArchetypeId, ranks: SkillRanks, ctx: TreeModCtx): TreeMods {
  const branches = SKILL_TREES[archId];
  const bonusSet = new Set(ctx.relicBonusBranches ?? []);
  const effRank = (nodeId: string): number => {
    const base = getNodeRank(ranks, nodeId);
    if (base <= 0) return 0;
    const found = getNodeById(archId, nodeId);
    if (!found || found.node.tier > 2) return base;
    const bi = branches.indexOf(found.branch);
    return base + (bonusSet.has(bi) ? 1 : 0);
  };

  const z2Plus = Math.min(5, ctx.powerZone) >= 2;
  const z3Plus = Math.min(5, ctx.powerZone) >= 3;
  const steadyActive = z2Plus && ctx.cadence >= 75;
  const highCadence = ctx.cadence >= 95;
  const torqueActive = z3Plus && ctx.cadence > 35 && ctx.cadence < 82;

  const r_iron = effRank('r_b_t1');
  const r_thorns = effRank('r_b_t2');
  const r_riposte = effRank('r_b_t3a') > 0;
  const r_curtain = effRank('r_b_t3b') > 0;
  const r_peloton = effRank('r_b_t4') > 0;

  const r_diesel = effRank('r_m_t1');
  const r_blades = effRank('r_m_t2');
  const r_turbine = effRank('r_m_t3a') > 0;
  const r_pull = effRank('r_m_t3b') > 0;
  const r_halo = effRank('r_m_t4') > 0;

  const r_bidon = effRank('r_f_t1');
  const r_iso = effRank('r_f_t2');
  const r_sugar = effRank('r_f_t3a') > 0;
  const r_sw = effRank('r_f_t3b') > 0;
  const r_musette = effRank('r_f_t4') > 0;

  const p_snap = effRank('p_b_t1');
  const p_redline = effRank('p_b_t2');
  const p_solo = effRank('p_b_t3a') > 0;
  const p_pack = effRank('p_b_t3b') > 0;
  const p_photo = effRank('p_b_t4') > 0;

  const p_static = effRank('p_s_t1');
  const p_shards = effRank('p_s_t2');
  const p_ball = effRank('p_s_t3a') > 0;
  const p_fork = effRank('p_s_t3b') > 0;
  const p_thunder = effRank('p_s_t4') > 0;

  const p_light = effRank('p_l_t1');
  const p_dash = effRank('p_l_t2');
  const p_phantom = effRank('p_l_t3a') > 0;
  const p_vamp = effRank('p_l_t3b') > 0;
  const p_untouch = effRank('p_l_t4') > 0;

  const g_ember = effRank('g_c_t1');
  const g_cinder = effRank('g_c_t2') > 0;
  const g_pyre = effRank('g_c_t3a') > 0;
  const g_magma = effRank('g_c_t3b') > 0;
  const g_volc = effRank('g_c_t4') > 0;

  const g_heavy = effRank('g_r_t1');
  const g_guard = effRank('g_r_t2');
  const g_anvil = effRank('g_r_t3a') > 0;
  const g_cleave = effRank('g_r_t3b') > 0;
  const g_titan = effRank('g_r_t4') > 0;

  const g_summit = effRank('g_k_t1');
  const g_alt = effRank('g_k_t2');
  const g_hors = effRank('g_k_t3a') > 0;
  const g_exec = effRank('g_k_t3b') > 0;
  const g_crown = effRank('g_k_t4') > 0;

  const overlays: string[] = [];
  if (r_iron > 0 || g_heavy > 0) overlays.push('discs');
  if (r_bidon > 0) overlays.push('musette');
  if (p_light > 0 || p_snap > 0) overlays.push('aero');
  if (g_summit > 0 || g_ember > 0) overlays.push('headlamp');

  return {
    armorAdd: Math.min(0.48, 0.12 * r_iron + (ctx.climbing ? 0.14 * g_alt : 0)),
    wardDurMult: r_curtain ? 1.6 : 1,
    wardEndHeal: r_curtain ? 0.08 : 0,
    thornsPct: 0.45 * r_thorns,
    thornsRadiusMult: z2Plus ? 1.25 : 1,
    aegisRiposte: r_riposte,
    unbreakablePeloton: r_peloton,
    fireRateAdd: (steadyActive ? 0.08 * r_diesel : 0) + 0.1 * p_light,
    orbitBlades: r_blades,
    turbineShock: r_turbine && ctx.cadence >= 85,
    slipstreamPull: r_pull,
    blazingHalo: r_halo && steadyActive,
    potionCapAdd: r_bidon,
    potionArmorBonus: r_bidon > 0 ? 0.15 : 0,
    z2RegenMult: 1 + 0.35 * r_iso,
    rallyCdMult: 1 / (1 + 0.1 * r_iso),
    sugarRush: r_sugar,
    secondWindTree: r_sw,
    bottomlessMusette: r_musette,
    critAdd: 0.1 * p_snap,
    z4CritCharges: p_snap * 2,
    firedUpAddS: p_redline * 8,
    critDmgMult: 2 + (ctx.firedUp || ctx.sprinting ? 0.25 * p_redline : 0),
    soloBossDmg: p_solo ? 0.45 : 0,
    packFinisher: p_pack,
    photoFinish: p_photo,
    staticEvery: p_static >= 2 ? 3 : p_static === 1 ? 4 : 0,
    shatterShards: p_shards,
    ballLightning: p_ball,
    forkedArc: p_fork,
    thunderhead: p_thunder,
    dodgeAdd: Math.min(0.65, 0.1 * p_light + (p_phantom && highCadence ? 0.3 : 0)),
    leadOutCd: 1.5 * p_dash,
    phantomCadence: p_phantom && highCadence,
    vampiricSprint: p_vamp,
    untouchableCrit: p_untouch,
    emberBurnPct: 0.4 * g_ember,
    cinderWake: g_cinder,
    pyreDetonation: g_pyre,
    magmaSlam: g_magma,
    volcanicAscent: g_volc && (z3Plus || ctx.climbing),
    crushingDmgAdd: torqueActive ? 0.25 * g_heavy : 0,
    guardBreakerMult: 1 + 0.4 * g_guard,
    anvilDrop: g_anvil,
    sunderCleave: g_cleave,
    titanTorque: g_titan && torqueActive,
    bossEliteDmg: 0.15 * g_summit,
    highAltitudeLoh: ctx.climbing ? 0.015 * g_alt : 0,
    horsExposedDurMult: g_hors ? 1.5 : 1,
    horsExposedDmgAdd: g_hors ? 0.35 : 0,
    polkaExecute: g_exec,
    crownOfCol: g_crown,
    overlays,
  };
}
