// Content tables for Sprocket Squadron: sectors, enemies, bosses, power-ups. Pure data.

export type EKind = 'drone' | 'armor' | 'weaver' | 'diver' | 'gunner' | 'splitter' | 'mini' | 'boss';
export type BossKind = 'dreadnought' | 'hive' | 'lancer' | 'spiral' | 'maw';
export type PowerKind = 'gun' | 'missiles' | 'shield' | 'repair' | 'wingman' | 'nova';

export interface EnemyDef { name: string; hp: number; r: number; speed: number; pts: number; scrap: number; contact: number; leak: number }
export const ENEMIES: Record<Exclude<EKind, 'boss'>, EnemyDef> = {
  drone:    { name: 'Drone',    hp: 8,  r: 3,   speed: 12, pts: 100, scrap: 2,  contact: 8,  leak: 6 },
  armor:    { name: 'Armor',    hp: 26, r: 4,   speed: 8,  pts: 300, scrap: 6,  contact: 12, leak: 10 },
  weaver:   { name: 'Weaver',   hp: 10, r: 3,   speed: 14, pts: 200, scrap: 3,  contact: 8,  leak: 6 },
  diver:    { name: 'Diver',    hp: 9,  r: 3,   speed: 10, pts: 250, scrap: 4,  contact: 10, leak: 4 },
  gunner:   { name: 'Gunner',   hp: 18, r: 3.5, speed: 10, pts: 300, scrap: 5,  contact: 10, leak: 0 },
  splitter: { name: 'Splitter', hp: 16, r: 4,   speed: 9,  pts: 250, scrap: 4,  contact: 10, leak: 8 },
  mini:     { name: 'Shard',    hp: 4,  r: 2,   speed: 16, pts: 60,  scrap: 1,  contact: 5,  leak: 3 },
};

export interface SectorTheme {
  name: string; sky: [string, string]; nebula: string[]; star: string; rock: string; accent: string;
  /** Enemy mix weights for this theme (in addition to the base mix). */
  mix: Partial<Record<Exclude<EKind, 'boss' | 'mini'>, number>>;
  boss: BossKind;
}
export const SECTORS: SectorTheme[] = [
  { name: 'Kuiper Drift', sky: ['#05081a', '#0b1634'], nebula: ['#1d3a7a', '#2b5bb0', '#123060'], star: '#cfe3ff', rock: '#7b7468', accent: '#4aa3ff',
    mix: { drone: 6, weaver: 2, armor: 1, diver: 1 }, boss: 'dreadnought' },
  { name: 'Ember Nebula', sky: ['#160507', '#2a0b0c'], nebula: ['#7a1d1d', '#b0482b', '#5a1230'], star: '#ffe0c8', rock: '#8a5a44', accent: '#ff8a3c',
    mix: { drone: 4, weaver: 2, armor: 2, diver: 2, gunner: 1 }, boss: 'hive' },
  { name: 'Crystal Reach', sky: ['#03121a', '#08283a'], nebula: ['#1d6a7a', '#2bb0a8', '#124a60'], star: '#d8fffb', rock: '#7fc8d8', accent: '#5cf2e0',
    mix: { drone: 3, weaver: 3, armor: 2, splitter: 2, gunner: 1 }, boss: 'lancer' },
  { name: 'Ion Storm', sky: ['#0d0518', '#1e0b34'], nebula: ['#4a1d7a', '#8a2bb0', '#2a1260'], star: '#f0dcff', rock: '#8e78a8', accent: '#c46cff',
    mix: { drone: 3, weaver: 2, armor: 2, diver: 3, gunner: 2, splitter: 1 }, boss: 'spiral' },
  { name: 'The Maw', sky: ['#020a05', '#06180c'], nebula: ['#1d5a2a', '#3a8a2b', '#0e3a18'], star: '#e0ffe4', rock: '#5f6e58', accent: '#7dff5a',
    mix: { drone: 2, weaver: 2, armor: 3, diver: 2, gunner: 2, splitter: 2 }, boss: 'maw' },
];
export const sectorTheme = (sector: number): SectorTheme => SECTORS[(sector - 1) % SECTORS.length];

export interface BossDef { name: string; title: string; hp: number; r: number; color: string }
export const BOSSES: Record<BossKind, BossDef> = {
  dreadnought: { name: 'Dreadnought', title: 'Iron Dreadnought', hp: 900, r: 9, color: '#ffd24a' },
  hive:        { name: 'Hive Carrier', title: 'Hive Carrier', hp: 1000, r: 10, color: '#ff8a3c' },
  lancer:      { name: 'Twin Lancer', title: 'The Twin Lancer', hp: 520, r: 6, color: '#5cf2e0' }, // per half
  spiral:      { name: 'Spiral Core', title: 'Spiral Core', hp: 1100, r: 8, color: '#c46cff' },
  maw:         { name: 'The Maw', title: 'The Maw', hp: 1500, r: 12, color: '#7dff5a' },
};

export interface PowerDef { name: string; letter: string; color: string; weight: number }
export const POWERS: Record<PowerKind, PowerDef> = {
  gun:      { name: 'Gun Up',       letter: 'P', color: '#ffd84a', weight: 5 },
  missiles: { name: 'Missiles',     letter: 'M', color: '#ff6b4a', weight: 3 },
  shield:   { name: 'Shield Cell',  letter: 'S', color: '#4aa3ff', weight: 3 },
  repair:   { name: 'Repair Kit',   letter: 'R', color: '#6fff8a', weight: 2 },
  wingman:  { name: 'Wingman',      letter: 'W', color: '#ff5af0', weight: 2 },
  nova:     { name: 'Nova Bomb',    letter: 'N', color: '#ffffff', weight: 1 },
};
export const POWER_KINDS = Object.keys(POWERS) as PowerKind[];

/** Gun pattern per level: angles (rad from straight up) of the shots each trigger pull fires. */
export const GUN_SPREAD: number[][] = [
  [0],
  [-0.04, 0.04],
  [-0.16, 0, 0.16],
  [-0.22, -0.06, 0.06, 0.22],
  [-0.3, -0.12, 0, 0.12, 0.3],
];
export const GUN_MAX = GUN_SPREAD.length;

export type Formation = 'single' | 'line' | 'vee' | 'column' | 'pincer';
