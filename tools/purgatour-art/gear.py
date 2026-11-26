"""Gear for the round-17 hero, drawn for the new body: overlays per facing (front d, side r, back u), in the master palette.
Stance outfits: Vanguard (red tabard, steel pauldrons), Ranger (green hood and short cape), Skirmisher (yellow scarf, leather harness),
Arcanist (violet hood and robe, gold sash). Slots: helm, armour (mail / plate), boots, buckler, held weapon."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image
import chars as CH
from chars import grid, outline, hx, KEY, leg, F_BODY, F_HEAD, F_ARM_L, F_ARM_R, R_HEAD, R_BODY, R_ARM, R_LEGS, U_HEAD, U_BODY
from pal import C

G = dict(KEY)
G.update({
    # steel
    'A': C(11), 'B': C(9), 'b': C(7), 'Z': C(5), 'z': C(4),
    # gold trim
    'Y': C(24), 'y': C(23), 'g': C(22),
    # red tabard
    'T': C(21), 't': C(20), 'u': C(19),
    # ranger green
    'F': hx('#8ab858'), 'f': hx('#5e8a3a'), 'o': hx('#2e4a26'), 'O': hx('#1c2e18'),
    # arcanist violet
    'P': hx('#b48ae6'), 'p': hx('#8a5ac8'), 'i': hx('#5e3490'), 'I': hx('#3a1f5e'),
    # leather
    'l': C(16), 'L': C(15), 'a': C(14), 'X': C(13),
    # scarf
    '1': C(25), '2': C(24), '3': C(23),
})

# ------------------------------------------------------------------ head overlays (16 wide, drawn at (8, 3)); hats replace the cap
HEAD = {
 'helm': {
  'd': ["....bBBBBBb.....", "...bBAAABBBb....", "..bBAABBBBBbZ...", "..bBABBBBBBbZ...", "..ZbbbbbbbbbZZ..", ".ZbYyyyyyyyybZz.",
        "..Z.........Z...", "..Z.........Z...", "..Z.........Z...", "..z.........z..."],
  'r': ["....bBBBBb......", "...bBAAABBb.....", "..bBAABBBBBb....", "..bBABBBBBBbZ...", "..ZbbbbbbbbbbZ..", ".ZbYyyyyyyyyybZz",
        "..Zb............", "..ZZ............", "..zZ............", "...z............"],
  'u': ["....bBBBBBb.....", "...bBAABBBBb....", "..bBABBBBBBbZ...", "..bBBBBBBBBbZ...", "..ZbbbbbbbbbZZ..", ".ZbYyyyyyyyybZz.",
        "..ZbBBBBBBBbZ...", "..ZbBBBBBBbbZ...", "..zZbbbbbbbZz...", "...zZZZZZZZz...."],
 },
 'hood_g': {
  'd': [".....ofFFfo.....", "....ofFFFFfo....", "...ofFFFFFFfoO..", "..ofFFFFFFFFfoO.", "..ofFFffffFFfoO.", "..of........ooO.",
        "..o..........oO.", "..o..........oO.", "..o..........oO.", "..oo........ooO.", "...oo......ooO..", "....ooo..oooO...", "......OOOO......"],
  'r': [".....ofFFfo.....", "....ofFFFFFfo...", "...ofFFFFFFFfo..", "..ofFFFFFFFFffo.", "..ofFFFFffffffo.", "..ofFFFo........",
        "..ofFFo.........", "..ofFFo.........", "..ofFfo.........", "..offo..........", "..ooo...........", "..oO............", "..O............."],
  'u': [".....ofFFfo.....", "....ofFFFFfo....", "...ofFFFFFFfoO..", "..ofFFFFFFFFfoO.", "..ofFFFFFFFFfoO.", "..ofFFFFFFFFfoO.",
        "..ofFFFFFFFFfoO.", "..offFFFFFFffoO.", "..offFFFFFFffoO.", "..ooffffffffooO.", "...oooffffoooO..", "....oooooooO....", "......OOOO......"],
 },
}
HEAD['hood_p'] = {f: [r.translate(str.maketrans('Ffo O', 'PpiI ')).replace('O', 'I') for r in rows] for f, rows in HEAD['hood_g'].items()}
# the hood's own inner shadow covers the hair: draw the face again inside it (front only)

# ------------------------------------------------------------------ body overlays (drawn at (8, 15) for d/u, (7, 15) for r)
BODY = {
 'tabard': {   # Vanguard: red tabard with gold trim over the jersey, steel pauldrons
  'd': ["..BAB.TTTt.BbZ..", "..ZbZ.TYTt.ZZz..", "......TYYt......", "......TTYt......", "......TTTt......", "......TTTt......", "......yYYg......"],
  'r': ["....BAAB........", "....ZbbZ.TT.....", ".........TT.....", ".........Tt.....", ".........Tt.....", ".........Tt.....", ".........yg....."],
  'u': ["..BAB.TTTt.BbZ..", "..ZbZ.TTTt.ZZz..", "......TTTt......", "......TYYt......", "......TTTt......", "......TTTt......", "......yYYg......"],
 },
 'cape_g': {   # Ranger: a short cape over the shoulders
  'd': ["...oF.....fo....", "...of.....oo....", "...o.......o....", ".......Y........", "................", "................", "................"],
  'r': ["....ofFFo.......", "...ofFFFo.......", "...ofFFo........", "...offFo........", "...offo.........", "...ooo..........", "................"],
  'u': ["...ofFFFFFfo....", "...ofFFFFFfo....", "...ofFFFFFfo....", "...offFFFffo....", "...offfffffo....", "...oofffffoo....", "....ooooooo....."],
 },
 'scarf': {   # Skirmisher: yellow scarf, leather harness strap
  'd': ["....1222223.....", "....312223l.....", "......32.la.....", ".......3.a......", "........l.......", ".......la.......", "................"],
  'r': ["....1222223.....", ".122223..la.....", "123.33...la.....", "3........la.....", "........la......", "................", "................"],
  'u': ["....1222223.....", "....3322233.....", ".....l322a......", "......l33.......", ".......la.......", "......la........", "................"],
 },
 'robe': {     # Arcanist: violet mantle and robe skirt, gold sash
  'd': ["...iPPppppPi....", "...iPppppppi....", "....ippppppI....", "....YYYYYYYy....", "....ipppppiI....", "...ippppppppI...", "...ipppppppiI..."],
  'r': ["....iPPppi......", "....iPpppi......", ".....ipppi......", ".....YYYYy......", ".....ippppi.....", ".....ipppppi....", "....ipppppiI...."],
  'u': ["...iPPppppPi....", "...iPppppppi....", "....ippppppI....", "....YYYYYYYy....", "....ipppppiI....", "...ippppppppI...", "...ipppppppiI..."],
 },
}
ROBE_LEGS = {   # robe hem over the legs (rows 22..25)
  'd': ["...ipppppppiI...", "...ippppppppI...", "...IiiiiiiiiI...", "................"],
  'r': ["....ipppppiI....", "....ippppppiI...", "....IiiiiiiiI...", "................"],
  'u': ["...ipppppppiI...", "...ippppppppI...", "...IiiiiiiiiI...", "................"],
}
BUCKLER = {   # small round shield on the off arm
  'd': ["..bBBb..", ".bBYYBZ.", ".BYAyYBz", ".BYyyYBz", ".ZBYYBZz", "..ZZZZz."],
  'r': ["..ZZ..", ".ZbbZ.", ".ZbbZ.", "..ZZ.."],   # seen edge-on behind the body
  'u': ["..bBBb..", ".bZZZZb.", ".BZaaZBz", ".BZaaZBz", ".ZBZZBZz", "..ZZZZz."],
}

ARMOR_COLS = {'mail': [C(9), C(7), C(6), C(5)], 'plate': [C(11), C(9), C(7), C(5)]}
JERSEY = {KEY[k][:3] for k in 'jJqWwvRr'}

def armor(img, kind, region):
    """repaint the jersey inside region as mail rings or plate"""
    px = img.load(); x0, y0, x1, y1 = region; cols = ARMOR_COLS[kind]
    for y in range(y0, y1):
        for x in range(x0, x1):
            if px[x, y][3] and px[x, y][:3] in JERSEY:
                lit = x < (x0 + x1) // 2 - 1
                if kind == 'mail': c = cols[(0 if lit else 1) + ((x + y) % 2)]
                else:
                    c = cols[0 if (y == y0) else 1 if lit else 2]
                    if y in (y0 + 3, y0 + 6) or x == (x0 + x1) // 2: c = cols[3]
                px[x, y] = c

def boots_key(kind):
    k = dict(G)
    if kind == 'boots': k.update({'W': C(16), 'v': C(14), 'N': C(15), 'n': C(13)})
    if kind == 'greaves': k.update({'W': C(9), 'v': C(7), 'N': C(8), 'n': C(5), 'S': C(9), 's': C(7), 'd': C(6)})
    return k

def hero_geared(f, fr=0, stance=None, helm=False, armour=None, boots=None, buckler=False, weapon=None):
    im = Image.new('RGBA', (32, 32)); bob = 1 if fr in (1, 3) else 0
    lk = boots_key(boots)
    up = Image.new('RGBA', (32, 32))
    hood = {'ranger': 'hood_g', 'arcanist': 'hood_p'}.get(stance)
    if f in 'du':
        ll = 1 if fr == 1 else 0; rl = 1 if fr == 3 else 0
        for i, r in enumerate(leg(0)):
            if not (ll and i == 6): grid([r], key=lk, at=(12, 22 + i - (ll if i >= 5 else 0)), img=im)
            if not (rl and i == 6): grid([r], key=lk, at=(17, 22 + i - (rl if i >= 5 else 0)), img=im)
        if stance == 'ranger' and f == 'u': grid(BODY['cape_g']['u'], key=G, at=(8, 15), img=up)
        grid(F_BODY if f == 'd' else U_BODY, key=G, at=(8, 15), img=up)
        sw = [0, 1, 0, -1][fr] * (1 if f == 'd' else -1)
        grid(F_ARM_L, key=G, at=(10, 16 + max(0, sw)), img=up); grid(F_ARM_R, key=G, at=(20, 16 + max(0, -sw)), img=up)
        if armour: armor(up, armour, (10, 15, 22, 22))
        if stance and stance != 'ranger' or (stance == 'ranger' and f == 'd'):
            key = {'vanguard': 'tabard', 'ranger': 'cape_g', 'skirmisher': 'scarf', 'arcanist': 'robe'}[stance]
            grid(BODY[key][f], key=G, at=(8, 15), img=up)
        if stance == 'arcanist': grid(ROBE_LEGS[f], key=G, at=(8, 22), img=up)
        head = F_HEAD if f == 'd' else U_HEAD
        if hood: grid(head[6:], key=G, at=(8, 9), img=up); grid(HEAD[hood][f], key=G, at=(8, 3), img=up)
        elif helm: grid(head[5:], key=G, at=(8, 8), img=up); grid(HEAD['helm'][f], key=G, at=(8, 3), img=up)
        else: grid(head, key=G, at=(8, 3), img=up)
        if hood and f == 'd': grid(F_HEAD[6:12], key=G, at=(8, 9), img=up); grid(HEAD[hood]['d'][6:12], key=G, at=(8, 9), img=up)
        if buckler: grid(BUCKLER[f], key=G, at=(20 if f == 'd' else 5, 17), img=up)
    else:
        grid(R_LEGS[fr], key=lk, at=(7, 22), img=im)
        if buckler: grid(BUCKLER['r'], key=G, at=(9, 17), img=up)
        if stance == 'ranger': grid(BODY['cape_g']['r'], key=G, at=(5, 15), img=up)
        grid(R_BODY, key=G, at=(7, 15), img=up)
        if armour: armor(up, armour, (11, 15, 19, 22))
        if stance and stance != 'ranger':
            key = {'vanguard': 'tabard', 'skirmisher': 'scarf', 'arcanist': 'robe'}[stance]
            grid(BODY[key]['r'], key=G, at=(7, 15), img=up)
        if stance == 'arcanist': grid(ROBE_LEGS['r'], key=G, at=(7, 22), img=up)
        if hood: grid(R_HEAD[5:], key=G, at=(7, 8), img=up); grid(HEAD[hood]['r'], key=G, at=(7, 3), img=up)
        elif helm: grid(R_HEAD[5:], key=G, at=(7, 8), img=up); grid(HEAD['helm']['r'], key=G, at=(7, 3), img=up)
        else: grid(R_HEAD, key=G, at=(7, 3), img=up)
        sw = [-2, 0, 2, 0][fr]
        arm = Image.new('RGBA', (32, 32)); grid(R_ARM, key=G, at=(14 + sw, 16), img=arm)
        if armour: armor(arm, armour, (0, 15, 32, 18))
        if weapon is not None:   # held weapon in the near hand, grip on the hand
            w, (gx, gy) = weapon
            arm.alpha_composite(w, (max(0, 15 + sw - gx), max(0, 20 - gy)))
        up.alpha_composite(arm)
    im.alpha_composite(up, (0, -bob))
    im = outline(im)
    return CH.nudge(im, 1) if f == 'r' else im

STANCES = {
    'Scout (no gear)': dict(),
    'Vanguard': dict(stance='vanguard', helm=True, armour='plate', boots='greaves', buckler=True, wpn='axe'),
    'Ranger': dict(stance='ranger', armour='mail', boots='boots', wpn='arrow'),
    'Skirmisher': dict(stance='skirmisher', boots='boots', buckler=True, wpn='knife'),
    'Arcanist': dict(stance='arcanist', wpn='bolt'),
}

if __name__ == '__main__':
    import arsenal as AR
    S = 34; rows = []
    for name, g in STANCES.items():
        g = dict(g); wn = g.pop('wpn', None)
        wp = AR.held(wn, 'fire') if wn else None
        rows.append([hero_geared(f, 0, **g, weapon=wp if f == 'r' else None) for f in 'dru'] + [hero_geared('r', 1, **g, weapon=wp), hero_geared('r', 2, **g, weapon=wp)])
    o = Image.new('RGBA', (5 * S + 2, len(rows) * S + 2), C(3))
    for r, row in enumerate(rows):
        for c, im in enumerate(row): o.alpha_composite(im, (2 + c * S, 2 + r * S))
    o.resize((o.width * 5, o.height * 5), Image.NEAREST).save('/tmp/claude-0/px/r17/gear.png')
    o.save('/tmp/claude-0/px/r17/gear1x.png')
