"""Restore the real c41559c Earth jam and inspect recovery locally and on the map."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):
        pass

SETUP=r"""saved=>{
 const original=nativeNpcDev.getState(),state={...original,...JSON.parse(JSON.stringify(saved)),devMode:true};
 const stuck=state.civilianTraffic.ships.filter(s=>s.system===1&&s.port===3&&s.task?.phase==='waiting-payment');
 localStorage.setItem('broken-mirror-native-save',JSON.stringify(state));resumeNativeGame();
 const s=nativeNpcDev.getState(),ids=stuck.map(s=>s.id),before=new Map(stuck.map(s=>[s.id,{x:s.x,y:s.y,deliveries:s.deliveries||0}]));
 window.__jam={ids,before,moved:new Set(),delivered:new Set(),rerouted:new Set(),initialCount:s.civilianTraffic.ships.length,maxQueue:0,leases:new Set(),series:[]};
 __jam.check=(ok,label)=>{if(!ok)throw Error(label);};
 __jam.tick=seconds=>{
  const s=nativeNpcDev.getState();
  for(let i=0;i<seconds*60;i++){
   const dt=nativeSimulation.advance(s,1/60);nativeSimulationFrame.begin(s);nativeSimulationFrame.step(s);
   nativeSolEconomy.advance(s,dt);nativeCivilianTraffic.advance(s,dt);nativeCombatShots.advance(s,dt);nativeShipEffects.advance(s,dt);nativeAsteroidCombat.advance(s,dt);nativeSimulationFrame.end(s);
   if(i%60===0){
    for(const id of ids){const ship=nativeNpcLives.find(s,id),old=before.get(id),p=nativeNpcLives.pose(s,ship);if(Math.hypot(p.x-old.x,p.y-old.y)>1)__jam.moved.add(id);if((ship.deliveries||0)>old.deliveries)__jam.delivered.add(id);if(ship.journey||ship.system!==1||ship.port!==3)__jam.rerouted.add(id);}
    const earth=Object.values(s.portDocking.ships).filter(r=>r.system===1&&r.port===3),queue=earth.filter(r=>r.kind==='queue');__jam.maxQueue=Math.max(__jam.maxQueue,queue.length);__jam.check(queue.length<=12,'Unbounded Earth docking queue');
    for(const r of earth)if(r.kind==='berth')__jam.leases.add(r.owner+':'+r.ticket);
   }
  }
  __jam.check(s.civilianTraffic.ships.length===__jam.initialCount,'Observer spawned or removed NPCs');
 };
 __jam.inspect=(id,local)=>{
  const s=nativeNpcDev.getState(),ship=nativeNpcLives.find(s,id),before=JSON.stringify(ship);
  nativeNpcDev.showMap();nativeGalaxyOverview.snapshot(s);nativeGalaxyOverview.select(id);nativeGalaxyOverview.track(id);
  let row=nativeGalaxyOverview.snapshot(s).ships.find(s=>s.id===id),point=nativeNpcLives.galaxyPosition(s,ship);
  __jam.check(Math.hypot(row.position.x-point.x,row.position.y-point.y)<.001,'Map/local position disagreement');
  if(local){nativeNpcDev.visit(id);__jam.check(JSON.stringify(ship)===before,'Local inspection altered the NPC');}
  else{const canvas=document.querySelector('#space'),ctx=canvas.getContext('2d');nativeGalaxyOverview.paint(ctx,nativeView.fit(canvas,ctx),s);__jam.check(JSON.stringify(ship)===before,'Map painting altered the NPC');}
  __jam.check(s.civilianTraffic.ships.length===159,'Opening inspector spawned NPCs');
  return row;
 };
 __jam.snapshot=()=>{
  const s=nativeNpcDev.getState(),ships=s.civilianTraffic.ships,record={seconds:nativeSimulation.seconds(s)-1800,moved:__jam.moved.size,delivered:__jam.delivered.size,rerouted:__jam.rerouted.size,waitingPayment:ships.filter(x=>x.task?.phase==='waiting-payment').length,maxQueue:__jam.maxQueue,earthLeases:__jam.leases.size,backlog:nativeNpcLives.metrics(s).backlog};__jam.series.push(record);return record;
 };
 return {stuck:ids.length,ids,count:s.civilianTraffic.ships.length};
}"""

def main():
    OUTPUT.mkdir(exist_ok=True)
    saved=json.loads((ROOT/'tests/fixtures/earth-jam-c415.json').read_text())
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    report={'scenarios':{},'errors':[]}
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850})
            page.add_init_script("""(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(t=>{if(fn.name==='draw'){window.__jamDraw=fn;window.__jamTime=t;if(window.__jamFrozen)return;}fn(t);});})();""")
            page.on('pageerror',lambda e:report['errors'].append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('startNativeDevGame()')
            page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length')
            page.evaluate('()=>{window.__jamFrozen=true;window.requestAnimationFrame=()=>0;}')
            # Exercise the real lot selector/buttons, not only calculation APIs.
            page.evaluate("""()=>{const s=nativeNpcDev.getState();window.__retailState=s;Object.assign(s,{devMode:false,shipType:4,system:1,localBody:3,localCruise:null,latinum:100000,solFreightHold:{}});const m=nativeNpcLives.market(s,1,3);m.stock[6]=120;m.reserved[6]=0;m.incoming[6]=0;m.fundsReserved=0;window.__retailBank=m.credits;}""")
            page.locator('#tradeBtn').click()
            page.locator('#freight-lot').select_option('100')
            buy=int(page.locator('[data-freight-buy="6"]').get_attribute('data-quote'))
            assert buy==4890,buy
            page.locator('[data-freight-buy="6"]').click()
            sell=int(page.locator('[data-freight-sell="6"]').get_attribute('data-quote'))
            assert sell==3961,sell
            page.locator('[data-freight-sell="6"]').click()
            retail=page.evaluate("""()=>{const s=__retailState,m=nativeNpcLives.market(s,1,3);return {wallet:s.latinum,treasuryChange:m.credits-__retailBank,stock:m.stock[6],hold:s.solFreightHold[6]};}""")
            assert retail=={'wallet':99071,'treasuryChange':929,'stock':120,'hold':0},retail
            report['retail']=retail
            page.locator('.hub-close').click()
            page.evaluate('__retailState.devMode=true')
            for mode in ('local','map'):
                initial=page.evaluate(SETUP,saved)
                assert initial['stuck']==36 and initial['count']==159
                page.evaluate('(local)=>__jam.inspect(__jam.ids[0],local)',mode=='local')
                page.screenshot(path=str(OUTPUT/f'earth-jam-{mode}-before.png'))
                for chunk in range(60):
                    page.evaluate('()=>__jam.tick(30)')
                    if chunk in (0,3,9,19,39,59):
                        page.evaluate('()=>__jam.snapshot()')
                        page.evaluate('(local)=>__jam.inspect(__jam.ids[0],local)',mode=='local')
                        if mode=='local':
                            page.evaluate('()=>{const clock=window.nativeSimulation;window.nativeSimulation={...clock,advance:()=>0};try{__jamDraw(__jamTime);}finally{window.nativeSimulation=clock;}}')
                end=page.evaluate('()=>__jam.snapshot()')
                assert end['moved']==36 and end['waitingPayment']<10 and end['backlog']==0,end
                assert end['earthLeases']>4,end
                page.screenshot(path=str(OUTPUT/f'earth-jam-{mode}-after.png'))
                report['scenarios'][mode]={'initial':initial,'final':end,'series':page.evaluate('__jam.series')}
            assert not report['errors'],report['errors']
            browser.close()
    finally:
        server.shutdown()
        (OUTPUT/'earth-jam-browser.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report))

if __name__=='__main__':
    main()
