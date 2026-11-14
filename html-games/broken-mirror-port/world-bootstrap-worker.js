/* Economic startup runs away from the rendering/input thread. */
'use strict';
self.window=self;
self.document={hidden:false};
self.Image=class {complete=false;naturalWidth=0;};
self.nativePause={active:false};self.nativeShipInventory={active:false};
self.starterShips=new Map();
self.showcaseWeaponAppearance={units:.91976};
self.showcaseShieldRadii=(w,h)=>({rx:w*.6,ry:h*.6});
self.createShowcaseWeaponVisual=input=>({...input});
self.showcaseHullBurst={burst(){},update(){}};
self.vexedFlightAssets={size:()=>({}),flightDimensions:()=>({width:30,height:60})};
self.vexedSolFlight={shipPosition:s=>({x:s.x,y:s.y}),bodySize:b=>({0:266,1:87,2:147,3:180,4:67,5:119,7:231,8:217,9:157,10:154,11:56}[b.id]||100)};
let travelRows=[];
self.onmessage=async event=>{
  try{
    if(event.data.action==='travel-part'){for(const row of event.data.rows)travelRows[row.id]=row;return;}
    self.nativeSystemHub={sol:event.data.sol};
    self.starterShips=new Map(event.data.profiles||[]);
    importScripts('world-data.js?v=blended-map-20261025','orion-world.js?v=orion-fleet-2','system-catalog-data.js?v=sol-quality-20261025-2','badlands-region.js?v=badlands-1-approach-2-neighbor-sky-3-smooth-clouds-4','system-catalog.js?v=mirror-expansion-1-distance-navigation-1-badlands-1','faction-shipyards.js?v=territorial-yards-1','flight-reference-data.js','regional-minerals.js?v=blended-map-20261025','civilian-access.js','civilian-population.js?v=regional-fleet-1','weapon-catalog.js?v=weapon-mounts-2',
      'simulation-clock.js','simulation-frame.js','ship-motion.js?v=stutter-2-engine-slowdown-1-hull-thrusters-1-route-priority-1-lag-removal-1-mvam-moving-1','ship-scale-settings.js?v=atlas-scale-1-compact-scale-1-size-175-mvam-compact-1-prometheus-v2','ship-weapon-mounts.js?v=weapon-mounts-2','ship-definitions.js?v=hull-thrusters-2-lag-removal-1-compact-scale-1-weapon-mounts-2','constitution-ships.js?v=flight-cache-1-weapon-mounts-2','federation-ships.js?v=animated-fleet-2-starter-torpedo-1-weapon-mounts-2','orion-ships.js?v=orion-fleet-2-weapon-mounts-2','prometheus-artwork.js?v=mvam-compact-1-prometheus-v2','prometheus-definitions.js?v=mvam-1-mvam-worker-profiles-1-weapon-mounts-2','federation-fleet.js?v=npc-roster-2','faction-fleets.js?v=territorial-rosters-1-ferengi-response-2-orion-fleet-2','ship-detail.js?v=system-defence-2',
      'ship-damage.js','ship-effects.js?v=system-entry-1','weapon-loadout.js?v=hull-thrusters-1-dot-loot-1-loot-inventory-pages-2','weapon-rules.js','combat-shots.js?v=system-defence-2-weapon-mounts-2-projectile-tail-1',
      'ship-systems.js?v=stutter-2-engine-slowdown-1-hull-thrusters-1-system-defence-2-lag-removal-1','rebirth-warp.js?v=warp-charge-1-npc-warp-1','faction-standing.js?v=system-defence-2','faction-defence.js?v=system-defence-2-military-pursuit-2-ferengi-response-2-inventory-loot-4','port-docking.js?v=stutter-2','sol-economy.js?v=seamless-warp-1-dot-loot-1',
      'civilian-combat-ai.js?v=system-defence-2-military-pursuit-2-lag-removal-1','civilian-traffic.js?v=travel-corridors-1-federation-npcs-2-system-defence-2-military-pursuit-2-faction-fleets-1-orion-fleet-2-lag-removal-1-inventory-loot-4','sol-asteroids.js?v=travel-corridors-1-stutter-2-badlands-1','asteroid-combat.js','manual-flight.js?v=system-entry-1','travel-corridors.js?v=system-entry-1-stutter-2-badlands-1',
      'npc-lives.js?v=free-flight-activity-2-stutter-2-warp-charge-1-npc-warp-1-federation-npcs-2-federation-expansion-1-system-defence-2-military-pursuit-2-faction-fleets-1-ferengi-response-2-badlands-1-orion-fleet-2-dot-loot-1','../flashtrek-broken-mirror/repair-hull-work.js','ship-repair-sites.js',
      'ship-repairs.js?v=activity-nearby-1-warp-charge-1-dot-loot-1','ship-traffic.js?v=lag-removal-1','world-bootstrap.js?v=blended-map-20261025-stutter-2-warp-pacing-1-hull-thrusters-2-warp-charge-1-warp-latency-1-federation-expansion-1-faction-fleets-1-ferengi-response-2-badlands-1-orion-fleet-2-approach-2-neighbor-sky-3-smooth-clouds-4-lag-removal-1-starter-torpedo-1-dot-loot-1-compact-scale-1-inventory-loot-4-mvam-worker-profiles-1-weapon-mounts-2-save-progress-1-projectile-tail-1-loot-inventory-pages-2');
    await Promise.all([self.nativeCombatShots.ready,self.nativeSolAsteroids.ready]);
    if(event.data.action==='travel'){
      importScripts('population-simulation.js','world-time.js?v=seamless-warp-1','travel-events.js?v=distance-navigation-1-badlands-1','save-codec.js?v=checkpoint-text-3','save-snapshot.js?v=warp-charge-1-warp-latency-1');
      const seed=event.data.streamed?self.nativeSaveSnapshot.restore(travelRows,event.data.root):typeof event.data.text==='string'?JSON.parse(event.data.text):event.data.seed;
      travelRows=[];
      self.postMessage({ok:true,progress:'planning'});
      const planned=self.vexedTravelEvents.plan(seed,event.data.journey);
      self.postMessage({ok:true,progress:'calendar'});
      planned.calendar=self.nativeWorldTime.settleTransit(planned.next);
      self.postMessage({ok:true,progress:'snapshot'});
      if(event.data.streamed){
        self.nativeSaveSnapshot.capture(planned.next,{
          part:part=>self.postMessage({ok:true,part}),
          complete:root=>self.postMessage({ok:true,streamed:true,root,report:planned.report,calendar:planned.calendar}),
          failed:error=>self.postMessage({ok:false,error:String(error)})
        });return;
      }
      try{self.postMessage({ok:true,planned:{...planned,next:self.nativeWorldBootstrap.transportState(planned.next)}});}
      catch(error){if(error.name!=='DataCloneError')throw error;self.postMessage({ok:true,plannedText:JSON.stringify(planned)});}return;
    }
    const state=self.nativeWorldBootstrap.initialize(event.data.seed);
    const hulls=new Map();
    for(const [category,ships] of [['civilian',state.civilianTraffic.ships],['tug',state.solEconomy.freighters]])for(const ship of ships){
      const type=ship.shipType??(category==='tug'?10:ship.type),key=category+':'+type;
      if(!hulls.has(key))hulls.set(key,{type,category,...self.nativeShipDefinitions.dimensions(ship,category)});
    }
    self.postMessage({ok:true,snapshot:self.nativeWorldBootstrap.snapshot(state),geometry:[...hulls.values()]});
  }catch(error){self.postMessage({ok:false,error:String(error.stack||error)});}
};
