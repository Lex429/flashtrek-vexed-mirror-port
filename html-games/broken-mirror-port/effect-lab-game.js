/* Opt-in wall-clock observer. It never advances or replaces the game simulation. */
(() => {
  'use strict';
  if(new URLSearchParams(location.search).get('effectLabCheck')!=='1')return;
  const script=document.createElement('script');script.src='../flashtrek-broken-mirror/effect-lab-metrics.js';
  script.onload=install;document.head.append(script);
  function install(){
    let recording=false,state=null,last=0,visible=new Set(),minimumVisible=Infinity,requested=0,measured=null;
    const meter=new EffectLabMetrics.FrameMeter(),live=new EffectLabMetrics.FrameMeter(360);
    let gpuTimer=null,gpuContext=null;
    function beginEffects(ctx,gl){
      if(ctx.canvas.id!=='space')return;
      if(gl!==gpuContext){gpuTimer?.clear();gpuContext=gl;
        gpuTimer=EffectLabMetrics.createGPUTimer(gl,ms=>{live.addGPU(ms);if(recording)meter.addGPU(ms);});}
      gpuTimer.poll();gpuTimer.begin();
    }
    function endEffects(ctx){if(ctx.canvas.id==='space')gpuTimer?.end();}
    const panel=document.createElement('aside');panel.id='effect-game-probe';
    panel.style.cssText='position:fixed;right:12px;top:12px;z-index:9999;background:#07131eee;border:1px solid #477486;border-radius:6px;color:#ccebef;padding:10px;font:11px system-ui;max-width:290px;box-shadow:0 8px 30px #0008';
    const output=document.createElement('div'),detail=document.createElement('div'),button=document.createElement('button'),save=document.createElement('button');
    output.textContent='Game FPS observer · enter flight to measure';detail.style.cssText='margin:5px 0;color:#91b6c4';
    button.textContent='Record 10 seconds';save.textContent='Export';save.disabled=true;
    panel.append(output,detail,button,save);document.body.append(panel);
    const originalPaint=nativeShipEffects.paintShip;
    window.nativeShipEffects=Object.freeze({...nativeShipEffects,paintShip(ctx,descriptor,view){
      const result=originalPaint(ctx,descriptor,view),canvas=ctx.canvas,m=ctx.getTransform();
      const x=view.x??(view.cx+(descriptor.x-view.ship.x)*(view.zoom||1)),y=view.y??(view.cy+(descriptor.y-view.ship.y)*(view.zoom||1));
      const d=view.dimensions||descriptor.dimensions,a=(descriptor.heading||0)+Math.PI/2,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
      if(d){const zoom=view.zoom||1,sx=Math.hypot(m.a,m.b),sy=Math.hypot(m.c,m.d),ex=(d.width*c+d.height*s)*zoom*sx/2,ey=(d.width*s+d.height*c)*zoom*sy/2;
        const px=m.a*x+m.c*y+m.e,py=m.b*x+m.d*y+m.f;
        if(px-ex>=0&&py-ey>=0&&px+ex<=canvas.width&&py+ey<=canvas.height)visible.add(descriptor.entity);}
      return result;
    }});
    const original=nativeSimulationMetrics;
    window.nativeSimulationMetrics=Object.freeze({...original,record(value,sample){
      original.record(value,sample);state=value;
      const blocked=document.hidden||nativeSimulation.blocked()||sample.mode!=='flight'||!document.getElementById('modal').hidden;
      if(blocked&&recording)meter.invalidate('Gameplay paused, hidden, or left flight');
      if(!blocked){
        if(live.frames.length>=live.limit)live.reset();live.add(sample.frame,sample.simulation+sample.render);
        if(recording){meter.add(sample.frame,sample.simulation+sample.render,performance.now());minimumVisible=Math.min(minimumVisible,visible.size);
          const presentation=window.vexedShieldGPU?.snapshot();
          if(presentation?.overBudget>0||presentation?.resources.primitiveRejected>0)meter.invalidate('Effect capacity exceeded');}
      }
      if(performance.now()-last>250){last=performance.now();const m=live.snapshot();
        output.textContent=`${m.fps.toFixed(1)} FPS · P95 ${m.p95Ms.toFixed(2)} ms · CPU ${m.cpuMs.toFixed(2)} ms${m.gpuMs==null?'':` · Effects GPU ${m.gpuMs.toFixed(2)} ms`}`;
        detail.textContent=`${visible.size} ships fully visible · ${vexedShieldGPU?.snapshot().lastActiveShields||0} shields · ${recording?'Recording…':'Live gameplay'}`;}
      visible.clear();
    }});
    function begin(count=0){if(!state||nativeSimulation.blocked())throw Error('Enter unpaused gameplay first');gpuTimer?.clear();meter.reset();minimumVisible=Infinity;requested=count;recording=true;return true;}
    function finish(){gpuTimer?.poll();recording=false;gpuTimer?.clear();if(requested&&minimumVisible!==requested)meter.invalidate('Requested ships were not all fully visible');
      measured={schema:1,context:'actual-gameplay',profile:nativeEffectProfiles.current(),metrics:meter.snapshot(),frames:[...meter.frames],
        requested,minimumVisible:Number.isFinite(minimumVisible)?minimumVisible:0,simulation:nativeSimulationMetrics.snapshot(),
        shields:vexedShieldGPU?.snapshot(),candidate:nativeEffectProfiles.metrics(),gpuTiming:{supported:gpuTimer?.supported||false,scope:'Shared effects overlay; excludes Canvas artwork, compositor and other applications'},measuredAt:new Date().toISOString()};save.disabled=false;return measured;}
    button.onclick=()=>{try{begin();button.disabled=true;setTimeout(()=>{finish();button.disabled=false;},10000);}catch(error){detail.textContent=error.message;}};
    save.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(measured,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='vexed-game-fps.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording)meter.invalidate('Game tab hidden');});
    addEventListener('resize',()=>{if(recording)meter.invalidate('Game viewport changed');});
    addEventListener('pagehide',()=>gpuTimer?.clear());
    window.nativeEffectGameProbe=Object.freeze({begin,finish,beginEffects,endEffects,getState:()=>state,snapshot:()=>({recording,metrics:meter.snapshot(),minimumVisible})});
  }
})();
