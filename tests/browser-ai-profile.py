"""Untimed JS sampling profile of the unchanged crowded-combat save fixture."""
import argparse
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'
spec=importlib.util.spec_from_file_location('stability',ROOT/'tests/browser-stability.py')
stability=importlib.util.module_from_spec(spec);spec.loader.exec_module(stability)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url');parser.add_argument('--label',default='after');parser.add_argument('--seconds',type=float,default=12)
    args=parser.parse_args()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=None
    if args.base_url:base=args.base_url.rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
    OUT.mkdir(exist_ok=True)
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,channel='msedge');page=browser.new_page(viewport={'width':1280,'height':850})
            page.add_init_script('('+stability.INSTRUMENT+')()');page.goto(base+'/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate(stability.INSTALL)
            page.wait_for_function('()=>nativeCivilianTraffic.effectsReady() && !nativeShipEffects.metrics().pending',timeout=120000)
            page.evaluate(stability.SETUP,{'saved':(OUT/'npc-performance-initial-save.json').read_text(),'mode':'crowdedCombat'})
            page.wait_for_timeout(2000)
            cdp=page.context.new_cdp_session(page);cdp.send('Profiler.enable');cdp.send('Profiler.start')
            page.evaluate('()=>{__stability.frames=[];__stability.record=true;}');page.wait_for_timeout(args.seconds*1000)
            profile=cdp.send('Profiler.stop')['profile']
            frames=page.evaluate('()=>{__stability.record=false;return __stability.frames;}')
            (OUT/f'ai-profile-{args.label}.json').write_text(json.dumps(profile),encoding='utf-8')
            report={'frames':stability.summarize(frames),'traffic':page.evaluate('nativeShipTraffic.snapshot(nativeNpcDev.getState())')}
            browser.close()
        nodes={n['id']:n for n in profile['nodes']};parents={child:n['id'] for n in profile['nodes'] for child in n.get('children',[])};totals={}
        for sample,dt in zip(profile['samples'],profile['timeDeltas']):
            while sample:
                frame=nodes[sample]['callFrame'];key=(frame['functionName'],frame['url'].split('/')[-1],frame['lineNumber']+1)
                totals[key]=totals.get(key,0)+dt/1000;sample=parents.get(sample)
        report['inclusiveCpuMs']=[{'function':key[0],'file':key[1],'line':key[2],'ms':round(ms,2)} for key,ms in sorted(totals.items(),key=lambda item:-item[1])[:40]]
        (OUT/f'ai-profile-{args.label}-summary.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report,indent=2))
    finally:
        if server:server.shutdown();server.server_close()

if __name__=='__main__':main()
