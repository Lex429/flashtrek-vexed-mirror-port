/* Sol's existing local chart positions, shared by flight and the local radar. */
(() => {
  'use strict';
  const catalog = window.nativeSystemCatalog;
  const bodies = window.nativeSystemHub.sol;
  const byId = new Map(bodies.map(body => [body.id, body]));
  const forSystem = state => catalog.bodies(typeof state === 'object' ? state.system : state);
  const artwork = new Map();
  const retryAfter = new Map();
  const sizes = {0:266, 1:87, 2:147, 3:180, 4:67, 5:119, 6:147, 7:231, 8:217, 9:157, 10:154, 11:56};
  const requested = new Set();
  let targetId = 3;

  function shipPosition(state) {
    if(state.system!==1)return {x:Number(state.x)||0,y:Number(state.y)||0};
    const origin = byId.get(Number(state.localBody)) || byId.get(3);
    return {x: origin.x + Number(state.x || 0), y: origin.y + Number(state.y || 0)};
  }
  function bodyPosition(body) { return {x: body.x - 220, y: body.y + 75}; }
  function bodySize(body) { return body.size || sizes[body.id] || 100; }
  function visibleBodies(state, view) {
    if (!state) return [];
    const ship = view.camera || shipPosition(state), zoom = view.zoom, margin = 220;
    return forSystem(state).filter(body=>body.kind!=='belt'&&!body.occludedBy).map(body => {
      const size = bodySize(body);
      const position = bodyPosition(body);
      const x = view.cx + position.x - ship.x;
      const y = view.cy + position.y - ship.y;
      const screenX = view.cx + (x - view.cx) * zoom;
      const screenY = view.cy + (y - view.cy) * zoom;
      const margin = Math.max(220, size * zoom * .75);
      return {body, size, x, y, screenX, screenY, screenSize:size*zoom,
        visible:screenX > -margin && screenX < view.w+margin && screenY > -margin && screenY < view.h+margin};
    }).filter(entry => entry.visible);
  }
  function art(id, system=1) {
    if(system!==1||id>=12||id===0){
      const body=forSystem(system).find(body=>body.id===Number(id));
      if(!body)return null;
      const cached=artwork.get(body.art);
      if(cached){artwork.delete(body.art);artwork.set(body.art,cached);return cached;}
      if(!requested.has(body.art)&&Date.now()>=(retryAfter.get(body.art)||0)){
        requested.add(body.art);
        window.vexedFlightAssets.loadImage(body.art).then(image=>{
          while(artwork.size>=8)artwork.delete(artwork.keys().next().value);
          artwork.set(body.art,image);retryAfter.delete(body.art);
        }).catch(()=>{retryAfter.set(body.art,Date.now()+15000)}).finally(()=>requested.delete(body.art));
      }
      return null;
    }
    if (!requested.has(id)) {
      requested.add(id);
      window.vexedFlightAssets.loadLocalBody(id).catch(() => requested.delete(id));
    }
    return window.vexedFlightAssets.localBody(id);
  }
  function nearestArrival(state) {
    if (state.localCruise || state.landed) return null;
    const ship = shipPosition(state);
    let nearest = null, distance = Infinity;
    for (const body of forSystem(state)) {
      const position = bodyPosition(body);
      const d = Math.hypot(position.x - ship.x, position.y - ship.y);
      if (d < distance) { nearest = body; distance = d; }
    }
    if (!nearest || nearest.id === catalog.currentId(state) || distance > Math.max(150, bodySize(nearest)*1.3)) return null;
    catalog.arrive(state,nearest,ship);
    return nearest;
  }
  function setTarget(id,system=1) { if (forSystem(system).some(body=>body.id===Number(id))) targetId = Number(id); }
  window.vexedSolFlight = {bodies,forSystem,shipPosition,bodyPosition,visibleBodies,bodySize,art,nearestArrival,setTarget,get targetId(){return targetId},get artCacheSize(){return artwork.size}};
})();
