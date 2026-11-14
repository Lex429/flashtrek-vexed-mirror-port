"""Merge the reviewed four Prometheus entries into the existing portable gallery."""
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'html-games/flashtrek-broken-mirror'
DEST=Path('C:/Users/alphi/Games-Hub-Portable/site/html-games/flashtrek-broken-mirror')
IDS={37,3701,3702,3703}
EVIDENCE=Path('C:/Users/alphi/Documents/broken-mirror-play-session/latest-prometheus.txt').read_text().strip()
PACKAGE=Path('C:/Users/alphi/Documents/broken-mirror-play-session/latest-prometheus-package.txt')
BACKUP=(Path(PACKAGE.read_text(encoding='utf8')).parent if PACKAGE.exists() else Path(EVIDENCE))/'portable-backups'

def retain(path):
    if path.exists():
        copy=BACKUP/path.relative_to(DEST)
        if not copy.exists():
            copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,copy)

def profiles(path):
    code="const fs=require('fs'),vm=require('vm'),c=vm.createContext({window:{earthAnimationProfiles:{}}});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.newShipAnimationProfiles));"
    return json.loads(subprocess.check_output(['node','-e',code,str(path)],text=True))

def main():
    assert (DEST/'damage-showcase.html').is_file()
    catalog=json.loads((SOURCE/'showcase-assets/catalog.json').read_text(encoding='utf8'))
    folders={Path(frame).parts[0] for row in catalog['ships'] if row['id'] in IDS for frame in row['frames']}
    for folder in folders:
        for path in (SOURCE/'showcase-assets'/folder).rglob('*'):
            if not path.is_file() or 'masters' in path.parts:continue
            target=DEST/path.relative_to(SOURCE);retain(target);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    for name in ['catalog.json','combat-data.json']:
        path=DEST/'showcase-assets'/name;retain(path)
        incoming=json.loads((SOURCE/'showcase-assets'/name).read_text(encoding='utf8'));current=json.loads(path.read_text(encoding='utf8'))
        if name=='catalog.json':
            selected={row['id']:row for row in incoming['ships'] if row['id'] in IDS}
            previous=len(current['ships']);retained=[row for row in current['ships'] if row['id'] not in IDS]
            current['ships']=retained+list(selected.values())
            assert all(any(item['id']==row['id'] for item in current['ships']) for row in retained)
            print(json.dumps({'previousGalleryEntries':previous,'galleryEntries':len(current['ships']),'prometheusEntries':len(selected)}))
        else:
            for id in IDS:current['ships'][str(id)]=incoming['ships'][str(id)]
        path.write_text(json.dumps(current,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
    path=DEST/'new-ship-profiles.js';retain(path);current=profiles(path);incoming=profiles(SOURCE/'new-ship-profiles.js')
    for id in IDS:current[str(id)]=incoming[str(id)]
    path.write_text('/* Measured ship lamps, breaches and four aligned damage stages. */\nwindow.newShipAnimationProfiles='+json.dumps(current,separators=(',',':'))+';\nObject.assign(window.earthAnimationProfiles,window.newShipAnimationProfiles);\nif(window.newShipAnimationProfiles[58])window.olympicAnimationProfile=window.newShipAnimationProfiles[58];\n',encoding='utf8',newline='\n')
    for name in ['damage-showcase.html','damage-showcase.js']:
        path=DEST/name;retain(path);text=path.read_text(encoding='utf8')
        for asset in ['new-ship-profiles.js','ship-picker.js','catalog.json','combat-data.json']:
            text=re.sub('('+re.escape(asset)+r'\?[^\s\x22\x27]*)',lambda m:m[0] if 'prometheus-v2' in m[0] else m[0]+'-prometheus-v2',text)
        path.write_text(text,encoding='utf8',newline='\n')
    path=DEST/'ship-picker.js';retain(path);text=path.read_text(encoding='utf8')
    if '3701,3702,3703' not in text:
        assert ',35,36,37,38,' in text;text=text.replace(',35,36,37,38,',',35,36,37,3701,3702,3703,38,')
    path.write_text(text,encoding='utf8',newline='\n')
    print(json.dumps({'installed':str(DEST),'backups':str(BACKUP)}))

if __name__=='__main__':main()
