"""Refresh labelled, scripted repaint comparisons after running both render.py files."""
from pathlib import Path
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'puppet-tools'))
from PIL import Image, ImageDraw
from rig import font
root = Path(__file__).resolve().parent.parent
for species in ['skitter', 'glider']:
    directory = root / (species + '-parts')
    comparison = Image.new('RGB', (1280, 704), (22, 22, 20))
    source = Image.open(directory / 'source-colour-frame.png').convert('RGBA')
    comparison.paste(source, (0, 32), source)
    comparison.paste(Image.open(directory / 'assembled-ground.png'), (640, 32))
    d = ImageDraw.Draw(comparison)
    d.text((20, 8), species.upper() + ' · ORIGINAL DARK ROSTER', font=font(18), fill=(240, 228, 215))
    d.text((660, 8), 'SATURATED BLUE WINGS · ORIGINAL BODY' if species == 'glider' else 'STEEL-BLUE CRYSTAL · SAME RIG', font=font(18), fill=(240, 228, 215))
    d.text((20, 676), 'Repainted pixels; every manifest field and native part canvas retained.', font=font(14), fill=(163, 149, 137))
    comparison.save(directory / 'comparison.png')
    # Actual nominal 45px game length; the part frame includes transparent margins.
    Image.open(directory / 'assembled.png').resize((60, 60), Image.Resampling.LANCZOS).save(directory / 'game-scale.png')
