/* Civilian destination policy. No population, resource or movement simulation. */
(() => {
  'use strict';
  const systems=window.VexedMirrorWorld.systems,byId=new Map(systems.map(s=>[s.id,s]));
  const prohibitedSystems=Object.freeze([32,33,34,51,52]),excluded=new Set(prohibitedSystems);
  const blocked=id=>excluded.has(Number(id))||!byId.has(Number(id));
  function inhabited(state,id){
    id=Number(id);if(blocked(id))return false;
    const count=state?.planetPopulationCounts?.[id],population=state?.planetPopulations?.[id];
    return Number(count??population??byId.get(id).populationBillions)>0;
  }
  const point=id=>byId.get(Number(id))?.mapPosition||({51:{x:-250,y:-125},52:{x:-220,y:-160}}[id])||{x:0,y:0};
  const distance=(a,b)=>Math.hypot(point(a).x-point(b).x,point(a).y-point(b).y);
  function nearestHome(state,origin){return systems.filter(s=>inhabited(state,s.id)).sort((a,b)=>distance(origin,a.id)-distance(origin,b.id)||a.id-b.id)[0]?.id??null;}
  const markets=state=>systems.filter(s=>inhabited(state,s.id)).map(s=>s.id);
  const signature=state=>systems.map(s=>inhabited(state,s.id)?'1':'0').join('');
  window.nativeCivilianAccess=Object.freeze({prohibitedSystems,blocked,inhabited,nearestHome,markets,signature,distance});
})();
