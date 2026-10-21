"""Original-art topology parity and camera-independent live physical ship debris.

This is an isolated real-browser correctness check, not a timing workload.
"""
import argparse
import base64
import functools
import http.server
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'debris-geometry'
spec=importlib.util.spec_from_file_location('geometry_builder',ROOT/'tools/build-debris-geometry.py')
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

EMISSION=r'''async type=>{
 const original=await nativeShipEffects.prepare(type,'civilian'),metadata=VexedMirrorDebrisGeometry.ships[type],
   omitted=new Set(['texture','lit','edge','hot','side','material']),clean=value=>Array.isArray(value)?value.map(clean):
     value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!omitted.has(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,clean(item)])):value;
 const equal=(a,b,label)=>{if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error('Original/metadata physical emission differs '+type+' '+label);};
 const layout={x:350,y:-70,w:73,h:119},angle=.73,c=Math.cos(angle),s=Math.sin(angle),world=p=>
   ({x:layout.x+p.x*layout.w*c-p.y*layout.h*s,y:layout.y+p.x*layout.w*s+p.y*layout.h*c});
 const emitFragments=fragments=>{const debris=[];showcaseStageFragments.emit({debris,fragments,before:0,after:3,layout,world,angle,time:1200,zoom:1,burst(){}});return debris;};
 const a=emitFragments(original.fragments||[[],[],[],[]]),b=emitFragments(metadata.fragments);equal(a,b,'stage-fragments');
 let wreckPieces=0;
 for(let stage=0;stage<metadata.wrecks.length;stage++){
   const emit=topology=>{const state={angle,time:0,debris:[],particles:[]};cthiaDestruction.emit(state,layout,world,stage,1,null,topology);return state.debris;},
     a=emit(original.destruction.serialized()[stage]),b=emit(metadata.wrecks[stage]);equal(a,b,'wreck-stage-'+stage);wreckPieces+=a.length;
 }
 return {fragments:a.length,wreckPieces,physicalEmissionEqual:true};
}'''

PHYSICAL=r'''async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)},clone=v=>JSON.parse(JSON.stringify(v)),base=clone(nativeNpcDev.getState());
 const native=window.nativeEnvironmentalImpacts,observed=new Set(),samples=[];
 window.nativeEnvironmentalImpacts={...native,debris(state,piece,oldX,oldY,options){
   observed.add(piece);const before={x:piece.x,y:piece.y,vx:piece.vx,vy:piece.vy,angle:piece.angle,spin:piece.spin};
   native.debris(state,piece,oldX,oldY,options);
   samples.push({before,after:{x:piece.x,y:piece.y,vx:piece.vx,vy:piece.vy,angle:piece.angle,spin:piece.spin},textured:!!piece.texture});
 }};
 const canvas=document.createElement('canvas');canvas.id='physical-debris-proof';canvas.width=1200;canvas.height=700;
 canvas.style.cssText='position:fixed;left:0;top:0;z-index:2147483647;background:#020610';document.body.append(canvas);
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),cases=[],evidence=document.createElement('canvas');evidence.id='original-art-debris-evidence';evidence.width=1200;evidence.height=700;
 const eg=evidence.getContext('2d');eg.fillStyle='#020610';eg.fillRect(0,0,1200,700);document.body.append(evidence);
 const kinematics=piece=>Object.fromEntries(['x','y','w','h','vx','vy','spin','angle','born','ttl','geometryStage','geometryPart'].filter(key=>piece[key]!==undefined).map(key=>[key,piece[key]]));
 function replay(type,destroyed,camera){
   nativeShipEffects.reset();native.reset();observed.clear();samples.length=0;
   const state=clone(base);Object.assign(state,{system:43,x:100000,y:100000,angle:0,speed:0,vx:0,vy:0,hull:1000,shields:0,landed:false});
   state.shipSimulation={version:1,seconds:1};state.solEconomy.freighters=[];state.civilianTraffic.ships=[];
   state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];
   state.minedAsteroids=nativeSolAsteroids.forSystem(43).map(rock=>rock.slotId);state.asteroidMotion=undefined;
   const definition=nativeShipDefinitions.get(type,'civilian'),source={id:90001,shipType:type,system:43,x:0,y:0,heading:.37,
     hull:definition.hull,shields:0,phase:'cruise',speed:0,vx:0,vy:0};
   state.civilianTraffic.ships.push(source);let d=nativeShipDefinitions.describe(state,source,{category:'civilian'});
   check(d.definition.debrisGeometry===VexedMirrorDebrisGeometry.ships[type],'Definition did not use immutable canonical topology '+type);
   const topology=destroyed?d.definition.debrisGeometry.wrecks[0].pieces:d.definition.debrisGeometry.fragments.flat();
   check(topology.length>0,'Fixture needs real physical pieces');
   const first=topology[0],point=nativeCombatShots.worldPoint(d,{x:first.x*d.dimensions.width,y:first.y*d.dimensions.height});
   const target={id:90002,shipType:7,system:43,x:point.x,y:point.y,heading:-.6,hull:1000,shields:0,phase:'cruise',speed:0,vx:0,vy:0,dimensions:{width:36,height:36}};
   state.civilianTraffic.ships.push(target);nativeShipSystems.invalidate(state);
   const before=nativeShipEffects.metrics(),damage=nativeShipDamage.apply(d,definition.hull*(destroyed?2:.8),{kind:'beam',from:{x:-100,y:0}});
   nativeShipEffects.hit(state,d,damage,{kind:'beam'});
   const emitted=nativeShipEffects.metrics();
   check(destroyed?emitted.wreckPieces>0:emitted.physicalFragments>0,'No immediate physical pieces before artwork');
   check(emitted.deferredStages===0,'Canonical geometry was deferred until image readiness');
   const trajectories=[],views=[];
   for(let step=0;step<15;step++){
     nativeSimulation.advance(state,1/60);nativeShipEffects.advance(state,1/60);
     trajectories.push([...observed].map(kinematics));
     const offset=camera==='hidden'?90000:camera==='moving'&&step%3?90000:0;
     const view={state,ship:{x:offset,y:0},cx:600,cy:350,zoom:2,w:1200,h:700};
     const prior=samples.length;nativeShipEffects.paint(state,ctx,view);check(samples.length===prior,'Painting replayed physical contacts');views.push(view);
   }
   check(observed.size>0&&samples.length>0,'Real environmental dispatcher received no physical pieces');
   const contact=samples.some(row=>Math.abs(row.before.vx-row.after.vx)>1e-8||Math.abs(row.before.vy-row.after.vy)>1e-8);
   check(contact&&Math.hypot(target.vx,target.vy)>0,'Cold pieces did not physically strike their intervening ship');
   const after=nativeShipEffects.metrics();
   if(camera==='hidden')check(after.loads===before.loads,'Offscreen physical events requested optional artwork');
   return {state,source,target,trajectories,observed:[...observed],metrics:after,before,
     result:{sourceHull:source.hull,targetHull:target.hull,targetX:target.x,targetY:target.y,targetVX:target.vx,targetVY:target.vy,
       motionKick:target.motionKick,asteroidDamage:state.asteroidDamage},contact};
 }
 try{
   for(const [type,destroyed]of [[35,false],[49,false],[58,true],[44,true]]){
     const coldAtStart=!nativeShipEffects.optionalReady(type,'civilian'),cold=replay(type,destroyed,'hidden');
     if(coldAtStart)check(cold.observed.every(piece=>!piece.texture),'Cold physical pieces borrowed unrelated/native artwork');
     const physicalBefore=cold.observed.map(kinematics),stateBefore=JSON.stringify(cold.state),metricsBefore=nativeShipEffects.metrics();
     const art=await nativeShipEffects.prepare(type,'civilian');check(art?.optionalReady,'Explicit full preparation failed');
     ctx.clearRect(0,0,1200,700);nativeShipEffects.paint(cold.state,ctx,{state:cold.state,ship:{x:0,y:0},cx:600,cy:350,zoom:2,w:1200,h:700});
     check(JSON.stringify(cold.observed.map(kinematics))===JSON.stringify(physicalBefore),'Material binding changed authoritative trajectories');
     check(JSON.stringify(cold.state)===stateBefore,'Preparing/painting changed gameplay state');
     check(nativeShipEffects.metrics().stageGeometryEmissions===metricsBefore.stageGeometryEmissions&&nativeShipEffects.metrics().wreckGeometryEmissions===metricsBefore.wreckGeometryEmissions,'Material readiness replayed physical emission');
     check(cold.observed.every(piece=>!!piece.texture),'Visible cold physical pieces did not bind their original material');
     const support=ctx.getImageData(0,0,1200,700).data;let pixels=0;for(let i=3;i<support.length;i+=4)if(support[i]>=64)pixels++;
     check(pixels>20,'Late-bound original physical debris was not actually painted');
     const column=cases.length%2,row=Math.floor(cases.length/2);eg.drawImage(canvas,column*600,row*350,600,350);
     eg.fillStyle='#cce8ff';eg.font='16px sans-serif';eg.fillText(type+' / '+(destroyed?'wreck':'damage-stage fragments')+' / original late-bound artwork',column*600+18,row*350+28);
     const warm=replay(type,destroyed,'moving');
     check(JSON.stringify(warm.trajectories)===JSON.stringify(cold.trajectories),'Camera/artwork readiness changed swept physical trajectories '+type+'/'+destroyed);
     check(JSON.stringify(warm.result)===JSON.stringify(cold.result),'Camera/artwork readiness changed collision consequences '+type+'/'+destroyed);
     cases.push({type,destroyed,coldAtStart,pieces:cold.observed.length,physicalContacts:samples.length,contact:cold.contact,
       deliveredOriginalPixels:pixels,identicalTrajectories:true,identicalGameplay:true,offscreenOptionalLoads:cold.metrics.loads-cold.before.loads});
   }
   // A late surface must use its original immutable part index after early
   // pieces have expired, rather than matching the compacted live-array index.
   check(!nativeShipEffects.optionalReady(1,'civilian'),'Late-expiry hull was warmed before its cold event');
   const late=replay(1,true,'hidden');
   check(late.observed.every(piece=>!piece.texture),'Late-expiry hull emitted with existing textures');
   for(let i=0;i<12;i++){nativeSimulation.advance(late.state,.75);nativeShipEffects.advance(late.state,.75);}
   const alive=late.observed.filter(piece=>9250<piece.ttl);
   check(alive.length>0&&alive.length<late.observed.length,'Expiry fixture did not compact different-lifetime wreck pieces');
   const prepared=await nativeShipEffects.prepare(1,'civilian'),original=prepared.destruction.serialized()[0].pieces;
   const lateBefore=alive.map(kinematics),lateState=JSON.stringify(late.state);
   ctx.clearRect(0,0,1200,700);nativeShipEffects.paint(late.state,ctx,{state:late.state,ship:{x:0,y:0},cx:600,cy:350,zoom:.2,w:1200,h:700});
   for(const piece of alive)check(piece.texture===original[piece.geometryPart].texture,'Expired neighbor shifted late texture identity');
   check(JSON.stringify(alive.map(kinematics))===JSON.stringify(lateBefore)&&JSON.stringify(late.state)===lateState,'Late binding changed authoritative consequences');
   return {cases,lateExpiry:{original:late.observed.length,alive:alive.length,indices:alive.map(piece=>piece.geometryPart)},
     sourceSignature:VexedMirrorDebrisGeometry.sourceSignature,scope:'Actual shared physical contacts and original materials; no throughput measurement'};
 }finally{window.nativeEnvironmentalImpacts=native;nativeShipEffects.reset();native.reset();}
}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--physical-only',action='store_true',help='Repeat consumer/late-material correctness without rebuilding all original metadata')
    args=parser.parse_args()
    OUTPUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(builder.Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[]
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1200,'height':700});page.set_default_timeout(300000)
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.locator('[data-menu="dev"]').click(timeout=120000)
            page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCombatShots.isReady()')
            page.evaluate('window.__debrisRaf=requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0')
            page.wait_for_timeout(100)
            report=page.evaluate(PHYSICAL)
            # Compare all registered original pieces, not a separately coded
            # approximation of fragment cuts or normalized hull coordinates.
            types=[] if args.physical_only else page.evaluate('nativeShipDefinitions.registered().filter(d=>!d.renderer).map(d=>d.id)')
            comparisons=[]
            for ship_type in types:
                row=page.evaluate(builder.EXTRACT,ship_type)
                expected=page.evaluate('(type)=>VexedMirrorDebrisGeometry.ships[type]',ship_type)
                profile=row.pop('profileConfig')
                row['profileSignature']=builder.digest(builder.canonical(profile).replace('\\r\\n','\\n').encode('utf8'))
                assert builder.canonical(row)==builder.canonical(expected),f'Original prepared topology differs: {ship_type}'
                emission=page.evaluate(EMISSION,ship_type)
                comparisons.append({'type':ship_type,**emission})
                if len(comparisons)%10==0:print(f'Original-art geometry/emission {len(comparisons)}/{len(types)}',flush=True)
            paths=['html-games/broken-mirror-port/'+file for file in ['ship-effects.js','ship-definitions.js','ship-debris-geometry.js']]
            report.update(originalArtworkComparisons=comparisons,browser=browser.version,errors=errors,physicalOnly=args.physical_only,
                sourceHashes={file:hashlib.sha256((ROOT/file).read_bytes()).hexdigest() for file in paths})
            assert not errors,errors
            # The last pure topology comparisons do not change this proof canvas.
            image=page.evaluate('document.querySelector("#original-art-debris-evidence").toDataURL().split(",")[1]')
            (OUTPUT/'original-art-physical-debris.png').write_bytes(base64.b64decode(image))
            (OUTPUT/('physical-report.json' if args.physical_only else 'report.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
            print(json.dumps({'passed':True,'physicalCases':len(report['cases']),'originalHulls':len(comparisons),'lateExpiry':report['lateExpiry'],'browser':browser.version}))
            browser.close()
    finally:server.shutdown()


if __name__=='__main__':main()
