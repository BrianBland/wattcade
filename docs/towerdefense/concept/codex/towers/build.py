"""Key the retained imagegen sheets, export cutouts and render manifest poses.

python build.py --output /workspace/wattcade/public/td/towers
python build.py --output /workspace/wattcade/public/td/towers --verify-only
Requires only requirements.txt. No game source is read or changed.
"""
from pathlib import Path
import argparse
import json
import math
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SIZE = 160
CENTER = (80, 80)
GROUND = (33, 29, 25, 255)
RESAMPLE = Image.Resampling.LANCZOS
# Source rectangles are explicit because generated sheets do not obey a perfect grid.
BOXES = {
    'tesla': [(15, 100, 420, 480), (470, 140, 770, 450),
              (830, 125, 1090, 450), (1150, 150, 1500, 450),
              (20, 550, 380, 840), (400, 660, 790, 900), (805, 580, 1120, 900)],
    'mortar': [(10, 90, 425, 490), (450, 130, 790, 480),
               (890, 110, 1040, 490), (1120, 165, 1530, 470),
               (20, 570, 420, 810), (420, 640, 810, 910), (790, 590, 1130, 910)],
    'prism': [(10, 100, 420, 480), (450, 145, 740, 430),
              (760, 160, 1140, 430), (1140, 160, 1530, 400),
              (10, 630, 415, 900), (420, 570, 780, 925)],
}


def key(image):
    """Remove the green matte and unmix its contribution in antialiased edges."""
    rgb = np.asarray(image.convert('RGB'), dtype=np.float32)
    other = np.maximum(rgb[..., 0], rgb[..., 2])
    excess = rgb[..., 1] - other
    alpha = np.clip(1 - np.maximum(excess, 0) / 180, 0, 1)
    alpha[(rgb[..., 1] > 170) & (excess > 95)] = 0
    rgb[..., 1] = np.minimum(rgb[..., 1], other + 3)
    # Recover edge foreground from F*alpha + green*(1-alpha).
    safe = np.maximum(alpha, 0.03)
    rgb[..., 0] /= safe
    rgb[..., 2] /= safe
    rgb[..., 1] = np.minimum(rgb[..., 1] / safe, np.maximum(rgb[..., 0], rgb[..., 2]) + 3)
    result = np.uint8(np.clip(np.dstack((rgb, alpha * 255)), 0, 255))
    result[alpha < 0.03] = 0
    return Image.fromarray(result)


def trimmed(image):
    box = image.getbbox()
    if box is None:
        raise ValueError('Empty source part')
    return image.crop(box)


def mounted(source, dimensions, center=CENTER):
    """Fit without distortion, and place on the assembled rest canvas."""
    source = trimmed(source)
    scale = min(dimensions[0] / source.width, dimensions[1] / source.height)
    size = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
    source = source.resize(size, RESAMPLE)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    canvas.alpha_composite(source, (round(center[0] - size[0] / 2), round(center[1] - size[1] / 2)))
    return canvas


def pair(source, level):
    # Keep each pair on one layer; both components inherit the same parent.
    layouts = {
        2: ((18, 40), [(42, 84), (118, 84)]),
        3: ((22, 28), [(53, 48), (107, 48)]),
        4: ((28, 30), [(53, 117), (107, 117)]),
        5: ((18, 48), [(25, 79), (135, 79)]),
    }
    dimensions, centers = layouts[level]
    canvas = Image.new('RGBA', (SIZE, SIZE))
    mid = source.width // 2
    for box, center in zip([(0, 0, mid, source.height), (mid, 0, source.width, source.height)], centers):
        canvas.alpha_composite(mounted(source.crop(box), dimensions, center))
    return canvas


def emission(image, tower):
    pixels = np.asarray(image).copy()
    rgb = pixels[..., :3].astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    if tower == 'tesla':
        mask = (b > 100) & (b > r * 1.3) & (b > g * 1.08)
    elif tower == 'mortar':
        mask = (r > 165) & (r > g * 1.7) & (r > b * 2)
    elif tower == 'prism':
        mask = (b > 115) & (b > g * 1.5) & (r > g * 1.25)
    else:
        mask = np.zeros(pixels.shape[:2], dtype=bool)
    pixels[~mask] = 0
    return Image.fromarray(pixels)


def save_part(output, tower, name, image, parent, z, level=1):
    # Both layers share the exact crop and at least four fully clear pixels.
    pixels = np.asarray(image).copy()
    pixels[..., 1] = np.minimum(pixels[..., 1].astype(int), np.maximum(pixels[..., 0], pixels[..., 2]).astype(int) + 3)
    pixels[pixels[..., 3] == 0] = 0
    image = Image.fromarray(pixels)
    box = image.getbbox()
    assert box is not None
    box = (box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4)
    base = image.crop(box)
    glow = emission(image, tower).crop(box)
    folder = output / tower / 'parts' if tower else output / 'parts'
    folder.mkdir(parents=True, exist_ok=True)
    base.save(folder / f'{name}.png', optimize=True)
    glow.save(folder / f'{name}_glow.png', optimize=True)
    return {'name': name, 'file': f'parts/{name}.png', 'glow': f'parts/{name}_glow.png',
            'offset': list(box[:2]), 'pivot': list(CENTER), 'parent': parent,
            'z': z, 'minLevel': level}


def build(output):
    sheets = {t: Image.open(HERE / 'raw' / f'{t}-sheet-raw.png') for t in BOXES}
    sources = {t: [key(sheet.crop(box)) for box in BOXES[t]] for t, sheet in sheets.items()}
    pad = save_part(output, '', 'pad', mounted(sources['tesla'][0], (136, 136)), None, 0)
    pad['file'] = '../parts/pad.png'
    pad['glow'] = '../parts/pad_glow.png'
    for tower, parts in sources.items():
        if tower == 'tesla':
            base, head, upgrades = parts[1], parts[2], parts[3:]
        elif tower == 'mortar':
            base, head, upgrades = parts[0], parts[1], parts[3:]
        else:
            base, head, upgrades = parts[0], parts[1], parts[2:]
        entries = [dict(pad)]
        entries.append(save_part(output, tower, 'base', mounted(base, (84, 84)), 'pad', 10))
        # The Tesla contact sticks above its sphere; locate the actual coil center.
        head_canvas = mounted(head, (64, 64), (80, 77) if tower == 'tesla' else CENTER)
        entries.append(save_part(output, tower, 'head', head_canvas, 'base', 40))
        for level, source in enumerate(upgrades, 2):
            parent = 'base' if level in (2, 4) else 'head'
            entries.append(save_part(output, tower, f'upgrade_l{level}', pair(source, level), parent,
                                     {2: 20, 3: 30, 4: 25, 5: 35}[level], level))
        muzzle = [80, 51 if tower == 'tesla' else 56]
        muzzle_parent = 'head'
        if tower == 'mortar':
            barrel = save_part(output, tower, 'barrel', mounted(parts[2], (18, 62), (80, 65)), 'head', 50)
            barrel['pivot'] = [80, 90]
            barrel['recoil'] = {'axis': [0, 1], 'distancePx': 8}
            entries.append(barrel)
            muzzle, muzzle_parent = [80, 34], 'barrel'
        manifest = {
            'size': [SIZE, SIZE], 'centerX': 80, 'root': 'pad', 'light': 'top',
            'inGameDiameterPx': 68, 'padDiameterPx': 136, 'paddingPx': 4,
            'angleConvention': 'clockwise degrees in image coordinates; zero aims up',
            'coordinates': 'offset, pivot and anchor position are absolute assembled rest-frame pixels; inherit parent transforms',
            'upgrades': 'include every part with minLevel <= level; valid levels 1 through 5',
            'glowBlend': 'additive RGB weighted by alpha; base art remains complete without glow',
            'anchors': {
                'muzzle': {'parent': muzzle_parent, 'position': muzzle},
                'cable': {'parent': 'pad', 'position': [145, 80]},
                'range_center': {'parent': 'pad', 'position': list(CENTER)},
            },
            'parts': entries,
        }
        (output / tower / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    registry = {'version': 1, 'towers': {t: f'{t}/manifest.json' for t in BOXES},
                'sharedPad': 'parts/pad.png', 'preview': 'preview.png'}
    (output / 'manifest.json').write_text(json.dumps(registry, indent=2) + '\n')


def translate(x, y):
    return np.array([[1., 0., x], [0., 1., y], [0., 0., 1.]])


def rotate(angle):
    a = math.radians(angle)
    return np.array([[math.cos(a), -math.sin(a), 0.], [math.sin(a), math.cos(a), 0.], [0., 0., 1.]])


def matrices(manifest, angle, recoil):
    parts = {p['name']: p for p in manifest['parts']}
    cache = {}

    def visit(name):
        if name in cache:
            return cache[name]
        p = parts[name]
        parent = visit(p['parent']) if p['parent'] else np.eye(3)
        local = np.eye(3)
        if name == 'head':
            x, y = p['pivot']
            local = translate(x, y) @ rotate(angle) @ translate(-x, -y)
        if name == 'barrel':
            axis = p['recoil']['axis']
            distance = p['recoil']['distancePx'] * recoil
            local = translate(axis[0] * distance, axis[1] * distance)
        cache[name] = parent @ local
        return cache[name]

    for name in parts:
        visit(name)
    return cache


def render(directory, level, angle, recoil=0, glows=True):
    manifest = json.loads((directory / 'manifest.json').read_text())
    transforms = matrices(manifest, angle, recoil)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    for p in sorted(manifest['parts'], key=lambda p: p['z']):
        if p['minLevel'] > level:
            continue
        forward = transforms[p['name']] @ translate(*p['offset'])
        inverse = np.linalg.inv(forward)[:2].reshape(-1)
        source = Image.open(directory / p['file']).convert('RGBA')
        layer = source.transform((SIZE, SIZE), Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC)
        canvas.alpha_composite(layer)
        if glows:
            glow = Image.open(directory / p['glow']).convert('RGBA')
            glow = glow.transform((SIZE, SIZE), Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC)
            base = np.asarray(canvas).copy()
            emit = np.asarray(glow).astype(float)
            base[..., :3] = np.uint8(np.minimum(255, base[..., :3] + emit[..., :3] * emit[..., 3:4] / 255 * 0.35))
            canvas = Image.fromarray(base)
    anchors = {n: (transforms[a['parent']] @ [*a['position'], 1])[:2].tolist()
               for n, a in manifest['anchors'].items()}
    return canvas, anchors


def preview(output):
    # All 27 requested normal poses plus all 9 corresponding mortar recoil poses.
    image = Image.new('RGBA', (9 * 174 + 120, 4 * 210 + 40), GROUND)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=14)
    for col, (level, angle) in enumerate((l, a) for l in (1, 3, 5) for a in (0, 45, 180)):
        draw.text((120 + col * 174 + 26, 10), f'L{level} / {angle} deg', font=font, fill='#e6daca')
    for row, (tower, recoil) in enumerate([('tesla', 0), ('mortar', 0), ('prism', 0), ('mortar', 1)]):
        y = 40 + row * 210
        draw.text((8, y + 70), tower.upper(), font=font, fill='#e6daca')
        if recoil:
            draw.text((8, y + 92), 'RECOILED', font=font, fill='#f28966')
        for col, (level, angle) in enumerate((l, a) for l in (1, 3, 5) for a in (0, 45, 180)):
            pose, _ = render(output / tower, level, angle, recoil)
            image.alpha_composite(pose, (120 + col * 174, y))
            # 68px footprint proof, same parts and transforms at the actual game scale.
            image.alpha_composite(pose.resize((80, 80), RESAMPLE), (120 + col * 174 + 45, y + 125))
    image.convert('RGB').save(output / 'preview.png', optimize=True)
    # Working-only proof that bases remain complete with emissive layers disabled.
    neutral = Image.new('RGBA', (480, 160), GROUND)
    for i, tower in enumerate(BOXES):
        neutral.alpha_composite(render(output / tower, 5, 45, glows=False)[0], (i * SIZE, 0))
    neutral.convert('RGB').save(HERE / 'glow-off.png', optimize=True)


def document(output):
    (output / 'NOTES.md').write_text('''# Tower puppets — issue 129

Art generated with OpenAI image_gen.imagegen on three #00FF00 sheets.
Pillow/NumPy slice, key, despill, resize, extract emission and render the PNG parts.
Reference: td-towers-base.png on codex/towerdefense-concept-art (the file is absent
from towerdefense-concept-art). Working files are based on towerdefense-concept-art.

FILES.txt enumerates every production file, including this note and the inventory.
manifest.json indexes tesla/manifest.json, mortar/manifest.json and prism/manifest.json.
Each tower manifest follows the alien offset/pivot/parent/z convention and references
one shared octagonal pad, with a cable socket at the right rim.
Levels 1–5 include all parts with minLevel <= level. Head rotation is clockwise,
zero points up. Coordinates are absolute in the 160x160 assembled rest frame.
Inherit parent transforms before applying local rotations around pivot.
Mortar barrel is a child of head; recoil translates it 8px along its local +y axis.
The muzzle anchor follows the barrel; cable and range_center follow the static pad.
L2 coils and L4 armour attach to base; L3 and L5 attach to the rotating head.
Every base PNG has a same-size _glow.png, including clear layers for unlit parts.
Use additive RGB weighted by alpha for emission; base art is complete alone.
All cutouts have at least 4px transparent padding. Pad diameter 136px is 2x 68px.

preview.png is rendered from these manifests and PNGs on #211d19 ground:
L1/L3/L5 at 0/45/180 degrees for all towers, plus nine Mortar recoil poses.
Each cell also includes the same assembly reduced to a 68px pad footprint.
The full directory is below 1.5MB. No game code changed.

Working branch: codex/td-towers-work, docs/towerdefense/concept/codex/towers/.
Rebuild with python build.py --output PATH after installing requirements.txt there.
Validation checks all five levels and rotations (60 poses including recoil).
Limitations: generated metal bevels retain some depth cues; artistic fidelity and
strict overhead lighting still need human art review. No baked ground shadows.
''')
    files = sorted(str(p.relative_to(output)) for p in output.rglob('*') if p.is_file())
    if 'FILES.txt' not in files:
        files.append('FILES.txt')
    (output / 'FILES.txt').write_text('\n'.join(sorted(files)) + '\n')


def verify(output):
    registry = json.loads((output / 'manifest.json').read_text())
    report = {'posesChecked': 0, 'towers': {}, 'errors': []}
    for tower, path in registry['towers'].items():
        directory = (output / path).parent
        manifest = json.loads((directory / 'manifest.json').read_text())
        assert set(manifest['anchors']) == {'muzzle', 'cable', 'range_center'}
        parts = {p['name']: p for p in manifest['parts']}
        assert {'pad', 'base', 'head', 'upgrade_l2', 'upgrade_l3', 'upgrade_l4', 'upgrade_l5'} <= parts.keys()
        for p in parts.values():
            assert p['parent'] is None or p['parent'] in parts
            assert len(p['offset']) == len(p['pivot']) == 2
            base = Image.open(directory / p['file']).convert('RGBA')
            glow = Image.open(directory / p['glow']).convert('RGBA')
            assert base.size == glow.size
            alpha = np.asarray(base)[..., 3]
            assert np.any(alpha)
            assert not np.any(alpha[:4]) and not np.any(alpha[-4:])
            assert not np.any(alpha[:, :4]) and not np.any(alpha[:, -4:])
            pixels = np.asarray(base).astype(int)
            assert not np.any((pixels[..., 3] > 0) & (pixels[..., 1] > np.maximum(pixels[..., 0], pixels[..., 2]) + 4))
            assert np.all(np.asarray(glow)[..., 3] <= alpha)
        counts = []
        for level in range(1, 6):
            counts.append(sum(p['minLevel'] <= level for p in parts.values()))
            for angle in (0, 45, 180):
                for recoil in ((0, 1) if tower == 'mortar' else (0,)):
                    pose, anchors = render(directory, level, angle, recoil)
                    assert pose.getbbox() is not None
                    assert np.allclose(anchors['range_center'], CENTER)
                    assert np.allclose(anchors['cable'], [145, 80])
                    a = np.asarray(pose)[..., 3]
                    assert not np.any(a[0]) and not np.any(a[-1]) and not np.any(a[:, 0]) and not np.any(a[:, -1])
                    report['posesChecked'] += 1
        assert all(b == a + 1 for a, b in zip(counts, counts[1:]))
        for level in range(2, 6):
            before = np.asarray(render(directory, level - 1, 0)[0])
            after = np.asarray(render(directory, level, 0)[0])
            assert np.count_nonzero(np.any(before != after, axis=2)) > 50, 'Upgrade is hidden'
        assert np.allclose(matrices(manifest, 180, 0)['upgrade_l3'], matrices(manifest, 180, 0)['head'])
        assert np.allclose(matrices(manifest, 180, 0)['upgrade_l2'], np.eye(3))
        if tower == 'mortar':
            assert parts['barrel']['parent'] == 'head'
            for angle in (0, 45, 180):
                _, normal = render(directory, 5, angle)
                _, recoiled = render(directory, 5, angle, 1)
                assert math.isclose(math.dist(normal['muzzle'], recoiled['muzzle']), 8, abs_tol=1e-6)
        report['towers'][tower] = {'parts': len(parts), 'partsPerLevel': counts}
    report['productionBytes'] = sum(p.stat().st_size for p in output.rglob('*') if p.is_file())
    assert report['productionBytes'] < 1_500_000
    (HERE / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=HERE / 'export')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    if not args.verify_only:
        args.output.mkdir(parents=True, exist_ok=True)
        build(args.output)
        preview(args.output)
        document(args.output)
    verify(args.output)
    if not args.verify_only and args.output.resolve() != (HERE / 'export').resolve():
        shutil.copytree(args.output, HERE / 'export', dirs_exist_ok=True)


if __name__ == '__main__':
    main()
