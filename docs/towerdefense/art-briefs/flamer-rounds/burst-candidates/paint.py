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


class SlotFlame:
    """A travelling brush pattern sampled on rays opening from the duckbill."""

    period = 180.0

    def __init__(self):
        rng = np.random.default_rng(310)
        self.grains = [rng.normal(size=(64, n)) for n in (7, 14, 36, 76)]
        # Unevenly spaced eddies turn the arriving fuel back along the front.
        self.eddies = [(-.50, 17, -1), (-.34, 24, 1), (-.11, 19, 1),
                       (.06, 26, -1), (.27, 17, 1), (.45, 23, -1)]
        self.cinders = rng.uniform(size=(24, 4))

    def texture(self, scale, distance, across):
        paper = self.grains[scale]
        x = distance * paper.shape[1] / self.period
        return map_coordinates(paper, (across, x), order=3, mode='grid-wrap')

    def flame(self, frame, reach):
        phase = (frame % 12) / 12
        radius = np.hypot(X + 38, Y)
        distance = radius - 38
        along = distance - self.period * phase
        angle = np.arctan2(Y, X + 38)
        across = 95 * angle
        broad = self.texture(0, along, across / 14)
        broken = self.texture(1, along, across / 6 + .46 * broad)
        brush = self.texture(2, along, across / 3 + .32 * broken)
        tooth = self.texture(3, along, across / 1.8)
        spread = soft(X / 33)
        side = (.555 - abs(angle)) * radius + spread * (
            10 * np.tanh(broad) + 5 * np.tanh(broken) + 1.7 * brush)

        # Bend the leading isotherm around the centres of the rolling lobes.
        # All lengths here are in sprite pixels, including in the short poses.
        extent = 196 * reach
        front = extent - distance
        for i, (lane, size, handedness) in enumerate(self.eddies):
            pulse = TAU * phase + i * 2.4
            r = size * (.49 + .51 * reach)
            normal = distance - extent + .42 * r - 4 * np.sin(pulse) * reach
            tangent = (angle - lane - .022 * np.sin(pulse)) * (extent + 38)
            turn = (handedness * (2.22 + .78 * np.cos(pulse)) *
                    np.exp(-(normal ** 2 + tangent ** 2) / r ** 2))
            front += normal * (1 - np.cos(turn)) + tangent * np.sin(turn)
        front += spread * (6 * np.tanh(broad) + 4 * np.tanh(broken) + 1.3 * brush)
        edge = np.minimum(side, front)
        plume = soft((edge + 3) / (5 + 5 * spread))

        # A continuous fuel field splits and rejoins as it moves down the fan.
        # Shear broadens some tongues while peeling others into short wisps.
        shear = self.texture(0, along + 17 * broad, across / 13 + 23)
        fuel = self.texture(0, along + 5 * broken, across / 4.5 + .67 * shear)
        tongues = np.tanh(1.18 * fuel + .34 * broken + .21 * brush)
        throat_grain = self.texture(1, along, Y / 10 + .28 * broad)
        axis = np.exp(-(Y / (21 + .28 * X)) ** 2)
        core = axis * np.exp(-(X / 80) ** 1.53)
        core = np.clip(core * (1 + .14 * np.tanh(throat_grain)), 0, 1)
        depth = soft((edge + 1) / 22)
        rim = (np.exp(-((front - 6 - 1.2 * brush) / (4.7 + 2 * soft(broad))) ** 2)
               * soft((side + 2) / 14) * (.55 + .45 * soft(.55 + .46 * broken)))
        heat = (.19 + .19 * depth + .58 * core + .09 * axis +
                (.24 * tongues + .044 * brush) * (1 - .85 * core) +
                .043 * throat_grain * core + .015 * tooth + .52 * rim)
        stops = [0, .13, .26, .41, .55, .68, .80, .91, 1]
        colors = [[150, 22, 8], [214, 35, 5], [247, 55, 4], [255, 86, 4],
                  [255, 122, 6], [255, 164, 15], [255, 205, 44],
                  [255, 235, 116], [255, 250, 202]]
        rgb = np.stack([np.interp(heat, stops, c) for c in np.array(colors).T], -1)
        envelope = .27 + .18 * depth * (1 - .80 * soft(distance / 196)) + .51 * core
        coverage = envelope + .25 * tongues * (1 - core) + .21 * rim
        body = plume * np.clip(coverage, .045, .92)
        # Compose a warm emissive fringe, then return to straight alpha.
        halo = .13 * np.exp(-np.maximum(0, -edge / 6.0) ** 1.3)
        halo *= soft((224 - X) / 9)
        alpha = body + halo * (1 - body)
        light = np.array([255, 105, 8])
        rgb = (rgb * body[..., None] + light * (alpha - body)[..., None])
        for offset, lane, size, drift in self.cinders:
            age = (phase + offset) % 1
            ray = (lane - .5) * 1.23
            r = 38 + reach * (121 + 94 * age) + 4 * drift
            dx, dy = X + 38 - r * np.cos(ray), Y - r * np.sin(ray)
            fleck = np.hypot((dx * np.cos(ray) + dy * np.sin(ray)) / (2 + 3 * size),
                             (dy * np.cos(ray) - dx * np.sin(ray)) / (.65 + size))
            spark = .65 * soft(1.4 - fleck) * np.sin(np.pi * age) ** 2 * spread
            rgb = rgb * (1 - spark[..., None]) + np.array([255, 187, 56]) * spark[..., None]
            alpha += spark * (1 - alpha)
        rgb /= np.maximum(alpha[..., None], 1e-12)
        rgba = np.dstack((rgb, alpha * 255)).round().astype(np.uint8)
        rgba[rgba[..., 3] == 0] = 0
        return Image.fromarray(rgba)


class CopperRoller:
    def __init__(self):
        rng = np.random.default_rng(732)
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
            v = across + 9 * swirl
            billow = self.grain(u / 25 + seed, v / 15 + 7)
            fold = self.grain(u / 14 + .8 * swirl,
                              v / 10 + .85 * billow + seed)
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
    brush = SlotFlame() if name == 'a' else CopperRoller()
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
    render('a', 'A  /  GOLD JET')
    render('b', 'B  /  COPPER ROLLER')
