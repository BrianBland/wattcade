"""Room builders for the three new zones; same pipeline as keep.build() (floor, hazards, contact shadows, wall tops + trims, faces, dressing)."""
import os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from zones import *
import motifs
import lava
from PIL import Image, ImageDraw

LAYOUTS = {
    'crypt': ["WWWWWWWWWWWWWW",
              "WWWWWWDWWWWWWW",
              "W..W......W..W",
              "W..W......W..W",
              "W............W",
              "W............W",
              "W....GG......W",
              "W............W",
              "WWWWWWWWWWWWWW"],
    'catacombs': ["WWWWWWWWWWWWWW",
                  "WWWWDWWWWWWWWW",
                  "WW..........WW",
                  "W............W",
                  "W............W",
                  "W..WW.^^.WW..W",
                  "W..WW.^^.WW..W",
                  "WW..........WW",
                  "WWWWWWWWWWWWWW"],
    'deep': ["WWWWWWWWWWWWWW",
             "WWWWWWWWRWWWWW",
             "WWW.........WW",
             "WW...........W",
             "W............W",
             "W............W",
             "W............W",
             "WW.........WWW",
             "WWWWWWWWWWWWWW"],
}

def lava_mask(x, y):
    """a winding lava channel across the lower room, only on floor tiles"""
    if LAYOUTS['deep'][int(y) // 32][int(x) // 32] != '.' or (int(y) - 16) // 32 >= 0 and LAYOUTS['deep'][(int(y) + 0) // 32 + 1][int(x) // 32] == 'W' and int(y) % 32 > 30: return False
    yc = 206 + 18 * math.sin(x / 52.0) + 6 * math.sin(x / 17.0 + 1)
    half = 9 + 3 * math.sin(x / 31.0)
    return abs(y - yc) < half

def build(zone):
    use(zone); R = Room(LAYOUTS[zone]); W, Hh = R.W, R.H
    im = Image.new('RGBA', (W * T, Hh * T + 16), C(1)); px = im.load()
    glow = []   # (x, y, rgba) static emissive pixels
    water = set()
    fw, fh = W * T, Hh * T
    if zone == 'crypt': fl = floor_crypt(fw, fh)
    elif zone == 'catacombs':
        def path(rnd):   # cobbles from the door down to the bottom, and across the middle
            pts = []
            for y in range(2 * T, 8 * T, 7):
                for x in range(4 * T - 4 + (y // 6) % 2 * 3, 5 * T + 10, 7):
                    if rnd.random() < .6: pts.append((x + rnd.randrange(-1, 2), y))
            for y in range(4 * T - 2, 5 * T - 4, 6):
                for x in range(1 * T, 13 * T, 7):
                    if rnd.random() < .3: pts.append((x + (y // 6) % 2 * 3, y))
            return pts
        fl = floor_catacombs(fw, fh, path=path)
    else: fl = floor_deep(fw, fh)
    im.alpha_composite(fl.crop((0, 0, fw, fh)), (0, 0))
    lights, emit, sprites = [], [], []
    def prop(img, cx, foot, shadow=None):
        sprites.append(dict(img=img, x=cx - img.width // 2, y=foot - img.height, foot=foot, shadow=shadow, cx=cx))
    # ---- hazards painted into the floor
    if zone == 'crypt':
        water = paint_pool(px, 9 * T + 2, 11 * T + 30, 4 * T + 6, 5 * T + 26, 34, 22)
        put(im, grave(), 5 * T - 4, 6 * T - 4)
        put(im, bones_decal(), 7 * T + 8, 6 * T + 18); put(im, bones_decal().transpose(Image.FLIP_LEFT_RIGHT), 2 * T + 4, 4 * T + 20)
    if zone == 'catacombs':
        for (tx, ty) in ((6, 5), (7, 5), (6, 6), (7, 6)): put(im, spikes(1 if (tx + ty) % 2 else 0), tx * T + 1, ty * T + 1)
        put(im, bones_decal(), 2 * T + 6, 3 * T + 8); put(im, bones_decal(), 11 * T + 2, 7 * T + 6)
        put(im, motifs.chalk('ALLEZ', 9, seed=2), 9 * T + 2, 3 * T + 12)
    if zone == 'deep':
        lava.paint_base(px, C)
        put(im, wheel_relic(), 10 * T + 4, 3 * T + 6); put(im, motifs.frame_relic(), 5 * T + 2, 2 * T + 18)
    # ---- contact shadows
    for ty in range(Hh):
        for tx in range(W):
            if R.wall(tx, ty): continue
            for y in range(T):
                for x in range(T):
                    X, Y = tx * T + x, ty * T + y; k = 0
                    if R.wall(tx, ty - 1): k = 2 if y < 5 else 1 if y < 11 else 0
                    if R.wall(tx - 1, ty) and x < 4: k = max(k, 1)
                    if R.wall(tx + 1, ty) and x > 28: k = max(k, 1)
                    if k and (k == 2 or (X + Y) % 2 == 0 or y < 9):
                        c = px[X, Y]; px[X, Y] = tuple(int(v * (.5 if k == 2 else .72)) for v in c[:3]) + (255,)
    # ---- wall tops and trims
    for ty in range(Hh):
        for tx in range(W):
            if not R.wall(tx, ty) or R.face(tx, ty): continue
            X, Y = tx * T, ty * T
            for y in range(T):
                for x in range(T): px[X + x, Y + y] = C(1)
            if not R.wall(tx + 1, ty) or R.face(tx + 1, ty): trim(px, X, Y, 'r')
            elif R.face(tx + 1, ty + 1): trim(px, X, Y, 'r', partial=RISE)
            if not R.wall(tx - 1, ty) or R.face(tx - 1, ty): trim(px, X, Y, 'l')
            elif R.face(tx - 1, ty + 1): trim(px, X, Y, 'l', partial=RISE)
            if not R.wall(tx, ty - 1): trim(px, X, Y, 't')
            if R.face(tx, ty + 1) is False and not R.wall(tx, ty + 1): trim(px, X, Y, 'b')
    # ---- faces
    if zone == 'crypt':
        niches = [(2 * T + 16, 'urn'), (4 * T + 16, 'urn'), (8 * T + 16, 'helmet'), (11 * T + 16, 'skull')]
        strip = wall_crypt(W * T, niches)
    elif zone == 'catacombs': strip = wall_catacombs(W * T, wheels=(8 * T + 16,))
    else: strip = wall_deep(W * T)
    for ty in range(Hh):
        for tx in range(W):
            if not R.face(tx, ty): continue
            if zone == 'crypt' and ty > 1: f = wall_crypt(T, [(16, 'skull')] if tx == 3 else [(16, 'urn')])
            else: f = strip.crop((tx * T, 0, tx * T + T, FH))
            fp = f.load()
            if R.wall(tx - 1, ty) and not R.face(tx - 1, ty):
                for y in range(FH): fp[0, y] = C(2); fp[1, y] = C(3)
            if R.wall(tx + 1, ty) and not R.face(tx + 1, ty):
                for y in range(FH): fp[31, y] = C(2); fp[30, y] = C(4)
            t = R.tile(tx, ty)
            if t in 'DL':
                f.alpha_composite((door_crypt if zone == 'crypt' else door_catacombs)('open' if t == 'D' else 'locked'))
            if t == 'R':
                d, gl = door_deep('locked'); f.alpha_composite(d)
                for (x, y) in gl: glow.append((tx * T + x, ty * T - RISE + y, hexc('#c77dff')))
            put(im, f, tx * T, ty * T - RISE)
    # ---- dressing per zone
    if zone == 'crypt':
        GF = (90, 230, 210)
        for cx in (5 * T + 16, 7 * T + 16):   # ghostfire sconces flanking the door
            put(im, torch(), cx - 3, T + 4); emit.append(('gflame', cx - 3, T - 7)); lights.append((cx, T + 2, 140, GF, .95))
        for cx in (3 * T + 16, 10 * T + 16):   # sconces on the alcove stubs
            put(im, torch(), cx - 3, 3 * T + 4); emit.append(('gflame', cx - 3, 3 * T - 7)); lights.append((cx, 3 * T + 2, 110, GF, .8))
        prop(sarcophagus(), 1 * T + 30, 3 * T + 26, (14, 4)); prop(sarcophagus(True), 11 * T + 34, 3 * T + 26, (14, 4))
        put(im, cobweb(), 1 * T, 2 * T); put(im, cobweb(True), 13 * T - 9, 2 * T)
        prop(urn(), 4 * T + 22, 2 * T + 20, (4, 2)); prop(urn(), 9 * T + 10, 2 * T + 20, (4, 2))
        prop(brazier(), 3 * T + 4, 6 * T + 10, (6, 2)); emit.append(('gflame', 3 * T + 1, 6 * T - 8, 6 * T + 10)); lights.append((3 * T + 4, 6 * T - 6, 90, GF, .9))
        prop(candles(), 8 * T + 4, 7 * T + 2, (6, 2)); lights.append((8 * T + 4, 7 * T - 6, 60, (255, 200, 120), .6))
        for fx_ in (8 * T, 8 * T + 4, 8 * T + 8): emit.append(('candle', fx_ - 4, 7 * T - 7))
        prop(candles(), 12 * T + 8, 6 * T + 2, (6, 2)); lights.append((12 * T + 8, 6 * T - 6, 60, (255, 200, 120), .6))
        for fx_ in (12 * T + 4, 12 * T + 8, 12 * T + 12): emit.append(('candle', fx_ - 4, 6 * T - 7))
        amb = (.50, .54, .68)
    elif zone == 'catacombs':
        for cx in (2 * T + 16, 7 * T + 16, 11 * T + 16):
            put(im, torch(), cx - 3, T + 4); emit.append(('flame', cx - 3, T - 7)); lights.append((cx, T + 2, 140, (255, 170, 80), .95))
        for cx in (3 * T + 32, 9 * T + 32):   # skull candles on top of the ossuary blocks
            prop(skull_candle(), cx, 5 * T + 4); emit.append(('candle', cx - 1, 5 * T - 8)); lights.append((cx, 5 * T - 6, 70, (255, 190, 110), .7))
        prop(skull_pile(), 1 * T + 14, 2 * T + 28, (9, 3)); prop(skull_pile(), 12 * T + 14, 6 * T + 28, (9, 3))
        prop(motifs.borne(21), 2 * T + 10, 7 * T + 22, (7, 2)); prop(sack(), 12 * T + 10, 3 * T + 4, (6, 2)); prop(sack(), 12 * T + 22, 3 * T + 10, (6, 2))
        prop(skull_candle(), 6 * T + 4, 7 * T + 20); emit.append(('candle', 6 * T + 3, 7 * T + 8)); lights.append((6 * T + 4, 7 * T + 10, 64, (255, 190, 110), .7))
        amb = (.56, .50, .48)
    else:
        LVC = (255, 110, 40)
        for (bx, by, rx, ry) in lava.BLOBS: lights.append((bx, by, rx + 70, LVC, 1.0))
        for (cx, foot, s) in ((2 * T + 10, 3 * T + 4, 1), (12 * T + 4, 4 * T + 30, 2), (4 * T + 20, 7 * T + 26, 3), (11 * T + 10, 2 * T + 30, 4)):
            c = crystal(s); prop(c, cx, foot, (6, 2)); sprites[-1]['glow'] = 2; lights.append((cx, foot - 10, 80, (170, 110, 255), .9))
        for (cx, foot, s) in ((7 * T + 8, 5 * T + 2, 3), (2 * T + 2, 4 * T + 8, 5)):
            c = crystal_big(s); prop(c, cx, foot, (11, 3)); sprites[-1]['glow'] = 2; lights.append((cx, foot - 16, 90, (170, 110, 255), .7))
        prop(stalagmite(0), 3 * T + 16, 4 * T + 10, (10, 3)); prop(stalagmite(1), 9 * T + 8, 3 * T + 20, (10, 3)); prop(stalagmite(2), 12 * T + 18, 6 * T + 8, (10, 3))
        for (cx, foot) in ((1 * T + 22, 5 * T + 20), (7 * T + 4, 2 * T + 20), (12 * T + 2, 3 * T + 12)):
            m = mushrooms(); prop(m, cx, foot); sprites[-1]['glow'] = 1; lights.append((cx, foot - 4, 46, (90, 230, 200), .6))
        lights.append((8 * T + 16, T + 8, 70, (190, 120, 255), .8))
        amb = (.40, .37, .48)
    sh = Image.new('RGBA', im.size); d = ImageDraw.Draw(sh)
    for s in sprites:
        if s['shadow']:
            rx, ry = s['shadow']; d.ellipse((s['cx'] - rx, s['foot'] - ry - 1, s['cx'] + rx, s['foot'] + ry - 1), fill=(4, 2, 8, 130))
    im.alpha_composite(sh)
    over = []   # lava is rendered live by the page now
    pal.PAL[:] = SAVED
    return im, sprites, lights, emit, glow, over, amb, water
