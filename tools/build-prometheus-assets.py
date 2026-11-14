"""Package AI damage artwork and compose the three production module layers."""
import base64
import functools
import hashlib
import http.server
import importlib.util
import json
from pathlib import Path
import shutil
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
SHARED=ROOT/'html-games/flashtrek-broken-mirror'
ART=SHARED/'showcase-assets'
DEST=ART/'prometheus-mvam'
EVIDENCE=Path(Path('C:/Users/alphi/Documents/broken-mirror-play-session/latest-prometheus.txt').read_text())
STAGES=['intact','light','heavy','severe']
spec=importlib.util.spec_from_file_location('measure',ROOT/'tools/build-replacement-ships.py')
measure=importlib.util.module_from_spec(spec);spec.loader.exec_module(measure)

PACK=r'''async parts=>{
 const load=url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error(url));im.src=url;});
 const bounds=im=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);const p=g.getImageData(0,0,c.width,c.height).data;let x=c.width,y=c.height,r=-1,b=-1;for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++)if(p[(j*c.width+i)*4+3]>=128){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);b=Math.max(b,j);}if(r<x)throw Error('Empty source');return {x,y,w:r-x+1,h:b-y+1};};
 const modules={},images={};
 for(const [name,part]of Object.entries(parts)){
  const source=await load(part.files[0]),box=bounds(source),ratio=500/Math.max(box.w,box.h),width=Math.round(box.w*ratio)+12,height=Math.round(box.h*ratio)+12;
  modules[name]={id:part.id,width,height,frames:[],inputs:[]};images[name]=[];
  for(const file of part.files){const im=await load(file),b=bounds(im),c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(im,b.x,b.y,b.w,b.h,6,6,width-12,height-12);images[name].push(c);modules[name].frames.push(c.toDataURL().split(',')[1]);modules[name].inputs.push({file,bounds:b,width:im.width,height:im.height});}
 }
 const canvas={width:512,height:1024};
 const rect=(name,width,y)=>({x:(512-width)/2,y,width,height:width*modules[name].height/modules[name].width});
 const middle=rect('middle',480,0);middle.y=(1024-middle.height)/2;
 const layout={top:rect('top',420,0),middle,bottom:rect('bottom',380,210)};
 const joined=[];
 for(let stage=0;stage<4;stage++){const c=document.createElement('canvas');c.width=512;c.height=1024;const g=c.getContext('2d');g.imageSmoothingQuality='high';for(const name of ['bottom','middle','top']){const r=layout[name];g.drawImage(images[name][stage],r.x,r.y,r.width,r.height);}joined.push(c.toDataURL().split(',')[1]);}
 return {modules,layout,canvas,joined};
}'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
    def do_GET(self):
        if self.path=='/__prometheus_builder':
            body=b'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Prometheus asset packer</title>'
            self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:super().do_GET()


def profile(frames,files):
    width,height=frames[0].size
    damage=measure.measure_damage(frames);lamps=measure.measure_lamps(frames[0])
    pixels=frames[0].load()
    opaque=[(x,y) for y in range(height) for x in range(width) if pixels[x,y][3]>=170]
    def surface(x,y):return min(opaque,key=lambda p:(p[0]-x*width)**2+(p[1]-y*height)**2)
    sites=[[name,*surface(x,y)] for name,x,y in [('fore',.5,.12),('port fore',.3,.3),('starboard fore',.7,.3),('reactor',.5,.55),('port engine',.1,.8),('starboard engine',.9,.8),('stern',.5,.91)]]
    core=sites[3][1:]
    emitters={}
    for name,x,y in [('beam',.5,.16),('beamAft',.5,.82),('projectile',.5,.24)]:
        px,py=surface(x,y);emitters[name]={'x':px/width-.5,'y':py/height-.5}
    return {'width':width,'height':height,'displayRatio':width/height,'shifts':[[0,0,width,height] for _ in STAGES],
      'animationReady':True,'lights':lamps,'damage':damage,'sites':sites,'core':core,'energyColor':'#59d9ff',
      'artworkFrames':files,'artworkEmitters':emitters,'fragmentOptions':{'armorChips':True,'darkening':42,'minimumAlpha':150,'regions':damage,'maxPieces':3}}


def main():
    manifest=json.loads((EVIDENCE/'input-manifest.json').read_text())
    inputs={};audit=[]
    for name,part in manifest['parts'].items():
        files=[]
        for stage in STAGES:
            source=Path('C:/Users/alphi/Downloads')/part['source'] if stage=='intact' else Path(manifest['generatedDirectory'])/part[stage]
            assert source.exists(),source
            target=DEST/'masters'/name/(stage+'.png');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
            files.append('/'+target.relative_to(ROOT).as_posix())
            audit.append({'part':name,'stage':stage,'file':target.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
        inputs[name]={'id':part['id'],'files':files}
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,channel='msedge');page=browser.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/__prometheus_builder')
            packed=page.evaluate(PACK,inputs);browser.close()
    finally:server.shutdown()
    profiles={};rows={};weights={'top':.25,'middle':.45,'bottom':.3}
    for name,part in list(packed['modules'].items())+[('joined',{'id':37,'frames':packed['joined']})]:
        folder=DEST/name;folder.mkdir(parents=True,exist_ok=True)
        files=[];images=[]
        for stage,data in zip(STAGES,part['frames']):
            target=folder/(stage+'.png');target.write_bytes(base64.b64decode(data));files.append(target.relative_to(ART).as_posix());images.append(Image.open(target).convert('RGBA'))
        profiles[str(part['id'])]=profile(images,files)
        rows[part['id']]={'id':part['id'],'name':'Prometheus Class' if name=='joined' else 'Prometheus '+{'top':'Alpha','middle':'Beta','bottom':'Gamma'}[name]+' section',
          'kind':'ship','origin':'User-supplied Prometheus modules with generated damage stages','original':files[0],'frames':files,
          'bounds':[0,images[0].width,0,images[0].height],'damageReady':True,'damageFramesReady':True,'artworkStatus':'animated',
          'mass':300.7,'debrisKind':1,'points':[],'size':200,'shieldColor':'blue','replacementSource':'Three supplied Prometheus modules'}
    metadata={'parentType':37,'canvas':packed['canvas'],'layout':packed['layout'],
              'parts':[{ 'key':name,'type':inputs[name]['id'],'name':rows[inputs[name]['id']]['name'],'weight':weights[name]} for name in ['top','middle','bottom']]}
    # Adopt the new image proportions while retaining the existing game height and hardware.
    settings_path=ROOT/'html-games/broken-mirror-port/ship-scale-settings.js'
    import re
    settings_text=settings_path.read_text();match=re.search(r'const settings=(\{.*?\});\n',settings_text,re.S);settings=json.loads(match[1])
    old=settings['gameplayShips']['37'];metadata['parentPhysical']=old['physical'];metadata['parentDimensions']={'width':old['dimensions']['height']*.5,'height':old['dimensions']['height']}
    old['dimensions']=metadata['parentDimensions']
    old['baseDimensions']['width']=old['baseDimensions']['height']*.5
    with Image.open(DEST/'joined/intact.png') as image:
        box=image.getchannel('A').point(lambda a:255 if a>=32 else 0).getbbox();fraction=(box[3]-box[1])/image.height
        ref=settings['ships']['37'];height=ref['meters']*settings['unitsPerMeter']/fraction
        ref.update(dimensions={'width':height*.5,'height':height},bounds={'x':box[0],'y':box[1],'width':box[2]-box[0],'height':box[3]-box[1]},artwork={'width':512,'height':1024})
    settings_path.write_text(settings_text[:match.start(1)]+json.dumps(settings,indent=2)+settings_text[match.end(1):],encoding='utf8',newline='\n')
    for part in metadata['parts']:
        r=metadata['layout'][part['key']];part['dimensions']={'width':metadata['parentDimensions']['width']*r['width']/512,'height':metadata['parentDimensions']['height']*r['height']/1024}
        part['offset']={'x':(r['x']+r['width']/2-256)/512,'y':(r['y']+r['height']/2-512)/1024}
        p=profiles[str(part['type'])];part.update(artworkSize={'width':p['width'],'height':p['height']},frames=p['artworkFrames'],emitters=p['artworkEmitters'])
    metadata['parentFrames']=profiles['37']['artworkFrames'];metadata['parentEmitters']=profiles['37']['artworkEmitters']
    current=measure.profile_data(SHARED/'new-ship-profiles.js') if hasattr(measure,'profile_data') else None
    if current is None:
        import subprocess
        code="const fs=require('fs'),vm=require('vm'),c=vm.createContext({window:{earthAnimationProfiles:{}}});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.newShipAnimationProfiles));"
        current=json.loads(subprocess.check_output(['node','-e',code,str(SHARED/'new-ship-profiles.js')],text=True))
    current.update(profiles)
    (SHARED/'new-ship-profiles.js').write_text('/* Measured ship lamps, breaches and four aligned damage stages. */\nwindow.newShipAnimationProfiles='+json.dumps(current,separators=(',',':'))+';\nObject.assign(window.earthAnimationProfiles,window.newShipAnimationProfiles);\nif(window.newShipAnimationProfiles[58])window.olympicAnimationProfile=window.newShipAnimationProfiles[58];\n',encoding='utf8',newline='\n')
    (ROOT/'html-games/broken-mirror-port/prometheus-artwork.js').write_text('/* Exact module layer positions and typed artwork references. */\nwindow.prometheusArtwork='+json.dumps(metadata,separators=(',',':'))+';\n',encoding='utf8',newline='\n')
    catalog_path=ART/'catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf8'))
    for row in catalog['ships']:
        if row['id'] in rows:row.update(rows.pop(row['id']))
    existing={row['id'] for row in catalog['ships']}
    assert not existing.intersection(rows)
    catalog['ships'].extend(rows.values());catalog_path.write_text(json.dumps(catalog,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
    combat_path=ART/'combat-data.json';combat=json.loads(combat_path.read_text(encoding='utf8'))
    for part in metadata['parts']:
        combat['ships'][str(part['type'])]={**combat['ships']['37'],'name':part['name'],'hull':combat['ships']['37']['hull']*part['weight'],'shields':combat['ships']['37']['shields']*part['weight']}
    combat_path.write_text(json.dumps(combat,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
    result={'tool':'built-in image_gen','inputs':audit,'layout':metadata,'sections':[{'id':int(key),'width':value['width'],'height':value['height'],'lamps':len(value['lights'])} for key,value in profiles.items()]}
    (DEST/'generation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({'packaged':True,'sprites':16,'sections':result['sections']}),flush=True)


if __name__=='__main__':main()
