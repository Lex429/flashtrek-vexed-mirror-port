/* Asteroid artwork adapter for the shared conservative nebula field.
   Geometry/motion/mining remain in their existing owners. No pixel readbacks. */
(() => {
  'use strict';
  const pieceMasks=new WeakMap();
  function cutMasks(data){
    if(pieceMasks.has(data))return pieceMasks.get(data);
    const api=window.nativeNebulaMaterial,w=160,h=160,alphas=Array.from({length:4},()=>new Uint8Array(w*h));
    // The mining owner has already sampled the source alpha. Reuse those CPU
    // pixels and its exact 28-segment cuts, without another canvas readback.
    for(let x=0;x<w;x++){
      const u=(x+.5)/w,segment=Math.min(27,Math.floor(u*28)),t=u*28-segment;
      const seams=[0,1,2].map(pass=>{const a=data.cut(pass,segment/28),b=data.cut(pass,(segment+1)/28);return .5+a.y+(b.y-a.y)*t;});
      for(let y=0;y<h;y++){
        const v=(y+.5)/h,row=seams.filter(s=>v>s).length;
        alphas[row][y*w+x]=data.alpha[(Math.min(data.h-1,Math.floor(v*data.h))*data.w+Math.min(data.w-1,Math.floor(u*data.w)))*4+3];
      }
    }
    const masks=alphas.map((alpha,i)=>{const mask=api.createMask(alpha,w,h,1,false);mask.art=data.pieces[i];return mask;});
    pieceMasks.set(data,masks);return masks;
  }
  function maskFor(file,art){
    const api=window.nativeNebulaMaterial;
    // While a damage plate loads, the artwork owner may return its predecessor.
    // Clear exactly that visible plate, rather than the requested future one.
    const actual=art?.src?.split('/showcase-assets/')[1]?.split(/[?#]/)[0]||file;
    const record=window.nativeNebulaAsteroidMasks?.masks?.[actual];
    const mask=api?.maskForRecord(record);if(!mask)return null;
    // Cold/offscreen rocks still transport gas using their baked silhouette.
    // Switch only the display stencil to the full artwork when it is ready.
    if(art?.complete&&art.naturalWidth)mask.art=art;return mask;
  }
  function bodyFor(state,d,{origin={x:0,y:0},zoom=1,field}={}){
    const rocks=window.nativeSolAsteroids,rock=d.entity||d;
    if(!rocks||!rock||!(rock.size>0))return null;
    const file=rocks.frame(rock,state.asteroidDamage?.[rock.slotId]),art=rocks.image(file);
    const mask=maskFor(file,art);if(!mask)return null;
    const size=rock.size*Math.min(zoom,2.2)/zoom;
    // Rocks are drawn with Canvas rotate(angle). The gas solver's forward axis
    // is image-up, hence the quarter-turn conversion from that same artwork.
    const pose={x:rock.x-origin.x,y:rock.y-origin.y,heading:(rock.angle||0)-Math.PI/2,
      width:size,height:size,speed:Math.hypot(rock.vx||0,rock.vy||0)};
    const from=Number.isFinite(d.previousX)&&Number.isFinite(d.previousY)?
      {...pose,x:d.previousX-origin.x,y:d.previousY-origin.y}:undefined;
    const radius=size*Math.SQRT1_2,code=p=>!field?0:
      (p.x+radius<field.minX?1:0)|(p.x-radius>field.minX+field.width?2:0)|
      (p.y+radius<field.minY?4:0)|(p.y-radius>field.minY+field.height?8:0);
    const before=from?code(from):0,after=code(pose);
    return {id:'asteroid:'+rock.slotId,category:'asteroid',pose,from,
      sweepEnd:before&&after&&!(before&after)?pose:undefined,mask};
  }
  function miningBodies(state,{origin={x:0,y:0},field}={}){
    const own=window.nativeAsteroidCombat?.miningVisual?.(state),visuals=[...(own?[own]:[]),...(window.nativeCivilianTraffic?.miningVisuals?.(state)||[])];
    const ids=new Set(),bodies=[],now=window.nativeSimulation?.now?.(state)||0;
    for(const visual of visuals){
      const rock=visual.rock;if((rock.system??1)!==state.system)continue;
      const x=rock.x-origin.x,y=rock.y-origin.y,pad=rock.size*2;
      if(field&&(x+pad<field.minX||x-pad>field.minX+field.width||y+pad<field.minY||y-pad>field.minY+field.height))continue;
      ids.add(rock.slotId);
      const a=window.nativeAsteroidMiningEffects?.appearance(visual,now);if(!a||(1-.78*a.drain)*a.rockFade<48/255)continue;
      const masks=cutMasks(a.data),size=rock.size*a.scale;
      for(let i=0;i<4;i++){
        const part=a.parts[i];bodies.push({id:'asteroid:'+rock.slotId+':cut:'+i,category:'asteroid',mask:masks[i],
          pose:{x:x+part.x*a.gather,y:y+part.y*a.gather,heading:rock.angle+part.rotation-Math.PI/2,
            width:size,height:size,speed:Math.hypot(rock.vx||0,rock.vy||0)}});
      }
    }
    return {ids,bodies};
  }
  window.nativeNebulaAsteroids=Object.freeze({bodyFor,maskFor,miningBodies});
})();
