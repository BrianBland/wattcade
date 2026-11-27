"""Pickups and enemy projectiles in the round-14 style (master palette, top-left light, selective outlines)."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pal import *
from PIL import Image

def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
LK = {'k': 1, 'm': 4, 'n': 6, 'v': 9, 'w': 11, 'W': 10, 'p': 27, 'q': 28, 'u': 29, 'r': 19, 'R': 21, 'D': 20, 'g': 22, 'G': 23, 'Y': 24, 'y': 25,
      'b': 13, 'B': 15, 'f': 30, 'F': 31}
def art_l(rows):
    h = len(rows); w = max(len(r) for r in rows); im = Image.new('RGBA', (w, h)); px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch not in '. ': px[x, y] = C(LK[ch]) if isinstance(LK[ch], int) else hexc(LK[ch])
    return selout(pad(im))

def shade(nx, ny, ramp):
    """stepped top-left light on a surface normal; ramp dark..bright"""
    l = -nx * .7 - ny * .7
    return ramp[0] if l < -.35 else ramp[1] if l < .25 else ramp[2] if l < .7 else ramp[3]

# --- bidon (heal): blue bottle, white label band with a red stripe
BIDON = ["..nv...",
         "..nv...",
         ".nvwvn.",
         "nvwwvvn",
         "mnnnnnm",
         "quuuuqp",
         "quwuuqp",
         "quwuuqp",
         "vwwwwvn",
         "vRRRRDr",
         "vwwwwvn",
         "quwuuqp",
         "quuuuqp",
         "pqqqqpp"]

# --- key (gold)
KEY = [".GYYG..",
       "GY..gG.",
       "Y....g.",
       "G....g.",
       "gG..gg.",
       ".gGGg..",
       "..YG...",
       "..YG...",
       "..YGgg.",
       "..YG...",
       "..YGgG.",
       "..YGg..",
       "..gg..."]

# --- gear: jersey (armor), cycling shoe (boots); helmet and ring are generated
JERSEY = ["..qqu...uqp..",
          ".quuuw.wuuup.",
          "quuuuuwuuuuup",
          "quuuuuvuuuuup",
          "wwwwwwvwwwwwv",
          "RRRRRRvRRRRRD",
          "pp.quuvuup.pp",
          "...quuvuup...",
          "...quuvuup...",
          "...quuvuup...",
          "...vwwvwwv...",
          "...pqqqqqp..."]
SHOE = ["..vw.........",
        ".vwwvn.......",
        ".vwmwwvn.....",
        ".wwwwwwwwvn..",
        ".wwRRRwwwwvn.",
        ".wwwwwwwwwwwn",
        "kkkkkkkkkkkkk",
        "...mnm..mnm.."]

def helmet():
    W, H = 15, 10; im = Image.new('RGBA', (W, H)); px = im.load(); cx, cy = 7, 8.6
    red = [C(19), C(20), C(21), hexc('#ff7a6a')]
    for y in range(H):
        for x in range(W):
            dx, dy = (x + .5 - cx) / 7.2, (y + .5 - cy) / 8.2
            if dx * dx + dy * dy > 1 or y > 8: continue
            c = shade(dx, dy, red)
            if y in (3, 4, 5) and (x - 1) % 3 == 0 and 2 < x < 13 and dx * dx + dy * dy < .7: c = C(2)   # vents
            if y == 8: c = C(4)                                                                         # rim
            px[x, y] = c
    for x in (3, 4, 10, 11): px[x, 9] = C(6)   # strap stubs
    return selout(pad(im))

def ring():
    W = 11; im = Image.new('RGBA', (W, W)); px = im.load(); c0 = 5
    gold = [C(22), C(23), C(24), C(25)]
    for y in range(W):
        for x in range(W):
            dx, dy = x - c0, (y - c0 - 1) * 1.15; d = math.hypot(dx, dy)
            if 2.6 < d < 4.6 and y > 1: px[x, y] = shade(dx / 4, dy / 4, gold) if d > 3.4 else shade(-dx / 4, -dy / 4, gold)
    gem = ["..D..", ".DRR.", "DRwRr", ".rRr.", "..r.."]
    for y, r in enumerate(gem):
        for x, ch in enumerate(r):
            if ch != '.': px[3 + x, y] = C(LK[ch])
    return selout(pad(im))

def chainring(frame=0):
    """coin: a gold chainring, 8 teeth, turning (frames squash horizontally)"""
    S = 11; sq = [1, .72, .38, .72][frame]; im = Image.new('RGBA', (S, S)); px = im.load(); c = 5
    gold = [C(22), C(23), C(24), C(25)]
    for y in range(S):
        for x in range(S):
            dx = (x - c) / max(sq, .2); dy = y - c; d = math.hypot(dx, dy); a = math.atan2(dy, dx)
            tooth = (math.cos(a * 8) > .35)
            if (2.2 < d < 4.4) or (4.4 <= d < 5.4 and tooth):
                px[x, y] = shade(dx / 5, dy / 5, gold)
                if frame == 2 and abs(x - c) <= 1: px[x, y] = gold[1 if x >= c else 2]
            elif d <= 2.2 and frame != 2: pass
    return selout(pad(im))

# --- enemy bullets: hot pink-red, a ramp no player element uses, dark ring so they read on any floor
EN = ['#3a0a1e', '#a8163e', '#ff3d6a', '#ffb3c4', '#fff2f5']
def bullet(r, frame=0, ramp=EN):
    S = int(r * 2 + 3); c = (S - 1) / 2; im = Image.new('RGBA', (S, S)); px = im.load()
    R = [hexc(h) for h in ramp]
    core = r * (.42 if frame == 0 else .3)
    for y in range(S):
        for x in range(S):
            dx, dy = x - c, y - c; d = math.hypot(dx, dy)
            if d > r + .5: continue
            if d > r - .6: px[x, y] = R[0]
            elif d > r - 1.6: px[x, y] = R[1]
            elif math.hypot(dx + .8, dy + .8) < core: px[x, y] = R[4]
            else: px[x, y] = R[2] if math.hypot(dx + .5, dy + .5) > core + 1.1 else R[3]
    return im

SPIT = ['#0e2a0c', '#2e7a22', '#7dff5a', '#c8ff9c', '#f2ffe6']
SPIT_ROWS = [["......ooo..",
              ".....obhwo.",
              "....obhhbbo",
              ".hb.obbbbbo",
              ".mm.ommbbmo",
              "m....ommmo.",
              "......ooo.."],
             ["......ooo..",
              ".....obhwo.",
              "....obhhbbo",
              "....obbbbbo",
              "..hbommbbmo",
              "..mm.ommmo.",
              "m.....ooo.."]]
def spit(frame=0):
    """slime spit: a round green glob with trailing droplets that wobble (points right)"""
    R = [hexc(h) for h in SPIT]; key = dict(o=R[0], m=R[1], b=R[2], h=R[3], w=R[4]); rows = SPIT_ROWS[frame]
    im = Image.new('RGBA', (len(rows[0]), len(rows))); px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.': px[x, y] = key[ch]
    return im

def boss_orb(frame=0):
    """boss shot: big ring bullet with four spokes, spins (2 frames)"""
    im = bullet(6.5, frame); px = im.load(); c = (im.width - 1) / 2; R = [hexc(h) for h in EN]
    a0 = frame * math.pi / 4
    for k in range(4):
        a = a0 + k * math.pi / 2
        for t in (4.6, 5.4):
            x, y = round(c + math.cos(a) * t), round(c + math.sin(a) * t)
            px[x, y] = R[0]
    return im

def pill(frame=0):
    """fast enemy shot: a capsule pointing right (rotated to its heading at runtime)"""
    R = [hexc(h) for h in EN]; W, H = 11, 7; im = Image.new('RGBA', (W, H)); px = im.load()
    for y in range(H):
        for x in range(W):
            cx = min(max(x + .5, 3.5), 7.5); d = math.hypot(x + .5 - cx, y + .5 - 3.5)
            if d > 3.4: continue
            px[x, y] = R[0] if d > 2.5 else R[1] if (y >= 4 and d > 1.4) else R[4] if (d < 1.2 and x >= 4 - frame and x <= 7 - frame) else R[3] if d < 1.5 else R[2]
    return im

def hollow(frame=0):
    """ring bullet: hollow, so a wall of them still shows gaps you can read"""
    R = [hexc(h) for h in EN]; S = 11; im = Image.new('RGBA', (S, S)); px = im.load(); c = 5
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - c, y - c)
            if 3.0 < d <= 5.2:
                px[x, y] = R[0] if (d > 4.5 or d < 3.5) else (R[3] if (x + y < 9 + frame) else R[2])
    return im

def crescent(frame=0):
    """bat screech: a crescent wave pointing right; frame 1 is wider as it spreads"""
    R = [hexc(h) for h in EN]; W, H = 8, [11, 15][frame]; im = Image.new('RGBA', (W, H)); px = im.load(); cy = (H - 1) / 2
    for y in range(H):
        for x in range(W):
            t = (y - cy) / (cy + .5)
            front = 6.5 - 5 * t * t; back = front - (4.2 - 2.6 * abs(t))
            if back - .6 <= x <= front:
                px[x, y] = R[0] if (x > front - .9 or x < back + .5 or abs(t) > .86) else R[4] if (abs(t) < .35 and x > back + 1.4) else R[3] if abs(t) < .55 else R[2]
    return im

def puddle(frame=0):
    """slime glob landing: a green splash that lingers and fades"""
    R = [hexc(h) for h in SPIT]; W, H = 17, 9; im = Image.new('RGBA', (W, H)); px = im.load()
    rx, ry = [(4, 2.2), (7, 3.6), (7.6, 3.9)][frame]
    for y in range(H):
        for x in range(W):
            d = math.hypot((x + .5 - 8.5) / rx, (y + .5 - 4.5) / ry)
            if d <= 1: px[x, y] = R[0] if d > .82 else R[1] if (y > 4 or frame == 2) else R[2]
    if frame < 2:
        for dx, dy in ((-7, -3), (7, -2), (-5, 3), (6, 3)):
            x, y = 8 + dx * (frame + 1) // 2, 4 + dy * (frame + 1) // 2
            if 0 <= x < W and 0 <= y < H: px[x, y] = R[2]
    return im

if __name__ == '__main__':
    items = [art_l(BIDON), chainring(0), chainring(1), chainring(2), art_l(KEY), helmet(), art_l(JERSEY), art_l(SHOE), ring(),
             bullet(2.5, 0), bullet(4, 0), pill(0), hollow(0), crescent(0), crescent(1), spit(0), puddle(0), puddle(1), puddle(2), boss_orb(0)]
    S = 6; x = 4; out = Image.new('RGBA', ((sum(i.width for i in items) + 4 * len(items)) * S + 8, 24 * S), C(3))
    for i in items:
        out.alpha_composite(i.resize((i.width * S, i.height * S), Image.NEAREST), (x * S, 4 * S)); x += i.width + 4
    out.save('/tmp/claude-0/px/r15/loot.png'); print(out.size)
