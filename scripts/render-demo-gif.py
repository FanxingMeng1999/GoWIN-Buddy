"""Compose an app-only demonstration GIF from capture-demo.cjs frames."""
import argparse, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

p=argparse.ArgumentParser();p.add_argument('frames');p.add_argument('--output',default='docs/media/demo.gif');a=p.parse_args()
frames=Path(a.frames);root=Path(__file__).resolve().parents[1]
labels=json.loads((frames/'scenes.json').read_text(encoding='utf-8'))
# System fonts are used for raster captions; no font files are redistributed.
def font(size):
    for candidate in ['C:/Windows/Fonts/segoeui.ttf','C:/Windows/Fonts/arial.ttf']:
        try:return ImageFont.truetype(candidate,size)
        except OSError:pass
    return ImageFont.load_default()
def fitted(im,width,height):
    im=im.convert('RGBA');im.thumbnail((width,height),Image.Resampling.LANCZOS);return im
result=[]
for i,label in enumerate(labels):
    canvas=Image.new('RGB',(1080,690),'#eef7f0');d=ImageDraw.Draw(canvas)
    d.text((36,24),'GoWIN!Buddy',font=font(34),fill='#254a44')
    d.text((38,74),label,font=font(19),fill='#27856f')
    if label.startswith('Check in'):
        im=fitted(Image.open(root/'docs/media/dashboard-rpg.png'),1008,540)
        canvas.paste(im,((1080-im.width)//2,116),im)
    else:
        d.rounded_rectangle((36,117,334,640),radius=26,fill='#daefdf')
        im=fitted(Image.open(frames/('pet-%d.png'%i)),270,310)
        canvas.paste(im,(36+(298-im.width)//2,220+(310-im.height)//2),im)
        d.text((80,565),'Sprout Buddy',font=font(23),fill='#254a44')
        panel=fitted(Image.open(frames/('panel-%d.png'%i)),680,528)
        canvas.paste(panel,(365+(680-panel.width)//2,117),panel)
    d.text((38,657),'Actual app capture / Fictional demo tasks / Windows',font=font(14),fill='#567169')
    result.append(canvas.convert('P',palette=Image.Palette.ADAPTIVE,colors=128))
output=Path(a.output);output.parent.mkdir(parents=True,exist_ok=True)
result[0].save(output,save_all=True,append_images=result[1:],duration=[280 if not s.startswith('Check in') else 440 for s in labels],loop=0,optimize=True,disposal=2)
print('GIF: %d frames, %d bytes' % (len(result),output.stat().st_size))
