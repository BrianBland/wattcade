"""Deep lava pool: an organic pool sunk into the rock. Far bank shows a short rock drop, near bank a lit rim.
The surface is crust plates (dark, still) split by glowing molten seams; the middle runs hotter with fewer plates.
Surface is emissive and animated (seams pulse, molten patches shimmer, bubbles rise and pop)."""
import math, random
from PIL import Image

def hx(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
CRUST0, CRUST1, CRUST2 = hx('#1e0a0e'), hx('#3a0e16'), hx('#64161f')
MOLT = [hx('#922430'), hx('#c23a3a'), hx('#d24a16'), hx('#ff8a2a'), hx('#ffc04a'), hx('#ffe08a'), hx('#fff4cc')]

BLOBS = [(124, 212, 58, 23), (206, 220, 56, 21), (292, 211, 46, 19), (80, 201, 26, 13), (166, 217, 34, 18), (250, 214, 34, 17)]
def _field(x, y):
    s = 0
    for (cx, cy, rx, ry) in BLOBS:
        d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        if d < 1: s += (1 - d) ** 2
    return s
MASK = set()
for y in range(170, 250):
    for x in range(30, 420):
        if _field(x + .5, y + .5) > .16: MASK.add((x, y))
def inside(x, y): return (x, y) in MASK

def depth_from_top(x, y):
    k = 0
    while (x, y - k - 1) in MASK and k < 6: k += 1
    return k
def edge_dist(x, y, lim=4):
    for r in range(1, lim + 1):
        for (dx, dy) in ((r, 0), (-r, 0), (0, r), (0, -r)):
            if (x + dx, y + dy) not in MASK: return r
    return lim + 1

DROP = 3   # rows of far-bank rock face visible inside the pool
def surface(x, y): return inside(x, y) and depth_from_top(x, y) >= DROP

def paint_base(px, C):
    """banks into the floor image (lit normally): far-bank rock drop, near-bank rim, side rims."""
    for (x, y) in MASK:
        k = depth_from_top(x, y)
        if k < DROP: px[x, y] = C([4, 3, 2][k])
        else: px[x, y] = CRUST1
    for (x, y) in MASK:
        if (x, y + 1) not in MASK:    # near bank: lit rim then a darker step
            px[x, y + 1] = C(7); px[x, y + 2] = C(6) if (x, y + 2) not in MASK else px[x, y + 2]
            if (x, y + 3) not in MASK: px[x, y + 3] = C(4)
        if (x, y - 1) not in MASK:    # far bank: lip catches the glow
            px[x, y - 1] = C(6)
        for dx in (-1, 1):
            if (x + dx, y) not in MASK and (x + dx, y - 1) in MASK or ((x + dx, y) not in MASK and depth_from_top(x, y) >= DROP):
                if (x + dx, y) not in MASK: px[x + dx, y] = C(5)

def frames(size, n=6, seed=8):
    """emissive surface frames"""
    rnd = random.Random(seed)
    seeds = []
    for gy in range(165, 255, 10):
        for gx in range(25, 425, 11):
            seeds.append((gx + rnd.uniform(0, 9), gy + rnd.uniform(0, 8)))
    def near2(x, y):
        a = b = 1e9
        for (sx, sy) in seeds:
            if abs(sx - x) > 22 or abs(sy - y) > 20: continue
            d = math.hypot(x - sx, (y - sy) * 1.2)
            if d < a: a, b = d, a
            elif d < b: b = d
        return a, b
    pre = {}
    for (x, y) in MASK:
        if not surface(x, y): continue
        hot = min(1.0, (edge_dist(x, y, 9) - 1) / 8)          # 0 at the banks, 1 in open middle
        d1, d2 = near2(x + .5, y + .5)
        pre[(x, y)] = (hot, d1, d2)
    bub = [(x, y) for (x, y), (hot, d1, d2) in pre.items() if hot > .7]
    rnd.shuffle(bub); bub = bub[:n * 3]
    out = []
    for f in range(n):
        im = Image.new('RGBA', size); p = im.load()
        for (x, y), (hot, d1, d2) in pre.items():
            seam_w = .75 + 1.3 * hot
            plate_r = 11 - 4.5 * hot                       # plates shrink toward the hot middle
            if edge_dist(x, y, 2) <= 1: c = CRUST0         # cooled skin against the rock
            elif d2 - d1 < seam_w or d1 > plate_r:
                # molten: pulses travel along the flow (+x); brighter at plate junctions and in the middle
                ph = math.sin((x - f * (440 / n) / 6.0) / 7.0 + y / 9.0) * .5 + .5
                v = 1.2 + hot * 2.4 + ph * 1.3 + (1 if d2 - d1 < .35 else 0)
                c = MOLT[max(1, min(6, int(v)))]
            else:
                c = CRUST1
                if d1 > plate_r - 1.3: c = CRUST2       # plate edge catching light from the seam
                if d1 < 1.2 and hot < .5: c = CRUST0
            p[x, y] = c
        for i, (bx, by) in enumerate(bub):           # bubbles: each lives 3 frames, staggered
            age = (f - i) % n
            if age == 0: p[bx, by] = MOLT[6]
            elif age == 1:
                for (dx, dy) in ((0, -1), (-1, 0), (1, 0), (0, 1)):
                    if (bx + dx, by + dy) in pre: p[bx + dx, by + dy] = MOLT[5]
                p[bx, by] = MOLT[3]
            elif age == 2:
                for (dx, dy) in ((-2, -1), (2, -1), (-1, 1), (1, 1)):
                    if (bx + dx, by + dy) in pre: p[bx + dx, by + dy] = MOLT[5]
        out.append(im)
    return out

def points(k=60, seed=3):
    rnd = random.Random(seed); pts = [p for p in MASK if surface(*p)]; rnd.shuffle(pts); return pts[:k]
