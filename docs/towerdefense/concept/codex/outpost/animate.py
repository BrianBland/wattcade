"""Scripted production-manifest previews; no new or replacement artwork.

python -B animate.py --assets export
"""
import argparse
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from build import render, label, HERE, HUB, GROUND, LANCZOS, matrices

def gif(path, frames, duration):
    # Shared palette avoids background/metal flicker between generated phases.
    sample = Image.new('RGB', (frames[0].width, frames[0].height * 6))
    for i in range(6):
        sample.paste(frames[i * len(frames) // 6].convert('RGB'), (0, i*frames[0].height))
    palette = sample.quantize(255)
    indexed = [f.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=duration,
                    loop=0, disposal=2, optimize=False)
    with Image.open(path) as check:
        assert check.n_frames == len(frames)
        assert check.info['loop'] == 0
        for i in range(check.n_frames):
            check.seek(i); check.load()

def main(out):
    dest = HERE / 'animations'; dest.mkdir(exist_ok=True)
    frames = []
    for i in range(60):
        t = i/20
        page = Image.new('RGBA', (1110, 485), GROUND)
        d = ImageDraw.Draw(page)
        label(d, (24, 18), 'DYNAMO  /  LIVE MECHANICAL STATES', 23, '#eee1c5')
        for col, weapon in enumerate(('gatling', 'flamer', 'rail')):
            angle = 60 * math.sin(t * 2*math.pi/3)
            im = render(out, weapon=weapon, angle=angle, wheel_angle=t*90,
                        charge=(i//5)%4, spin_frame=i%6)
            page.alpha_composite(im.resize((355, 355), LANCZOS), (col*370+7, 70))
            label(d, (col*370+21, 50), weapon.upper(), 17)
        label(d, (24, 443), 'Independent wheel spin  ·  ±60° aim  ·  Axial barrel roll  ·  Sequential rail charge', 14)
        frames.append(page)
    gif(dest / 'outpost-mechanics.gif', frames, 50)
    frames = []
    for i in range(24):
        phase = i%6
        page = Image.new('RGBA', (650, 610), GROUND)
        d = ImageDraw.Draw(page)
        label(d, (22, 20), 'GATLING  /  AXIAL BARREL ROLL', 24, '#eee1c5')
        im = render(out, weapon='gatling', spin_frame=phase, wheel_angle=i*4.5)
        page.alpha_composite(im, (0, 75))
        detail = im.crop((225, 65, 267, 182))
        page.alpha_composite(detail.resize((105, 292), LANCZOS), (533, 126))
        label(d, (527, 438), 'Detail 2.5×', 13)
        frames.append(page)
    gif(dest / 'gatling-roll.gif', frames, 50)
    # A close inspection of the fully dark base confirms emission is optional.
    dark = Image.new('RGBA', (1560, 610), GROUND)
    dd = ImageDraw.Draw(dark)
    for i, weapon in enumerate(('gatling', 'flamer', 'rail')):
        dark.alpha_composite(render(out, weapon=weapon, glow=False, charge=0), (i*520, 70))
        label(dd, (i*520+24, 24), weapon.upper() + '  /  GLOW OFF', 22, '#eee1c5')
    dark.convert('RGB').save(HERE / 'glow-off.png', optimize=True)
    reference = Image.open(HERE / 'reference-towers.png').convert('RGBA').crop((472, 226, 1093, 791))
    comparison = Image.new('RGBA', (1210, 690), GROUND)
    cd = ImageDraw.Draw(comparison)
    label(cd, (24, 24), 'APPROVED CONCEPT', 22, '#eee1c5')
    label(cd, (650, 24), 'EXPORTED CUTOUT ASSEMBLY', 22, '#eee1c5')
    comparison.alpha_composite(reference.resize((605, 550), LANCZOS), (0, 80))
    comparison.alpha_composite(render(out).resize((570, 570), LANCZOS), (624, 65))
    comparison.convert('RGB').save(HERE / 'comparison.png', optimize=True)
    # Socket/muzzle registration overlay, useful without opening build.py.
    m = json.loads((out / 'manifest.json').read_text())
    page = Image.new('RGBA', (1560, 610), GROUND)
    d = ImageDraw.Draw(page)
    for i, angle in enumerate((-60, 0, 60)):
        page.alpha_composite(render(out, weapon='flamer', angle=angle), (i*520, 70))
        label(d, (i*520+24, 24), f'RIG / {angle:+d}°', 22, '#eee1c5')
        mats = matrices(m, angle, 30)
        for name, anchor in m['anchors'].items():
            if not name.startswith('cable_') and name != 'muzzle_flamer': continue
            v = mats[anchor['parent']] @ np.array([*anchor['position'], 1])
            x, y = v[0]+i*520, v[1]+70
            d.ellipse((x-4, y-4, x+4, y+4), fill='#59e0ed')
            label(d, (x+6, y-6), name.replace('cable_', 'C'), 12, '#59e0ed')
        hx, hy = HUB[0]+i*520, HUB[1]+70
        d.line((hx-12, hy, hx+12, hy), fill='#f2cd74', width=2)
        d.line((hx, hy-12, hx, hy+12), fill='#f2cd74', width=2)
        x,y,w,h = m['anchors']['cab_window']['rect']
        d.rectangle((x+i*520, y+70, x+w+i*520, y+h+70), outline='#59e0ed', width=1)
    page.convert('RGB').save(HERE / 'rig-check.png', optimize=True)
    print('Rendered and decoded two looping manifest animations plus comparison/rig/glow-off proofs.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', type=Path, required=True)
    main(parser.parse_args().assets.resolve())
