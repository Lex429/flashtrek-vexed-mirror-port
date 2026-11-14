"""Inline shop quotes, atomic purchases, tier caps, placement, previews and scroll retention."""
from mars_shop_support import *
with shop('mars-inline-upgrades') as (page,report,out):
 assert page.locator('.mars-upgrade-choice .mars-shop-buy').count()==9;stats(page)
 page.screenshot(path=str(out/'01-scrolling-shop.png'))
 for kind in KINDS:
  q=quote(page,kind);tile=card(page,kind);tile.scroll_into_view_if_needed();tiers(page,kind)
  original=snapshot(page);tile.locator('h2').click();assert snapshot(page)==original
  assert page.locator('.mars-upgrade-detail').count()==0
  for key,amount in {'latinum':q['price'],**q['materials']}.items():
   row=tile.locator(f'[data-upgrade-cost="{key}"]');held=page.evaluate('key=>key==="latinum"?__gearState.latinum:nativeRegionalMinerals.held(__gearState,key)',key)
   assert float(row.get_attribute('data-cost'))==amount and float(row.get_attribute('data-held'))==held
   assert float(row.locator('.mars-shop-need b').inner_text().replace(',',''))==amount
   assert float(row.locator('.mars-shop-have b').get_attribute('title').replace(',',''))==held
  if kind in ['hull','shield','cargo','engine']:assert chr(8594) in page.locator(f'[data-ship-stat="{kind}"]').inner_text()
  assert not fits(page,kind),(kind,fits(page,kind))
 # All nine families purchase through the shared owner; no card opens a page.
 rich(page);page.evaluate('()=>__gearState.hull=nativeShipDefinitions.forEntity(__gearState).hull*.6')
 page.evaluate('''()=>document.querySelector('#shipyard-services').addEventListener('click',event=>{const control=event.target.closest('.mars-shop-buy');if(control){const b=control.closest('[data-upgrade-card]').getBoundingClientRect();window.__purchaseOrigin={scroll:document.querySelector('.yard-catalog').scrollTop,y:b.y,height:b.height};}},true)''')
 receipts=[]
 for kind in KINDS:
  control=buy(page,kind);control.scroll_into_view_if_needed();q=quote(page,kind);before=snapshot(page)
  control.click();after=snapshot(page);assert quote(page,kind)['level']==q['level']+1
  origin=page.evaluate('window.__purchaseOrigin')
  assert after['latinum']==before['latinum']-q['price']
  for key,amount in q['materials'].items():assert (after['dilithium'] if key=='dilithium' else after['minerals'][key])==(before['dilithium'] if key=='dilithium' else before['minerals'][key])-amount
  assert abs(page.locator('.yard-catalog').evaluate('n=>n.scrollTop')-origin['scroll'])<1,(kind,origin)
  actual=card(page,kind).bounding_box();assert abs(actual['y']-origin['y'])<1 and abs(actual['height']-origin['height'])<1,(kind,origin,actual)
  assert page.locator('.mars-install-fx').count()==1;tiers(page,kind);receipts.append(kind)
  page.evaluate('()=>nativeMarsUpgradeEffects.stop(document.querySelector("#shipyard-services"))')
 # The family caps remain independent, including progression past the old point limit.
 for kind in ['hull','shield']:
  while quote(page,kind)['level']<quote(page,kind)['max']:
   buy(page,kind).click();tiers(page,kind)
  assert buy(page,kind).is_disabled() and 'Fully upgraded' in buy(page,kind).inner_text()
 # Failed durable saves preserve resources, bars and the same visible shop.
 buy(page,'engine').scroll_into_view_if_needed();before=snapshot(page)
 page.evaluate("()=>{window.__realWrite=nativeSaveStorage.write;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:'Test save failure'})};}")
 buy(page,'engine').click();assert snapshot(page)==before and page.locator('.mars-install-fx').count()==0;tiers(page,'engine')
 assert 'Test save failure' in page.locator('.yard-note').inner_text()
 page.evaluate('()=>window.nativeSaveStorage={...nativeSaveStorage,write:__realWrite}')
 # Optional bay positioning stays in the same scrolling shop and cancellation is free.
 tile=card(page,'dot');before=snapshot(page);tile.locator('.mars-shop-position').click()
 assert page.locator('.outfit-ghost').count()==1 and page.locator('.mars-upgrade-choice').count()==9
 tile.locator('.mars-shop-position').click();assert snapshot(page)==before and page.locator('.outfit-ghost').count()==0
 tile.locator('.mars-shop-position').click();page.locator('[data-place-bay="5"][data-bay-zone="drones"]').click();buy(page,'dot').click()
 assert page.evaluate('()=>nativeShipEquipment.bayLayout(__gearState).bays.find(b=>b.category==="repairDrone"&&b.index===2).cell')==5
 assert page.evaluate('()=>__gearState.shipEquipment.slots.repairDrone[2]') is None
 # Removal keeps the same owned equipment and returns no resources.
 before_money=page.evaluate('__gearState.latinum');card(page,'engine').locator('.mars-shop-remove').click()
 assert page.evaluate('__gearState.latinum')==before_money and quote(page,'engine')['level']==0;tiers(page,'engine')
 saved=snapshot(page);page.evaluate("()=>{if(!nativeSaveStorage.write(__gearState).ok)throw Error('Save failed');resumeNativeGame('normal');}")
 page.wait_for_function('()=>nativeShipyardServices.active&&nativeShipyardServices.docked');assert snapshot(page)==saved
 stats(page);page.screenshot(path=str(out/'02-installed-shop.png'))
 report.update(purchases=receipts,exactQuotes=True,exactCharges=True,tierCaps=True,noExtraPage=True,scrollRetained=True,saveRollback=True,bayPositionAndContinue=True,allFourStatsVisible=True)
