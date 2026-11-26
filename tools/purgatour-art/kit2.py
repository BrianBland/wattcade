"""Drawing kit for the bigger characters: sphere-shaded ellipses, bevel-shaded polygons, lines, ASCII stamps, outline.
Light from the top left. Every colour is a 4-step ramp (dark, mid, lit, highlight)."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw
from chars import outline, hx, OUT, flash
from pal import C

def R(*h): return [hx(x) if isinstance(x, str) else x for x in h]
STEEL = [C(4), C(6), C(9), C(11)]; BONE = [C(7), C(9), C(10), C(11)]; GOLD = [C(22), C(23), C(24), C(25)]
WOOD = [C(13), C(14), C(15), C(16)]; DARK = [C(0), C(2), C(4), C(6)]; RED = [C(18), C(19), C(20), C(21)]
EYE_E = hx('#ff8a7a')   # enemy eye glint (pink-red, the enemy colour)

class Cv:
    def __init__(s, w, h): s.im = Image.new('RGBA', (w, h)); s.px = s.im.load(); s.w, s.h = w, h
    def set(s, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h: s.px[x, y] = c
    def get(s, x, y): return s.px[x, y] if 0 <= x < s.w and 0 <= y < s.h else (0, 0, 0, 0)
    def ell(s, cx, cy, rx, ry, ramp, spec=True, clip=None):
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                nx, ny = (x + .5 - cx) / rx, (y + .5 - cy) / ry; d = nx * nx + ny * ny
                if d > 1 or (clip and not clip(x, y)): continue
                nz = math.sqrt(max(0, 1 - d)); l = -.55 * nx - .65 * ny + .52 * nz
                k = 0 if l < .05 else 1 if l < .42 else 2 if l < .78 else (3 if spec else 2)
                s.set(x, y, ramp[k])
    def mask(s, pts):
        m = Image.new('L', (s.w, s.h)); ImageDraw.Draw(m).polygon([(round(x), round(y)) for x, y in pts], fill=255); return m.load()
    def poly(s, pts, ramp, flat=1):
        m = s.mask(pts); inside = lambda x, y: 0 <= x < s.w and 0 <= y < s.h and m[x, y]
        for y in range(s.h):
            for x in range(s.w):
                if not m[x, y]: continue
                c = ramp[flat]
                if not inside(x - 1, y) or not inside(x, y - 1): c = ramp[min(3, flat + 1)]
                elif not inside(x + 1, y) or not inside(x, y + 1): c = ramp[max(0, flat - 1)]
                s.set(x, y, c)
    def line(s, x0, y0, x1, y1, c, w=1):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(int(n) + 1):
            x, y = x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n
            for dy in range(w):
                for dx in range(w): s.set(x + dx - w // 2, y + dy - w // 2, c)
    def rod(s, x0, y0, x1, y1, ramp, w=3):
        """a shaded cylinder between two points: lit on its upper-left side"""
        n = max(abs(x1 - x0), abs(y1 - y0), 1); L = math.hypot(x1 - x0, y1 - y0) or 1; px_, py_ = -(y1 - y0) / L, (x1 - x0) / L
        if px_ + py_ > 0: px_, py_ = -px_, -py_
        for i in range(int(n * 1.5) + 1):
            t = i / (n * 1.5)
            for k in range(w):
                o = k - (w - 1) / 2
                c = ramp[2] if k == 0 else ramp[0] if k == w - 1 else ramp[1]
                s.set(x0 + (x1 - x0) * t + px_ * o, y0 + (y1 - y0) * t + py_ * o, c)
    def stamp(s, rows, key, at):
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch not in '. ': s.set(at[0] + x, at[1] + y, key[ch])
    def done(s): return outline(s.im)
