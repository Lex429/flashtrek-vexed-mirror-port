/* Live combat presentation, using the exact showcase profiles and renderers.
   World coordinates are independent of the native game's reciprocal camera zoom. */
(() => {
 'use strict';
 const canvas=document.createElement('canvas');canvas.id='ship-visuals';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'3',display:'none'});
 game.appendChild(canvas);const ctx=canvas.getContext('2d');
 const assets=new Map(),shieldAssets=new Map(),loading=new Map(),live=new Map(),dead=new Set(),failures=[];
 const state={time:0,angle:0,debris:[],particles:[]};
 let catalog,camera={x:300,y:225,zoom:1},system=null,last=performance.now(),raf=0,frames=0,destructions=0,hits=0,impacts=0;
 const options={lights:true,damage:true,anchors:false,lightGain:2,lightBloom:1.8};
 const sizeFactors={5:.85,6:.85,7:.45,16:.8,18:.45,20:.55,23:.5,24:.55,25:.8,29:.65,30:.8,34:.85,39:.8,47:.75};
 const lightOptions=type=>sizeFactors[type]<1?{...options,lightGain:2.8,lightBloom:2.5}:options;
 const nativeCamera=window.vexRebirthExplosionCamera;
 window.vexRebirthExplosionCamera=(x,y,zoom)=>{
  // During flight, ship transforms and their camera must come from one snapshot.
  if(Number(game.dataset.frame)!==154)camera={x:Number(x),y:Number(y),zoom:Math.max(.1,Number(zoom))};
  nativeCamera?.(x,y,zoom);
 };
 const effectsFor=id=>window.starterShips.get(id)?.effects||({56:window.constitutionTugEffects,57:window.tugEffects,58:window.olympicEffects,59:window.cthiaEffects})[id];
 const image=file=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Ship effect artwork: '+file));im.src='showcase-assets/'+file+'?v=live-effects-1';});
 function fragments(images,anchors){
  const w=images[0].width,h=images[0].height,pixels=images.map(im=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,w,h).data;});
  return pixels.map((after,s)=>{
   if(!s)return [];
   const before=pixels[s-1],groups=anchors.map(()=>[]);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;if(before[i+3]<100||after[i+3]>40)continue;
    let index=0,best=Infinity;anchors.forEach(([ax,ay],n)=>{const d=(x-ax)**2+(y-ay)**2;if(d<best){best=d;index=n;}});groups[index].push({x,y,i});
   }
   return groups.filter(g=>g.length>=12).map(group=>{
    let x=w,y=h,r=0,b=0;for(const p of group){x=Math.min(x,p.x);y=Math.min(y,p.y);r=Math.max(r,p.x);b=Math.max(b,p.y);}
    const texture=document.createElement('canvas');texture.width=r-x+1;texture.height=b-y+1;
    const g=texture.getContext('2d'),cut=g.createImageData(texture.width,texture.height);
    for(const p of group)cut.data.set(before.subarray(p.i,p.i+4),((p.y-y)*texture.width+p.x-x)*4);g.putImageData(cut,0,0);
    return {texture,x:(x+texture.width/2)/w-.5,y:(y+texture.height/2)/h-.5,w:texture.width/w,h:texture.height/h};
   });
  });
 }
 async function load(id){
  if(assets.has(id))return assets.get(id);if(loading.has(id))return loading.get(id);
  const task=(async()=>{
   await catalogReady;const ship=catalog.ships.find(s=>s.id===id),effects=effectsFor(id);if(!ship||!effects)return null;
   const starter=window.starterShips.get(id);let images=await Promise.all(ship.frames.map(image));
   images=images.map((im,s)=>starter?starter.align(im,s):id===57?window.alignTugFrame(im,s):id===58?window.alignOlympicFrame(im,s):im);
   images[3]=effects.unlitFrame(images[3]);
   // Yield between classes; preparation must not monopolize the game's loading animation.
   await new Promise(resolve=>setTimeout(resolve,0));
   const destruction=window.createShipDestruction(),config=window.earthFractureConfigs.get(id)||starter?.destruction||({56:window.constitutionTugDestructionConfig,57:window.tugDestructionConfig,58:window.olympicDestructionConfig})[id]||{};
   destruction.prepare(images,config);
   const anchors=starter?.breakAnchors||config.sites?.map(p=>p.slice(1))||[[181,100],[78,209],[285,209],[181,362]];
   const asset={ship,effects,images,destruction,fragments:fragments(images,anchors)};assets.set(id,asset);return asset;
  })().catch(error=>{failures.push({id,error:String(error)});console.error(error);loading.delete(id);return null;});loading.set(id,task);return task;
 }
 const catalogReady=fetch('showcase-assets/catalog.json?v=ship-remasters-2').then(r=>{if(!r.ok)throw Error('Ship effect catalog unavailable');return r.json();}).then(data=>catalog=data);
 window.vexShipVisualLoading={done:0,total:66};
 window.vexShipVisualAssetsReady=catalogReady.then(async()=>{
  // Load every available animation before the opening screen reveals gameplay.
  const ids=catalog.ships.filter(s=>effectsFor(s.id)).map(s=>s.id);let next=0;
  window.vexShipVisualLoading.total=catalog.ships.length;
  await Promise.all(Array.from({length:2},async()=>{while(next<ids.length){if(await load(ids[next++]))window.vexShipVisualLoading.done++;}}));
  await Promise.all(catalog.ships.filter(s=>!assets.has(s.id)).map(async ship=>{
   const im=await image(ship.original);shieldAssets.set(ship.id,{ship,images:[im,im,im,im]});window.vexShipVisualLoading.done++;
  }));
  return assets.size;
 });
 function validShip(s){
  const b=s?.bounds;
  return !!b&&[s.ox,s.oy,s.ax,s.ay,s.bx,s.by,b.xMin,b.xMax,b.yMin,b.yMax].every(Number.isFinite)&&b.xMax>b.xMin&&b.yMax>b.yMin;
 }
 function geometry(s){
  const b=s.bounds,cx=(b.xMin+b.xMax)/2,cy=(b.yMin+b.yMax)/2;
  return {x:s.ox+cx*s.ax+cy*s.bx,y:s.oy+cx*s.ay+cy*s.by,w:(b.xMax-b.xMin)*Math.hypot(s.ax,s.ay),h:(b.yMax-b.yMin)*Math.hypot(s.bx,s.by),a:Math.atan2(s.ay,s.ax)};
 }
 // Setup and flight share the same aligned hull and animated lamp masks.
 window.vexDrawShipPreview=(canvas,type,time)=>{
  const asset=assets.get(Number(type));if(!asset)return false;
  const g=canvas.getContext('2d'),im=asset.images[0],fit=Math.min(canvas.width*.72/im.width,canvas.height*.85/im.height)*(sizeFactors[type]||1);
  const l={x:canvas.width/2,y:canvas.height/2,w:im.width*fit,h:im.height*fit};
  g.clearRect(0,0,canvas.width,canvas.height);g.drawImage(im,l.x-l.w/2,l.y-l.h/2,l.w,l.h);
  asset.effects.draw(g,l,0,0,time,{...lightOptions(type),damage:false});return true;
 };
 function world(l,p){const x=p.x*l.w,y=p.y*l.h,c=Math.cos(l.a),s=Math.sin(l.a);return {x:l.x+x*c-y*s,y:l.y+x*s+y*c};}
 // Cache transparent lamp/damage layers at their displayed resolution. Ships of
 // the same class share one animated layer instead of repeating Canvas filters.
 function drawEffects(asset,l,stage){
  const pixels=Math.max(l.w,l.h)*canvas.width/600/camera.zoom;
  const size=Math.min(384,Math.max(64,Math.ceil(pixels/32)*32));
  const key=stage+':'+size,step=Math.floor(state.time/67);
  const caches=asset.effectLayers||(asset.effectLayers=new Map());
  let layer=caches.get(key);
  if(!layer){
   const scale=size/Math.max(l.w,l.h),w=l.w*scale,h=l.h*scale,pad=16;
   const texture=document.createElement('canvas');texture.width=Math.ceil(w+pad*2);texture.height=Math.ceil(h+pad*2);
   layer={texture,g:texture.getContext('2d'),w,h,pad,step:-1};
   // Bound cache memory if zoom changes repeatedly.
   if(caches.size>=8)caches.delete(caches.keys().next().value);
   caches.set(key,layer);
  }
  if(layer.step!==step){
   const {g,texture,w,h,pad}=layer;g.clearRect(0,0,texture.width,texture.height);
   asset.effects.draw(g,{x:pad+w/2,y:pad+h/2,w,h},0,stage,state.time,lightOptions(asset.ship.id));layer.step=step;
  }
  const scale=l.w/layer.w;
  ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.a);
  ctx.drawImage(layer.texture,(-layer.w/2-layer.pad)*scale,(-layer.h/2-layer.pad)*scale,layer.texture.width*scale,layer.texture.height*scale);ctx.restore();
 }
 function burst(p,zoom=1){for(let i=0;i<12;i++){const a=Math.random()*Math.PI*2,v=(35+Math.random()*75)*zoom;state.particles.push({...p,vx:Math.cos(a)*v,vy:Math.sin(a)*v,size:.7*zoom,born:state.time,ttl:350+Math.random()*200,realistic:'spark'});}}
 function shed(s,before,after){
  const asset=assets.get(s.type);if(!asset||after<=before)return;const l=geometry(s),zoom=Math.max(l.w/235,l.h/235);
  for(let stage=before+1;stage<=after;stage++)for(const piece of asset.fragments[stage]){
   const p=world(l,piece),a=Math.atan2(p.y-l.y,p.x-l.x),speed=(55+stage*18)*zoom;
   state.debris.push({...piece,...p,w:piece.w*l.w,h:piece.h*l.h,vx:Math.cos(a)*speed+s.vx,vy:Math.sin(a)*speed+s.vy,angle:l.a,spin:(piece.x<0?-1:1)*1.4,born:state.time,ttl:4200,cthia:true,farTravel:true,owner:s.key});burst(p,zoom);
  }
 }
 function clear(){live.clear();dead.clear();state.debris=[];state.particles=[];state.cthiaBlast=null;ctx.clearRect(0,0,canvas.width,canvas.height);canvas.style.display='none';}
 window.vexShipVisualUpdate=(ships,x,y,zoom,newSystem)=>{
  if(system!==newSystem){clear();system=newSystem;}camera={x:Number(x),y:Number(y),zoom:Math.max(.1,Number(zoom))};
  const painted={},present=new Set();
  for(const ship of ships||[]){
   // Reincarnation can publish between attaching the ship and its class artwork.
   // Wait for complete transforms instead of killing the animation loop.
   if(!validShip(ship))continue;
   present.add(ship.key);const asset=assets.get(ship.type)||shieldAssets.get(ship.type);if(!asset){load(ship.type);live.delete(ship.key);continue;}
   const old=live.get(ship.key);ship.stage=Math.max(0,Math.min(3,ship.stage));
   if(old&&old.type===ship.type){ship.flash=old.flash;if(ship.stage>old.stage)shed(ship,old.stage,ship.stage);}
   if(old&&ship.stage<old.stage)state.debris=state.debris.filter(p=>p.owner!==ship.key||p.wreck);
   live.set(ship.key,ship);if(asset.effects&&ship.visible&&!dead.has(ship.key))painted[ship.key]=true;
  }
  for(const key of live.keys())if(!present.has(key)){live.delete(key);dead.delete(key);}
  canvas.style.display='block';if(!raf){last=performance.now();raf=requestAnimationFrame(tick);}return painted;
 };
 window.vexShipVisualDestroy=ship=>{
  if(!validShip(ship))return false;
  const asset=assets.get(ship.type);if(!asset)return false;if(dead.has(ship.key))return true;
  const old=live.get(ship.key);if(old&&old.type===ship.type)ship.stage=old.stage;
  const l=geometry(ship),zoom=Math.max(l.w,l.h)/235;state.angle=l.a;
  const start=state.debris.length;asset.destruction.emit(state,l,p=>world(l,p),Math.max(0,Math.min(3,ship.stage)),zoom);
  for(const p of state.debris.slice(start)){p.vx+=ship.vx||0;p.vy+=ship.vy||0;p.owner=ship.key;}
  dead.add(ship.key);live.delete(ship.key);destructions++;return true;
 };
 window.vexShipVisualHit=(ship,shielded,x,y)=>{
  if(!validShip(ship))return false;
  const asset=assets.get(ship.type)||shieldAssets.get(ship.type);if(!asset)return false;
  let target=live.get(ship.key);if(!target){target={...ship};live.set(ship.key,target);}
  hits++;
  if(shielded){const l=geometry(ship),point=Number.isFinite(x)&&Number.isFinite(y)?{x:(x-camera.x)*camera.zoom,y:(y-camera.y)*camera.zoom}:null,dx=point?point.x-l.x:0,dy=point?point.y-l.y:0,c=Math.cos(l.a),s=Math.sin(l.a);target.flash={born:performance.now(),color:shieldColor(asset.ship),x:dx*c+dy*s,y:-dx*s+dy*c,charge:Math.max(0,Math.min(1,(ship.shields??100)/100))};window.vexRebirthExplosionSound?.('shieldhit',.12);}
  else {
   const l=geometry(ship),point=Number.isFinite(x)&&Number.isFinite(y)?{x:(x-camera.x)*camera.zoom,y:(y-camera.y)*camera.zoom}:l;
   window.vexRebirthExplosion?.([{...point,strength:1,sparksOnly:false,delay:0}],catalog.units*.8);
  }return true;
 };
 function shieldColor(ship){return ({green:'#50ff78',yellow:'#ffd95a',purple:'#b465ff'})[ship.shieldColor]||'#50d5ff';}
 function collide(p,oldX,oldY){
  if(!p.farTravel||state.time-p.born<100)return;
  for(const s of live.values()){
   if(!s.visible||s.key===p.owner||p.lastImpact===s.key)continue;
   const l=geometry(s),radius=Math.hypot(l.w,l.h)/2;if(Math.hypot(p.x-l.x,p.y-l.y)>radius+Math.hypot(p.x-oldX,p.y-oldY))continue;
   const asset=assets.get(s.type)||shieldAssets.get(s.type),im=asset.images[s.stage];
   if(!p.collider)p.collider=window.createDebrisImpacts();p.collider.setShields(s.shields>0);p.impactDone=false;
   const result=p.collider.step(p,oldX,oldY,{centerX:l.x,centerY:l.y,w:l.w,h:l.h,a:l.a},im,state);
   if(result){p.lastImpact=s.key;impacts++;if(s.shields>0){const dx=result.x-l.x,dy=result.y-l.y,c=Math.cos(l.a),sin=Math.sin(l.a);s.flash={born:performance.now(),color:shieldColor(asset.ship),x:dx*c+dy*sin,y:-dx*sin+dy*c,kind:'debris',charge:Math.max(0,Math.min(1,s.shields/100))};window.vexRebirthExplosionSound?.('shieldhit',.2);}return;}
  }
 }
 function tick(now){
  raf=0;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;state.time+=dt*1000;frames++;
  for(const p of state.particles){if(state.time<p.born)continue;p.x+=p.vx*dt;p.y+=p.vy*dt;const drag=Math.max(0,1-(p.realistic==='smoke'?.6:2.8)*dt);p.vx*=drag;p.vy*=drag;}
  state.particles=state.particles.filter(p=>state.time-p.born<p.ttl);
  for(const p of state.debris){const oldX=p.x,oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;collide(p,oldX,oldY);const drag=Math.max(0,1-(p.farTravel?.055:p.structural?(p.small?.35:.65):.2)*dt);p.vx*=drag;p.vy*=drag;p.angle+=p.spin*dt;}
  state.debris=state.debris.filter(p=>state.time-p.born<p.ttl);window.cthiaDestruction.updateTrails(state);
  // Bound presentation memory during large battles.
  if(state.debris.length>1200)state.debris.splice(0,state.debris.length-1200);
  if(state.particles.length>16000)state.particles.splice(0,state.particles.length-16000);
  draw();if(live.size||state.debris.length||state.particles.length)raf=requestAnimationFrame(tick);
 }
 function draw(){
  ctx.setTransform(canvas.width/600,0,0,canvas.height/450,0,0);ctx.clearRect(0,0,600,450);ctx.save();ctx.beginPath();ctx.rect(0,42,600,360);ctx.clip();ctx.translate(camera.x,camera.y);ctx.scale(1/camera.zoom,1/camera.zoom);
  for(const s of live.values()){
   if(!s.visible||dead.has(s.key))continue;const asset=assets.get(s.type)||shieldAssets.get(s.type),l=geometry(s),im=asset.images[s.stage];
   const sx=camera.x+l.x/camera.zoom,sy=camera.y+l.y/camera.zoom,r=Math.hypot(l.w,l.h)/camera.zoom/2+25;
   if(sx+r<0||sx-r>600||sy+r<42||sy-r>402)continue;
   ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.a);
   const shieldCharge=s.shields>0?Math.max(.08,Math.min(1,s.shields/(s.maxShields||s.totshields||s.shields))):0;
   if(s.flash)window.drawShowcaseShieldSurface(ctx,0,0,l.w,l.h,shieldColor(asset.ship),Math.max(.08,shieldCharge),now,{impact:s.flash});
   if(asset.effects)ctx.drawImage(im,-l.w/2,-l.h/2,l.w,l.h);
   if(s.flash)window.drawShowcaseShieldSurface(ctx,0,0,l.w,l.h,shieldColor(asset.ship),Math.max(.08,shieldCharge),now,{front:true,impact:s.flash});
   if(s.flash){const now=performance.now();window.drawShowcaseShieldFlash(ctx,im,l.w,l.h,s.flash,now);if(now-s.flash.born>=620)s.flash=null;}ctx.restore();
   if(asset.effects)drawEffects(asset,l,s.stage);
  }
  for(const p of state.debris){const fade=(state.time-p.born)/p.ttl;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=fade<.65?1:Math.max(0,(1-fade)/.35);if(p.structural)window.cthiaDestruction.drawStructuralWreck(ctx,p,state.time);else{ctx.drawImage(p.texture,-p.w/2,-p.h/2,p.w,p.h);if(p.wreck)window.cthiaDestruction.drawWreckGlow(ctx,p,state.time);}ctx.restore();}
  for(const p of state.particles)window.cthiaDestruction.drawParticle(ctx,p,state.time);ctx.restore();
 }
 function resize(){const r=game.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(r.width*scale);canvas.height=Math.round(r.height*scale);draw();}new ResizeObserver(resize).observe(game);
 new MutationObserver(()=>{const frame=Number(game.dataset.frame);if(frame!==154&&(frame<157||frame>182)){clear();if(raf)cancelAnimationFrame(raf);raf=0;}}).observe(game,{attributes:true,attributeFilter:['data-frame']});
 window.vexShipVisualState=()=>({loaded:assets.size,shieldLoaded:assets.size+shieldAssets.size,failures,frames,destructions,hits,impacts,ships:[...live.values()].map(s=>({key:s.key,type:s.type,own:s.own,sizeFactor:s.sizeFactor||1,stage:s.stage,visible:s.visible,layout:geometry(s),flash:s.flash?{color:s.flash.color,age:performance.now()-s.flash.born}:null,effects:assets.get(s.type)?.effects.snapshot(s.stage,state.time,options)})),debris:state.debris.length,particles:state.particles.length,system,camera,audits:[...assets].map(([type,a])=>({type,stages:a.destruction.audit()}))});
})();
