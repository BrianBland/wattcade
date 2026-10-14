"""Rebuild issue 130 art and render solely from its exported manifest.

python -B build.py --output ../../public/td/outpost
python -B build.py --output ../../public/td/outpost --verify-only
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
SIZE = 520
HUB = (260, 260)
BARREL_AXLE = (HUB[0], HUB[1] - 69)
GROUND = (33, 29, 25, 255)
LANCZOS = Image.Resampling.LANCZOS
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

def key(im):
    rgb = np.array(im.convert('RGB'), dtype=float)
    other = np.maximum(rgb[..., 0], rgb[..., 2])
    excess = rgb[..., 1] - other
    a = np.clip(1 - np.maximum(excess, 0) / 180, 0, 1)
    a[(rgb[..., 1] > 150) & (excess > 85)] = 0
    rgb[..., 1] = np.minimum(rgb[..., 1], other + 2)
    rgb /= np.maximum(a[..., None], .03)
    rgb[..., 1] = np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 2)
    out = np.uint8(np.clip(np.dstack((rgb, a * 255)), 0, 255))
    out[a < .03] = 0
    return Image.fromarray(out)

def blank():
    return Image.new('RGBA', (SIZE, SIZE))

def source(sheet, rect):
    return key(Image.open(HERE / 'raw' / sheet).crop(rect))

def place(im, scale, source_pivot, target):
    """Register a machinery joint, never the asymmetric silhouette bounds."""
    wh = (round(im.width * scale), round(im.height * scale))
    sx, sy = wh[0] / im.width, wh[1] / im.height
    origin = (round(target[0] - source_pivot[0] * sx),
              round(target[1] - source_pivot[1] * sy))
    canvas = blank()
    canvas.alpha_composite(im.resize(wh, LANCZOS), origin)
    return canvas, {'scale': [sx, sy], 'origin': list(origin),
                    'sourcePivot': list(source_pivot),
                    'registeredPivot': [origin[0] + source_pivot[0] * sx,
                                        origin[1] + source_pivot[1] * sy]}

def emission(im, mask, gain=1):
    arr = np.array(im, dtype=float)
    arr[..., 3] *= np.clip(mask * gain, 0, 1)
    arr[arr[..., 3] < 1] = 0
    return Image.fromarray(np.uint8(arr))

def colored_glow(im, kind):
    a = np.array(im, dtype=float)
    r, g, b = [a[..., i] for i in range(3)]
    if kind == 'generator':
        mask = ((b > 150) & (b > r * 1.2) & (g > 110)).astype(float)
        # Fine hot highlights on windings, not a uniformly illuminated housing.
        mask = np.maximum(mask, ((r > 210) & (g > 90) & (g < 170) & (b < 85)) * .45)
    elif kind == 'pilot':
        mask = ((b > 150) & (b > r * 1.25) & (g > 100)).astype(float)
        mask = np.maximum(mask, ((r > 230) & (g > 100) & (b < 90)).astype(float))
        yy, xx = np.indices(r.shape)
        mask *= (yy < HUB[1] - 75) & (abs(xx - HUB[0]) < 13)
    else:
        yy, xx = np.indices(r.shape)
        radius = np.hypot(xx - HUB[0], yy - HUB[1])
        mask = ((r > 210) & (g > 155) & (b > 80) & (radius > 118) & (radius < 130)) * .55
    return emission(im, mask)

def export_pair(out, name, base, glow, pivot, parent, z, **extra):
    # Lanczos unpremultiplication can amplify sub-byte chroma in nearly-clear
    # edge pixels. Despill once more after resampling, preserving alpha.
    cleaned = []
    for im in (base, glow):
        a = np.array(im)
        cap = np.maximum(a[..., 0], a[..., 2]).astype(np.int16) + 2
        a[..., 1] = np.minimum(a[..., 1], np.minimum(cap, 255)).astype(np.uint8)
        a[a[..., 3] == 0] = 0
        cleaned.append(Image.fromarray(a))
    base, glow = cleaned
    union = Image.fromarray(np.maximum(np.array(base)[..., 3], np.array(glow)[..., 3]))
    bb = union.getbbox()
    if bb is None:
        raise ValueError('Empty pair: ' + name)
    bb = (bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4)
    for suffix, im in [('', base), ('_glow', glow)]:
        im.crop(bb).save(out / 'parts' / (name + suffix + '.png'), optimize=True)
    return {'name': name, 'file': 'parts/' + name + '.png',
            'glow': 'parts/' + name + '_glow.png', 'offset': list(bb[:2]),
            'pivot': list(pivot), 'parent': parent, 'z': z, **extra}

def build(out):
    (out / 'parts').mkdir(parents=True, exist_ok=True)
    (out / 'masks').mkdir(exist_ok=True)
    parts = []
    def put(name, im, glow, pivot, parent, z, **extra):
        p = export_pair(out, name, im, glow, pivot, parent, z, **extra)
        parts.append(p)
        return p
    raw = 'deck-flywheel-sheet-raw.png'
    deck, reg = place(source(raw, (0, 0, 815, 1024)), .567, (410, 490), (260, 260))
    # Centers are measured from the ring/axle, excluding asymmetric rim sockets.
    put('deck', deck, blank(), (260, 260), None, 0, registration=reg)
    wheel, reg = place(source(raw, (820, 100, 1536, 900)), .4, (345, 387), HUB)
    put('flywheel', wheel, colored_glow(wheel, 'rim'), HUB, 'deck', 20,
        registration=reg, rotation={'axis': 'z', 'continuous': True, 'degreesPerSecond': 120})
    machinery = 'machinery-sheet-raw.png'
    cab_source = source('cab-v2-sheet-raw.png', (0, 0, 1254, 1254))
    cab, cab_reg = place(cab_source, .13, (627, 635), (337, 357))
    # A destination-out stencil clears the actual keyed opening in EVERY layer
    # below the cab. Never bake a rotating window hole into the flywheel sprite.
    inv = 255 - np.array(cab_source)[..., 3]
    opening = np.zeros_like(inv)
    opening[330:775, 280:980] = inv[330:775, 280:980]
    mask_source = Image.new('RGBA', cab_source.size, (255, 255, 255, 0))
    mask_source.putalpha(Image.fromarray(opening))
    mask, _ = place(mask_source, .13, (627, 635), (337, 357))
    mask.save(out / 'masks' / 'cab_window.png', optimize=True)
    sx, sy = cab_reg['scale']; ox, oy = cab_reg['origin']
    window = [round(ox + 335 * sx), round(oy + 360 * sy),
              round(585 * sx), round(365 * sy)]
    put('cab', cab, blank(), (337, 357), 'deck', 45, registration=cab_reg)
    gen, reg = place(source(machinery, (715, 50, 1090, 910)), .18, (183, 426), (421, 322))
    put('generator', gen, colored_glow(gen, 'generator'), (421, 322), 'deck', 40,
        registration=reg)
    belt, reg = place(source(machinery, (1140, 110, 1525, 860)), .5, (166, 160), HUB)
    belt = belt.rotate(47, Image.Resampling.BICUBIC, center=HUB)
    put('belt', belt, blank(), HUB, 'deck', 10,
        drive={'flywheelAxle': list(HUB), 'generatorAxle': [413, 392]})
    weapons = 'weapons-sheet-raw.png'
    gatling, reg = place(source(weapons, (35, 95, 515, 550)), .27, (270, 359), HUB)
    put('head_gatling', gatling, blank(), HUB, 'deck', 60,
        weapon='gatling', aims=True, registration=reg)
    flamer, reg = place(source(weapons, (575, 20, 990, 575)), .32, (196, 435), HUB)
    put('head_flamer', flamer, colored_glow(flamer, 'pilot'), HUB, 'deck', 60,
        weapon='flamer', aims=True, registration=reg)
    rail, reg = place(source(weapons, (1080, 0, 1420, 580)), .32, (167, 455), HUB)
    ar = np.array(rail, dtype=float)
    purple = ((ar[..., 2] > ar[..., 1] * 1.18) &
              (ar[..., 0] > ar[..., 1] * 1.08) & (ar[..., 2] > 105))
    cap_centers = [(1247, 148), (1247, 230), (1247, 308)]
    glows = []
    yy, xx = np.indices(purple.shape)
    for cx, cy in cap_centers:
        px = reg['origin'][0] + (cx - 1080) * reg['scale'][0]
        py = reg['origin'][1] + cy * reg['scale'][1]
        region = (abs(xx - px) < 13) & (abs(yy - py) < 12)
        glow = emission(rail, (purple & region).astype(float))
        glows.append(glow)
    # Keep uncharged insulators complete and dark; charge comes from child masks.
    ar[purple, :3] *= .25
    dark_rail = Image.fromarray(np.uint8(ar))
    put('head_rail', dark_rail, blank(), HUB, 'deck', 60,
        weapon='rail', aims=True, registration=reg)
    for i, glow in enumerate(glows, 1):
        put('rail_cap_' + str(i), blank(), glow, HUB, 'head_rail', 65,
            weapon='rail', minCharge=i, emissiveOnly=True)
    spin_sheet = 'gatling-spin-v2-sheet-raw.png'
    # Register the coupling axle independently in each generated phase. The
    # child changes axial roll only; it inherits its parent's planar aim.
    spin_centers = [144, 398, 650, 895, 1154, 1400]
    spin_frames = []
    for i, cx in enumerate(spin_centers):
        frame, reg = place(source(spin_sheet, (i*256, 0, (i+1)*256, 1024)),
                           .13, (cx-i*256, 829), BARREL_AXLE)
        spin_frames.append(frame)
    union = np.maximum.reduce([np.array(f)[..., 3] for f in spin_frames])
    bbox = Image.fromarray(union).getbbox()
    bbox = (bbox[0]-4, bbox[1]-4, bbox[2]+4, bbox[3]+4)
    # Use the same canvas/offset for every phase, including the rest part.
    frame_files = []; frame_glows = []
    for i, frame in enumerate(spin_frames):
        stem = 'gatling_barrels' if i == 0 else f'gatling_barrels_phase_{i}'
        a = np.array(frame.crop(bbox))
        a[..., 1] = np.minimum(a[..., 1], np.minimum(255,
                     np.maximum(a[..., 0], a[..., 2]).astype(np.int16)+2)).astype(np.uint8)
        a[a[..., 3] == 0] = 0
        Image.fromarray(a).save(out / 'parts' / (stem + '.png'), optimize=True)
        Image.new('RGBA', (bbox[2]-bbox[0], bbox[3]-bbox[1])).save(
            out / 'parts' / (stem + '_glow.png'), optimize=True)
        frame_files.append('parts/' + stem + '.png')
        frame_glows.append('parts/' + stem + '_glow.png')
    barrel_part = {'name': 'gatling_barrels', 'file': frame_files[0],
                  'glow': frame_glows[0], 'offset': list(bbox[:2]),
                  'pivot': list(BARREL_AXLE), 'parent': 'head_gatling', 'z': 70,
                  'weapon': 'gatling',
                  'axialSpin': {'axis': [0, -1, 0], 'axisOrigin': list(BARREL_AXLE),
                      'mode': 'spriteFrames', 'periodDegrees': 72,
                      'frameDurationMs': 50, 'frames': frame_files,
                      'frameGlows': frame_glows, 'phaseDegrees': [0, 12, 24, 36, 48, 60]}}
    parts.append(barrel_part)
    for i, rect in enumerate([(1010, 585, 1270, 1000), (1265, 585, 1515, 1000)], 1):
        decal, _ = place(source(weapons, rect), .23, (130, 200),
                         (176, 320) if i == 1 else (319, 179))
        put('damage_' + str(i), decal, blank(), (260, 260), 'deck', 50,
            damageStage=i, cumulative=True)
    # Deck socket mouths measured from source; six, in clockwise order.
    cables = [(621, 198), (758, 484), (624, 767), (204, 766), (60, 486), (203, 198)]
    dr = parts[0]['registration']
    anchors = {f'cable_{i}': {'parent': 'deck', 'position':
              [round(dr['origin'][0] + x * dr['scale'][0], 2),
               round(dr['origin'][1] + y * dr['scale'][1], 2)]}
              for i, (x, y) in enumerate(cables, 1)}
    anchors.update({
        'cab_window': {'parent': 'deck', 'rect': window, 'riderDrawOrder': 44,
                       'clipMask': 'masks/cab_window.png',
                       'riderPlacement': {'source': 'src/cosmetics/draw/rider.ts',
                            'scale': 1.7, 'ground': [window[0]+window[2]/2,
                                                     window[1]+window[3]-2]}},
        'muzzle_gatling': {'parent': 'gatling_barrels', 'position': [HUB[0], HUB[1]-155]},
        'muzzle_flamer': {'parent': 'head_flamer', 'position': [HUB[0], HUB[1]-124],
                          'positions': [[HUB[0]-22, HUB[1]-124], [HUB[0]+21, HUB[1]-124]]},
        'muzzle_rail': {'parent': 'head_rail', 'position': [HUB[0], HUB[1]-136]},
        'range_center': {'parent': 'deck', 'position': list(HUB)}
    })
    manifest = {
        'version': 2, 'size': [SIZE, SIZE], 'centerX': 260, 'root': 'deck',
        'light': 'top', 'view': 'overhead orthographic with reference-matched bevel depth',
        'inGameDiameterPx': 220, 'deckDiameterPx': 440, 'paddingPx': 4,
        'angleConvention': 'clockwise degrees in image coordinates; zero aims up',
        'coordinates': 'offset, pivot, and anchors are absolute assembled rest-frame pixels; children inherit parent transforms',
        'weaponSelection': 'exactly one of gatling/flamer/rail; only selected weapon parts render',
        'hubCenter': list(HUB), 'aim': {'parts': ['head_gatling', 'head_flamer', 'head_rail']},
        'glowBlend': 'additive RGB weighted by alpha; base remains complete with emission disabled',
        'compositeMasks': [{'file': 'masks/cab_window.png', 'offset': [0, 0],
                            'parent': 'deck', 'beforeZ': 44, 'operation': 'destination-out'}],
        'railCharge': {'parts': ['rail_cap_1', 'rail_cap_2', 'rail_cap_3'],
                       'order': 'muzzle to hub', 'validStates': [0, 1, 2, 3]},
        'damage': {'parts': ['damage_1', 'damage_2'], 'validStages': [0, 1, 2],
                   'cumulative': True},
        'anchors': anchors, 'parts': parts, 'preview': 'preview.png'
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest

def rotation(angle, pivot):
    angle = round(angle % 360, 10) % 360
    a = math.radians(angle); c, s = math.cos(a), math.sin(a)
    x, y = pivot
    return np.array([[c, -s, x - c*x + s*y], [s, c, y - s*x - c*y], [0, 0, 1.]])

def matrices(manifest, angle, wheel_angle):
    result = {}
    def visit(p):
        if p['name'] in result:
            return result[p['name']]
        parent = visit(next(q for q in manifest['parts'] if q['name'] == p['parent'])) if p['parent'] else np.eye(3)
        own = wheel_angle if p['name'] == 'flywheel' else angle if p.get('aims') else 0
        result[p['name']] = parent @ rotation(own, p['pivot'])
        return result[p['name']]
    for p in manifest['parts']:
        visit(p)
    return result

@lru_cache(maxsize=160)
def load_png(path):
    return Image.open(path).convert('RGBA')

def transformed(im, offset, matrix):
    placement = np.array([[1, 0, offset[0]], [0, 1, offset[1]], [0, 0, 1]])
    inv = np.linalg.inv(matrix @ placement)
    return im.transform((SIZE, SIZE), Image.Transform.AFFINE,
                         tuple(inv[:2].reshape(-1)), Image.Resampling.BICUBIC)

@lru_cache(maxsize=500)
def cached_transform(path, offset, matrix):
    return transformed(load_png(path), offset, np.array(matrix).reshape(3, 3))

def add_glow(canvas, glow, strength):
    a, b = np.array(canvas, dtype=float), np.array(glow, dtype=float)
    alpha = b[..., 3:4] / 255
    a[..., :3] = np.minimum(255, a[..., :3] + b[..., :3] * alpha * strength)
    a[..., 3] = np.maximum(a[..., 3], b[..., 3])
    return Image.fromarray(np.uint8(a))

def render(out, weapon='flamer', angle=0, wheel_angle=0, charge=3, damage=0,
           spin_frame=0, glow=True, placeholder=False):
    m = json.loads((out / 'manifest.json').read_text())
    mats = matrices(m, angle, wheel_angle)
    canvas = blank(); stencil_done = False
    for p in sorted(m['parts'], key=lambda p: p['z']):
        if p.get('weapon', weapon) != weapon or p.get('damageStage', 0) > damage:
            continue
        if not stencil_done and p['z'] >= 44:
            for stencil in m['compositeMasks']:
                mask = transformed(load_png(str(out / stencil['file'])), stencil['offset'], mats[stencil['parent']])
                a = np.array(canvas)
                a[..., 3] = np.uint8(a[..., 3].astype(float) * (1 - np.array(mask)[..., 3] / 255))
                a[a[..., 3] == 0] = 0
                canvas = Image.fromarray(a)
            stencil_done = True
        base_path = str(out / p['file'])
        spin = p.get('axialSpin', {})
        if spin.get('frames'):
            base_path = str(out / spin['frames'][spin_frame % len(spin['frames'])])
        if load_png(base_path).getbbox():
            canvas.alpha_composite(cached_transform(base_path, tuple(p['offset']),
                                   tuple(mats[p['name']].reshape(-1))))
        if glow and p.get('minCharge', 0) <= charge:
            glow_path = str(out / p['glow'])
            if load_png(glow_path).getbbox():
                layer = cached_transform(glow_path, tuple(p['offset']),
                                         tuple(mats[p['name']].reshape(-1)))
                canvas = add_glow(canvas, layer, 1.5 if p.get('emissiveOnly') else .6)
    if placeholder:
        x, y, w, h = m['anchors']['cab_window']['rect']
        d = ImageDraw.Draw(canvas)
        d.rectangle((x, y, x+w-1, y+h-1), outline=(82, 222, 230, 255), width=2)
        d.line((x, y, x+w-1, y+h-1), fill=(82, 222, 230, 180), width=1)
        d.line((x+w-1, y, x, y+h-1), fill=(82, 222, 230, 180), width=1)
    return canvas

def label(d, xy, text, size=17, fill='#b9afa0'):
    d.text(xy, text, font=ImageFont.truetype(FONT, size), fill=fill)

def preview(out):
    # Every large rig is accompanied by its exact 220px-deck game-scale reduction.
    states = [(w, f'{w.upper()}  /  {a:+d}°', dict(weapon=w, angle=a))
              for w in ('gatling', 'flamer', 'rail') for a in (0, -60, 60)]
    states += [('wheel', f'FLYWHEEL  /  {a}°', dict(wheel_angle=a)) for a in (0, 30)]
    states += [('charge', f'RAIL  /  {n} OF 3 CHARGED', dict(weapon='rail', charge=n)) for n in range(4)]
    states += [('damage', f'DAMAGE  /  STAGE {n}', dict(damage=n)) for n in (1, 2)]
    states += [('cab', 'CAB  /  EMPTY RIDER INSERT', dict(placeholder=True))]
    cw, ch = 740, 530
    page = Image.new('RGBA', (cw*3 + 64, ch*6 + 155), GROUND)
    d = ImageDraw.Draw(page)
    label(d, (36, 24), 'DYNAMO OUTPOST', 32, '#eee1c5')
    label(d, (37, 71), 'Manifest-rendered cutouts  ·  2× assets + 220px deck at game scale', 17)
    for i, (group, title, args) in enumerate(states):
        x, y = 30 + i % 3 * cw, 130 + i // 3 * ch
        d.line((x, y, x+cw-25, y), fill='#534638')
        label(d, (x+7, y+14), title, 17, '#d7c5a0')
        im = render(out, **args)
        page.alpha_composite(im.resize((455, 455), LANCZOS), (x, y+45))
        page.alpha_composite(im.resize((260, 260), LANCZOS), (x+450, y+139))
        label(d, (x+475, y+411), '220px deck', 14)
    page.convert('RGB').save(HERE / 'preview-full.png', optimize=True)
    # Production sheet keeps the stated 220px game footprint literally at 220
    # image pixels. Its detailed 2x companions stay in preview-full.png.
    compact = Image.new('RGBA', (1000, 2050), GROUND)
    cd = ImageDraw.Draw(compact)
    label(cd, (26, 22), 'DYNAMO OUTPOST', 29, '#eee1c5')
    label(cd, (27, 66), 'Manifest-rendered states  ·  Exact 220px deck at game scale', 16)
    for i, (_, title, args) in enumerate(states):
        x, y = 25 + i % 3 * 325, 110 + i // 3 * 320
        cd.line((x, y, x+300, y), fill='#534638')
        label(cd, (x+2, y+12), title, 14, '#d7c5a0')
        compact.alpha_composite(render(out, **args).resize((260, 260), LANCZOS), (x+16, y+45))
    compact.convert('RGB').quantize(256, Image.Quantize.MEDIANCUT).save(out / 'preview.png', optimize=True)
    render(out).save(HERE / 'assembled.png', optimize=True)
    ground = Image.new('RGBA', (SIZE, SIZE), GROUND)
    ground.alpha_composite(render(out))
    ground.convert('RGB').save(HERE / 'assembled-ground.png', optimize=True)
    lineup = Image.new('RGBA', (SIZE*3, SIZE+95), GROUND)
    ld = ImageDraw.Draw(lineup)
    for i, w in enumerate(('gatling', 'flamer', 'rail')):
        lineup.alpha_composite(render(out, weapon=w), (i*SIZE, 65))
        label(ld, (i*SIZE+24, 24), w.upper(), 23, '#eee1c5')
    lineup.convert('RGB').save(HERE / 'lineup.png', optimize=True)

def verify(out):
    m = json.loads((out / 'manifest.json').read_text())
    parts = {p['name']: p for p in m['parts']}
    required = {'deck', 'flywheel', 'belt', 'generator', 'cab', 'head_gatling',
                'gatling_barrels', 'head_flamer', 'head_rail', 'rail_cap_1',
                'rail_cap_2', 'rail_cap_3', 'damage_1', 'damage_2'}
    assert required == set(parts)
    assert parts['gatling_barrels']['parent'] == 'head_gatling'
    assert parts['flywheel']['pivot'] == list(HUB)
    assert parts['deck']['pivot'] == list(HUB)
    assert all(parts['head_' + w]['pivot'] == list(HUB) for w in ('gatling', 'flamer', 'rail'))
    assert not any(p['parent'] == 'flywheel' for p in parts.values())
    assert len([a for a in m['anchors'] if a.startswith('cable_')]) == 6
    for p in parts.values():
        base, glow = [load_png(str(out / p[f])) for f in ('file', 'glow')]
        assert base.size == glow.size
        for im in (base, glow):
            a = np.array(im)
            assert not a[:4, :, 3].any() and not a[-4:, :, 3].any()
            assert not a[:, :4, 3].any() and not a[:, -4:, 3].any()
            rgb = a[..., :3].astype(float)
            spill = (rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]) > 8) & (a[..., 3] > 0)
            assert not spill.any(), p['name'] + ' green fringe'
        if 'registration' in p:
            assert np.linalg.norm(np.array(p['registration']['registeredPivot']) - p['pivot']) < .72
    spin = parts['gatling_barrels']['axialSpin']
    assert spin['axis'] == [0, -1, 0] and len(spin['frames']) == 6
    frame_images = [load_png(str(out / f)) for f in spin['frames']]
    assert len({im.tobytes() for im in frame_images}) == 6
    assert len({im.size for im in frame_images}) == 1
    for path, glow_path in zip(spin['frames'], spin['frameGlows']):
        assert load_png(str(out / path)).size == load_png(str(out / glow_path)).size
        a = np.array(load_png(str(out / path)))
        assert not a[:4, :, 3].any() and not a[-4:, :, 3].any()
        assert not a[:, :4, 3].any() and not a[:, -4:, 3].any()
    # Animation hierarchy: wheel rotation must not move cab, generator or guns.
    for angle in (-60, 0, 60):
        zero, spun = matrices(m, angle, 0), matrices(m, angle, 137)
        for name in ('cab', 'generator', 'head_gatling', 'head_flamer', 'head_rail'):
            assert np.allclose(zero[name], spun[name])
        assert np.allclose(zero['head_gatling'], zero['gatling_barrels'])
    poses = 0
    for weapon in ('gatling', 'flamer', 'rail'):
        for angle in range(0, 360, 5):
            for wheel in (0, 30):
                im = render(out, weapon, angle, wheel, spin_frame=(angle//5)%6)
                bb = im.getbbox()
                assert bb and bb[0] >= 4 and bb[1] >= 4 and bb[2] <= SIZE-4 and bb[3] <= SIZE-4
                poses += 1
    x, y, w, h = m['anchors']['cab_window']['rect']
    for weapon in ('gatling', 'flamer', 'rail'):
        for angle in (-60, 0, 60):
            for wheel in (0, 30, 97, 180):
                im = render(out, weapon, angle, wheel)
                assert not np.array(im)[y:y+h, x:x+w, 3].any(), 'cab opening obstructed'
    charge_pixels = []
    for n in range(4):
        im = np.array(render(out, weapon='rail', charge=n))
        charge_pixels.append(int(((im[..., 2].astype(float) > im[..., 1]*1.4) & (im[..., 2] > 170)).sum()))
    assert all(a < b for a, b in zip(charge_pixels, charge_pixels[1:])), charge_pixels
    for weapon in ('gatling', 'flamer', 'rail'):
        first = render(out, weapon, 0, 0, charge=0, spin_frame=0)
        cycle = render(out, weapon, -1e-14, 360, charge=0, spin_frame=60)
        assert first.tobytes() == cycle.tobytes()
    budget = sum(f.stat().st_size for f in out.rglob('*') if f.is_file())
    assert budget < 1_500_000, budget
    result = {'status': 'pass', 'parts': len(parts), 'rotationPoses': poses,
              'transparentCabPoses': 36, 'axialSpinPhases': 6,
              'closedMechanicalCycles': 3,
              'railChargeBrightPixels': charge_pixels,
              'productionBytes': budget, 'budgetBytes': 1_500_000,
              'checks': ['matching RGBA/glow dimensions', '4px transparent padding',
                         'no green fringe', 'registered axle centers', 'parent inheritance',
                         'all-angle clipping', 'fixed cab stencil with spinning flywheel',
                         'sequential independent rail charge', 'six cable socket anchors']}
    result['checks'] += ['concentric deck/wheel/head pivots', 'pixel-identical loop closure']
    (HERE / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    if not args.verify_only:
        build(out)
        preview(out)
    verify(out)
