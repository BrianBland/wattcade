"""Extract the generated sheet and build the rest-pose manifest. No game code.

Run: python build.py && python render.py
Requires Pillow, NumPy, SciPy. The raw generated sheet is never modified.
"""
from pathlib import Path
import json
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
NAMES = [
    'head', 'mandible_r', 'thorax_1', 'thorax_2', 'thorax_3',
    'abdomen_1', 'abdomen_2', 'abdomen_3', 'abdomen_4', 'abdomen_5',
    'tail_tip', 'coxa_front_r', 'femur_front_r', 'claw_front_r', 'coxa_mid_r',
    'femur_mid_r', 'claw_mid_r', 'coxa_rear_r', 'femur_rear_r', 'claw_rear_r',
]
PADDING = 6


def translation(x, y):
    return np.array([[1., 0., x], [0., 1., y], [0., 0., 1.]])


def rotation(degrees):
    a = math.radians(degrees)
    return np.array([[math.cos(a), -math.sin(a), 0.],
                     [math.sin(a), math.cos(a), 0.], [0., 0., 1.]])


def warp(image, transform, size=(640, 640)):
    inverse = np.linalg.inv(transform)
    return image.transform(size, Image.Transform.AFFINE,
                           tuple(inverse[:2].reshape(-1)), Image.Resampling.BICUBIC)


def keyed_components():
    rgb = np.asarray(Image.open(ROOT / 'sheet-raw.png').convert('RGB')).astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    # Estimate coverage against the green matte, retaining the dark chitin outline.
    alpha = 1. - np.clip((g - np.maximum(r, b) - 2.) /
                         np.maximum(248. - np.maximum(r, b), 1.), 0., 1.)
    alpha[alpha < .16] = 0.
    # Undo the green contribution in partially covered pixels, rather than merely
    # making green pixels transparent and leaving a coloured fringe.
    clean = ((rgb - (1. - alpha[..., None]) * np.array([2., 248., 2.])) /
             np.maximum(alpha[..., None], .001))
    clean = np.clip(clean, 0., 255.)
    clean[..., 1] = np.minimum(clean[..., 1], np.maximum(clean[..., 0], clean[..., 2]) + 3.)
    clean[alpha == 0] = 0
    rgba = Image.fromarray(np.uint8(np.dstack([clean, alpha * 255.])), 'RGBA')
    labels, _ = ndimage.label(alpha > .5)
    objects = []
    for i, sl in enumerate(ndimage.find_objects(labels), 1):
        if sl is None or np.count_nonzero(labels[sl] == i) < 500:
            continue
        ys, xs = sl
        objects.append((int((ys.start + ys.stop) / 2) // 280,
                        xs.start, (xs.start, ys.start, xs.stop, ys.stop)))
    objects.sort(key=lambda item: (item[0], item[1]))
    assert len(objects) == 20, f'Expected 20 separated art components, found {len(objects)}'
    result = {}
    for name, (_, _, box) in zip(NAMES, objects):
        x0, y0, x1, y1 = box
        crop = rgba.crop((x0 - 3, y0 - 3, x1 + 3, y1 + 3))
        result[name] = crop.crop(crop.getchannel('A').getbbox())
    return result


def reshape_shaft(image, width, height, proximal, distal):
    """Shorten the shaft while retaining circular generated art at both ends."""
    scale = height / image.height
    scaled = image.resize((round(image.width * scale), height), Image.Resampling.LANCZOS)
    p = np.array(proximal) * scale
    e = np.array(distal) * scale
    # Keep the two end caps at uniform scale; only the straight central shaft
    # is resampled horizontally. Thus the round joint is not squashed elliptical.
    left = round(p[0] + height * .36)
    right = round(e[0] - height * .36)
    mid_width = width - left - (scaled.width - right)
    assert mid_width > 0
    out = Image.new('RGBA', (width, height))
    out.paste(scaled.crop((0, 0, left, height)), (0, 0))
    out.paste(scaled.crop((left, 0, right, height)).resize(
        (mid_width, height), Image.Resampling.LANCZOS), (left, 0))
    out.paste(scaled.crop((right, 0, scaled.width, height)), (left + mid_width, 0))
    e[0] -= scaled.width - width
    return out, p.tolist(), e.tolist()


def enlarge_ball(image, pivot, radius, target_radius):
    """Expand the generated proximal ball into a hidden, rounded overlap cap."""
    x, y = pivot
    old = image.crop((round(x - radius), round(y - radius),
                      round(x + radius), round(y + radius)))
    # The rounded end cap is taken from the generated joint, not newly drawn art.
    # Fill any small keyed corner inside the disc with nearby source joint pixels.
    arr = np.array(old)
    valid = arr[..., 3] > 150
    indices = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    arr[~valid] = arr[tuple(indices[:, ~valid])]
    arr[..., 3] = 255
    ball = Image.fromarray(arr, 'RGBA').resize(
        (round(2 * target_radius), round(2 * target_radius)), Image.Resampling.LANCZOS)
    yy, xx = np.mgrid[:ball.height, :ball.width]
    distance = np.hypot(xx + .5 - ball.width / 2., yy + .5 - ball.height / 2.)
    mask = np.clip((target_radius - distance) / 1.4, 0., 1.)
    ball.putalpha(Image.fromarray(np.uint8(mask * 255.), 'L'))
    margin = math.ceil(target_radius + 3)
    out = Image.new('RGBA', (image.width + 2 * margin, image.height + 2 * margin))
    out.alpha_composite(image, (margin, margin))
    at = (round(x + margin - ball.width / 2), round(y + margin - ball.height / 2))
    out.alpha_composite(ball, at)
    return out, [x + margin, y + margin]


def orient_specular(image, pivot, radius, rest_angle):
    """Keep the generated ball's highlight at 12 o'clock in the rest frame.

    Only the interior circular joint texture rotates; the segment silhouette,
    overlap geometry and keyed edge are retained. This also keeps mirroring safe.
    """
    x, y = pivot
    arr = np.array(image).astype(float)
    yy, xx = np.mgrid[:image.height, :image.width]
    distance = np.hypot(xx + .5 - x, yy + .5 - y)
    rgb = arr[..., :3]
    luminance = rgb @ np.array([.2126, .7152, .0722])
    neutral = np.max(rgb, axis=2) - np.min(rgb, axis=2) < 65.
    candidates = (distance < radius * .72) & neutral & (arr[..., 3] > 128)
    if not np.any(candidates):
        return image
    threshold = np.percentile(luminance[candidates], 70)
    weights = np.maximum(luminance - threshold, 0.) ** 3 * candidates
    total = weights.sum()
    if total == 0:
        return image
    vx = (weights * (xx + .5 - x)).sum() / total
    vy = (weights * (yy + .5 - y)).sum() / total
    source_angle = math.degrees(math.atan2(vy, vx))
    angle = -90. - rest_angle - source_angle
    matrix = translation(x, y) @ rotation(angle) @ translation(-x, -y)
    inverse = np.linalg.inv(matrix)
    rotated = image.transform(image.size, Image.Transform.AFFINE,
                              tuple(inverse[:2].reshape(-1)), Image.Resampling.BICUBIC)
    texture = np.array(rotated).astype(float)
    weight = np.clip((radius * .9 - distance) / 1.5, 0., 1.)
    weight *= np.minimum(texture[..., 3], arr[..., 3]) / 255.
    arr[..., :3] = arr[..., :3] * (1. - weight[..., None]) + texture[..., :3] * weight[..., None]
    return Image.fromarray(np.uint8(arr), 'RGBA')


def split_glow(image):
    arr = np.array(image).astype(float)
    # Affine interpolation can reintroduce a few green-channel overshoots at
    # subpixel matte edges. This palette contains no green material or emission.
    arr[..., 1] = np.minimum(arr[..., 1], np.maximum(arr[..., 0], arr[..., 2]) + 3.)
    rgb = arr[..., :3]
    r, g, b = rgb.transpose(2, 0, 1)
    # Emissive orange seams and eyes; neutral metal highlights remain in the base.
    weight = np.clip((r - b - 10.) / 65., 0., 1.)
    weight *= np.clip((r - 90.) / 80., 0., 1.)
    weight *= np.clip((r - g + 6.) / 15., 0., 1.)
    # Include the yellow/white hot cores adjoining orange seams and eyes;
    # otherwise the base would retain the brightest baked emission.
    near_emission = ndimage.distance_transform_edt(weight < .65) < 2.5
    hot_core = near_emission & (r > 170.) & (r - b > 4.) & (r >= g - 2.)
    weight[hot_core] = 1.
    weight[arr[..., 3] == 0] = 0
    luminance = rgb @ np.array([.2126, .7152, .0722])
    gunmetal = np.repeat((luminance * .32)[..., None], 3, axis=2)
    base = arr.copy()
    base[..., :3] = rgb * (1. - weight[..., None]) + gunmetal * weight[..., None]
    glow = arr.copy()
    glow[..., 3] *= weight
    glow[glow[..., 3] < 2] = 0
    base[base[..., 3] == 0] = 0
    return Image.fromarray(np.uint8(base), 'RGBA'), Image.fromarray(np.uint8(glow), 'RGBA')


def save_part(name, image, local_pivot, world_pivot, parent, z, angle=0., end=None,
              joint_radius=None):
    transform = translation(*world_pivot) @ rotation(angle) @ translation(*(-np.array(local_pivot)))
    posed = warp(image, transform)
    box = posed.getchannel('A').getbbox()
    assert box is not None
    padded = (box[0] - PADDING, box[1] - PADDING, box[2] + PADDING, box[3] + PADDING)
    assert padded[0] >= 0 and padded[1] >= 0 and padded[2] <= 640 and padded[3] <= 640
    part = posed.crop(padded)
    base, glow = split_glow(part)
    base.save(ROOT / 'parts' / f'{name}.png')
    glow.save(ROOT / 'parts' / f'{name}_glow.png')
    record = dict(name=name, file=f'parts/{name}.png', glow=f'parts/{name}_glow.png',
                  offset=list(padded[:2]), pivot=list(world_pivot), parent=parent, z=z)
    if end is not None:
        record['end'] = np.round((transform @ [*end, 1.])[:2], 3).tolist()
    if joint_radius is not None:
        record['jointRadiusPx'] = joint_radius
    return record


def build():
    art = keyed_components()
    records = []
    # width, height, top, pivotY, parent, z. The measured axial extent is y=80..560.
    body = {
        'head': (88, 110, 80, 181, 'thorax_1', 50),
        'thorax_1': (115, 80, 167, 237, 'thorax_2', 38),
        'thorax_2': (123, 80, 227, 267, None, 37),
        'thorax_3': (115, 80, 287, 297, 'thorax_2', 36),
        'abdomen_1': (106, 56, 353, 360, 'thorax_3', 35),
        'abdomen_2': (90, 51, 396, 402, 'abdomen_1', 34),
        'abdomen_3': (75, 45, 436, 441, 'abdomen_2', 33),
        'abdomen_4': (59, 38, 471, 476, 'abdomen_3', 32),
        'abdomen_5': (45, 32, 501, 505, 'abdomen_4', 31),
        'tail_tip': (25, 34, 526, 530, 'abdomen_5', 30),
    }
    for name, (w, h, top, py, parent, z) in body.items():
        image = art[name].resize((w, h), Image.Resampling.LANCZOS)
        records.append(save_part(name, image, (w / 2, py - top), (320, py), parent, z))

    # Local joint positions measured on the single raw sheet (after alpha trim).
    joints = {
        'coxa_front_r': ((35, 51), (214, 51)),
        'femur_front_r': ((35, 52), (258, 52)),
        'coxa_mid_r': ((34, 51), (209, 51)),
        'femur_mid_r': ((33, 48), (270, 48)),
        'coxa_rear_r': ((34, 50), (209, 50)),
        'femur_rear_r': ((34, 49), (272, 49)),
    }
    legs = [
        ('front', (363, 202), -28., -35., 'thorax_1', (36, 37), 31., 155),
        ('mid', (372, 262), 2., -9., 'thorax_2', (35, 39), 31., 166),
        ('rear', (363, 324), 23., 19., 'thorax_3', (35, 39), 31., 150),
    ]
    for index, (which, at, coxa_angle, femur_angle, parent, claw_joint, ball_radius, claw_height) in enumerate(legs):
        cn, fn, kn = (f'{segment}_{which}_r' for segment in ['coxa', 'femur', 'claw'])
        coxa, cp, ce = reshape_shaft(art[cn], 50, 28, *joints[cn])
        coxa = orient_specular(coxa, cp, 8.5, coxa_angle)
        coxa = orient_specular(coxa, ce, 8.5, coxa_angle)
        c = save_part(cn, coxa, cp, at, parent, 10 + index, coxa_angle,
                      end=ce, joint_radius=8.5)
        records.append(c)
        femur, fp, fe = reshape_shaft(art[fn], 90, 44, *joints[fn])
        femur = orient_specular(femur, fp, 13.5, femur_angle)
        femur = orient_specular(femur, fe, 13.5, femur_angle)
        f = save_part(fn, femur, fp, c['end'], cn, 15 + index, femur_angle,
                      end=fe, joint_radius=13.5)
        records.append(f)
        scale = claw_height / art[kn].height
        claw = art[kn].resize((round(art[kn].width * scale), claw_height), Image.Resampling.LANCZOS)
        original_pivot = (np.array(claw_joint) * scale).tolist()
        # Expand the source-art ball to supply the prescribed ~18% underlap.
        desired_radius = claw_height * .18
        claw, kp = enlarge_ball(claw, original_pivot, ball_radius * scale, desired_radius)
        claw = orient_specular(claw, kp, desired_radius, 0.)
        # The blade end is metadata for the foot, not an extra articulation.
        old_tip = np.array([art[kn].width * .90, art[kn].height - 2.]) * scale
        margin = np.array(kp) - original_pivot
        records.append(save_part(kn, claw, kp, f['end'], fn, 20 + index,
                                  end=(old_tip + margin).tolist(), joint_radius=round(desired_radius, 2)))

    mandible = art['mandible_r']
    scale = 58 / mandible.height
    mandible = mandible.resize((round(mandible.width * scale), 58), Image.Resampling.LANCZOS)
    mp = (np.array([35, 38]) * scale).tolist()
    mandible, mp = enlarge_ball(mandible, mp, 31 * scale, 10.5)
    mandible = orient_specular(mandible, mp, 10.5, -120.)
    records.append(save_part('mandible_r', mandible, mp, (347, 172), 'head', 40,
                             -120., joint_radius=10.5))
    records.sort(key=lambda r: NAMES.index(r['name']))
    manifest = dict(size=[640, 640], centerX=320, lengthPx=480, light='top',
                    root='thorax_2', paddingPx=PADDING, angleConvention='clockwise in image coordinates',
                    coordinates='All offsets, pivots and ends are in the assembled rest frame.',
                    mirror=dict(suffix='_r', centerX=320,
                                rule='Reflect geometry at x=320; negate local limb rotation on the left.'),
                    glowBlend='normal alpha over base at full intensity; base is also complete alone',
                    parts=records)
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Built {len(records)} base parts, {len(records)} glow layers and manifest.json.')


if __name__ == '__main__':
    build()
