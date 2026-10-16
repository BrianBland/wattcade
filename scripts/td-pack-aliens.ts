// Packs the eight Codex cut-out aliens for the game: downscaled WebP parts + a production manifest per species.
//   git archive origin/towerdefense-concept-art docs/towerdefense/concept/codex | tar -x -C /tmp/aliensrc
//   npx tsx scripts/td-pack-aliens.ts /tmp/aliensrc/docs/towerdefense/concept/codex
// Writes public/td/aliens/<id>/{manifest.json, *.webp}. Needs ImageMagick (`magick`) with WebP.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPECIES_LIST } from '../src/games/towerdefense/render/aliens/species';

interface SrcPart { name: string; file: string; glow: string; offset: [number, number]; pivot: [number, number]; parent: string | null; z: number }
interface SrcManifest { size: [number, number]; centerX: number; lengthPx?: number; root?: string; parts: SrcPart[] }

const src = process.argv[2];
if (!src) { console.error('usage: tsx scripts/td-pack-aliens.ts <codex concept dir>'); process.exit(1); }
const outRoot = join(process.cwd(), 'public', 'td', 'aliens');
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const dims = (f: string) => execFileSync('magick', ['identify', '-format', '%w %h', f]).toString().trim().split(' ').map(Number);
let total = 0;

for (const sp of SPECIES_LIST) {
  const dir = join(src, sp.source), m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as SrcManifest;
  const out = join(outRoot, sp.id), f = sp.packScale;
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const parts = m.parts.map((p) => {
    const [w, h] = dims(join(dir, p.file));
    for (const [from, to] of [[p.file, `${p.name}.webp`], [p.glow, `${p.name}_glow.webp`]]) {
      // Lanczos downscale; WebP keeps alpha. Glow layers are mostly transparent, so they compress well too.
      execFileSync('magick', [join(dir, from), '-filter', 'Lanczos', '-resize', `${(f * 100).toFixed(3)}%`, '-quality', '90', '-define', 'webp:alpha-quality=100', join(out, to)]);
    }
    return { name: p.name, file: `${p.name}.webp`, glow: `${p.name}_glow.webp`, offset: [r3(p.offset[0] * f), r3(p.offset[1] * f)], pivot: [r3(p.pivot[0] * f), r3(p.pivot[1] * f)], parent: p.parent, z: p.z, w: r3(w * f), h: r3(h * f) };
  });
  const ys = m.parts.map((p) => p.pivot[1]);
  const root = m.root ?? m.parts.find((p) => p.parent === null)!.name;
  const manifest = {
    id: sp.id, kind: sp.kind, source: sp.source, scale: f, size: [r3(m.size[0] * f), r3(m.size[1] * f)],
    centerX: r3(m.centerX * f), centerY: r3(((Math.min(...ys) + Math.max(...ys)) / 2) * f), lengthPx: r3((m.lengthPx ?? 480) * f), root, parts,
  };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  const bytes = Number(execFileSync('du', ['-sb', out]).toString().split('\t')[0]);
  total += bytes;
  console.log(`${sp.id.padEnd(12)} ${parts.length} parts  x${f}  ${(bytes / 1024).toFixed(0)} KB`);
}
console.log(`total ${(total / 1024).toFixed(0)} KB`);
