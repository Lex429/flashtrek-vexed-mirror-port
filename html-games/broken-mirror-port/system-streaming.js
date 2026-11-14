/* Bounded preparation along the player's course. It never integrates actors. */
(() => {
  'use strict';
  const states=new WeakMap(),horizon=12,interval=.15,maxTypes=6;
  function runtime(state){let value=states.get(state);if(!value){value={clock:0,next:0,system:null,scanAt:0,jobs:[],pending:false,rockImages:new Set(),bodies:new Set(),planet:null,stats:{passes:0,geometryPasses:0,shipRequests:0,planetRequests:0,bodyRequests:0,rockRequests:0,maxPassMs:0,failures:0}};states.set(state,value);}return value;}
  function advance(state,dt,{active=true}={}){
    if(!state||!active||state.landed||!(dt>0))return;
    const rt=runtime(state);rt.clock+=dt;if(rt.clock<rt.next)return;rt.next=rt.clock+interval;
    const started=performance.now(),flight=window.nativeManualFlight,point=flight.position(state);if(!point)return;
    const vx=Number(state.vx)||Math.cos(Number(state.angle)||0)*(Number(state.speed)||0),vy=Number(state.vy)||Math.sin(Number(state.angle)||0)*(Number(state.speed)||0);
    const future={x:point.x+vx*horizon,y:point.y+vy*horizon},region=flight.regionAtPoint(state,future,flight.currentRegion(state).system),system=region.system??state.system,origin=flight.anchor(system);if(!origin)return;
    if(rt.system!==system){rt.system=system;rt.scanAt=0;rt.jobs=[];}
    const x=future.x-origin.x,y=future.y-origin.y,size=window.nativeCivilianPopulation?.simulation.chunkSize||1024,cx=Math.floor(x/size),cy=Math.floor(y/size),box={minX:(cx-1)*size,minY:(cy-1)*size,maxX:(cx+2)*size,maxY:(cy+2)*size};
    // Preparing geometry/read models does not wake a ship, advance a job, or
    // activate distant physics. Only the player's actual chunk owner can do so.
    const rocks=window.nativeSolAsteroids?.queryBounds?.(system,box,{swept:false})||[];rt.stats.geometryPasses++;
    window.nativeShipSystems?.query?.(state,{system,...box,categories:['civilian','tug']});
    if(region.system!=null&&rt.planet!==system){rt.planet=system;rt.stats.planetRequests++;window.vexedFlightAssets?.loadPlanet?.(system)?.catch(()=>{rt.planet=null;rt.stats.failures++;});}
    if(performance.now()-started<2&&window.vexedSolFlight?.art){
      const body=window.nativeSystemCatalog?.bodies(system).find(b=>!rt.bodies.has(system+':'+b.id)&&b.x>=box.minX-300&&b.x<=box.maxX+300&&b.y>=box.minY-300&&b.y<=box.maxY+300);
      if(body){if(rt.bodies.size>=32)rt.bodies.delete(rt.bodies.values().next().value);rt.bodies.add(system+':'+body.id);window.vexedSolFlight.art(body.id,system);rt.stats.bodyRequests++;}
    }
    if(performance.now()-started<2&&typeof Image==='function'){
      const rock=rocks.find(r=>!rt.rockImages.has(r.file)&&!window.nativeSolAsteroids.peekImage(r.file)?.naturalWidth);
      if(rock){rt.rockImages.add(rock.file);const image=window.nativeSolAsteroids.image(rock.file);image.decode?.().catch(()=>{rt.stats.failures++;});rt.stats.rockRequests++;}
    }
    if(rt.clock>=rt.scanAt&&performance.now()-started<2){
      rt.scanAt=rt.clock+1;
      const crews=window.nativeNpcLives?.members?.(state,system)||[],types=new Map();
      for(const ship of crews){if(ship.hull<=0||ship.journey||['destroyed','warp','arriving'].includes(ship.phase))continue;
        const definition=window.nativeShipDefinitions.forEntity(state,ship,{category:'civilian'}),stage=window.nativeShipDefinitions.stage({entity:ship,definition}),key=ship.shipType+':'+stage;
        if(!types.has(key)){types.set(key,{type:ship.shipType,stage,key,dimensions:window.nativeShipDefinitions.dimensions(ship,'civilian')});if(types.size>=maxTypes)break;}
      }
      rt.jobs=[...types.values()];
    }
    if(!rt.pending&&performance.now()-started<2){
      const job=rt.jobs.find(job=>!window.nativeShipEffects?.stageReady?.(job.type,job.stage));
      if(job){rt.pending=true;rt.stats.shipRequests++;
        Promise.resolve(window.nativeShipEffects?.request?.(job.type,'civilian',{stage:job.stage,prefetch:true})).then(asset=>{
          const canvas=typeof document!=='undefined'&&document.querySelector?.('#space'),m=canvas?.getContext('2d')?.getTransform(),d=job.dimensions;
          if(asset&&canvas&&d)return window.nativeShipLampGPU?.prepare?.(canvas,asset,d.width,d.height,{scale:m?Math.hypot(m.a,m.b):1,lightGain:2.8,lightBloom:2.5,localLight:{direction:0,color:0,bright:.22}});
        })
          .catch(()=>{rt.stats.failures++;}).finally(()=>{rt.pending=false;});
      }
    }
    rt.stats.passes++;rt.stats.maxPassMs=Math.max(rt.stats.maxPassMs,performance.now()-started);
  }
  async function prepareArrival(state,{view,angle=0,signal,onProgress=()=>{}}={}){
    const check=()=>{if(signal?.aborted)throw Error('Arrival preparation cancelled.');};
    const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
    const jobs=new Map(),retained=[];let complete=0;
    const prepareOwner=async owner=>{
      if(!owner?.prepare){owner?.initialize(state);return;}
      const steps=owner.prepare(state);let result;
      do{
        check();const started=performance.now();
        do{result=steps.next();}while(!result.done&&performance.now()-started<2);
        if(!result.done)await yieldTask();
      }while(!result.done);
    };
    check();await yieldFrame();
    // Restore destination indexes while the native ship turns and charges.
    // Bound each task by CPU time; fast records need not wait a whole frame.
    window.nativeSolEconomy?.initialize(state);await yieldFrame();check();
    await prepareOwner(window.nativeShipRepairs);await yieldFrame();check();
    await prepareOwner(window.nativeNpcLives);
    await yieldFrame();check();
    await window.vexedSpace?.prepareSystem?.(state.system,{signal});check();
    const ship=window.vexedSolFlight.shipPosition(state),w=view?.w||600,h=view?.h||450;
    const initial=window.vexedRebirthWarp.arrival(0,angle),from={x:ship.x+initial.cameraX,y:ship.y+initial.cameraY};
    const bounds={minX:Math.min(ship.x,from.x)-w/2-240,maxX:Math.max(ship.x,from.x)+w/2+240,minY:Math.min(ship.y,from.y)-h/2-240,maxY:Math.max(ship.y,from.y)+h/2+240};
    const bodies=window.nativeSystemCatalog.bodies(state.system).filter(body=>{
      const p=window.vexedSolFlight.bodyPosition(body),r=window.vexedSolFlight.bodySize(body);
      return body.kind!=='belt'&&!body.occludedBy&&p.x+r>=bounds.minX&&p.x-r<=bounds.maxX&&p.y+r>=bounds.minY&&p.y-r<=bounds.maxY;
    });
    for(const body of bodies)jobs.set('body:'+body.id,()=>window.vexedSolFlight.prepareArt(body.id,state.system));
    const rocks=window.nativeSolAsteroids.queryBounds(state.system,bounds,{swept:false});
    for(const rock of rocks)if(!(state.minedAsteroids||[]).includes(rock.slotId)&&!(state.destroyedAsteroids||[]).includes(rock.slotId)){
      const file=window.nativeSolAsteroids.frame(rock,state.asteroidDamage?.[rock.slotId]);
      jobs.set('rock:'+file,async()=>{
        const image=window.nativeSolAsteroids.image(file);
        if(image.complete&&image.naturalWidth)return image;
        if(image.decode){await image.decode();return image;}
        await new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',()=>reject(Error('Arrival asteroid artwork could not load.')),{once:true});});return image;
      });
    }
    await yieldFrame();check();
    const ships=window.nativeShipSystems.query(state,{system:state.system,...bounds,swept:false,categories:['civilian','tug']}).bystanders;
    for(const descriptor of ships){
      if(descriptor.entity.hull<=0||['destroyed','warp','arriving'].includes(descriptor.entity.phase))continue;
      const type=descriptor.shipType,stage=window.nativeShipDefinitions.stage(descriptor),category=descriptor.category;
      jobs.set('ship:'+type+':'+stage,async()=>{
        for(let attempt=0;attempt<240;attempt++){
          // Keep required arrival plates in the visible working set through
          // handoff, rather than admitting them as disposable prefetches.
          check();const asset=await window.nativeShipEffects.request(type,category,{stage,visible:true});
          if(asset)return asset;await yieldFrame();
        }
        throw Error('Arrival ship artwork is still busy. Retry destination loading.');
      });
    }
    onProgress(complete,jobs.size);
    for(const load of jobs.values()){
      check();await yieldFrame();check();retained.push(await load());onProgress(++complete,jobs.size);
    }
    check();return {assets:retained,bodies:bodies.length,objects:jobs.size,system:state.system};
  }
  window.nativeSystemStreaming=Object.freeze({advance,prepareArrival,horizon,snapshot(state){const rt=states.get(state);return rt?{system:rt.system,pending:rt.pending,queuedTypes:rt.jobs.length,...rt.stats}:null;}});
})();
