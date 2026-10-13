"""Roster-pixel cutout puppets. Run python -B build_all.py [species ...]."""
import sys
sys.dont_write_bytecode = True
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from anatomy import SPECS
from rig import Puppet, translation, rotation, font, GROUND, clean_resample

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
PAD = 6


def polygon(points, shape, margin=4):
    image = Image.new('L', (shape[1], shape[0]))
    ImageDraw.Draw(image).polygon([tuple(p) for p in points], fill=255)
    mask = np.array(image) > 0
    if margin:
        mask = ndimage.binary_dilation(mask, iterations=margin)
    return mask


def arclength(points, yy, xx):
    """Nearest position along the actual bent limb/tail, rather than a straight shaft."""
    points = np.array(points, dtype=float)
    total = 0.
    arc = np.zeros_like(xx, dtype=float)
    distance = np.full_like(xx, np.inf, dtype=float)
    lengths = [0.]
    for a, b in zip(points[:-1], points[1:]):
        v = b - a
        length = np.linalg.norm(v)
        t = np.clip(((xx - a[0]) * v[0] + (yy - a[1]) * v[1]) / max(length ** 2, .001), 0., 1.)
        d = np.hypot(xx - (a[0] + t * v[0]), yy - (a[1] + t * v[1]))
        choose = d < distance
        arc[choose] = total + t[choose] * length
        distance[choose] = d[choose]
        total += length
        lengths.append(total)
    return arc, np.array(lengths), distance


def resample_path(points, count):
    points = np.array(points, dtype=float)
    distances = np.r_[0., np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    targets = np.linspace(0., distances[-1], count + 1)
    return np.column_stack([np.interp(targets, distances, points[:, k]) for k in range(2)]).tolist()


def warp(image, matrix, size=(640, 640)):
    inverse = np.linalg.inv(matrix)
    return clean_resample(image.transform(size, Image.Transform.AFFINE,
                          tuple(inverse[:2].reshape(-1)), Image.Resampling.BICUBIC))


def emission(image, colour):
    arr = np.array(image).astype(float)
    rgb = arr[..., :3]
    r, g, b = rgb.transpose(2, 0, 1)
    maximum, minimum = rgb.max(axis=2), rgb.min(axis=2)
    if colour == 'blue':
        chroma = np.minimum(b - r, g - r) / 45.
    elif colour == 'red':
        chroma = (r - np.maximum(g * .8, b)) / 60.
    elif colour == 'purple':
        chroma = np.minimum(b - g, r - g) / 38.
    elif colour == 'gold':
        chroma = np.minimum(r - b, g - b) / 45.
    else:
        chroma = (maximum - minimum) / 65.
    weight = np.clip(chroma, 0., 1.) * np.clip((maximum - 85.) / 75., 0., 1.)
    hot = (ndimage.distance_transform_edt(weight < .65) < 2.) & (maximum > 180.)
    weight[hot] = np.maximum(weight[hot], .8)
    weight[arr[..., 3] == 0] = 0.
    shade = np.minimum(rgb @ np.array([.2126, .7152, .0722]) * .32, minimum)
    material = np.repeat(shade[..., None], 3, axis=2)
    base = arr.copy()
    base[..., :3] = rgb * (1. - weight[..., None]) + material * weight[..., None]
    glow = arr.copy()
    glow[..., :3] = rgb - material
    glow[..., 3] *= weight
    if colour == 'shifting':
        # Preserve all unclassified chitin RGB. Only the extracted energy mask
        # becomes white, so a game tint never recolours the base texture.
        glow[..., 3] *= (rgb - material).max(axis=2) / 255.
        glow[..., :3] = 255.
    glow[glow[..., 3] < 2] = 0.
    base[base[..., 3] == 0] = 0.
    return Image.fromarray(np.uint8(base), 'RGBA'), Image.fromarray(np.uint8(glow), 'RGBA')


def build_species(name):
    spec = SPECS[name]
    directory = OUT / (name + '-parts')
    (directory / 'parts').mkdir(parents=True, exist_ok=True)
    raw = Image.open(HERE / 'roster-source.png').convert('RGB').crop(spec['crop'])
    raw.save(directory / 'sheet-raw.png')
    rgb = np.array(raw)
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    lum = rgb.astype(float) @ np.array([.2126, .7152, .0722])
    delta = rgb.max(axis=2).astype(float) - rgb.min(axis=2)
    matte = np.maximum(np.clip((lum - 22.) / 15., 0., 1.),
                       np.clip((delta - 12.) / 20., 0., 1.) * np.clip((rgb.max(axis=2) - 32.) / 35., 0., 1.))

    def source(poly, holes=False, margin=4):
        roi = polygon(poly, (h, w), margin)
        alpha = matte * roi
        # Close small breaks in the lit contour before filling its dark chitin.
        # A one-pixel close left the original black material as sparse fragments.
        binary = ndimage.binary_closing(alpha > (.18 if not holes else .28), iterations=5 if not holes else 1) & roi
        if not holes:
            binary = ndimage.binary_fill_holes(binary) & roi
        alpha = np.maximum(alpha, binary.astype(float))
        result = np.dstack([rgb, np.uint8(alpha * 255.)])
        result[alpha == 0] = 0
        return Image.fromarray(np.uint8(result), 'RGBA')

    scale = 480. / (spec['extent'][1] - spec['extent'][0])
    mapping = np.array([[scale, 0., 320. - spec['cx'] * scale],
                        [0., scale, 80. - spec['extent'][0] * scale], [0., 0., 1.]])
    source_frame = warp(raw.convert('RGBA'), mapping)
    source_frame.save(directory / 'source-colour-frame.png')
    body_source = source(spec['bodyPolygon'], margin=8)
    extra_sources = [(e, source(e['polygon'], holes=e.get('holes', False), margin=3)) for e in spec['extras']]
    # Separate moving ornament/sac surfaces from the trunk without baking copies
    # into the head or body. Proximal overlap remains under the neighbouring plate.
    for e, image in extra_sources:
        arr = np.array(image)
        if e.get('cutout'):
            arr[polygon(e['cutout'], (h, w), 0), 3] = 0
        if e['group'] == 'sac':
            core = np.abs(xx - spec['cx']) < 30
            arr[core, 3] = 0
        image.paste(Image.fromarray(arr, 'RGBA'))
        if e.get('isolate'):
            b = np.array(body_source)
            distal = (arr[..., 3] > 128) & (np.hypot(xx - e['pivot'][0], yy - e['pivot'][1]) > 9.)
            b[distal, 3] = 0
            body_source = Image.fromarray(b, 'RGBA')

    posed, records = {}, []
    master = np.array(body_source.getchannel('A'))

    def add(name_part, image, selection, pivot, parent, z, group='body', end=None,
            mirror=True, probe=2., radius=7.):
        nonlocal master
        arr = np.array(image)
        master = np.maximum(master, arr[..., 3])
        arr[..., 3] = np.uint8(arr[..., 3].astype(float) * np.clip(selection, 0., 1.))
        arr[arr[..., 3] == 0] = 0
        part = warp(Image.fromarray(arr, 'RGBA'), mapping)
        assert part.getbbox(), f'Empty anatomical part: {name}/{name_part}'
        posed[name_part] = part
        point = np.round((mapping @ [*pivot, 1.])[:2], 3).tolist()
        record = dict(name=name_part, file=f'parts/{name_part}.png', glow=f'parts/{name_part}_glow.png',
                      offset=[0,0], pivot=point, parent=parent, z=z, group=group,
                      mirror=mirror, probeRadiusPx=probe, jointRadiusPx=radius)
        if end is not None:
            record['end'] = np.round((mapping @ [*end, 1.])[:2], 3).tolist()
        records.append(record)

    for p in spec['body']:
        slope = .24 * np.abs(xx - spec['cx'])
        band = np.clip(yy + slope - p['top'] + 1., 0., 1.) * np.clip(p['bottom'] - yy - slope + 1., 0., 1.)
        add(p['name'], body_source, band, p['pivot'], p['parent'], p['z'])
    for c in spec['chains']:
        image = source(c['polygon'])
        points = c['points']
        arc, lengths, _ = arclength(points, yy, xx)
        parent = c['parent']
        for index, segment in enumerate(c['names']):
            part_name = f'{segment}_{c["name"]}_r'
            length = lengths[index + 1] - lengths[index]
            lo = lengths[index] - (.18 * length if index else 5.)
            hi = lengths[index + 1] + 3.
            select = np.clip((arc - lo + 3.) / 4., 0., 1.) * np.clip((hi - arc + 3.) / 4., 0., 1.)
            add(part_name, image, select, points[index], parent, c['z'] + index * 5,
                c['group'], points[index + 1], probe=1.65, radius=7.)
            parent = part_name
    for e, image in extra_sources:
        add(e['name'], image, np.ones((h,w)), e['pivot'], e['parent'], e['z'],
            e['group'], mirror=e.get('mirror', True), probe=1.65)
    if spec['tail']:
        t = spec['tail']
        image = source(t['polygon'])
        points = resample_path(t['points'], t['count'])
        arc, lengths, _ = arclength(points, yy, xx)
        parent = t['parent']
        for index in range(t['count']):
            n = 'tail_tip' if index == t['count'] - 1 else f'tail_{index+1:02d}'
            length = lengths[index + 1] - lengths[index]
            select = np.clip((arc - (lengths[index] - .25 * length) + 1.) / 2., 0., 1.)
            select *= np.clip((lengths[index + 1] + 2. - arc) / 2., 0., 1.)
            add(n, image, select, points[index], parent, 48-index, 'tail', points[index+1],
                mirror=False, probe=1., radius=3.)
            parent = n

    # Place pivots in real overlapping tissue rather than manufacturing bigger
    # glossy sockets to make an arbitrary probe pass. Source pixels stay fixed.
    by_name = {p['name']: p for p in records}
    fy, fx = np.mgrid[:640, :640]
    pivot_adjustments = []
    for p in records:
        if p['parent'] is None:
            continue
        pa = np.array(posed[p['parent']].getchannel('A')) > 128
        ca = np.array(posed[p['name']].getchannel('A')) > 128
        common = pa & ca
        union = pa | ca
        inside = ndimage.distance_transform_edt(union) >= p['probeRadiusPx'] + .7
        x, y = p['pivot']
        candidates = common & inside & (np.hypot(fx + .5 - x, fy + .5 - y) < 24.)
        if np.any(candidates):
            dy, dx = np.nonzero(candidates)
            index = np.argmin((dx+.5-x)**2 + (dy+.5-y)**2)
            new = [float(dx[index]+.5), float(dy[index]+.5)]
            if np.linalg.norm(np.array(new)-p['pivot']) > 1.:
                pivot_adjustments.append(dict(part=p['name'], before=p['pivot'], after=new))
            p['pivot'] = new
            if 'end' in by_name[p['parent']]:
                by_name[p['parent']]['end'] = new

    # Add texture-matched, rounded tongues strictly inside opaque parent pixels.
    # In rest pose no new surface extends beyond its original neighbouring part.
    finished, overlaps = {}, []
    def finish(n):
        if n in finished:
            return finished[n]
        p = by_name[n]
        image = posed[n]
        if p['parent'] is None:
            finished[n] = image
            return image
        parent = finish(p['parent'])
        pr = np.array(parent)
        covered = ndimage.binary_erosion(pr[...,3] > 250, iterations=1)
        point = np.array(p['pivot'])
        direction = np.array(by_name[p['parent']]['pivot']) - point
        direction /= max(np.linalg.norm(direction), .001)
        span = np.linalg.norm(np.array(p.get('end', [point[0],point[1]+50]))-point)
        depth = span * (.25 if p['group'] in ('body','tail') else .18)
        vector = direction * depth
        along = np.clip(((fx+.5-point[0])*vector[0]+(fy+.5-point[1])*vector[1]) / max(vector@vector,.001), 0., 1.)
        distance = np.hypot(fx+.5-(point[0]+along*vector[0]), fy+.5-(point[1]+along*vector[1]))
        mask = np.clip((p['jointRadiusPx']-distance)/1.2,0.,1.) * covered
        pr[...,3] = np.uint8(mask*255.)
        pr[pr[...,3]==0] = 0
        result = Image.fromarray(pr,'RGBA')
        result.alpha_composite(image)
        added = (np.array(result.getchannel('A'))>128) & (np.array(image.getchannel('A'))<=128)
        assert np.all(~added | covered)
        overlaps.append(dict(part=n, addedOpaquePixels=int(added.sum()), outsideParentPixels=0, tongueDepthPx=round(depth,3)))
        finished[n] = result
        return result

    for p in records:
        image = finish(p['name'])
        x0,y0,x1,y1 = image.getbbox()
        box = [x0-PAD,y0-PAD,x1+PAD,y1+PAD]
        assert min(box[:2])>=0 and max(box[2:])<=640, (name,p['name'],box)
        part = image.crop(box)
        base, glow = emission(part, spec['colour'])
        base.save(directory/p['file']);glow.save(directory/p['glow'])
        p['offset'] = box[:2]
        p['hasEmission'] = bool(glow.getchannel('A').getbbox())

    Image.fromarray(master,'L').save(directory/'reference-mask.png')
    manifest = dict(size=[640,640],centerX=320,lengthPx=480,light='top',paddingPx=PAD,
                    root=next(p['name'] for p in records if p['parent'] is None),
                    parts=records, neutralGlow=spec['colour']=='shifting',
                    colour=spec['colour'],gamePreviewLengthPx=spec['game'],
                    referenceTransform=mapping.tolist(),visibleSource='sheet-raw.png: original roster pixels',
                    description=spec['description'],tailSegmentCount=spec['tail']['count'] if spec['tail'] else 0,
                    hiddenUnderlaps=overlaps,pivotAdjustments=pivot_adjustments,
                    mirror=dict(suffix='_r',centerX=320,rule='Reflect right geometry and negate local rotation. Explicit wing_l/wing_r are independent.'),
                    glowBlend='additive RGB weighted by alpha; Stalker glow RGB is neutral white',
                    lightingNote='Original baked highlights retained; strict 12 oclock relighting remains approximate.')
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for action in ['build','render']:
        wrapper=f"from pathlib import Path\nimport sys\nsys.dont_write_bytecode = True\nsys.path.insert(0,str(Path(__file__).resolve().parent.parent/'puppet-tools'))\nfrom build_all import {action}_species\n{action}_species({name!r})\n"
        (directory/(action+'.py')).write_text(wrapper)
    print(name, 'built',len(records),'source parts',flush=True)


def render_species(name):
    directory = OUT/(name+'-parts')
    spec = SPECS[name]
    puppet = Puppet(directory)
    puppet.validate_files()
    assembled = puppet.render()
    assembled.save(directory/'assembled.png')
    background = Image.new('RGBA',(640,640),GROUND);background.alpha_composite(assembled)
    background.convert('RGB').save(directory/'assembled-ground.png')
    puppet.render(glow=False).save(directory/'assembled-base.png')
    preview_size = round(640*spec['game']/480)
    clean_resample(assembled.resize((preview_size,preview_size),Image.Resampling.LANCZOS)).save(directory/'game-scale.png')
    source_frame = Image.open(directory/'source-colour-frame.png').convert('RGBA')
    comparison=Image.new('RGBA',(1280,704),(22,22,20,255))
    comparison.alpha_composite(source_frame,(0,32));comparison.alpha_composite(background,(640,32))
    draw=ImageDraw.Draw(comparison)
    draw.text((20,8),name.upper()+' · ORIGINAL ROSTER',font=font(18),fill=(240,228,215))
    draw.text((660,8),f'{len(puppet.parts)} PARTS · ORIGINAL VISIBLE ART',font=font(18),fill=(240,228,215))
    draw.text((20,676),'Matching scale and head alignment; original highlights retained',font=font(14),fill=(163,149,137))
    comparison.convert('RGB').save(directory/'comparison.png')

    poses=[('APPENDAGES +20°',20,0),('APPENDAGES −20°',-20,0),('BODY / TAIL +6°',0,6),('BODY / TAIL −6°',0,-6)]
    padding=192;cell=640+padding*2
    strip=Image.new('RGBA',(cell*4,cell+64),GROUND);draw=ImageDraw.Draw(strip)
    checks={};clipped=[];fringe=0
    def inspect(image,label):
        nonlocal fringe
        arr=np.array(image);rgb=arr[...,:3].astype(int);a=arr[...,3]
        fringe+=int(np.count_nonzero((rgb[...,1]-np.maximum(rgb[...,0],rgb[...,2])>12)&(a>8)))
        if np.any(a[0]) or np.any(a[-1]) or np.any(a[:,0]) or np.any(a[:,-1]):clipped.append(label)
    inspect(assembled,'rest')
    for i,(label,limb,bend) in enumerate(poses):
        image=puppet.render(limb,bend,padding=padding)
        strip.alpha_composite(image,(cell*i,32));inspect(image,label)
        draw.text((cell*i+20,8),label,font=font(18),fill=(240,228,215))
        draw.text((cell*i+20,cell+38),'Manifest rig · diagnostic margin 192px',font=font(14),fill=(163,149,137))
        checks[label]=puppet.joint_checks(limb,bend)
    strip.convert('RGB').save(directory/'joints-test.png')
    for limb,bend in [(25,0),(-25,0),(0,8),(0,-8),(25,8),(-25,-8),(25,-8),(-25,8)]:
        label=f'limit appendages={limb:+}, body/tail={bend:+}'
        checks[label]=puppet.joint_checks(limb,bend)
        inspect(puppet.render(limb,bend,padding=padding),label)
    gaps=[dict(j,pose=label) for label,joints in checks.items() for j in joints if j['gap']]
    active=np.array(assembled.getchannel('A'))>128
    ys,xs=np.nonzero(active)
    report=dict(partCount=len(puppet.parts),glowCount=len(puppet.glow),assembledInstanceCount=len(puppet.nodes),
                tailSegmentCount=puppet.manifest['tailSegmentCount'],greenFringePixels=fringe,clippedPoses=clipped,
                opaqueLengthPx=int(ys.max()-ys.min()+1),outsideParentUnderlapPixels=0,gapJoints=gaps,poses=checks,
                method='Opaque parent/child contact plus an anatomy-sized pivot probe; thin tails use a 1px probe.')
    (directory/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
    if name=='stalker':
        cycle=Image.new('RGBA',(1920,704),GROUND);d=ImageDraw.Draw(cycle)
        for i,(label,colour) in enumerate([('BLUE',(69,210,255)),('RED',(255,106,42)),('PURPLE',(185,124,255))]):
            image=puppet.render(tint=colour)
            cycle.alpha_composite(image,(640*i,32))
            d.text((640*i+24,8),label+' · WHITE GLOW MASK TINT',font=font(18),fill=(240,228,215))
        cycle.convert('RGB').save(directory/'glow-cycle.png')
    if name in ['glider','broodmother','hive-tyrant']:
        feature=Image.new('RGBA',(1920,704),GROUND);d=ImageDraw.Draw(feature)
        for i,value in enumerate([-1,0,1]):
            if name=='broodmother':
                image=puppet.render(sac_scale=1.+value*.06);label=f'EGG SAC {round((1.+value*.06)*100)}%'
            elif name=='glider':
                image=puppet.render(angles={'wing_r':value*15,'wing_l':-value*15});label=f'SHOULDER FLAP {value*15:+}°'
            else:
                angles={'crest':value*3}
                for n,left in puppet.nodes:
                    if puppet.parts[n]['group']=='arm':
                        angles[n[:-2]+'_l' if left else n]=value*12*(-1 if left else 1)
                image=puppet.render(angles=angles);label=f'SCYTHE ARMS {value*12:+}° / CREST {value*3:+}°'
            feature.alpha_composite(image,(640*i,32));d.text((640*i+20,8),label,font=font(18),fill=(240,228,215))
        feature.convert('RGB').save(directory/'feature-test.png')
    if name in ['skitter','stalker','hive-tyrant']:
        tail_strip=Image.new('RGBA',(1920,704),GROUND);d=ImageDraw.Draw(tail_strip)
        for i,value in enumerate([-6,0,6]):
            angles={n:value for n,p in puppet.parts.items() if p['group']=='tail'}
            tail_strip.alpha_composite(puppet.render(angles=angles),(640*i,32))
            d.text((640*i+20,8),f'{puppet.manifest["tailSegmentCount"]} TAIL LINKS · {value:+}° EACH',font=font(18),fill=(240,228,215))
        tail_strip.convert('RGB').save(directory/'tail-test.png')
    # Every part is shown from the actual PNGs, not a newly generated atlas.
    cols=5;rows=math.ceil(len(puppet.parts)/cols)
    atlas=Image.new('RGBA',(cols*200,rows*220),GROUND);d=ImageDraw.Draw(atlas)
    for i,(n,p) in enumerate(puppet.parts.items()):
        x,y=(i%cols)*200,(i//cols)*220
        tile=puppet.base[n].copy()
        emit=puppet.preview_glow[n] if puppet.preview_glow is not None else puppet.glow[n]
        puppet.add_emission(tile,emit,(0,0))
        tile.thumbnail((176,180),Image.Resampling.LANCZOS)
        atlas.alpha_composite(tile,(x+(200-tile.width)//2,y+8))
        d.text((x+8,y+192),n,font=font(11),fill=(220,210,200))
    atlas.convert('RGB').save(directory/'parts-sheet.png')
    print(name,'rendered',len(gaps),'flagged joints;',fringe,'green pixels;',clipped,'clipped poses',flush=True)
    if gaps:
        print([(j['joint'],j['pose'],j['overlapPixels'],j['pivotCoverage']) for j in gaps],flush=True)
    assert not gaps, f'{name}: joint contacts need repair; see validation.json'
    assert fringe==0 and not clipped, f'{name}: fringe or clipping needs repair'
    return report


def run(names):
    for name in names:
        build_species(name)
        render_species(name)


if __name__=='__main__':
    run(sys.argv[1:] or list(SPECS))
