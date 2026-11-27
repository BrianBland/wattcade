// Keep earlier deploys' hashed files in dist/assets, so a page opened before a deploy can still import its own chunks
// (renderers, workers, images) after it. Every deploy replaces the whole asset set on Cloudflare; without this an open
// app's next game start 404s on a renderer chunk ("Importing a module script failed").
//
//   npx tsx scripts/deploy/keepAssets.ts dist/assets .cache/prod-assets [days=10] [maxFiles=6000]
//
// The cache dir (saved by deploy.yml between runs) holds the files plus index.json: file name -> last deploy it shipped in.
// Files no deploy has shipped for `days`, or the oldest past `maxFiles`, are dropped. Names are content-hashed, so a kept
// file never clashes with a new one of the same name.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type AssetIndex = Record<string, number>;

/** Which files to keep: the current deploy's (stamped `now`), then earlier ones still inside the window, newest first. */
export function planKeep(index: AssetIndex, current: string[], now: number, days: number, maxFiles: number) {
  const next: AssetIndex = {};
  for (const f of current) next[f] = now;
  const cutoff = now - days * 86_400_000;
  const old = Object.entries(index).filter(([f, t]) => !(f in next) && t >= cutoff).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const room = Math.max(0, maxFiles - current.length);
  const kept = old.slice(0, room);
  for (const [f, t] of kept) next[f] = t;
  const dropped = Object.keys(index).filter((f) => !(f in next));
  return { index: next, restore: kept.map(([f]) => f), dropped };
}

/** Every file under `dir`, as paths relative to it. */
function listFiles(dir: string, sub = ''): string[] {
  if (!existsSync(join(dir, sub))) return [];
  return readdirSync(join(dir, sub)).flatMap((n) => {
    const rel = sub ? `${sub}/${n}` : n;
    return statSync(join(dir, rel)).isDirectory() ? listFiles(dir, rel) : [rel];
  });
}

function main() {
  const [assets, cache, daysArg, maxArg] = process.argv.slice(2);
  if (!assets || !cache) { console.error('usage: keepAssets <dist/assets> <cacheDir> [days] [maxFiles]'); process.exit(2); }
  const days = Number(daysArg ?? 10), maxFiles = Number(maxArg ?? 6000);
  const files = join(cache, 'files'), indexPath = join(cache, 'index.json');
  const index: AssetIndex = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
  const current = listFiles(assets);
  const plan = planKeep(index, current, Date.now(), days, maxFiles);
  for (const f of current) { const to = join(files, f); mkdirSync(join(to, '..'), { recursive: true }); copyFileSync(join(assets, f), to); }
  let restored = 0;
  for (const f of plan.restore) {
    const from = join(files, f);
    if (!existsSync(from)) { delete plan.index[f]; continue; }
    mkdirSync(join(assets, f, '..'), { recursive: true }); copyFileSync(from, join(assets, f)); restored++;
  }
  for (const f of plan.dropped) rmSync(join(files, f), { force: true });
  writeFileSync(indexPath, JSON.stringify(plan.index));
  console.log(`keepAssets: ${current.length} new, ${restored} kept from earlier deploys, ${plan.dropped.length} dropped`);
}

if (process.argv[1]?.endsWith('keepAssets.ts')) main();
