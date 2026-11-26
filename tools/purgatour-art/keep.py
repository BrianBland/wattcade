"""Grey Keep vertical slice: hand-built tiles, walls, props and the test room."""
import os, sys, random, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pal import *

T = 32; FH = 48; RISE = FH - T          # wall faces are 48 px tall and rise 16 px into the row above
W, Hh = 14, 9
LAYOUT = ["WWWWWWWWWWWWWW",
          "WWWWWWDWWWWLWW",
          "W............W",
          "W............W",
          "W............W",
          "W.SS.....PP..W",
          "W.SS.....PP..W",
          "W..........T.W",
          "WWWWWWWWWWWWWW"]

def tile(x, y):
    if x < 0 or y < 0 or x >= W or y >= Hh: return 'W'
    return LAYOUT[y][x]
def wall(x, y): return tile(x, y) in 'WDL'
def face(x, y): return wall(x, y) and not wall(x, y + 1) and y + 1 < Hh
def h(*a):
    v = 2166136261
    for n in a: v = ((v ^ (n & 0xffffffff)) * 16777619) & 0xffffffff
    return v

# ------------------------------------------------------------------ floor
GROUT_TOP, GROUT_LEFT = 1, 2
TONES = [(4, 5, 3), (4, 5, 3), (4, 5, 3), (3, 4, 2)]     # (fill, hi, lo); the last is a darker slab
SPLITS = [[(0, 0, 32, 32)], [(0, 0, 16, 32), (16, 0, 16, 16), (16, 16, 16, 16)], [(0, 0, 32, 16), (0, 16, 16, 16), (16, 16, 16, 16)],
          [(0, 0, 16, 16), (16, 0, 16, 16), (0, 16, 32, 16)], [(0, 0, 32, 16), (0, 16, 32, 16)], [(0, 0, 16, 32), (16, 0, 16, 32)]]
SPLIT_W = [5, 2, 2, 2, 3, 2]
# texture clusters, hand drawn: d = slab dark, h = slab light, f = slab fill
STAMPS = {
    'pock': ['d', 'h'],
    'pock2': ['dd', 'fh'],
    'pits': ['d.d', 'h.h', '...', '.d.', '.h.'],
    'scuff': ['..hh', 'hhh.'],
    'crack': ['d.....', 'hdd...', '.hhd..', '...hdd', '....hh'],
    'crack2': ['....d', '..dd.', '.d.h.', 'd.h..', 'h....'],
    'worn': ['.hhh.', 'hhhhh', '.hhh.'],
}
def stamp(px, name, x, y, tone, clip):
    f, hi, lo = tone
    for r, row in enumerate(STAMPS[name]):
        for c, ch in enumerate(row):
            X, Y = x + c, y + r
            if ch == '.' or not clip(X, Y): continue
            px[X, Y] = C({'d': lo, 'h': hi, 'f': f}[ch])

def slab(px, x0, y0, w, hgt, tone, rnd):
    f, hi, lo = tone
    for y in range(y0, y0 + hgt):
        for x in range(x0, x0 + w):
            if y == y0: px[x, y] = C(GROUT_TOP); continue
            if x == x0: px[x, y] = C(GROUT_LEFT); continue
            corner = (x in (x0 + 1, x0 + w - 1)) and (y in (y0 + 1, y0 + hgt - 1))
            if corner: px[x, y] = C(GROUT_LEFT if x == x0 + 1 else GROUT_TOP); continue
            c = f
            if y == y0 + 1 or x == x0 + 1: c = hi
            if y == y0 + hgt - 1 or x == x0 + w - 1: c = lo
            px[x, y] = C(c)
    inside = lambda X, Y: x0 + 2 <= X <= x0 + w - 3 and y0 + 2 <= Y <= y0 + hgt - 3
    big = w * hgt
    n = 0 if big < 300 and rnd.random() < .4 else 1 if big < 600 else 2
    names = ['pock', 'pock', 'pock2', 'pits', 'scuff', 'crack', 'crack2', 'worn']
    used = []
    for _ in range(n):
        nm = rnd.choice(names); s = STAMPS[nm]
        for _try in range(6):
            x = rnd.randrange(x0 + 3, max(x0 + 4, x0 + w - len(s[0]) - 2)); y = rnd.randrange(y0 + 3, max(y0 + 4, y0 + hgt - len(s) - 2))
            if all(abs(x - ux) > 5 or abs(y - uy) > 4 for ux, uy in used): break
        used.append((x, y)); stamp(px, nm, x, y, tone, inside)

def floor_tile(tx, ty):
    rnd = random.Random(h(tx, ty, 7)); im = Image.new('RGBA', (T, T)); px = im.load()
    split = rnd.choices(SPLITS, SPLIT_W)[0]
    for (x, y, w, hg) in split:
        slab(px, x, y, w, hg, rnd.choice(TONES), rnd)
    return im

# hand-drawn floor decals
RUBBLE = ['....hf.....', '...hffd..h.', '...fdd1.hfd', '.hf.11..dd1', 'hffd...hf.1', 'fdd1..hffd.', '.11...fdd1.', '.......11..']
def decal_rubble():
    return art(RUBBLE, {'h': 7, 'f': 6, 'd': 4, '1': 1})
GRATE = ['1111111111111', '1666666666661', '1600000000071', '1677777777771', '1600000000071', '1677777777771', '1600000000071', '1677777777771',
         '1600000000071', '1677777777771', '1600000000071', '1777777777771', '1111111111111']
def decal_grate(): return art(GRATE, {'1': 2, '6': 5, '7': 6, '0': 0})
def decal_broken():
    """a slab smashed in, showing the dark under-floor."""
    rows = ['....hhff....', '..hf1111dd..', '.hf100000d1.', 'hf10000000d.', 'f100000000d1', '.d1000000d1.', '..dd1100d1..', '....dddd1...']
    return art(rows, {'h': 5, 'f': 4, 'd': 3, '1': 1, '0': 0})

# ------------------------------------------------------------------ walls
def wall_strip(width):
    """the whole top wall face as one strip so bricks run across tile seams."""
    im = Image.new('RGBA', (width, FH)); px = im.load(); rnd = random.Random(11)
    for x in range(width):
        for y, c in enumerate((9, 8, 7, 7, 5, 2)): px[x, y] = C(c)          # coping stone seen from the front
        for y, c in enumerate((3, 7, 6, 6, 5, 3)): px[x, 42 + y] = C(c)     # base trim
    for x in range(0, width, 24):   # joints in the coping
        px[x, 1] = C(6); px[x, 2] = C(5); px[x, 3] = C(5); px[x + 1, 1] = C(9)
    for course in range(4):
        y0 = 6 + course * 9; low = course >= 2
        hi, f, lo = (6, 5, 4) if low else (7, 6, 5)
        off = 8 if course % 2 else 0
        for bx in range(-off, width, 16):
            bf = f
            r = rnd.random()
            if r < .18: bf = lo            # a darker brick here and there
            for y in range(y0, y0 + 9):
                for x in range(max(0, bx), min(width, bx + 16)):
                    lx = x - bx; ly = y - y0
                    if ly == 8 or lx == 0: px[x, y] = C(3); continue
                    c = bf
                    if ly == 0 or lx == 1: c = hi
                    if ly == 7 or lx == 15: c = lo
                    if ly == 0 and lx == 15: c = bf
                    px[x, y] = C(c)
            if rnd.random() < .35:   # a chip or pock on some bricks
                cx = bx + rnd.randrange(4, 12); cy = y0 + rnd.randrange(2, 5)
                if 0 <= cx < width - 1:
                    px[cx, cy] = C(lo - 1); px[cx + 1, cy] = C(lo); px[cx, cy + 1] = C(hi)
    return im

TOP = 1
def trim(px, x, y, edge, n=32, partial=0):
    """the lit rim of a wall top where it meets the room. edge: which side faces the room."""
    band = {'r': (4, 7, 6, 2), 'l': (5, 7, 6, 2), 'b': (4, 8, 7, 2), 't': (8, 7, 6, 2)}[edge]
    for i, c in enumerate(band):
        for k in range(partial, n):
            if edge == 'r': px[x + 31 - i, y + k] = C(c)
            if edge == 'l': px[x + i, y + k] = C(c)
            if edge == 'b': px[x + k, y + 31 - i] = C(c)
            if edge == 't': px[x + k, y + i] = C(c)

# ------------------------------------------------------------------ doors (overlay on the face, 32 x 48)
def door(state):
    im = Image.new('RGBA', (32, FH)); d = ImageDraw.Draw(im); px = im.load()
    # stone arch: jambs and voussoirs, lit on the left
    d.rectangle((2, 14, 29, 47), fill=C(7)); d.ellipse((2, 2, 29, 30), fill=C(7))
    d.rectangle((2, 14, 3, 47), fill=C(9)); d.rectangle((28, 14, 29, 47), fill=C(5))
    d.arc((2, 2, 29, 30), 180, 270, fill=C(9)); d.arc((2, 2, 29, 30), 270, 360, fill=C(8))
    for a in (205, 232, 258, 284, 310, 336):
        r1, r2 = 10, 14; cx, cy = 15.5, 16
        d.line((cx + math.cos(math.radians(a)) * r1, cy + math.sin(math.radians(a)) * r1, cx + math.cos(math.radians(a)) * r2, cy + math.sin(math.radians(a)) * r2), fill=C(5))
    for y in (24, 33, 41): d.line((2, y, 5, y), fill=C(5)); d.line((26, y, 29, y), fill=C(4))
    d.rectangle((13, 1, 18, 5), fill=C(8)); d.line((13, 1, 18, 1), fill=C(10)); d.line((13, 5, 18, 5), fill=C(5))   # keystone
    inner = lambda x, y: 6 <= x <= 25 and y >= 7 and (y >= 16 or (x - 15.5) ** 2 + (y - 16) ** 2 <= 9.8 ** 2)
    if state == 'open':
        for y in range(FH):
            for x in range(32):
                if inner(x, y): px[x, y] = C(0 if y < 30 else 1 if y < 42 else 2)
        return im
    planks = [(6, 9), (10, 14), (15, 19), (20, 25)]
    for y in range(FH):
        for x in range(32):
            if not inner(x, y): continue
            for i, (a, b) in enumerate(planks):
                if a <= x <= b:
                    c = 15 if x == a else 13 if x == b else 14
                    if i == 0 and x == a: c = 16
                    px[x, y] = C(c)
    for y in (18, 36):   # iron straps with rivets
        for x in range(6, 26):
            if inner(x, y): px[x, y] = C(6); px[x, y + 1] = C(4)
        for x in (8, 13, 18, 23): px[x, y] = C(9)
    d.ellipse((19, 25, 23, 29), outline=C(6)); px[21, 25] = C(9); px[19, 27] = C(8)
    if state == 'locked':   # a bike U-lock through the ring and the strap
        d.arc((10, 15, 21, 27), 180, 360, fill=C(9), width=2); d.line((10, 21, 10, 27), fill=C(9), width=2); d.line((20, 21, 20, 27), fill=C(7), width=2)
        d.rectangle((8, 27, 23, 33), fill=C(24)); d.line((8, 27, 23, 27), fill=C(25)); d.line((8, 33, 23, 33), fill=C(22)); d.line((23, 28, 23, 33), fill=C(23))
        px[15, 29] = C(1); px[16, 29] = C(1); px[15, 30] = C(1)
    return im

# ------------------------------------------------------------------ props (hand built, palette only)
def bands(n, tones):
    """split n columns into tone bands for a lit-from-the-left cylinder."""
    out = []; k = len(tones)
    edges = [0.0, .12, .3, .42, .62, .82, 1.0][:k + 1] if k == 6 else [i / k for i in range(k + 1)]
    for x in range(n):
        t = (x + .5) / n
        for i in range(k):
            if edges[i] <= t < edges[i + 1]: out.append(tones[i]); break
        else: out.append(tones[-1])
    return out

def barrel():
    w, hg = 20, 26; im = Image.new('RGBA', (w, hg)); px = im.load()
    wood = bands(w, (15, 16, 17, 15, 14, 13)); iron = bands(w, (6, 8, 9, 6, 5, 4))
    for y in range(4, hg):
        bulge = 1 if y in (5, 6, hg - 2, hg - 1) else 0
        bulge = 2 if y in (4, hg - 1) else bulge
        for x in range(bulge, w - bulge):
            c = wood[x]
            if y in (8, 9, 19, 20): c = iron[x] if y in (8, 19) else max(4, iron[x] - 2)
            if x in (5, 10, 15) and y not in (8, 9, 19, 20): c = max(12, c - 2)   # stave seams
            px[x, y] = C(c)
    for y in range(0, 7):   # top lid ellipse
        hw = [6, 8, 9, 9, 9, 8, 6][y]
        for x in range(10 - hw, 10 + hw):
            c = 16 if y < 3 else 15
            if y == 0 or (y < 3 and x < 9): c = 17
            if y == 6: c = 14
            px[x, y] = C(c)
    for x in range(4, 16): px[x, 3] = C(14) if x % 4 == 0 else px[x, 3]
    return selout(pad(im))

def crate():
    rows = [
        '.7777777777777777777.',
        '7ggggggggggggggggggg5',
        '7g6g6g6g6g6g6g6g6g6g5',
        '7ggggggggggggggggggg5',
        '7g6g6g6g6g6g6g6g6g6g5',
        '5555555555555555555555'[:21],
        'aeeeeeeeeeeeeeeeeeeec',
        'ae9fffffffffffffff9ec',
        'aefefffffffffffffefec',
        'aeffeffffffffffffeffc',
        'aefffeffffffffffefffc',
        'aeffffeffffffffefffffc'[:21],
        'aefffffeffffffeffffec',
        'aeffffffeffffeffffffc'[:21],
        'aefffffffeffefffffffc'[:21],
        'aeffffffffeefffffffec',
        'aefffffffeffefffffffc'[:21],
        'aeffffffeffffeffffffc'[:21],
        'aefffffeffffffefffffc',
        'ae9fffffffffffffff9ec',
        'aeeeeeeeeeeeeeeeeeeec',
        'cccccccccccccccccccc.']
    return selout(pad(art(rows, {'7': 17, 'g': 16, '6': 15, '5': 13, 'a': 16, 'e': 15, 'f': 14, 'c': 12, '9': 8})))

def banner():
    """the Keep's bike touch: a red banner with a gold chainring."""
    w, hg = 18, 38; im = Image.new('RGBA', (w, hg)); px = im.load(); d = ImageDraw.Draw(im)
    for x in range(w): px[x, 0] = C(17); px[x, 1] = C(15); px[x, 2] = C(13)
    px[0, 1] = C(24); px[w - 1, 1] = C(23)
    cloth = bands(w - 4, (21, 20, 20, 19, 19, 18))
    for y in range(3, hg):
        for x in range(2, w - 2):
            tip = (hg - 1) - abs(x - (w - 1) / 2) * .7
            if y > tip: continue
            c = cloth[x - 2]
            if x in (2, w - 3): c = 24 if x == 2 else 23
            if y in (5, 6) or y in (30, 31): c = 23 if x > 3 else 24
            px[x, y] = C(c)
    cx, cy = 8.5, 17
    for a in range(0, 360, 15):
        r = 5.6 if (a // 15) % 2 == 0 else 4.7
        px[round(cx + math.cos(math.radians(a)) * r), round(cy + math.sin(math.radians(a)) * r)] = C(25 if 150 < a < 300 else 24)
    for a in range(0, 360, 30):
        px[round(cx + math.cos(math.radians(a)) * 3.6), round(cy + math.sin(math.radians(a)) * 3.6)] = C(23)
    for a in (45, 165, 285): d.line((cx, cy, cx + math.cos(math.radians(a)) * 3, cy + math.sin(math.radians(a)) * 3), fill=C(23))
    px[8, 17] = C(25); px[9, 17] = C(24)
    return selout(pad(im))

def torch_bracket():
    rows = ['..dd..',
            '.dffd.',
            'deffcd',
            'deffcd',
            '.dffd.',
            '..77..',
            '.7997.',
            '79..97',
            '.5..5.',
            '..56..',
            '..66..',
            '..56..',
            '..55..']
    return art(rows, {'d': 12, 'e': 15, 'f': 14, 'c': 13, '7': 6, '9': 8, '5': 4, '6': 5})

def pillar():
    w = 28; im = Image.new('RGBA', (w, 64)); px = im.load()
    shaft = bands(20, (8, 9, 8, 7, 6, 5))
    for y in range(12, 54):
        for x in range(4, 24):
            c = shaft[x - 4]
            if (x - 4) in (5, 10, 15): c -= 2          # fluting
            if (x - 4) in (6, 11, 16): c = min(10, c + 1)
            px[x, y] = C(c)
    def slab_(y0, y1, x0, x1, top, mid, bot):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px[x, y] = C(top if y == y0 else bot if y == y1 else mid)
            px[x0, y] = C(top if y != y1 else bot); px[x1, y] = C(min(mid - 1, bot + 1))
    slab_(54, 57, 2, 25, 9, 7, 5); slab_(58, 63, 0, 27, 8, 6, 4)       # base
    slab_(8, 11, 2, 25, 9, 7, 5); slab_(2, 7, 0, 27, 10, 8, 6)          # capital
    for x in range(1, 27): px[x, 0] = C(5) if x < 26 else CLEAR; px[x, 1] = C(4)   # top: dark, like a wall top
    return selout(im)

def chest():
    rows = [
        '...7777777777777777...',
        '..7ggggg666666ggggg7..',
        '.7g66666666666666666g5',
        '7g6666666666666666666g',
        '7g666666ffff666666666g',
        'gyyyyyyyyyyyyyyyyyyyyy',
        'eyfffffffZZffffffffyed',
        'efffffffZYYZfffffffffd',
        'eyfffffffZZfffffffffyd',
        'efffffffffffffffffffed',
        'eyffffffffffffffffffyd',
        'efffffffffffffffffffed',
        'eyffffffffffffffffffyd',
        'cdddddddddddddddddddcc']
    return selout(pad(art(rows, {'7': 17, 'g': 23, '6': 16, '5': 14, 'f': 15, 'y': 24, 'e': 16, 'd': 13, 'Z': 22, 'Y': 25, 'c': 12})))

def shrine(col_i=(23, 24, 25)):
    a, b, c = col_i
    rows = [
        '.......cc.......',
        '......cbbc......',
        '.....cbbbac.....',
        '....cbbbbaac....',
        '....cbbbaaac....',
        '.....cbaaac.....',
        '......caac......',
        '.......cc.......',
        '................',
        '..998888887766..',
        '.97777777777665.',
        '..666666666655..',
        '...977766554....',
        '...9776aa654....',
        '...977aba654....',
        '...9776aa654....',
        '...977766554....',
        '...977766554....',
        '...977766554....',
        '..99888887766...',
        '.977777777766654',
        '.444444444444444']
    im = art(rows, {'c': a, 'b': c, 'a': b, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4})
    return selout(pad(im))

def carpet(w, hg):
    im = Image.new('RGBA', (w, hg)); px = im.load()
    for y in range(hg):
        for x in range(w):
            e = min(x, w - 1 - x)
            c = 18 if e == 0 else 23 if e == 1 else 22 if e == 2 else 19 if e == 3 else 20
            if e >= 5:   # diamond lattice
                u = (x - 5) % 10; v = y % 10
                if abs(u - 5) + abs(v - 5) == 4: c = 21 if (y // 10 + x // 10) % 2 else 19
                if u == 5 and v == 5: c = 23
            px[x, y] = C(c)
    for x in range(w):   # fringe at the far end
        if x % 2 == 0: px[x, hg - 1] = C(24); px[x, hg - 2] = C(23)
        else: px[x, hg - 1] = CLEAR
    return im

def candelabra():
    rows = [
        '.c...c...c.',
        '.w...w...w.',
        '.w...w...w.',
        'yyy.yyy.yyy',
        '.y...y...y.',
        '.yyyyyyyyy.',
        '.....y.....',
        '.....y.....',
        '.....z.....',
        '.....y.....',
        '.....z.....',
        '.....y.....',
        '.....z.....',
        '....yyz....',
        '...yyzzz...',
        '..zzzzzzz..']
    return selout(pad(art(rows, {'c': 25, 'w': 11, 'y': 24, 'z': 22})))

FLAME = [  # 4 frames, 7 x 11, hand drawn. o outer, m mid, i inner, w core
 ['...o...', '...o...', '..omo..', '..omo..', '.omimo.', '.omimo.', 'omiwimo', 'omiwimo', 'omiwimo', '.omimo.', '..ooo..'],
 ['....o..', '...oo..', '...omo.', '..omo..', '.omimo.', '.omiimo', 'omiwimo', 'omiwimo', 'omiwimo', '.omimo.', '..ooo..'],
 ['.......', '..o....', '..oo...', '..omo..', '.omimo.', '.omimo.', 'omiiwmo', 'omiwimo', 'omiwimo', '.omimo.', '..ooo..'],
 ['...o...', '..oo...', '..omo..', '..omio.', '.omimo.', 'omiimo.', 'omiwimo', 'omiwimo', 'omiwimo', '.omimo.', '..ooo..'],
]
def flames():
    s = Image.new('RGBA', (7 * 4, 11))
    for i, f in enumerate(FLAME): art(f, {'o': 23, 'm': 24, 'i': 25, 'w': 11}, s, (i * 7, 0))
    return s

# ------------------------------------------------------------------ room
def build():
    im = Image.new('RGBA', (W * T, Hh * T + 16), C(TOP)); px = im.load()
    for ty in range(Hh):
        for tx in range(W):
            if not wall(tx, ty): put(im, floor_tile(tx, ty), tx * T, ty * T)
    put(im, carpet(44, 6 * T - 4), 6 * T + 16 - 22, 2 * T)
    put(im, decal_grate(), 4 * T + 9, 4 * T + 10)
    put(im, decal_broken(), 8 * T + 2, 3 * T + 12)
    for (x, y) in ((1 * T + 2, 2 * T + 2), (12 * T + 14, 4 * T + 4), (2 * T + 20, 7 * T + 18), (10 * T + 4, 7 * T + 20)): put(im, decal_rubble(), x, y)
    sx, ex = 2 * T, 4 * T; sy, ey = 5 * T, 7 * T   # puddle, hand-shaped: an inset rounded pool with a far bank
    puddle = [(x, y) for y in range(sy, ey) for x in range(sx, ex)
              if ((x - (sx + ex) / 2) / 29) ** 2 + ((y - (sy + ey) / 2) / 27) ** 2 < 1 + .08 * math.sin(x * .4) * math.cos(y * .3)]
    P = set(puddle)
    for (x, y) in puddle:
        c = 27
        if (x, y - 1) not in P: c = 3
        elif (x, y - 2) not in P: c = 2
        elif (x, y - 3) not in P or (x, y - 4) not in P: c = 26
        elif (x - 1, y) not in P or (x + 1, y) not in P or (x, y + 1) not in P: c = 26
        px[x, y] = C(c)
    for (x, y) in puddle:
        if (x, y + 1) not in P: px[x, y + 1] = C(6)
    rnd = random.Random(5)   # still reflections of the wall light and a few lit ripples
    for (gx, gy, ln) in ((sx + 20, sy + 14, 9), (sx + 26, sy + 18, 5), (sx + 14, sy + 30, 7), (sx + 34, sy + 38, 6), (sx + 22, sy + 46, 4)):
        for i in range(ln):
            if (gx + i, gy) in P: px[gx + i, gy] = C(28 if 0 < i < ln - 1 else 27)
    pit = [(x, y) for y in range(5 * T, 7 * T) for x in range(9 * T, 11 * T)]
    PS = set(pit)
    for (x, y) in pit:
        d = y - 5 * T; fx = x - 9 * T
        c = 0
        if d < 18:
            band = [5, 5, 4, 4, 4, 3, 5, 4, 3, 3, 3, 2, 4, 3, 2, 2, 1, 1][d]   # stacked stone courses down the shaft
            if (fx + (d // 6) * 7) % 14 == 0 and d % 6 != 0: band = max(0, band - 2)
            c = band
        if fx < 2: c = [3, 2][fx] if d < 18 else 1
        if fx > 61: c = 1
        px[x, y] = C(c)
    for x in range(9 * T, 11 * T): px[x, 7 * T - 1] = C(6); px[x, 7 * T - 2] = C(4)
    st = 11 * T; sy0 = 7 * T   # stairs down, built from stepped courses
    for i in range(6):
        y = sy0 + 2 + i * 5; t = [(7, 6, 4), (6, 5, 3), (5, 4, 2), (4, 3, 2), (3, 2, 1), (2, 1, 0)][i]
        for x in range(st + 3 + i // 2, st + 29 - i // 2):
            px[x, y] = C(t[0]); px[x, y + 1] = C(t[1]); px[x, y + 2] = C(t[1]); px[x, y + 3] = C(t[2]); px[x, y + 4] = C(t[2])
    for y in range(sy0, sy0 + 32):
        for x in (st, st + 1, st + 2): px[x, y] = C((7, 6, 5)[x - st])
        for x in (st + 29, st + 30, st + 31): px[x, y] = C((3, 4, 2)[x - st - 29])
    for x in range(st, st + 32): px[x, sy0] = C(7); px[x, sy0 + 1] = C(5)
    # contact shadows: hard 2-step bands under the wall face and along the side walls
    for ty in range(Hh):
        for tx in range(W):
            if wall(tx, ty): continue
            for y in range(T):
                for x in range(T):
                    X, Y = tx * T + x, ty * T + y; k = 0
                    if wall(tx, ty - 1): k = 2 if y < 5 else 1 if y < 11 else 0
                    if wall(tx - 1, ty) and x < 4: k = max(k, 1)
                    if wall(tx + 1, ty) and x > 28: k = max(k, 1)
                    if k and (k == 2 or (X + Y) % 2 == 0 or y < 9):
                        c = px[X, Y]
                        px[X, Y] = tuple(int(v * (.5 if k == 2 else .72)) for v in c[:3]) + (255,)
    # wall tops and trims
    for ty in range(Hh):
        for tx in range(W):
            if not wall(tx, ty) or face(tx, ty): continue
            X, Y = tx * T, ty * T
            if not wall(tx + 1, ty) or face(tx + 1, ty): trim(px, X, Y, 'r')
            elif face(tx + 1, ty + 1): trim(px, X, Y, 'r', partial=RISE)
            if not wall(tx - 1, ty) or face(tx - 1, ty): trim(px, X, Y, 'l')
            elif face(tx - 1, ty + 1): trim(px, X, Y, 'l', partial=RISE)
            if not wall(tx, ty - 1): trim(px, X, Y, 't')
    strip = wall_strip(W * T)
    for ty in range(Hh):
        for tx in range(W):
            if not face(tx, ty): continue
            f = strip.crop((tx * T, 0, tx * T + T, FH)); fp = f.load()
            if wall(tx - 1, ty) and not face(tx - 1, ty):
                for y in range(FH): fp[0, y] = C(2); fp[1, y] = C(3)
            if wall(tx + 1, ty) and not face(tx + 1, ty):
                for y in range(FH): fp[31, y] = C(2); fp[30, y] = C(4)
            if tile(tx, ty) in 'DL': f.alpha_composite(door('open' if tile(tx, ty) == 'D' else 'locked'))
            put(im, f, tx * T, ty * T - RISE)
    # wall dressing
    for col in (2, 9): put(im, banner(), col * T + 6, T - 12)
    lights = []; emit = []
    for cx in (1 * T + 16, 5 * T + 16, 7 * T + 16, 12 * T + 16):
        put(im, torch_bracket(), cx - 3, T + 4); emit.append(('flame', cx - 3, T - 7)); lights.append((cx, T + 2, 150, (255, 176, 80), 1.0))
    sprites = []
    def prop(img, cx, foot, shadow=None):
        sprites.append(dict(img=img, x=cx - img.width // 2, y=foot - img.height, foot=foot, shadow=shadow, cx=cx))
    prop(pillar(), 3 * T + 16, 4 * T - 2, (13, 4)); prop(pillar(), 10 * T + 16, 4 * T - 2, (13, 4))
    prop(barrel(), 12 * T + 8, 2 * T + 26, (10, 3)); prop(barrel(), 12 * T + 24, 3 * T + 2, (10, 3)); prop(crate(), 1 * T + 16, 7 * T + 26, (12, 3))
    prop(crate(), 1 * T + 16, 7 * T + 4, (12, 3))
    prop(chest(), 4 * T + 16, 7 * T + 22, (12, 3))
    prop(shrine(), 12 * T + 16, 5 * T + 28, (10, 3)); lights.append((12 * T + 16, 5 * T + 10, 46, (240, 176, 48), .7)); emit.append(('shrine', 12 * T + 16, 5 * T + 10))
    prop(candelabra(), 1 * T + 14, 4 * T + 26, (6, 2)); lights.append((1 * T + 14, 4 * T + 10, 70, (255, 200, 120), .7))
    for fx in (1 * T + 14 - 4, 1 * T + 14, 1 * T + 14 + 4): emit.append(('candle', fx, 4 * T + 26 - 16))
    sh = Image.new('RGBA', im.size); d = ImageDraw.Draw(sh)
    for s in sprites:
        if s['shadow']:
            rx, ry = s['shadow']; d.ellipse((s['cx'] - rx, s['foot'] - ry - 1, s['cx'] + rx, s['foot'] + ry - 1), fill=(4, 2, 8, 130))
    im.alpha_composite(sh)
    return im, sprites, lights, emit

if __name__ == '__main__':
    im, sprites, lights, emit = build()
    full = im.copy()
    for s in sorted(sprites, key=lambda s: s['foot']): put(full, s['img'], s['x'], s['y'])
    full.save('/tmp/claude-0/px/r14/keep_room.png')
    full.resize((full.width * 2, full.height * 2), Image.NEAREST).save('/tmp/claude-0/px/r14/keep_room2x.png')
