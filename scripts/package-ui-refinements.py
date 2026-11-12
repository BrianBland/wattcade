"""Build shareable review sheets from actual before/after browser captures."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
OUT=Path('docs/visual-polish/arcade-refinements')
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BG,FG,DIM,GOLD='#0b1b25','#fff4dc','#a7bdc6','#efca70'
def label(draw,xy,value,size=16,color=FG,bold=False):
    draw.text(xy,value,font=ImageFont.truetype(BOLD if bold else FONT,size),fill=color)
def picture(path,width):
    pic=Image.open(OUT/path).convert('RGB')
    return pic.resize((width,round(pic.height*width/pic.width)),Image.Resampling.LANCZOS)
def comparison(view,width,title,note):
    pics=[picture(f'{v}/{view}-{width}.png',390 if width==390 else 590) for v in ['before','after']]
    sheet=Image.new('RGB',(sum(p.width for p in pics)+80,max(p.height for p in pics)+180),BG);d=ImageDraw.Draw(sheet)
    label(d,(28,20),title,26,bold=True);label(d,(28,62),note,14,DIM)
    x=28
    for name,p in zip(['Before / main after #203','After / arcade refinements'],pics):
        label(d,(x,100),name,15,GOLD,True);sheet.paste(p,(x,130));x+=p.width+24
    label(d,(28,sheet.height-30),'Actual production components / same viewport and review fixture',12,DIM)
    sheet.save(OUT/f'{view}-comparison.png');return sheet
pages=[comparison('pause',390,'Pause / ride actions first','Resume and End ride share the top row. Controls use aligned value wells.'),
comparison('connect',390,'Connections / status at a glance','Absent peripherals stay explicit; connected devices use mint.'),
comparison('riders',1180,'Riders / bounded pixel artwork','Square portraits keep the rider proportionate on landscape screens.'),
comparison('arcade',1180,'Arcade / lighter cards, clear browsing','Swipe or arrow keys change selection; small orange details add warmth.'),
comparison('controls',390,'Controls / consistent chrome','Readable labels and the same shallow keys as the rest of the menus.'),
comparison('reward',390,'Rewards / gold selection, purple atmosphere','Gold marks the choice. Purple belongs to labels and the rider backdrop.')]
pages[0].save(OUT/'ui-review.pdf',save_all=True,append_images=pages[1:],resolution=120)
print('Packaged six comparisons and ui-review.pdf')
