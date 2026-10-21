"""Real Canvas rendering with more visible hull/damage appearances than the optional-data LRU.

Uses an isolated browser profile and the real shared loading/painting interfaces.
The fixture deliberately retains descriptors, never assets per actor. This is a
correctness/memory diagnostic, not an FPS benchmark.
"""
import argparse
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'/'ship-working-set'
spec = importlib.util.spec_from_file_location('working_set_server', ROOT/'tests/browser-npc-performance.py')
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)

CHECK = r'''async ({expectMissing=false})=>{
 const check=(value,message)=>{if(!value)throw Error(message);};
 const cache=nativeShipSpriteCache,loader=vexedFlightAssets,effects=nativeShipEffects;
 cache.setBackend?.('canvas');cache.reset();
 const types=[...VexedMirrorWorld.ships.slice(0,29).map(ship=>ship.id),35,49,58];
 const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1120;
 canvas.id='fleet-working-set';canvas.style.cssText='position:absolute;left:0;top:0;z-index:10000;background:#020610';
 document.body.append(canvas);const g=canvas.getContext('2d',{willReadFrequently:true});
 const rows=types.flatMap((type,index)=>[0,3].map((stage,column)=>{
   const definition=nativeShipDefinitions.get(type,'civilian'),hull=definition.hull*[1,.7,.4,.1][stage];
   const state={system:2,shipType:type,x:0,y:0,heading:.3,angle:.3,speed:0,hull,shields:0,phase:'docked',shipSimulation:{version:1,seconds:1}};
   return {state,stage,category:index%3?'civilian':'player',x:90+(index%8)*180,y:70+Math.floor(index/8)*280+column*135};
 }));
 const frame=(index,{validate=true}={})=>{
   cache.beginFrame?.(g);g.clearRect(0,0,canvas.width,canvas.height);
   const results=[];
   for(const row of rows){
     row.state.angle=row.state.heading=.3+index*.07;row.state.shipSimulation.seconds=1+index/60;
     const d=nativeShipDefinitions.describe(row.state,row.state,{category:row.category});
     const art=effects.paintShip(g,d,{ship:{x:0,y:0},cx:row.x,cy:row.y,w:canvas.width,h:canvas.height,zoom:.8,
       appearance:{light:{x:2000,y:-4000,direction:.8,color:0xffdb9e}}});
     const result={type:d.shipType,expectedStage:row.stage,typePainted:art?.type??null,stagePainted:art?.damageStage??null};
     if(validate&&!expectMissing)check(art?.art&&art.type===d.shipType&&art.damageStage===row.stage,'Visible plate missing/wrong '+JSON.stringify(result));
     results.push(result);
   }
   cache.endFrame?.(g);
   return results;
 };
 // More than 12 classes, and 64 distinct appearances, become warm through the
 // same bounded request owner used by flight. No full destruction preparation.
 for(let i=0;i<rows.length;i++){
   const row=rows[i];await effects.request(row.state.shipType,row.category,{stage:row.stage,visible:true});
   // Last-frame visibility remains current while cold appearances stream in.
   frame(i,{validate:false});
 }
 const before={loader:loader.cacheSnapshot(),effects:effects.metrics()};
 const results=frame(100),missing=results.filter(row=>row.typePainted!==row.type||row.stagePainted!==row.expectedStage);
 if(expectMissing){check(missing.length>0,'The historical >12-class failure did not reproduce');return {historical:true,appearances:rows.length,distinctClasses:types.length,missing,before};}
 const frames=[];
 for(let i=0;i<8;i++){frames.push(frame(101+i));await new Promise(resolve=>setTimeout(resolve,16));}
 const image=g.getImageData(0,0,canvas.width,canvas.height),pixels=image.data;
 const support=rows.map(row=>{let count=0;for(let y=Math.max(0,row.y-55);y<Math.min(canvas.height,row.y+55);y++)for(let x=Math.max(0,row.x-75);x<Math.min(canvas.width,row.x+75);x++)if(pixels[(y*canvas.width+x)*4+3]>=64)count++;return {type:row.state.shipType,stage:row.stage,pixels:count};});
 check(support.every(row=>row.pixels>10),'A returned appearance was not actually painted '+JSON.stringify(support));
 const warm={loader:loader.cacheSnapshot(),effects:effects.metrics(),sprites:cache.snapshot()};
 check(warm.loader.ships.entries>24,'Fixture did not exceed ordinary base-art retention');
 check(warm.effects.entries<=warm.effects.limits.entries&&warm.effects.evictions>0,'Fixture did not exercise the optional class LRU');
 check(warm.loader.ships.entries<=warm.loader.limits.visibleShipEntries&&warm.loader.ships.bytes<=warm.loader.limits.visibleShipBytes,'Visible retention exceeded its hard cap');
 check(warm.effects.foregroundStages===before.effects.foregroundStages,'Steady rendering restarted foreground appearance preparation');
 // A needed intermediate plate can stream without blanking or borrowing a
 // different hull. This includes classes absent from the optional class LRU.
 for(const row of rows){row.stage=row.stage===0?1:2;row.state.hull=nativeShipDefinitions.get(row.state.shipType).hull*[1,.7,.4,.1][row.stage];}
 const fallback=frame(110,{validate:false});
 check(fallback.every(row=>row.typePainted===row.type),'A damage transition lost its same-hull plate '+JSON.stringify(fallback));
 for(const row of rows){await effects.request(row.state.shipType,row.category,{stage:row.stage,visible:true});frame(111,{validate:false});}
 frame(112);
 const transitioned={loader:loader.cacheSnapshot(),effects:effects.metrics(),sprites:cache.snapshot()};
 for(let i=0;i<3;i++){cache.beginFrame?.(g);cache.endFrame?.(g);}
 const idle=loader.cacheSnapshot();
 check(idle.ships.entries<=idle.limits.shipEntries&&idle.ships.bytes<=idle.limits.shipBytes,'Leaving the view did not release extra strong retention');
 return {appearances:rows.length,distinctClasses:types.length,frames:frames.length+2,missing,support,before,warm,fallback,transitioned,idle,
   memoryAccounting:'Loader bytes count unique source/processed art. Profile-owned lamp frames are reported separately by effects.profileLamps. Alignment/unlit memoization uses WeakMaps; those entries and weak asset references are not strong-retention budgets or measurable native RSS/VRAM. Sprite bytes and worker reservations are separate owners; do not add overlapping estimates.'};
}'''

REPAIR_CHECK=r'''async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)},loader=vexedFlightAssets,effects=nativeShipEffects,cache=nativeShipSpriteCache;
 document.querySelector('#fleet-working-set')?.remove();
 cache.setBackend('canvas');cache.reset();
 const types=[1,2,3,4,7,8,9,10,11,12,13,35,58],state={system:2,shipType:7,x:10000,y:10000,hull:100,shields:0,
   shipSimulation:{version:1,seconds:1},civilianTraffic:{ships:[]},solEconomy:{freighters:[]},
   shipRepairs:{version:1,sequence:13,calls:[],missions:[],ledger:{consumed:0,lost:0,medicalCapital:0}}};
 const rows=types.map((type,index)=>{
   const maximum=nativeShipDefinitions.get(type,'civilian').hull,
     entity={id:1000+index,shipType:type,system:2,x:0,y:0,heading:.3+index*.17,speed:0,hull:maximum*.55,shields:0,
       phase:'disabled',repairDeuranium:1000};
   state.civilianTraffic.ships.push(entity);nativeShipEquipment.ensure(state,entity);
   // A saved halfway repair can legitimately start exactly at the ordinary
   // 25% disabling floor (stage2), or below it (severe/stage3).
   const ref=nativeShipRepairs.ref('civilian',entity),startHull=maximum*(index%2?.1:.25),restoredHull=entity.hull-startHull;
   const mission={id:'repair:blend:'+index,carrier:ref,target:ref,status:'active',startedAt:0,startHull,restoredHull,
     spent:restoredHull/5,drones:entity.repairBay.slots.map(d=>d.id),attachmentVersion:1};
   for(const dot of entity.repairBay.slots)Object.assign(dot,{phase:'repairing',missionId:mission.id});
   state.shipRepairs.missions.push(mission);state.shipRepairs.ledger.consumed+=mission.spent;
   return {entity,initialStage:index%2?3:2,x:120+(index%5)*240,y:110+Math.floor(index/5)*250};
 });
 const make=id=>{const c=document.createElement('canvas');c.id=id;c.width=1200;c.height=750;
   c.style.cssText='position:absolute;left:0;top:0;z-index:2147483647;display:block;background:#020610';document.body.append(c);return c;};
 const actual=make('blend-actual'),expected=make('blend-reference'),g=actual.getContext('2d',{willReadFrequently:true}),reference=expected.getContext('2d',{willReadFrequently:true});
 expected.style.display='none';
 // No healing runs in this fixture: each plate's pixels remain immutable.
 // Avoid hundreds of temporary native contexts while warming thirteen classes.
 const hashes=new WeakMap(),hash=art=>{if(hashes.has(art))return hashes.get(art);
   const c=document.createElement('canvas');c.width=art.width;c.height=art.height;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(art,0,0);let h=0;for(const n of ctx.getImageData(0,0,c.width,c.height).data)h=(h*31+n)>>>0;
   c.width=c.height=0;hashes.set(art,h);return h;};
 const draw=()=>{
   cache.beginFrame(g);g.clearRect(0,0,1200,750);const result=[];
   for(const row of rows){const d=nativeShipDefinitions.describe(state,row.entity,{category:'civilian'}),art=effects.paintShip(g,d,
     {ship:{x:0,y:0},cx:row.x,cy:row.y,w:1200,h:750,appearance:{light:{direction:.8,x:2000,y:-4000,color:0xffdb9e}}});
     result.push({type:row.entity.shipType,blended:!!art?.repairSurface,paintedType:art?.type??null,
       plateHash:art?.art?hash(art.art):null,expectedHash:row.expectedHash??null});}
   cache.endFrame(g);return result;
 };
 for(const row of rows){for(const stage of [0,1,2,3])await effects.request(row.entity.shipType,'civilian',{stage,visible:true});draw();}
 const prepared=effects.metrics();
 check(prepared.entries<=12&&prepared.evictions>0,'The optional class LRU was not pressured');
 // Loader readiness is independent of the smaller destruction-data LRU.
 for(const row of rows)for(const fraction of [1,.7,.4,.1])await loader.loadShip(row.entity.shipType,
   nativeShipDefinitions.get(row.entity.shipType).hull*fraction,{visible:true});
 const warm=loader.cacheSnapshot();
 for(const row of rows){
   const type=row.entity.shipType,plates=[loader.peekShip(type,0),loader.peekShip(type,1),loader.peekShip(type,2),loader.peekShip(type,3)],
     d=nativeShipDefinitions.describe(state,row.entity,{category:'civilian'}),plate=nativeRepairVisuals.surface(d,plates,plates[1]);
   check(plate?.repairSurface&&plate.type===type,'The ordinary repair surface could not make its reference');
   check(nativeRepairVisuals.requiredStages(d).includes(row.initialStage),'Actual mission start stage was not requested');
   row.expectedHash=hash(plate.art);
   vexedFlightAssets.drawShip(reference,plate,row.x,row.y,d.dimensions.width,d.heading+Math.PI/2,1000,
     {height:d.dimensions.height,lights:false,damage:false,effectRate:20,lightGain:2.8,lightBloom:2.5,
       light:{direction:.8,x:2000,y:-4000,color:0xffdb9e},owner:row.entity});
 }
 const stateBefore=JSON.stringify(state),frames=[];
 for(let i=0;i<5;i++){frames.push(draw());await new Promise(resolve=>setTimeout(resolve,0));}
 check(JSON.stringify(state)===stateBefore,'Painting changed repair/cargo/equipment/supply state');
 const missing=frames.flatMap((frame,index)=>frame.filter(row=>!row.blended||row.paintedType!==row.type||row.plateHash!==row.expectedHash).map(row=>({frame:index,...row})));
 check(missing.length===0,'A loader-ready repair blend disappeared after optional class eviction '+JSON.stringify(missing));
 const support=rows.map(row=>{const rgba=g.getImageData(row.x-75,row.y-75,150,150).data;let n=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>=64)n++;return{type:row.entity.shipType,pixels:n};});
 check(support.every(row=>row.pixels>5),'A returned hull was not actually painted');
 const actualPixels=g.getImageData(0,0,1200,750).data,referencePixels=reference.getImageData(0,0,1200,750).data;
 let changedChannels=0,maxDifference=0,maxPremultiplied=0,maxAlpha=0,populatedActual=0,populatedReference=0;const firstDifferences=[];
 for(let i=0;i<actualPixels.length;i++){const difference=Math.abs(actualPixels[i]-referencePixels[i]);if(difference){changedChannels++;
   if(firstDifferences.length<24)firstDifferences.push({x:Math.floor(i/4)%1200,y:Math.floor(i/4800),channel:i%4,actual:actualPixels[i],reference:referencePixels[i]});}
   maxDifference=Math.max(maxDifference,difference);}
 for(let i=0;i<actualPixels.length;i+=4){if(actualPixels[i+3]>=64)populatedActual++;if(referencePixels[i+3]>=64)populatedReference++;
   maxAlpha=Math.max(maxAlpha,Math.abs(actualPixels[i+3]-referencePixels[i+3]));
   for(let c=0;c<3;c++)maxPremultiplied=Math.max(maxPremultiplied,Math.abs(actualPixels[i+c]*actualPixels[i+3]-referencePixels[i+c]*referencePixels[i+3])/255);}
 window.__repairPixelComparison={changedChannels,maxDifference,maxPremultiplied,maxAlpha,populatedActual,populatedReference,firstDifferences};
 check(populatedActual>100&&populatedReference>100,'The full repair comparison lost its visible hull pixels');
 check(changedChannels===0,'Shared repair-painter pixels differ from the ordinary repair surface '+JSON.stringify(__repairPixelComparison));
 check(nativeRepairVisuals.snapshot(state).surfaces<=16,'The shared repair-surface cap changed');
 return {types,initialStages:rows.map(row=>({type:row.entity.shipType,stage:row.initialStage})),activeMissions:state.shipRepairs.missions.length,
   prepared,warm,frames,missing,support,pixels:__repairPixelComparison,after:loader.cacheSnapshot(),purePainting:true,
   scope:'Saved halfway repair presentation only; no healing or performance measurement. Existing browser-ship-repairs covers live accounting/mission mechanics.'};
}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision')
    parser.add_argument('--expect-missing',action='store_true',help='Demonstrate the historical optional-class eviction failure')
    parser.add_argument('--repair-only',action='store_true',help='Run only the thirteen-class repair-blend image regression')
    args=parser.parse_args()
    if args.repair_only and (args.revision or args.expect_missing):parser.error('--repair-only checks the current shared interfaces')
    output=OUTPUT/(args.revision[:12] if args.revision else 'current');output.mkdir(parents=True,exist_ok=True)
    perf.SnapshotHandler.revision=args.revision
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(perf.SnapshotHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1440,'height':1120});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('window.__workingSetRaf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0');page.wait_for_timeout(100)
            report=page.evaluate(CHECK,{'expectMissing':args.expect_missing}) if not args.repair_only else {'appearances':0,'distinctClasses':0,'missing':[]}
            assert not errors,errors
            if not args.repair_only:page.locator('#fleet-working-set').screenshot(path=str(output/'mixed-hulls-damage-lighting.png'))
            if not args.expect_missing:
                try:report['repairs']=page.evaluate(REPAIR_CHECK)
                except Exception:
                    (output/'repair-pixel-failure.json').write_text(json.dumps(page.evaluate('window.__repairPixelComparison||null'),indent=2),encoding='utf8')
                    page.locator('#blend-actual').screenshot(path=str(output/'repair-failure-actual.png'))
                    page.evaluate("()=>{document.querySelector('#blend-actual').style.display='none';document.querySelector('#blend-reference').style.display='block';}")
                    page.locator('#blend-reference').screenshot(path=str(output/'repair-failure-reference.png'))
                    raise
                page.evaluate('()=>new Promise(resolve=>__workingSetRaf(()=>__workingSetRaf(resolve)))')
                page.locator('#blend-actual').screenshot(path=str(output/'repair-blends-actual.png'))
                page.evaluate("()=>{document.querySelector('#blend-actual').style.display='none';document.querySelector('#blend-reference').style.display='block';}")
                page.evaluate('()=>new Promise(resolve=>__workingSetRaf(()=>__workingSetRaf(resolve)))')
                page.locator('#blend-reference').screenshot(path=str(output/'repair-blends-reference.png'))
            assert not errors,errors
            report.update(browser=browser.version,revision=args.revision,errors=errors,scope='Correctness and bounded ownership; no FPS claim')
            (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
            print(json.dumps({'passed':True,'appearances':report['appearances'],'distinctClasses':report['distinctClasses'],'missing':len(report['missing']),
                'repairMissions':report.get('repairs',{}).get('activeMissions'),'badRepairBlends':len(report.get('repairs',{}).get('missing',[])),
                'historical':bool(args.revision),'browser':browser.version}))
            browser.close()
    finally:server.shutdown()


if __name__=='__main__':main()
