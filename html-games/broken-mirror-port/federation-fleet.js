/* NPC roster and duty data. Existing civilian lives own every crew and journey. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld;
  const types=Object.freeze(window.nativeFederationShips.ids.filter(id=>id!==58&&!world.ships.find(ship=>ship.id===id)?.devOnly));
  const members=new Set(types),freight=new Set([4,8,10,12,13,47,56,57,416]);
  const earth=world.systems.filter(system=>Number(system.governmentId)===1),ordinals=new Map(earth.map((system,index)=>[system.id,index]));
  const weighted=Object.freeze(types.flatMap(type=>Array(world.ships.find(ship=>ship.id===type).massClass>=5?1:2).fill(type)));
  window.nativeFederationFleet=Object.freeze({version:1,rosterVersion:2,types,weighted,
    has:type=>members.has(Number(type)),duty:type=>freight.has(Number(type))?'freight':'patrol',
    bases:state=>earth.filter(system=>window.nativeCivilianAccess?.inhabited(state,system.id)??Number(system.populationBillions)>0).map(system=>system.id),
    pick(system,slot){
      if(!ordinals.has(Number(system.id))||slot%3===0)return null;
      return weighted[(ordinals.get(Number(system.id))*23+Math.floor(slot/3)*2+slot%3-1)%weighted.length];
    }
  });
})();
