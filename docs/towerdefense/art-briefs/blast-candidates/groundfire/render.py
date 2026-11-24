"""Render both ground-fire studies. Python 3, NumPy, SciPy, Pillow 10.1+."""
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import map_coordinates, spline_filter

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from paint import Pigment, TAU, grid, ramp, rgba, sequence, smooth

# The warmest stops are reserved for the small pocket of fuel at the foot.
PALETTE = [(139, 22, 9), (205, 34, 6), (245, 54, 4), (255, 83, 3),
           (255, 108, 4), (255, 143, 10), (255, 178, 21), (255, 212, 49),
           (255, 236, 107), (255, 251, 198)]

# Height, wind displacement, then (root offset, width, relative length, tip offset).
FORKED = [
    (97,  9, [(-7,9,.66,-10), (1,11,1,1), (9,5,.43,10)]),
    (67, -8, [(-9,8,.88,-4), (3,12,.68,4), (10,6,1,13)]),
    (106,-5, [(-4,9,1,-3), (6,7,.78,11), (-11,5,.42,-7)]),
    (77, 14, [(-10,10,.74,-12), (0,9,1,1), (9,6,.58,3)]),
]
WINDBLOWN = [
    (83, 16, [(-9,12,.80,-5), (4,8,1,1), (11,5,.42,-3)]),
    (103,-13,[(-4,8,.84,-1), (4,10,1,8), (-10,6,.47,-5)]),
    (62,  7, [(-10,7,.92,-7), (0,12,.74,4), (9,7,1,6)]),
    (91,  4, [(-7,11,1,-9), (6,8,.62,10), (12,4,.75,7)]),
]


class Tuft:
    def __init__(self, variant, windy):
        self.windy = windy
        self.height, self.lean, self.jets = (WINDBLOWN if windy else FORKED)[variant]
        rng = np.random.default_rng(1230 + variant + windy*27)
        self.strokes = [spline_filter(rng.normal(size=(64, n)), mode='grid-wrap')
                        for n in (3, 6, 16, 37)]
        self.offsets = rng.uniform(0, TAU, len(self.jets))
        self.cinders = rng.uniform(size=(4, 3))

    def noise(self, layer, travel, across):
        tile = self.strokes[layer]
        return map_coordinates(tile, (across, travel*tile.shape[1]), order=3,
                               mode='grid-wrap', prefilter=False)

    def burn(self, frame, remaining=1.0):
        phase = (frame % 16)/16
        px, py = grid(64,128)
        x = px - .5
        z = 120 - (py + 63.5)
        # Short poses settle onto the same root; their surviving jets also narrow.
        h = z / max(.05, remaining)
        u = x / (.40+.60*remaining)
        travel = h/79 - phase
        broad = self.noise(0, travel, u/13)
        paint = self.noise(1, travel+.018*broad, u/5.4+.44*broad)
        grain = self.noise(2, travel, u/3.2+.34*paint)
        fine = self.noise(3, travel+.006*grain, u/1.55)
        nearest = np.full_like(x,-150)
        ridge = np.zeros_like(x)
        for i,(root,width,portion,bend) in enumerate(self.jets):
            offset = self.offsets[i]
            beat = TAU*phase+offset
            length = self.height*portion*(.91+.08*np.sin(beat)+.08*np.cos(2*beat+i))
            f = np.clip(h/length,0,1)
            # Moving shoulders lift, pinch and split the flow into unequal tongues.
            drift = self.lean*(h/self.height).clip(0,1)**1.35
            wave = TAU*(h/72-phase)+offset
            center = root*(1-.24*f) + drift + bend*f**1.65
            center += (2.0+(4.2 if self.windy else 2.7)*f)*np.sin(wave+1.4*f)*smooth((h+1)/16)
            center += (2.1+2.4*f)*np.tanh(broad)*smooth(h/15)
            if self.windy:
                center += (5+i)*np.sin(4.8*f+offset+.6*np.sin(beat))*f
            shoulder = (1-.90*f**1.52)*(.97+.22*np.cos(wave+.7))
            distance = np.minimum(width*shoulder-abs(u-center), (length-h)*.55)
            distance += smooth((h+1)/15)*(1.85*paint+.78*grain+.24*fine)
            nearest = np.maximum(nearest,distance)
            spine = (u-center)/np.maximum(1.1,width*shoulder)
            stroke = np.exp(-((spine+.32+.20*paint)/.49)**2)*smooth((length-h)/13)
            ridge = np.maximum(ridge,stroke)
        # Curve the lower edge around the anchor to give the bed a shallow footprint.
        sole = z + 3.6 - .024*x*x + 1.15*np.tanh(paint)
        edge = np.minimum(nearest*(.55+.45*remaining), sole)
        height = np.clip(h/self.height,0,1)
        channels = np.tanh(.70*paint+.43*grain)
        root = np.exp(-((u-1.4*broad)/7.1)**2 - (h/(13 if self.windy else 16))**2)
        depth = smooth((nearest+.5)/8.5)
        heat = (.17+.23*depth+.14*channels+.037*fine-.11*height+.16*ridge+
                .60*root+.10*np.exp(-h.clip(0)/27))
        heat -= .24*(1-remaining) + .23*np.exp(-((sole-.4)/2.5)**2)
        # Hot tongues carry the opacity; clefts let the surface show through.
        cover = (.23+.37*depth+.12*channels+.18*ridge)*(1-.43*height)+.46*root
        alpha = smooth((edge+1.6)/3.5)*np.clip(cover,.05,.97)*smooth(remaining/.18)
        border = smooth((31.5-abs(px))/2)*smooth((63.5-abs(py))/2)
        glow = .12*np.exp(-(np.maximum(0,-edge)/2.5)**2)*(1-height)*remaining
        img = rgba([255,77,6],glow*border)
        img.alpha_composite(rgba(ramp(heat,PALETTE),alpha*border))
        return img

    def dying(self,frame):
        fuel = (1,.84,.66,.46,.29,.15,.07,0)[frame]
        img = self.burn(frame,fuel)
        if frame < 2:
            return img
        x,y = grid(64,128)
        x -= .5
        h = 56.5-y
        t = frame/7
        # A thin, drifting thread lifts clear of the last glowing fragments.
        rise = 8+37*t
        n = self.noise(0,h/63-.7*t,x/9+11)
        fine = self.noise(1,h/54-.6*t,x/4+.36*n)
        path = self.lean*h/83 + 4*np.sin(h/9-5*t) + 2.6*n
        smoke = np.exp(-((x-path)/(2+smooth(h/36)*4))**2)
        smoke *= np.exp(-((h-rise)/(11+5*t))**2)*smooth((h-3)/10)
        smoke *= (.10+.19*smooth(.4+.5*fine))*smooth((t-.19)/.42)
        img.alpha_composite(rgba(ramp(.47+.19*fine,[(65,62,65),(130,124,122),(181,175,165)]),smoke))
        for j,(offset,lift,size) in enumerate(self.cinders):
            cx = (offset-.5)*18 + .15*self.lean*t
            cy = 1.5+lift*4 + (j%2)*15*t
            dist = np.hypot((x-cx)/(1.5+size), (h-cy)/(.8+size))
            coal = smooth(1.5-dist)*(.82-.55*t)*smooth((t-.20)/.45)
            img.alpha_composite(rgba(ramp(.69-.36*t-.20*dist,PALETTE),coal))
        return img


def flare(frame, windy, ink):
    x,y = grid(192,192)
    t = frame/7
    radius = (17,35,51,65,76,80,80,80)[frame]
    cover = np.zeros_like(x)
    color = np.zeros_like(x)
    # Project a short curtain of fire above an elliptical contact line. Gaps
    # widen as fuel is spent; the lifted tips can show against the open middle.
    for h in range(24):
        u = x - h*(.33 if windy else .14)
        v = (y+h-.8)/.82
        a = np.arctan2(v,u)
        n = ink.noise(u/14+.56*t,v/14-.55*t)
        grain = ink.grain(u/4.6+.5*n,v/4.7-.24*h)
        scallop = np.sin((5 if windy else 7)*a+1.3*n+.9*t)
        line = radius*(1+.065*scallop) + 2.5*n - np.hypot(u,v)
        height = 7+7.3*scallop+4*n+2*grain
        jet = np.exp(-((line-.16*h)/(3.7+2.4*t))**2)*smooth((height-h+2)/5)
        fuel = smooth(.85+.45*n+.23*grain-1.10*t)
        mass = jet*fuel*(1-.97*smooth((t-.54)/.49))*(.78-.017*h)
        take = mass>cover
        heat = .37+.13*grain+.12*scallop+.43*np.exp(-h/2.9)*jet-.18*t
        color[take] = heat[take]
        cover = np.maximum(cover,mass)
    margin = 95.5-np.maximum(abs(x),abs(y))
    return rgba(ramp(color,PALETTE),cover*smooth(margin/3))


def review_sheet(folder,tufts,dying,flares,windy):
    sheet = Image.new('RGB',(1136,1236),'#27272a')
    draw = ImageDraw.Draw(sheet)
    title = ImageFont.load_default(size=22)
    label = ImageFont.load_default(size=15)
    draw.text((20,14),'B  /  Crosswind' if windy else 'A  /  Split Draft',font=title,fill='#ffdfa4')
    # The repository road appears only on the sheet. Draw eight tufts in
    # depth order, with phase offsets and the same bottom anchor as the sprites.
    roadfile = next(p/'public/td/kits/volcanic/road.webp' for p in ROOT.parents
                    if (p/'public/td/kits/volcanic/road.webp').is_file())
    crop = (250,30,695,186)
    strip = Image.open(roadfile).convert('RGBA').crop(crop)
    ground = Image.open(roadfile.parent/'ground_a.webp').convert('RGB')
    road = ground.resize((445,156),Image.Resampling.LANCZOS)
    road.paste(strip,(0,0),strip)
    road = Image.blend(road,Image.new('RGB',road.size,'#13151a'),.45)
    for v,frame,x,y,scale in [(1,11,131,62,.45),(0,4,220,62,.39),(3,1,176,76,.48),
                              (2,9,244,88,.50),(1,2,104,94,.57),(3,13,192,105,.56),
                              (0,8,144,115,.61),(2,4,218,127,.50)]:
        im=tufts[v][frame].resize((round(64*scale),round(128*scale)),Image.Resampling.LANCZOS)
        road.paste(im,(round(x-32*scale),round(y-120*scale)),im)
    sheet.paste(road,(20,51))
    draw.text((483,54),'Eight tufts on the volcanic road',font=label,fill='#dcd2c3')
    draw.text((483,84),'Individual tufts   /   variants 0-3',font=label,fill='#dcd2c3')
    for v in range(4):
        im = tufts[v][3*v]
        sheet.paste(im,(520+110*v,86),im)
    draw.text((20,218),'Sustain   /   18 fps   /   frames 00-15 left to right',font=label,fill='#ffdfa4')
    for v,frames in enumerate(tufts):
        y=244+v*119
        draw.text((15,y+45),str(v),fill='#cfc6bf')
        for i,im in enumerate(frames):
            sheet.paste(im,(38+68*i,y-11),im)
    draw.text((20,735),'Catch ring   /   20 fps   /   frames 00-07',font=label,fill='#ffdfa4')
    for i,im in enumerate(flares):
        small=im.resize((136,136),Image.Resampling.LANCZOS)
        sheet.paste(small,(16+138*i,755),small)
    draw.text((20,899),'Dying   /   variants 0-3   /   frames 00-07',font=label,fill='#ffdfa4')
    for v,frames in enumerate(dying):
        x=20+v%2*565
        y=938+v//2*155
        draw.text((x,y+50),str(v),fill='#cfc6bf')
        for i,im in enumerate(frames):
            sheet.paste(im,(x+16+64*i,y),im)
    sheet.save(folder/'sheet.png')


def render(name):
    folder = ROOT/name
    windy = name=='b'
    tufts,dying = [],[]
    for v in range(4):
        tuft = Tuft(v,windy)
        tufts.append(sequence(folder,f'tuft_{v}',(tuft.burn(f) for f in range(16))))
        dying.append(sequence(folder,f'dying_{v}',(tuft.dying(f) for f in range(8))))
    ink = Pigment(509+windy)
    flares = sequence(folder,'flare',(flare(f,windy,ink) for f in range(8)))
    review_sheet(folder,tufts,dying,flares,windy)


if __name__=='__main__':
    for name in ('a','b'):
        render(name)
