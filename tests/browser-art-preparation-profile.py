"""Isolated, diagnostic cold preparation; never mix these wrappers with timing runs.

Use the same --types and immutable --source-root for both revisions. This records
individual native canvas calls, iterator steps and full optional readiness. The
world RAF is held so unrelated gameplay/drawing cannot be charged to preparation.
Gameplay first appearance is measured separately by the gameplay review harness.
"""
import argparse
import base64
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
INSTRUMENT = r"""() => {
  window.__artNativeRaf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=()=>0;
  const p=window.__artProbe={active:false,native:{},asynchronous:{},steps:{},slow:[],longTasks:[],canvases:0,
    protocol:{selfCheck:false,fulfilledResumes:0,rejectedResumes:0,workerPixelDeliveries:0,invalidPixelDeliveries:0,unlightingMainReadsAfterWorkerDelivery:0}};
  if(window.PerformanceObserver){const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())p.longTasks.push({start:entry.startTime,ms:entry.duration});});observer.observe({type:'longtask',buffered:true});p.observer=observer;}
  const original=Document.prototype.createElement;
  Document.prototype.createElement=function(name,...args){if(p.active&&String(name).toLowerCase()==='canvas')p.canvases++;return original.call(this,name,...args);};
  const record=(owner,name,ms,extra={})=>{const row=owner[name]||={calls:0,totalMs:0,maxMs:0};row.calls++;row.totalMs+=ms;row.maxMs=Math.max(row.maxMs,ms);
    if(ms>8){p.slow.push({name,ms,...extra});p.slow.sort((a,b)=>b.ms-a.ms);p.slow.length=Math.min(p.slow.length,30);}};
  if(window.createImageBitmap){const bitmap=window.createImageBitmap;
    window.createImageBitmap=function(...args){const started=performance.now(),active=p.active;let promise;
      try{promise=bitmap.apply(this,args);return promise;}finally{if(active){record(p.native,'createImageBitmap',performance.now()-started);
        if(promise)Promise.resolve(promise).then(()=>record(p.asynchronous,'bitmap snapshot promise',performance.now()-started),()=>record(p.asynchronous,'failed bitmap snapshot promise',performance.now()-started));}}};
  }
  for(const name of ['drawImage','getImageData','putImageData','createImageData','fillRect']){
    const operation=CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name]=function(...args){if(!p.active)return operation.apply(this,args);const started=performance.now();
      if(name==='getImageData'&&p.currentStep?.label==='appearance:unlit'&&p.currentStep.workerPixelsDelivered)p.protocol.unlightingMainReadsAfterWorkerDelivery++;
      try{return operation.apply(this,args);}finally{record(p.native,name,performance.now()-started,{width:this.canvas.width,height:this.canvas.height,iterator:p.currentStep?.label,method:p.currentStep?.method});}};
  }
  const wrapIterator=(iterator,label)=>{
    let awaitsPromise=false,workerPixelsDelivered=false;
    const invoke=(method,args)=>{
      if(awaitsPromise){awaitsPromise=false;
        if(p.active){p.protocol[method==='throw'?'rejectedResumes':'fulfilledResumes']++;
          if(label==='appearance:unlit'&&method==='next'){
            if(args[0]?.data&&args[0].width>0&&args[0].height>0){workerPixelsDelivered=true;p.protocol.workerPixelDeliveries++;}
            else p.protocol.invalidPixelDeliveries++;
          }}
      }
      const started=performance.now(),previous=p.currentStep;p.currentStep={label,method,workerPixelsDelivered};
      try{if(typeof iterator[method]!=='function'){if(method==='throw')throw args[0];return {done:true,value:args[0]};}
        const result=iterator[method](...args);awaitsPromise=!result.done&&Boolean(result.value&&typeof result.value.then==='function');return result;
      }finally{p.currentStep=previous;if(p.active)record(p.steps,label||'iterator',performance.now()-started,{method});}
    };
    return {next(...args){return invoke('next',args);},throw(...args){return invoke('throw',args);},return(...args){return invoke('return',args);},[Symbol.iterator](){return this;}};
  };
  p.install=()=>{const owner=nativeDamageArtPreparation;
    // Diagnostic wrappers must preserve both sides of the generator protocol:
    // fulfilled promises resume through next(value), rejected ones through throw.
    const value={},error=Error('diagnostic iterator forwarding check'),pause={then(){}};
    const checked=wrapIterator((function*(){try{if((yield pause)!==value)throw Error('Diagnostic dropped a resumed value');yield pause;}catch(caught){if(caught!==error)throw caught;return value;}})(),'self-check');
    if(checked.next().value!==pause||checked.next(value).value!==pause)throw Error('Diagnostic next forwarding failed');
    const result=checked.throw(error);if(!result.done||result.value!==value)throw Error('Diagnostic throw forwarding failed');p.protocol.selfCheck=true;
    window.nativeDamageArtPreparation={...owner,run(iterator,options){
    return owner.run(wrapIterator(iterator,options?.label),options);
  }};};
}"""
PROBE = r"""async ({type,stage}) => {
  const p=__artProbe,wait=()=>new Promise(resolve=>setTimeout(resolve,8));
  const settle=performance.now()+60000;
  while(nativeShipEffects.metrics().pending||nativeDamageArtPreparation.snapshot().pending){if(performance.now()>settle)throw Error('Initial preparation did not settle');await wait();}
  p.install();nativeDamageArtPreparation.resetMetrics();p.active=true;
  const started=performance.now();let firstAppearanceMs=null,finished=false;
  const promise=nativeShipEffects.prepare(type,'civilian',{stage});
  promise.finally(()=>finished=true);
  while(!finished){if(firstAppearanceMs===null&&nativeShipEffects.ready(type,'civilian'))firstAppearanceMs=performance.now()-started;await wait();if(performance.now()-started>120000)throw Error('Full preparation timed out');}
  const complete=await promise,ended=performance.now(),optionalReadyMs=ended-started;p.active=false;
  for(const entry of p.observer?.takeRecords?.()||[])p.longTasks.push({start:entry.startTime,ms:entry.duration});
  if(!complete?.optionalReady)throw Error('Explicit prepare did not provide optional readiness');
  if(!p.protocol.selfCheck||p.protocol.invalidPixelDeliveries||p.protocol.unlightingMainReadsAfterWorkerDelivery)throw Error('Diagnostic iterator changed worker-readback behavior: '+JSON.stringify(p.protocol));
  const readback=nativeDamageArtPreparation.snapshot().readback;
  if(readback?.completed&&p.protocol.workerPixelDeliveries!==readback.completed)throw Error('Worker pixels were not delivered through the diagnostic wrapper: '+JSON.stringify({readback,protocol:p.protocol}));
  return {type,stage,firstAssetAvailableMs:firstAppearanceMs,optionalReadyMs,native:p.native,asynchronous:p.asynchronous,iterator:p.steps,slow:p.slow,canvasAllocations:p.canvases,
    protocol:p.protocol,queue:nativeDamageArtPreparation.snapshot(),longTasks:p.longTasks.filter(row=>row.start>=started&&row.start<ended),loader:vexedFlightAssets.cacheSnapshot().preparation,effects:nativeShipEffects.metrics()};
}"""
GALLERY = r"""async ({types}) => {
  // This is each served checkout's own loading/rendering path. No reference
  // kernels are substituted, and screenshots are outside the timed probes.
  const width=types.length*250,height=700,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const g=canvas.getContext('2d');g.fillStyle='#070b12';g.fillRect(0,0,width,height);g.fillStyle='#d7e7ef';g.font='15px sans-serif';
  g.fillText('Actual checkout rendering: shared ship sizes, lighting and damage - time 1350 ms',20,25);
  const elements=[];
  for(const [row,fraction]of [1,.4,.1].entries())for(const [column,type]of types.entries()){
    const definition=nativeShipDefinitions.get(type),dimensions=nativeShipDefinitions.presentation(type),asset=await vexedFlightAssets.loadShip(type,definition.hull*fraction);
    const x=125+column*250,y=125+row*220,heading=column*.43+row*.29;
    vexedFlightAssets.drawShip(g,asset,x,y,dimensions.width,heading,1350,{height:dimensions.height,light:{x:30,y:30,color:0xffdb9e},effectRate:60});
    g.fillText((definition.name||String(type))+' / stage '+asset.damageStage,x-100,y+85);
    elements.push({type,name:definition.name,stage:asset.damageStage,x,y,heading,width:dimensions.width,height:dimensions.height});
  }
  return {dataUrl:canvas.toDataURL('image/png'),width,height,timeMs:1350,elements,cache:nativeShipSpriteCache.snapshot()};
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=ROOT)
    parser.add_argument('--label', required=True)
    parser.add_argument('--types', default='35,49,59,44,55,50')
    parser.add_argument('--stages', default='0,2')
    parser.add_argument('--gallery', action='store_true', help='Also capture the actual served checkout renderer after timed probes')
    parser.add_argument('--gallery-only', action='store_true', help='Capture actual checkout artwork without timing preparation')
    parser.add_argument('--gallery-types', default='35,49,58,50,59,55')
    args = parser.parse_args()
    source = args.source_root.resolve()
    output = ROOT/'test-results'/'art-preparation'
    output.mkdir(parents=True, exist_ok=True)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            try:
                super().do_GET()
            except (ConnectionResetError, BrokenPipeError):
                # Closing an isolated probe may cancel an unrelated image load.
                # A cancelled HTTP transfer is not an artwork/page failure.
                pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(source)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    result = {'label': args.label, 'sourceRoot': str(source), 'viewport': {'width': 1280, 'height': 850}, 'diagnosticOnly': True,
              'instrumentationVersion': '2-preserve-generator-resumption',
              'harnessSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'notes': ['No world RAF, physics or ordinary drawing runs in this isolated preparation probe.',
                        'Native API and iterator timings overlap and must not be added together.',
                        'First asset availability is not a delivered gameplay paint or evidence of a whole-game freeze.',
                        'Optional gallery uses the served checkout artwork and renderer without substituted reference kernels and is outside timed probes.'],
              'sourceHashes': {str(p.relative_to(source)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
                               for p in sorted((source/'html-games/flashtrek-broken-mirror').glob('*.js'))}, 'probes': []}
    for name in ['ship-sprite-cache.js', 'ship-definitions.js', 'flight-assets.js', 'ship-effects.js']:
        path = source/'html-games'/'broken-mirror-port'/name
        result['sourceHashes'][str(path.relative_to(source)).replace('\\', '/')] = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        with sync_playwright() as playwright:
            channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
            browser = playwright.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
            result.update(browserVersion=browser.version, channel=channel)
            result['browserSystemInfo'] = browser.new_browser_cdp_session().send('SystemInfo.getInfo')
            errors = []
            for ship_type in ([] if args.gallery_only else map(int, args.types.split(','))):
                for stage in map(int, args.stages.split(',')):
                    page = browser.new_page(viewport=result['viewport'])
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.add_init_script('('+INSTRUMENT+')()')
                    page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                    page.wait_for_function('()=>window.nativeShipEffects && window.nativeShipDefinitions && window.vexedFlightAssets && window.nativeDamageArtPreparation', timeout=120000)
                    probe = page.evaluate(PROBE, {'type': ship_type, 'stage': stage})
                    result['probes'].append(probe)
                    print(json.dumps({'type': ship_type, 'stage': stage, 'optionalReadyMs': probe['optionalReadyMs'],
                                      'maxSliceMs': probe['queue']['maxSliceMs'], 'maxNative': max((r['maxMs'] for r in probe['native'].values()), default=0)}), flush=True)
                    page.close()
            if args.gallery or args.gallery_only:
                page = browser.new_page(viewport=result['viewport'])
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.add_init_script('('+INSTRUMENT+')()')
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>window.nativeShipSpriteCache && window.nativeShipDefinitions && window.vexedFlightAssets', timeout=120000)
                gallery = page.evaluate(GALLERY, {'types': list(map(int, args.gallery_types.split(',')))})
                encoded = gallery.pop('dataUrl').split(',', 1)[1]
                gallery_path = output/f'{args.label}-actual-checkout-gallery.png'
                gallery_path.write_bytes(base64.b64decode(encoded))
                result['gallery'] = {**gallery, 'path': str(gallery_path)}
                page.close()
            result['errors'] = errors
            browser.close()
            if errors:
                raise AssertionError(errors)
    finally:
        server.shutdown()
        (output/f'{args.label}.json').write_text(json.dumps(result, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
