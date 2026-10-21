"""Actual full-fleet pixels before/after conservative exterior padding removal.

Full-surface comparison retains the same artwork, lighting and animated raster.
This is a heavy image diagnostic, separate from clean frame measurements.
"""
import argparse
import base64
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'ship-padding'
spec=importlib.util.spec_from_file_location('padding_server',ROOT/'tests/browser-npc-performance.py')
perf=importlib.util.module_from_spec(spec);spec.loader.exec_module(perf)

CHECK=r'''async({sourceCrop=false})=>{
 const check=(value,label)=>{if(!value)throw Error(label);},cache=nativeShipSpriteCache;
 cache.setBackend('canvas');cache.reset();
 const make=()=>{const c=document.createElement('canvas');c.width=c.height=520;return c;};
 const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 const compare=(a,b)=>{
   const x=pixels(a),y=pixels(b);let maxPremultiplied=0,maxAlpha=0,changed=0,maxOpaqueRGB=0;
   const shape=[x,y].map(data=>{let mass=0,cx=0,cy=0,populated=0,left=520,top=520,right=-1,bottom=-1;
     for(let i=0;i<data.length;i+=4){const alpha=data[i+3];if(alpha){const px=i/4%520,py=Math.floor(i/2080);mass+=alpha;cx+=px*alpha;cy+=py*alpha;if(alpha>=64){populated++;left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py);}}}
     return {mass,x:mass?cx/mass:0,y:mass?cy/mass:0,populated,bounds:[left,top,right,bottom]};});
   for(let i=0;i<x.length;i+=4){const alpha=Math.abs(x[i+3]-y[i+3]);maxAlpha=Math.max(maxAlpha,alpha);if(alpha)changed++;
     for(let c=0;c<3;c++){const difference=Math.abs(x[i+c]*x[i+3]-y[i+c]*y[i+3])/255;maxPremultiplied=Math.max(maxPremultiplied,difference);if(difference)changed++;if(x[i+3]>=250&&y[i+3]>=250)maxOpaqueRGB=Math.max(maxOpaqueRGB,Math.abs(x[i+c]-y[i+c]));}}
   return {maxPremultiplied,maxAlpha,maxOpaqueRGB,changed,populated:shape[0].populated,boundsDelta:Math.max(...shape[0].bounds.map((v,i)=>Math.abs(v-shape[1].bounds[i]))),centroid:Math.hypot(shape[0].x-shape[1].x,shape[0].y-shape[1].y)};
 };
 const render=(descriptor,asset,heading,time,zoom,fullSurface,x=260)=>{
   descriptor.entity.angle=descriptor.entity.heading=heading-Math.PI/2;descriptor.heading=heading-Math.PI/2;
   descriptor.state.shipSimulation.seconds=time/1000;
   const c=make(),g=c.getContext('2d');nativeShipEffects.paintShip(g,descriptor,{ship:{x:0,y:0},cx:x,cy:260,w:520,h:520,zoom,asset,
     appearance:{fullSurface,trimPadding:!sourceCrop&&!fullSurface,sourceCrop:sourceCrop&&!fullSurface,light:{direction:.8,color:0xffdb9e}}});return c;
 };
 const cases=[],galleryAssets=new Map();let fullPixels=0,croppedPixels=0;
 for(const ship of VexedMirrorWorld.ships){
   for(const [stage,fraction]of [1,.7,.4,.1].entries()){
     const asset=await vexedFlightAssets.loadShip(ship.id,ship.hull*fraction),state={system:2,shipType:ship.id,x:0,y:0,angle:-Math.PI/2,heading:-Math.PI/2,hull:ship.hull*fraction,shields:0,phase:'active',shipSimulation:{version:1,seconds:1}};
     const descriptor=nativeShipDefinitions.describe(state,state,{category:'player'});
     if([35,49,58,50].includes(ship.id))galleryAssets.set(ship.id+':'+stage,{asset,dimensions:descriptor.dimensions});
     for(const [heading,time,zoom]of [[0,1000,.7],[.7,1450,1],[2.4,2117,1.7]]){
       let count=cache.snapshot().counters.presentationQuadPixels;
       const full=render(descriptor,asset,heading,time,zoom,true);const fullArea=cache.snapshot().counters.presentationQuadPixels-count;
       count=cache.snapshot().counters.presentationQuadPixels;
       const cropped=render(descriptor,asset,heading,time,zoom,false);const cropArea=cache.snapshot().counters.presentationQuadPixels-count;
       const difference=compare(full,cropped),label=JSON.stringify({id:ship.id,stage,heading,time,zoom,difference});
       check(difference.maxPremultiplied<=2&&difference.maxAlpha<=1&&(sourceCrop||difference.boundsDelta===0)&&difference.centroid<=.05,'Exterior support changed actual pixels '+label);
       check(difference.populated>0,'The full-frame fixture did not paint a ship '+label);
       fullPixels+=fullArea;croppedPixels+=cropArea;cases.push({id:ship.id,stage,heading,time,zoom,fullArea,cropArea,...difference});
     }
     // A rotated hull on either camera edge must retain the visible half and
     // its glow even though the centre lies on the screen boundary.
     if(stage===0||stage===3)for(const x of [0,520]){
       const full=render(descriptor,asset,.7,2117,1,true,x),cropped=render(descriptor,asset,.7,2117,1,false,x),difference=compare(full,cropped);
       check(difference.maxPremultiplied<=2&&difference.maxAlpha<=1&&(sourceCrop||difference.boundsDelta===0)&&difference.centroid<=.05&&difference.populated>0,
         'Partial camera support changed actual pixels '+JSON.stringify({id:ship.id,stage,x,difference}));
       cases.push({id:ship.id,stage,partialX:x,...difference});
     }
   }
   console.info('padding checked '+ship.id);
 }
 check(croppedPixels<fullPixels,'No exterior presentation support was reduced');
 const gallery=fullSurface=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=700;const g=canvas.getContext('2d');g.fillStyle='#030811';g.fillRect(0,0,1000,700);
   for(const [row,stage]of [0,2,3].entries())for(const [column,type]of [35,49,58,50].entries()){
     const {asset,dimensions}=galleryAssets.get(type+':'+stage);vexedFlightAssets.drawShip(g,asset,125+column*250,120+row*220,dimensions.width,column*.43+row*.29,1350,
       {height:dimensions.height,fullSurface,trimPadding:!sourceCrop&&!fullSurface,sourceCrop:sourceCrop&&!fullSurface,owner:{},light:{direction:.8,color:0xffdb9e},effectRate:60});
   }return canvas;};
 window.__paddingEvidence={full:gallery(true),cropped:gallery(false)};
 return {cases,sourceCrop,alpha64BoundsPolicy:sourceCrop?'Diagnostic records threshold drift separately; colour/alpha/centroid gates unchanged':'Zero threshold drift required',fullPixels,croppedPixels,quadAreaReduction:1-croppedPixels/fullPixels,pixelAreaKind:'Conservative transformed presentation/clip area; not uploaded texture bytes or measured browser raster work',cache:cache.snapshot()};
}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source-crop',action='store_true',help='Diagnostic source-subset experiment; records alpha64 threshold drift separately');args=parser.parse_args()
    output=OUTPUT/'source-crop' if args.source_crop else OUTPUT
    output.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(perf.SnapshotHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('window.requestAnimationFrame=()=>0');page.wait_for_timeout(100)
            report=page.evaluate(CHECK,{'sourceCrop':args.source_crop});report.update(browser=browser.version,errors=errors)
            assert not errors,errors
            for label in ['full','cropped']:
                (output/f'{label}-lighting-size-damage.png').write_bytes(base64.b64decode(page.evaluate('(label)=>__paddingEvidence[label].toDataURL().split(",")[1]',label)))
            (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({'cases':len(report['cases']),'fullPixels':report['fullPixels'],'croppedPixels':report['croppedPixels'],'quadAreaReduction':report['quadAreaReduction'],'browser':browser.version}));browser.close()
    finally:server.shutdown()


if __name__=='__main__':main()
