// Cache key for one game's arcade clip: a hash of everything that can change what scripts/capture-cards.ts records for it.
// That's the source the capture page actually loads for that game (relative imports walked from the game and the
// capture harness, never into other games), its shot, the runtime dependency versions, and the public assets it fetches.
// CI re-records a game only when its key changes (deploy.yml caches clips by key).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** Bump to re-record every clip (e.g. after changing the encoder settings in capture-cards.ts). */
export const CAPTURE_VERSION = 1;

/** Public asset folders a game fetches at runtime (URLs, not imports), relative to the repo root. */
const ASSETS: Record<string, string[]> = { towerdefense: ['public/td'] };
const SHARED_ASSETS = ['public/fonts'];
/** The capture harness: the page, its script, and the recorder. */
const HARNESS = ['dev/capture.html', 'dev/capture.ts', 'scripts/capture-cards.ts', 'scripts/cards-key.ts'];

const PARSED = /\.(ts|tsx|js|mjs)$/;
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new\s+URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

/** Relative specifiers in a module (static, dynamic, side-effect and `new URL('./x', import.meta.url)`), query strings dropped. */
export function relativeImports(src: string): string[] {
  return [...src.matchAll(SPEC)].map((m) => m[1].replace(/\?.*$/, ''));
}

export interface Fs { isFile(p: string): boolean; read(p: string): string }
const diskFs: Fs = { isFile: (p) => existsSync(p) && statSync(p).isFile(), read: (p) => readFileSync(p, 'utf8') };

function resolveSpec(fs: Fs, from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (fs.isFile(c)) return c;
  return null;
}

/** Every file reachable from `entries` through relative imports, sorted; `skip(path)` cuts the walk (that file is left out). */
export function importGraph(entries: string[], skip: (p: string) => boolean, fs: Fs = diskFs): string[] {
  const seen = new Set<string>(), todo = entries.filter((e) => fs.isFile(e));
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f) || skip(f)) continue;
    seen.add(f);
    if (!PARSED.test(f)) continue;
    for (const spec of relativeImports(fs.read(f))) { const r = resolveSpec(fs, f, spec); if (r && !seen.has(r)) todo.push(r); }
  }
  return [...seen].sort();
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)])).sort();
}

/** Installed versions of the runtime dependencies (three's renderer output is part of the clip). */
function depVersions(root: string): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as { packages?: Record<string, { version?: string }> };
  return Object.fromEntries(Object.keys(pkg.dependencies ?? {}).sort().map((d) => [d, lock.packages?.[`node_modules/${d}`]?.version ?? '?']));
}

/** The key for `id`'s clip, recorded with `shot`. */
export function cardKey(id: string, shot: unknown, root = process.cwd()): string {
  const games = join(root, 'src', 'games');
  const own = join(games, id);
  // Stay out of other games (the harness reaches all of them through the registry) and out of tests.
  const skip = (p: string) => p === join(games, 'registry.ts') || /\.test\.tsx?$/.test(p) || (p.startsWith(games + '/') && !p.startsWith(own + '/') && !p.startsWith(join(games, 'kit') + '/'));
  const files = [
    ...importGraph([join(own, 'index.ts'), ...HARNESS.map((h) => join(root, h))], skip),
    ...[...SHARED_ASSETS, ...(ASSETS[id] ?? [])].flatMap((d) => listFiles(join(root, d))),
  ];
  const h = createHash('sha256');
  h.update(JSON.stringify({ v: CAPTURE_VERSION, id, shot, deps: depVersions(root) }));
  for (const f of files) { h.update(`\0${relative(root, f)}\0`); h.update(readFileSync(f)); }
  return h.digest('hex').slice(0, 20);
}
