/* Temporary visual test in Dev Sol. Physics and saves remain with their owners. */
(() => {
  'use strict';
  // Fluid detail is independent of the exact artwork masks. Three world units
  // leave headroom for many fast hulls while preserving tested opening/refill flow.
  const fluidCell=3;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const presets=Object.freeze({
    harman:Object.freeze({label:'Harman wisps',style:0,opacity:.62,front:.24,life:4,densityFloor:.14,activity:.075}),
    vex:Object.freeze({label:'Vex dense gas',style:2,opacity:.88,front:.34,life:5.2,densityFloor:.24,activity:.11}),
    badlands:Object.freeze({label:'Badlands storm test',style:3,opacity:.86,front:.28,life:5.2,densityFloor:.18,activity:.16,width:2100,height:1600,ahead:110})
  });
  const eligible=state=>!!state?.devMode&&Number(state.system)===1&&(!window.nativeManualFlight?.currentRegion||window.nativeManualFlight.currentRegion(state).system===1);
  function position(state){return window.vexedSolFlight?.shipPosition(state)||{x:Number(state.x)||0,y:Number(state.y)||0};}
  const ellipse=Array.from({length:16},(_,i)=>Math.sqrt(Math.max(0,1-Math.pow(i/7.5-1,2))));
  const outlines=new WeakMap();let sampler=null,outlineBudget=2;
  function outline(descriptor){
    const stage=window.nativeShipDefinitions?.stage?.(descriptor)||0,asset=window.vexedFlightAssets?.peekShip?.(descriptor.shipType,stage,{fallback:true,markVisible:false}),art=asset?.art;
    if(!art)return null;if(outlines.has(art))return outlines.get(art);if(outlineBudget<=0)return null;outlineBudget--;
    // Only sample artwork already resident in the shared loader. No fog-owned
    // artwork requests, lighting masks or shield silhouettes.
    try{
      if(!sampler){const canvas=document.createElement('canvas');canvas.width=64;canvas.height=96;sampler=canvas.getContext('2d',{willReadFrequently:true});}
      sampler.clearRect(0,0,64,96);sampler.drawImage(art,0,0,64,96);const pixels=sampler.getImageData(0,0,64,96).data,rows=[];let first=96,last=-1;
      for(let y=0;y<96;y++){let extent=0;for(let x=0;x<64;x++)if(pixels[(y*64+x)*4+3]>48)extent=Math.max(extent,Math.abs((x+.5)/64-.5)*2);rows[y]=extent;if(extent>0){first=Math.min(first,y);last=y;}}
      if(last<first){outlines.set(art,null);return null;}
      const profile=Array.from({length:16},(_,i)=>{const y=last-i/15*(last-first),lo=Math.max(first,Math.floor(y)-1),hi=Math.min(last,Math.ceil(y)+1);let extent=0;for(let row=lo;row<=hi;row++)extent=Math.max(extent,rows[row]);return extent;});
      const shape={front:.5-first/96,rear:.5-(last+1)/96,profile};outlines.set(art,shape);return shape;
    }catch(error){outlines.set(art,null);return null;}
  }
  function nearbyShips(state,view){
    const zoom=view.zoom||1,margin=120,x=view.cameraX,y=view.cameraY;
    const found=window.nativeShipSystems?.query?.(state,{system:1,minX:x-view.w/(2*zoom)-margin,maxX:x+view.w/(2*zoom)+margin,minY:y-view.h/(2*zoom)-margin,maxY:y+view.h/(2*zoom)+margin,categories:['civilian','tug']}).bystanders||[];
    return found.filter(d=>d.hull>0&&!d.entity?.journey&&!d.entity?.warpVisual).map(d=>{
      const pose=window.nativeSimulationFrame?.renderPose?.(state,d)||d;
      return {id:d.category+':'+d.id,x:d.x,y:d.y,visualX:pose.x,visualY:pose.y,heading:pose.heading,speed:d.speed,vx:d.vx,vy:d.vy,dimensions:d.dimensions,shape:outline(d)};
    });
  }
  function launchedWake(ship,from,to,at,duration){
    const pressure=clamp(ship.speed/250),radius=Math.max(.5,Math.max(...ship.profile))*(.94+.10*clamp(ship.speed/350));
    const bank=Math.max(radius*1.2,ship.profile[15]+ship.length*2*(.24+.48*pressure)+Math.max(1.2,ship.width*.27)*.5);
    return {id:ship.id,ax:from.x,ay:from.y,bx:to.x,by:to.y,at,duration,radius,
      strength:.18+.72*pressure,phase:ship.phase,spreadBase:Math.max(0,bank-radius*1.05),outward:radius*(.7+2.5*pressure)};
  }
  function createModel({enabled=false}={}){
    let owner=null,preset='badlands',colour='original',clock=0,patch=null,wakes=[],previous=null,wasEligible=false,active=false,speed=0,dimensions={width:10,height:16},ships=[],tracks=new Map();
    function reset(state,{ahead=presets[preset].ahead??1000}={}){
      if(!eligible(state))return false;
      const p=position(state),angle=Number(state.angle)||0;
      clock=0;
      patch={x:p.x+Math.cos(angle)*ahead,y:p.y+Math.sin(angle)*ahead,width:presets[preset].width??1500,height:presets[preset].height??1800,angle:angle-Math.PI/2};
      wakes=[];previous={...p};tracks.clear();ships=[];speed=0;return true;
    }
    function update(state,dt,view={}){
      if(owner!==state){owner=state;clock=0;patch=null;wakes=[];previous=null;tracks.clear();ships=[];wasEligible=false;}
      const allowed=eligible(state);active=allowed&&enabled&&!view.hidden;
      if(!allowed){wasEligible=false;wakes=[];previous=null;tracks.clear();ships=[];return;}
      if(!wasEligible||!patch)reset(state);wasEligible=true;
      const p=position(state);
      if(view.dimensions?.width>0&&view.dimensions?.height>0)dimensions={width:view.dimensions.width,height:view.dimensions.height};
      if(!enabled){wakes=[];previous={...p};tracks.clear();ships=[];return;}
      if(view.suspended||view.hidden||!(dt>0)){previous={...p};return;}
      clock+=dt;
      const distance=previous?Math.hypot(p.x-previous.x,p.y-previous.y):0;
      const physicalSpeed=Math.max(0,Number(state.speed)||0,Math.hypot(Number(state.vx)||0,Number(state.vy)||0));
      if(distance>Math.max(600,physicalSpeed*dt*4+100)){reset(state);return;}
      if(view.material){previous={...p};speed=physicalSpeed;return;}
      const profile=presets[preset];wakes=wakes.filter(wake=>clock-wake.at<profile.life);
      const player={id:'player',x:p.x,y:p.y,visualX:view.ship?.x??p.x,visualY:view.ship?.y??p.y,heading:Number(view.ship?.heading??state.angle)||0,speed:physicalSpeed,dimensions,shape:view.shape};
      ships=[player,...(view.ships||[])].map(ship=>{
        const d=ship.dimensions||{width:10,height:16},shape=ship.shape,front=(shape?.front??.5)*d.height,rear=(shape?.rear??-.5)*d.height;
        const result={...ship,length:Math.max(.5,(front-rear)/2),offset:(front+rear)/2,width:d.width*.5,profile:(shape?.profile||ellipse).map(n=>n*d.width*.5)};
        const c=Math.cos(ship.heading),s=Math.sin(ship.heading),stern={x:ship.x+c*rear,y:ship.y+s*rear};
        let track=tracks.get(ship.id);if(!track){track={x:ship.x,y:ship.y,anchor:stern,lastEmit:clock,speed:0,phase:0};tracks.set(ship.id,track);}
        const moved=Math.hypot(ship.x-track.x,ship.y-track.y),actual=Math.max(Math.abs(ship.speed||0),Math.hypot(ship.vx||0,ship.vy||0));
        const teleport=moved>Math.max(600,actual*dt*4+100);
        const observed=ship.id==='player'||actual>0?actual:teleport?0:Math.min(600,moved/dt);
        track.speed+=(observed-track.speed)*(1-Math.exp(-dt/.22));track.phase+=dt*track.speed/Math.max(8,result.length*2);result.speed=track.speed;result.phase=track.phase;
        if(teleport){wakes=wakes.filter(w=>w.id!==ship.id);track.anchor=stern;}
        if(!teleport&&Math.hypot(stern.x-track.anchor.x,stern.y-track.anchor.y)>.5&&clock-track.lastEmit>=profile.life/23){
          wakes.push(launchedWake(result,track.anchor,stern,clock,clock-track.lastEmit));
          track.anchor=stern;track.lastEmit=clock;
        }
        track.x=ship.x;track.y=ship.y;track.seen=clock;return result;
      });
      // Retain the player's complete turn, then recent trails from the visible
      // fleet. Current hulls are never dropped by the trail budget.
      const playerWakes=wakes.filter(w=>w.id==='player').slice(-23),otherWakes=wakes.filter(w=>w.id!=='player').slice(-169);
      wakes=[...playerWakes,...otherWakes];speed=ships[0].speed;
      for(const [id,track] of tracks)if(clock-track.seen>profile.life)tracks.delete(id);
      previous={...p};
    }
    function setEnabled(value,state){enabled=!!value;if(enabled)reset(state);else{wakes=[];active=false;}}
    function setPreset(value,state){if(!presets[value])return false;preset=value;if(value==='badlands')colour='original';reset(state);return true;}
    function setColour(value){if(!['four','purple','red','blue','yellow','original'].includes(value))return false;colour=value;return true;}
    function inputs(view,pass='back'){
      if(!active||!patch)return null;
      const profile=presets[preset],zoom=view.zoom||1,cameraX=Number(view.cameraX)||0,cameraY=Number(view.cameraY)||0;
      const cx=view.w/2,cy=view.h/2,width=patch.width*zoom,height=patch.height*zoom;
      const centerX=cx+(patch.x-cameraX)*zoom,centerY=cy+(patch.y-cameraY)*zoom,bound=Math.hypot(width,height)/2;
      if(centerX+bound<0||centerX-bound>view.w||centerY+bound<0||centerY-bound>view.h)return null;
      const planes=[.98,1,1.02].map((rate,i)=>({x:cx+(patch.x-cameraX)*zoom*rate,y:cy+(patch.y-cameraY)*zoom*rate,
        width:width*(1-i*.09),height:height*(1-i*.09),angle:patch.angle+i*.08,
        alpha:pass==='front'?(i===2?profile.front:0):(i===0?profile.opacity*.78:i===1?profile.opacity*.22:0)}));
      const screen=(x,y)=>({x:cx+(x-cameraX)*zoom,y:cy+(y-cameraY)*zoom});
      const projectWake=wake=>{
        const age=clock-wake.at,a=screen(wake.ax,wake.ay),b=screen(wake.bx,wake.by);
        const radius=wake.radius*zoom*(1+age/profile.life*.10),decay=t=>wake.strength*Math.pow(Math.max(0,1-t/profile.life),1.6);
        const transport=t=>((wake.spreadBase||0)+(view.reducedMotion?0:(wake.outward||0)*1.25*(1-Math.exp(-t/1.25))))*zoom;
        const spread=transport(age),spreadA=transport(age+(wake.duration||0));
        const dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy)||1,alongPad=Math.max(radius*1.6,3*(radius*.7+1));
        const acrossPad=Math.max(radius*3.3,radius*1.2+spreadA+3*(radius*.38+.8+spreadA*.10));
        return {kind:'wake',id:wake.id,x:(a.x+b.x)/2,y:(a.y+b.y)/2,ax:a.x,ay:a.y,bx:b.x,by:b.y,radius,strength:decay(age),strengthA:decay(age+(wake.duration||0)),spread,spreadA,age:view.reducedMotion?0:age,phase:view.reducedMotion?0:wake.phase,
          boundX:Math.abs(dx)/2+Math.abs(dx)/distance*alongPad+Math.abs(dy)/distance*acrossPad+2,
          boundY:Math.abs(dy)/2+Math.abs(dy)/distance*alongPad+Math.abs(dx)/distance*acrossPad+2};
      };
      const records=wakes.map(projectWake);
      for(const ship of ships){
        const c=Math.cos(ship.heading),s=Math.sin(ship.heading),body=screen(ship.visualX??ship.x,ship.visualY??ship.y),length=ship.length*zoom,width=ship.width*zoom;
        const pressure=clamp(ship.speed/250),band=Math.max(1.2,width*.27),waveBand=Math.max(1.4,width*(.30+.20*pressure));
        const reachAlong=Math.max(length+Math.max(1.2,width*.45)*3,length*2.2)+2;
        const reachAcross=Math.max(width+band*3.5,ship.profile[15]*zoom+length*3.2*(.24+.48*pressure)+waveBand*3.3)+2;
        const boundX=Math.abs(c)*reachAlong+Math.abs(s)*reachAcross,boundY=Math.abs(s)*reachAlong+Math.abs(c)*reachAcross;
        const fieldX=body.x+c*ship.offset*zoom,fieldY=body.y+s*ship.offset*zoom;
        if(fieldX+boundX<0||fieldX-boundX>view.w||fieldY+boundY<0||fieldY-boundY>view.h)continue;
        const track=tracks.get(ship.id),rear=ship.offset-ship.length,stern={x:(ship.visualX??ship.x)+c*rear,y:(ship.visualY??ship.y)+s*rear};
        if(track&&ship.speed>1&&Math.hypot(stern.x-track.anchor.x,stern.y-track.anchor.y)>.1){
          records.push(projectWake(launchedWake(ship,track.anchor,stern,clock,clock-track.lastEmit)));
        }
        records.push({kind:'hull',id:ship.id,x:fieldX,y:fieldY,cos:c,sin:s,length,width,profile:ship.profile.map(n=>n*zoom),speed:pressure,phase:view.reducedMotion?0:ship.phase,boundX,boundY});
      }
      return {planes,style:profile.style,time:view.reducedMotion?0:clock*profile.activity,seed:19.813,
        options:{records,densityFloor:profile.densityFloor,colourPreview:colour}};
    }
    function snapshot(){return {enabled,preset,colour,eligible:eligible(owner),active,clock,patch:patch&&{...patch},speed,
      dimensions:{...dimensions},wakes:wakes.map(wake=>({...wake,age:clock-wake.at})),wakeCount:wakes.filter(w=>w.id==='player').length,totalWakes:wakes.length,shipCount:ships.length,
      ships:ships.map(ship=>({id:ship.id,x:ship.x,y:ship.y,width:ship.width,length:ship.length,speed:ship.speed,outline:!!ship.shape}))};}
    return Object.freeze({update,reset,setEnabled,setPreset,setColour,inputs,snapshot});
  }
  function createFrameMonitor(targetHz=120){
    const budget=1000/targetHz,ring=new Float64Array(720);let cursor=0,count=0,frames=0,seconds=0,misses=0,refreshMisses=0,over50=0,worst=0;
    function reset(){cursor=count=frames=seconds=misses=refreshMisses=over50=worst=0;}
    function record(dt,active=true){if(!active||!(dt>0))return;const ms=dt*1000;ring[cursor]=ms;cursor=(cursor+1)%ring.length;count=Math.min(count+1,ring.length);frames++;seconds+=dt;worst=Math.max(worst,ms);if(ms>budget*1.08)misses++;if(ms>budget*1.5)refreshMisses++;if(ms>50)over50++;}
    function snapshot(){const values=Array.from(ring.subarray(0,count)),sum=values.reduce((a,b)=>a+b,0);values.sort((a,b)=>a-b);return {targetHz,budgetMs:budget,frames,activeSeconds:seconds,fps:sum?count*1000/sum:0,p95Ms:values[Math.max(0,Math.ceil(count*.95)-1)]||0,worstFrameMs:worst,budgetMisses:misses,missedRefreshIntervals:refreshMisses,over50ms:over50,allObservedWithinBudgetTolerance:frames>0&&misses===0};}
    return Object.freeze({record,snapshot,reset});
  }
  function createRenderer({weather=false,collect=null}={}){
  const storm=weather?null:window.nativeDevNebulaStorm?.createRenderer();
  const fire=weather?null:window.nativeNebulaFire?.createModel();
  const model=createModel(),frameMonitor=createFrameMonitor();let ownerState=null,view=null,current=null,key=null,back=null,front=null,layers=null,last={},frameSerial=0,builtFrame=-1,builtKey=null,builtValid=false,builtField=null,builtRevision=-1,builtPending='',builtPrediction=0;
  let materialOwner=null,materialField=null,materialMask=null,materialPose=null,materialPatch=null,materialBodies=[],materialSource=null,materialGasSource=null,materialSeed=null,sourceTime=-Infinity,sourceColour=null,wasSuspended=true,missingMasks=[];
  let materialCurrent=null,materialVortices=[],materialHeat=null,materialSheets=[],materialWeatherClock=0,vortexProjection=null;
  let hud=null,hudEnabled=false,hudClock=0,paintRect=null;
  const profileFor=()=>weather?current.profile:presets[current.preset];
  function resetMaterial(){materialSeed?.cancel();materialSeed=null;if(materialField)window.nativeNebulaMaterial?.release?.(materialField);materialField?.dispose?.();materialField=null;materialCurrent=null;materialVortices=[];materialHeat=null;materialSheets=[];vortexProjection=null;materialPatch=null;materialBodies=[];materialSource=null;materialGasSource=null;sourceTime=-Infinity;sourceColour=null;wasSuspended=true;key=null;}
  function changePreset(value,state){const ok=model.setPreset(value,state);if(!ok)return false;storm?.reset();fire?.reset();if(value==='badlands')storm?.prepare();resetMaterial();return true;}
  function resetFog(state,options){const ok=model.reset(state,options);storm?.reset();fire?.reset();resetMaterial();return ok;}
  function volumePlanes(v,patch,profile){const p=current?.continuousAnchor||patch;return [0,1,2].map(i=>({x:v.w/2+(p.x-v.cameraX)*(v.zoom||1),y:v.h/2+(p.y-v.cameraY)*(v.zoom||1),width:patch.width*(v.zoom||1)*(1-i*.09),height:patch.height*(v.zoom||1)*(1-i*.09),angle:patch.angle+i*.08,alpha:i===0?profile.opacity*.78:i===1?profile.opacity*.22:profile.front}));}
  function copy(frame,canvas){canvas||=document.createElement('canvas');if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(frame,0,0);return canvas;}
  function fieldView(){return {w:materialField.width,h:materialField.height,cameraX:materialField.minX+materialField.width/2,cameraY:materialField.minY+materialField.height/2,zoom:1};}
  function prepareField(state){
    if(materialOwner!==state){materialOwner=state;resetMaterial();}
    if(materialField)return;
    const api=window.nativeNebulaMaterial,p={...current.patch},c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle)),width=p.width*c+p.height*s+160,height=p.height*c+p.width*s+160;
    const asyncSeed=weather&&api.gasTextureReady&&window.nativeNebulaGas.canSeedInWorker;
    materialPatch=p;materialField=api.createRuntimeField({minX:p.x-width/2,minY:p.y-height/2,width,height,cell:fluidCell,uniform:0,awaitSeed:asyncSeed});
    const v=fieldView(),profile=profileFor(),seedProfile=weather?{...profile,opacity:.85,front:.28}:profile,gas=window.nativeNebulaGas;
    const description={view:v,planes:volumePlanes(v,p,seedProfile),style:profile.style,time:0,seed:current.seed??19.813,
      options:{densityFloor:profile.densityFloor,colourPreview:current.colour,continuous:!!current.continuous}},field=materialField;
    const seedOnMain=()=>{if(materialField!==field)return;const d=description,raw=gas.render(d.view,d.planes,d.style,d.time,d.seed,d.options),seed=copy(raw,null),read=seed.getContext('2d',{willReadFrequently:true});
      if(!materialSource)materialSource=seed;field.seed(read.getImageData(0,0,seed.width,seed.height).data,seed.width,seed.height);};
    if(asyncSeed){
      const size=gas.surfaceSize(v);materialSource=document.createElement('canvas');materialSource.width=size.w;materialSource.height=size.h;materialGasSource=description;
      try{materialSeed=gas.requestSeed(description,size.w,size.h);materialSeed.promise.then(result=>{if(result&&materialField===field)field.seed(result.rgba,result.w,result.h);}).catch(()=>seedOnMain());}
      catch{seedOnMain();}
    }else seedOnMain();
    sourceTime=0;sourceColour=current.colour;
  }
  function bodyFor(state,d,player=false){
    const pose=player?(view.ship||position(state)):(window.nativeSimulationFrame?.renderPose?.(state,d)||d),dimensions=player?(view.dimensions||d.dimensions):d.dimensions;
    const stage=window.nativeShipDefinitions.stage(d);let asset=d.definition?.renderer?window.nativeRepairVisuals?.fogArtwork?.(d):window.vexedFlightAssets?.peekShip?.(d.shipType,stage,{fallback:true,markVisible:false});
    if(asset&&!d.definition?.renderer&&state.shipRepairs)asset=window.nativeRepairVisuals?.surface?.(d,[0,1,2,3].map(s=>window.vexedFlightAssets.peekShip(d.shipType,s,{fallback:false,markVisible:false})),asset)||asset;
    const id=player?'player':String(d.id).startsWith(d.category+':')?String(d.id):d.category+':'+d.id,mask=asset?window.nativeNebulaMaterial.maskFor(asset):window.nativeNebulaMaterial.maskForType(d.shipType,stage);
    const p={shipType:d.shipType,x:pose.x,y:pose.y,heading:Number(pose.heading??d.heading??state.angle)||0,width:dimensions?.width||10,height:dimensions?.height||16,speed:Math.max(Math.abs(d.speed||0),Math.hypot(d.vx||0,d.vy||0))};
    if(weather&&!player){p.x-=current.origin.x;p.y-=current.origin.y;}
    const pivot=asset?.fogPivot||mask?.fogPivot;if(pivot){const c=Math.cos(p.heading),s=Math.sin(p.heading),forward=pivot.forward*p.height,side=pivot.side*p.width;p.x+=c*forward-s*side;p.y+=s*forward+c*side;}
    if(player){materialPose=p;materialMask=mask;}
    if(!mask){missingMasks.push(id);return null;}
    // Previous positions are authoritative world poses. Preserve only the art
    // pivot here; subtracting the current descriptor would add interpolation
    // delay to the beginning of a newly observed path.
    const from=!player&&Number.isFinite(d.previousX)&&Number.isFinite(d.previousY)?{...p,x:p.x+d.previousX-pose.x,y:p.y+d.previousY-pose.y}:undefined;
    const end=from?{...p,x:p.x+d.x-pose.x,y:p.y+d.y-pose.y}:undefined;
    const radius=Math.hypot(p.width,p.height)/2,code=q=>(q.x+radius<materialField.minX?1:0)|(q.x-radius>materialField.minX+materialField.width?2:0)|(q.y+radius<materialField.minY?4:0)|(q.y-radius>materialField.minY+materialField.height?8:0),before=from?code(from):0,after=end?code(end):0;
    return {id,category:player?'player':d.category,pose:p,from,sweepEnd:before&&after&&!(before&after)?end:undefined,mask};
  }
  function collectBodies(state){
    // Isolated presentations supply their own descriptors, sharing the same
    // hull masks and fluid solver without querying the live population.
    if(collect)return collect(state).map(d=>bodyFor(state,d)).filter(Boolean);
    const own=window.nativeShipDefinitions.describe(state,state,{category:'player'}),player=bodyFor(state,own,true),pad=128;
    const categories=[...new Set([...(window.nativeShipSystems?.registered?.()||['player','civilian','tug','repair-drone']),'asteroid'])];
    const origin=weather?current.origin:{x:0,y:0};
    const found=window.nativeShipSystems?.query?.(state,{system:state.system,minX:materialField.minX+origin.x-pad,minY:materialField.minY+origin.y-pad,maxX:materialField.minX+materialField.width+origin.x+pad,maxY:materialField.minY+materialField.height+origin.y+pad,categories,swept:true})||{};
    const bodies=player?[player]:[];
    const mining=window.nativeNebulaAsteroids?.miningBodies(state,{origin,field:materialField});
    // The shared query includes swept crossings. A fast hull can enter and
    // leave between frames even when its current endpoint is outside the cloud.
    for(const d of found.bystanders||[]){if(d.category==='player'||!(d.hull>0)||['destroyed','warp','arriving'].includes(d.entity?.phase))continue;const b=bodyFor(state,d);if(b)bodies.push(b);}
    for(const d of found.rocks||[]){if(mining?.ids.has(d.rockId??d.entity?.slotId))continue;const b=window.nativeNebulaAsteroids?.bodyFor(state,d,{origin,zoom:view.zoom||1,field:materialField});if(b)bodies.push(b);}
    if(mining)bodies.push(...mining.bodies);
    return bodies;
  }
  function updateHud(dt,active){
    frameMonitor.record(dt,active);if(!hudEnabled||!ownerState?.devMode){if(hud)hud.hidden=true;return;}
    if(!hud){hud=document.createElement('output');hud.className='dev-fog-frame-hud';hud.setAttribute('aria-label','Flight frame timing');document.body.append(hud);}
    hud.hidden=!active;hudClock+=dt;if(hudClock<.25)return;hudClock=0;
    const p=frameMonitor.snapshot();hud.textContent=`${p.fps.toFixed(1)} FPS / ${p.targetHz} target · over budget ${p.budgetMisses} · worst ${p.worstFrameMs.toFixed(1)} ms`;
  }
  function frame(state,dt,nextView){
    if(!weather){window.nativeParallaxNebulae?.frame?.(state);window.nativeGalaxyFog?.frame?.(state,dt,nextView);}
    frameSerial++;
    if(weather){const volume=nextView.weatherVolume;if(!volume){current=null;return;}current={...volume,active:true,enabled:true,colour:'original'};const ship=nextView.ship||position(state);nextView={...nextView,cameraX:nextView.cameraX-volume.origin.x,cameraY:nextView.cameraY-volume.origin.y,ship:{...ship,x:ship.x-volume.origin.x,y:ship.y-volume.origin.y}};}
    ownerState=state;view=nextView;const suspended=nextView.suspended||nextView.hidden||!(dt>0);
    if(!weather)updateHud(dt,!!state?.devMode&&!suspended&&(typeof document==='undefined'||!document.hasFocus||document.hasFocus()));
    if(materialOwner&&materialOwner!==state){materialOwner=null;materialMask=null;materialPose=null;resetMaterial();frameMonitor.reset();}
    if(!weather){model.update(state,dt,{...nextView,material:true});current=model.snapshot();storm?.frame(state,dt,nextView,current);fire?.frame(state,dt,nextView,current);}
    if(materialPatch&&current.patch&&(materialPatch.x!==current.patch.x||materialPatch.y!==current.patch.y||materialPatch.angle!==current.patch.angle))resetMaterial();
    if(!current.active||!current.enabled||!weather&&!eligible(state)||!window.nativeNebulaMaterial){wasSuspended=true;return;}
    if(suspended){wasSuspended=true;return;}
    prepareField(state);missingMasks=[];materialBodies=collectBodies(state);
    materialHeat=null;materialSheets=[];materialWeatherClock=0;
    if(weather&&current.badlandsOptics&&window.nativeBadlandsWeather){
      const origin=current.origin,box={minX:materialField.minX+origin.x,minY:materialField.minY+origin.y,maxX:materialField.minX+materialField.width+origin.x,maxY:materialField.minY+materialField.height+origin.y};
      const world=window.nativePlasmaVortices?.vortices(state,box)||[];
      if(!vortexProjection||vortexProjection.source!==world||vortexProjection.x!==origin.x||vortexProjection.y!==origin.y)vortexProjection={source:world,x:origin.x,y:origin.y,list:window.nativeBadlandsWeather.localize(world,origin)};
      materialVortices=vortexProjection.list;
      const effects=nextView.weatherEffects;materialWeatherClock=effects?.clock||0;
      materialHeat=effects?.heat&&{fronts:window.nativeBadlandsWeather.localize(effects.heat.fronts,origin),time:effects.heat.time};
      materialSheets=window.nativeBadlandsWeather.localize(effects?.sheets||[],origin);
    }else materialVortices=!weather&&current.preset==='badlands'?window.nativePlasmaVortices?.vortices(state)||[]:[];
    // The visible funnels use the same fixed geography everywhere. Only local
    // ship interactions need conservative gas forcing in retained weather cores.
    const vortices=weather?materialVortices.filter(v=>materialBodies.some(b=>Math.hypot(b.pose.x-v.x,b.pose.y-v.y)<v.radius*1.35+Math.hypot(b.pose.width,b.pose.height)/2+120)):materialVortices;
    materialCurrent=(weather||current.preset==='badlands')?window.nativeBadlandsCurrents?.fieldFor(state,materialField,weather?current.origin:{x:0,y:0})||null:null;
    materialField.updateMany(materialBodies,dt,{reducedMotion:nextView.reducedMotion,rebase:wasSuspended,vortices,vortexTime:Number(state.shipSimulation?.seconds)||0,current:materialCurrent,currentTime:Number(state.shipSimulation?.seconds)||0});wasSuspended=false;
  }
  function build(){
    const renderRevision=materialField?.revision,renderPending=materialField?.pendingRevision,renderPrediction=view&&!view.reducedMotion?(materialField?.predictionSeconds||0):0;
    if(!window.nativeNebulaMaterial?.batching&&builtFrame===frameSerial&&builtKey===key&&builtField===materialField&&builtRevision===renderRevision&&builtPending===renderPending&&builtPrediction===renderPrediction)return builtValid;
    builtFrame=frameSerial;builtKey=key;builtValid=false;builtField=materialField;builtRevision=renderRevision;builtPending=renderPending;builtPrediction=renderPrediction;
    if(!materialField||!current?.active||!current.enabled)return false;
    const zoom=view.zoom||1,halfW=view.w/zoom/2,halfH=view.h/zoom/2;
    const pad=materialField.cell*2+2/zoom;
    if(view.cameraX+halfW<materialField.minX-pad||view.cameraX-halfW>materialField.minX+materialField.width+pad||view.cameraY+halfH<materialField.minY-pad||view.cameraY-halfH>materialField.minY+materialField.height+pad)return false;
    // Offscreen hulls still evolve the shared field; only their screen masks cull.
    const visibleBodies=materialBodies.filter(({pose:p})=>{const radius=Math.hypot(p.width,p.height)/2+4/zoom;return Math.abs(p.x-view.cameraX)<=halfW+radius&&Math.abs(p.y-view.cameraY)<=halfH+radius;});
    const clock=current.continuous?(Number(ownerState.shipSimulation?.seconds)||0):materialField.clock,prediction=!view.reducedMotion&&materialField.activeTileCount>0?materialField.predictionSeconds:0,profile=profileFor();
    const vortices=weather?materialVortices.filter(v=>Math.abs(v.x-view.cameraX)<=halfW+v.radius*1.35&&Math.abs(v.y-view.cameraY)<=halfH+v.radius*1.35).sort((a,b)=>Math.hypot(a.x-view.cameraX,a.y-view.cameraY)-Math.hypot(b.x-view.cameraX,b.y-view.cameraY)).slice(0,8):materialVortices,vortexTime=view.reducedMotion?0:Number(ownerState.shipSimulation?.seconds)||0;
    const heat=weather?materialHeat:fire?.material(),fireFronts=heat?.fronts||[],fireTime=heat?.time||0,sheetFlashes=weather?materialSheets:storm?.material?.()||[],sheetClock=weather?materialWeatherClock:storm?.snapshot().clock||0;
    const next={w:view.w,h:view.h,x:view.cameraX,y:view.cameraY,zoom,colour:current.colour,opacity:weather?profile.opacity/.85:1,reduced:view.reducedMotion,revision:materialField.revision,pending:materialField.pendingRevision,prediction,phase:view.reducedMotion?0:Math.floor(clock*30),bodies:visibleBodies};
    const same=key&&key.w===next.w&&key.h===next.h&&key.x===next.x&&key.y===next.y&&key.zoom===next.zoom&&key.colour===next.colour&&key.opacity===next.opacity&&key.reduced===next.reduced&&key.revision===next.revision&&key.pending===next.pending&&key.prediction===next.prediction&&key.phase===next.phase&&key.bodies.length===visibleBodies.length&&visibleBodies.every((b,i)=>{const a=key.bodies[i],p=a.pose,q=b.pose;return a.id===b.id&&p.shipType===q.shipType&&p.x===q.x&&p.y===q.y&&p.heading===q.heading&&p.width===q.width&&p.height===q.height;});
    if(same&&key.currentId===materialCurrent?.id&&key.currentTime===(materialCurrent&&!view.reducedMotion?Number(ownerState.shipSimulation?.seconds)||0:0)&&key.vortexCount===vortices.length&&key.fireTime===(fireFronts.length?fireTime:0)&&key.fireCount===fireFronts.length&&key.sheetCount===sheetFlashes.length&&key.sheetClock===(sheetFlashes.length?sheetClock:0)&&!window.nativeNebulaMaterial?.batching&&(layers||back&&front)){builtValid=true;return true;}
    next.vortexCount=vortices.length;next.fireCount=fireFronts.length;next.fireTime=fireFronts.length?fireTime:0;next.currentId=materialCurrent?.id;next.currentTime=materialCurrent&&!view.reducedMotion?Number(ownerState.shipSimulation?.seconds)||0:0;next.sheetCount=sheetFlashes.length;next.sheetClock=sheetFlashes.length?sheetClock:0;
    const colourKey=current.colour+':'+profile.style;
    const nextSource=sourceColour!==colourKey||!view.reducedMotion&&clock-sourceTime>=1/30,directGas=weather&&window.nativeNebulaMaterial.gasTextureReady;
    if(nextSource||materialGasSource&&!directGas){
      let description=materialGasSource;
      if(nextSource){const v=fieldView(),sourceProfile=weather?{...profile,opacity:.85,front:.28}:profile;
        description={view:v,planes:volumePlanes(v,materialPatch,sourceProfile),style:profile.style,time:(view.reducedMotion?Math.max(0,sourceTime):clock)*profile.activity,seed:current.seed??19.813,
          options:{densityFloor:profile.densityFloor,colourPreview:current.colour,continuous:!!current.continuous}};
        if(!view.reducedMotion)sourceTime=clock;sourceColour=colourKey;
      }
      if(directGas)materialGasSource=description;
      else{const d=description,raw=window.nativeNebulaGas.render(d.view,d.planes,d.style,d.time,d.seed,d.options);materialSource=copy(raw,materialSource);materialGasSource=null;}
    }
    let renderView=view,clip=null;paintRect=null;
    if(current.continuous&&window.nativeNebulaMaterial?.batching){const p=current.patch,z=view.zoom||1,f=current.feather||0,left=Math.max(0,view.w/2+(p.x-p.width/2-f-view.cameraX)*z),top=Math.max(0,view.h/2+(p.y-p.height/2-f-view.cameraY)*z),right=Math.min(view.w,view.w/2+(p.x+p.width/2+f-view.cameraX)*z),bottom=Math.min(view.h,view.h/2+(p.y+p.height/2+f-view.cameraY)*z);if(right<=left||bottom<=top)return false;clip={x:left,y:top,w:right-left,h:bottom-top};}
    if(current.continuous&&!window.nativeNebulaMaterial?.batching){
      const p=current.patch,z=view.zoom||1,f=current.feather||0,left=Math.max(0,Math.floor(view.w/2+(p.x-p.width/2-f-view.cameraX)*z)-1),top=Math.max(0,Math.floor(view.h/2+(p.y-p.height/2-f-view.cameraY)*z)-1);
      const right=Math.min(view.w,Math.ceil(view.w/2+(p.x+p.width/2+f-view.cameraX)*z)+1),bottom=Math.min(view.h,Math.ceil(view.h/2+(p.y+p.height/2+f-view.cameraY)*z)+1);
      if(right<=left||bottom<=top)return false;
      paintRect={x:left,y:top,w:right-left,h:bottom-top};renderView={...view,w:paintRect.w,h:paintRect.h,cameraX:view.cameraX+(left+paintRect.w/2-view.w/2)/z,cameraY:view.cameraY+(top+paintRect.h/2-view.h/2)/z};
    }
    const tile=current.continuous?{x:current.patch.x,y:current.patch.y,halfWidth:current.patch.width/2,halfHeight:current.patch.height/2,feather:current.feather||64}:null;
    const api=window.nativeNebulaMaterial,pair=api.renderPair(renderView,materialSource,materialField,visibleBodies,{worldSource:true,sourceVersion:sourceTime+':'+sourceColour,gasSource:materialGasSource,opacity:next.opacity,direct:true,clearPending:true,smooth:!view.reducedMotion,clip,tile,badlands:current.badlandsOptics,vortices,vortexTime,fireFronts,fireTime,sheetFlashes,current:materialCurrent,currentTime:next.currentTime});layers=pair.paint?pair:null;
    if(layers){back=pair.back;front=pair.front;}else{back=copy(pair.back,back);front=copy(pair.front,front);}
    if(!layers){api.clearPending(back.getContext('2d'),renderView,materialField,visibleBodies);api.clearPending(front.getContext('2d'),renderView,materialField,visibleBodies);}key=next;builtKey=key;builtValid=true;
    last={...api.metrics(),mode:'shared-material',gas:window.nativeNebulaGas.metrics(),hulls:materialBodies.length,missingMasks:missingMasks.length};return true;
  }
  function paintLayer(ctx,pass){if(layers)layers.paint(ctx,pass);else ctx.drawImage(pass==='front'?front:back,0,0,paintRect?.w||view.w,paintRect?.h||view.h);}
  function paint(ctx,pass){if(!weather)window.nativeGalaxyFog?.paint?.(ctx,pass);if(!view||!current?.active||!build())return;ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation=current.continuous&&!window.nativeNebulaMaterial?.batching?'lighter':'screen';if(paintRect)ctx.translate(paintRect.x,paintRect.y);if(!weather&&current.preset==='badlands'&&storm)storm.paint(ctx,pass,paintLayer);else paintLayer(ctx,pass);ctx.restore();}
  function controls(dialog,state){
    if(!state?.devMode)return;const group=document.createElement('section');group.className='dev-fog-controls';
    group.innerHTML='<h3>Sol fog flight test</h3><label><input type="checkbox" data-dev-fog-enabled> Enable fog bank in Sol</label><label class="dev-select">Gas style<select data-dev-fog-preset><option value="harman">Harman wisps</option><option value="vex">Vex dense gas</option></select></label><label class="dev-select">Sol color preview<select data-dev-fog-colour><option value="four">All four colors</option><option value="purple">Purple</option><option value="red">Red</option><option value="blue">Blue</option><option value="yellow">Yellow</option><option value="original">Original region color</option></select></label><div class="dev-fog-colours" aria-label="Preview one fog color"><button type="button" data-dev-fog-colour-chip="purple">Purple</button><button type="button" data-dev-fog-colour-chip="red">Red</button><button type="button" data-dev-fog-colour-chip="blue">Blue</button><button type="button" data-dev-fog-colour-chip="yellow">Yellow</button></div><button type="button" data-dev-fog-reset>Reset fog ahead of ship</button><p data-dev-fog-status></p><label><input type="checkbox" data-dev-fog-frame-hud> Show flight frame timing</label><output data-dev-fog-frame-stats></output><button type="button" data-dev-fog-frame-reset>Clear frame timing</button>';
    const check=group.querySelector('[data-dev-fog-enabled]'),select=group.querySelector('[data-dev-fog-preset]'),button=group.querySelector('[data-dev-fog-reset]'),status=group.querySelector('[data-dev-fog-status]'),timing=group.querySelector('[data-dev-fog-frame-stats]'),show=group.querySelector('[data-dev-fog-frame-hud]'),colour=group.querySelector('[data-dev-fog-colour]');
    select.insertAdjacentHTML('beforeend','<option value="badlands">Badlands storm test</option>');
    const stormControls=document.createElement('div');stormControls.className='dev-fog-storm-controls';
    stormControls.innerHTML='<label><input type="checkbox" data-dev-fog-storm-enabled> Lightning storms</label><button type="button" data-dev-fog-lightning>Trigger lightning</button><p>Lightning briefly turns the orange gas white, with rapid clusters and quieter gaps. Trigger a flash, then close Dev tools to watch it.</p>';
    button.after(stormControls);const stormToggle=stormControls.querySelector('[data-dev-fog-storm-enabled]'),trigger=stormControls.querySelector('[data-dev-fog-lightning]');
    const heatControls=document.createElement('div');heatControls.innerHTML='<button type="button" data-dev-fog-sheet>Trigger sheet lightning</button><label><input type="checkbox" data-dev-fog-fire-enabled> Plasma heat fronts</label><button type="button" data-dev-fog-fire>Trigger plasma surge</button><p>Broad, turbulent plasma brightens within the nebula and fades between darker gas folds. Sheet lightning lights up larger storm cells.</p>';stormControls.append(heatControls);
    const fireToggle=heatControls.querySelector('[data-dev-fog-fire-enabled]'),fireTrigger=heatControls.querySelector('[data-dev-fog-fire]'),sheetTrigger=heatControls.querySelector('[data-dev-fog-sheet]');
    const vortexControls=document.createElement('label');vortexControls.innerHTML='<input type="checkbox" data-dev-fog-vortices> Plasma vortices: pull, spin and damage';stormControls.append(vortexControls);
    const vortexToggle=vortexControls.querySelector('input');vortexToggle.checked=window.nativePlasmaVortices?.snapshot(state).enabled??true;
    vortexToggle.onchange=()=>window.nativePlasmaVortices?.setEnabled(vortexToggle.checked);
    const currentControls=document.createElement('label');currentControls.innerHTML='<input type="checkbox" data-dev-fog-currents> Turbulent currents: drift and shear';stormControls.append(currentControls);
    const currentToggle=currentControls.querySelector('input');currentToggle.checked=window.nativeBadlandsCurrents?.snapshot(state).enabled??true;
    currentToggle.onchange=()=>window.nativeBadlandsCurrents?.setEnabled(currentToggle.checked);
    const sync=()=>{const c=model.snapshot(),p=frameMonitor.snapshot();check.checked=c.enabled;select.value=c.preset;colour.value=c.colour;for(const chip of group.querySelectorAll('[data-dev-fog-colour-chip]'))chip.setAttribute('aria-pressed',String(chip.dataset.devFogColourChip===c.colour));button.disabled=!eligible(state);show.checked=hudEnabled;
      stormControls.hidden=c.preset!=='badlands';stormToggle.checked=storm?.snapshot().enabled??false;trigger.disabled=!eligible(state)||!c.enabled||!stormToggle.checked||!!view?.reducedMotion;
      fireToggle.checked=fire?.snapshot().enabled??false;fireTrigger.disabled=!eligible(state)||!c.enabled||!fireToggle.checked||!!view?.reducedMotion;sheetTrigger.disabled=trigger.disabled;
      status.textContent=!eligible(state)?'Jump to Sol to use this local test.':c.preset==='badlands'?'A large pink-orange Badlands cloud surrounds the flight test area. Lightning lights up the gas and follows its existing wakes.':'Purple, red, blue and yellow gas share the Sol test cloud. Choose one color to compare it on the same moving fog and wake.';
      timing.textContent=p.frames?`${p.fps.toFixed(1)} FPS · 120 target · ${p.budgetMisses} frames over budget · worst ${p.worstFrameMs.toFixed(1)} ms`:'Frame timing records active foreground flight. Target: 120 FPS (8.33 ms per frame).';};
    check.onchange=()=>{model.setEnabled(check.checked,state);storm?.reset();fire?.reset();resetMaterial();sync();};select.onchange=()=>{changePreset(select.value,state);sync();};button.onclick=()=>{resetFog(state);status.textContent='Fog reset ahead of your ship. Close Dev tools and fly forward.';};
    stormToggle.onchange=()=>{storm?.setEnabled(stormToggle.checked);sync();};trigger.onclick=()=>{if(storm?.trigger(state,model.snapshot()))status.textContent='Lightning queued. Close Dev tools to see the cloud flash.';};
    fireToggle.onchange=()=>{fire?.setEnabled(fireToggle.checked);key=null;sync();};
    fireTrigger.onclick=()=>{if(fire?.trigger(state,model.snapshot(),view&&{x:view.cameraX,y:view.cameraY-30}))status.textContent='Plasma surge queued. Close Dev tools to watch the gas heat up.';};
    sheetTrigger.onclick=()=>{if(storm?.triggerSheet(state,model.snapshot()))status.textContent='Sheet lightning queued. Close Dev tools to watch the storm cell light up.';};
    colour.onchange=()=>{model.setColour(colour.value);key=null;sync();};for(const chip of group.querySelectorAll('[data-dev-fog-colour-chip]'))chip.onclick=()=>{model.setColour(chip.dataset.devFogColourChip);key=null;sync();};
    show.onchange=()=>{hudEnabled=show.checked;if(hud)hud.hidden=!hudEnabled;};group.querySelector('[data-dev-fog-frame-reset]').onclick=()=>{frameMonitor.reset();sync();};dialog.querySelector('.dev-system-group').before(group);sync();
  }
  return Object.freeze({createModel,createFrameMonitor,frame,paint,controls,presets,fluidCell,createRenderer,dispose:resetMaterial,
    physicalRegion:state=>{if(weather||state!==ownerState||!eligible(state))return null;const c=model.snapshot();return c.enabled&&c.preset==='badlands'?c.patch:null;},
    reset:options=>resetFog(ownerState,options),setEnabled(value){model.setEnabled(value,ownerState);storm?.reset();fire?.reset();resetMaterial();},setPreset:value=>changePreset(value,ownerState),
    setColour(value){const ok=model.setColour(value);if(ok)key=null;return ok;},
    setStormEnabled:value=>storm?.setEnabled(value),triggerLightning:()=>storm?.trigger(ownerState,model.snapshot())||false,
    setFireEnabled(value){fire?.setEnabled(value);key=null;},triggerFire:()=>fire?.trigger(ownerState,model.snapshot(),view&&{x:view.cameraX,y:view.cameraY-30})||false,
    triggerSheet:()=>storm?.triggerSheet(ownerState,model.snapshot())||false,
    resetFrameStats(){frameMonitor.reset();},frameDelivery:()=>frameMonitor.snapshot(),
    material:()=>materialField?{field:materialField,mask:materialMask,pose:materialPose&&{...materialPose},patch:{...materialPatch},bodies:materialBodies,vortices:materialVortices,heat:materialHeat,sheets:materialSheets}:null,
    snapshot:()=>({...(weather?current:model.snapshot()),storm:storm?.snapshot()||null,fire:fire?.snapshot()||null,renderer:{...last},reference:'all-ships-and-asteroids',vortices:materialVortices.map(v=>({...v})),material:materialField?.metrics()||null,frameDelivery:frameMonitor.snapshot(),shipCount:materialBodies.filter(b=>b.category!=='asteroid').length,asteroidCount:materialBodies.filter(b=>b.category==='asteroid').length,missingMasks:missingMasks.slice(),ships:materialBodies.filter(b=>b.category!=='asteroid').map(b=>({id:b.id,x:b.pose.x,y:b.pose.y,width:b.pose.width/2,length:b.pose.height/2,speed:b.pose.speed,outline:true})),asteroids:materialBodies.filter(b=>b.category==='asteroid').map(b=>({id:b.id,x:b.pose.x,y:b.pose.y,size:b.pose.width,speed:b.pose.speed,outline:true}))})});
  }
  window.nativeDevFog=createRenderer();
})();
