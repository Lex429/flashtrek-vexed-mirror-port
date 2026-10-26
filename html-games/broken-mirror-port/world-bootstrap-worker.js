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
self.onmessage=async event=>{
  try{
    self.nativeSystemHub={sol:event.data.sol};
    self.starterShips=new Map(event.data.profiles||[]);
    importScripts('world-data.js?v=blended-map-20261025','system-catalog-data.js?v=sol-quality-20261025-2','system-catalog.js?v=mirror-expansion-1','flight-reference-data.js','regional-minerals.js?v=blended-map-20261025','civilian-access.js','weapon-catalog.js',
      'simulation-clock.js','simulation-frame.js','ship-motion.js','ship-definitions.js','constitution-ships.js?v=flight-cache-1','ship-detail.js',
      'ship-damage.js','ship-effects.js','weapon-loadout.js','weapon-rules.js','combat-shots.js',
      'ship-systems.js','rebirth-warp.js','faction-standing.js','port-docking.js','sol-economy.js',
      'civilian-combat-ai.js','civilian-traffic.js?v=halka-lore-3','sol-asteroids.js?v=blended-map-20261025','asteroid-combat.js','manual-flight.js',
      'npc-lives.js?v=blended-map-20261025','../flashtrek-broken-mirror/repair-hull-work.js','ship-repair-sites.js',
      'ship-repairs.js','ship-traffic.js','world-bootstrap.js?v=blended-map-20261025');
    await Promise.all([self.nativeCombatShots.ready,self.nativeSolAsteroids.ready]);
    const state=self.nativeWorldBootstrap.initialize(event.data.seed);
    const hulls=new Map();
    for(const [category,ships] of [['civilian',state.civilianTraffic.ships],['tug',state.solEconomy.freighters]])for(const ship of ships){
      const type=ship.shipType??(category==='tug'?10:ship.type),key=category+':'+type;
      if(!hulls.has(key))hulls.set(key,{type,category,...self.nativeShipDefinitions.dimensions(ship,category)});
    }
    self.postMessage({ok:true,snapshot:self.nativeWorldBootstrap.snapshot(state),geometry:[...hulls.values()]});
  }catch(error){self.postMessage({ok:false,error:String(error.stack||error)});}
};
