/* Orion hulls use the ordinary equipment, movement, damage and presentation owners. */
(() => {
  'use strict';
  const data=window.nativeOrionWorld;
  for(const hull of data.hulls){
    const stats=window.VexedMirrorWorld.ships.find(entry=>entry.id===hull.id),profile=window.starterShips?.get(hull.id);
    window.nativeShipDefinitions.register(hull.id,{
      ...stats,artworkProfile:profile,dimensions:{width:hull.height,height:hull.height},
      artwork:{source:'flight',frames:['intact','light','heavy','severe'].map(stage=>`orion/orion-${hull.file}-${stage}.png`)},
      debrisGeometry:window.VexedMirrorDebrisGeometry?.ships?.[hull.id],
      npcPolicy:hull.duty==='freight'?{name:'cargo',activities:['trade','mining','travel']}:'civilian',
      capabilities:{canMine:hull.duty!=='patrol',canTrade:hull.duty!=='patrol'},
      emitters:window.nativeShipWeaponMounts?.get(hull.id)?.emitters||{beam:{x:0,y:-.32},beamAft:{x:0,y:.31},projectile:{x:0,y:-.35},...hull.emitters}
    });
  }
  window.nativeOrionShips=Object.freeze({governmentId:data.governmentId,ids:Object.freeze(data.hulls.map(hull=>hull.id)),
    duties:Object.freeze(Object.fromEntries(data.hulls.map(hull=>[hull.id,hull.duty])))});
})();
