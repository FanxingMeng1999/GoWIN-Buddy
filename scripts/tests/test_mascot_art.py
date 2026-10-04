"""Validate the built-in original mascot assets and generation manifest."""
import hashlib
import json
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
    if not any(node.get('data-size-profile') == 'legacy-pet-footprint' for node in svg.iter()):
        raise SystemExit('Missing original-size adjustment: ' + rel)
    node_ids = {node.get('id') for node in svg.iter() if node.get('id')}
    if not {'body-js', 'eyes-js', 'shadow-js'}.issubset(node_ids):
        raise SystemExit('Missing interaction anchors: ' + rel)

for item in manifest['characterSources'] + manifest['brandExports'] + manifest['previews'] + manifest['tones']:
    rel = item['path']
    target = ROOT / rel
    if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
        raise SystemExit('Character/brand export hash mismatch: ' + rel)
if len(manifest['characterSources']) != 10 or len(manifest['previews']) != 1:
    raise SystemExit('Character source files or preview gallery are incomplete')
print('PASS: ten distinct mascot shapes, original-scale hitboxes and viewBox, 372 SVG states, source/export hashes.')
