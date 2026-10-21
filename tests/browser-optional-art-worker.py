"""Compare actual bounded worker fragments/wrecks with the shared fallback pixels."""
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
OUTPUT=ROOT/'test-results'/'optional-art-worker'
spec=importlib.util.spec_from_file_location('worker_art_server',ROOT/'tests/browser-npc-performance.py')
perf=importlib.util.module_from_spec(spec);spec.loader.exec_module(perf)

CHECK=r'''async()=>{
  const check=(v,label)=>{if(!v)throw Error(label);},canvas=document.createElement('canvas');canvas.width=1000;canvas.height=700;
  const g=canvas.getContext('2d');g.fillStyle='#030811';g.fillRect(0,0,1000,700);
  const pixels=source=>{const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
  const compare=(a,b)=>{
    check(a.width===b.width&&a.height===b.height,'Worker changed a texture dimension');const x=pixels(a),y=pixels(b);let max=0,alpha=0;
    for(let i=0;i<x.length;i+=4){alpha=Math.max(alpha,Math.abs(x[i+3]-y[i+3]));for(let c=0;c<3;c++)max=Math.max(max,Math.abs(x[i+c]*x[i+3]-y[i+c]*y[i+3])/255);}
    check(max<=2&&alpha<=1,'Worker changed material colour/alpha '+JSON.stringify({max,alpha}));return {max,alpha};
  };
  const comparePiece=(a,b)=>{
    for(const field of ['x','y','w','h','pixels','core','structural','coreX','coreY','edgePixels','edgeX','edgeY'])check(a[field]===b[field],'Worker changed fragment geometry '+field);
    const textures=[];for(const field of ['texture','lit','edge','hot','side'])if(a[field]||b[field]){check(a[field]&&b[field],'Missing worker surface '+field);textures.push(compare(a[field],b[field]));}
    const am=wreckageEffects.get(a.texture),bm=wreckageEffects.get(b.texture);check(!!am===!!bm,'Worker lost cached material');
    if(am){check(am.sourcePixels===bm.sourcePixels&&am.tornPixels===bm.tornPixels,'Worker changed material conservation');check(JSON.stringify(am.anchors)===JSON.stringify(bm.anchors),'Worker changed weld/flame anchors');textures.push(compare(am.texture,bm.texture),compare(am.hot,bm.hot));}
    return textures;
  };
  const rows=[];
  for(const [column,type]of [35,49,58].entries()){
    const maximum=nativeShipDefinitions.get(type).hull,assets=[];for(const fraction of [1,.7,.4,.1])assets.push(await vexedFlightAssets.loadShip(type,maximum*fraction));
    const frames=assets.map(asset=>asset.art),profile=assets[0].profile;
    const fragments=await showcaseStageFragments.prepareAsync(frames,profile.breakAnchors),reference=showcaseStageFragments.prepare(frames,profile.breakAnchors),fragmentPixels=[];
    for(let stage=0;stage<4;stage++){check(fragments[stage].length===reference[stage].length,'Worker changed fragment count');for(let i=0;i<fragments[stage].length;i++)fragmentPixels.push(...comparePiece(fragments[stage][i],reference[stage][i]));}
    const config={...profile.destruction,structural:type===49},destruction=createShipDestruction(),fallback=createShipDestruction();await destruction.prepareAsync(frames,config);fallback.prepare(frames,config);
    const prepared=destruction.serialized(),original=fallback.serialized(),wreckPixels=[];
    for(let stage=0;stage<4;stage++){check(prepared[stage].sourcePixels===prepared[stage].cutPixels,'Worker lost wreck material');check(prepared[stage].pieces.length===original[stage].pieces.length,'Worker changed wreck piece count');for(let i=0;i<prepared[stage].pieces.length;i++)wreckPixels.push(...comparePiece(prepared[stage].pieces[i],original[stage].pieces[i]));}
    const d=nativeShipDefinitions.presentation(type);vexedFlightAssets.drawShip(g,assets[0],160+column*330,130,d.width,0,1350,{height:d.height,light:{direction:.8,color:0xffdb9e},effectRate:20});
    const state={time:700,debris:[],particles:[],angle:0},layout={x:160+column*330,y:390,w:d.width,h:d.height};
    destruction.emit(state,layout,p=>({x:layout.x+p.x*d.width,y:layout.y+p.y*d.height}),2,1);
    for(const piece of state.debris){g.save();g.translate(piece.x,piece.y);g.rotate(piece.angle);destruction.drawWreckSurface(g,piece,state.time);g.restore();}
    rows.push({type,fragmentTextures:fragmentPixels.length,wreckTextures:wreckPixels.length,maxPremultiplied:Math.max(0,...fragmentPixels.map(p=>p.max),...wreckPixels.map(p=>p.max))});
  }
  let paints=0,painting=true;const paint=()=>{if(painting){paints++;requestAnimationFrame(paint);}};requestAnimationFrame(paint);
  await nativeShipEffects.prepare(49,'civilian',{stage:2});painting=false;
  check(nativeShipEffects.optionalReady(49,'civilian'),'Full preparation resolved before optional readiness');
  check(paints>1,'Optional preparation prevented all foreground frame callbacks');
  const worker=nativeDamageArtPreparation.snapshot().readback;
  check(worker.prepareCompleted>=8&&worker.failed===0&&worker.pending===0,'Native optional worker did not own the successful work '+JSON.stringify(worker));
  check(worker.peakBytes<=worker.limits.maxBytes+worker.limits.maxPreparationBytes,'Optional staging exceeded its aggregate bound');
  window.__optionalWorkerGallery=canvas;return {rows,paints,worker,effects:nativeShipEffects.metrics(),queue:nativeDamageArtPreparation.snapshot()};
}'''

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(perf.SnapshotHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('()=>{window.__optionalNativeRAF=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0;}');page.wait_for_timeout(100);page.evaluate('()=>{window.requestAnimationFrame=window.__optionalNativeRAF;}')
            report=page.evaluate(CHECK);report.update(browser=browser.version,errors=errors)
            assert not errors,errors
            (OUTPUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');(OUTPUT/'worker-materials.png').write_bytes(base64.b64decode(page.evaluate('()=>__optionalWorkerGallery.toDataURL().split(",")[1]')))
            print(json.dumps(report));browser.close()
    finally:server.shutdown()

if __name__=='__main__':main()
