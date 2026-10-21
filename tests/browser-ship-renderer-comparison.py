"""Image diagnostic for the integrated Canvas/WebGL2 ship presentation paths.

This reports backend differences; it does not relax the production Canvas pixel
gates, run an FPS benchmark, or assert that the comparison backend is equivalent.
"""
import argparse
import base64
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'/'ship-renderer-comparison'
spec = importlib.util.spec_from_file_location('renderer_comparison_server', ROOT/'tests/browser-npc-performance.py')
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)

CHECK = r'''async () => {
  const check=(value,label)=>{if(!value)throw Error(label);},cache=nativeShipSpriteCache;
  const cases=[];
  for(const [column,type]of [7,35,49,58,50,59].entries())for(const [row,fraction]of [1,.4].entries()){
    const definition=nativeShipDefinitions.get(type),dimensions=nativeShipDefinitions.presentation(type);
    const asset=await vexedFlightAssets.loadShip(type,definition.hull*fraction);
    cases.push({type,column,row,asset,dimensions,owner:{},heading:column*.43+row*.31});
  }
  const draw=(backend,time)=>{
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=700;
    const ctx=canvas.getContext('2d');cache.reset();cache.setBackend(backend);
    const active=cache.beginFrame(ctx);
    for(const item of cases){const {column,row,asset,dimensions,heading,owner}=item;
      vexedFlightAssets.drawShip(ctx,asset,150+column*300,160+row*340,dimensions.width,heading,time,
        {height:dimensions.height,owner,light:{direction:.8,color:0xffdb9e},effectRate:20});
    }
    cache.endFrame(ctx);return {canvas,active,snapshot:cache.snapshot()};
  };
  const compare=(a,b)=>{
    const x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
    const all={channels:0,max:0,total:0,above2:0,above10:0},opaque={...all},edge={...all};
    const shapes=[x,y].map(data=>{let pixels=0,mass=0,cx=0,cy=0,left=a.width,top=a.height,right=-1,bottom=-1;
      for(let i=0;i<data.length;i+=4){const alpha=data[i+3];if(alpha){const px=(i/4)%a.width,py=Math.floor(i/4/a.width);mass+=alpha;cx+=px*alpha;cy+=py*alpha;if(alpha>=64){pixels++;left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py);}}}
      return {pixels,mass,x:cx/mass,y:cy/mass,bounds:[left,top,right,bottom]};});
    const count=(group,value)=>{group.channels++;group.max=Math.max(group.max,value);group.total+=value;if(value>2)group.above2++;if(value>10)group.above10++;};
    let alphaMaximum=0,alphaAbove2=0;
    for(let i=0;i<x.length;i+=4){const visible=x[i+3]||y[i+3];if(!visible)continue;
      const difference=Math.abs(x[i+3]-y[i+3]);alphaMaximum=Math.max(alphaMaximum,difference);if(difference>2)alphaAbove2++;
      for(let c=0;c<3;c++){const d=Math.abs(x[i+c]*x[i+3]-y[i+c]*y[i+3])/255;count(all,d);count(x[i+3]>=250&&y[i+3]>=250?opaque:edge,d);}
    }
    for(const group of [all,opaque,edge]){group.mean=group.total/Math.max(1,group.channels);delete group.total;}
    return {premultiplied:{all,opaque,edge},alphaMaximum,alphaAbove2,shapes,centroidDistance:Math.hypot(shapes[0].x-shapes[1].x,shapes[0].y-shapes[1].y)};
  };
  const canvas=draw('canvas',1350),webgl=draw('webgl2',1350);
  check(canvas.snapshot.counters.spriteCompositions===cases.length,'Canvas did not compose the complete mixed fleet');
  check(webgl.active&&webgl.snapshot.counters.gpuDraws===cases.length,'The shared cache did not submit the full fleet to WebGL2');
  check(webgl.snapshot.gpu.counters.instances===cases.length,'The GPU lost submitted ships');
  check(webgl.snapshot.gpu.counters.presentationPixels>0,'No GPU presentation was delivered');
  check(webgl.snapshot.compositions.entries===0,'GPU mode silently composed the full fleet on the CPU');
  const difference=compare(canvas.canvas,webgl.canvas);
  const backdrop=source=>{const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const g=c.getContext('2d');g.fillStyle='#030811';g.fillRect(0,0,c.width,c.height);g.drawImage(source,0,0);return c;};
  window.__rendererEvidence={canvas:backdrop(canvas.canvas),webgl2:backdrop(webgl.canvas)};
  cache.setBackend('canvas');return {purpose:'Image comparison only; no frame-delivery claim or relaxed production pixel gate',cases:cases.map(({type,asset,dimensions,heading})=>({type,stage:asset.damageStage,dimensions,heading})),canvas:canvas.snapshot,webgl2:webgl.snapshot,difference};
}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--box-mip-probe',action='store_true',help='Diagnostic shader override; not the production backend')
    args=parser.parse_args()
    output=OUTPUT/'box-mip-probe' if args.box_mip_probe else OUTPUT
    output.mkdir(parents=True, exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(perf.SnapshotHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            graphics=browser.new_browser_cdp_session().send('SystemInfo.getInfo')
            page=browser.new_page(viewport={'width':1280,'height':850});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('window.requestAnimationFrame=()=>0');page.wait_for_timeout(100)
            if args.box_mip_probe:
                source=(ROOT/'html-games/broken-mirror-port/ship-gpu-batch.js').read_text(encoding='utf8')
                source=source.replace('flat out vec4 artBounds;','flat out vec4 artBounds;\n  flat out vec4 effectBounds;').replace('artBounds=artRect*2048.;','artBounds=artRect*2048.;effectBounds=effectsRect*2048.;').replace('flat in vec4 artBounds;','flat in vec4 artBounds;\n  flat in vec4 effectBounds;')
                start=source.index('  void main(){\n    vec2 samplePoint=effectsUV')
                end=source.index('\n  }`;',start)+len('\n  }')
                source=source[:start]+'''  vec4 mipCompose(ivec2 point){
    ivec2 p=ivec2(effectBounds.xy)+point*2;
    return floor((compose(p)+compose(p+ivec2(1,0))+compose(p+ivec2(0,1))+compose(p+ivec2(1,1)))*63.75+.5)/255.;
  }
  void main(){
    vec2 samplePoint=(effectsUV.xy*2048.-effectBounds.xy)*.5-.5,fraction=fract(samplePoint);ivec2 point=ivec2(floor(samplePoint));
    result=mix(mix(mipCompose(point),mipCompose(point+ivec2(1,0)),fraction.x),mix(mipCompose(point+ivec2(0,1)),mipCompose(point+ivec2(1,1)),fraction.x),fraction.y)*abs(parameter.y);
  }'''+source[end:]
                page.add_script_tag(content=source)
            report=page.evaluate(CHECK);report.update(browser=browser.version,graphics=graphics,errors=errors)
            report['shaderOverride']='box-mip-probe' if args.box_mip_probe else None
            assert not errors,errors
            for backend in ['canvas','webgl2']:
                (output/f'{backend}-mixed-lighting-damage.png').write_bytes(base64.b64decode(page.evaluate('(backend)=>__rendererEvidence[backend].toDataURL().split(",")[1]',backend)))
            (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
            print(json.dumps(report));browser.close()
    finally:
        server.shutdown()


if __name__=='__main__':
    main()
