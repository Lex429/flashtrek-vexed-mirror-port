/* Prepare real economic history before inserting a new captain. No artwork. */
(() => {
  'use strict';
  const fields=['shipSimulation','civilianTraffic','solEconomy','portDocking','shipRepairs','minedAsteroids','destroyedAsteroids','asteroidOreDrops','asteroidDamage','asteroidMotion','travelCorridors','worldBootstrap','badlandsRegionVersion'];
  const copy=value=>JSON.parse(JSON.stringify(value));
  // Include special hull profiles as well as starterShips. Workers need the
  // exact source proportions, without importing painting/effect modules.
  const artworkProfiles=()=>window.nativeShipDefinitions.registered().flatMap(definition=>{
    const profile=window.nativeShipDefinitions.artworkProfile(definition.id);
    return profile?[[definition.id,{width:profile.width,height:profile.height,displayRatio:profile.displayRatio}]]:[];
  });
  let template=null,pending=null,lastError=null,geometryChecked=0;
  function initialize(state,seconds=45){
    if(state.worldBootstrap?.version===1||state.civilianTraffic)return state;
    const wasLanded=state.landed;state.landed=true;
    window.nativeSimulation.ensure(state);
    window.nativeSolEconomy.initialize(state);window.nativeCivilianTraffic.initialize(state);
    window.nativeShipRepairs?.initialize(state);window.nativeNpcLives.initialize(state);
    const start=window.nativeSimulation.seconds(state);
    for(let i=0;i<seconds;i++){
      window.nativeSimulation.advance(state,1);
      window.nativeSimulationFrame?.begin(state);
      try{
        window.nativeSolEconomy.advance(state,1);
        window.nativeNpcLives.advance(state,1);
        window.nativeShipRepairs?.advance(state,1);
        window.nativeShipTraffic?.advance(state,1);window.nativeShipTraffic?.collide(state,1);
      }finally{window.nativeSimulationFrame?.end(state);}
      // Startup is already on the economic worker. Finish its due jobs in
      // bounded batches at this same clock, instead of handing flight a backlog.
      if(window.nativeCivilianPopulation)for(let pass=0;window.nativeNpcLives.metrics(state).backlog>0&&pass<256;pass++){
        window.nativeSimulationFrame?.begin(state);
        try{window.nativeNpcLives.advance(state,1);}finally{window.nativeSimulationFrame?.end(state);}
      }
    }
    const at=window.nativeSimulation.seconds(state);
    for(const ship of state.civilianTraffic.ships)if(ship.localLeg)window.nativeShipMotion.sampleLeg(ship,ship.localLeg,Math.min(at,ship.nextActionAt));
    for(const ship of state.solEconomy.freighters)if(ship.lifeLeg)window.nativeShipMotion.sampleLeg(ship,ship.lifeLeg,Math.min(at,ship.lifeEventAt));
    state.landed=wasLanded;
    state.worldBootstrap={version:1,historySeconds:at-start};
    return state;
  }
  function prepare(seed){
    if(pending)return pending;
    if(typeof Worker!=='function'||!window.nativeSystemHub?.sol)return Promise.resolve(null);
    pending=new Promise(resolve=>{
      let worker;try{worker=new Worker('world-bootstrap-worker.js?v=free-flight-activity-2-stutter-2-engine-slowdown-1-warp-pacing-1-hull-thrusters-2-warp-charge-1-warp-latency-1-npc-warp-1-animated-federation-1-federation-npcs-2-federation-expansion-1-system-defence-2-military-pursuit-2-faction-fleets-1-ferengi-response-3-badlands-1-orion-fleet-2-approach-2-neighbor-sky-3-territorial-yards-1-smooth-clouds-4-lag-removal-1-starter-torpedo-1-dot-loot-1-atlas-scale-1-compact-scale-1-inventory-loot-4-mvam-worker-profiles-1-weapon-mounts-2');}catch(error){lastError=String(error);resolve(null);return;}
      const timer=setTimeout(()=>{lastError='World preparation exceeded 30 seconds';worker.terminate();resolve(null);},30000);
      worker.onmessage=event=>{
        clearTimeout(timer);worker.terminate();
        if(event.data.ok){
          const geometry=event.data.geometry||[],mismatch=geometry.find(row=>{const d=window.nativeShipDefinitions.dimensions({shipType:row.type},row.category);return Math.abs(d.width-row.width)>1e-6||Math.abs(d.height-row.height)>1e-6;});
          if(mismatch)lastError='Startup worker hull geometry differs for '+mismatch.type;
          else if(!geometry.length)lastError='Startup worker omitted hull geometry validation';
          else{geometryChecked=geometry.length;template=event.data.snapshot;}
        }else lastError=event.data.error;
        resolve(template);
      };
      worker.onerror=event=>{lastError=event.message;clearTimeout(timer);worker.terminate();resolve(null);};
      const profiles=artworkProfiles();
      worker.postMessage({seed:copy(seed),sol:copy(window.nativeSystemHub.sol),profiles:copy(profiles)});
    });
    return pending;
  }
  function apply(state){
    if(state.civilianTraffic||state.worldBootstrap)return state;
    if(!template)return initialize(state);
    for(const field of fields)if(template[field]!==undefined)state[field]=copy(template[field]);
    return state;
  }
  const snapshot=state=>Object.fromEntries(fields.filter(k=>state[k]!==undefined).map(k=>[k,copy(state[k])]));
  // Observer proxies are runtime wrappers. Their owners expose the same full
  // saved collections for native worker cloning, without a large JSON detour.
  function transportState(state){
    const result={...state},systems=window.nativeShipSystems,docking=window.nativePortDocking;
    if(state.civilianTraffic)result.civilianTraffic={...state.civilianTraffic,ships:systems?.saveCollection?.(state.civilianTraffic,'ships')||state.civilianTraffic.ships};
    if(state.solEconomy)result.solEconomy={...state.solEconomy,freighters:systems?.saveCollection?.(state.solEconomy,'freighters')||state.solEconomy.freighters};
    if(state.portDocking)result.portDocking=docking?.saveData?.(state)||state.portDocking;
    return result;
  }
  function planTravel(state,journey,{signal}={}){
    if(typeof Worker!=='function')return Promise.resolve().then(()=>{if(signal?.aborted)throw Error('Travel preparation cancelled.');const planned=window.vexedTravelEvents.plan(state,journey);planned.calendar=window.nativeWorldTime.settleTransit(planned.next);return planned;});
    return new Promise((resolve,reject)=>{
      let worker,timer,capture,done=false;const rows=[];
      const finish=(error,value)=>{if(done)return;done=true;capture?.cancel();clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();if(error)reject(error);else resolve(value);};
      const abort=()=>finish(new Error('Travel preparation cancelled.'));
      if(signal?.aborted){abort();return;}
      try{
        worker=new Worker('world-bootstrap-worker.js?v=free-flight-activity-2-warp-preparation-1-stutter-2-engine-slowdown-1-warp-pacing-1-hull-thrusters-2-warp-charge-1-warp-latency-1-npc-warp-1-animated-federation-1-federation-npcs-2-federation-expansion-1-system-defence-2-military-pursuit-2-faction-fleets-1-ferengi-response-3-badlands-1-orion-fleet-2-approach-2-neighbor-sky-3-territorial-yards-1-smooth-clouds-4-lag-removal-1-starter-torpedo-1-dot-loot-1-atlas-scale-1-compact-scale-1-inventory-loot-4-mvam-worker-profiles-1-weapon-mounts-2');signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>finish(new Error('Travel preparation timed out.')),45000);
        worker.onerror=event=>finish(new Error(event.message||'Travel preparation failed.'));
        worker.onmessage=event=>{
          if(!event.data.ok){finish(new Error(event.data.error));return;}
          if(event.data.part){for(const row of event.data.part)rows[row.id]=row;return;}
          if(event.data.streamed){
            window.nativeSaveSnapshot.restoreAsync(rows,event.data.root,{signal}).then(next=>finish(null,{next,report:event.data.report,calendar:event.data.calendar})).catch(error=>finish(error));return;
          }
          try{finish(null,event.data.planned||JSON.parse(event.data.plannedText));}catch(error){finish(error);}
        };
        const profiles=artworkProfiles();
        const message={action:'travel',journey,sol:copy(window.nativeSystemHub.sol),profiles};
        const direct=()=>{
          try{worker.postMessage({...message,seed:transportState(state)});}
          catch(error){if(error.name!=='DataCloneError')throw error;worker.postMessage({...message,text:JSON.stringify(state)});}
        };
        if(window.nativeSaveSnapshot?.capture&&window.nativeSaveSnapshot.restoreAsync){
          capture=window.nativeSaveSnapshot.capture(state,{valid:()=>!done&&!signal?.aborted,
            part:part=>worker.postMessage({action:'travel-part',rows:part}),
            complete:root=>{if(!done)worker.postMessage({...message,root,streamed:true});},
            failed:()=>{if(!done)try{direct();}catch(error){finish(error);}}
          });
        }else direct();
      }catch(error){finish(error);}
    });
  }
  window.nativeWorldBootstrap=Object.freeze({initialize,prepare,apply,snapshot,planTravel,transportState,ready:()=>!!template,diagnostics:()=>({ready:!!template,error:lastError,geometryChecked})});
})();
