/* One Prometheus hull; its three modules are owned sub-hulls, never new crews. */
(()=>{
 'use strict';
 const data=window.prometheusArtwork;if(!data)return;
 // Outlet positions measured on the supplied intact alpha contours. Directions
 // describe exhaust; force acts in the opposite direction at this same point.
 const outlets={"37":[{"id":"engine0","kind":"engine","x":-0.3007812,"y":0.4296875,"dx":0,"dy":1},{"id":"engine1","kind":"engine","x":0.3007812,"y":0.4296875,"dx":0,"dy":1},{"id":"rcs0-side","kind":"rcs","x":-0.2617188,"y":-0.2558594,"dx":-1,"dy":0},{"id":"rcs0-axial","kind":"rcs","x":-0.2617188,"y":-0.2558594,"dx":0,"dy":-1},{"id":"rcs1-side","kind":"rcs","x":0.2617188,"y":-0.25,"dx":1,"dy":0},{"id":"rcs1-axial","kind":"rcs","x":0.2617188,"y":-0.25,"dx":0,"dy":-1},{"id":"rcs2-side","kind":"rcs","x":-0.3417969,"y":0.3203125,"dx":-1,"dy":0},{"id":"rcs2-axial","kind":"rcs","x":-0.3417969,"y":0.3222656,"dx":0,"dy":1},{"id":"rcs3-side","kind":"rcs","x":0.3398438,"y":0.3203125,"dx":1,"dy":0},{"id":"rcs3-axial","kind":"rcs","x":0.3398438,"y":0.3310547,"dx":0,"dy":1}],"3701":[{"id":"rcs0-side","kind":"rcs","x":-0.2252475,"y":-0.224846,"dx":-1,"dy":0},{"id":"rcs0-axial","kind":"rcs","x":-0.2252475,"y":-0.224846,"dx":0,"dy":-1},{"id":"rcs1-side","kind":"rcs","x":0.220297,"y":-0.2207392,"dx":1,"dy":0},{"id":"rcs1-axial","kind":"rcs","x":0.220297,"y":-0.2207392,"dx":0,"dy":-1},{"id":"rcs2-side","kind":"rcs","x":-0.490099,"y":0.3193018,"dx":-1,"dy":0},{"id":"rcs2-axial","kind":"rcs","x":-0.3589109,"y":0.4917864,"dx":0,"dy":1},{"id":"rcs3-side","kind":"rcs","x":0.4876238,"y":0.3193018,"dx":1,"dy":0},{"id":"rcs3-axial","kind":"rcs","x":0.3589109,"y":0.4917864,"dx":0,"dy":1}],"3702":[{"id":"engine0","kind":"engine","x":-0.3969072,"y":0.4954955,"dx":0,"dy":1},{"id":"engine1","kind":"engine","x":0.3969072,"y":0.4954955,"dx":0,"dy":1},{"id":"rcs0-side","kind":"rcs","x":-0.25,"y":-0.2432432,"dx":-1,"dy":0},{"id":"rcs0-axial","kind":"rcs","x":-0.25,"y":-0.2432432,"dx":0,"dy":-1},{"id":"rcs1-side","kind":"rcs","x":0.2448454,"y":-0.2454955,"dx":1,"dy":0},{"id":"rcs1-axial","kind":"rcs","x":0.2448454,"y":-0.2454955,"dx":0,"dy":-1},{"id":"rcs2-side","kind":"rcs","x":-0.4536082,"y":0.3198198,"dx":-1,"dy":0},{"id":"rcs2-axial","kind":"rcs","x":-0.3608247,"y":0.4515766,"dx":0,"dy":1},{"id":"rcs3-side","kind":"rcs","x":0.4536082,"y":0.3198198,"dx":1,"dy":0},{"id":"rcs3-axial","kind":"rcs","x":0.3608247,"y":0.4572072,"dx":0,"dy":1}],"3703":[{"id":"engine0","kind":"engine","x":-0.4186992,"y":0.4945873,"dx":0,"dy":1},{"id":"engine1","kind":"engine","x":0.4159892,"y":0.4945873,"dx":0,"dy":1},{"id":"rcs0-side","kind":"rcs","x":-0.402439,"y":-0.2699594,"dx":-1,"dy":0},{"id":"rcs0-axial","kind":"rcs","x":-0.3401084,"y":-0.3159675,"dx":0,"dy":-1},{"id":"rcs1-side","kind":"rcs","x":0.3943089,"y":-0.2699594,"dx":1,"dy":0},{"id":"rcs1-axial","kind":"rcs","x":0.3401084,"y":-0.3105548,"dx":0,"dy":-1},{"id":"rcs2-side","kind":"rcs","x":-0.4756098,"y":0.3200271,"dx":-1,"dy":0},{"id":"rcs2-axial","kind":"rcs","x":-0.3672087,"y":0.3484438,"dx":0,"dy":1},{"id":"rcs3-side","kind":"rcs","x":0.4728997,"y":0.3200271,"dx":1,"dy":0},{"id":"rcs3-axial","kind":"rcs","x":0.3644986,"y":0.3484438,"dx":0,"dy":1}]};
 function propulsion(type,mass,inertia,dimensions,reference){
  const jets=outlets[type].map(p=>({...p,x:p.x*dimensions.width,y:p.y*dimensions.height,
   force:mass*reference*(p.kind==='engine'?.5:p.dy<0?.8:p.dy>0?.55:.85)}));
  return {version:1,mass,inertia,referenceAcceleration:reference,jets,velocityResponse:.34,angularResponse:.22,angularAcceleration:4,maxTurnRate:type===37?.9:type===3701?1.35:type===3703?1.12:1.02};
 }
 // Startup/travel workers intentionally receive only profile dimensions. Fill
 // missing artwork metadata from the same typed source used by the full view.
 const profileFor=(type,size,frames,emitters)=>{
  const supplied=window.starterShips?.get(type);
  if(supplied?.artworkFrames!=null&&supplied?.artworkEmitters!=null)return supplied;
  return {...size,...supplied,artworkFrames:supplied?.artworkFrames??frames,artworkEmitters:supplied?.artworkEmitters??emitters};
 };
 const api=window.nativeShipDefinitions,original=api.get(data.parentType),profile=profileFor(data.parentType,data.canvas,data.parentFrames,data.parentEmitters);
 const reference=original.movement?.acceleration??Math.max(36,(original.speedOrOtherStationValue||95)*4.5)*.75;
 const parent=api.register(data.parentType,{artworkProfile:profile,dimensions:data.parentDimensions,physical:data.parentPhysical,
   propulsion:propulsion(data.parentType,data.parentPhysical.mass,data.parentPhysical.inertia,data.parentDimensions,reference),
   artwork:{source:'flight',frames:profile.artworkFrames},emitters:window.nativeShipWeaponMounts?.get(data.parentType)?.emitters||profile.artworkEmitters,
   debrisGeometry:window.VexedMirrorDebrisGeometry?.ships?.[data.parentType],capabilities:{...original.capabilities,multiVector:true}});
 for(const part of data.parts){
  const profile=profileFor(part.type,part.artworkSize,part.frames,part.emitters);
  const mass=parent.mass*part.weight,inertia=mass*(part.dimensions.width**2+part.dimensions.height**2)/12;
  api.register(part.type,{name:part.name,hull:parent.hull*part.weight,shields:parent.shields*part.weight,
   cargo:parent.cargo,price:0,turn:parent.turn,dimensions:part.dimensions,physical:{mass,inertia},
   propulsion:propulsion(part.type,mass,inertia,part.dimensions,reference*(part.key==='top'?1.18:part.key==='bottom'?1.08:1)),
   slots:{...parent.slots},startingEquipment:{weapon:[],repairDrone:[],ability:[],engineering:['standard-engine'],shield:['standard-shield']},
   artworkProfile:profile,artwork:{source:'flight',frames:profile?.artworkFrames||[]},emitters:window.nativeShipWeaponMounts?.get(part.type)?.emitters||profile?.artworkEmitters,
   debrisGeometry:window.VexedMirrorDebrisGeometry?.ships?.[part.type],
   capabilities:{armed:true,canMine:false,canDock:false,canTrade:false,multiVectorSection:true,disableRatio:.25}});
 }
 window.nativePrometheusDefinitions=Object.freeze({parentType:data.parentType,parts:Object.freeze(data.parts.map(Object.freeze)),
  part:type=>data.parts.find(part=>part.type===Number(type)),layout:data.layout,canvas:data.canvas});
})();
