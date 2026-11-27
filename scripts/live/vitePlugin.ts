// Live builds (LIVE_BASE set): every game's index.ts becomes its own entry chunk that the prod page can import() from
// this version's URL, shared host modules (audio) are swapped for thin forwarders to the page's own copies, and
// live/build.json records each game's entry file plus content hashes of its sim, its renderer, and the shell.
// See src/live/NOTES.md.
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { normalizeTuningDefaults, sharedForwarder } from './hashing';

/** Host modules a game must share with the page (one AudioContext, one sound toggle). Name -> path from repo root. */
export const SHARED_MODULES: Record<string, string> = {
  'audio/sfx': 'src/audio/sfx.ts',
  'audio/voices': 'src/audio/voices.ts',
};

const VIRTUAL = '\0live-shared:';

export interface LiveBuildInfo {
  games: Record<string, { entry: string; sim: string; render: string }>;
  shell: string;
}

export function liveBuildPlugin(opts: { root: string; base: string; gameIds: string[]; sharedExports: Record<string, string[]> }): Plugin {
  const sharedByPath = new Map(Object.entries(SHARED_MODULES).map(([name, p]) => [resolve(opts.root, p), name]));
  const gamesDir = resolve(opts.root, 'src/games') + '/';
  const entryOf = (id: string) => resolve(opts.root, `src/games/${id}/index.ts`);
  return {
    name: 'wattcade-live',
    enforce: 'pre',
    async resolveId(source, importer, o) {
      if (!importer || !importer.startsWith(gamesDir) || source.startsWith('\0')) return null;
      const r = await this.resolve(source, importer, { ...o, skipSelf: true });
      const name = r && sharedByPath.get(r.id);
      return name ? VIRTUAL + name : null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return null;
      const name = id.slice(VIRTUAL.length);
      return sharedForwarder(name, opts.sharedExports[name] ?? []);
    },
    generateBundle(_o, bundle) {
      const info = (id: string) => this.getModuleInfo(id);
      const rel = (id: string) => (id.startsWith('\0') ? id : relative(opts.root, id));
      const walk = (roots: string[], follow: 'static' | 'all', skip: Set<string>, dyn?: Set<string>) => {
        const seen = new Set<string>();
        const stack = [...roots];
        while (stack.length) {
          const id = stack.pop()!;
          if (seen.has(id) || skip.has(id) || id.startsWith(VIRTUAL)) continue;
          seen.add(id);
          const m = info(id); if (!m) continue;
          stack.push(...m.importedIds);
          if (follow === 'all') stack.push(...m.dynamicallyImportedIds);
          else m.dynamicallyImportedIds.forEach((d) => dyn?.add(d));
        }
        return seen;
      };
      const hash = (ids: Set<string>, tuningAware: boolean) => {
        const h = createHash('sha256');
        for (const id of [...ids].sort()) {
          const code = (info(id)?.code ?? '').split(opts.base).join('<base>'); // the version URL is baked in; it isn't a change
          h.update(rel(id)).update('\0').update(tuningAware ? normalizeTuningDefaults(code) : code).update('\0');
        }
        return h.digest('hex').slice(0, 16);
      };
      const out: LiveBuildInfo = { games: {}, shell: '' };
      const inGames = new Set<string>();
      for (const gid of opts.gameIds) {
        const entry = entryOf(gid);
        const dyn = new Set<string>();
        const sim = walk([entry], 'static', new Set(), dyn);
        const render = walk([...dyn], 'all', sim);
        sim.forEach((i) => inGames.add(i)); render.forEach((i) => inGames.add(i));
        const chunk = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry && c.facadeModuleId === entry);
        if (!chunk) this.error(`live: no entry chunk for game ${gid}`);
        out.games[gid] = { entry: chunk!.fileName, sim: hash(sim, true), render: hash(render, false) };
      }
      const main = resolve(opts.root, 'src/main.tsx');
      const shellIds = walk([main], 'all', inGames);
      out.shell = hash(shellIds, false);
      if (process.env.LIVE_DEBUG) this.emitFile({ type: 'asset', fileName: 'live/shell-modules.json', source: JSON.stringify([...shellIds].sort().map((id) => [rel(id), createHash('sha256').update(info(id)?.code ?? '').digest('hex').slice(0, 8)])) });
      this.emitFile({ type: 'asset', fileName: 'live/build.json', source: JSON.stringify(out, null, 1) });
    },
  };
}
