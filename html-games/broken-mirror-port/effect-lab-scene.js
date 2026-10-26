/* Deterministic load fixtures, using the production ship, shot and shield owners. */
(() => {
  'use strict';
  const canvas=document.getElementById('space'),ctx=canvas.getContext('2d'),status=document.getElementById('status');
  const hud=document.getElementById('fps-label'),loadLabel=document.getElementById('load-label');
  const channel='vexed-effect-lab-v1',api='/__vexed/effect-lab/';
  let parentOrigin=location.origin;
  if(document.referrer)parentOrigin=new URL(document.referrer).origin;
  const trusted=['127.0.0.1','localhost'].includes(new URL(parentOrigin).hostname);
  const send=(type,payload)=>{if(parent!==window&&trusted)parent.postMessage({channel,type,payload},parentOrigin);};
  let active=false,frame=0,last=null,config=null,profile=null,variant='baseline',fleet=[],engine=null,run=null;
  let width=0,height=0,dpr=1,simulation={system:99},time=0,lastUI=0,generation=0,prepared=false,randomState=1;
  let latest=null,source=null,lastCPU=0,delivered=0,counters={},minimumVisible=Infinity;
  const live=new EffectLabMetrics.FrameMeter(20000),assets=new Map(),definitions=new Map();
  let gpuTimer=null;
  const request=async(action,value)=>{
    const response=await fetch(api+action,value?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:{cache:'no-store'});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Lab storage unavailable');return result;
  };
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  function seeded(action){const original=Math.random;Math.random=random;try{return action();}finally{Math.random=original;}}
  function show(message){status.textContent=message;status.hidden=false;}
  function cancel(reason='Stopped'){
    if(run){const pending=run;run=null;pending.meter.invalidate(reason);pending.reject(Error(reason));send('cancelled',{reason});}
  }
  function stop(reason){active=false;generation++;if(frame)cancelAnimationFrame(frame);frame=0;last=null;cancel(reason||'Stopped');gpuTimer?.clear();}
  function createTimer(gl){
    return EffectLabMetrics.createGPUTimer(gl,ms=>{live.addGPU(ms);run?.meter.addGPU(ms);});
  }
  function validate(value){
    if(![10,25,50,100,200].includes(value.count)||!['idle','shields','hull','weapons','battle','shielded-battle','full-battle','weapons-hits'].includes(value.scenario))throw Error('Choose a weapons/shields/hits fixture; destruction testing is deferred.');
    const number=(key,fallback,low,high)=>Number.isFinite(Number(value[key]))&&Number(value[key])>=low&&Number(value[key])<=high?Number(value[key]):fallback;
    const shipType=number('shipType',6,1,999);
    if(!VexedMirrorWorld.ships.some(ship=>ship.id===shipType))throw Error('Choose a game ship in the top selector for stress tests.');
    return {count:value.count,scenario:value.scenario,shipType,mix:value.mix===true,mixedWeapons:value.mixedWeapons===true,mixedDamage:value.mixedDamage===true,
      rate:number('rate',2,.5,8),size:number('size',44,16,90),seed:number('seed',429,1,2**31-1),
      pattern:value.pattern==='volley'?'volley':'staggered',lights:value.lights!==false,loadLevel:['stress','overload'].includes(value.loadLevel)?value.loadLevel:'normal',
      shieldRenderer:value.shieldRenderer==='legacy'?'legacy':'gpu',weapon:typeof value.weapon==='string'?value.weapon:'beam:0',target:120};
  }
  async function prepare(options){
    stop('Fixture changed');const ticket=generation;prepared=false;show('Preparing game artwork and GPU shields…');
    const current=await request('manifest');
    if(source&&Object.keys(source.code).some(key=>source.code[key]!==current.code[key]))throw Error('Source changed. Reload the showcase before testing this version.');
    config=validate(options.fixture);variant=options.variant||'baseline';
    window.nativeFlightLightingEnabled=config.lights;
    await nativeEffectProfiles.ready;
    await nativeEffectProfiles.preview(options.profile);profile=nativeEffectProfiles.current();
    if(window.vexedShieldGPU)window.vexedShieldGPU.destroy();
    const gpu=await installVexedShieldGPU();gpu.setLegacy(config.shieldRenderer==='legacy');
    await nativeCombatShots.ready;
    const types=config.mix?[config.shipType,6,7,39,29].filter((type,index,list)=>list.indexOf(type)===index):[config.shipType];
    for(const type of types){
      if(!assets.has(type)){
        const definition=nativeShipDefinitions.get(type,'civilian');definitions.set(type,definition);
        const ready=await nativeShipEffects.prepare(type,'civilian');
        if(!ready?.assets?.[0])throw Error('Game artwork could not be prepared');
        assets.set(type,ready.assets[0]);
      }
    }
    if(ticket!==generation)throw Error('Fixture superseded');
    const bounds=canvas.getBoundingClientRect();width=Math.max(1,Math.round(bounds.width));height=Math.max(1,Math.round(bounds.height));dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const columns=Math.ceil(Math.sqrt(config.count*width/Math.max(1,height))),rows=Math.ceil(config.count/columns);
    const margin=Math.min(80,width*.14,height*.18),cw=(width-margin*2)/columns,ch=(height-margin*2)/rows;
    randomState=config.seed;time=0;simulation={system:99};nativeSimulation.ensure(simulation);nativeShipEffects.reset();
    fleet=Array.from({length:config.count},(_,id)=>{
      const type=types[id%types.length],definition=definitions.get(type),asset=assets.get(type),ratio=asset.width/asset.height;
      const h=Math.min(config.size,Math.max(10,ch*.75),Math.max(10,cw*.75)/ratio),d={width:h*ratio,height:h};
      const entity={id:'lab:'+id,shipType:type,system:99,x:margin+(id%columns+.5)*cw,y:margin+(Math.floor(id/columns)+.5)*ch,
        heading:(random()-.5)*.3,hull:definition.hull,shields:definition.shields||100,phase:'cruising',dimensions:d};
      if(config.mixedDamage)entity.hull*= [1,.7,.4,.1][id%4];
      const descriptor=nativeShipDefinitions.describe(simulation,entity,{category:'civilian'});
      return {descriptor,entity,asset,home:{x:entity.x,y:entity.y},baseHeading:entity.heading,phase:random()*Math.PI*2,
        next:config.pattern==='volley'?0:random()/config.rate,round:0};
    });
    engine=createVexedEffectFixture({state:simulation,fleet,config,combat:window.__labCombat});
    live.reset();delivered=0;minimumVisible=Infinity;counters={hits:0,shots:0,explosions:0,activeWeapons:0,visible:0,activeShields:0,peakShields:0};
    gpuTimer?.clear();gpuTimer=createTimer(gpu.renderer.gl);
    const confirmed=await request('manifest');
    if(EffectLabMetrics.stable(current.code)!==EffectLabMetrics.stable(confirmed.code))throw Error('Source changed during preparation. Reload the showcase.');
    source=confirmed;
    if(ticket!==generation)throw Error('Fixture superseded');
    prepared=true;status.hidden=true;last=null;
    return fixture();
  }
  function fixture(){return {...config,width,height,backingWidth:canvas.width,backingHeight:canvas.height,dpr,
    displayedHullHeight:Math.min(...fleet.map(ship=>ship.entity.dimensions.height)),renderer:'nativeShipEffects + nativeCombatShots + vexedShieldGPU',context:'renderer-fixture'};}
  function environment(){return {userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,
    deviceMemory:navigator.deviceMemory||null,dpr,viewport:{width,height},lightingEnabled:window.nativeFlightLightingEnabled,gpu:window.vexedShieldGPU?.renderer.environment,
    timing:'requestAnimationFrame intervals; CPU submission; optional asynchronous shield GPU timer'};}
  function step(dt){
    nativeSimulation.advance(simulation,dt);time=nativeSimulation.seconds(simulation);
    for(const ship of fleet){
      const {entity,descriptor,home}=ship;
      entity.x=home.x+Math.sin(time*.5+ship.phase)*2;entity.y=home.y+Math.cos(time*.4+ship.phase)*2;
      entity.heading=ship.baseHeading+Math.sin(time*.25+ship.phase)*.07;
      descriptor.x=entity.x;descriptor.y=entity.y;descriptor.heading=entity.heading;
    }
    engine.step();Object.assign(counters,engine.snapshot());nativeShipEffects.advance(simulation,dt);
  }
  function paint(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#050b12';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#274052';for(let i=0;i<80;i++)ctx.fillRect((i*97+config.seed)%width,(i*53+config.seed)%height,1,1);
    const view={ship:{x:0,y:0},cx:0,cy:0,zoom:1,w:width,h:height};
    const gpu=window.vexedShieldGPU;if(!gpu?.available)throw Error('GPU context unavailable; measurement stopped');
    gpu.beginFrame(ctx);
    for(const ship of fleet)nativeShipEffects.paintShip(ctx,ship.descriptor,{...view,x:ship.entity.x,y:ship.entity.y,
      dimensions:ship.entity.dimensions,asset:nativeShipEffects.asset(ship.descriptor)||ship.asset,appearance:{lights:config.lights,damage:true}});
    engine.paint(ctx,view);
    nativeShipEffects.paint(simulation,ctx,view);
    if(config.shieldRenderer==='legacy')gpu.endFrame(ctx,time*1000);else{gpuTimer.begin(delivered);try{gpu.endFrame(ctx,time*1000);}finally{gpuTimer.end();}}
    gpuTimer.poll();
    const visibility=gpu.renderer.visibility(time*1000),gpuStats=gpu.snapshot();
    counters.visible=fleet.filter(ship=>{
      const d=ship.entity.dimensions,a=ship.descriptor.heading+Math.PI/2,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
      const ex=(d.width*c+d.height*s)/2,ey=(d.width*s+d.height*c)/2;
      return ship.entity.x-ex>=0&&ship.entity.x+ex<=width&&ship.entity.y-ey>=0&&ship.entity.y+ey<=height;
    }).length;
    counters.activeShields=gpuStats.lastActiveShields;counters.shieldsVisible=visibility.fullyActive;
    counters.peakShields=Math.max(counters.peakShields,counters.activeShields);
    minimumVisible=Math.min(minimumVisible,counters.visible);
    if(gpuStats.overBudget>0)throw Error('Renderer capacity exceeded; test is invalid');
    if(gpuStats.resources.primitiveRejected>0)throw Error('Effect primitive capacity exceeded; test is invalid');
    if(visibility.fullyActive!==visibility.active)throw Error('Shield surfaces clipped. Enlarge the preview or reduce hull size.');
  }
  function tick(timestamp){
    frame=0;if(!active||document.hidden||!prepared)return;
    const interval=last==null?null:timestamp-last;last=timestamp;const started=performance.now();
    try{seeded(()=>step((interval||0)/1000));paint();}
    catch(error){stop(error.message);show(error.message);send('error',{message:error.message});return;}
    delivered++;lastCPU=performance.now()-started;
    if(interval!=null){if(live.frames.length>=live.limit)live.reset();live.add(interval,lastCPU,time*1000);}
    if(run){
      if(timestamp>=run.warmUntil&&!run.began){run.began=timestamp;run.meter.reset();gpuTimer.clear();minimumVisible=Infinity;send('phase',{phase:'measuring'});}
      else if(run.began&&interval!=null)run.meter.add(interval,lastCPU,timestamp-run.began);
      if(run.began&&timestamp-run.began>=run.duration*1000){
        const finished=run;run=null;
        if(minimumVisible!==config.count)finished.meter.invalidate('Requested fleet was not fully on screen');
        const report={schema:1,variant,profile,fixture:fixture(),environment:environment(),code:source.code,
          metrics:finished.meter.snapshot(120),frames:finished.meter.frames,counters:{...counters,minimumVisible},
          resources:{shields:vexedShieldGPU.snapshot().resources,sprites:nativeShipSpriteCache.snapshot(),effects:nativeShipEffects.metrics(),candidate:nativeEffectProfiles.metrics()},
          warmupSeconds:finished.warmup,measuredAt:new Date().toISOString(),gameValidation:'pending'};
        if(!report.metrics.valid)finished.reject(Error(report.metrics.invalidReason));
        else request('runs',report).then(saved=>{latest=saved;finished.resolve(saved);send('result',saved);}).catch(error=>finished.reject(error));
      }
    }
    if(timestamp-lastUI>=250){
      lastUI=timestamp;const recent=live.frames.slice(-120),fps=recent.length?recent.length*1000/recent.reduce((sum,n)=>sum+n,0):0;
      hud.textContent=`${fps.toFixed(1)} RAF FPS · ${lastCPU.toFixed(2)} ms CPU`;
      loadLabel.textContent=`${config.count} ships · ${counters.visible} visible · ${counters.activeShields} shields`;
      send('telemetry',{requested:config.count,effectVersion:{id:profile.id,name:profile.name,implementation:profile.implementation,renderer:config.shieldRenderer},fps,cpuMs:lastCPU,counters:{...counters},phase:run?(run.began?'measuring':'warming'):'preview',
        elapsed:run?.began?(timestamp-run.began)/1000:0,metrics:run?.meter.snapshot(120)||live.snapshot(120)});
    }
    frame=requestAnimationFrame(tick);
  }
  function start(){if(!prepared)throw Error('Prepare the fixture first');if(!active){active=true;last=null;frame=requestAnimationFrame(tick);}}
  async function measure(options){
    const warmup=Number(options.warmup??2),duration=Number(options.duration??10);
    if(!Number.isFinite(warmup)||warmup<0||warmup>10||!Number.isFinite(duration)||duration<2||duration>30)throw Error('Invalid measurement duration');
    await prepare(options);start();
    return new Promise((resolve,reject)=>{run={resolve,reject,meter:new EffectLabMetrics.FrameMeter(),warmUntil:performance.now()+warmup*1000,began:null,duration,warmup};send('phase',{phase:'warming'});});
  }
  async function command(action,payload){
    if(action==='manifest')return request('manifest');
    if(action==='session')return request('session',payload);
    if(action==='stage')return request('stage',payload);
    if(action==='game-check'){stop('In-game check started');show('Checking effects in an isolated game. Results will appear in the Measure panel.');return request('game-check',payload);}
    if(action==='stop'){stop('Stopped by user');await request('cancel-game-check',{});return true;}
    if(action==='preview'){const value=await prepare(payload);start();return value;}
    if(action==='measure')return measure(payload);
    if(action==='export'){
      const blob=new Blob([JSON.stringify(payload||latest,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='vexed-effect-lab-results.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
    }
    throw Error('Unknown lab command');
  }
  addEventListener('message',event=>{
    if(!trusted||event.source!==parent||event.origin!==parentOrigin||event.data?.channel!==channel)return;
    const {action,payload,requestId}=event.data;
    Promise.resolve().then(()=>command(action,payload)).then(result=>send('reply',{requestId,result}),error=>send('reply',{requestId,error:error.message}));
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Tab hidden; run cancelled');});
  new ResizeObserver(()=>{
    if(!prepared||!active)return;const bounds=canvas.getBoundingClientRect();
    if(Math.round(bounds.width)!==width||Math.round(bounds.height)!==height||Math.min(devicePixelRatio||1,2)!==dpr){stop('Viewport changed; run cancelled');prepared=false;show('Viewport changed. Preview or measure again.');send('cancelled',{reason:'Viewport changed'});}
  }).observe(canvas);
  addEventListener('pagehide',()=>{stop('Page closed');vexedShieldGPU?.destroy();});
  window.effectLabScene=Object.freeze({command,snapshot:()=>({active,prepared,fixture:config&&fixture(),counters:{...counters},measuring:!!run,latest})});
  Promise.all([fetch('../flashtrek-broken-mirror/showcase-assets/combat-data.json').then(response=>response.json()),request('manifest')]).then(([data,manifest])=>{
    source=manifest;window.__labCombat=data;send('ready',{origin:location.origin});
  }).catch(error=>{show(error.message);send('error',{message:error.message});});
})();
