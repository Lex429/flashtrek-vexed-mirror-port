"""Import built-in imagegen output and record exact sequential source lineage."""
import hashlib,json,shutil,sys
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'html-games/flashtrek-broken-mirror/showcase-assets/orion'
stages=['intact','light','heavy','severe']
data=json.loads((ART/'generation.json').read_text(encoding='utf8'))
incoming=json.loads((ROOT/(sys.argv[1] if len(sys.argv)>1 else 'test-results/orion/incoming.json')).read_text(encoding='utf8'))
for row in incoming:
    previous=ART/'masters'/f"orion-{row['ship']}-{stages[row['stage']-1]}.png"
    assert Path(row['input']).resolve()==previous.resolve(),row
    source=Path(row['source']);destination=ART/'masters'/row['file']
    with Image.open(source) as image,Image.open(previous) as before:
        assert image.mode=='RGBA' and image.size==before.size,(source,image.mode,image.size,before.size)
        alpha=image.getchannel('A');histogram=alpha.histogram()
        # Some generated margins contain alpha=1 antialiasing dust. Reject
        # an actual matte, while retaining the source's original edge pixels.
        assert max(alpha.getpixel(point) for point in [(0,0),(0,image.height-1),(image.width-1,0),(image.width-1,image.height-1)])<8,'Generated an opaque background'
        assert histogram[0]>image.width*image.height*.3,'Background lacks genuine alpha transparency'
    shutil.copy2(source,destination)
    row['input']='masters/'+previous.name
    row['inputSha256']=hashlib.sha256(previous.read_bytes()).hexdigest()
    row['generatedFile']=source.name;row.pop('source');row['master']='masters/'+destination.name
    row['sha256']=hashlib.sha256(destination.read_bytes()).hexdigest()
    data['stages']=[old for old in data['stages'] if (old['ship'],old['stage'])!=(row['ship'],row['stage'])]+[row]
    print(row['ship'],row['stage'],row['sha256'])
for row in data['stages']:
    if 'source' in row:row['generatedFile']=Path(row.pop('source')).name
data['stages'].sort(key=lambda row:(row['id'],row['stage']))
(ART/'generation.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
