"""Round 17: characters repainted to the room standard. Hand-authored ASCII, master palette plus a small character ramp,
light from the top left, full dark outline (characters are the only things fully outlined), one rim of light on the lit side."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pal import C, HEX
from PIL import Image

def hx(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
OUT = hx('#0b0910')
KEY = {
    # team kit blue
    'D': hx('#1b2f63'), 'c': hx('#2a55a8'), 'C': hx('#4c8ae0'), 'L': hx('#a6d0ff'),
    # jersey (same blue) + white + red
    'q': hx('#1b2f63'), 'j': hx('#2a55a8'), 'J': hx('#4c8ae0'),
    'W': C(11), 'w': C(10), 'v': C(9), 'R': C(21), 'r': C(20),
    # skin
    'S': hx('#f0c49a'), 's': hx('#d8975f'), 'd': hx('#a8653a'), 'm': hx('#7a3a24'),
    # hair
    'H': hx('#9a6638'), 'h': hx('#5a3418'), 'x': hx('#2a160c'),
    # bib shorts / shoes
    'K': C(5), 'k': C(3), 'G': C(6), 'n': C(1), 'N': C(6), 'e': C(0), 'E': C(11),
}

def grid(rows, key=KEY, w=32, h=32, at=(0, 0), img=None):
    im = img or Image.new('RGBA', (w, h)); px = im.load(); ox, oy = at
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in '. ': continue
            X, Y = ox + x, oy + y
            if 0 <= X < im.width and 0 <= Y < im.height: px[X, Y] = key[ch]
    return im

def outline(im, col=OUT):
    px = im.load(); o = im.copy(); po = o.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]: continue
            if any(0 <= x + dx < im.width and 0 <= y + dy < im.height and px[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                po[x, y] = col
    return o

# ---------------------------------------------------------------- hero, front (facing down)
F_HEAD = [
    ".....cCCCCc.....",
    "....cCLWWCCc....",
    "...cCLCWWCCCc...",
    "...cCCCWWCCCc...",
    "..DccccWWccccD..",
    "..WWWWWWWWWWWw..",
    "..hHHSSSSSSHHh..",
    "..hHSSSSSSSSsh..",
    "..hSSeESSeESsh..",
    "..hSSeeSSeeSsh..",
    "...sSSSSSSSsd...",
    "....dSSmmSsd....",
    ".....ddsssd.....",
]
F_BODY = [  # arms are drawn separately so they can swing
    "....jJJWWJjq....",
    "....jJJJwJjq....",
    "....jJJJwJjq....",
    "....WWWWWWWv....",
    "....RRRRRRRr....",
    "....jJJJwjjq....",
    "....kKKKKKkk....",
]
F_ARM_L = ["jJ", "jJ", "Ss", "Ss", "sd"]
F_ARM_R = ["jq", "jq", "sd", "sd", "dd"]
F_LEG = {   # four walk frames; each is (left leg rows, right leg rows, left lift, right lift)
    'stand': ["kKK", "kKk", "SSs", "Ssd", "WWv", "NNn", "nnn"],
}
def leg(lift):
    rows = ["GKK", "KKk", "SSs", "Ssd", "WWv", "NNn", "nnn"]
    return rows[:7 - lift] if lift else rows

def hero_front(fr=0):
    im = Image.new('RGBA', (32, 32)); bob = 1 if fr in (1, 3) else 0
    ll = 1 if fr == 1 else 0; rl = 1 if fr == 3 else 0
    grid(leg(ll), at=(11, 22 + 0), img=im) if False else None
    for i, r in enumerate(leg(0)):   # legs (front): lifted leg is shorter at the bottom (foot raised)
        if not (ll and i == 6): grid([r], at=(12, 22 + i - (ll if i >= 5 else 0)), img=im)
        if not (rl and i == 6): grid([r], at=(17, 22 + i - (rl if i >= 5 else 0)), img=im)
    up = Image.new('RGBA', (32, 32))
    grid(F_BODY, at=(8, 15), img=up)
    sw = [0, 1, 0, -1][fr]
    grid(F_ARM_L, at=(10, 16 + max(0, sw)), img=up); grid(F_ARM_R, at=(20, 16 + max(0, -sw)), img=up)
    grid(F_HEAD, at=(8, 3), img=up)
    im.alpha_composite(up, (0, -bob))
    return outline(im)

# ---------------------------------------------------------------- hero, side (facing right)
R_HEAD = [
    ".....cCCCc......",
    "...cCCLWWCCc....",
    "..cCCLCWWCCCc...",
    "..cCCCCWWCCCcDD.",
    "..DcccccWWccccDD",
    "..hhHHWWWWWWWWw.",
    "..hHHHSSSSSSS...",
    "..hHHSSSSSSSSS..",
    "..hHSSSSSeESS...",
    "..xhHSSSSeeSs...",
    "...xhsSSSSSSs...",
    "....hdsSSmSd....",
    ".....ddssdd.....",
]
R_BODY = [
    ".....jJJJWw.....",
    ".....jJJJJw.....",
    ".....jJJJJj.....",
    ".....WWWWWv.....",
    ".....RRRRRr.....",
    ".....jJJJjq.....",
    ".....kKKKKk.....",
]
R_ARM = ["Jj", "Jj", "Ss", "Ss", "sd"]
R_LEGS = [   # stride frames, rows 22-28; the far leg is a step darker
    ["......GKKk......", ".....kKk.KK.....", ".....sd...SSs...", "....sd.....Ss...", "....Wv.....WW...", "...nNn.....NNNn.", "...nnn.....nnnn."],
    ["......GKKk......", "......KKkk......", "......SSsd......", "......SSdd......", "......WWvv......", "......NNNnn.....", "......nnnnn....."],
    ["......GKKk......", ".....KK.kKk.....", ".....SSs..sd....", "....Ss.....sd...", "....WW.....Wv...", "...NNNn....nNn..", "...nnnn....nnn.."],
    ["......GKKk......", "......KKkk......", "......SSsd......", "......SSdd......", "......WWvv......", "......NNNnn.....", "......nnnnn....."],
]
def hero_side(fr=0):
    im = Image.new('RGBA', (32, 32)); bob = 1 if fr in (1, 3) else 0
    grid(R_LEGS[fr], at=(7, 22), img=im)
    up = Image.new('RGBA', (32, 32))
    back = [0, 0, 0, 0]
    grid(R_BODY, at=(7, 15), img=up)
    sw = [-2, 0, 2, 0][fr]
    arm = Image.new('RGBA', (32, 32)); grid(R_ARM, at=(14 + sw, 16), img=arm)
    grid(R_HEAD, at=(7, 3), img=up); up.alpha_composite(arm)
    im.alpha_composite(up, (0, -bob))
    return outline(im)

# ---------------------------------------------------------------- hero, back (facing up)
U_HEAD = [
    ".....cCCCCc.....",
    "....cCLWWCCc....",
    "...cCLCWWCCCc...",
    "...cCCCWWCCCc...",
    "..DccccWWccccD..",
    "..hWWWWWWWWWwh..",
    "..hHHHHHHHHHHh..",
    "..hHHHHHHHHHhh..",
    "..sHHHHHHHHHhd..",
    "..shHHHHHHHHhd..",
    "...hhHHHHHHhh...",
    "....hhhhhhhh....",
    ".....sssssd.....",
]
U_BODY = [
    "....jJJJJJjq....",
    "....jJJJJJjq....",
    "....jJJJJJjq....",
    "....WWWWWWWv....",
    "....RRRRRRRr....",
    "....jqJqJqjq....",
    "....kKKKKKkk....",
]
def hero_back(fr=0):
    im = Image.new('RGBA', (32, 32)); bob = 1 if fr in (1, 3) else 0
    ll = 1 if fr == 1 else 0; rl = 1 if fr == 3 else 0
    for i, r in enumerate(leg(0)):
        if not (ll and i == 6): grid([r], at=(12, 22 + i - (ll if i >= 5 else 0)), img=im)
        if not (rl and i == 6): grid([r], at=(17, 22 + i - (rl if i >= 5 else 0)), img=im)
    up = Image.new('RGBA', (32, 32))
    grid(U_BODY, at=(8, 15), img=up)
    sw = [0, 1, 0, -1][fr]
    grid(F_ARM_L, at=(10, 16 + max(0, -sw)), img=up); grid(F_ARM_R, at=(20, 16 + max(0, sw)), img=up)
    grid(U_HEAD, at=(8, 3), img=up)
    im.alpha_composite(up, (0, -bob))
    return outline(im)

def nudge(im, dx):
    o = Image.new('RGBA', im.size); o.alpha_composite(im, (dx, 0)); return o
def hero(f, fr=0):
    im = {'d': hero_front, 'r': hero_side, 'u': hero_back}[f](fr)
    return nudge(im, 1) if f == 'r' else im   # side view: centre the mass on the sprite

if __name__ == '__main__':
    o = Image.new('RGBA', (4 * 34 + 2, 3 * 34 + 2), C(3))
    for r, f in enumerate('dru'):
        for fr in range(4): o.alpha_composite(hero(f, fr), (2 + fr * 34, 2 + r * 34))
    o.resize((o.width * 6, o.height * 6), Image.NEAREST).save('/tmp/claude-0/px/r17/hero.png')

# ================================================================ enemies
from PIL import ImageDraw
def shade_n(nx, ny, ramp):
    l = -nx * .75 - ny * .65
    return ramp[0] if l < -.45 else ramp[1] if l < .05 else ramp[2] if l < .55 else ramp[3]

ORANGE = [hx('#7a240c'), hx('#c4441a'), hx('#ec6a24'), hx('#ffa04a')]
def coneling(fr=0):
    """a traffic cone that hops: white reflective bands, bolt-hole eyes, rubber base, stubby feet"""
    im = Image.new('RGBA', (32, 32)); px = im.load()
    sq = [0, 1, 0, -1][fr]                  # squash on landing, stretch at the top of the hop
    lift = [0, 0, 2, 1][fr]
    top, base = 5 + sq - lift, 24 - lift
    for y in range(top, base):
        k = (y - top) / max(1, base - top); half = 1.2 + k * 6.3
        for x in range(32):
            dx = (x + .5 - 16) / half
            if abs(dx) > 1: continue
            c = shade_n(dx, -.2, ORANGE)
            band = (.30 < k < .42) or (.64 < k < .78)
            if band: c = C(11) if dx < -.2 else C(10) if dx < .45 else C(9)
            px[x, y] = c
    for y in range(base, base + 3):            # rubber base, wider than the cone
        for x in range(7, 25):
            px[x, y] = C(6) if y == base else C(4) if x > 21 else C(5)
        if y == base:
            for x in range(7, 25): px[x, y] = C(7) if x < 12 else C(6)
    ey = top + int((base - top) * .47)
    for ex in (13, 17):                         # eyes sit in the orange between the bands
        px[ex + 1, ey] = C(0); px[ex + 1, ey + 1] = C(0); px[ex, ey + 1] = C(0); px[ex, ey] = C(11)
    px[15, ey + 2] = ORANGE[0]; px[16, ey + 2] = ORANGE[0]
    if lift == 0:
        for x in (10, 11, 20, 21): px[x, base + 3] = C(2)
    else:
        for x in (10, 11, 20, 21): px[x, base + 3] = C(2); px[x, base + 4] = C(1)
    return outline(im)

LEATHER = [C(1), C(3), C(5), C(7)]
WING = [hx('#2a1838'), hx('#4a2a5e'), hx('#6e4486'), hx('#9a6eb0')]
def saddle_sore(fr=0):
    """a bat whose body is a saddle: stitched leather, seatpost tail, membrane wings in three flap poses"""
    im = Image.new('RGBA', (32, 32)); d = ImageDraw.Draw(im); px = im.load(); dy = [0, 1, 2][fr % 3]
    tips = [[(1, 6), (5, 3)], [(0, 13), (5, 11)], [(2, 21), (6, 19)]][fr % 3]
    for side in (1, -1):
        X = (lambda x: x) if side == 1 else (lambda x: 31 - x)
        (tx, ty), (mx, my) = tips
        poly = [(X(12), 12 + dy), (X(tx), ty + dy), (X(mx + 1), my + 3 + dy), (X(4), 15 + dy), (X(7), 15 + dy), (X(8), 18 + dy), (X(12), 17 + dy)]
        d.polygon(poly, fill=WING[1])
        d.line([(X(12), 12 + dy), (X(tx), ty + dy)], fill=WING[3] if side == 1 else WING[2])   # leading edge bone
        d.line([(X(11), 14 + dy), (X(mx + 1), my + 3 + dy)], fill=WING[0])
    # saddle body: wide back, narrow nose, seen from above-front
    body = [(10, 10), (22, 10), (21, 14), (18, 19), (17, 22), (15, 22), (14, 19), (11, 14)]
    d.polygon([(x, y + dy) for x, y in body], fill=LEATHER[1])
    for y in range(10 + dy, 23 + dy):
        for x in range(9, 24):
            if px[x, y][:3] == LEATHER[1][:3]:
                if y == 10 + dy or x <= 11 and y < 14 + dy: px[x, y] = LEATHER[3]
                elif y == 11 + dy: px[x, y] = LEATHER[2]
                elif x >= 20 or y >= 20 + dy: px[x, y] = LEATHER[0]
    for x in range(12, 21, 2): px[x, 12 + dy] = C(8)          # stitching
    for (x, y) in ((13, 14), (19, 14)): px[x, y + dy] = C(21); px[x + 1, y + dy] = C(21); px[x, y + dy - 1] = hx('#ff8a7a')  # red eyes
    px[15, 17 + dy] = C(11); px[17, 17 + dy] = C(11)              # fangs
    for y in range(22 + dy, 26 + dy): px[15, y] = C(8); px[16, y] = C(6)   # seatpost tail
    px[15, 26 + dy] = C(9)
    return outline(im)

GEL = [hx('#163e14'), hx('#2a7a24'), hx('#4cb43a'), hx('#8ee862'), hx('#e2ffc4')]
SL_DIM = [(9, 6.5), (10, 5.5), (9, 6.5), (8, 7.5)]
def gel_slime(fr=0, atk=False):
    """green gel: stepped shading, a darker core, a wet highlight, two eyes and a mouth"""
    rx, ry = SL_DIM[fr % 4]
    if atk: rx, ry = 10.5, 6
    im = Image.new('RGBA', (32, 32)); px = im.load(); cy = 28.5 - ry
    for y in range(32):
        for x in range(32):
            nx, ny = (x + .5 - 16) / rx, (y + .5 - cy) / ry
            if nx * nx + ny * ny > 1 or y > 28: continue
            c = shade_n(nx, ny, GEL[:4])
            if nx * nx + (ny - .35) ** 2 * 1.6 < .22: c = GEL[0] if c == GEL[1] else GEL[1]   # darker core
            if y == 28: c = GEL[0]
            px[x, y] = c
    hx0, hy0 = round(16 - rx * .5), round(cy - ry * .55)
    px[hx0, hy0] = GEL[4]; px[hx0 + 1, hy0] = GEL[4]; px[hx0, hy0 + 1] = GEL[3]
    ey = round(cy - 1)
    for ex in (13, 18):
        px[ex, ey] = C(0); px[ex, ey + 1] = C(0); px[ex + 1, ey] = C(0); px[ex + 1, ey + 1] = C(0); px[ex, ey] = C(11)
    if atk:
        for x in range(14, 19): px[x, ey + 3] = C(0)
        px[15, ey + 4] = C(0); px[16, ey + 4] = C(0); px[17, ey + 4] = C(0); px[16, ey + 3] = C(21)
    else: px[15, ey + 3] = C(0); px[16, ey + 3] = C(0)
    px[round(16 + rx * .45), round(cy + ry * .4)] = GEL[3]
    return outline(im)

# ================================================================ hit flash and deaths
def flash(im, col=C(11)):
    o = im.copy(); p = o.load()
    for y in range(o.height):
        for x in range(o.width):
            if p[x, y][3]: p[x, y] = col if p[x, y] != OUT else hx('#ffd6e0')
    return o

def puff(fr, tint=None):
    """death puff, 5 frames: a flash core, then grey smoke balls that grow, rise and thin out, with a few sparks"""
    im = Image.new('RGBA', (32, 32)); px = im.load()
    balls = [(16, 20, 5), (11, 22, 3.5), (21, 22, 4), (14, 16, 3.5), (19, 17, 3)]
    grow = [.6, 1.0, 1.25, 1.4, 1.5][fr]; rise = [0, 1, 3, 5, 7][fr]
    ramp = [C(6), C(8), C(10), C(11)] if not tint else tint
    for (bx, by, r) in balls:
        R = r * grow
        for y in range(32):
            for x in range(32):
                nx, ny = (x + .5 - bx) / R, (y + .5 - (by - rise)) / R
                dd = nx * nx + ny * ny
                if dd > 1: continue
                if fr >= 3 and (x + y + fr) % (2 if fr == 4 else 3) == 0: continue   # thinning
                c = shade_n(nx, ny, ramp) if fr > 0 else C(11)
                px[x, y] = c
    if fr in (1, 2):
        for (sx, sy) in ((5, 10), (27, 12), (8, 27), (25, 26), (16, 6)):
            k = fr * 2; x = round(16 + (sx - 16) * (.6 + .3 * fr)); y = round(18 + (sy - 18) * (.6 + .3 * fr))
            if 0 <= x < 32 and 0 <= y < 32: px[x, y] = C(25)
    return im

def hero_down(fr):
    """the DNF: knocked flat, then dizzy spokes circle the head"""
    if fr == 0: return flash(hero('d', 0))
    body = hero('r', 1).rotate(90, expand=False)
    im = Image.new('RGBA', (32, 32)); im.alpha_composite(body, (0, 6))
    p = im.load()
    for k in range(5):   # little spinning chainring teeth = dizzy stars
        a = k * 2 * math.pi / 5 + fr * .7; x, y = round(9 + math.cos(a) * 5), round(18 + math.sin(a) * 2)
        if 0 <= x < 32 and 0 <= y < 32: p[x, y] = C(25)
    return im

if __name__ == '__main__':
    S = 34; rows = [[hero(f, fr) for fr in range(4)] for f in 'dru']
    rows.append([coneling(i) for i in range(4)])
    rows.append([saddle_sore(i) for i in range(3)] + [flash(saddle_sore(0))])
    rows.append([gel_slime(i) for i in range(4)] + [gel_slime(0, True)])
    rows.append([puff(i) for i in range(5)])
    rows.append([hero_down(i) for i in range(3)] + [flash(coneling(0))])
    o = Image.new('RGBA', (5 * S + 2, len(rows) * S + 2), C(3))
    for r, row in enumerate(rows):
        for c, im in enumerate(row): o.alpha_composite(im, (2 + c * S, 2 + r * S))
    o.resize((o.width * 5, o.height * 5), Image.NEAREST).save('/tmp/claude-0/px/r17/sheet.png')

# ================================================================ Gel Slime v2: a real hop cycle with squash, stretch, wobble and goo
# frame: (rx, ry, height above ground, lean, extra) ; lean skews the top toward the direction of travel (right)
HOP = [
    (9.5, 6.5, 0, 0, ''),          # 0 rest
    (12.5, 4.2, 0, -.10, ''),      # 1 anticipation: squash flat, leans back
    (6.8, 9.6, 1, .25, 'drip'),    # 2 launch: stretch tall, leaning into the jump, a strand still on the floor
    (7.8, 8.4, 7, .15, 'drop'),    # 3 rising
    (8.8, 7.4, 10, 0, ''),         # 4 apex: round
    (7.4, 8.8, 6, -.10, 'drop'),   # 5 falling: stretches down
    (14.0, 3.6, 0, 0, 'splash'),   # 6 impact: splat
    (10.6, 5.8, 0, .05, ''),       # 7 rebound
    (8.4, 7.6, 0, -.05, ''),       # 8 wobble tall
    (10.0, 6.2, 0, 0, ''),         # 9 settle
]
def gel_hop(fr):
    rx, ry, hgt, lean, extra = HOP[fr]
    im = Image.new('RGBA', (40, 32)); px = im.load(); cx = 20; ground = 28.5
    cy = ground - ry - hgt
    for y in range(32):
        for x in range(40):
            ny = (y + .5 - cy) / ry
            sk = lean * (-ny) * ry                      # skew: top shifts by lean
            nx = (x + .5 - cx - sk) / rx
            wob = 1 + .06 * math.sin(math.atan2(ny, nx) * 3 + fr * 1.7)
            if nx * nx + ny * ny > wob * wob: continue
            if hgt == 0 and y > 28: continue
            c = shade_n(nx, ny, GEL[:4])
            if nx * nx + (ny - .35) ** 2 * 1.6 < .22: c = GEL[0] if c == GEL[1] else GEL[1]
            if hgt == 0 and y == 28: c = GEL[0]
            px[x, y] = c
    # wet highlight follows the shape
    hx0, hy0 = round(cx - rx * .5 + lean * ry * .55), round(cy - ry * .55)
    for (dx, dy, k) in ((0, 0, 4), (1, 0, 4), (0, 1, 3), (2, 0, 3)):
        if px[hx0 + dx, hy0 + dy][3]: px[hx0 + dx, hy0 + dy] = GEL[k]
    # face: eyes squash with the body
    ey = round(cy - ry * .15); sep = max(3, round(rx * .45)); exo = round(lean * ry * .3)
    eh = 1 if ry < 5 else 2
    for ex in (cx - sep + exo, cx + sep - 2 + exo):
        for yy in range(eh):
            px[ex, ey + yy] = C(0); px[ex + 1, ey + yy] = C(0)
        px[ex, ey] = C(11)
    if fr == 6: px[cx - 1 + exo, ey + 2] = C(0); px[cx + exo, ey + 2] = C(0)   # oof
    elif ry > 8: px[cx + exo, ey + 3] = C(0); px[cx + exo, ey + 4] = C(0)      # o-mouth when stretched
    else: px[cx - 1 + exo, ey + 3] = C(0); px[cx + exo, ey + 3] = C(0)
    if extra == 'drip':                                  # a strand of goo still stuck to the floor
        for y in range(round(cy + ry) - 1, 29): px[cx - 2, y] = GEL[1]; px[cx - 1, y] = GEL[2] if y < 27 else GEL[1]
        px[cx - 3, 28] = GEL[1]; px[cx, 28] = GEL[1]
    if extra == 'drop':                                  # a droplet trailing below
        dy0 = round(cy + ry) + 2
        if dy0 < 30: px[cx - 1, dy0] = GEL[2]; px[cx - 1, dy0 + 1] = GEL[1]
    if extra == 'splash':                                # droplets flung out on impact
        for (dx, dy) in ((-17, -4), (16, -5), (-14, -8), (13, -9), (-18, 0), (18, -1)):
            x, y = cx + dx, 28 + dy
            if 0 <= x < 40: px[x, y] = GEL[2]; px[x, y + 1] = GEL[1] if y + 1 < 32 else px[x, y]
    return outline(im), hgt

GOO = [hx('#1f5a1a'), hx('#2e7a24')]
def goo_trail(fr):
    """the wet patch a landing leaves, fading over 3 frames"""
    im = Image.new('RGBA', (28, 8)); px = im.load()
    for y in range(8):
        for x in range(28):
            d = ((x + .5 - 14) / 13) ** 2 + ((y + .5 - 4) / 3.4) ** 2
            if d < 1 and (fr == 0 or (x + y * 3 + fr) % (fr + 1) == 0): px[x, y] = GOO[1] if d < .4 and y < 4 else GOO[0]
    return im

if __name__ == '__main__':
    o = Image.new('RGBA', (10 * 42 + 2, 36), C(3))
    for i in range(10):
        im, hgt = gel_hop(i); o.alpha_composite(im, (2 + i * 42, 2))
    o.resize((o.width * 5, o.height * 5), Image.NEAREST).save('/tmp/claude-0/px/r17/hop.png')
