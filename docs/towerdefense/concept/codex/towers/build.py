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
    'tesla': [(375, 190, 785, 545), (865, 25, 1100, 480),
              (1185, 125, 1530, 545), (5, 570, 425, 995),
              (420, 625, 905, 985), (905, 560, 1120, 1010)],
    'mortar': [(10, 65, 500, 525), (510, 100, 875, 490),
               (910, 20, 1170, 525), (1210, 80, 1510, 510),
               (30, 595, 415, 930), (425, 565, 835, 945), (880, 515, 1250, 985)],
    'prism': [(0, 65, 490, 525), (505, 15, 735, 515),
              (770, 140, 1110, 485), (1155, 120, 1530, 485),
              (10, 530, 485, 985), (510, 515, 905, 985)],
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


def pair(source, level, tower):
    # Keep each pair on one layer; both components inherit the same parent.
    layouts = {
        2: ((25, 54), [(44, 82), (116, 82)]),
        3: ((28, 43), [(47, 111), (113, 111)]),
        4: ((33, 47), [(30, 96), (130, 96)]),
        5: ((19, 48), [(42, 42), (118, 42)]),
    }
    if tower == 'prism':
        layouts[2] = ((26, 60), [(43, 83), (117, 83)])
        layouts[3] = ((21, 38), [(57, 114), (103, 114)])
        layouts[5] = ((26, 42), [(33, 110), (127, 110)])
    elif tower == 'mortar':
        layouts[2] = ((20, 58), [(43, 80), (117, 80)])
        layouts[3] = ((23, 32), [(56, 115), (104, 115)])
        layouts[5] = ((26, 58), [(31, 80), (129, 80)])
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
    sheets = {t: Image.open(HERE / 'raw' / f'{t}-sheet-v2-raw.png') for t in BOXES}
    sources = {t: [key(sheet.crop(box)) for box in BOXES[t]] for t, sheet in sheets.items()}
    pad_source = Image.open(HERE / 'raw' / 'tesla-sheet-raw.png').crop((15, 100, 420, 480))
    pad = save_part(output, '', 'pad', mounted(key(pad_source), (136, 136)), None, 0)
    pad['file'] = '../parts/pad.png'
    pad['glow'] = '../parts/pad_glow.png'
    for tower, parts in sources.items():
        if tower == 'tesla':
            base, upgrades = parts[0], parts[2:]
            # A second reference-guided generation restores the short, wide coil.
            head = key(Image.open(HERE / 'raw' / 'tesla-head-v2-raw.png').crop((340, 190, 920, 1125)))
        elif tower == 'mortar':
            base, head, upgrades = parts[0], parts[1], parts[3:]
        else:
            base, head, upgrades = parts[0], parts[1], parts[2:]
        entries = [dict(pad)]
        entries.append(save_part(output, tower, 'base', mounted(base, (106, 104), (80, 86)), 'pad', 10))
        dimensions, center = {'tesla': ((64, 96), (80, 69)),
                              'mortar': ((82, 80), (80, 88)),
                              'prism': ((50, 108), (80, 66))}[tower]
        head_canvas = mounted(head, dimensions, center)
        entries.append(save_part(output, tower, 'head', head_canvas, 'base', 40))
        for level, source in enumerate(upgrades, 2):
            parent = 'base' if level in (2, 4) or tower == 'prism' and level == 5 else 'head'
            entries.append(save_part(output, tower, f'upgrade_l{level}', pair(source, level, tower), parent,
                                     {2: 30, 3: 45, 4: 20, 5: 35}[level], level))
        muzzle = [80, 32 if tower == 'tesla' else 17]
        muzzle_parent = 'head'
        if tower == 'mortar':
            barrel = save_part(output, tower, 'barrel', mounted(parts[2], (46, 90), (80, 64)), 'head', 50)
            barrel['pivot'] = [80, 90]
            barrel['recoil'] = {'axis': [0, 1], 'distancePx': 8}
            entries.append(barrel)
            muzzle, muzzle_parent = [80, 32], 'barrel'
        manifest = {
            'size': [SIZE, SIZE], 'centerX': 80, 'root': 'pad', 'light': 'reference-matched',
            'view': 'steep overhead with visible machinery depth, matching the approved concept',
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

Art regenerated with OpenAI image_gen.imagegen on three revision-2 #00FF00 sheets.
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
L2 and L4 attach to base; L3 attaches to head. L5 Prism power coils attach to base;
Tesla electrodes and Mortar heat exchangers attach to head.
Every base PNG has a same-size _glow.png, including clear layers for unlit parts.
Use additive RGB weighted by alpha for emission; base art is complete alone.
All cutouts have at least 4px transparent padding. Pad diameter 136px is 2x 68px.

preview.png is rendered from these manifests and PNGs on #211d19 ground:
L1/L3/L5 at 0/45/180 degrees for all towers, plus nine Mortar recoil poses.
Each cell also includes the same assembly reduced to a 68px pad footprint.
The full directory is below 1.5MB. No game code changed.

Working branch: codex/td-towers-work, docs/towerdefense/concept/codex/towers/.
Rebuild with python build.py --output PATH after installing requirements.txt there.
Validation checks all five levels and full rotations (480 poses including recoil).
Revision 2 restores the original tall copper solenoid and sphere, open iron Mortar
barrel, prominent faceted crystal and densely bolted-on machinery. The view follows
the concept's steep overhead angle and visible depth, per the user's art direction;
it is not strict orthographic. Rig rotation remains a 2D cutout transform.
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
            for angle in range(0, 360, 15):
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
