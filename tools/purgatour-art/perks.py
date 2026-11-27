"""Perks (post-boss picks): relic icons, the hero's race kits (jersey perks) and kit overlays, and the Domestique drone.

Hand-authored in the master palette with the character conventions (light from the top left, full dark outline):
- relic(kind, fr)       24 x 24 icon, 4 frames (bob + a glint that walks across it); cards, plinths and the HUD use it.
- kit(img, kind, bob)   repaints a finished hero frame in a race kit: the team-blue jersey and cap plus the stance cloth
                        (tabard, hood and cape, scarf, robe) take the kit's ramp; polka dots and rainbow bands are patterns.
- overlay(kind, f, fr)  accessory frames aligned to the 32 x 32 hero frame: ('under', 'over') pairs, so a rotor slung on the
                        back can sit behind the body when the hero faces the camera.
- drone(fr)             the Domestique: a bidon with rotor wings that follows the hero and shoots.
"""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image
from kit2 import Cv, R, STEEL, GOLD, RED, DARK, WOOD
from chars import outline, hx, KEY, OUT
from pal import C
import gear as GR

PERKS = ['aero', 'lube', 'discs', 'sealant', 'musette', 'tailwind', 'headlamp', 'domestique', 'polka', 'green', 'yellow', 'rainbow']
KITS = ['green', 'polka', 'yellow', 'rainbow']

# ------------------------------------------------------------------ race kits
KIT_RAMP = {
    'yellow': R('#7a5a0c', '#c89a14', '#f4d22c', '#fff39a'),
    'green': R('#16461f', '#23753a', '#3dae4e', '#9ae68a'),
    'polka': [C(8), C(9), C(10), C(11)],
    'rainbow': [C(8), C(9), C(10), C(11)],
}
DOT = [C(19), C(20), C(21)]
# the five world-champion bands, top to bottom: blue, red, black, yellow, green
BANDS = [hx('#2f6ad8'), hx('#d0303a'), hx('#1a1620'), hx('#f4d22c'), hx('#2f9a44')]
# cloth colours a kit repaints, with their step on a 4-step ramp (0 dark .. 3 light); -1 = one step below dark
def _lv():
    G = GR.G; m = {}
    for k, v in (('q', 0), ('j', 1), ('J', 2), ('c', 1), ('C', 2), ('D', 0), ('L', 3)): m[KEY[k][:3]] = v   # team blue jersey and cap
    for k, v in (('u', 0), ('t', 1), ('T', 2)): m[G[k][:3]] = v                                          # Vanguard tabard (and the jersey's red band)
    for k, v in (('O', -1), ('o', 0), ('f', 1), ('F', 2)): m[G[k][:3]] = v                              # Ranger hood and cape
    for k, v in (('I', -1), ('i', 0), ('p', 1), ('P', 2)): m[G[k][:3]] = v                              # Arcanist hood and robe
    for k, v in (('3', 1), ('2', 2), ('1', 3)): m[G[k][:3]] = v                                          # Skirmisher scarf
    return m
CLOTH = _lv()

def _dim(c, k=.62): return (int(c[0] * k), int(c[1] * k), int(c[2] * k), 255)

def kit(img, kind, bob=0):
    """Repaint a hero frame in a race kit. bob = 1 on the raised walk frames (patterns follow the body)."""
    im = img.copy(); px = im.load(); ramp = KIT_RAMP[kind]
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if not p[3]: continue
            lv = CLOTH.get(p[:3])
            if lv is None: continue
            c = _dim(ramp[0]) if lv < 0 else ramp[lv]
            yy = y + bob   # body-relative row
            if kind == 'polka' and lv >= 1 and yy >= 14 and (x + 2 * ((yy - 14) // 3 % 2)) % 4 == 1 and (yy - 14) % 3 == 1:
                c = DOT[min(2, lv)]
            if kind == 'polka' and lv >= 0 and yy < 12 and (x + yy) % 4 == 0 and yy % 2 == 0:
                c = DOT[1]
            if kind == 'rainbow' and 17 <= yy <= 21:
                c = BANDS[yy - 17] if lv >= 1 else _dim(BANDS[yy - 17], .7)
            px[x, y] = c
    return im

# ------------------------------------------------------------------ kit overlays, aligned to the hero frame
# stamps in the hero's head/body box; keys below. Drawn then outlined so they read against the body.
OK = {'w': C(11), 'W': C(10), 'v': C(9), 'n': C(7), 'm': C(5), 'k': C(2), 'e': C(0),
      'g': C(22), 'G': C(23), 'Y': C(24), 'y': C(25), 'b': hx('#1e3048'), 'B': hx('#36557a'), 'u': hx('#6a93b8'), 'U': hx('#cfe8ff'),
      'r': C(20), 'R': C(21), 'L': hx('#fff4c0'), 'l': hx('#ffd45a'), 'c': C(9), 'a': C(14), 'A': C(16), 'x': C(13), 's': C(10), 'S': C(11)}
OV = {
    # aero helmet: a long teardrop shell over the cap with a smoked visor
    'aero': {
        'd': ('over', (8, 2), ["....nvwwwvn.....", "...nvwwWWwvn....", "..nvwWWWWWWvn...", "..mnvvvvvvvvm...", "..bBBuUUBBBBb...", "..kbbbbbbbbbk..."]),
        'r': ('over', (4, 2), [".......nvwwwvn...", "....nnvwwWWWwvn..", ".mnnvvwWWWWWWWvn.", "mmnnvvvvvvvvvvvm.", "......kbbBuUUb...", ".......kbbbbb...."]),
        'u': ('over', (8, 2), ["....nvwwwvn.....", "...nvwwWWwvn....", "..nvwWWWWWWvn...", "..mnvvwWWvvvm...", "...mnnvvvvnm....", ".....mnnnnm.....", "......mnnm......", ".......mm......."]),
    },
    # helmet lamp: gold-rimmed lamp on the brow; battery pack with a red tell-tale on the back
    'headlamp': {
        'd': ('over', (12, 4), ["kGYYGk..", "GlLLlG..", "gYllYg..", ".kggk..."]),
        'r': ('over', (17, 4), ["kGYG", "GLLl", "gYlY", ".kg."]),
        'u': ('over', (14, 5), ["kmmk", "kmRk"]),
    },
    # musette: a cotton feed bag on a strap across the body
    'musette': {
        'd': ('over', (10, 16), ["a.........", ".a........", "..a.......", "...a......", "....a.....", ".....aSSSs", ".....SSSSs", ".....RRRRr", ".....SSSSs", ".....sssss"]),
        'r': ('under', (8, 17), ["...a", "..a.", "SSs.", "SSs.", "RRr.", "SSs.", "sss."]),
        'u': ('over', (8, 16), [".........a", "........a.", ".......a..", "......a...", ".....a....", "SSSsa.....", "SSSs......", "RRRr......", "SSSs......", "ssss......"]),
    },
    # Disc Brakes: a steel rotor slung on the back; seen behind the shoulders from the front
    'discs': {
        'd': ('under', (9, 13), ["...nvvvvn...", ".nvwnnnnwvn.", "nvn......nvn", "vn........nv", "n..........n"]),
        'r': ('under', (6, 15), [".nvvn.", "nvgGvn", "vgkkGv", "vGkkgn", "nvggvm", ".nmmm."]),
        'u': ('over', (10, 14), ["...nvvvvn...", ".nvwvnnvwvn.", "nvwkvggvkwvn", "vwvgGkkGgvvm", "vvkGkeekGkvm", "nvvgGkkGgvmm", "nvkvggggvkmm", ".nvvvkkvvmm.", "...nmmmmm..."]),
    },
}

def _stamp(cv_im, rows, at):
    px = cv_im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in '. ': continue
            X, Y = at[0] + x, at[1] + y
            if 0 <= X < cv_im.width and 0 <= Y < cv_im.height: px[X, Y] = OK[ch]

def overlay(kind, f, fr=0):
    """(under, over) 32 x 32 images for an accessory perk on facing f ('d', 'r', 'u') and walk frame fr."""
    bob = 1 if fr in (1, 3) else 0
    under = Image.new('RGBA', (32, 32)); over = Image.new('RGBA', (32, 32))
    layer, (x, y), rows = OV[kind][f]
    tgt = under if layer == 'under' else over
    _stamp(tgt, rows, (x + (1 if f == 'r' else 0), y - bob))
    return outline(under), outline(over)

# ------------------------------------------------------------------ the Domestique: a bidon with rotor wings
def drone(fr=0):
    cv = Cv(16, 16); bob = [0, -1, 0, 1][fr % 4]
    blue = R('#1b2f63', '#2a55a8', '#4c8ae0', '#a6d0ff')
    cv.poly([(5, 5 + bob), (10, 5 + bob), (11, 13 + bob), (4, 13 + bob)], blue, 1)          # bottle
    cv.line(5, 9 + bob, 10, 9 + bob, C(11)); cv.line(5, 10 + bob, 10, 10 + bob, C(21))      # label band
    cv.line(6, 4 + bob, 9, 4 + bob, C(9)); cv.set(7, 3 + bob, C(11)); cv.set(8, 3 + bob, C(10))   # cap and nozzle
    cv.set(6, 7 + bob, C(0)); cv.set(9, 7 + bob, C(0)); cv.set(6, 6 + bob, C(11))           # eyes
    span = [5, 3, 1, 3][fr % 4]                                                             # rotor blades blur
    cv.line(7 - span - 1, 2 + bob, 7, 2 + bob, C(10)); cv.line(8, 2 + bob, 8 + span + 1, 2 + bob, C(8))
    for wx, d in ((3, -1), (12, 1)):                                                        # little wings
        cv.line(wx, 7 + bob, wx + d * 2, 6 + bob - (fr % 2), C(10))
    return cv.done()

# ------------------------------------------------------------------ relic icons (24 x 24)
def jersey_icon(kind):
    cv = Cv(24, 24); ramp = KIT_RAMP[kind]
    pts = [(8, 3), (10, 5), (14, 5), (16, 3), (21, 6), (23, 11), (19, 13), (18, 11), (18, 21), (6, 21), (6, 11), (5, 13), (1, 11), (3, 6)]
    cv.poly(pts, ramp, 1)
    px = cv.px
    for y in range(24):
        for x in range(24):
            if not px[x, y][3]: continue
            if kind == 'polka' and (x + 2 * (y // 3 % 2)) % 4 == 1 and y % 3 == 1 and 4 < y < 21: px[x, y] = DOT[2 if x < 12 else 1]
            if kind == 'rainbow' and 9 <= y <= 13: px[x, y] = BANDS[y - 9]
    cv.line(10, 5, 12, 7, ramp[0]); cv.line(14, 5, 12, 7, ramp[0])                             # collar
    cv.line(12, 7, 12, 20, ramp[0] if kind != 'polka' else C(8))                               # zip
    cv.set(12, 8, C(11))
    for x in range(7, 18): cv.set(x, 20, _dim(ramp[1]))                                       # hem
    return cv

def relic_base(kind):
    """the icon at rest (frame 0 of 4); returns a Cv"""
    if kind in KITS: return jersey_icon(kind)
    cv = Cv(24, 24)
    if kind == 'aero':
        shell = [C(8), C(9), C(10), C(11)]
        cv.poly([(2, 15), (6, 9), (12, 6), (18, 7), (22, 11), (22, 16), (14, 17), (6, 17)], shell, 2)
        cv.poly([(16, 12), (22, 12), (22, 16), (15, 16)], R('#121a2a', '#1e3048', '#36557a', '#6a93b8'), 1)   # visor
        cv.line(17, 13, 19, 13, hx('#cfe8ff'))
        cv.line(4, 13, 14, 9, C(21)); cv.line(5, 14, 15, 10, C(20))                              # race stripe
        for vx in (9, 12): cv.set(vx, 8 if vx == 12 else 9, C(5))                               # vents
    elif kind == 'lube':
        tin = R('#7a4a12', '#c07a1c', '#f0b030', '#ffe08a')
        cv.poly([(5, 10), (15, 10), (15, 21), (5, 21)], STEEL, 1)                                 # oil can body
        cv.line(6, 14, 14, 14, C(21)); cv.line(6, 15, 14, 15, C(20))
        cv.poly([(7, 7), (13, 7), (15, 10), (5, 10)], STEEL, 2)
        cv.rod(14, 11, 21, 5, STEEL, 2)                                                           # spout
        cv.ell(21, 9, 1.4, 2, tin); cv.ell(21, 14, 1.2, 1.6, tin)                                # drips of gold
        cv.set(21, 8, C(25))
    elif kind == 'discs':
        for y in range(24):
            for x in range(24):
                d = math.hypot(x + .5 - 12, y + .5 - 12)
                if d <= 10.5 and d >= 3:
                    l = -(x - 12) * .06 - (y - 12) * .07
                    c = STEEL[3 if l > .35 else 2 if l > .05 else 1 if l > -.4 else 0]
                    a = math.atan2(y + .5 - 12, x + .5 - 12)
                    if 6 < d < 9.5 and (round(a * 12 / (2 * math.pi)) % 2 == 0) and abs(d - 7.8) < 1: c = C(1)   # drilled holes
                    cv.set(x, y, c)
        for k in range(5):
            a = k * 2 * math.pi / 5 - .4
            cv.line(12 + math.cos(a) * 2, 12 + math.sin(a) * 2, 12 + math.cos(a) * 4.5, 12 + math.sin(a) * 4.5, GOLD[1])
        cv.ell(12, 12, 2.2, 2.2, GOLD)
    elif kind == 'sealant':
        tyre = [C(1), C(2), C(4), C(6)]; goo = R('#1e5a2e', '#3aa04a', '#7ee07a', '#e6ffd8')
        for y in range(24):
            for x in range(24):
                d = math.hypot(x + .5 - 12, y + .5 - 12)
                if 7 <= d <= 11: cv.set(x, y, tyre[3 if d > 10.4 and x + y < 22 else 2 if x + y < 20 else 1])
                if (round(d) == 9) and (x * 3 + y) % 5 == 0: cv.set(x, y, tyre[0])   # tread
        cv.ell(12, 12, 5, 5, goo)                                                               # sealant bubble filling the hole
        cv.set(10, 9, goo[3]); cv.set(11, 9, goo[3])
        cv.ell(17, 18, 2, 2, goo)
    elif kind == 'musette':
        cot = [C(8), C(9), C(10), C(11)]
        cv.line(4, 2, 12, 9, C(14)); cv.line(20, 2, 12, 9, C(16))                                 # strap
        cv.poly([(4, 9), (20, 9), (21, 21), (3, 21)], cot, 2)
        cv.line(4, 13, 20, 13, C(21)); cv.line(4, 14, 20, 14, C(20)); cv.line(4, 16, 20, 16, C(28))
        cv.poly([(9, 7), (15, 7), (14, 11), (10, 11)], R('#46281a', '#683c24', '#8c5530', '#b07340'), 1)   # a rice cake peeking out
        cv.set(11, 8, C(11)); cv.set(13, 8, C(11))
    elif kind == 'tailwind':
        wind = R('#36557a', '#6a93b8', '#a6d0ff', '#e8f6ff')
        for k, (y, x0, x1) in enumerate(((6, 2, 18), (12, 4, 21), (18, 1, 15))):
            cv.line(x0, y, x1, y, wind[1 + (k % 2)])
            cv.line(x0 + 2, y - 1, x1 - 3, y - 1, wind[3] if k == 1 else wind[2])
            cx = x1 + 1; cv.set(cx, y - 1, wind[2]); cv.set(cx + 1, y - 2, wind[2]); cv.set(cx, y - 3, wind[1])   # curl
        leaf = R('#2e4a26', '#5e8a3a', '#8ab858', '#c8e890')
        cv.poly([(17, 17), (21, 14), (23, 17), (19, 20)], leaf, 1); cv.line(17, 18, 22, 15, leaf[0])
    elif kind == 'headlamp':
        cv.poly([(3, 12), (12, 7), (22, 2), (22, 22), (12, 17)], R('#3a2a10', '#6a4a14', '#8a6a20', '#b08a30'), 1)   # beam
        px = cv.px
        for y in range(24):
            for x in range(24):
                if px[x, y][3]: cv.set(x, y, (255, 240, 170, 255) if abs(y - 12) < (x - 3) * .18 else (240, 200, 90, 255) if abs(y - 12) < (x - 3) * .35 else (170, 120, 40, 255))
        cv.poly([(1, 8), (9, 8), (9, 16), (1, 16)], [C(1), C(3), C(5), C(7)], 1)                 # lamp housing
        cv.ell(8, 12, 2.4, 4, GOLD); cv.ell(8, 12, 1.4, 2.6, [hx('#fff4c0')] * 4, spec=False)
        cv.line(0, 10, 0, 14, C(13))
    elif kind == 'domestique':
        d = drone(0); cv.im.alpha_composite(d.resize((32, 32), Image.NEAREST).crop((4, 2, 28, 26))); cv.px = cv.im.load()
        return cv
    return cv

def relic(kind, fr=0):
    """24 x 24 relic icon, frame 0..3: a glint walks across it and it bobs a pixel."""
    cv = relic_base(kind); im = cv.done() if kind != 'domestique' else cv.im
    px = im.load(); g = [4, 10, 16, 22][fr % 4]
    for y in range(24):
        for x in range(24):
            p = px[x, y]
            if p[3] and p[:3] != OUT[:3] and abs((x + y) - g * 2 + 8) <= 0:   # a one-pixel diagonal glint
                px[x, y] = (min(255, p[0] + 70), min(255, p[1] + 70), min(255, p[2] + 70), 255)
    out = Image.new('RGBA', (24, 26)); out.alpha_composite(im, (0, 1 + [0, -1, -1, 0][fr % 4]))
    return out

if __name__ == '__main__':
    import chars as CH
    od = '/tmp/claude-0/px/perks'; os.makedirs(od, exist_ok=True)
    S = 28; o = Image.new('RGBA', (len(PERKS) * S + 4, 4 * S + 4), C(3))
    for i, k in enumerate(PERKS):
        for fr in range(4): o.alpha_composite(relic(k, fr), (4 + i * S, 4 + fr * S))
    o.resize((o.width * 4, o.height * 4), Image.NEAREST).save(od + '/relics.png')
    rows = []
    for name, g in GR.STANCES.items():
        g = dict(g); g.pop('wpn', None)
        row = []
        for kk in [None] + KITS:
            for f in 'dru':
                im = GR.hero_geared(f, 0, **g)
                row.append(kit(im, kk) if kk else im)
        rows.append(row)
    o = Image.new('RGBA', (15 * 34 + 2, len(rows) * 34 + 2), C(3))
    for r, row in enumerate(rows):
        for c, im in enumerate(row): o.alpha_composite(im, (2 + c * 34, 2 + r * 34))
    o.resize((o.width * 4, o.height * 4), Image.NEAREST).save(od + '/kits.png')
    o = Image.new('RGBA', (4 * 3 * 34 + 2, 2 * 34 + 2), C(3))
    for i, k in enumerate(OV):
        for j, f in enumerate('dru'):
            for r, st in enumerate(({}, dict(stance='vanguard', helm=True, armour='plate', boots='greaves', buckler=True))):
                base = GR.hero_geared(f, 0, **st); u, v = overlay(k, f, 0)
                im = Image.new('RGBA', (32, 32)); im.alpha_composite(u); im.alpha_composite(base); im.alpha_composite(v)
                o.alpha_composite(im, (2 + (i * 3 + j) * 34, 2 + r * 34))
    o.resize((o.width * 4, o.height * 4), Image.NEAREST).save(od + '/overlays.png')
    o = Image.new('RGBA', (4 * 18 + 2, 20), C(3))
    for fr in range(4): o.alpha_composite(drone(fr), (2 + fr * 18, 2))
    o.resize((o.width * 6, o.height * 6), Image.NEAREST).save(od + '/drone.png')
