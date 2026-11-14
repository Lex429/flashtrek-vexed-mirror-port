"""First-stage shop purchases and per-copy recharge upgrades through the actual UI."""
from mars_shop_support import *
def weapon_card(page,id):return page.locator(f'.mars-owned-weapon[data-weapon-instance="{id}"]')
def grade_quote(page,id):return page.evaluate("id=>{const q=nativeShipyardRefits.weaponQuote(__gearState,id);return {level:q.level,max:q.max,price:q.price,materials:q.materials,before:q.before.recharge/13,after:q.after.recharge/13};}",id)
def stop(page):page.evaluate('()=>nativeMarsUpgradeEffects.stop(document.querySelector("#shipyard-services"))')
with shop('weapon-progression') as (page,report,out):
 page.locator('[data-yard-tab="weapons"]').click()
 offers=page.locator('[data-weapon-model]');assert offers.count()==9
 for row in offers.all():
  assert row.get_attribute('data-weapon-stage')=='I'
  assert row.locator('strong').first.inner_text().endswith(' I')
 # Buy two identical base weapons from the unchanged Weapons shop.
 for _ in range(2):page.locator('[data-yard-action="buy"][data-model="1002"]').click()
 copies=page.evaluate("()=>nativeShipEquipment.ownedWeapons(__gearState).filter(v=>v.instance.modelId===1002).map(v=>v.instance.id)")
 assert len(copies)==2;first,second=copies
 page.evaluate("ids=>{const s=__gearState,eq=s.shipEquipment;nativeShipEquipment.move(s,{category:'weapon',fromType:'locker',fromIndex:eq.locker.indexOf(ids[0]),toType:'slot',toIndex:1});eq.instances[ids[0]].readyAt=111;eq.instances[ids[1]].readyAt=77;}",copies)
 page.locator('[data-yard-tab="upgrades"]').click();page.locator('.mars-upgrade-jumps [data-yard-jump="weapons"]').click()
 assert page.locator('.mars-owned-weapon').count()==3
 assert 'Weapon bay 2' in weapon_card(page,first).inner_text() and 'Stored in Inventory' in weapon_card(page,second).inner_text()
 assert weapon_card(page,first).locator('.installed').count()==1
 page.screenshot(path=str(out/'01-owned-weapons.png'))
 # Improve the fitted copy only, through both paid stages.
 for wanted in [2,3]:
  q=grade_quote(page,first);before=snapshot(page)
  weapon_card(page,first).locator('.mars-shop-buy').click()
  after=snapshot(page);assert after['latinum']==before['latinum']-q['price']
  for key,n in q['materials'].items():assert (after['dilithium'] if key=='dilithium' else after['minerals'][key])==(before['dilithium'] if key=='dilithium' else before['minerals'][key])-n
  assert grade_quote(page,first)['level']==wanted and grade_quote(page,second)['level']==1
  assert page.evaluate('id=>__gearState.shipEquipment.instances[id].readyAt',first)==111
  assert page.evaluate('id=>__gearState.shipEquipment.slots.weapon[1]===id',first)
  assert weapon_card(page,first).locator('.installed').count()==wanted
  hud=page.evaluate("()=>{vexedHud.frame(__gearState,{dt:0});return vexedHud.snapshot().weapons.find(w=>w.slot===1);}")
  assert abs(hud['recharge']-q['after'])<1e-12 and hud['instanceId']==first
  fx=page.locator('.mars-install-fx[data-weapon-upgrade]');assert fx.count()==1
  assert abs(float(fx.get_attribute('data-before'))-q['before'])<1e-12 and abs(float(fx.get_attribute('data-after'))-q['after'])<1e-12
  assert float(fx.get_attribute('data-after'))<float(fx.get_attribute('data-before'))
  stop(page)
 assert weapon_card(page,first).locator('.mars-shop-buy').is_disabled()
 assert weapon_card(page,first).locator('h2').inner_text()=='Phaser Array X'
 # A stored copy improves in Inventory without fitting itself or changing its duplicate.
 q=grade_quote(page,second);weapon_card(page,second).locator('.mars-shop-buy').click();stop(page)
 assert grade_quote(page,second)['level']==2 and grade_quote(page,first)['level']==3
 assert 'Stored in Inventory' in weapon_card(page,second).inner_text()
 assert page.evaluate('id=>__gearState.shipEquipment.locker.includes(id)',second)
 assert page.evaluate('id=>__gearState.shipEquipment.instances[id].readyAt',second)==77
 # Failed persistence cannot spend resources or light another stage.
 before=snapshot(page);page.evaluate("()=>{window.__realWrite=nativeSaveStorage.write;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:'Weapon save rejected'})};}")
 weapon_card(page,second).locator('.mars-shop-buy').click();assert snapshot(page)==before
 assert weapon_card(page,second).locator('.installed').count()==2 and page.locator('.mars-install-fx').count()==0
 page.evaluate('()=>window.nativeSaveStorage={...nativeSaveStorage,write:__realWrite}')
 # Continue restores the same weapon identities, grades, locations and deadlines.
 saved=snapshot(page);page.evaluate("()=>{if(!nativeSaveStorage.write(__gearState).ok)throw Error('Save failed');resumeNativeGame('normal');}")
 page.wait_for_function('()=>nativeShipyardServices.active&&nativeShipyardServices.docked');assert snapshot(page)==saved
 assert weapon_card(page,first).locator('h2').inner_text()=='Phaser Array X'
 # Inventory uses the same graded name and recharge; unequipping retains the grade.
 page.evaluate('()=>{nativeShipyardServices.close();nativeShipInventory.open();}')
 slot=page.locator('#ship-inventory [data-equipment-place="slot"][data-equipment-kind="weapon"][data-equipment-index="1"]')
 slot.click();assert page.locator('#ship-inventory .inventory-detail-heading strong').inner_text()=='Phaser Array X'
 recharge=page.locator('#ship-inventory .inventory-detail-stats>div').filter(has_text='Recharge').locator('strong').inner_text()
 assert abs(float(recharge.replace(' s',''))-grade_quote(page,first)['before'])<.001
 page.locator('#ship-inventory [data-equipment-action="unequip"]').click()
 assert page.evaluate('id=>__gearState.shipEquipment.locker.includes(id)&&nativeShipEquipment.weaponGrade(__gearState.shipEquipment.instances[id])===2',first)
 page.evaluate('()=>{nativeShipInventory.close();nativeShipyardServices.select();}')
 assert 'Stored in Inventory' in weapon_card(page,first).inner_text()
 page.locator('.mars-upgrade-jumps [data-yard-jump="weapons"]').click();page.screenshot(path=str(out/'02-upgraded-copies.png'))
 # Every offered family, plus a long legacy family, fits in the owned section.
 page.evaluate("()=>{for(const m of nativeShipyardRefits.weapons)nativeShipEquipment.grant(__gearState,m.id);nativeShipEquipment.grant(__gearState,18);nativeShipyardServices.render();}")
 cases=[]
 for w,h,mode in [(1440,1000,'widescreen'),(800,600,'widescreen'),(390,844,'widescreen'),(900,1000,'classic')]:
  page.set_viewport_size({'width':w,'height':h});page.evaluate('mode=>{document.body.dataset.view=mode;nativeShipyardServices.render();}',mode);page.wait_for_timeout(250)
  ids=page.evaluate('()=>nativeShipEquipment.ownedWeapons(__gearState).map(v=>v.instance.id)')
  for id in ids:
   tile=weapon_card(page,id);tile.scroll_into_view_if_needed();assert not fits(page,'equipment:'+id),(w,h,mode,id,fits(page,'equipment:'+id))
  stats(page);cases.append({'width':w,'height':h,'mode':mode})
  page.screenshot(path=str(out/f'owned-{w}x{h}-{mode}.png'))
  rich(page)
  fresh=page.evaluate("()=>{const result=nativeShipEquipment.grant(__gearState,18);nativeShipyardServices.render();return result.instance.id;}")
  weapon_card(page,fresh).locator('.mars-shop-buy').click()
  fx=page.locator('.mars-install-fx[data-weapon-upgrade]');assert fx.count()==1
  assert fx.locator('.mars-install-message>strong').inner_text()=='Heavy Transphasic Torpedo Launcher V'
  assert fx.locator('.mars-install-tier-bar.installed').count()==2
  assert fx.locator('.mars-install-announcement').evaluate("""n=>{const b=n.getBoundingClientRect();return [...n.querySelectorAll('strong,small')].every(t=>{const r=document.createRange();r.selectNodeContents(t);const a=r.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;});}"""),(w,h,mode,'weapon receipt clipped')
  page.wait_for_timeout(650);page.screenshot(path=str(out/f'weapon-install-{w}x{h}-{mode}.png'));stop(page)

 page.emulate_media(reduced_motion='reduce')
 rich(page);fresh=page.evaluate("()=>{const r=nativeShipEquipment.grant(__gearState,1002);nativeShipyardServices.render();return r.instance.id;}")
 weapon_card(page,fresh).locator('.mars-shop-buy').click()
 assert page.locator('.mars-install-fx').evaluate('n=>n.getAnimations({subtree:true}).length')==0
 assert weapon_card(page,fresh).locator('[data-installed-upgrade="tier"]').evaluate('n=>n.getAnimations().length')==0
 stop(page)
 # The empty section never advertises weapons the player does not own.
 page.evaluate("()=>{const eq=__gearState.shipEquipment;for(const id of Object.keys(eq.instances))if(eq.instances[id].category==='weapon'){eq.slots.weapon=eq.slots.weapon.map(v=>v===id?null:v);eq.locker=eq.locker.filter(v=>v!==id);delete eq.instances[id];}nativeShipyardServices.render();}")
 assert page.locator('.mars-owned-weapon').count()==0 and page.locator('.mars-no-weapons').is_visible()
 report.update(baseOnlyShop=True,ownedOnly=True,independentCopies=True,realRecharge=True,equippedAndStored=True,exactCharges=True,saveRollback=True,continuePreservesGrades=True,inventoryInspector=True,cases=cases)
