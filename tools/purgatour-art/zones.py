"""Purgatour zones in the round-14 style: Crypt, Catacombs, Deep. Same wall/floor system as the Keep,
their own stone ramp (the 12 neutrals are swapped per zone), floor construction, wall face, door, hazard and props."""
import os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pal
from pal import C, art, selout, pad, put, CLEAR
from PIL import Image, ImageDraw
import keep
from keep import slab, stamp, trim, bands, h, FLAME
import motifs

T = 32; FH = 48; RISE = 16
def hexc(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

RAMPS = {
    'keep': None,
    'crypt': ['#080a11', '#0f131d', '#161c29', '#1f2737', '#2a3446', '#374357', '#475468', '#5b687b', '#748093', '#929dae', '#b8c1cc', '#e2e7ec'],
    'catacombs': ['#0d0907', '#17110d', '#221913', '#2e231a', '#3d2f22', '#4e3d2c', '#624e39', '#796249', '#937a5c', '#ae9674', '#cbb793', '#ece0c4'],
    'deep': ['#060508', '#0b0a10', '#121018', '#1a1721', '#231f2c', '#2e2938', '#3a3446', '#494255', '#5a5267', '#70677d', '#8f869b', '#b8b0bf'],
}
SAVED = list(pal.PAL)
def use(zone):
    pal.PAL[:] = SAVED
    if RAMPS.get(zone):
        for i, hx in enumerate(RAMPS[zone]): pal.PAL[i] = hexc(hx)

class Room:
    def __init__(s, layout): s.L = layout; s.W = len(layout[0]); s.H = len(layout)
    def tile(s, x, y): return 'W' if x < 0 or y < 0 or x >= s.W or y >= s.H else s.L[y][x]
    def wall(s, x, y): return s.tile(x, y) in 'WDLR'
    def face(s, x, y): return s.wall(x, y) and not s.wall(x, y + 1) and y + 1 < s.H

def big(w, hg): return Image.new('RGBA', (w + 64, hg + 64))
def crop_in(im, w, hg): return im.crop((32, 32, 32 + w, 32 + hg))

# ================================================================== floors
def floor_crypt(w, hg, seed=3):
    """grave slabs: long 32x16 slabs in running bond; some are engraved grave covers with a border and a cross."""
    im = big(w, hg); px = im.load(); rnd = random.Random(seed)
    tones = [(4, 5, 3), (4, 5, 3), (3, 4, 2), (4, 5, 3)]
    for r in range(-1, hg // 16 + 2):
        off = 16 if r % 2 else 0; y0 = 32 + r * 16
        for c in range(-2, w // 32 + 2):
            x0 = 32 + c * 32 - off
            if x0 < 0 or y0 < 0 or x0 + 32 > im.width or y0 + 16 > im.height: continue
            tone = rnd.choice(tones); slab(px, x0, y0, 32, 16, tone, rnd)
            if rnd.random() < .09:   # engraved cover
                f, hi, lo = tone
                for x in range(x0 + 4, x0 + 29):
                    px[x, y0 + 4] = C(lo); px[x, y0 + 12] = C(hi)
                for y in range(y0 + 4, y0 + 13):
                    px[x0 + 4, y] = C(lo); px[x0 + 28, y] = C(hi)
                cx = x0 + 16
                for x in range(cx - 4, cx + 4): px[x, y0 + 7] = C(lo); px[x, y0 + 8] = C(hi)
                for y in range(y0 + 6, y0 + 11): px[cx - 1, y] = C(lo); px[cx, y] = C(hi)
    return crop_in(im, w, hg)

COBBLE = ['.hhf.', 'hfffd', 'hfffd', '.fdd.']
COBBLE2 = ['.hhhf.', 'hffffd', 'hffffd', 'hffffd', '.fddd.']
PEB = [['h', 'd'], ['.h.', 'hfd', '.d.'], ['hd']]
def floor_catacombs(w, hg, seed=4, path=None):
    """packed earth with scattered pebbles, and a worn cobbled path."""
    im = Image.new('RGBA', (w, hg), C(3)); px = im.load(); rnd = random.Random(seed)
    for _ in range(w * hg // 220):   # earth texture: placed dark/light clusters, not noise
        x, y = rnd.randrange(w - 3), rnd.randrange(hg - 3); p = rnd.choice(PEB)
        for r, row in enumerate(p):
            for c, ch in enumerate(row):
                if ch != '.': px[x + c, y + r] = C({'h': 4, 'f': 3, 'd': 2}[ch])
    for _ in range(w * hg // 900):   # darker damp patches, flat
        x, y = rnd.randrange(w - 12), rnd.randrange(hg - 6)
        for yy in range(5):
            for xx in range(10):
                if ((xx - 4.5) / 5) ** 2 + ((yy - 2) / 2.5) ** 2 < 1 and px[x + xx, y + yy] == C(3): px[x + xx, y + yy] = C(2)
    if path:
        for (x, y) in path(rnd):
            s = rnd.choice([COBBLE, COBBLE2]); t = rnd.choice([(4, 5, 3), (4, 5, 3), (4, 6, 3)])
            for r, row in enumerate(s):
                for c, ch in enumerate(row):
                    X, Y = x + c, y + r
                    if ch != '.' and 0 <= X < w and 0 <= Y < hg: px[X, Y] = C({'h': t[1], 'f': t[0], 'd': t[2]}[ch])
            if 0 <= y + len(s) < hg:
                for c in range(1, len(s[0]) - 1):
                    if 0 <= x + c < w: px[x + c, y + len(s)] = C(1)
    return im

def floor_deep(w, hg, seed=6):
    """natural rock: irregular flat cells with a lit top-left lip and dark cracks between them."""
    im = Image.new('RGBA', (w, hg)); px = im.load(); rnd = random.Random(seed)
    S = 19; seeds = {}
    for gy in range(-1, hg // S + 2):
        for gx in range(-1, w // S + 2):
            seeds[(gx, gy)] = (gx * S + rnd.uniform(2, S - 2), gy * S + rnd.uniform(2, S - 2), rnd.choice([(3, 4, 2), (3, 4, 2), (4, 5, 3), (3, 5, 2)]))
    cell = [[None] * w for _ in range(hg)]
    for y in range(hg):
        for x in range(w):
            gx, gy = x // S, y // S; best = None
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    sx, sy, t = seeds[(gx + dx, gy + dy)]; d = (x - sx) ** 2 + ((y - sy) * 1.3) ** 2
                    if best is None or d < best[0]: best = (d, (gx + dx, gy + dy))
            cell[y][x] = best[1]
    for y in range(hg):
        for x in range(w):
            k = cell[y][x]; t = seeds[k][2]
            up = cell[y - 1][x] if y else k; lf = cell[y][x - 1] if x else k
            dn = cell[y + 1][x] if y + 1 < hg else k; rt = cell[y][x + 1] if x + 1 < w else k
            c = t[0]
            if dn != k or rt != k: c = 1 if (x * 7 + y * 3) % 5 == 0 else 2
            elif up != k or lf != k: c = t[1]
            elif (y + 2 < hg and cell[y + 2][x] != k) or (x + 2 < w and cell[y][x + 2] != k): c = t[2]
            px[x, y] = C(c)
    for _ in range(w * hg // 500):
        x, y = rnd.randrange(w - 3), rnd.randrange(hg - 3); p = rnd.choice(PEB)
        for r, row in enumerate(p):
            for c, ch in enumerate(row):
                if ch != '.' and px[x + c, y + r] not in (C(1),): px[x + c, y + r] = C({'h': 6, 'f': 4, 'd': 2}[ch])
    return im

# ================================================================== wall faces (whole-width strips, 48 px tall)
def coping(px, width, rnd, rough=False):
    for x in range(width):
        for y, c in enumerate((9, 8, 7, 7, 5, 2)): px[x, y] = C(c)
        for y, c in enumerate((3, 7, 6, 6, 5, 3)): px[x, 42 + y] = C(c)
    if rough:   # broken lip: notches knocked out of the coping
        for x in range(0, width, rnd.randrange(5, 9)):
            n = rnd.randrange(2, 5)
            for k in range(n):
                if x + k < width: px[x + k, 0] = C(5); px[x + k, 1] = C(7)
    else:
        for x in range(0, width, 24): px[x, 1] = C(6); px[x, 2] = C(5); px[x, 3] = C(5)

def wall_crypt(width, niches=()):
    """smooth ashlar: three courses of big dressed blocks, with arched burial niches (loculi) holding skulls or urns."""
    im = Image.new('RGBA', (width, FH)); px = im.load(); rnd = random.Random(21); coping(px, width, rnd)
    for course in range(3):
        y0 = 6 + course * 12; off = 12 if course % 2 else 0
        for bx in range(-off, width, 24):
            t = (7, 6, 5) if rnd.random() > .2 else (6, 5, 4)
            hi, f, lo = t
            for y in range(y0, y0 + 12):
                for x in range(max(0, bx), min(width, bx + 24)):
                    lx, ly = x - bx, y - y0
                    if ly == 11 or lx == 0: px[x, y] = C(3); continue
                    px[x, y] = C(hi if (ly == 0 or lx == 1) else lo if (ly == 10 or lx == 23) else f)
    for i, (cx, what) in enumerate(niches):
        x0, y0 = cx - 7, 13
        for y in range(y0, y0 + 20):
            for x in range(x0, x0 + 14):
                lx, ly = x - x0, y - y0
                if ly < 7 and (lx - 6.5) ** 2 + (ly - 7) ** 2 > 49: continue
                inside = ly >= 1 and 1 <= lx <= 12 and (ly >= 7 or (lx - 6.5) ** 2 + (ly - 7) ** 2 <= 36)
                px[x, y] = C(9 if (not inside and lx < 7) else 5 if not inside else (0 if ly < 12 else 1))
        for x in range(x0 - 1, x0 + 15): px[x, y0 + 20] = C(8); px[x, y0 + 21] = C(5)   # sill
        if what == 'skull':
            art(['.aaaa.', 'abbbba', 'b00b00'[:6], 'bb0bbb'[:6], '.bcbc.', '..bb..'], {'a': 11, 'b': 10, '0': 1, 'c': 8}, im, (cx - 3, y0 + 13))
        elif what == 'helmet':
            motifs.helmet_small(im, cx - 3, y0 + 15)
        elif what == 'urn':
            art(['..yy..', '.yYYy.', 'yYyyyz', 'yyyyzz', '.yyzz.', '..zz..'], {'y': 23, 'Y': 25, 'z': 22}, im, (cx - 3, y0 + 13))
    return im

SKULL = ['.bbbbb.', 'bBBBBBb', 'b00B00c', 'b00B00c', 'bbB0Bcc', '.btbtc.', '..bbc..']
def wall_catacombs(width, wheels=()):
    """an ossuary: rows of skulls set between layers of long bones, with packed earth behind."""
    im = Image.new('RGBA', (width, FH)); px = im.load(); rnd = random.Random(31); coping(px, width, rnd, rough=True)
    for y in range(6, 42):
        for x in range(width): px[x, y] = C(2)
    def bones(y0):
        x = -rnd.randrange(0, 8)
        while x < width:
            n = rnd.randrange(11, 17); t = rnd.choice([(9, 8, 6), (8, 7, 5), (9, 8, 6)])
            for k in range(n):
                X = x + k
                if not 0 <= X < width: continue
                end = k in (0, 1, n - 2, n - 1)
                px[X, y0 + 1] = C(t[1])
                if end: px[X, y0] = C(t[0]); px[X, y0 + 2] = C(t[2])
                else: px[X, y0] = C(3 if k % 5 else 2); px[X, y0 + 2] = C(2)
                if k == 2: px[X, y0 + 1] = C(t[0])
            x += n + rnd.randrange(0, 2)
    def skulls(y0, shift):
        for x0 in range(-shift, width, 8):
            t = rnd.choice([(10, 9, 8), (9, 8, 7), (9, 8, 7), (8, 7, 6)])
            key = {'b': t[1], 'B': t[0], 'c': t[2], '0': 1, 't': 3}
            if rnd.random() < .12: continue   # a gap where a skull fell out
            for r, row in enumerate(SKULL):
                for c, ch in enumerate(row):
                    X = x0 + c
                    if ch != '.' and 0 <= X < width: px[X, y0 + r] = C(key[ch])
    bones(6); skulls(9, 0); bones(16); skulls(19, 4); bones(26); skulls(29, 1); bones(36)
    for cx in wheels: motifs.bone_wheel(px, cx, 23, 14, SKULL)
    for y in range(39, 42):
        for x in range(width): px[x, y] = C(2 if y < 41 else 3)
    return im

def wall_deep(width, crystals=()):
    """raw cave rock: jagged strata, each band lit along its top edge, with cracks and crystal seams."""
    im = Image.new('RGBA', (width, FH)); px = im.load(); rnd = random.Random(41)
    bounds = []
    for base in (7, 17, 27, 36):
        line = []; y = base
        for x in range(width):
            if x % rnd.choice((3, 4, 5, 6)) == 0: y = max(base - 2, min(base + 2, y + rnd.choice((-1, 0, 0, 1))))
            line.append(y)
        bounds.append(line)
    tones = [(9, 8, 6), (8, 7, 5), (7, 6, 4), (6, 5, 3), (5, 4, 2)]
    for x in range(width):
        top = 0
        for b in range(5):
            bot = bounds[b][x] if b < 4 else 42
            hi, f, lo = tones[b]
            for y in range(top, bot):
                c = f
                if y == top: c = hi
                if y == bot - 1: c = 2
                elif y == bot - 2: c = lo
                px[x, y] = C(c)
            top = bot
        for y, c in enumerate((2, 4, 3, 3, 2, 1)): px[x, 42 + y] = C(c)
    for x in range(width):   # jagged top lip
        k = (h(x // 3, 9) % 3)
        for y in range(k): px[x, y] = C(1)
    for _ in range(width // 22):   # cracks
        x = rnd.randrange(2, width - 2); y = rnd.randrange(8, 30)
        for k in range(rnd.randrange(5, 10)):
            if 0 <= x < width and y < 42: px[x, y] = C(1); px[min(width - 1, x + 1), y] = C(5)
            y += 1; x += rnd.choice((-1, 0, 0, 1))
    return im

# ================================================================== doors (32 x 48 overlays)
def door_crypt(state):
    """pointed arch with an iron grille; locked = chained with a bike U-lock."""
    im = Image.new('RGBA', (32, FH)); px = im.load()
    def arch(x, y, r):   # pointed arch: two circles
        if y >= 18: return 3 <= x <= 28
        return ((x - 3 - r) ** 2 + (y - 18) ** 2 <= r * r) and ((x - 28 + r) ** 2 + (y - 18) ** 2 <= r * r)
    for y in range(FH):
        for x in range(32):
            if arch(x, y, 22) and not arch(x, y, 18.5):
                px[x, y] = C(9 if x < 12 else 8 if x < 20 else 6)
                if y >= 18 and x in (3, 4): px[x, y] = C(10 if x == 3 else 9)
                if y >= 18 and x in (27, 28): px[x, y] = C(5)
            elif arch(x, y, 18.5):
                px[x, y] = C(0 if y < 34 else 1)
    for y in (24, 33, 41):
        for x in (3, 4, 5): px[x, y] = C(6)
        for x in (26, 27, 28): px[x, y] = C(4)
    for k in range(7):   # fanlight: the arch head is a spoked half wheel
        a = math.pi + (k + .5) * math.pi / 7
        for t in range(2, 20):
            x, y = round(15.5 + math.cos(a) * t), round(20 + math.sin(a) * t)
            if 0 <= y < 20 and arch(x, y, 18.5): px[x, y] = C(8)
    for x in range(6, 27):
        if arch(x, 20, 18.5): px[x, 20] = C(8); px[x, 21] = C(5)
    for x in range(12, 20):
        for y in range(16, 21):
            if math.hypot(x - 15.5, y - 20) < 3.2: px[x, y] = C(9 if x < 16 else 7)
    if state == 'open': return im
    for x in range(8, 25, 4):
        for y in range(21, FH):
            if arch(x, y, 18.5): px[x, y] = C(8); px[x + 1, y] = C(5)
    for y in (36,):
        for x in range(6, 27):
            if arch(x, y, 18.5): px[x, y] = C(7); px[x, y + 1] = C(4)
    if state == 'locked':
        d = ImageDraw.Draw(im)
        d.arc((10, 21, 21, 33), 180, 360, fill=C(9), width=2); d.line((10, 27, 10, 33), fill=C(9), width=2); d.line((20, 27, 20, 33), fill=C(7), width=2)
        d.rectangle((8, 33, 23, 39), fill=C(24)); d.line((8, 33, 23, 33), fill=C(25)); d.line((8, 39, 23, 39), fill=C(22)); px[15, 35] = C(1); px[16, 35] = C(1)
    return im

def door_catacombs(state):
    """rough arch of stacked rubble with a skull keystone; locked = a plank door."""
    im = Image.new('RGBA', (32, FH)); px = im.load(); rnd = random.Random(51)
    inner = lambda x, y: 6 <= x <= 25 and y >= 9 and (y >= 17 or (x - 15.5) ** 2 + (y - 17) ** 2 <= 9.6 ** 2)
    outer = lambda x, y: 1 <= x <= 30 and y >= 2 and (y >= 17 or (x - 15.5) ** 2 + (y - 17) ** 2 <= 15 ** 2)
    stones = {}
    for y in range(FH):
        for x in range(32):
            if outer(x, y) and not inner(x, y):
                k = (x // 5 + (y // 5) * 7 + (y // 5) % 2 * 2) ; stones.setdefault(k, rnd.choice((7, 6, 8, 6)))
                c = stones[k]
                if x % 5 == 0 or y % 5 == 0: c = 3
                elif x % 5 == 1 or y % 5 == 1: c = min(10, c + 1)
                elif x % 5 == 4 or y % 5 == 4: c = c - 2
                px[x, y] = C(c)
            elif inner(x, y): px[x, y] = C(0 if y < 32 else 1)
    art(SKULL, {'b': 10, 'B': 11, 'c': 9, '0': 1, 't': 3}, im, (12, 1))
    if state == 'open': return im
    planks = [(6, 10), (11, 15), (16, 20), (21, 25)]
    for y in range(FH):
        for x in range(32):
            if not inner(x, y): continue
            for i, (a, b) in enumerate(planks):
                if a <= x <= b: px[x, y] = C(15 if x == a else 12 if x == b else 13 if (y + i * 5) % 11 == 0 else 14)
    for y in (20, 38):
        for x in range(6, 26):
            if inner(x, y): px[x, y] = C(15); px[x, y + 1] = C(12)
    return im

RUNES = [['.r.', 'rrr', '.r.', '.r.'], ['r.r', '.r.', 'r.r', 'r..'], ['rr.', 'r.r', 'rr.', 'r..'], ['r..', 'rrr', '..r', 'rrr']]
def door_deep(state):
    """a carved slab sealing a cave mouth, cut with runes that glow while it is shut."""
    im = Image.new('RGBA', (32, FH)); px = im.load(); glow = []
    mouth = lambda x, y: 3 <= x <= 28 and y >= 6 and (y >= 16 or (x - 15.5) ** 2 / 13 ** 2 + (y - 16) ** 2 / 10 ** 2 <= 1)
    for y in range(FH):
        for x in range(32):
            if mouth(x, y):
                edge = not mouth(x - 1, y) or not mouth(x + 1, y) or not mouth(x, y - 1)
                px[x, y] = C(2 if edge else 0)
    if state == 'open': return im, glow
    for y in range(8, FH):
        for x in range(5, 27):
            if mouth(x, y):
                c = 6
                if x == 5 or y == 8: c = 8
                if x == 26: c = 4
                if y == FH - 1: c = 3
                px[x, y] = C(c)
    for (dx, dy) in motifs.chainring_sigil():   # the seal is a chainring
        x, y = 16 + dx, 26 + dy
        if 6 <= x <= 25: px[x, y] = C(3); glow.append((x, y))
    for i, r in enumerate(RUNES[:2]):
        ox, oy = 8 + i * 13, 39
        for yy, row in enumerate(r[:3]):
            for xx, ch in enumerate(row):
                if ch == 'r': px[ox + xx, oy + yy] = C(3); glow.append((ox + xx, oy + yy))
    return im, glow

# ================================================================== props
def ramp_img(rows, key):
    return selout(pad(art(rows, key)))

def sarcophagus(bike=False):
    """seen in 3/4: a lid carved with a resting figure, the front side a step darker, lit from the top left."""
    w, hg = 26, 22; im = Image.new('RGBA', (w, hg)); px = im.load()
    for y in range(hg):
        for x in range(w):
            if y < 14:   # lid
                c = 8
                if y == 0 or x == 0: c = 10
                elif y == 13 or x == w - 1: c = 6
                elif y == 1 or x == 1: c = 9
                if not bike and 4 <= x <= 21 and 3 <= y <= 10:   # carved figure: head, folded hands, feet
                    fx, fy = x - 4, y - 3
                    if (fx - 2) ** 2 + (fy - 3.5) ** 2 <= 5: c = 9 if fy < 3 else 7
                    elif 5 <= fx <= 16 and 1 <= fy <= 6: c = 9 if fy == 1 else 7 if fy == 6 else 8
                    if fx == 9 and 2 <= fy <= 5: c = 10
                    if fx in (16, 17) and fy in (2, 5): c = 7
            else:
                c = 6 if y < hg - 1 else 4
                if x == 0: c = 7
                if x == w - 1: c = 4
                if y == 14: c = 5
                if x in (4, 21) and 15 <= y <= hg - 2: c = 7   # carved panel edges
                if 5 <= x <= 20 and y == 17: c = 5
            px[x, y] = C(c)
    if bike: motifs.bike_relief(im, 5, 3, lo=6, hi=9)
    return selout(pad(im))

def urn(): return ramp_img(['..yYy..', '.zyyyz.', '..yyy..', '.yYyyz.', 'yYyyyzz', 'yYyyyzz', '.yyyzz.', '..zzz..', '.zzzzz.'], {'y': 23, 'Y': 25, 'z': 22})
def brazier():
    """a stone bowl on a short plinth; its ghostfire is emissive and drawn by the page."""
    return ramp_img(['aaaaaaaaaaa', 'b98888887765', '.b8777776654.'[:12], '..b766655...'[:12], '....8765....', '....8765....', '...987654...', '..98877654..'],
                    {'a': 2, 'b': 9, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4})
def candles():
    return ramp_img(['.w.......', '.w...w...', 'wwW..w..w', 'wwW.wwW.w', 'wwW.wwWwW', 'wwW.wwWwW', 'ddddddddd'], {'w': 11, 'W': 9, 'd': 5})
def cobweb(flip=False):
    rows = ['wwwwwwwww', 'w.v..v.v.', 'wv.v.v.v.', 'w..vvv...', 'wvvv.v...', 'w.v..v...', 'wv..v....', 'w.v......', 'w........'][:8]
    im = art(rows, {'w': 9, 'v': 8})
    return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im
def bones_decal():
    return art(['..b......', '.bBb..cc.', '..b.bbbBc', '....b..c.', 'cc.......', 'cBbbbc...'], {'b': 10, 'B': 11, 'c': 8})
def grave(w=60, hg=28):
    """open grave: dug earth bank, a dark shaft and a broken coffin lid at the bottom."""
    im = Image.new('RGBA', (w + 8, hg + 8)); px = im.load(); rnd = random.Random(61)
    for y in range(hg + 8):
        for x in range(w + 8):
            dx, dy = x - (w + 8) / 2, y - (hg + 8) / 2
            if abs(dx) <= (w + 8) / 2 - (1 if abs(dy) > hg / 2 + 2 else 0) and abs(dy) <= (hg + 8) / 2:
                c = 4 if (x + y * 3) % 7 else 3   # dug-earth bank
                if y < 3: c = 6
                px[x, y] = C(c)
    for y in range(4, hg + 4):
        for x in range(4, w + 4):
            d = y - 4
            c = [4, 3, 3, 2, 2, 1][d] if d < 6 else 0
            if x < 6: c = 2
            px[x, y] = C(c)
    for y in range(hg - 4, hg + 2):   # coffin lid, split
        for x in range(12, w - 4):
            if abs(x - 30 - (y - hg) * 2) < 1: continue
            px[x, y] = C(14 if y == hg - 4 else 13 if y < hg + 1 else 12)
    return im

def skull_pile():
    rows = ['......bBb......', '.....bB0Bc.....', '..bBbb0B0c.bBb..', '.bB0BcbcBcbB0Bc.', '.b0B0cbBbcb0B0c.', 'bBbcbcbB0Bcbcbcc', 'bB0Bc.b0B0c.bB0Bc', 'cbcbcccbcbccccbcc']
    return ramp_img([r[:16] for r in rows], {'b': 10, 'B': 11, 'c': 8, '0': 1})
def skull_candle():
    return ramp_img(['..w..', '..w..', '.www.', '.bBb.', 'bB0Bc', 'b0B0c', '.bcc.'], {'w': 11, 'b': 10, 'B': 11, 'c': 8, '0': 1})
def sack():
    return ramp_img(['....ff....', '...fhf....', '....f.....', '..hffff...', '.hfffffd..', 'hffffffdd.', 'hfffffffdd', 'hffffffddd', '.fffffddd.', '..dddddd..'], {'h': 17, 'f': 16, 'd': 15})
def coffin():
    """a broken coffin propped on its end, lid hanging open"""
    rows = ['..dccccd..', '.dcbbbbcd.', 'dcb0000bcd', 'dcb0000bcd', 'dcb0000bcd', '.cb0000bc.', '.cb0000bc.', '.cb0000bc.', '..cb00bc..', '..cb00bc..', '..cbbbbc..', '...cccc...']
    im = art(rows, {'d': 12, 'c': 13, 'b': 15, '0': 0})
    lid = art(['cbbbc', 'cbbbc', 'cbbbc', 'cbbbc', 'cbbbc', 'cbbbc', '.cbc.', '.cbc.', '..c..'], {'c': 13, 'b': 16})
    out = Image.new('RGBA', (16, 13)); out.alpha_composite(im, (0, 0)); out.alpha_composite(lid, (10, 3))
    return selout(pad(out))
def spikes(frame):
    """spike trap tile (32x32): plate with holes; frame 1 = spikes up"""
    im = Image.new('RGBA', (30, 30)); px = im.load()
    for y in range(30):
        for x in range(30):
            c = 5
            if x == 0 or y == 0: c = 7
            if x == 29 or y == 29: c = 3
            px[x, y] = C(c)
    for gy in range(4):
        for gx in range(4):
            x, y = 4 + gx * 7, 5 + gy * 7
            px[x, y] = C(1); px[x + 1, y] = C(1); px[x, y + 1] = C(2); px[x + 1, y + 1] = C(2)
            if frame:
                for k in range(5): px[x, y - k] = C(10 if k > 2 else 9); px[x + 1, y - k] = C(8)
                px[x, y - 5] = C(11)
    return im

def stalagmite(seed=0):
    """a lumpy rock spire: stacked, offset blobs shaded from the top left, wet highlight on the lit side"""
    w, hg = 20, 32; im = Image.new('RGBA', (w, hg)); px = im.load(); rnd = random.Random(70 + seed)
    blobs = [(10, 27, 9, 5), (9.5 + rnd.uniform(-1, 1), 20, 6.5, 7), (10.5 + rnd.uniform(-1.5, 1.5), 12, 4.5, 7), (10 + rnd.uniform(-2, 2), 5, 2.4, 5)]
    for y in range(hg):
        for x in range(w):
            best = None
            for (cx, cy, rx, ry) in blobs:
                d = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2
                if d <= 1 and (best is None or cy < best[1]): best = (d, cy, cx, rx, ry)
            if not best: continue
            d, cy, cx, rx, ry = best; nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            l = -nx * .8 - ny * .5
            c = 8 if l > .55 else 7 if l > .1 else 6 if l > -.35 else 5 if l > -.7 else 4
            if d > .8 and ny > .2: c = 3
            px[x, y] = C(c)
    return selout(pad(im))

def crystal(seed=0):
    """violet crystal cluster: emissive faces; returned as (sprite, list of glow pixels relative)."""
    V = [hexc('#2a1048'), hexc('#5a2a9a'), hexc('#9a5ae0'), hexc('#d6a8ff'), hexc('#f6eaff')]
    w, hg = 16, 20; im = Image.new('RGBA', (w, hg)); px = im.load(); rnd = random.Random(seed)
    shards = [(8, 0, 3.2, 20), (4, 7, 2.6, 13), (12, 5, 2.6, 15), (1, 12, 2, 8), (14, 12, 2, 8)]
    for (cx, top, hw, ln) in shards:
        for y in range(top, top + ln):
            if y >= hg: continue
            k = (y - top) / ln; half = hw * min(1, k * 3)
            for x in range(int(cx - half), int(cx + half) + 1):
                if 0 <= x < w:
                    px[x, y] = V[3] if x < cx - .3 else V[2] if x < cx + half * .5 else V[1]
                    if y == top: px[x, y] = V[4]
    for x in range(w):
        for y in range(hg - 2, hg):
            if px[x, y][3]: px[x, y] = V[0]
    return selout(pad(im))

def mushrooms():
    T_ = [hexc('#0e3a3a'), hexc('#1f8a7a'), hexc('#5ae0c8'), hexc('#c8fff0')]
    rows = ['.......aaa..', '..aa..abcca.', '.abca.bbbcc.', '.bbbb...s...', '...s....s...', '...s....s...', '..sss..sss..']
    key = {'a': T_[2], 'b': T_[1], 'c': T_[3], 's': C(9)}
    im = Image.new('RGBA', (12, 7)); px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.': px[x, y] = key[ch]
    return selout(pad(im))

def wheel_relic():
    """bike touch: a rusted wheel half sunk in the rock"""
    im = Image.new('RGBA', (24, 14)); px = im.load(); cx, cy, R = 12, 12, 11
    for y in range(14):
        for x in range(24):
            d = math.hypot(x - cx, y - cy)
            if R - 1.6 <= d <= R: px[x, y] = C(15 if x < cx else 14)
            elif R - 2.6 <= d < R - 1.6: px[x, y] = C(7)
            elif d < 2: px[x, y] = C(8)
    for a in range(200, 345, 18):
        for r in range(2, R - 2):
            x, y = round(cx + math.cos(math.radians(a)) * r), round(cy + math.sin(math.radians(a)) * r)
            if 0 <= y < 14: px[x, y] = C(6)
    return selout(pad(im))

def torch():
    return keep.torch_bracket()

def flames_tinted(cols):
    s = Image.new('RGBA', (7 * 4, 11))
    for i, f in enumerate(FLAME): art(f, {'o': 0, 'm': 1, 'i': 2, 'w': 3}, s, (i * 7, 0))
    px = s.load(); P = [hexc(c) for c in cols]; base = [pal.PAL[i] for i in range(4)]
    for y in range(11):
        for x in range(28):
            if px[x, y][3]: px[x, y] = P[base.index(px[x, y])]
    return s

def paint_pool(px, sx, ex, sy, ey, rx, ry, seed=5):
    """a still pool sunk into the floor (same construction as the Keep puddle). Returns the set of water pixels (for reflections)."""
    pool = [(x, y) for y in range(sy, ey) for x in range(sx, ex)
            if ((x - (sx + ex) / 2) / rx) ** 2 + ((y - (sy + ey) / 2) / ry) ** 2 < 1 + .08 * math.sin(x * .4) * math.cos(y * .3)]
    P = set(pool); water = set()
    for (x, y) in pool:
        c = 27
        if (x, y - 1) not in P: c = 3
        elif (x, y - 2) not in P: c = 2
        elif (x, y - 3) not in P or (x, y - 4) not in P: c = 26
        elif (x - 1, y) not in P or (x + 1, y) not in P or (x, y + 1) not in P: c = 26
        px[x, y] = C(c)
        if c in (26, 27): water.add((x, y))
    for (x, y) in pool:
        if (x, y + 1) not in P: px[x, y + 1] = C(6)
    return water

CRY = ['#2a1048', '#5a2a9a', '#9a5ae0', '#d6a8ff', '#f6eaff']
def crystal_big(seed=0, s=1.0):
    """large violet cluster made of flat-faceted prisms: left face (lit), front face, right face (shade), bright tip edges.
    Each face is one flat colour so the page can refract a different slice of the scene through every facet."""
    V = [hexc(h) for h in CRY]
    w, hg = round(30 * s), round(38 * s); im = Image.new('RGBA', (w, hg)); px = im.load(); rnd = random.Random(seed)
    # (base x, base y, half width, height, lean) drawn back to front
    shards = [(9, 34, 3.5, 22, -.22), (21, 35, 3.5, 20, .25), (15, 37, 5.0, 34, .02), (5, 37, 2.5, 11, -.35), (25, 37, 2.6, 13, .4)]
    shards = [(round(bx * s), min(hg - 1, round(by * s)), hw * s, round(ht * s), ln) for (bx, by, hw, ht, ln) in shards]
    for (bx, by, hw, hgt, lean) in shards:
        tip = hw * 1.6
        for y in range(by - hgt, by + 1):
            up = by - y; cxs = bx + lean * up
            half = hw if up < hgt - tip else hw * (hgt - up) / tip
            for x in range(int(cxs - half - .5), int(cxs + half + .5) + 1):
                if not (0 <= x < w and 0 <= y < hg): continue
                u = (x + .5 - cxs) / max(.6, half)
                c = V[3] if u < -.35 else V[2] if u < .35 else V[1]
                if up >= hgt - tip and u < -.05: c = V[4] if up > hgt - 2 else V[3]
                if abs(u + .35) < .18 and up < hgt - tip: c = V[4] if (y + seed) % 9 < 5 else V[3]   # bright edge between lit and front faces
                px[x, y] = c
        for x in range(int(bx - hw), int(bx + hw) + 1):
            if 0 <= x < w and px[x, by][3]: px[x, by] = V[0]
    return selout(pad(im))

def shard_floor(seed=0, W=60, H=30, n=16):
    """Deep: a bed of crystal shards grown flat through the floor, each a small faceted lozenge (lit face, front face,
    shade face) so the renderer can refract the scene through them. Low profile, 3/4 view."""
    V = [hexc(h) for h in CRY]
    im = Image.new('RGBA', (W, H)); px = im.load(); rnd = random.Random(seed)
    pts = []
    for _ in range(n * 4):
        if len(pts) >= n: break
        dx, dy = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if dx * dx + dy * dy > 1: continue
        k = (dx * dx + dy * dy) ** .25; dx, dy = dx * k, dy * k   # pull toward the middle: a dense heart, sparse rim
        pts.append((W / 2 + dx * (W / 2 - 6), H / 2 + 4 + dy * (H / 2 - 8)))
    pts.sort(key=lambda q: q[1])
    for (cx, cy) in pts:
        mid = 1 - min(1, math.hypot((cx - W / 2) / (W / 2), (cy - H / 2) / (H / 2)))
        L = rnd.uniform(4, 7) + mid * rnd.uniform(4, 9); hw = rnd.uniform(1.6, 2.4) + mid * 1.2; lean = rnd.uniform(-.55, .55)
        for k in range(int(L) + 1):                 # a short prism standing up from the floor, leaning
            y = int(cy) - k; xc = cx + lean * k
            tip = hw * 1.5; half = hw if k < L - tip else max(.3, hw * (L - k) / tip)
            for x in range(int(xc - half - .5), int(xc + half + .5) + 1):
                if 0 <= x < W and 0 <= y < H:
                    u = (x + .5 - xc) / max(.6, half)
                    px[x, y] = V[4] if (k >= L - tip and u < -.1) or abs(u + .3) < .12 else V[3] if u < -.3 else V[2] if u < .35 else V[1]
        for x in range(int(cx - hw), int(cx + hw) + 1):   # dark socket where it breaks through the stone
            if 0 <= x < W and 0 <= int(cy) + 1 < H and px[x, int(cy) + 1][3] == 0: px[x, int(cy) + 1] = V[0]
    return im
