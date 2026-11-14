/* Bounded nearby gas cores reuse the tested all-hull material renderer. */
(() => {
  'use strict';
  const capacity=3,retention=30,slots=new Map();let owner=null,visible=[],paintView=null,paired=null,cpuLayers=null,last={active:0,retained:0,actors:0};
  const storm=window.nativeDevNebulaStorm?.createRenderer({production:true}),fire=window.nativeNebulaFire?.createModel({production:true});
  function dispose(){for(const slot of slots.values())slot.renderer.dispose();slots.clear();visible=[];owner=null;paired=null;}
  function frame(state,dt,view){
    paintView=view;
    if(owner&&owner!==state)dispose();owner=state;
    const api=window.nativeParallaxNebulae;
    const test=state?.devMode&&state.system===1?window.nativeDevFog.material():null,f=test?.field,z=view.zoom||1;
    const inPreview=f&&view.cameraX+view.w/z/2>f.minX&&view.cameraX-view.w/z/2<f.minX+f.width&&view.cameraY+view.h/z/2>f.minY&&view.cameraY-view.h/z/2<f.minY+f.height;
    if(!state||!api||inPreview){visible=[];storm?.frame(state,dt,view,{badlandsWeather:false});fire?.frame(state,dt,view,{badlandsWeather:false});last={active:0,retained:slots.size,actors:0};return;}
    const seconds=view.reducedMotion?0:Number(state.shipSimulation?.seconds)||0;
    const volumes=api.volumes(state.system,view,seconds),limit=volumes.some(v=>v.continuous)?16:capacity,ids=new Set(volumes.map(v=>v.id));
    for(const [id,slot] of slots)if(!ids.has(id)&&seconds-slot.seen>retention){slot.renderer.dispose();slots.delete(id);}
    visible=[];
    for(const volume of volumes){
      let slot=slots.get(volume.id);
      if(!slot){
        if(slots.size>=limit){const victim=[...slots].filter(([id])=>!ids.has(id)).sort((a,b)=>a[1].seen-b[1].seen)[0];if(victim){victim[1].renderer.dispose();slots.delete(victim[0]);}else continue;}
        slot={renderer:window.nativeDevFog.createRenderer({weather:true}),volume,seen:seconds};slots.set(volume.id,slot);
      }
      slot.volume=volume;slot.seen=seconds;visible.push(slot);
    }
    const weather={badlandsWeather:visible.some(slot=>!!slot.volume.badlandsOptics)};
    storm?.frame(state,dt,view,weather);fire?.frame(state,dt,view,weather);
    const weatherEffects={sheets:storm?.material()||[],heat:fire?.material(),clock:storm?.snapshot().clock||0};
    // Retained offscreen cores continue their accepted display time and shared
    // swept hull queries. Camera movement cannot freeze their existing wakes.
    for(const [id,slot] of slots){
      const volume=ids.has(id)?slot.volume:api.refreshVolume(slot.volume,state.system,view,seconds);
      if(!volume){slot.renderer.dispose();slots.delete(id);continue;}
      slot.volume=volume;slot.renderer.frame(state,dt,{...view,weatherVolume:volume,weatherEffects});
    }
    last={active:visible.length,retained:slots.size,actors:visible.reduce((n,s)=>n+(s.renderer.material()?.bodies.length||0),0)};
  }
  function paint(ctx,pass){
    const api=window.nativeNebulaMaterial;
    // Recolour the complete paired optical layer once, after tile blending.
    // Overlapping cores share the same world events and never splice flash boxes.
    const present=()=>{ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='screen';if(storm)storm.paint(ctx,pass,(target,layer)=>paired.paint(target,layer));else paired.paint(ctx,pass);ctx.restore();};
    if(pass==='back'){
      paired=null;
      const ordered=[...visible].sort((a,b)=>Number(b.volume.continuous)-Number(a.volume.continuous));
      if(visible.length&&api?.beginBatch?.(paintView)){try{for(const slot of ordered)slot.renderer.paint(ctx,pass);}finally{paired=api.endBatch();}if(paired)present();return;}
      if(visible.length){
        cpuLayers||=[document.createElement('canvas'),document.createElement('canvas')];
        for(let i=0;i<2;i++){const c=cpuLayers[i];c.width=paintView.w;c.height=paintView.h;const g=c.getContext('2d');for(const slot of ordered)slot.renderer.paint(g,i?'front':'back');}
        paired={paint(ctx,pass){ctx.drawImage(cpuLayers[pass==='front'?1:0],0,0);}};present();return;
      }
    }else if(paired){present();return;}
    for(const slot of visible)slot.renderer.paint(ctx,pass);
  }
  function parallaxHoles(view){
    return visible.filter(s=>s.renderer.material()?.field).map(({volume:v})=>({placeId:v.placeId,x:view.w/2+(v.origin.x-(view.cameraX||0))*(view.zoom||1),y:view.h/2+(v.origin.y-(view.cameraY||0))*(view.zoom||1),width:v.patch.width*(view.zoom||1),height:v.patch.height*(view.zoom||1),angle:v.patch.angle,continuous:!!v.continuous}));
  }
  window.nativeGalaxyFog=Object.freeze({frame,paint,dispose,parallaxHoles,capacity,retention,
    snapshot:()=>({...last,storm:storm?.snapshot()||null,fire:fire?.snapshot()||null,view:paintView&&{w:paintView.w,h:paintView.h,cameraX:paintView.cameraX,cameraY:paintView.cameraY,zoom:paintView.zoom},cores:[...slots.values()].map(s=>({id:s.volume.id,visible:visible.includes(s),origin:{...s.volume.origin},vortices:s.renderer.snapshot().vortices,material:s.renderer.snapshot().material}))}),
    materials:()=>visible.flatMap(s=>{const m=s.renderer.material();return m?[{id:s.volume.id,...m}]:[];})});
})();
