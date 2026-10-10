import type { Item, JerseyLook, JerseyPattern, PaintLook, Slot, Source } from './types';

/**
 * Every cosmetic. Unlocks are derived (never stored): the default items, level rewards up to the rider's level,
 * one item per achievement earned, and the items picked at pick levels. Ids are permanent (loadouts store them).
 * Rules (tested): every achievement grants exactly one item; levels 2..LAST_LEVEL grant one item each, except pick
 * levels (every PICK_EVERY), which offer three.
 */
export const PICK_EVERY = 5;
export const LAST_LEVEL = 50;

const D: Source = { default: true };
const L = (level: number): Source => ({ level });
const A = (achievement: string): Source => ({ achievement });
const P = (pick: number): Source => ({ pick });

const bike = (id: string, name: string, source: Source, flavor?: string): Item => ({ slot: 'bike', id, name, source, flavor });
const hat = (id: string, name: string, source: Source, flavor?: string): Item => ({ slot: 'hat', id, name, source, flavor });
const title = (id: string, name: string, source: Source): Item => ({ slot: 'title', id, name, source });
const pet = (id: string, name: string, source: Source, flavor?: string): Item => ({ slot: 'pet', id, name, source, flavor });
const trail = (id: string, name: string, source: Source, flavor?: string): Item => ({ slot: 'trail', id, name, source, flavor });
const jersey = (id: string, name: string, source: Source, pattern: JerseyPattern, base = 'rider', ink = '#ffffff', flavor?: string): Item =>
  ({ slot: 'jersey', id, name, source, look: { pattern, base, ink } as JerseyLook, flavor });
const paint = (id: string, name: string, source: Source, frame: string, kind: PaintLook['kind'] = 'solid', frame2?: string): Item =>
  ({ slot: 'paint', id, name, source, look: { frame, frame2, kind } });

export const ITEMS: Item[] = [
  // ---------- bikes ----------
  bike('road', 'Road Bike', D, 'Light, fast, sensible. For now.'),
  bike('bmx', 'BMX', L(6), 'Tiny wheels, big attitude.'),
  bike('pennyfarthing', 'Penny-farthing', L(12), 'The cranks turn the giant front wheel directly. Top hat optional.'),
  bike('tricycle', 'Tricycle', L(18), 'Unbeatable stability. Knees optional.'),
  bike('mtb', 'Mountain Bike', L(24), 'Fat tyres and a suspension fork, for the moon’s craters.'),
  bike('chopper', 'Chopper', L(31), 'Ape-hanger bars, banana seat, endless cool.'),
  bike('hobbyhorse', 'Hobby Horse', L(37), 'No pedals. You just run. Neigh.'),
  bike('tandem', 'Tandem', L(43), 'A ghostly stoker in your colors pedals along behind.'),
  bike('cruiser', 'Beach Cruiser', P(5), 'Swept bars, whitewalls, no hurry.'),
  bike('clown', 'Clown Bike', P(10), 'Knees meet ears. Honk honk.'),
  bike('cargo', 'Cargo Bike', P(15), 'A big box up front. Room for a friend.'),
  bike('velomobile', 'Velomobile', P(20), 'A recumbent in an aero egg. Very fast, very egg.'),
  bike('sofa', 'Couch Cruiser', P(25), 'A sofa on wheels. Finally, comfort.'),
  bike('bamboo', 'Bamboo Bike', P(30), 'Hand-built from bamboo. Smells faintly of panda.'),
  bike('ostrich', 'Ostrich', P(35), 'Not technically a bike. Very fast legs.'),
  bike('swan', 'Swan Pedalo', P(40), 'The lake pedalo, now on wheels.'),
  bike('ufo', 'Hover Saucer', P(45), 'Pedal-powered antigravity. Do not ask how.'),
  bike('carousel', 'Carousel Horse', P(50), 'Bobs up and down on its golden pole, forever.'),
  bike('tron', 'Light Cycle', A('arcade_rat'), 'Leaves a wall of light. Derezzes nothing (yet).'),
  bike('rocket', 'Rocket Bike', A('kj_50k'), 'The booster burns harder the harder you push.'),
  bike('tallbike', 'Tall Bike', A('hours_100'), 'Two frames welded together. Wave at the second floor.'),
  bike('recumbent', 'Recumbent', A('ride_90'), 'Lie back. You earned it.'),
  bike('unicycle', 'Unicycle', A('spin_doctor'), 'Half the wheels, all the wobble.'),
  bike('broom', 'Broomstick', A('witching_hour'), 'Pedals in mid-air. Very traditional.'),
  bike('wheel', 'Hamster Wheel', A('hm_era8'), 'Gerald’s ultimate gift: ride inside the wheel.'),

  // ---------- helmets & hats ----------
  hat('road', 'Road Helmet', D, 'Safety first, with a stripe in your color.'),
  hat('beanie', 'Beanie', L(3)), hat('cowboy', 'Cowboy Hat', L(8)), hat('tophat', 'Top Hat', L(13)),
  hat('pirate', 'Pirate Hat', L(17)), hat('chef', 'Chef’s Hat', L(21)), hat('cone', 'Traffic Cone', L(26)),
  hat('jester', 'Jester', L(29)), hat('antlers', 'Antlers', L(33)), hat('unicorn', 'Unicorn Horn', L(36)),
  hat('mohawk', 'Mohawk Helmet', L(41)), hat('cat', 'Cat Ears', L(44)), hat('wizard', 'Wizard Hat', L(48)),
  hat('bowler', 'Bowler Hat', P(5)), hat('santa', 'Santa Hat', P(10)), hat('deely', 'Deely Boppers', P(15)),
  hat('pumpkin', 'Pumpkin', P(20)), hat('duck', 'Rubber Duck', P(25), 'A rubber duck rides on your helmet.'),
  hat('ushanka', 'Ushanka', P(30)), hat('tiara', 'Tiara', P(35)), hat('football', 'Football Helmet', P(40)),
  hat('bucket', 'Bucket', P(45), 'An actual bucket.'), hat('crown', 'Crown', P(50)),
  hat('cap', 'Cycling Cap', A('first_ride'), 'Brim up. You’re a cyclist now.'),
  hat('propeller', 'Propeller Beanie', A('sampler'), 'Spins faster the faster you go.'),
  hat('popcorn', 'Popcorn Bucket', A('double_feature')),
  hat('laurel', 'Laurel Wreath', A('week_streak_12')),
  hat('nightcap', 'Nightcap', A('night_owl')),
  hat('birdnest', 'Bird’s Nest', A('early_bird'), 'The early bird lives up there now.'),
  hat('party', 'Party Hat', A('new_year')),
  hat('aero', 'Aero Helmet', A('sprints_500')),
  hat('hardhat', 'Hard Hat', A('diesel')),
  hat('viking', 'Viking Helmet', A('leg_day')),
  hat('bunny', 'Bunny Ears', A('leap_rider')),
  hat('mortarboard', 'Mortarboard', A('overachiever')),
  hat('knight', 'Knight’s Helm', A('dungeon_clear')),
  hat('halo', 'Halo', A('dg_deathless')),
  hat('horns', 'Devil Horns', A('dg_curses')),
  hat('lamp', 'Lantern Hat', A('keeper_20'), 'A tiny lighthouse lamp. It sweeps.'),
  hat('souwester', 'Sou’wester', A('storm_chaser')),
  hat('flowers', 'Flower Crown', A('lh_bloom')),
  hat('captain', 'Captain’s Cap', A('lh_harbour')),
  hat('welder', 'Welding Mask', A('td_boss')),
  hat('alien', 'Alien Antennae', A('sf_deep')),
  hat('pilot', 'Pilot’s Cap', A('sf_kills')),
  hat('hamster', 'Hamster', A('hm_era6'), 'A hamster sits on your head and runs along.'),
  hat('sweatband', 'Sweatband', A('hm_spin')),
  hat('sunhat', 'Sun Hat', A('wu_tourist')),
  hat('bubble', 'Space Bubble', A('wu_moon')),
  hat('headphones', 'Headphones', A('cz_first')),
  hat('fishing', 'Fishing Hat', A('ws_salmon')),
  hat('umbrella', 'Umbrella Hat', A('ws_dry_feet')),
  hat('beaver', 'Beaver Hat', A('ws_dam_buster')),
  hat('dino', 'Dino Hood', A('ws_meteor')),
  hat('cloud', 'Rain Cloud', A('ws_cloud'), 'Your own little cloud. It drizzles.'),

  // ---------- jerseys ----------
  jersey('plain', 'Club Jersey', D, 'plain'),
  jersey('vstripes', 'Pinstripes', L(4), 'vstripes'),
  jersey('sash', 'Sash', L(9), 'sash'),
  jersey('checker', 'Chequered', L(14), 'checker', 'rider', '#15151c'),
  jersey('tux', 'Tuxedo', L(19), 'tux', '#15151c', '#ffffff'),
  jersey('zebra', 'Zebra', L(23), 'zebra', '#f4f4f4', '#15151c'),
  jersey('cape', 'Superhero', L(28), 'cape', 'rider', '#e8322b', 'Comes with a cape.'),
  jersey('rainbow', 'Rainbow Stripes', L(34), 'rainbow', '#f4f4f4'),
  jersey('stars', 'Starry Night', L(39), 'stars', '#16205a', '#ffd23b'),
  jersey('galaxy', 'Galaxy', L(46), 'galaxy', '#160b33', '#c56cf0'),
  jersey('argyle', 'Argyle', P(5), 'argyle', 'rider', '#15151c'),
  jersey('tiedye', 'Tie-Dye', P(10), 'tiedye'),
  jersey('leopard', 'Leopard', P(15), 'leopard', '#e9b04f', '#3a2410'),
  jersey('plaid', 'Lumberjack Plaid', P(20), 'plaid', '#c0262d', '#15151c'),
  jersey('bee', 'Bumblebee', P(25), 'bee', '#ffd23b', '#15151c'),
  jersey('pajamas', 'Pyjamas', P(30), 'pajamas', '#9fd3ff', '#ffffff'),
  jersey('circuit', 'Circuit Board', P(35), 'circuit', '#0f5132', '#7dffb0'),
  jersey('neon', 'Neon Grid', P(40), 'neon', '#140a2a', '#ff2e93'),
  jersey('marble', 'Marble', P(45), 'marble', '#f2f0ea', '#9a9aa8'),
  jersey('royal', 'Royal Robe', P(50), 'royal', '#5b1d8a', '#f4f4f4'),
  jersey('hoops', 'Hoops', A('week_streak_4'), 'hoops'),
  jersey('lightning', 'Lightning Bolt', A('kj_10k'), 'bolt', 'rider', '#ffd23b'),
  jersey('retro', 'Retro Wool', A('sessions_50'), 'retro', '#8a5a2b', '#f2e6c8'),
  jersey('green', 'Sprinter’s Green', A('sprints_100'), 'plain', '#22b14c'),
  jersey('yellow', 'Yellow Jersey', A('km_3400'), 'plain', '#ffd400'),
  jersey('polka', 'Polka Dots', A('climb_1000'), 'dots', '#ffffff', '#e8322b'),
  jersey('tiger', 'Tiger', A('big_day'), 'tiger', '#f28c28', '#15151c'),
  jersey('flames', 'Flames', A('rocket_legs'), 'flames', '#15151c', '#ff7a1a'),
  jersey('chainmail', 'Chainmail', A('dg_floor10'), 'mail', '#9aa0aa', '#5d636e'),
  jersey('skeleton', 'Skeleton', A('dg_floor20'), 'bones', '#15151c', '#f4f4f4'),
  jersey('lighthouse', 'Lighthouse', A('lh_lifeboat'), 'lighthouse', '#f4f4f4', '#e8322b'),
  jersey('hazard', 'Hazard Stripes', A('td_wave25'), 'hazard', '#ffd23b', '#15151c'),
  jersey('camo', 'Camo', A('td_kills'), 'camo', '#5b6b3a', '#3a4526'),
  jersey('flightsuit', 'Flight Suit', A('sf_maw'), 'suit', '#5a6b4a', '#ff8a3c'),
  jersey('hamster', 'Hamster Jersey', A('hm_era4'), 'hamster', '#f2a33a', '#fff1d6'),
  jersey('labcoat', 'Lab Coat', A('hm_trial'), 'coat', '#f4f4f4', '#9fd3ff'),
  jersey('hawaiian', 'Hawaiian Shirt', A('wu_globetrotter'), 'floral', '#1aa6b7', '#ff6b8a'),
  jersey('equalizer', 'Equalizer', A('cz_overdrive'), 'eq', '#140a2a', 'rider'),
  jersey('disco', 'Disco Sequins', A('cz_songs'), 'disco', '#c0c4d0', '#ffffff'),
  jersey('waves', 'Waves', A('ws_cycle'), 'waves', '#1565c0', '#9fe3ff'),
  jersey('overalls', 'Miller’s Overalls', A('ws_miller'), 'overalls', '#f2e6c8', '#3b5b8c'),

  // ---------- paint ----------
  paint('silver', 'Silver', D, '#d8dbe6'),
  paint('white', 'Fresh White', L(2), '#ffffff'),
  paint('mint', 'Mint', L(11), '#7dffcf'),
  paint('pink', 'Bubblegum', L(22), '#ff8ad8'),
  paint('olive', 'Army Green', L(32), '#6b7a3a'),
  paint('prism', 'Prism', L(42), '#ff0000', 'rainbow'),
  paint('gold', 'Solid Gold', L(49), '#ffd23b', 'glow'),
  paint('teal', 'Teal', A('three_day_week'), '#18b6b0'),
  paint('electric', 'Electric', A('kilojoule_1000'), '#3bf0ff', 'glow'),
  paint('red', 'Race Red', A('sessions_10'), '#e8322b'),
  paint('blue', 'Deep Blue', A('km_100'), '#2a5bd7'),
  paint('orange', 'Sprint Orange', A('sprinter_10'), '#ff8a1a'),
  paint('stealth', 'Stealth Black', A('ride_60'), '#26262e'),
  paint('purple', 'Mythic Purple', A('dg_unique'), '#a046ff', 'glow'),
  paint('plasma', 'Plasma', A('triple_rail'), '#00e5ff', 'fade', '#a046ff'),
  paint('volt', 'Volt', A('td_surges'), '#e6ff2b'),
  paint('neonpink', 'Neon Pink', A('sf_combo'), '#ff2e93', 'glow'),
  paint('chrome', 'Chrome', A('sf_goldens'), '#f4f7ff', 'fade', '#7d8494'),
  paint('synthwave', 'Synthwave', A('cz_chain'), '#ff2e93', 'fade', '#00e5ff'),
  paint('lava', 'Lava', A('ws_act_of_nature'), '#ff3b1a', 'fade', '#ffd23b'),

  // ---------- pets (run ahead or fly alongside; they follow your effort) ----------
  pet('none', 'No pet', D),
  pet('corgi', 'Corgi', L(7), 'Short legs, maximum effort.'),
  pet('cat', 'Cat', A('triple_threat'), 'Keeps up when it feels like it.'),
  pet('pig', 'Piglet', A('welcome_back')),
  pet('chicken', 'Chicken', A('weekend_warrior'), 'Why did it cross the road? To ride with you.'),
  pet('bee', 'Bumblebee', A('hummingbird')),
  pet('parrot', 'Parrot', A('hours_50')),
  pet('bat', 'Bat', A('dg_floor5')),
  pet('dragon', 'Baby Dragon', A('dg_elites'), 'Sneezes sparks when you sprint.'),
  pet('ghost', 'Ghost', A('dg_kills')),
  pet('gull', 'Seagull', A('lh_districts'), 'Mostly here for your chips.'),
  pet('robodog', 'Robo-Dog', A('td_wave10')),
  pet('drone', 'Drone', A('sf_boss')),
  pet('miniufo', 'Mini UFO', A('sf_flawless')),
  pet('hamsterball', 'Gerald (in a ball)', A('hm_era3'), 'Gerald himself. Rolls faster the harder you push.'),
  pet('trex', 'Tiny T-Rex', A('ws_canyon'), 'Survived the meteor. Tiny arms, huge heart.'),
  pet('penguin', 'Penguin', A('ws_clean_run')),

  // ---------- trails (behind the rear wheel; stronger the faster you go) ----------
  trail('none', 'No trail', D),
  trail('sparks', 'Sparks', L(16)),
  trail('rainbow', 'Rainbow', A('balanced_week')),
  trail('confetti', 'Confetti', A('sessions_200')),
  trail('stars', 'Stardust', A('td_wave50')),
  trail('flames', 'Flames', A('td_spotless'), 'Only really roars at a sprint.'),
  trail('lightning', 'Lightning', A('lh_storm_season')),
  trail('gold', 'Gold Dust', A('hm_golden')),
  trail('leaves', 'Falling Leaves', A('wu_scenic')),
  trail('notes', 'Music Notes', A('cz_full_set')),
  trail('pixels', 'Pixels', A('cz_clean')),
  trail('bubbles', 'Bubbles', A('ws_delta')),

  // ---------- titles ----------
  title('none', 'No title', D),
  title('t_captain', 'Road Captain', L(27)),
  title('t_legend', 'Legend of the Lanes', L(38)),
  title('t_wizard', 'Watt Wizard', L(47)),
  title('t_sore', 'Saddle Sore', A('hours_10')),
  title('t_hauler', 'Long Hauler', A('km_1000')),
  title('t_everest', 'Everester', A('climb_8848')),
  title('t_halfhour', 'Half Hour Hero', A('ride_30')),
  title('t_steady', 'Steady Eddie', A('steady_eddie')),
  title('t_lamplighter', 'Lamplighter', A('lh_lens')),
  title('t_clockwork', 'Clockwork Keeper', A('lh_clockwork')),
  title('t_spin', 'Spin Cycle', A('td_spin')),
  title('t_k1', 'Kardashev I', A('hm_k1')),
  title('t_union', 'Union Rep', A('hm_strike')),
  title('t_reborn', 'Reincarnated', A('hm_reincarnate')),
  title('t_landing', 'Stuck the Landing', A('cz_launch')),
  title('t_sharp', 'Sharpshooter', A('cz_sharp')),
  title('t_maestro', 'Cadence Maestro', A('ws_maestro')),
  title('t_bread', 'Breadbasket', A('ws_breadbasket')),
  title('t_gtp_thief', 'Bike Thief', A('gtp_first_steal')),
  title('t_gtp_bridge', 'Bridge Jumper', A('gtp_drawbridge')),
  title('t_gtp_coyote', 'Super Genius', A('gtp_bail')),
  title('t_gtp_air', 'Frequent Flyer', A('gtp_big_air')),
  title('t_gtp_kingpin', 'Kingpin', A('gtp_kingpin')),
  title('t_gtp_acme', 'ACME Rep', A('gtp_acme')),
];

const BY_ID = new Map(ITEMS.map((i) => [`${i.slot}:${i.id}`, i]));
export const item = (slot: Slot, id: string): Item | undefined => BY_ID.get(`${slot}:${id}`);
export const DEFAULTS: Record<Slot, string> = { bike: 'road', hat: 'road', jersey: 'plain', paint: 'silver', pet: 'none', trail: 'none', title: 'none' };
export const itemsIn = (slot: Slot): Item[] => ITEMS.filter((i) => i.slot === slot);
