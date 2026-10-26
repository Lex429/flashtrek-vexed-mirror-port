/* Authoritative shield-first damage and matching collision surfaces for every ship. */
(() => {
  'use strict';
  function collision(descriptor,impact,shielded){
    const contact=impact.contact;
    // Old saves/callers predate contact.shielded; the supplied contact belongs
    // to the initially struck surface. A shield overflow gets a hull contact.
    if(contact&&(contact.shielded===shielded||contact.shielded===undefined&&shielded===(descriptor.shields>0)))return contact;
    // Preserve the collision-local ray when a moving target crossed the shot.
    // Its projectile approach point belongs to the earlier sweep time, whereas
    // the descriptor now has the end-of-step pose used by the renderer.
    const collisionRay=contact?.local?(window.nativeCombatShots.worldPoint?.(descriptor,contact.local)||contact.world):null;
    const from=collisionRay||contact?.from||impact.from||impact.point||{x:descriptor.x,y:descriptor.y-100};
    return window.nativeCombatShots.contact(descriptor,from,descriptor.dimensions,shielded);
  }
  function apply(descriptor,damage,impact={},options={}){
    impact||={};
    const ship=descriptor?.entity;
    if(!ship||ship.hull<=0||ship.phase==='destroyed')return {ok:false,error:'Target already destroyed.'};
    const definitions=window.nativeShipDefinitions,beforeStage=definitions.stage(descriptor);
    const before={shields:Math.max(0,Number(ship.shields)||0),hull:Math.max(0,Number(ship.hull)||0)};
    const requested=Math.max(0,Number(damage)||0),mitigated=window.nativeShipyardRefits?.shieldHit(ship,requested,impact,descriptor.state)??requested,ratio=descriptor.definition.capabilities.disableRatio||0;
    const disableHull=ratio?Math.max(1,descriptor.definition.hull*ratio):0;
    const floor=impact.nonlethal?Math.min(before.hull,options.hullFloor??disableHull):Math.min(before.hull,Math.max(0,options.hullFloor||0));
    const amount=Math.min(mitigated,before.shields+Math.max(0,before.hull-floor)),absorbed=Math.min(before.shields,amount),hullDamage=Math.min(before.hull-floor,amount-absorbed);
    const contacts={shield:absorbed>0?collision(descriptor,impact,true):null,hull:hullDamage>0?collision(descriptor,impact,false):null};
    ship.shields=before.shields-absorbed;ship.hull=before.hull-hullDamage;
    return {ok:true,requested,amount,absorbed,hullDamage,before,beforeStage,afterStage:definitions.stage(descriptor),contacts,
      destroyed:ship.hull<=0,disabled:ship.hull>0&&disableHull>0&&ship.hull<=disableHull,shields:ship.shields,hull:ship.hull};
  }
  window.nativeShipDamage=Object.freeze({apply,collision});
})();
