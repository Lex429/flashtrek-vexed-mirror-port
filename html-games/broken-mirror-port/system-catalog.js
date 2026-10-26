/* Physical systems and their local bodies. Legacy world IDs remain economic keys. */
(() => {
  'use strict';
  const records = window.VexedMirrorSystemData.systems;
  const version = 2;
  const byLegacy = new Map();
  const variants = new Map();
  const boundaries = new Map();
  for (const record of records) for (const id of record.legacyIds) byLegacy.set(id, record);
  const get = id => byLegacy.get(Number(id));
  const physicalId = id => get(id)?.id ?? Number(id);
  const sameSystem = (a, b) => physicalId(a) === physicalId(b);
  const homeId = id => Number(get(id)?.homeBodyByLegacy[String(id)] ?? 0);
  // Each historical world's simulation stays centred on its original planet.
  // Romulus and Remus use translated views of exactly the same physical catalog.
  function bodies(id) {
    id = Number(id);
    if (variants.has(id)) return variants.get(id);
    const record = get(id);
    if (!record) return [];
    const origin = record.bodies.find(body => body.id === homeId(id));
    const dx = id === 1 ? 0 : origin.x, dy = id === 1 ? 0 : origin.y;
    const result = record.bodies.map(body => Object.freeze({...body, system:record.id, x:body.x-dx, y:body.y-dy}));
    variants.set(id, Object.freeze(result));
    return result;
  }
  function currentId(state) {
    const value = Number(state.localBody);
    return [1,version].includes(state.localSystemVersion) && state.localBodySystem === state.system && bodies(state.system).some(body => body.id === value)
      ? value : state.system === 1 && bodies(1).some(body => body.id === value) ? value : homeId(state.system);
  }
  function reconcileOrbitLayout(state) {
    const record=get(state.system), revision=record?.orbitalLayout?.version;
    if(!revision||!record.bodies.some(b=>b.previousLayoutPosition)||state.orbitalLayoutVersion>=revision)return;
    if(state.localBodySystem===state.system){
      const local=bodies(state.system),origin=record.bodies.find(b=>b.id===homeId(state.system));
      const shifted=id=>{
        const body=local.find(b=>b.id===Number(id)),old=body?.previousLayoutPosition;
        return old?{body,dx:body.x-(old.x-origin.x),dy:body.y-(old.y-origin.y),oldX:old.x-origin.x,oldY:old.y-origin.y}:null;
      };
      const current=shifted(state.localBody),target=shifted(state.localCruise?.to);
      // A parked ship follows its relocated survey planet. A free-flying ship
      // keeps its physical pose; only a saved cruise's endpoint follows its goal.
      if(current&&!state.localCruise&&(state.landed||Math.hypot(state.x-(current.oldX-220),state.y-(current.oldY+75))<2000)){
        state.x+=current.dx;state.y+=current.dy;
        if(Number.isFinite(state.previousX))state.previousX+=current.dx;
        if(Number.isFinite(state.previousY))state.previousY+=current.dy;
      }
      if(target){
        if(Number.isFinite(state.localCruise.stopX))state.localCruise.stopX+=target.dx;
        if(Number.isFinite(state.localCruise.stopY))state.localCruise.stopY+=target.dy;
      }
    }
    state.orbitalLayoutVersion=revision;
  }
  function initialize(state) {
    reconcileOrbitLayout(state);
    const previous=state.localBodySystem;
    const sameFrame=previous===state.system || previous===undefined&&state.system===1;
    const validBody=value=>bodies(state.system).some(body=>body.id===Number(value));
    const retired=previous===state.system&&[1,version].includes(state.localSystemVersion)&&!validBody(state.localBody);
    const id = currentId(state);
    if(!sameFrame||!validBody(state.localNavTarget))state.localNavTarget=id;
    // Removed filler has no settlement or resources to migrate. Keep the real
    // world pose and holdings; only retire its navigation/docking references.
    if(retired)state.landed=false;
    if(state.localCruise&&!validBody(state.localCruise.to)){
      state.localCruise=null;state.speed=0;state.vx=0;state.vy=0;
    }
    state.localBody = id;
    state.localBodySystem = state.system;
    state.localSystemVersion = version;
    return state;
  }
  function population(state, body) {
    if (!body) return 0;
    if (body.legacyWorldId) return Math.max(0, Math.round(Number(state.planetPopulationCounts?.[body.legacyWorldId] ?? Number(state.planetPopulations?.[body.legacyWorldId])*1e9) || 0));
    return state.system === 1 ? Math.max(0, Math.round(Number(state.solPopulations?.[body.id] ?? body.population) || 0)) : 0;
  }
  function nodes(state) {
    return bodies(state.system).map(body => ({...body, population:population(state, body), port:(body.port||!!body.legacyWorldId) && population(state, body)>0}));
  }
  function current(state) { return nodes(state).find(body => body.id === currentId(state)) || nodes(state)[0]; }
  function arrive(state, body, pose) {
    const oldSystem = state.system;
    if (body.legacyWorldId && sameSystem(body.legacyWorldId, oldSystem)) state.system = body.legacyWorldId;
    const oldHome = bodies(oldSystem).find(b => b.id === homeId(state.system));
    const dx = oldSystem === state.system ? 0 : oldHome.x, dy = oldSystem === state.system ? 0 : oldHome.y;
    state.localBody = body.id;
    state.localBodySystem = state.system;
    state.localSystemVersion = version;
    state.x = pose.x-dx-(state.system === 1 ? body.x : 0);
    state.y = pose.y-dy-(state.system === 1 ? body.y : 0);
    if (oldSystem !== state.system) {
      state.planet = window.VexedMirrorWorld.systems.find(s => s.id === state.system).name;
      state.discovered = [...new Set([...(state.discovered || []), oldSystem, state.system])];
    }
    return {changedSystem:oldSystem !== state.system};
  }
  const name = id => get(id)?.name || 'Unknown';
  // Bounds use exactly the same body centres as flight and the map. Fitting the
  // padded boxes inside an ellipse also encloses their corners, not just centres.
  // This reads catalog geometry only: no artwork, NPCs or asteroid activation.
  function boundary(id) {
    id=physicalId(id);
    if(boundaries.has(id))return boundaries.get(id);
    const visible=bodies(id).filter(b=>!b.occludedBy);
    if(!visible.length)return null;
    const padding=1100;
    const boxes=visible.map(b=>{const r=(b.size||100)/2+padding;return {x:b.x-220,y:b.y+75,r};});
    const minX=Math.min(...boxes.map(b=>b.x-b.r)),maxX=Math.max(...boxes.map(b=>b.x+b.r));
    const minY=Math.min(...boxes.map(b=>b.y-b.r)),maxY=Math.max(...boxes.map(b=>b.y+b.r));
    const x=(minX+maxX)/2,y=(minY+maxY)/2;
    let rx=Math.max(2800,(maxX-minX)/2),ry=Math.max(2300,(maxY-minY)/2);
    const fit=Math.max(1,...boxes.map(b=>Math.hypot((Math.abs(b.x-x)+b.r)/rx,(Math.abs(b.y-y)+b.r)/ry)));
    const result=Object.freeze({x,y,rx:rx*fit,ry:ry*fit});
    boundaries.set(id,result);
    return result;
  }
  function orbitDescription(body,system) {
    const orbit=body?.orbit,relationship=body?.orbitalRelationship;
    if(relationship)return relationship.note;
    if(!orbit)return '';
    const star=bodies(system).find(b=>b.id===orbit.primaryId);
    const distance=orbit.distanceEvidence==='astronomy'?'Astronomy':'Scientific estimate';
    const order=({astronomy:'measured ordering',authored:'game ordering',licensed_reference:'licensed reference ordering',reported_screen_graphic:'reported screen diagram ordering',adapted_numbering:'adapted numbered-world ordering'})[orbit.orderEvidence]||'interpreted ordering';
    return `Orbits ${star?.name||'its primary'} · ${distance}: ${orbit.semiMajorAxisAU} AU · ${order}. Chart distances are compressed; angular positions are illustrative.`;
  }
  const evidenceLabel = body => (({authored:'Original game addition',authored_facility:'Original game facility in a referenced system',mirror_adaptation:'Prime geography · Mirror adaptation',game:'Broken Mirror lore',screen:'Screen-sourced · Mirror adaptation',reported_screen_graphic:'Reported screen graphic · Mirror adaptation',production_reference:'Production/reference name · Mirror adaptation',astronomy:'Astronomy',reference:'Reference association',authored_layout:'Illustrative star placement'})[body?.evidence]||'Unverified')+(body?.nameEvidence==='authored'?' · Game survey name':'');
  window.nativeSystemCatalog = Object.freeze({version,records, get, physicalId, sameSystem, homeId, bodies, boundary, currentId, current, initialize, nodes, population, arrive, name,evidenceLabel,orbitDescription});
})();
