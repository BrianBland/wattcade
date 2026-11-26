import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit2 import *

TROLL = R('#262b38', '#434b5e', '#677288', '#95a0b4')
OVER = R('#4a200e', '#7a3818', '#b05a26', '#e08a42')
TUSK = R('#8f8489', '#cfc4b8', '#f1e8d6', '#ffffff')
def wrench(cv, x0, y0, x1, y1):
    """a big adjustable wrench: steel handle, open jaw at (x1, y1)"""
    cv.rod(x0, y0, x1, y1, STEEL, 4)
    L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / L, (y1 - y0) / L; px_, py_ = -uy, ux
    head = [(x1 + px_ * 6 - ux * 3, y1 + py_ * 6 - uy * 3), (x1 + px_ * 6 + ux * 5, y1 + py_ * 6 + uy * 5), (x1 + px_ * 2 + ux * 5, y1 + py_ * 2 + uy * 5),
            (x1 + px_ * 2 + ux * 1, y1 + py_ * 2 + uy * 1), (x1 - px_ * 2 + ux * 1, y1 - py_ * 2 + uy * 1), (x1 - px_ * 2 + ux * 5, y1 - py_ * 2 + uy * 5),
            (x1 - px_ * 6 + ux * 5, y1 - py_ * 6 + uy * 5), (x1 - px_ * 6 - ux * 3, y1 - py_ * 6 - uy * 3)]
    cv.poly(head, STEEL, 1)
    for i in range(3): cv.set(x0 + (x1 - x0) * (.55 + i * .06), y0 + (y1 - y0) * (.55 + i * .06), STEEL[0])   # adjuster knurl
    cv.set(x0 + ux, y0 + uy, STEEL[3])

def wrench_troll(fr=0, atk=False):
    """Wrench Troll (brute, 48 px): hulking stone-blue troll in rust overalls, tusks, a workshop wrench on its shoulder; wind-up raises it overhead"""
    cv = Cv(48, 48); b = [0, 1][fr % 2]
    # legs
    for lx, lift in ((16, fr % 2), (28, 1 - fr % 2)):
        cv.poly([(lx, 34), (lx + 7, 34), (lx + 7, 44 - lift), (lx - 1, 44 - lift)], OVER, 1)
        cv.poly([(lx - 2, 43 - lift), (lx + 8, 43 - lift), (lx + 8, 46 - lift), (lx - 2, 46 - lift)], DARK, 2)
    # torso and belly
    cv.ell(24, 26 + b, 15, 12, TROLL)
    cv.poly([(13, 26 + b), (35, 26 + b), (34, 37 + b), (14, 37 + b)], OVER, 1)        # overall bib
    for x in (17, 31): cv.line(x, 15 + b, x, 26 + b, OVER[0], 2)                      # straps
    cv.set(17, 26 + b, GOLD[2]); cv.set(31, 26 + b, GOLD[2]); cv.set(24, 30 + b, OVER[3]); cv.line(20, 31 + b, 28, 31 + b, OVER[0])
    if atk: wrench(cv, 8, 9 + b, 37, 3)   # raised overhead, behind the head
    # head: small, low-slung, big nose and tusks
    cv.ell(24, 13 + b, 8, 7, TROLL)
    cv.ell(24, 15 + b, 3, 2.4, TROLL)
    for (x, y) in ((20, 11), (27, 11)): cv.set(x, y + b, C(0)); cv.set(x + 1, y + b, C(0)); cv.set(x, y + b, EYE_E if atk else C(21))
    cv.line(19, 9 + b, 22, 10 + b, TROLL[0]); cv.line(26, 10 + b, 29, 9 + b, TROLL[0])   # heavy brows
    cv.line(20, 18 + b, 28, 18 + b, C(0))
    for x in (20, 27): cv.set(x, 17 + b, TUSK[2]); cv.set(x, 16 + b, TUSK[3])
    cv.ell(16, 7 + b, 2, 3, TROLL); cv.ell(32, 7 + b, 2, 3, TROLL)                 # ear tufts / horns
    # arms and the wrench
    if atk:
        cv.ell(11, 16 + b, 4, 6, TROLL); cv.ell(37, 16 + b, 4, 6, TROLL)
        cv.ell(12, 9 + b, 3, 3, TROLL); cv.ell(36, 9 + b, 3, 3, TROLL)
    else:
        cv.ell(10, 27 + b, 4, 7, TROLL); cv.ell(38, 25 + b, 4, 7, TROLL)
        wrench(cv, 38, 32 + b, 42, 6 + b)
        cv.ell(38, 32 + b, 3, 3, TROLL); cv.ell(10, 34 + b, 3, 3, TROLL)
    return cv.done()

COAT = R('#1a1222', '#2e2140', '#4a3664', '#6e5490')
SKIN = R('#a8653a', '#d8975f', '#f0c49a', '#ffe0c0')
def directeur(fr=0, atk=False):
    """Directeur Sportif (summoner): team boss in a long violet team coat with a gold sash, slicked hair, mirrored shades,
    a megaphone that calls riders back from the dead; wind-up raises it and blasts rings"""
    cv = Cv(32, 32); b = fr % 2
    cv.poly([(10, 14 + b), (22, 14 + b), (25, 29), (7, 29)], COAT, 1)                      # long coat
    cv.line(16, 15 + b, 16, 28, COAT[0])
    cv.line(11, 15 + b, 21, 23 + b, GOLD[2], 2)                                              # sash
    for x in (10, 13, 19, 22): cv.set(x, 29, DARK[1]); cv.set(x, 30, DARK[0])               # shoes under the hem
    cv.ell(16, 9 + b, 5, 5.5, SKIN)                                                          # head
    cv.poly([(11, 5 + b), (16, 3 + b), (21, 4 + b), (21, 7 + b), (12, 7 + b), (11, 9 + b)], [C(5), C(7), C(9), C(10)], 1)   # slicked silver hair
    cv.line(17, 4 + b, 20, 5 + b, C(10))
    cv.line(12, 9 + b, 20, 9 + b, C(0)); cv.line(12, 10 + b, 15, 10 + b, C(0)); cv.line(17, 10 + b, 20, 10 + b, C(0))
    cv.set(13, 9 + b, C(29)); cv.set(18, 9 + b, C(29))   # mirrored shades with a glint
    cv.line(14, 12 + b, 17, 12 + b, SKIN[0])
    if atk:
        cv.rod(21, 17 + b, 24, 9 + b, COAT, 3)
        cv.poly([(22, 8 + b), (26, 2 + b), (30, 6 + b), (25, 10 + b)], [C(9), C(10), C(11), C(11)], 1)   # megaphone up
        for i, r in enumerate((3, 5)):
            for a in range(-60, 61, 20):
                cv.set(28 + math.cos(math.radians(a - 45)) * (r + 2), 4 + b + math.sin(math.radians(a - 45)) * (r + 2), C(21) if i else hx('#ff8a7a'))
    else:
        cv.rod(21, 17 + b, 24, 21 + b, COAT, 3)
        cv.poly([(22, 20 + b), (28, 18 + b), (29, 23 + b), (23, 23 + b)], [C(9), C(10), C(11), C(11)], 1)  # megaphone at the hip
    cv.rod(11, 17 + b, 9, 23 + b, COAT, 3); cv.set(9, 24 + b, SKIN[1])
    return cv.done()

if __name__ == '__main__':
    from PIL import Image
    ims = [wrench_troll(0), wrench_troll(1), wrench_troll(0, True), flash(wrench_troll(0))]
    ims2 = [directeur(0), directeur(1), directeur(0, True), flash(directeur(0))]
    o = Image.new('RGBA', (4 * 50 + 2, 50 + 36), C(3))
    for i, im in enumerate(ims): o.alpha_composite(im, (2 + i * 50, 2))
    for i, im in enumerate(ims2): o.alpha_composite(im, (2 + i * 50, 52))
    o.resize((o.width * 5, o.height * 5), Image.NEAREST).save('/tmp/claude-0/px/r20/en3.png')
