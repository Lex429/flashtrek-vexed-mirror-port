/* User-supplied Constitution hulls: Dev selection uses the ordinary roster,
   equipment, motion, combat and save owners. No new shop or NPC spawn entries. */
(() => {
  'use strict';
  const variants=[
    {id:426,name:"Kirk's Ship - I.S.S. Enterprise NCC-1701",file:'iss-enterprise',description:'The named Imperial Constitution cruiser, with its original Enterprise markings.'},
    {id:427,name:'Constitution Class',file:'constitution-class',description:'The unmarked Constitution cruiser, sharing the Enterprise hull and equipment layout.'}
  ];
  function flightProfile(source){
    if(!source?.effects)return source; // Startup workers carry geometry only.
    const scale=3/8,width=384,height=576,aligned=new WeakMap();
    return {...source,width,height,
      align(image,stage){
        if(aligned.has(image))return aligned.get(image);
        source.align(image,stage);
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.drawImage(image,0,0,width,height);aligned.set(image,canvas);return canvas;
      },
      effects:{...source.effects,unlitFrame:image=>image,
        forEachLightPrimitive(stage,time,options,paint){
          source.effects.forEachLightPrimitive(stage,time,options,(image,x,y,w,h,...rest)=>paint(image,x*scale,y*scale,w*scale,h*scale,...rest));
        }
      },
      breakAnchors:source.breakAnchors.map(([x,y])=>[x*scale,y*scale]),
      destruction:{...source.destruction,
        core:source.destruction.core.map(value=>value*scale),
        sites:source.destruction.sites.map(([name,x,y])=>[name,x*scale,y*scale])
      }
    };
  }
  for(const variant of variants){
    const {id,name,file,description}=variant;
    const frames=['','-light','-heavy','-severe'].map(stage=>`constitution/${file}${stage}.png`);
    const stats={id,name,description,devOnly:true,massClass:3,antimatterUseOrPopulationEffect:4,
      cargo:150,hull:200,shields:200,speedOrOtherStationValue:95,turn:10,price:12000,defaultWeapons:[1,15,0]};
    const existing=window.VexedMirrorWorld.ships.find(ship=>ship.id===id);
    if(existing&&existing.name!==name)throw Error('Constitution ship ID is already assigned: '+id);
    if(!existing)window.VexedMirrorWorld.ships.push(stats);
    const artworkProfile=flightProfile(window.starterShips?.get(id));
    window.nativeShipDefinitions.register(id,{
      ...stats,dimensions:{width:100*1024/1536,height:100},
      artworkProfile,artwork:{source:'flight',frames},
      slots:{weapon:3,repairDrone:2,ability:2,engineering:1,shield:1},
      emitters:{beam:{x:0,y:-.24},projectile:{x:0,y:-.36}},
      npcPolicy:'cargo'
    });
    // The installed Games Hub predates definition-owned artwork/flight sizing.
    // Supply the same profile through its existing lookup APIs as well.
    if(!window.nativeShipDefinitions.artworkProfile){
      window.starterShips.set(id,artworkProfile);
      const size=window.vexedFlightAssets.size;
      window.vexedFlightAssets.size=type=>Number(type)===id?
        {id,playerWidth:100*1024/1536,playerHeight:100}:size(type);
    }
  }
})();
