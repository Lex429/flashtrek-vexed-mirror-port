/* Registered shipyards in their existing local flight spaces. Positions are derived
   from the shared catalog owner; painting never changes docking, cargo or saves.
   Both lamp states were baked with the shared Earth Shipyard showcase renderer. */
(() => {
  'use strict';
  const definition=Object.freeze({id:'mars-earth-shipyard-01',name:'Mars Orbital Shipyard',artworkId:280,system:1,bodyId:5,offsetX:520,offsetY:-120,size:220});
 const textures={lit:null,unlit:null};let requested=false,error=null,workLight=null;
  const definitions=Object.freeze((window.VexedMirrorWorld?.shipyards||[definition]).map(y=>Object.freeze({...y})));
  const definitionFor=state=>definitions.find(y=>y.system===Number(state?.system))||null;
  function position(state){
    const yard=definitionFor(state);if(!yard)return null;
    const mars=(window.nativeSystemCatalog?.bodies(yard.system)||window.vexedSolFlight?.bodies)?.find(body=>body.id===yard.bodyId);
    if(!mars)return null;
    const center=window.vexedSolFlight.bodyPosition(mars);
    return {x:center.x+yard.offsetX,y:center.y+yard.offsetY};
  }
  function visible(view){
    const point=position(view.state);if(!point||!view.ship)return null;
    const zoom=Number(view.zoom)||1,x=view.cx+(point.x-view.ship.x)*zoom,y=view.cy+(point.y-view.ship.y)*zoom,size=definitionFor(view.state).size*zoom,margin=size*Math.SQRT2/2+28;
    return x+margin<0||y+margin<0||x-margin>view.w||y-margin>view.h?null:{x,y,size,point};
  }
  function load(){
    if(requested)return;requested=true;
    for(const kind of ['lit','unlit']){
      const image=new Image();
      image.onload=async()=>{try{if(image.decode)await image.decode();textures[kind]=image;}catch(e){error=e.message;}};
      image.onerror=()=>{error='Mars shipyard artwork could not be loaded.';};
      image.src=`../flashtrek-broken-mirror/showcase-assets/structures/280-game-${kind}.png`;
    }
  }
  function paint(ctx,view){
    const placement=visible(view);if(!placement)return false;
    load();const image=textures[window.nativeFlightLightingEnabled===false?'unlit':'lit'];
    ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    if(image)ctx.drawImage(image,placement.x-placement.size/2,placement.y-placement.size/2,placement.size,placement.size);
    const dock=view.state.shipyardDock,definition=definitionFor(view.state);
    if(window.nativeFlightLightingEnabled!==false&&dock?.station===definition.id&&(dock.phase==='docked'||dock.phase==='approach'&&dock.step>0)){
      if(!workLight){
        workLight=document.createElement('canvas');workLight.width=workLight.height=128;
        const light=workLight.getContext('2d'),glow=light.createRadialGradient(64,64,2,64,64,62);
        glow.addColorStop(0,'rgba(255,211,142,.22)');glow.addColorStop(.38,'rgba(255,193,111,.10)');glow.addColorStop(1,'rgba(255,174,88,0)');
        light.fillStyle=glow;light.fillRect(0,0,128,128);
      }
      const zoom=Number(view.zoom)||1,collar=dock.plan.collar,x=view.cx+((collar?.noseX??dock.plan.x)-view.ship.x)*zoom,y=view.cy+((collar?.y??dock.plan.y)-view.ship.y)*zoom;
      if(collar){ctx.strokeStyle='#718795';ctx.lineWidth=4*zoom;ctx.beginPath();ctx.moveTo(view.cx+(collar.x-view.ship.x)*zoom,y);ctx.lineTo(x,y);ctx.stroke();}
      ctx.globalCompositeOperation='screen';ctx.drawImage(workLight,x-45*zoom,y-55*zoom,90*zoom,110*zoom);ctx.globalCompositeOperation='source-over';
    }
    ctx.fillStyle='#a7c0cf';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(definition.name.toUpperCase(),placement.x,placement.y+placement.size/2+16);ctx.restore();
    return true;
  }
  const snapshot=()=>({definition,position:position({system:1}),ready:!!textures.lit&&!!textures.unlit,requested,error,lighting:window.nativeFlightLightingEnabled!==false});
  window.nativeMarsShipyard=Object.freeze({definition,definitions,definitionFor,position,visible,paint,snapshot});
})();
