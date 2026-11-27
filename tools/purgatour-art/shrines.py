import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit2 import *
from bosses import chainring, spoked_wheel
FIRE = [C(22), C(23), C(24), C(25)]
HELM = R('#1c3c6a', '#3a78c8', '#8ac4ff', '#e8f6ff')
def plinth(cv):
    cv.poly([(8, 30), (24, 30), (26, 39), (6, 39)], STEEL, 1); cv.poly([(10, 26), (22, 26), (22, 30), (10, 30)], STEEL, 2)
    cv.line(9, 34, 23, 34, STEEL[0])

def shrine(kind, fr=0, lit=1.0):
    """relic on a plinth, 32x40, 4 frames of rotation"""
    cv = Cv(32, 40); plinth(cv); a = fr * math.pi / 4; bob = [0, -1, -1, 0][fr % 4]
    if kind == 'fury':
        for k in range(5):   # flame tongues licking up around the ring
            fx = 8 + k * 4; hgt = 6 + ((k * 3 + fr) % 4) * 2
            cv.poly([(fx - 2, 16 + bob), (fx + 2, 16 + bob), (fx + (1 if (k + fr) % 2 else -1), 16 + bob - hgt)], [RED[1], RED[2], FIRE[2], FIRE[3]], 1)
        chainring(cv, 16, 16 + bob, 7, [C(5), C(7), C(9), C(11)], 10, hole=.62)
        cv.ell(16, 16 + bob, 3, 3, [FIRE[1], FIRE[2], FIRE[3], FIRE[3]])
    elif kind == 'endurance':   # the helmet turns: front, 3/4, side, 3/4
        w = [9, 8, 6, 8][fr % 4]; cy = 15 + bob
        cv.ell(16, cy, w, 7, HELM)
        cv.line(16 - w, cy + 4, 16 + w, cy + 4, HELM[0])
        for k in range(-1, 2):
            vx = 16 + k * (w // 3) + [0, 1, 3, -1][fr % 4]
            cv.line(vx, cy - 5, vx, cy + 2, HELM[0])     # vents
        cv.line(16 - w + 1, cy - 2, 16 - w + 3, cy - 5, HELM[3])
        if fr % 4 == 2: cv.poly([(20, cy + 1), (25, cy + 3), (20, cy + 4)], HELM, 1)   # visor peak in profile
    elif kind == 'sprint':      # stopwatch, hand ticking round, sparks
        cv.ell(16, 16 + bob, 8, 8, STEEL); cv.ell(16, 16 + bob, 6, 6, [C(9), C(10), C(11), C(11)], spec=False)
        cv.rect = None
        cv.line(15, 6 + bob, 17, 6 + bob, STEEL[2], 2); cv.set(16, 4 + bob, STEEL[3])
        cv.line(16, 16 + bob, 16 + math.cos(a - math.pi / 2) * 5, 16 + bob + math.sin(a - math.pi / 2) * 5, RED[1])
        cv.set(16, 16 + bob, C(0))
        for (x, y) in ((4, 10), (27, 12), (6, 22)):
            if (x + fr) % 2: cv.line(x, y + bob, x + 2, y + 2 + bob, GOLD[3]); cv.set(x + 1, y + 3 + bob, GOLD[2])
    elif kind == 'whirl':
        spoked_wheel(cv, 16, 15 + bob, 10)
        for k in range(3):
            ang = a * 2 + k * 2.1
            cv.set(16 + math.cos(ang) * 13, 15 + bob + math.sin(ang) * 13, HELM[3])
    # rune on the plinth glows with the shrine colour
    col = {'fury': FIRE[3], 'endurance': HELM[3], 'sprint': GOLD[3], 'whirl': HELM[2]}[kind]
    cv.line(14, 32, 18, 32, col)
    return cv.done()

# curse sigils, 12x12, single colour plus dark
SIG = {
 'frenzy':  ["....x.......", "...xx..x....", "..xxx.xx....", ".xxxxxxx....", "xxxxxxxxxxxx", ".xxxxxxx....", "..xxx.xx....", "...xx..x....", "....x.......", "............", "............", "............"],
 'hexed':   ["....xxxx....", "..xx....xx..", ".x..x..x..x.", ".x...xx...x.", "x...x..x...x", "x..x....x..x", "x..x....x..x", "x...x..x...x", ".x...xx...x.", ".x..x..x..x.", "..xx....xx..", "....xxxx...."],
 'swarm':   ["x....x....x.", ".x..x.x..x..", "..xx...xx...", "............", ".x....x....x", "x.x..x.x..x.", "............", "..x....x....", ".x.x..x.x...", "............", "x....x....x.", ".x..x.x..x.."],
 'darkness':["....xxxx....", "..xxxxxxxx..", ".xxx....xxx.", "xxx......xxx", "xx...xx...xx", "xx..xxxx..xx", "xx...xx...xx", "xxx......xxx", ".xxx....xxx.", "..xxxxxxxx..", "....xxxx....", "............"],
 'mire':    ["............", "xxxx........", "......xxxxx.", "..xxxxx.....", "............", "xxxxxx......", ".......xxxx.", "...xxxx.....", "............", "xxxxx.......", "......xxxxxx", "............"],
 'fragile': ["....xx......", "...x..x.....", "...xxxx.....", "..x....x....", "..x....x....", "..x.xx.x....", "..x....x....", "..x.xx.x....", "..x....x....", "..xxxxxx....", "............", "............"],
 'bulwark': ["xxxxxxxxxxxx", "x....xx....x", "x.xx.xx.xx.x", "x....xx....x", "xxxxxxxxxxxx", "x....xx....x", ".x...xx...x.", "..x..xx..x..", "...x.xx.x...", "....xxxx....", ".....xx.....", "............"],
}
def sigil(kind, col):
    im = Image.new('RGBA', (12, 12)); p = im.load()
    for y, r in enumerate(SIG[kind]):
        for x, ch in enumerate(r):
            if ch == 'x': p[x, y] = hx(col)
    return outline(im)

if __name__ == '__main__':
    o = Image.new('RGBA', (4 * 36 + 4, 4 * 44 + 20), C(3))
    for r, k in enumerate(('fury', 'endurance', 'sprint', 'whirl')):
        for f in range(4): o.alpha_composite(shrine(k, f), (4 + f * 36, 4 + r * 44))
    cols = dict(frenzy='#ff5a5a', hexed='#c05aff', swarm='#ffb02a', darkness='#6a6aff', mire='#7a9a3a', fragile='#ff6b8a', bulwark='#9aa3b5')
    for i, (k, c) in enumerate(cols.items()): o.alpha_composite(sigil(k, c), (4 + i * 20, 4 * 44 + 4))
    o.resize((o.width * 4, o.height * 4), Image.NEAREST).save('/tmp/claude-0/px/r20/shrines.png')
