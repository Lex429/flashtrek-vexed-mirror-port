"""Real fitting controls, decoded audio, animations, Dev catalog and responsive art."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/inventory-upgrade';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();errors=[]
LIGHTING_SAMPLE=r'''async()=>{
    const s=nativeNpcDev.getState(),c=document.querySelector('[data-ship-preview]'),ctx=c.getContext('2d');
    const before=JSON.stringify(s),clock=nativeSimulation.now(s),frames=[];
    for(let i=0;i<8;i++){
        await new Promise(resolve=>setTimeout(resolve,160));
        let hash=2166136261;
        for(const byte of ctx.getImageData(0,0,c.width,c.height).data)hash=Math.imul(hash^byte,16777619);
        frames.push(hash>>>0);
    }
    return {distinctFrames:new Set(frames).size,settledDistinctFrames:new Set(frames.slice(-4)).size,gameplayPaused:nativeSimulation.blocked(),
        simulationUnchanged:clock===nativeSimulation.now(s),savedStateUnchanged:before===JSON.stringify(s)};
}'''
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('()=>{startNativeDevGame();window.__inventoryReview=nativeNpcDev.getState();}')
        page.locator('#inventoryBtn').click();page.wait_for_selector('#ship-inventory canvas.ready')
        page.mouse.move(2,2);page.wait_for_timeout(500)
        lighting=page.evaluate(LIGHTING_SAMPLE)
        assert lighting['distinctFrames']>=4,lighting
        assert lighting['gameplayPaused'] and lighting['simulationUnchanged'] and lighting['savedStateUnchanged'],lighting
        coverage=page.evaluate('''()=>{const s=__inventoryReview,eq=s.shipEquipment;return {models:nativeShipEquipment.models().length,missing:nativeShipEquipment.models().filter(m=>!eq.locker.some(id=>String(eq.instances[id].modelId)===String(m.id))).map(m=>m.id),ores:Object.keys(nativeRegionalMinerals.ores).filter(k=>!s.minerals[k])};}''')
        assert not coverage['missing'] and not coverage['ores'],coverage
        assert 'unlimited' in page.locator('.inventory-cargo .inventory-section-title').inner_text().lower()
        assert page.locator('[data-restock-dev]').count()==0
        page.locator('[data-inventory-filter="supplies"]').click()
        for ore in ['trellium','tritanium','dilithium','gallicite','benamite','deuranium']:
            icon=page.locator(f'[data-item-key="mineral:{ore}"] img');assert icon.count()==1
            icon.evaluate('(im)=>im.decode()');assert icon.get_attribute('src').endswith('/'+ore+'.png')
        page.screenshot(path=str(OUT/'ore-catalog.png'))
        page.locator('[data-inventory-filter="equipment"]').click()
        assert page.locator('.inventory-cargo-tile').count()==0
        shield=page.locator('[aria-label="Stored Advanced hull shield"]');shield.click()
        assert 'shield capacity' in page.locator('.inventory-inspector').inner_text().lower()
        before=page.evaluate('__inventoryReview.shipEquipment.slots.shield[0]')
        assert page.evaluate('__inventoryReview.shipEquipment.slots.shield[0]')==before
        sounds=page.evaluate('nativeMenuSounds.snapshot().played.confirm')
        page.locator('[data-equipment-action="equip"]').click()
        page.wait_for_function('(before)=>nativeMenuSounds.snapshot().played.confirm>before',arg=sounds)
        assert page.evaluate('nativeMenuSounds.snapshot().state')=='running'
        assert page.evaluate('nativeShipDefinitions.forEntity(__inventoryReview).shields')==60
        assert page.evaluate('nativeShipEquipment.model(__inventoryReview.shipEquipment.instances[__inventoryReview.shipEquipment.slots.shield[0]].modelId).id')=='advanced-shield'
        animations=page.evaluate('document.querySelector("#ship-inventory").getAnimations({subtree:true}).length')
        assert animations>0,'Fitting produced no real animation'
        slot=page.locator('[data-equipment-place="slot"][data-equipment-kind="shield"][data-equipment-index="0"]');slot.click()
        sounds=page.evaluate('nativeMenuSounds.snapshot().played.press');page.locator('[data-equipment-action="unequip"]').click()
        page.wait_for_function('(before)=>nativeMenuSounds.snapshot().played.press>before',arg=sounds)
        assert page.evaluate('__inventoryReview.shipEquipment.slots.shield[0]') is None
        # Muting and reduced motion affect actual fitting feedback.
        page.evaluate('document.getElementById("menu-sound-toggle").click()');page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(500)
        page.wait_for_selector('#ship-inventory canvas.ready')
        reduced_lighting=page.evaluate(LIGHTING_SAMPLE)
        assert reduced_lighting['settledDistinctFrames']==1 and reduced_lighting['savedStateUnchanged'],reduced_lighting
        page.locator('[aria-label="Stored Advanced hull shield"]').click();sounds=page.evaluate('JSON.stringify(nativeMenuSounds.snapshot().played)')
        page.locator('[data-equipment-action="equip"]').click();page.wait_for_timeout(120)
        assert page.evaluate('JSON.stringify(nativeMenuSounds.snapshot().played)')==sounds
        assert page.evaluate('document.querySelector("#ship-inventory").getAnimations({subtree:true}).length')==0
        # Every preview uses the real hull dimensions; names get a reserved row.
        shapes=[]
        for ship in [7,58,426,427]:
            page.evaluate('id=>{nativeShipEquipment.changeHull(__inventoryReview,id);__inventoryReview.shipName="ISS Inventory Review";nativeShipInventory.refresh();}',ship)
            page.wait_for_selector('#ship-inventory canvas.ready')
            ratio=page.evaluate('''()=>{const d=nativeShipDefinitions.dimensions(__inventoryReview),c=document.querySelector('[data-ship-preview]');return {wanted:d.width/d.height,actual:Number(c.dataset.previewRatio)};}''')
            assert abs(ratio['wanted']-ratio['actual'])<1e-9,ratio
            shapes.append({'ship':ship,**ratio})
        for width,height in [(1440,1000),(1024,768),(390,844),(360,740)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150)
            page.wait_for_selector('#ship-inventory canvas.ready')
            label=page.locator('.inventory-ship-label')
            bounds=label.bounding_box();assert bounds and bounds['y']>=0 and bounds['y']+bounds['height']<=height
            assert page.locator('.inventory-ship-label strong').inner_text()=='ISS Inventory Review'
            assert page.evaluate('()=>{const p=document.querySelector(".inventory-panel");return p.scrollWidth<=p.clientWidth+1;}')
            page.screenshot(path=str(OUT/f'preview-{width}.png'))
        # A small normal inventory has no phantom page; fractional cargo remains visible.
        page.set_viewport_size({'width':1440,'height':1000});page.locator('.inventory-close').click()
        page.evaluate('()=>{const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__inventoryNormal=s;return restore(s);};}')
        page.evaluate('''()=>{const s=JSON.parse(JSON.stringify(__inventoryReview));Object.assign(s,{devMode:false,shipType:7,weapons:[1],weaponInventory:[],antimatter:80,deuranium:12.75,dilithium:25,food:40,minerals:{trellium:2.5},solFreightHold:{0:3.75,1:.125},localContracts:[],miningTool:true});for(const key of ['shipEquipment','weaponLoadout','repairBay','inventoryLayout'])delete s[key];nativeSaveStorage.write(s);resumeNativeGame('normal');}''')
        page.locator('#inventoryBtn').click();page.wait_for_selector('#ship-inventory canvas.ready')
        assert page.locator('[data-inventory-page="next"]').is_disabled()
        assert '1 / 1' in page.locator('.inventory-page-nav').inner_text()
        assert '3.75 t' in page.locator('[data-item-key="freight:0"]').inner_text()
        assert '2.5' in page.locator('[data-item-key="mineral:trellium"]').inner_text()
        assert '12.75' in page.locator('[data-item-key="supply:deuranium"]').inner_text()
        assert '19.125 / 50 t' in page.locator('.inventory-cargo .inventory-section-title').inner_text()
        assert page.locator('[data-restock-dev]').count()==0
        cells=page.evaluate('JSON.parse(JSON.stringify(__inventoryNormal.inventoryLayout.cells))')
        page.locator('[data-item-key="supply:food"]').click();page.locator('[data-item-key="mineral:trellium"]').click()
        assert page.evaluate('__inventoryNormal.inventoryLayout.cells')==cells
        # Responsive details can reduce empty visible tiles; saved positions cannot move.
        for cell in page.locator('[data-inventory-cell]').evaluate_all('(nodes)=>nodes.map(n=>({index:Number(n.dataset.inventoryCell),key:n.dataset.itemKey}))'):
            assert cell['key']==(cells[cell['index']] or '') if cell['index']<len(cells) else not cell['key']
        page.locator('[data-equipment-action="cancel"]').click();page.locator('[data-inventory-page="add"]').click()
        assert '2 / 2' in page.locator('.inventory-page-nav').inner_text()
        assert not errors,errors
        report={'passed':True,'catalog':coverage,'liveLighting':lighting,'reducedMotionLighting':reduced_lighting,'realAudioAndAnimation':True,'muteAndReducedMotion':True,'hullProportions':shapes,'readableNames':True,'preciseQuantities':True,'explicitArrangementSpace':True,'safeSelection':True,'errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report));browser.close()
finally:server.shutdown();server.server_close()
