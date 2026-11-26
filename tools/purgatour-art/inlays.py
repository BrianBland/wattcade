"""Room centrepieces painted flat into the floor (3/4 view, so circles are squashed to 0.72 tall).
Stone colours come from the zone ramp (call zones.use first); glowing pieces are drawn again over the lighting."""
import math, random
from PIL import Image
from pal import C
import motifs, zones

SQ = 0.72
def _img(w, h): return Image.new('RGBA', (w, h))

def rosette(R=30):
    """Keep: an inlaid compass rose in two stone tones with a brass ring."""
    W, H = R * 2 + 3, int(R * 2 * SQ) + 3; im = _img(W, H); px = im.load(); cx, cy = W / 2 - .5, H / 2 - .5
    for y in range(H):
        for x in range(W):
            dx, dy = (x - cx) / R, (y - cy) / (R * SQ); d = math.hypot(dx, dy)
            if d > 1: continue
            a = math.atan2(dy, dx)
            if d > .9: c = 23 if dy < 0 else 22                         # brass ring, lit on top
            elif d > .84: c = 3
            else:
                def arm(step, off, reach, wid):
                    q = (a - off) % step; q = q - step if q > step / 2 else q
                    return (q if abs(q) < wid * (1 - d / reach) else None) if d < reach else None
                q1 = arm(math.pi / 2, 0, .84, .42); q2 = arm(math.pi / 2, math.pi / 4, .56, .34)
                if q1 is not None: c = 9 if q1 < 0 else 6
                elif q2 is not None: c = 7 if q2 < 0 else 5
                else: c = 4 if (int(d * 8) % 2) else 3
                if d < .1: c = 24
            px[x, y] = C(c)
    return im

def ledger(skull=True, seed=0):
    """Crypt: a flush grave slab with a bevelled edge, an engraved skull or chainring, and a line of worn lettering."""
    W, H = 30, 20; im = _img(W, H); px = im.load(); rnd = random.Random(seed)
    for y in range(H):
        for x in range(W):
            e = min(x, y, W - 1 - x, H - 1 - y)
            c = 8 if e == 0 and (x == 0 or y == 0) else 3 if e == 0 else 7 if e == 1 and (x == 1 or y == 1) else 5 if e == 1 else 6
            if e > 1 and rnd.random() < .05: c = 5
            px[x, y] = C(c)
    if skull:
        for r, row in enumerate(['.333.', '3.3.3', '33333', '.3.3.']):
            for k, ch in enumerate(row):
                if ch == '3': px[12 + k, 4 + r] = C(3); px[13 + k, 5 + r] = C(8) if r == 0 else px[13 + k, 5 + r]
    else:
        for (x, y) in motifs.chainring_sigil(4.2, 10):
            if 0 <= 15 + x < W and 0 <= 7 + y < H and abs(y) < 6: px[15 + x, 7 + y] = C(3)
    for x in range(6, 24):
        if x % 3 != 2: px[x, 13] = C(4)
        if x % 4 != 1 and x < 20: px[x, 15] = C(4)
    return im

def mosaic(R=28):
    """Catacombs: an ossuary rosette set into the floor, a wheel of long bones around a skull hub."""
    W, H = R * 2 + 3, int(R * 2 * SQ) + 3; im = _img(W, H); px = im.load(); cx, cy = W / 2 - .5, H / 2 - .5
    for y in range(H):
        for x in range(W):
            dx, dy = (x - cx), (y - cy) / SQ; d = math.hypot(dx, dy)
            if d > R: continue
            if d > R - 2.4: c = 10 if dx + dy < 0 else 8
            elif d > R - 3.6: c = 2
            else: c = 2 if (int(d) % 6) else 3
            px[x, y] = C(c)
    for k in range(12):
        a = k * math.pi / 6
        for t in range(6, R - 4):
            x, y = round(cx + math.cos(a) * t), round(cy + math.sin(a) * t * SQ)
            px[x, y] = C(11 if t in (6, R - 5) else 9)
            if t in (6, R - 5): px[x + 1, y] = C(9)
    for r, row in enumerate(zones.SKULL):
        for k, ch in enumerate(row):
            if ch != '.': px[round(cx) - 3 + k, round(cy) - 3 + r] = C({'b': 10, 'B': 11, 'c': 9, '0': 1, 't': 3}[ch])
    return im

LAVA = ['#5a1206', '#9a2a0a', '#d24a16', '#ff8a2a', '#ffc04a']
def _hx(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
def fissure(seed=3, W=84, H=30):
    """Deep: a glowing crack in the rock, branching, hot at its core (emissive)."""
    im = _img(W, H); px = im.load(); rnd = random.Random(seed)
    def crack(x, y, dx, n, w):
        for _ in range(n):
            for k in range(-w, w + 1):
                if 0 <= x < W and 0 <= y + k < H:
                    core = abs(k) < max(1, w - 1)
                    px[x, y + k] = _hx(LAVA[4] if core and w > 1 and abs(k) == 0 else LAVA[3] if core else LAVA[1])
            for k in (-w - 1, w + 1):
                if 0 <= x < W and 0 <= y + k < H and px[x, y + k][3] == 0: px[x, y + k] = C(1)
            x += dx; y += rnd.choice((-1, 0, 0, 1)); y = max(3, min(H - 4, y))
            if w > 1 and rnd.random() < .08: crack(x, y, dx, rnd.randrange(6, 14), w - 1)
    crack(2, H // 2, 1, W - 4, 2)
    return im

def rune(R=20):
    """Deep: a chainring seal cut into the floor, glowing violet (emissive)."""
    W, H = R * 2 + 5, int(R * 2 * SQ) + 5; im = _img(W, H); px = im.load(); cx, cy = W // 2, H // 2
    VI = [_hx('#3a1a6a'), _hx('#7a3ad0'), _hx('#c77dff'), _hx('#f0d8ff')]
    for y in range(H):
        for x in range(W):
            dx, dy = x - cx, (y - cy) / SQ; d = math.hypot(dx, dy); a = math.atan2(dy, dx)
            tooth = math.cos(a * 20) > .3
            if R - 2 < d <= R or (R < d <= R + 2 and tooth): px[x, y] = VI[2] if dy < 0 else VI[1]
            elif abs(d - R * .45) < 1: px[x, y] = VI[2]
            elif d < R * .3 and any(abs((a - k * 2 * math.pi / 5) % (2 * math.pi) - math.pi) > math.pi - .22 for k in range(5)) and d > 2: px[x, y] = VI[1]
            elif abs(d - (R - 3)) < .6: px[x, y] = VI[0]
    px[cx, cy] = VI[3]
    return im
