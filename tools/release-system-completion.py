"""Release agent-reviewed image rosters, then rebuild the game and comparison.

Usage: python tools/release-system-completion.py SYSTEM_ID [SYSTEM_ID ...]
The caller reviews the completed images before invoking this explicit step.
"""
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
file=ROOT/'tools/system-completion.json'
plan=json.loads(file.read_text(encoding='utf-8'))
requested={int(value) for value in sys.argv[1:]}
assert requested, 'Supply reviewed system IDs'
assert requested <= {s['id'] for s in plan['systems']}
art=ROOT/'html-games/broken-mirror-port/assets/system-planets'
for system in plan['systems']:
    if system['id'] not in requested:
        continue
    for p in system['planets']:
        assert all((art/(p['asset']+ext)).is_file() for ext in ['.webp','.provenance.json','.actual-prompt.txt']), p['name']
plan['releasedSystems']=sorted(set(plan['releasedSystems'])|requested)
file.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for script in ['build-system-catalog.py','build-completion-preview.py']:
    subprocess.run([sys.executable,str(ROOT/'tools'/script)],cwd=ROOT,check=True)
