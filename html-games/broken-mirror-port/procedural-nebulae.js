/* Finite, world-anchored gas regions. All internal motion belongs to the field. */
(() => {
  'use strict';
  const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  const records=new Map((window.VexedMirrorWorld?.systems||[]).map(row=>[row.id,row]));
  const chart=id=>window.nativeManualFlight?.chartPosition(id)||records.get(Number(id))?.mapPosition;
  function place(id,name,system,rx,ry,opacity,width,aspect,style,angle,activity){
    const origin=chart(system);return origin&&records.get(system)?.nebula&&Object.freeze({id,name,system,
      basis:system===73?'television-plasma-region':'broken-mirror-anomaly',x:origin.x,y:origin.y,rx,ry,
      opacity,width,aspect,style,angle,activity,source:'procedural-gas',seed:system*.731});
  }
  const places=Object.freeze([
    place('harman-wisps','Harman anomaly outskirts',32,34,31,.42,1160,.72,0,.45,.7),
    place('kardon-clouds','Kardon anomaly clouds',33,33,29,.50,1180,.78,1,.8,1),
    place('vex-clouds','Vex anomalous cloud complex',34,51,43,.64,1340,.85,2,-.55,1.2),
    place('badlands-plasma','Badlands plasma storms',73,24,23,.75,1300,.62,3,-.1,1.7)
  ].filter(Boolean));
  const layers=Object.freeze([
    Object.freeze({rate:.004,scale:1.12,alpha:.69,turn:0}),
    Object.freeze({rate:.007,scale:.84,alpha:.23,turn:.13}),
    Object.freeze({rate:.011,scale:.64,alpha:.12,turn:-.18})
  ]);
  function point(system,view={},camera=false){
    const origin=chart(system)||{x:0,y:0},scale=window.nativeManualFlight?.unitsPerChartPoint||1000;
    const x=Number(camera?view.cameraX??view.playerX:view.playerX??view.cameraX)||0;
    const y=Number(camera?view.cameraY??view.playerY:view.playerY??view.cameraY)||0;
    return {x:origin.x+x/scale,y:origin.y+y/scale};
  }
  function coverage(place,location){return smooth((1-Math.hypot((location.x-place.x)/place.rx,(location.y-place.y)/place.ry))/.38);}
  function nearby(system,view={}){const location=point(system,view);return places.filter(place=>coverage(place,location)>0);}
  function projection(place,layer,system,view){
    const location=point(system,view),camera=point(system,view,true),scale=Math.max(.75,Math.min(1.35,Math.max(view.w/1200,view.h/900)));
    const width=place.width*layer.scale*scale,units=window.nativeManualFlight?.unitsPerChartPoint||1000;
    return {id:place.id,source:'procedural-gas',basis:place.basis,
      x:view.w/2+(place.x-camera.x)*units*layer.rate,y:view.h/2+(place.y-camera.y)*units*layer.rate,
      width,height:width*place.aspect,angle:place.angle+layer.turn,alpha:place.opacity*layer.alpha*coverage(place,location),rate:layer.rate};
  }
  async function prepare(system,{signal}={}){
    const check=()=>{if(signal?.aborted)throw Error('Nebula preparation cancelled.');};check();
    const regions=nearby(system);if(regions.length)window.nativeNebulaGas?.prepare();check();
    return {regions:regions.length,imageRequests:0};
  }
  function create(){
    let elapsed=0,last={draws:0,visible:[],layers:[],loadedImages:0,imageRequests:0,procedural:true};
    function rebase(state){elapsed+=Number(state.elapsed)||0;}
    function render(ctx,view,state){
      const projections=[],visible=[];let draws=0;const gas=window.nativeNebulaGas,time=elapsed+(Number(state.elapsed)||0);
      for(const place of nearby(state.system,view)){
        const planes=layers.map(layer=>projection(place,layer,state.system,view));
        if(!planes.some(plane=>{const bound=Math.hypot(plane.width,plane.height)/2;return plane.alpha>.0001&&plane.x+bound>0&&plane.x-bound<view.w&&plane.y+bound>0&&plane.y-bound<view.h;}))continue;
        if(!gas)continue;
        const flowTime=view.reducedMotion?0:time*.12*place.activity;
        const frame=gas.render(view,planes,place.style,flowTime,place.seed);
        ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;ctx.drawImage(frame,0,0,view.w,view.h);ctx.restore();
        projections.push(...planes);visible.push(place.id);draws++;
      }
      const backend=gas?.metrics()||{};
      last={draws,visible,layers:projections,loadedImages:0,imageRequests:0,procedural:true,elapsed:time,
        backend:backend.backend||'uninitialized',fieldWidth:backend.width||0,fieldHeight:backend.height||0,
        surfaceBytes:(backend.width||0)*(backend.height||0)*4,fieldRenders:backend.renders||0,
        cacheHits:backend.cacheHits||0,compiles:backend.compiles||0,contextLosses:backend.contextLosses||0,
        failures:backend.failures||0,software:!!backend.software};
    }
    return Object.freeze({prepare,render,rebase,metrics:()=>({...last,visible:[...last.visible],layers:last.layers.map(layer=>({...layer}))})});
  }
  window.nativeParallaxNebulae=Object.freeze({create,prepare,places,layers,point,coverage,nearby,projection});
})();
