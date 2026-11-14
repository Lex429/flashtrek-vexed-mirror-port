"""Read actual GPU/Canvas pixels behind newborn projectiles' launch planes."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/projectile-tail';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
CHECK=r'''async()=>{
 await nativeEffectProfiles.ready;
 const check=(v,message)=>{if(!v)throw Error(message);},near=(a,b,label)=>check(Math.abs(a-b)<1e-6,`${label}: ${a} vs ${b}`);
 window.nativeGameSounds={...nativeGameSounds,weapon(){}};
 const make=()=>{const c=document.createElement('canvas');c.width=640;c.height=360;c.style.cssText='position:fixed;left:-2000px;width:640px;height:360px';document.body.append(c);return c;};
 const gpu=make(),cpu=make(),g=gpu.getContext('2d'),c=cpu.getContext('2d',{willReadFrequently:true});
 const presentation=await createVexedShieldPresentation({space:gpu,radii:()=>({rx:20,ry:28})}),gl=presentation.renderer.gl;
 check(gl,'Actual WebGL weapon pipeline unavailable');
 const shots=nativeCombatShots.fork({blocked:()=>false,scene:()=>({bystanders:[],rocks:[]})});await shots.ready;
 let geometry=null;const paint=window.paintShowcaseWeaponShot;
 window.paintShowcaseWeaponShot=(ctx,shot,p,age)=>{if(ctx===g||ctx===c)geometry=p;return paint(ctx,shot,p,age);};
 function fixture(id,model,heading,velocity){
  shots.reset();const d=nativeShipDefinitions.get(id),s={system:2,shipType:id,x:1000,y:2000,angle:heading,phase:'cruise',hull:d.hull,shields:d.shields,vx:velocity.x,vy:velocity.y};nativeSimulation.ensure(s);nativeWeaponLoadout.refit(s,[model]);
  const fired=shots.fire({state:s,forward:true});check(fired.ok,`Cannot fire ${id}/${model}: ${fired.error}`);
  return {s,fired,heading,velocity,origin:{x:fired.event.x,y:fired.event.y}};
 }
 const rgba=ctx=>ctx===c?ctx.getImageData(0,0,640,360).data:(()=>{const bytes=new Uint8Array(640*360*4);gl.readPixels(0,0,640,360,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;})();
 function render(t,ctx,view,legacy=false){
  ctx.clearRect(0,0,640,360);geometry=null;
  if(ctx===g)presentation.beginFrame(ctx);
  if(legacy){
   const original=window.paintShowcaseWeaponShot;window.paintShowcaseWeaponShot=(ctx,s,p,age)=>{const copy={...p};delete copy.trailLength;paint(ctx,s,copy,age);};
   try{shots.paint(ctx,t.fired.shot,view);}finally{window.paintShowcaseWeaponShot=original;}
  }else shots.paint(ctx,t.fired.shot,view);
  if(ctx===g)presentation.endFrame(ctx,1000+t.fired.event.age*1000);
  return rgba(ctx);
 }
 const sheet=document.createElement('canvas');sheet.width=1280;sheet.height=720;const out=sheet.getContext('2d');out.fillStyle='#08101d';out.fillRect(0,0,1280,720);
 const review=document.createElement('canvas');review.width=640;review.height=360;const reviewCtx=review.getContext('2d'),reviewHull=nativeShipDefinitions.get(7),reviewArt=await vexedFlightAssets.loadShip(7,reviewHull.hull);
 const reviewFrame=(t,view,x,y)=>{
  reviewCtx.fillStyle='#08101d';reviewCtx.fillRect(0,0,640,360);
  vexedFlightAssets.drawShip(reviewCtx,reviewArt,view.cx+(t.s.x-view.ship.x)*view.zoom,view.cy+(t.s.y-view.ship.y)*view.zoom,reviewHull.dimensions.width*view.zoom,t.s.angle+Math.PI/2,0,{height:reviewHull.dimensions.height*view.zoom,lights:false});
  reviewCtx.drawImage(presentation.canvas,0,0);reviewCtx.strokeStyle='#516779';reviewCtx.setLineDash([2,2]);reviewCtx.beginPath();reviewCtx.moveTo(240,164);reviewCtx.lineTo(240,197);reviewCtx.stroke();
  out.imageSmoothingEnabled=false;out.drawImage(review,195,158,160,45,x,y,640,180);
 };
 const cases=[];let oldOverlap=0;
 for(const id of [7,18,436,437])for(const model of [6,15])for(const heading of [0,.7,-Math.PI/2])for(const velocity of [{x:0,y:0},{x:427.5,y:0},{x:-400,y:250}])for(const alpha of [0,.5,1]){
  const t=fixture(id,model,heading,velocity),e=t.fired.event,speed=Math.hypot(e.vx,e.vy),nx=e.vx/speed,ny=e.vy/speed,along=speed-(velocity.x*e.vx+velocity.y*e.vy)/speed;
  // Move/turn the carrier after launch; the wake must keep the original drift.
  for(const age of [0,.002,.008,.04]){
   e.previousX=t.origin.x+e.vx*Math.max(0,age-.002);e.previousY=t.origin.y+e.vy*Math.max(0,age-.002);
   e.x=t.origin.x+e.vx*age;e.y=t.origin.y+e.vy*age;e.age=age;
   Object.assign(t.s,{x:1000+velocity.x*age,y:2000+velocity.y*age,angle:heading+age*10});
   const zoom=1.3,view={state:t.s,ship:{x:t.origin.x,y:t.origin.y},cx:240,cy:180,zoom,w:640,h:360};
   const simulation=nativeSimulationFrame;window.nativeSimulationFrame={...simulation,alpha:()=>alpha};
   try{
    const renderAge=age-(1-alpha)*Math.min(age,.002),limit=Math.max(0,along)*renderAge*zoom;
    const px=(e.previousX+(e.x-e.previousX)*alpha),py=(e.previousY+(e.y-e.previousY)*alpha),head={x:view.cx+(px-t.origin.x)*zoom,y:view.cy+(py-t.origin.y)*zoom};
    for(const ctx of [g,c]){
     const before=JSON.stringify(t.s),bytes=render(t,ctx,view);check(Number.isFinite(geometry?.trailLength),'Missing real projectile travel limit');near(geometry.trailLength,limit,'Interpolated launch-frame wake');
     check(JSON.stringify(t.s)===before,'Drawing changed saved shot state');
     let visible=0,behind=0;
     for(let y=0;y<360;y++)for(let x=0;x<640;x++){
      const offset=((ctx===g?359-y:y)*640+x)*4;
      if(bytes[offset+3]<12||bytes[offset]+bytes[offset+1]+bytes[offset+2]<32)continue;
      visible++;if((x+.5-head.x)*nx+(y+.5-head.y)*ny < -limit-1.5)behind++;
     }
     check(visible>0,`Projectile disappeared ${id}/${model}/${age}/${alpha}/${ctx===g?'gpu':'canvas'}`);
     check(behind===0,`Wake painted before its launcher ${JSON.stringify({id,model,age,alpha,velocity,heading,backend:ctx===g?'gpu':'canvas',behind,limit})}`);
     if(age===.04){const mature=render(t,ctx,view,true);let changed=0;for(let i=0;i<bytes.length;i++)if(bytes[i]!==mature[i])changed++;check(changed===0,`Fully developed weapon changed ${changed} pixels`);}
     cases.push({id,model,age,alpha,heading,velocity,backend:ctx===g?'gpu':'canvas',limit,visible,behind});
    }
    if(id===7&&model===6&&heading===0&&velocity.x===0&&alpha===1){
     const row=[0,.002,.008,.04].indexOf(age),before=render(t,g,view,true);let bad=0;
     for(let y=0;y<360;y++)for(let x=0;x<640;x++){const k=((359-y)*640+x)*4;if(x<head.x-limit-2&&before[k+3]>12)bad++;}oldOverlap+=bad;
     reviewFrame(t,view,0,row*180);render(t,g,view);reviewFrame(t,view,640,row*180);
     out.fillStyle='#b7cde7';out.font='14px Arial';out.fillText(`Before / ${age*1000} ms / 4x pixel view`,12,row*180+20);out.fillText(`Fixed / ${age*1000} ms / 4x pixel view`,652,row*180+20);
    }
   }finally{window.nativeSimulationFrame=simulation;}
  }
 }
 check(oldOverlap>0,'The reference renderer did not reproduce the reported tail');
 const metric=presentation.snapshot();presentation.destroy();
 return {passed:true,cases:cases.length,backends:['actual WebGL','Canvas fallback'],smallShips:[7,18,436,437],legacyBehindPixels:oldOverlap,production:nativeEffectProfiles.current(),metric,image:sheet.toDataURL()};
}'''
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        result=page.evaluate(CHECK);(OUT/'before-after.png').write_bytes(base64.b64decode(result.pop('image').split(',')[1]));assert not errors,errors
        (OUT/'report.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));browser.close()
except Exception:
    if 'page' in locals():
        try:page.screenshot(path=str(OUT/'failure.png'))
        except Exception:pass
    raise
finally:server.shutdown();server.server_close()
