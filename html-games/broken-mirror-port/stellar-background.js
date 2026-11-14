/* System stars share the existing sky, illumination and finite-disk eclipse owner. */
(() => {
  'use strict';
  const palette={g:0xffdb9e,k:0xffb875,m:0xff835f,a:0xbfdcff,'white-dwarf':0xdceaff};
  const sunLayerParallax=.24;
  const textures=new Map(),catalogs=new Map(),images=new Map();
  let catalogOwner=null,builds=0,lastDraws=0,lastSources=0,lastBodies=0;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const rgba=(color,alpha)=>`rgba(${color>>16&255},${color>>8&255},${color&255},${alpha})`;
  function sources(system){
    const catalog=window.nativeSystemCatalog;
    if(catalog!==catalogOwner){catalogs.clear();catalogOwner=catalog;}
    system=Number(system);
    if(catalogs.has(system))return catalogs.get(system);
    const stars=catalog?.bodies(system).filter(body=>body.kind==='star'&&!body.occludedBy)||[];
    const result=stars.map((body,index)=>{
      const type=body.art?.match(/star-([a-z-]+)\./)?.[1]||'g';
      const world=window.vexedSolFlight?.bodyPosition(body)||{x:body.x-220,y:body.y+75};
      return Object.freeze({id:body.id,system,name:body.name,art:body.art,color:palette[type]||palette.g,
        worldX:world.x,worldY:world.y,size:Number(body.size)||230,primary:index===0});
    });
    // Isolated render fixtures can still exercise Sol before the catalog loads.
    if(!result.length&&system===1)result.push(Object.freeze({id:0,system,name:'Sol',art:'assets/system-planets/star-g.webp',color:palette.g,worldX:-6220,worldY:-925,size:266,primary:true}));
    if(catalog)catalogs.set(system,Object.freeze(result));
    return result;
  }
  function project(system,view){
    if(window.nativeBadlands?.starless(system,view))return [];
    const visibility=window.nativeBadlands?.starlight(system,view)??1;
    const cx=view.w/2,cy=view.h/2;
    const cameraX=Number(view.cameraX??view.playerX)||0,cameraY=Number(view.cameraY??view.playerY)||0;
    return sources(system).map(source=>{
      const dx=source.worldX-cameraX,dy=source.worldY-cameraY;
      // A nearer background plane slides at one fixed rate. Camera travel never
      // changes the apparent disk size, light level or parallax rate.
      const parallax=sunLayerParallax;
      const radius=Math.max(24,Math.min(68,54*Math.sqrt(source.size/266)));
      return {...source,x:cx+dx*parallax,y:cy+dy*parallax,radius,sourceRadius:radius,parallax,
        intensity:(source.primary?1:.72)*visibility};
    });
  }
  function canvas(width,height,paint){
    const image=document.createElement('canvas');image.width=width;image.height=height;
    paint(image.getContext('2d'),width,height);return image;
  }
  function requestImage(path){
    const loader=window.vexedFlightAssets?.loadImage;if(!path||!loader)return null;
    let entry=images.get(path);
    if(entry?.image||entry?.promise)return entry;
    if(entry?.retryAt>Date.now())return entry;
    if(!entry){entry={image:null,promise:null,retryAt:0};images.set(path,entry);}
    entry.promise=loader(path).then(image=>{
      entry.image=image;entry.promise=null;entry.retryAt=0;return image;
    }).catch(error=>{entry.promise=null;entry.retryAt=Date.now()+15000;throw error;});
    // Preparation can await the same request. A cold paint never blocks flight.
    entry.promise.catch(()=>{});return entry;
  }
  function appearance(color){
    if(textures.has(color))return textures.get(color);
    const halo=canvas(512,512,(ctx,w,h)=>{
      const glow=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
      for(const [at,alpha] of [[0,1],[.022,1],[.065,.94],[.15,.53],[.32,.22],[.62,.065],[1,0]])
        glow.addColorStop(at,rgba(at<.065?0xffffff:color,alpha));
      ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    });
    const streak=canvas(1024,32,(ctx,w,h)=>{
      const beam=ctx.createLinearGradient(0,0,w,0);
      for(const [at,alpha] of [[0,0],[.18,.05],[.4,.38],[.49,.95],[.5,1],[.51,.95],[.6,.38],[.82,.05],[1,0]])
        beam.addColorStop(at,rgba(Math.abs(at-.5)<.02?0xffffff:color,alpha));
      ctx.fillStyle=beam;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='destination-in';
      const feather=ctx.createLinearGradient(0,0,0,h);
      for(const [at,alpha] of [[0,0],[.3,.03],[.47,.4],[.5,1],[.53,.4],[.7,.03],[1,0]])feather.addColorStop(at,rgba(0xffffff,alpha));
      ctx.fillStyle=feather;ctx.fillRect(0,0,w,h);
    });
    const ring=canvas(192,192,(ctx,w,h)=>{
      const ghost=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
      for(const [at,alpha] of [[0,.012],[.64,.018],[.76,.12],[.83,.52],[.9,.08],[1,0]])ghost.addColorStop(at,rgba(color,alpha));
      ctx.fillStyle=ghost;ctx.fillRect(0,0,w,h);
    });
    const corona=canvas(256,256,(ctx,w,h)=>{
      const c=w/2,rim=w*.357;
      const aura=ctx.createRadialGradient(c,c,rim*.96,c,c,c);
      for(const [at,alpha] of [[0,.22],[.12,.3],[.42,.07],[1,0]])aura.addColorStop(at,rgba(color,alpha));
      ctx.fillStyle=aura;ctx.beginPath();ctx.arc(c,c,c,0,Math.PI*2);ctx.arc(c,c,rim*.96,0,Math.PI*2,true);ctx.fill('evenodd');
      // Broad, uneven streamers merge into the atmosphere rather than outlining
      // the disk with identical spikes. The texture does not spin around the sun.
      for(let i=0;i<9;i++){
        const angle=i*2.399963,reach=rim+14+(1+Math.sin(i*17.3))*10;
        ctx.save();ctx.translate(c,c);ctx.rotate(angle);
        const streamer=ctx.createLinearGradient(rim-3,0,reach,0);
        streamer.addColorStop(0,rgba(color,.15));streamer.addColorStop(.4,rgba(color,.055));streamer.addColorStop(1,rgba(color,0));
        ctx.fillStyle=streamer;ctx.beginPath();ctx.moveTo(rim-3,-16);
        ctx.bezierCurveTo(rim+9,-13,reach-6,-3,reach,2);
        ctx.bezierCurveTo(reach-10,1,rim+10,13,rim-3,17);ctx.closePath();ctx.fill();ctx.restore();
      }
    });
    // Three small atlas cells contain irregular bundles of magnetic loops.
    // Footpoints remain on the limb while each loop stretches and fades.
    const prominences=canvas(384,128,(ctx)=>{
      const plasma=color===palette.g?0xff954f:color===palette.k?0xff8048:color===palette.m?0xff633e:color;
      for(let variant=0;variant<3;variant++){
        ctx.save();ctx.translate(variant*128,0);ctx.lineCap='round';
        for(let strand=0;strand<22;strand++){
          const u=strand/21,bend=Math.sin(strand*2.17+variant);
          const reach=74+Math.sin(u*Math.PI)*29+bend*5;
          const path=()=>{
            ctx.beginPath();ctx.moveTo(16,40+u*9);
            ctx.bezierCurveTo(28+u*14,27+bend*5,reach-28,9+u*18+variant*3,reach,43+u*9);
            ctx.bezierCurveTo(reach+9,77+bend*5,36+u*24,99-u*12,16,88-u*9);
          };
          for(const [width,alpha] of [[10,.018],[3.2,.055],[.8,.12+(1+bend)*.08]]){
            ctx.lineWidth=width;ctx.strokeStyle=rgba(plasma,alpha);path();ctx.stroke();
          }
          // Short tangled filaments fill the arch unevenly instead of tracing
          // a single hollow outline. They share the same rooted active region.
          if(strand%3===0){
            ctx.lineWidth=1.4;ctx.strokeStyle=rgba(plasma,.24);
            ctx.beginPath();ctx.moveTo(24+u*12,45+u*30);
            ctx.bezierCurveTo(66+u*24,26+bend*10,38+u*25,74+bend*9,80+u*14,57+bend*8);ctx.stroke();
          }
        }
        for(const y of [43,86]){
          const foot=ctx.createRadialGradient(17,y,0,17,y,14);
          foot.addColorStop(0,rgba(0xffefc9,.7));foot.addColorStop(.25,rgba(plasma,.3));foot.addColorStop(1,rgba(plasma,0));
          ctx.fillStyle=foot;ctx.fillRect(3,y-14,28,28);
        }
        ctx.restore();
      }
    });
    const surface=canvas(256,256,(ctx,w,h)=>{
      const flow=ctx.createRadialGradient(w*.3,h*.3,0,w*.4,h*.4,w*.68);
      flow.addColorStop(0,rgba(0xffffff,.65));flow.addColorStop(.4,rgba(color,.2));flow.addColorStop(1,rgba(color,0));
      ctx.fillStyle=flow;ctx.beginPath();ctx.arc(w/2,h/2,w/2,0,Math.PI*2);ctx.fill();
    });
    const result={halo,streak,ring,corona,prominences,surface};
    // All catalog spectral artwork uses these five tints; keep custom callers bounded.
    if(textures.size>=6)textures.delete(textures.keys().next().value);
    textures.set(color,result);builds++;return result;
  }
  async function prepare(system,{signal}={}){
    const stars=sources(system),colors=new Set(stars.map(source=>source.color));
    const pending=[...new Set(stars.map(source=>source.art))].map(path=>requestImage(path)?.promise).filter(Boolean);
    for(const color of colors){
      if(signal?.aborted)throw Error('Stellar background preparation cancelled.');
      appearance(color);
      if(colors.size>1)await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    await Promise.all(pending);
    if(signal?.aborted)throw Error('Stellar background preparation cancelled.');
    return {sources:stars.length,textures:textures.size,images:images.size};
  }
  function render(ctx,stars,view,objects,sourceVisibility,{elapsed=0,opticalX=0,opticalY=0}={}){
    lastDraws=0;lastSources=stars.length;lastBodies=0;
    const scale=Math.max(.65,Math.min(1.2,Math.min(view.w,view.h)/700));
    const cx=view.w/2+opticalX,cy=view.h/2+opticalY;
    for(const star of stars){
      if(star.intensity<=0)continue;
      // Warm the existing image before arrival, including while its sun is offscreen.
      const image=requestImage(star.art)?.image;
      const haloRadius=210*scale*(star.primary?1:.78);
      const outside=Math.max(0,-star.x,star.x-view.w,-star.y,star.y-view.h);
      if(outside>Math.max(star.radius*1.4,haloRadius))continue;
      const edge=clamp(outside/(star.radius+48)),edgeVisibility=1-edge*edge*(3-2*edge);
      if(edgeVisibility<=0&&outside>star.radius*1.4)continue;
      const visibility=sourceVisibility(star,objects);if(visibility<=0)continue;
      const art=appearance(star.color),pulse=view.reducedMotion?1:1+.018*Math.sin(elapsed*.8+star.id);
      const glare=visibility*star.intensity*pulse*edgeVisibility;
      const width=Math.min(1150,view.w*.94)*(star.primary?1:.76),height=18*scale;
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=Math.min(1,glare);
      ctx.drawImage(art.halo,star.x-haloRadius,star.y-haloRadius,haloRadius*2,haloRadius*2);lastDraws++;
      if(image){
        ctx.save();ctx.translate(star.x,star.y);
        const t=view.reducedMotion?0:elapsed;
        ctx.save();ctx.rotate(star.id*.73);ctx.globalAlpha=glare*.8;
        const r=star.radius*1.4;ctx.drawImage(art.corona,-r,-r,r*2,r*2);lastDraws++;ctx.restore();
        for(let site=0;site<3;site++){
          const phase=((t/(26+site*11)+(star.id%17)*.071+site*.319)%1+1)%1;
          const life=Math.sin(Math.PI*phase)**2;
          const w=star.radius*(.24+.17*life),h=star.radius*(.31+site*.045);
          ctx.save();ctx.rotate(star.id*.73+[.43,2.72,4.96][site]);ctx.globalAlpha=glare*(.15+.8*life);
          ctx.drawImage(art.prominences,site*128,0,128,128,star.radius*.989-w*.125,-h/2,w,h);lastDraws++;ctx.restore();
        }
        // The existing transparent artwork contains an opaque disk at ~40% of its width.
        // Draw it normally to retain the surface detail beneath the lens effects.
        const size=star.radius/.398;
        ctx.globalCompositeOperation='source-over';ctx.globalAlpha=star.intensity;
        ctx.drawImage(image,-size/2,-size/2,size,size);lastDraws++;lastBodies++;
        ctx.beginPath();ctx.arc(0,0,star.radius*.99,0,Math.PI*2);ctx.clip();
        ctx.globalCompositeOperation='screen';ctx.globalAlpha=star.intensity*(.13+.035*Math.sin(t*.7+star.id));
        ctx.rotate(t*.035+star.id*.17);ctx.drawImage(art.surface,-star.radius,-star.radius,star.radius*2,star.radius*2);lastDraws++;
        ctx.restore();
      }
      ctx.save();ctx.translate(star.x,star.y);
      for(const [angle,length,thickness,alpha] of [[0,width,height,1],[Math.PI/2,width*.36,height*.62,.8],[-.68,94*scale,6*scale,.5],[.68,94*scale,6*scale,.5]]){
        ctx.save();ctx.rotate(angle);ctx.globalAlpha=Math.min(1,glare*alpha);
        ctx.drawImage(art.streak,-length/2,-thickness/2,length,thickness);lastDraws++;ctx.restore();
      }
      ctx.restore();
      // Lens reflections move opposite the source across the optical center.
      const dx=cx-star.x,dy=cy-star.y;
      for(const [position,radius,alpha] of [[.72,22,.2],[1.22,48,.32],[1.62,74,.2],[1.94,14,.32]]){
        const x=star.x+dx*position,y=star.y+dy*position,r=radius*scale;
        ctx.globalAlpha=Math.min(1,glare*alpha);ctx.drawImage(art.ring,x-r,y-r,r*2,r*2);lastDraws++;
      }
      ctx.restore();
    }
  }
  function metrics(){
    let bytes=0;for(const art of textures.values())for(const image of Object.values(art))bytes+=image.width*image.height*4;
    let imageBytes=0,loadedImages=0;for(const entry of images.values())if(entry.image){loadedImages++;imageBytes+=(entry.image.naturalWidth||entry.image.width)*(entry.image.naturalHeight||entry.image.height)*4;}
    return {textures:textures.size,bytes,builds,draws:lastDraws,sources:lastSources,bodies:lastBodies,loadedImages,imageBytes};
  }
  window.nativeStellarBackground=Object.freeze({sources,project,prepare,render,metrics});
})();
