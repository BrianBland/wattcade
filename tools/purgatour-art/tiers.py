"""Tier 2 and tier 3 drawings for every weapon style, rarity fittings, and the held/projectile helpers that use them."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from arsenal import *

def gen_axe(HU=15.5, size=1.0, double=False, butt=(3.5, 18.5), N=25):
    grid = [['.'] * N for _ in range(N)]
    ox, oy = butt; ux, uy = 1 / math.sqrt(2), -1 / math.sqrt(2); vx, vy = ux * -1 * -1, -uy
    vx, vy = 1 / math.sqrt(2), 1 / math.sqrt(2)
    def uv(x, y):
        dx, dy = x + .5 - ox, y + .5 - oy
        return dx * ux + dy * uy, dx * vx + dy * vy
    E = 8.8 * size; cell = {}
    def blade(v, du):
        if v <= 0 or v > E: return False
        half = (2.3 + max(0, v - 2.0) ** 2 * 0.19 / size) * size ** .3
        lo = -half - max(0, v - 3 * size) * 0.55
        edge = E - (du / (4.6 * size)) ** 2 * 1.8 * size
        return lo <= du <= half * .9 and v <= edge
    for y in range(N):
        for x in range(N):
            u, v = uv(x, y); du = u - HU
            if -0.4 <= u <= HU + 2.6 and abs(v) <= 1.05: cell[(x, y)] = 'handle'
            if (-2.6 <= v <= 0 and abs(du) <= 2.2 and not double) or blade(v, du) or (double and blade(-v, du)) or (double and abs(v) < 1.6 and abs(du) <= 2.2):
                cell[(x, y)] = 'head'
    for (x, y), k in cell.items():
        u, v = uv(x, y); du = u - HU
        if k == 'handle':
            grid[y][x] = 'R' if u < 4 and v < 0 else 'r' if u < 4 else 'L' if v < -0.1 else 'B'
            if u < 0.6: grid[y][x] = 'g'
            if HU - 3.4 < u < HU - 2.2: grid[y][x] = 'G' if v < 0 else 'g'
            continue
        av = abs(v) if double else v
        edge = E - (du / (4.6 * size)) ** 2 * 1.8 * size
        op = lambda dx, dy: cell.get((x + dx, y + dy)) != 'head'
        c = 'S'
        if av > edge - 1.1: c = 'h' if (op(0, -1) or op(-1, 0)) else 'H'
        elif av > edge - 2.2: c = 'd'
        elif op(0, -1) or op(-1, 0): c = 'H'
        elif op(0, 1) or op(1, 0): c = 's'
        if -0.5 < v < 1.4 and abs(du) < 1.2: c = 'k'
        if double and abs(v) < .8 and abs(du) < 2.2: c = 'G' if du < 0 else 'g'
        grid[y][x] = c
    rows = [''.join(r) for r in grid]; top = 0
    while rows and set(rows[0]) == {'.'}: rows.pop(0); top += 1
    while rows and set(rows[-1]) == {'.'}: rows.pop()
    return rows, (int(ox + 1.5), int(oy) - top - 6)

def gen_razor():
    N = 15; c = 7; g = [['.'] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            d = math.hypot(x - c, y - c); a = math.degrees(math.atan2(y - c, x - c)) % 360
            tooth = (a % 40) < 16
            if d <= 5.2 or (d <= 7.1 and tooth):
                ch = 'S'
                if d > 5.2: ch = 'h' if (x + y) < 14 else 's'
                elif d > 4.3: ch = 'H' if (x + y) < 13 else 'k'
                if 1.5 < d <= 3.0: ch = 'd' if (x + y) < 14 else 'c'
                if d <= 1.5: ch = '.'
                g[y][x] = ch
    return [''.join(r) for r in g]

T2 = {
 'bolt': dict(name='Rod', grip=(4, 2), rows=[
    '................gcdg.',
    '...............gcdedg',
    'BLLLLgLLLLLLLLLGcdeec',
    'bBBBBgBBBBBBBBBgccddg',
    '.bbbbgbbbbbbbbb.gccg.']),
 'pellet': dict(name='Shotgun', grip=(4, 2), rows=[
    '.....gg.SSSSSSSSSSSSSSHh',
    'BLLLLgGHHHHHHHHHHHHHHHSk',
    'BBBBBgYcSSSSSSSSSSSSSSSk',
    'bBBBggcasssssssssssssssk',
    '.bBBB..ss...............',
    '..bBB...................',
    '...bb...................']),
 'arrow': dict(name='Bow', grip=(8, 9), rows=[
    '...LB..........',
    '....LB.........',
    '.....LB........',
    '....x.LB.......',
    '....x..LB......',
    '....x..LB......',
    '....x...LB.....',
    '....x...LB.....',
    '....x...rR.....',
    'xx..WLLLrRLSHcd',
    '....x...rR.....',
    '....x...LB.....',
    '....x...LB.....',
    '....x..LB......',
    '....x..LB......',
    '....x.LB.......',
    '.....LB........',
    '....LB.........',
    '...LB..........']),
 'flame': dict(name='Sprayer', grip=(3, 3), rows=[
    '......kssk.kssk........',
    '.....sSHHSsSHHSs.......',
    'BLLg.sacccsaccca.SSSSHh',
    'BBBgGsacddsacddcsHHHHSk',
    'bBBgg.saccsacccasSSSSk.',
    '.bBB...sSSs.sSSs.......',
    '..bB...ssss.ssss.......',
    '..bb...................']),
 'spark': dict(name='Coil', grip=(3, 2), rows=[
    '.........GgGgGgGgGg.....d',
    '........GYcYcYcYcYcG...ed',
    'BLLLgGSSgYdYdYdYdYdgSSSHe',
    'bBBBgggsgggggggggggggssSd',
    '.bBB...........kk.......c',
    '..bb.....................']),
 'orb': dict(name='Lobber', grip=(5, 12), rows=[
    '....accca....',
    '...acdddca...',
    '..acdeeddca..',
    '..cdeedddcc..',
    '..cddddddcc..',
    '..acdddccca..',
    '.g.accccca.g.',
    '.Gg.......gG.',
    '..Gg.....gG..',
    '...gGGYGGg...',
    '.....gGg.....',
    '.....LB......',
    '.....BB......',
    '.....bb......']),
 'star': dict(name='Star', grip=(3, 6), rows=[
    '......h......',
    '......Hs.....',
    '..h..HSs..s..',
    '...HSHSsSss..',
    '....HSSSs....',
    '..hHSSdSSss..',
    'hHHSSd.dSSsss',
    '..sSSSdSSss..',
    '....sSSSs....',
    '...sSsSsSs...',
    '..s..sSs..s..',
    '......ss.....',
    '......s......']),
 'knife': dict(name='Kunai', grip=(5, 2), rows=[
    '..........HHh...',
    '.sk.RRRRgHHHHHh.',
    's..krrrrcSSSSSHh',
    '.sk.rrrrgssssss.',
    '..........ss....']),
 'spear': dict(name='Javelin', grip=(6, 1), rows=[
    '......................HH..',
    'BLLLLLLLLLLLLLLLLLgGHHHHSHh',
    'bBBBBBBBBBBBBBBBBBggSSSSsSc',
    '......................ss..']),
}
T3 = {
 'bolt': dict(name='Sceptre', grip=(4, 3), rows=[
    '..................G.G.G..',
    '.................GYcdcYG.',
    '................gGcdeedcG',
    'gGGgLLLLLLLLLgGYGcdeeedcG',
    'ggggBBBBBBBBBgGGgcddddcg.',
    '.ggg.bbbbbbbb.ggg.gccccg.',
    '...................ggg...']),
 'pellet': dict(name='Cannon', grip=(4, 3), rows=[
    '..........kSSSSSSSSSHHh..',
    '....gg...kSHHHHHHHHHHHHHh',
    'BLLLgGg.kSSGSSSSSGSSSSSkk',
    'BBBBgYgkSSSYcSSSSYcSSSkk.',
    'bBBBggg.kSSgSSSSSgSSSSSkk',
    '.bBBB....ksssssssssssssss',
    '..bBB.....kkkkkkkkkkkkk..',
    '...bb....................']),
 'arrow': dict(name='Ballista', grip=(4, 3), rows=[
    '.............kSSHh........',
    '..............kSH.........',
    '....gG.........kS.........',
    'BLLLgGLLLLLLSSSSSSSSSSHHcd',
    'bBBBggBBBBBBsssxSSSSssssc.',
    '..bb..rRr......kS.........',
    '..bb..rrr.....kSH.........',
    '.............kSSHh........']),
 'flame': dict(name='Repeater', grip=(3, 3), rows=[
    '.........kssssk.........',
    '.......ksSHHHHSsk.......',
    'BLLg..ksacccccccask.SSHh',
    'BBBgG.saccdddddccasSHHHk',
    'bBBgg.saccdedeedcasSSSHh',
    '.bBB..ksaccccccccask.SSk',
    '..bB...ksSSSSSSSsk......',
    '..bb.....kssssk.........']),
 'spark': dict(name='Conduit', grip=(3, 3), rows=[
    '.................c...c......',
    '................cdcScdc.d...',
    '....gG.........gGgSSSgGgede.',
    'BLLLgGLLLLLLLLLgYgHHHgYgddee',
    'bBBBggBBBBBBBBBgggsssggg.de.',
    '.bbb..bbbbbbbb..cdcScdc..d..',
    '.................c...c......']),
 'orb': dict(name='Comet', grip=(5, 12), rows=[
    '.......c.d....',
    '....accced....',
    '...acdddcae...',
    '..acdeeddcadd.',
    '..cdeedddcc.d.',
    '.dcddddddcc...',
    'd.acdddccca...',
    '.d.accccca....',
    '..d.gGYGg.....',
    '....gGYGg.....',
    '.....gGg......',
    '.....LB.......',
    '.....BB.......',
    '.....bb.......']),
 'star': dict(name='Razor', grip=(4, 7), rows=gen_razor()),
 'knife': dict(name='Dirk', grip=(2, 2), rows=[
    '....G.................',
    'rRRgGHHHHHHHHHHHHHHh..',
    'rrrYcSSSkkkkkkSSSSSHh.',
    'rrrgGsssssssssssssss..',
    '....G.................']),
 'spear': dict(name='Lance', grip=(4, 2), rows=[
    '.........gS..................',
    '...RRR..gSSS.................',
    'BLLRRRLgYSSSSHHHHHHHHHHHHHHHh',
    'bBBrrrBgGSSSSsssssssssssssSHc',
    '...rr...gSSS.................',
    '.........gS..................']),
}
_r, _g = gen_axe(HU=10.5, size=.8, butt=(3.5, 14.5), N=20); T2['axe'] = dict(name='Hatchet', grip=_g, rows=_r)
_r, _g = gen_axe(HU=17.5, size=1.0, double=True, butt=(3.5, 22.5), N=30); T3['axe'] = dict(name='Greataxe', grip=_g, rows=_r)

RARITY = [('Common', ('#3a3243', '#756a74', '#aba09c')), ('Uncommon', ('#1c3c6a', '#3a78c8', '#8ac4ff')),
          ('Rare', ('#7a4a12', '#c07a1c', '#f0b030')), ('Epic', ('#4a1f7a', '#8a3ee0', '#d7a6ff')),
          ('Legendary', ('#7a2408', '#e06a1a', '#ffb060')), ('Unique', ('#6a1050', '#d02ea8', '#ff8ae0'))]

def tier_def(style, tier):
    return [WEAPONS[style], T2[style], T3[style]][tier]

def drawr(rows, e, rarity):
    """draw with element and rarity fittings (g/G/Y use the rarity ramp)."""
    rk = RARITY[rarity][1]; key = dict(K); im = draw(rows, key, e); px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in 'gGY':
                h = rk['gGY'.index(ch)]; px[x, y] = tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    return im

def held_t(style, e, tier=0, rarity=2):
    d = tier_def(style, tier); im = drawr(d['rows'], e, rarity)
    if rarity == 5:   # unique crest: a bright pink pip on the fitting nearest the grip
        px = im.load(); gx, gy = d['grip']
        best = None
        for y, r in enumerate(d['rows']):
            for x, ch in enumerate(r):
                if ch in 'gGY':
                    dd = abs(x - gx) + abs(y - gy)
                    if best is None or dd < best[0]: best = (dd, x, y)
        if best: px[best[1], best[2]] = (255, 236, 250, 255)
    return selout(pad(im)), (d['grip'][0] + 1, d['grip'][1] + 1)

def muzzle_t(style, tier):
    d = tier_def(style, tier); rows = d['rows']; pts = [(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch not in '. ']
    if style == 'orb':
        g = [(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch in 'acde'][:40]
        return (sum(p[0] for p in g) / len(g) + 1, sum(p[1] for p in g) / len(g) + 1)
    if style in THROWN:
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return ((min(xs) + max(xs)) / 2 + 1, (min(ys) + max(ys)) / 2 + 1)
    mx = max(p[0] for p in pts); tip = [p[1] for p in pts if p[0] >= mx - 1]
    return (mx + 2, sum(tip) / len(tip) + 1)

def proj_t(style, e, tier=0, rarity=2):
    if style in THROWN:
        h0 = drawr(tier_def(style, tier)['rows'], e, rarity)
        if style in ('star',): F = [h0, h0.transpose(Image.ROTATE_90)]
        elif style == 'axe': F = [h0, h0.transpose(Image.ROTATE_270), h0.transpose(Image.ROTATE_180), h0.transpose(Image.ROTATE_90)]
        else: F = [h0]
        return [selout(pad(f)) for f in F]
    return proj(style, e)

if __name__ == '__main__':
    S = 4; cw = 34
    out = Image.new('RGBA', (3 * cw * S, 10 * 34 * S), C(3))
    for j, st in enumerate(WEAPONS):
        for t in range(3):
            im, _ = held_t(st, 'fire', t, [0, 2, 5][t]); out.alpha_composite(im.resize((im.width * S, im.height * S), Image.NEAREST), (t * cw * S + 4, j * 34 * S + 4))
    out.save('/tmp/claude-0/px/r15/tiers.png')
