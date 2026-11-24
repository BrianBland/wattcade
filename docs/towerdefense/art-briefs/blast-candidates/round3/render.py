"""Render the final A polish. Requires NumPy, SciPy and Pillow 10.1+."""
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from paint import FIRE, TAU, contact_sheet, grid, place, ramp, rgba, sequence, smooth, spark_field
from PIL import Image
from round2 import render as previous
from round2.render import SOIL, fade_at_canvas_edge


class Fireball(previous.Fireball):
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
        edge += (2+5*t)*n+(1+2*t)*grain
        bank = np.exp(-((edge-9-4*curl)/11)**2)
        channels = np.tanh(.93*curl+.73*grain)
        ribs = np.exp(-((curl-.24)/.53)**2)
        core = np.exp(-(r/(size*.66))**2)*(1-smooth(t/.57))
        eye = smooth((t-.09)/.34)*smooth((size*.65-r+6*n)/20)
        fade = 1-.98*smooth((t-.55)/.47)
        alpha = np.clip(.29+.46*core+.60*bank+.19*channels-.22*t, 0, .96)
        alpha *= smooth((edge+2)/5)*(1-.96*eye)*fade
        # Orange and scarlet occupy the broad rolling face. A narrow, irregular
        # ridge on its inward-facing slope catches the incandescent highlight.
        heat = .26 + .36*core + .35*bank + .16*channels + .08*ribs + .07*grain - .18*t
        lip = np.exp(-((edge-16-4*curl)/3.6)**2)
        lip *= smooth(.47+.48*channels+.24*grain) * (1-.62*t)
        ember_colors = [(151,21,8),(203,32,6),(238,46,4),(255,69,2),
                        (255,93,3),(255,119,7),(255,150,13),(255,177,25)]
        body = ramp(heat,ember_colors)
        lip_light = ramp(.78+.16*channels+.07*grain,FIRE)
        body += (lip_light-body)*lip[...,None]
        img = rgba([255,78,5], .23*np.exp(-(abs(edge)/10)**2)*fade)
        img.alpha_composite(rgba(body,alpha))
        if frame < 2:
            reach = (48,72)[frame]
            flash = np.exp(-(np.maximum(0,r-4*n-3*grain)/reach)**3.5)
            img.alpha_composite(rgba([255,252,218],flash*(1-.07*frame)*(1-eye)))
        sparks = spark_field(x,y,self.sparks,t,119,smooth(t/.15)*(1-.85*t**2))
        img.alpha_composite(rgba(ramp(.96-.45*t+.1*grain,ember_colors),sparks))
        return fade_at_canvas_edge(img,x,y)


class Mortar(previous.Mortar):
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
        jets = np.sin(5*a+.7*np.sin(3*a)+.4*n)
        # Shape a hollow bank of lifted soil, then light its actual normals.
        d = r-radius*(.86+.075*jets)-4*n-2*coarse
        thickness = 7+radius*.20
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
        crest = np.exp(-(track/(3.7+1.1*t))**2)
        trough = np.exp(-((track+5.7)/(4.3+1.3*t))**2)
        img.alpha_composite(rgba([63,42,32],strength*.89*trough))
        # Ochre dust mottles the crest without losing the dark inner shadow.
        dust_light = np.clip(.73+.08*coarse+.06*n+.04*fine, .47, .88)
        coverage = strength*crest*(.83+.12*np.tanh(n+.45*coarse))
        img.alpha_composite(rgba(ramp(dust_light,SOIL),coverage))
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
        if frame == 0:
            # A single, partially transparent exposure. Keep its feathered
            # perimeter inside the advancing wave, even on repeated hits.
            flash_radius = .60*wave
            d = r+.85*np.tanh(coarse)
            flash = smooth((flash_radius-d)/(.41*flash_radius))
            img.alpha_composite(rgba([242,234,164], .67*flash))
        return fade_at_canvas_edge(img,x,y)


class Ignition(previous.Ignition):
    def burst(self, frame):
        img = super().burst(frame)
        if frame >= 2:
            return img
        x, y = grid(192,192)
        # The first heat breaks through the same tilted dorsal seam as the
        # paired vents. The second exposure contracts back inside the plates.
        tilt = -.32
        u = x*np.cos(tilt)+y*np.sin(tilt)
        v = y*np.cos(tilt)-x*np.sin(tilt)
        grain = self.ink.grain(u/4.8+frame*.45, v/5.0)
        radius = np.hypot((u+.9*grain)/(12-2*frame), v/(15-3*frame))
        edge = 1-radius+.13*grain
        light = ramp(.21+.91*smooth((edge+.05)/.85)+.08*grain,
                     [(255,71,6),(255,131,9),(255,199,39),(255,239,126),(255,249,183)])
        img.alpha_composite(rgba(light,(.91-.35*frame)*smooth((edge+.12)/.61)))
        return img


def render():
    sections = []
    for folder, stem, count, renderer in [
        ('fireball','impact',10,Fireball(False).impact),
        ('mortar','impact',10,Mortar(False).impact),
        ('ignite','burst',8,Ignition(False).burst),
    ]:
        frames = sequence(ROOT/'a'/folder,stem,(renderer(i) for i in range(count)))
        sections.append((f'{folder.upper()}   /   {stem}',frames))
    contact_sheet(sections,'A   /   Furnace Crown   /   Round 3').save(ROOT/'a'/'sheet.png')


if __name__ == '__main__':
    render()
