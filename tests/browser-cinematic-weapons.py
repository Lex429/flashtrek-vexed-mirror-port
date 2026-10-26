"""Weapon material motion, contact geometry, pause and bounded GPU batches."""
import functools,json,os,sys,tempfile,threading,base64
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',Path(__file__).resolve().parents[1]));sys.path.insert(0,str(ROOT/'tools'))
from local_site import Handler
OUTPUT=ROOT/'test-results/cinematic-weapons';OUTPUT.mkdir(parents=True,exist_ok=True)
PIXELS=r'''async()=>{
 const host=document.createElement('div'),space=document.createElement('canvas');space.width=640;space.height=300;host.append(space);document.body.append(host);
 const ctx=space.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,640,300);
 const api=await createVexedShieldPresentation({space,radii:()=>({rx:20,ry:28})}),gl=api.renderer.gl;
 const shot={kind:'beam',color:0xffa632,thickness:3,units:.91976,zoom:1,age:85,duration:180,seed:.37,x1:80,y1:150,x2:550,y2:150,x:400,y:150,angle:0};
 function read(s){api.beginFrame(ctx);nativeEffectProfiles.drawWeapon(drawShowcaseWeapon,ctx,s);api.endFrame(ctx,1000+s.age);
  const bytes=new Uint8Array(640*300*4);gl.readPixels(0,0,640,300,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;}
 const hash=b=>{let h=2166136261;for(const x of b)h=Math.imul(h^x,16777619)>>>0;return h;};
 const different=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)n++;return n;};
 const bright=(b,x,y)=>{let n=0;for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const k=((299-y-j)*640+x+i)*4;n+=b[k]+b[k+1]+b[k+2];}return n;};
 const result={},gallery=document.createElement('canvas');gallery.width=640;gallery.height=900;const out=gallery.getContext('2d');out.fillStyle='#020710';out.fillRect(0,0,640,900);
 const before=JSON.stringify(shot);
 for(const [i,kind] of ['beam','torpedo','disruptor'].entries()){
  const s={...shot,kind,duration:kind==='beam'?180:560},a=read(s),same=read(s),moving=read({...s,age:s.age+30}),variant=read({...s,seed:2.13});
  if(hash(a)!==hash(same))throw Error('Paused material changed: '+kind);
  const motion=different(a,moving),variation=different(a,variant);
  const close=read({...s,zoom:3}),closeMotion=different(close,read({...s,zoom:3,age:s.age+30}));
  if(motion<3||variation<3||closeMotion<8)throw Error('Material lacks flow or shot variation: '+JSON.stringify({kind,motion,variation,closeMotion}));
  const x=kind==='beam'?320:400;if(bright(a,x,150)<100)throw Error('Weapon vanished at normal scale: '+kind);
  if(kind!=='beam'&&bright(a,400,150)<=bright(a,381,150))throw Error('Projectile has no concentrated leading core');
  read({...s,zoom:3});out.drawImage(api.canvas,0,i*300);result[kind]={hash:hash(a),motion,variation,closeMotion};
 }
 if(JSON.stringify(shot)!==before)throw Error('Painting mutated shot geometry');
 // The transformed projectile remains inside the test surface.
 ctx.setTransform(1,0,0,1,0,0);ctx.translate(15,-90);ctx.rotate(.25);
 const transformed=read({...shot,kind:'torpedo'}),tx=Math.round(15+Math.cos(.25)*400-Math.sin(.25)*150),ty=Math.round(-90+Math.sin(.25)*400+Math.cos(.25)*150);
 if(bright(transformed,tx,ty)<100)throw Error('Projectile lost its transformed authoritative position');
 const transformedBeam=read(shot),bx=Math.round(15+Math.cos(.25)*550-Math.sin(.25)*150),by=Math.round(-90+Math.sin(.25)*550+Math.cos(.25)*150);
 if(bright(transformedBeam,bx,by)<100)throw Error('Beam contact flare lost its transformed endpoint');
 ctx.setTransform(1,0,0,1,0,0);
 api.beginFrame(ctx);for(let i=0;i<4200;i++)nativeEffectProfiles.drawWeapon(drawShowcaseWeapon,ctx,{...shot,kind:'torpedo'});api.endFrame(ctx,1200);
 const capacity=api.snapshot().resources;if(capacity.activeWeaponPrimitives!==4096||capacity.primitiveRejected!==104)throw Error('Unbounded weapon batch '+JSON.stringify(capacity));
 if(gl.getError()!==gl.NO_ERROR)throw Error('Weapon shader GL error');
 api.beginFrame(ctx);api.endFrame(ctx,1500);if(api.snapshot().resources.activeWeaponPrimitives!==0)throw Error('Old weapon geometry survived an empty frame');
 const snapshot=api.snapshot();api.destroy();host.remove();return {result,capacity,snapshot,image:gallery.toDataURL()};
}'''
with tempfile.TemporaryDirectory(prefix='vexed-weapons-qa-') as state:
 server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));server.state=Path(state)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path='C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe')
   page=browser.new_page(viewport={'width':1440,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=6')
   page.wait_for_function('window.showcaseState?.().ready&&(window.showcaseShields?.snapshot().ready||window.showcaseShields?.snapshot().error)',timeout=90000)
   assert page.evaluate('showcaseShields.snapshot().ready'),page.evaluate('showcaseShields.snapshot().error')
   page.select_option('#shield-renderer','weapons',force=True)
   page.wait_for_function('showcaseShields.snapshot().ready && nativeEffectProfiles.current().implementation==="cinematic-weapons-v1"')
   assert page.evaluate('nativeEffectProfiles.current().implementation')=='cinematic-weapons-v1'
   page.locator('#pause').click()
   result=page.evaluate(PIXELS)
   (OUTPUT/'weapon-materials.png').write_bytes(base64.b64decode(result.pop('image').split(',')[1]))
   assert not errors,errors
   (OUTPUT/'visual.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
   browser.close();print('Weapon flow, seed variation, paused pixels, transformed contacts, capacity and disposal passed.',flush=True)
 finally:server.shutdown();server.server_close()
