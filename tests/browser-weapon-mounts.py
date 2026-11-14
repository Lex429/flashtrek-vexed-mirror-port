"""Full-roster weapon outlets: actual aligned artwork, owned launches and Canvas pixels."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/weapon-mounts';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[];rows=[]
SETUP=r'''async()=>{
 const check=(v,message)=>{if(!v)throw Error(message);},near=(a,b,label)=>check(Math.abs(a-b)<1e-6,`${label}: ${a} vs ${b}`);
 const scenes=new WeakMap();let clock=0;
 const shots=nativeCombatShots.fork({blocked:()=>false,seconds:()=>clock,scene:s=>scenes.get(s),resolve:(s,id)=>scenes.get(s).bystanders.find(t=>String(t.id)===String(id))});await shots.ready;
 // This isolated visual fixture does not play thousands of weapon sounds.
 window.nativeGameSounds={...window.nativeGameSounds,weapon(){}};
 const canvas=document.createElement('canvas');canvas.width=420;canvas.height=420;
 canvas.style.cssText='position:fixed;left:-1000px;top:0;width:420px;height:420px;pointer-events:none';document.body.append(canvas);
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),paint=window.paintShowcaseWeaponShot;let packet=null;
 window.paintShowcaseWeaponShot=(c,shot,geometry,age)=>{if(c===ctx)packet={...geometry};return paint(c,shot,geometry,age);};
 function fixture(id,category,hp,heading,model,rear=false){
  shots.reset();clock=0;
  const d=nativeShipDefinitions.get(id),s={system:2,shipType:id,x:1000,y:2000,angle:heading,heading,hull:d.hull*hp,shields:d.shields,phase:'cruise',vx:120,vy:-70,day:15,latinum:123,antimatter:27,deuranium:9};
  nativeSimulation.ensure(s);const holder=category==='player'?s:{...s,id:81};nativeShipEquipment.ensure(s,holder);nativeWeaponLoadout.refit(s,[model],{holder});
  const source=()=>nativeShipDefinitions.describe(s,holder,{category}),from=source(),bearing=heading+(rear?Math.PI:0);
  const target={id:82,system:from.system,x:from.x+Math.cos(bearing)*300,y:from.y+Math.sin(bearing)*300,heading:0,hull:1000,shields:1000,radii:{rx:12,ry:20},dimensions:{width:20,height:32},vx:120,vy:-70};
  scenes.set(s,{state:s,bystanders:[target],rocks:[]});
  const fire=()=>shots.fireFor({state:s,shooter:source(),getSource:source,target,getTarget:()=>target});
  return {s,holder,source,target,fire};
 }
 async function inspect(id){
  const d=nativeShipDefinitions.get(id),record=nativeShipWeaponMounts.get(id);check(record,`Missing mount data ${id}`);
  const report={id,name:d.name,stages:[],launches:0,visibleShots:0};let gallery=null;
  for(const [stage,hp]of [1,.7,.45,.2].entries()){
   const asset=await vexedFlightAssets.loadShip(id,d.hull*hp);
   check(asset.damageStage===stage,`Wrong damage plate ${id}/${stage}`);
   near(asset.width,record.artworkSize.width,`Aligned width ${id}/${stage}`);near(asset.height,record.artworkSize.height,`Aligned height ${id}/${stage}`);
   if(stage===0){
    const c=document.createElement('canvas');c.width=asset.width;c.height=asset.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(asset.art,0,0);const rgba=g.getImageData(0,0,c.width,c.height).data;
    const unique=new Map(Object.values(d.emitters).flatMap(v=>Array.isArray(v)?v:[v]).map(p=>[`${p.x},${p.y}`,p]));
    for(const p of unique.values()){
     const x=Math.round((p.x+.5)*c.width),y=Math.round((p.y+.5)*c.height);let alpha=0;
     for(let yy=Math.max(0,y-2);yy<=Math.min(c.height-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(c.width-1,x+2);xx++)alpha=Math.max(alpha,rgba[(yy*c.width+xx)*4+3]);
     check(alpha>=128,`Weapon outlet floats outside the intact hull ${id}: ${x},${y}`);
    }
    report.solidMounts=unique.size;
   }
   for(const category of ['player','civilian','tug'])for(const heading of [-Math.PI/2,.67])for(const model of [1,6,11,15,26,27]){
    const t=fixture(id,category,hp,heading,model,model===1&&stage%2===1),f=t.fire();check(f.ok,`${id}/${stage}/${category}/${model}: ${f.error}`);
    const e=f.event,source=t.source(),angle=heading+Math.PI/2,c=Math.cos(angle),sn=Math.sin(angle),origin={x:source.x+e.emitter.x*c-e.emitter.y*sn,y:source.y+e.emitter.x*sn+e.emitter.y*c};
    const key=e.kind==='beam'?'beamBanks':model===11?'turretBanks':e.kind==='torpedo'?'torpedoBanks':'cannonBanks';
    check(record.emitters[key].some(p=>Math.hypot(p.x*source.dimensions.width-e.emitter.x,p.y*source.dimensions.height-e.emitter.y)<1e-7),`Wrong hardware ${id}/${model}`);
    near(e.projectile?e.x:e.from.x,origin.x,'Physical outlet x');near(e.projectile?e.y:e.from.y,origin.y,'Physical outlet y');
    const zoom=120/Math.max(source.dimensions.width,source.dimensions.height),view={state:t.s,ship:{x:source.x-9/zoom,y:source.y+7/zoom},cx:201,cy:217,zoom,w:420,h:420};
    const before=JSON.stringify(t.s);ctx.clearRect(0,0,420,420);packet=null;clock=.035;shots.paint(ctx,f.shot,view);check(packet,'Weapon bypassed Canvas renderer');
    near(e.projectile?packet.x:packet.x1,view.cx+(origin.x-view.ship.x)*zoom,'Rendered outlet x');near(e.projectile?packet.y:packet.y1,view.cy+(origin.y-view.ship.y)*zoom,'Rendered outlet y');
    const pixels=ctx.getImageData(0,0,420,420).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>10)visible++;
    check(visible>0&&visible<420*420/2,`Invalid weapon pixels ${id}/${stage}/${category}/${model}: ${visible}`);report.visibleShots++;
    nativeShipEffects.paintShip(ctx,source,{...view,asset,appearance:{lights:false}});
    const after=JSON.stringify(t.s);check(after===before,`Drawing changed gameplay ${id}/${stage}/${category}/${model}: `+Object.keys(t.s).filter(k=>JSON.stringify(JSON.parse(before)[k])!==JSON.stringify(t.s[k])).map(k=>`${k}: ${JSON.stringify(JSON.parse(before)[k])} -> ${JSON.stringify(t.s[k])}`).join(';'));
    report.launches++;
   }
   report.stages.push(stage);
   if(stage===0){
    gallery=document.createElement('canvas');gallery.width=240;gallery.height=280;const g=gallery.getContext('2d');g.fillStyle='#101724';g.fillRect(0,0,240,280);
    g.fillStyle='#e3edff';g.font='12px Arial';g.fillText(`${id} ${d.name}`,6,16,228);
    const t=fixture(id,'player',1,-Math.PI/2,1),zoom=145/Math.max(d.dimensions.width,d.dimensions.height),view={state:t.s,ship:{x:1000,y:2000},cx:210,cy:210,zoom,w:420,h:420,asset};
    ctx.clearRect(0,0,420,420);nativeShipEffects.paintShip(ctx,t.source(),{...view,appearance:{lights:false}});
    for(const model of [1,6,11,15]){
     nativeWeaponLoadout.refit(t.s,[model]);const shot=t.fire();check(shot.ok,'Gallery fire failed');clock=.035;shots.paint(ctx,shot.shot,view);
    }
    g.drawImage(canvas,0,0,420,420,0,30,240,240);g.fillStyle='#9bb5ce';g.font='10px Arial';g.fillText('Actual beam / cannon / turret / torpedo',8,274,224);
   }
  }
  return {report,png:gallery.toDataURL().split(',')[1]};
 }
 window.__weaponMounts={inspect};return nativeShipDefinitions.registered().filter(d=>d.capabilities.armed!==false&&!d.renderer).map(d=>d.id);
}'''
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        ids=page.evaluate(SETUP);assert len(ids)>=89
        gallery=[]
        for index,id in enumerate(ids):
            result=page.evaluate('id=>__weaponMounts.inspect(id)',id);rows.append(result['report']);gallery.append(result['png'])
            if len(gallery)==24 or index==len(ids)-1:
                png=page.evaluate('''async images=>{const c=document.createElement('canvas');c.width=1440;c.height=Math.ceil(images.length/6)*280;const g=c.getContext('2d');for(const [i,png]of images.entries()){const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();g.drawImage(image,i%6*240,Math.floor(i/6)*280);}return c.toDataURL().split(',')[1];}''',gallery)
                (OUT/f'firing-{index//24+1}.png').write_bytes(base64.b64decode(png));gallery=[]
            (OUT/'browser-progress.json').write_text(json.dumps(rows,indent=2),encoding='utf8');print(f'checked {index+1}/{len(ids)}: {id}',flush=True)
        assert not errors and not failed,(errors,failed)
        report={'passed':True,'hulls':len(rows),'alignedDamageFrames':sum(len(r['stages']) for r in rows),'launches':sum(r['launches'] for r in rows),'visibleShots':sum(r['visibleShots'] for r in rows),'rows':rows,'javascriptErrors':errors,'failedRequests':failed}
        (OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='rows'}));browser.close()
except Exception:
    if 'page' in locals():
        try:page.screenshot(path=str(OUT/'browser-failure.png'))
        except Exception:pass
    raise
finally:server.shutdown();server.server_close()
