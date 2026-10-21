/* Shared, decoded assets for flight and cinematic travel. */
(() => {
  'use strict';
  const imageCache = new Map(), shipCache = new Map(), shipReferences = new Map(), imagePending = new Map(), shipPending = new Map(), planetCache = new Map(), localBodyCache = new Map();
  const cacheLimits={sourceBytes:32*1024*1024,sourceEntries:48,shipBytes:24*1024*1024,shipEntries:24,
    visibleShipBytes:128*1024*1024,visibleShipEntries:256};
  const cacheMetrics={imageHits:0,imageMisses:0,shipHits:0,shipMisses:0,imageEvictions:0,shipEvictions:0};
  const preparation={imageLoads:0,imageLoadMs:0,imageDecodeMs:0,ships:0,catalogMs:0,alignmentMs:0,effectsMs:0,unlitMs:0,wallMs:0},recentPreparation=[];
  const imageTimings=new WeakMap(),clock=()=>globalThis.performance?.now?.()??Date.now();
  let imageBytes=0,shipBytes=0,renderEpoch=0;
  let catalogPromise, warpRing;
  const shipSizes=new Map(window.VexedFlightReference.shipSizes.map(ship=>[ship.id,ship]));
  function flightDimensions(shipSize,zoom){
    const shared=window.nativeShipDefinitions?.presentation(shipSize?.id);
    if(shared)return shared;
    const originalMax=Math.max(shipSize.playerWidth,shipSize.playerHeight);
    const displayMax=originalMax<=100?originalMax:100+40*(1-Math.exp(-(originalMax-100)/90));
    const screenMax=Math.min(displayMax*Math.min(zoom,1.35),180);
    const scale=screenMax/(originalMax*zoom);
    return {width:shipSize.playerWidth*scale,height:shipSize.playerHeight*scale};
  }
  const catalog = () => catalogPromise ||= fetch('../flashtrek-broken-mirror/showcase-assets/catalog.json')
    .then(response => { if (!response.ok) throw new Error('Ship catalog unavailable'); return response.json(); })
    .catch(error => { catalogPromise = null; throw error; });

  function image(url) {
    const cached=imageCache.get(url);
    if(cached){imageCache.delete(url);imageCache.set(url,cached);cacheMetrics.imageHits++;return Promise.resolve(cached.art);}
    if(imagePending.has(url))return imagePending.get(url);
    cacheMetrics.imageMisses++;
    const pending = new Promise((resolve, reject) => {
        const art = new Image();
        const started=clock();
        const timer = setTimeout(() => reject(new Error('Artwork loading timed out')), 15000);
        art.onload = () => {
          const loaded=clock();
          art.decode().then(() => {const decoded=clock(),timing={loadMs:loaded-started,decodeMs:decoded-loaded};
            preparation.imageLoads++;preparation.imageLoadMs+=timing.loadMs;preparation.imageDecodeMs+=timing.decodeMs;imageTimings.set(art,timing);
            clearTimeout(timer);resolve(art);
          },error=>{clearTimeout(timer);reject(error);});
        };
        art.onerror = () => { clearTimeout(timer); reject(new Error('Artwork unavailable')); };
        art.src = url;
      }).then(art=>{
        const bytes=(art.width||art.naturalWidth)*(art.height||art.naturalHeight)*4;
        if(bytes<=cacheLimits.sourceBytes){
          while(imageCache.size>=cacheLimits.sourceEntries||imageBytes+bytes>cacheLimits.sourceBytes){
            const oldest=imageCache.keys().next().value;imageBytes-=imageCache.get(oldest).bytes;imageCache.delete(oldest);cacheMetrics.imageEvictions++;
          }
          imageCache.set(url,{art,bytes});imageBytes+=bytes;
        }
        return art;
      }).finally(()=>imagePending.delete(url));
    imagePending.set(url,pending);return pending;
  }

  const shipKey=(type,stage)=>Number(type)+':'+stage;
  const visible=entry=>entry.lastVisibleEpoch>=renderEpoch-1;
  function trimShips(){
    // Ordinary warm retention stays small. Appearances actually painted in
    // either of the last two frames share a larger, hard-bounded working set;
    // optional destruction/stage preparation cannot evict visible ships.
    for(const [key,entry]of shipCache){
      if(shipCache.size<=cacheLimits.shipEntries&&shipBytes<=cacheLimits.shipBytes)break;
      if(visible(entry))continue;
      shipCache.delete(key);shipBytes-=entry.bytes;cacheMetrics.shipEvictions++;
    }
    while(shipCache.size>cacheLimits.visibleShipEntries||shipBytes>cacheLimits.visibleShipBytes){
      const oldest=shipCache.keys().next().value,entry=shipCache.get(oldest);
      shipCache.delete(oldest);shipBytes-=entry.bytes;cacheMetrics.shipEvictions++;
    }
  }
  function retainShip(asset,{markVisible=false}={}){
    if(!asset?.art||!Number.isFinite(asset.type)||!Number.isInteger(asset.damageStage))return asset;
    const key=shipKey(asset.type,asset.damageStage),previous=shipCache.get(key),bytes=asset.width*asset.height*4;
    if(bytes>cacheLimits.visibleShipBytes)return asset;
    if(previous?.asset===asset){
      if(markVisible)previous.lastVisibleEpoch=renderEpoch;
      shipCache.delete(key);shipCache.set(key,previous);return asset;
    }
    if(previous)shipBytes-=previous.bytes;
    shipCache.delete(key);shipCache.set(key,{asset,bytes,lastVisibleEpoch:markVisible?renderEpoch:(previous?.lastVisibleEpoch??-Infinity)});shipBytes+=bytes;
    trimShips();return asset;
  }
  function beginRenderFrame(){renderEpoch++;trimShips();}
  function peekShip(type,stage,{fallback=false,markVisible=true}={}){
    const take=index=>shipCache.get(shipKey(type,index))?.asset||shipReferences.get(shipKey(type,index))?.deref();
    let asset=take(stage);
    if(!asset&&fallback){asset=take(0);for(let i=1;!asset&&i<4;i++)asset=take(i);}
    return asset?retainShip(asset,{markVisible}):null;
  }
  function loadShip(type = 7, hull = 100, options = {}) {
    type = Number(type);
    const maximum = window.nativeShipDefinitions?.get(type).hull || window.VexedMirrorWorld.ships.find(ship => ship.id === type)?.hull || 100;
    const strength = Math.max(0, Math.min(1, Number(hull) / maximum));
    const damageStage = strength < .25 ? 3 : strength < .5 ? 2 : strength < .75 ? 1 : 0;
    const key = shipKey(type,damageStage);
    const cached=shipCache.get(key);
    if(cached){cacheMetrics.shipHits++;return Promise.resolve(retainShip(cached.asset,{markVisible:Boolean(options.visible)}));}
    // A current player/effects owner may still hold an evicted asset. Reuse that
    // object without pinning the whole fleet's decoded artwork in this loader.
    const retained=shipReferences.get(key)?.deref();
    if(retained){cacheMetrics.shipHits++;return Promise.resolve(retainShip(retained,{markVisible:Boolean(options.visible)}));}
    if(shipPending.has(key))return options.visible?shipPending.get(key).then(asset=>retainShip(asset,{markVisible:true})):shipPending.get(key);
    cacheMetrics.shipMisses++;
    const started=clock(),timing={type,stage:damageStage,catalogMs:0,imageLoadMs:0,imageDecodeMs:0,imageWaitMs:0,imageCached:false,alignmentMs:0,effectsMs:0,unlitMs:0,wallMs:0};
    const pending = catalog().then(async data => {
        timing.catalogMs=clock()-started;
        const registered=window.nativeShipDefinitions?.get(type),ship = data.ships.find(entry => entry.id === type)||(Array.isArray(registered?.artwork.frames)?{name:registered.name,frames:registered.artwork.frames}:null);
        if (!ship) throw new Error('Ship artwork is not in the catalog');
        const url='../flashtrek-broken-mirror/showcase-assets/'+ship.frames[damageStage],imageStarted=clock();timing.imageCached=imageCache.has(url);
        const loaded = await image(url);timing.imageWaitMs=clock()-imageStarted;
        const sourceTiming=imageTimings.get(loaded);if(!timing.imageCached){timing.imageLoadMs=sourceTiming?.loadMs||0;timing.imageDecodeMs=sourceTiming?.decodeMs||0;}
        const standard = window.nativeShipDefinitions?.artworkProfile(type)||window.starterShips?.get(type);
        const special = ({56:window.constitutionTugEffects,57:window.tugEffects,58:window.olympicEffects,59:window.cthiaEffects})[type];
        const profile = standard || (special ? {effects:special} : null);
        let phase=clock();
        const aligned = standard ? await (standard.alignAsync?.(loaded,damageStage) || standard.align(loaded, damageStage)) :
          (type === 57 ? window.alignTugFrame(loaded, damageStage) : type === 58 ? window.alignOlympicFrame(loaded, damageStage) : loaded);
        timing.alignmentMs=clock()-phase;phase=clock();
        if(profile?.effects.prepareFrameAsync)await profile.effects.prepareFrameAsync(aligned,damageStage);
        else profile?.effects.prepareFrame?.(aligned,damageStage);
        timing.effectsMs=clock()-phase;phase=clock();
        // Every controller uses the same dim base and animated painted lamps.
        const art = await (profile?.effects.unlitFrameAsync?.(aligned) || profile?.effects.unlitFrame(aligned) || aligned);
        timing.unlitMs=clock()-phase;timing.wallMs=clock()-started;preparation.ships++;
        for(const field of ['catalogMs','alignmentMs','effectsMs','unlitMs','wallMs'])preparation[field]+=timing[field];
        recentPreparation.push(timing);if(recentPreparation.length>64)recentPreparation.shift();
        return {type, damageStage, art, profile, width: art.width || art.naturalWidth, height: art.height || art.naturalHeight, name: ship.name};
      }).then(asset=>{
        if(typeof WeakRef==='function'){
          if(shipReferences.size>=256)shipReferences.delete(shipReferences.keys().next().value);
          shipReferences.set(key,new WeakRef(asset));
        }
        return retainShip(asset,{markVisible:Boolean(options.visible)});
      }).finally(()=>shipPending.delete(key));
    shipPending.set(key,pending);return pending;
  }

  function loadPlanet(systemId) {
    const system = window.VexedMirrorWorld.systems.find(entry => entry.id === Number(systemId));
    if (!system) return Promise.reject(new Error('Unknown system'));
    const pending = image('assets/planets/planet-' + system.planetArtFrame + '.png');
    pending.then(art => planetCache.set(system.id, art), () => {});
    return pending;
  }

  function loadLocalBody(bodyId) {
    const names=['Sun','Mercury','Venus','Earth','Moon','Mars','Asteroid Belt','Jupiter','Saturn','Uranus','Neptune','Pluto'];
    const id=Number(bodyId),name=names[id];
    if(!name)return Promise.reject(new Error('Unknown Sol destination'));
    return image('../flashtrek-broken-mirror/art-review/sol-planets/'+String(id).padStart(2,'0')+' - '+encodeURIComponent(name)+'.png')
      .then(art=>{localBodyCache.set(id,art);return art});
  }

  function drawShip(ctx, asset, x, y, width, angle, time, appearance = {}) {
    if (!asset) return;
    const height = appearance.height ?? width * asset.height / asset.width;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);ctx.rotate(angle);ctx.scale(appearance.squeezeX ?? 1, 1);
    ctx.globalAlpha *= appearance.alpha ?? 1;
    const source=appearance.light,localLight=source?{direction:(source.direction??Math.atan2(source.y-y,source.x-x))-angle,color:source.color,
      bright:appearance.warpPulse?Math.min(.34,.22+appearance.warpPulse*.12):.22}:null;
    const cached=window.nativeShipSpriteCache?.draw(ctx,asset,width,height,time,{...appearance,localLight});
    if(!cached){ctx.drawImage(asset.art, -width / 2, -height / 2, width, height);
      asset.profile?.effects.draw(ctx, {x:0, y:0, w: width, h: height}, 0, asset.damageStage, time,
      {lights: appearance.lights !== false, damage: appearance.damage !== false, lightGain: appearance.lightGain??2.8, lightBloom: appearance.lightBloom??2.5});
    }
    ctx.restore();
  }

  function loadWarpRing() {
    return image('assets/warp/warp-ring.png').then(art => {warpRing=art;return art;});
  }
  function drawWarpRing(ctx, ring, size) {
    if (!ring || !warpRing) return;
    const transform=ctx.getTransform?.();
    if(transform&&window.nativeEffectVisibility&&!window.nativeEffectVisibility.circle(
      transform.a*ring.x+transform.c*ring.y+transform.e,transform.b*ring.x+transform.d*ring.y+transform.f,
      size*ring.scale/2*Math.max(Math.hypot(transform.a,transform.b),Math.hypot(transform.c,transform.d)),
      {w:ctx.canvas?.width,h:ctx.canvas?.height}))return;
    window.nativeShipSpriteCache?.flush?.(ctx);
    ctx.save();ctx.translate(ring.x,ring.y);ctx.globalAlpha=ring.alpha;
    ctx.drawImage(warpRing,-size*ring.scale/2,-size*ring.scale/2,size*ring.scale,size*ring.scale);
    ctx.restore();
  }

  function cacheSnapshot(){
    const unique=new Set(),count=art=>{if(!art||unique.has(art))return 0;unique.add(art);return (art.width||art.naturalWidth)*(art.height||art.naturalHeight)*4;};
    let bytes=0;for(const entry of imageCache.values())bytes+=count(entry.art);for(const entry of shipCache.values())bytes+=count(entry.asset.art);
    const loaderArt=unique.size;let auxiliaryBytes=count(warpRing);
    for(const art of planetCache.values())auxiliaryBytes+=count(art);for(const art of localBodyCache.values())auxiliaryBytes+=count(art);
    return {bytes,uniqueArt:loaderArt,totalOwnedByteEstimate:bytes+auxiliaryBytes,
      auxiliary:{additionalBytes:auxiliaryBytes,planets:planetCache.size,localBodies:localBodyCache.size,warpRing:Boolean(warpRing)},
      source:{entries:imageCache.size,bytes:imageBytes,pending:imagePending.size},
      ships:{entries:shipCache.size,bytes:shipBytes,pending:shipPending.size,weakReferences:shipReferences.size,
        visibleEntries:[...shipCache.values()].filter(visible).length,renderEpoch},limits:{...cacheLimits,weakReferences:256},counters:{...cacheMetrics},
      preparation:{...preparation,recent:recentPreparation.map(row=>({...row}))}};
  }
  // Active ships/effects own their references; eviction only releases this
  // loader's retention. Pending requests remain deduplicated during a reset.
  function resetCaches(){imageCache.clear();shipCache.clear();shipReferences.clear();imageBytes=shipBytes=renderEpoch=0;for(const key of Object.keys(cacheMetrics))cacheMetrics[key]=0;for(const key of Object.keys(preparation))preparation[key]=0;recentPreparation.length=0;}
  window.vexedFlightAssets = {loadShip,peekShip,retainShip,beginRenderFrame, loadPlanet, loadLocalBody, drawShip, flightDimensions, loadWarpRing, drawWarpRing,cacheSnapshot,resetCaches, size:id=>shipSizes.get(Number(id))||(()=>{const d=window.nativeShipDefinitions?.dimensions({shipType:Number(id)});return d?{id:Number(id),playerWidth:d.width,playerHeight:d.height}:null;})(),planet: id => planetCache.get(Number(id)),localBody:id=>localBodyCache.get(Number(id))};
  loadWarpRing().catch(()=>{});
})();
