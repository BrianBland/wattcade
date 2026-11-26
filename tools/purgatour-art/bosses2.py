"""Boss repaint (round 23): the weaker pun bosses redrawn at the round-17 character standard.
Light from the top left, full dark outline, 4-step ramps, hand-placed clusters (no noise fields)."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit2 import *
from enemies3 import COAT

def h2(x, y, s=0):
    n = (x * 374761393 + y * 668265263 + s * 2147483647) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return (n ^ (n >> 16)) / 0xffffffff

MOSS = R('#1a2c18', '#2e4a26', '#5e8a3a', '#9ac45a')

# ------------------------------------------------------------------ King of the Mountains: a living mountain in the KOM mantle
ROCK = R('#1c1822', '#332c3a', '#4e4656', '#706774', '#958a94'); SNOW = R('#5e6e80', '#98aabc', '#cad8e6', '#eef6ff')
def king_of_mountains(fr=0, atk=False):
    cv = Cv(64, 64); b = fr % 2
    peaks = [(31, 3 + b), (14, 27 + b), (50, 24 + b)]
    sil = [(3, 61), (8, 44), (11, 33 + b), (14, 27 + b), (18, 31 + b), (21, 29 + b), (25, 16 + b), (28, 9 + b), (31, 3 + b), (34, 8 + b),
           (37, 13 + b), (40, 19 + b), (44, 23 + b), (47, 21 + b), (50, 24 + b), (53, 30 + b), (56, 38), (58, 48), (61, 61)]
    m = cv.mask(sil)
    inside = lambda x, y: 0 <= x < 64 and 0 <= y < 64 and m[x, y]
    def ridge(px_, py_, y):   # each peak's ridge runs down and to the right
        return px_ + (y - py_) * 0.32
    for y in range(64):
        for x in range(64):
            if not inside(x, y): continue
            pk = min(peaks, key=lambda p: abs(x - p[0]) + max(0, p[1] - y) * 2)
            rx = ridge(pk[0], pk[1], y); lit = x < rx
            k = 2 if lit else 1
            if lit and rx - x < 2 and y > pk[1] + 1: k = 3                     # catch-light along the ridge
            if not lit and (x - rx) > 9: k = 0 if (x + y) % 2 == 0 or x - rx > 13 else 1   # deep shade, dithered edge
            if not inside(x - 1, y) or not inside(x, y - 1): k = min(4, k + 1)     # lit rim on the top-left silhouette
            if h2(x // 2, y // 2, 3) < .09 and 0 < k < 4: k -= 1                   # grit clusters (2x2)
            cv.set(x, y, ROCK[k])
    # strata: slanted cracks with a lit lip under them, broken into runs
    for i, y0 in enumerate(range(15, 46, 6)):
        x = 6 + int(h2(i, 9) * 8)
        while x < 60:
            run = 3 + int(h2(x, y0, 1) * 6); yy = y0 + (x - 32) * 0.12 + b
            for t in range(run):
                X, Y = x + t, int(yy + t * 0.12)
                if inside(X, Y) and inside(X, Y + 1):
                    cv.set(X, Y, ROCK[0]);
                    if cv.get(X, Y + 1) in (ROCK[2], ROCK[3]): cv.set(X, Y + 1, ROCK[3])
            x += run + 3 + int(h2(x, y0, 2) * 5)
    # snow caps with drips, lit on the left of each ridge
    for (pxx, pyy), depth in zip(peaks, (14, 6, 6)):
        for x in range(pxx - 12, pxx + 13):
            drip = depth - abs(x - pxx) * 0.7 + (3 if h2(x, pyy, 5) < .3 else 0) + (h2(x, 7) * 2)
            for y in range(pyy, int(pyy + max(0, drip)) + 1):
                if not inside(x, y): continue
                lit = x < ridge(pxx, pyy, y)
                k = 2 if lit else 1
                if not inside(x - 1, y) or not inside(x, y - 1): k = 3
                cv.set(x, y, SNOW[k])
            y = int(pyy + max(0, drip)) + 1
            if inside(x, y) and drip > 0: cv.set(x, y, ROCK[0])                    # shadow line under the snow edge
    # summit flag: polka-dot KOM pennant
    fx, fy = 50, 24 + b
    cv.line(fx, fy - 1, fx, fy - 11, C(9)); cv.set(fx, fy - 11, GOLD[3])
    wave = [0, 1] if fr % 2 else [1, 0]
    for i in range(9):
        for j in range(5 - i // 2):
            X, Y = fx + 1 + i, fy - 9 + j + (wave[(i // 2) % 2])
            cv.set(X, Y, RED[2] if (i + j) % 3 == 0 else C(11) if j == 0 else C(10))
    # pines on the slopes
    for (tx, ty) in ((9, 40), (13, 37), (53, 41)):
        for r in range(5):
            for dx in range(-(r // 2) - 0, r // 2 + 1):
                cv.set(tx + dx, ty + r, MOSS[2] if dx < 0 else MOSS[1])
        cv.set(tx, ty - 1, MOSS[3]); cv.set(tx, ty + 5, WOOD[1])
    # the face: overhanging brows, eyes glowing out of deep sockets, a crevasse mouth with stalactite teeth
    fy0 = 26 + b; eye = (hx('#ff7a4a'), hx('#ffd25a')) if atk else (GOLD[2], GOLD[3])
    for (x0, x1, s) in ((21, 30, 1), (34, 43, -1)):
        for x in range(x0, x1 + 1):
            y = fy0 + (x - x0) * 0.25 * s + (2 if s < 0 else 0)
            cv.set(x, y - 1, ROCK[3]); cv.set(x, y, ROCK[2]); cv.set(x, y + 1, ROCK[0]); cv.set(x, y + 2, ROCK[0])
    for ex in (26, 38):
        cv.ell(ex, fy0 + 4, 3, 2, [ROCK[0]] * 4, spec=False)
        cv.set(ex - 1, fy0 + 4, eye[0]); cv.set(ex, fy0 + 4, eye[1]); cv.set(ex + 1, fy0 + 4, eye[0])
        if atk: cv.set(ex, fy0 + 3, eye[0])
    for y in range(fy0 + 4, fy0 + 10): cv.set(32, y, ROCK[3] if y < fy0 + 8 else ROCK[2]); cv.set(33, y, ROCK[1])   # nose ridge
    mw = 9 if atk else 7; my = fy0 + 12
    for x in range(32 - mw, 33 + mw):
        o = abs(x - 32); hgt = (4 if atk else 2) - (1 if o > mw - 3 else 0)
        for y in range(my - hgt // 2, my + hgt // 2 + 1): cv.set(x, y, C(0))
        if o < mw - 1 and x % 3 == 0: cv.set(x, my - hgt // 2, BONE[2]); cv.set(x, my - hgt // 2 + 1, BONE[1])   # stalactite teeth
    cv.line(32 - mw, my - 2, 32 + mw, my - 2, ROCK[3])
    # the polka-dot mantle draped over the shoulders, sagging in the middle, with folds
    top = lambda x: 45 + b + int(3 * math.sin((x - 4) / 56 * math.pi))
    for x in range(2, 63):
        for y in range(top(x), 62):
            if not (inside(x, y) or inside(x - 2, y) or inside(x + 2, y)) or y > 60 - (1 if (x // 3) % 2 else 0): continue
            fold = math.sin(x * 0.55 + 0.6) ; base = 9 if fold > .55 else 8 if fold > -.35 else 7
            if x > 46: base -= 1
            u, v = (x + (y // 5) % 2 * 3) % 6, (y - top(x)) % 5
            dot = u in (1, 2) and v in (2, 3)
            c = C(base)
            if dot: c = RED[2] if base >= 8 else RED[1]
            if y == top(x): c = GOLD[2]
            elif y == top(x) + 1: c = GOLD[1]
            cv.set(x, y, c)
    for x in range(7, 58, 7): cv.ell(x, top(x) + 1, 1.5, 1.4, GOLD)               # gold studs on the collar
    # boulder arms
    def boulder(cx, cy, r):
        cv.ell(cx, cy, r, r * .85, ROCK[1:5])
        cv.line(cx - r * .5, cy + r * .1, cx + r * .2, cy - r * .2, ROCK[0]); cv.set(cx - r * .45, cy - r * .5, ROCK[4])
    if atk:
        boulder(9, 34, 5); boulder(7, 22, 6); boulder(55, 34, 5); boulder(57, 22, 6)
        for (x, y) in ((4, 12), (12, 10), (52, 9), (60, 13)): cv.set(x, y, ROCK[2]); cv.set(x + 1, y + 1, ROCK[1])   # crumbling grit
    else:
        boulder(7, 50 + b, 6); boulder(5, 57, 5); boulder(57, 50 + b, 6); boulder(59, 57, 5)
    return cv.done()

# ------------------------------------------------------------------ The Headwind Wyrm (96 x 64): a cloud-serpent of pure resistance
WIND = R('#16243a', '#2c4a6e', '#4f7eaa', '#8cc0e6', '#d8f0ff'); BELLY = R('#5e5462', '#8f8489', '#cfc4b8', '#f1e8d6')
CLOUD = R('#8a9cb4', '#c2d2e4', '#eaf4ff', '#ffffff')
def headwind_wyrm(fr=0, atk=False):
    cv = Cv(96, 64); ph = fr * .7
    path = lambda t: (8 + t * 64, 44 + 9 * math.sin(t * 5.2 + ph) - t * 8)
    def rad(t): return 2.5 + 6.5 * math.sin(min(1, t * 1.15) * math.pi * .5)
    # body tube, tail first; shading from the cross-section normal, banded belly scutes underneath
    N = 220
    for i in range(N + 1):
        t = i / N; x, y = path(t); r = rad(t)
        x2, y2 = path(min(1, t + .01)); L = math.hypot(x2 - x, y2 - y) or 1; nx, ny = -(y2 - y) / L, (x2 - x) / L
        for k in range(-int(r) - 1, int(r) + 2):
            o = k / r
            if abs(o) > 1: continue
            X, Y = x + nx * k, y + ny * k
            belly = o > .35
            if belly:
                band = int(t * 40) % 2 == 0
                c = BELLY[2 if o < .7 else 1] if not band else BELLY[1 if o < .7 else 0]
            else:
                l = -o * .9 + .25
                c = WIND[4] if l > .95 else WIND[3] if l > .55 else WIND[2] if l > .05 else WIND[1] if l > -.45 else WIND[0]
            cv.set(X, Y, c)
    # scale rows along the back and dorsal fins that curl like gusts
    for i in range(4, 34):
        t = i / 40; x, y = path(t); r = rad(t)
        x2, y2 = path(t + .01); L = math.hypot(x2 - x, y2 - y) or 1; nx, ny = -(y2 - y) / L, (x2 - x) / L
        if i % 2 == 0: cv.set(x - nx * r * .35, y - ny * r * .35, WIND[1])
        if i % 4 == 0 and i < 32:
            for s in range(4):
                cv.set(x - nx * (r + 1 + s) - s * .8, y - ny * (r + 1 + s), WIND[3] if s < 2 else CLOUD[1])
    # cloud puffs where the body meets the air, drifting with the frame
    for i, t in enumerate((.12, .33, .55, .74)):
        x, y = path(t); r = rad(t)
        for (dx, dy, rr) in ((-2, r * .9, 3), (2, r * .9 + 1, 2.5), (5, r * .8, 2)):
            cv.ell(x + dx + fr, y + dy, rr, rr * .8, CLOUD)
    cv.ell(path(0)[0] - 3, path(0)[1], 3, 2.5, CLOUD); cv.ell(path(0)[0] - 6, path(0)[1] + 1, 2, 2, CLOUD)
    # head: long draconic skull, brow horn, open jaw on attack, cheek whiskers streaming back
    hx_, hy = path(1)[0] + 6, path(1)[1] - 6 - (3 if atk else 0)
    cv.ell(hx_, hy, 10, 8, WIND[0:4])
    cv.poly([(hx_ + 3, hy - 5), (hx_ + 19, hy - 1), (hx_ + 20, hy + 2), (hx_ + 4, hy + 3)], WIND[1:5], 1)        # upper snout
    cv.line(hx_ + 4, hy - 4, hx_ + 18, hy - 1, WIND[4])
    jaw = 6 if atk else 1
    cv.poly([(hx_ - 2, hy + 4), (hx_ + 17, hy + 3 + jaw), (hx_ + 15, hy + 6 + jaw), (hx_ - 1, hy + 8)], [WIND[0], WIND[1], WIND[2], WIND[3]], 1)
    if atk:
        cv.poly([(hx_ + 4, hy + 3), (hx_ + 17, hy + 2), (hx_ + 16, hy + 3 + jaw), (hx_ + 4, hy + 5)], [C(0)] * 4, 1)   # maw
        for x in range(hx_ + 6, hx_ + 17, 3): cv.set(x, hy + 3, BONE[3]); cv.set(x + 1, hy + 2 + jaw, BONE[2])
    cv.set(hx_ + 18, hy - 2, WIND[0])                                                                         # nostril
    cv.ell(hx_ + 2, hy - 2, 2.5, 2, [C(0)] * 4, spec=False); cv.set(hx_ + 3, hy - 2, hx('#ffffff')); cv.set(hx_ + 2, hy - 2, hx('#8cf0ff'))
    cv.line(hx_ - 1, hy - 5, hx_ + 6, hy - 4, WIND[0])                                                       # brow ridge
    for (x0, y0, x1, y1) in ((hx_ - 4, hy - 6, hx_ - 15, hy - 14), (hx_, hy - 8, hx_ - 7, hy - 18)):           # swept horns
        cv.rod(x0, y0, x1, y1, BONE, 2)
    for k, w in enumerate((0, 3)):                                                                            # whiskers
        for s in range(16):
            cv.set(hx_ + 8 - s, hy + 5 + w + 2 * math.sin(s * .5 + fr * 1.5 + k), CLOUD[2] if s < 9 else CLOUD[1])
    # gust streaks around it
    for k, (wy, wl) in enumerate(((8, 22), (16, 14), (58, 20), (26, 10))):
        off = int((fr * 6 + k * 9) % 14)
        for x in range(2 + off, 2 + off + wl): cv.set(x, wy + (1 if x % 7 == 0 else 0), CLOUD[2] if x % 3 else CLOUD[1])
    if atk:   # the breath: concentric arcs of wind
        for r in (5, 9, 13):
            for a in range(-45, 46, 7): cv.set(hx_ + 20 + math.cos(math.radians(a)) * r, hy + 4 + math.sin(math.radians(a)) * r * .9, CLOUD[3] if r < 13 else CLOUD[1])
    return cv.done()

# ------------------------------------------------------------------ The Grim Sweeper (64 x 96): final boss, the reaper who sweeps up the DNFs
ROBE = R('#0c0a12', '#1a1524', '#2c2438', '#463a56', '#6a5a7e')
def grim_sweeper(fr=0, atk=False):
    cv = Cv(64, 96); b = fr % 2; sway = (1 if fr % 2 else -1)
    # robe: a hunched, tall silhouette that flares to a tattered hem
    body = [(30, 12 + b), (40, 16 + b), (46, 26 + b), (48, 40), (52, 62), (56, 84), (58, 91), (6, 91), (9, 80), (13, 60), (16, 40), (19, 24 + b)]
    m = cv.mask(body); ins = lambda x, y: 0 <= x < 64 and 0 <= y < 96 and m[x, y]
    for y in range(96):
        for x in range(64):
            if not ins(x, y): continue
            fold = math.sin(x * 0.42 + y * 0.03 + 1.3)
            k = 2 if fold > .4 else 1 if fold > -.5 else 0
            if fold > .82 and y > 30: k = 3
            if x > 40: k = max(0, k - 1)
            if not ins(x - 1, y) and y > 20: k = 3
            cv.set(x, y, ROBE[k])
    # ragged hem: strips of different lengths that sway
    for x in range(6, 59, 3):
        ln = 2 + int(h2(x, 1) * 5)
        for d in range(ln):
            cv.set(x + (sway if d > 2 else 0), 91 + d, ROBE[1]); cv.set(x + 1 + (sway if d > 2 else 0), 91 + d, ROBE[0] if d else ROBE[1])
    # mantle over the shoulders with its own hem
    mt = [(20, 22 + b), (42, 20 + b), (50, 34 + b), (44, 38 + b), (38, 35 + b), (32, 40 + b), (26, 35 + b), (20, 38 + b), (14, 34 + b)]
    mm = cv.mask(mt)
    for y in range(96):
        for x in range(64):
            if mm[x, y]: cv.set(x, y, ROBE[3] if x < 26 else ROBE[2] if x < 40 else ROBE[1])
    # hood: deep, with only the eyes and a jaw glimpse lit from below
    cv.ell(30, 18 + b, 11, 11, ROBE[1:5])
    cv.ell(32, 21 + b, 7, 8, [C(0)] * 4, spec=False)
    cv.poly([(19, 14 + b), (30, 5 + b), (37, 7 + b), (30, 11 + b)], ROBE[2:5], 1)                 # hood tip, drooping forward
    ec = hx('#9affd6') if not atk else hx('#ff6a5a')
    for ex in (29, 35): cv.set(ex, 20 + b, ec); cv.set(ex, 21 + b, hx('#ffffff') if atk else hx('#4ac8a0'))
    for x in range(29, 36): cv.set(x, 26 + b, BONE[1] if x % 2 else BONE[2])                     # teeth glint
    cv.set(32, 23 + b, C(2))
    # sash: the broom-wagon colours, red with a gold buckle, hanging tails
    cv.poly([(16, 42 + b), (47, 40 + b), (48, 45 + b), (17, 47 + b)], RED, 1)
    cv.ell(33, 44 + b, 3, 2.5, GOLD)
    for (x, ln) in ((40, 14), (43, 11)):
        for d in range(ln): cv.set(x + (sway if d > 6 else 0), 46 + b + d, RED[2] if d < 5 else RED[1]); cv.set(x + 1 + (sway if d > 6 else 0), 46 + b + d, RED[0])
    # the broom: long handle, bound straw head with streaks of light
    bx0, by0, bx1, by1 = (10, 34, 56, 8) if atk else (50, 32 + b, 14, 86)
    cv.rod(bx0, by0, bx1, by1, WOOD, 3)
    L = math.hypot(bx1 - bx0, by1 - by0); ux, uy = (bx1 - bx0) / L, (by1 - by0) / L; px_, py_ = -uy, ux
    ex, ey = (bx1, by1) if not atk else (bx0, by0); sg = 1 if not atk else -1
    br = [(ex - px_ * 3, ey - py_ * 3), (ex + px_ * 3, ey + py_ * 3), (ex + px_ * 9 + ux * 14 * sg, ey + py_ * 9 + uy * 14 * sg), (ex - px_ * 9 + ux * 14 * sg, ey - py_ * 9 + uy * 14 * sg)]
    bm = cv.mask(br); STRAW = [C(22), C(23), C(24), C(25)]
    for y in range(96):
        for x in range(64):
            if not bm[x, y]: continue
            s = (x * ux + y * uy); q = (x * px_ + y * py_)
            k = 2 if int(q * 1.5) % 3 else 1
            if int(q * 1.5) % 5 == 0: k = 3
            if h2(x, y, 11) < .12: k = 0
            cv.set(x, y, STRAW[k])
    for d in (-1, 1): cv.line(ex - px_ * 4 + ux * 2 * sg * d, ey - py_ * 4 + uy * 2 * sg * d, ex + px_ * 4 + ux * 2 * sg * d, ey + py_ * 4 + uy * 2 * sg * d, RED[1])
    # skeletal hands on the handle
    for t in (0.0, 0.32):
        hx0, hy0 = bx0 + (bx1 - bx0) * t, by0 + (by1 - by0) * t
        cv.ell(hx0, hy0, 2.6, 2.2, BONE); cv.set(hx0 + 1, hy0 + 2, BONE[0]); cv.set(hx0 - 1, hy0 + 2, BONE[0])
    # a lantern hanging from the belt: the only warm light on it
    lx, ly = 22, 50 + b
    cv.line(lx, ly - 4, lx, ly - 1, STEEL[1]); cv.poly([(lx - 3, ly), (lx + 3, ly), (lx + 3, ly + 6), (lx - 3, ly + 6)], STEEL, 1)
    cv.poly([(lx - 2, ly + 1), (lx + 2, ly + 1), (lx + 2, ly + 5), (lx - 2, ly + 5)], [C(23), C(24), C(25), C(25)], 1)
    cv.set(lx, ly + 3, hx('#ffffff'))
    return cv.done()

# ------------------------------------------------------------------ The Lycra Lich: a skinsuited lich whose cape is a tattered team flag
SUIT = R('#0b2e36', '#14606a', '#239c9e', '#68dcd0', '#c4fff0'); PANEL = R('#3a0a2e', '#7a1a5e', '#c42a86', '#ff7ac0')
def lycra_lich(fr=0, atk=False):
    cv = Cv(64, 64); f = [0, 1][fr % 2]; spread = 6 if atk else 0
    # cape: jagged wings with fold shading and a hem of torn strips
    cape = [(19, 17 + f), (45, 17 + f), (58 + spread, 46 + f), (52, 44 + f), (50, 54 + f), (44, 48 + f), (39, 58 + f), (33, 50 + f), (28, 58 + f),
            (22, 48 + f), (16, 55 + f), (13, 44 + f), (6 - spread, 46 + f)]
    cm = cv.mask(cape)
    for y in range(64):
        for x in range(64):
            if not cm[x, y]: continue
            fold = math.sin((x - 32) * 0.5)
            k = 2 if fold > .5 else 1 if fold > -.4 else 0
            if x < 14 or x > 50: k = max(0, k - (0 if x < 14 else 1))
            cv.set(x, y, COAT[k] if (y - 17) > 3 else COAT[min(3, k + 1)])
    for x in (14, 22, 30, 38, 46): cv.line(x, 26 + f, x + 3, 44 + f, COAT[0])
    # skinsuit torso tapering to a wisp, with the team panel and lycra-tight ribs
    torso = [(21, 17 + f), (43, 17 + f), (40, 34 + f), (36, 46 + f), (32, 54 + f), (28, 46 + f), (24, 34 + f)]
    tm = cv.mask(torso)
    for y in range(64):
        for x in range(64):
            if not tm[x, y]: continue
            k = 3 if x < 27 else 2 if x < 35 else 1
            if y > 44: k = max(0, k - 1)
            cv.set(x, y, SUIT[k])
    for i in range(4): cv.line(26 + i, 31 + f + i * 3, 38 - i, 31 + f + i * 3, SUIT[0])
    for i in range(4): cv.line(27 + i, 32 + f + i * 3, 37 - i, 32 + f + i * 3, SUIT[3])
    cv.poly([(22, 21 + f), (42, 19 + f), (41, 25 + f), (23, 28 + f)], PANEL, 1)
    cv.line(25, 23 + f, 39, 21 + f, PANEL[3]); cv.set(32, 23 + f, GOLD[3]); cv.set(33, 23 + f, GOLD[2])
    for y in range(46, 60):   # the spectral wisp below the waist
        w = max(0, 3 - (y - 46) // 4)
        for x in range(32 - w, 33 + w): cv.set(x + int(math.sin(y * .5 + fr) * 1.5), y + f, SUIT[1] if (x + y) % 2 else SUIT[2])
    # skull in an aero helmet with a long tail and a visor stripe
    cv.ell(32, 11 + f, 7.5, 7.5, BONE); cv.ell(32, 17 + f, 4.5, 2.5, BONE)
    for ex in (29, 35):
        cv.ell(ex, 12 + f, 2, 2, [C(0)] * 4, spec=False); cv.set(ex, 12 + f, hx('#7aff9a')); cv.set(ex - 1, 11 + f, hx('#e0ffe6'))
    cv.set(32, 15 + f, C(0)); cv.line(28, 18 + f, 36, 18 + f, C(0))
    for x in range(29, 36, 2): cv.set(x, 17 + f, BONE[3])
    helm = [(23, 9 + f), (27, 3 + f), (33, 1 + f), (42, 3 + f), (55, 8 + f), (58, 11 + f), (41, 10 + f)]
    cv.poly(helm, SUIT[1:5], 1)
    cv.line(24, 8 + f, 41, 9 + f, SUIT[0]); cv.line(28, 3 + f, 48, 6 + f, PANEL[2]); cv.line(30, 2 + f, 40, 3 + f, SUIT[4])
    for x in range(24, 41): cv.set(x, 9 + f, PANEL[1] if x % 2 else PANEL[2])   # visor
    orb = [RED[1], RED[2], RED[3], EYE_E]
    def hand(x, y): cv.ell(x, y, 2.2, 1.8, BONE); cv.set(x - 2, y + 2, BONE[1]); cv.set(x, y + 2, BONE[1]); cv.set(x + 2, y + 2, BONE[1])
    if atk:
        cv.rod(22, 20 + f, 10, 12 + f, SUIT, 3); cv.rod(42, 20 + f, 54, 12 + f, SUIT, 3)
        hand(10, 12 + f); hand(54, 12 + f)
        cv.ell(54, 7 + f, 5, 5, orb); cv.ell(10, 7 + f, 5, 5, orb)
        for a in range(0, 360, 40):
            for (ox, oy) in ((54, 7), (10, 7)): cv.set(ox + math.cos(math.radians(a + fr * 20)) * 8, oy + f + math.sin(math.radians(a + fr * 20)) * 8, EYE_E)
    else:
        cv.rod(22, 20 + f, 16, 32 + f, SUIT, 3); cv.rod(42, 20 + f, 48, 30 + f, SUIT, 3)
        hand(16, 33 + f); hand(49, 31 + f)
        cv.ell(50, 26 + f, 4, 4, orb); cv.set(48, 24 + f, hx('#ffffff'))
    return cv.done()

# ------------------------------------------------------------------ King Gel: a translucent jelly king with its swallowed loot showing through
from chars import GEL
from bosses import chainring
def king_gel(fr=0, atk=False):
    cv = Cv(64, 64); sq = fr % 2
    rx, ry = (28, 15) if atk else (24 + sq, 20 - sq)
    cy = round(61 - ry * .62)
    G = GEL
    for y in range(int(cy - ry - 1), 62):
        for x in range(int(32 - rx - 1), int(32 + rx + 2)):
            nx, ny = (x + .5 - 32) / rx, (y + .5 - cy) / ry
            if ny > 0: ny *= 1.6   # flatter base where it sags on the floor
            d = nx * nx + ny * ny
            if d > 1 or y > 61: continue
            rim = d > .78
            l = -.55 * nx - .6 * ny
            k = 1
            if rim: k = 2 if l > -.1 else 0            # bright rim on the lit side, deep edge on the dark side
            elif d < .35: k = 2 if l > .15 else 1      # glowing core
            if y >= 60: k = 0
            cv.set(x, y, G[k])
    # the things it swallowed, dimmed by the gel
    def dim(c): return G[0] if c != G[1] else c
    cv.line(19, cy + 4, 26, cy + 1, hx('#7aa060')); cv.set(19, cy + 5, hx('#7aa060')); cv.set(26, cy, hx('#7aa060'))   # a bone
    for (x, y) in ((41, cy + 3), (43, cy + 2), (42, cy + 5), (44, cy + 4)): cv.set(x, y, hx('#8aa040'))                     # a coin
    cv.poly([(33, cy + 3), (36, cy + 3), (36, cy + 8), (33, cy + 8)], [hx('#2a7a6a'), hx('#3a9a80'), hx('#5abaa0'), hx('#8adac0')], 1)   # a bidon
    # bubbles rising inside
    for i in range(4):
        ph = (fr * .5 + i * .27) % 1
        bx, by = 22 + i * 6, cy + ry * .6 - ph * ry * 1.1
        cv.set(bx, by, G[3]); cv.set(bx + 1, by + 1, G[2])
    # specular highlights
    for (x, y) in ((18, cy - ry * .55), (19, cy - ry * .6), (20, cy - ry * .62), (18, cy - ry * .45)): cv.set(x, y, G[4])
    cv.set(23, cy - ry * .78, G[3]); cv.set(24, cy - ry * .8, G[3])
    # face
    ey = cy - ry * .45
    for ex in (25, 39):
        if atk: cv.line(ex - 3, ey - 1, ex + 3, ey + 1 if ex < 32 else ey - 3, C(0), 2)
        cv.ell(ex, ey + 1, 3, 3 if not atk else 2, [C(0)] * 4, spec=False); cv.set(ex - 1, ey, C(11)); cv.set(ex + 1, ey + 2, G[3])
    if atk: cv.ell(32, ey + 9, 7, 4, [C(0), C(0), RED[1], RED[2]], spec=False)
    else:
        cv.line(29, ey + 7, 35, ey + 7, C(0)); cv.set(28, ey + 6, C(0)); cv.set(36, ey + 6, C(0))
    # drips at the base and a goo puddle
    for x in range(int(32 - rx - 2), int(32 + rx + 3)):   # a goo puddle where it sits
        if cv.get(x, 61)[3] == 0: cv.set(x, 61, G[1] if x % 5 else G[2])
    chainring(cv, 32 + (5 if atk else 0), cy - ry - 3 + (2 if atk else 0), 8)   # the crown: a big chainring
    return cv.done()

if __name__ == '__main__':
    from PIL import Image
    from chars import flash
    fns = [king_gel, king_of_mountains, headwind_wyrm, grim_sweeper, lycra_lich]
    o = Image.new('RGBA', (4 * 100 + 4, len(fns) * 100 + 4), C(3))
    for r, fn in enumerate(fns):
        for c, im in enumerate([fn(0), fn(1), fn(0, True), flash(fn(0))]): o.alpha_composite(im, (4 + c * 100, 4 + r * 100))
    o.resize((o.width * 3, o.height * 3), Image.NEAREST).save('/tmp/claude-0/shots/bosses2.png')
