"""Retained layout measurements follow actual canvas, footer and viewport size."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/active-regions'

def main():
 OUTPUT.mkdir(parents=True,exist_ok=True)
 class Quiet(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   channel=os.environ.get('BROWSER_CHANNEL','msedge')
   browser=p.chromium.launch(**({'channel':channel} if channel else {}))
   page=browser.new_page(viewport={'width':1200,'height':650});errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
   page.wait_for_function('()=>window.nativeView&&window.vexedSpace&&document.querySelector("#startup").hidden',timeout=120000)
   page.evaluate('startNativeDevGame()')
   page.wait_for_function('()=>!!nativeNpcDev.getState()',timeout=120000)
   report={'sizes':[]}
   for width,height in [(1200,650),(900,800),(1440,900)]:
    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
    row=page.evaluate('''()=>{const c=document.querySelector('#space'),g=c.getContext('2d'),v=nativeView.fit(c,g),r=c.getBoundingClientRect(),toolbar=document.querySelector('body > footer').getBoundingClientRect();const d=Math.min(devicePixelRatio||1,2,Math.sqrt(4000000/Math.max(1,r.width*r.height)));const result={view:v,width:c.width,height:c.height,expectedWidth:Math.round(r.width*d),expectedHeight:Math.round(r.height*d),expectedBottom:Math.max(0,Math.min(toolbar.height,r.bottom-toolbar.top))/v.scale};if(c.width!==result.expectedWidth||c.height!==result.expectedHeight||Math.abs(v.safeBottom-result.expectedBottom)>.001)throw Error('Stale display geometry');return result;}''')
    report['sizes'].append(row)
   report['reuse']=page.evaluate('''()=>{const c=document.querySelector('#space'),g=c.getContext('2d'),original=c.getBoundingClientRect;let reads=0;c.getBoundingClientRect=function(){reads++;return original.call(this);};try{for(let i=0;i<120;i++)nativeView.fit(c,g);}finally{c.getBoundingClientRect=original;}if(reads)throw Error('Unchanged display repeatedly read layout');return {draws:120,layoutReads:reads};}''')
   page.evaluate("document.querySelector('body > footer').style.height='80px'")
   page.wait_for_timeout(100)
   report['footer']=page.evaluate('''()=>{const c=document.querySelector('#space'),g=c.getContext('2d'),v=nativeView.fit(c,g),r=c.getBoundingClientRect(),t=document.querySelector('body > footer').getBoundingClientRect(),expected=Math.max(0,Math.min(t.height,r.bottom-t.top))/v.scale;if(!(expected>0)||Math.abs(v.safeBottom-expected)>.001)throw Error('Footer resize kept stale clearance');return {safeBottom:v.safeBottom,expected};}''')
   assert not errors,errors
   (OUTPUT/'frame-reuse.json').write_text(json.dumps(report,indent=2))
   browser.close();print(json.dumps({'passed':True,**report}))
 finally:server.shutdown()

if __name__=='__main__':main()
