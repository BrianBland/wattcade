"""Round 19: more enemies at the round-17 standard. Lost Rider (skeleton in a rotted team kit) and CO2 Gremlin (imp with a CO2 cartridge bomb)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from chars import grid, outline, hx, C, flash
from PIL import Image

LK = {
    'O': C(11), 'B': C(10), 'b': C(9), 'o': C(7), 'x': C(0), 'r': C(21), 'R': hx('#ff8a7a'),
    'Y': C(24), 'y': C(23), 'g': C(22), 'v': C(3),
    'T': hx('#5e8a3a'), 't': hx('#3e6a2a'), 'u': hx('#2e4a26'), 'W': C(9),
    'k': C(3), 'K': C(5), 'n': C(1),
}
LR_HEAD = [
    ".....gyYYyg.....",
    "....gyYvYYyg....",
    "...gyYYvYvYyg...",
    "...ggyyyyyyygg..",
    "...oBOOBBBBbo...",
    "...BOxxxBxxxbo..",
    "...BxxrxBxrxbo..",
    "...obxxBBBxxbo..",
    "....obBxxBBbo...",
]
LR_JAW = {0: ["....oBxBxBxbo...", ".....obbbbbo...."], 1: ["....oxxxxxxxo...", "....oBxBxBxbo...", ".....obbbbo....."]}
LR_BODY = [
    "...OTTTWTTTtb...",
    "...bTTbBBbTtt...",
    "...bTTbbbbTtu...",
    "...oTtbBBbtuo...",
    "...B.Ttbbtu.b...",
    "...b..t.u.t.o...",
    "......bOOb......",
]
def lost_rider(fr=0):
    """a fallen rider still riding: cracked yellow helmet, rotted green team jersey torn over the ribs, red pinprick eyes"""
    im = Image.new('RGBA', (32, 32)); bob = fr % 2
    legs = [["....bB...Bb.....", "....bB...Bb.....", "....oB...Bo.....", "....bB...Bb.....", "...kKk...kKk....", "...nnn...nnn...."],
            ["....bB...Bb.....", "....bB...Bb.....", "....oB....Bo....", "....bB....Bb....", "...kKk....kKk...", "...nnn.........."]][fr % 2]
    grid(legs, key=LK, at=(8, 23), img=im)
    up = Image.new('RGBA', (32, 32))
    grid(LR_BODY, key=LK, at=(8, 15), img=up)
    sw = [0, 1][fr % 2]
    grid(["B", "b", "o", "b", "O"], key=LK, at=(10, 16 + sw), img=up); grid(["b", "o", "b", "o", "b"], key=LK, at=(21, 16 + 1 - sw), img=up)
    grid(["oO", "Bb"], key=LK, at=(9 + 0, 21 + sw), img=up); grid(["bo", "ob"], key=LK, at=(21, 21 + 1 - sw), img=up)   # bony hands
    grid(LR_HEAD + LR_JAW[fr % 2], key=LK, at=(8, 2), img=up)
    im.alpha_composite(up, (0, -bob))
    return outline(im)

GK = {
    'S': hx('#9ab0a8'), 's': hx('#6a8a84'), 'z': hx('#41605e'), 'Z': hx('#25393a'),
    'e': hx('#ffe08a'), 'E': hx('#f0b030'), 'x': C(0), 'w': C(11), 'm': hx('#7a1a20'),
    'M': C(10), 'N': C(8), 'n': C(6), 'q': C(4), 'Q': C(24), 'q2': C(22), 'f': hx('#e8f6ff'), 'F': hx('#a6d0ff'),
}
GR_BODY = [
    "z...............z",
    "Sz.............zs",
    "sSz...zSSSz...zsz",
    ".sSzzzSSSSSzzzsz.",
    "..zSSSSSSSSSSsz..",
    "...SSexSSSexSsz..",
    "...SeEeSSSeEeSz..",
    "...SSSSSSSSSSsz..",
    "...zSmwmwmwmsz...",
    "....zSmmmmmsz....",
    "....zsSSSSssz....",
    "...zsSSsSsSssz...",
    "...zsSSssssssz...",
    "....zssssssz.....",
    "....zz....zz.....",
    "...Zzz....zZZ....",
]
def co2_canister(frost=True):
    rows = ["..QQ..", ".NMMN.", "NMMMNn", "NMMMNn", "NMMMNn", "NMMMNn", "NMMMNn", ".nNNn."]
    k = dict(GK); im = grid(rows, key=k, w=6, h=8)
    if frost:
        p = im.load(); p[1, 3] = GK['f']; p[1, 5] = GK['F']; p[2, 6] = GK['f']
    return im
def co2_gremlin(fr=0):
    """big-eared imp that lobs CO2 cartridges: 0-1 idle hop, 2 wind-up with the cartridge overhead"""
    im = Image.new('RGBA', (32, 32)); up = [0, 1, 0][fr % 3]
    body = Image.new('RGBA', (32, 32)); grid(GR_BODY, key=GK, at=(7, 12 - up), img=body)
    if fr % 3 == 2:   # wind-up: arms raised, canister overhead, eyes narrowed
        p = body.load()
        for x in range(10, 24):
            for y in range(16, 20):
                if p[x, y][:3] in (GK['e'][:3], GK['E'][:3]): p[x, y] = GK['S']
        grid(["xxx....xxx"], key=GK, at=(11, 17), img=body)
        grid(["s.......s", "S.......S", "S.......S"], key=GK, at=(11, 9), img=body)
        body.alpha_composite(co2_canister(), (13, 3))
    else:
        grid(["S", "s", "S"], key=GK, at=(9, 22 - up), img=body); grid(["s", "z", "s"], key=GK, at=(23, 22 - up), img=body)
        body.alpha_composite(co2_canister(), (22, 19 - up)); grid(["SS", "sz"], key=GK, at=(21, 22 - up), img=body)   # fist round the cartridge
    im.alpha_composite(body)
    return outline(im)

if __name__ == '__main__':
    rows = [[lost_rider(0), lost_rider(1), flash(lost_rider(0))], [co2_gremlin(0), co2_gremlin(1), co2_gremlin(2), flash(co2_gremlin(0))]]
    o = Image.new('RGBA', (4 * 34 + 2, 2 * 34 + 2), C(3))
    for r, row in enumerate(rows):
        for c, im in enumerate(row): o.alpha_composite(im, (2 + c * 34, 2 + r * 34))
    o.resize((o.width * 6, o.height * 6), Image.NEAREST).save('/tmp/claude-0/px/r17/enemies2.png')
