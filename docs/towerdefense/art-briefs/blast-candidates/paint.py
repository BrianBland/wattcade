"""Original Dynamo Defense effect studies. Run with Python 3, NumPy, SciPy and Pillow."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import map_coordinates, spline_filter

ROOT = Path(__file__).resolve().parent
TAU = 2 * np.pi
FIRE = [(165, 23, 5), (222, 42, 4), (250, 67, 4), (255, 98, 4),
        (255, 140, 9), (255, 187, 26), (255, 225, 76), (255, 244, 154), (255, 253, 219)]


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def grid(width, height):
    y, x = np.mgrid[:height, :width].astype(float)
    return x - (width - 1) / 2, y - (height - 1) / 2


def ramp(value, colors):
    return np.stack([np.interp(value, np.linspace(0, 1, len(colors)), channel)
                     for channel in np.array(colors).T], axis=-1)


def rgba(rgb, alpha):
    rgb = np.broadcast_to(rgb, alpha.shape + (3,))
    pixels = np.dstack((rgb, 255 * alpha)).clip(0, 255).round().astype('uint8')
    pixels[pixels[:, :, 3] == 0] = 0
    return Image.fromarray(pixels)


def place(canvas, sprite, center):
    pos = tuple(round(v - size / 2) for v, size in zip(center, sprite.size))
    canvas.alpha_composite(sprite, dest=pos)


class Pigment:
    def __init__(self, seed):
        rng = np.random.default_rng(seed)
        self.paper = spline_filter(rng.normal(size=(64, 64)), mode='grid-wrap')

    def noise(self, u, v):
        return map_coordinates(self.paper, (v, u), order=3, mode='grid-wrap', prefilter=False)

    def grain(self, u, v):
        return (.59 * self.noise(u, v) + .29 * self.noise(2.2*u + 9, 2.2*v) +
                .12 * self.noise(5*u, 5*v + 12))


def spark_field(x, y, particles, t, scale, fade):
    """Ballistic ember slivers, with orientation and drag along each radial path."""
    mask = np.zeros_like(x)
    for ray, speed, start, size in particles:
        r = scale * ((.45 + .55 * speed) * (1 - (1-t)**1.55) + .08 * start)
        c, s = np.cos(TAU * ray), np.sin(TAU * ray)
        u, v = x*c + y*s - r, y*c - x*s
        d = np.hypot(u / (1.4 + 4*size*(1-t)), v / (.68 + 1.12*size))
        mask = np.maximum(mask, smooth(1.5-d) * fade * (.4 + .6*speed))
    return mask


class Launcher:
    def __init__(self, b):
        self.b = b
        self.ink = Pigment(614 + b)
        rng = np.random.default_rng(219 + b)
        self.embers = rng.random((58 if b else 44, 4))

    def ball(self, frame):
        x, y = grid(64, 64)
        p = TAU * (frame % 8) / 8
        r = np.hypot(x, y)
        # Rotate a material coordinate on a sphere. Texture, shadow and limb
        # have separate coordinates so the roll is legible from overhead.
        size = 21 if self.b else 23
        z = np.sqrt(np.maximum(0, size**2 - r**2))
        u = (x*np.cos(p) + z*np.sin(p)) / 7
        v = y/7 + .28 * (z*np.cos(p) - x*np.sin(p)) / 7
        broad = self.ink.noise(u + 14, v)
        fine = self.ink.grain(u*1.8 + .62*broad, v*1.8 + .5*broad)
        seam = np.exp(-((broad + .34*fine) / (.29 if self.b else .55))**2)
        lip = size - r + 1.9 * np.tanh(broad) + .65*fine
        shade = (z - .35*x - .45*y) / size
        heat = (.40 if self.b else .51) + .20*shade + .40*seam + .10*fine
        heat -= .17 * (1-smooth(lip/7))
        img = rgba([255, 85, 6], .42*np.exp(-(np.maximum(r-size+3, 0)/5.0)**2))
        img.alpha_composite(rgba(ramp(heat, FIRE), .98*smooth((lip+1.0)/2)))
        return img

    def trail(self, frame):
        x, y = grid(128, 64)
        d = 112 - (x + 63.5)
        y -= .5
        p = (frame % 6) / 6
        # One full noise tile strides aft each cycle. The wider flame envelope
        # overlaps the ball, which is drawn above the tail at (112, 32).
        u = d / 82 - p
        wave = np.sin(TAU * (u + .06)) * (2 if self.b else 4)
        width = np.clip(14 - .090 * d, 2, 15)
        if self.b:
            wave += 2 * np.sin(TAU * (2*u + .15))
            width += 2.4 * np.cos(TAU*u)
        v = (y - wave) / width
        if self.b:
            # Two streams separate behind the ball and braid at the tail.
            fork = smooth((d-6)/44) * (1 + .40*np.sin(TAU*u))
            v = (abs(v + .12*np.sin(TAU*u)) - fork) / (.76 + .24*(1-fork))
        # Sample a closed circular path through pigment to avoid a loop splice.
        n = self.ink.noise(4*np.cos(TAU*u) + .8*v, 4*np.sin(TAU*u) + 2*v)
        lick = self.ink.grain(1.6*np.cos(TAU*u) + 1.4*v + .4*n,
                              1.6*np.sin(TAU*u) + 2.6*v + 8)
        end = (101 if self.b else 91) - d + 12*lick + 9*n
        side = width*(1 - abs(v)) + 3.1*n + 1.7*lick
        edge = np.minimum(np.minimum(end, side), d + 5)
        axis = np.exp(-1.6*v*v) * smooth((115-d)/93)
        heat = .21 + .72*axis + .16*lick + .09*n
        img = rgba([255, 91, 5], .24*np.exp(-(np.maximum(-edge, 0)/3.8)**2)
                   * smooth((116-d)/15))
        img.alpha_composite(rgba(ramp(heat, FIRE), smooth((edge+1)/3) *
                                 np.clip(.24+.59*axis+.13*lick+.08*n, .04, .96)))
        return img

    def impact(self, frame):
        t = frame / 9
        x, y = grid(256, 256)
        r = np.hypot(x, y)
        a = np.arctan2(y, x)
        # Transport billow structure along the expanding front. Unequal lobe
        # sizes and off-centre eddies break the outline around the full turn.
        size = 13 + (88 if self.b else 82) * (1-(1-t)**2.6)
        u, v = x/(9+.12*size), y/(9+.12*size)
        n = self.ink.noise(u + .9*t, v - .6*t)
        grain = self.ink.grain(2.7*u+.8*n, 2.7*v+.48*n)
        curl = self.ink.noise(u*1.42 + 8 + 1.0*n, v*1.42 + .68*grain)
        lobes = np.sin((8 if self.b else 5)*a+.8*np.sin(3*a)+2*t)
        rim = size*(1 + .063*lobes + .046*np.sin(3*a-.6)) - r
        for i, ray in enumerate((.15, 1.07, 2.4, 3.1, 4.34, 5.46)):
            ray += .27*self.b
            normal = x*np.cos(ray)+y*np.sin(ray)-.93*size
            tangent = y*np.cos(ray)-x*np.sin(ray)
            turn = (-1)**i * (1.7 + .9*t) * np.exp(
                -(normal**2 + tangent**2) / (4 + size*(.17+.025*(i%3)))**2)
            rim += normal*(1-np.cos(turn)) + tangent*np.sin(turn)
        if self.b:
            rim += size*(.12*np.cos(3*a-1.0) + .035*np.sin(6*a)) * smooth(t/.34)
        edge = rim + (2+5*t)*n + (1+2*t)*grain
        shell = np.exp(-((edge-6-4*curl)/(5+.065*size))**2)
        channels = np.tanh(.93*curl+.73*grain)
        core = np.exp(-(r/(size*.64))**2) * (1-smooth((t-.08)/.64))
        fade = (1-.95*smooth((t-.50)/.51))
        fill = .45*(1-smooth((t-.32)/.54))
        opacity = np.clip(fill + .52*core + .33*shell + .21*channels, 0, .96)
        if self.b:
            # A shell of fire vents around a pocket opening behind the rim.
            eye = smooth((t-.19)/.33) * smooth((size*.68-r+5*n)/21)
            opacity *= 1-.78*eye
        heat = .27 + .65*core + .32*shell + .18*channels + .08*grain - .21*t
        if self.b:
            heat += .15*np.exp(-((curl-.24)/.40)**2)
        img = rgba([255, 88, 5], .23*np.exp(-(np.maximum(-edge,0)/6)**2) *
                   np.clip(fill+shell,0,1)*fade)
        img.alpha_composite(rgba(ramp(heat, FIRE), smooth((edge+2)/4)*opacity*fade))
        flash = np.exp(-(r/(16+8*t))**3) * (1-smooth(t/.27))
        img.alpha_composite(rgba([255, 253, 218], flash))
        sparks = spark_field(x, y, self.embers, t, 118, smooth(t/.20)*(1-.72*t**3))
        img.alpha_composite(rgba(ramp(.96-.40*t + .12*grain, FIRE), sparks))
        return img


class Mortar:
    def __init__(self, b):
        self.b = b
        self.ink = Pigment(914 + b)
        self.gravel = [self.fragment(i, False) for i in range(8)]
        self.shrapnel = [self.fragment(i, True) for i in range(6)]
        self.ejecta = np.random.default_rng(803 + b).random((39, 5))

    def fragment(self, index, metal):
        # Cut an irregular piece from a triangulated solid. Each face gets
        # its own surface normal, chipped edge and shared fine-scale grain.
        rng = np.random.default_rng(1145 + 50*self.b + 10*metal + index)
        x, y = grid(32, 32)
        turn = rng.uniform(0, TAU)
        u = x*np.cos(turn)+y*np.sin(turn)
        v = y*np.cos(turn)-x*np.sin(turn)
        count = rng.integers(5, 9)
        angles = (np.arange(count)+rng.uniform(-.23,.23,count))*TAU/count
        radius = rng.uniform(.78,1.15,count)
        vx = np.cos(angles)*radius*(11 if metal else 10)
        vy = np.sin(angles)*radius*(6.2 if metal else 9)
        verts = np.column_stack((vx, vy))
        # Centre the cut silhouette even if a chipped corner is missing.
        verts -= (verts.min(axis=0)+verts.max(axis=0))/2
        hub = rng.uniform(-2,2,2)
        dx, dy = u-hub[0], v-hub[1]
        z = np.full_like(x, -20)
        contour = np.full_like(x, -20)
        for p1, p2 in zip(verts, np.roll(verts,-1,axis=0)):
            a, b = p1-hub, p2-hub
            det = a[0]*b[1]-a[1]*b[0]
            w = (b[1]*dx-b[0]*dy)/det
            h = (a[0]*dy-a[1]*dx)/det
            sector = (w>=0)&(h>=0)
            lip = 1-w-h
            contour[sector] = lip[sector]*(.5*(np.linalg.norm(a)+np.linalg.norm(b)))
            z[sector] = lip[sector]*(5.2 if metal else 7.4)
        grit = self.ink.grain(x/1.35+index*4, y/1.5)
        grad_y, grad_x = np.gradient(z)
        light = np.clip(.50+.32*grad_x+.42*grad_y+.09*grit,0,1)
        if metal:
            colors = [(25,26,27),(57,57,54),(107,108,103),(190,187,164),(228,224,194)]
        elif self.b:
            colors = [(42,38,34),(69,63,54),(104,96,77),(146,134,105),(187,171,134)]
        else:
            colors = [(48,36,30),(75,56,44),(114,89,65),(154,127,91),(202,177,134)]
        alpha = smooth(contour+.4+.4*grit)
        if metal:
            # Bent strips of casing: broad planar faces, a sheared silver edge,
            # and occasional remnants of enamel or a punched fastener hole.
            fold = v - (.12 + .09*self.b)*u + .25*grit
            value = .30 + .33*smooth(fold+.5) + .18*np.exp(-(fold/.8)**2)
            value += .20*np.exp(-((contour-.7)/.62)**2) + .065*grit
            rgb = ramp(value, colors)
            if index % 3 == 0:
                paint = smooth(1.8-abs(u+4.2+.25*v)) * smooth(.72+.68*grit)
                rgb = rgb*(1-paint[...,None])+np.array([201,155,41])*paint[...,None]
            if index % 3 == 1:
                hole = np.hypot(u+4, v-.9)
                alpha *= smooth(hole-1.0)
                rgb *= (1-.51*np.exp(-((hole-2.15)/.63)**2))[...,None]
        else:
            rgb = ramp(light, colors)
        return rgba(rgb, alpha)

    def shell(self, frame):
        x, y = grid(48, 48)
        p = TAU*(frame % 8)/8
        spin = p + (.67 if self.b else -.35)
        u, v = x*np.cos(spin)+y*np.sin(spin), y*np.cos(spin)-x*np.sin(spin)
        length, width = (15.5, 9) if self.b else (13.8, 11.8)
        # Rounded cast nose, stepped driving band and a recessed fuse socket.
        q = (u/length)**2 + (v/width)**2
        z = np.sqrt(np.maximum(0,1-q))
        angle = np.arctan2(v/width, z) + p
        iron = self.ink.grain(u/2.5+11, np.cos(angle)*6+np.sin(angle)*2.5)
        barrel = .28+.30*z-.18*x/width-.22*y/width+.09*iron
        glint = np.exp(-((x+4)**2+(y+5)**2)/23)
        barrel += .35*glint
        cast = ramp(barrel, [(20,22,24),(45,46,45),(85,83,73),(144,144,126),(219,215,179)])
        bands = abs(u+3.5) - (2.5 if self.b else 1.9)
        if self.b:
            bands = np.minimum(bands,abs(u+9)-.8)
        # Worn hazard enamel follows the curvature around the shell.
        stripe = smooth(.6-bands)*smooth(2.2+.8*iron)
        wear = .14*iron + .15*np.cos(angle) + .10*glint
        enamel = ramp(barrel + wear, [(85,61,9),(145,99,8),(213,158,10),(251,210,49),(255,236,139)])
        rgb = cast*(1-stripe[...,None])+enamel*stripe[...,None]
        groove = .34*np.exp(-((bands-.75)/.48)**2)+.27*np.exp(-((u-7)/.65)**2)
        rgb *= (1-groove[...,None])
        img = rgba(rgb, smooth((1-q)*width+.4))
        # The short fuse follows the orientation of the body. No cast shadow.
        fuse = np.minimum(u-length+1.7, length+4.5-u)
        wire = abs(v-.12*(u-length)**2)
        img.alpha_composite(rgba(ramp(.45+.35*np.sin(2.6*u),[(45,37,26),(132,100,55),(231,183,90)]),
                                 smooth(fuse+1)*smooth(1.35-wire)))
        dx, dy = u-length-3.6, v-1.6
        rad = np.hypot(dx,dy)
        star = np.cos(5*np.arctan2(dy,dx)-p)**8
        img.alpha_composite(rgba([255,128,19], .40*np.exp(-(rad/2.65)**2)))
        img.alpha_composite(rgba([255,239,153],smooth(1.65+(1.4+.4*np.sin(2*p))*star-rad)))
        return img

    def crater(self, variant):
        x, y = grid(128, 128)
        p = 2.3*variant + self.b
        a = np.arctan2(y, x)
        r = np.hypot(x, y*(1.05+.045*variant))
        ink = self.ink
        strata = ink.grain(x/11+17*variant,y/10-7)
        grit = ink.grain(x/2.1+p,y/2.3)
        radius = (34+3*variant)*(1+.095*np.sin(4*a+p)+.062*np.cos(7*a+2*p))
        edge = radius-r + 3.4*strata+1.4*grit
        lip = np.exp(-((edge-1)/(3.7+1.5*smooth(strata)))**2)
        bowl = smooth((edge-2)/13)
        light = .35+.21*strata+.11*grit - .27*bowl
        # The far inner wall catches light, with a darker pocket under the near lip.
        light += lip*(.32+.42*np.cos(a-.8)) + .21*np.exp(-((edge-7)/4)**2)*np.cos(a-.8)
        light -= .19*np.exp(-((edge+4)/3)**2)
        colors = [(28,24,23),(54,42,33),(83,66,48),(132,106,78),(180,152,108)]
        if self.b:
            colors = [(25,26,25),(48,45,39),(78,72,61),(116,107,87),(164,150,120)]
        alpha = smooth((edge+14+3*strata)/14) * (.65+.18*lip+.09*strata)
        img = rgba(ramp(light,colors),alpha)
        # A partial apron of loose stones breaks the raised rim into sections.
        for i, (ray, speed, _, size, _) in enumerate(self.ejecta):
            theta = TAU*ray+p
            rr = (35+variant*3)*(1+.095*np.sin(4*theta+p)+.062*np.cos(7*theta+2*p))
            rr += 1+speed*12
            chip = self.gravel[(i+variant)%8]
            w = int(4+8*size)
            chip = chip.resize((w,w),Image.Resampling.LANCZOS)
            place(img,chip,(64+rr*np.cos(theta),64+rr*np.sin(theta)/(1.05+.045*variant)))
        return img

    def impact(self, frame):
        t = frame/9
        x, y = grid(256,256)
        r = np.hypot(x,y)
        a = np.arctan2(y,x)
        size = 11 + (91 if self.b else 83)*(1-(1-t)**2.25)
        u, v = x/(6+.19*size), y/(6+.19*size)
        cloud = self.ink.noise(u+.7*t,v-.6*t)
        silt = self.ink.grain(2.8*u+.48*cloud,2.8*v+.73*cloud)
        grit = self.ink.grain(8*u+.56*silt,8*v-.3*silt)
        # Dust rises in uneven radial jets and drops into a low, broken veil.
        jets = np.sin((9 if self.b else 6)*a+.8*np.sin(3*a)+.5*cloud)
        edge = size*(.83+.10*jets) - r + size*(.085*cloud+.042*silt)
        bank = np.exp(-((edge-7)/(5+.10*size))**2)
        collar = np.exp(-((r-size*(.57+.07*jets)-5*cloud)/(4+.074*size))**2)
        dust = np.clip(.34+.31*bank+.21*collar+.16*cloud+.14*silt, .055,.89)
        opacity = smooth((edge+6)/13)*dust*(1-.81*smooth((t-.45)/.56))
        lift = .42+.20*cloud+.15*silt+.10*grit+.21*bank-.14*r/size
        colors = ([(48,45,40),(82,78,64),(125,118,96),(170,158,127),(211,197,159)]
                  if self.b else [(53,40,33),(93,71,53),(142,112,80),(186,154,112),(224,199,158)])
        # Exposed soil under the lifted bank and a chalk-lit crest separate
        # the ejecta from pale road surfaces even as the dust thins.
        lift += .25*bank - .48*collar + .08*np.sin(a-2.4)
        img = rgba(ramp(lift,colors),opacity)
        # The pressure wave overtakes the dirt. A dark trough behind the
        # narrow lit crest gives it depth on both light and dark roads.
        wave = 13 + (109 if self.b else 103)*(1-(1-t)**1.9)
        d = r-wave + .85*cloud + 1.1*np.sin(5*a+.8*t)
        strength = (.80-.68*t)*smooth((1.04-t)/.23)*(.25+.75*smooth(t/.13))
        img.alpha_composite(rgba([66,57,46],strength*.50*np.exp(-((d+3.2)/2.7)**2)))
        crest = np.exp(-(d/(1.35+1.1*t))**2)*(.70+.30*smooth(cloud+.5))
        img.alpha_composite(rgba([231,218,177],strength*crest))
        if self.b:
            img.alpha_composite(rgba([190,185,154],.30*strength*np.exp(-((d+7)/1.5)**2)))
        # The flash collapses before the settling dust, with no persistent flame.
        flash = 1-smooth(t/.28)
        img.alpha_composite(rgba([253,214,124], flash*np.exp(-(r/(14+8*t))**2)))
        img.alpha_composite(rgba([255,249,212],flash*np.exp(-(r/7.8)**2)))
        for i,(ray, speed, offset, size, twist) in enumerate(self.ejecta):
            stage = np.clip((t-.045*offset)/(.71+.38*speed),0,1)
            alpha = smooth(t/.13)*(1-smooth((stage-.74)/.26))
            if alpha <= .01:
                continue
            theta = TAU*ray
            rr = (45+71*speed)*(1-(1-stage)**1.55)
            # Slight overhead parallax while tumbling; fixed launch directions.
            cx = 128+rr*np.cos(theta)
            cy = 128+rr*np.sin(theta)-11*size*np.sin(np.pi*stage)
            sprites = self.shrapnel if i%4==0 else self.gravel
            chip = sprites[i%len(sprites)]
            w = int((5+11*size)*(1+.24*np.sin(np.pi*stage)))
            chip = chip.resize((w,w), Image.Resampling.LANCZOS).rotate(
                (stage*280+offset*120)*(2*twist-1),Image.Resampling.BICUBIC,expand=True)
            chip.putalpha(chip.getchannel('A').point(lambda value: round(value*alpha)))
            place(img,chip,(cx,cy))
        return img


def sequence(folder, stem, frames, digits=2):
    folder.mkdir(parents=True, exist_ok=True)
    images = list(frames)
    for i, im in enumerate(images):
        im.save(folder / f'{stem}_{i:0{digits}d}.png')
    return images


def contact_sheet(sections, title):
    width = 1380
    height = 65
    for _, frames in sections:
        count = min(len(frames), (width-48)//(frames[0].width+8))
        rows = (len(frames)+count-1)//count
        height += 33+(frames[0].height+19)*rows+13
    sheet = Image.new('RGB',(width,height),'#26282a')
    draw = ImageDraw.Draw(sheet)
    draw.text((24,18),title,font=ImageFont.load_default(size=22),fill='#f6e7d1')
    y = 65
    for section, frames in sections:
        w, h = frames[0].size
        count = min(len(frames), (width-48)//(w+8))
        draw.line((24,y,width-24,y),fill='#49494a')
        draw.text((24,y+7),section,font=ImageFont.load_default(size=15),fill='#e3ccb0')
        y += 33
        for i, im in enumerate(frames):
            col, row = i%count, i//count
            x = 24+col*(w+8)
            top = y+row*(h+19)
            sheet.paste(im,(x,top),im)
            draw.text((x+2,top+h),f'{i:02}',fill='#b6b2ab')
        y += ((len(frames)+count-1)//count)*(h+19)+13
    return sheet


def render(name):
    folder = ROOT/name
    b = name=='b'
    fire, mortar = Launcher(b), Mortar(b)
    sections = []
    for weapon, stem, count, fn in [
        ('fireball','ball',8,fire.ball), ('fireball','trail',6,fire.trail),
        ('fireball','impact',10,fire.impact), ('mortar','shell',8,mortar.shell),
        ('mortar','impact',10,mortar.impact), ('mortar','crater',3,mortar.crater),
        ('mortar','gravel',8,mortar.gravel.__getitem__), ('mortar','shrapnel',6,mortar.shrapnel.__getitem__),
    ]:
        frames = sequence(folder/weapon,stem,(fn(i) for i in range(count)),1 if stem=='crater' else 2)
        sections.append((f'{weapon.upper()}   /   {stem}',frames))
    title = 'B   /   Caldera & Quarry' if b else 'A   /   Furnace & Earthmover'
    contact_sheet(sections,title).save(folder/'sheet.png')


if __name__ == '__main__':
    for candidate in ('a','b'):
        render(candidate)
