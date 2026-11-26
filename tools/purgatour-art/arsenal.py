"""Held weapons, projectiles and hit effects for all 10 weapon styles, per element. Master palette + element ramps."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pal import *

# element ramps: dark, mid, bright, core (core is shared warm white for most)
ELEM = {
    'normal': ['#4b4252', '#8f8489', '#cfc4b8', '#f1e8d6'],
    'arcane': ['#4a1f7a', '#8a3ee0', '#c77dff', '#f0dcff'],
    'fire':   ['#7a2408', '#d24a16', '#ff8a2a', '#ffe08a'],
    'frost':  ['#163e5c', '#2a8cc0', '#7fe7ff', '#e6fcff'],
    'venom':  ['#1c5218', '#3a9c2c', '#7dff5a', '#e2ffcc'],
    'storm':  ['#5e4e0c', '#c0a41c', '#fff36a', '#fffbe2'],
}
ELIGHT = {'normal': (210, 205, 200, .45), 'arcane': (190, 120, 255, 1), 'fire': (255, 140, 50, 1.1), 'frost': (120, 220, 255, .95), 'venom': (125, 255, 90, .85), 'storm': (255, 240, 110, 1.1)}
def ecol(e, i):
    h = ELEM[e][i]; return tuple(int(h[k:k + 2], 16) for k in (1, 3, 5)) + (255,)

def draw(rows, key, e, size=None):
    """ASCII -> image. key maps to palette index (int) or element slot 'e0'..'e3'."""
    h = len(rows); w = max(len(r) for r in rows)
    im = Image.new('RGBA', size or (w, h)); px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in '. ': continue
            v = key[ch]
            px[x, y] = ecol(e, int(v[1])) if isinstance(v, str) else C(v)
    return im

K = {'w': 13, 'W': 15, 'L': 17, 'k': 4, 's': 6, 'S': 8, 'H': 10, 'h': 11, 'g': 22, 'G': 24, 'Y': 25, 'r': 19, 'R': 21, 'x': 9, 'b': 14, 'B': 16,
     'a': 'e0', 'c': 'e1', 'd': 'e2', 'e': 'e3'}

# ------------------------------------------------------------------ held weapons (point right; grip = where the hand closes)
WEAPONS = {
 'bolt': dict(name='Wand', grip=(4, 3), rows=[
    '.............ccd..',
    '............cdeed.',
    '..........gGcdeedc',
    'BLLLLLLLLLgGgcdddc',
    'bbBBBBBBBBggg.ccc.',
    '.bbbbbbbbbb.......']),
 'pellet': dict(name='Scattergun', grip=(3, 4), rows=[
    '................HHh.',
    '....gGSSSSSSSSSHSSHh',
    'BLLLgGHHHHHHHHHHSkkS',
    'BBBBgYdcSSSSSSSSSkkS',
    'bBBBggcasssssssssSSs',
    '.bBBB...........sss.',
    '..bBB...............',
    '...bb...............']),
 'arrow': dict(name='Crossbow', grip=(4, 4), rows=[
    '...........LB.........',
    '............LB........',
    '.............BB.......',
    '....gG.......xBB......',
    'BLLLgGLLLLLLLxLLSSSHcd',
    'bBBBggBBBBBBBxBBsssScc',
    '..bb.........xBB......',
    '..bb.........BB.......',
    '...b........LB........',
    '...........LB.........']),
 'flame': dict(name='Blaster', grip=(3, 4), rows=[
    '.......kssssk.......',
    '......sSHHHSSs......',
    'BLLg..saccccasSSSSHh',
    'BBBgG.sacdddcasHHHSk',
    'bBBgg.saccccasSSSSk.',
    '.bBB...sSSSSs....kk.',
    '..bB....ssss........',
    '..bb................']),
 'spark': dict(name='Boltcaster', grip=(3, 3), rows=[
    '..........g.g.g.g...d.',
    '.........GYGYGYGYG..ed',
    'BLLLgGSSSgcgcgcgcgSSHe',
    'bBBBgggsssgggggggggsSd',
    '.bBB...............ss.',
    '..bb..................']),
 'orb': dict(name='Orb', grip=(5, 9), rows=[
    '...accca...',
    '..acdddca..',
    '.acdeeddca.',
    '.cdeedddcc.',
    '.cddddddcc.',
    '.acdddccca.',
    '..accccca..',
    '...gGGYg...',
    '....gGg....',
    '....LB.....',
    '....BB.....',
    '....bb.....']),
 'star': dict(name='Shuriken', grip=(3, 6), rows=[
    '......h......',
    '......Hs.....',
    '.....HSs.....',
    '.....HSs.....',
    '....HSSSs....',
    '..hHSSdSSss..',
    'hHHSSd.dSSsss',
    '..sSSSdSSss..',
    '....sSSSs....',
    '.....sSs.....',
    '.....sSs.....',
    '......ss.....',
    '......s......']),
 'knife': dict(name='Dagger', grip=(2, 2), rows=[
    '...g...........',
    'rRRgHHHHHHHHHh.',
    'rrrcSSSSSSSSSHh',
    'rrrgsssssssss..',
    '...g...........']),
 'axe': dict(name='Axe', grip=(5, 12), rows=[
    '..............H..........',
    '.............HSH.........',
    '............HSSsB........',
    '...........HSSkkH........',
    '............HSkSSHHH.dh..',
    '...........LgHSSSSSSHdH..',
    '..........LBB.HSSSSSdH...',
    '.........LBB...HSSSSdH...',
    '........LBB....HSSSdHH...',
    '.......LBB.....HSddHH....',
    '......LBB.....dddHHH.....',
    '.....RBB......hHH........',
    '....Rrr..................',
    '...Rrr...................',
    '...gr....................',
    ]),
 'spear': dict(name='Spear', grip=(6, 2), rows=[
    '.................RR.....H..',
    'BLLLLLLLLLLLLLLLLgRgGHHHSHh',
    'bBBBBBBBBBBBBBBBBgrgGSSSsSc',
    '.................rr.....s..']),
}

# ------------------------------------------------------------------ projectiles (point right). each returns a list of frames
def proj(style, e):
    F = []
    if style == 'bolt':      # a bright dart with a short comet tail
        for f in range(2):
            F.append(draw(['....cdd.', '..ccdeed', 'acdeeeed', '..ccdeed', '....cdd.'] if f == 0 else
                          ['.....cd.', '.accddee', 'cddeeeed', '.accddee', '.....cd.'], K, e))
    elif style == 'pellet':
        for f in range(2):
            F.append(draw(['.cd.', 'cdee', 'cdee', '.cd.'] if f == 0 else ['.dd.', 'deed', 'ceed', '.cc.'], K, e))
    elif style == 'arrow':
        F.append(draw(['x.............', 'xx.......ccd..', 'BLLLLLLLLSSHde', 'xx.......ccd..', 'x.............'], {**K, 'x': 'e1'}, e))
    elif style == 'flame':   # spray puffs: big bright -> small dark (frames by age)
        for rows in (['.dee.', 'deeed', 'deeed', '.ddd.'], ['.cdd.', 'cddec', 'cdddc', '.ccc.'], ['..c..', '.ccc.', 'acca.', '.a.a.'], ['.....', '..a..', '.a.a.', '.....']):
            F.append(draw(rows, K, e))
    elif style == 'spark':   # a tiny head; the arc itself is drawn live
        F.append(draw(['.d.', 'dee', '.d.'], K, e))
    elif style == 'orb':
        for f in range(4):
            im = Image.new('RGBA', (11, 11)); px = im.load()
            for y in range(11):
                for x in range(11):
                    d = math.hypot(x - 5, y - 5)
                    if d > 5.2: continue
                    a = (math.atan2(y - 5, x - 5) + f * math.pi / 2) % (2 * math.pi)
                    swirl = (a + d * .9) % (math.pi / 1.5) < .5
                    i = 0 if d > 4.4 else 1 if d > 3.3 else 2
                    if swirl and d > 1.6: i = min(3, i + 1)
                    if d < 1.8: i = 3
                    px[x, y] = ecol(e, i)
            F.append(im)
    elif style in ('star', 'knife', 'axe', 'spear'):
        h0 = draw(WEAPONS[style]['rows'], K, e)
        if style == 'star': F = [h0, h0.transpose(Image.ROTATE_90)]
        elif style == 'axe': F = [h0, h0.transpose(Image.ROTATE_270), h0.transpose(Image.ROTATE_180), h0.transpose(Image.ROTATE_90)]
        else: F = [h0]
    if style in ('arrow', 'star', 'knife', 'axe', 'spear'): F = [selout(pad(f)) for f in F]
    return F

PLIGHT = dict(bolt=60, pellet=26, arrow=22, flame=40, spark=70, orb=74, star=24, knife=18, axe=24, spear=26)

# ------------------------------------------------------------------ effects
def fx_muzzle(e):
    return [draw(r, K, e) for r in (
        ['...d...', '...e...', '..dee..', 'deeeeed', '..dee..', '...e...', '...d...'],
        ['.d...d.', '..d.d..', '...e...', '.deeed.', '...e...', '..d.d..', '.d...d.'],
        ['.......', '.c...c.', '...d...', '..ddd..', '...d...', '.c...c.', '.......'])]

def fx_hit(e):
    out = []
    for f in range(4):
        im = Image.new('RGBA', (13, 13)); px = im.load(); r = [1.5, 3, 4.5, 5.8][f]
        for y in range(13):
            for x in range(13):
                d = math.hypot(x - 6, y - 6)
                if f == 0 and d <= r: px[x, y] = ecol(e, 3 if d < 1 else 2)
                elif f > 0 and abs(d - r) < .7:
                    if f == 3 and (x + y) % 2: continue
                    px[x, y] = ecol(e, 3 - f if f < 3 else 1)
        for a in range(0, 360, 90 if f < 2 else 45):   # spark spokes
            k = [2, 4, 5, 6][f]; x = round(6 + math.cos(math.radians(a + 22 * f)) * k); y = round(6 + math.sin(math.radians(a + 22 * f)) * k)
            if 0 <= x < 13 and 0 <= y < 13: px[x, y] = ecol(e, 3 if f < 2 else 2)
        out.append(im)
    return out

def fx_blast(e):
    out = []
    for f in range(5):
        im = Image.new('RGBA', (48, 48)); px = im.load(); R = [6, 12, 17, 21, 23][f]
        for y in range(48):
            for x in range(48):
                d = math.hypot(x - 23.5, (y - 23.5) * 1.25)
                if f == 0 and d < R: px[x, y] = ecol(e, 3 if d < 3 else 2)
                elif f == 1 and d < R: px[x, y] = ecol(e, 3 if d < 5 else 2 if d < 9 else 1)
                elif f >= 2 and R - 3 < d < R:
                    if f == 4 and (x + y) % 2: continue
                    px[x, y] = ecol(e, 2 if d > R - 1.5 and f < 4 else 1)
                elif f == 2 and d < R - 3 and (x + y) % 3 == 0: px[x, y] = ecol(e, 1)
        out.append(im)
    return out

def strip(frames):
    w = max(f.width for f in frames); h = max(f.height for f in frames); s = Image.new('RGBA', (w * len(frames), h))
    for i, f in enumerate(frames): s.alpha_composite(f, (i * w + (w - f.width) // 2, (h - f.height) // 2))
    return s, w, h

THROWN = ('star', 'knife', 'axe', 'spear')
def muzzle_pt(style):
    """where the shot leaves the held sprite (padded coords). Shooters: the tip of the barrel, bow or prong.
    The orb: the centre of the orb. Thrown weapons: the centre of the weapon itself, which then leaves the hand."""
    rows = WEAPONS[style]['rows']; pts = [(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch not in '. ']
    if style == 'orb':
        g = [(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch in 'acde']
        return (sum(p[0] for p in g) / len(g) + 1, sum(p[1] for p in g) / len(g) + 1)
    if style in THROWN:
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return ((min(xs) + max(xs)) / 2 + 1, (min(ys) + max(ys)) / 2 + 1)
    mx = max(p[0] for p in pts); tip = [p[1] for p in pts if p[0] >= mx - 1]
    return (mx + 2, sum(tip) / len(tip) + 1)

def held(style, e):
    d = WEAPONS[style]; return selout(pad(draw(d['rows'], K, e))), (d['grip'][0] + 1, d['grip'][1] + 1)

if __name__ == '__main__':
    S = 4; out = Image.new('RGBA', (6 * 30 * S, 10 * 16 * S), C(3))
    for j, st in enumerate(WEAPONS):
        for i, e in enumerate(ELEM):
            im, _ = held(st, e); out.alpha_composite(im.resize((im.width * S, im.height * S), Image.NEAREST), (i * 30 * S + 4, j * 16 * S + 4))
    out.save('/tmp/claude-0/px/r15/armory.png')
    o2 = Image.new('RGBA', (6 * 80 * 4, 12 * 16 * 4), C(3))
    for j, st in enumerate(WEAPONS):
        for i, e in enumerate(ELEM):
            fr = proj(st, e); s, w, h = strip(fr); o2.alpha_composite(s.resize((s.width * 4, s.height * 4), Image.NEAREST), (i * 80 * 4 + 4, j * 16 * 4 + 4))
    for i, e in enumerate(ELEM):
        s, w, h = strip(fx_hit(e)); o2.alpha_composite(s.resize((s.width * 4, s.height * 4), Image.NEAREST), (i * 80 * 4 + 4, 10 * 16 * 4 + 4))
    o2.save('/tmp/claude-0/px/r15/projectiles.png')
