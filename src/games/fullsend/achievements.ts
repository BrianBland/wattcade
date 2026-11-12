import type { AchievementDef, SessionRecord } from '../../contracts';
import { countEvents, feat, hasEvent, num, tally } from '../../progression/kit';

const G = 'fullsend';
type Rec = Readonly<SessionRecord>;
const piece = (r: Rec, kind: string, pred: (d: Record<string, number | string | boolean>) => boolean = () => true) =>
  countEvents(r, 'setPiece', (d) => d.kind === kind && Number(d.medal) >= 1 && pred(d));

/**
 * The usual curve: a first tour and the first trip up a layer come in a ride or two; flips, loops and the cave in a few;
 * the moon, the Classic and clean leaps need a strong ride; gold everywhere and the lifetime tallies are the long goals.
 */
export const achievements: AchievementDef[] = [
  // --- first rides ---
  feat(G, { id: 'fs_first_tour', name: 'Sent It', desc: 'Finish a Full Send tour', bonusXp: 40, check: (r) => hasEvent(r, 'tourComplete') }),
  feat(G, { id: 'fs_sky', name: 'Island Hopper', desc: 'Fly off the mega ramp up to the sky islands', bonusXp: 40, check: (r) => num(r, 'skyVisits') >= 1 }),
  feat(G, { id: 'fs_flip', name: 'Head Over Heels', desc: 'Land a flip (hold a full lean in the air)', bonusXp: 30, check: (r) => num(r, 'flips') >= 1 }),
  feat(G, { id: 'fs_loop', name: 'Loop the Loop', desc: 'Pedal all the way round a loop', bonusXp: 40, check: (r) => piece(r, 'loop') >= 1 }),
  // --- a few rides in ---
  feat(G, { id: 'fs_cave', name: 'Bolt-Hole', desc: 'Make the cave in an Outrun without ever being caught', bonusXp: 60, check: (r) => piece(r, 'outrun', (d) => Number(d.caught) === 0) >= 1 }),
  tally(G, 'flips', (r) => num(r, 'flips'))({ id: 'fs_flips', name: 'Flip Factory', desc: 'Land 50 flips', bonusXp: 60, goal: 50, unit: ' flips' }),
  // --- a strong ride ---
  feat(G, { id: 'fs_moon', name: 'Moonshot', desc: 'Ride all the way up to the moon', bonusXp: 80, check: (r) => num(r, 'moonVisits') >= 1 }),
  feat(G, { id: 'fs_reentry', name: 'Re-entry', desc: 'Ride off the moon and burn all the way down to the sea', bonusXp: 80, check: (r) => hasEvent(r, 'launch', (d) => d.from === 'moon' && d.to === 'sea') }),
  feat(G, { id: 'fs_classic', name: 'The Classic', desc: 'Finish the Classic tour', bonusXp: 80, check: (r) => hasEvent(r, 'tourComplete', (d) => d.tour === 'classic') }),
  feat(G, { id: 'fs_matrix', name: 'Bullet Time', desc: 'Clear 3 headline leaps in one ride without touching a hazard', bonusXp: 100, check: (r) => piece(r, 'leap') >= 3 && num(r, 'scorched') === 0 }),
  // --- long goals ---
  tally(G, 'golds', (r) => num(r, 'gold'))({ id: 'fs_golds', name: 'Medal Rack', desc: 'Win 40 gold medals', bonusXp: 120, goal: 40, unit: ' golds' }),
  feat(G, { id: 'fs_golden', name: 'Golden Send', desc: 'Gold on every set piece of a tour', bonusXp: 150, check: (r) => hasEvent(r, 'tourComplete') && num(r, 'sets') >= 5 && num(r, 'gold') === num(r, 'sets') }),
  { id: 'fs_hours', name: 'Rocket Hours', desc: 'Ride Full Send for 10 hours', bonusXp: 200, goal: 10, unit: ' h', count: { key: 'fullsend.hours', agg: 'sum', of: (r) => (r.gameId === G ? r.durationS / 3600 : 0) } },
  // --- secret ---
  feat(G, { id: 'fs_triple', name: 'Triple Flip', desc: 'Land a triple flip', bonusXp: 50, secret: true, check: (r) => hasEvent(r, 'trick', (d) => Number(d.flips) >= 3) }),
];
