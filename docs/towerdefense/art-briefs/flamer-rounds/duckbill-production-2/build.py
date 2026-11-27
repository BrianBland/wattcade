"""Export the Round 1 duckbill Flamethrower (owner: "that's definitely better") as the live tower rig.
Sources are the Round 1 concept heads (224px, registered on the real pad/Mortar chassis), split without repainting:
each tier's duckbill burner becomes the recoiling nozzle, the rest its aiming head. Tiers replace each other
(L1-2, L3-4, L5) instead of stacking; L2/L4 keep the shared Mortar base fittings, and the manifest's glowByLevel
makes every level's burner mouth and pilot window run hotter than the last.
Run from any directory: python -B docs/towerdefense/art-briefs/flamer-rounds/duckbill-production-2/build.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import json, hashlib, math, os

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
KIT = ROOT / 'public/td/towers'; DEST = KIT / 'flamer'; SOURCE = OUT / 'source'
REVIEW = Path(os.environ.get('TD_ART_REVIEW_OUT', '/tmp/wattcade-td-art/duckbill')); REVIEW.mkdir(parents=True, exist_ok=True)
BG = (33, 29, 25, 255)
# The burner mouth's top edge, where the flame leaves, per tier.
MUZZLES = {'1': [112, 56], '3': [112, 42], '5': [112, 42]}
# Duckbill burner outline per tier (wide mouth narrowing to its neck): the recoiling nozzle.
BILL = {1: [(70, 47), (156, 47), (131, 92), (93, 92)], 3: [(70, 32), (156, 32), (131, 84), (93, 84)], 5: [(70, 32), (156, 32), (131, 84), (93, 84)]}
# Rows above which hot pixels are the burner mouth; below it only the central pilot window glows (tanks stay copper).
MOUTH_BOTTOM = {1: 68, 3: 54, 5: 54}
TIERS = {1: (1, 2), 3: (3, 4), 5: (5, 5)}
# Glow multiplier per level: a banked ember at L1 to a white-hot burner at L5.
GLOW_BY_LEVEL = {'1': 0.75, '2': 1.0, '3': 1.25, '4': 1.55, '5': 1.9}


def write(path, value): path.write_text(json.dumps(value, indent=2) + '\n')


def emission(frame, level):
    """Only the orange-hot pixels of the burner mouth and the central pilot window emit; brass, steel, copper stay dark."""
    a = np.asarray(frame).astype(float); y, x = np.indices(a.shape[:2]); r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    region = (y < MOUTH_BOTTOM[level]) | (np.abs(x - 112) <= 9)
    hot = (r > 170) & (r > g * 1.25) & (g > b * 1.6) & (b < 110)
    hot |= (r > 235) & (g > 190) & (b < 150)  # the white-yellow core of the slot
    a[:, :, 3] *= region & hot; a[a[:, :, 3] == 0, :3] = 0
    return Image.fromarray(a.astype('uint8'))


def export_part(name, frame, level):
    box = frame.getbbox(); assert box
    box = (box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4)
    image = frame.crop(box); glow = emission(frame, level).crop(box)
    image.save(DEST / 'parts' / f'{name}.png', optimize=True); glow.save(DEST / 'parts' / f'{name}_glow.png', optimize=True)
    return {'name': name, 'file': f'parts/{name}.png', 'glow': f'parts/{name}_glow.png', 'offset': list(box[:2]), 'pivot': [112, 112]}


def effects():
    """Mouth flare strips: the L3 burner slot's own hot pixels, pulsed in four frames (no new painted flames)."""
    src = Image.open(SOURCE / 'duckbill-l3.png').convert('RGBA'); hot = emission(src, 3)
    mask = Image.new('L', src.size); ImageDraw.Draw(mask).rectangle((0, 0, 224, MOUTH_BOTTOM[3]), fill=255)
    hot.putalpha(Image.fromarray(np.minimum(np.asarray(hot.getchannel('A')), np.asarray(mask))))
    box = hot.getbbox(); slot = hot.crop(box); w, h = slot.width + 8, slot.height + 8
    for state, strengths in [('passive', [.45, .7, .55, .4]), ('attack', [.75, 1, .9, .55])]:
        strip = Image.new('RGBA', (w * 4, h))
        for i, s in enumerate(strengths):
            a = np.asarray(slot).astype(float).copy(); a[:, :, 3] *= s; a[a[:, :, 3] < 1, :3] = 0
            strip.alpha_composite(Image.fromarray(a.astype('uint8')), (i * w + 4, 4))
        strip.save(DEST / 'effects' / f'{state}.png', optimize=True)
    off3 = [box[0] - 4, box[1] - 4]
    by_level = {k: [off3[0] + v[0] - MUZZLES['3'][0], off3[1] + v[1] - MUZZLES['3'][1]] for k, v in MUZZLES.items()}
    return [w, h], by_level


def build():
    (DEST / 'parts').mkdir(parents=True, exist_ok=True); (DEST / 'effects').mkdir(exist_ok=True)
    for old in list((DEST / 'parts').glob('*.png')) + list((DEST / 'effects').glob('*.png')): old.unlink()
    manifest = json.loads((DEST / 'manifest.json').read_text())
    shared = [p for p in manifest['parts'] if p['name'] in ('pad', 'base', 'upgrade_l2', 'upgrade_l4')]
    manifest['upgrades'] = 'Duckbill burner: L1-2 twin tanks, L3-4 heat-shield cowl, L5 big tanks and gauges; L2/L4 add base fittings; glowByLevel heats the mouth every level.'
    manifest['view'] = 'steep overhead with visible machinery depth, matching the approved Round 1 duckbill concept'
    manifest['anchors']['muzzle'] = {'parent': 'nozzle', 'position': MUZZLES['1'], 'positionsByLevel': MUZZLES}
    manifest['glowByLevel'] = GLOW_BY_LEVEL
    parts = list(shared)
    for level, (lo, hi) in TIERS.items():
        src = Image.open(SOURCE / f'duckbill-l{level}.png').convert('RGBA')
        mask = Image.new('L', src.size); ImageDraw.Draw(mask).polygon(BILL[level], fill=255)
        alpha = np.asarray(src.getchannel('A')); bill = np.minimum(alpha, np.asarray(mask))
        nozzle = src.copy(); nozzle.putalpha(Image.fromarray(bill)); body = src.copy(); body.putalpha(Image.fromarray(alpha - bill))
        suffix = '' if level == 1 else f'_l{level}'
        p = export_part('head' + suffix, body, level)
        p.update(parent='base', z={1: 40, 3: 45, 5: 55}[level], minLevel=lo, aims=True, mountPosition=[112, 112])
        if hi < 5: p['maxLevel'] = hi
        parts.append(p)
        q = export_part('nozzle' + suffix, nozzle, level)
        q.update(parent='head' + suffix, z={1: 42, 3: 50, 5: 60}[level], minLevel=lo, recoil={'axis': [0, 1], 'distancePx': 1.5})
        if hi < 5: q['maxLevel'] = hi
        parts.append(q)
    manifest['parts'] = sorted(parts, key=lambda p: p['z'])
    size, by_level = effects()
    for state in ('passive', 'attack'):
        e = manifest['animations'][state]['effect']
        e.update(frameSize=size, offset=by_level['1'], offsetsByLevel=by_level)
    write(DEST / 'manifest.json', manifest)


# ---------- preview (manifest-rendered, same rules as the runtime) ----------
def curve(keys, t):
    for i in range(1, len(keys)):
        a, b = keys[i - 1], keys[i]
        if t <= b[0]: return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0])
    return keys[-1][1]


def tier(mapping, level, fallback):
    keys = [int(k) for k in mapping if int(k) <= level]; return mapping[str(max(keys))] if keys else fallback


def render(level, angle=0, state='passive', ms=800):
    m = json.loads((DEST / 'manifest.json').read_text()); im = Image.new('RGBA', (224, 224)); anim = m['animations'][state]
    gain = tier(m.get('glowByLevel', {}), level, 1)
    for p in sorted(m['parts'], key=lambda p: p['z']):
        if p.get('minLevel', 1) > level or p.get('maxLevel', 9) < level: continue
        aims = p.get('aims') or (p['parent'] and next(q for q in m['parts'] if q['name'] == p['parent']).get('aims'))
        for f, add in ((p['file'], False), (p.get('glow'), True)):
            if not f: continue
            layer = Image.new('RGBA', (224, 224)); layer.alpha_composite(Image.open(DEST / f).convert('RGBA'), tuple(p['offset']))
            if aims: layer = layer.rotate(-angle, Image.Resampling.BICUBIC, center=(112, 112))
            if not add: im.alpha_composite(layer); continue
            s = min(1, 0.6 * gain) * min(1, curve(anim['glowGain'], ms) * curve(anim['glowStrength'], ms) * 1.6 * gain)
            a = np.asarray(im).astype(float); b = np.asarray(layer).astype(float)
            a[:, :, :3] = np.clip(a[:, :, :3] + b[:, :, :3] * b[:, :, 3:4] / 255 * s, 0, 255); im = Image.fromarray(a.astype('uint8'))
    return im


def previews():
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
    sheet = Image.new('RGBA', (5 * 240 + 40, 2 * 360 + 40), BG); d = ImageDraw.Draw(sheet)
    d.text((20, 10), 'DUCKBILL FLAMETHROWER — L1–L5, passive and attack, 224px + 68px pad', font=font, fill='#eadac0')
    for row, (state, angle) in enumerate([('passive', 0), ('attack', 45)]):
        for level in range(1, 6):
            x, y = 20 + (level - 1) * 240, 40 + row * 360; im = render(level, angle, state, 160 if state == 'attack' else 800)
            d.text((x + 70, y), f'L{level} {angle}° {state}', font=font, fill='#cabb9e'); sheet.alpha_composite(im, (x, y + 20))
            sheet.alpha_composite(im.resize((68, 68), Image.Resampling.LANCZOS), (x + 78, y + 260))
    sheet.convert('RGB').save(REVIEW / 'duckbill-levels.png', optimize=True)


def inventories():
    files = sorted(str(p.relative_to(KIT)) for p in KIT.rglob('*') if p.is_file() and p.name != 'SHA256SUMS.txt')
    (KIT / 'FILES.txt').write_text('\n'.join(sorted(set(files + ['SHA256SUMS.txt']))) + '\n')
    files = sorted(p for p in KIT.rglob('*') if p.is_file() and p.name != 'SHA256SUMS.txt')
    (KIT / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + str(p.relative_to(KIT)) + '\n' for p in files))


def validate():
    m = json.loads((DEST / 'manifest.json').read_text()); report = {'source': 'duckbill-production-2/source/duckbill-l{1,3,5}.png', 'muzzles': MUZZLES, 'glowByLevel': GLOW_BY_LEVEL, 'poses': 0}
    for p in m['parts']:
        if not p['file'].startswith('parts/'): continue
        art = Image.open(DEST / p['file']).convert('RGBA'); glow = Image.open(DEST / p['glow']).convert('RGBA'); assert art.size == glow.size
        assert np.all(np.asarray(glow)[:, :, 3] <= np.asarray(art)[:, :, 3])
        for im in (art, glow):
            b = im.getbbox()
            if b: assert b[0] >= 4 and b[1] >= 4 and b[2] <= im.width - 4 and b[3] <= im.height - 4, (p['name'], b)
    for level in range(1, 6):
        shown = [p['name'] for p in m['parts'] if p.get('minLevel', 1) <= level <= p.get('maxLevel', 9)]
        assert sum(n.startswith('head') for n in shown) == 1 and sum(n.startswith('nozzle') for n in shown) == 1, (level, shown)
        for angle in range(0, 360, 15):
            b = render(level, angle).getbbox(); assert b and min(b[:2]) >= 2 and max(b[2:]) <= 222, (level, angle, b); report['poses'] += 1
    report['flamerBytes'] = sum(p.stat().st_size for p in DEST.rglob('*') if p.is_file()); assert report['flamerBytes'] < 200000
    report['passed'] = True; write(OUT / 'validation.json', report); print(json.dumps(report, indent=2))


if __name__ == '__main__':
    build(); previews(); inventories(); validate()
