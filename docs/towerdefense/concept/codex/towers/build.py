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
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SIZE = 224
CENTER = (112, 112)
CABLE = (177, 112)
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


def socket_mounted(source, dimensions, socket, target=CENTER):
    """Register an authored source point without letting attachments skew it."""
    box = source.getbbox()
    assert box is not None
    source = source.crop(box)
    scale = min(dimensions[0] / source.width, dimensions[1] / source.height)
    size = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
    # Match the rounded resize dimensions, not an idealized scalar approximation.
    anchor = ((socket[0] - box[0]) * size[0] / source.width,
              (socket[1] - box[1]) * size[1] / source.height)
    origin = (round(target[0] - anchor[0]), round(target[1] - anchor[1]))
    canvas = Image.new('RGBA', (SIZE, SIZE))
    canvas.alpha_composite(source.resize(size, RESAMPLE), origin)
    actual = [origin[0] + anchor[0], origin[1] + anchor[1]]
    return canvas, actual


def outline_mounted(source, dimensions, bounds):
    """Center the octagonal body, excluding nozzles, struts and forward fittings."""
    source_center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
    canvas, actual = socket_mounted(source, dimensions, source_center)
    box = source.getbbox()
    width, height = box[2] - box[0], box[3] - box[1]
    scale = min(dimensions[0] / width, dimensions[1] / height)
    sx, sy = max(1, round(width * scale)) / width, max(1, round(height * scale)) / height
    mapped_bounds = [actual[0] + (bounds[0] - source_center[0]) * sx,
                     actual[1] + (bounds[1] - source_center[1]) * sy,
                     actual[0] + (bounds[2] - source_center[0]) * sx,
                     actual[1] + (bounds[3] - source_center[1]) * sy]
    return canvas, actual, mapped_bounds


def pair(source, level, tower):
    # Keep each pair on one layer; both components inherit the same parent.
    layouts = {
        2: ((25, 54), [(76, 128), (148, 128)]),
        3: ((28, 43), [(80, 144), (144, 144)]),
        4: ((33, 47), [(65, 124), (159, 124)]),
        5: ((19, 48), [(76, 96), (148, 96)]),
    }
    if tower == 'prism':
        layouts[2] = ((26, 60), [(76, 127), (148, 127)])
        layouts[3] = ((21, 38), [(88, 142), (136, 142)])
        layouts[5] = ((26, 42), [(67, 142), (157, 142)])
    elif tower == 'mortar':
        layouts[2] = ((20, 58), [(78, 130), (146, 130)])
        layouts[3] = ((23, 32), [(88, 143), (136, 143)])
        layouts[5] = ((26, 58), [(65, 127), (159, 127)])
    dimensions, centers = layouts[level]
    canvas = Image.new('RGBA', (SIZE, SIZE))
    mid = source.width // 2
    for box, center in zip([(0, 0, mid, source.height), (mid, 0, source.width, source.height)], centers):
        component = trimmed(source.crop(box))
        if level == 4:
            layer = mounted(component, dimensions, center)
        else:
            layer, _ = socket_mounted(component, dimensions, (component.width / 2, component.height * 0.92), center)
        canvas.alpha_composite(layer)
    return canvas


def emission(image, tower):
    pixels = np.asarray(image).copy()
    rgb = pixels[..., :3].astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    if tower == 'tesla':
        mask = (b > 100) & (b > r * 1.3) & (b > g * 1.08)
        mask |= (r > 180) & (g > 65) & (g < r * 0.65) & (b < g * 0.6)
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


def animation_assets(output, tower):
    """Export actual generated VFX as four-frame strips with stable frame origins."""
    sheet = Image.open(HERE / 'raw' / f'{tower}-effects-raw.png')
    states = {}
    for row, state in enumerate(('passive', 'attack')):
        inner_size = (120, 96) if tower == 'tesla' else (104, 104)
        frame_size = (inner_size[0] + 8, inner_size[1] + 8)
        strip = Image.new('RGBA', (frame_size[0] * 4, frame_size[1]))
        for i in range(4):
            frame = key(sheet.crop((i * 384, row * 512, (i + 1) * 384, (row + 1) * 512)))
            frame = frame.resize(inner_size, RESAMPLE)
            pixels = np.asarray(frame).copy()
            pixels[..., 1] = np.minimum(pixels[..., 1].astype(int), np.maximum(pixels[..., 0], pixels[..., 2]).astype(int) + 3)
            pixels[pixels[..., 3] == 0] = 0
            strip.alpha_composite(Image.fromarray(pixels), (i * frame_size[0] + 4, 4))
        folder = output / tower / 'effects'
        folder.mkdir(exist_ok=True)
        strip.save(folder / f'{state}.png', optimize=True)
        center = (112, 44) if tower == 'tesla' else (112, 60)
        descriptor = {'file': f'effects/{state}.png', 'frames': 4, 'frameSize': list(frame_size),
                      'offset': [center[0] - frame_size[0] / 2, center[1] - frame_size[1] / 2],
                      'parent': 'head', 'blend': 'additive'}
        if state == 'passive':
            states[state] = {'durationMs': 1600, 'loop': True, 'frameDurationMs': 200,
                             'glowGain': [[0, 0.65], [800, 0.9], [1600, 0.65]],
                             'glowStrength': [[0, 0.06], [800, 0.18], [1600, 0.06]],
                             'effectOpacity': [[0, 0.12], [800, 0.28], [1600, 0.12]],
                             'effect': descriptor}
        else:
            states[state] = {'durationMs': 640, 'loop': False, 'frameDurationMs': 160,
                             'glowGain': [[0, 0.75], [160, 1.05], [240, 1.35], [400, 1.15], [640, 0.65]],
                             'glowStrength': [[0, 0.1], [160, 0.3], [240, 0.9], [400, 0.5], [640, 0.06]],
                             'effectOpacity': [[0, 0.1], [160, 0.5], [240, 1], [400, 0.7], [640, 0]],
                             'effect': descriptor}
    return states


def build(output):
    sheets = {t: Image.open(HERE / 'raw' / f'{t}-sheet-v2-raw.png') for t in BOXES}
    sources = {t: [key(sheet.crop(box)) for box in BOXES[t]] for t, sheet in sheets.items()}
    pad_source = Image.open(HERE / 'raw' / 'tesla-sheet-raw.png').crop((15, 100, 420, 480))
    pad_canvas, outline_center, bounds = outline_mounted(key(pad_source), (136, 136), (37, 30, 356, 359))
    pad = save_part(output, '', 'pad', pad_canvas, None, 0)
    pad['outlineCenter'] = outline_center
    pad['outlineBounds'] = bounds
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
        base_bounds = {'tesla': (45, 32, 355, 332), 'mortar': (41, 23, 449, 438),
                       'prism': (42, 38, 459, 420)}[tower]
        base_canvas, outline_center, bounds = outline_mounted(base, (106, 104), base_bounds)
        base_part = save_part(output, tower, 'base', base_canvas, 'pad', 10)
        base_part['outlineCenter'] = outline_center
        base_part['outlineBounds'] = bounds
        entries.append(base_part)
        dimensions, head_socket = {'tesla': ((64, 96), (290, 870)),
                                   'mortar': ((82, 80), (183, 150)),
                                   'prism': ((50, 108), (125, 445))}[tower]
        head_canvas, mount = socket_mounted(head, dimensions, head_socket)
        head_part = save_part(output, tower, 'head', head_canvas, 'base', 40)
        head_part['mountPosition'] = mount
        head_part['aims'] = tower == 'mortar'
        entries.append(head_part)
        for level, source in enumerate(upgrades, 2):
            parent = 'base' if tower != 'mortar' or level in (2, 4) else 'head'
            entries.append(save_part(output, tower, f'upgrade_l{level}', pair(source, level, tower), parent,
                                     {2: 30, 3: 45, 4: 20, 5: 35}[level], level))
        muzzle = [112, 44 if tower == 'tesla' else 18]
        muzzle_parent = 'head'
        if tower == 'mortar':
            barrel_canvas, mount = socket_mounted(parts[2], (46, 90), (115, 442))
            barrel = save_part(output, tower, 'barrel', barrel_canvas, 'head', 50)
            barrel['mountPosition'] = mount
            barrel['recoil'] = {'axis': [0, 1], 'distancePx': 8}
            entries.append(barrel)
            muzzle, muzzle_parent = [112, 46], 'barrel'
        manifest = {
            'size': [SIZE, SIZE], 'centerX': 112, 'root': 'pad', 'light': 'reference-matched',
            'mountCenter': list(CENTER), 'aim': {'enabled': tower == 'mortar', 'part': 'head'},
            'view': 'steep overhead with visible machinery depth, matching the approved concept',
            'inGameDiameterPx': 68, 'padDiameterPx': 136, 'paddingPx': 4,
            'angleConvention': 'clockwise degrees in image coordinates; zero aims up',
            'coordinates': 'offset, pivot and anchor position are absolute assembled rest-frame pixels; inherit parent transforms',
            'upgrades': 'include every part with minLevel <= level; valid levels 1 through 5',
            'glowBlend': 'additive RGB weighted by alpha; base art remains complete without glow',
            'anchors': {
                'muzzle': {'parent': muzzle_parent, 'position': muzzle},
                'cable': {'parent': 'pad', 'position': list(CABLE)},
                'range_center': {'parent': 'pad', 'position': list(CENTER)},
            },
            'parts': entries,
        }
        if tower != 'mortar':
            manifest['animations'] = animation_assets(output, tower)
        (output / tower / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    registry = {'version': 2, 'towers': {t: f'{t}/manifest.json' for t in BOXES},
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
        if name == 'head' and manifest.get('aim', {}).get('enabled', True):
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


@lru_cache(maxsize=32)
def read_manifest(path):
    return json.loads(Path(path).read_text())


@lru_cache(maxsize=256)
def read_png(path):
    return Image.open(path).convert('RGBA')


def interpolate(keys, time_ms):
    for (a, x), (b, y) in zip(keys, keys[1:]):
        if time_ms <= b:
            return x + (y - x) * max(0, (time_ms - a) / (b - a))
    return keys[-1][1]


def additive(canvas, layer, strength):
    box = layer.getbbox()
    if box is None or strength == 0:
        return canvas
    base = np.asarray(canvas.crop(box)).astype(float) / 255
    emit = np.asarray(layer.crop(box)).astype(float) / 255
    alpha = np.maximum(base[..., 3:4], emit[..., 3:4] * strength)
    premult = base[..., :3] * base[..., 3:4] + emit[..., :3] * emit[..., 3:4] * strength
    rgb = np.divide(premult, alpha, out=np.zeros_like(premult), where=alpha > 0)
    result = Image.fromarray(np.uint8(np.clip(np.concatenate((rgb, alpha), axis=2) * 255, 0, 255)))
    canvas.paste(result, box[:2])
    return canvas


@lru_cache(maxsize=512)
def transformed_png(path, size, inverse):
    return read_png(path).transform(size, Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC)


def render(directory, level, angle, recoil=0, glows=True, state=None, time_ms=0):
    manifest = read_manifest(str(directory / 'manifest.json'))
    transforms = matrices(manifest, angle, recoil)
    size = tuple(manifest['size'])
    canvas = Image.new('RGBA', size)
    animation = manifest.get('animations', {}).get(state) if glows else None
    phase = 0
    gain, strength = 1., 0.2
    if animation:
        duration = animation['durationMs']
        phase = time_ms % duration if animation['loop'] else min(duration, max(0, time_ms))
        gain = interpolate(animation['glowGain'], phase)
        strength = interpolate(animation['glowStrength'], phase)
    for p in sorted(manifest['parts'], key=lambda p: p['z']):
        if p['minLevel'] > level:
            continue
        forward = transforms[p['name']] @ translate(*p['offset'])
        inverse = np.linalg.inv(forward)[:2].reshape(-1)
        layer = transformed_png(str(directory / p['file']), size, tuple(inverse))
        glow = None
        if glows:
            glow = transformed_png(str(directory / p['glow']), size, tuple(inverse))
            box = glow.getbbox()
            if animation and box:
                pixels = np.asarray(layer.crop(box)).copy()
                coverage = np.asarray(glow.crop(box))[..., 3:4].astype(float) / 255
                pixels[..., :3] = np.uint8(np.clip(pixels[..., :3] * (1 + (gain - 1) * coverage), 0, 255))
                layer = layer.copy()
                layer.paste(Image.fromarray(pixels), box[:2])
        canvas.alpha_composite(layer)
        if glows:
            canvas = additive(canvas, glow, strength)
    if animation:
        effect = animation['effect']
        frame = min(effect['frames'] - 1, int(phase / animation['frameDurationMs']) % effect['frames'])
        w, h = effect['frameSize']
        strip = read_png(str(directory / effect['file']))
        source = strip.crop((frame * w, 0, (frame + 1) * w, h))
        forward = transforms[effect['parent']] @ translate(*effect['offset'])
        inverse = np.linalg.inv(forward)[:2].reshape(-1)
        layer = source.transform(size, Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC)
        canvas = additive(canvas, layer, interpolate(animation['effectOpacity'], phase))
    anchors = {n: (transforms[a['parent']] @ [*a['position'], 1])[:2].tolist()
               for n, a in manifest['anchors'].items()}
    return canvas, anchors


def preview(output):
    # Passive/glow peak/attack for fixed rigs; aiming and recoil for Mortar.
    stride, row_height = 232, 336
    image = Image.new('RGBA', (9 * stride + 120, 4 * row_height + 40), GROUND)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=14)
    for col, (level, angle) in enumerate((l, a) for l in (1, 3, 5) for a in (0, 45, 180)):
        draw.text((120 + col * stride + 94, 10), f'L{level}', font=font, fill='#e6daca')
    for row, (tower, recoil) in enumerate([('tesla', 0), ('mortar', 0), ('prism', 0), ('mortar', 1)]):
        y = 40 + row * row_height
        draw.text((8, y + 70), tower.upper(), font=font, fill='#e6daca')
        if recoil:
            draw.text((8, y + 92), 'RECOILED', font=font, fill='#f28966')
        for col, (level, angle) in enumerate((l, a) for l in (1, 3, 5) for a in (0, 45, 180)):
            if tower == 'mortar':
                pose, _ = render(output / tower, level, angle, recoil)
                label = f'{angle} deg' + (' / recoil' if recoil else '')
            else:
                state, time_ms, label = {0: ('passive', 0, 'PASSIVE'),
                                         45: ('passive', 800, 'GLOW PEAK'),
                                         180: ('attack', 240, 'ATTACK')}[angle]
                pose, _ = render(output / tower, level, 0, state=state, time_ms=time_ms)
            draw.text((120 + col * stride + 74, y), label, font=font, fill='#e6daca')
            image.alpha_composite(pose, (120 + col * stride, y + 24))
            # 68px footprint proof, same parts and transforms at the actual game scale.
            image.alpha_composite(pose.resize((112, 112), RESAMPLE), (120 + col * stride + 56, y + 220))
    image.convert('RGB').save(output / 'preview.png', optimize=True)
    # Working-only proof that bases remain complete with emissive layers disabled.
    neutral = Image.new('RGBA', (3 * SIZE, SIZE), GROUND)
    for i, tower in enumerate(BOXES):
        neutral.alpha_composite(render(output / tower, 5, 45, glows=False)[0], (i * SIZE, 0))
    neutral.convert('RGB').save(HERE / 'glow-off.png', optimize=True)
    alignment = Image.new('RGBA', (840, 590), GROUND)
    draw = ImageDraw.Draw(alignment)
    for col, tower in enumerate(BOXES):
        directory = output / tower
        manifest = read_manifest(str(directory / 'manifest.json'))
        for row in range(2):
            x, y = 100 + col * 240, 40 + row * 270
            draw.text((x + 72, y - 24), tower.upper(), font=font, fill='#e6daca')
            for part in manifest['parts']:
                if part['name'] in ('pad', 'base'):
                    alignment.alpha_composite(read_png(str(directory / part['file'])),
                                              (x + part['offset'][0], y + part['offset'][1]))
                    if row:
                        box = part['outlineBounds']
                        draw.rectangle((x + box[0], y + box[1], x + box[2], y + box[3]),
                                       outline='#55caca' if part['name'] == 'pad' else '#efbf66')
            if row:
                draw.line((x + CENTER[0], y + 30, x + CENTER[0], y + 196), fill='#ffffff')
                draw.line((x + 30, y + CENTER[1], x + 196, y + CENTER[1]), fill='#ffffff')
        draw.text((10, 135), 'EXPOSED', font=font, fill='#e6daca')
        draw.text((10, 405), 'GUIDES', font=font, fill='#e6daca')
    alignment.convert('RGB').save(HERE / 'alignment.png', optimize=True)


def document(output):
    (output / 'NOTES.md').write_text('''# Tower puppets — issue 129

Art generated with OpenAI image_gen.imagegen on retained #00FF00 sheets.
Pillow/NumPy key, despill, resize, extract emission and render the exported assets.
Reference: td-towers-base.png on codex/towerdefense-concept-art; working branch
codex/td-towers-work is based on towerdefense-concept-art.

FILES.txt enumerates every actual production file, including this note.
manifest.json indexes one manifest each for Tesla, Mortar and Prism.
Offsets, pivots, mountPosition and anchors use the 224x224 assembled rest frame.
Pad/subplatform outline centers and weapon mounts share [112,112]. Center the
octagonal bodies by outlineBounds, excluding sockets and side fittings; anchor
weapons by their feet. The 136px pad remains 2x a 68px game footprint.
Four clear pixels pad every part and every effect frame.
Include all parts with minLevel <= level; upgrades are cumulative through L5.
Every part has a same-canvas _glow.png; unlit parts have clear emissive layers.
Effect strips are already emissive RGBA, not body parts needing duplicate glows.

Only Mortar has aim.enabled=true: rotate head about [112,112], inherit transforms.
Its child barrel recoils 8px along local +y; the muzzle anchor follows the barrel.
Tesla and Prism remain fixed, including all their upgrades, when aiming changes.
Their animations.passive loops for 1600ms; animations.attack is a 640ms one-shot.
Each state defines glowGain/glowStrength/effectOpacity keys in milliseconds,
four VFX frames, frameDurationMs, frameSize, offset, parent and additive blending.
Passively breathe the emissive pixels and add sparse sparks; attack charges,
brightens and forks through the generated electrical/crystal effect frames.
Use premultiplied additive RGB for effects; do not recolor non-emissive steel.
Cable and range_center anchors are fixed on pad; all coordinates are rest-frame.

preview.png is rendered from the actual manifests and PNGs on #211d19:
L1/L3/L5 passive, glow peak and attack for Tesla/Prism; 0/45/180-degree Mortar
and matching recoil poses. Each cell includes a 68px-footprint reduction.
Working files include passive/attack GIFs and their same-time comparison.
Validation covers 480 aiming/recoil poses, 300 animation samples, concentric outlines,
fixed-rig invariance, glow/effect canvases, visible upgrades, clipping and budget.
The full production directory is below 1.5MB. No game code changed.
The concept's steep overhead depth is retained; only Mortar uses 2D aiming rotation.
Rebuild with python -B build.py --output PATH in the working folder.
''')
    files = sorted(str(p.relative_to(output)) for p in output.rglob('*') if p.is_file())
    if 'FILES.txt' not in files:
        files.append('FILES.txt')
    (output / 'FILES.txt').write_text('\n'.join(sorted(files)) + '\n')


def verify(output):
    registry = json.loads((output / 'manifest.json').read_text())
    report = {'posesChecked': 0, 'animationFramesChecked': 0, 'platformPairsChecked': 0, 'towers': {}, 'errors': []}
    for tower, path in registry['towers'].items():
        directory = (output / path).parent
        manifest = json.loads((directory / 'manifest.json').read_text())
        assert set(manifest['anchors']) == {'muzzle', 'cable', 'range_center'}
        parts = {p['name']: p for p in manifest['parts']}
        assert {'pad', 'base', 'head', 'upgrade_l2', 'upgrade_l3', 'upgrade_l4', 'upgrade_l5'} <= parts.keys()
        for p in parts.values():
            assert p['parent'] is None or p['parent'] in parts
            assert len(p['offset']) == len(p['pivot']) == 2
            if 'mountPosition' in p:
                assert np.allclose(p['mountPosition'], CENTER, atol=0.51), 'Socket is off center'
            if 'outlineBounds' in p:
                x0, y0, x1, y1 = p['outlineBounds']
                center = [(x0 + x1) / 2, (y0 + y1) / 2]
                assert np.allclose(center, p['outlineCenter'])
                assert np.allclose(center, CENTER, atol=0.51), 'Octagonal outline is off center'
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
        assert np.allclose(parts['base']['outlineCenter'], parts['pad']['outlineCenter'], atol=1), 'Subplatform is not concentric'
        report['platformPairsChecked'] += 1
        for level in range(1, 6):
            counts.append(sum(p['minLevel'] <= level for p in parts.values()))
            for angle in range(0, 360, 15):
                for recoil in ((0, 1) if tower == 'mortar' else (0,)):
                    pose, anchors = render(directory, level, angle, recoil)
                    assert pose.getbbox() is not None
                    assert np.allclose(anchors['range_center'], CENTER)
                    assert np.allclose(anchors['cable'], CABLE)
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
            assert manifest['aim']['enabled']
            assert parts['barrel']['parent'] == 'head'
            for angle in (0, 45, 180):
                _, normal = render(directory, 5, angle)
                _, recoiled = render(directory, 5, angle, 1)
                assert math.isclose(math.dist(normal['muzzle'], recoiled['muzzle']), 8, abs_tol=1e-6)
        else:
            assert not manifest['aim']['enabled']
            assert np.allclose(matrices(manifest, 180, 0)['head'], np.eye(3))
            assert np.array_equal(render(directory, 5, 0)[0], render(directory, 5, 180)[0])
            assert set(manifest['animations']) == {'passive', 'attack'}
            for state, spec in manifest['animations'].items():
                assert spec['loop'] == (state == 'passive')
                effect = spec['effect']
                w, h = effect['frameSize']
                strip = read_png(str(directory / effect['file']))
                assert strip.size == (w * effect['frames'], h)
                frames = []
                for i in range(effect['frames']):
                    frame = strip.crop((i * w, 0, (i + 1) * w, h))
                    alpha = np.asarray(frame)[..., 3]
                    assert np.any(alpha)
                    assert not np.any(alpha[:4]) and not np.any(alpha[-4:])
                    assert not np.any(alpha[:, :4]) and not np.any(alpha[:, -4:])
                    frames.append(frame.tobytes())
                assert len(set(frames)) == effect['frames']
                for level in range(1, 6):
                    for time_ms in range(0, spec['durationMs'] + 1, 80):
                        pose, anchors = render(directory, level, 125, state=state, time_ms=time_ms)
                        a = np.asarray(pose)[..., 3]
                        assert not np.any(a[0]) and not np.any(a[-1]) and not np.any(a[:, 0]) and not np.any(a[:, -1])
                        assert np.allclose(anchors['muzzle'], manifest['anchors']['muzzle']['position'])
                        report['animationFramesChecked'] += 1
            assert not np.array_equal(render(directory, 5, 0, state='passive', time_ms=0)[0],
                                      render(directory, 5, 0, state='passive', time_ms=800)[0])
            assert not np.array_equal(render(directory, 5, 0, state='passive', time_ms=240)[0],
                                      render(directory, 5, 0, state='attack', time_ms=240)[0])
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
