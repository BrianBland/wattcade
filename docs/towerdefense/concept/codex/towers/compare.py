"""Compare the actual concept crops with the actual manifest assemblies.

python -B compare.py --previous /tmp/tower-v1/docs/towerdefense/concept/codex/towers/export
The previous export is optional; it can be recovered from git commit d387e13.
"""
import argparse
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from PIL import Image, ImageDraw, ImageFont
from build import HERE, GROUND, render

CONCEPT_CROPS = {
    ('tesla', 1): (100, 25, 395, 295),
    ('tesla', 5): (1180, 15, 1510, 295),
    ('mortar', 1): (70, 330, 365, 620),
    ('mortar', 5): (1200, 340, 1525, 620),
    ('prism', 1): (100, 650, 390, 915),
    ('prism', 5): (1200, 645, 1525, 920),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    reference = Image.open(HERE / 'reference-towers.png').convert('RGBA')
    columns = ['ORIGINAL CONCEPT'] + (['FIRST PASS'] if args.previous else []) + ['REVISED PUPPET']
    sheet = Image.new('RGBA', (len(columns) * 330 + 110, 60 + 6 * 285), GROUND)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=17)
    for col, text in enumerate(columns):
        draw.text((110 + col * 330 + 55, 16), text, font=font, fill='#e6daca')
    for row, ((tower, level), crop) in enumerate(CONCEPT_CROPS.items()):
        y = 60 + row * 285
        draw.text((8, y + 115), f'{tower.upper()}\nL{level}', font=font, fill='#e6daca')
        concept = reference.crop(crop)
        concept.thumbnail((310, 260), Image.Resampling.LANCZOS)
        sheet.alpha_composite(concept, (110 + (330 - concept.width) // 2, y + (260 - concept.height) // 2))
        dirs = ([args.previous] if args.previous else []) + [HERE / 'export']
        for col, directory in enumerate(dirs, 1):
            pose, _ = render(directory / tower, level, 0)
            sheet.alpha_composite(pose.resize((260, 260), Image.Resampling.LANCZOS),
                                  (110 + col * 330 + 35, y))
    sheet.convert('RGB').save(HERE / 'comparison.png', optimize=True)
    lineup = Image.new('RGBA', (1000, 690), GROUND)
    labels = ImageDraw.Draw(lineup)
    for col, tower in enumerate(('tesla', 'mortar', 'prism')):
        for row, level in enumerate((1, 5)):
            x, y = 20 + col * 325, 15 + row * 340
            labels.text((x + 110, y), f'{tower.upper()} L{level}', font=font, fill='#e6daca')
            pose, _ = render(HERE / 'export' / tower, level, 0)
            lineup.alpha_composite(pose.resize((310, 310), Image.Resampling.LANCZOS), (x, y + 25))
    lineup.convert('RGB').save(HERE / 'revised-lineup.png', optimize=True)
    print(HERE / 'comparison.png')


if __name__ == '__main__':
    main()
