"""Packs the chosen Codex fire/blast frames into horizontal strips for the game.

Run from the repo root: python3 docs/towerdefense/art-briefs/fx/pack.py
Frames are read straight from the candidate commits (git show), so the picks are reproducible.
Writes public/td/fx/<name>.webp (one strip per sequence) and public/td/fx/manifest.json.
"""
import io, json, subprocess
from pathlib import Path
from PIL import Image

FLAME = ('d7b382f', 'docs/towerdefense/art-briefs/flamer-rounds/burst-candidates/a')
R1, R2, R3 = (('884ce70', 'docs/towerdefense/art-briefs/blast-candidates/a'),
              ('449fdfc', 'docs/towerdefense/art-briefs/blast-candidates/round2/a'),
              ('a050f00', 'docs/towerdefense/art-briefs/blast-candidates/round3/a'))
GROUND = ('9cdbaa4', 'docs/towerdefense/art-briefs/blast-candidates/groundfire/a')

def seq(src, stem, n, pad=2):
    return [(src, f'{stem}_{i:0{pad}d}.png') for i in range(n)]

STRIPS = {
    'flame-start': seq(FLAME, 'start', 6), 'flame-sustain': seq(FLAME, 'sustain', 12), 'flame-out': seq(FLAME, 'end', 6),
    'fireball-ball': seq(R1, 'fireball/ball', 8), 'fireball-trail': seq(R1, 'fireball/trail', 6),
    'fireball-impact': seq(R3, 'fireball/impact', 10),
    'mortar-shell': seq(R1, 'mortar/shell', 8), 'mortar-impact': seq(R3, 'mortar/impact', 10),
    'mortar-crater': seq(R1, 'mortar/crater', 3, 1),
    'mortar-gravel': seq(R2, 'mortar/gravel', 8), 'mortar-shrapnel': seq(R2, 'mortar/shrapnel', 6),
    'ignite-burst': seq(R3, 'ignite/burst', 8), 'ember': seq(R2, 'ignite/ember', 6),
    'ground-flare': seq(GROUND, 'flare', 8),
    **{f'ground-tuft-{v}': seq(GROUND, f'tuft_{v}', 16) for v in range(4)},
    **{f'ground-dying-{v}': seq(GROUND, f'dying_{v}', 8) for v in range(4)},
}

def frame(src, name):
    commit, root = src
    data = subprocess.run(['git', 'show', f'{commit}:{root}/{name}'], check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(data)).convert('RGBA')

out = Path('public/td/fx'); out.mkdir(parents=True, exist_ok=True)
manifest = {}
for name, frames in STRIPS.items():
    imgs = [frame(*f) for f in frames]
    w, h = imgs[0].size
    assert all(i.size == (w, h) for i in imgs), name
    strip = Image.new('RGBA', (w * len(imgs), h))
    for i, im in enumerate(imgs): strip.paste(im, (i * w, 0))
    strip.save(out / f'{name}.webp', 'WEBP', quality=92, alpha_quality=100, method=6)
    manifest[name] = {'w': w, 'h': h, 'n': len(imgs)}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
print(json.dumps(manifest))
