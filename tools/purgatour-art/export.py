"""Exports every Purgatour sprite and zone kit as PNG atlases plus atlas.json for the game renderer.

    python3 tools/purgatour-art/export.py        (needs Pillow; writes src/games/dungeon/render/art32/)

All art is hand-authored in the modules next to this file (master palette in pal.py, light from the top left,
characters fully outlined). The game never generates art at runtime; it only cuts frames out of these sheets,
recolours nothing except hit flashes, and lights the result."""
import os, sys, json, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image
import pal, keep, zones, motifs, compose, inlays
import chars as CH, chars2 as CH2, gear as GR, enemies3 as E3, bosses as BO, shrines as SH, arsenal as AR, tiers as TI, loot as LO

OUT = os.path.join(HERE, '..', '..', 'src', 'games', 'dungeon', 'render', 'art32')
os.makedirs(OUT, exist_ok=True)
ZONES = ['keep', 'crypt', 'catacombs', 'deep']   # world.theme 0..3
TEX = 512

class Sheet:
    """shelf packer: add(name, img) -> rect; save() writes the PNG"""
    def __init__(s, width): s.w = width; s.items = []; s.rects = {}
    def add(s, name, im):
        s.items.append((name, im)); return name
    def pack(s):
        x = y = rowh = 0; placed = []
        for name, im in s.items:
            if x + im.width > s.w: x = 0; y += rowh + 1; rowh = 0
            placed.append((name, im, x, y)); s.rects[name] = [x, y, im.width, im.height]
            x += im.width + 1; rowh = max(rowh, im.height)
        s.im = Image.new('RGBA', (s.w, y + rowh))
        for name, im, x, y in placed: s.im.alpha_composite(im, (x, y))
    def save(s, fn):
        s.pack(); s.im.save(os.path.join(OUT, fn), optimize=True); return s.rects

def stone_ramp(): return [pal.PAL[i] for i in range(12)]
def hexs(c): return '#%02x%02x%02x' % c[:3]

def stairs_img():
    im = Image.new('RGBA', (32, 32)); px = im.load(); C = pal.C
    for y in range(32):
        for x in range(32): px[x, y] = C(1)
    for i in range(6):
        y = 2 + i * 5; t = [(7, 6, 4), (6, 5, 3), (5, 4, 2), (4, 3, 2), (3, 2, 1), (2, 1, 0)][i]
        for x in range(3 + i // 2, 29 - i // 2):
            px[x, y] = C(t[0]); px[x, y + 1] = C(t[1]); px[x, y + 2] = C(t[1]); px[x, y + 3] = C(t[2]); px[x, y + 4] = C(t[2])
    for y in range(32):
        for x in (0, 1, 2): px[x, y] = C((7, 6, 5)[x])
        for x in (29, 30, 31): px[x, y] = C((3, 4, 2)[x - 29])
    for x in range(32): px[x, 0] = C(7); px[x, 1] = C(5)
    return im

def zone_sheet(z):
    zones.use(z); ramp = stone_ramp()
    if z == 'keep':
        fl = Image.new('RGBA', (TEX, TEX))
        for ty in range(TEX // 32):
            for tx in range(TEX // 32): fl.alpha_composite(keep.floor_tile(tx, ty), (tx * 32, ty * 32))
        face = keep.wall_strip(TEX)
        door_open, door_locked = keep.door('open'), keep.door('locked')
    elif z == 'crypt':
        fl = zones.floor_crypt(TEX, TEX); face = zones.wall_crypt(TEX, [(48, 'urn'), (208, 'skull'), (336, 'urn'), (464, 'helmet')])
        door_open, door_locked = zones.door_crypt('open'), zones.door_crypt('locked')
    elif z == 'catacombs':
        fl = zones.floor_catacombs(TEX, TEX); face = zones.wall_catacombs(TEX, wheels=(240,))
        door_open, door_locked = zones.door_catacombs('open'), zones.door_catacombs('locked')
    else:
        fl = zones.floor_deep(TEX, TEX); face = zones.wall_deep(TEX)
        door_open, door_locked = zones.door_deep('open')[0], zones.door_deep('locked')[0]
    every = lambda x, y: 0 <= x < TEX and 0 <= y < TEX
    compose.compose(fl, ramp, every, lambda x, y: 99, seed=len(z) * 7)
    idx = {c[:3]: i for i, c in enumerate(ramp)}
    dark = fl.copy(); dp = dark.load()
    for y in range(TEX):
        for x in range(TEX):
            i = idx.get(dp[x, y][:3])
            if i is not None: dp[x, y] = ramp[max(0, i - 1)]
    top = Image.new('RGBA', (TEX, TEX), ramp[1]); compose.tops(top, ramp, lambda tx, ty: True, lambda tx, ty: False)
    S = Sheet(TEX * 3)
    S.add('floor', fl); S.add('floorDark', dark); S.add('top', top); S.add('face', face)
    S.add('doorOpen', door_open); S.add('doorLocked', door_locked); S.add('stairs', stairs_img()); S.add('chest', keep.chest())
    # the zone's light source on PILLAR tiles, its wall torch, decor scattered by the renderer, and wall hangings
    light = {'keep': ('brazier', 'flame'), 'crypt': ('brazier', 'gflame'), 'catacombs': ('skullCandle', 'candle'), 'deep': ('crystal', 'crystal')}[z]
    if z == 'deep': S.add('light', zones.crystal_big(3, 1.5))
    elif z == 'catacombs':
        base = Image.new('RGBA', (16, 22)); base.alpha_composite(zones.skull_candle(), (4, 0)); base.alpha_composite(keep.pillar().crop((6, 48, 22, 62)).resize((16, 13)), (0, 9))
        S.add('light', zones.skull_candle())
    else: S.add('light', zones.brazier())
    S.add('flame', keep.flames() if z == 'keep' else zones.flames_tinted(('#1a5a5a', '#3ac0b0', '#9af0e0', '#effffa')) if z == 'crypt' else keep.flames())
    S.add('torch', keep.torch_bracket() if z != 'deep' else zones.crystal(1))
    decor = {
        'keep': [('barrel', keep.barrel()), ('crate', keep.crate()), ('candelabra', keep.candelabra()), ('pillar', keep.pillar()), ('borne', motifs.borne(23))],
        'crypt': [('urn', zones.urn()), ('candles', zones.candles()), ('sarcophagus', zones.sarcophagus()), ('tomb', zones.sarcophagus(True)), ('coffin', zones.coffin())],
        'catacombs': [('skulls', zones.skull_pile()), ('sack', zones.sack()), ('skullCandle', zones.skull_candle()), ('borne', motifs.borne(21))],
        'deep': [('stalagmite0', zones.stalagmite(0)), ('stalagmite1', zones.stalagmite(1)), ('stalagmite2', zones.stalagmite(2)), ('glowcaps', zones.mushrooms()), ('crystalS', zones.crystal(2)), ('crystalM', zones.crystal_big(4)), ('crystalL', zones.crystal_big(6, 1.6))],
    }[z]
    for n, im in decor: S.add('decor:' + n, im)
    hang = {'keep': [('banner', keep.banner()), ('wheel', motifs.wall_wheel())], 'crypt': [('cobweb', zones.cobweb())], 'catacombs': [], 'deep': []}[z]
    for n, im in hang: S.add('hang:' + n, im)
    # flat floor details painted under everything (the renderer scatters them per room)
    flip = lambda im: im.transpose(Image.FLIP_LEFT_RIGHT)
    common = [('rubble', keep.decal_rubble()), ('broken', keep.decal_broken())]
    decals = {
        'keep': common + [('grate', keep.decal_grate()), ('carpet', keep.carpet(44, 320)), ('rosette', inlays.rosette())],
        'crypt': common + [('bones', zones.bones_decal()), ('bonesF', flip(zones.bones_decal())), ('ledger', inlays.ledger(True, 1)), ('ledger2', inlays.ledger(False, 2))],
        'catacombs': common + [('bones', zones.bones_decal()), ('bonesF', flip(zones.bones_decal())), ('chalk', motifs.chalk('ALLEZ', 9, seed=2)), ('mosaic', inlays.mosaic())],
        'deep': common + [('wheel', zones.wheel_relic()), ('frame', motifs.frame_relic()), ('fissure', inlays.fissure()), ('fissure2', inlays.fissure(7, 60, 26)), ('rune', inlays.rune()), ('shards', zones.shard_floor(1, 60, 36, 14)), ('shards2', zones.shard_floor(5, 44, 30, 9)), ('shards3', zones.shard_floor(9, 84, 48, 22))],
    }[z]
    for n, im in decals: S.add('decal:' + n, im)
    # wall-face variants: whole 32 x 48 face tiles with a feature built into the masonry
    if z == 'crypt': fv = zones.wall_crypt(128, [(16, 'urn'), (48, 'skull'), (80, 'helmet'), (112, 'skull')])
    elif z == 'catacombs': fv = zones.wall_catacombs(96, wheels=(48,)).crop((32, 0, 64, 48))
    else: fv = None
    nfv = 0
    if fv is not None: S.add('faceVar', fv); nfv = fv.width // 32
    rects = S.save(f'zone-{z}.png')
    zones.use('keep')
    return dict(rects=rects, ramp=[hexs(c) for c in ramp], lightKind=light[0], flameKind=light[1], decor=[n for n, _ in decor], hang=[n for n, _ in hang], decals=[n for n, _ in decals], faceVar=nfv)

def chars_sheet():
    S = Sheet(1024); meta = {}
    def strip(name, frames, ax=None, ay=None):
        for i, im in enumerate(frames): S.add(f'{name}:{i}', im)
        w, h = frames[0].size
        meta[name] = dict(n=len(frames), w=w, h=h, ax=ax if ax is not None else w // 2, ay=ay if ay is not None else h - 3)
    for sname, g in GR.STANCES.items():
        g = dict(g); g.pop('wpn', None); key = g.get('stance', 'scout')
        for f in 'dru': strip(f'hero.{key}.{f}', [GR.hero_geared(f, fr, **g) for fr in range(4)])
    strip('chaser', [CH.coneling(i) for i in range(4)]); strip('chaser.atk', [CH.coneling(2)])
    strip('bat', [CH.saddle_sore(i) for i in range(3)]); strip('bat.atk', [CH.saddle_sore(1)])
    hop = [CH.gel_hop(i) for i in range(10)]
    strip('spitter', [h[0] for h in hop], ax=20, ay=28); meta['spitter']['heights'] = [h[1] for h in hop]
    strip('spitter.atk', [CH.gel_slime(0, True)])
    strip('archer', [CH2.lost_rider(i) for i in range(2)]); strip('archer.atk', [CH2.lost_rider(1)])
    strip('bomber', [CH2.co2_gremlin(i) for i in range(2)]); strip('bomber.atk', [CH2.co2_gremlin(2)])
    strip('brute', [E3.wrench_troll(i) for i in range(2)], ay=45); strip('brute.atk', [E3.wrench_troll(0, True)], ay=45)
    strip('summoner', [E3.directeur(i) for i in range(2)]); strip('summoner.atk', [E3.directeur(0, True)])
    for i, (n, fn) in enumerate(BO.BOSSES):
        ay = {5: 54, 6: 93}.get(i, 61)
        strip(f'boss{i}', [fn(0), fn(1)], ay=ay); strip(f'boss{i}.atk', [fn(0, True)], ay=ay)
    strip('puff', [CH.puff(i) for i in range(5)]); strip('down', [CH.hero_down(i) for i in range(3)])
    strip('goo', [CH.goo_trail(0)], ay=4)
    for k in ('fury', 'endurance', 'sprint', 'whirl'): strip(f'shrine.{k}', [SH.shrine(k, f) for f in range(4)], ay=38)
    cols = dict(frenzy='#ff5a5a', hexed='#c05aff', swarm='#ffb02a', darkness='#6a6aff', mire='#7a9a3a', fragile='#ff6b8a', bulwark='#9aa3b5')
    for k, c in cols.items(): strip(f'sigil.{k}', [SH.sigil(k, c)], ay=6)
    # pickups and enemy shots
    strip('coin', [LO.chainring(i) for i in range(4)]) if hasattr(LO, 'chainring') else None
    strip('ebullet', [LO.bullet(3, i) for i in range(2)], ay=None)
    meta['ebullet']['ay'] = meta['ebullet']['h'] // 2
    # drops: the bidon heals; gear slots get their own icon (rarity shows as the ring under the drop)
    for n, im in (('potion', LO.art_l(LO.BIDON)), ('key', LO.art_l(LO.KEY)), ('helm', LO.helmet()), ('armor', LO.art_l(LO.JERSEY)),
                  ('boots', LO.art_l(LO.SHOE)), ('ring', LO.ring())): strip(f'item.{n}', [im])
    rects = S.save('chars.png')
    return dict(rects=rects, anims=meta)

def arsenal_sheet():
    S = Sheet(1024); held = {}; proj = {}
    for st in AR.WEAPONS:
        for t in range(3):
            for e in AR.ELEM:
                for r in range(6):
                    im, grip = TI.held_t(st, e, t, r); n = f'{st}.{t}.{e}.{r}'; S.add(n, im); held[n] = grip
                fr = TI.proj_t(st, e, t, 2)
                for i, f in enumerate(fr): S.add(f'p:{st}.{t}.{e}:{i}', f)
                proj[f'{st}.{t}.{e}'] = len(fr)
    rects = S.save('arsenal.png')
    return dict(rects=rects, grip=held, proj=proj, muzzle={st: [list(TI.muzzle_t(st, t)) for t in range(3)] for st in AR.WEAPONS})

if __name__ == '__main__':
    A = dict(zones={z: zone_sheet(z) for z in ZONES}, chars=chars_sheet(), arsenal=arsenal_sheet(),
             amb=dict(keep=[.58, .55, .68], crypt=[.50, .54, .68], catacombs=[.56, .50, .48], deep=[.40, .37, .48]),
             tile=32, faceH=48, rise=16)
    json.dump(A, open(os.path.join(OUT, 'atlas.json'), 'w'), separators=(',', ':'))
    for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)))
