"""All inline material requirements, stock, exact equality, shortages and reduced motion."""
from mars_shop_support import *
with shop('mars-material-clarity') as (page,report,out):
 page.evaluate("""()=>{Object.assign(__gearState,{latinum:1000,dilithium:14,minerals:{...__gearState.minerals,tritanium:16,gallicite:2}});nativeShipyardServices.render();}""")
 tile=card(page,'weapon');tile.scroll_into_view_if_needed();assert buy(page,'weapon').is_disabled()
 assert tile.locator('thead').inner_text().split()==['Resources','NEED','HAVE']
 for key,ready in [('latinum',False),('tritanium',True),('dilithium',True),('gallicite',False)]:
  row=tile.locator(f'[data-upgrade-cost="{key}"]');held=float(row.get_attribute('data-held'));cost=float(row.get_attribute('data-cost'))
  assert ('ready' in row.get_attribute('class').split())==ready
  assert float(row.locator('.mars-shop-need b').inner_text().replace(',',''))==cost
  assert float(row.locator('.mars-shop-have b').inner_text().replace(',',''))==held
  if ready:
   assert row.locator('.mars-shop-have b').evaluate('n=>getComputedStyle(n).textShadow')!='none'
   assert 'Ready' in row.locator('.mars-shop-have small').inner_text() and row.locator('.mars-resource-shortage').count()==0
  else:
   assert f'Need {int(cost-held):,} more' in row.inner_text()
   assert row.locator('.mars-resource-shortage').evaluate('n=>n.getAnimations().some(a=>a.playState==="running")')
 page.screenshot(path=str(out/'01-shortages.png'));assert not fits(page,'weapon')
 page.evaluate("""()=>{__gearState.latinum=1000000000;__gearState.minerals.tritanium=25;__gearState.minerals.deuranium=25;nativeShipyardServices.render();}""")
 tile=card(page,'cargo');tile.scroll_into_view_if_needed();assert buy(page,'cargo').is_enabled()
 assert tile.locator('[data-upgrade-cost="latinum"] .mars-shop-have b').inner_text()=='1B'
 assert tile.locator('[data-upgrade-cost="latinum"] .mars-shop-have b').get_attribute('title')=='1,000,000,000'
 assert not fits(page,'cargo');page.screenshot(path=str(out/'02-reported-cargo.png'))
 pane=page.locator('.yard-catalog');before=pane.evaluate('n=>n.scrollTop');ship=page.locator('.yard-vessel-title').bounding_box()
 pane.hover();page.mouse.wheel(0,500);page.wait_for_timeout(120);assert pane.evaluate('n=>n.scrollTop')>before
 assert page.locator('.yard-vessel-title').bounding_box()==ship
 page.emulate_media(reduced_motion='reduce');card(page,'weapon').scroll_into_view_if_needed()
 assert card(page,'weapon').locator('.mars-resource-shortage').first.evaluate('n=>n.getAnimations().length')==0
 assert card(page,'weapon').locator('.ready .mars-shop-have b').first.evaluate('n=>getComputedStyle(n).textShadow')!='none'
 stats(page);report.update(explicitNeedHave=True,equalityReady=True,exactShortages=True,onlyShortagePulses=True,largeStockTitle=True,rightSideScrollOnly=True,reducedMotion=True)
