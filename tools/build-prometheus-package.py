"""Register the supplied stacked hulls and AI damage to one docking canvas.

OpenCV measures registration only. Browser canvas performs the runtime crop,
uniform scale, and the exact bottom/middle/top layer composition.
"""
import argparse
import base64
import functools
import hashlib
import http.server
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import threading

import cv2
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
SHARED=ROOT/'html-games/flashtrek-broken-mirror'
DEST=SHARED/'showcase-assets/prometheus-mvam-v2'
STAGES=['intact','light','heavy','severe']
IDS={'top':3701,'middle':3702,'bottom':3703}
WEIGHTS={'top':.25,'middle':.45,'bottom':.3}
spec=importlib.util.spec_from_file_location('previous_prometheus_builder',ROOT/'tools/build-prometheus-assets.py')
previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def registration(original,damaged):
    with Image.open(original) as im:a=np.array(im.convert('RGBA'))
    with Image.open(damaged) as im:b=np.array(im.convert('RGBA'))
    if original==damaged:return {'matrix':[1,0,0,1,0,0],'inliers':0,'medianError':0,'retainedAlpha':1}
    sift=cv2.SIFT_create(nfeatures=7500)
    ka,da=sift.detectAndCompute(cv2.cvtColor(a[:,:,:3],cv2.COLOR_RGB2GRAY),(a[:,:,3]>128).astype('uint8')*255)
    kb,db=sift.detectAndCompute(cv2.cvtColor(b[:,:,:3],cv2.COLOR_RGB2GRAY),(b[:,:,3]>128).astype('uint8')*255)
    matches=[m for m,n in cv2.BFMatcher().knnMatch(db,da,k=2) if m.distance<n.distance*.73]
    assert len(matches)>=10,('Too few surviving landmarks',damaged,len(matches))
    source=np.float32([kb[m.queryIdx].pt for m in matches]);target=np.float32([ka[m.trainIdx].pt for m in matches])
    matrix,mask=cv2.estimateAffinePartial2D(source,target,method=cv2.RANSAC,ransacReprojThreshold=4,maxIters=7000,confidence=.999)
    assert matrix is not None,(damaged,'No stable registration')
    inliers=mask.ravel().astype(bool);error=np.linalg.norm(source@matrix[:,:2].T+matrix[:,2]-target,axis=1)
    rotation=math.degrees(math.atan2(matrix[1,0],matrix[0,0]));assert abs(rotation)<4,(damaged,'Unexpected rotation',rotation)
    assert inliers.sum()>=10 and np.median(error[inliers])<3,(damaged,'Inaccurate alignment')
    registered=cv2.warpAffine(b[:,:,3],matrix,(a.shape[1],a.shape[0]),flags=cv2.INTER_LINEAR)
    retained=float(((registered>128)&(a[:,:,3]>128)).sum()/max(1,(a[:,:,3]>128).sum()))
    assert retained>.5,(damaged,'Hull registration/retention failed',retained)
    return {'matrix':[float(matrix[0,0]),float(matrix[1,0]),float(matrix[0,1]),float(matrix[1,1]),float(matrix[0,2]),float(matrix[1,2])],
      'matches':len(matches),'inliers':int(inliers.sum()),'medianError':float(np.median(error[inliers])),'rotationDegrees':rotation,'retainedAlpha':retained}

def crop_for(path,key):
    with Image.open(path) as im:box=im.getchannel('A').getbbox()
    left=max(0,math.floor((box[0]-6)/2)*2);top=max(0,math.floor((box[1]-6)/2)*2)
    right=min(1024,math.ceil((box[2]+6)/2)*2);bottom=min(2048,math.ceil((box[3]+6)/2)*2)
    if key=='middle':
        # Keep the pilot/camera on the package's common docking anchor.
        dx=max(512-left,right-512);dy=max(1024-top,bottom-1024)
        left,right=512-dx,512+dx;top,bottom=1024-dy,1024+dy
    return [left,top,right-left,bottom-top]

PACK=r'''async input=>{
 const load=url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error(url));i.src=url;});
 const create=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
 const images={},modules={},plates={};
 for(const [name,part]of Object.entries(input.parts)){
  images[name]=[];modules[name]=[];plates[name]=[];
  for(const row of part.sources){
   const image=await load(row.url),full=create(1024,2048),g=full.getContext('2d');g.imageSmoothingQuality='high';g.setTransform(...row.registration.matrix);g.drawImage(image,0,0);images[name].push(full);
   const [x,y,w,h]=part.crop,c=create(w/2,h/2);c.getContext('2d').drawImage(full,x,y,w,h,0,0,w/2,h/2);const encoded=c.toDataURL();plates[name].push(await load(encoded));modules[name].push(encoded.split(',')[1]);
  }
 }
 const supplied=await load(input.assembled),joined=[],composite=create(1024,2048),cg=composite.getContext('2d',{willReadFrequently:true});
 for(const name of ['bottom','middle','top'])cg.drawImage(images[name][0],0,0);
 const reference=create(1024,2048),rg=reference.getContext('2d',{willReadFrequently:true});rg.drawImage(supplied,0,0);
 const a=cg.getImageData(0,0,1024,2048).data,b=rg.getImageData(0,0,1024,2048).data;let different=0,visibleDifferent=0,maxVisibleError=0;
 for(let i=0;i<a.length;i+=4){let error=0;for(let k=0;k<4;k++)error=Math.max(error,Math.abs(a[i+k]-b[i+k]));if(error)different++;if(Math.max(a[i+3],b[i+3])>128){maxVisibleError=Math.max(maxVisibleError,error);if(error>2)visibleDifferent++;}}
 if(visibleDifferent>100)throw Error('Supplied joined hull does not match registered sections: '+visibleDifferent);
 for(let stage=0;stage<4;stage++){
  const c=create(512,1024),g=c.getContext('2d');
  for(const name of ['bottom','middle','top']){const [x,y]=input.parts[name].crop;g.drawImage(plates[name][stage],x/2,y/2);}
  joined.push(c.toDataURL().split(',')[1]);
 }
 return {modules,joined,assemblyAudit:{differentPixels:different,visibleDifferentPixels:visibleDifferent,maxVisibleError,exact:different===0}};
}'''

def effects_for(images,crop,key):
    # Normalized hardpoints in each fixed runtime crop. Main engine positions
    # are measured from the actual long cyan strips, not generic rectangles.
    frame=images[0];w,h=frame.size;px=frame.load()
    points=np.array(frame);blue=(points[:,:,3]>150)&(points[:,:,2]>130)&(points[:,:,1]>110)&(points[:,:,0]<np.minimum(points[:,:,1],points[:,:,2])*.77)
    count,labels,stats,centers=cv2.connectedComponentsWithStats(blue.astype('uint8'),connectivity=8)
    candidates_by_side={}
    for i in range(1,count):
        x,y,bw,bh,n=stats[i]
        if bh<50 or bh<4*bw:continue
        cx=float(centers[i][0]);cy=min(h-1,y+bh+max(8,bh*.2))
        # Move the exhaust attachment onto the surviving aft casing.
        candidates=[(xx,yy) for yy in range(max(0,int(cy)-15),min(h,int(cy)+16)) for xx in range(max(0,int(cx)-6),min(w,int(cx)+7)) if px[xx,yy][3]>170]
        if candidates:cx,cy=min(candidates,key=lambda p:(p[0]-cx)**2+(p[1]-cy)**2)
        side=cx<w/2
        if side not in candidates_by_side or n>candidates_by_side[side][0]:candidates_by_side[side]=(n,{'x':cx/w-.5,'y':cy/h-.5})
    engines=[candidates_by_side[side][1] for side in [True,False] if side in candidates_by_side]
    opaque=np.argwhere(points[:,:,3]>170)
    def surface(x,y):
        target=np.array([y*h,x*w]);index=np.argmin(((opaque-target)**2).sum(axis=1));py,px=opaque[index];return {'x':float(px/w-.5),'y':float(py/h-.5)}
    rcs=[surface(x,y) for x,y in [(.16,.23),(.84,.23),(.14,.82),(.86,.82)]]
    # Locations use the common source frame so coupled seams remain aligned.
    x0,y0,cw,ch=crop
    locks=[]
    for x,y in [(350,1008),(674,1008),(390,1250),(634,1250)]:
        if x0<=x<x0+cw and y0<=y<y0+ch:locks.append(surface((x-x0)/cw,(y-y0)/ch))
    return {'engines':engines,'rcs':rcs,'locks':locks}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');args=parser.parse_args()
    package=Path(Path('C:/Users/alphi/Documents/broken-mirror-play-session/latest-prometheus-package.txt').read_text(encoding='utf8'))
    DEST.mkdir(exist_ok=True);source_dir=DEST/'source';shutil.copytree(package,source_dir,dirs_exist_ok=True)
    manifest=json.loads((DEST/'damage-inputs.json').read_text(encoding='utf8'))
    data={'parts':{},'assembled':'/'+(source_dir/'Prometheus-assembled.png').relative_to(ROOT).as_posix()};audit=[]
    for name in IDS:
        original=source_dir/f'Prometheus-{name}.png';sources=[]
        for stage in STAGES:
            path=original if stage=='intact' else Path(manifest[name][stage]);target=DEST/'masters'/name/(stage+'.png');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
            row={'url':'/'+target.relative_to(ROOT).as_posix(),'registration':registration(original,target) if stage!='intact' else {'matrix':[1,0,0,1,0,0],'inliers':0,'medianError':0,'retainedAlpha':1}}
            sources.append(row);audit.append({'part':name,'stage':stage,'sha256':sha(target),**row})
        data['parts'][name]={'crop':crop_for(original,name),'sources':sources}
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(previous.Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,channel='msedge');page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/__prometheus_builder');packed=page.evaluate(PACK,data);browser.close()
    finally:server.shutdown()
    profiles={};rows={};metadata={'parentType':37,'canvas':{'width':512,'height':1024},'layout':{},'parts':[],'packageAnchor':[512,1024]}
    current_text=(ROOT/'html-games/broken-mirror-port/prometheus-artwork.js').read_text(encoding='utf8');current=json.loads(current_text.split('window.prometheusArtwork=',1)[1].rstrip(';\n'))
    metadata.update(parentDimensions=current['parentDimensions'],parentPhysical=current['parentPhysical'])
    for name in [*IDS,'joined']:
        id=IDS.get(name,37);folder=DEST/name;folder.mkdir(exist_ok=True);frames=[];files=[]
        for stage,encoded in zip(STAGES,packed['joined'] if name=='joined' else packed['modules'][name]):
            path=folder/(stage+'.png');path.write_bytes(base64.b64decode(encoded));frames.append(Image.open(path).convert('RGBA'));files.append(path.relative_to(SHARED/'showcase-assets').as_posix())
        profile=previous.profile(frames,files);crop=[0,0,1024,2048] if name=='joined' else data['parts'][name]['crop'];effects=effects_for(frames,crop,name);profile['effectPorts']=effects;profiles[str(id)]=profile
        rows[str(id)]={'id':id,'name':'Prometheus Class' if name=='joined' else f'Prometheus {dict(top="Alpha",middle="Beta",bottom="Gamma")[name]} section','kind':'ship','origin':'User supplied aligned Prometheus package','original':files[0],'frames':files,'bounds':[0,profile['width'],0,profile['height']],'damageReady':True,'damageFramesReady':True,'artworkStatus':'animated','mass':300.7,'debrisKind':1,'points':[],'size':200,'shieldColor':'blue'}
        if name=='joined':metadata.update(parentFrames=files,parentEmitters=profile['artworkEmitters'],parentEffects=effects);continue
        x,y,w,h=crop;metadata['layout'][name]={'x':x/2,'y':y/2,'width':w/2,'height':h/2}
        metadata['parts'].append({'key':name,'type':id,'name':rows[str(id)]['name'],'weight':WEIGHTS[name],
          'dimensions':{'width':metadata['parentDimensions']['width']*w/1024,'height':metadata['parentDimensions']['height']*h/2048},
          'offset':{'x':(x+w/2-512)/1024,'y':(y+h/2-1024)/2048},'artworkSize':{'width':profile['width'],'height':profile['height']},'frames':files,'emitters':profile['artworkEmitters'],'effectPorts':effects,'sourceCrop':crop})
    for name,value in [('profiles.json',profiles),('artwork.json',metadata),('catalog.json',rows),('generation.json',{'tool':'built-in image_gen','sourcePackage':str(package),'inputs':audit,'layout':metadata,'assemblyAudit':packed['assemblyAudit'],'promptSet':'prompts.json'})]:
        (DEST/name).write_text(json.dumps(value,indent=2),encoding='utf8')
    if args.install:
        active=previous.measure.profile_data(SHARED/'new-ship-profiles.js') if hasattr(previous.measure,'profile_data') else None
        if active is None:
            code="const fs=require('fs'),vm=require('vm'),c=vm.createContext({window:{earthAnimationProfiles:{}}});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.newShipAnimationProfiles));"
            active=json.loads(subprocess.check_output(['node','-e',code,str(SHARED/'new-ship-profiles.js')],text=True))
        active.update(profiles);(SHARED/'new-ship-profiles.js').write_text('/* Measured hull lights and aligned damage stages. */\nwindow.newShipAnimationProfiles='+json.dumps(active,separators=(',',':'))+';\nObject.assign(window.earthAnimationProfiles,window.newShipAnimationProfiles);\nif(window.newShipAnimationProfiles[58])window.olympicAnimationProfile=window.newShipAnimationProfiles[58];\n',encoding='utf8',newline='\n')
        (ROOT/'html-games/broken-mirror-port/prometheus-artwork.js').write_text('/* Exact supplied layer registration; runtime crops retain their offsets. */\nwindow.prometheusArtwork='+json.dumps(metadata,separators=(',',':'))+';\n',encoding='utf8',newline='\n')
        path=SHARED/'showcase-assets/catalog.json';catalog=json.loads(path.read_text(encoding='utf8'))
        for i,row in enumerate(catalog['ships']):
            if str(row['id']) in rows:catalog['ships'][i]={**row,**rows[str(row['id'])]}
        path.write_text(json.dumps(catalog,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
        path=ROOT/'html-games/broken-mirror-port/ship-scale-settings.js';text=path.read_text(encoding='utf8');match=re.search(r'const settings=(\{.*?\});\n',text,re.S);settings=json.loads(match[1])
        with Image.open(DEST/'joined/intact.png') as im:box=im.getchannel('A').point(lambda a:255 if a>=32 else 0).getbbox()
        reference=settings['ships']['37'];height=reference['meters']*settings['unitsPerMeter']/((box[3]-box[1])/1024)
        reference.update(dimensions={'width':height*.5,'height':height},bounds={'x':box[0],'y':box[1],'width':box[2]-box[0],'height':box[3]-box[1]},artwork={'width':512,'height':1024})
        path.write_text(text[:match.start(1)]+json.dumps(settings,indent=2)+text[match.end(1):],encoding='utf8',newline='\n')
    print(json.dumps({'installed':args.install,'assemblyAudit':packed['assemblyAudit'],'sprites':16,'parts':[{k:part[k] for k in ['key','dimensions','offset','sourceCrop']} for part in metadata['parts']],'lamps':{id:len(p['lights']) for id,p in profiles.items()}}),flush=True)

if __name__=='__main__':main()
