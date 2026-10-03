"""Generate the original MIT-licensed Sprout Buddy artwork and tones.
Requires Pillow only for PNG/ICO export; SVG assets have no external resources.
"""
from __future__ import annotations
import argparse, hashlib, json, math, struct, wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

PALETTES = {
    'clawd': ('#98e3c2', '#27856f', '#ffd174'),
    'mint-chip': ('#b3eadb', '#258e7b', '#6d5a4e'),
    'blue-hour': ('#aac9f3', '#476aa3', '#ffdca0'),
    'matcha-lab': ('#c3dc9c', '#597b4c', '#f0c685'),
    'strawberry-milk': ('#f6b9cb', '#b66086', '#fbdd9e'),
    'sunset-soda': ('#f9c296', '#c17265', '#a6dbcd'),
    'paper-parade': ('#efe5bf', '#829270', '#e7a378'),
    'aurora-pop': ('#c9baf2', '#7964b5', '#8ee4d3'),
    'campfire-cocoa': ('#dbc0a5', '#926855', '#f6bc76'),
    'pixel-pro': ('#b5e4d4', '#397e73', '#f7cc7c'),
    'template': ('#98e3c2', '#27856f', '#ffd174'),
}


def write_utf8(target, text):
    with target.open('w', encoding='utf-8', newline=chr(10)) as stream: stream.write(text)


def sprite(filename, theme):
    body, leaf, accent = PALETTES[theme]
    sleepy = any(x in filename for x in ('sleep', 'doze', 'collapse'))
    happy = any(x in filename for x in ('happy', 'attention', 'notification', 'wake'))
    busy = any(x in filename for x in ('working', 'focus', 'thinking', 'build', 'debug', 'juggling'))
    reaction = 'react' in filename
    error = 'error' in filename
    mini = 'mini-' in filename
    accent_id = theme + ('-mini-accent' if mini else '-rest-accent' if sleepy or error else '-idle-accent')
    eyes = ('<path id="left-eye-shut" d="M3.3 7.4q1.4 1.4 2.8 0M9 7.4q1.4 1.4 2.8 0" fill="none" stroke="#254a44" stroke-width=".8" stroke-linecap="round"/>' if sleepy else
            '<ellipse cx="4.5" cy="6.4" rx=".65" ry="1.05"/><ellipse cx="10.5" cy="6.4" rx=".65" ry="1.05"/><circle cx="4.7" cy="6.1" r=".19" fill="white"/><circle cx="10.7" cy="6.1" r=".19" fill="white"/>')
    mouth = '<path d="M6.2 9q1.3 1.6 2.6 0"/>' if happy else '<path d="M6.5 9.3q1-1 2 0"/>' if error else '<path d="M6.6 9q.9.6 1.8 0"/>'
    decor = ''
    if busy:
        decor = '<g class="tool"><path d="M0 11l7.5 1.2L15 11v5L7.5 17.2 0 16z" fill="#fff8e7" stroke="'+leaf+'" stroke-width=".55"/><path d="M7.5 12.2v5M2 13l3 .5M10 13.5l3-.5" fill="none" stroke="'+leaf+'" stroke-width=".4"/></g>'
    if happy:
        decor += '<g class="sparkle" fill="'+accent+'"><path d="M-4 0l.8 2.2L-1 3l-2.2.8L-4 6l-.8-2.2L-7 3l2.2-.8z"/><path d="M21-3l.7 1.7L23.5-.6 21.7.1 21 2l-.7-1.9-1.8-.7 1.8-.7z"/></g>'
    if sleepy:
        decor += '<text x="18" y="1" font-family="sans-serif" font-size="3.2" fill="'+leaf+'" class="dream">z</text>'
    if error:
        decor += '<path d="M18 1q3 4 0 4q-3 0 0-4" fill="#82bfe7"/>'
    motion = 'rest' if sleepy else 'celebrate' if happy else 'work' if busy else 'sway' if reaction else 'breathe'
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45" role="img" aria-label="Sprout Buddy">
<title>Sprout Buddy — original artwork by FanxingMeng1999 (MIT)</title>
<style>
#body-js{transform-origin:7.5px 15px}.breathe{animation:breathe 3s ease-in-out infinite}.rest{animation:breathe 5s ease-in-out infinite}.celebrate{animation:bounce .7s ease-in-out infinite}.work{animation:breathe 1.7s ease-in-out infinite}.sway{animation:sway 1s ease-in-out infinite}.sparkle,.dream{animation:glow 1.6s ease-in-out infinite}.leaf{transform-origin:7.5px 1px;animation:sway 3s ease-in-out infinite}
@keyframes breathe{50%{transform:translateY(-.5px) scaleY(1.02)}}@keyframes bounce{50%{transform:translateY(-2px) rotate(-3deg)}}@keyframes sway{50%{transform:rotate(5deg)}}@keyframes glow{50%{opacity:.4}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<ellipse id="shadow-js" cx="7.5" cy="17.1" rx="8.2" ry="1.05" fill="#294b43" opacity=".12"/>
<g id="body-js"><g class="''' + motion + '''">
<g class="leaf"><path d="M7.5 2V-4" stroke="''' + leaf + '''" stroke-width="1" stroke-linecap="round"/><path d="M7.5-2C1-2 1-8 1-8c5 0 7 2 6.5 6zM7.5-3C7-9 14-10 14-10c1 5-2 8-6.5 7z" fill="''' + leaf + '''"/></g>
<ellipse cx="4.1" cy="16" rx="2.2" ry="1.1" fill="''' + leaf + '''"/><ellipse cx="10.9" cy="16" rx="2.2" ry="1.1" fill="''' + leaf + '''"/>
<path d="M-.7 8C-2.2-4 17.2-4 15.7 8c-.4 6.8-4 8.1-8.2 8.1S-.3 14.8-.7 8z" fill="''' + body + '''" stroke="''' + leaf + '''" stroke-width=".5"/>
<path d="M2.3 3.5q1.6-2 4-2" fill="none" stroke="white" opacity=".58" stroke-width="1" stroke-linecap="round"/>
<g id="''' + accent_id + '''"><path d="M7.5 10.9l.6 1.2 1.3.2-.95.95.2 1.3-1.15-.65-1.15.65.2-1.3-.95-.95 1.3-.2z" fill="''' + accent + '''"/></g>
<!-- eyes -->
<g id="eyes-js" fill="#254a44">''' + eyes + '''</g><g id="eyes-doze" style="display:none"><path d="M3.3 7h2.4M9.3 7h2.4" stroke="#254a44" stroke-width=".8"/></g>
<ellipse cx="2.6" cy="8.5" rx="1.1" ry=".55" fill="#ee9caa" opacity=".6"/><ellipse cx="12.4" cy="8.5" rx="1.1" ry=".55" fill="#ee9caa" opacity=".6"/>
<g fill="none" stroke="#254a44" stroke-width=".5" stroke-linecap="round">''' + mouth + '''</g>
<path d="M-.5 9q-3 0-3-2M15.5 9q3 0 3-2" fill="none" stroke="''' + leaf + '''" stroke-width="1" stroke-linecap="round"/>
''' + decor + '''
</g></g></svg>
'''


def collect_files(value):
    out = set()
    if isinstance(value, str) and value.endswith('.svg'):
        out.add(value)
    elif isinstance(value, dict):
        for item in value.values(): out.update(collect_files(item))
    elif isinstance(value, list):
        for item in value: out.update(collect_files(item))
    return out


def raster_symbol(size=1024, tile=False):
    s = size / 1024
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    def box(v): return tuple(int(x*s) for x in v)
    def pts(v): return [(int(x*s),int(y*s)) for x,y in v]
    if tile: d.rounded_rectangle(box((8,8,1016,1016)), radius=int(200*s), fill='#edf8f1')
    d.ellipse(box((203,817,822,878)),fill='#cbe5d6')
    d.ellipse(box((295,783,468,856)),fill='#27856f')
    d.ellipse(box((556,783,729,856)),fill='#27856f')
    d.line(pts([(512,354),(512,219)]),fill='#27856f',width=max(1,int(21*s)))
    d.polygon(pts([(512,276),(374,256),(326,145),(448,164),(509,213)]),fill='#27856f')
    d.polygon(pts([(512,247),(518,141),(638,90),(684,168),(625,240)]),fill='#27856f')
    d.rounded_rectangle(box((218,321,806,825)),radius=int(245*s),fill='#98e3c2',outline='#27856f',width=max(1,int(12*s)))
    d.arc(box((295,370,510,514)),195,262,fill='#e8fff3',width=max(1,int(24*s)))
    for x in [389,635]:
        d.ellipse(box((x-22,511,x+22,586)),fill='#254a44')
        d.ellipse(box((x-1,522,x+11,535)),fill='white')
    for x in [301,723]:d.ellipse(box((x-37,604,x+37,638)),fill='#efadba')
    d.arc(box((469,595,555,660)),12,168,fill='#254a44',width=max(1,int(9*s)))
    star=[]
    for i in range(10):
        r=44 if i%2==0 else 22; angle=-math.pi/2+i*math.pi/5
        star.append((512+r*math.cos(angle),738+r*math.sin(angle)))
    d.polygon(pts(star),fill='#ffd174')
    return im


def tone(dest, notes):
    rate=22050
    with wave.open(str(dest),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate)
        data=bytearray()
        for freq in notes:
            n=int(rate*.11)
            for i in range(n):
                env=min(1,i/(rate*.015))*max(0,1-i/n)**2
                data.extend(struct.pack('<h',int(5200*env*math.sin(2*math.pi*freq*i/rate))))
        f.writeframes(bytes(data))


def main():
    p=argparse.ArgumentParser();p.add_argument('--root',default=str(Path(__file__).resolve().parents[1]));a=p.parse_args();root=Path(a.root).resolve()
    svgdir=root/'apps/pet-desktop/assets/svg';svgdir.mkdir(parents=True,exist_ok=True)
    records=[]
    for config in sorted((root/'apps/pet-desktop/themes').glob('*/theme.json')):
        theme=config.parent.name;obj=json.loads(config.read_text(encoding='utf-8'))
        for name in sorted(collect_files(obj)):
            target=svgdir/name;write_utf8(target,sprite(name,theme))
            records.append({'path':target.relative_to(root).as_posix(),'theme':theme,'license':'MIT','sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    source=root/'assets/brand/source';png=root/'assets/brand/extracted/png';sv=root/'assets/brand/extracted/svg';media=root/'docs/media';sounds=root/'apps/pet-desktop/assets/sounds'
    for directory in [source,png,sv,media,sounds]:directory.mkdir(parents=True,exist_ok=True)
    master=sprite('sprout-idle.svg','clawd');write_utf8(source/'sprout-buddy.svg',master);write_utf8(sv/'symbol_primary.svg',master)
    symbol=raster_symbol();tile=raster_symbol(tile=True);symbol.save(png/'symbol_primary.png');tile.save(png/'app_tile_green.png');tile.resize((256,256),Image.Resampling.LANCZOS).save(media/'sprout-buddy.png')
    for color,variant in [('#254a44','color'),('#eef8f1','dark')]:
        word='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 110"><text x="10" y="78" fill="'+color+'" font-family="Arial,sans-serif" font-weight="700" font-size="82">GoWIN!Buddy</text></svg>'
        write_utf8(sv/('wordmark_'+variant+'.svg'),word)
    inner=master[master.index('<style>'):master.rindex('</svg>')]
    hero='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="510" viewBox="0 0 1200 510"><rect width="1200" height="510" rx="32" fill="#eff7f0"/><circle cx="988" cy="260" r="195" fill="#d9efdf"/><text x="64" y="133" font-family="Arial,sans-serif" font-size="19" font-weight="700" letter-spacing="4" fill="#27856f">YOUR DAY. A LITTLE ADVENTURE.</text><text x="60" y="224" font-family="Arial,sans-serif" font-size="78" font-weight="700" fill="#254a44">GoWIN!Buddy</text><text x="64" y="286" font-family="Arial,sans-serif" font-size="25" fill="#567169">A desktop companion for tasks, focus and tiny wins.</text><text x="64" y="350" font-family="Arial,sans-serif" font-size="19" fill="#27856f">DESKTOP PET   /   LOCAL RPG   /   WINDOWS</text><g transform="translate(861 162) scale(12)">'+inner+'</g><text x="64" y="448" font-family="Arial,sans-serif" font-size="17" fill="#567169">Open source. Original Sprout Buddy artwork. MIT license.</text></svg>'
    write_utf8(media/'hero.svg',hero)
    tone(sounds/'confirm.wav',[659.25,880]);tone(sounds/'complete.wav',[523.25,659.25,783.99])
    manifest={'schemaVersion':1,'author':'FanxingMeng1999','license':'MIT','generator':'scripts/generate-public-art.py','design':'Original round seed spirit with a leaf shoot and star badge. No upstream pet artwork is included.','assets':records,'brandSource':'assets/brand/source/sprout-buddy.svg'}
    manifest['brandExports']=[{'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(list(png.glob('*'))+list(sv.glob('*')))]
    manifest['tones']=[{'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(sounds.glob('*.wav'))]
    write_utf8(root/'assets/brand/extracted/manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+chr(10))
    print('Generated %d original SVG states, brand PNG/SVG and two WAV tones.' % len(records))

if __name__=='__main__':main()
