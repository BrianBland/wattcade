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


def uniform_part(image, width=None, height=None):
    """Preserve the generated proportions; never shorten the limb shaft."""
    scale = width / image.width if width is not None else height / image.height
    return image.resize((round(image.width * scale), round(image.height * scale)),
                        Image.Resampling.LANCZOS), scale


POSED = {}
BACKING = {}


def finalize(records):
    """Copy a concealed parent-texture tongue behind each original child part.

    Added coverage is strictly inside the parent's opaque rest silhouette. The
    visible first-sheet art and its original small joints are never enlarged.
    Parent texture on these hidden tongues also avoids introducing shiny knobs.
    """
    by_name = {r['name']: r for r in records}
    finished = {}
    measurements = []
    yy, xx = np.mgrid[:640, :640]

    def finish(name):
        if name in finished:
            return finished[name]
        part = by_name[name]
        original = POSED[name]
        parent_name = part['parent']
        if parent_name is None:
            finished[name] = original
            return original
        parent = finish(parent_name)
        pivot = np.array(part['pivot'], dtype=float)
        parent_pivot = np.array(by_name[parent_name]['pivot'], dtype=float)
        vector = parent_pivot - pivot
        norm = np.linalg.norm(vector)
        direction = vector / max(norm, .001)
        length = (np.linalg.norm(np.array(part['end']) - pivot) if 'end' in part
                  else original.getbbox()[3] - original.getbbox()[1])
        depth = length * (.18 if name.endswith('_r') else .25)
        radius = part.get('jointRadiusPx', min(16., length * .16))
        tip = pivot + direction * depth
        # Capsule with rounded ends, intersected with the opaque parent area.
        vx, vy = tip - pivot
        t = np.clip(((xx + .5 - pivot[0]) * vx + (yy + .5 - pivot[1]) * vy) /
                    max(vx * vx + vy * vy, .001), 0., 1.)
        distance = np.hypot(xx + .5 - (pivot[0] + t * vx),
                            yy + .5 - (pivot[1] + t * vy))
        mask = np.clip((radius - distance) / 1.2, 0., 1.)
        parent_rgba = np.array(parent)
        covered = ndimage.binary_erosion(parent_rgba[..., 3] > 250, iterations=1)
        mask *= covered
        tongue = parent_rgba.copy()
        # Body underlaps lie below their parent in z order, so the first sheet
        # supplies those concealed surfaces. Limb tongues retain their parent's
        # visible texture because the specified limb draw order puts children on top.
        if part['z'] < by_name[parent_name]['z'] and name in BACKING:
            backing = np.array(BACKING[name])
            use = (backing[..., 3] > 250) & covered
            tongue[use, :3] = backing[use, :3]
        tongue[..., 3] = np.uint8(mask * 255.)
        tongue[tongue[..., 3] == 0] = 0
        out = Image.fromarray(tongue, 'RGBA')
        out.alpha_composite(original)
        added = ((np.array(out.getchannel('A')) > 128) &
                 (np.array(original.getchannel('A')) <= 128))
        assert np.all(~added | covered), f'Visible silhouette enlarged: {name}'
        measurements.append(dict(part=name, addedOpaquePixels=int(added.sum()),
                                 outsideParentPixels=int(np.count_nonzero(added & ~covered)),
                                 tongueDepthPx=round(depth, 3)))
        finished[name] = out
        return out

    for part in records:
        posed = finish(part['name'])
        box = posed.getchannel('A').getbbox()
        padded = (box[0] - PADDING, box[1] - PADDING, box[2] + PADDING, box[3] + PADDING)
        assert padded[0] >= 0 and padded[1] >= 0 and padded[2] <= 640 and padded[3] <= 640
        base, glow = split_glow(posed.crop(padded))
        base.save(ROOT / part['file'])
        glow.save(ROOT / part['glow'])
        part['offset'] = list(padded[:2])
    return measurements


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
    shade = np.minimum(luminance * .32, rgb.min(axis=2))
    gunmetal = np.repeat(shade[..., None], 3, axis=2)
    base = arr.copy()
    base[..., :3] = rgb * (1. - weight[..., None]) + gunmetal * weight[..., None]
    glow = arr.copy()
    # Additive emission exactly restores the original source colours at full
    # intensity. Normal-alpha glow would darken partial orange reflections.
    glow[..., :3] = rgb - gunmetal
    glow[..., 3] *= weight
    glow[glow[..., 3] < 2] = 0
    base[base[..., 3] == 0] = 0
    return Image.fromarray(np.uint8(base), 'RGBA'), Image.fromarray(np.uint8(glow), 'RGBA')


def save_part(name, image, local_pivot, world_pivot, parent, z, angle=0., end=None,
              joint_radius=None):
    transform = translation(*world_pivot) @ rotation(angle) @ translation(*(-np.array(local_pivot)))
    posed = warp(image, transform)
    POSED[name] = posed
    padded = posed.getchannel('A').getbbox()
    record = dict(name=name, file=f'parts/{name}.png', glow=f'parts/{name}_glow.png',
                  offset=list(padded[:2]), pivot=list(world_pivot), parent=parent, z=z)
    if end is not None:
        record['end'] = np.round((transform @ [*end, 1.])[:2], 3).tolist()
    if joint_radius is not None:
        record['jointRadiusPx'] = joint_radius
    return record


def build():
    art = keyed_components()  # Keep the first generated 20-piece sheet intact.
    rgb = np.array(Image.open(ROOT / 'reference-warrior.png').convert('RGB'))
    masks = Image.open(ROOT / 'reference-masks.png').convert('L')
    source_names = ['body', 'femur-front', 'claw-front', 'femur-mid',
                    'claw-mid', 'femur-rear', 'claw-rear']
    source = {}
    for index, name in enumerate(source_names):
        alpha = np.array(masks.crop((index * 400, 0, (index + 1) * 400, 380)))
        # Retain the silhouette while restoring solid black chitin inside it.
        # The old spike's brightness key left internal skin pixels translucent.
        opaque = ndimage.binary_fill_holes(alpha > 96)
        alpha = np.maximum(alpha, np.uint8(opaque) * 255)
        rgba = np.dstack([rgb, alpha])
        rgba[alpha == 0] = 0
        source[name] = Image.fromarray(rgba, 'RGBA')

    scale = 480. / (380. - 24.)
    mapping = np.array([[scale, 0., 320. - 190. * scale],
                        [0., scale, 80. - 24. * scale], [0., 0., 1.]])
    yy, xx = np.mgrid[:380, :400]
    records = []

    def mapped(point):
        return np.round((mapping @ [*point, 1.])[:2], 3).tolist()

    def add(name, image, selection, pivot, parent, z, end=None, radius=7.):
        arr = np.array(image)
        arr[..., 3] = np.uint8(arr[..., 3].astype(float) * np.clip(selection, 0., 1.))
        arr[arr[..., 3] == 0] = 0
        visible = Image.fromarray(arr, 'RGBA')
        posed = warp(visible, mapping)
        assert posed.getbbox(), f'Empty source selection: {name}'
        POSED[name] = posed
        world_pivot = mapped(pivot)
        record = dict(name=name, file=f'parts/{name}.png', glow=f'parts/{name}_glow.png',
                      offset=[0, 0], pivot=world_pivot, parent=parent, z=z,
                      jointRadiusPx=round(radius * scale, 3))
        if end is not None:
            record['end'] = mapped(end)
        records.append(record)
        # First-sheet chitin is retained only on concealed body overlap surfaces.
        backing, _ = uniform_part(art[name], width=140)
        local = (backing.width / 2., backing.height * .22)
        transform = translation(*world_pivot) @ translation(*(-np.array(local)))
        BACKING[name] = warp(backing, transform)

    def band(top, bottom):
        # Rear-pointing chevron boundaries follow the original dorsal scales.
        slope = .36 * np.abs(xx - 190.)
        return np.clip(yy + slope - top + 1., 0., 1.) * np.clip(bottom - yy - slope + 1., 0., 1.)

    jaw_mask = Image.new('L', (400, 380))
    ImageDraw.Draw(jaw_mask).polygon([(209, 100), (219, 95), (232, 109),
                                     (228, 129), (212, 122), (207, 111)], fill=255)
    jaw = np.array(jaw_mask) / 255.
    # Keep only the proximal jaw overlap in the skull and neighbouring plates.
    # The distal mandibles belong to their own articulated parts, not baked copies.
    distal_jaw = jaw * (np.hypot(xx - 218., yy - 111.) > 8.)
    reflected_x = np.clip(380 - np.arange(400), 0, 399)
    without_jaws = (1. - distal_jaw) * (1. - distal_jaw[:, reflected_x])

    body = [
        ('head', -20., 122., (190, 111), 'thorax_1', 50),
        ('thorax_1', 104., 169., (190, 161), 'thorax_2', 38),
        ('thorax_2', 153., 217., (190, 194), None, 37),
        ('thorax_3', 200., 268., (190, 209), 'thorax_2', 36),
        ('abdomen_1', 255., 292., (190, 260), 'thorax_3', 35),
        ('abdomen_2', 283., 317., (190, 287), 'abdomen_1', 34),
        ('abdomen_3', 308., 338., (190, 313), 'abdomen_2', 33),
        ('abdomen_4', 330., 354., (190, 334), 'abdomen_3', 32),
        ('abdomen_5', 348., 370., (190, 352), 'abdomen_4', 31),
        ('tail_tip', 362., 390., (190, 366), 'abdomen_5', 30),
    ]
    for name, top, bottom, pivot, parent, z in body:
        add(name, source['body'], band(top, bottom) * without_jaws, pivot, parent, z)

    # Exact original shoulder, elbow and blade geometry. Each upper leg is split
    # into its socket and upper segment, with an overlapping anatomical boundary.
    legs = [
        ('front', (216, 137), (243, 138), (292, 82), (342, 178), 'thorax_1'),
        ('mid', (219, 201), (249, 198), (308, 181), (340, 344), 'thorax_2'),
        ('rear', (218, 244), (247, 282), (285, 273), (280, 378), 'thorax_3'),
    ]
    for index, (which, at, socket_end, elbow, foot, parent) in enumerate(legs):
        upper = source[f'femur-{which}']
        if which == 'rear':
            # Preserve the original rear leg's bent socket, rather than treating
            # it as a straight shaft or reusing the middle leg's silhouette.
            coxa_mask = np.clip((259. - xx) / 4., 0., 1.)
            femur_mask = np.clip((xx - 237.) / 4., 0., 1.)
        else:
            direction = np.array(elbow) - at
            direction = direction / np.linalg.norm(direction)
            along = (xx - at[0]) * direction[0] + (yy - at[1]) * direction[1]
            coxa_mask = np.clip((34. - along) / 4., 0., 1.)
            femur_mask = np.clip((along - 14.) / 4., 0., 1.)
        cn, fn, kn = (f'{segment}_{which}_r' for segment in ['coxa', 'femur', 'claw'])
        # Recover the original dark socket texture that the old brightness key
        # omitted. A narrow capsule joins the real body socket to the real limb;
        # its pixels come directly from the roster, with no shiny round bulb.
        socket_to = {'front': (234, 142), 'mid': (235, 204), 'rear': (231, 260)}[which]
        vector = np.array(socket_to) - at
        t = np.clip(((xx - at[0]) * vector[0] + (yy - at[1]) * vector[1]) /
                    max(float(vector @ vector), .001), 0., 1.)
        distance = np.hypot(xx - (at[0] + t * vector[0]), yy - (at[1] + t * vector[1]))
        connector = np.clip((3.8 - distance) / .8, 0., 1.)
        socket = np.array(upper)
        socket[..., :3] = rgb
        socket[..., 3] = np.maximum(socket[..., 3], np.uint8(connector * 255.))
        add(cn, Image.fromarray(socket, 'RGBA'), np.maximum(coxa_mask, connector),
            at, parent, 10 + index, socket_end, radius=5.)
        add(fn, upper, femur_mask, socket_end, cn, 15 + index, elbow, radius=7.)
        add(kn, source[f'claw-{which}'], np.ones((380, 400)), elbow, fn,
            20 + index, foot, radius=7.)

    add('mandible_r', source['body'], np.array(jaw_mask) / 255., (218, 111), 'head', 40, radius=5.)
    records.sort(key=lambda r: NAMES.index(r['name']))
    hidden = finalize(records)
    manifest = dict(size=[640, 640], centerX=320, lengthPx=480, light='top',
                    root='thorax_2', paddingPx=PADDING,
                    sourceSheet='first generated 20-part sheet retained for concealed backing',
                    visibleSource='reference-warrior.png: original roster Warrior pixels',
                    referenceTransform=mapping.tolist(),
                    lightingNote='Original baked specular highlights retained; some lateral bias remains.',
                    referenceMaskOrder=source_names,
                    hiddenUnderlaps=hidden, angleConvention='clockwise in image coordinates',
                    coordinates='All offsets, pivots and ends are in the assembled rest frame.',
                    mirror=dict(suffix='_r', centerX=320,
                                rule='Reflect geometry at x=320; negate local limb rotation on the left.'),
                    glowBlend='additive RGB, weighted by glow alpha; base is complete without emission',
                    parts=records)
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Built {len(records)} base parts, {len(records)} glow layers and manifest.json.')


if __name__ == '__main__':
    build()
