"""Verify actual hull ratios, shared zoom, roster controls and isolated storage."""
import csv
import io
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/ship-scale'
OUTPUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:7790/html-games/broken-mirror-port/ship-scale.html'
result={'javascriptErrors':[],'failedRequests':[],'viewports':[]}

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,ignore_default_args=['--hide-scrollbars'])
    context=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=1,accept_downloads=True)
    context.add_init_script("""(()=>{
      localStorage.setItem('ship-scale-save-sentinel','untouched');
      window.__scaleStorageWrites=[];
      for(const name of ['setItem','removeItem','clear']){
        const original=Storage.prototype[name];
        Storage.prototype[name]=function(...args){__scaleStorageWrites.push({name,key:args[0]});return original.apply(this,args);};
      }
    })();""")
    page=context.new_page()
    page.on('pageerror',lambda e:result['javascriptErrors'].append(str(e)))
    page.on('response',lambda r:result['failedRequests'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.goto(URL)
    page.wait_for_function('window.shipScaleAtlas?.snapshot().ready',timeout=90000)
    snapshot=page.evaluate('shipScaleAtlas.snapshot()')
    assert not snapshot['errors'],snapshot['errors']
    assert snapshot['mode']=='current'
    page.locator('[data-mode="corrected"]').click()
    assert snapshot['rosterCount']==45 and snapshot['sourceCount']==29 and snapshot['pendingCount']==16
    assert page.locator('.fleet-card').count()==45 and page.locator('#ship-table tr').count()==45
    danube=next(row for row in snapshot['rows'] if row['id']==7)
    assert snapshot['anchor']['id']==7 and snapshot['anchor']['meters']==23.1
    assert snapshot['anchor']['units']==danube['geometry']['current']['height']
    assert danube['geometry']['corrected']==danube['geometry']['current']
    assert danube['geometry']['proposedFrameHeight']==danube['dimensions']['height']
    assert danube['geometry']['changePercent']==0

    def hulls():
        return page.evaluate("""()=>Object.fromEntries([7,426,439,440,38].map(id=>{
          const node=document.querySelector('.fleet-card[data-ship="'+id+'"] canvas'),r=node.getBoundingClientRect();
          return [id,{width:r.width,height:r.height,bottom:r.bottom}];
        }))""")

    corrected=hulls()
    assert abs(corrected['439']['height']/corrected['426']['height']-343/288.6)<.001
    assert abs(corrected['440']['height']/corrected['439']['height']-642.51/343)<.001
    assert abs(corrected['439']['height']/corrected['7']['height']-343/23.1)<.02
    assert max(row['bottom'] for row in corrected.values())-min(row['bottom'] for row in corrected.values())<1
    for row in snapshot['rows']:
        canvas=page.locator(f'.fleet-card[data-ship="{row["id"]}"] canvas').bounding_box()
        size=row['geometry']['corrected'] or row['geometry']['current']
        assert abs(canvas['height']-size['height']*snapshot['zoom'])<.05,(row['id'],canvas,size)

    page.screenshot(path=str(OUTPUT/'corrected-desktop.png'),full_page=True)
    page.locator('[data-mode="current"]').click()
    current=hulls()
    for axis in ['width','height']:
        assert abs(current['7'][axis]-corrected['7'][axis])<.05,(axis,current['7'],corrected['7'])
    for ship_id in current:
        for axis in ['width','height']:
            assert current[ship_id][axis]<=corrected[ship_id][axis]+.05,(ship_id,axis,current,corrected)
    assert current['440']['height']<corrected['440']['height']
    page.screenshot(path=str(OUTPUT/'current-desktop.png'),full_page=True)
    page.locator('[data-mode="corrected"]').click()
    page.locator('#fleet-zoom').evaluate("node=>{node.value='3.2';node.dispatchEvent(new Event('input',{bubbles:true}));}")
    zoomed=hulls()
    for id in corrected:
        assert abs(zoomed[id]['height']/corrected[id]['height']-3.2/2.4)<.002
    page.locator('#reset-view').click()
    page.locator('#show-heroes').click()
    assert page.locator('.fleet-card').count()==5
    assert page.locator('#ship-table tr').count()==45
    page.screenshot(path=str(OUTPUT/'hero-comparison.png'),full_page=True)
    page.locator('#show-all').click()

    page.locator('#ship-search').fill('Voyager')
    assert page.locator('#ship-table tr').count()==1 and page.locator('.fleet-card').count()==1
    page.locator('#ship-search').fill('no-such-starship')
    assert page.locator('#table-empty').is_visible() and page.locator('.fleet-card').count()==0
    page.locator('#ship-search').fill('')
    page.locator('#reference-filter').select_option('pending')
    assert page.locator('#ship-table tr').count()==16
    assert page.locator('.fleet-card.unverified').count()==12
    assert page.locator('.fleet-card.provisional').count()==4
    page.locator('[data-inspect="416"]').click()
    assert 'Unverified' in page.locator('#ship-detail').inner_text()
    assert 'Pending' in page.locator('#ship-detail').inner_text()
    page.locator('#reference-filter').select_option('provisional')
    assert page.locator('#ship-table tr').count()==4
    page.locator('[data-inspect="49"]').click()
    assert '641 m' in page.locator('#ship-detail').inner_text()
    assert 'Closest artwork match' in page.locator('#ship-detail').inner_text()
    page.locator('[data-inspect="436"]').click()
    assert '8.5 m' in page.locator('#ship-detail').inner_text()
    assert 'does not state this length' in page.locator('#ship-detail').inner_text()
    page.locator('#reference-filter').select_option('parents')
    assert page.locator('#ship-table tr').count()==3
    page.locator('[data-inspect="47"]').click()
    detail=page.locator('#ship-detail').inner_text()
    assert 'Parent hull references only' in detail and '120 m' in detail and 'Pending' in detail
    assert page.locator('#ship-detail a[href*="probert-sizechart"]').count()==1
    with page.expect_download() as parent_download_info:
        page.locator('#export-csv').click()
    parent_rows=list(csv.DictReader(io.StringIO(Path(parent_download_info.value.path()).read_text(encoding='utf-8-sig'))))
    assert len(parent_rows)==3
    assert all(row['Reference meters']=='' and row['Corrected visible hull units']=='' for row in parent_rows)
    assert '120 m' in next(row for row in parent_rows if row['ID']=='47')['Parent hull references']
    page.locator('#reference-filter').select_option('unmatched')
    assert page.locator('#ship-table tr').count()==9
    page.locator('#reference-filter').select_option('sourced')
    assert page.locator('#ship-table tr').count()==29
    page.locator('#show-all').click()
    page.locator('#ship-search').fill('Voyager')
    with page.expect_download() as download_info:
        page.locator('#export-csv').click()
    download=download_info.value
    exported=list(csv.DictReader(io.StringIO(Path(download.path()).read_text(encoding='utf-8-sig'))))
    assert len(exported)==1 and exported[0]['ID']=='439'
    assert abs(float(exported[0]['Corrected visible hull units'])-343*snapshot['unitsPerMeter'])<1e-9
    result['export']=exported[0]
    page.locator('#show-all').click()

    for width,height in [(1440,1100),(1024,768),(768,1024),(390,844),(320,720)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('scrollTo(0,0)')
        page.wait_for_timeout(150)
        geometry=page.evaluate("""()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,
          lineupWidth:document.querySelector('#lineup-scroll').clientWidth,
          lineupContentWidth:document.querySelector('#lineup-scroll').scrollWidth,
          tableWidth:document.querySelector('.table-scroll').clientWidth,
          tableContentWidth:document.querySelector('.table-scroll').scrollWidth})""")
        assert geometry['documentWidth']<=width+1,geometry
        assert geometry['lineupContentWidth']>geometry['lineupWidth'],geometry
        if width<=768:assert geometry['tableContentWidth']>geometry['tableWidth'],geometry
        result['viewports'].append(geometry)
        page.screenshot(path=str(OUTPUT/f'viewport-{width}.png'),full_page=width>=768)

    assert page.evaluate("localStorage.getItem('ship-scale-save-sentinel')")=='untouched'
    assert page.evaluate('__scaleStorageWrites')==[]
    assert page.evaluate('typeof nativeWorldBootstrap')=='undefined'
    assert page.evaluate('typeof nativeSaveStorage')=='undefined'
    assert not result['javascriptErrors'],result['javascriptErrors']
    assert not result['failedRequests'],result['failedRequests']
    result.update(passed=True,ratios={'corrected':corrected,'current':current,'zoomed':zoomed},roster=snapshot)
    context.close();browser.close()

(OUTPUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({key:value for key,value in result.items() if key not in ['roster','export']},indent=2))
