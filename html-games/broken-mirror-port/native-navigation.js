/* Native adapter for the recovered Vexed Mirror map's state and course API. */
(() => {
  'use strict';
  const world = window.VexedMirrorWorld;
  const systems = new Map(world.systems.map(system => [system.id, system]));
  const governments = new Map(world.governments.map(government => [government.id, government.name]));
  const ships = new Map(world.ships.map(ship => [ship.id, ship]));
  const charted = world.systems.filter(system => window.nativeManualFlight.chartPosition(system.id));
  let bridge = null;

  // Resolve a selected body into the continuous flight coordinates. A saved
  // system is only a coordinate frame; physical membership comes from flight.
  function destination(game,selection={}) {
    const catalog=window.nativeSystemCatalog,flight=window.nativeManualFlight;
    const requested=Number(typeof selection==='object'?selection.system??selection.id??game.system:selection);
    const requestedBody=typeof selection==='object'?selection.body??selection.bodyId:undefined;
    let body=catalog.bodies(requested).find(body=>body.id===Number(requestedBody??catalog.homeId(requested)));
    if(!body||body.occludedBy)return {ok:false,error:'Choose a planet, star or other local destination.'};
    const system=body.legacyWorldId??catalog.physicalId(requested);
    body=catalog.bodies(system).find(node=>node.id===body.id);
    const anchor=flight.anchor(system),ship=flight.position(game);
    if(!anchor||!ship)return {ok:false,error:'This destination has no flight coordinates.'};
    const local=window.vexedSolFlight.bodyPosition(body),point={x:anchor.x+local.x,y:anchor.y+local.y};
    const dx=point.x-ship.x,dy=point.y-ship.y,distance=Math.hypot(dx,dy),region=flight.currentRegion(game);
    const inSystem=region.system!==null&&catalog.sameSystem(region.system,system);
    const minimumWarpDistance=flight.arrivalRadius;
    const dimensions=window.nativeShipDefinitions?.dimensions?.(game,'player')||{width:30,height:60};
    const clearance=(window.vexedSolFlight.bodySize?.(body)||body.size||100)/2+Math.hypot(dimensions.width,dimensions.height)/2+24;
    const nearby=distance<minimumWarpDistance,arrived=distance<=clearance+5;
    return {ok:true,system,physicalSystem:catalog.physicalId(system),bodyId:body.id,name:body.name,body,point,local,dx,dy,distance,clearance,
      minimumWarpDistance,inSystem,canCruise:!arrived&&(inSystem||nearby),canWarp:!inSystem&&!nearby,
      cruiseError:arrived?'You are already at this destination.':!inSystem&&!nearby?'This destination is far enough away to warp to.':'',
      warpError:inSystem?'Cruise between destinations inside this solar system.':nearby?'Too close to warp. Cruise to this destination.':''};
  }

  function initialize(game) {
    const faction = world.factionStarts.find(start => start.selectionId === Number(game.faction) + 1) || world.factionStarts[0];
    game.shipType = (window.nativeShipDefinitions?.registered().some(s=>s.id===Number(game.shipType))||ships.has(Number(game.shipType))) ? Number(game.shipType) : 7;
    game.discovered = [...new Set([...(Array.isArray(game.discovered) ? game.discovered : []), Number(game.system)])]
      .filter(id => systems.has(id));
    for (const [key, field] of [['planetGovts', 'governmentId'], ['planetPopulations', 'populationBillions'], ['planetStrengths', 'strength']]) {
      const saved = game[key] && typeof game[key] === 'object' ? game[key] : {};
      game[key] = Object.fromEntries(world.systems.map(system => {
        const value = Number(saved[system.id]);
        return [system.id, Number.isFinite(value) && (key !== 'planetGovts' || governments.has(value)) ? value : system[field]];
      }));
    }
    window.nativePopulation.initialize(game,world.systems,window.nativeSystemHub?.sol||[]);
    const prestige = game.localPrestige && typeof game.localPrestige === 'object' ? game.localPrestige : {};
    game.localPrestige = Object.fromEntries(world.systems.map(system => {
      const value = Number(prestige[system.id]);
      return [system.id, Number.isFinite(value) ? value : Number(faction.prestigeBySystem[system.id] || 0)];
    }));
    window.nativeSystemCatalog?.initialize(game);
    game.planet = systems.get(Number(game.system)).name;
    return game;
  }

  function state(selection) {
    const game = bridge?.getGame();
    if (!game) return {ok: false, error: 'Begin a game before navigating.'};
    const catalog=window.nativeSystemCatalog;
    const physical=id=>catalog?.physicalId(id)??id;
    const known = id => game.devMode || game.discovered.some(world=>physical(world)===physical(id));
    const label = id => known(id) ? systems.get(id).name : 'Unknown system S-' + String(id).padStart(3, '0');
    const standing = id => window.nativeFactionStanding?.relationship?.(game,id,{known:known(id)}).status || (!known(id) ? 'Unknown' : game.planetGovts[id] === 16 ? 'Your territory' :
      game.localPrestige[id] >= 100 ? 'Allied' : game.localPrestige[id] < 0 ? 'Hostile' : 'Neutral');
    const status = id => !known(id) ? 'Unknown' : game.planetGovts[id] === 16 ? 'Your territory' :
      !game.devMode && [29, 32, 33, 34].includes(id) ? 'Forbidden' :
      game.planetPopulations[id] <= 0 && game.planetStrengths[id] <= 0 ? 'Uninhabited' : standing(id);
    const selectedId=typeof selection==='object'?selection?.system??selection?.id:selection;
    const selected = systems.get(Number(selectedId)) || systems.get(game.system);
    const target=destination(game,typeof selection==='object'?{...selection,system:selected.id}:selected.id);
    const current = systems.get(game.system);
    const travel = target.ok ? target.distance/(window.nativeManualFlight.unitsPerChartPoint*5) : -1;
    const effective=window.nativeShipDefinitions?.forEntity(game)||ships.get(game.shipType);
    const travelDays = travel < 0 ? -1 : Math.floor(travel/(effective.warpSpeedMultiplier||1));
    const antimatterUse = Number(effective.antimatterUseOrPopulationEffect);
    const fuel = travelDays < 0 ? -1 : game.devMode ? 0 : Math.floor(travelDays / antimatterUse / 3);
    let error = '';
    if (!target.ok) error=target.error;
    else if (!target.canWarp) error=target.warpError;
    else if (!current.charted || !selected.charted) error = 'No charted warp lane from this region. Use a wormhole to return.';
    else if (game.repairing) error = 'Wait for repairs to finish.';
    else if (!game.devMode && !(travelDays < Number(game.antimatter) * 2 * antimatterUse)) error = 'Insufficient antimatter for this journey.';
    else if (!game.devMode && [32, 33, 34].includes(selected.id) && Number(game.nav) < 100) error = 'Navigation experience 100 is required for this sensor-obscured region.';
    let description = known(selected.id) ? selected.description : 'No survey data. Visit this system to reveal its name, government, and local conditions.';
    if (known(selected.id)) {
      for (const system of [...world.systems].sort((a, b) => b.name.length - a.name.length)) {
        if (!known(system.id)) description = description.split(system.name).join(label(system.id));
      }
    }
    const government = known(selected.id) ? game.planetGovts[selected.id] : -1;
    return {
      ok: true,
      devMode:!!game.devMode,
      current: physical(game.system),
      legacyCurrent:game.system,
      currentName: label(game.system),
      region:window.nativeManualFlight.currentRegion(game),
      localBody: catalog?.currentId(game)??Number(game.localBody ?? 3),
      localNavTarget: Number(game.localNavTarget ?? window.vexedSolFlight?.targetId ?? game.localBody ?? 3),
      inLocalTransit: !!(game.localCruise || game.arrivalApproach),
      shipAngle: Number(game.angle)||0,
      shipType: Number(game.shipType),
      shipHull: Number(game.hull),
      shipName: String(game.shipName||'Your ship'),
      localShipPosition: game.system === 1 ? window.vexedSolFlight.shipPosition(game) : {x: Number(game.x)||0, y: Number(game.y)||0},
      galaxyShipPosition:window.nativeManualFlight.position(game),
      shipPosition:window.nativeManualFlight.chartShipPosition(game),
      nodes: charted.filter(system=>physical(system.id)===system.id).map(system => ({id: system.id, ...window.nativeManualFlight.chartPosition(system.id), name: label(system.id), known: known(system.id),
        current: physical(system.id) === physical(game.system), government: known(system.id) ? game.planetGovts[system.id] : -1,
        prestige: known(system.id) ? Number(game.localPrestige[system.id]) : null,
        standing: standing(system.id), status: status(system.id)})),
      routes: [],
      fleet: (Array.isArray(game.fleet) ? game.fleet : []).filter(ship => systems.get(Number(ship.system))?.charted)
        .map(ship => ({system: Number(ship.system), name: String(ship.name || 'Fleet ship'), type: Number(ship.type || 7)})),
      discovered: charted.filter(system => physical(system.id)===system.id&&known(system.id)).length,
      total: charted.filter(system=>physical(system.id)===system.id).length,
      fuel: Number(game.antimatter),
      manualTargetSystem:Number(game.manualTargetSystem)||0,
      cruiseTarget:game.localCruise?{system:physical(game.localCruise.system??game.system),body:Number(game.localCruise.to)}:null,
      selected: {id: selected.id, name: label(selected.id), known: known(selected.id), government,
        governmentName: government === 16 ? String(game.government) : governments.get(government) || 'Unknown',
        prestige: known(selected.id) ? Number(game.localPrestige[selected.id]) : null,
        localPopulations: known(selected.id) && catalog ? Object.fromEntries(catalog.nodes({...game,system:selected.id}).map(body=>[body.id,body.population])) : selected.id===1 && known(selected.id) ? Object.fromEntries(window.nativeSystemHub.sol.map(body=>[body.id,window.nativeSystemHub.population(game,body.id)])) : null,
        localWorlds: known(selected.id) && catalog ? Object.fromEntries(catalog.bodies(selected.id).filter(body=>body.legacyWorldId).map(body=>{const id=body.legacyWorldId;return [body.id,{government:game.planetGovts[id],governmentName:game.planetGovts[id]===16?String(game.government):governments.get(game.planetGovts[id])||'Unknown',prestige:Number(game.localPrestige[id]),standing:standing(id),status:status(id),strength:game.planetStrengths[id]}];})) : null,
        standing: standing(selected.id), status: status(selected.id), strength: known(selected.id) ? game.planetStrengths[selected.id] : -1,
        population: known(selected.id) ? game.planetPopulationCounts[selected.id] : -1,
        description, days: travel, travelDays, fuel, canTravel: !error, error, deliveries: [],
        destinationSystem:target.system,bodyId:target.bodyId,bodyName:target.name,
        canCruise:!!target.canCruise,cruiseError:target.cruiseError||target.error,inLocalSystem:!!target.inSystem,minimumWarpDistance:target.minimumWarpDistance,
        manualDistance:target.distance||0,
        manualSeconds:(target.distance||0)/Math.max(36,Number(effective.speedOrOtherStationValue)*4.5)}
    };
  }

  window.nativeNavigation = {
    initialize,
    destination,
    system: id => systems.get(Number(id)),
    attach(value) { bridge = value; },
    get active() { return !!bridge?.getGame(); },
    call(action, value = 0) {
      if (!bridge?.getGame()) return {ok: false, error: 'Begin a game before navigating.'};
      if (action === 'state') return state(value);
      if (['open','course','track','cruise','local-target'].includes(action) && bridge.isBusy?.()) return {ok: false, error: 'Complete the current journey before plotting another course.'};
      if (action === 'open' || action === 'close') { bridge.prepareMap(action); return {ok: true}; }
      if(action==='cancel-cruise')return bridge.cancelCruise?.()||{ok:false,error:'Cruise is not active.'};
      if (action === 'cruise' || action === 'local-target') {
        const game=bridge.getGame(),selection=typeof value==='object'?value:{system:game.system,body:value},target=destination(game,selection);
        if(!target.ok)return target;
        if(action==='cruise'&&!target.canCruise)return {ok:false,error:target.cruiseError};
        if(action==='local-target'&&!window.nativeSystemCatalog.sameSystem(target.system,game.system))return {ok:false,error:'Select a destination in this solar system.'};
        return action==='cruise' ? bridge.cruise(target.bodyId,{system:target.system,body:target.bodyId}) : bridge.selectLocal(target.bodyId);
      }
      if (action === 'track') {
        const id=Number(value);
        if(!Number.isInteger(id)||!window.nativeManualFlight.chartPosition(id))return{ok:false,error:'Select a system on the map.'};
        return bridge.track(id);
      }
      if (action === 'course') {
        const id = Number(typeof value==='object'?value.system??value.id:value);
        if (!Number.isInteger(id) || !systems.get(id)?.charted) return {ok: false, error: 'Select a system on the map.'};
        const journey = state(typeof value==='object'?{...value,system:id}:id).selected;
        if (!journey.canTravel) return {ok: false, error: journey.error};
        const result = bridge.travel({...journey,id:journey.destinationSystem});
        if (result?.ok === false) return result;
        return {ok: true};
      }
      return {ok: false, error: 'Unknown navigation action.'};
    }
  };
})();
