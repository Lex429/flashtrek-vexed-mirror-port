/* Plan transit once, retaining both its resulting state and its exact report. */
(() => {
  'use strict';
  const world = window.VexedMirrorWorld;
  const systems = new Map(world.systems.map(system => [system.id, system]));
  const governments = new Map(world.governments.map(government => [government.id, government.name]));

  function plan(game, journey, random = Math.random) {
    if(window.nativeSimulationFrame?.transitionReady&&!window.nativeSimulationFrame.transitionReady(game))throw Error('Simulation is catching up. Wait for flight to recover before warping.');
    const next = JSON.parse(JSON.stringify(game));
    delete next.pendingTransit;
    const target = systems.get(journey.id);
    const firstVisit = !next.discovered.includes(target.id);
    const events = [];
    const maxHull = window.nativeShipDefinitions?.forEntity(next).hull || world.ships.find(ship => ship.id === next.shipType)?.hull || 100;
    const add = (kind, title, text, effects = {}) => events.push({kind, title, text, effects});
    next.antimatter -= game.devMode ? 0 : journey.fuel;
    if(window.nativeWorldTime)window.nativeWorldTime.advanceDays(next,journey.travelDays,random);
    else{next.day+=journey.travelDays;window.nativePopulation.advanceDays(next,journey.travelDays,random);}
    next.system = target.id;next.planet = target.name;
    next.x = 0;next.y = 0;next.speed = 0;next.angle = -Math.PI / 2;next.landed = false;
    next.nav += (Math.floor(random() * 2) + 1) * .1;
    next.discovered = [...new Set([...next.discovered, target.id])];

    const roll = game.devMode ? 1 : random();
    if (journey.travelDays > 0 && roll < .22 && next.shields > 0) {
      const loss = Math.min(next.shields, 4 + Math.floor(random() * 9));
      next.shields -= loss;
      add('warning', 'Charged dust front', `Deflectors absorbed a charged dust front. Shields lost ${loss} points; the hull is intact.`, {shields: -loss});
    } else if (journey.travelDays > 0 && roll < .47) {
      const recovered = 25 + Math.floor(random() * 100);
      next.latinum += recovered;
      add('success', 'Derelict salvage recovered', `The crew recovered ${recovered} bars of latinum from an abandoned cargo beacon.`, {latinum: recovered});
    } else if (journey.travelDays > 0 && roll < .65) {
      const gain = 1 + Math.floor(random() * 3);
      next.nav += gain;
      add('success', 'Navigation telemetry recorded', `The navigator mapped a stable subspace corridor. Navigation experience increased by ${gain}.`, {navigation: gain});
    } else if (journey.travelDays > 0 && roll < .8 && next.hull < maxHull && next.deuranium >= 3) {
      const repaired = Math.min(maxHull - next.hull, 3 + Math.floor(random() * 4));
      next.hull += repaired;next.deuranium -= 3;
      add('success', 'Engineering maintenance complete', `Engineers used 3 deuranium to restore ${repaired} hull points.`, {hull: repaired, deuranium: -3});
    } else {
      add('info', 'Transit corridor clear', 'Long-range sensors detected no incident requiring intervention.');
    }

    if (journey.travelDays > 0 && !game.devMode) {
      const candidates = world.systems.filter(system => next.discovered.includes(system.id) &&
        next.planetPopulations[system.id] > 0 && next.planetStrengths[system.id] > 0 && system.enemyGovernmentId > 0);
      if (candidates.length && random() < .35) {
        const system = candidates[Math.floor(random() * candidates.length)];
        const loss = Math.min(next.planetStrengths[system.id], 35 + Math.floor(random() * 160));
        next.planetStrengths[system.id] -= loss;
        add('warning', 'Subspace conflict bulletin', `${governments.get(system.enemyGovernmentId)} forces attacked ${system.name}. System strength fell by ${loss}.`,
          {systemId: system.id, strength: -loss});
      }
      const goods = Object.keys(next.stocks || {});
      if (goods.length) {
        const good = goods[Math.floor(random() * goods.length)];
        const before = Number(next.stocks[good]) || 0;
        const after = Math.max(0, Math.min(120, before + Math.floor(random() * 11) - 5));
        if (after !== before) {
          next.stocks[good] = after;
          add('info', 'Port exchange update', `${target.name}'s exchange has ${after} tons of ${good} available, ${after > before ? 'up' : 'down'} ${Math.abs(after - before)} during transit.`,
            {good, stock: after - before});
        }
      }
    }
    if (firstVisit) add('info', 'Stellar chart updated', `The first survey of ${target.name} has been added to your interstellar map.`);
    const governmentId = next.planetGovts[target.id];
    const standing = governmentId === 16 ? 'Your territory' : next.localPrestige[target.id] >= 100 ? 'Allied' : next.localPrestige[target.id] < 0 ? 'Hostile' : 'Neutral';
    const report = {
      id: 'transit-' + Date.now().toString(36) + '-' + Math.floor(random() * 0xffffff).toString(36),
      originId: game.system, originName: systems.get(game.system).name,
      systemId: target.id, systemName: target.name, governmentId,
      governmentName: governmentId === 16 ? String(next.government) : governments.get(governmentId),
      standing, prestige: next.localPrestige[target.id], elapsedDays: journey.travelDays, startDay: game.day,
      day: next.day, fuelUsed: game.devMode ? 0 : journey.fuel, fuelRemaining: game.devMode ? '∞' : next.antimatter,
      shipType: next.shipType, shipName: next.shipName, shipClass: next.shipClass,
      hull: next.hull, shields: next.shields, events
    };
    next.lastJourney = report;
    return {next, report};
  }
  window.vexedTravelEvents = {plan};
})();
