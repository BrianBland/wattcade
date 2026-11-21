"""Render the two duckbill burst studies. Requires Pillow, NumPy and SciPy."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 224, 300
Y, X = np.mgrid[:H, :W].astype(float)
Y -= 149.5
TAU = 2 * np.pi


def soft(x):
    t = np.clip(x, 0, 1)
    return t * t * (3 - 2 * t)


class Paint:
    def __init__(self, folded):
        self.folded = folded
        rng = np.random.default_rng(309 if folded else 732)
        self.paper = rng.normal(0, 1, (96, 96))
        self.sparks = rng.uniform(size=(32, 5))

    def grain(self, x, y):
        return map_coordinates(self.paper, (y, x), order=3, mode="grid-wrap")

    def flame(self, frame, reach):
        # Lengthen the fan in polar space so its short poses still span the slot.
        phase = frame / 12
        radius = np.hypot(X + 37, Y)
        angle = np.arctan2(Y, X + 37)
        dist = radius - 37
        extent = 196 * reach
        # Every moving noise coordinate advances one full tile per loop.
        # Crossfade two translating fields halfway out of phase. The entering
        # field has zero weight at its reset, including across frame eleven.
        curl_fields = []
        for shift in (0, .5):
            age = (phase + shift) % 1
            weight = np.sin(np.pi * age) ** 2
            flow = dist - 70 * age
            across = Y / (1 + .004 * X)
            seed = 30 * shift
            swirl = self.grain(flow / 32 + seed, across / 23 + 5)
            twist = self.grain(flow / 29 + 17, across / 19 + seed)
            u = flow + 10 * twist
            v = across + (5 if self.folded else 9) * swirl
            billow = self.grain(u / 25 + seed, v / 15 + 7)
            fold = self.grain(u / (25 if self.folded else 14) + .8 * swirl,
                              v / (6 if self.folded else 10) + .85 * billow + seed)
            brush = self.grain(u / 10 + .65 * fold, v / 3.6 + .7 * fold)
            fine = self.grain(u / 4 + .7 * brush, v / 2 + .45 * fold)
            curl_fields.append(weight * np.array([billow, fold, brush, fine]))
        broad, large, medium, fine = sum(curl_fields)
        grit = self.grain(60 + X / 2.3 + .45 * np.cos(TAU * phase),
                          Y / 1.6 + .45 * np.sin(TAU * phase))
        growth = soft(X / 65)
        side = (0.56 - abs(angle)) * radius
        tip = extent - dist
        # Different scales along and across the fan stretch its outer tongues.
        edge = np.minimum(side + growth * (6 * large + 2.5 * medium),
                          tip + growth * (9 * np.tanh(broad) + 8 * np.tanh(large) + 4 * medium))
        edge += growth * (1.4 * fine + .55 * grit)
        alpha = soft((edge + 3) / 5)
        depth = np.clip(edge / (23 + .07 * dist), 0, 1)
        curl = large + .42 * medium
        vein = np.exp(-((curl - .12) / .30) ** 2)
        heat = (.22 + .40 * depth - .17 * dist / max(extent, 1) +
                .16 * np.tanh(large) + .085 * medium + .047 * fine +
                .022 * grit + .17 * vein + .19 * np.exp(-X / 48))
        if not self.folded:
            heat += .17 * np.exp(-((np.abs(curl) - .83) / .25) ** 2) - .095
        stops = [0, .14, .30, .45, .61, .76, .90, 1]
        colors = [[66, 23, 19], [124, 35, 18], [190, 49, 12], [235, 80, 11],
                  [252, 131, 17], [255, 189, 44], [255, 224, 109], [255, 247, 189]]
        rgb = np.stack([np.interp(heat, stops, c) for c in np.array(colors).T], -1)
        # Detached slivers coast through the outer fringe and fade at wraparound.
        for offset, spread, velocity, size, skew in self.sparks:
            age = (phase + offset) % 1
            theta = (spread - .5) * 1.21
            r = extent * (.84 + .18 * age) + 37 + 15 * velocity
            dx = X - (r * np.cos(theta) - 37)
            dy = Y - r * np.sin(theta)
            along = dx * np.cos(theta) + dy * np.sin(theta)
            across = dy * np.cos(theta) - dx * np.sin(theta) - .08 * skew * along
            fleck = soft(1.5 - np.hypot(along / (2 + 4 * size), across / (.7 + size)))
            fleck *= np.sin(np.pi * age) ** 2 * growth
            visible = fleck > alpha
            rgb[visible] = [249, 116 + 65 * velocity, 28]
            alpha = np.maximum(alpha, fleck)
        rgba = np.dstack((rgb, 255 * alpha)).round().astype(np.uint8)
        rgba[rgba[:, :, 3] == 0] = 0
        return Image.fromarray(rgba)


def render(name, title):
    brush = Paint(name == 'a')
    folder = ROOT / name
    sheet = Image.new('RGB', (W * 6, (H + 24) * 4 + 42), '#242628')
    labels = ImageDraw.Draw(sheet)
    labels.text((12, 14), title, fill='#f3dfbe')
    poses = [('start', [0.06, .20, .41, .64, .85, .96], -6),
             ('sustain', [1] * 12, 0),
             ('end', [.94, .79, .59, .38, .19, .04], 4)]
    cell = 0
    for state, reaches, offset in poses:
        for i, reach in enumerate(reaches):
            im = brush.flame(i + offset, reach)
            label = f'{state}_{i:02d}'
            im.save(folder / (label + '.png'))
            x, y = cell % 6 * W, cell // 6 * (H + 24) + 42
            sheet.paste(im, (x, y), im)
            labels.text((x + 10, y + H), label, fill='#bdbab5')
            cell += 1
    sheet.save(folder / 'sheet.png')


if __name__ == '__main__':
    render('a', 'A  /  GOLD FOLDS')
    render('b', 'B  /  COPPER ROLLER')
