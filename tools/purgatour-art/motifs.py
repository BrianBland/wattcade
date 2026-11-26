"""Cycling motifs, hand placed, a few per zone (keeps the ~7/10 'cyclist purgatory' level without turning the dungeon into a road)."""
import math, random
from PIL import Image, ImageDraw
from pal import C, art, selout, pad

def hx(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

def wheel(R=11, tire=(1, 3), rim=(8, 6), spoke=7, hub=(9, 5), n=16, crop_bottom=None):
    """a spoked wheel, lit top-left; tire, rim, spokes and hub from palette indices"""
    S = R * 2 + 1; im = Image.new('RGBA', (S, S)); px = im.load(); c = R
    for y in range(S):
        for x in range(S):
            dx, dy = x - c, y - c; d = math.hypot(dx, dy)
            lit = (dx + dy) < 0
            if R - 1.5 < d <= R + .4: px[x, y] = C(tire[0] if not lit else tire[1])
            elif R - 2.6 < d <= R - 1.5: px[x, y] = C(rim[0] if lit else rim[1])
            elif d <= 1.6: px[x, y] = C(hub[0] if lit else hub[1])
    for k in range(n):
        a = k * 2 * math.pi / n + (.12 if k % 2 else 0)
        for t in range(3, R - 2):
            x, y = round(c + math.cos(a) * t), round(c + math.sin(a) * t)
            if not px[x, y][3]: px[x, y] = C(spoke)
    if crop_bottom: im = im.crop((0, 0, S, S - crop_bottom))
    return im

def wall_wheel():
    """Keep: a wheel hung on the wall like a trophy, on an iron peg"""
    w = wheel(10, tire=(1, 3), rim=(9, 7), spoke=6, hub=(10, 6), n=16)
    im = Image.new('RGBA', (w.width, w.height + 3)); im.alpha_composite(w, (0, 3))
    for y in range(4): im.putpixel((10, y), C(5 if y else 7))
    return selout(pad(im))

FONT = {'A': ['.#.', '#.#', '###', '#.#', '#.#'], 'L': ['#..', '#..', '#..', '#..', '###'], 'E': ['###', '#..', '##.', '#..', '###'],
        'Z': ['###', '..#', '.#.', '#..', '###'], 'K': ['#.#', '##.', '#..', '##.', '#.#'], 'M': ['#.#', '###', '###', '#.#', '#.#'],
        '0': ['###', '#.#', '#.#', '#.#', '###'], 'O': ['###', '#.#', '#.#', '#.#', '###'], '!': ['#', '#', '#', '.', '#']}
def chalk(text, col=9, scale=1, seed=1):
    """chalked rider graffiti: letters 3x5, slightly uneven, with chalk gaps"""
    rnd = random.Random(seed); w = sum(len(FONT[ch][0]) + 1 for ch in text) * scale + 2; im = Image.new('RGBA', (w, 7 * scale + 2)); px = im.load(); x0 = 1
    for i, ch in enumerate(text):
        g = FONT[ch]; dy = rnd.choice((0, 0, 1))
        for y, row in enumerate(g):
            for x, v in enumerate(row):
                if v == '#' and rnd.random() > .05:
                    for sy in range(scale):
                        for sx in range(scale): px[x0 + x * scale + sx, 1 + dy + y * scale + sy] = C(col)
        x0 += (len(g[0]) + 1) * scale
    return im

def borne(top=21):
    """a French road km marker: white stone, coloured cap, with a smudged 'KM 0' (the start line of purgatory)"""
    rows = ['..rrrrrr..', '.rRRRRRrr.', 'rRRRRRRrrr', 'rrrrrrrrrr', 'wWWWWWWWwv', 'wW#.#.#Wwv', 'wW##..#Wwv', 'wW#.#.#Wwv', 'wWWWWWWWwv',
            'wW###.WWwv', 'wW#.#.WWwv', 'wW###.WWwv', 'wWWWWWWWwv', 'wWWWWWWWwv', 'vvvvvvvvvv']
    key = {'r': top - 1, 'R': top, 'w': 10, 'W': 11, 'v': 8, '#': 4}
    return selout(pad(art(rows, key)))

def bike_relief(im, ox, oy, lo=6, hi=10):
    """carve a small bicycle (16x8) into a stone surface: lo = cut, hi = lit edge"""
    rows = ['.......h........', '......cccc..hh..', '..cc.c...c.c....', '.c..cc...cc.c...', 'c..c.c..c..c.c..', '.c..c....c..c...', '..cc......cc....']
    px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == 'c': px[ox + x, oy + y] = C(lo); px[ox + x, oy + y + 1] = C(hi) if px[ox + x, oy + y + 1] != C(lo) else px[ox + x, oy + y + 1]
            elif ch == 'h': px[ox + x, oy + y] = C(lo)

def helmet_small(im, ox, oy):
    art(['.rrRr.', 'rRrrrr', 'r0r0rr', 'kkkkkk'], {'r': 20, 'R': 21, '0': 2, 'k': 4}, im, (ox, oy))

def bone_wheel(px, cx, cy, R=13, SK=None):
    """Catacombs: an ossuary rosette, a wheel of bones around a skull hub"""
    for y in range(cy - R - 1, cy + R + 2):
        for x in range(cx - R - 1, cx + R + 2):
            d = math.hypot(x - cx, y - cy)
            if R - 2.2 < d <= R:
                lit = (x - cx) + (y - cy) < 0; px[x, y] = C(10 if lit else 8)
            elif R - 3.2 < d <= R - 2.2: px[x, y] = C(2)
            elif 5 < d <= R - 3.2: px[x, y] = C(2)
    for k in range(10):
        a = k * math.pi / 5
        for t in range(5, R - 2):
            x, y = round(cx + math.cos(a) * t), round(cy + math.sin(a) * t)
            px[x, y] = C(9 if t not in (5, R - 3) else 11)
    if SK:
        key = {'b': 10, 'B': 11, 'c': 9, '0': 1, 't': 3}
        for r, row in enumerate(SK):
            for c, ch in enumerate(row):
                if ch != '.': px[cx - 3 + c, cy - 3 + r] = C(key[ch])

def chainring_sigil(R=7.5, teeth=16):
    """Deep: the rune door's seal is a chainring, glowing pixels returned as a list"""
    pts = []
    for y in range(-10, 11):
        for x in range(-10, 11):
            d = math.hypot(x, y); a = math.atan2(y, x)
            tooth = math.cos(a * teeth) > .3
            if (R - 1.2 < d <= R) or (R < d <= R + 1.2 and tooth) or (abs(d - 3.2) < .6) or (d < 3 and any(abs(math.atan2(y, x) - k * math.pi * 2 / 5 + math.pi) % (2 * math.pi / 5) < .25 for k in range(5)) and d > 1.5):
                pts.append((x, y))
    return pts

def frame_relic():
    """Deep: a broken bike frame, rusted, half sunk in the rock"""
    im = Image.new('RGBA', (26, 14)); d = ImageDraw.Draw(im)
    for (a, b, c) in (((3, 12), (11, 4), 16), ((11, 4), (22, 5), 15), ((11, 4), (13, 13), 16), ((22, 5), (13, 13), 15), ((22, 5), (24, 2), 14)):
        d.line((a, b), fill=C(c), width=2) if False else d.line((a[0], a[1], b[0], b[1]), fill=C(c), width=1)
    d.line((21, 1, 25, 1), fill=C(7)); d.line((9, 2, 13, 2), fill=C(4))
    for x in range(26):
        for y in (12, 13): im.putpixel((x, y), (0, 0, 0, 0))
    return selout(pad(im))
