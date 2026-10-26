/* Regular weapon tests use the game's shared shield presentation and release. */
(() => {
  'use strict';
  const space=document.getElementById('scene'),channel='vexed-effect-lab-v1';
  const origin=['7788','7790'].includes(location.port)?'http://127.0.0.1:7791':location.origin;
  const base=origin+'/html-games/flashtrek-broken-mirror/';
  const fire=document.getElementById('fire-weapon'),hullTest=document.createElement('button');
  hullTest.id='test-hull-hit';hullTest.type='button';hullTest.textContent='Hull hit';hullTest.disabled=fire.disabled;
  hullTest.title='Lower the demo shields and fire the selected weapon at the hull.';
  hullTest.onclick=()=>{if(fire.disabled)return;const shields=document.getElementById('shields');if(shields.checked)shields.click();fire.click();};
  fire.after(hullTest);new MutationObserver(()=>{hullTest.disabled=fire.disabled;}).observe(fire,{attributes:true,attributeFilter:['disabled']});
  const hullStyle=document.createElement('style');hullStyle.textContent='.weapon-actions #test-hull-hit{flex:0 0 auto;min-width:60px;height:42px;padding:6px;font-size:11px;white-space:nowrap}';document.head.append(hullStyle);
  const label=document.querySelector('.viewer-heading .eyebrow');label.id='shield-version';
  const controls=document.createElement('label');controls.id='showcase-shield-controls';controls.className='workspace-field';controls.textContent='Shield renderer';
  const selector=document.createElement('select');selector.id='shield-renderer';selector.setAttribute('aria-label','Shield renderer');
  selector.add(new Option('Weapon lighting, lens flares and hull sparks - candidate','battle'));selector.add(new Option('Cinematic beams, plasma and torpedoes - candidate','weapons'));selector.add(new Option('Hybrid bubble shields - candidate','cinematic'));selector.add(new Option('Hybrid cinematic combat - candidate','combat'));selector.add(new Option('Latest game shields · GPU','gpu'));selector.add(new Option('Legacy baseline · comparison only','legacy'));controls.append(selector);
  document.querySelector('.weapon-advanced').append(controls);
  const aimControl=document.createElement('label');aimControl.className='workspace-field';aimControl.textContent='Impact location';
  const aim=document.createElement('select');aim.id='shield-hit-location';aim.setAttribute('aria-label','Impact location');
  for(const [value,text] of [['varied','Varied surface hits'],['pick','Click bubble, then Fire'],['source','From firing ship']])aim.add(new Option(text,value));
  aimControl.append(aim);document.querySelector('.weapon-actions').after(aimControl);
  const style=document.createElement('style');style.textContent='#shield-version{display:block!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;font-size:8px}#showcase-shield-controls select{width:100%;padding:6px;font:11px system-ui;background:#0a1520;color:#d8edf3;border:1px solid #354e60;border-radius:4px}.effect-lab-active #showcase-gpu-shields{display:none!important}';document.head.append(style);
  let presentation=null,mode='gpu',profile=null,variant='baseline',error=null,initializing=true,generation=0,versionText='SHIELDS · Preparing latest GPU',regularEntity={},labWasActive=false,designManifest=null;
  const legacySurface=window.drawShowcaseShieldSurface,legacyFlash=window.drawShowcaseShieldFlash;
  function updateLabel(){
    const text=error||mode==='gpu'&&presentation&&!presentation.available?`SHIELDS · ${mode==='legacy'?'Legacy baseline':'GPU unavailable'}`:initializing?'SHIELDS · Preparing latest GPU':`SHIELDS · ${mode==='legacy'?'Legacy baseline':'Latest GPU'} · ${profile?.name||'Current game effects'}${variant==='candidate'?' · candidate':''}`;
    versionText=text;if(label.textContent!==text)label.textContent=text;
    label.title=error||`${text} (${profile?.id||'loading'}; ${profile?.implementation||'shared-v1'})`;
    label.dataset.renderer=mode;label.dataset.profile=profile?.id||'';label.dataset.state=error?'error':initializing?'loading':'ready';
  }
  const designValues={'cinematic-battle-v2':'battle','cinematic-weapons-v1':'weapons','cinematic-combat-v1':'combat','cinematic-shields-v1':'cinematic'};
  function load(name){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=base+name+'?v=cinematic-weapons-1';script.onload=resolve;script.onerror=()=>reject(Error('Shared shield service unavailable. Start tools/effect_lab_server.py and refresh.'));document.head.append(script);});}
  function viewOptions(options){return {radii:(_,d)=>window.showcaseShieldRadii(d.width,d.height),space,matchCanvasBox:true,
    onRestore:()=>setProfile(profile,variant,mode).catch(fail),...options};}
  function fail(reason){error=reason.message||String(reason);initializing=false;updateLabel();dispatchEvent(new CustomEvent('showcase-shields-ready'));}
  async function setProfile(value,selectedVariant='baseline',renderer=mode){
    await ready;const ticket=++generation;initializing=true;updateLabel();
    await nativeEffectProfiles.preview(value);
    const next=await createVexedShieldPresentation(viewOptions());
    if(ticket!==generation){next.destroy();return;}
    presentation?.destroy();presentation=next;presentation.canvas.id='showcase-gpu-shields';
    profile=nativeEffectProfiles.current();variant=selectedVariant;mode=renderer==='legacy'?'legacy':'gpu';selector.value=mode==='gpu'&&selectedVariant==='candidate'?(designValues[profile.implementation]||'gpu'):mode;
    presentation.setLegacy(mode==='legacy');error=null;initializing=false;updateLabel();
  }
  const ready=(async()=>{
    try{
      const manifest=origin===location.origin?{
        release:await fetch(base+'effect-release.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Effect release unavailable');return r.json();}),
        candidates:await fetch(base+'effect-candidates.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Effect catalog unavailable');return r.json();})
      }:await window.showcaseEffectLab.readManifest(),release=manifest.release;
      designManifest=manifest;
      const initial=manifest.candidates?.profiles?.find(p=>p.implementation===manifest.candidates.defaultPreview);
      window.nativeEffectProfileRelease=release;
      await load('effect-profiles.js');await nativeEffectProfiles.ready;
      if(initial){await nativeEffectProfiles.preview(initial);variant='candidate';selector.value=designValues[initial.implementation]||'gpu';}
      await load('weapon-effects.js');
      await load('shield-gpu.js');await load('shield-gpu-live.js');
      await load('../broken-mirror-port/weapon-rules.js');await load('../broken-mirror-port/combat-shots.js');
      presentation=await createVexedShieldPresentation(viewOptions());presentation.canvas.id='showcase-gpu-shields';
      profile=nativeEffectProfiles.current();initializing=false;updateLabel();dispatchEvent(new CustomEvent('showcase-shields-ready'));
    }catch(reason){fail(reason);throw reason;}
  })();ready.catch(()=>{});
  selector.onchange=async()=>{const selected=selector.value;try{await ready;const implementation=Object.keys(designValues).find(key=>designValues[key]===selected),chosen=implementation?designManifest.candidates.profiles.find(p=>p.implementation===implementation):designManifest.release;await setProfile(chosen,implementation?'candidate':'baseline',selected==='legacy'?'legacy':'gpu');}catch(reason){fail(reason);}};
  window.drawShowcaseShieldSurface=(ctx,x,y,w,h,color,charge,time,options={})=>{
    if(mode==='legacy')return legacySurface(ctx,x,y,w,h,color,charge,time,options);
    if(!presentation?.available||!options.impact||time-options.impact.born>=(options.impact.charge===0?430:presentation.duration))return;
    const descriptor={entity:options.entity||regularEntity,id:options.entity?.id||'showcase',heading:(options.angle||0)-Math.PI/2,
      dimensions:{width:w,height:h}};
    presentation.submit(ctx,descriptor,{x,y,zoom:1,dimensions:descriptor.dimensions},options.impact.localNormalized?{...options.impact,x:options.impact.localNormalized.x*w,y:options.impact.localNormalized.y*h}:options.impact,time,{front:options.front});
  };
  window.drawShowcaseShieldFlash=(...args)=>{if(mode==='legacy')return legacyFlash(...args);};
  addEventListener('showcase-workspace-tab',event=>{
    if(event.detail.id==='lab'){labWasActive=true;presentation?.canvas.setAttribute('hidden','');return;}
    const fromLab=labWasActive;labWasActive=false;const selected=window.showcaseEffectLab.selection?.();
    if(fromLab&&selected&&(!profile||JSON.stringify(selected.profile)!==JSON.stringify(profile)||selected.renderer!==mode))setProfile(selected.profile,selected.variant,selected.renderer).catch(fail);
    else updateLabel();
  });
  addEventListener('message',event=>{
    if(event.origin!==origin||event.source!==document.getElementById('effect-lab-frame')?.contentWindow||event.data?.channel!==channel||event.data.type!=='telemetry'||!window.showcaseEffectLab.active)return;
    const running=event.data.payload.effectVersion;if(running){label.textContent=`SHIELDS · ${running.renderer==='legacy'?'Legacy baseline':'Latest GPU'} · ${running.name}`;label.title=running.id;label.dataset.renderer=running.renderer;label.dataset.profile=running.id;}
  });
  addEventListener('pagehide',()=>presentation?.destroy());
  window.showcaseShields=Object.freeze({ready,setProfile,get renderer(){return mode;},
    contact(l,angle,from){return window.nativeCombatShots?.contact({x:l.x,y:l.y,heading:angle-Math.PI/2},from,{width:l.w,height:l.h},true)||null;},
    begin(ctx){presentation?.beginFrame(ctx);},end(ctx,time){presentation?.endFrame(ctx,time);if(!window.showcaseEffectLab.active)updateLabel();},reset(){presentation?.reset();},
    snapshot:()=>({renderer:mode,profile,variant,ready:!initializing&&!error,available:!!presentation?.available,error,version:versionText,presentation:presentation?.snapshot()})});
})();
