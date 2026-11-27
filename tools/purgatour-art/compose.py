"""Floor composition pass, run on every zone's base: large-scale wear and grime (one ramp step, chunky 2x2 dither at the edges),
cracked slabs, pebbles, and zone dressing at the wall bases (moss, roots, grit). Only touches pixels in the zone's 12 stone colours,
so carpets, pools, lava and decals stay as drawn."""
import math, random
from PIL import Image
BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

def compose(im, ramp, floor, nearwall, seed=1, moss=None, grit=None, period=None):
    px = im.load(); W, H = im.size; rnd = random.Random(seed)
    idx = {tuple(c[:3]): i for i, c in enumerate(ramp)}
    def step(x, y, d):
        c = px[x, y]; i = idx.get(tuple(c[:3]))
        if i is None: return False
        px[x, y] = ramp[max(0, min(11, i + d))]; return True
    ph = [rnd.random() * 6 for _ in range(6)]
    # 1. wear (lighter, along walking lines) and grime (darker, in corners), on a 2x2 grid so the dither reads as clusters
    for by in range(0, H, 2):
        for bx in range(0, W, 2):
            if not floor(bx, by): continue
            if period:   # same look, but whole cycles per tile so a repeating texture has no seam
                q = 2 * math.pi / period
                n = (math.sin(bx * q * 2 + ph[0]) * math.cos(by * q * 2 + ph[1]) + .6 * math.sin((bx + by) * q * 3 + ph[2]) + .35 * math.sin(bx * q * 6 - by * q * 5 + ph[3])) / 1.95
            else:
                n = (math.sin(bx / 47 + ph[0]) * math.cos(by / 39 + ph[1]) + .6 * math.sin((bx + by) / 29 + ph[2]) + .35 * math.sin(bx / 13 - by / 17 + ph[3])) / 1.95
            th = BAY[((by >> 1) & 3) * 4 + ((bx >> 1) & 3)] / 16
            d = 0
            if n > .42 and (n - .42) / .14 > th: d = 1
            elif n < -.40 and (-.40 - n) / .14 > th: d = -1
            if nearwall(bx, by) < 10 and th < .5 - nearwall(bx, by) / 20: d = min(d, 0) - 1     # damp band at wall bases
            if d:
                for (x, y) in ((bx, by), (bx + 1, by), (bx, by + 1), (bx + 1, by + 1)):
                    if x < W and y < H and floor(x, y): step(x, y, d)
    # 2. cracks: jagged dark lines with a lit lip under them
    for _ in range(9):
        for _try in range(40):
            x, y = rnd.randrange(W), rnd.randrange(H)
            if floor(x, y) and nearwall(x, y) > 14 and tuple(px[x, y][:3]) in idx: break
        else: continue
        dx = rnd.choice((-1, 1)); ln = rnd.randrange(6, 15)
        for i in range(ln):
            if not floor(x, y): break
            c = idx.get(tuple(px[x, y][:3]))
            if c is None: break
            px[x, y] = ramp[max(0, c - 3)]
            if floor(x, y + 1) and tuple(px[x, y + 1][:3]) in idx: step(x, y + 1, 1)
            x += dx if rnd.random() < .7 else 0; y += rnd.choice((0, 0, 1, -1))
            if rnd.random() < .15:   # a short branch
                bx_, by_ = x, y + 1
                if floor(bx_, by_) and tuple(px[bx_, by_][:3]) in idx: px[bx_, by_] = ramp[max(0, idx[tuple(px[bx_, by_][:3])] - 2)]
    # 3. pebbles: a lit pixel with its own shadow
    for _ in range(46):
        x, y = rnd.randrange(1, W - 2), rnd.randrange(1, H - 2)
        if not (floor(x, y) and floor(x + 1, y + 1)): continue
        if tuple(px[x, y][:3]) in idx and tuple(px[x + 1, y + 1][:3]) in idx:
            step(x, y, 3); step(x + 1, y + 1, -2)
            if rnd.random() < .4 and tuple(px[x + 1, y][:3]) in idx: step(x + 1, y, 2)
    # 4. wall-base dressing: moss / roots / grit in small clusters
    for (cols, n) in ((moss, 34), (grit, 30)):
        if not cols: continue
        for _ in range(n):
            for _try in range(60):
                x, y = rnd.randrange(W), rnd.randrange(H)
                if floor(x, y) and nearwall(x, y) < 4 and tuple(px[x, y][:3]) in idx: break
            else: continue
            for k in range(rnd.randrange(2, 6)):
                X, Y = x + rnd.randrange(-2, 3), y + rnd.randrange(-1, 2)
                if 0 <= X < W and 0 <= Y < H and floor(X, Y) and tuple(px[X, Y][:3]) in idx:
                    px[X, Y] = cols[0] if k % 3 else cols[min(1, len(cols) - 1)]
    return im

def room_fns(wall, T=32, rise=0):
    """floor(x,y) and nearwall(x,y) for a tile layout predicate wall(tx,ty)"""
    def floor(x, y): return not wall(x // T, y // T)
    def nearwall(x, y):
        tx, ty, fx, fy = x // T, y // T, x % T, y % T; d = 99
        if wall(tx, ty - 1): d = min(d, fy)
        if wall(tx - 1, ty): d = min(d, fx)
        if wall(tx + 1, ty): d = min(d, T - 1 - fx)
        if wall(tx, ty + 1): d = min(d, T - 1 - fy + 6)
        return d
    return floor, nearwall

def tops(im, ramp, wall, face, T=32, rise=16, seed=3):
    """capstones on the flat wall tops: running bond in the two darkest steps, lit top-left edges, a few odd stones"""
    px = im.load(); W, H = im.size; rnd = random.Random(seed); flat = tuple(ramp[1][:3])
    odd = {}
    for y in range(H):
        for x in range(W):
            tx, ty = x // T, y // T
            if not wall(tx, ty) or face(tx, ty): continue
            if face(tx, ty + 1) and y % T >= T - rise: continue
            if tuple(px[x, y][:3]) != flat: continue
            row = y // 18; ox = (row % 2) * 15 + (row * 11) % 7
            sx = (x + ox) // 30; fx = (x + ox) % 30; fy = y % 18
            key = (sx, row)
            if key not in odd: odd[key] = rnd.random()
            c = 1
            if fy == 0 or fx == 0: c = 0 if (x + y) % 3 else 1       # broken seams between big flat slabs
            elif fy == 1 or fx == 1: c = 2                          # lit lip on the slab's top-left
            elif odd[key] > .8 and (x * 5 + y * 3) % 11 == 0: c = 2    # weathering flecks
            elif odd[key] < .2 and (x * 7 + y * 5) % 13 == 0: c = 0
            px[x, y] = ramp[c]
    return im
