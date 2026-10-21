/* Sol's existing local chart positions, shared by flight and the local radar. */
(() => {
  'use strict';
  const bodies = window.nativeSystemHub.sol;
  const byId = new Map(bodies.map(body => [body.id, body]));
  const sizes = {0:266, 1:87, 2:147, 3:180, 4:67, 5:119, 6:147, 7:231, 8:217, 9:157, 10:154, 11:56};
  const requested = new Set();
  let targetId = 3;

  function shipPosition(state) {
    const origin = byId.get(Number(state.localBody)) || byId.get(3);
    return {x: origin.x + Number(state.x || 0), y: origin.y + Number(state.y || 0)};
  }
  function bodyPosition(body) { return {x: body.x - 220, y: body.y + 75}; }
  function bodySize(body) { return sizes[body.id] || 100; }
  function visibleBodies(state, view) {
    if (!state || state.system !== 1) return [];
    const ship = view.camera || shipPosition(state), zoom = view.zoom;
    return bodies.map(body => {
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
  function art(id) {
    if (!requested.has(id)) {
      requested.add(id);
      window.vexedFlightAssets.loadLocalBody(id).catch(() => requested.delete(id));
    }
    return window.vexedFlightAssets.localBody(id);
  }
  function nearestArrival(state) {
    if (state.system !== 1 || state.localCruise || state.landed) return null;
    const ship = shipPosition(state);
    let nearest = null, distance = Infinity;
    for (const body of bodies) {
      const position = bodyPosition(body);
      const d = Math.hypot(position.x - ship.x, position.y - ship.y);
      if (d < distance) { nearest = body; distance = d; }
    }
    if (!nearest || nearest.id === Number(state.localBody) || distance > Math.max(150, bodySize(nearest)*1.3)) return null;
    state.localBody = nearest.id;
    state.x = ship.x - nearest.x;
    state.y = ship.y - nearest.y;
    return nearest;
  }
  function setTarget(id) { if (byId.has(Number(id))) targetId = Number(id); }
  window.vexedSolFlight = {bodies,shipPosition,bodyPosition,visibleBodies,bodySize,art,nearestArrival,setTarget,get targetId(){return targetId}};
})();
