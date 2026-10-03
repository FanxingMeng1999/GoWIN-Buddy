"""Check the tracked public snapshot for accidental private data and secrets."""
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).decode('utf-8').split(chr(0))
PATTERNS = {
    'access token': re.compile(r'(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,})'),
    'private key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'personal home path': re.compile(r'(?i)\b[a-z]:[\\/]+users[\\/]+(?!public\b|default\b|example\b|testuser\b)[a-z0-9._-]+'),
}
TEXT_SUFFIXES = {'.js','.mjs','.cjs','.json','.html','.css','.svg','.py','.ps1','.bat','.vbs','.md','.yml','.yaml','.txt','.sh'}
FORBIDDEN_ROOTS = {'.research-os', 'data', 'state', 'runtime', 'logs', 'tmp', '.venv'}
problems = []
for rel in filter(None, FILES):
    parts = Path(rel).parts
    if parts[0] in FORBIDDEN_ROOTS or 'node_modules' in parts or rel.startswith(('tools/runtime/','tools/downloads/','installer/windows/dist/','installer/windows/build/')):
        problems.append((rel,'generated or private directory'))
    if Path(rel).name.startswith('.env') or Path(rel).suffix.lower() in {'.pem','.key','.pfx','.p12'}:
        problems.append((rel,'credential file'))
    target = ROOT / rel
    if target.is_file() and (target.suffix.lower() in TEXT_SUFFIXES or target.name in {'LICENSE','.gitignore','.gitattributes'}):
        text = target.read_text(encoding='utf-8-sig')
        for label, pattern in PATTERNS.items():
            if pattern.search(text): problems.append((rel,label))

state = json.loads((ROOT/'apps/rpg-hub/web/doctor_dashboard_state_template.v1.json').read_text(encoding='utf-8'))
for key in ['tasks','focusSessions','workRecords','foods','moodHistory','mindRecords','achievementLogs']:
    if state.get(key): problems.append(('state template','nonempty '+key))
if state.get('graduationTargetDate'): problems.append(('state template','fixed personal goal date'))
def contains_data(value):
    if isinstance(value, dict): return any(contains_data(v) for v in value.values())
    if isinstance(value, list): return any(contains_data(v) for v in value)
    return bool(value)

for key in ['xp','stars','rewardLogs','questClaims','questProgress','dailyCounters']:
    if contains_data(state.get('gameState',{}).get(key)): problems.append(('state template','nonempty game state '+key))
for item in state.get('longTermMilestones',[]):
    if item.get('claimed') or item.get('stage') or item.get('carrotAmount'):
        problems.append(('state template','nonzero milestone progress or monetary preset'))

for required in ['LICENSE','THIRD_PARTY_NOTICES.md','assets/LICENSE','apps/pet-desktop/assets/LICENSE','apps/rpg-hub/web/vendor/fontawesome/LICENSE.txt']:
    if not (ROOT/required).is_file(): problems.append((required,'missing license'))
if problems:
    for rel,label in problems: print('FAIL: %s: %s' % (rel,label))
    sys.exit(1)
print('Public source check passed: %d tracked files; empty profile and required licenses.' % len(list(filter(None,FILES))))
