"""Render the second blast studies with NumPy, SciPy and Pillow 10.1+."""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from paint import FIRE, TAU, Pigment, contact_sheet, grid, place, ramp, rgba, sequence, smooth, spark_field

SOIL = [(47, 31, 24), (82, 48, 31), (133, 80, 42), (184, 125, 65),
        (220, 168, 99), (244, 211, 151), (255, 233, 183)]
BROOD = [(87, 12, 17), (143, 15, 16), (202, 28, 11), (244, 54, 7),
         (255, 93, 9), (255, 146, 23), (255, 207, 72), (255, 238, 145)]


def fade_at_canvas_edge(img, x, y):
    margin = (img.width-1)/2 - np.maximum(abs(x), abs(y))
    alpha = np.asarray(img.getchannel('A')) * smooth(margin/4)
    img.putalpha(Image.fromarray(np.rint(alpha).astype('uint8')))
    return img


class Fireball:
    def __init__(self, b):
        self.b = b
        self.ink = Pigment(615)  # Same fuel and underlying eddies as the selected caldera.
        self.sparks = np.random.default_rng(220).random((42, 4))

    def impact(self, frame):
        t = frame / 9
        x, y = grid(256, 256)
        r, a = np.hypot(x, y), np.arctan2(y, x)
        size = [53, 86, 93, 93, 93, 93, 93, 92, 91, 90][frame]
        u, v = x/(9+.12*size), y/(9+.12*size)
        n = self.ink.noise(u+.9*t, v-.6*t)
        grain = self.ink.grain(2.7*u+.8*n, 2.7*v+.48*n)
        curl = self.ink.noise(u*1.42+8+n, v*1.42+.68*grain)
        lobes = np.sin(8*a+.8*np.sin(3*a)+2*t)
        edge = size*(1+.063*lobes+.046*np.sin(3*a-.6)) - r
        for i, ray in enumerate((.42, 1.34, 2.67, 3.37, 4.61, 5.73)):
            normal = x*np.cos(ray)+y*np.sin(ray)-.93*size
            tangent = y*np.cos(ray)-x*np.sin(ray)
            turn = (-1)**i * (1.7+.9*t)*np.exp(
                -(normal**2+tangent**2)/(4+size*(.17+.025*(i%3)))**2)
            edge += normal*(1-np.cos(turn))+tangent*np.sin(turn)
        edge += size*(.12*np.cos(3*a-1)+.035*np.sin(6*a))
        if self.b:
            # Three broad vents tear the lip into separated, outward hooks.
            vents = smooth((np.cos(3*a-.7+.27*n)-.42)/.50)
            edge -= (12+4*np.sin(5*a))*vents*smooth(t/.24)
        edge += (2+5*t)*n+(1+2*t)*grain
        bank = np.exp(-((edge-9-4*curl)/(11+4*self.b))**2)
        channels = np.tanh(.93*curl+.73*grain)
        ribs = np.exp(-((curl-.24)/.53)**2)
        core = np.exp(-(r/(size*.66))**2)*(1-smooth(t/.57))
        eye = smooth((t-.09)/.34)*smooth((size*(.65+.16*self.b)-r+6*n)/20)
        fade = 1-.98*smooth((t-.55)/.47)
        breaks = 1-.77*vents*smooth(t/.32) if self.b else 1
        alpha = np.clip(.29+.46*core+.60*bank*breaks+.19*channels-.22*t, 0, .96)
        alpha *= smooth((edge+2)/5)*(1-.96*eye)*fade
        heat = .29+.55*core+.47*bank+.20*channels+.12*ribs+.09*grain-.22*t
        heat += .15*ribs*bank if self.b else .10*bank
        img = rgba([255,91,7], .23*np.exp(-(abs(edge)/10)**2)*fade)
        img.alpha_composite(rgba(ramp(heat,FIRE),alpha))
        # The opening exposure spans the first two poses. Its ragged perimeter
        # shares the fuel coordinates, so the white rolls into the hot crown.
        reach = [48, 72, 88][min(frame,2)]
        flash = np.exp(-(np.maximum(0,r-4*n-3*grain)/reach)**3.5)
        power = [1, .93, .39, .06, 0, 0, 0, 0, 0, 0][frame]
        img.alpha_composite(rgba([255,252,218],flash*power*(1-eye)))
        sparks = spark_field(x,y,self.sparks,t,119,smooth(t/.15)*(1-.85*t**2))
        img.alpha_composite(rgba(ramp(.98-.45*t+.1*grain,FIRE),sparks))
        return fade_at_canvas_edge(img,x,y)


def debris(index, metal, b, ink):
    # Draw directly on the 40px grid. Scale the actual polygon to a chosen
    # longest dimension after rotation, before shading and edge coverage.
    rng = np.random.default_rng(735 + index + 20*metal + 40*b)
    x, y = grid(40,40)
    if metal:
        points = np.array([[-1,-.35],[-.61,-.54],[.27,-.40],[1,-.27],
                           [.72,.03],[.80,.23],[.42,.46],[-.18,.34],[-.8,.50]])
    else:
        angles = TAU*(np.arange(8)+rng.uniform(-.22,.22,8))/8
        points = np.stack((np.cos(angles), .81*np.sin(angles)),axis=1)
    points *= rng.uniform(.82,1.17,(len(points),1))
    spin = rng.uniform(0,TAU)
    c, s = np.cos(spin), np.sin(spin)
    points = points @ np.array([[c,s],[-s,c]])
    points *= (26+index%6)/np.ptp(points,axis=0).max()
    points -= (points.max(axis=0)+points.min(axis=0))/2
    peak = points.mean(axis=0)+rng.uniform(-1.8,1.8,2)
    dx, dy = x-peak[0], y-peak[1]
    edge = np.full_like(x,-40)
    height = np.full_like(x,-10)
    for p, q in zip(points-peak,np.roll(points-peak,-1,axis=0)):
        det = p[0]*q[1]-p[1]*q[0]
        u = (q[1]*dx-q[0]*dy)/det
        v = (p[0]*dy-p[1]*dx)/det
        face = (u>=0)&(v>=0)
        depth = 1-u-v
        edge[face] = depth[face]*abs(det)/np.linalg.norm(p-q)
        height[face] = 8*depth[face]
    grit = ink.grain(x/1.7+index*5,y/1.8)
    alpha = smooth(edge+.45+.34*grit)
    gy, gx = np.gradient(height)
    value = .38+.48*gx+.65*gy+.10*grit
    if metal:
        along, across = x*c+y*s, y*c-x*s
        fold = across+.25*along+.30*grit
        value = .19+.38*smooth((fold+1)/2)+.29*np.exp(-(fold/1.4)**2)+.06*grit
        value += .36*np.exp(-((edge-1.0)/.88)**2)
        colors = [(24,27,31),(56,57,56),(102,103,98),(180,183,175),(245,239,210)]
        rgb = ramp(value,colors)
        if index%2==0:
            band = smooth(2.6-abs(along+4)) * smooth(.77+.45*grit)
            rgb = rgb*(1-band[...,None])+ramp(value,[(94,63,14),(214,157,20),(249,218,86)])*band[...,None]
        if index%3==1:
            hole = np.hypot(along-5,across-.7)
            alpha *= smooth(hole-1.9)
            rgb *= (1-.50*np.exp(-((hole-3)/.70)**2))[...,None]
    else:
        value += .13*np.exp(-((edge-1.3)/.7)**2)
        rgb = ramp(value,SOIL if not b else [(44,34,29),(89,68,52),(152,122,87),(201,176,135),(242,220,179)])
    return rgba(rgb,alpha)


class Mortar:
    def __init__(self,b):
        self.b = b
        self.ink = Pigment(813+b)
        self.gravel = [debris(i,False,b,self.ink) for i in range(8)]
        self.shrapnel = [debris(i,True,b,self.ink) for i in range(6)]
        self.flight = np.random.default_rng(352+b).random((23,5))

    def impact(self,frame):
        x,y = grid(256,256)
        r,a = np.hypot(x,y),np.arctan2(y,x)
        t = frame/9
        wave = [37,63,86,101,109,114,117,119,120,120][frame]
        radius = [19,38,51,62,70,76,81,85,87,88][frame]
        u,v = x/(7+.15*radius), y/(7+.15*radius)
        n = self.ink.noise(u+.5*t,v-.6*t)
        coarse = self.ink.grain(u*1.7+.39*n, v*1.7+.38*n)
        fine = self.ink.grain(x/3.1+.42*n,y/3.3+.62*coarse)
        jets = np.sin((7 if self.b else 5)*a+.7*np.sin(3*a)+.4*n)
        # Shape a hollow bank of lifted soil, then light its actual normals.
        d = r-radius*(.86+.075*jets)-4*n-2*coarse
        thickness = 7+radius*(.16 if self.b else .20)
        bank = np.exp(-(d/thickness)**2)
        relief = bank*(15+5*n+3*coarse)
        gy,gx = np.gradient(relief)
        light = .41+.33*np.tanh(.85*gx+1.35*gy)+.13*coarse+.08*fine
        dirt = np.clip(bank*(.71+.16*n+.21*coarse),0,.93)
        # The inner wall exposes dark soil; a broad sunward shelf remains
        # readable even when an entire detonation is only a few dozen pixels.
        light -= .23*np.exp(-((d+.50*thickness)/(.46*thickness))**2)
        light += .17*np.exp(-((d-.35*thickness)/(.48*thickness))**2)
        dirt *= (1-.86*smooth((t-.47)/.55))
        eye = smooth((r-8-radius*.41)/(radius*.25+2))
        img = rgba(ramp(light,SOIL),dirt*eye)
        # Shadow, sunlit compressed air and a broken outer lip survive reduction.
        track = r-wave + 1.2*n+.9*np.sin(5*a+.4)
        strength = [ .7,.97,1,.98,.87,.73,.56,.36,.16,.035][frame]
        crest = np.exp(-(track/(3.7+1.0*self.b+1.1*t))**2)
        trough = np.exp(-((track+5.7)/(4.3+1.3*t))**2)
        img.alpha_composite(rgba([63,42,32],strength*.89*trough))
        img.alpha_composite(rgba(ramp(.90+.08*coarse+.08*n,SOIL),strength*crest*(.93+.06*np.tanh(n))))
        if self.b:
            lip = np.exp(-((track+12)/2.1)**2)*smooth(.35+.62*n)
            img.alpha_composite(rgba([230,194,136],strength*.62*lip))
        for i,(ray,speed,delay,scale,roll) in enumerate(self.flight):
            age = np.clip((t-.045*delay)/(.64+.44*speed),0,1)
            opacity = smooth(t/.13)*(1-smooth((age-.70)/.30))
            if opacity < .01:
                continue
            theta = TAU*ray
            rr = 18+(46+55*speed)*(1-(1-age)**1.8)
            chips = self.shrapnel if i%3==1 else self.gravel
            chip = chips[(i//3+i)%len(chips)]
            size = round(8+12*scale+4*np.sin(np.pi*age))
            chip = chip.resize((size,size),Image.Resampling.LANCZOS).rotate(
                roll*190+age*145,Image.Resampling.BICUBIC,expand=True)
            chip.putalpha(chip.getchannel('A').point(lambda v: round(v*opacity)))
            place(img,chip,(128+rr*np.cos(theta),128+rr*np.sin(theta)-7*np.sin(np.pi*age)))
        if frame<=1:
            flash = np.exp(-(np.maximum(r-2*n-2*coarse,0)/(40+13*frame))**3)
            img.alpha_composite(rgba([255,246,170],flash*(.98-.20*frame)))
            img.alpha_composite(rgba([255,255,222],np.exp(-(r/(30+5*frame))**2)*(.99-.30*frame)))
        return fade_at_canvas_edge(img,x,y)


class Ignition:
    def __init__(self,b):
        self.b = b
        self.ink = Pigment(721+b)
        self.drops = np.random.default_rng(482+b).random((11,4))

    def burst(self,frame):
        x,y = grid(192,192)
        t = frame/7
        # Three armour seams vent at different angles along the body, with
        # distinct left/right jets. Keep the negative space between the plates.
        tilt = .56 if self.b else -.32
        u = x*np.cos(tilt)+y*np.sin(tilt)
        v = y*np.cos(tilt)-x*np.sin(tilt)
        retreat = smooth(t/.58)
        energy = [ .79,1,.96,.83,.65,.46,.25,.08][frame]
        n = self.ink.noise(u/11-2.4*t,v/10+.7*t)
        grain = self.ink.grain(u/4.2-.85*n-4*t,v/4.8+.37*n)
        flank = np.zeros_like(x)
        heat = np.zeros_like(x)
        jets = [(-18,.41,22,8),(-2,-.10,39,12),(13,-.76,30,9)]
        if self.b:
            jets = [(-17,.79,32,10),(-1,.21,26,9),(13,-.47,38,11)]
        for i,(root,slope,length,width) in enumerate(jets):
            for sign in (-1,1):
                lift = 3+retreat*(10+3*i) + 2*sign
                run = sign*u - lift
                reach = length*(.31+1.02*smooth(t/.48))*(1+.12*sign*np.cos(i))
                progress = np.clip(run/reach,0,1)
                center = root - slope*run - (4+4*i+3*sign)*progress**2
                center += (3+2*i)*np.sin(4*progress+sign+i)*progress
                broad = width*(.45+.85*np.sin(np.pi*progress)**.7)
                edge = np.minimum(np.minimum(run+2,reach-run),broad-abs(v-center))
                edge += (2.6*n+2.3*grain)*(.6+.65*progress)
                mass = smooth((edge+3)/8)
                streak = np.tanh(.91*n+.82*grain+edge/14)
                # Fuel catches in narrow, bright pockets along each torn seam.
                hot = np.exp(-((v-center+2*n)/(.28*broad+1.9))**2)
                hot *= smooth((edge+2)/6)*(.48+.52*smooth(.48+.6*grain))
                cover = mass*(.29+.15*streak+.36*hot)*energy
                take = cover>flank
                heat[take] = (.26+.20*streak+.08*grain+.47*hot+.18*np.exp(-((edge-3)/3)**2)-.15*t)[take]
                flank = np.maximum(flank,cover)
        seam = np.exp(-((u+.9*n)/(5+3*smooth(n)))**2 - (v/(21+2*n))**4)
        seam *= .84*(1-smooth(t/.40))
        flank *= smooth((81-np.hypot(x,y))/15)
        img = rgba(ramp(heat,BROOD),flank)
        img.alpha_composite(rgba(ramp(.73+.19*grain,BROOD),seam))
        # Short chitin splinters catch a sliver of red reflected light.
        # Ichor droplets stretch on launch, then contract as they slow.
        for i,(ray,speed,size,spin) in enumerate(self.drops):
            angle = TAU*ray
            rr = 12+(34+27*speed)*(1-(1-t)**1.8)
            dx,dy = x-rr*np.cos(angle), y-rr*np.sin(angle)
            twist = angle + (.94*t*spin if i%3==0 else 0)
            along = dx*np.cos(twist)+dy*np.sin(twist)
            across = dy*np.cos(twist)-dx*np.sin(twist)
            length = 2.6+3*size+1.9*(1-t)
            if i%3==0:
                d = abs(along)/length + abs(across+.23*along)/(1.7+size*1.8)
                color = ramp(.30+.38*(across<-.2)+.13*grain,
                             [(31,21,26),(58,32,34),(107,51,43),(180,109,76)])
            else:
                d = np.hypot(along/length,across/(1.4+1.3*size))
                color = ramp(.76-.34*d+.14*grain-.29*t,BROOD)
            alpha = smooth((1.15-d)*3)*smooth(t/.18)*(1-.90*t**2)
            img.alpha_composite(rgba(color,.84*alpha))
        return img

    def ember(self,index):
        x,y = grid(16,16)
        theta = .4+index*1.13+self.b*.8
        u,v = x*np.cos(theta)+y*np.sin(theta), y*np.cos(theta)-x*np.sin(theta)
        grit = self.ink.grain(u/1.6+index*5,v/1.6)
        # Alternate compact flecks, splinters and notched hot coals.
        length = [3.9,5.4,4.5,5.9,4.8,3.7][index]
        width = [2.8,1.35,2.7,1.60,2.25,2.7][index]
        edge = 1-np.hypot(u/length,(v+.15*u)/width)+.18*grit
        halo = np.exp(-((u/(length+1.2))**2+(v/(width+1.4))**2)*1.25)
        img = rgba([255,79,8],.30*halo)
        heat = .39+.62*edge-.21*v/width+.13*grit
        img.alpha_composite(rgba(ramp(heat,FIRE),smooth((edge+.12)*3.4)))
        return img


def render(name):
    b = name=='b'
    mortar = Mortar(b)
    ignition = Ignition(b)
    sections = []
    for folder, stem, count, renderer in [
        ('fireball','impact',10,Fireball(b).impact),
        ('mortar','impact',10,mortar.impact),
        ('mortar','gravel',8,mortar.gravel.__getitem__),
        ('mortar','shrapnel',6,mortar.shrapnel.__getitem__),
        ('ignite','burst',8,ignition.burst),
        ('ignite','ember',6,ignition.ember),
    ]:
        frames = sequence(ROOT/name/folder,stem,(renderer(i) for i in range(count)))
        sections.append((f'{folder.upper()}   /   {stem}',frames))
    title = 'B   /   Split Crown' if b else 'A   /   Furnace Crown'
    contact_sheet(sections,title).save(ROOT/name/'sheet.png')


if __name__=='__main__':
    for name in ('a','b'):
        render(name)
