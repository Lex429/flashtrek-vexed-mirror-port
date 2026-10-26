"""Cinematic candidate: hull illumination, camera flares, weapon response and sparks."""
import base64,functools,json,os,sys,tempfile,threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',Path(__file__).resolve().parents[1]));sys.path.insert(0,str(ROOT/'tools'))
from local_site import Handler
OUTPUT=ROOT/'test-results/cinematic-battle';OUTPUT.mkdir(parents=True,exist_ok=True)
CHECK=r'''async()=>{
 const host=document.createElement('div'),space=document.createElement('canvas');space.width=640;space.height=320;host.append(space);document.body.append(host);
 const ctx=space.getContext('2d'),api=await createVexedShieldPresentation({space,radii:()=>({rx:80,ry:100})}),gl=api.renderer.gl;
 const art=document.createElement('canvas');art.width=100;art.height=120;const g=art.getContext('2d');g.fillStyle='#999';g.fillRect(10,10,80,100);
 const asset={art},entity={},d={entity,id:'test',heading:-Math.PI/2,definition:{shields:100},dimensions:{width:100,height:120}};
 const shot={kind:'beam',color:0xffa632,thickness:3,units:.91976,zoom:1,age:85,duration:180,seed:.37,x1:60,y1:145,x2:320,y2:145,x:320,y:145,angle:.7};
 function read({s=null,surface=false,flash=null,hit=null,transform=null,particle=null,particles=null,close=false,time=1085}={}){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#020710';ctx.fillRect(0,0,640,320);api.beginFrame(ctx);
  if(transform)ctx.setTransform(...transform);
  if(surface){ctx.save();ctx.translate(320,160);nativeEffectProfiles.queueShipSurface(ctx,asset,100,120);ctx.restore();}
  if(s)nativeEffectProfiles.queueWeapon(ctx,s);
  if(hit)nativeEffectProfiles.queueImpact(ctx,hit);
  if(flash)api.submit(ctx,d,{x:320,y:160,zoom:1,dimensions:d.dimensions},flash,time,{front:true});
  if(close)ctx.setTransform(3,0,0,3,-640,-320);
  for(const p of particles||[particle])if(p)nativeEffectProfiles.drawHullParticle(()=>{throw Error('Unexpected fallback');},ctx,p,time);
  api.endFrame(ctx,time);const bytes=new Uint8Array(640*320*4);gl.readPixels(0,0,640,320,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
 }
 const hash=b=>{let h=2166136261;for(const x of b)h=Math.imul(h^x,16777619)>>>0;return h;};
 const energy=(b,x,y,r=2)=>{let n=0;for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){const k=((319-y-j)*640+x+i)*4;n+=b[k]+b[k+1]+b[k+2];}return n;};
 const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>6)n++;return n;};
 const gallery=document.createElement('canvas');gallery.width=640;gallery.height=1280;const out=gallery.getContext('2d');out.fillStyle='#020710';out.fillRect(0,0,640,1280);
 const unlit=read({s:shot}),lit=read({s:shot,surface:true});
 if(energy(lit,320,185)<=energy(unlit,320,185)+100)throw Error('Beam does not illuminate the nearby hull');
 if(energy(lit,265,185)!==energy(unlit,265,185))throw Error('Radiance leaks outside artwork alpha');
 const radiance=api.snapshot().resources;out.drawImage(api.canvas,0,0);
 for(const [i,kind] of ['torpedo','disruptor'].entries()){
  const s={...shot,kind},a=read({s}),same=read({s});if(hash(a)!==hash(same))throw Error('Lens flare changes while paused');
  if(energy(a,340,145)<20)throw Error('Missing horizontal '+kind+' lens streak');
  out.drawImage(api.canvas,0,(i+1)*320);
 }
 const particles=[];nativeEffectProfiles.emitHullBurst(()=>{throw Error('Old burst');},particles,{x:320,y:160,normal:{x:1,y:0},damage:20,capacity:100},1000,1,1,1);
 if(particles.length>18||particles.length<10)throw Error('Hull burst budget');
 const p=particles.find(p=>p.kind==='spark'),before=JSON.stringify(p),a=read({particle:p}),same=read({particle:p});
 if(JSON.stringify(p)!==before||hash(a)!==hash(same))throw Error('Painting advances sparks');
 const whole={...p},split={...p};nativeEffectProfiles.updateHullParticle(()=>{},whole,.12);
 for(let i=0;i<12;i++)nativeEffectProfiles.updateHullParticle(()=>{},split,.01);
 if(Math.hypot(whole.x-split.x,whole.y-split.y)>1e-8||whole.x<=p.x)throw Error('Sparks do not integrate consistently outward');
 const fresh=read({particle:p,time:1005,close:true});
 if(energy(fresh,320,160,10)<20)throw Error('Hull spark is invisible');
 const normal=read({particle:p,time:1005});
 if(energy(normal,320,160,10)<100)throw Error('Hull spark is invisible at normal zoom');
 const spray=particles.map(p=>({...p}));for(const p of spray)nativeEffectProfiles.updateHullParticle(()=>{},p,.045);
 read({particles:spray,time:1045,close:true});out.drawImage(api.canvas,0,960);
 api.reset();const flash={born:1000,x:80,y:0,charge:.8,absorbed:20,shieldCapacity:100,kind:'beam'};
 const beam=read({flash,time:1100});api.reset();const torpedo=read({flash:{...flash,kind:'torpedo'},time:1100});
 if(api.snapshot().resources.activeImpactFlares!==1)throw Error('Actual shield contact did not enqueue a hit lens flare');
 if(diff(beam,torpedo)<100)throw Error('Weapon shield responses are indistinguishable');
 api.reset();const weak=read({flash:{...flash,absorbed:1},time:1100});api.reset();const strong=read({flash:{...flash,absorbed:90},time:1100});
 if(diff(weak,strong)<100)throw Error('Shield response ignores absorbed energy');
 const angle=.35,scale=1.2,m=[Math.cos(angle)*scale,Math.sin(angle)*scale,-Math.sin(angle)*scale,Math.cos(angle)*scale,15,-45];
 const hit={x:400,y:160,kind:'torpedo',strength:1.4,color:0xffa632,age:25};
 const flare=read({hit,transform:m}),fx=Math.round(m[0]*hit.x+m[2]*hit.y+m[4]),fy=Math.round(m[1]*hit.x+m[3]*hit.y+m[5]);
 if(energy(flare,fx,fy)<1000)throw Error('Lens flare lost its transformed contact point');
 if(energy(flare,fx+17,fy)<=energy(flare,fx+17,fy-6))throw Error('Hit lens streak follows ship rotation instead of the camera');
 if(hash(flare)!==hash(read({hit,transform:m})))throw Error('Hit lens flare changes while paused');
 read({hit:{...hit,age:300}});if(api.snapshot().resources.activeImpactFlares)throw Error('Hit lens flare failed to expire');
 read({hit:{...hit,age:-10}});if(api.snapshot().resources.activeImpactFlares)throw Error('Lens flare appeared before the actual hit');
 const resources=api.snapshot().resources;if(resources.primitiveRejected||gl.getError()!==gl.NO_ERROR)throw Error('GPU rejection or GL error');
 read();if(api.snapshot().resources.activeWeaponPrimitives||api.snapshot().resources.radianceInstances)throw Error('Stale effect packets');
 api.destroy();host.remove();return {radiance,resources,shieldKindPixels:diff(beam,torpedo),shieldEnergyPixels:diff(weak,strong),particles:particles.length,image:gallery.toDataURL()};
}'''
with tempfile.TemporaryDirectory(prefix='vexed-battle-qa-') as state:
 server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));server.state=Path(state)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe')
   page=browser.new_page(viewport={'width':1440,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=6')
   page.wait_for_function('showcaseShields.snapshot().ready || showcaseShields.snapshot().error',timeout=90000)
   assert page.evaluate('showcaseShields.snapshot().ready'),page.evaluate('showcaseShields.snapshot().error')
   assert page.evaluate('nativeEffectProfiles.current().implementation')=='cinematic-battle-v2'
   page.locator('#pause').click();result=page.evaluate(CHECK)
   (OUTPUT/'materials.png').write_bytes(base64.b64decode(result.pop('image').split(',')[1]))
   before=page.evaluate('nativeEffectProfiles.metrics().hullEvents')
   page.evaluate('''()=>{const original=showcaseHullBurst;window.__sparkPaints=[];window.showcaseHullBurst={...original,draw(ctx,p,time){
     if(p.kind==='spark'){const m=ctx.getTransform();__sparkPaints.push({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f,age:time-p.born});if(__sparkPaints.length>100)__sparkPaints.shift();}
     return original.draw(ctx,p,time);}};
     const adapter=showcaseShields;window.showcaseShields={...adapter,begin(ctx){__sparkPaints=[];adapter.begin(ctx);},end(ctx,time){adapter.end(ctx,time);
      const gl=document.getElementById('showcase-gpu-shields').getContext('webgl2'),last=__sparkPaints.slice(-8);let bright=0;
      if(last.length){const b=new Uint8Array(gl.canvas.width*gl.canvas.height*4);gl.readPixels(0,0,gl.canvas.width,gl.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,b);
       for(const p of last){let max=0;for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){const i=((gl.canvas.height-1-Math.round(p.y)+y)*gl.canvas.width+Math.round(p.x)+x)*4;max=Math.max(max,b[i]+b[i+1]);}if(max>150)bright++;}}
      window.__visibleSparks={bright,samples:last.length,ages:last.map(p=>p.age)};
      if(last.length&&last[0].age>=70&&!showcaseState().paused)queueMicrotask(()=>document.getElementById('pause').click());
     }};}''')
   page.locator('#pause').click()
   page.locator('#test-hull-hit').click()
   page.wait_for_function('(before)=>nativeEffectProfiles.metrics().hullEvents>before && showcaseState().combat.lastHit?.hullDamage>0',arg=before)
   page.wait_for_function('showcaseState().paused')
   actual=page.evaluate('({state:showcaseState(),metrics:nativeEffectProfiles.metrics(),resources:showcaseShields.snapshot().presentation.resources})')
   assert not actual['state']['shieldsEnabled'] and actual['state']['particles']>=10,actual['state']
   assert actual['resources']['gpuHullPaints']>0
   visible=page.evaluate('__visibleSparks')
   assert visible['bright']>=4,visible
   result['actualVisibleSparks']=visible
   page.screenshot(path=str(OUTPUT/'actual-hull-hit.png'))
   result['actualHullHit']=actual
   assert not errors,errors
   (OUTPUT/'visual.json').write_text(json.dumps(result,indent=2),encoding='utf-8');browser.close()
   print('Hull-masked weapon lighting, camera flares, paused sparks, analytic motion, weapon/energy shield response and disposal passed.')
 finally:server.shutdown();server.server_close()
