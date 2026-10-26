/* Prepare real economic history before inserting a new captain. No artwork. */
(() => {
  'use strict';
  const fields=['shipSimulation','civilianTraffic','solEconomy','portDocking','shipRepairs','minedAsteroids','destroyedAsteroids','asteroidOreDrops','asteroidDamage','asteroidMotion','worldBootstrap'];
  const copy=value=>JSON.parse(JSON.stringify(value));
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
      let worker;try{worker=new Worker('world-bootstrap-worker.js?v=sol-quality-20261025-2');}catch(error){lastError=String(error);resolve(null);return;}
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
      const profiles=[...(window.starterShips||new Map())].map(([id,p])=>[id,{width:p.width,height:p.height,displayRatio:p.displayRatio}]);
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
  window.nativeWorldBootstrap=Object.freeze({initialize,prepare,apply,snapshot,ready:()=>!!template,diagnostics:()=>({ready:!!template,error:lastError,geometryChecked})});
})();
