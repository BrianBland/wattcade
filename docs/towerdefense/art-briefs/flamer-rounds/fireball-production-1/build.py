"""Export the approved generated fireball concept without repainting its pixels.

Run from any directory: python -B path/to/this/build.py
Only the approved head, its emission, manifest metadata/anchor, inventory and preview change.
"""
from pathlib import Path
import hashlib
import json
import math
import os
from io import BytesIO
import subprocess

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[4]
KIT = ROOT / 'public/td/outpost'
BASELINE = 'e028ed3'
SOURCE = OUT / 'source/head.png'
REVIEW = Path(os.environ.get('TD_ART_REVIEW_OUT', '/tmp/wattcade-td-art/fireball'))
REVIEW.mkdir(parents=True, exist_ok=True)
BACKGROUND = (33, 29, 25, 255)


def emission(frame):
    """Emission is restricted to the existing hot ember inside the nozzle mouth."""
    pixels = np.asarray(frame).astype(float)
    y, x = np.indices(pixels.shape[:2])
    distance = np.sqrt(((x - 260) / 22) ** 2 + ((y - 148) / 22) ** 2)
    mask = np.clip((1 - distance) / 0.18, 0, 1)
    mask *= np.clip((pixels[:, :, 0] - 80) / 110, 0, 1)
    pixels[:, :, 3] *= mask
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels.astype('uint8'))


def render(weapon, angle=0, glow=0):
    manifest = json.loads((KIT / 'manifest.json').read_text())
    result = Image.new('RGBA', tuple(manifest['size']))
    mask_applied = False
    for part in sorted(manifest['parts'], key=lambda p: p['z']):
        if part['z'] >= 44 and not mask_applied:
            mask = Image.open(KIT / 'masks/cab_window.png').getchannel('A')
            result.putalpha(ImageChops.subtract(result.getchannel('A'), mask))
            mask_applied = True
        if part.get('weapon') and part['weapon'] != weapon:
            continue
        if part.get('minCharge') or part.get('damageStage') or part.get('emissiveOnly'):
            continue
        layer = Image.new('RGBA', result.size)
        layer.alpha_composite(Image.open(KIT / part['file']).convert('RGBA'), tuple(part['offset']))
        if part.get('weapon'):
            layer = layer.rotate(-angle, Image.Resampling.BICUBIC, center=(260, 260))
        result.alpha_composite(layer)
        if glow and part['name'] == 'head_flamer':
            light = Image.new('RGBA', result.size)
            light.alpha_composite(Image.open(KIT / part['glow']), tuple(part['offset']))
            light = light.rotate(-angle, Image.Resampling.BICUBIC, center=(260, 260))
            rgba = np.asarray(light).astype(float)
            addition = rgba[:, :, :3] * rgba[:, :, 3:4] / 255 * glow
            base = np.asarray(result).copy()
            base[:, :, :3] = np.clip(base[:, :, :3] + addition, 0, 255).astype('uint8')
            result = Image.fromarray(base)
    return result


def previews():
    # Preserve all fifteen non-fireball proofs and all surrounding review pixels.
    # Only the three fireball cells are rebuilt from the updated production manifest.
    original = Image.open(BytesIO(subprocess.check_output(['git', 'show', f'{BASELINE}:public/td/outpost/preview.png'], cwd=ROOT)))
    patch = Image.new('RGBA', (1000, 319), BACKGROUND)
    draw = ImageDraw.Draw(patch)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
    for column, angle in enumerate([0, -60, 60]):
        x = 25 + 325 * column
        draw.text((x + 2, 14), f'FIREBALL / {angle:+}°', font=font, fill='#cabb9e')
        patch.alpha_composite(render('flamer', angle).resize((260, 260), Image.Resampling.LANCZOS), (x + 20, 54))
    # The existing indexed palette preserves every pixel in the other fifteen cells
    # and keeps the shipped kit within its original size budget.
    indexed = patch.convert('RGB').quantize(palette=original, dither=Image.Dither.NONE)
    preview = original.copy()
    preview.paste(indexed, (0, 431))
    preview.save(KIT / 'preview.png', optimize=True)
    a = np.asarray(original.convert('RGB'))
    b = np.asarray(preview.convert('RGB'))
    assert np.array_equal(a[:431], b[:431]) and np.array_equal(a[750:], b[750:])

    proof = Image.new('RGBA', (1000, 760), BACKGROUND)
    draw = ImageDraw.Draw(proof)
    draw.text((24, 16), 'APPROVED FIREBALL / production pixels, real deck / 220px deck', font=font, fill='#ecdfc8')
    for row, glow in enumerate([0, 0.6]):
        for column, angle in enumerate([0, -60, 60]):
            x, y = 25 + column * 325, 60 + row * 345
            draw.text((x, y), f'{angle:+}° / emission {"ON" if glow else "OFF"}', font=font, fill='#cabb9e')
            proof.alpha_composite(render('flamer', angle, glow).resize((260, 260), Image.Resampling.LANCZOS), (x + 20, y + 35))
            theta = math.radians(angle)
            # Muzzle at [260,148] in the 520-frame, relative to its fixed aim pivot.
            px = x + 20 + (260 + math.sin(theta) * 112) / 2
            py = y + 35 + (260 - math.cos(theta) * 112) / 2
            draw.ellipse((px - 3, py - 3, px + 3, py + 3), outline='#65ffff', width=1)
    proof.convert('RGB').save(REVIEW / 'production-proof.png', optimize=True)


def validate(crop, part):
    base = Image.open(KIT / part['file']).convert('RGBA')
    glow = Image.open(KIT / part['glow']).convert('RGBA')
    assert base.size == glow.size
    bbox = base.getbbox()
    assert bbox[0] >= 4 and bbox[1] >= 4 and base.width - bbox[2] >= 4 and base.height - bbox[3] >= 4
    assert np.array_equal(np.asarray(base), np.asarray(Image.open(SOURCE).convert('RGBA').crop(crop)))
    glow_frame = Image.new('RGBA', (520, 520))
    glow_frame.alpha_composite(glow, tuple(part['offset']))
    assert glow_frame.getbbox()[0] >= 238 and glow_frame.getbbox()[2] <= 283

    poses = 0
    for angle in range(0, 360, 3):
        frame = Image.new('RGBA', (520, 520))
        frame.alpha_composite(base, tuple(part['offset']))
        frame = frame.rotate(-angle, Image.Resampling.BICUBIC, center=(260, 260))
        b = frame.getbbox()
        assert min(b[0], b[1], 520 - b[2], 520 - b[3]) >= 4
        light = glow_frame.rotate(-angle, Image.Resampling.BICUBIC, center=(260, 260))
        for strength in [0, 0.2, 0.4, 0.6]:
            scaled = light.copy()
            scaled.putalpha(light.getchannel('A').point(lambda a: round(a * strength)))
            bounds = Image.alpha_composite(frame, scaled).getbbox()
            assert min(bounds[0], bounds[1], 520 - bounds[2], 520 - bounds[3]) >= 4
            assert math.isclose(math.hypot(math.sin(math.radians(angle)) * 112, math.cos(math.radians(angle)) * 112), 112)
            poses += 1

    before = json.loads(subprocess.check_output(['git', 'show', f'{BASELINE}:public/td/outpost/manifest.json'], cwd=ROOT))
    after = json.loads((KIT / 'manifest.json').read_text())
    assert [p for p in before['parts'] if p['name'] != 'head_flamer'] == [p for p in after['parts'] if p['name'] != 'head_flamer']
    assert {k: v for k, v in before['anchors'].items() if k != 'muzzle_flamer'} == {k: v for k, v in after['anchors'].items() if k != 'muzzle_flamer'}
    assert after['anchors']['muzzle_flamer'] == {'parent': 'head_flamer', 'position': [260, 148]}

    allowed = {'manifest.json', 'parts/head_flamer.png', 'parts/head_flamer_glow.png', 'preview.png', 'FILES.txt', 'NOTES.md', 'SHA256SUMS.txt'}
    unchanged = []
    for path in KIT.rglob('*'):
        if not path.is_file() or path.relative_to(KIT).as_posix() in allowed:
            continue
        relative = path.relative_to(ROOT).as_posix()
        original = subprocess.check_output(['git', 'show', f'{BASELINE}:{relative}'], cwd=ROOT)
        assert path.read_bytes() == original, relative
        unchanged.append(path.relative_to(KIT).as_posix())

    files = sorted(p.relative_to(KIT).as_posix() for p in KIT.rglob('*') if p.is_file())
    if 'SHA256SUMS.txt' not in files:
        files.append('SHA256SUMS.txt')
        files.sort()
    (KIT / 'FILES.txt').write_text('\n'.join(files) + '\n')
    (KIT / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256((KIT / name).read_bytes()).hexdigest() + '  ' + name + '\n' for name in files if name != 'SHA256SUMS.txt'))
    total = sum(p.stat().st_size for p in KIT.rglob('*') if p.is_file())
    assert total < 1_500_000, total
    report = {'source': SOURCE.relative_to(ROOT).as_posix(), 'sourcePixelsUnchanged': True, 'partSize': base.size,
              'offset': part['offset'], 'pivot': part['pivot'], 'muzzle': [260, 148], 'posesChecked': poses,
              'unchangedProductionFiles': unchanged, 'otherPreviewPixelsUnchanged': True, 'productionBytes': total}
    (OUT / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'unchangedProductionFiles'}))


def main():
    source = Image.open(SOURCE).convert('RGBA')
    x0, y0, x1, y1 = source.getbbox()
    crop = (x0 - 4, y0 - 4, x1 + 4, y1 + 4)
    source.crop(crop).save(KIT / 'parts/head_flamer.png', optimize=True)
    emission(source).crop(crop).save(KIT / 'parts/head_flamer_glow.png', optimize=True)
    manifest = json.loads((KIT / 'manifest.json').read_text())
    part = next(p for p in manifest['parts'] if p['name'] == 'head_flamer')
    part['offset'] = [crop[0], crop[1]]
    part['registration'] = {'scale': [1, 1], 'origin': part['offset'], 'sourcePivot': [260 - crop[0], 260 - crop[1]],
                            'registeredPivot': [260, 260], 'source': SOURCE.relative_to(ROOT).as_posix()}
    manifest['anchors']['muzzle_flamer'] = {'parent': 'head_flamer', 'position': [260, 148]}
    (KIT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    previews()
    validate(crop, part)


if __name__ == '__main__':
    main()
