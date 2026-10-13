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
    def __init__(self):
        self.manifest = json.loads((ROOT / 'manifest.json').read_text())
        self.size = tuple(self.manifest['size'])
        self.parts = {p['name']: p for p in self.manifest['parts']}
        self.base = {n: Image.open(ROOT / p['file']).convert('RGBA') for n, p in self.parts.items()}
        self.glow = {n: Image.open(ROOT / p['glow']).convert('RGBA') for n, p in self.parts.items()}
        cx = self.manifest['centerX']
        self.mirror = np.array([[-1., 0., 2. * cx], [0., 1., 0.], [0., 0., 1.]])
        self.nodes = [(n, False) for n in self.parts]
        self.nodes += [(n, True) for n in self.parts if n.endswith('_r')]

    def matrices(self, limb=0., body=0.):
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
            if name.startswith(('coxa_', 'femur_', 'claw_')):
                delta = -limb if left else limb
            elif name.startswith(('thorax_', 'abdomen_')) and parent is not None:
                delta = body
            # The head, mandibles and stinger inherit their parent transform.
            cache[key] = inherited @ translation(*pivot[:2]) @ rotation(delta) @ translation(*(-pivot[:2]))
            return cache[key]

        for name, left in self.nodes:
            visit(name, left)
        return cache

    def tile(self, name, left, transforms, glow=False, supersample=1, padding=0):
        p = self.parts[name]
        transform = transforms[(name, left)]
        source_to_rest = (self.mirror if left else np.eye(3)) @ translation(*p['offset'])
        scale = np.diag([supersample, supersample, 1.])
        source = self.glow[name] if glow else self.base[name]
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

    def render(self, limb=0., body=0., glow=True, padding=0):
        transforms = self.matrices(limb, body)
        output_size = (self.size[0] + 2 * padding, self.size[1] + 2 * padding)
        out = Image.new('RGBA', (output_size[0] * 2, output_size[1] * 2))
        for name, left in sorted(self.nodes, key=lambda node: self.parts[node[0]]['z']):
            tile, at = self.tile(name, left, transforms, supersample=2, padding=padding)
            out.alpha_composite(tile, at)
            if glow:
                tile, at = self.tile(name, left, transforms, glow=True, supersample=2, padding=padding)
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
            disc = np.hypot(xx + .5 - world[0], yy + .5 - world[1]) < 3.
            union = masks[(name, left)] | masks[parent]
            overlap = np.count_nonzero(masks[(name, left)] & masks[parent])
            solid = np.count_nonzero(union & disc) / max(np.count_nonzero(disc), 1)
            results.append(dict(joint=name[:-2] + '_l' if left else name,
                                parent=part['parent'][:-2] + '_l' if parent[1] else part['parent'],
                                overlapPixels=int(overlap), pivotCoverage=round(solid, 4),
                                gap=bool(overlap == 0 or solid < .95)))
        return results

    def validate_files(self):
        assert len(self.parts) == 20
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
            assert np.any(np.array(glow.getchannel('A')) > 0), f'Empty glow layer: {name}'
            assert alpha.max() == 255, f'Base part lost solid coverage: {name}'


def font(size):
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def run():
    puppet = Puppet()
    puppet.validate_files()
    assembled = puppet.render()
    measured = np.array(assembled.getchannel('A')) > 128
    ys, xs = np.nonzero(measured)
    opaque_length = int(ys.max() - ys.min() + 1)
    assembled.save(ROOT / 'assembled.png')
    ground = Image.new('RGBA', puppet.size, GROUND)
    ground.alpha_composite(assembled)
    ground.convert('RGB').save(ROOT / 'assembled-ground.png')
    reference = Image.open(ROOT / 'reference-warrior.png').convert('RGBA')
    mapping = np.array(puppet.manifest['referenceTransform'])
    inverse = np.linalg.inv(mapping)
    reference_frame = reference.transform(puppet.size, Image.Transform.AFFINE,
                                          tuple(inverse[:2].reshape(-1)), Image.Resampling.BICUBIC)
    comparison = Image.new('RGBA', (1280, 704), (22, 22, 20, 255))
    comparison.alpha_composite(reference_frame, (0, 32))
    comparison.alpha_composite(ground, (640, 32))
    labels = ImageDraw.Draw(comparison)
    labels.text((24, 9), 'ORIGINAL ROSTER WARRIOR', font=font(18), fill=(240, 228, 215))
    labels.text((664, 9), '20-PART PUPPET · ORIGINAL VISIBLE ART', font=font(18), fill=(240, 228, 215))
    labels.text((24, 678), 'Same scale and head alignment; left limbs mirrored in puppet',
                font=font(14), fill=(163, 149, 137))
    comparison.convert('RGB').save(ROOT / 'comparison.png')
    puppet.render(glow=False).save(ROOT / 'assembled-base.png')
    # Exactly 105/480 scaling: the 480px axial length becomes 105px in a 140px frame.
    clean_resample(assembled.resize((140, 140), Image.Resampling.LANCZOS)).save(ROOT / 'game-scale.png')

    poses = [
        ('LIMBS +20°', 20., 0.), ('LIMBS −20°', -20., 0.),
        ('BODY LEFT (+6° / PLATE)', 0., 6.), ('BODY RIGHT (−6° / PLATE)', 0., -6.),
    ]
    # Diagnostic poses get extra space for extended claws. The asset/manifest
    # rest frame remains 640x640; no pose is shrunk to hide a clipped limb.
    pose_padding = 128
    pose_width = puppet.size[0] + 2 * pose_padding
    strip = Image.new('RGBA', (pose_width * 4, pose_width + 64), GROUND)
    draw = ImageDraw.Draw(strip)
    checks = {}
    rendered_fringe = 0
    clipped_poses = []

    def check_render(image, label):
        nonlocal rendered_fringe
        arr = np.array(image)
        rgb = arr[..., :3].astype(float)
        fringe = (rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]) > 12.) & (arr[..., 3] > 8)
        rendered_fringe += int(np.count_nonzero(fringe))
        alpha = arr[..., 3]
        if np.any(alpha[0]) or np.any(alpha[-1]) or np.any(alpha[:, 0]) or np.any(alpha[:, -1]):
            clipped_poses.append(label)

    check_render(assembled, 'rest')
    for i, (label, limb, body) in enumerate(poses):
        pose = puppet.render(limb, body, padding=pose_padding)
        check_render(pose, label)
        strip.alpha_composite(pose, (pose_width * i, 32))
        draw.text((pose_width * i + 24, 10), label, font=font(18), fill=(240, 228, 215))
        draw.text((pose_width * i + 24, pose_width + 38), '640×640 rest frame + 128px diagnostic margin', font=font(14), fill=(163, 149, 137))
        if i:
            draw.line((pose_width * i, 0, pose_width * i, pose_width + 64), fill=(86, 70, 57), width=1)
        checks[label] = puppet.joint_checks(limb, body)
    strip.convert('RGB').save(ROOT / 'joints-test.png')

    # The required strip uses ±20° / ±6°; separately measure the wider limits
    # requested by the joint rules, including combinations of bend and limb pose.
    for limb, body in [(25., 0.), (-25., 0.), (0., 8.), (0., -8.),
                       (25., 8.), (-25., -8.), (25., -8.), (-25., 8.)]:
        label = f'limit limb={limb:+g}, body={body:+g}'
        checks[label] = puppet.joint_checks(limb, body)
        check_render(puppet.render(limb, body, padding=pose_padding), label)
    gaps = [{**joint, 'pose': pose} for pose, joints in checks.items() for joint in joints if joint['gap']]
    assert rendered_fringe == 0, f'{rendered_fringe} green fringe pixels in rendered poses'
    assert not clipped_poses, f'Clipped poses: {clipped_poses}'
    report = dict(partCount=20, glowCount=20, assembledInstanceCount=len(puppet.nodes),
                  mirroredLeftCount=sum(left for _, left in puppet.nodes),
                  paddingPx=puppet.manifest['paddingPx'], greenFringePixels=rendered_fringe,
                  clippedPoses=clipped_poses, nominalAxialLengthPx=480,
                  opaqueAxialLengthPx=opaque_length, gameNominalAxialLengthPx=105,
                  visibleArtSource=puppet.manifest['visibleSource'],
                  outsideParentUnderlapPixels=sum(p['outsideParentPixels'] for p in puppet.manifest['hiddenUnderlaps']),
                  method='Opaque parent/child overlap plus a 3px pivot-disc coverage probe; visual review still required.',
                  gapJoints=gaps, poses=checks)
    (ROOT / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'Rendered assembled previews, 105px check and four-pose joint strip; {len(gaps)} flagged joints.')
    if gaps:
        for joint in gaps:
            print(joint)


if __name__ == '__main__':
    run()
