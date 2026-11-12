"""Package real browser captures; no UI pixels or colors are retouched."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path('docs/visual-polish/accent-revision')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BG, INK, MUTED, GOLD = '#0b1b25', '#fff4dc', '#a7bdc6', '#efca70'

def text(draw, xy, label, size=16, color=INK, bold=False):
    draw.text(xy, label, fill=color, font=ImageFont.truetype(BOLD if bold else FONT, size))

def sheet(title, subtitle, labels, captures, width=None):
    pics = [Image.open(OUT / f'{name}.png').convert('RGB') for name in captures]
    if width:
        pics = [pic.resize((width, round(pic.height * width / pic.width)), Image.Resampling.LANCZOS) for pic in pics]
    margin, gap, top = 28, 24, 144
    canvas = Image.new('RGB', (sum(p.width for p in pics) + margin * 2 + gap, max(p.height for p in pics) + top + 60), BG)
    draw = ImageDraw.Draw(canvas)
    text(draw, (margin, 22), title, 27, bold=True)
    text(draw, (margin, 66), subtitle, 15, MUTED)
    x = margin
    for label, pic in zip(labels, pics):
        text(draw, (x, 112), label, 15, GOLD, bold=True)
        canvas.paste(pic, (x, top))
        x += pic.width + gap
    text(draw, (margin, canvas.height - 36), 'Wattcade / production components / selection color study', 13, MUTED)
    return canvas

pages = [
    ('revised-examples', sheet('Gold selects. Purple sets the scene.',
        'Gold: selection + actions   /   Purple: labels + atmosphere   /   Mint: equipped',
        ['Locker / revised', 'Rewards / revised'], ['locker-390-revised', 'reward-390-revised'])),
    ('locker-comparison', sheet('Locker / selection color comparison',
        'Only the selection colors change. Purple remains in the rider backdrop.',
        ['Previous approach (recreated)', 'Revised / gold selection'],
        ['locker-1180-previous', 'locker-1180-revised'], 590)),
    ('reward-comparison', sheet('Rewards / selection color comparison',
        'Gold connects the chosen reward to its action. Category labels stay purple.',
        ['Previous approach (recreated)', 'Revised / gold selection'],
        ['reward-390-previous', 'reward-390-revised'])),
    ('reward-desktop-comparison', sheet('Rewards / desktop comparison',
        'The same color roles and shallow button treatment carry across screen sizes.',
        ['Previous approach (recreated)', 'Revised / gold selection'],
        ['reward-1180-previous', 'reward-1180-revised'], 590)),
]
for name, page in pages:
    page.save(OUT / f'{name}.png')
pages[0][1].save(OUT / 'accent-revision.pdf', save_all=True, append_images=[p for _, p in pages[1:]], resolution=120)
print(f'Packaged {len(pages)} sheets and accent-revision.pdf')
