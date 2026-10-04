"""Validate the built-in original mascot assets and generation manifest."""
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    'clawd': 'sprout', 'mint-chip': 'turtle', 'blue-hour': 'penguin',
    'matcha-lab': 'frog', 'strawberry-milk': 'crab', 'sunset-soda': 'fox',
    'paper-parade': 'mushroom', 'aurora-pop': 'owl', 'campfire-cocoa': 'cat',
    'pixel-pro': 'robot',
}
manifest = json.loads((ROOT / 'assets/brand/extracted/manifest.json').read_text(encoding='utf-8'))
items = {item['path']: item for item in manifest['assets']}
if len(items) != 372:
    raise SystemExit('Expected 372 themed SVG states; found %d' % len(items))
if set(manifest['characters']) != set(EXPECTED):
    raise SystemExit('Character manifest does not cover all ten bundled mascots')
if {key: value['species'] for key, value in manifest['characters'].items()} != EXPECTED:
    raise SystemExit('Character species map does not match the released cast')
if len({value['species'] for value in manifest['characters'].values()}) != 10:
    raise SystemExit('Mascot silhouettes must have ten distinct species')

theme_root = ROOT / 'apps/pet-desktop/themes'
for theme_id, species in EXPECTED.items():
    theme_file = theme_root / theme_id / 'theme.json'
    theme = json.loads(theme_file.read_text(encoding='utf-8'))
    if theme.get('mascot', {}).get('species') != species:
        raise SystemExit('%s theme metadata has the wrong mascot species' % theme_id)
    if not theme.get('mascot', {}).get('nameZh') or not manifest['characters'][theme_id].get('nameZh'):
        raise SystemExit('%s mascot is missing its Chinese name' % theme_id)
    if theme.get('hitBoxes', {}).get('default') != {'x': -1, 'y': 5, 'w': 17, 'h': 12}:
        raise SystemExit('%s default hitbox differs from the earlier GoWIN!Buddy version' % theme_id)
    if theme.get('objectScale') != {'widthRatio': 1.9, 'heightRatio': 1.3, 'offsetX': -0.45, 'offsetY': -0.25}:
        raise SystemExit('%s viewBox rendering dimensions were modified' % theme_id)

for rel, item in items.items():
    target = ROOT / rel
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != item['sha256']:
        raise SystemExit('Generated asset hash mismatch: ' + rel)
    svg = ET.fromstring(raw)
    if svg.tag != '{http://www.w3.org/2000/svg}svg' or svg.get('viewBox') != '-15 -25 45 45':
        raise SystemExit('Unexpected sprite viewBox: ' + rel)
    theme_id = item['theme']
    species = EXPECTED.get(theme_id, 'sprout' if theme_id == 'template' else None)
    if not species or svg.get('data-species') != species:
        raise SystemExit('Unexpected mascot silhouette: ' + rel)
    if svg.get('preserveAspectRatio') != 'xMidYMid meet' or svg.get('data-art-version') != '3':
        raise SystemExit('Missing natural-proportion rendering contract: ' + rel)
    profile = next((node for node in svg.iter() if node.get('data-size-profile') == 'compact-uniform'), None)
    if profile is None or 'scale(.78)' not in profile.get('transform', ''):
        raise SystemExit('Missing compact uniform scale: ' + rel)
    # Regress the actual flattening bug: any anatomical scale must preserve both axes.
    for node in svg.iter():
        for value in re.findall(r'scale\(([^)]*)\)', node.get('transform', '')):
            axes = [float(part) for part in re.split(r'[ ,]+', value.strip())]
            if len(axes) == 2 and abs(abs(axes[0]) - abs(axes[1])) > 1e-9:
                raise SystemExit('Anisotropic anatomy scaling: ' + rel)
    node_ids = {node.get('id') for node in svg.iter() if node.get('id')}
    for material in re.findall(r'url\(#([^)]*)\)', raw.decode('utf-8')):
        if material not in node_ids:
            raise SystemExit('Unresolved surface material in ' + rel + ': ' + material)
    if len(svg.findall('.//{http://www.w3.org/2000/svg}radialGradient')) < 2:
        raise SystemExit('Missing continuous shaded surfaces: ' + rel)
    node_ids = {node.get('id') for node in svg.iter() if node.get('id')}
    if not {'body-js', 'eyes-js', 'shadow-js'}.issubset(node_ids):
        raise SystemExit('Missing interaction anchors: ' + rel)

for item in manifest['characterSources'] + manifest['brandExports'] + manifest['previews'] + manifest['tones']:
    rel = item['path']
    target = ROOT / rel
    if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
        raise SystemExit('Character/brand export hash mismatch: ' + rel)
if len(manifest['characterSources']) != 10:
    raise SystemExit('Character source files are incomplete')
preview_paths = {item['path'] for item in manifest['previews']}
if 'docs/media/mascot-gallery.png' not in preview_paths:
    raise SystemExit('Static character gallery is missing from the preview manifest')
for preview in ['docs/media/mascot-preview-v3.gif', 'docs/media/rosy-crab-preview-v3.gif']:
    if (ROOT / preview).is_file() and preview not in preview_paths:
        raise SystemExit('Animated character preview is missing from the manifest: ' + preview)
for species in EXPECTED.values():
    if not (ROOT / 'assets/brand/extracted/png' / ('mascot_' + species + '.png')).is_file():
        raise SystemExit('Transparent character export is missing: ' + species)
if manifest.get('sizing', {}).get('scale') != .78:
    raise SystemExit('Manifest does not match the compact uniform scale')
hero = (ROOT / 'docs/media/hero.svg').read_text(encoding='utf-8')
hero_svg = ET.fromstring(hero)
hero_ids = {node.get('id') for node in hero_svg.iter() if node.get('id')}
if any(ref not in hero_ids for ref in re.findall(r'url\(#([^)]*)\)', hero)):
    raise SystemExit('Hero image is missing its surface material definitions')
print('PASS: ten naturally proportioned shaded mascots, compact uniform scaling, 372 SVG states, anchors and material/export hashes.')
