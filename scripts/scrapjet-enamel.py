"""Rebuild Scrapjet's shared UV atlas using Pillow, NumPy and DejaVu Sans Bold.

The tile order matches render/salvage.ts. Coordinates in painted_panel are
source pixels in upper-left, lower-left, lower-right, upper-right order.
"""

import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

assets = Path(__file__).resolve().parents[1] / 'public' / 'scrapjet'
size = 256
atlas = Image.new('RGB', (4 * size, 4 * size))
palette = {
    'steel': '#6d6661',
    'red': '#b14c35',
    'bone': '#d3c2a0',
    'ochre': '#d69742',
    'glass': '#385860',
    'tyre': '#352e31',
    'vents': '#4b4346',
    'blade': '#b0a496',
    'hazard': '#d79641',
    'roundel': '#8c4536',
    'yard_sign': '#3d6466',
    'light': '#ffce83',
    'teal': '#588080',
    'livery': '#a8573f',
    'roofing': '#8f7862',
    'rust': '#66473d',
}

for tile, (name, base_color) in enumerate(palette.items()):
    rng = random.Random(57 + tile)
    noise_rng = np.random.default_rng(82 + tile)
    paint = Image.new('RGB', (size, size), base_color)
    brush = ImageDraw.Draw(paint)

    rect = brush.rectangle
    line = brush.line

    def label(x, y, text, font_size, color):
        brush.text((x, y), text, font=ImageFont.truetype('DejaVuSans-Bold.ttf', font_size), fill=color, anchor='mm', stroke_width=0)

    if name == 'glass':
        for j in range(-220, 320, 27):
            brush.polygon([(j, 256), (j + 19, 256), (j + 188, 0), (j + 179, 0)], fill=rng.choice(['#547476', '#45616b', '#819093']))
    if name == 'tyre':
        for i in range(-32, 290, 12):
            line([(0, i), (128, i + 18), (256, i)], '#211f24', 3)
    if name == 'vents':
        for i in range(13, 250, 20):
            rect((7, i, 249, i + 8), '#2b292b')
            line([(9, i + 9), (246, i + 9)], '#877463', 2)
    if name == 'blade':
        for i in range(45):
            x = rng.randint(5, 240)
            line([(x, 0), (x + rng.randrange(-8, 9), 256)], '#c6b8a6', 1)
    if name == 'hazard':
        for i in range(-256, 256, 87):
            brush.polygon([(i, 256), (i + 42, 256), (i + 248, 0), (i + 206, 0)], fill='#534744')
    if name == 'roundel':
        brush.polygon([(8, 223), (58, 22), (248, 19), (195, 224)], fill='#c1ae86')
        label(128, 118, '76', 101, '#3b3d40')
        line([(47, 182), (191, 182)], '#a04d38', 6)
    if name == 'yard_sign':
        rect((6, 7, 249, 246), '#beb69a')
        rect((11, 12, 244, 241), '#315052')
        label(127, 65, 'YARD', 48, '#dfc59e')
        label(128, 150, '09', 107, '#efcc88')
        line([(28, 211), (225, 211)], '#b76b45', 5)
    if name == 'light':
        for radius in range(150, 0, -1):
            scale = (150 - radius) / 150
            brush.ellipse((128 - radius, 128 - radius, 128 + radius, 128 + radius), fill=(int(210 + 45 * scale), int(146 + 103 * scale), int(62 + 149 * scale)))
        for i in range(14, 248, 12):
            line([(i, 13), (i, 243)], '#d7af7c')
    if name == 'livery':
        for i, color, width in [(119, '#d8bc90', 40), (145, '#50423e', 8)]:
            line([(-10, i + 30), (57, i + 30), (90, i), (256, i)], color, width)
    if name == 'roofing':
        for i in range(0, 256, 22):
            rect((i, 0, i + 5, 255), '#5a5554')
            line([(i + 6, 0), (i + 6, 256)], '#ae9582', 2)
    if name not in ('glass', 'tyre', 'vents', 'blade', 'light'):
        for y in [4, 250]:
            line([(3, y), (252, y)], '#4c3c36', 2)
            for x in [9, 42, 213, 246]:
                brush.ellipse((x - 2, y - 2, x + 2, y + 2), fill='#392e2d')
                brush.point((x - 1, y - 1), fill='#ddbc97')
        for j in range(130):
            x = rng.randrange(size)
            y = rng.randrange(size)
            dx = rng.randrange(1, 20)
            line([(x, y), (x + dx, y + rng.choice([-3, -1, 0, 1]))], rng.choice(['#68564b', '#a68a6e', '#c1a88e']))

    def field(scale):
        pixels = noise_rng.uniform(0, 255, (scale, scale)).astype(np.uint8)
        layer = Image.fromarray(pixels).resize((size, size), Image.Resampling.BICUBIC)
        return np.asarray(layer).astype(float) / 255.0

    # Chips cluster along plate seams; smaller variations supply the grit.
    broad = field(9)
    mid = field(35)
    fine = noise_rng.random((size, size))
    y, x = np.mgrid[:size, :size]
    edge = np.minimum.reduce([x, y, 255 - x, 255 - y])
    mask = broad * 0.52 + mid * 0.33 + fine * 0.15 + 0.15 * np.exp(-edge / 9)
    rgb = np.asarray(paint).astype(float)
    if name not in ('glass', 'tyre', 'blade', 'light'):
        rust = np.stack([70 + 66 * mid, 46 + 36 * mid, 41 + 20 * mid], axis=-1)
        rgb = np.where((mask > 0.72)[:, :, None], rust, rgb)
        rgb = np.where(((mask > 0.7) & (mask <= 0.72))[:, :, None], rgb * 0.68 + 26, rgb)
    modulation = (broad - 0.5) * 0.3 + (mid - 0.5) * 0.13 + (fine - 0.5) * 0.12
    paint = Image.fromarray(np.uint8(np.clip(rgb * (1 + modulation[:, :, None]), 0, 255)))
    atlas.paste(paint, (tile % 4 * size, tile // 4 * size))

# Project matching panels from the original paintings into the atlas.
paintings = [Image.open(assets / f'yard-{i}.webp').convert('RGB') for i in range(3)]

def painted_panel(tile, reference, corners, strength):
    col, row = (tile % 4, tile // 4)
    pos = (col * size, row * size)
    base = atlas.crop((pos[0], pos[1], pos[0] + size, pos[1] + size))
    panel = paintings[reference].transform((size, size), Image.Transform.QUAD, corners, Image.Resampling.BICUBIC)
    atlas.paste(Image.blend(base, panel, strength), pos)

painted_panel(0, 2, (276, 321, 273, 398, 293, 398, 298, 317), 0.53)
painted_panel(1, 1, (204, 266, 201, 335, 261, 316, 268, 238), 0.72)
painted_panel(2, 1, (249, 218, 236, 263, 285, 236, 307, 191), 0.64)
painted_panel(3, 0, (108, 402, 82, 420, 178, 408, 207, 390), 0.66)
painted_panel(4, 2, (114, 155, 130, 204, 188, 186, 174, 135), 0.62)
painted_panel(7, 1, (375, 175, 364, 272, 382, 262, 400, 170), 0.5)
painted_panel(8, 2, (246, 236, 236, 340, 275, 337, 284, 238), 0.7)
painted_panel(12, 2, (219, 137, 224, 178, 264, 187, 274, 154), 0.65)
painted_panel(13, 0, (148, 254, 128, 283, 387, 242, 383, 211), 0.91)
painted_panel(15, 1, (79, 346, 60, 398, 121, 388, 140, 316), 0.67)
atlas.save(assets / 'salvage-enamel.webp', quality=88, method=6)
