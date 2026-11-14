/* Static service stations. No fleet, market or job is created by registering a yard. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld;
  const additions=[
    ['cardassia-fleet-yard','Cardassia Fleet Yard',50,3,'Cardassia Prime'],
    ['bajor-refit-yard','Bajoran Refit Yard',47,4,'Bajor'],
    ['vulcan-orbital-yard','Vulcan Orbital Shipyard',12,5,'Vulcan'],
    ['romulus-naval-yard','Romulus Naval Yard',31,6,'Romulus'],
    ['andoria-fleet-yard','Andorian Fleet Yard',25,8,'Andoria'],
    ['delpi-shipyard','Delpi Shipyard',23,9,'Delpi'],
    ['lysia-service-yard','Lysian Service Yard',15,10,'Lysia'],
    ['new-switzerland-civilian-yard','New Switzerland Civilian Shipyard',6,12,'New Switzerland'],
    ['dominion-fleet-yard','Dominion Fleet Yard',29,13,'Blender'],
    ['vex-refit-nexus','Borg Refit Nexus',34,14,'Vex'],
    ['pirates-haven-salvage-yard','Pirates Haven Salvage Yard',52,15,'Pirates Haven'],
    ['orion-syndicate-yard','Orion Syndicate Shipyard',2,45,'Orion']
  ];
  world.shipyards||=[];
  for(const [id,name,system,governmentId,location] of additions){
    if(world.shipyards.some(yard=>yard.id===id))continue;
    const faction=world.governments.find(government=>government.id===governmentId);
    if(!faction)throw Error('Shipyard faction is missing: '+governmentId);
    world.shipyards.push({id,name,system,bodyId:0,offsetX:850,offsetY:system===6?-1000:-500,
      size:220,artworkId:280,governmentId,faction:faction.name,location});
  }
  const definitions=Object.freeze(world.shipyards.map(yard=>Object.freeze({...yard})));
  const bySystem=new Map(definitions.map(yard=>[yard.system,yard]));
  const physical=id=>window.nativeSystemCatalog?.physicalId(id)??Number(id);
  const byPhysical=new Map(definitions.map(yard=>[physical(yard.system),yard]));
  const definitionFor=state=>bySystem.get(Number(state?.system))||byPhysical.get(physical(state?.system))||null;
  function position(state){
    const yard=definitionFor(state);if(!yard)return null;
    // Romulus/Remus share a station, viewed in the current legacy coordinate frame.
    const body=window.nativeSystemCatalog.bodies(Number(state.system)).find(body=>body.id===yard.bodyId);
    return body?{x:body.x-220+yard.offsetX,y:body.y+75+yard.offsetY}:null;
  }
  window.nativeFactionShipyards=Object.freeze({definitions,definitionFor,position});
})();
