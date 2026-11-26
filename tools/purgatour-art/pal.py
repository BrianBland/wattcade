"""Purgatour master palette (32 colours) and drawing helpers for the hand-built slice.

Rules
- Every pixel comes from PAL. No gradients, no noise fields: shading is flat tones plus deliberate clusters.
- Light comes from the top-left: top and left edges one step lighter, bottom and right one step darker.
- Value hierarchy: floor darkest and calmest (PAL 2-5), walls a clear step lighter and warmer (4-9),
  props mid to light, characters brightest and outlined.
- Environment art is not outlined; props get a dark selective outline on their lower/right sides only; characters get full outlines.
"""
from PIL import Image, ImageDraw

HEX = [
    # 0-11 neutral ramp: cool violet shadows -> warm light stone
    '#0b0910', '#15121c', '#1f1a28', '#2b2535', '#3a3243', '#4b4252', '#5e5462', '#756a74', '#8f8489', '#aba09c', '#cfc4b8', '#f1e8d6',
    # 12-17 wood / leather
    '#2a1810', '#46281a', '#683c24', '#8c5530', '#b07340', '#d49a5a',
    # 18-21 red cloth
    '#3a0e16', '#64161f', '#922430', '#c23a3a',
    # 22-25 gold / flame
    '#7a4a12', '#c07a1c', '#f0b030', '#ffe08a',
    # 26-29 water / cool steel
    '#121a2a', '#1e3048', '#36557a', '#6a93b8',
    # 30-31 moss
    '#2e4a26', '#5e8a3a',
]
PAL = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for h in HEX]
CLEAR = (0, 0, 0, 0)

def C(i): return PAL[i]

def art(rows, key, img=None, at=(0, 0)):
    """draw ASCII art. key maps chars to palette indices; '.' and ' ' are transparent."""
    h = len(rows); w = max(len(r) for r in rows)
    if img is None: img = Image.new('RGBA', (w, h))
    px = img.load(); ox, oy = at
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in '. ': continue
            X, Y = x + ox, y + oy
            if 0 <= X < img.width and 0 <= Y < img.height: px[X, Y] = C(key[ch])
    return img

def selout(img, col=0, sides='br'):
    """selective outline: dark outline on the shadow sides only (bottom, right), plus a lighter-dark one elsewhere."""
    W, Hh = img.size; src = img.load(); o = img.copy(); po = o.load()
    for y in range(Hh):
        for x in range(W):
            if src[x, y][3]: continue
            for dx, dy, side in ((-1, 0, 'r'), (1, 0, 'l'), (0, -1, 'b'), (0, 1, 't')):
                xx, yy = x + dx, y + dy
                if 0 <= xx < W and 0 <= yy < Hh and src[xx, yy][3]:
                    po[x, y] = C(col) if side in sides else C(min(col + 2, 3)); break
    return o

def pad(img, l=1, t=1, r=1, b=1):
    o = Image.new('RGBA', (img.width + l + r, img.height + t + b)); o.alpha_composite(img, (l, t)); return o

def put(dst, src, x, y):
    W, Hh = dst.size; w, h = src.size
    cx0, cy0 = max(0, -x), max(0, -y); cx1, cy1 = min(w, W - x), min(h, Hh - y)
    if cx1 <= cx0 or cy1 <= cy0: return
    dst.alpha_composite(src.crop((cx0, cy0, cx1, cy1)), (x + cx0, y + cy0))
