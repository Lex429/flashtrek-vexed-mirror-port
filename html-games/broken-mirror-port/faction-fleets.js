/* Finished faction hulls and territorial duties. Existing lives own the crews. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,systems=new Map(world.systems.map(system=>[system.id,system]));
  // Explicit, reviewed artwork identities. Living wildlife and unrelated ships
  // are not substitutes for a faction without its own finished ship artwork.
  const catalog=[
    [2,[39,40,41,42,43,61],{}],
    [3,[16,31,32,62],{}],
    [4,[23],{}],
    [5,[25,26,59,63],{}],
    [6,[27,28,29,53,64],{}],
    [7,[17,18,19],{18:'mining',19:'freight'}],
    [9,[21,22,51],{51:'freight'}],
    [10,[24],{}],
    [11,[20,66],{}],
    [12,[52,54],{52:'freight'}],
    [13,[30,48,65],{}],
    [14,[44],{}]
  ];
  if(window.nativeOrionShips)catalog.push([window.nativeOrionShips.governmentId,window.nativeOrionShips.ids,
    window.nativeOrionShips.duties,{recruitTransferredResidents:true}]);
  const government=(state,id)=>Number(state?.planetGovts?.[id]??systems.get(Number(id))?.governmentId);
  const populated=(state,id)=>Number(state?.planetPopulationCounts?.[id]??state?.planetPopulations?.[id]??systems.get(Number(id))?.populationBillions)>0;
  const defenderTarget=(state,id)=>{
    const count=state?.planetPopulationCounts?.[id],population=Number(count==null?state?.planetPopulations?.[id]??systems.get(Number(id))?.populationBillions:Number(count)/1e9)||0;
    return population>=8?3:population>=2?2:1;
  };
  function bases(state,id,militaryOnly=false){
    return world.systems.filter(system=>government(state,system.id)===id&&populated(state,system.id)&&
      (militaryOnly||!window.nativeCivilianAccess||window.nativeCivilianAccess.inhabited(state,system.id))).map(system=>system.id);
  }
  const rosters=[];
  if(window.nativeFederationFleet)rosters.push(Object.freeze({...window.nativeFederationFleet,governmentId:1,label:'Federation',bases:state=>bases(state,1)}));
  for(const [id,ids,duties,settings={}] of catalog){
    const types=Object.freeze([...ids]),members=new Set(types),militaryOnly=id===14;
    const weighted=Object.freeze(types.flatMap(type=>Array(world.ships.find(ship=>ship.id===type).massClass>=5?1:2).fill(type)));
    rosters.push(Object.freeze({...settings,governmentId:id,label:world.governments.find(government=>government.id===id).name,
      version:1,rosterVersion:1,types,weighted,militaryOnly,has:type=>members.has(Number(type)),
      duty:type=>duties[Number(type)]||'patrol',bases:state=>bases(state,id,militaryOnly)}));
  }
  const byGovernment=new Map(rosters.map(fleet=>[fleet.governmentId,fleet]));
  const forSystem=(state,id)=>byGovernment.get(government(state,id));
  const forShip=(state,ship)=>{
    const fleet=byGovernment.get(Number(ship?.ownerGovernmentId));
    return fleet?.has(ship.shipType)&&(fleet.governmentId===1?ship.federationDutyVersion:ship.factionDutyVersion)===fleet.version?fleet:null;
  };
  function pick(system,slot,state){
    const fleet=forSystem(state,system.id);if(!fleet||!fleet.bases(state).includes(system.id)||!fleet.militaryOnly&&slot%3===0)return null;
    if(fleet.governmentId===1&&Number(system.governmentId)===1)return fleet.pick(system,slot);
    const ordinal=fleet.bases(state).indexOf(system.id),index=ordinal*23+Math.floor(slot/3)*2+slot%3;
    return fleet.weighted[index%fleet.weighted.length];
  }
  function militaryResidence(state,ship,id=ship.system){
    const fleet=forShip(state,ship);
    return !!(fleet?.militaryOnly&&ship.role==='patrol'&&!ship.cargo&&!ship.oreHold&&fleet.bases(state).includes(Number(id)));
  }
  window.nativeFactionFleets=Object.freeze({version:1,rosters:Object.freeze(rosters),get:id=>byGovernment.get(Number(id)),government,forSystem,forShip,pick,militaryResidence,defenderTarget});
})();
