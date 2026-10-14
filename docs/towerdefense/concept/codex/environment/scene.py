"""Manifest-driven overlay sheet and preview from the real integration capture."""
from pathlib import Path
from PIL import Image
import build as assets
HERE = Path(__file__).resolve().parent


def overlays(out):
    kit = assets.Kit(out)
    proof = Image.new('RGBA', (1440, 1680), assets.GROUND)
    assets.text(proof, (30, 22), 'DYNAMO DEFENSE / DYNAMIC OVERLAYS', 29, bold=True)
    assets.text(proof, (30, 66), '27 independent decals and props • matched emissive masks', 17)
    assets.text(proof, (30, 115), 'CREEP / independent pustule emission', 21, bold=True)
    for i in range(6):
        kit.draw(proof, f'creep_{i+1}', (140+i*235, 240), .79)
        assets.text(proof, (80+i*235, 340), f'creep_{i+1}', 15)
    assets.text(proof, (30, 395), 'BURROWS / independently placed spawn mouths', 21, bold=True)
    for i in range(3):
        kit.draw(proof, f'burrow_{i+1}', (170+i*300, 530), .88)
        assets.text(proof, (122+i*300, 645), f'burrow_{i+1}', 15)
    assets.text(proof, (940, 430), 'Glow OFF / complete base art', 16)
    kit.draw(proof, 'creep_1', (1060, 540), .7, glow=False)
    kit.draw(proof, 'burrow_1', (1290, 540), .7, glow=False)
    assets.text(proof, (30, 690), 'SPLATS / neutral masters and four brood tints', 21, bold=True)
    for row, (name, tint) in enumerate([('neutral', None), *assets.COLORS.items()]):
        y = 770+row*104
        assets.text(proof, (32, y+28), name.upper(), 14, color=tint or (180, 180, 180), bold=True)
        for col in range(6):
            kit.draw(proof, f'splat_{col+1}', (217+col*220, y+30), .60,
                     glow=tint is not None, tint=tint)
    assets.text(proof, (30, 1270), 'PROPS / steel, brass, rock and canvas', 21, bold=True)
    for i, name in enumerate(assets.PROPS):
        x, y = 170+(i%4)*355, 1345+(i//4)*105
        kit.draw(proof, 'props_'+name, (x, y), .65)
        assets.text(proof, (x-100, y+51), name.replace('_', ' '), 15)
    proof.save(HERE/'overlays-full.png', optimize=True)
    # Proof display only; individual runtime cutouts retain their accepted PNGs.
    small = proof.resize((864, 1008), assets.LANCZOS)
    assets.save(small, out/'overlays-preview.png', 128)


def render(out):
    # The primary proof is the real browser integration, never a regenerated scene.
    proof = HERE/'mockups/curved-wiring/real-sprites.png'
    if proof.exists():
        preview = Image.open(proof).convert('RGB').resize((864, 648), assets.LANCZOS)
        assets.save(preview, out/'preview.png', 256)
    overlays(out)
