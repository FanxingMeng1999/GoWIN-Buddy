"""Generate ten shaded, uniformly scaled MIT mascot characters and tones.
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


def tint(color, other, amount):
    channels = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    blend = [int(other[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join('%02x' % round(a * (1 - amount) + b * amount) for a, b in zip(channels, blend))


def material_defs(body, trim, accent):
    return f'''<defs>
<radialGradient id="paint-body" cx=".29" cy=".20" r=".84"><stop stop-color="{tint(body, '#ffffff', .48)}"/><stop offset=".42" stop-color="{body}"/><stop offset="1" stop-color="{tint(body, trim, .40)}"/></radialGradient>
<linearGradient id="paint-trim" x1=".2" y1="0" x2=".8" y2="1"><stop stop-color="{tint(trim, '#ffffff', .40)}"/><stop offset="1" stop-color="{trim}"/></linearGradient>
<radialGradient id="paint-cream" cx=".30" cy=".18" r=".85"><stop stop-color="#ffffff"/><stop offset=".6" stop-color="#fff4e8"/><stop offset="1" stop-color="#e9d8c2"/></radialGradient>
<linearGradient id="paint-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{tint(accent, '#ffffff', .45)}"/><stop offset=".45" stop-color="{accent}"/><stop offset="1" stop-color="{tint(accent, '#bc8862', .38)}"/></linearGradient>
<linearGradient id="paint-screen" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#42615e"/><stop offset="1" stop-color="#263d3b"/></linearGradient>
</defs>'''


def character_parts(species):
    """Unwarped anatomy in a shared 15-unit space; each silhouette has its own rig."""
    back, body, detail = '', '', ''
    if species == 'sprout':
        back = '<ellipse cx="5.15" cy="15.6" rx="1.05" ry=".6" fill="url(#paint-trim)"/><ellipse cx="9.85" cy="15.6" rx="1.05" ry=".6" fill="url(#paint-trim)"/><g class="limb-left" style="transform-origin:3px 10px"><ellipse cx="2.7" cy="11.1" rx=".75" ry="1.5" fill="url(#paint-body)"/></g><g class="limb-right" style="transform-origin:12px 10px"><ellipse cx="12.3" cy="11.1" rx=".75" ry="1.5" fill="url(#paint-body)"/></g>'
        body = '<path d="M7.5 5C4.35 5 2.45 7.3 2.5 10.7c.05 3.65 2.05 5.15 5 5.15s4.95-1.5 5-5.15C12.55 7.3 10.65 5 7.5 5Z" fill="url(#paint-body)"/><ellipse cx="7.5" cy="12.6" rx="2.8" ry="1.9" fill="url(#paint-cream)" opacity=".28"/>'
        detail = '<g class="crest" style="transform-origin:7.5px 5px"><path d="M7.5 5.6V3.5" stroke="url(#paint-trim)" stroke-width=".5" stroke-linecap="round"/><path d="M7.5 4.4C5.3 4.6 3.45 3.6 3.3 1.9c2.35-.55 4.5.4 4.2 2.5Z" fill="url(#paint-trim)"/><path d="M7.6 3.8C7.25 1.3 9.6.6 11.6.85c.15 2.2-1.4 3.6-4 2.95Z" fill="url(#paint-trim)"/><path d="M4.2 2.55 7.4 4M8.05 3.25l2.55-1.55" fill="none" stroke="#ffffff" stroke-width=".14" opacity=".38"/></g><path d="M3.5 9.3C3.7 7.7 4.5 6.5 5.8 6.05" fill="none" stroke="#ffffff" stroke-width=".32" stroke-linecap="round" opacity=".42"/>'
        face = (5.3, 9.7, 9.5, 11.35)
    elif species == 'turtle':
        back = '<ellipse cx="3.6" cy="14.8" rx="1.5" ry=".9" fill="url(#paint-body)"/><ellipse cx="11.4" cy="14.8" rx="1.5" ry=".9" fill="url(#paint-body)"/><path d="M12.5 11.6q2.4.4 1.7 1.8l-2-.55Z" fill="url(#paint-body)"/>'
        body = '<ellipse cx="7.5" cy="11" rx="5.15" ry="4.45" fill="url(#paint-trim)"/><ellipse cx="7.5" cy="10.5" rx="4.4" ry="3.7" fill="url(#paint-body)"/><path d="m7.5 7.65 2.5 1.5-.15 2.9-2.35 1.3-2.35-1.3L5 9.15Zm0 0V6.8M5 9.15l-1.5-.8m6.5.8 1.5-.8M5.15 12.05l-1.4 1.4m6.1-1.4 1.4 1.4M7.5 13.35v1.2" fill="none" stroke="#e6f8d4" stroke-width=".28" stroke-linecap="round" opacity=".75"/><ellipse cx="7.5" cy="6.25" rx="2.7" ry="2.4" fill="url(#paint-body)"/><path d="M5.75 5.35q.5-.7 1.6-.85" fill="none" stroke="#ffffff" stroke-width=".27" stroke-linecap="round" opacity=".48"/>'
        detail = '<g class="limb-left" style="transform-origin:3px 10px"><ellipse cx="2.4" cy="10.8" rx=".9" ry="1.7" fill="url(#paint-body)" transform="rotate(18 2.4 10.8)"/></g><g class="limb-right" style="transform-origin:12px 10px"><ellipse cx="12.6" cy="10.8" rx=".9" ry="1.7" fill="url(#paint-body)" transform="rotate(-18 12.6 10.8)"/></g>'
        face = (6.2, 8.8, 6.2, 7.55)
    elif species == 'penguin':
        back = '<g class="limb-left" style="transform-origin:3.5px 8px"><path d="M3.4 7.7C1.45 8.6 1.15 11.4 2 12.6c1.05-.3 1.8-2.5 2.1-4.2Z" fill="url(#paint-trim)"/></g><g class="limb-right" style="transform-origin:11.5px 8px"><path d="M11.6 7.7c1.95.9 2.25 3.7 1.4 4.9-1.05-.3-1.8-2.5-2.1-4.2Z" fill="url(#paint-trim)"/></g><ellipse cx="5.2" cy="15.75" rx="1.4" ry=".58" fill="url(#paint-gold)"/><ellipse cx="9.8" cy="15.75" rx="1.4" ry=".58" fill="url(#paint-gold)"/>'
        body = '<path d="M7.5 2.85c-3.1 0-4.85 3.35-4.7 7.45.1 4.1 1.55 5.75 4.7 5.75s4.6-1.65 4.7-5.75c.15-4.1-1.6-7.45-4.7-7.45Z" fill="url(#paint-body)"/><path d="M7.5 7.05c-.7-1.4-2.55-1.4-3.4.15-.8 1.6-.7 4.1-.3 5.95.3 1.35 1.5 2.25 3.7 2.25s3.4-.9 3.7-2.25c.4-1.85.5-4.35-.3-5.95-.85-1.55-2.7-1.55-3.4-.15Z" fill="url(#paint-cream)"/><path d="M4.15 6.25q.6-1.65 2.15-2.2" fill="none" stroke="#ffffff" stroke-width=".26" stroke-linecap="round" opacity=".42"/>'
        detail = '<path d="M6.7 9.3q.8-.25 1.6 0L7.5 10.25Z" fill="url(#paint-gold)"/>'
        face = (5.4, 9.6, 7.75, 10.9)
    elif species == 'frog':
        back = '<ellipse cx="3.3" cy="14.2" rx="2.1" ry="1.5" fill="url(#paint-trim)"/><ellipse cx="11.7" cy="14.2" rx="2.1" ry="1.5" fill="url(#paint-trim)"/><ellipse cx="3.8" cy="15.45" rx="1.9" ry=".6" fill="url(#paint-body)"/><ellipse cx="11.2" cy="15.45" rx="1.9" ry=".6" fill="url(#paint-body)"/>'
        body = '<ellipse cx="7.5" cy="11.45" rx="4.45" ry="4.4" fill="url(#paint-body)"/><ellipse cx="7.5" cy="12.9" rx="2.7" ry="2.5" fill="url(#paint-cream)"/><ellipse cx="7.5" cy="8.2" rx="5.0" ry="3.45" fill="url(#paint-body)"/><circle cx="4.45" cy="5.5" r="2.05" fill="url(#paint-body)"/><circle cx="10.55" cy="5.5" r="2.05" fill="url(#paint-body)"/><circle cx="4.45" cy="5.6" r="1.22" fill="url(#paint-cream)"/><circle cx="10.55" cy="5.6" r="1.22" fill="url(#paint-cream)"/>'
        detail = '<g class="limb-left" style="transform-origin:4px 11px"><path d="M4.15 11.2 4.8 14.9" stroke="url(#paint-body)" stroke-width="1.3" stroke-linecap="round"/></g><g class="limb-right" style="transform-origin:11px 11px"><path d="M10.85 11.2 10.2 14.9" stroke="url(#paint-body)" stroke-width="1.3" stroke-linecap="round"/></g><circle cx="6.75" cy="7.9" r=".13" fill="#527346"/><circle cx="8.25" cy="7.9" r=".13" fill="#527346"/>'
        face = (4.45, 10.55, 5.6, 9.05)
    elif species == 'crab':
        back = '<g fill="none" stroke="url(#paint-trim)" stroke-width=".58" stroke-linecap="round"><path d="M3.9 11.7 2.45 12.15 1.7 13.1M3.8 13.25l-1.1.55-.2 1.0M11.1 11.7l1.45.45.75.95M11.2 13.25l1.1.55.2 1"/></g><path d="M4.9 5.1V3.45m5.2 1.65V3.45" stroke="url(#paint-body)" stroke-width=".6" stroke-linecap="round"/><ellipse cx="4.9" cy="3.4" rx=".65" ry=".38" fill="url(#paint-body)"/><ellipse cx="10.1" cy="3.4" rx=".65" ry=".38" fill="url(#paint-body)"/><g class="claw-left" style="transform-origin:2.8px 9.8px"><path d="M3.5 10.2 1.7 9.0" stroke="url(#paint-body)" stroke-width=".9" stroke-linecap="round"/><path d="M1.7 9.1C-.4 9.3-1.25 7.4-.55 6.2L.5 7.25 1.0 5.65c1.2.5 1.8 2.4.7 3.45Z" fill="url(#paint-body)"/><path d="M.05 7.15q-.1.7.7 1.1" fill="none" stroke="#fff6f8" stroke-width=".18" stroke-linecap="round" opacity=".7"/></g><g class="claw-right" style="transform-origin:12.2px 9.8px"><path d="M11.5 10.2 13.3 9.0" stroke="url(#paint-body)" stroke-width=".9" stroke-linecap="round"/><path d="M13.3 9.1c2.1.2 2.95-1.7 2.25-2.9L14.5 7.25 14.0 5.65c-1.2.5-1.8 2.4-.7 3.45Z" fill="url(#paint-body)"/></g>'
        body = '<rect x="2.85" y="4.75" width="9.3" height="10.45" rx="2.55" fill="url(#paint-body)"/><path d="M10.1 5.05c1.2.4 1.85 1.2 1.85 2.5v4.75c0 1.65-.8 2.55-2.6 2.6.95-.6 1.2-1.4 1.2-2.8V7.2c0-.95-.1-1.6-.45-2.15Z" fill="#ae6682" opacity=".16"/><path d="M4 8V7.1q0-1.05 1.1-1.15h2.35" fill="none" stroke="#fff4f8" stroke-width=".33" stroke-linecap="round" opacity=".64"/>'
        detail = '<g fill="url(#paint-cream)"><rect x="4.6" y="14.45" width="1.2" height="1.65" rx=".55"/><rect x="6.9" y="14.7" width="1.2" height="1.65" rx=".55"/><rect x="9.2" y="14.45" width="1.2" height="1.65" rx=".55"/></g>'
        face = (5.45, 9.55, 9.05, 11.4)
    elif species == 'fox':
        back = '<g class="tail" style="transform-origin:10.5px 14px"><path d="M10.1 15c4.9 1.0 6.5-1.8 5.45-5.45-2.1.35-3.5 1.7-3.6 3.25l-2.0.5Z" fill="url(#paint-body)"/><path d="M15.55 9.55c.35 1.2.4 2.25.2 3.1l-2.4-.5c.4-1.25 1.1-2.15 2.2-2.6Z" fill="url(#paint-cream)"/></g><ellipse cx="7.5" cy="12.35" rx="3.6" ry="3.6" fill="url(#paint-body)"/><ellipse cx="7.5" cy="12.5" rx="2.0" ry="2.5" fill="url(#paint-cream)"/><ellipse cx="5.2" cy="15.5" rx="1.2" ry=".6" fill="url(#paint-trim)"/><ellipse cx="9.8" cy="15.5" rx="1.2" ry=".6" fill="url(#paint-trim)"/>'
        body = '<path d="m3.1 5 .45-3.5c1.55.3 2.35 1.6 2.85 2.55q1.1-.3 2.2 0c.5-.95 1.3-2.25 2.85-2.55l.45 3.5c1.15 1.15 1.5 2.4 1.35 3.95-.25 2.0-2.45 3.0-5.75 3.0s-5.5-1.0-5.75-3.0C1.6 7.4 1.95 6.15 3.1 5Z" fill="url(#paint-body)"/><path d="m3.9 2.55.25 2.7 1.45-.5Zm7.2 0-.25 2.7-1.45-.5Z" fill="#efaaaa"/><path d="M2.65 8.95q1.45-1.65 3.0-.85L7.5 9.3l1.85-1.2q1.55-.8 3 .85c-.65 1.6-2.5 2.35-4.85 2.35s-4.2-.75-4.85-2.35Z" fill="url(#paint-cream)"/>'
        detail = '<path d="M6.95 8.95q.55-.35 1.1 0L7.5 9.5Z" fill="#70504a"/>'
        face = (5.15, 9.85, 7.2, 10.05)
    elif species == 'mushroom':
        back = '<ellipse cx="5.3" cy="15.45" rx="1.15" ry=".5" fill="url(#paint-trim)"/><ellipse cx="9.7" cy="15.45" rx="1.15" ry=".5" fill="url(#paint-trim)"/><g class="limb-left" style="transform-origin:4.8px 11px"><path d="M4.8 11.2q-1.4.8-1.4 2" fill="none" stroke="url(#paint-cream)" stroke-width="1.0" stroke-linecap="round"/></g><g class="limb-right" style="transform-origin:10.2px 11px"><path d="M10.2 11.2q1.4.8 1.4 2" fill="none" stroke="url(#paint-cream)" stroke-width="1.0" stroke-linecap="round"/></g>'
        body = '<path d="M5.0 7.15h5c-.6 3-.5 4.9.25 7.35.3.95-.8 1.45-2.75 1.45s-3.05-.5-2.75-1.45c.75-2.45.85-4.35.25-7.35Z" fill="url(#paint-cream)"/><g class="crest" style="transform-origin:7.5px 8px"><path d="M.95 7.55C1.35 4.0 4.0 2.25 7.5 2.25s6.15 1.75 6.55 5.3c-1.85 1.35-11.25 1.35-13.1 0Z" fill="url(#paint-body)"/><ellipse cx="7.5" cy="7.65" rx="6.4" ry=".85" fill="url(#paint-trim)" opacity=".45"/><ellipse cx="3.8" cy="5.15" rx=".9" ry=".58" transform="rotate(-25 3.8 5.15)" fill="url(#paint-cream)"/><ellipse cx="8.2" cy="3.65" rx=".75" ry=".5" fill="url(#paint-cream)"/><ellipse cx="11.25" cy="5.5" rx=".9" ry=".65" transform="rotate(24 11.25 5.5)" fill="url(#paint-cream)"/><path d="M2.95 4.65q1.35-1.35 3.25-1.6" fill="none" stroke="#ffffff" stroke-width=".25" stroke-linecap="round" opacity=".48"/></g>'
        face = (6.15, 8.85, 10.45, 12.1)
    elif species == 'owl':
        back = '<ellipse cx="5.3" cy="15.65" rx="1.05" ry=".45" fill="url(#paint-gold)"/><ellipse cx="9.7" cy="15.65" rx="1.05" ry=".45" fill="url(#paint-gold)"/>'
        body = '<path d="M3.05 6.0 3.5 2.65 5.6 4.1q1.9-.6 3.8 0l2.1-1.45.45 3.35c.9 1.6 1.15 4.25.6 6.5-.55 2.3-2.15 3.35-5.05 3.35s-4.5-1.05-5.05-3.35c-.55-2.25-.3-4.9.6-6.5Z" fill="url(#paint-body)"/><path d="M7.5 6.1c-1.25-2.15-4.0-1.65-4.35.9-.25 2.35 1.2 4.15 4.35 4.75 3.15-.6 4.6-2.4 4.35-4.75-.35-2.55-3.1-3.05-4.35-.9Z" fill="url(#paint-cream)"/><ellipse cx="7.5" cy="12.9" rx="2.7" ry="2.35" fill="url(#paint-cream)" opacity=".5"/>'
        detail = '<g class="limb-left" style="transform-origin:3.5px 8px"><path d="M3.45 8.1c-1.55 1.75-1.45 4.65.35 6.1 1.0-1.6.8-4.2-.35-6.1Z" fill="url(#paint-trim)" opacity=".72"/></g><g class="limb-right" style="transform-origin:11.5px 8px"><path d="M11.55 8.1c1.55 1.75 1.45 4.65-.35 6.1-1.0-1.6-.8-4.2.35-6.1Z" fill="url(#paint-trim)" opacity=".72"/></g><path d="m6.95 9 .55 1.1.55-1.1Z" fill="url(#paint-gold)"/><path d="m5.8 12.1.4.45.4-.45m1.0 0 .4.45.4-.45m-2.0 1.05.4.45.4-.45m1 0 .4.45.4-.45" fill="none" stroke="#b9a8ca" stroke-width=".25" stroke-linecap="round"/>'
        face = (5.15, 9.85, 7.45, 10.2)
    elif species == 'cat':
        back = '<g class="tail" style="transform-origin:10.5px 14px"><path d="M10.2 14.8c4.0 1.1 5.05-1.75 3.7-3.4-.7-.95-1.9-.2-1.5.7" fill="none" stroke="url(#paint-body)" stroke-width="1.35" stroke-linecap="round"/></g><ellipse cx="7.5" cy="12.35" rx="3.55" ry="3.6" fill="url(#paint-body)"/><ellipse cx="7.5" cy="12.65" rx="1.85" ry="2.55" fill="url(#paint-cream)"/><ellipse cx="5.15" cy="15.5" rx="1.1" ry=".65" fill="url(#paint-cream)"/><ellipse cx="9.85" cy="15.5" rx="1.1" ry=".65" fill="url(#paint-cream)"/>'
        body = '<path d="M3.0 5.7 3.7 1.85c1.25.3 1.95 1.25 2.55 2.55q1.25-.35 2.5 0c.6-1.3 1.3-2.25 2.55-2.55L12 5.7c.75 1.05 1.0 2.4.65 3.5-.5 1.8-2.3 2.75-5.15 2.75S2.85 11 2.35 9.2C2 8.1 2.25 6.75 3 5.7Z" fill="url(#paint-body)"/><path d="M4.0 3.05 3.7 5.7l1.65-.85Zm7.0 0 .3 2.65-1.65-.85Z" fill="#e8a0a7"/><ellipse cx="7.5" cy="9.3" rx="2.25" ry="1.2" fill="url(#paint-cream)"/><path d="M6.6 4.8 6.95 6m.55-1.4V6m.9-1.2L8.05 6" stroke="url(#paint-trim)" stroke-width=".4" stroke-linecap="round" opacity=".8"/>'
        detail = '<path d="M7.05 8.8q.45-.2.9 0L7.5 9.3Z" fill="#bc7880"/><path d="M3.7 8.6 4.8 8.9M3.55 9.4 4.7 9.5m6.6-.9-1.1.3m1.25.5-1.15.1" fill="none" stroke="#896550" stroke-width=".15" stroke-linecap="round"/>'
        face = (5.15, 9.85, 7.35, 10.0)
    else:
        back = '<rect x="4.25" y="14.95" width="2.15" height="1.25" rx=".55" fill="url(#paint-trim)"/><rect x="8.6" y="14.95" width="2.15" height="1.25" rx=".55" fill="url(#paint-trim)"/><g class="limb-left" style="transform-origin:3.5px 12px"><rect x="1.8" y="11.45" width="1.6" height="3.1" rx=".7" fill="url(#paint-body)"/></g><g class="limb-right" style="transform-origin:11.5px 12px"><rect x="11.6" y="11.45" width="1.6" height="3.1" rx=".7" fill="url(#paint-body)"/></g><path d="M7.5 4.6V2.2" stroke="url(#paint-trim)" stroke-width=".5"/><g class="crest" style="transform-origin:7.5px 4px"><circle cx="7.5" cy="1.85" r=".7" fill="url(#paint-gold)"/></g><rect x="1.45" y="7.35" width="1.5" height="2.0" rx=".55" fill="url(#paint-gold)"/><rect x="12.05" y="7.35" width="1.5" height="2.0" rx=".55" fill="url(#paint-gold)"/>'
        body = '<rect x="3.45" y="10.65" width="8.1" height="4.8" rx="1.75" fill="url(#paint-body)"/><rect x="2.6" y="4.5" width="9.8" height="7.95" rx="2.3" fill="url(#paint-body)"/><rect x="3.75" y="6.05" width="7.5" height="4.55" rx="1.45" fill="url(#paint-screen)"/><path d="M3.6 6.0q.1-.65.9-.7h3.0" fill="none" stroke="#ffffff" stroke-width=".25" stroke-linecap="round" opacity=".6"/><path d="M4.35 6.55h2.5" stroke="#b3d8d1" stroke-width=".16" stroke-linecap="round" opacity=".35"/>'
        detail = '<rect x="6.2" y="13.1" width="2.6" height=".85" rx=".35" fill="url(#paint-trim)" opacity=".7"/><circle cx="7.5" cy="13.5" r=".22" fill="url(#paint-gold)"/>'
        face = (5.6, 9.4, 8.25, 9.65)
    return back, body, detail, face


def sprite(filename, theme):
    color, trim, accent = PALETTES[theme]
    name, species = CHARACTERS.get(theme, CHARACTERS['template'])
    sleepy = any(x in filename for x in ('sleep', 'doze', 'collapse'))
    happy = any(x in filename for x in ('happy', 'attention', 'notification', 'wake', 'victory', 'wave'))
    busy = any(x in filename for x in ('working', 'focus', 'thinking', 'build', 'debug', 'juggling'))
    reaction = 'react' in filename
    error = 'error' in filename
    mini = 'mini-' in filename
    state = 'rest' if sleepy else 'happy' if happy else 'working' if busy else 'reaction' if reaction else 'idle'
    back, body, details, (x1, x2, ey, my) = character_parts(species)
    eye_color = '#ffd98c' if species == 'robot' else '#283738'
    eye_r = .30 if species == 'turtle' else .43
    eye_h = .43 if species == 'turtle' else .65
    lids = f'<path d="M{x1 - eye_r:.2f} {ey:.2f}q{eye_r:.2f} .40 {2 * eye_r:.2f} 0M{x2 - eye_r:.2f} {ey:.2f}q{eye_r:.2f} .40 {2 * eye_r:.2f} 0" fill="none" stroke="{eye_color}" stroke-width=".25" stroke-linecap="round"/>'
    if sleepy:
        eyes = lids
    else:
        eyes = f'<g class="blink-open"><ellipse cx="{x1}" cy="{ey}" rx="{eye_r}" ry="{eye_h}"/><ellipse cx="{x2}" cy="{ey}" rx="{eye_r}" ry="{eye_h}"/><circle cx="{x1 - .09:.2f}" cy="{ey - .25:.2f}" r=".13" fill="white"/><circle cx="{x2 - .09:.2f}" cy="{ey - .25:.2f}" r=".13" fill="white"/></g><g class="blink-lids">{lids}</g>'
    mid = 7.5
    mouth = f'<path d="M{mid - .60} {my}q.6 {-.38 if error else .62 if happy else .35} 1.2 0" fill="none" stroke="{eye_color}" stroke-width=".22" stroke-linecap="round"/>'
    cheeks = '' if species == 'robot' else f'<ellipse cx="{x1 - .75:.2f}" cy="{ey + 1.35:.2f}" rx=".60" ry=".32" fill="#ed94a7" opacity=".46"/><ellipse cx="{x2 + .75:.2f}" cy="{ey + 1.35:.2f}" rx=".60" ry=".32" fill="#ed94a7" opacity=".46"/>'
    accent_id = theme + ('-mini-accent' if mini else '-rest-accent' if sleepy or error else '-idle-accent')
    badge = '<path d="m7.5 12.7.28.55.6.09-.44.43.11.6-.55-.28-.55.28.11-.6-.44-.43.6-.09Z" fill="url(#paint-gold)"/>' if species == 'sprout' else ''
    props = '<g class="typing-prop"><rect x="4.55" y="14.1" width="5.9" height="1.15" rx=".40" fill="url(#paint-cream)"/><path d="M5.25 14.65h.45m.55 0h.45m.55 0h.45m.55 0h.45m.55 0h.45" stroke="url(#paint-trim)" stroke-width=".14" stroke-linecap="round"/></g>' if busy else ''
    decor = '<g class="sparkles" fill="url(#paint-gold)"><path d="m1.15 3.25.3.65.65.3-.65.3-.3.65-.3-.65-.65-.3.65-.3ZM14 2.4l.25.55.55.25-.55.25-.25.55-.25-.55-.55-.25.55-.25Z"/></g>' if happy else ''
    if sleepy:
        decor += f'<g class="dream" fill="{trim}" opacity=".65"><path d="M12.8 4h1.3l-1.3 1.35h1.3" fill="none" stroke="{trim}" stroke-width=".20" stroke-linecap="round" stroke-linejoin="round"/></g>'
    if error:
        decor += '<path d="M13.5 3.1q1.25 1.8 0 2.25-1.25-.45 0-2.25Z" fill="#89c4e9"/>'
    css = '''#body-js{transform-origin:7.5px 16px}.idle-motion{animation:breathe 3.55s ease-in-out infinite}.working-motion{animation:focus 2.3s ease-in-out infinite}.happy-motion{animation:hop 1.35s cubic-bezier(.4,0,.2,1) infinite}.rest-motion{animation:rest 4.8s ease-in-out infinite}.reaction-motion{animation:greet 1.5s cubic-bezier(.4,0,.2,1) infinite}.crest{animation:crest 3.8s ease-in-out infinite}.tail{animation:tail 3.2s ease-in-out infinite}.claw-left{animation:claw-left 3.4s ease-in-out infinite}.claw-right{animation:claw-right 3.4s ease-in-out infinite}.happy-motion .claw-left{animation:wave-left 1.35s ease-in-out infinite}.happy-motion .claw-right{animation:wave-right 1.35s ease-in-out infinite}.happy-motion .limb-right{animation:wave-right 1.35s ease-in-out infinite}.working-motion .limb-left{animation:tap .62s ease-in-out infinite}.working-motion .limb-right{animation:tap .62s .31s ease-in-out infinite}.sparkles,.dream{animation:glow 1.8s ease-in-out infinite}.blink-open{animation:blink-open 4.6s linear infinite}.blink-lids{animation:blink-lids 4.6s linear infinite;opacity:0}.rest-motion .crest,.rest-motion .tail,.rest-motion .claw-left,.rest-motion .claw-right{animation-duration:5.8s}@keyframes breathe{0%,100%{transform:translateY(0) rotate(0)}42%{transform:translateY(-.46px) rotate(-.45deg)}58%{transform:translateY(-.54px) rotate(-.2deg)}}@keyframes focus{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(.1px) rotate(.2deg)}62%{transform:translateY(-.34px) rotate(.45deg)}82%{transform:translateY(-.08px) rotate(-.15deg)}}@keyframes rest{0%,100%{transform:translateY(0) rotate(0)}48%{transform:translateY(-.26px) rotate(-.18deg)}58%{transform:translateY(-.31px) rotate(-.1deg)}}@keyframes hop{0%,100%{transform:translateY(0) rotate(0)}32%{transform:translateY(-1.35px) rotate(-1.8deg)}43%{transform:translateY(-1.52px) rotate(-.8deg)}62%{transform:translateY(.1px) rotate(1.25deg)}76%{transform:translateY(-.14px) rotate(-.35deg)}}@keyframes greet{0%,100%{transform:translateY(0) rotate(0)}18%{transform:translateY(-.48px) rotate(-1deg)}34%{transform:translateY(-.82px) rotate(2.4deg)}55%{transform:translateY(-.24px) rotate(-.75deg)}74%{transform:translateY(.05px) rotate(.25deg)}}@keyframes crest{50%{transform:rotate(3.5deg)}}@keyframes tail{50%{transform:rotate(-6deg)}}@keyframes claw-left{50%{transform:rotate(-5deg)}}@keyframes claw-right{50%{transform:rotate(5deg)}}@keyframes wave-left{50%{transform:rotate(-24deg)}}@keyframes wave-right{50%{transform:rotate(24deg)}}@keyframes tap{50%{transform:translateY(.58px)}}@keyframes glow{50%{opacity:.42}}@keyframes blink-open{0%,93%,97%,100%{opacity:1}94%,96%{opacity:0}}@keyframes blink-lids{0%,93%,97%,100%{opacity:0}94%,96%{opacity:1}}@media(prefers-reduced-motion:reduce){*{animation:none!important}.blink-lids{display:none}}'''
    return '\n'.join([
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45" preserveAspectRatio="xMidYMid meet" role="img" data-species="{species}" data-art-version="3" aria-label="{name}">',
        f'<title>{name} — original artwork by FanxingMeng1999 (MIT)</title>',
        material_defs(color, trim, accent), '<style>' + css + '</style>',
        '<ellipse id="shadow-js" cx="7.5" cy="16.5" rx="5.5" ry=".55" fill="#294b43" opacity=".09"/><ellipse cx="7.5" cy="16.5" rx="3.6" ry=".32" fill="#294b43" opacity=".07"/>',
        f'<g data-size-profile="compact-uniform" transform="translate(1.65 3.52) scale(.78)"><g id="body-js"><g class="{state}-motion" style="transform-origin:7.5px 16px">',
        back, body, details,
        f'<g id="{accent_id}">{badge}</g>',
        f'<g id="eyes-js" fill="{eye_color}">{eyes}</g><g id="eyes-doze" style="display:none">{lids}</g>',
        cheeks, mouth, props, decor,
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
    inner=master[master.index('<defs>'):master.rindex('</svg>')]
    hero='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="510" viewBox="0 0 1200 510"><rect width="1200" height="510" rx="32" fill="#eff7f0"/><circle cx="988" cy="260" r="195" fill="#d9efdf"/><text x="64" y="133" font-family="Arial,sans-serif" font-size="19" font-weight="700" letter-spacing="4" fill="#27856f">YOUR DAY. A LITTLE ADVENTURE.</text><text x="60" y="224" font-family="Arial,sans-serif" font-size="78" font-weight="700" fill="#254a44">GoWIN!Buddy</text><text x="64" y="286" font-family="Arial,sans-serif" font-size="25" fill="#567169">A desktop companion for tasks, focus and tiny wins.</text><text x="64" y="350" font-family="Arial,sans-serif" font-size="19" fill="#27856f">DESKTOP PET   /   LOCAL RPG   /   WINDOWS</text><g transform="translate(861 162) scale(12)">'+inner+'</g><text x="64" y="448" font-family="Arial,sans-serif" font-size="17" fill="#567169">Open source. Original Sprout Buddy artwork. MIT license.</text></svg>'
    write_utf8(media/'hero.svg',hero)
    tone(sounds/'confirm.wav',[659.25,880]);tone(sounds/'complete.wav',[523.25,659.25,783.99])
    manifest={'schemaVersion':1,'author':'FanxingMeng1999','license':'MIT','generator':'scripts/generate-public-art.py','artVersion':3,'sizing':{'profile':'compact-uniform','scale':0.78,'preserveAspectRatio':'xMidYMid meet'},'design':'Ten rounded mascot characters with continuous surfaces, soft material shading and articulated idle, work, celebration and rest movements. Compact uniform scaling preserves natural anatomy.','assets':records,'brandSource':'assets/brand/source/sprout-buddy.svg'}
    manifest['characters']={theme:{'name':CHARACTERS[theme][0],'nameZh':CHARACTER_LABELS_ZH[theme],'species':CHARACTERS[theme][1]} for theme in sorted(CHARACTERS) if theme != 'template'}
    manifest['characterSources']=[{'species':species,'name':name,'nameZh':CHARACTER_LABELS_ZH[theme],'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for theme,(name,species) in sorted(CHARACTERS.items()) if theme != 'template' for f in [character_source/(species+'.svg')]]
    preview_files=[media/name for name in ['mascot-gallery.png','mascot-preview-v3.gif','rosy-crab-preview-v3.gif']]
    manifest['previews']=[{'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in preview_files if f.is_file()]
    manifest['brandExports']=[{'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(list(png.glob('*'))+list(sv.glob('*')))]
    manifest['tones']=[{'path':f.relative_to(root).as_posix(),'license':'MIT','sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(sounds.glob('*.wav'))]
    write_utf8(root/'assets/brand/extracted/manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+chr(10))
    print('Generated %d original SVG states, brand PNG/SVG and two WAV tones.' % len(records))

if __name__=='__main__':main()
