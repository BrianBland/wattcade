"""Fixed lane registration and fully cleared plateau pads for the painted map.
Left/center retain sim/defs.ts; right controls follow the authored painted floor.
Geometry changes are integration data, not applied to game simulation here.
"""
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SIZE = (1536, 1024)
FRAME = dict(x=318, y=32, size=900, units=100)
CURRENT_CONTROLS = [[[-3, 16], [28, 18], [18, 66], [50, 90]],
                    [[50, -3], [34, 28], [66, 52], [50, 90]],
                    [[103, 16], [72, 18], [82, 66], [50, 90]]]
CONTROLS = [CURRENT_CONTROLS[0], CURRENT_CONTROLS[1],
            [[103, 16], [84, 18], [87, 66], [50, 90]]]


def points(ctrl, n=161):
    c = np.asarray(ctrl, dtype=float)
    t = np.linspace(0, 1, n)[:, None]
    return ((1-t)**3*c[0] + 3*(1-t)**2*t*c[1] +
            3*(1-t)*t**2*c[2] + t**3*c[3])


def pixel(p):
    return (FRAME['x']+p[0]*FRAME['size']/100, FRAME['y']+p[1]*FRAME['size']/100)


def lane_at(ctrl, fraction):
    p = points(ctrl)
    lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    d = fraction*lengths[-1]
    i = min(np.searchsorted(lengths, d, side='right')-1, len(p)-2)
    q = (d-lengths[i])/(lengths[i+1]-lengths[i])
    tangent = p[i+1]-p[i]
    normal = np.array([tangent[1], -tangent[0]])/np.linalg.norm(tangent)
    return p[i]*(1-q)+p[i+1]*q, normal


def distance(p, curve):
    a, d = curve[:-1], np.diff(curve, axis=0)
    t = np.clip(((p-a)*d).sum(axis=1)/(d*d).sum(axis=1), 0, 1)
    return np.linalg.norm(p-(a+t[:, None]*d), axis=1).min()


def plateau_coverage(image):
    """Conservative rock-top material support over an entire platform footprint.
    Brown dirt/cut faces are excluded; numeric distance and visual proof also apply.
    FFT convolution is only a measurement, not a modification of the painting.
    """
    rgb = np.asarray(image.convert('RGB')).astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    # Warm charcoal and trapped dust remain valid plateau materials; distinctly
    # tan floors/faces are excluded. This supplements geometry and visual review.
    top = (r <= 1.30*np.maximum(g, 1)) & (g <= 1.6*np.maximum(b, 1))
    y = np.fft.fftfreq(rgb.shape[0])*rgb.shape[0]
    x = np.fft.fftfreq(rgb.shape[1])*rgb.shape[1]
    radius = 4.2*FRAME['size']/100
    kernel = (y[:, None]**2+x[None, :]**2 <= radius**2).astype(float)
    kernel /= kernel.sum()
    return np.fft.ifft2(np.fft.fft2(top)*np.fft.fft2(kernel)).real


def make():
    curves = [points(c) for c in CONTROLS]
    pads = []
    specs = [(0, .52, -1), (0, .78, 1), (1, .3, 1),
             (1, .6, -1), (2, .52, 1), (2, .78, -1)]
    candidates = [np.array([x, y], dtype=float) for y in np.arange(19, 79, .5)
                  for x in np.arange(11, 95, .5)]
    valid = [(p, min(distance(p, c) for c in curves)) for p in candidates]
    valid = [(p, d) for p, d in valid if d >= 11.2 and np.linalg.norm(p-[50, 90]) >= 17]
    coverage = plateau_coverage(Image.open(HERE/'raw/battlefield-painted-v4-raw.png'))
    valid = [(p, d) for p, d in valid if coverage[round(pixel(p)[1]), round(pixel(p)[0])] >= .915]
    for i, (lane, f, side) in enumerate(specs):
        p, normal = lane_at(CONTROLS[lane], f)
        previous, old_normal = lane_at(CURRENT_CONTROLS[lane], f)
        old = previous+old_normal*side*8
        wanted = p+normal*side*13
        choices = [(np.linalg.norm(q-wanted), q, d) for q, d in valid
                   if all(np.linalg.norm(q-np.array(v['position'])) >= 10 for v in pads)]
        _, q, d = min(choices, key=lambda v: v[0])
        pads.append(dict(id=i, lane=lane, near=f > .6, position=q.tolist(),
                         previousPosition=old.tolist(), footprintRadius=4.2,
                         rockTopSupport=round(float(coverage[round(pixel(q)[1]), round(pixel(q)[0])]), 4),
                         minimumLaneDistance=round(float(d), 3)))
    data = dict(size=list(SIZE), field=FRAME, lanes=[dict(id=i, controls=c,
                previousControls=CURRENT_CONTROLS[i], requiresSimChange=i == 2,
                floorWidth=8, bankWidth=2) for i, c in enumerate(CONTROLS)],
                pads=pads, outpost=dict(position=[50, 90], footprintRadius=11),
                integration='Left/center lane controls retain current sim/defs.ts. Right lane '
                            'controls are registered to its painted floor. Adopt these controls '
                            'and plateau pad positions together during renderer integration; '
                            'no simulation code changed in this asset PR.')
    (HERE/'map-layout.json').write_text(json.dumps(data, indent=2)+'\n')
    guide = Image.new('RGB', SIZE, '#303036')
    g = ImageDraw.Draw(guide)
    for c in curves:
        tangent = c[1]-c[0]
        extended = np.vstack([c[0]-tangent/np.linalg.norm(tangent)*80, c])
        tangents = np.gradient(extended, axis=0)
        normals = np.stack([-tangents[:, 1], tangents[:, 0]], axis=1)
        normals /= np.linalg.norm(normals, axis=1)[:, None]
        for width, color in [(12, '#756651'), (8, '#b8a084')]:
            left = extended+normals*width/2
            right = extended-normals*width/2
            g.polygon([pixel(v) for v in np.vstack([left, right[::-1]])], fill=color)
    for pad in pads:
        x, y = pixel(pad['position']); r = 4.5*FRAME['size']/100
        g.ellipse((x-r, y-r, x+r, y+r), fill='#6d6d70', outline='#deddd8', width=2)
    x, y = pixel([50, 90]); r = 11*FRAME['size']/100
    g.ellipse((x-r, y-r, x+r, y+r), fill='#898479')
    guide.save(HERE/'map-layout-guide.png')
    print(json.dumps(pads))


if __name__ == '__main__':
    make()
