"""Render delivered tower rigs as looping GIFs; no new generated art.

Run python animate.py alongside build.py. Uses export/ PNGs and manifests only.
"""
import math
import sys

sys.dont_write_bytecode = True

from PIL import Image, ImageDraw, ImageFont
from build import GROUND, HERE, render

OUT = HERE / 'animations'
TOWERS = ('tesla', 'mortar', 'prism')
FONT = ImageFont.load_default(size=16)


def recoil(t):
    phase = t % 1.2
    return math.sin(math.pi * phase / 0.28) if phase < 0.28 else 0


def canvas(levels, angle, t):
    image = Image.new('RGBA', (650, 55 + len(levels) * 190), GROUND)
    draw = ImageDraw.Draw(image)
    for col, tower in enumerate(TOWERS):
        x = 72 + col * 190
        draw.text((x + 35, 14), tower.upper(), font=FONT, fill='#e6daca')
        for row, level in enumerate(levels):
            y = 50 + row * 190
            if col == 0:
                draw.text((14, y + 65), f'L{level}', font=FONT, fill='#e6daca')
            pose, _ = render(HERE / 'export' / tower, level, angle, recoil(t) if tower == 'mortar' else 0)
            image.alpha_composite(pose, (x, y))
    return image.convert('RGB')


def save(frames, name):
    # One palette for the entire loop avoids changing metallic colors each frame.
    samples = Image.new('RGB', (650, sum(f.height for f in frames[::8])))
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
    print(f'{path}: {len(frames)} frames, {path.stat().st_size:,} bytes')


def main():
    OUT.mkdir(exist_ok=True)
    rotation = [canvas((1, 3, 5), i * 360 / 75, i * 0.08) for i in range(75)]
    save(rotation, 'towers-rotation.gif')
    upgrades = [canvas((min(5, i // 12 + 1),), 45, i * 0.08) for i in range(75)]
    save(upgrades, 'towers-upgrades.gif')


if __name__ == '__main__':
    main()
