"""Package generated planet art for the game; retain original generation provenance."""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root/'html-games/broken-mirror-port/assets/system-planets'
key, source = sys.argv[1:3]
assert key and all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in key)
source = Path(source)
with Image.open(source) as im:
    assert im.mode == 'RGBA' and im.getextrema()[3][0] == 0, 'Generated asset must have real transparency'
    im.save(out/(key+'.webp'), 'WEBP', quality=94, method=6)
    size = im.size
prompts=json.loads((out/'prompts.json').read_text(encoding='utf-8'))
actual_prompt=out/(key+'.actual-prompt.txt')
prompt=actual_prompt.read_text(encoding='utf-8').strip() if actual_prompt.exists() else next(p['prompt'] for p in prompts['assets'] if p['id']==key)
record=dict(id=key,file=key+'.webp',generator='built-in image_gen',prompt=prompt,source=str(source),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sha256=hashlib.sha256((out/(key+'.webp')).read_bytes()).hexdigest(),size=size,transparent=True)
if key.endswith('-sol-v2'):
    from system_completion import reference_for
    plan=json.loads((root/'tools/system-completion.json').read_text(encoding='utf-8'))
    planet=next(p for s in plan['systems'] for p in s['planets'] if p['asset']==key)
    reference=root/'html-games/flashtrek-broken-mirror/art-review/sol-planets'/reference_for(planet)
    record['referenceArtwork']=[dict(file=reference.relative_to(root).as_posix(),sha256=hashlib.sha256(reference.read_bytes()).hexdigest())]
(out/(key+'.provenance.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(id=key,size=size,bytes=(out/(key+'.webp')).stat().st_size)))
