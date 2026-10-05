import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { GameModule } from '../src/contracts';
import { runHeadless, SCRIPTS, type MediaSpec } from '../src/core';
import { allGames, getGame } from '../src/games/registry';

export interface Scenario {
  name: string; script: string; minutes: number; seed: number; simOpts?: Record<string, unknown>;
  media?: MediaSpec;   // music for games with requires.media (default: one synth EDM song)
  assert(summary: Record<string, number | string>, stats: any, run: any): string[];
}

const here = dirname(fileURLToPath(import.meta.url));

function args(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2); const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) out[k] = true; else { out[k] = v; i++; }
  }
  return out;
}

async function loadScenarios(game: GameModule): Promise<Scenario[] | null> {
  const f = resolve(here, '..', 'src', 'games', game.id, 'scenarios.ts');
  if (!existsSync(f)) return null;
  const mod = await import(pathToFileURL(f).href);
  return mod.scenarios as Scenario[];
}

export async function runAll(log: (s: string) => void = console.log): Promise<number> {
  let failed = 0, ran = 0;
  for (const g of allGames) {
    const scs = await loadScenarios(g);
    if (!scs) { console.error(`sim:all: skipping ${g.id} (no scenarios.ts yet)`); continue; }
    for (const sc of scs) {
      ran++;
      let failures: string[] = [];
      let line: Record<string, unknown> = { game: g.id, scenario: sc.name, script: sc.script, seed: sc.seed };
      try {
        const r = runHeadless({ game: g, script: sc.script, minutes: sc.minutes, seed: sc.seed, simOpts: sc.simOpts, media: sc.media });
        failures = sc.assert(r.summary, r.stats, { mixerCommands: r.mixerCommands, isOver: r.isOver, events: r.events });
        const { mixerCommands, events, ...rest } = r;
        line = { ...line, ...rest, mixerCommands: mixerCommands.length, events: events.length };
      } catch (e) { failures = [`threw: ${(e as Error).stack ?? e}`]; }
      if (failures.length) failed++;
      log(JSON.stringify({ ...line, ok: failures.length === 0, failures }));
    }
  }
  console.error(`sim:all: ${ran} scenario(s) run, ${failed} failed`);
  return failed ? 1 : 0;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (a.all) { process.exit(await runAll()); }
  const id = String(a.game ?? ''), script = String(a.script ?? 'z2');
  const game = getGame(id);
  if (!game) { console.error(`usage: npm run sim -- --game <${allGames.map((g) => g.id).join('|')}> --script <${Object.keys(SCRIPTS).join('|')}> --minutes N --seed S [--autopilot]`); process.exit(2); }
  const r = runHeadless({
    game, script, minutes: Number(a.minutes ?? 5), seed: Number(a.seed ?? 1),
    simOpts: a.autopilot ? { autopilot: true } : undefined,
  });
  const { events, ...rest } = r;
  console.log(JSON.stringify({ ...rest, eventCount: events.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
