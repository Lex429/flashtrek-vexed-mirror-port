/* Regional fleet targets. The existing traffic/repair owners create the crews. */
(() => {
  'use strict';
  const version=1,total=1200,medicalTotal=100;
  const weight=system=>Number(system.populationBillions)>=8?50:Number(system.populationBillions)>=2?18:8;
  function allocate(rows,count,score,minimum=0){
    const result=new Map(rows.map(row=>[row.id,minimum]));
    if(!rows.length)return result;
    const remaining=Math.max(0,count-minimum*rows.length),sum=rows.reduce((n,row)=>n+score(row),0);
    const fractions=rows.map(row=>{const quota=remaining*score(row)/sum,whole=Math.floor(quota);result.set(row.id,minimum+whole);return {id:row.id,fraction:quota-whole};});
    let extra=count-[...result.values()].reduce((a,b)=>a+b,0);
    fractions.sort((a,b)=>b.fraction-a.fraction||a.id-b.id);
    for(const row of fractions){if(extra--<=0)break;result.set(row.id,result.get(row.id)+1);}
    return result;
  }
  function plan(state){
    const rows=window.VexedMirrorWorld.systems.filter(row=>window.nativeCivilianAccess.inhabited(state,row.id));
    const totals=allocate(rows,total,weight),medics=allocate(rows,medicalTotal,row=>row.id===1?8:weight(row)===50?4:1);
    return rows.map(row=>({system:row.id,total:totals.get(row.id),medical:medics.get(row.id),ordinary:totals.get(row.id)-medics.get(row.id)}));
  }
  // Production/consumption and purchasing targets scale together. Actual stock,
  // money, reservations and all settlements remain in the economic owner.
  const economyScale=system=>weight(window.VexedMirrorWorld.systems.find(row=>row.id===Number(system))||{})/4;
  const dockLimits=system=>{const size=economyScale(system),berths=Number(system)===1?6:size>=12?12:size>=4?6:4;return {berths,queue:berths*3};};
  const simulation=Object.freeze({version:1,chunkSize:1024,buffer:1,lookAheadSeconds:2});
  window.nativeCivilianPopulation=Object.freeze({version,total,medicalTotal,eventBudget:8,simulation,plan,economyScale,dockLimits});
})();
