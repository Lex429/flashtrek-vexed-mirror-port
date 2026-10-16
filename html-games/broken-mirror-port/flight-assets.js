/* Shared, decoded assets for flight and cinematic travel. */
(() => {
  'use strict';
  const imageCache = new Map(), shipCache = new Map(), planetCache = new Map(), localBodyCache = new Map();
  const warpShipCanvas = document.createElement('canvas');
  const warpShipContext = warpShipCanvas.getContext('2d');
  const litShipCanvas = document.createElement('canvas');
  const litShipContext = litShipCanvas.getContext('2d');
  let catalogPromise, warpRing;
  const shipSizes=new Map(window.VexedFlightReference.shipSizes.map(ship=>[ship.id,ship]));
  function flightDimensions(shipSize,zoom){
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
    if (!imageCache.has(url)) {
      const pending = new Promise((resolve, reject) => {
        const art = new Image();
        const timer = setTimeout(() => reject(new Error('Artwork loading timed out')), 15000);
        art.onload = () => art.decode().then(() => { clearTimeout(timer); resolve(art); }, error => { clearTimeout(timer); reject(error); });
        art.onerror = () => { clearTimeout(timer); reject(new Error('Artwork unavailable')); };
        art.src = url;
      });
      imageCache.set(url, pending);
      pending.catch(() => imageCache.delete(url));
    }
    return imageCache.get(url);
  }

  function loadShip(type = 7, hull = 100, options = {}) {
    type = Number(type);
    const maximum = window.VexedMirrorWorld.ships.find(ship => ship.id === type)?.hull || 100;
    const strength = Math.max(0, Math.min(1, Number(hull) / maximum));
    const damageStage = strength < .25 ? 3 : strength < .5 ? 2 : strength < .75 ? 1 : 0;
    const key = type + ':' + damageStage + (options.showcase ? ':showcase' : '');
    if (!shipCache.has(key)) {
      const pending = catalog().then(async data => {
        const ship = data.ships.find(entry => entry.id === type);
        if (!ship) throw new Error('Ship artwork is not in the catalog');
        const loaded = await image('../flashtrek-broken-mirror/showcase-assets/' + ship.frames[damageStage]);
        const standard = window.starterShips?.get(type);
        const special = ({56:window.constitutionTugEffects,57:window.tugEffects,58:window.olympicEffects,59:window.cthiaEffects})[type];
        const profile = standard || (special ? {effects:special} : null);
        const aligned = standard?.align(loaded, damageStage) || (type === 57 ? window.alignTugFrame(loaded, damageStage) : type === 58 ? window.alignOlympicFrame(loaded, damageStage) : loaded);
        const art = options.showcase && damageStage < 3 ? aligned : profile?.effects.unlitFrame(aligned) || aligned;
        return {type, damageStage, art, profile, width: art.width || art.naturalWidth, height: art.height || art.naturalHeight, name: ship.name};
      });
      shipCache.set(key, pending);
      pending.catch(() => shipCache.delete(key));
    }
    return shipCache.get(key);
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
    const fading = appearance.kind && asset.profile;
    if (fading) {
      const pad = 32, cw = asset.width + pad*2, ch = asset.height + pad*2;
      if(warpShipCanvas.width!==cw||warpShipCanvas.height!==ch){warpShipCanvas.width=cw;warpShipCanvas.height=ch;}
      warpShipContext.clearRect(0,0,cw,ch);
      warpShipContext.drawImage(asset.art,pad,pad);
      asset.profile.effects.draw(warpShipContext,{x:cw/2,y:ch/2,w:asset.width,h:asset.height},0,asset.damageStage,time,
        {lights:appearance.lights !== false,damage:appearance.damage !== false,lightGain:appearance.lightGain??2.8,lightBloom:appearance.lightBloom??2.5});
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);ctx.rotate(angle);ctx.scale(appearance.squeezeX ?? 1, 1);
    ctx.globalAlpha *= appearance.alpha ?? 1;
    if(fading){const px=32*width/asset.width,py=32*height/asset.height;ctx.drawImage(warpShipCanvas,-width/2-px,-height/2-py,width+px*2,height+py*2);}
    else ctx.drawImage(asset.art, -width / 2, -height / 2, width, height);
    if(appearance.light){
      const source=appearance.light,tint=Number(source.color);
      const direction=Math.atan2(source.y-y,source.x-x)-angle,ux=Math.cos(direction),uy=Math.sin(direction);
      const extent=Math.max(asset.width,asset.height),bright=appearance.warpPulse?Math.min(.34,.22+appearance.warpPulse*.12):.22;
      if(litShipCanvas.width!==asset.width||litShipCanvas.height!==asset.height){litShipCanvas.width=asset.width;litShipCanvas.height=asset.height;}
      litShipContext.clearRect(0,0,asset.width,asset.height);
      litShipContext.drawImage(asset.art,0,0,asset.width,asset.height);
      litShipContext.globalCompositeOperation='source-in';
      const gradient=litShipContext.createLinearGradient(asset.width/2+ux*extent*.55,asset.height/2+uy*extent*.55,asset.width/2-ux*extent*.55,asset.height/2-uy*extent*.55);
      const rgb=`${tint>>16&255},${tint>>8&255},${tint&255}`;
      gradient.addColorStop(0,`rgba(${rgb},${bright})`);gradient.addColorStop(.54,`rgba(${rgb},.035)`);gradient.addColorStop(1,`rgba(${rgb},0)`);
      litShipContext.fillStyle=gradient;litShipContext.fillRect(0,0,asset.width,asset.height);
      litShipContext.globalCompositeOperation='source-over';
      ctx.drawImage(litShipCanvas,-width/2,-height/2,width,height);
    }
    if(!fading)asset.profile?.effects.draw(ctx, {x:0, y:0, w: width, h: height}, 0, asset.damageStage, time,
      {lights: appearance.lights !== false, damage: appearance.damage !== false, lightGain: appearance.lightGain??2.8, lightBloom: appearance.lightBloom??2.5});
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

  window.vexedFlightAssets = {loadShip, loadPlanet, loadLocalBody, drawShip, flightDimensions, loadWarpRing, drawWarpRing, size:id=>shipSizes.get(Number(id)),planet: id => planetCache.get(Number(id)),localBody:id=>localBodyCache.get(Number(id))};
  loadWarpRing().catch(()=>{});
})();
