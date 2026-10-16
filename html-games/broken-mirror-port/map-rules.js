// Browser-side port of vexMapDistance/vexMapState travel preview and eligibility rules.
// Current frame 154 sets maxwarp to 5 and floors the resulting journey time.
window.BrokenMirrorMapRules = Object.freeze({
  standing(system) {
    if (!system.known) return 'Unknown';
    if (Number(system.government) === 16) return 'Your territory';
    if (Number(system.prestige) >= 100) return 'Allied';
    if (Number(system.prestige) < 0) return 'Hostile';
    return 'Neutral';
  },
  status(system) {
    if (!system.known) return 'Unknown';
    if (Number(system.government) === 16) return 'Your territory';
    if ([29, 32, 33, 34].includes(Number(system.id))) return 'Forbidden';
    if (Number(system.population) <= 0 && Number(system.strength) <= 0) return 'Uninhabited';
    return this.standing(system);
  },
  routeBlock(route, systemsById) {
    const from = systemsById.get(Number(route.a));
    const to = systemsById.get(Number(route.b));
    if (!from || !to) return 'No charted endpoint';
    if (Number(from.population) <= 0 || Number(to.population) <= 0) return 'No inhabited market';
    const fromGovernment = Number(from.government);
    const toGovernment = Number(to.government);
    if ([0, 14, 15].includes(fromGovernment) || [0, 14, 15].includes(toGovernment)) return 'Unsafe government';
    if (fromGovernment !== toGovernment && (Number(from.warGovernment) === toGovernment || Number(to.warGovernment) === fromGovernment)) return 'War between endpoints';
    return '';
  },
  distance(currentId, targetId, layout, maxWarp = 5) {
    const from = layout?.[currentId];
    const to = layout?.[targetId];
    const warp = Number(maxWarp);
    if (!from || !to || !Number.isFinite(warp) || warp <= 0) return -1;
    return (Math.abs(from.x - to.x) + Math.abs(from.y - to.y)) / warp;
  },
  travelDays(currentId, targetId, layout, maxWarp = 5) {
    const distance = this.distance(currentId, targetId, layout, maxWarp);
    return distance < 0 ? -1 : Math.floor(distance);
  },
  preview(currentId, targetId, layout, game) {
    const travel = this.distance(currentId, targetId, layout, game.maxWarp);
    const days = travel < 0 ? -1 : Math.floor(travel);
    const antimatter = Number(game.antimatter);
    const antimatterUse = Number(game.antimatterUse);
    const fuel = days < 0 ? -1 : Math.floor(days / antimatterUse / 3);
    const enoughFuel = days >= 0 && days < antimatter * 2 * antimatterUse;
    let error = '';
    if (Number(targetId) === Number(currentId)) {
      error = 'You are already in this system.';
    } else if (Number(currentId) > 50 || travel < 0) {
      error = 'No charted warp lane from this region. Use a wormhole to return.';
    } else if (game.repairing) {
      error = 'Wait for repairs to finish.';
    } else if (!enoughFuel) {
      error = 'Insufficient antimatter for this journey.';
    } else if ([32, 33, 34].includes(Number(targetId)) && Number(game.navigationExperience) < 100) {
      error = 'Navigation experience 100 is required for this sensor-obscured region.';
    }
    return {distance: travel, days, fuel, canTravel: error === '', error};
  }
});
