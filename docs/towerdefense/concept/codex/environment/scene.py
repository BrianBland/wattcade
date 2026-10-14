"""Manifest-driven proof of the painted map with real accepted rig references.
Puppets/cable/actors are assembled in proofs only, never baked into background.webp.
"""
import importlib.util
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import build as assets
import layout

HERE = Path(__file__).resolve().parent


def load_renderer(kind):
    path = HERE/'references'/kind/'renderer.py'
    spec = importlib.util.spec_from_file_location(kind+'_reference', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def mounted(canvas, image, pivot, target, scale):
    im = image.resize((round(image.width*scale), round(image.height*scale)), assets.LANCZOS)
    canvas.alpha_composite(im, (round(target[0]-pivot[0]*scale),
                               round(target[1]-pivot[1]*scale)))


def cable(canvas, start, finish, waypoints):
    # Reference renderer visualization; future live renderer owns cable animation.
    points = []
    controls = np.array([start, *waypoints, finish], dtype=float)
    controls = np.vstack([controls[0], controls, controls[-1]])
    for i in range(1, len(controls)-2):
        a, b, c, d = controls[i-1:i+3]
        for t in np.linspace(0, 1, 45):
            p = .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+
                     (-a+3*b-3*c+d)*t*t*t)
            points.append(tuple(p))
    g = ImageDraw.Draw(canvas)
    g.line(points, fill=(8, 10, 12), width=7)
    g.line(points, fill=(55, 61, 62), width=5)
    g.line(points, fill=(13, 19, 23), width=3)
    for k in range(13, len(points)-4, 28):
        a, b = points[k], points[k+3]
        g.line([a, b], fill=(40, 104, 132), width=3)
        g.line([a, b], fill=(101, 220, 251), width=1)


def render_scene(out, all_built=False):
    kit = assets.Kit(out)
    m = kit.manifest
    geometry = json.loads((out/m['background']['layout']).read_text())
    canvas = Image.open(out/m['background']['file']).convert('RGBA')
    tower = load_renderer('towers')
    base = load_renderer('outpost')
    center = layout.pixel(geometry['outpost']['position'])
    outpost_scale = geometry['outpost']['footprintRadius']*2*geometry['field']['size']/100/440
    outpost_manifest = json.loads((HERE/'references/outpost/export/manifest.json').read_text())
    sockets = [v for k, v in outpost_manifest['anchors'].items() if k.startswith('cable')]
    built = [0, 1, 2, 3, 4, 5] if all_built else [0, 4, 5]
    routes = {
        0: [(640, 766), (547, 703), (477, 616)],
        1: [(720, 729), (705, 654)],
        2: [(864, 709), (904, 588), (887, 444), (860, 320)],
        3: [(720, 729), (705, 630), (678, 552)],
        4: [(910, 766), (993, 693), (1070, 601)],
        5: [(866, 710), (910, 614), (925, 529)],
    }
    for i, pad in enumerate(geometry['pads']):
        if i not in built:
            continue
        target = layout.pixel(pad['position'])
        # Route from the genuine cab/deck rim anchor, not an arbitrary image edge.
        if sockets:
            s = min(sockets, key=lambda a: np.linalg.norm(
                np.array(a['position'])-260-
                (np.array(routes[i][0])-np.array(center))/outpost_scale))['position']
            start = (center[0]+(s[0]-260)*outpost_scale,
                     center[1]+(s[1]-260)*outpost_scale)
        else:
            start = (center[0]+(-1 if target[0] < center[0] else 1)*85, center[1])
        cable(canvas, start, target, routes[i])
    for pad in geometry['pads']:
        if pad['id'] not in built:
            continue
        kind = ['tesla', 'mortar', 'prism', 'tesla', 'mortar', 'prism'][pad['id']]
        level = 3
        image, _ = tower.render(HERE/'references/towers/export'/kind, level,
                               -25 if kind == 'mortar' else 0,
                               state='passive', time_ms=720)
        scale = pad['footprintRadius']*2*geometry['field']['size']/100/136
        mounted(canvas, image, (112, 112), layout.pixel(pad['position']), scale)
    # Independent organic growth and burrows: no luminous purple pixels in background.
    for i, lane in enumerate(geometry['lanes']):
        p, _ = layout.lane_at(lane['controls'], .04)
        pos = layout.pixel(p)
        kit.draw(canvas, f'creep_{i*2+1}', pos, .55)
        kit.draw(canvas, f'burrow_{i+1}', pos, .42)
    warrior = Image.open(HERE/'references/warrior.png').convert('RGBA')
    warrior = warrior.crop(warrior.getbbox())
    warrior.thumbnail((60, 70), assets.LANCZOS)
    for i, lane in enumerate(geometry['lanes']):
        for j, f in enumerate([.23, .41, .58, .75]):
            point, normal = layout.lane_at(lane['controls'], f)
            point += normal*(.45 if j % 2 else -.45)
            pos = layout.pixel(point)
            # Original Warrior's head points up: rotate to the actual lane tangent.
            tangent = np.array([-normal[1], normal[0]])
            angle = math.degrees(math.atan2(tangent[0], -tangent[1]))
            im = warrior.rotate(-angle, expand=True, resample=Image.Resampling.BICUBIC)
            mounted(canvas, im, (im.width/2, im.height/2), pos, 1)
        p, _ = layout.lane_at(lane['controls'], .63)
        kit.draw(canvas, f'splat_{i+1}', layout.pixel(p), .30, tint=assets.COLORS['red'])
    for i, (name, delta) in enumerate([('crate', (-126, -6)),
                                      ('ammo_crate', (-145, 52)),
                                      ('barrel', (115, 10)),
                                      ('coolant_barrel', (139, 31)),
                                      ('sandbags_curve', (-95, 112)),
                                      ('sandbags_straight', (93, 107))]):
        kit.draw(canvas, 'props_'+name, (center[0]+delta[0], center[1]+delta[1]), .40)
    image = base.render(HERE/'references/outpost/export', weapon='flamer',
                        angle=0, wheel_angle=25, glow=True)
    mounted(canvas, image, (260, 260), center, outpost_scale)
    return canvas


def overlays(out):
    kit = assets.Kit(out)
    proof = Image.new('RGBA', (1440, 1680), assets.GROUND)
    assets.text(proof, (30, 22), 'DYNAMO DEFENSE / DYNAMIC OVERLAYS', 29, bold=True)
    assets.text(proof, (30, 66), '27 independent decals and props • matched emissive masks', 17)
    assets.text(proof, (30, 115), 'CREEP / independent pustule emission', 21, bold=True)
    for i in range(6):
        kit.draw(proof, f'creep_{i+1}', (140+i*235, 240), .79)
        assets.text(proof, (80+i*235, 340), f'creep_{i+1}', 15)
    assets.text(proof, (30, 395), 'BURROWS / independently placed spawn mouths', 21, bold=True)
    for i in range(3):
        kit.draw(proof, f'burrow_{i+1}', (170+i*300, 530), .88)
        assets.text(proof, (122+i*300, 645), f'burrow_{i+1}', 15)
    assets.text(proof, (940, 430), 'Glow OFF / complete base art', 16)
    kit.draw(proof, 'creep_1', (1060, 540), .7, glow=False)
    kit.draw(proof, 'burrow_1', (1290, 540), .7, glow=False)
    assets.text(proof, (30, 690), 'SPLATS / neutral masters and four brood tints', 21, bold=True)
    for row, (name, tint) in enumerate([('neutral', None), *assets.COLORS.items()]):
        y = 770+row*104
        assets.text(proof, (32, y+28), name.upper(), 14, color=tint or (180, 180, 180), bold=True)
        for col in range(6):
            kit.draw(proof, f'splat_{col+1}', (217+col*220, y+30), .60,
                     glow=tint is not None, tint=tint)
    assets.text(proof, (30, 1270), 'PROPS / steel, brass, rock and canvas', 21, bold=True)
    for i, name in enumerate(assets.PROPS):
        x, y = 170+(i%4)*355, 1345+(i//4)*105
        kit.draw(proof, 'props_'+name, (x, y), .65)
        assets.text(proof, (x-100, y+51), name.replace('_', ' '), 15)
    proof.save(HERE/'overlays-full.png', optimize=True)
    # Proof display only; individual runtime cutouts retain their accepted PNGs.
    small = proof.resize((864, 1008), assets.LANCZOS)
    assets.save(small, out/'overlays-preview.png', 128)


def render(out):
    scene = render_scene(out)
    scene.save(HERE/'battlefield-assembled.png', optimize=True)
    # Preserve rich material in the production preview, without palette flattening.
    preview = scene.resize((864, 576), assets.LANCZOS)
    assets.save(preview, out/'preview.png', 256)
    render_scene(out, all_built=True).save(HERE/'all-six-pads.png', optimize=True)
    registered = Image.open(out/'background.webp').convert('RGBA')
    g = ImageDraw.Draw(registered)
    geometry = json.loads((out/'map-layout.json').read_text())
    for lane in geometry['lanes']:
        g.line([layout.pixel(p) for p in layout.points(lane['controls'])],
               fill=(0, 255, 180), width=2)
    for pad in geometry['pads']:
        x, y = layout.pixel(pad['position'])
        r = pad['footprintRadius']*geometry['field']['size']/100
        g.ellipse((x-r, y-r, x+r, y+r), outline=(0, 255, 180), width=2)
    registered.save(HERE/'registration.png', optimize=True)
    # Portrait crops the same field, preserving registration and all six pads.
    portrait = scene.crop((318, 0, 1218, 1024)).resize((900, 1024), assets.LANCZOS)
    portrait.save(HERE/'portrait.png', optimize=True)
    landscape = scene.resize((1024, 683), assets.LANCZOS)
    landscape.save(HERE/'game-scale.png', optimize=True)
    comparison = Image.new('RGB', (1536, 1080), assets.GROUND[:3])
    old = Image.open(HERE/'trench-mockup.png').convert('RGB').resize((748, 499), assets.LANCZOS)
    new = scene.convert('RGB').resize((748, 499), assets.LANCZOS)
    comparison.paste(old, (10, 55)); comparison.paste(new, (778, 55))
    assets.text(comparison, (15, 14), 'APPROVED / trench mockup', 22, bold=True)
    assets.text(comparison, (785, 14), 'DELIVERED / painted map + accepted rigs', 21, bold=True)
    clean = Image.open(out/'background.webp').convert('RGB').resize((748, 499), assets.LANCZOS)
    comparison.paste(clean, (10, 575))
    port = portrait.convert('RGB').resize((438, 499), assets.LANCZOS)
    comparison.paste(port, (932, 575))
    assets.text(comparison, (15, 553), 'Clean terrain / actors and emission stay separate', 17)
    assets.text(comparison, (785, 553), 'Same map / portrait crop', 17)
    comparison.save(HERE/'comparison.png', optimize=True)
    overlays(out)
