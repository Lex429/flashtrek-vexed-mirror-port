"""Scrolling shop layout and pinned ship/equipment across desktop, Classic and phone sizes."""
from mars_shop_support import *
with shop('mars-material-layout') as (page,report,out):
 page.evaluate("""()=>{Object.assign(__gearState,{latinum:1234567890123,dilithium:1000000000,minerals:{...__gearState.minerals,tritanium:1234567890,gallicite:2}});nativeShipyardServices.render();}""")
 cases=[]
 for w,h,mode in [(2560,1389,'widescreen'),(1920,936,'widescreen'),(1366,768,'widescreen'),(1280,720,'widescreen'),(1280,600,'widescreen'),(1024,600,'widescreen'),(960,540,'widescreen'),(800,600,'widescreen'),(1440,700,'classic'),(900,1000,'classic'),(390,844,'widescreen')]:
  page.set_viewport_size({'width':w,'height':h});page.evaluate('mode=>{document.body.dataset.view=mode;nativeShipyardServices.render();}',mode);page.wait_for_timeout(250)
  pane=page.locator('.yard-catalog');pane.evaluate('n=>n.scrollTop=0');page.wait_for_timeout(80);stats(page)
  assert pane.evaluate('n=>n.scrollHeight>n.clientHeight&&n.scrollWidth<=n.clientWidth+1')
  ship=page.locator('.yard-vessel-title').bounding_box();page.screenshot(path=str(out/f'shop-top-{w}x{h}-{mode}.png'))
  for kind in KINDS:
   tile=card(page,kind);tile.scroll_into_view_if_needed();assert not fits(page,kind),(w,h,mode,kind,fits(page,kind))
   buy(page,kind).scroll_into_view_if_needed();assert buy(page,kind).is_visible()
   assert page.locator('.yard-vessel-title').bounding_box()==ship
   assert page.locator('.yard-vessel').evaluate('n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1')
   tiers(page,kind)
  page.screenshot(path=str(out/f'shop-bottom-{w}x{h}-{mode}.png'));cases.append({'width':w,'height':h,'mode':mode})
 report.update(cases=cases,allNineCardsFit=True,fullCostsVisible=True,pinnedShip=True,noHorizontalScroll=True,onlyCatalogScrolls=True)
