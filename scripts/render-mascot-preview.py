"""Encode a runtime-art preview and export transparent, aspect-preserving mascot PNGs."""
from pathlib import Path
import argparse,json
from PIL import Image,ImageChops,ImageDraw,ImageFont

p=argparse.ArgumentParser()
p.add_argument('frames', nargs='?', default='tmp/output/playwright/mascot-preview-v3/frames')
p.add_argument('--output', default='docs/media/mascot-preview-v3.gif')
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
folder=Path(a.frames)
if not folder.is_absolute():folder=root/folder
out=Path(a.output)
if not out.is_absolute():out=root/out
manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
paths=sorted(folder.glob('frame-*.png'))
if len(paths)!=manifest['frames']:raise SystemExit('Incomplete frame sequence')
images=[Image.open(path).convert('RGB') for path in paths]
starts=[];index=0
for phase in manifest['phases']:
    starts.append(index)
    left=images[index].crop((30,105,1090,555))
    right=images[index+6].crop((30,105,1090,555))
    if not ImageChops.difference(left,right).getbbox():raise SystemExit('No movement in '+phase['state'])
    index+=phase['frames']
sample=Image.new('RGB',(images[0].width*len(starts),images[0].height))
for i,start in enumerate(starts):sample.paste(images[start],(i*images[0].width,0))
palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
frames=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in images]
out.parent.mkdir(parents=True,exist_ok=True)
frames[0].save(out,save_all=True,append_images=frames[1:],duration=manifest['frameDuration'],loop=0,optimize=True,disposal=1)
frames[0].convert('RGB').save(out.with_suffix('.png'))
# The source SVGs are rasterized before export. Alpha crop plus uniform fit preserves anatomy.
exports=root/'assets/brand/extracted/png'
for source in sorted((folder/'characters').glob('*.png')):
    im=Image.open(source).convert('RGBA');bounds=im.getbbox()
    if not bounds:raise SystemExit('Transparent character export: '+source.name)
    im=im.crop(bounds);im.thumbnail((328,328),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(384,384));canvas.alpha_composite(im,((384-im.width)//2,(384-im.height)//2))
    canvas.save(exports/('mascot_'+source.name))
# A larger crab cutout lets the reference character's body and pincers be inspected quickly.
crab=[]
font_file=Path('C:/Windows/Fonts/msyh.ttc')
font=ImageFont.truetype(str(font_file),17) if font_file.is_file() else ImageFont.load_default()
label=ImageFont.truetype(str(font_file),13) if font_file.is_file() else ImageFont.load_default()
phase_index=0;phase_end=manifest['phases'][0]['frames']
for i,im in enumerate(images):
    if i>=phase_end:
        phase_index+=1;phase_end+=manifest['phases'][phase_index]['frames']
    crop=im.crop((683,119,866,260)).resize((457,352),Image.Resampling.LANCZOS)
    canvas=Image.new('RGB',(500,460),'#f4f7f0');canvas.paste(crop,(21,47))
    draw=ImageDraw.Draw(canvas)
    draw.text((28,16),'蔷薇蟹 · 圆润立体重绘',font=font,fill='#24453f')
    draw.text((28,410),'待机 / 工作 / 开心 / 休息',font=label,fill='#718777')
    draw.text((392,17),manifest['phases'][phase_index]['zh'],font=font,fill='#718777')
    crab.append(canvas)
crab_palette=crab[0].quantize(colors=256,method=Image.Quantize.MEDIANCUT)
crab_frames=[im.quantize(palette=crab_palette,dither=Image.Dither.NONE) for im in crab]
crab_out=out.parent/'rosy-crab-preview-v3.gif'
crab_frames[0].save(crab_out,save_all=True,append_images=crab_frames[1:],duration=manifest['frameDuration'],loop=0,optimize=True,disposal=1)
for path in (out,crab_out):
    with Image.open(path) as gif:
        if gif.info.get('loop')!=0 or gif.n_frames<10:raise SystemExit('Invalid looping preview')
        duration=0
        for i in range(gif.n_frames):gif.seek(i);duration+=gif.info.get('duration',0)
        if duration!=manifest['frames']*manifest['frameDuration']:raise SystemExit('Wrong preview duration')
        print(json.dumps({'file':path.relative_to(root).as_posix(),'pixels':gif.size,'encodedFrames':gif.n_frames,'durationMs':duration,'bytes':path.stat().st_size}))
print('Verified movement, looping playback, and ten transparent mascot exports')