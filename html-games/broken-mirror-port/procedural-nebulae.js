/* Seeded interstellar weather. Chart positions and saved simulation time own it. */
(() => {
  'use strict';
  const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const units=()=>window.nativeManualFlight?.unitsPerChartPoint||1000;
  const records=new Map((window.VexedMirrorWorld?.systems||[]).map(row=>[row.id,row]));
  const chart=id=>window.nativeManualFlight?.chartPosition(id)||records.get(Number(id))?.mapPosition;
  const freeze=p=>Object.freeze({source:'procedural-gas',permanent:true,activity:.7,angle:0,seed:19.813,...p});
  const badlands=chart(73);
  const places=Object.freeze([
    badlands&&freeze({id:'badlands-plasma',name:'Badlands plasma storms',system:73,basis:'television-plasma-region',x:badlands.x,y:badlands.y,rx:window.nativeBadlands?.fog.rx||94,ry:window.nativeBadlands?.fog.ry||74,opacity:.85,width:2500,aspect:.78,style:3,angle:-.1,activity:1.7,seed:53.363}),
    freeze({id:'azure-nebula',name:'Azure Nebula',basis:'adapted-trek-geography',x:13,y:11,rx:12,ry:9,opacity:.64,width:1400,aspect:.78,style:4,angle:.22,seed:31.17}),
    freeze({id:'tibor-nebula',name:'Tibor Nebula',basis:'adapted-trek-geography',x:-121,y:104,rx:9,ry:7,opacity:.37,width:1260,aspect:.74,style:5,angle:-.37,activity:.4,seed:42.71}),
    freeze({id:'bassen-rift',name:'Bassen Rift',basis:'adapted-trek-geography',x:-85,y:210,rx:12,ry:8,opacity:.56,width:1420,aspect:.66,style:2,angle:-.48,seed:56.09})
  ].filter(Boolean));
  // The former lower-right cloud footprints stay clear of future storms too.
  const exclusions=Object.freeze([[32,36,33],[33,35,31],[34,53,45]].map(([system,rx,ry])=>Object.freeze({system,...chart(system),rx,ry})));
  const layers=Object.freeze([
    Object.freeze({rate:.004,scale:1.12,alpha:.69,turn:0}),
    Object.freeze({rate:.007,scale:.84,alpha:.23,turn:.13}),
    Object.freeze({rate:.011,scale:.64,alpha:.12,turn:-.18})
  ]);
  const hash=(x,y,k=0)=>{let n=(Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(k+911,1274126177))>>>0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  const cell=48,period=900,stormStyles=Object.freeze([4,2,1,6,7]);
  const plumeInterval=18,plumeLifetime=216;
  let savedSeconds=null,boundaryOwner=null,boundaryRows=[],lastQuery={candidates:0,systems:0};
  function frame(state){savedSeconds=Math.max(0,Number(state?.shipSimulation?.seconds)||0);}
  function point(system,view={},camera=false){
    const origin=chart(system)||{x:0,y:0},scale=units();
    const x=Number(camera?view.cameraX??view.playerX:view.playerX??view.cameraX)||0;
    const y=Number(camera?view.cameraY??view.playerY:view.playerY??view.cameraY)||0;
    return {x:origin.x+x/scale,y:origin.y+y/scale};
  }
  function distance(place,location){return Math.hypot((location.x-place.x)/place.rx,(location.y-place.y)/place.ry);}
  function excluded(location){let fade=1;for(const zone of exclusions)fade=Math.min(fade,smooth((distance(zone,location)-1)/.15));return fade;}
  function boundaries(){
    const owner=window.nativeSystemCatalog||window.nativeManualFlight;
    if(owner!==boundaryOwner){
      boundaryOwner=owner;const earth=chart(1)||{x:0,y:0},scale=units();
      boundaryRows=(window.nativeManualFlight?.boundaries?.()||[]).map(b=>({id:b.id,x:earth.x+b.x/scale,y:earth.y+b.y/scale,rx:b.rx/scale,ry:b.ry/scale}));
    }return boundaryRows;
  }
  function systemClearance(location,allowSystem=null){
    let fade=1;
    for(const b of boundaries()){
      if(b.id===allowSystem)continue;
      if(Math.abs(b.x-location.x)>b.rx*1.32||Math.abs(b.y-location.y)>b.ry*1.32)continue;
      fade=Math.min(fade,smooth((distance(b,location)-1)/.32));if(!fade)break;
    }return fade;
  }
  function coverage(place,location){
    const support=smooth((1-distance(place,location))/.38)*(place.life??1);if(!support)return 0;
    const approach=window.nativeBadlands?.approach(location.x,location.y);
    const envelope=approach?(place.id==='badlands-plasma'?approach.plasma:place.id.startsWith('badlands-plume:')?approach.wisps:approach.otherWeather):1;
    if(!envelope)return 0;
    const clear=excluded(location);return clear?support*envelope*clear*systemClearance(location,place.system===73?73:place.allowSystem):0;
  }
  function storm(x,y,epoch,seconds){
    if(x< -7||x>5||y< -4||y>6)return null;
    const phase=hash(x,y,1)*period,born=epoch*period+phase,age=(seconds-born)/period;
    if(age<0||age>=1)return null;
    const life=smooth(age/.20)*smooth((1-age)/.28);if(!life)return null;
    const seed=hash(x,y,epoch+5),direction=hash(x,y,epoch+7)*Math.PI*2;
    const travel=(age-.5)*(9+hash(x,y,epoch+11)*8),driftX=Math.cos(direction)*travel,driftY=Math.sin(direction)*travel;
    const breathing=.80+.20*Math.sin(age*Math.PI),rx=(9+hash(x,y,epoch+13)*6)*breathing,ry=(6+hash(x,y,epoch+17)*5)*breathing;
    const cx=(x+.25+hash(x,y,epoch+19)*.5)*cell+driftX,cy=(y+.25+hash(x,y,epoch+23)*.5)*cell+driftY;
    const incursion=hash(x,y,epoch+29)>.97,allowSystem=incursion?boundaries().find(b=>distance({...b,rx:b.rx+rx,ry:b.ry+ry},{x:cx,y:cy})<1)?.id:null;
    return {id:'storm:'+x+':'+y+':'+epoch,name:'Interstellar gas storm',basis:'game-weather',permanent:false,source:'procedural-gas',
      x:cx,y:cy,rx,ry,opacity:.36+seed*.32,width:1200+seed*260,aspect:.65+seed*.18,style:stormStyles[Math.floor(hash(x,y,epoch+31)*stormStyles.length)],
      angle:direction*.2+Math.sin(age*Math.PI)*.09,activity:.45+seed*.65,seed:seed*101+7,life,age,born,ends:born+period,allowSystem};
  }
  function candidates(location,seconds=0){
    const result=[...places],cx=Math.floor(location.x/cell),cy=Math.floor(location.y/cell);
    if(badlands&&Math.hypot((location.x-badlands.x)/150,(location.y-badlands.y)/125)<1.2){
      const latest=Math.floor(seconds/plumeInterval);
      for(let n=Math.max(0,latest-Math.ceil(plumeLifetime/plumeInterval));n<=latest;n++){const p=plume(n,seconds);if(p)result.push(p);}
    }
    for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++){
      const epoch=Math.floor((seconds-hash(x,y,1)*period)/period),p=storm(x,y,epoch,seconds);if(p)result.push(p);
    }
    lastQuery={candidates:result.length,systems:boundaryRows.length};return result;
  }
  function nearby(system,view={},seconds=0){
    const location=point(system,view);if(!excluded(location)){lastQuery={candidates:0,systems:boundaryRows.length};return [];}
    return candidates(location,view.reducedMotion?0:seconds).filter(p=>coverage(p,location)>0);
  }
  function projection(place,layer,system,view){
    const location=point(system,view),camera=point(system,view,true),scale=Math.max(.75,Math.min(1.35,Math.max(view.w/1200,view.h/900)));
    const width=place.width*layer.scale*scale;
    return {id:place.id,source:'procedural-gas',basis:place.basis,
      x:view.w/2+(place.x-camera.x)*units()*layer.rate,y:view.h/2+(place.y-camera.y)*units()*layer.rate,
      width,height:width*place.aspect,angle:place.angle+layer.turn,alpha:place.opacity*layer.alpha*coverage(place,location),rate:layer.rate};
  }
  function sample(system,view={},seconds=0){
    const location=point(system,view),regions=nearby(system,view,seconds);let density=0;
    for(const p of regions)density=1-(1-density)*(1-coverage(p,location)*p.opacity);
    return {location,regions,density};
  }
  function resolve(id,seconds){
    const fixed=places.find(p=>p.id===id);if(fixed)return fixed;
    const parts=id.split(':');return parts[0]==='badlands-plume'?plume(Number(parts[1]),seconds):parts[0]==='storm'?storm(Number(parts[1]),Number(parts[2]),Number(parts[3]),seconds):null;
  }
  function plume(index,seconds){
    if(!badlands||!Number.isInteger(index)||index<0)return null;
    const born=index*plumeInterval,age=(seconds-born)/plumeLifetime;if(age<0||age>=1)return null;
    const direction=index*2.399963229728653+hash(index,73,3)*.4,seed=hash(index,73,7),spread=window.nativeBadlands?.fringeWidth(direction)??1,progress=.94+age*.50;
    const travel=progress<=1?progress:1+(progress-1)*spread;
    const life=smooth(age/.08)*smooth((1-age)/.3);
    return {id:'badlands-plume:'+index,name:'Badlands plasma outflow',basis:'game-weather',source:'procedural-gas',system:73,permanent:false,
      x:badlands.x+Math.cos(direction)*64*travel,y:badlands.y+Math.sin(direction)*48*travel,
      rx:(7+seed*4+age*4)*spread,ry:(5+seed*3+age*3)*spread,opacity:.34+seed*.14,width:900+seed*350,aspect:.7,style:[1,4,2,6,7][index%5],
      angle:direction,activity:1.9,seed:seed*100+73,life,age,born,ends:born+plumeLifetime};
  }
  function volume(place,ix,iy,system,view){
    const continuous=place.id==='badlands-plasma',core={x:ix*(continuous?2:4.096),y:iy*(continuous?1.4:3.072)},seed=place.seed+ix*11.17+iy*19.31;
    const origin=chart(system)||{x:0,y:0},strength=coverage(place,{x:place.x+core.x,y:place.y+core.y});
    if(continuous){const nearX=Math.max(core.x-1.08,Math.min(0,core.x+1.08)),nearY=Math.max(core.y-.78,Math.min(0,core.y+.78));if(Math.hypot(nearX/64,nearY/48)>1.09)return null;}
    else if(!strength)return null;
    return {id:place.id+':core:'+ix+':'+iy,placeId:place.id,ix,iy,seed,
      origin:{x:(place.x+core.x-origin.x)*units(),y:(place.y+core.y-origin.y)*units()},
      patch:{x:0,y:0,width:2000,height:1400,angle:continuous?0:Math.sin(seed)*.16},continuous,
      ...(continuous?{seed:place.seed,feather:64,continuousAnchor:{x:-core.x*units(),y:-core.y*units()},badlandsOptics:{...window.nativeBadlands?.opticalProfile,x:-core.x*units(),y:-core.y*units()}}:{}),
      profile:{style:place.style,opacity:place.opacity*(continuous?1:strength),front:continuous?.28:.28*strength,densityFloor:continuous?.28:.18,activity:continuous?.13:.075},
      permanent:place.permanent,life:place.life??1};
  }
  function volumes(system,view={},seconds=0){
    const pointView={...view,playerX:view.ship?.x??view.playerX,playerY:view.ship?.y??view.playerY},location=point(system,pointView),result=[];
    const zoom=view.zoom||1,origin=chart(system)||{x:0,y:0},camera=point(system,view,true),pad=256;
    const halfX=((view.w||1200)/zoom/2+pad)/units(),halfY=((view.h||800)/zoom/2+pad)/units();
    const near=candidates(location,view.reducedMotion?0:seconds).filter(p=>{
      if(p.id==='badlands-plasma'){const x=Math.max(camera.x-halfX,Math.min(p.x,camera.x+halfX))-p.x,y=Math.max(camera.y-halfY,Math.min(p.y,camera.y+halfY))-p.y;return Math.hypot(x/64,y/48)<=1.09;}
      return coverage(p,location)>0||p.id.startsWith('badlands-plume:')&&coverage(p,{x:Math.max(camera.x-halfX,Math.min(p.x,camera.x+halfX)),y:Math.max(camera.y-halfY,Math.min(p.y,camera.y+halfY))})>0;
    });
    for(const place of near){
      // The continuous base owns overlapping interior plasma. Beyond that
      // fringe, outflows gain their own ordinary interactive material cores.
      if(place.id.startsWith('badlands-plume:')&&coverage(places[0],location)>.02)continue;
      const continuous=place.id==='badlands-plasma',pitchX=continuous?2:4.096,pitchY=continuous?1.4:3.072;
      const ix=Math.round((location.x-place.x)/pitchX),iy=Math.round((location.y-place.y)/pitchY);
      const nx=Math.ceil((view.w||1200)/zoom/2/(pitchX*units()))+1,ny=Math.ceil((view.h||800)/zoom/2/(pitchY*units()))+1;
      for(let y=iy-ny;y<=iy+ny;y++)for(let x=ix-nx;x<=ix+nx;x++){
        const item=volume(place,x,y,system,pointView);if(!item)continue;
        const c=Math.abs(Math.cos(item.patch.angle)),s=Math.abs(Math.sin(item.patch.angle)),rx=1000*c+700*s+80,ry=700*c+1000*s+80;
        if(Math.abs(item.origin.x-(view.cameraX||0))<(view.w||1200)/zoom/2+rx+pad&&Math.abs(item.origin.y-(view.cameraY||0))<(view.h||800)/zoom/2+ry+pad)result.push(item);
      }
    }return result.sort((a,b)=>Math.hypot(a.origin.x-(view.ship?.x??view.playerX??view.cameraX??0),a.origin.y-(view.ship?.y??view.playerY??view.cameraY??0))-Math.hypot(b.origin.x-(view.ship?.x??view.playerX??view.cameraX??0),b.origin.y-(view.ship?.y??view.playerY??view.cameraY??0)));
  }
  function refreshVolume(item,system,view,seconds){const place=resolve(item.placeId,seconds);return place&&volume(place,item.ix,item.iy,system,{...view,playerX:view.ship?.x??view.playerX,playerY:view.ship?.y??view.playerY});}
  async function prepare(system,{signal}={}){
    const check=()=>{if(signal?.aborted)throw Error('Nebula preparation cancelled.');};check();
    const regions=nearby(system,{},savedSeconds||0);if(regions.length)window.nativeNebulaGas?.prepare();check();
    return {regions:regions.length,imageRequests:0};
  }
  function create(){
    let elapsed=0,last={draws:0,visible:[],layers:[],loadedImages:0,imageRequests:0,procedural:true};
    function rebase(state){elapsed+=Number(state.elapsed)||0;}
    function render(ctx,view,state){
      const projections=[],visible=[];let draws=0;const gas=window.nativeNebulaGas,time=Number.isFinite(view.weatherSeconds)?view.weatherSeconds:savedSeconds??elapsed+(Number(state.elapsed)||0);
      const holes=view.parallaxHoles??window.nativeGalaxyFog?.parallaxHoles?.(view)??[];
      const covered=holes.filter(p=>p.continuous).reduce((area,p)=>area+Math.max(0,Math.min(view.w,p.x+p.width/2)-Math.max(0,p.x-p.width/2))*Math.max(0,Math.min(view.h,p.y+p.height/2)-Math.max(0,p.y-p.height/2)),0)>=view.w*view.h-.01;
      // A full physical plasma view already paints both gas layers. Avoid a
      // duplicate background pass and low-resolution hole edges between tiles.
      for(const place of nearby(state.system,view,time)){
        if(covered&&place.id==='badlands-plasma')continue;
        const planes=layers.map(layer=>projection(place,layer,state.system,view));
        if(!planes.some(plane=>{const bound=Math.hypot(plane.width,plane.height)/2;return plane.alpha>.0001&&plane.x+bound>0&&plane.x-bound<view.w&&plane.y+bound>0&&plane.y-bound<view.h;}))continue;
        if(!gas)continue;
        const flowTime=view.reducedMotion?0:time*.12*place.activity,image=gas.render(view,planes,place.style,flowTime,place.seed,{clearVolumes:holes.filter(p=>!p.placeId||p.placeId===place.id).map(p=>p.continuous?{...p,width:p.width+24,height:p.height+24}:p)});
        ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;ctx.drawImage(image,0,0,view.w,view.h);ctx.restore();
        projections.push(...planes);visible.push(place.id);draws++;
      }
      const backend=gas?.metrics()||{};
      last={draws,visible,layers:projections,loadedImages:0,imageRequests:0,procedural:true,elapsed:time,
        backend:backend.backend||'uninitialized',fieldWidth:backend.width||0,fieldHeight:backend.height||0,
        surfaceBytes:(backend.width||0)*(backend.height||0)*4,fieldRenders:backend.renders||0,
        cacheHits:backend.cacheHits||0,compiles:backend.compiles||0,contextLosses:backend.contextLosses||0,
        failures:backend.failures||0,software:!!backend.software,query:{...lastQuery}};
    }
    return Object.freeze({prepare,render,rebase,metrics:()=>({...last,visible:[...last.visible],layers:last.layers.map(layer=>({...layer}))})});
  }
  window.nativeParallaxNebulae=Object.freeze({create,prepare,places,layers,exclusions,frame,point,coverage,nearby,projection,sample,storm,candidates,excluded,systemClearance,volumes,refreshVolume,
    plume,weather:Object.freeze({cell,period,styles:stormStyles,plumeInterval,plumeLifetime}),metrics:()=>({...lastQuery,seconds:savedSeconds})});
})();
