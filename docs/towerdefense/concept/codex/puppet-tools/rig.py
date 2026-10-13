"""Assemble only the PNGs and manifest; render genuine hierarchical joint tests.

Run: python render.py
Requires Pillow, NumPy, SciPy. No generated pose images are used.
"""
from pathlib import Path
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
OUTPUT_ROOT = ROOT.parent
GROUND = (33, 29, 25, 255)


def clean_resample(image):
    """Clamp matte-channel overshoots introduced by affine/Lanczos resampling."""
    box = image.getbbox()
    if box is None:
        return image
    arr = np.array(image.crop(box))
    maximum = np.maximum(arr[..., 0], arr[..., 2]).astype(int)
    arr[..., 1] = np.minimum(arr[..., 1].astype(int), np.minimum(maximum + 3, 255))
    arr[arr[..., 3] < 2] = 0
    image.paste(Image.fromarray(arr, 'RGBA'), box[:2])
    return image


def translation(x, y):
    return np.array([[1., 0., x], [0., 1., y], [0., 0., 1.]])


def rotation(degrees):
    a = math.radians(degrees)
    return np.array([[math.cos(a), -math.sin(a), 0.],
                     [math.sin(a), math.cos(a), 0.], [0., 0., 1.]])


class Puppet:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.manifest = json.loads((self.directory / 'manifest.json').read_text())
        self.size = tuple(self.manifest['size'])
        self.parts = {p['name']: p for p in self.manifest['parts']}
        self.base = {n: Image.open(self.directory / p['file']).convert('RGBA') for n, p in self.parts.items()}
        self.glow = {n: Image.open(self.directory / p['glow']).convert('RGBA') for n, p in self.parts.items()}
        cx = self.manifest['centerX']
        self.mirror = np.array([[-1., 0., 2. * cx], [0., 1., 0.], [0., 0., 1.]])
        self.nodes = [(n, False) for n in self.parts]
        self.nodes += [(n, True) for n, p in self.parts.items() if n.endswith('_r') and p.get('mirror', True)]
        self.preview_glow = None
        if self.manifest.get('neutralGlow'):
            original = Image.open(self.directory / 'source-colour-frame.png').convert('RGBA')
            self.preview_glow = {}
            for n, p in self.parts.items():
                x, y = p['offset']; w, h = self.base[n].size
                rgb = np.array(original.crop((x,y,x+w,y+h)))[...,:3].astype(float)
                base = np.array(self.base[n])[...,:3].astype(float)
                energy = np.maximum(rgb - base, 0.)
                maximum = energy.max(axis=2)
                hue = np.divide(energy, maximum[...,None], out=np.zeros_like(energy), where=maximum[...,None]>0) * 255.
                alpha = np.array(self.glow[n].getchannel('A'))
                self.preview_glow[n] = Image.fromarray(np.uint8(np.dstack([hue,alpha])), 'RGBA')

    def matrices(self, limb=0., body=0., angles=None):
        cache = {}

        def visit(name, left):
            key = (name, left)
            if key in cache:
                return cache[key]
            p = self.parts[name]
            parent = p['parent']
            inherited = np.eye(3) if parent is None else visit(parent, left and parent.endswith('_r'))
            pivot = np.array([*p['pivot'], 1.])
            if left:
                pivot = self.mirror @ pivot
            delta = 0.
            group = p.get('group', 'body')
            if group in ('limb', 'arm', 'wing'):
                delta = limb * (-1. if left or name.endswith('_l') else 1.)
            elif group == 'tube':
                delta = body * (-1. if left else 1.)
            elif group in ('body', 'tail', 'crest') and parent is not None:
                delta = body
            if angles:
                instance_name = name[:-2] + '_l' if left else name
                delta = angles.get(instance_name, delta)
            # Egg sacs inherit their carrier; their optional scale pulse is applied
            # independently about the sac's own manifest pivot.
            cache[key] = inherited @ translation(*pivot[:2]) @ rotation(delta) @ translation(*(-pivot[:2]))
            return cache[key]

        for name, left in self.nodes:
            visit(name, left)
        return cache

    def tile(self, name, left, transforms, glow=False, supersample=1, padding=0, tint=None):
        p = self.parts[name]
        transform = transforms[(name, left)]
        source_to_rest = (self.mirror if left else np.eye(3)) @ translation(*p['offset'])
        scale = np.diag([supersample, supersample, 1.])
        source = self.glow[name] if glow else self.base[name]
        if glow and self.preview_glow is not None and tint is None:
            source = self.preview_glow[name]
        elif glow and tint is not None:
            values = np.array(source)
            values[...,:3] = tint
            source = Image.fromarray(values, 'RGBA')
        matrix = scale @ translation(padding, padding) @ transform @ source_to_rest
        corners = matrix @ np.array([[0., source.width, source.width, 0.],
                                     [0., 0., source.height, source.height], [1., 1., 1., 1.]])
        width, height = ((self.size[0] + 2 * padding) * supersample,
                         (self.size[1] + 2 * padding) * supersample)
        x0, y0 = np.maximum(np.floor(corners[:2].min(axis=1) - 2), 0).astype(int)
        x1, y1 = np.minimum(np.ceil(corners[:2].max(axis=1) + 2), [width, height]).astype(int)
        if x1 <= x0 or y1 <= y0:
            return Image.new('RGBA', (1, 1)), (0, 0)
        inverse = np.linalg.inv(translation(-x0, -y0) @ matrix)
        tile = source.transform((x1 - x0, y1 - y0), Image.Transform.AFFINE,
                                tuple(inverse[:2].reshape(-1)), Image.Resampling.BICUBIC)
        return clean_resample(tile), (int(x0), int(y0))

    def layer(self, name, left, transforms, glow=False, supersample=1, padding=0):
        tile, at = self.tile(name, left, transforms, glow, supersample, padding)
        layer = Image.new('RGBA', ((self.size[0] + 2 * padding) * supersample,
                                   (self.size[1] + 2 * padding) * supersample))
        layer.paste(tile, at)
        return layer

    def add_emission(self, out, tile, at):
        """Add premultiplied emission and keep the material's coverage intact."""
        x, y = at
        box = (x, y, x + tile.width, y + tile.height)
        base = np.array(out.crop(box)).astype(float)
        emission = np.array(tile).astype(float)
        opacity = base[..., 3]
        weight = np.divide(emission[..., 3], opacity,
                           out=np.zeros_like(opacity), where=opacity > 0)
        base[..., :3] = np.clip(base[..., :3] + emission[..., :3] * weight[..., None], 0., 255.)
        base[opacity == 0] = 0
        out.paste(Image.fromarray(np.uint8(base), 'RGBA'), at)

    def render(self, limb=0., body=0., glow=True, padding=0, tint=None, sac_scale=1., angles=None):
        transforms = self.matrices(limb, body, angles)
        if sac_scale != 1.:
            for n, left in self.nodes:
                p = self.parts[n]
                if p.get('group') == 'sac':
                    pivot = p['pivot']
                    transforms[(n,left)] = transforms[(n,left)] @ translation(*pivot) @ np.diag([sac_scale,sac_scale,1.]) @ translation(*(-np.array(pivot)))
        output_size = (self.size[0] + 2 * padding, self.size[1] + 2 * padding)
        out = Image.new('RGBA', (output_size[0] * 2, output_size[1] * 2))
        for name, left in sorted(self.nodes, key=lambda node: self.parts[node[0]]['z']):
            tile, at = self.tile(name, left, transforms, supersample=2, padding=padding)
            out.alpha_composite(tile, at)
            if glow:
                tile, at = self.tile(name, left, transforms, glow=True, supersample=2, padding=padding, tint=tint)
                self.add_emission(out, tile, at)
        return clean_resample(out.resize(output_size, Image.Resampling.LANCZOS))

    def joint_checks(self, limb, body):
        transforms = self.matrices(limb, body)
        masks = {node: np.array(self.layer(*node, transforms).getchannel('A')) > 128 for node in self.nodes}
        results = []
        yy, xx = np.mgrid[:self.size[1], :self.size[0]]
        for name, left in self.nodes:
            part = self.parts[name]
            if part['parent'] is None:
                continue
            parent = (part['parent'], left and part['parent'].endswith('_r'))
            pivot = np.array([*part['pivot'], 1.])
            if left:
                pivot = self.mirror @ pivot
            world = transforms[(name, left)] @ pivot
            disc = np.hypot(xx + .5 - world[0], yy + .5 - world[1]) < part.get('probeRadiusPx', 2.)
            union = masks[(name, left)] | masks[parent]
            overlap = np.count_nonzero(masks[(name, left)] & masks[parent])
            solid = np.count_nonzero(union & disc) / max(np.count_nonzero(disc), 1)
            results.append(dict(joint=name[:-2] + '_l' if left else name,
                                parent=part['parent'][:-2] + '_l' if parent[1] else part['parent'],
                                overlapPixels=int(overlap), pivotCoverage=round(solid, 4),
                                gap=bool(overlap == 0 or solid < .8)))
        return results

    def validate_files(self):
        assert len(self.parts) > 0
        assert [p['name'] for p in self.parts.values()].count(self.manifest['root']) == 1
        padding = self.manifest['paddingPx']
        for name, part in self.parts.items():
            assert part['parent'] is None or part['parent'] in self.parts
            base, glow = self.base[name], self.glow[name]
            assert base.size == glow.size
            alpha = np.array(base.getchannel('A'))
            box = base.getchannel('A').getbbox()
            assert box[0] >= 4 and box[1] >= 4
            assert base.width - box[2] >= 4 and base.height - box[3] >= 4
            assert np.all(alpha[:4] == 0) and np.all(alpha[-4:] == 0)
            rgb = np.array(base)[..., :3].astype(float)
            fringe = ((rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])) > 12) & (alpha > 8)
            assert not np.any(fringe), f'Green matte fringe in {name}'
            if self.manifest.get('neutralGlow'):
                g = np.array(glow); active = g[...,3] > 0
                assert np.all(g[active,:3] == 255), f'Coloured Stalker glow: {name}'
            assert alpha.max() == 255, f'Base part lost solid coverage: {name}'


def font(size):
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()
