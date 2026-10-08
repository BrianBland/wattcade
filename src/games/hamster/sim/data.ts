// Static content for HAMSTERGRID: generators, upgrades, peptides, vibes, milestones, news.
// Pure data + tiny helpers; no DOM, no randomness.

export interface GenDef { id: string; name: string; flavor: string; upg: [string, string, string, string, string] }

/** 24 generators, 3 per era. Output/cost follow a geometric ladder (see econ.ts). */
export const GENS: GenDef[] = [
  { id: 'hamster', name: 'Hamster', flavor: "Gerald's cousin. Runs because you run.",
    upg: ['Sunflower Seeds', 'Tiny Dumbbells', 'Tiny Headbands', 'Hamster Has Seen "Rocky"', 'Eye of the Hamster'] },
  { id: 'gerbil', name: 'Gerbil Subcontractor', flavor: '1099 employee. No benefits. Many wheels.',
    upg: ['Gig Economy App', 'Performance Reviews', 'Stock Options (Worthless)', 'Unpaid Overtime', 'Gerbil Middle Management'] },
  { id: 'guinea', name: 'Guinea Pig Treadmill', flavor: 'Squeaks in a key that powers lightbulbs.',
    upg: ['Squeak Optimization', 'Treadmill Incline', 'Guinea Pig Spin Class', 'Motivational Squeaking', 'Peloton for Pigs'] },
  { id: 'gym', name: 'Hamster Gym', flavor: '24h access. Judgement-free zone. Mirrors everywhere.',
    upg: ['Protein Shakes', 'Mirror Selfies', 'Mandatory Leg Day', 'Bro Science', 'Gym Rat Exchange Program'] },
  { id: 'ferret', name: 'Ferret Turbine', flavor: 'A ferret in a tube. Nobody asked how.',
    upg: ['Lubricated Tubes', 'Ferret Legging Champion', 'Turbo Ferret', 'Twin-Ferret Turbocharger', 'Ferret Afterburner'] },
  { id: 'capy', name: 'Capybara Cooperative', flavor: 'Extremely chill. Somehow the most productive.',
    upg: ['Hot Spring Breaks', 'Orange on Head', 'Vibes-Based Management', 'Capybara Meditation Retreat', 'Unbothered. Moisturized. Spinning.'] },
  { id: 'wheelwork', name: 'WheelWork™ Coworking', flavor: 'Disrupting the wheel. Kombucha on tap. $47B valuation.',
    upg: ['Kombucha on Tap', 'Ping Pong Table', 'Hustle Culture', 'Series B', '"We\'re a Family Here"'] },
  { id: 'influencer', name: 'Hamstagram Influencer', flavor: 'Sells pre-workout. Generates energy from engagement.',
    upg: ['Ring Light', 'Sponsored Content', 'Code GERALD20', 'Viral Reel', 'Canceled & Comeback Tour'] },
  { id: 'hedge', name: 'Hamster Hedge Fund', flavor: 'Shorts the sunflower seed market. Somehow makes watts.',
    upg: ['Insider Trading (Seeds)', '100x Leverage', 'Short the Gerbils', 'Taxpayer Bailout', 'Too Big to Fail'] },
  { id: 'substation', name: 'Gerbil-to-Grid Substation', flavor: 'Your utility bill now lists "rodent" as a source.',
    upg: ['Smart Meter', 'Grid-Tie Inverter', 'Transformer Hamsters', 'Rolling Blackouts (Others)', 'Lobbying'] },
  { id: 'dam', name: 'Hamster Dam', flavor: 'A hydro dam where the water is also hamsters.',
    upg: ['Fish Ladder (for Hamsters)', 'Taller Dam', 'Spillway Wheels', 'Environmental Waiver', 'Hoover Dam Annexation'] },
  { id: 'windfarm', name: 'Hamster Wind Farm', flavor: 'Ten thousand hamsters blowing very hard.',
    upg: ['Lung Capacity Training', 'Spicy Food Diet', 'Birthday Candle Practice', 'Hurricane Hamsters', 'The Collective Exhale'] },
  { id: 'fission', name: 'Hamster Fission Reactor', flavor: "We split the hamster. He's fine. He's two hamsters now.",
    upg: ['Control Rods (Optional)', 'Heavy Water Bottles', 'Cooling Tower Wheels', 'Breeder Hamsters', 'Meltdown Insurance'] },
  { id: 'hadron', name: 'Large Hadron Wheel', flavor: '27 km of wheel under Switzerland. CERN is "concerned".',
    upg: ['Superconducting Fur', 'The Higgs Hamster', 'Antimatter Seeds', 'FTL Hamster (Retracted)', 'Pocket Black Hole (Contained-ish)'] },
  { id: 'tokamak', name: 'Hamster Tokamak', flavor: 'They run inside the plasma. They do not stop.',
    upg: ['Magnetic Fur', 'Plasma-Proof Socks', 'Stellarator Twist', 'Ignition', 'Fusion: 30 Years Away (Not Anymore)'] },
  { id: 'continental', name: 'Continental Wheel', flavor: 'Eurasia, but it spins.',
    upg: ['Plate Tectonics Lube', 'Pangaea Reunion Tour', 'Continental Drift Racing', 'Ocean Removal', 'Supercontinent Wheel'] },
  { id: 'core', name: 'Planetary Core Wheel', flavor: "Hamsters in the outer core. Earth's day is now 23h 58m.",
    upg: ['Magma Treads', 'Geodynamo Hamsters', 'Shorter Days', 'Magnetic Field (Optional)', 'Inner Core Overclock'] },
  { id: 'moon', name: 'Lunar Hamster Colony', flavor: 'Low gravity. High cadence.',
    upg: ['Low-G Cardio', 'Moon Cheese (Real)', 'Tidal Lock Bypass', 'Far Side Gym', 'Moon Spin-Up'] },
  { id: 'ring', name: 'Orbital Ring Wheel', flavor: 'A wheel around Earth. Squeaks in vacuum somehow.',
    upg: ['Space Elevator Wheels', 'Orbital Squeak Dampers', 'Kessler Syndrome (Productive)', 'Ring Expansion', 'Second Ring'] },
  { id: 'mercury', name: 'Mercury Disassembly Crew', flavor: "We needed the iron. Mercury didn't need to be a planet.",
    upg: ['Mass Drivers', 'Self-Replicating Hamsters', 'Planetary Recycling', 'Venus Is Next', 'Asteroid Belt Snacks'] },
  { id: 'dyson', name: 'Dyson Swarm Wheel', flavor: 'A hamster wheel in every swarm panel. The Sun is now a gym.',
    upg: ['Statite Wheels', 'Solar Sail Seeds', 'Stellar Lifting', 'Matrioshka Wheels', 'Sun Gym Membership'] },
  { id: 'penrose', name: 'Black Hole Penrose Wheel', flavor: "Spin harvested from a Kerr black hole. Gerald's idea.",
    upg: ['Ergosphere Treadmill', 'Hawking Radiation Seeds', 'Spaghettification Resistance', 'Event Horizon Cardio', 'Kerr Overclock'] },
  { id: 'galactic', name: 'Galactic Arm Wheel', flavor: 'The Milky Way goes around because of hamsters.',
    upg: ['Dark Matter Treads', 'Spiral Arm Alignment', 'Andromeda Merger', 'Galactic Center Gym', 'Intergalactic Wheel Tour'] },
  { id: 'bigspin', name: 'The Big Spin', flavor: 'The universe was a wheel all along. You are on it.',
    upg: ['Cosmic Inflation', 'Heat Death Postponed', 'Multiverse Franchising', 'Big Crunch Cadence', 'Gerald Ascends'] },
];

export const ERAS = [
  { name: 'The Shoebox', blurb: 'One hamster. One dream.' },
  { name: 'The Garage', blurb: 'Zoning laws have not caught up.' },
  { name: 'The Startup', blurb: 'Hamster-as-a-Service.' },
  { name: 'The Utility', blurb: 'You are now critical infrastructure.' },
  { name: 'The Megaproject', blurb: 'Several governments are asking questions.' },
  { name: 'The Planet', blurb: 'Earth is a wheel now.' },
  { name: 'The Star', blurb: 'Kardashev II. The Sun works for Gerald.' },
  { name: 'The Galaxy', blurb: 'There is no outside of the wheel.' },
] as const;
export const eraOfGen = (i: number) => Math.floor(i / 3);

/** Upgrade tier: requires `own` of the generator; costs `costX` × generator base cost; doubles it. */
export const UPG_TIERS = [
  { own: 1, costX: 10 }, { own: 10, costX: 60 }, { own: 25, costX: 600 }, { own: 50, costX: 2.5e4 }, { own: 100, costX: 2e6 },
] as const;

/** Leg upgrades: ×legX your own watts each. */
export const LEGS = [
  'Chamois Cream', 'Clipless Pedals', 'Shaved Legs', 'Carbon Everything', 'Aero Socks', 'Marginal Gains',
  'Bib Shorts of Destiny', 'Legs of a God', 'Tour de France (Doped)', 'Quadzilla',
];

/** Monotony upgrades: each raises the Mind-Numbing cap by +1. */
export const MONOS = [
  'Beige Wallpaper', 'Elevator Music', 'Watching Paint Dry', 'Excel Training Seminar', 'Golf on TV',
  'Airport Layover', 'DMV Waiting Room', 'The Tax Code, Read Aloud',
];

/** One-off special upgrades (QoL + mechanics). `costSec`: priced as N seconds of output at unlock, with floor `min`. */
export const SPECIALS = [
  { id: 'manager', name: 'Middle Manager Hamster', desc: 'Auto-buys generators with spare energy (≤25% of bank).', era: 1, min: 4e5 },
  { id: 'hr', name: 'Hamster HR Department', desc: 'Auto-buys upgrades too. Nobody likes HR.', era: 3, min: 5e10 },
  { id: 'union', name: 'Union Recognition', desc: 'Broken strikes pay ×2. Solidarity, comrade.', era: 3, min: 2e11 },
  { id: 'seedsub', name: 'Seed Subscription Box', desc: 'Golden hamsters appear 30% more often.', era: 2, min: 2e8 },
  { id: 'dealer', name: 'A Guy Named Dmitri', desc: 'Black market prices -40%. Do not ask questions.', era: 4, min: 5e14 },
  { id: 'zen', name: 'Hamster Zen Master', desc: 'Mind-Numbing decays 50% slower.', era: 2, min: 5e7 },
  { id: 'trialpro', name: 'Professional Lab Rat', desc: 'Clinical trials pay ×3.', era: 4, min: 2e15 },
  { id: 'cloning', name: 'Hamster Cloning Vat', desc: 'All generators +50%. The clones are also named Gerald.', era: 5, min: 1e19 },
] as const;
export type SpecialId = typeof SPECIALS[number]['id'];

export interface PeptideDef { id: string; name: string; label: string; desc: string; era: number; costSec: number; dur: number }
export const PEPTIDES: PeptideDef[] = [
  { id: 'seeds', name: 'Organic Sunflower Seeds', label: 'LEGAL', desc: 'All output ×1.5 for 60 s.', era: 0, costSec: 25, dur: 60 },
  { id: 'bpc', name: 'BPC-157', label: 'RESEARCH ONLY', desc: 'Wheel bearings heal. Mind-Numbing cannot decay for 5 min.', era: 1, costSec: 50, dur: 300 },
  { id: 'tb', name: 'TB-500', label: 'NOT FOR HAMSTER USE', desc: 'Hamsters ×2 for 2 min.', era: 1, costSec: 80, dur: 120 },
  { id: 'pre', name: 'Hamstergy™ Pre-Workout', label: '900 mg CAFFEINE', desc: '×6 for 30 s. Then the crash (×0.5, 30 s).', era: 2, costSec: 45, dur: 60 },
  { id: 'ozem', name: 'Ozempeptide', label: 'OFF-LABEL', desc: 'Generators 25% cheaper for 3 min.', era: 2, costSec: 100, dur: 180 },
  { id: 'mk', name: 'MK-677 "Gerald-Sized"', label: 'GROWTH HORMONE', desc: 'Your legs ×25 for 2 min. Gerald gets very large.', era: 3, costSec: 60, dur: 120 },
  { id: 'tren', name: 'Trenbalone', label: '100% PURITY', desc: '×15 for 45 s. 30% chance of ROID RAGE.', era: 3, costSec: 140, dur: 45 },
  { id: 'vial', name: 'Unlabeled Vial #4', label: '???', desc: 'Something happens. Probably.', era: 4, costSec: 30, dur: 0 },
  { id: 'stack', name: 'The Shenzhen Stack', label: 'DO NOT', desc: 'Everything ×4 for 3 min. Gerald glows.', era: 5, costSec: 400, dur: 180 },
];

export interface VibeDef { id: string; name: string; desc: string; era: number }
export const VIBES: VibeDef[] = [
  { id: 'shades', name: 'Hamster Sunglasses', desc: 'Gerald is too cool to look at you.', era: 0 },
  { id: 'confetti', name: 'Confetti Cannons', desc: 'Every purchase is a celebration.', era: 0 },
  { id: 'rgb', name: 'RGB Wheels', desc: '+0% performance. +100% gamer.', era: 1 },
  { id: 'shake', name: 'Screen Shake', desc: 'Purchases now have weight.', era: 1 },
  { id: 'disco', name: 'Disco Ball', desc: 'Saturday night wheel fever.', era: 2 },
  { id: 'comic', name: 'Comic Sans Mode', desc: 'Professional.', era: 2 },
  { id: 'lasers', name: 'Laser Show', desc: 'Pew.', era: 3 },
  { id: 'tesla', name: 'Tesla Coils', desc: 'Visible electricity. Finally.', era: 3 },
  { id: 'crt', name: 'CRT Mode', desc: 'Scanlines for that 1994 feel.', era: 4 },
  { id: 'vapor', name: 'Vaporwave Sky', desc: 'A E S T H E T I C   W H E E L', era: 4 },
  { id: 'bighead', name: 'Big Head Mode', desc: 'Gerald, but mostly head.', era: 5 },
  { id: 'hypno', name: 'Hypno Spiral', desc: 'You are getting very monotonous...', era: 5 },
  { id: 'fried', name: 'Deep Fried', desc: 'Contrast to the moon.', era: 6 },
  { id: 'halo', name: "Gerald's Halo", desc: 'He has seen the other side of the wheel.', era: 6 },
];

/** Equivalence units for "≈ N toasters". */
export const UNITS: Array<[number, string, string]> = [
  [1, 'AA battery', 'AA batteries'],
  [10, 'LED bulb', 'LED bulbs'],
  [1000, 'toaster', 'toasters'],
  [3e5, 'Tesla flooring it', 'Teslas flooring it'],
  [1.21e9, 'DeLorean', 'DeLoreans'],
  [2.25e10, 'Three Gorges Dam', 'Three Gorges Dams'],
  [1.9e13, 'humanity', 'humanities'],
  [1.74e17, 'all sunlight hitting Earth', '× all sunlight hitting Earth'],
  [3.8e26, 'Sun', 'Suns'],
  [5e36, 'Milky Way', 'Milky Ways'],
  [1e49, 'observable universe', 'observable universes'],
];

export const NEWS: string[][] = [
  [
    'Local cyclist pedals for an hour, goes nowhere. Shareholders thrilled.',
    'Hamster named Gerald "just happy to be here".',
    'Study: stationary cycling is "basically a hamster wheel". Cyclist: "and?"',
    'Pet store reports run on hamster wheels. Police baffled.',
    'Gerald spotted doing a second lap. Experts call it "commitment".',
  ],
  [
    'Neighbors complain of "constant squeaking" from garage.',
    'Ferret found in turbine. Ferret says it is "fine actually".',
    'Capybara elected union steward by acclamation.',
    'Local man installs 3-phase power in shoebox.',
  ],
  [
    'WheelWork™ raises $2B to "reimagine the circle".',
    'Hamster influencer sued over undisclosed sunflower seed sponsorship.',
    'Hamster union demands "dental and also more seeds".',
    'Analysts downgrade gerbils to "hold".',
  ],
  [
    'Utility adds "rodent" to energy mix pie chart.',
    'Senate hearing on hamster grid ends when hamster refuses to stop running.',
    'Wind farm hamsters report "light-headedness".',
    'Brownout in three states as Gerald takes a nap.',
  ],
  [
    'CERN: Large Hadron Wheel "probably fine".',
    'FDA "concerned" about jacked hamsters. Hamsters "concerned" about FDA.',
    'Fusion achieved. Hamsters describe it as "warm".',
    'IAEA inspectors leave hamster reactor "visibly sweating".',
  ],
  [
    "Earth's rotation speeds up. Calendar companies furious.",
    'Moon colony hamsters refuse to return: "the cadence is incredible up here".',
    'Continents now spin. Geologists retire en masse.',
    'Orbital wheel visible from every backyard. Astronomers: "please stop".',
  ],
  [
    'Sun dims slightly. Hamster spokesperson declines to comment.',
    'Mercury reported missing. Gerald has an alibi.',
    'Kardashev scale committee adds footnote: "includes rodents".',
    'Dyson family lawyers send cease-and-desist to hamster.',
  ],
  [
    'Andromeda agrees to merger. Synergies "mostly wheel-related".',
    'Black hole asked to spin faster. Black hole complies.',
    'Physicists confirm universe is "slightly wheel-shaped".',
    'Heat death of universe postponed due to scheduling conflict with Gerald.',
  ],
];

export const PEPTIDE_NEWS = [
  'Suspicious package from Shenzhen delivered. Label: "RESEARCH CHEMICAL. NOT FOR HAMSTER USE."',
  'Gerald seen with veins in places hamsters do not have places.',
  'Gerald now benches 4x his body weight. His body weight is 40 g.',
  'Hamster passes drug test. Drug test fails hamster.',
  'Gerald is now fluent in Mandarin. Nobody knows why.',
];
