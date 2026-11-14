"""Original star pixels versus ordered batching; optional isolated timing, not game FPS."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/starfield-batch'
FILES=['world-data.js','manual-flight.js','flight-reference-data.js','vexed-space-model.js','starfield-batch.js','regional-starfield.js']

CHECK=r'''async () => {
  const rows=[],images=[];let coldSubmissionMs=null,previousExactCases=0;
  const currentBatch=window.nativeStarfieldBatch;
  const make=(scale,background)=>{
    const c=document.createElement('canvas');c.width=1366;c.height=768;
    const g=c.getContext('2d',{willReadFrequently:true});g.scale(scale,scale);
    if(background){g.fillStyle=background;g.fillRect(0,0,1366/scale,768/scale);}return g;
  };
  const compare=(a,b)=>{
    const x=a.getImageData(0,0,1366,768).data,y=b.getImageData(0,0,1366,768).data;
    let max=0,alphaMax=0,error=0,energy=0;
    for(let i=0;i<x.length;i+=4){alphaMax=Math.max(alphaMax,Math.abs(x[i+3]-y[i+3]));
      for(let c=0;c<3;c++){const p=x[i+c]*x[i+3]/255,q=y[i+c]*y[i+3]/255,d=Math.abs(p-q);max=Math.max(max,d);error+=d;energy+=p;}}
    return {maxPremultipliedError:max,maxAlphaError:alphaMax,relativeError:error/Math.max(1,energy)};
  };
  for(const scale of [1,1.5,2])for(const system of [1,25,58,31,38,73])for(const speed of [0,450])for(const background of ['#000','#14253e',null]){
    const a=make(scale,background),b=make(scale,background),model=vexedSpaceModel.create(system);
    for(let i=0;i<120;i++)model.update(1/60,{speed,locx:-speed/13,locy:-speed/29,maxSpeed:450,courseLocked:true});
    const view={w:1366/scale,h:768/scale,playerX:0,playerY:0},saved=JSON.stringify(model.state);
    const reference=referenceRegionalStarfield.create(),field=nativeRegionalStarfield.create({renderer:'batch'});
    reference.render(a,view,model.state);const started=performance.now();field.render(b,view,model.state);
    if(coldSubmissionMs===null)coldSubmissionMs=performance.now()-started;
    const row={system,scale,speed,background,...compare(a,b),metrics:field.metrics()};rows.push(row);
    if(row.metrics.renderer!=='webgl2'||row.metrics.batchDraws!==1)throw Error('No real batch: '+JSON.stringify(row));
    if(row.maxPremultipliedError>3||row.maxAlphaError>3)throw Error('Original star pixels changed: '+JSON.stringify(row));
    if(window.previousRegionalStarfield){
      const p=make(scale,background),previous=previousRegionalStarfield.create({renderer:'batch'});
      window.nativeStarfieldBatch=previousStarfieldBatch;
      try{previous.render(p,view,model.state);}finally{window.nativeStarfieldBatch=currentBatch;}
      const error=compare(p,b);
      if(error.maxPremultipliedError!==0||error.maxAlphaError!==0)throw Error('Previous batched pixels changed: '+JSON.stringify({system,scale,speed,background,error}));
      previousExactCases++;
    }
    if(JSON.stringify(model.state)!==saved)throw Error('Rendering changed simulation');
    if(scale===1.5&&system===25&&background==='#000')images.push({speed,before:a.canvas.toDataURL(),after:b.canvas.toDataURL()});
  }
  let transitionExactCases=0;
  if(window.previousRegionalStarfield){
    const a=make(1.5,'#000'),b=make(1.5,'#000'),previous=previousRegionalStarfield.create({renderer:'batch'}),current=nativeRegionalStarfield.create({renderer:'batch'});
    for(const system of [1,25,73])for(const x of [-40000,-1000,0,1000,40000]){
      const view={w:1366/1.5,h:768/1.5,playerX:x,playerY:x/3},state=vexedSpaceModel.create(system).state;
      for(const ctx of [a,b]){ctx.fillStyle='#000';ctx.fillRect(0,0,view.w,view.h);}
      window.nativeStarfieldBatch=previousStarfieldBatch;
      try{previous.render(a,view,state);}finally{window.nativeStarfieldBatch=currentBatch;}
      current.render(b,view,state);const error=compare(a,b);
      if(error.maxPremultipliedError!==0||error.maxAlphaError!==0)throw Error('Cached regional crossing changed: '+JSON.stringify({system,x,error}));
      transitionExactCases++;
    }
  }
  const ctx=make(1,'#000'),view={w:1366,h:768,playerX:0,playerY:0},field=nativeRegionalStarfield.create({renderer:'batch'}),model=vexedSpaceModel.create(1);
  model.update(6,{speed:200,locx:-200/13,locy:0,maxSpeed:450,courseLocked:true});
  const origin=nativeManualFlight.chartPosition(1),target=nativeManualFlight.chartPosition(4);
  const capture=(v,state)=>{ctx.clearRect(0,0,1366,768);field.render(ctx,v,state);return ctx.getImageData(0,0,1366,768).data;};
  const old=capture({...view,playerX:(target.x-origin.x)*1000,playerY:(target.y-origin.y)*1000},model.state);
  field.rebase(model.state);const next=vexedSpaceModel.create(4).state,rebased=capture(view,next),paused=capture({...view,heading:2},next);
  if(!old.every((n,i)=>n===rebased[i])||!rebased.every((n,i)=>n===paused[i]))throw Error('Pause or rebase popped stars');
  const uploads=nativeStarfieldBatch.snapshot().uploads;
  for(const destination of VexedMirrorWorld.systems)field.render(ctx,view,vexedSpaceModel.create(destination.id).state);
  if(nativeStarfieldBatch.snapshot().uploads!==uploads)throw Error('Travel reuploaded atlas');
  for(const [w,h] of [[360,780],[1920,1080],[1366,768]]){
    const c=document.createElement('canvas');c.width=w;c.height=h;
    field.render(c.getContext('2d'),{...view,w,h},next);
    if(field.metrics().renderer!=='webgl2'||nativeStarfieldBatch.snapshot().framebufferBytes!==w*h*4)throw Error('Resized batch failed');
  }
  if(nativeStarfieldBatch.snapshot().uploads!==uploads)throw Error('Resize reuploaded atlas');
  const transformField=nativeRegionalStarfield.create({renderer:'batch'}),transformReference=referenceRegionalStarfield.create();
  for(const [x,y] of [[.25,.75],[35,-20],[0,0]]){
    const a=make(1,'#000'),b=make(1,'#000');a.translate(x,y);b.translate(x,y);
    transformReference.render(a,view,next);transformField.render(b,view,next);
    if(compare(a,b).maxPremultipliedError>3)throw Error('Changed transform was not uploaded');
  }
  const ext=__starGL.getExtension('WEBGL_lose_context');
  if(!ext)throw Error('Cannot exercise context loss');
  ext.loseContext();await new Promise(resolve=>setTimeout(resolve,100));
  const a=make(1,'#000'),b=make(1,'#000'),fallback=nativeRegionalStarfield.create({renderer:'batch'});
  referenceRegionalStarfield.create().render(a,view,next);fallback.render(b,view,next);
  if(fallback.metrics().renderer!=='canvas'||compare(a,b).maxPremultipliedError!==0)throw Error('Context loss did not preserve original drawing');
  ext.restoreContext();await new Promise(resolve=>setTimeout(resolve,200));field.render(ctx,view,next);
  if(field.metrics().renderer!=='webgl2'||nativeStarfieldBatch.snapshot().uploads!==uploads+1)throw Error('Context restoration failed');
  const oversized=document.createElement('canvas');oversized.width=2500;oversized.height=1700;
  field.render(oversized.getContext('2d'),{...view,w:2500,h:1700},next);
  if(field.metrics().renderer!=='canvas'||nativeStarfieldBatch.snapshot().framebufferBytes>4000000*4)throw Error('Framebuffer cap ignored');
  ctx.imageSmoothingQuality='high';field.render(ctx,view,next);
  if(field.metrics().renderer!=='canvas')throw Error('Changed Canvas sampling was ignored');
  if(__starGL.getError()!==__starGL.NO_ERROR)throw Error('WebGL error');
  return {passed:true,rows,images,coldSubmissionMs,previousExactCases,transitionExactCases,pauseAndRebaseExact:true,atlasReused:true,resizeReused:true,contextLossFallbackExact:true,contextRestored:true,memoryBounded:true,samplingFallback:true,gpu:nativeStarfieldBatch.snapshot()};
}'''

MEASURE=r'''async () => {
  const rows=[],seconds=2;
  for(const system of [1,25])for(const speed of [200,450])for(let run=0;run<3;run++)for(const renderer of (run%2?['batch','canvas']:['canvas','batch'])){
    const c=document.createElement('canvas');c.width=1366;c.height=768;const ctx=c.getContext('2d');ctx.scale(1.5,1.5);
    const view={w:1366/1.5,h:768/1.5,playerX:0,playerY:0},field=nativeRegionalStarfield.create({renderer}),model=vexedSpaceModel.create(system);
    const command={speed,locx:-speed/13,locy:-speed/29,maxSpeed:450,courseLocked:true};
    for(let i=0;i<120;i++)model.update(1/60,command);
    const paint=()=>{ctx.fillStyle='#000';ctx.fillRect(0,0,view.w,view.h);const start=performance.now();field.render(ctx,view,model.state);return performance.now()-start;};
    for(let i=0;i<20;i++)paint();await new Promise(requestAnimationFrame);
    const times=[],frames=[],start=performance.now();let previous=start;
    await new Promise(resolve=>{function frame(at){frames.push(at-previous);previous=at;model.update(1/60,command);times.push(paint());if(performance.now()-start<seconds*1000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
    times.sort((a,b)=>a-b);frames.sort((a,b)=>a-b);
    rows.push({system,speed,run,requested:renderer,actual:field.metrics().renderer,frames:times.length,elapsedMs:performance.now()-start,
      submissionMs:{mean:times.reduce((a,b)=>a+b)/times.length,median:times[Math.floor(times.length/2)],p95:times[Math.floor(times.length*.95)]},
      frameIntervalP95:frames[Math.floor(frames.length*.95)],metrics:field.metrics()});
  }
    return {passed:true,rows,gpu:nativeStarfieldBatch.snapshot(),note:'Isolated starfield submission including presentation; not gameplay FPS or Chromebook qualification.'};
}'''

REFINE_MEASURE=r'''async () => {
  const rows=[],seconds=2,currentBatch=nativeStarfieldBatch;
  const versions=[{name:'original',api:referenceRegionalStarfield,batch:null,renderer:'canvas'},
    {name:'previous',api:previousRegionalStarfield,batch:previousStarfieldBatch,renderer:'batch'},
    {name:'current',api:nativeRegionalStarfield,batch:currentBatch,renderer:'batch'}];
  for(const system of [1,25])for(const speed of [200,450])for(let run=0;run<3;run++)for(let slot=0;slot<3;slot++){
    const version=versions[(slot+run)%3];window.nativeStarfieldBatch=version.batch;
    const c=document.createElement('canvas');c.width=1366;c.height=768;const ctx=c.getContext('2d');ctx.scale(1.5,1.5);
    const view={w:1366/1.5,h:768/1.5,playerX:0,playerY:0},field=version.api.create({renderer:version.renderer}),model=vexedSpaceModel.create(system);
    const command={speed,locx:-speed/13,locy:-speed/29,maxSpeed:450,courseLocked:true};
    for(let i=0;i<120;i++)model.update(1/60,command);
    const paint=()=>{ctx.fillStyle='#000';ctx.fillRect(0,0,view.w,view.h);const start=performance.now();field.render(ctx,view,model.state);return performance.now()-start;};
    for(let i=0;i<20;i++)paint();await new Promise(requestAnimationFrame);
    const times=[],intervals=[],start=performance.now();let previous=start;
    await new Promise(resolve=>{function frame(at){intervals.push(at-previous);previous=at;
      model.update(1/60,command);view.playerX+=speed/60;view.playerY+=speed/120;
      times.push(paint());if(performance.now()-start<seconds*1000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
    times.sort((a,b)=>a-b);intervals.sort((a,b)=>a-b);
    rows.push({system,speed,run,version:version.name,actual:field.metrics().renderer||'canvas',frames:times.length,elapsedMs:performance.now()-start,
      submissionMs:{mean:times.reduce((a,b)=>a+b)/times.length,median:times[Math.floor(times.length/2)],p95:times[Math.floor(times.length*.95)]},
      frameIntervalP95:intervals[Math.floor(intervals.length*.95)],metrics:field.metrics()});
  }
  window.nativeStarfieldBatch=currentBatch;
  return {passed:true,rows,gpu:currentBatch.snapshot(),movingRegionalCoordinates:true,note:'Rotating original/previous/current starfield CPU submission including presentation; not game FPS or Chromebook qualification.'};
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--measure',action='store_true')
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--before-root',type=Path)
    parser.add_argument('--output-dir',type=Path,default=OUT)
    args=parser.parse_args();source=args.source_root.resolve();out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=True)
    hashes={name:hashlib.sha256((source/'html-games/broken-mirror-port'/name).read_bytes()).hexdigest() for name in FILES}
    previous_hashes={name:hashlib.sha256((args.before_root/'html-games/broken-mirror-port'/name).read_bytes()).hexdigest() for name in FILES} if args.before_root else None
    errors=[]
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1366,'height':768});page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content('<!doctype html><title>Original versus batched regional stars</title>')
        page.evaluate('''()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const value=get.call(this,kind,...args);if(kind==='webgl2'&&value&&!window.__starGL)window.__starGL=value;return value;};}''')
        for name in FILES:page.add_script_tag(path=str(source/'html-games/broken-mirror-port'/name))
        if args.before_root:
            for name,old,new in [('starfield-batch.js','window.nativeStarfieldBatch=','window.previousStarfieldBatch='),('regional-starfield.js','window.nativeRegionalStarfield=','window.previousRegionalStarfield=')]:
                page.add_script_tag(content=(args.before_root/'html-games/broken-mirror-port'/name).read_text(encoding='utf8').replace(old,new))
        page.add_script_tag(content=(ROOT/'tests/fixtures/reference-regional-starfield.js').read_text(encoding='utf8').replace('window.nativeRegionalStarfield=','window.referenceRegionalStarfield='))
        result=page.evaluate((REFINE_MEASURE if args.before_root else MEASURE) if args.measure else CHECK)
        if not args.measure:
            fallback=browser.new_page()
            fallback.on('pageerror',lambda e:errors.append(str(e)))
            fallback.set_content('<!doctype html><title>Unavailable WebGL</title>')
            fallback.evaluate('''()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args);};}''')
            for name in FILES:fallback.add_script_tag(path=str(source/'html-games/broken-mirror-port'/name))
            unavailable=fallback.evaluate('''()=>{const c=document.createElement('canvas');c.width=900;c.height=600;const f=nativeRegionalStarfield.create();f.render(c.getContext('2d'),{w:900,h:600},vexedSpaceModel.create(25).state);return f.metrics();}''')
            assert unavailable['renderer']=='canvas' and unavailable['canvasDraws']==unavailable['draws'],unavailable
            result['unavailableWebGLFallback']=True
            fallback.close()
        assert not errors,errors
        for entry in result.pop('images',[]):
            for kind in ['before','after']:(out/f"andorian-{entry['speed']}-{kind}.png").write_bytes(base64.b64decode(entry[kind].split(',',1)[1]))
        result['errors']=errors
        result['sourceHashes']=hashes
        result['previousSourceHashes']=previous_hashes
        result['browserVersion']=browser.version
        assert hashes=={name:hashlib.sha256((source/'html-games/broken-mirror-port'/name).read_bytes()).hexdigest() for name in FILES},'Source changed during measurement'
        if previous_hashes:
            assert previous_hashes=={name:hashlib.sha256((args.before_root/'html-games/broken-mirror-port'/name).read_bytes()).hexdigest() for name in FILES},'Previous source changed during measurement'
        (out/('timing.json' if args.measure else 'pixels.json')).write_text(json.dumps(result,indent=2),encoding='utf8')
        print(json.dumps({'cases':len(result['rows']),'gpu':result['gpu'],'errors':errors,'passed':result.get('passed'),
          'maxPixelError':max((r.get('maxPremultipliedError',0) for r in result['rows']),default=0)}))
        browser.close()

if __name__=='__main__':main()
