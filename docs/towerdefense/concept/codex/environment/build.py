"""Issue 131: reproducible sheet extraction, periodic textures and manifest proofs.

python -B build.py --output /workspace/wattcade/public/td/environment
python -B build.py --output /workspace/wattcade/public/td/environment --verify-only
Source art is imagegen; processing is chroma extraction, scaling, emissive separation,
texture periodicization and palette export. No game source is modified.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parent
GROUND = (33, 29, 25, 255)
LANCZOS = Image.Resampling.LANCZOS
COLORS = {'blue': (69, 210, 255), 'red': (255, 106, 42),
          'purple': (185, 124, 255), 'gold': (255, 207, 58)}
PROPS = ['boulder', 'boulder_split', 'crate', 'ammo_crate', 'barrel',
         'coolant_barrel', 'barrier', 'barrier_broken', 'sandbags_curve',
         'sandbags_straight', 'junction', 'vent']


def key(im):
    rgb = np.asarray(im.convert('RGB'), dtype=np.float32).copy()
    other = np.maximum(rgb[..., 0], rgb[..., 2])
    excess = np.maximum(rgb[..., 1] - other, 0)
    a = np.clip(1 - excess / 180, 0, 1)
    a[(rgb[..., 1] > 155) & (excess > 90)] = 0
    safe = np.maximum(a, .03)
    rgb[..., 0] /= safe
    rgb[..., 2] /= safe
    rgb[..., 1] = np.minimum(rgb[..., 1] / safe,
                            np.maximum(rgb[..., 0], rgb[..., 2]) + 2)
    out = np.uint8(np.clip(np.dstack([rgb, a * 255]), 0, 255))
    out[a < .03] = 0
    return Image.fromarray(out)


def fit(im, limit):
    box = im.getbbox()
    assert box, 'Empty source'
    im = im.crop(box)
    scale = min(limit[0] / im.width, limit[1] / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), LANCZOS)
    canvas = Image.new('RGBA', (im.width + 12, im.height + 12))
    canvas.alpha_composite(im, (6, 6))
    return canvas


def cutout(sheet, box):
    im = key(sheet.crop(box))
    a = np.asarray(im)[..., 3]
    assert not any((edge > 16).any() for edge in
                   [a[0], a[-1], a[:, 0], a[:, -1]]), f'Clipped source at {box}'
    return im


def periodic(im, axes=(0, 1), band=32):
    """Blend opposing edge neighborhoods; exact endpoint equality survives export.

    Uses corresponding inward distances and smooth compact weights. Unlike mirror
    tiling, no duplicated half-image or center symmetry is introduced.
    """
    a = np.asarray(im, dtype=float).copy()
    for axis in axes:
        a = np.moveaxis(a, axis, 0)
        source = a.copy()
        for k in range(band):
            w = .5 * (1 + math.cos(math.pi * k / band))
            mean = (source[k] + source[-1-k]) * .5
            a[k] = source[k] * (1-w) + mean*w
            a[-1-k] = source[-1-k] * (1-w) + mean*w
        a = np.moveaxis(a, 0, axis)
    return Image.fromarray(np.uint8(np.clip(a, 0, 255)))


def save(im, path, colors=128, despill=False):
    q = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE,
                    dither=Image.Dither.NONE)
    if despill:
        # Palette averaging of red/blue neighbors can reintroduce green spill.
        pal = q.getpalette('RGBA')
        for i in range(0, len(pal), 4):
            pal[i+1] = min(pal[i+1], max(pal[i], pal[i+2])+2)
        q.putpalette(pal, rawmode='RGBA')
    q.save(path, optimize=True)


def emission(im, category):
    a = np.asarray(im).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if category == 'organic':
        # Purple pustules and their authored vein highlights; rock/metal excluded.
        strength = np.clip((np.minimum(r, b) - g - 18) / 62, 0, 1)
        strength *= np.clip((np.maximum(r, b) - 58) / 100, 0, 1)
        a[..., :3] = np.stack([r, g, b], -1)
    elif category == 'splat':
        strength = np.clip((r - 88) / 130, 0, 1) * .72
        a[..., :3] = 255
    else:
        strength = np.zeros(r.shape)
    a[..., 3] *= strength
    a[a[..., 3] < 2] = 0
    return Image.fromarray(np.uint8(np.clip(a, 0, 255)))


def export(out):
    out.mkdir(parents=True, exist_ok=True)
    (out / 'parts').mkdir(exist_ok=True)
    parts = []

    def add(name, im, category, **extra):
        clean = np.asarray(im).copy()
        # Lanczos can ring independently in channels at the chroma-key boundary.
        clean[..., 1] = np.minimum(clean[..., 1],
                                   np.minimum(np.maximum(clean[..., 0], clean[..., 2]).astype(int)+2, 255))
        clean[clean[..., 3] == 0] = 0
        im = Image.fromarray(clean)
        glow = emission(im, category)
        save(im, out / 'parts' / f'{name}.png', despill=True)
        save(glow, out / 'parts' / f'{name}_glow.png', 64, despill=True)
        decoded = np.asarray(Image.open(out / 'parts' / f'{name}.png').convert('RGBA'))
        alpha = decoded[..., 3].astype(float)
        yy, xx = np.indices(alpha.shape)
        center = [float((xx*alpha).sum()/alpha.sum()),
                  float((yy*alpha).sum()/alpha.sum())]
        offset = [round(256-center[0], 4), round(256-center[1], 4)]
        if extra.get('tile'):
            offset = [0, 0]
        if extra.get('strip'):
            center = [im.width/2, im.height/2]
            offset = [256-center[0], 256-center[1]]
        parts.append(dict(name=name, file=f'parts/{name}.png',
                          glow=f'parts/{name}_glow.png', size=list(im.size),
                          offset=offset, pivot=[256, 256], parent=None,
                          z={'terrain': 0, 'lip': 10, 'organic': 20, 'splat': 30,
                             'prop': 40}[category], category=category,
                          inGameSize=[im.width/2, im.height/2], **extra))

    terrain = Image.open(HERE / 'raw/terrain-sheet-raw.png')
    boxes = [(18, 16, 500, 498), (528, 16, 1010, 498),
             (1038, 16, 1520, 498), (18, 524, 500, 1006)]
    for i, box in enumerate(boxes):
        source = terrain.crop(box).resize((512, 512), LANCZOS).convert('RGB')
        rgb = np.asarray(source, dtype=float)
        # Dark, desaturated and deliberately calm as explicitly required by #131.
        lum = rgb @ np.array([.2126, .7152, .0722])
        target = np.array([33, 29, 25] if i < 3 else [47, 40, 32])
        rgb = target + (lum[..., None] - lum.mean()) * (.24 if i < 3 else .30)
        rgb += (np.asarray(source, dtype=float)-lum[..., None]) * .08
        im = periodic(Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))).convert('RGBA')
        add(f'ground_{i+1}' if i < 3 else 'trench_floor', im, 'terrain',
            tile=True, repeatX=True, repeatY=True)
    banks = Image.open(HERE / 'raw/cut-banks-sheet-raw.png')
    for name, box in [('trench_lip', (38, 90, 730, 302)),
                      ('trench_lip_fractured', (38, 394, 730, 610))]:
        im = key(banks.crop(box))
        im = im.crop((0, im.getbbox()[1], im.width, im.getbbox()[3]))
        im = im.resize((512, 84), LANCZOS)
        canvas = Image.new('RGBA', (512, 96))
        canvas.alpha_composite(im, (0, 6))
        canvas = periodic(canvas, axes=(1,), band=40)
        add(name, canvas, 'lip', strip=True, repeatX=True, repeatY=False,
            paddingAxes=['y'], curve=dict(axis='x', centerlineY=48,
                                         topEdge='outer ground', bottomEdge='inner floor',
                                         recommendedWidthPx=24, repeatLengthPx=256))
    organic = Image.open(HERE / 'raw/organic-sheet-v2-raw.png')
    # Explicit source crops accommodate imagegen's imperfect cell registration.
    oboxes = [(0, 0, 505, 339), (505, 0, 1040, 318), (1040, 0, 1536, 347),
              (0, 341, 542, 654), (542, 318, 946, 664), (946, 350, 1536, 648),
              (0, 653, 511, 1024), (512, 665, 1008, 1024), (1008, 648, 1536, 1024)]
    for i, box in enumerate(oboxes):
        name = f'creep_{i+1}' if i < 6 else f'burrow_{i-5}'
        add(name, fit(cutout(organic, box), (256, 200) if i < 6 else (240, 220)),
            'organic', tintable=False, glowTintable=True)
    splats = Image.open(HERE / 'raw/splat-sheet-raw.png')
    for i in range(6):
        x, y = (i % 3)*512, (i//3)*512
        box = (x, y, x+512, y+512)
        if i == 1:
            box = (512, 0, 1024, 480)
        elif i == 4:
            box = (512, 480, 1024, 1024)
        im = fit(cutout(splats, box), (160, 148))
        arr = np.asarray(im).copy()
        # Exact neutral RGB guarantees arbitrary brood tint without hue leakage.
        grey = np.uint8(arr[..., :3].astype(float) @ np.array([.2126, .7152, .0722]))
        arr[..., :3] = grey[..., None]
        add(f'splat_{i+1}', Image.fromarray(arr), 'splat', tintable=True,
            glowTintable=True)
    props = Image.open(HERE / 'raw/props-sheet-raw.png')
    pboxes = [(0, 0, 405, 355), (406, 0, 786, 355), (786, 0, 1106, 355),
              (1106, 0, 1536, 355), (0, 360, 376, 690), (379, 360, 688, 690),
              (690, 370, 1120, 647), (1120, 380, 1536, 646),
              (0, 704, 410, 956), (413, 697, 792, 954),
              (800, 650, 1140, 992), (1144, 680, 1536, 972)]
    for name, box in zip(PROPS, pboxes):
        add(f'props_{name}', fit(cutout(props, box), (160, 128)), 'prop')
    manifest = dict(schemaVersion=1, size=[512, 512], centerX=256, light='top',
                    view='overhead; concept-matched material relief',
                    coordinates='offset and pivot are absolute canonical 512x512 frame pixels; '
                                'place each independent part by pivot at its world position',
                    paddingPx=6, scale=2, groundColor='#211d19',
                    glowBlend='additive RGB weighted by alpha; never multiply alpha twice',
                    tint='splat base: multiply neutral RGB by brood RGB / 255; '
                         'glow: white RGB multiplied by brood RGB / 255',
                    anchors={f'spawn_{i}': dict(parent=f'burrow_{i}', position=[256, 256])
                             for i in range(1, 4)}, parts=parts)
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')


class Kit:
    def __init__(self, out):
        self.out = out
        self.manifest = json.loads((out / 'manifest.json').read_text())
        self.parts = {p['name']: p for p in self.manifest['parts']}

    def layer(self, name, glow=True, tint=None):
        p = self.parts[name]
        base = Image.open(self.out / p['file']).convert('RGBA')
        a = np.asarray(base).astype(float)
        if tint:
            a[..., :3] *= np.array(tint)/255
        if glow:
            g = np.asarray(Image.open(self.out / p['glow']).convert('RGBA')).astype(float)
            if tint:
                g[..., :3] *= np.array(tint)/255
            # Correct straight-alpha additive result; preserve transparent boundaries.
            ba, ga = a[..., 3:4]/255, g[..., 3:4]/255
            alpha = np.maximum(ba, ga)
            rgb = a[..., :3]*ba + g[..., :3]*ga
            a[..., :3] = rgb / np.maximum(alpha, .001)
            a[..., 3:4] = alpha*255
        a[a[..., 3] < 1] = 0
        return Image.fromarray(np.uint8(np.clip(a, 0, 255)))

    def draw(self, canvas, name, pos, scale=1, glow=True, tint=None, angle=0):
        p = self.parts[name]
        im = self.layer(name, glow, tint)
        # The pivot expressed in file-local coordinates, taken from manifest.
        local = [p['pivot'][i]-p['offset'][i] for i in range(2)]
        if angle:
            # Pad around authored pivot before rotation to preserve registration.
            radius = math.ceil(math.hypot(im.width, im.height))
            pad = Image.new('RGBA', (radius*2, radius*2))
            pad.alpha_composite(im, (round(radius-local[0]), round(radius-local[1])))
            im = pad.rotate(-angle, resample=Image.Resampling.BICUBIC)
            local = [radius, radius]
        im = im.resize((max(1, round(im.width*scale)), max(1, round(im.height*scale))), LANCZOS)
        canvas.alpha_composite(im, (round(pos[0]-local[0]*scale),
                                    round(pos[1]-local[1]*scale)))

    def tile(self, name, size, scale=1):
        tile = self.layer(name, False)
        tile = tile.resize((round(tile.width*scale), round(tile.height*scale)), LANCZOS)
        canvas = Image.new('RGBA', size)
        for y in range(0, size[1], tile.height):
            for x in range(0, size[0], tile.width):
                canvas.alpha_composite(tile, (x, y))
        return canvas

    def trench(self, canvas, points, width=74, lip_width=27, variant='trench_lip'):
        """Rasterize floor and bend strip using arc-length UVs on both banks.

        Dense polyline nearest-segment mapping avoids stamping overlap artifacts;
        textures remain true source pixels throughout the S-bend.
        """
        pts = np.asarray(points, dtype=float)
        yy, xx = np.indices((canvas.height, canvas.width))
        best = np.full(xx.shape, np.inf)
        arc = np.zeros(xx.shape)
        side = np.zeros(xx.shape)
        length = 0
        for a, b in zip(pts[:-1], pts[1:]):
            d = b-a
            n = np.linalg.norm(d)
            t = np.clip(((xx-a[0])*d[0]+(yy-a[1])*d[1])/(n*n), 0, 1)
            dx, dy = xx-(a[0]+t*d[0]), yy-(a[1]+t*d[1])
            dist = dx*dx+dy*dy
            take = dist < best
            best[take] = dist[take]
            arc[take] = length+t[take]*n
            side[take] = (dx[take]*(-d[1])+dy[take]*d[0])/n
            length += n
        floor = np.asarray(self.layer('trench_floor', False))
        fi = floor[yy % floor.shape[0], xx % floor.shape[1]].copy()
        mask = np.sqrt(best) <= width/2
        fi[..., 3] = np.where(mask, 255, 0)
        canvas.alpha_composite(Image.fromarray(fi))
        lip = np.asarray(self.layer(variant, False))
        v = (np.abs(side)-width/2)/lip_width + .5
        # Manifest repeat length controls both banks, independent of curve tessellation.
        repeat = self.parts[variant]['curve']['repeatLengthPx']
        u = np.int32(arc/repeat*lip.shape[1]) % lip.shape[1]
        vi = np.int32((1-np.clip(v, 0, 1))*(lip.shape[0]-1))
        layer = lip[vi, u].copy()
        layer[..., 3] = np.where((v >= 0) & (v <= 1) &
                                (best <= (width/2+lip_width/2)**2), layer[..., 3], 0)
        canvas.alpha_composite(Image.fromarray(layer))


def font(size, bold=False):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+
                              ('-Bold' if bold else '')+'.ttf', size)


def text(canvas, pos, message, size=16, color=(197, 185, 164), bold=False):
    ImageDraw.Draw(canvas).text(pos, message, font=font(size, bold), fill=color)


def scurve(width, height):
    return [(width*.5 + width*.24*math.sin(t*math.pi*2), -35+t*(height+70))
            for t in np.linspace(0, 1, 120)]


def render(out):
    kit = Kit(out)
    proof = Image.new('RGBA', (1440, 2220), GROUND)
    text(proof, (30, 20), 'DYNAMO DEFENSE / ENVIRONMENT KIT', 32, bold=True)
    text(proof, (30, 65), 'Manifest-rendered production art • 33 independent pieces • 2× exports', 17)
    for i in range(3):
        tile = kit.tile(f'ground_{i+1}', (300, 300), scale=100/512)
        proof.alpha_composite(tile, (30+i*325, 140))
        text(proof, (30+i*325, 107), f'GROUND {i+1}  /  3 × 3 seamless repeat', 14)
    for i, variant in enumerate(['trench_lip', 'trench_lip_fractured']):
        trench = kit.tile('ground_2', (192, 300), .5)
        kit.trench(trench, scurve(192, 300), width=44, lip_width=18, variant=variant)
        proof.alpha_composite(trench, (1020+i*203, 140))
        text(proof, (1020+i*203, 116), 'layered cut' if i == 0 else 'fractured cut', 13)
    text(proof, (1020, 96), 'S-CURVES / excavated banks', 15)
    text(proof, (30, 475), 'HIVE CREEP / six silhouettes, independent pustule emission', 22, bold=True)
    for i in range(6):
        kit.draw(proof, f'creep_{i+1}', (140+i*235, 614), .79)
        text(proof, (80+i*235, 710), f'creep_{i+1}', 15)
    text(proof, (30, 760), 'BURROW MOUTHS / three spawn anchors', 22, bold=True)
    for i in range(3):
        kit.draw(proof, f'burrow_{i+1}', (170+i*300, 920), .94)
        text(proof, (122+i*300, 1045), f'burrow_{i+1}', 15)
    text(proof, (950, 805), 'Base complete with glow OFF', 16)
    kit.draw(proof, 'creep_1', (1070, 925), .75, glow=False)
    kit.draw(proof, 'burrow_1', (1290, 925), .75, glow=False)
    text(proof, (950, 1045), 'No green matte • no ground shadow', 14)
    text(proof, (30, 1100), 'ACID + ICHOR / neutral masters and four brood tints', 22, bold=True)
    for row, (name, tint) in enumerate([('neutral', None), *COLORS.items()]):
        y = 1174+row*108
        text(proof, (32, y+28), name.upper(), 14, color=tint or (180, 180, 180), bold=True)
        for col in range(6):
            kit.draw(proof, f'splat_{col+1}', (217+col*220, y+35), .63,
                     glow=tint is not None, tint=tint)
            if row == 0:
                text(proof, (184+col*220, y-25), f'splat_{col+1}', 13)
    text(proof, (30, 1728), 'OUTPOST PROPS / worn steel, brass, rock and canvas', 22, bold=True)
    for i, name in enumerate(PROPS):
        x, y = 170+(i%4)*355, 1815+(i//4)*136
        kit.draw(proof, f'props_{name}', (x, y+20), .8)
        text(proof, (x-100, y+75), name.replace('_', ' '), 15)
    save(proof, out/'preview.png', 128)
    proof.save(HERE/'preview-full.png', optimize=True)
    tiling = Image.new('RGBA', (1536, 512), GROUND)
    for i in range(3):
        tiling.alpha_composite(kit.tile(f'ground_{i+1}', (512, 512), 1/3), (512*i, 0))
    tiling.save(HERE/'ground-tiling.png', optimize=True)
    curve = kit.tile('ground_1', (960, 640), .5)
    points = [(-80+t*1120, 320+175*math.sin(t*math.pi*2)) for t in np.linspace(0, 1, 160)]
    kit.trench(curve, points, width=110, lip_width=40)
    for i in range(3):
        kit.draw(curve, f'splat_{i+1}', (290+i*125, 350+175*math.sin((250+i*125)/880*math.pi*2)), .45,
                 tint=COLORS['red'])
    curve.save(HERE/'trench-s-curve.png', optimize=True)
    # Independent material/readability proof with the actual retained Warrior cutout.
    warrior = Image.open(HERE/'references/warrior.png').convert('RGBA')
    warrior = warrior.crop(warrior.getbbox())
    warrior.thumbnail((90, 105), LANCZOS)
    scene = kit.tile('ground_2', (1440, 900), .5)
    for start, finish, phase in [(180, 580, 0), (720, 720, .6), (1280, 860, 1.1)]:
        pts = [(start*(1-t)+finish*t+75*math.sin(t*math.pi*2+phase),
                90+t*620) for t in np.linspace(0, 1, 100)]
        kit.trench(scene, pts, width=128, lip_width=28)
        kit.draw(scene, 'creep_1' if phase == 0 else 'creep_6', (start, 105), .65)
        kit.draw(scene, f'burrow_{1 if phase == 0 else 2 if phase < 1 else 3}', (start, 120), .7)
        for t in [.32, .51, .68]:
            x = start*(1-t)+finish*t+75*math.sin(t*math.pi*2+phase)
            y = 90+t*620
            scene.alpha_composite(warrior, (round(x-warrior.width/2), round(y-warrior.height/2)))
    for i, name in enumerate(PROPS):
        kit.draw(scene, 'props_'+name, (390+(i%6)*140, 740+(i//6)*95), .5)
    text(scene, (30, 20), 'GAME-SCALE READABILITY / original Warrior on exported terrain', 22, bold=True)
    scene.save(HERE/'game-scale.png', optimize=True)
    # Side-by-side references are actual images, not newly imagined comparisons.
    comparison = Image.new('RGB', (1440, 1080), GROUND[:3])
    ref = Image.open(HERE/'references/td-battlefield-landscape.png').convert('RGB')
    ref.thumbnail((700, 470), LANCZOS)
    comparison.paste(ref, (10, 55))
    reduced = scene.convert('RGB').resize((700, 438), LANCZOS)
    comparison.paste(reduced, (730, 55))
    text(comparison, (15, 15), 'ORIGINAL / busy concept terrain', 22, bold=True)
    text(comparison, (735, 15), 'EXPORTED / calmer terrain + actual cutouts', 22, bold=True)
    accepted = Image.open(HERE/'references/accepted-towers.png').convert('RGB')
    accepted.thumbnail((650, 500), LANCZOS)
    comparison.paste(accepted, (15, 560))
    text(comparison, (15, 522), 'ISSUE 129 / accepted material reference', 22, bold=True)
    text(comparison, (735, 522), 'ISSUE 131 / exported industrial props', 22, bold=True)
    for i, name in enumerate(PROPS):
        kit.draw(comparison_rgba := comparison.convert('RGBA'), 'props_'+name,
                 (820+(i%3)*220, 625+(i//3)*120), .65)
        comparison = comparison_rgba.convert('RGB')
    comparison.save(HERE/'comparison.png', optimize=True)


def validate(out):
    kit = Kit(out)
    expected = ([f'ground_{i}' for i in range(1, 4)] + ['trench_floor', 'trench_lip',
                 'trench_lip_fractured'] + [f'creep_{i}' for i in range(1, 7)] +
                [f'burrow_{i}' for i in range(1, 4)] + [f'splat_{i}' for i in range(1, 7)] +
                ['props_'+s for s in PROPS])
    assert set(expected) == set(kit.parts)
    records = []
    for name, p in kit.parts.items():
        im = Image.open(out/p['file']).convert('RGBA')
        glow = Image.open(out/p['glow']).convert('RGBA')
        im.load(); glow.load()
        assert im.size == glow.size == tuple(p['size'])
        a, g = np.asarray(im), np.asarray(glow)
        assert not np.any((a[..., 1].astype(int) > np.maximum(a[..., 0], a[..., 2]).astype(int)+8)
                          & (a[..., 1] > 100) & (a[..., 3] > 8)), name+' green fringe'
        assert not np.any((g[..., 3] > 0) & (a[..., 3] == 0)), name+' unregistered emission'
        assert p['parent'] is None and p['pivot'] == [256, 256]
        seam = {}
        if p.get('tile'):
            assert im.size == (512, 512) and np.all(a[..., 3] == 255)
            assert np.array_equal(a[0], a[-1]) and np.array_equal(a[:, 0], a[:, -1])
            seam = dict(xMaxDelta=0, yMaxDelta=0)
            if name.startswith('ground'):
                lum = a[..., :3].astype(float) @ np.array([.2126, .7152, .0722])
                assert lum.std() < 9 and 22 < lum.mean() < 38
        elif p.get('strip'):
            assert np.array_equal(a[:, 0], a[:, -1])
            assert not a[:4, :, 3].any() and not a[-4:, :, 3].any()
            seam = dict(xMaxDelta=0)
        else:
            assert not a[:4, :, 3].any() and not a[-4:, :, 3].any()
            assert not a[:, :4, 3].any() and not a[:, -4:, 3].any()
            alpha = a[..., 3].astype(float)
            yy, xx = np.indices(alpha.shape)
            center = [(xx*alpha).sum()/alpha.sum(), (yy*alpha).sum()/alpha.sum()]
            assert max(abs(p['offset'][i]+center[i]-p['pivot'][i]) for i in range(2)) < .001
        if name.startswith('splat'):
            assert np.array_equal(a[..., 0], a[..., 1]) and np.array_equal(a[..., 1], a[..., 2])
            assert g[..., 3].sum() > 0
            for tint in COLORS.values():
                frame = kit.layer(name, True, tint)
                assert frame.size == im.size
        if p['category'] == 'organic':
            assert g[..., 3].sum() > 0
        if p['category'] in ('terrain', 'lip', 'prop'):
            assert g[..., 3].sum() == 0
        records.append(dict(name=name, size=p['size'], seam=seam,
                            baseBytes=(out/p['file']).stat().st_size,
                            glowBytes=(out/p['glow']).stat().st_size))
    assert len(kit.manifest['anchors']) == 3
    for anchor in kit.manifest['anchors'].values():
        assert anchor['parent'] in kit.parts and anchor['position'] == [256, 256]
    Image.open(out/'preview.png').load()
    expected_pngs = {'preview.png'} | {p[k] for p in kit.parts.values() for k in ('file', 'glow')}
    assert {p.relative_to(out).as_posix() for p in out.rglob('*.png')} == expected_pngs
    total = sum(p.stat().st_size for p in out.rglob('*') if p.is_file())
    assert total < 1_500_000, f'Budget exceeded: {total}'
    result = dict(parts=len(records), rgbaPairs=len(records), productionBytes=total,
                  budgetBytes=1_500_000, exactPeriodicTiles=4, exactPeriodicStrips=2,
                  tintSamples=24, sourceTool='OpenAI image_gen.imagegen',
                  partsChecked=records)
    (HERE/'validation.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'partsChecked'}))


def inventory(root):
    files = sorted(p.relative_to(root).as_posix() for p in root.rglob('*')
                   if p.is_file() and p.relative_to(root).as_posix() not in ('FILES.txt', 'SHA256SUMS.txt')
                   and '__pycache__' not in p.parts)
    (root/'FILES.txt').write_text('\n'.join(sorted(files+['FILES.txt', 'SHA256SUMS.txt']))+'\n')
    (root/'SHA256SUMS.txt').write_text('\n'.join(
        hashlib.sha256((root/p).read_bytes()).hexdigest()+'  '+p for p in sorted(files+['FILES.txt']))+'\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=HERE/'export')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    if args.verify_only:
        validate(args.output)
        return
    export(args.output)
    render(args.output)
    if (HERE/'production-NOTES.md').exists():
        shutil.copyfile(HERE/'production-NOTES.md', args.output/'NOTES.md')
    inventory(args.output)
    validate(args.output)
    if args.output.resolve() != (HERE/'export').resolve():
        shutil.copytree(args.output, HERE/'export', dirs_exist_ok=True)
    inventory(HERE)


if __name__ == '__main__':
    main()
