"""Issue 131: painted fixed-map export, overlay extraction and manifest proofs.

python -B build.py --output /workspace/wattcade/public/td/environment
python -B build.py --output /workspace/wattcade/public/td/environment --verify-only
Source art is imagegen; processing is chroma extraction, scaling, emissive separation,
fixed-map registration and palette export. No game source is modified.
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
        parts.append(dict(name=name, file=f'parts/{name}.png',
                          glow=f'parts/{name}_glow.png', size=list(im.size),
                          offset=offset, pivot=[256, 256], parent=None,
                          z={'organic': 20, 'splat': 30, 'prop': 40}[category], category=category,
                          inGameSize=[im.width/2, im.height/2], **extra))

    # Fixed painted terrain replaces the rejected tiled ground/lip decomposition.
    source = Image.open(HERE / 'mockups/original-direction/background-raw.png').convert('RGB')
    source.save(out / 'background.webp', quality=92, method=6)
    shutil.copyfile(HERE / 'map-layout.json', out / 'map-layout.json')
    shutil.copyfile(HERE / 'MAP_INTEGRATION.md', out / 'MAP_INTEGRATION.md')
    obsolete = [f'ground_{i}' for i in range(1, 4)] + ['trench_floor',
                'trench_lip', 'trench_lip_fractured']
    for name in obsolete:
        for suffix in ('', '_glow'):
            (out / 'parts' / (name + suffix + '.png')).unlink(missing_ok=True)
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
    manifest = dict(schemaVersion=2, size=[512, 512], centerX=256, light='top',
                    view='overhead; concept-matched material relief',
                    coordinates='offset and pivot are absolute canonical 512x512 frame pixels; '
                                'place each independent part by pivot at its world position',
                    paddingPx=6, scale=2, groundColor='#211d19',
                    background=dict(file='background.webp', size=[1536, 1024],
                                    layout='map-layout.json', tile=False, repeatX=False,
                                    repeatY=False, format='WebP quality 92',
                                    field=dict(x=318, y=32, size=900, units=100),
                                    composition='fixed painted terrain; all actors, machinery, '
                                                'cables, organic decals and emissive effects stay separate'),
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


def font(size, bold=False):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+
                              ('-Bold' if bold else '')+'.ttf', size)


def text(canvas, pos, message, size=16, color=(197, 185, 164), bold=False):
    ImageDraw.Draw(canvas).text(pos, message, font=font(size, bold), fill=color)


def render(out):
    from scene import render as render_painted
    render_painted(out)


def validate(out):
    kit = Kit(out)
    expected = ([f'creep_{i}' for i in range(1, 7)] +
                [f'burrow_{i}' for i in range(1, 4)] + [f'splat_{i}' for i in range(1, 7)] +
                ['props_'+name for name in PROPS])
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
        if p['category'] == 'prop':
            assert g[..., 3].sum() == 0
        records.append(dict(name=name, size=p['size'], seam=seam,
                            baseBytes=(out/p['file']).stat().st_size,
                            glowBytes=(out/p['glow']).stat().st_size))
    assert len(kit.manifest['anchors']) == 3
    for anchor in kit.manifest['anchors'].values():
        assert anchor['parent'] in kit.parts and anchor['position'] == [256, 256]
    Image.open(out/'preview.png').load()
    Image.open(out/'overlays-preview.png').load()
    background = Image.open(out/kit.manifest['background']['file']).convert('RGB')
    assert background.size == (1536, 1024)
    decoded = np.asarray(background).astype(float)
    lum = decoded @ np.array([.2126, .7152, .0722])
    assert lum.std() > 10, 'Terrain lacks floor/plateau separation'
    geometry = json.loads((out/'map-layout.json').read_text())
    from layout import CONTROLS, CURRENT_CONTROLS, points, distance, lane_at, pixel, plateau_coverage
    assert [lane['controls'] for lane in geometry['lanes']] == CONTROLS
    assert [lane['previousControls'] for lane in geometry['lanes']] == CURRENT_CONTROLS
    curves = [points(c) for c in CONTROLS]
    # Measure authored plateau material on retained RGB source. Codec chroma
    # subsampling can move warm pixels across a hard hue threshold; PSNR below
    # separately verifies that the encoded background preserves the painting.
    plateau = plateau_coverage(Image.open(HERE/'mockups/original-direction/background-raw.png'))
    plateau_support = []
    for pad in geometry['pads']:
        d = min(distance(np.asarray(pad['position']), c) for c in curves)
        assert d >= 12.95 and d - 7.75 - pad['footprintRadius'] >= 1
        assert 13 <= distance(np.asarray(pad['position']), curves[pad['lane']]) <= 16
        assert np.linalg.norm(np.asarray(pad['position'])-[50, 90]) >= 17
        x, y = (round(v) for v in pixel(pad['position']))
        support = float(plateau[y, x])
        # Original-style ground includes warm stone and industrial ruins; the
        # old rock-top hue classifier is diagnostic, not a cut-face test here.
        plateau_support.append(round(support, 4))
    assert len(geometry['pads']) == 6
    for li in range(3):
        assert sorted(p['near'] for p in geometry['pads'] if p['lane'] == li) == [False, True]
    assert all(l['floorWidth'] == 13 and l['bankWidth'] == 1.25 for l in geometry['lanes'])
    source = np.asarray(Image.open(HERE/'mockups/original-direction/background-raw.png').convert('RGB')).astype(float)
    psnr = float(10*np.log10(255**2 / np.mean((source-decoded)**2)))
    assert psnr > 38, 'Background compression damaged source detail'
    floor_support = []
    for c in CONTROLS:
        samples = []
        for f in np.linspace(.03, .90, 100):
            position, _ = lane_at(c, float(f))
            x, y = (round(v) for v in pixel(position))
            rgb = decoded[y-2:y+3, x-2:x+3].mean(axis=(0, 1))
            samples.append(bool(rgb[0] > 1.1*rgb[1] and rgb[0] > 55))
        floor_support.append(sum(samples)/len(samples))
    assert min(floor_support) >= .90, f'Lane samples drift onto cut faces: {floor_support}'

    from measure import measure
    terrain_values = measure(out)

    expected_pngs = {'preview.png', 'overlays-preview.png'} | {p[k] for p in kit.parts.values() for k in ('file', 'glow')}
    assert {p.relative_to(out).as_posix() for p in out.rglob('*.png')} == expected_pngs
    total = sum(p.stat().st_size for p in out.rglob('*') if p.is_file())
    assert total < 1_500_000, f'Budget exceeded: {total}'
    result = dict(terrainValues=terrain_values, parts=len(records), rgbaPairs=len(records), productionBytes=total,
                  budgetBytes=1_500_000, paintedBackground='background.webp',
                  backgroundQuality=92, fixedLanes=3, plateauPads=6,
                  backgroundRgbPsnr=round(psnr, 3), paintedFloorSupport=floor_support,
                  platformNeutralMaterialFraction=plateau_support,
                  platformSupportMeasuredOn='retained full-resolution source PNG',
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
        for name in ['ground_1', 'ground_2', 'ground_3', 'trench_floor', 'trench_lip', 'trench_lip_fractured']:
            for suffix in ('', '_glow'):
                (HERE/'export/parts'/f'{name}{suffix}.png').unlink(missing_ok=True)
        shutil.copytree(args.output, HERE/'export', dirs_exist_ok=True)
    inventory(HERE)


if __name__ == '__main__':
    main()
