"""Read-only integrity check for physical systems, generated art and provenance."""
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
GAME=ROOT/'html-games/broken-mirror-port'
text=(GAME/'system-catalog-data.js').read_text(encoding='utf-8')
data=json.loads(text.split('window.VexedMirrorSystemData = ',1)[1].rstrip().removesuffix(';'))
records=data['systems']
additions=json.loads((ROOT/'tools/system-additions.json').read_text(encoding='utf-8'))['systems']
expansion=json.loads((ROOT/'tools/mirror-expansion.json').read_text(encoding='utf-8'))
additions+=expansion['systems']
assert len(records)==51+len(additions)
assert sorted(i for r in records for i in r['legacyIds'])==list(range(1,53+len(additions)))
extra={a['catalog']['id']:a['catalog'] for a in additions}
plan=json.loads((ROOT/'tools/system-neighborhoods.json').read_text(encoding='utf-8'))['systems']
completion=json.loads((ROOT/'tools/system-completion.json').read_text(encoding='utf-8'))
released={s['id']:s for s in completion['systems'] if s['id'] in completion['releasedSystems']}
art=GAME/'assets/system-planets'
prompts=json.loads((art/'prompts.json').read_text(encoding='utf-8'))
referenced=set()
for record in records:
    bodies=record['bodies']
    expected=extra.get(record['id'],{}).get('bodies',plan.get(str(record['id']),[]))+expansion['overlays'].get(str(record['id']),{}).get('bodies',[])
    expected+= [p for p in released.get(record['id'],{}).get('planets',[]) if 'existingBodyId' not in p]
    assert [b['id'] for b in bodies if b['evidence']=='authored']==[b['id'] for b in expected if b.get('evidence','authored')=='authored']
    assert len(set(b['id'] for b in bodies))==len(bodies)
    for body in bodies:
        if 'parentId' in body:assert any(b['id']==body['parentId'] for b in bodies)
        if body['evidence']=='authored':assert not body['port']
        file=(GAME/unquote(body['art'])).resolve()
        assert file.is_relative_to(ROOT) and file.is_file(),body['art']
        referenced.add(file)
generated=[]
for asset in prompts['assets']:
    file=art/(asset['id']+'.webp')
    assert file.is_file(),file
    provenance=json.loads(file.with_suffix('.provenance.json').read_text(encoding='utf-8'))
    assert provenance['sha256']==hashlib.sha256(file.read_bytes()).hexdigest(),file
    assert provenance['generator']=='built-in image_gen'
    assert provenance['prompt']==asset['prompt'],file
    if asset['id'].endswith('-sol-v2'):
        assert len(provenance['referenceArtwork'])==1,file
        for reference in provenance['referenceArtwork']:
            source=ROOT/reference['file']
            assert source.is_file(),source
            assert reference['sha256']==hashlib.sha256(source.read_bytes()).hexdigest(),file
    with Image.open(file) as image:
        assert min(image.size)>=1024
        if asset['id'].endswith('-sol-v2'):
            assert image.width==image.height, 'Local planet sprites use square canvases to preserve spherical geometry'
        assert image.mode=='RGBA' and image.getextrema()[3][0]==0
        assert image.getextrema()[3][1]>=250, 'Opaque subjects may retain the generator\'s near-opaque alpha'
    generated.append(file)
all_bodies=[b for r in records for b in r['bodies']]
completed=[p for s in released.values() for p in s['planets']]
assert len({p['asset'] for p in completed})==len(completed)
assert len({hashlib.sha256((art/(p['asset']+'.webp')).read_bytes()).hexdigest() for p in completed})==len(completed)
report=dict(physicalSystems=len(records),legacyWorlds=52,additionalDestinations=len(additions),totalDestinations=52+len(additions),bodies=len(all_bodies),authoredBodies=sum(b['evidence']=='authored' for b in all_bodies),originalGasGiants=sum(b['evidence']=='authored' and b['kind']=='gas_giant' for b in all_bodies),originalIceGiants=sum(b['evidence']=='authored' and b['kind']=='ice_giant' for b in all_bodies),generatedImages=len(generated),generatedBytes=sum(f.stat().st_size for f in generated),uniqueReferencedImages=len(referenced),allPathsValid=True,allGeneratedImagesTransparent=True,allHashesValid=True)
output=ROOT/'test-results/system-expansion/art-validation.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
