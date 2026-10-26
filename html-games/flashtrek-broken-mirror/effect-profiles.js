/* Shared release selection. Preview overrides exist only in the lab document. */
(() => {
  'use strict';
  const baseURL=new URL('.',document.currentScript.src),registry=new Map(),loadedModules=new Set();
  const defaults={schema:1,id:'production-v1',name:'Current game effects',implementation:'shared-v1',modules:[],shield:{duration:900,energy:1},weapon:{scale:1}};
  let production=structuredClone(defaults),preview=null;
  function validate(value){
    if(!value||value.schema!==1||typeof value.id!=='string'||!value.id||value.id.length>80||typeof value.name!=='string'||!value.name||value.name.length>100||typeof value.implementation!=='string')throw Error('Invalid effect profile');
    if(!Array.isArray(value.modules)||value.modules.length>8||value.modules.some(path=>!/^effect-candidates\/[a-zA-Z0-9_-]+\.js$/.test(path)))throw Error('Invalid candidate module');
    if(!Number.isFinite(value.shield?.duration)||value.shield.duration<200||value.shield.duration>1800||!Number.isFinite(value.shield?.energy)||value.shield.energy<.5||value.shield.energy>1.8||!Number.isFinite(value.weapon?.scale)||value.weapon.scale<.5||value.weapon.scale>2)throw Error('Effect settings out of range');
    return {schema:1,id:value.id,name:value.name,implementation:value.implementation,modules:[...value.modules],shield:{duration:value.shield.duration,energy:value.shield.energy},weapon:{scale:value.weapon.scale}};
  }
  async function loadModules(profile){
    for(const module of profile.modules){
      const url=new URL(module,baseURL).href;
      if(loadedModules.has(url))continue;
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url+'?load='+Date.now();script.onload=resolve;script.onerror=()=>reject(Error('Candidate module could not load'));document.head.append(script);});
      loadedModules.add(url);
    }
    if(profile.implementation!=='shared-v1'&&!registry.has(profile.implementation))throw Error('Effect implementation is not registered');
  }
  const ready=(window.nativeEffectProfileRelease?Promise.resolve(window.nativeEffectProfileRelease):fetch(new URL('effect-release.json',baseURL),{cache:'no-store'}).then(response=>{
    if(!response.ok)throw Error('Effect release unavailable');return response.json();
  })).then(async value=>{const profile=validate(value);await loadModules(profile);production=profile;return structuredClone(production);});
  // Normal gameplay can still start with the established defaults if a release
  // file cannot be read. The lab awaits ready and reports that failure instead.
  ready.catch(error=>console.warn('Effect release fallback:',error.message));
  window.nativeEffectProfiles=Object.freeze({ready,validate,
    current:()=>structuredClone(preview||production),production:()=>structuredClone(production),
    shield:()=> (preview||production).shield,weapon:()=> (preview||production).weapon,
    async preview(value){const profile=validate(value);await loadModules(profile);preview=profile;return structuredClone(preview);},
    clearPreview(){preview=null;},
    register(id,implementation){if(id==='shared-v1'||registry.has(id))throw Error('Effect implementation already registered');registry.set(id,implementation);},
    extend(id,parent,hooks){if(!registry.has(parent))throw Error('Parent effect implementation is not registered');const inherited=registry.get(parent);this.register(id,{...inherited,...(typeof hooks==='function'?hooks(inherited):hooks)});},
    metrics:()=>registry.get((preview||production).implementation)?.metrics?.()||{},
    queueShipLight(ctx,asset,width,height,light){return registry.get((preview||production).implementation)?.queueShipLight?.(ctx,asset,width,height,light)||false;},
    queueShipSurface(ctx,asset,width,height,matrix,alpha){return registry.get((preview||production).implementation)?.queueShipSurface?.(ctx,asset,width,height,matrix,alpha)||false;},
    queueHullParticle(ctx,particle,time){return registry.get(particle.effectOwner||(preview||production).implementation)?.queueHullParticle?.(ctx,particle,time)||false;},
    queueWeapon(ctx,shot,matrix){return registry.get((preview||production).implementation)?.queueWeapon?.(ctx,shot,matrix)||false;},
    queueImpact(ctx,event){return registry.get((preview||production).implementation)?.queueImpact?.(ctx,event)||false;},
    emitHullBurst(base,...args){const implementation=registry.get((preview||production).implementation);return implementation?.emitHullBurst?implementation.emitHullBurst(base,...args):base(...args);},
    updateHullParticle(base,particle,dt){const implementation=registry.get(particle.effectOwner||(preview||production).implementation);return implementation?.updateHullParticle?implementation.updateHullParticle(base,particle,dt):base(particle,dt);},
    drawHullParticle(base,ctx,particle,time){const implementation=registry.get(particle.effectOwner||(preview||production).implementation);return implementation?.drawHullParticle?implementation.drawHullParticle(base,ctx,particle,time):base(ctx,particle,time);},
    createShield(base,options){const implementation=registry.get((preview||production).implementation);return implementation?.createShield?implementation.createShield(base,options):base(options);},
    drawWeapon(base,ctx,shot){const implementation=registry.get((preview||production).implementation);return implementation?.drawWeapon?implementation.drawWeapon(base,ctx,shot):base(ctx,shot);}
  });
})();
