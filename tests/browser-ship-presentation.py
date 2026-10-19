"""Full-fleet frame/role parity and review images from the actual flight renderer."""
import base64
import argparse
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'
OUTPUT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('presentation_server',ROOT/'tests/browser-npc-performance.py')
server_module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(server_module.SnapshotHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'

CAPTURE=r"""async ({validate,ids:requested})=>{
 const check=(v,m)=>{if(!v)throw Error(m)},plain=v=>JSON.parse(JSON.stringify(v));
 const stateFor=(id,hull)=>({system:2,shipType:id,x:0,y:0,angle:-Math.PI/2,heading:-Math.PI/2,speed:0,hull,shields:0,phase:'docked',shipSimulation:{version:1,seconds:1}});
 const render=(state,entity,category,asset,{time=1000,zoom=1,lights=true,light}={})=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=520;const g=canvas.getContext('2d',{willReadFrequently:true});
   nativeSimulation.ensure(state);state.shipSimulation.seconds=time/1000;
   const d=nativeShipDefinitions.describe(state,entity,{category});
   nativeShipEffects.paintShip(g,d,{ship:{x:0,y:0},cx:260,cy:260,zoom,asset,appearance:{lights,light}});
   return canvas;
 };
 const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 const captures={},cases=[],sizes=[];let olympicLitPixels=0;
 const ids=requested||(validate?VexedMirrorWorld.ships.map(s=>s.id):[7,35,47,52,58]);
 for(const id of ids){
   const ship=VexedMirrorWorld.ships.find(s=>s.id===id),maximum=ship.hull;
   const stages=validate?[1,.7,.4,.1]:[1];let frameDimensions;
   for(const [stage,fraction]of stages.entries()){
     const asset=await vexedFlightAssets.loadShip(id,maximum*fraction),npcAsset=await vexedFlightAssets.loadShip(id,maximum*fraction,{showcase:true});
     const state=stateFor(id,maximum*fraction),entity={...state,id:123},d=nativeShipDefinitions.dimensions(entity,'civilian');
     if(validate){
       const expected=nativeShipDefinitions.artworkProfile(id);
       check(Math.abs(d.width/d.height-(expected.displayRatio||expected.width/expected.height))<1e-9,'Distorted class '+id);
       frameDimensions||=[asset.width,asset.height];check(asset.width===frameDimensions[0]&&asset.height===frameDimensions[1],'Damage frame changed bounds '+id);
       const saved=plain(entity);check(JSON.stringify(nativeShipDefinitions.dimensions(saved,'civilian'))===JSON.stringify(d),'Reload changed size '+id);
       for(const zoom of stage===0?[.7,1,1.7]:[1]){
         const options={zoom,light:{x:60,y:60,color:0xffdb9e}},player=render(state,state,'player',asset,options),npc=render(state,entity,'civilian',npcAsset,options);
         if(!equal(pixels(player),pixels(npc))){
           const a=pixels(player),b=pixels(npc);let changed=0,max=0,total=0;
           for(let i=0;i<a.length;i++){const error=Math.abs(a[i]-b[i]);if(error)changed++;max=Math.max(max,error);total+=error;}
           const repeated=render(state,state,'player',asset,options);
           check(false,`Role changed actual pixels ${id}/${stage}/${zoom} ${JSON.stringify({sameArt:asset.art===npcAsset.art,sameProfile:asset.profile===npcAsset.profile,changed,max,total,playerRepeatEqual:equal(a,pixels(repeated)),p:asset.damageStage,n:npcAsset.damageStage,player:nativeShipDefinitions.describe(state,state,{category:'player'}).dimensions,npc:d,clock:nativeSimulation.now(state)})}`);
         }
         cases.push({id,stage,zoom,width:d.width,height:d.height,rolePixelsEqual:true});
       }
       if(id===58&&stage===0){
         const on=pixels(render(state,entity,'civilian',npcAsset)),off=pixels(render(state,entity,'civilian',npcAsset,{lights:false}));
         for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>15)olympicLitPixels++;
         check(olympicLitPixels>10,'Olympic painted lamps are invisible');
         const coreX=Math.round(260+(120/201-.5)*d.width),coreY=Math.round(260+(310/512-.5)*d.height);
         let blue=0;for(let y=coreY-4;y<=coreY+4;y++)for(let x=coreX-4;x<=coreX+4;x++){
           const i=(y*520+x)*4;if(on[i+2]>on[i]+15&&on[i+1]>on[i]+10&&on[i+3]>20)blue++;
         }
         if(!blue){let anywhere=0;for(let i=0;i<on.length;i+=4)if(on[i+2]>on[i]+15&&on[i+1]>on[i]+10&&on[i+3]>20)anywhere++;
           const capture=render(state,entity,'civilian',npcAsset);window.__coreFailure={png:capture.toDataURL(),core:nativeShipDefinitions.artworkProfile(58).lights[0],coreX,coreY,anywhere,stage:npcAsset.damageStage};
           check(false,'Olympic core mask lost its painted cyan lamp '+JSON.stringify({...window.__coreFailure,png:undefined}));
         }
         check(!equal(on,pixels(render(state,entity,'civilian',npcAsset,{time:2000}))),'Olympic lights do not animate');
         check(equal(on,pixels(render(state,entity,'civilian',npcAsset))),'Paused rendering changed pixels');
         const star=pixels(render(state,entity,'civilian',npcAsset,{light:{x:60,y:60,color:0xffdb9e}}));
         check(!equal(on,star),'Directional hull lighting had no effect');
       }
     }
     if(stage===0){
       sizes.push({id,name:ship.name,...plain(d)});
       if([7,35,47,52,58].includes(id))captures[id]=render(state,entity,'civilian',npcAsset,{zoom:3}).toDataURL('image/png');
     }
   }
   console.info('presentation checked '+id);
 }
 return {captures,cases,sizes,olympicLitPixels,cache:nativeShipSpriteCache.snapshot()};
}"""

def font(size):
    from PIL import ImageFont
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',size)

def review_images(before,after):
    from PIL import Image,ImageDraw
    def decoded(data):
        import io
        return Image.open(io.BytesIO(base64.b64decode(data.split(',',1)[1]))).convert('RGBA')
    def paste(sheet,data,x,y):
        art=decoded(data);sheet.alpha_composite(art,(x-260,y-260))
    sheet=Image.new('RGBA',(1400,960),'#030811');g=ImageDraw.Draw(sheet)
    g.text((42,25),'OLYMPIC SIZE REVIEW',font=font(32),fill='#e2f4ff')
    g.text((42,73),'Same 3x view scale in both rows. Existing Oberth and Tarellian are the reference ships.',font=font(18),fill='#a0b9cf')
    for row,(label,result,y)in enumerate([('CURRENT GAME',before,300),('PROPOSED — SAME SIZE FOR PLAYER AND NPC',after,705)]):
        g.text((42,y-155),label,font=font(20),fill='#f5bd79' if row==0 else '#91f0cf')
        for x,id,name in [(270,47,'Oberth Tug'),(700,58,'Olympic medical ship'),(1130,52,'Tarellian Cruiser')]:
            paste(sheet,result['captures'][str(id)],x,y)
            g.text((x-125,y+158),name,font=font(20),fill='#e2f4ff')
            d=next(s for s in result['sizes'] if s['id']==id)
            g.text((x-125,y+190),f"{d['width']:.1f} x {d['height']:.1f} game units",font=font(17),fill='#a0b9cf')
    sheet.convert('RGB').save(OUTPUT/'Olympic_Size_Comparison.png')
    sheet=Image.new('RGBA',(1400,750),'#030811');g=ImageDraw.Draw(sheet)
    g.text((42,25),'PROPOSED SHARED SHIP SCALE',font=font(32),fill='#e2f4ff')
    g.text((42,75),'Runabout, Olympic and Galaxy at the same 3x scale — a gameplay scale for your approval.',font=font(18),fill='#a0b9cf')
    for x,id,name in [(230,7,'Danube Runabout'),(650,58,'Olympic'),(1110,35,'Galaxy Class')]:
        paste(sheet,after['captures'][str(id)],x,390)
        g.text((x-130,610),name,font=font(22),fill='#e2f4ff')
        d=next(s for s in after['sizes'] if s['id']==id)
        g.text((x-130,648),f"{d['width']:.1f} x {d['height']:.1f} game units",font=font(17),fill='#a0b9cf')
    sheet.convert('RGB').save(OUTPUT/'Runabout_Olympic_Galaxy_Scale.png')

errors=[]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--comparison-ref',help='Optional Git revision for before/after review images (requires Pillow)')
parser.add_argument('--ships',help='Optional comma-separated class IDs for a focused check')
args=parser.parse_args()
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        results=[]
        revisions=([(args.comparison_ref,False)] if args.comparison_ref else [])+[(None,True)]
        for revision,validate in revisions:
            server_module.SnapshotHandler.revision=revision
            page=browser.new_page(viewport={'width':1280,'height':850})
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:print(m.text,flush=True) if m.type=='info' and m.text.startswith('presentation checked ') else None)
            page.on('response',lambda r:errors.append(str(r.status)+' '+r.url) if r.status>=400 else None)
            page.goto(url)
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            try:
                results.append(page.evaluate(CAPTURE,{'validate':validate,'ids':[int(n) for n in args.ships.split(',')] if args.ships else None}))
            except Exception:
                failure=page.evaluate('window.__coreFailure||null')
                if failure:(OUTPUT/'olympic-core-failure.png').write_bytes(base64.b64decode(failure['png'].split(',',1)[1]))
                raise
            page.close()
        browser.close()
    assert not errors,errors
    if args.comparison_ref:review_images(*results)
    report={k:v for k,v in results[-1].items() if k!='captures'}
    report.update(passed=True,javascriptErrors=errors)
    (OUTPUT/'ship-presentation.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'passed':True,'frameRoleZoomCases':len(report['cases']),'ships':len(report['sizes']),'olympicLitPixels':report['olympicLitPixels']}))
finally:
    server.shutdown()
