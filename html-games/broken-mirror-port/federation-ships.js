/* Finished Federation artwork joins the existing definition and purchase owners. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld;
  const additions=Object.freeze([
    [433,'U.S.S. Stargazer NCC-82893',38],
    [434,'NX Class',3],
    [435,"Archer's Ship - Enterprise NX-01",3],
    [436,'Class 9 Shuttle',7],
    [437,'Delta Flyer',7],
    [438,'Intrepid Class',36],
    [439,'U.S.S. Voyager NCC-74656',36],
    [440,"Picard's Ship - U.S.S. Enterprise NCC-1701-D",35],
    [441,"Sulu's Ship - U.S.S. Excelsior NCC-2000",2],
    [442,'U.S.S. São Paulo NCC-75633',34],
    [443,'Defiant Class',34],
    [444,'U.S.S. Defiant NX-74205',34],
    [445,'Sagan Class',38]
  ].map(Object.freeze));
  const ids=Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,33,34,35,36,37,38,45,46,47,49,56,57,58,60,416,426,427,...additions.map(([id])=>id)]);
  const finished=new Set(ids),type=416,base=world.ships.find(ship=>ship.id===10);
  const stats={...base,id:type,name:'Tug Class II-A · Armored Freight',
    description:'An armored freight tug with reinforced cargo plating, stronger hull protection and room for 2,000 t of cargo.',
    hull:150,cargo:2000,price:21000,defaultWeapons:[0,14,0]};
  const existing=world.ships.find(ship=>ship.id===type);
  if(existing&&existing.name!==stats.name)throw Error('Federation ship ID is already assigned: '+type);
  if(!existing)world.ships.push(stats);
  const profile=window.starterShips?.get(type),height=window.nativeShipDefinitions.dimensions({shipType:10}).height;
  window.nativeShipDefinitions.register(type,{
    ...stats,artworkProfile:profile,dimensions:{width:height*(profile?.width||182)/(profile?.height||504),height},
    artwork:{source:'flight',frames:['tug-class-ii-a.png','tug-class-ii-a-light.png','tug-class-ii-a-heavy.png','tug-class-ii-a-severe.png'].map(file=>'tug-class-ii/'+file)},
    debrisGeometry:window.VexedMirrorDebrisGeometry?.ships?.[type],npcPolicy:'cargo',
    emitters:{beam:{x:0,y:-.28},beamAft:{x:0,y:.34},projectile:{x:0,y:-.36}}
  });
  for(const [id,name,templateId] of additions){
    const template=world.ships.find(ship=>ship.id===templateId),profile=window.starterShips?.get(id);
    const height=window.nativeShipDefinitions.dimensions({shipType:templateId}).height;
    // New artwork retains the established class's balance and flight scale.
    // Previews choose their own canvas scale through the existing UI owners.
    const stats={...template,id,name,defaultWeapons:[...template.defaultWeapons]};
    const existing=world.ships.find(ship=>ship.id===id);
    if(existing&&existing.name!==name)throw Error('Federation ship ID is already assigned: '+id);
    if(!existing)world.ships.push(stats);
    const dimensions=window.VexedMirrorDebrisGeometry?.ships?.[id],ratio=profile?.displayRatio||profile?.width/profile?.height||dimensions?.width/dimensions?.height||1;
    window.nativeShipDefinitions.register(id,{
      ...stats,artworkProfile:profile,dimensions:{width:height*ratio,height},
      artwork:{source:'flight',frames:['','-light','-heavy','-severe'].map(stage=>`new-ship-art/ship-${id}${stage}.png`)},
      debrisGeometry:window.VexedMirrorDebrisGeometry?.ships?.[id],
      emitters:{...window.nativeShipDefinitions.get(templateId).emitters}
    });
  }
  window.nativeFederationShips=Object.freeze({ids,additions,isAnimated:id=>finished.has(Number(id)),
    offers(state,port,original=[]){
      // Keep named Dev-only variants and every existing port's stock policy.
      if(Number(state.system)!==1||Number(port)!==5)return original;
      return [...new Set([...original,...ids.filter(id=>!world.ships.find(ship=>ship.id===id)?.devOnly)])];
    }
  });
})();
