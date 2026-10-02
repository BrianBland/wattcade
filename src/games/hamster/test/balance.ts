// Balance probe: npx tsx src/games/hamster/test/balance.ts [hours] [script]
import { runHeadless } from '../../../core';
import { module } from '../index';

const hours = Number(process.argv[2] ?? 12), script = process.argv[3] ?? 'z2';
const r = runHeadless({ game: module, script, minutes: hours * 60, seed: 1, simOpts: { autopilot: true } });
const h = (t: number) => (t / 3600).toFixed(2) + 'h';
for (const e of r.events) {
  if (e.type === 'era') console.log(h(e.t), 'ERA', e.data?.era);
  if (e.type === 'milestone' && /^k\d+$/.test(String(e.data?.id)) && Number(String(e.data?.id).slice(1)) % 5 === 0) console.log(h(e.t), 'K', Number(String(e.data?.id).slice(1)) / 10);
  if (e.type === 'milestone' && /^gen\d+$/.test(String(e.data?.id))) console.log(h(e.t), 'first', e.data?.id);
}
console.log(JSON.stringify(r.summary), r.wallMs + 'ms');
