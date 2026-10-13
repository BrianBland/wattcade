"""Render delivered tower rigs as looping GIFs; no new generated art.

Run python animate.py alongside build.py. Uses export/ PNGs and manifests only.
"""
import math
import sys

sys.dont_write_bytecode = True

from PIL import Image, ImageDraw, ImageFont
from build import GROUND, HERE, render
import shutil

OUT = HERE / 'animations'
TOWERS = ('tesla', 'mortar', 'prism')
FONT = ImageFont.load_default(size=16)


def recoil(t):
    phase = t % 1.2
    return math.sin(math.pi * phase / 0.28) if phase < 0.28 else 0


def canvas(levels, angle, t, mode='attack'):
    image = Image.new('RGBA', (840, 55 + len(levels) * 260), GROUND)
    draw = ImageDraw.Draw(image)
    for col, tower in enumerate(TOWERS):
        x = 100 + col * 240
        draw.text((x + 80, 14), tower.upper(), font=FONT, fill='#e6daca')
        for row, level in enumerate(levels):
            y = 50 + row * 260
            if col == 0:
                draw.text((14, y + 65), f'L{level}', font=FONT, fill='#e6daca')
            phase_ms = (t % 1.2) * 1000
            state = 'attack' if mode == 'attack' and phase_ms < 640 else 'passive'
            time_ms = phase_ms if state == 'attack' else t * 1000
            pose, _ = render(HERE / 'export' / tower, level, angle if mode == 'attack' else 0,
                             recoil(t) if tower == 'mortar' and mode == 'attack' else 0,
                             state=state, time_ms=time_ms)
            image.alpha_composite(pose, (x, y))
    return image.convert('RGB')


def save(frames, name):
    # One palette for the entire loop avoids changing metallic colors each frame.
    samples = Image.new('RGB', (frames[0].width, sum(f.height for f in frames[::8])))
    y = 0
    for frame in frames[::8]:
        samples.paste(frame, (0, y))
        y += frame.height
    palette = samples.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    path = OUT / name
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=80,
                   loop=0, optimize=True, disposal=1)
    with Image.open(path) as gif:
        assert gif.n_frames > 1
        assert gif.info['loop'] == 0
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.load()
    print(f'{path}: {len(frames)} source frames, {path.stat().st_size:,} bytes')


def behavior(t):
    """Same-time L5 passive/attack comparison, with aiming only on Mortar."""
    image = Image.new('RGBA', (840, 610), GROUND)
    draw = ImageDraw.Draw(image)
    for row, mode in enumerate(('passive', 'attack')):
        y = row * 280
        frame = canvas((5,), 40 * math.sin(t * math.tau / 6), t, mode).convert('RGBA')
        image.alpha_composite(frame, (0, y + 20))
        draw.text((10, y + 115), mode.upper(), font=FONT, fill='#e6daca')
    return image.convert('RGB')


def main():
    OUT.mkdir(exist_ok=True)
    passive = [canvas((1, 3, 5), 0, i * 0.08, 'passive') for i in range(75)]
    save(passive, 'towers-passive.gif')
    attack = [canvas((1, 3, 5), 40 * math.sin(i * 0.08 * math.tau / 6), i * 0.08, 'attack') for i in range(75)]
    save(attack, 'towers-attack.gif')
    # Preserve previously shared URLs; their behavior now follows the corrected rig.
    shutil.copyfile(OUT / 'towers-attack.gif', OUT / 'towers-rotation.gif')
    save([behavior(i * 0.08) for i in range(75)], 'towers-behavior.gif')
    upgrades = [canvas((min(5, i // 12 + 1),), 30, i * 0.08, 'attack') for i in range(75)]
    save(upgrades, 'towers-upgrades.gif')


if __name__ == '__main__':
    main()
