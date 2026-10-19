"""All nine painted damage atlases, source-registered chips and burned wrecks."""
import functools, http.server, json, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/drone-painted-wreckage';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=None
if len(sys.argv)>1:base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1450,'height':1000});errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.add_init_script("""(()=>{
          let callbacks=[],now;const original=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return original(callback);callbacks.push(callback);return callbacks.length;};
          window.advanceShowcase=seconds=>{now??=performance.now();for(let i=0;i<Math.ceil(seconds*60);i++){now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));}};
        })();""")
        page.goto(base+'/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=500')
        page.wait_for_function('window.showcaseState&&showcaseState().ready',timeout=60000)
        report=page.evaluate("""async()=>{
          if(!(await droneSprites.ready).every(Boolean))throw Error('art preparation failed');
          const check=(v,m)=>{if(!v)throw Error(m);}, canvas=(w=512,h=w)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
          const bytes=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
          const results=[],gallery=canvas(1400,9*250),g=gallery.getContext('2d');g.fillStyle='#07121b';g.fillRect(0,0,gallery.width,gallery.height);
          let row=0;
          for(const role of ['repair','attack','defense'])for(const tier of ['basic','upgraded','advanced']){
            const frames=[100,65,40,15].map(health=>{const c=canvas();droneSprites.drawSurface(c.getContext('2d'),tier,{role,health,lights:false,effects:false});return c;}),rgba=frames.map(bytes),stages=[];
            g.fillStyle='#deecf4';g.font='16px sans-serif';g.fillText(role+' / '+tier,12,row*250+20);
            frames.forEach((c,s)=>g.drawImage(c,150+s*250,row*250,250,250));
            for(let s=1;s<4;s++){
              const changes=droneSprites.damageChange(tier,role,s-1,s);check(changes.pieces.length>=3,role+tier+' missing stage '+s);let checked=0;
              for(const part of changes.pieces){const data=bytes(part.texture);check(wreckageEffects.get(part.texture),'uncached chip');
                for(let y=0;y<part.texture.height;y++)for(let x=0;x<part.texture.width;x++){
                  const i=(y*part.texture.width+x)*4,j=((part.source.y+y)*512+part.source.x+x)*4;
                  if(data[i+3]<250||rgba[s-1][j+3]<250)continue;
                  for(let k=0;k<3;k++)check(Math.abs(data[i+k]-rgba[s-1][j+k])<=2,role+tier+' foreign fragment pixels');checked++;
                }
              }check(checked>1,'empty armor chips');
              let changed=0;for(let i=0;i<rgba[s].length;i+=4){check(rgba[s][i+3]<=rgba[s-1][i+3],'damage grew silhouette');if(Math.abs(rgba[s][i]-rgba[s-1][i])+Math.abs(rgba[s][i+1]-rgba[s-1][i+1])+Math.abs(rgba[s][i+2]-rgba[s-1][i+2])>25)changed++;}
              check(changed>300,'missing painted damage');stages.push({stage:s,pieces:changes.pieces.length,checked,changed});
            }
            const wrecks=droneSprites.fragments(tier,role,3);check(wrecks.length>=18,'grid/single-piece wreck');let charred=0,torn=0,anchors=0,hot=0;
            for(const part of wrecks){const before=part.texture.toDataURL(),material=wreckageEffects.get(part.texture);check(material,'uncached wreck');torn+=material.tornPixels;anchors+=material.anchors.length;
              const raw=bytes(part.texture),burned=bytes(material.texture),heat=bytes(material.hot);let original=0,black=0,count=0;
              for(let i=0;i<burned.length;i+=4)if(burned[i+3]>200&&raw[i+3]>200){original+=raw[i]+raw[i+1]+raw[i+2];black+=burned[i]+burned[i+1]+burned[i+2];count++;}if(count&&black<original*.65)charred++;
              for(let i=3;i<heat.length;i+=4)if(heat[i])hot++;
              const burn=age=>{const c=canvas(150),ctx=c.getContext('2d');ctx.translate(75,75);wreckageEffects.draw(ctx,part.texture,110,110,age);return c.toDataURL();};
              check(burn(100)!==burn(1700),'fire not animated');check(burn(4000)===burn(7000),'cooled wreck still animates');check(before===part.texture.toDataURL(),'wreck preparation mutated source');
            }
            check(charred>=wrecks.length*.8&&torn>100&&hot>100&&anchors>5,'wrecks not charred/torn/burning');
            const state={particles:[],debris:[]},pose={role,tier,position:{x:600,y:400},heading:.73,scale:1,time:1000};check(droneShowcase.shipExplosion(state,pose),'missing extreme explosion');
            const explosion=droneShowcase.explosionSnapshot(state);check(explosion.core===1&&explosion.blasts>=18,'missing reactor explosion');
            const fx=dotBasicDamage.createEffects();fx.emit({...pose,before:0,after:3});check(fx.snapshot().pieces.length===stages.reduce((n,s)=>n+s.pieces,0),'skipped stages lost fragments');
            const observe=JSON.stringify(fx.snapshot()),context=canvas().getContext('2d');fx.draw(context,1000);fx.draw(context,1100);check(JSON.stringify(fx.snapshot())===observe,'drawing changed effects');
            results.push({role,tier,stages,wrecks:wrecks.length,charred,torn,anchors,hot,explosion});row++;
          }
          gallery.id='painted-wreckage-gallery';gallery.style.cssText='position:absolute;left:0;top:0;z-index:999';document.body.append(gallery);
          // Real combat owners emit all stages and exactly one owned casualty.
          const combat=[];
          for(const role of ['attack','defense'])for(const tier of ['basic','upgraded','advanced']){
            let losses=0;const worker={id:0,role:'repair',position:{x:540,y:253},health:10000,maxHealth:10000};
            const repair={snapshot:()=>({drones:[worker],elapsed:1000,recalling:false}),target:()=>worker,setThreats:()=>{},hit:()=>({hit:false})};
            const battle=droneBattle.create({repair,defense:role==='defense'?{[tier]:1}:{},born:0,geometry:{source:{centerX:135,centerY:425,w:58,h:88,a:1.17},layout:{x:540,y:253}},onDestroyed:()=>losses++});
            if(role==='attack')battle.launchWave({[tier]:1},0);battle.advance(1);
            const drone=battle.snapshot().drones.find(d=>d.role===role),maximum=drone.maxHealth;
            for(const percent of [.35,.25,.25])battle.hit(drone.id,maximum*percent,100);
            const damaged=battle.snapshot();check(new Set(damaged.damageEffects.pieces.map(p=>p.stage)).size===3,'combat lost stage transitions');
            battle.hit(drone.id,maximum,100);check(!battle.hit(drone.id,maximum,100).hit,'double death');
            const dead=battle.snapshot();check(dead.destruction.core===1&&dead.destruction.wreckCount>=18,'combat lost ship explosion');check(losses===(role==='defense'?1:0),'incorrect casualty count');combat.push({role,tier,losses,wrecks:dead.destruction.wreckCount});
          }
          return {models:results,combat,cache:wreckageEffects.snapshot()};
        }""")
        page.locator('#painted-wreckage-gallery').screenshot(path=str(OUT/'all-painted-stages.png'))
        page.evaluate("document.getElementById('painted-wreckage-gallery').remove()")
        page.locator('#fleet-filter').select_option('all')
        page.locator('#animation-filter').select_option('all')
        # Observe production breakup drawing for metal, organic and legacy art.
        page.evaluate("""()=>{const original=window.wreckageEffects;window.__burnedDraws=[];
          window.wreckageEffects={...original,draw:(ctx,source,w,h,age,options)=>{
            const drawn=original.draw(ctx,source,w,h,age,options);if(drawn)window.__burnedDraws.push({organic:!!original.get(source).organic,age});return drawn;
          }};
        }""")
        report['ships']=[]
        for ship in [1,59,416,55,50,2]:
            page.locator('#ship-select').select_option(str(ship))
            page.wait_for_function('(id)=>showcaseState().ready&&showcaseState().ship===id',arg=ship,timeout=60000)
            page.evaluate('window.__burnedDraws=[]')
            page.locator('#destroy').click()
            page.evaluate('advanceShowcase(1.7)')
            draws=page.evaluate('__burnedDraws')
            assert draws,('missing burned wreck drawing',ship)
            if ship in [55,50]:assert any(d['organic'] for d in draws),ship
            report['ships'].append({'ship':ship,'burnedDraws':len(draws),'organic':any(d['organic'] for d in draws)})
            page.locator('#scene').screenshot(path=str(OUT/f'burning-ship-{ship}.png'))
            page.evaluate('advanceShowcase(18)')
        assert not errors,errors
        report['browserErrors']=errors
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report));browser.close()
finally:
    if server:server.shutdown()
