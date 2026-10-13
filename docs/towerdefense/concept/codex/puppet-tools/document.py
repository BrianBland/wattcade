"""Validate exported sets, make the review board and write exact inventories."""
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from anatomy import SPECS
from rig import Puppet, font, GROUND

HERE = Path(__file__).resolve().parent
OUT = HERE.parent


def run():
    summaries=[]
    for name,spec in SPECS.items():
        directory=OUT/(name+'-parts')
        p=Puppet(directory);p.validate_files()
        report=json.loads((directory/'validation.json').read_text())
        assert not report['gapJoints'] and not report['clippedPoses']
        assert report['greenFringePixels']==0 and report['outsideParentUnderlapPixels']==0
        assert report['partCount']==len(p.parts)==report['glowCount']
        if name in ['skitter','stalker','hive-tyrant']:
            assert report['tailSegmentCount']=={'skitter':8,'stalker':8,'hive-tyrant':10}[name]
        if name=='glider':
            assert 'wing_l' in p.parts and 'wing_r' in p.parts
            assert p.parts['wing_l']['parent']==p.parts['wing_r']['parent']
        if name=='broodmother':assert p.parts['egg_sac']['group']=='sac'
        if name=='hive-tyrant':
            assert 'crest' in p.parts
            assert sum(x['group']=='arm' for x in p.parts.values())==3
        for part in p.parts.values():
            if 'end' in p.parts.get(part['parent'],{}):
                assert part['pivot']==p.parts[part['parent']]['end']
        checks=sum(len(x) for x in report['poses'].values())
        data=dict(species=name,parts=len(p.parts),glowLayers=len(p.glow),
                  instances=len(p.nodes),tailLinks=report['tailSegmentCount'],
                  jointChecks=checks,flaggedJoints=0,
                  directory=str(directory.relative_to(OUT)))
        summaries.append(data)
        roots=sorted(x.name for x in directory.iterdir() if x.is_file() and x.name!='NOTES.md')+['NOTES.md']
        lines=[f'# {name.replace("-"," ").title()} puppet','',
               'Art: original OpenAI `image_gen.imagegen` roster from commit `0f5539c`; model identifier was not exposed. All visible colour textures are roster pixels, resampled and masked with Pillow/NumPy/SciPy. No creature was repainted.',
               'Anatomy: '+spec['description'],
               f'{len(p.parts)} source parts, {len(p.glow)} matching glow layers, {len(p.nodes)} assembled instances. Frame 640×640; nominal length 480px. Source right appendages are mirrored, except Glider has two explicit original wings.',
               f'Checks: {checks} parent/child contacts at the required ±20° appendage and ±6° body/tail poses, plus ±25°/±8° limits and crossed combinations. **No joint gaps observed or flagged.** No clipped diagnostic pose or green fringe. Probes follow tissue thickness (1px for thin tails). Added underlap pixels outside opaque parent silhouettes: 0.',
               'Lighting limitation: original baked highlights retain some lateral bias; strict 12 oclock relighting remains approximate. Thin dark material uses reviewed masks; original dark contours remain. Source masks and thresholds are available for further edge painting.',
               'Rebuild: `python build.py && python render.py` here; shared code lives in `../puppet-tools/` and requires Pillow, NumPy, SciPy. All previews are scripted from the manifest. Glow blends additively; zero-energy masks are provided for unlit parts.']
        if name=='stalker':
            lines.append('Stalker glow: all nontransparent glow RGB pixels are [255,255,255]. Tint only that layer for blue → red → purple; base chitin is shared unchanged. `assembled.png` reconstructs source hues for reference comparison; `glow-cycle.png` demonstrates game tints.')
        lines+=['','## Produced files']
        for i in range(0,len(roots),3):lines.append('- '+'; '.join('`'+x+'`' for x in roots[i:i+3]))
        names=list(p.parts)
        for i in range(0,len(names),2):
            pairs=[]
            for n in names[i:i+2]:pairs.append(f'`parts/{n}.png`, `parts/{n}_glow.png`')
            lines.append('- '+'; '.join(pairs))
        assert len(lines)<=40,(name,len(lines))
        text='\n'.join(lines)+'\n'
        (directory/'NOTES.md').write_text(text)
        actual=[str(x.relative_to(directory)) for x in directory.rglob('*') if x.is_file()]
        assert all('`'+x+'`' in text for x in actual),(name,'unlisted produced file')
        data['files']=actual

    order=['skitter','glider','warrior','ram','bulwark','broodmother','stalker','hive-tyrant']
    board=Image.new('RGBA',(1600,880),GROUND);draw=ImageDraw.Draw(board)
    for i,n in enumerate(order):
        image=Image.open(OUT/(n+'-parts')/'assembled.png').convert('RGBA')
        image.thumbnail((400,400),Image.Resampling.LANCZOS)
        x,y=(i%4)*400,(i//4)*440
        board.alpha_composite(image,(x,y+20))
        draw.text((x+16,y+416),n.replace('-',' ').upper(),font=font(18),fill=(240,228,215))
    board.convert('RGB').save(HERE/'overview.png')
    result=dict(source='roster-source.png',branch='codex/warrior-parts',species=summaries,
                totalSourceParts=sum(x['parts'] for x in summaries),
                totalGlowLayers=sum(x['glowLayers'] for x in summaries),
                totalJointChecks=sum(x['jointChecks'] for x in summaries),flaggedJoints=0)
    (HERE/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
    lines=['# Remaining roster puppets','',
           'The seven sets preserve the original generated roster artwork and use anatomy-specific joints. The existing Warrior is included unchanged on `overview.png` for comparison. No game code changed.',
           'Art source: OpenAI `image_gen.imagegen`; model identifier not exposed. Original roster commit: `0f5539c`. Python/Pillow/NumPy/SciPy produce the source crops, transparent cutouts, glow masks, manifests and scripted tests.',
           f'{result["totalSourceParts"]} source parts and matching glow layers; {result["totalJointChecks"]} joint-contact checks pass with no flagged gaps, clipping or green fringe.',
           'Use `python -B build_all.py` then `python -B document.py` here to reproduce all seven. A species name can restrict the build. Each set also has build.py/render.py wrappers and a NOTES.md listing every actual output.',
           'Original baked highlights remain slightly oblique. Glider wing membranes preserve source holes; Stalker glow masks are white and only glow is tinted; tails are 8/8/10 links; Broodmother sac and Tyrant crest/three-section scythe arms are independently articulated.',
           '', '| Creature | Parts | Tail links | Folder |','| --- | ---: | ---: | --- |']
    for item in summaries:lines.append(f'| {item["species"]} | {item["parts"]} | {item["tailLinks"]} | `../{item["directory"]}/` |')
    lines+=['','Shared files produced: `anatomy.py`, `build_all.py`, `rig.py`, `document.py`, `roster-source.png`, `overview.png`, `summary.json`, `NOTES.md`.']
    (HERE/'NOTES.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='species'},indent=2))


if __name__=='__main__':run()
