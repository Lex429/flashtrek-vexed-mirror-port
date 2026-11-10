/* Player freight policy and chart labels. npc-lives owns stock and settlement. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,catalog=window.nativeSystemCatalog;
  const system=id=>world.systems.find(entry=>entry.id===Number(id));
  function endpoint(state,systemId,port){
    systemId=Number(systemId);port=Number(port);
    if(!system(systemId)?.charted)return null;
    const body=catalog.bodies(systemId).find(body=>body.id===port);
    if(!body||!(body.port||body.legacyWorldId))return null;
    const population=body.legacyWorldId
      ? Number(state.planetPopulationCounts?.[body.legacyWorldId]??Number(state.planetPopulations?.[body.legacyWorldId]??system(body.legacyWorldId)?.populationBillions)*1e9)
      : systemId===1?Number(state.solPopulations?.[port]??body.population):0;
    if(!(population>0))return null;
    return {system:systemId,port,name:body.name,systemName:catalog.name(systemId),art:body.art||`assets/planets/planet-${system(systemId)?.planetArtFrame||1}.png`};
  }
  function destinations(state){
    const result=[];
    for(const entry of world.systems)for(const body of catalog.bodies(entry.id)){
      if(body.legacyWorldId&&body.legacyWorldId!==entry.id)continue;
      const port=endpoint(state,entry.id,body.id);if(port)result.push(port);
    }
    return result;
  }
  function address(job,side='to'){
    const systemId=Number(job[side+'System']??1),port=Number(job[side]);
    const body=catalog.bodies(systemId).find(body=>body.id===port);
    return {system:systemId,port,name:body?.name||'Unknown port',systemName:catalog.name(systemId),
      art:body?.art||`assets/planets/planet-${system(systemId)?.planetArtFrame||1}.png`};
  }
  const here=(state,destination)=>catalog.sameSystem(state.system,destination.system)&&catalog.currentId(state)===destination.port;
  function distance(fromSystem,fromPort,toSystem,toPort){
    const a=catalog.bodies(fromSystem).find(body=>body.id===Number(fromPort)),b=catalog.bodies(toSystem).find(body=>body.id===Number(toPort));
    const origin=window.nativeManualFlight?.anchor(fromSystem),destination=window.nativeManualFlight?.anchor(toSystem);
    if(!a||!b||!origin||!destination)return NaN;
    return Math.hypot(destination.x+b.x-origin.x-a.x,destination.y+b.y-origin.y-a.y);
  }
  function offers(state,fromSystem,fromPort){
    if(!endpoint(state,fromSystem,fromPort))return [];
    const result=[];
    for(const destination of destinations(state)){
      if(catalog.sameSystem(fromSystem,destination.system))continue;
      let best=null;
      for(let good=0;good<window.nativeSolEconomy.goods.length;good++){
        const quote=window.nativeNpcLives.playerFreightQuote(state,{fromSystem,fromPort,toSystem:destination.system,toPort:destination.port,good});
        if(!quote.ok||quote.available<1||quote.demand<1||quote.fundedTons<1)continue;
        const score=Math.min(quote.available,quote.demand,quote.fundedTons)*quote.rate;
        if(!best||score>best.score)best={...destination,to:destination.port,toSystem:destination.system,good,nameOfGood:window.nativeSolEconomy.goods[good],...quote,score};
      }
      if(best)result.push(best);
    }
    return result.sort((a,b)=>a.systemName.localeCompare(b.systemName)||a.name.localeCompare(b.name)||a.good-b.good);
  }
  function commonOre(systemId){
    const geology=window.nativeRegionalMinerals;if(!geology)return '';
    const type=Object.entries(geology.profile(systemId).weights).sort((a,b)=>b[1]-a[1])[0]?.[0];
    return geology.ores[type]?.name||'';
  }
  window.nativePlayerContracts=Object.freeze({endpoint,destinations,address,here,distance,offers,commonOre});
})();
