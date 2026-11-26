import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit2 import *
from chars import GEL
from enemies3 import TROLL, wrench, COAT

def chainring(cv, cx, cy, r, ramp=GOLD, teeth=16, hole=.55):
    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r - 2), int(cx + r + 3)):
            d = math.hypot(x + .5 - cx, y + .5 - cy); a = math.atan2(y + .5 - cy, x + .5 - cx)
            tooth = (a * teeth / (2 * math.pi)) % 1 < .5
            if d <= r + (1.4 if tooth else 0) and d >= r * hole:
                l = -(x + .5 - cx) / r * .6 - (y + .5 - cy) / r * .7
                cv.set(x, y, ramp[3 if d > r - 1 and l > .35 else 2 if l > .1 else 1 if l > -.4 else 0])
    for k in range(5):   # spider arms
        a = k * 2 * math.pi / 5 - .3
        cv.line(cx + math.cos(a) * 2, cy + math.sin(a) * 2, cx + math.cos(a) * r * hole, cy + math.sin(a) * r * hole, ramp[1])
    cv.set(cx, cy, ramp[3])

# ------------------------------------------------------------------ King Gel (Slime Monarch)
def king_gel(fr=0, atk=False):
    cv = Cv(64, 64); sq = [0, 1][fr % 2]
    rx, ry = (27, 15) if atk else (23 + sq, 20 - sq)
    cy = 60 - ry
    cv.ell(32, cy, rx, ry, GEL[:4])
    for (x, y, r) in ((24, cy + 6, 3), (40, cy + 4, 2), (33, cy + 10, 2)):   # things it has swallowed: a bone, a cog, a bidon
        cv.ell(x, y, r, r * .8, [GEL[0], GEL[0], GEL[1], GEL[1]], spec=False)
    cv.line(21, cy + 8, 27, cy + 5, BONE[1]); cv.set(38, cy + 3, GOLD[1]); cv.set(41, cy + 5, GOLD[1])
    cv.set(19, cy - ry * .55, GEL[4]); cv.set(20, cy - ry * .55, GEL[4]); cv.set(19, cy - ry * .45, GEL[3])
    ey = cy - ry * .25
    for ex in (24, 37):
        cv.ell(ex, ey, 3, 2.6 if not atk else 1.6, [C(0)] * 4, spec=False); cv.set(ex - 1, ey - 1, C(11))
    if atk: cv.ell(32, ey + 7, 6, 3, [C(0), C(0), RED[1], RED[1]], spec=False)
    else: cv.line(29, ey + 6, 35, ey + 6, C(0))
    chainring(cv, 32 + (4 if atk else 0), cy - ry - 3 + (2 if atk else 0), 8)   # the crown: a big ring
    return cv.done()

# ------------------------------------------------------------------ The Boneshaker (Bone Lord)
def spoked_wheel(cv, cx, cy, r):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            d = math.hypot(x + .5 - cx, y + .5 - cy)
            if r - 2.2 <= d <= r: cv.set(x, y, WOOD[2] if x + y < cx + cy - r * .4 else WOOD[1] if x + y < cx + cy + r * .5 else WOOD[0])
            elif r - 3.2 <= d < r - 2.2: cv.set(x, y, STEEL[1])
    for k in range(12):
        a = k * math.pi / 6; cv.line(cx + math.cos(a) * 2, cy + math.sin(a) * 2, cx + math.cos(a) * (r - 3), cy + math.sin(a) * (r - 3), WOOD[1])
    cv.ell(cx, cy, 2.5, 2.5, STEEL)

def boneshaker(fr=0, atk=False):
    cv = Cv(64, 64); b = fr % 2
    for lx in (25, 35):                              # leg bones and greaves
        cv.rod(lx, 40, lx - (1 if lx < 30 else -1), 56, BONE, 3); cv.poly([(lx - 4, 55), (lx + 3, 55), (lx + 3, 59), (lx - 4, 59)], STEEL, 1)
    cv.ell(30, 40, 7, 3, BONE)                       # pelvis
    cv.rod(30, 24 + b, 30, 40, BONE, 3)              # spine
    for i in range(5):                               # ribs, curving
        y = 22 + b + i * 3; w = 9 - i
        cv.line(30 - w, y + 1, 30, y - 1, BONE[2 if i < 2 else 1]); cv.line(30, y - 1, 30 + w, y + 1, BONE[1])
    cv.poly([(19, 18 + b), (41, 18 + b), (44, 23 + b), (16, 23 + b)], STEEL, 1)   # pauldrons
    cv.ell(30, 11 + b, 7, 7, BONE)                   # skull
    cv.ell(30, 17 + b, 4.5, 2.5, BONE)
    for ex in (27, 33): cv.ell(ex, 11 + b, 2, 2, [C(0)] * 4, spec=False); cv.set(ex, 11 + b, C(21))
    cv.set(30, 14 + b, C(0)); cv.line(27, 18 + b, 33, 18 + b, C(0))
    for x in range(27, 34, 2): cv.set(x, 17 + b, BONE[3])
    cv.poly([(22, 6 + b), (38, 6 + b), (36, 2 + b), (24, 2 + b)], [C(4), C(6), C(9), C(10)], 1)   # an old leather riding cap
    cv.line(22, 6 + b, 40, 6 + b, C(5))
    if atk:   # hurls the great wheel: lifted high on the right
        cv.rod(37, 21 + b, 46, 10, BONE, 3); cv.rod(22, 21 + b, 14, 28, BONE, 3)
        spoked_wheel(cv, 48, 14, 13)
    else:
        cv.rod(22, 21 + b, 14, 31 + b, BONE, 3); cv.rod(38, 21 + b, 44, 32 + b, BONE, 3)
        spoked_wheel(cv, 48, 38 + b, 15)             # penny-farthing wheel as a tower shield
        cv.rod(13, 30 + b, 9, 50 + b, STEEL, 3); cv.ell(9, 52 + b, 3, 3, STEEL)   # a crank arm mace
    return cv.done()

# ------------------------------------------------------------------ The Gear Masher (Ogre Warchief)
OGRE = R('#3a2216', '#6a4028', '#9a6640', '#c89466')
def gear_masher(fr=0, atk=False):
    cv = Cv(64, 64); b = fr % 2
    for lx in (22, 36):
        cv.poly([(lx - 1, 44), (lx + 8, 44), (lx + 8, 57), (lx - 2, 57)], DARK, 2); cv.poly([(lx - 3, 56), (lx + 9, 56), (lx + 9, 60), (lx - 3, 60)], WOOD, 1)
    cv.ell(32, 35 + b, 19, 14, OGRE)
    cv.poly([(15, 38 + b), (49, 38 + b), (47, 47 + b), (17, 47 + b)], RED, 1)          # war kilt in team red
    cv.line(15, 38 + b, 49, 38 + b, GOLD[2]); cv.ell(32, 40 + b, 3, 2, GOLD)         # belt and buckle
    for k in range(-1, 2): cv.line(32 + k * 8, 24 + b, 30 + k * 9, 36 + b, OGRE[0])  # chest scars
    cv.ell(32, 18 + b, 9, 8, OGRE); cv.ell(32, 22 + b, 6, 3, OGRE)
    for ex in (28, 36): cv.set(ex, 17 + b, C(0)); cv.set(ex + 1, 17 + b, C(0)); cv.set(ex, 17 + b, C(21))
    cv.line(25, 14 + b, 30, 15 + b, OGRE[0]); cv.line(34, 15 + b, 39, 14 + b, OGRE[0])
    cv.line(27, 23 + b, 37, 23 + b, C(0)); cv.set(28, 22 + b, BONE[3]); cv.set(36, 22 + b, BONE[3])
    cv.poly([(23, 12 + b), (41, 12 + b), (39, 8 + b), (25, 8 + b)], STEEL, 1); cv.line(32, 4 + b, 32, 8 + b, RED[2], 2)   # helm with a red plume
    if atk:
        cv.rod(16, 30 + b, 14, 8, OGRE, 5); cv.rod(48, 30 + b, 30, 6, OGRE, 5)
        cv.rod(20, 7, 20, -4, WOOD, 3); chainring(cv, 14, 10, 10, STEEL, 20)
    else:
        cv.rod(14, 30 + b, 10, 44 + b, OGRE, 5); cv.rod(50, 30 + b, 52, 44 + b, OGRE, 5)
        cv.rod(52, 44 + b, 56, 22 + b, WOOD, 3); chainring(cv, 56, 16 + b, 10, STEEL, 20)
    return cv.done()

# ------------------------------------------------------------------ The Lycra Lich
SUIT = R('#0e3a44', '#16707a', '#2ab0b0', '#8ef0e0'); PANEL = R('#4a0e3a', '#8a1a6a', '#d0308e', '#ff8ac8')
def lycra_lich(fr=0, atk=False):
    cv = Cv(64, 64); f = [0, 2][fr % 2]
    spread = 10 if atk else 0
    cape = [(20, 18 + f), (44, 18 + f), (58 + spread // 2, 50 + f), (50, 46 + f), (44, 56 + f), (38, 50 + f), (32, 58 + f), (26, 50 + f), (20, 56 + f), (14, 46 + f), (6 - spread // 2, 50 + f)]
    cv.poly(cape, COAT, 1)                                                                   # tattered cape, flared like wings
    cv.poly([(20, 18 + f), (44, 18 + f), (38, 44 + f), (32, 52 + f), (26, 44 + f)], SUIT, 1)   # skinsuit: broad shoulders tapering away to nothing
    cv.poly([(22, 24 + f), (42, 20 + f), (41, 27 + f), (23, 31 + f)], PANEL, 1)              # team panel
    cv.line(32, 31 + f, 32, 46 + f, SUIT[0])
    for i in range(3): cv.line(26, 34 + f + i * 3, 38, 34 + f + i * 3, SUIT[2] if i == 0 else SUIT[0])   # ribs showing through the lycra
    cv.ell(32, 11 + f, 8, 8, BONE); cv.ell(32, 18 + f, 5, 2.5, BONE)
    for ex in (28, 36): cv.ell(ex, 12 + f, 2, 2, [C(0)] * 4, spec=False); cv.set(ex, 12 + f, hx('#7aff9a')); cv.set(ex - 1, 11 + f, hx('#c8ffd0'))
    cv.set(32, 15 + f, C(0)); cv.line(28, 19 + f, 36, 19 + f, C(0))
    for x in range(29, 36, 2): cv.set(x, 18 + f, BONE[3])
    cv.poly([(22, 9 + f), (32, 1 + f), (46, 4 + f), (56, 10 + f), (40, 9 + f)], SUIT, 2)         # aero teardrop helmet, tail streaming back
    cv.line(23, 9 + f, 42, 9 + f, SUIT[0]); cv.line(30, 4 + f, 46, 6 + f, PANEL[2])
    orb = [RED[1], RED[2], RED[3], EYE_E]
    if atk:
        cv.rod(22, 21 + f, 9, 12 + f, SUIT, 3); cv.rod(42, 21 + f, 55, 12 + f, SUIT, 3)
        cv.ell(55, 9 + f, 6, 6, orb); cv.ell(9, 9 + f, 6, 6, orb)
        for a in range(0, 360, 45):
            for (ox, oy) in ((55, 9), (9, 9)): cv.set(ox + math.cos(math.radians(a + fr * 20)) * 9, oy + f + math.sin(math.radians(a + fr * 20)) * 9, EYE_E)
    else:
        cv.rod(22, 21 + f, 15, 33 + f, SUIT, 3); cv.rod(42, 21 + f, 49, 31 + f, SUIT, 3)
        cv.ell(50, 31 + f, 4, 4, orb)
        for x in (13, 15, 17): cv.set(x, 35 + f, BONE[2])
    return cv.done()

# ------------------------------------------------------------------ King of the Mountains (Bone King)
ROCK = R('#2a2530', '#4a4252', '#6e6474', '#9a8f98'); SNOW = R('#8a9db0', '#c8d8e8', '#eef6ff', '#ffffff')
def king_of_mountains(fr=0, atk=False):
    cv = Cv(64, 64); b = fr % 2
    cv.poly([(32, 2 + b), (58, 60), (6, 60)], ROCK, 1)                                    # the mountain body
    cv.poly([(32, 2 + b), (42, 20 + b), (37, 16 + b), (33, 21 + b), (29, 16 + b), (25, 19 + b), (22, 22 + b)], SNOW, 2)   # snowcap
    for (x0, y0, x1, y1) in ((18, 46, 23, 52), (44, 42, 48, 50)): cv.line(x0, y0, x1, y1, ROCK[0])
    # carved face: heavy brow ledge, glowing eyes, a grim crevasse of a mouth
    cv.line(23, 25 + b, 30, 27 + b, ROCK[0], 2); cv.line(34, 27 + b, 41, 25 + b, ROCK[0], 2)
    for ex in (27, 37): cv.ell(ex, 29 + b, 2.2, 1.6, [C(0)] * 4, spec=False); cv.set(ex, 29 + b, GOLD[3]); cv.set(ex + 1, 29 + b, GOLD[2])
    cv.line(27, 35 + b, 37, 35 + b, ROCK[0]); cv.line(28, 36 + b, 36, 36 + b, C(0))
    # polka-dot cape draped from the shoulders, the King of the Mountains jersey as a royal mantle
    cape = [(10, 40 + b), (54, 40 + b), (60, 60), (4, 60)]
    m = cv.mask(cape)
    for y in range(64):
        for x in range(64):
            if not m[x, y]: continue
            u, v = (x + (y // 6) % 2 * 3) % 6, y % 6
            dot = u in (2, 3) and v in (2, 3)
            c = RED[2] if dot else (C(11) if x < 20 else C(10) if x < 44 else C(9))
            if dot and u == 3 and v == 3: c = RED[1]
            cv.set(x, y, c)
    cv.line(10, 40 + b, 54, 40 + b, GOLD[2]); cv.line(10, 41 + b, 54, 41 + b, GOLD[1])
    for x in range(14, 52, 8): cv.ell(x, 41 + b, 1.5, 1.5, GOLD)                           # a crown of gold studs on the collar
    if atk:   # boulder fists raised
        cv.rod(12, 42, 8, 20, ROCK, 5); cv.rod(52, 42, 56, 20, ROCK, 5); cv.ell(8, 15, 7, 6, ROCK); cv.ell(56, 15, 7, 6, ROCK)
    else:
        cv.ell(6, 50 + b, 6, 6, ROCK); cv.ell(58, 50 + b, 6, 6, ROCK)
    return cv.done()

# ------------------------------------------------------------------ The Headwind Wyrm (96 x 64)
WIND = R('#1e3048', '#36557a', '#6a93b8', '#c8e4ff'); BELLY = R('#5e5462', '#8f8489', '#cfc4b8', '#f1e8d6')
def headwind_wyrm(fr=0, atk=False):
    cv = Cv(96, 64); ph = fr * .6
    pts = [(14 + i * 9, 42 + 10 * math.sin(i * .9 + ph)) for i in range(8)]
    for i, (x, y) in enumerate(pts[:-1]):                                           # segments from the tail up
        r = 4 + i * .9
        cv.ell(x, y, r, r * .9, WIND); cv.line(x - r * .3, y - r * .9, x + r * .2, y - r * 1.2, WIND[3])   # dorsal fin
        cv.ell(x, y + r * .45, r * .7, r * .35, BELLY, spec=False)
    hx_, hy = pts[-1][0] + 6, pts[-1][1] - 12 - (4 if atk else 0)
    cv.ell(hx_, hy, 12, 9, WIND)                                                       # head
    cv.poly([(hx_ + 4, hy - 2), (hx_ + 20, hy + 1 - (4 if atk else 0)), (hx_ + 18, hy + 5), (hx_ + 4, hy + 5)], WIND, 1)   # snout
    if atk: cv.poly([(hx_ + 4, hy + 6), (hx_ + 18, hy + 10), (hx_ + 6, hy + 10)], WIND, 1); cv.line(hx_ + 6, hy + 6, hx_ + 17, hy + 8, RED[1])
    cv.ell(hx_ + 2, hy - 3, 2.2, 2, [C(0)] * 4, spec=False); cv.set(hx_ + 2, hy - 3, C(25))
    cv.line(hx_ - 6, hy - 6, hx_ - 14, hy - 14, WIND[2]); cv.line(hx_ - 2, hy - 8, hx_ - 6, hy - 17, WIND[2])   # swept-back horns
    for k, (wy, wl) in enumerate(((10, 22), (18, 16), (54, 18))):                       # gust streaks
        off = int((fr * 5 + k * 7) % 12)
        for x in range(4 + off, 4 + off + wl, 2): cv.set(x, wy, WIND[3] if x % 4 else WIND[2])
    if atk:
        for r in (6, 9, 12):
            for a in range(-40, 41, 10): cv.set(hx_ + 20 + math.cos(math.radians(a)) * r, hy + 4 + math.sin(math.radians(a)) * r, WIND[3])
    return cv.done()

# ------------------------------------------------------------------ The Grim Sweeper (64 x 96): final boss
ROBE = R('#08070c', '#15121c', '#2b2535', '#4b4252')
def grim_sweeper(fr=0, atk=False):
    cv = Cv(64, 96); b = fr % 2
    cv.poly([(32, 14 + b), (48, 30 + b), (54, 90), (10, 90), (16, 30 + b)], ROBE, 1)
    for x in range(10, 55, 6): cv.line(x, 88, x + 3, 93, ROBE[1])                    # ragged hem
    cv.ell(32, 20 + b, 11, 11, ROBE)                                               # hood
    cv.ell(33, 23 + b, 7, 8, [C(0)] * 4, spec=False)
    cv.ell(33, 24 + b, 5, 5.5, BONE)
    for ex in (31, 36): cv.set(ex, 23 + b, C(0)); cv.set(ex, 24 + b, C(21))
    cv.line(31, 28 + b, 35, 28 + b, C(0))
    cv.poly([(22, 36 + b), (42, 36 + b), (41, 40 + b), (23, 40 + b)], [C(20), C(21), C(24), C(25)], 1)   # a broom-wagon sash, red with gold
    bx0, by0, bx1, by1 = (12, 30, 54, 6) if atk else (50, 30 + b, 14, 84)
    cv.rod(bx0, by0, bx1, by1, WOOD, 3)                                                # the broom handle
    L = math.hypot(bx1 - bx0, by1 - by0); ux, uy = (bx1 - bx0) / L, (by1 - by0) / L; px_, py_ = -uy, ux
    ex, ey = (bx1, by1) if not atk else (bx0, by0)
    sgn = 1 if not atk else -1
    bristle = [(ex - px_ * 4, ey - py_ * 4), (ex + px_ * 4, ey + py_ * 4), (ex + px_ * 9 + ux * 12 * sgn, ey + py_ * 9 + uy * 12 * sgn), (ex - px_ * 9 + ux * 12 * sgn, ey - py_ * 9 + uy * 12 * sgn)]
    cv.poly(bristle, [C(22), C(23), C(24), C(25)], 1)
    m = cv.mask(bristle)
    for y in range(96):
        for x in range(64):
            if m[x, y] and (x * 2 + y) % 4 == 0: cv.set(x, y, C(22))
    cv.line(ex - px_ * 5, ey - py_ * 5, ex + px_ * 5, ey + py_ * 5, RED[1], 2)         # binding
    for (hx0, hy0) in ((bx0, by0), (bx0 + (bx1 - bx0) * .35, by0 + (by1 - by0) * .35)): cv.ell(hx0, hy0, 2.5, 2.5, BONE)
    return cv.done()

BOSSES = [('King Gel', king_gel), ('The Boneshaker', boneshaker), ('The Gear Masher', gear_masher), ('The Lycra Lich', lycra_lich),
          ('King of the Mountains', king_of_mountains), ('The Headwind Wyrm', headwind_wyrm), ('The Grim Sweeper', grim_sweeper)]
if __name__ == '__main__':
    from PIL import Image
    o = Image.new('RGBA', (4 * 100 + 4, 7 * 100 + 4), C(3))
    for r, (n, fn) in enumerate(BOSSES):
        for c, im in enumerate([fn(0), fn(1), fn(0, True), flash(fn(0))]): o.alpha_composite(im, (4 + c * 100, 4 + r * 100))
    o.resize((o.width * 2, o.height * 2), Image.NEAREST).save('/tmp/claude-0/px/r20/bosses.png')
