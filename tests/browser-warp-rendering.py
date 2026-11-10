"""Real artwork, live lighting and stable warp zoom surfaces. No FPS claim."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/warp-rendering';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
SCENARIO=r'''async()=>{
 const check=(value,message)=>{if(!value)throw Error(message)},cache=nativeShipSpriteCache;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 // Match the existing pixel regressions' readback surface. GPU readback can
 // round an unpremultiplied channel by one after a flush, without a repaint.
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.scale(2,2);
 const asset=await vexedFlightAssets.loadShip(7,nativeShipDefinitions.get(7).hull),ratio=asset.height/asset.width;
 const options={kind:'cruise',alpha:1,warpPulse:.8,effectRate:60,rasterWidth:100,rasterHeight:100*ratio,imageSmoothingQuality:'low'};
 cache.reset();
 for(let frame=0;frame<60;frame++){
   const width=7.2+(100-7.2)*frame/59;
   ctx.clearRect(0,0,256,256);vexedFlightAssets.drawShip(ctx,asset,128,128,width,.2,frame*1000/60+.01,options);
 }
 const zoom=cache.snapshot();
 check(zoom.counters.spriteMisses===1&&zoom.counters.compositionMisses===1,'Zoom rebuilt a different image for each camera size');
 check(zoom.counters.canvasAllocations===2&&zoom.counters.evictions===0,'Warp zoom allocated or evicted extra working surfaces');
 check(zoom.counters.spriteRebuilds===60,'Shared warp lights stopped updating at60Hz');
 check(zoom.bytes<=zoom.limits.bytes,'Warp zoom exceeded the shared image budget');
 const frameAt=time=>{ctx.clearRect(0,0,256,256);vexedFlightAssets.drawShip(ctx,asset,128,128,100,.2,time,options);return ctx.getImageData(0,0,512,512).data;};
 const first=frameAt(1200),beforePause=cache.snapshot(),paused=frameAt(1200),afterPause=cache.snapshot(),later=frameAt(1660);
 let changed=0,maxDifference=0;for(let i=0;i<first.length;i++)if(first[i]!==paused[i]){changed++;maxDifference=Math.max(maxDifference,Math.abs(first[i]-paused[i]));}
 check(beforePause.counters.spriteRebuilds===afterPause.counters.spriteRebuilds&&beforePause.counters.spriteCompositions===afterPause.counters.spriteCompositions,'A paused camera repainted the shared lights');
 check(changed===0,'A paused warp image changed its lights: '+JSON.stringify({changed,maxDifference,before:beforePause.counters,after:afterPause.counters}));
 check(first.some((v,i)=>v!==later[i]),'Live warp lighting was replaced by a still image');
 const gallery=document.createElement('canvas');gallery.width=960;gallery.height=1040;const g=gallery.getContext('2d');g.fillStyle='#06101a';g.fillRect(0,0,960,1040);
 const rows=[],cases=[[7,0],[7,2],[1,0],[1,2]],widths=[14,40,100];
 for(let row=0;row<cases.length;row++){
   const [type,stage]=cases[row],maximum=nativeShipDefinitions.get(type).hull,art=await vexedFlightAssets.loadShip(type,maximum*(stage===0?1:.4));
   check(art.damageStage===stage,'Incorrect real-art damage fixture');
   for(let column=0;column<6;column++){
     const width=widths[Math.floor(column/2)],updated=column%2===1,tile=document.createElement('canvas');tile.width=320;tile.height=460;
     const t=tile.getContext('2d');t.scale(2,2);const appearance={alpha:1,warpPulse:.8,effectRate:60};
     if(updated)Object.assign(appearance,{kind:'cruise',rasterWidth:100,rasterHeight:100*art.height/art.width,imageSmoothingQuality:'low'});
     vexedFlightAssets.drawShip(t,art,80,110,width,.1,900,appearance);
     const pixels=t.getImageData(0,0,320,460).data;let occupied=0,energy=0;
     for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]>32)occupied++;energy+=pixels[i+3];}
     check(occupied>10,'The warp ship or its damage plate disappeared');
     rows.push({type,stage,width,updated,occupied,alphaEnergy:energy});
     const x=column*160,y=row*260;g.drawImage(tile,x,y+20,160,230);g.fillStyle='#bfd7e5';g.font='11px Arial';g.fillText(`${type}/${stage} ${width} ${updated?'updated':'previous'}`,x+4,y+15);
   }
 }
 const chargeGallery=document.createElement('canvas');chargeGallery.width=960;chargeGallery.height=520;const cg=chargeGallery.getContext('2d');cg.fillStyle='#06101a';cg.fillRect(0,0,960,520);
 const chargeRows=[];
 for(const [row,type] of [7,1].entries()){
   const art=await vexedFlightAssets.loadShip(type,nativeShipDefinitions.get(type).hull),levels=[0,.35,.65,1];
   let previousEnergy=0;
   for(const [column,nacelleCharge] of levels.entries()){
     const tile=document.createElement('canvas');tile.width=440;tile.height=440;const t=tile.getContext('2d',{willReadFrequently:true});t.scale(2,2);
     const appearance={kind:'charging',nacelleCharge,alpha:1,warpPulse:.8,effectRate:60};
     vexedFlightAssets.drawShip(t,art,110,110,80,0,1200,appearance);
     const pixels=t.getImageData(0,0,440,440).data;let energy=0;for(let i=0;i<pixels.length;i+=4)energy+=(pixels[i]+pixels[i+1]+pixels[i+2])*pixels[i+3]/255;
     check(energy>previousEnergy,'Nacelles did not brighten as charge increased: '+JSON.stringify({type,nacelleCharge,previousEnergy,energy}));previousEnergy=energy;
     chargeRows.push({type,nacelleCharge,energy});cg.drawImage(tile,column*240,row*260+20,220,220);cg.fillStyle='#bfd7e5';cg.font='13px Arial';cg.fillText(`${type} / charge ${nacelleCharge}`,column*240+8,row*260+17);
   }
 }
 window.__warpChargeGallery=chargeGallery;window.__warpRenderingGallery=gallery;return {zoom,pauseExact:true,liveLights:true,comparisons:rows,chargeRows};
}'''
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850});errors=[];failed=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        report=page.evaluate(SCENARIO);raw=page.evaluate('__warpRenderingGallery.toDataURL().split(",")[1]');(OUT/'previous-and-updated.png').write_bytes(base64.b64decode(raw))
        raw=page.evaluate('__warpChargeGallery.toDataURL().split(",")[1]');(OUT/'nacelle-charge.png').write_bytes(base64.b64decode(raw))
        assert not errors and not failed,(errors,failed)
        report.update(passed=True,javascriptErrors=errors,failedRequests=failed);(OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(json.dumps({'passed':True,'comparisons':len(report['comparisons']),'pauseExact':report['pauseExact'],'liveLights':report['liveLights'],'zoomCounters':report['zoom']['counters']}),flush=True);browser.close()
finally:server.shutdown();server.server_close()
