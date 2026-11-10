"""Real Dev Aries selection, visible coil charge and the powered ship roster. No FPS claim."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/warp-charge-ships';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()

SCENARIO=r'''async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)},rows=[],excepted={23:'solar sail',50:'biological body',55:'biological body'};
 const canvas=document.createElement('canvas');canvas.width=canvas.height=768;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.scale(2,2);
 const gallery=document.createElement('canvas');gallery.width=960;gallery.height=1300;const g=gallery.getContext('2d');g.fillStyle='#06101a';g.fillRect(0,0,960,1300);
 const galleryTypes=[12,426,427,7,1],levels=[0,.35,.65,1];
 for(const d of nativeShipDefinitions.registered()){
  if(d.renderer)continue;
  const asset=await vexedFlightAssets.loadShip(d.id,d.hull),energy=[];
  for(const [column,nacelleCharge] of levels.entries()){
   ctx.clearRect(0,0,384,384);vexedFlightAssets.drawShip(ctx,asset,192,192,80,0,1200,{kind:'charging',nacelleCharge,effectRate:60,lights:true,damage:false});
   const pixels=ctx.getImageData(0,0,768,768).data;let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=(pixels[i]+pixels[i+1]+pixels[i+2])*pixels[i+3]/255;energy.push(sum);
   const row=galleryTypes.indexOf(d.id);
   if(row>=0){g.drawImage(canvas,column*240,row*260+20,240,240);g.fillStyle='#c8dce7';g.font='12px Arial';g.fillText(`${d.name} / ${nacelleCharge}`,column*240+5,row*260+16);}
  }
  if(!excepted[d.id])check(energy.every((e,i)=>i===0||e>energy[i-1]),'Charge did not visibly increase: '+JSON.stringify({id:d.id,name:d.name,energy}));
  rows.push({id:d.id,name:d.name,energy,exception:excepted[d.id]||null});
 }
 // Measure the actual two Aries coils at flight size. A whole-hull energy
 // increase can pass while blue channels remain visibly saturated.
 const a=await vexedFlightAssets.loadShip(12,nativeShipDefinitions.get(12).hull),d=nativeShipDefinitions.dimensions({shipType:12},'player'),coils=a.profile.lights.filter(p=>p.kind==='core'&&p.h>100),coilRows=[];
 check(coils.length===2,'Aries fixture lost its two measured nacelle masks');
 for(const charge of levels){
  ctx.clearRect(0,0,384,384);vexedFlightAssets.drawShip(ctx,a,192,192,d.width,0,1200,{kind:'charging',height:d.height,nacelleCharge:charge,effectRate:60,lights:true,damage:false});
  const red=coils.map(p=>{const x=Math.round(2*(192+(p.left/a.profile.width-.5)*d.width)),y=Math.round(2*(192+(p.top/a.profile.height-.5)*d.height)),w=Math.max(1,Math.round(2*p.w/a.profile.width*d.width)),h=Math.max(1,Math.round(2*p.h/a.profile.height*d.height)),data=ctx.getImageData(x,y,w,h).data;let r=0;for(let i=0;i<data.length;i+=4)r+=data[i]*data[i+3]/255;return r/(data.length/4);});
  coilRows.push({charge,red});
 }
 for(let i=0;i<2;i++)check(coilRows.at(-1).red[i]-coilRows[0].red[i]>50,'Aries coil stayed blue instead of reaching a visible white-hot charge: '+JSON.stringify(coilRows));
 window.__chargeGallery=gallery;return {ships:rows,poweredShips:rows.filter(r=>!r.exception).length,ariesCoils:coilRows};
}'''

errors=[];failed=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        page.locator('#devToolsBtn').click();page.locator('[data-dev-ship]').select_option('12');page.locator('[data-dev-equip]').click()
        page.wait_for_function('()=>nativeNpcDev.getState()?.shipType===12&&nativeShipEffects.stageReady(12,0)',timeout=60000)
        page.evaluate('''()=>{
          window.__chargeDraws=[];const assets=vexedFlightAssets;window.vexedFlightAssets={...assets,drawShip(ctx,asset,...args){const appearance=args.at(-1);if(ctx.canvas.id==='space'&&appearance?.nacelleCharge!==undefined)__chargeDraws.push({type:asset.type,phase:vexedWarp.phase,charge:appearance.nacelleCharge,lights:appearance.lights});return assets.drawShip(ctx,asset,...args);}};
          const streaming=nativeSystemStreaming;window.nativeSystemStreaming={...streaming,async prepareArrival(...args){const result=await streaming.prepareArrival(...args);await new Promise(resolve=>window.__releaseCharge=resolve);return result;}};
          const result=nativeNavigation.call('course',9);if(!result.ok)throw Error(result.error);
        }''')
        page.wait_for_function('()=>!!window.__releaseCharge&&vexedWarp.phase==="charging"&&vexedWarp.snapshot().phaseTime>1300||vexedWarp.phase==="error"',timeout=90000)
        held=page.evaluate('()=>({snapshot:vexedWarp.snapshot(),draws:__chargeDraws})');assert held['snapshot']['phase']=='charging' and not held['snapshot']['prepared'],held
        assert all(d['type']==12 and d['lights'] for d in held['draws']),held
        assert any(0<d['charge']<.65 for d in held['draws']) and any(.65<d['charge']<1 for d in held['draws']) and held['draws'][-1]['charge']==1,held
        page.screenshot(path=str(OUT/'aries-charged-in-flight.png'))
        page.evaluate('__releaseCharge()');page.wait_for_function('()=>__chargeDraws.some(d=>d.phase==="departure")||vexedWarp.phase==="error"',timeout=30000)
        departure=page.evaluate('__chargeDraws.filter(d=>d.phase==="departure")');assert departure and all(d['type']==12 and d['charge']==1 for d in departure),departure
        page.wait_for_function('()=>vexedWarp.phase==="report"&&vexedWarp.assetsReady||vexedWarp.phase==="error"',timeout=90000);assert page.evaluate('vexedWarp.assetsReady')
        page.locator('.warp-continue').click();page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=45000);assert page.evaluate('vexedWarp.phase')=='idle'
        assert page.evaluate('nativeNpcDev.getState().shipType')==12
        # Hold live time at an explicit gate while inspecting the complete roster.
        page.evaluate('()=>{window.__chargeBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}')
        report=page.evaluate(SCENARIO)
        (OUT/'ship-charge-gallery.png').write_bytes(base64.b64decode(page.evaluate('__chargeGallery.toDataURL().split(",")[1]')))
        assert not errors and not failed,(errors,failed)
        report.update(passed=True,devSelection=12,liveCharge=True,chargedDeparture=True,retainedHullAfterArrival=True,javascriptErrors=errors,failedRequests=failed)
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='ships'}),flush=True);browser.close()
except Exception:
    if 'page' in locals():
        try:page.screenshot(path=str(OUT/'failure.png'))
        except Exception:pass
    raise
finally:server.shutdown();server.server_close()
