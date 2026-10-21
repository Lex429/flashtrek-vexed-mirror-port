"""Real canvas regressions for bounded preparation and retained painted lamps.

Compare lamp pixels against the actual verified 665e553 implementation, including
all seventeen blur phases and integer/fractional raster scales. Evidence is ignored.
"""
import argparse
import functools
import base64
import hashlib
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'/'incremental-art'
BASELINE = '665e553ee37cad55a4d0e80461b5fdcb55a02e9e'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


CHECK = r"""async () => {
  const check=(value,label)=>{if(!value)throw Error(label);},updatedCache=nativeShipSpriteCache,referenceCache=__referenceLampCache;
  const read=canvas=>canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
  const compare=(left,right)=>{const a=read(left),b=read(right);check(a.length===b.length,'Changed canvas dimensions');let changed=0,max=0,total=0,maxPremultiplied=0,premultipliedTotal=0,maxAlphaError=0,maxRgbAlpha64=0,changedVisiblePixels=0;
    const measures=[0,1].map(()=>({mass:0,x:0,y:0,bounds:[left.width,left.height,-1,-1]}));
    for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)changed++;max=Math.max(max,d);total+=d;}
    for(let i=0;i<a.length;i+=4){const x=(i/4)%left.width,y=Math.floor((i/4)/left.width);
      for(const [n,data]of [a,b].entries()){const alpha=data[i+3],m=measures[n];m.mass+=alpha;m.x+=x*alpha;m.y+=y*alpha;if(alpha>=64){m.bounds[0]=Math.min(m.bounds[0],x);m.bounds[1]=Math.min(m.bounds[1],y);m.bounds[2]=Math.max(m.bounds[2],x);m.bounds[3]=Math.max(m.bounds[3],y);}}
      const alpha=Math.abs(a[i+3]-b[i+3]),visible=Math.max(a[i+3],b[i+3])>=64;let pixelChanged=alpha>0;maxAlphaError=Math.max(maxAlphaError,alpha);maxPremultiplied=Math.max(maxPremultiplied,alpha);premultipliedTotal+=alpha;for(let channel=0;channel<3;channel++){const raw=Math.abs(a[i+channel]-b[i+channel]);if(visible)maxRgbAlpha64=Math.max(maxRgbAlpha64,raw);pixelChanged||=raw>0;const difference=Math.abs(a[i+channel]*a[i+3]-b[i+channel]*b[i+3])/255;maxPremultiplied=Math.max(maxPremultiplied,difference);premultipliedTotal+=difference;}if(visible&&pixelChanged)changedVisiblePixels++;}
    const [l,r]=measures,centroidDifference=l.mass&&r.mass?Math.hypot(l.x/l.mass-r.x/r.mass,l.y/l.mass-r.y/r.mass):l.mass===r.mass?0:Infinity;
    return {changed,max,mean:total/a.length,maxPremultiplied,meanPremultiplied:premultipliedTotal/a.length,maxAlphaError,maxRgbAlpha64,changedVisiblePixels,pixelCount:a.length/4,
      alpha64BoundsMaxDelta:Math.max(...l.bounds.map((v,i)=>Math.abs(v-r.bounds[i]))),centroidDifference};};
  const sameLampAppearance=pixels=>pixels.maxPremultiplied<=2&&pixels.maxAlphaError<=1&&pixels.alpha64BoundsMaxDelta===0&&pixels.centroidDifference<=.05;
  const make=(width,height)=>Object.assign(document.createElement('canvas'),{width,height});
  const lampResults=[],mutationWitnesses=[];
  for(const type of [35,49,58]){
    const asset=await vexedFlightAssets.loadShip(type,nativeShipDefinitions.get(type).hull),lamps=[];
    window.nativeShipSpriteCache={...updatedCache,drawLamp(_ctx,textures,point,_pulse,_options){lamps.push({textures,point});return true;}};
    try{asset.profile.effects.draw(make(asset.width,asset.height).getContext('2d'),{x:asset.width/2,y:asset.height/2,w:asset.width,h:asset.height},0,0,0,{lights:true,damage:false});}
    finally{window.nativeShipSpriteCache=updatedCache;}
    check(lamps.length>0,'No actual painted lamps for hull '+type);
    const selected=[lamps[0],lamps.at(-1),lamps.reduce((best,lamp)=>lamp.textures.lit.width*lamp.textures.lit.height>best.textures.lit.width*best.textures.lit.height?lamp:best)];
    for(let index=0;index<selected.length;index++)for(const scale of [.73,1,1.37,2])for(let phase=0;phase<=16;phase++){
      const {textures}=selected[index],options={lightGain:2.8,lightBloom:2.5,rasterScale:scale},pad=Math.ceil(4*2.5*scale*3)+4;
      const width=Math.ceil(textures.lit.width*scale)+pad*2,height=Math.ceil(textures.lit.height*scale)+pad*2;
      const draw=(cache,lampOptions=options,dropGlow=false)=>{const canvas=make(width,height),g=canvas.getContext('2d',{willReadFrequently:true});g.translate(pad,pad);g.scale(scale,scale);
        if(dropGlow){const original=g.drawImage;let layer=0;g.drawImage=function(...args){if(++layer!==3)return original.apply(this,args);};}
        check(cache.drawLamp(g,textures,{left:0,top:0},phase/16,lampOptions),'Lamp renderer rejected supported dimensions');return canvas;};
      const updated=draw(updatedCache),reference=draw(referenceCache),pixels=compare(updated,reference);
      // Compare actual premultiplied output: an invisible/alpha-one pixel can
      // have a large unpremultiplied RGB difference after Canvas interpolation.
      // Integer source-subset cropping follows different Skia rounding paths
      // on software and GPU backends. Keep the two-level pointwise bound and
      // require one-level alpha, unchanged visible support and <1/20px drift.
      // The mean includes transparent padding, so retain it as evidence rather
      // than using that fixture-area-dependent value as a quality threshold.
      check(sameLampAppearance(pixels),'Painted lamp pixels changed '+JSON.stringify({type,index,scale,phase,pixels}));
      lampResults.push({type,index,scale,phase,...pixels});
      if(type===49&&index===1&&scale===.73&&phase===8){
        const shifted=make(width,height);shifted.getContext('2d').drawImage(reference,1,0);
        const wrongColour=make(width,height),colour=wrongColour.getContext('2d');colour.filter='hue-rotate(90deg)';colour.drawImage(reference,0,0);
        // Keep phase8's pulse but substitute phase16's blur radius (4 vs 3).
        const wrongPhase=draw(referenceCache,{...options,rasterScale:options.rasterScale*4/3}),missingGlow=draw(referenceCache,options,true);
        for(const [kind,canvas]of [['one device pixel shift',shifted],['wrong lamp colour',wrongColour],['wrong blur phase',wrongPhase],['missing glow',missingGlow]]){
          const changed=compare(canvas,reference);check(!sameLampAppearance(changed),'Lamp comparison accepted mutation: '+kind);mutationWitnesses.push({kind,...changed});
        }
      }
    }
  }
  const appearanceResults=[],catalog=await (await fetch('../flashtrek-broken-mirror/showcase-assets/catalog.json')).json();
  for(const type of [44,59]){
    const asset=await vexedFlightAssets.loadShip(type,nativeShipDefinitions.get(type).hull),config=type===59?{}:{...asset.profile,offRegions:asset.profile.lights.filter(p=>p.kind==='core'||p.offSevere).map(p=>p.shape==='circle'||p.kind==='running'?{x:p.x,y:p.y,r:p.r+3}:{x:p.x,y:p.y,w:p.shape==='tube'?21:(p.w||24)+6,h:(p.h||6)+6})};
    const image=new Image();image.src='../flashtrek-broken-mirror/showcase-assets/'+catalog.ships.find(ship=>ship.id===type).frames[0];await image.decode();
    const pixels=compare(await createShowcaseEffects(config).unlitFrameAsync(image),__referenceUnlit(image,config));
    check(pixels.max<=1,'Unlighting pixels changed '+JSON.stringify({type,pixels}));appearanceResults.push({type,...pixels});
    if(type===44){const owner=nativeDamageArtPreparation;let fallback;
      window.nativeDamageArtPreparation={...owner,pixels:{...owner.pixels,readAsync:()=>Promise.reject(Error('Forced readback failure for fallback coverage'))}};
      try{fallback=await createShowcaseEffects(config).unlitFrameAsync(image);}finally{window.nativeDamageArtPreparation=owner;}
      const fallbackPixels=compare(fallback,__referenceUnlit(image,config));check(fallbackPixels.max<=1,'Readback failure changed fallback artwork '+JSON.stringify(fallbackPixels));appearanceResults.push({type,fallback:true,...fallbackPixels});
    }
  }
  const nativeReadback=nativeDamageArtPreparation.snapshot().readback;
  check(nativeReadback.completed>0&&nativeReadback.failed===0&&nativeReadback.pending===0,'Native worker readback did not complete successfully '+JSON.stringify(nativeReadback));
  const workerCases=[],sample=make(4,4);sample.getContext('2d').fillRect(0,0,4,4);
  const reject=async(promise,name)=>{let error;try{await promise;}catch(caught){error=caught;}check(error&&error.name===name,'Expected bounded readback failure '+name);};
  const bounded=createShipArtReadback({maxPending:1,maxPixels:16,maxBytes:192,timeoutMs:5000}),first=bounded.read(sample);
  await reject(bounded.read(sample),'RangeError');const data=await first;check(data.data.length===64,'Worker lost valid request behind rejected admission');
  workerCases.push({case:'bounded admission',...bounded.snapshot()});bounded.dispose();
  const NativeWorker=window.Worker;
  try{window.Worker=class{constructor(){throw Error('Forced worker creation failure');}};const failing=createShipArtReadback();
    await reject(failing.read(sample),'Error');check(failing.snapshot().pending===0&&failing.snapshot().bytesInFlight===0,'Worker failure leaked pending art');workerCases.push({case:'constructor failure',...failing.snapshot()});failing.dispose();
  }finally{window.Worker=NativeWorker;}
  const cancelled=createShipArtReadback(),cancelledRead=cancelled.read(sample);cancelled.dispose();await reject(cancelledRead,'AbortError');
  const cancelDeadline=performance.now()+5000;while(cancelled.snapshot().bytesInFlight){check(performance.now()<cancelDeadline,'Late bitmap reservation did not release');await new Promise(resolve=>setTimeout(resolve,4));}
  workerCases.push({case:'disposed snapshot',...cancelled.snapshot()});
  const asset=await vexedFlightAssets.loadShip(50,nativeShipDefinitions.get(50).hull),width=asset.width,height=asset.height;
  const config={width,height,vascular:true,wounds:[[],[],[],[]],organs:[],sites:[[width*.25,height*.25],[width*.75,height*.75]]};
  const updated=createBiologicalShipEffects(config),capture=async work=>{const canvases=[],original=Document.prototype.createElement;
    Document.prototype.createElement=function(name,...args){const element=original.call(this,name,...args);if(String(name).toLowerCase()==='canvas')canvases.push(element);return element;};
    try{return {value:await work(),canvases};}finally{Document.prototype.createElement=original;}};
  const prepared=await capture(()=>updated.effects.prepareFrameAsync(asset.art,0)),reference=await capture(()=>__referenceBiologyFrame(asset.art,config));
  check(prepared.canvases.length===reference.canvases.length,'Vascular preparation changed its masks/bands');
  const biologyPixels=prepared.canvases.map((canvas,index)=>compare(canvas,reference.canvases[index]));
  check(biologyPixels.every(row=>row.max<=1),'Vascular appearance changed '+JSON.stringify(biologyPixels));
  check(updated.effects.snapshot(0,0,{lights:true}).vascularPixels===reference.value.vascularPixels,'Vascular pixel classification changed');
  const transfers=[],prototype=CanvasRenderingContext2D.prototype,readPixels=prototype.getImageData,writePixels=prototype.putImageData;
  prototype.getImageData=function(x,y,w,h,...args){transfers.push(w*h);return readPixels.call(this,x,y,w,h,...args);};
  prototype.putImageData=function(image,...args){transfers.push(image.width*image.height);return writePixels.call(this,image,...args);};
  try{nativeDamageArtPreparation.resetMetrics();await nativeShipEffects.prepare(35,'civilian',{stage:0});}
  finally{prototype.getImageData=readPixels;prototype.putImageData=writePixels;}
  check(nativeShipEffects.optionalReady(35,'civilian'),'Explicit full preparation returned before fragment/wreck readiness');
  check(transfers.length>10&&Math.max(...transfers)<=nativeDamageArtPreparation.snapshot().limits.pixelChunk,'Native transfers were not split into bounded stripes');
  const fleet=[];
  for(const [row,fraction]of [1,.4,.1].entries())for(const [column,type]of [35,49,58,50].entries()){
    const definition=nativeShipDefinitions.get(type),dimensions=nativeShipDefinitions.presentation(type),asset=await vexedFlightAssets.loadShip(type,definition.hull*fraction);fleet.push({row,column,type,definition,dimensions,asset});
  }
  const gallery=lamps=>{updatedCache.reset();window.nativeShipSpriteCache={...updatedCache,drawLamp:lamps.drawLamp};
    try{const canvas=make(1000,700),g=canvas.getContext('2d');g.fillStyle='#070b12';g.fillRect(0,0,1000,700);g.fillStyle='#d7e7ef';g.font='15px sans-serif';g.fillText('Shared ship sizes, turning, damage appearance and directional lighting - time 1350 ms',20,25);
      for(const {row,column,type,definition,dimensions,asset}of fleet){const position={x:125+column*250,y:125+row*220};
        vexedFlightAssets.drawShip(g,asset,position.x,position.y,dimensions.width,column*.43+row*.29,1350,{height:dimensions.height,light:{x:30,y:30,color:0xffdb9e},effectRate:60});
        g.fillText((definition.name||String(type))+' / stage '+asset.damageStage,position.x-100,position.y+85);}
      return canvas;
    }finally{window.nativeShipSpriteCache=updatedCache;}};
  const baselineGallery=gallery(referenceCache),afterGallery=gallery(updatedCache),galleryPixels=compare(baselineGallery,afterGallery);
  check(galleryPixels.max<=2,'Full rendered hull appearance changed '+JSON.stringify(galleryPixels));
  window.__artEvidence={baseline:baselineGallery,after:afterGallery};
  return {lampCases:lampResults.length,lampResults,mutationWitnesses,appearanceResults,biologyPixels,galleryPixels,nativeReadback,workerCases,nativeTransfers:transfers.length,maxTransferPixels:Math.max(...transfers),queue:nativeDamageArtPreparation.snapshot(),cache:updatedCache.snapshot()};
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', help='Keep a separate ignored evidence directory for this backend')
    backend = parser.add_mutually_exclusive_group()
    backend.add_argument('--cpu', action='store_true', help='Disable GPU and accelerated 2D canvas')
    backend.add_argument('--swiftshader', action='store_true', help='Use explicit SwiftShader and software compositing')
    args = parser.parse_args()
    output = OUTPUT/args.label if args.label else OUTPUT
    output.mkdir(parents=True, exist_ok=True)
    paths = ['html-games/broken-mirror-port/ship-sprite-cache.js',
             'html-games/flashtrek-broken-mirror/cthia-effects.js',
             'html-games/flashtrek-broken-mirror/bioship-effects.js',
            'html-games/flashtrek-broken-mirror/creature-effects.js',
            'html-games/flashtrek-broken-mirror/egg-effects.js',
            'html-games/flashtrek-broken-mirror/damage-showcase.js',
             'tests/fixtures/reference-painted-art-665e553.js']
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    try:
        with sync_playwright() as playwright:
            channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
            flags = ['--disable-gpu', '--disable-accelerated-2d-canvas'] if args.cpu else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing'] if args.swiftshader else []
            browser = playwright.chromium.launch(headless=True, args=flags, **({'channel': channel} if channel else {}))
            graphics = browser.new_browser_cdp_session().send('SystemInfo.getInfo')
            page = browser.new_page(viewport={'width': 1280, 'height': 850})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
            page.evaluate('()=>{startNativeDevGame();nativeNpcDev.showMap();window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();}')
            page.wait_for_function('()=>!nativeShipEffects.metrics().pending && !nativeDamageArtPreparation.snapshot().pending', timeout=120000)
            page.add_script_tag(path=str(ROOT/'tests/fixtures/reference-painted-art-665e553.js'))
            result = page.evaluate(CHECK)
            for label in ['baseline', 'after']:
                encoded = page.evaluate('(label)=>__artEvidence[label].toDataURL().split(",")[1]', label)
                (output/f'{label}-lighting-size-damage.png').write_bytes(base64.b64decode(encoded))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/damage-showcase.html')
            page.wait_for_function('()=>window.showcaseState?.().ready', timeout=120000)
            page.locator('#fleet-filter').select_option('all')
            page.locator('#animation-filter').select_option('all')
            result['specializedShowcase'] = []
            for ship_type in [68, 70]:
                page.locator('#ship-select').select_option(str(ship_type))
                page.wait_for_function('(id)=>showcaseState().ready && showcaseState().ship===id', arg=ship_type, timeout=120000)
                probe = page.evaluate(r"""async (id)=>{
                  const biology=starterShips.get(id).biology;
                  if(biology.prepareAsync!==null)throw Error('Specialized preparation inherited the base-only async path');
                  await biology.ready;
                  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=704;
                  const g=canvas.getContext('2d',{willReadFrequently:true});
                  biology.effects.draw(g,{x:256,y:352,w:512,h:704},0,0,1350,{lights:true,damage:false});
                  const data=g.getImageData(0,0,512,704).data;let visible=0;for(let i=3;i<data.length;i+=4)if(data[i])visible++;
                  if(visible<20)throw Error('Specialized core/glow masks are missing');
                  const state=showcaseState();if(!state.cthiaCutAudit.every(stage=>stage.sourcePixels===stage.cutPixels))throw Error('Specialized breakup lost material');
                  await new Promise(requestAnimationFrame);return {ship:id,visibleEffectPixels:visible,appearance:state.enhancedEffects,audit:state.cthiaCutAudit};
                }""", ship_type)
                page.locator('#scene').screenshot(path=str(output/f'showcase-{ship_type}-prepared.png'))
                result['specializedShowcase'].append(probe)
            result.update(browserVersion=browser.version, browserChannel=channel, browserArgs=flags, graphics=graphics, baseline=BASELINE,
                          harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                          lampComparisonBounds={'maxPremultiplied': 2, 'maxAlphaError': 1, 'alpha64BoundsMaxDelta': 0, 'centroidDifferenceDevicePixels': .05},
                          sourceHashes={path: hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in paths}, errors=errors)
            (output/'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
            if errors:
                raise AssertionError(errors)
            print(json.dumps({'lampCases': result['lampCases'], 'biologyCanvases': len(result['biologyPixels']), 'galleryPixels': result['galleryPixels'],
                              'nativeTransfers': result['nativeTransfers'], 'maxTransferPixels': result['maxTransferPixels'], 'browserVersion': result['browserVersion']}))
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
