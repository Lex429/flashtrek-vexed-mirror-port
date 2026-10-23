"""Matched retained-GPU shield comparison. Ship lighting OFF; never battle FPS."""
import argparse
import ctypes
from ctypes import wintypes
import functools
import hashlib
import http.server
import json
import math
import os
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CORE = 'html-games/flashtrek-broken-mirror/shield-gpu.js'
LIVE = 'html-games/flashtrek-broken-mirror/shield-gpu-live.js'
MEASURE = r'''async({seconds,offset=5000})=>{
 const p=shieldGPUReplay,frames=[];let start;
 await new Promise((resolve,reject)=>{function frame(ts){try{
  start??=ts;if(document.visibilityState!=='visible')throw Error('Hidden measurement');
  const before=performance.now(),row=p.paint(offset+ts-start,true),drawMs=performance.now()-before;
  if(row.visible!==100||row.fullyVisible!==100||row.fullyActive!==100||row.drawCalls!==3)
    throw Error('Visible/active/batch requirement failed: '+JSON.stringify(row));
  frames.push({ts,drawMs,...row});
  if(ts-start>=seconds*1000)resolve();else requestAnimationFrame(frame);
 }catch(error){reject(error);}}requestAnimationFrame(frame);});return frames;
}'''
GPU = r'''async()=>{
 const p=shieldGPUReplay,g=p.renderer.gl,e=g.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!e)return {supported:false};
 const pending=[],samples=[];let start,disjoint=0;
 await new Promise(resolve=>{function frame(t){start??=t;
  for(let i=pending.length-1;i>=0;i--){const q=pending[i];
   if(g.getQueryParameter(q,g.QUERY_RESULT_AVAILABLE)){
    if(g.getParameter(e.GPU_DISJOINT_EXT))disjoint++;else samples.push(g.getQueryParameter(q,g.QUERY_RESULT)/1e6);
    g.deleteQuery(q);pending.splice(i,1);
   }}
  if(pending.length<8){const q=g.createQuery();g.beginQuery(e.TIME_ELAPSED_EXT,q);
   p.paint(5000+t-start,true);g.endQuery(e.TIME_ELAPSED_EXT);pending.push(q);
  }else p.paint(5000+t-start,true);
  if(t-start<5000)requestAnimationFrame(frame);else resolve();
 }requestAnimationFrame(frame);});
 for(const q of pending)g.deleteQuery(q);
 return {supported:true,samplesMs:samples,disjointSkipped:disjoint,scope:'Complete 100-ship scene, not shields alone'};
}'''

def stats(values):
    ordered=sorted(values)
    return {'meanMs':sum(values)/len(values),'p95Ms':ordered[math.ceil(.95*len(ordered))-1],
            'p99Ms':ordered[math.ceil(.99*len(ordered))-1],'worstMs':max(values),
            'over50':sum(v>50 for v in values),'samples':len(values)}

def summarize(frames):
    intervals=[b['ts']-a['ts'] for a,b in zip(frames,frames[1:])]
    return {**stats(intervals),'fps':1000*len(intervals)/sum(intervals),
            'over8_333':sum(v>1000/120+.001 for v in intervals),
            'meanJsDrawMs':sum(f['drawMs'] for f in frames)/len(frames),
            'minVisible':min(f['visible'] for f in frames),'minFullyVisible':min(f['fullyVisible'] for f in frames),
            'minActive':min(f['active'] for f in frames),'minFullyActive':min(f['fullyActive'] for f in frames),
            'maxDrawCalls':max(f['drawCalls'] for f in frames)}

def memory(browser,page):
    session=page.context.new_cdp_session(page)
    result={'heap':session.send('Runtime.getHeapUsage')};session.detach()
    session=browser.new_browser_cdp_session()
    processes=session.send('SystemInfo.getProcessInfo')['processInfo'];session.detach()
    if os.name=='nt':
        class Counters(ctypes.Structure):
            _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(k,ctypes.c_size_t) for k in
              ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage',
               'QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage','PrivateUsage']]
        kernel=ctypes.WinDLL('kernel32',use_last_error=True);psapi=ctypes.WinDLL('psapi',use_last_error=True)
        kernel.OpenProcess.restype=wintypes.HANDLE;kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
        kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
        rows=[]
        for process in processes:
            handle=kernel.OpenProcess(0x410,False,process['id'])
            if not handle:continue
            try:
                c=Counters();c.cb=ctypes.sizeof(c)
                if psapi.GetProcessMemoryInfo(handle,ctypes.byref(c),c.cb):
                    rows.append({'pid':process['id'],'type':process['type'],'workingSetBytes':c.WorkingSetSize,'privateCommitBytes':c.PrivateUsage})
            finally:kernel.CloseHandle(handle)
        result.update(processes=rows,workingSetBytes=sum(p['workingSetBytes'] for p in rows),
                      privateCommitBytes=sum(p['privateCommitBytes'] for p in rows))
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--phase',choices=['measure','gpu','capture'],required=True)
    parser.add_argument('--headed',action='store_true')
    parser.add_argument('--reverse-order',action='store_true',help='Reverse the paired order for an independent confirmation block')
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    baseline=args.baseline.resolve()
    frozen={CORE:(ROOT/CORE).read_bytes(),LIVE:(ROOT/LIVE).read_bytes()}
    for name in ['index.html','replay.js','ships.js']:
        frozen['demos/shield-gpu/'+name]=(baseline/name).read_bytes()
        assert (baseline/name).read_bytes()==(ROOT/'demos/shield-gpu'/name).read_bytes(),'Replay changed'
    assert (baseline/'shield-gpu-live.js').read_bytes()==frozen[LIVE],'Live adapter changed'
    versions={'baseline':(baseline/'shield-gpu.js').read_bytes(),'polished':frozen[CORE]}
    for variant,body in versions.items():(out/(variant+'-shield-gpu.js')).write_bytes(body)
    for name,body in frozen.items():
        if name!=CORE:(out/Path(name).name).write_bytes(body)
    report={'phase':args.phase,'lighting':'OFF','scope':'100 fully visible ships; all 100 shields active; scripted renderer replay',
            'viewport':[1280,850],'dpr':1,'headless':not args.headed,'warmSeconds':3,'measurementSeconds':20,
            'sourceSHA256':{v:hashlib.sha256(b).hexdigest() for v,b in versions.items()},
            'sharedSourceSHA256':{n:hashlib.sha256(b).hexdigest() for n,b in frozen.items() if n!=CORE},'runs':[]}
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    def write():(out/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    try:
      with sync_playwright() as p:
        order=[(v,i+1) for i in range(3) for v in (['baseline','polished'] if i%2==0 else ['polished','baseline'])]
        if args.reverse_order:order=[('polished' if v=='baseline' else 'baseline',i) for v,i in order]
        report['order']=order
        if args.phase=='capture':order=[('baseline',1),('polished',1)]
        for variant,run in order:
          print(args.phase,variant,run,'setup',flush=True)
          channel=os.environ.get('BROWSER_CHANNEL','msedge')
          browser=p.chromium.launch(headless=not args.headed,**({'channel':channel} if channel else {}))
          report['browser']=browser.version
          if 'graphics' not in report:
              session=browser.new_browser_cdp_session();report['graphics']=session.send('SystemInfo.getInfo');session.detach()
          page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1,accept_downloads=True)
          errors=[];page.on('pageerror',lambda error:errors.append(str(error)));page.set_default_timeout(120000)
          for name,body in {**frozen,CORE:versions[variant]}.items():
              page.route('**/'+name,lambda route,request,body=body:route.fulfill(status=200,body=body,
                         content_type='text/html' if request.url.endswith('.html') else 'text/javascript'))
          page.goto(f'http://127.0.0.1:{server.server_port}/demos/shield-gpu/index.html')
          page.wait_for_function("()=>/^(Ready|Failed)/.test(document.querySelector('#status').textContent)")
          assert page.locator('#status').inner_text().startswith('Ready'),page.locator('#status').inner_text()
          page.evaluate("document.body.classList.add('timing')")
          report['environment']=page.evaluate('shieldGPUReplay.renderer.environment')
          if 'replaySHA256' not in report:
              for name in ['fleet','sequence']:
                  text=page.evaluate('(name)=>JSON.stringify(shieldGPUReplay[name])',name)
                  (out/(name+'.json')).write_text(text,encoding='utf-8')
                  report[name+'SHA256']=hashlib.sha256(text.encode()).hexdigest()
          page.evaluate(MEASURE,{'seconds':3,'offset':0})
          if args.phase=='measure':
              before=memory(browser,page);resourceBefore=page.evaluate('shieldGPUReplay.renderer.snapshot()')
              frames=page.evaluate(MEASURE,{'seconds':20})
              row={'variant':variant,'run':run,**summarize(frames),'memoryBefore':before,'memoryAfter':memory(browser,page),
                   'resourcesBefore':resourceBefore,'resourcesAfter':page.evaluate('shieldGPUReplay.renderer.snapshot()')}
              (out/f'{variant}-{run}-raw.json').write_text(json.dumps(frames))
              for key in ['textureBytes','bufferBytes','instanceBytes','textureUploads','nominalDrawingBufferBytes']:
                  assert row['resourcesBefore'][key]==row['resourcesAfter'][key],key
              report['runs'].append(row)
              print(json.dumps({k:row[k] for k in ['variant','run','fps','meanMs','p95Ms','p99Ms','worstMs','over50','minFullyVisible','minActive']}),flush=True)
          elif args.phase=='gpu':
              result=page.evaluate(GPU)
              row={'variant':variant,'run':run,**result}
              if result['supported']:row['summary']=stats(result['samplesMs'])
              report['runs'].append(row);print(json.dumps({k:v for k,v in row.items() if k!='samplesMs'}),flush=True)
          else:
              for time in [5000,5060,5160,5350]:
                  page.evaluate('(t)=>shieldGPUReplay.paint(t,true)',time)
                  page.locator('#gpu').screenshot(path=str(out/f'{variant}-100-{time}.png'))
              # Fixed single-ship examples make the contact and fading phases inspectable.
              page.evaluate('''()=>{const p=shieldGPUReplay,r={...p.fleet[0],x:640,y:425,angle:.35,motion:0};
                window.__polishShip=r;p.renderer.setFleet([r]);p.renderer.hit(0,{x:r.rx,y:0,born:0,strength:1});}''')
              for time in [0,40,75,150,300,440,650,899]:
                  page.evaluate('(t)=>shieldGPUReplay.renderer.render(t,{effects:true})',time)
                  page.locator('#gpu').screenshot(path=str(out/f'{variant}-single-{time}.png'))
              page.evaluate('shieldGPUReplay.reset()')
              page.evaluate('''()=>{const p=shieldGPUReplay,stream=p.canvas.captureStream(60),chunks=[],r=new MediaRecorder(stream,{mimeType:'video/webm'});
                window.__recordDone=false;r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
                r.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));a.download='shield.webm';a.click();__recordDone=true;};
                let start;r.start();function frame(t){start??=t;p.paint(5000+t-start,true);if(t-start<5000)requestAnimationFrame(frame);else r.stop();}requestAnimationFrame(frame);
              }''')
              with page.expect_download(timeout=20000) as download:page.wait_for_function('()=>__recordDone')
              download.value.save_as(out/(variant+'-100.webm'))
              report['runs'].append({'variant':variant,'recording':'5-second requested 60-FPS capture; outside timing'})
          assert not errors,errors;write();browser.close()
        report['complete']=True
    except BaseException as error:report['error']=repr(error);raise
    finally:write();server.shutdown()

if __name__=='__main__':main()
