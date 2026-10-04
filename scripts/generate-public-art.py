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


CHARACTER_LABELS_ZH = {
    'clawd': '小芽', 'mint-chip': '苔龟', 'blue-hour': '午夜企鹅',
    'matcha-lab': '抹茶蛙', 'strawberry-milk': '蔷薇蟹', 'sunset-soda': '汽水狐狸',
    'paper-parade': '纸伞蘑菇', 'aurora-pop': '极光猫头鹰',
    'campfire-cocoa': '可可猫', 'pixel-pro': '口袋机器人', 'template': '小芽',
}

CHARACTERS = {
    'clawd': ('Sprout Buddy', 'sprout'),
    'mint-chip': ('Mossy Turtle', 'turtle'),
    'blue-hour': ('Midnight Penguin', 'penguin'),
    'matcha-lab': ('Matcha Frog', 'frog'),
    'strawberry-milk': ('Rosy Crab', 'crab'),
    'sunset-soda': ('Soda Fox', 'fox'),
    'paper-parade': ('Paper Mushroom', 'mushroom'),
    'aurora-pop': ('Aurora Owl', 'owl'),
    'campfire-cocoa': ('Cocoa Cat', 'cat'),
    'pixel-pro': ('Pocket Robot', 'robot'),
    'template': ('Sprout Buddy', 'sprout'),
}


def sprite(filename, theme):
    body, leaf, accent = PALETTES[theme]
    character_name, species = CHARACTERS.get(theme, CHARACTERS['template'])
    sleepy = any(x in filename for x in ('sleep', 'doze', 'collapse'))
    happy = any(x in filename for x in ('happy', 'attention', 'notification', 'wake'))
    busy = any(x in filename for x in ('working', 'focus', 'thinking', 'build', 'debug', 'juggling'))
    reaction = 'react' in filename
    error = 'error' in filename
    mini = 'mini-' in filename
    accent_id = theme + ('-mini-accent' if mini else '-rest-accent' if sleepy or error else '-idle-accent')
    eye_y = {'sprout': 9, 'turtle': 9, 'penguin': 7.4, 'frog': 6.5, 'crab': 7.1, 'fox': 8.3, 'mushroom': 9, 'owl': 7.4, 'cat': 8.2, 'robot': 8.5}.get(species, 9)
    if sleepy:
        eyes = '<path d="M3.3 %.1fq1.2 1.2 2.5 0M9.2 %.1fq1.2 1.2 2.5 0" fill="none" stroke="#254a44" stroke-width=".75" stroke-linecap="round"/>' % (eye_y + .2, eye_y + .2)
    elif species in ('frog', 'penguin', 'owl'):
        eyes = '<g><circle cx="4.5" cy="%.1f" r="1.15" fill="#fff8e8"/><circle cx="10.5" cy="%.1f" r="1.15" fill="#fff8e8"/><ellipse cx="4.65" cy="%.1f" rx=".48" ry=".72"/><ellipse cx="10.65" cy="%.1f" rx=".48" ry=".72"/><circle cx="4.75" cy="%.1f" r=".14" fill="white"/><circle cx="10.75" cy="%.1f" r=".14" fill="white"/></g>' % (eye_y, eye_y, eye_y - .12, eye_y - .12, eye_y - .32, eye_y - .32)
    elif species == 'cat':
        eyes = '<path d="M4 8.4v1.3m7.1-1.3v1.3" stroke="#254a44" stroke-width=".75" stroke-linecap="round"/><circle cx="4" cy="8.4" r=".15" fill="white"/><circle cx="11.1" cy="8.4" r=".15" fill="white"/>'
    else:
        eyes = '<ellipse cx="4.5" cy="%.1f" rx=".62" ry=".84"/><ellipse cx="10.5" cy="%.1f" rx=".62" ry=".84"/><circle cx="4.7" cy="%.1f" r=".18" fill="white"/><circle cx="10.7" cy="%.1f" r=".18" fill="white"/>' % (eye_y, eye_y, eye_y - .22, eye_y - .22)
    mouth = '<path d="M6.3 11.2q1.2 1.2 2.4 0"/>' if happy else '<path d="M6.5 11.4q1-.8 2 0"/>' if error else '<path d="M6.6 11.2q.9.55 1.8 0"/>'
    base_shape = '<path d="M1 10C.4 6.3 3.1 5.3 7.5 5.3s7.1 1 6.5 4.7c-.3 3.7-2.5 5-6.5 5S1.3 13.7 1 10Z" fill="%s" stroke="%s" stroke-width=".55"/>' % (body, leaf)
    appendages = '<ellipse cx="4.1" cy="15.1" rx="1.35" ry=".8" fill="%s"/><ellipse cx="10.9" cy="15.1" rx="1.35" ry=".8" fill="%s"/>' % (leaf, leaf)
    extra = ''
    if species == 'sprout':
        base_shape = '<path d="M.4 10C-.4 6.4 2.6 5.1 7.5 5.2S15.4 6.4 14.6 10c-.3 3.8-2.8 5.2-7.1 5.2S.7 13.8.4 10Z" fill="%s" stroke="%s" stroke-width=".55"/>' % (body, leaf)
        extra = '<path d="M7.5 6.4V3.7" stroke="%s" stroke-width=".85" stroke-linecap="round"/><path d="M7.5 4.8C3.4 4.8 3.3 1.8 3.3 1.8c3.4 0 4.8 1.1 4.2 3zM7.6 4.1C7.5.9 11.2.4 11.2.4c.65 2.8-.8 4.2-3.6 3.7z" fill="%s"/>' % (leaf, leaf)
        appendages = '<ellipse cx="4.3" cy="15.1" rx="1.4" ry=".8" fill="%s"/><ellipse cx="10.7" cy="15.1" rx="1.4" ry=".8" fill="%s"/>' % (leaf, leaf)
    elif species == 'crab':
        appendages = '<path d="M2.1 10.1.5 8.7l.6-1.6 1.6 1m10.2 2 1.6-1.4-.6-1.6-1.6 1M4.5 14.5l-1 1m3 .1-.4 1m4.2-2.1 1 1m-3 0 .4 1" fill="none" stroke="%s" stroke-width="1.2" stroke-linecap="round"/><path d="M.7 8.7C-.3 8 .1 6.4 1.3 6.1q1.2-.3 1.5 1m11.5 1.6c1-.7.6-2.3-.6-2.6q-1.2-.3-1.5 1" fill="none" stroke="%s" stroke-width="1.15" stroke-linecap="round"/>' % (leaf, leaf)
        base_shape = '<path d="M.9 10C.6 6.5 3.1 5.4 7.5 5.4s6.9 1.1 6.6 4.6c-.2 3.1-2.5 4.3-6.6 4.3S1.1 13.1.9 10Z" fill="%s" stroke="%s" stroke-width=".6"/><path d="M2.6 8.1q4.9-3.2 9.8 0" fill="none" stroke="%s" stroke-width=".45" opacity=".6"/>' % (body, leaf, accent)
        eye_y = 6.9
        eyes = '<path d="M4.5 7.1V5.8m6 1.3V5.8" stroke="%s" stroke-width=".55"/><circle cx="4.5" cy="5.4" r=".94" fill="#fff8ed"/><circle cx="10.5" cy="5.4" r=".94" fill="#fff8ed"/><circle cx="4.7" cy="5.5" r=".43" fill="#254a44"/><circle cx="10.7" cy="5.5" r=".43" fill="#254a44"/>' % leaf
        extra += '<path d="M6.9 9q.6.6 1.2 0" fill="none" stroke="%s" stroke-width=".5"/>' % leaf
    elif species == 'turtle':
        appendages = '<ellipse cx="3.2" cy="12.7" rx="1.35" ry="1.2" fill="%s"/><ellipse cx="11.8" cy="12.7" rx="1.35" ry="1.2" fill="%s"/><path d="M7.5 12.6l1.1 1.2-1.1.9-1.1-.9z" fill="%s"/>' % (leaf, leaf, leaf)
        extra = '<path d="M2 10q.2-4.4 5.5-4.4T13 10q-.2 3.6-5.5 3.6T2 10Z" fill="none" stroke="%s" stroke-width=".55"/><path d="M3.8 7.4l1.1 2.4 2.6-1.8 2.2 2 1.1-2.4M7.5 8v4.8" fill="none" stroke="%s" stroke-width=".38"/>' % (accent, leaf)
        base_shape = '<path d="M2 9c-2-1-1.6-3 0-3.2 1.4-.2 2.2.8 2.5 1.8h6c.4-1 1.2-2 2.6-1.8 1.5.2 1.8 2.2-.1 3.2v4.1H2z" fill="%s" stroke="%s" stroke-width=".55"/><ellipse cx="7.5" cy="6.4" rx="1.8" ry="1.4" fill="%s" stroke="%s" stroke-width=".35"/>' % (leaf, leaf, body, leaf)
        eyes = '<ellipse cx="6.8" cy="6.2" rx=".32" ry=".42"/><ellipse cx="8.2" cy="6.2" rx=".32" ry=".42"/>'
        eye_y = 6.2
    elif species == 'penguin':
        base_shape = '<path d="M7.5 3.3C3.1 3.3 1.2 6.8 1.4 11c.2 3.7 2.2 5 6.1 5s5.9-1.3 6.1-5c.2-4.2-1.7-7.7-6.1-7.7Z" fill="%s" stroke="%s" stroke-width=".55"/><ellipse cx="7.5" cy="11.4" rx="4" ry="4.1" fill="#fff8e8"/>' % (body, leaf)
        appendages = '<path d="M4.6 15.2l-1.2.8h2.7m3.5-.8 1.2.8H8.1" fill="none" stroke="%s" stroke-width="1.15" stroke-linecap="round"/>' % accent
        extra = '<path d="M6.65 9.2 7.5 10.5l.85-1.3z" fill="%s"/>' % accent
    elif species == 'frog':
        base_shape = '<path d="M1 8.4C1 5.8 3.2 5.1 7.5 5.1s6.5.7 6.5 3.3v3.1c0 2.7-2.1 4.2-6.5 4.2S1 14.2 1 11.5z" fill="%s" stroke="%s" stroke-width=".55"/><circle cx="4.3" cy="6.1" r="2" fill="%s" stroke="%s" stroke-width=".5"/><circle cx="10.7" cy="6.1" r="2" fill="%s" stroke="%s" stroke-width=".5"/><circle cx="7.5" cy="10.2" r=".42" fill="%s"/><circle cx="4.7" cy="12.6" r=".28" fill="%s" opacity=".55"/><circle cx="10.3" cy="12.6" r=".28" fill="%s" opacity=".55"/>' % (body, leaf, body, leaf, body, leaf, accent, accent, accent)
        eyes = '<ellipse cx="4.3" cy="5.8" rx=".48" ry=".72"/><ellipse cx="10.7" cy="5.8" rx=".48" ry=".72"/>'
        eye_y = 5.8
        appendages = '<ellipse cx="3.6" cy="15.2" rx="1.8" ry=".7" fill="%s"/><ellipse cx="11.4" cy="15.2" rx="1.8" ry=".7" fill="%s"/>' % (leaf, leaf)
    elif species == 'fox':
        base_shape = '<path d="M1.1 7 2 3.2l3.1 2.8q2.4-.8 4.8 0L13 3.2l.9 3.8q.7 1.6.4 4.3-.4 4.1-6.8 4.1T.7 11.3q-.3-2.7.4-4.3Z" fill="%s" stroke="%s" stroke-width=".55"/><path d="M1.9 4.1 2.4 7l1.9-.7zM13.1 4.1 12.6 7l-1.9-.7z" fill="%s"/><path d="M2.5 11q1.2-2.4 5-1.6 3.8-.8 5 1.6-.8 3.4-5 3.4t-5-3.4Z" fill="#fff2da"/>' % (body, leaf, accent)
        appendages = '<path d="M12.3 13.2q3.1.3 2.2-2.7-.5-1.2-2.2-.8" fill="none" stroke="%s" stroke-width="1.1" stroke-linecap="round"/><path d="M4 15.1v.7m7-.7v.7" stroke="%s" stroke-width=".9"/>' % (leaf, leaf)
        eyes = '<ellipse cx="4.6" cy="8.2" rx=".55" ry=".72"/><ellipse cx="10.4" cy="8.2" rx=".55" ry=".72"/>'
        extra = '<path d="M6.9 10.1q.6.5 1.2 0" fill="none" stroke="%s" stroke-width=".55"/>' % leaf
    elif species == 'mushroom':
        base_shape = '<path d="M4.5 8.3h6v6.5q-.3 1-3 1t-3-1z" fill="#fff0d6" stroke="%s" stroke-width=".45"/><path d="M.7 8C.8 4 3.1 2.5 7.5 2.5s6.7 1.5 6.8 5.5q-1 .9-2 0-1 .9-2 0-1 .9-2 0-1 .9-2 0-1 .9-2 0-1 .9-2 0-.9.5-1.6 0Z" fill="%s" stroke="%s" stroke-width=".6"/><circle cx="4.4" cy="5.2" r=".55" fill="#fff8e8"/><circle cx="9.7" cy="4.5" r=".72" fill="#fff8e8"/><circle cx="11.2" cy="7" r=".42" fill="#fff8e8"/>' % (leaf, body, leaf)
        eyes = '<ellipse cx="5.5" cy="9.8" rx=".5" ry=".72"/><ellipse cx="9.5" cy="9.8" rx=".5" ry=".72"/>'
        eye_y = 9.8
        appendages = '<path d="M3.6 15.2h7.8" stroke="%s" stroke-width=".8" stroke-linecap="round"/>' % leaf
    elif species == 'owl':
        base_shape = '<path d="M1 7 1.4 3.1l3.2 2.3q2.9-1.2 5.8 0l3.2-2.3L14 7v4.2q-.4 4.1-6.5 4.1T1 11.2z" fill="%s" stroke="%s" stroke-width=".55"/><path d="M3 11q0-2 2-2t2 2m0 0q0-2 2-2t2 2q-.2 3-3 3t-3-3Z" fill="#fff5df"/>' % (body, leaf)
        eyes = '<circle cx="5" cy="8.2" r=".62"/><circle cx="10" cy="8.2" r=".62"/>'
        eye_y = 8.2
        appendages = '<path d="M3.6 14.4 2.5 15.8h2.2m5.7-1.4 1.1 1.4h-2.2" fill="none" stroke="%s" stroke-width=".8" stroke-linecap="round"/>' % leaf
        extra = '<path d="M7.1 9.2l.4.6.4-.6" fill="%s"/>' % accent
    elif species == 'cat':
        base_shape = '<path d="M1 7 1.5 3l3.3 2.8q2.7-.9 5.4 0L13.5 3 14 7c1.2 4.3-.3 8.5-6.5 8.5S-.2 11.3 1 7Z" fill="%s" stroke="%s" stroke-width=".55"/><path d="M2.1 4.2 2.4 7 4 6.4zm10.8 0L12.6 7 11 6.4z" fill="%s"/>' % (body, leaf, accent)
        eyes = '<path d="M4.5 8v1.2m6-1.2v1.2" stroke="#254a44" stroke-width=".75" stroke-linecap="round"/><circle cx="4.5" cy="8" r=".15" fill="white"/><circle cx="10.5" cy="8" r=".15" fill="white"/>'
        extra = '<path d="M4.8 10.4 7.5 11.5l2.7-1.1M1.3 10l2.9.3m-2.8 1.1 2.5-.3m9.8-1.1-2.9.3m2.8 1.1-2.5-.3" fill="none" stroke="%s" stroke-width=".4" stroke-linecap="round"/>' % leaf
    elif species == 'robot':
        base_shape = '<path d="M7.5 4.1v1.4m-4.7 2q0-1.2 1.3-1.2h6.8q1.3 0 1.3 1.2v6q0 1.2-1.3 1.2H4.1q-1.3 0-1.3-1.2z" fill="%s" stroke="%s" stroke-width=".65"/><circle cx="7.5" cy="3.3" r=".65" fill="%s"/><rect x="4" y="8" width="7" height="3.5" rx="1.1" fill="#254a44"/><path d="M4.3 14.7v1m6.4-1v1" stroke="%s" stroke-width=".8"/>' % (body, leaf, accent, leaf)
        eyes = '<circle cx="6" cy="9.2" r=".56" fill="%s"/><circle cx="9" cy="9.2" r=".56" fill="%s"/><circle cx="5.85" cy="9" r=".15" fill="white"/><circle cx="8.85" cy="9" r=".15" fill="white"/>' % (accent, accent)
        extra = '<path d="M6.4 12.3h2.2" stroke="%s" stroke-width=".45"/>' % leaf
        mouth = ''
        appendages = '<rect x="4.2" y="15" width="2" height="1" rx=".4" fill="%s"/><rect x="8.8" y="15" width="2" height="1" rx=".4" fill="%s"/>' % (leaf, leaf)
    else:
        base_shape = '<path d="M1 10C.4 6.3 3.1 5.3 7.5 5.3s7.1 1 6.5 4.7c-.3 3.7-2.5 5-6.5 5S1.3 13.7 1 10Z" fill="%s" stroke="%s" stroke-width=".55"/>' % (body, leaf)
    decor = ''
    if busy:
        decor = '<g class="tool"><path d="M4.2 12.5l3.3.45 3.3-.45v2.1l-3.3.5-3.3-.5z" fill="#fff8e7" stroke="%s" stroke-width=".35"/><path d="M7.5 13v2" stroke="%s" stroke-width=".25"/></g>' % (leaf, leaf)
    if happy:
        decor += '<g class="sparkle" fill="%s"><path d="M1 2l.4 1.1 1.1.4-1.1.4L1 5l-.4-1.1-1.1-.4 1.1-.4zM14 1l.3.8.8.3-.8.3-.3.8-.3-.8-.8-.3.8-.3z"/></g>' % accent
    if sleepy:
        decor += '<text x="13.5" y="3" font-family="sans-serif" font-size="2.4" fill="%s" class="dream">z</text>' % leaf
    if error:
        decor += '<path d="M14 2q2.4 3 0 4q-2.4-1 0-4" fill="#82bfe7"/>'
    motion = 'rest' if sleepy else 'celebrate' if happy else 'work' if busy else 'sway' if reaction else 'breathe'
    return chr(10).join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45" role="img" data-species="%s" aria-label="%s">' % (species, character_name),
        '<title>%s — original artwork by FanxingMeng1999 (MIT)</title>' % character_name,
        '<style>#body-js{transform-origin:7.5px 15px}.breathe{animation:breathe 3s ease-in-out infinite}.rest{animation:breathe 5s ease-in-out infinite}.celebrate{animation:bounce .7s ease-in-out infinite}.work{animation:breathe 1.7s ease-in-out infinite}.sway{animation:sway 1s ease-in-out infinite}.sparkle,.dream{animation:glow 1.6s ease-in-out infinite}.leaf{transform-origin:7.5px 3.7px;animation:sway 3s ease-in-out infinite}@keyframes breathe{50%{transform:translateY(-.25px) scaleY(1.012)}}@keyframes bounce{50%{transform:translateY(-1px) rotate(-2deg)}}@keyframes sway{50%{transform:rotate(3deg)}}@keyframes glow{50%{opacity:.4}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style>',
        '<ellipse id="shadow-js" cx="7.5" cy="16.5" rx="7.1" ry=".75" fill="#294b43" opacity=".12"/>',
        '<g data-size-profile="legacy-pet-footprint" transform="translate(0 6.08) scale(1 .62)"><g id="body-js"><g class="%s">' % motion,
        appendages,
        base_shape,
        extra,
        '<g id="%s"><path d="M7.5 11.3l.45.9 1 .15-.72.7.17 1-.9-.48-.9.48.17-1-.72-.7 1-.15z" fill="%s"/></g>' % (accent_id, accent),
        '<g id="eyes-js" fill="#254a44">%s</g><g id="eyes-doze" style="display:none"><path d="M3.3 9.1h2.4m4.2 0h2.4" stroke="#254a44" stroke-width=".7"/></g>' % eyes,
        '<ellipse cx="2.6" cy="10.7" rx=".9" ry=".38" fill="#ee9caa" opacity=".55"/><ellipse cx="12.4" cy="10.7" rx=".9" ry=".38" fill="#ee9caa" opacity=".55"/>',
        '<g fill="none" stroke="#254a44" stroke-width=".5" stroke-linecap="round">%s</g>' % mouth,
        decor,
        '</g></g></g></svg>',
    ])

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
            records.append({'path':target.relative_to(root).as_posix(),'theme':theme,'character':CHARACTERS.get(theme, CHARACTERS['template'])[1],'license':'MIT','sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    source=root/'assets/brand/source';png=root/'assets/brand/extracted/png';sv=root/'assets/brand/extracted/svg';media=root/'docs/media';sounds=root/'apps/pet-desktop/assets/sounds'
    character_source=source/'characters';character_source.mkdir(parents=True,exist_ok=True)
    for directory in [source,png,sv,media,sounds]:directory.mkdir(parents=True,exist_ok=True)
    master=sprite('sprout-idle.svg','clawd');write_utf8(source/'sprout-buddy.svg',master);write_utf8(sv/'symbol_primary.svg',master)
    for theme, (character_name, species) in CHARACTERS.items():
        if theme == 'template': continue
        artwork=sprite(theme+'-idle-follow.svg',theme)
        write_utf8(character_source/(species+'.svg'),artwork)
        write_utf8(sv/('mascot_'+species+'.svg'),artwork)
    symbol=raster_symbol();tile=raster_symbol(tile=True);symbol.save(png/'symbol_primary.png');tile.save(png/'app_tile_green.png');tile.resize((256,256),Image.Resampling.LANCZOS).save(media/'sprout-buddy.png')
    for color,variant in [('#254a44','color'),('#eef8f1','dark')]:
        word='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 110"><text x="10" y="78" fill="'+color+'" font-family="Arial,sans-serif" font-weight="700" font-size="82">GoWIN!Buddy</text></svg>'
        write_utf8(sv/('wordmark_'+variant+'.svg'),word)
    inner=master[master.index('<style>'):master.rindex('</svg>')]
    hero='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="510" viewBox="0 0 1200 510"><rect width="1200" height="510" rx="32" fill="#eff7f0"/><circle cx="988" cy="260" r="195" fill="#d9efdf"/><text x="64" y="133" font-family="Arial,sans-serif" font-size="19" font-weight="700" letter-spacing="4" fill="#27856f">YOUR DAY. A LITTLE ADVENTURE.</text><text x="60" y="224" font-family="Arial,sans-serif" font-size="78" font-weight="700" fill="#254a44">GoWIN!Buddy</text><text x="64" y="286" font-family="Arial,sans-serif" font-size="25" fill="#567169">A desktop companion for tasks, focus and tiny wins.</text><text x="64" y="350" font-family="Arial,sans-serif" font-size="19" fill="#27856f">DESKTOP PET   /   LOCAL RPG   /   WINDOWS</text><g transform="translate(861 162) scale(12)">'+inner+'</g><text x="64" y="448" font-family="Arial,sans-serif" font-size="17" fill="#567169">Open source. Original Sprout Buddy artwork. MIT license.</text></svg>'
    write_utf8(media/'hero.svg',hero)
    tone(sounds/'confirm.wav',[659.25,880]);tone(sounds/'complete.wav',[523.25,659.25,783.99])
    manifest={'schemaVersion':1,'author':'FanxingMeng1999','license':'MIT','generator':'scripts/generate-public-art.py','design':'Ten compact original mascot silhouettes including a seed sprout, turtle, penguin, frog, pink crab, fox, mushroom, owl, cat and pocket robot. No upstream pet artwork is included.','assets':records,'brandSource':'assets/brand/source/sprout-buddy.svg'}
    manifest['characters']={theme:{'name':CHARACTERS[theme][0],'nameZh':CHARACTER_LABELS_ZH[theme],'species':CHARACTERS[theme][1]} for theme in sorted(CHARACTERS) if theme != 'template'}
    manifest['characterSources']=[{'species':species,'name':name,'nameZh':CHARACTER_LABELS_ZH[theme],'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for theme,(name,species) in sorted(CHARACTERS.items()) if theme != 'template' for f in [character_source/(species+'.svg')]]
    gallery=media/'mascot-gallery.png'
    manifest['previews']=([{'path':gallery.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(gallery.read_bytes()).hexdigest()}] if gallery.is_file() else [])
    manifest['brandExports']=[{'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(list(png.glob('*'))+list(sv.glob('*')))]
    manifest['tones']=[{'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(sounds.glob('*.wav'))]
    write_utf8(root/'assets/brand/extracted/manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+chr(10))
    print('Generated %d original SVG states, brand PNG/SVG and two WAV tones.' % len(records))

if __name__=='__main__':main()
