"""Untimed diagnostic trace: decoding, canvas/pixel, JS, raster and GPU work."""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url')
    parser.add_argument('--label',default='after')
    args=parser.parse_args()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=None
    if args.base_url:base=args.base_url.rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
    OUT.mkdir(exist_ok=True)
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
            page=browser.new_page(viewport={'width':1280,'height':850})
            cdp=page.context.new_cdp_session(page)
            finished=[]
            cdp.on('Tracing.tracingComplete',lambda e:finished.append(e))
            cdp.send('Tracing.start',{'categories':'devtools.timeline,v8.execute,loading,cc,gpu,blink,disabled-by-default-devtools.timeline','transferMode':'ReturnAsStream'})
            page.goto(base+'/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.locator('[data-menu="new"]').click()
            page.locator('#setup-ui .setup-primary').click()
            page.locator('#setup-ui .setup-primary').click()
            page.wait_for_function('()=>nativeOpeningCinematic.active')
            page.locator('[data-film-action="skip"]').click()
            page.keyboard.down('w');page.wait_for_timeout(200);page.keyboard.up('w')
            page.wait_for_timeout(10000)
            cdp.send('Tracing.end')
            for _ in range(100):
                if finished:break
                page.wait_for_timeout(100)
            assert finished,'Browser did not finish diagnostic trace'
            handle=finished[0]['stream'];parts=[]
            while True:
                chunk=cdp.send('IO.read',{'handle':handle});parts.append(chunk['data'])
                if chunk.get('eof'):break
            cdp.send('IO.close',{'handle':handle})
            raw=''.join(parts)
            (OUT/f'startup-trace-{args.label}.json').write_text(raw,encoding='utf-8')
            totals={}
            for event in json.loads(raw)['traceEvents']:
                if event.get('ph')!='X' or not event.get('dur'):continue
                name=event['name'];row=totals.setdefault(name,{'events':0,'totalMs':0,'maxMs':0})
                ms=event['dur']/1000;row['events']+=1;row['totalMs']+=ms;row['maxMs']=max(row['maxMs'],ms)
            (OUT/f'startup-trace-{args.label}-summary.json').write_text(json.dumps(dict(sorted(totals.items(),key=lambda item:-item[1]['totalMs'])),indent=2),encoding='utf-8')
            browser.close()
            print(json.dumps({'label':args.label,'events':sum(v['events'] for v in totals.values()),'passed':True}))
    finally:
        if server:server.shutdown();server.server_close()

if __name__=='__main__':main()
