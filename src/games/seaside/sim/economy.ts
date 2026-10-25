// All money is integer cents. The catalogue owns weight and $/kg; the fishing mechanic’s late-hook credit scales the rate.
import { FISH, type FishCatch, type FishId } from './catalogue';

export type RodId = 'pier' | 'surf' | 'deep';
export type ExtraId = 'lures' | 'bucketHat' | 'bobber' | 'barBell';
export type ShopId = 'shop1' | 'pierStand';
export type ItemId = 'surf' | 'deep' | ExtraId;
export interface Item { id: ItemId; name: string; cents: number; note: string }
export const ITEMS: readonly Item[] = [
  { id: 'surf', name: 'Surf Rod', cents: 4000, note: 'A little farther out.' },
  { id: 'deep', name: 'the Deep', cents: 9000, note: 'Glyphs on the reel. Heavy line.' },
  { id: 'lures', name: 'Lures', cents: 600, note: 'Something shiny.' },
  { id: 'bucketHat', name: 'Bucket hat', cents: 800, note: 'Keeps the sun off.' },
  { id: 'bobber', name: 'Bobber', cents: 400, note: 'Red above, white below.' },
  { id: 'barBell', name: 'Bar bell', cents: 1000, note: 'For the way home.' },
];
export const RODS: readonly RodId[] = ['pier', 'surf', 'deep'];
export const EXTRAS: readonly ExtraId[] = ['lures', 'bucketHat', 'bobber', 'barBell'];
export const requiredRod = (shop: ShopId): 'surf' | 'deep' => shop === 'shop1' ? 'surf' : 'deep';
export const stock = (shop: ShopId) => ITEMS.filter((i) => i.id === requiredRod(shop) || EXTRAS.includes(i.id as ExtraId));
export const item = (id: ItemId) => ITEMS.find((i) => i.id === id)!;
export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export interface ScaleFish { id: FishId; kg: number; credit?: number }
export interface ReceiptLine { label: string; cents: number }
export interface Receipt { shop: ShopId; lines: ReceiptLine[] }
export interface EconomySave {
  v: 1; cash: number; debt: number; rod: RodId; rods: RodId[]; extras: ExtraId[];
  creel: ScaleFish[]; receipts: Receipt[]; bonusUsed: ShopId[];
}
export interface ShopView {
  id: ShopId; index: number; items: Array<Item & { owned: boolean }>;
  cash: number; debt: number; receipt: Receipt; message: string;
  short: boolean; bonusAvailable: boolean; bonusRemaining: number | null; autoIn: number;
}
const cents = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
export function migrateEconomy(raw: unknown): EconomySave {
  const o = raw && typeof raw === 'object' ? raw as Partial<EconomySave> : {};
  const rod = RODS.includes(o.rod!) ? o.rod! : 'pier';
  const savedRods = Array.isArray(o.rods) ? o.rods : [];
  const best = Math.max(RODS.indexOf(rod), ...RODS.map((r, i) => savedRods.includes(r) ? i : 0));
  const rods = RODS.slice(0, best + 1);
  return {
    v: 1, cash: cents(o.cash), debt: cents(o.debt), rod: rods.at(-1)!, rods,
    extras: EXTRAS.filter((e) => Array.isArray(o.extras) && o.extras.includes(e)),
    creel: Array.isArray(o.creel) ? o.creel.filter((f) => f && Object.hasOwn(FISH, f.id) && Number.isFinite(f.kg) && f.kg > 0).map(({ id, kg, credit }) => ({ id, kg, credit: typeof credit === 'number' && Number.isFinite(credit) ? Math.max(0, Math.min(1, credit)) : 1 })) : [],
    receipts: Array.isArray(o.receipts) ? o.receipts.filter((r) => r && (r.shop === 'shop1' || r.shop === 'pierStand') && Array.isArray(r.lines)).slice(-8).map((r) => ({ shop: r.shop, lines: r.lines.filter((l) => l && typeof l.label === 'string' && Number.isFinite(l.cents)).map((l) => ({ ...l, cents: Math.round(l.cents) })) })) : [],
    bonusUsed: ['shop1', 'pierStand'].filter((s) => Array.isArray(o.bonusUsed) && o.bonusUsed.includes(s as ShopId)) as ShopId[],
  };
}
export const owns = (e: EconomySave, id: ItemId) => RODS.includes(id as RodId) ? e.rods.includes(id as RodId) : e.extras.includes(id as ExtraId);
export const shortForRod = (e: EconomySave, shop: ShopId) => !owns(e, requiredRod(shop)) && e.cash < item(requiredRod(shop)).cents;
export const canHookBigOne = (e: EconomySave) => e.rod === 'deep';
export const saleCents = (f: ScaleFish) => Math.round(f.kg * FISH[f.id].perKg * (f.credit ?? 1) * 100);
export function bankCatch(e: EconomySave, f: FishCatch): void { e.creel.push({ id: f.id, kg: f.kg, credit: f.credit }); }
export function receipt(e: EconomySave, shop: ShopId): Receipt {
  let r = e.receipts.at(-1);
  if (!r || r.shop !== shop) { r = { shop, lines: [] }; e.receipts.push(r); e.receipts = e.receipts.slice(-8); }
  return r;
}
function line(e: EconomySave, shop: ShopId, label: string, amount: number): void { receipt(e, shop).lines.push({ label, cents: amount }); }
/** Selling empties the creel atomically; reopening a shop cannot sell a catch twice. */
export function sellCreel(e: EconomySave, shop: ShopId): number {
  receipt(e, shop);
  const total = e.creel.reduce((n, f) => {
    const amount = saleCents(f);
    line(e, shop, `${FISH[f.id].name} ${f.kg.toFixed(2)} kg${(f.credit ?? 1) < 1 ? ' (late)' : ''}`, amount);
    return n + amount;
  }, 0);
  e.creel = []; e.cash += total;
  const repay = Math.min(e.debt, e.cash);
  if (repay) { e.debt -= repay; e.cash -= repay; line(e, shop, 'On account', -repay); }
  return total;
}
function give(e: EconomySave, id: ItemId): void {
  if (RODS.includes(id as RodId)) {
    for (const r of RODS.slice(0, RODS.indexOf(id as RodId) + 1)) if (!e.rods.includes(r)) e.rods.push(r);
    e.rod = e.rods.at(-1)!; // retain the old rods for later chapters
  } else e.extras.push(id as ExtraId);
}
/** Elective extras never use credit. Rod credit consumes cash and forfeits extras; the story always continues. */
export function buy(e: EconomySave, shop: ShopId, id: ItemId, credit = false): 'owned' | 'short' | 'bought' | 'credit' {
  if (!stock(shop).some((i) => i.id === id)) return 'short';
  if (owns(e, id)) return 'owned';
  const price = item(id).cents, missing = Math.max(0, price - e.cash);
  if (missing && !(credit && id === requiredRod(shop))) return 'short';
  e.cash -= price - missing;
  line(e, shop, item(id).name, -price);
  give(e, id);
  if (missing) {
    e.debt += missing; line(e, shop, 'Pay me later', missing);
    for (const extra of e.extras) line(e, shop, `Left behind: ${item(extra).name}`, 0);
    e.extras = [];
  }
  return missing ? 'credit' : 'bought';
}
export function ensureRod(e: EconomySave, shop: ShopId): 'owned' | 'short' | 'bought' | 'credit' { return buy(e, shop, requiredRod(shop), true); }
/** Old checkpoints / chapter select can bypass both shops. Repair the required story equipment once. */
export function equipForScene(e: EconomySave, sceneIndex: number, shopIndex: number, standIndex: number): boolean {
  const before = e.rod;
  if (sceneIndex > standIndex) ensureRod(e, 'pierStand');
  else if (sceneIndex > shopIndex) ensureRod(e, 'shop1');
  return before !== e.rod;
}
