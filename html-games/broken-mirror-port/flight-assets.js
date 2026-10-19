/* Shared, decoded assets for flight and cinematic travel. */
(() => {
  'use strict';
  const imageCache = new Map(), shipCache = new Map(), shipReferences = new Map(), imagePending = new Map(), shipPending = new Map(), planetCache = new Map(), localBodyCache = new Map();
  const cacheLimits={sourceBytes:32*1024*1024,sourceEntries:48,shipBytes:24*1024*1024,shipEntries:24};
  const cacheMetrics={imageHits:0,imageMisses:0,shipHits:0,shipMisses:0,imageEvictions:0,shipEvictions:0};
  let imageBytes=0,shipBytes=0;
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
        const timer = setTimeout(() => reject(new Error('Artwork loading timed out')), 15000);
        art.onload = () => art.decode().then(() => { clearTimeout(timer); resolve(art); }, error => { clearTimeout(timer); reject(error); });
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

  function loadShip(type = 7, hull = 100, options = {}) {
    type = Number(type);
    const maximum = window.nativeShipDefinitions?.get(type).hull || window.VexedMirrorWorld.ships.find(ship => ship.id === type)?.hull || 100;
    const strength = Math.max(0, Math.min(1, Number(hull) / maximum));
    const damageStage = strength < .25 ? 3 : strength < .5 ? 2 : strength < .75 ? 1 : 0;
    const key = type + ':' + damageStage;
    const cached=shipCache.get(key);
    if(cached){shipCache.delete(key);shipCache.set(key,cached);cacheMetrics.shipHits++;return Promise.resolve(cached.asset);}
    // A current player/effects owner may still hold an evicted asset. Reuse that
    // object without pinning the whole fleet's decoded artwork in this loader.
    const retained=shipReferences.get(key)?.deref();
    if(retained){cacheMetrics.shipHits++;return Promise.resolve(retained);}
    if(shipPending.has(key))return shipPending.get(key);
    cacheMetrics.shipMisses++;
    const pending = catalog().then(async data => {
        const registered=window.nativeShipDefinitions?.get(type),ship = data.ships.find(entry => entry.id === type)||(Array.isArray(registered?.artwork.frames)?{name:registered.name,frames:registered.artwork.frames}:null);
        if (!ship) throw new Error('Ship artwork is not in the catalog');
        const loaded = await image('../flashtrek-broken-mirror/showcase-assets/' + ship.frames[damageStage]);
        const standard = window.nativeShipDefinitions?.artworkProfile(type)||window.starterShips?.get(type);
        const special = ({56:window.constitutionTugEffects,57:window.tugEffects,58:window.olympicEffects,59:window.cthiaEffects})[type];
        const profile = standard || (special ? {effects:special} : null);
        const aligned = standard ? await (standard.alignAsync?.(loaded,damageStage) || standard.align(loaded, damageStage)) :
          (type === 57 ? window.alignTugFrame(loaded, damageStage) : type === 58 ? window.alignOlympicFrame(loaded, damageStage) : loaded);
        profile?.effects.prepareFrame?.(aligned,damageStage);
        // Every controller uses the same dim base and animated painted lamps.
        const art = await (profile?.effects.unlitFrameAsync?.(aligned) || profile?.effects.unlitFrame(aligned) || aligned);
        return {type, damageStage, art, profile, width: art.width || art.naturalWidth, height: art.height || art.naturalHeight, name: ship.name};
      }).then(asset=>{
        if(typeof WeakRef==='function'){
          if(shipReferences.size>=256)shipReferences.delete(shipReferences.keys().next().value);
          shipReferences.set(key,new WeakRef(asset));
        }
        const bytes=asset.width*asset.height*4;
        if(bytes<=cacheLimits.shipBytes){
          while(shipCache.size>=cacheLimits.shipEntries||shipBytes+bytes>cacheLimits.shipBytes){
            const oldest=shipCache.keys().next().value;shipBytes-=shipCache.get(oldest).bytes;shipCache.delete(oldest);cacheMetrics.shipEvictions++;
          }
          shipCache.set(key,{asset,bytes});shipBytes+=bytes;
        }
        return asset;
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
    const source=appearance.light,localLight=source?{direction:Math.atan2(source.y-y,source.x-x)-angle,color:source.color,
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
      ships:{entries:shipCache.size,bytes:shipBytes,pending:shipPending.size,weakReferences:shipReferences.size},limits:{...cacheLimits,weakReferences:256},counters:{...cacheMetrics}};
  }
  // Active ships/effects own their references; eviction only releases this
  // loader's retention. Pending requests remain deduplicated during a reset.
  function resetCaches(){imageCache.clear();shipCache.clear();shipReferences.clear();imageBytes=shipBytes=0;for(const key of Object.keys(cacheMetrics))cacheMetrics[key]=0;}
  window.vexedFlightAssets = {loadShip, loadPlanet, loadLocalBody, drawShip, flightDimensions, loadWarpRing, drawWarpRing,cacheSnapshot,resetCaches, size:id=>shipSizes.get(Number(id))||(()=>{const d=window.nativeShipDefinitions?.dimensions({shipType:Number(id)});return d?{id:Number(id),playerWidth:d.width,playerHeight:d.height}:null;})(),planet: id => planetCache.get(Number(id)),localBody:id=>localBodyCache.get(Number(id))};
  loadWarpRing().catch(()=>{});
})();
