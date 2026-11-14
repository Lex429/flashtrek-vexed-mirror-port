/* Orion's government and hull catalog. Existing state owners apply the migration. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,governmentId=45,home=2;
  const government={id:governmentId,name:'Orion Syndicate'};
  const occupied=world.governments.find(entry=>entry.id===governmentId);
  if(occupied&&occupied.name!==government.name)throw Error('Orion government ID is already assigned');
  if(!occupied)world.governments.push(government);
  const system=world.systems.find(entry=>entry.id===home);
  Object.assign(system,{governmentId,government:government.name,enemyGovernmentId:0,
    description:'Orion has reclaimed control of its home system. Syndicate houses run a busy merchant and mining economy, guarded by fast Corsair raiders and armored Ravager patrol cruisers. Visitors may trade at the orbital docks; attacks on Orion crews bring a territorial security response.',
    planetShopItemIds:[446,447,448,449],weaponShopItemIds:[3,7,14,19]});
  const hulls=[
    {id:446,name:'Orion Dart Scout',file:'scout',duty:'mining',height:22,massClass:1,cargo:55,hull:80,shields:65,turn:17,price:6500,defaultWeapons:[7,0,0],antimatterUseOrPopulationEffect:8,
      emitters:{beam:{x:-.12,y:-.22},projectile:{x:-.12,y:-.22}},
      description:'A compact Orion scout and prospecting craft with built-in thrusters, a defensive cannon and a dedicated mining bay.'},
    {id:447,name:'Orion Corsair Raider',file:'raider',duty:'patrol',height:54,massClass:3,cargo:140,hull:240,shields:250,turn:12,price:28500,defaultWeapons:[3,19,0],antimatterUseOrPopulationEffect:5,
      description:'A fast Syndicate security raider with hooked outriggers, disruptors and torpedoes. Corsair crews patrol Orion and pursue attackers inside its borders.'},
    {id:448,name:'Orion Ravager Cruiser',file:'cruiser',duty:'patrol',height:92,massClass:4,cargo:260,hull:420,shields:460,turn:8,price:69000,defaultWeapons:[3,19,0],antimatterUseOrPopulationEffect:4,
      description:'An armored Orion patrol cruiser with reinforced shoulder structures and a heavy defensive battery. Its larger hull trades agility for staying power.'},
    {id:449,name:'Orion Caravan Freighter',file:'freighter',duty:'freight',height:66,massClass:3,cargo:650,hull:220,shields:180,turn:7,price:22000,defaultWeapons:[0,14,0],antimatterUseOrPopulationEffect:6,
      description:'An Orion merchant transport with attached cargo modules and mining equipment. Civilian crews make funded deliveries, prospect for ore and seek safety when attacked.'}
  ];
  for(const hull of hulls){
    const existing=world.ships.find(entry=>entry.id===hull.id);
    if(existing&&existing.name!==hull.name)throw Error('Orion ship ID is already assigned: '+hull.id);
    if(!existing){const {file,duty,height,...stats}=hull;world.ships.push({...stats,speedOrOtherStationValue:95});}
  }
  function initialize(state){
    if(!state||Number(state.orionFactionVersion)>=1)return false;
    // Old Earth-owned Orion becomes independent once. A played conquest and
    // its standing, population, cargo and committed jobs remain authoritative.
    const owner=state.planetGovts?.[home];
    if(owner==null||Number(owner)===1){state.planetGovts||={};state.planetGovts[home]=governmentId;}
    state.orionFactionVersion=1;return true;
  }
  window.nativeOrionWorld=Object.freeze({version:1,governmentId,home,hulls:Object.freeze(hulls.map(hull=>Object.freeze(hull))),initialize});
})();
