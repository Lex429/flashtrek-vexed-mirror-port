"""Verify the installed portable gallery's joined ship and three modules."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

out=Path(__file__).resolve().parents[1]/'test-results/prometheus'
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
    page=browser.new_page(viewport={'width':1500,'height':1100})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:7788/html-games/flashtrek-broken-mirror/damage-showcase.html')
    page.wait_for_function('()=>window.showcaseState?.().ready',timeout=90000)
    entries=[]
    for id in [37,3701,3702,3703]:
        page.locator('#ship-select').select_option(str(id))
        page.wait_for_function('()=>showcaseState().ready',timeout=90000)
        for stage in range(4):
            page.locator(f'button[data-stage="{stage}"]').click()
            page.wait_for_function('(stage)=>showcaseState().stage===stage',arg=stage)
        state=page.evaluate('showcaseState()');assert state['enhancedEffects'] is not None,id
        entries.append({'id':id,'stage':state['stage'],'enhancedEffects':True})
        if id==37:page.screenshot(path=str(out/'showcase-critical.png'))
    page.locator('#ship-select').select_option('37');page.wait_for_function('()=>showcaseState().ready')
    page.screenshot(path=str(out/'showcase-joined.png'))
    assert not errors,errors
    report={'passed':True,'entries':entries,'errors':errors}
    (out/'showcase-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report));browser.close()
