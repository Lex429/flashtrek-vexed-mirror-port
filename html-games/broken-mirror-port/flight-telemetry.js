/* Flight telemetry observes shared navigation; it never changes saved state. */
(() => {
  'use strict';
  const root=document.createElement('section');root.id='flight-status';root.hidden=true;
  root.setAttribute('aria-label','Flight telemetry');
  root.innerHTML=`<div class="flight-panel">
    <span class="flight-event-sweep" aria-hidden="true"></span><span class="flight-event-halo" aria-hidden="true"></span>
    <div class="flight-location"><div class="flight-heading"><h2 class="flight-name"></h2><span class="flight-name-ghost" aria-hidden="true"></span><span class="flight-code"></span><span class="flight-sync"></span></div><div class="flight-details"><div class="flight-reputation" role="img"><span class="flight-beacon" aria-hidden="true"></span><span class="flight-reputation-label">REP</span><b class="flight-standing"></b><span class="flight-standing-label"></span></div><span class="flight-coordinates"><span class="flight-coordinate-x"></span><span class="flight-coordinate-y"></span></span></div></div>
    <div class="flight-speed"><span class="flight-mode"></span><span class="flight-speed-value"><b class="flight-velocity">000</b><small> U/S</small></span></div>
    <div class="flight-drive" aria-hidden="true"><span></span></div>
  </div><div class="flight-arrival" role="status" aria-live="polite" hidden><span class="flight-arrival-mark" aria-hidden="true">››</span><div><span class="flight-arrival-label"></span><strong class="flight-arrival-name"></strong></div><span class="flight-arrival-progress" aria-hidden="true"></span></div>`;
  document.querySelector('#game').append(root);
  const element=selector=>root.querySelector(selector),fields={};
  for(const name of ['code','name','mode','velocity','sync','standing','standing-label','coordinate-x','coordinate-y'])fields[name]=element('.flight-'+name);
  const reputation=element('.flight-reputation'),drive=element('.flight-drive span'),arrival=element('.flight-arrival'),arrivalLabel=element('.flight-arrival-label'),arrivalName=element('.flight-arrival-name');
  const sweep=element('.flight-event-sweep'),halo=element('.flight-event-halo'),ghost=element('.flight-name-ghost');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),animations=new Map(),pausedAnimations=new Set();
  let observed=null,region=null,clock=0,nextUpdate=0,announcementUntil=0,transitions=0,observedSequence=null;
  let previous=null,tween=null,suspended=false,reactions=0,lastDamageAt=-Infinity;
  const put=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
  const data=(key,value)=>{if(root.dataset[key]!==value)root.dataset[key]=value;};
  const signed=value=>(value>0?'+':'')+value;
  const coordinateFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
  const coordinate=value=>coordinateFormat.format(Math.round(Number(value)||0)||0);
  function cancelEffects(){for(const animation of animations.values())animation.cancel();animations.clear();tween=null;}
  function animate(channel,node,frames,{duration=650,delay=0,easing='cubic-bezier(.2,.7,.2,1)'}={},event=channel){
    animations.get(channel)?.cancel();
    if(reduced.matches||suspended||root.hidden)return;
    const animation=node.animate(frames,{duration,delay,easing});animation.id='flight:'+event+':'+channel;animations.set(channel,animation);
    const release=()=>{if(animations.get(channel)===animation)animations.delete(channel);};animation.finished.then(release,release);
  }
  function suspend(value){
    if(suspended===value)return;suspended=value;
    if(value){for(const animation of root.getAnimations({subtree:true})){animation.pause();pausedAnimations.add(animation);}}
    else{for(const animation of pausedAnimations)if(animation.playState==='paused')animation.play();pausedAnimations.clear();}
  }
  function react(kind,color){
    reactions++;data('event',kind);
    sweep.style.setProperty('--event-color',color);halo.style.setProperty('--event-color',color);
    animate('sweep',sweep,[{opacity:0,transform:'translateX(-140%) skewX(-18deg)'},{opacity:.85,offset:.25},{opacity:0,transform:'translateX(380%) skewX(-18deg)'}],{duration:kind==='warp'?1100:850},kind);
    animate('halo',halo,[{opacity:0},{opacity:.9,offset:.18},{opacity:.4,offset:.48},{opacity:0}],{duration:kind==='damage'?780:1100},kind);
  }
  function changeName(oldName,event){
    put(ghost,oldName);
    animate('old-name',ghost,[{opacity:.8,transform:'translateY(0)'},{opacity:0,transform:'translateY(-75%)'}],{duration:260},event);
    animate('name',fields.name,[{opacity:0,transform:'translateY(65%)'},{opacity:1,transform:'translateY(0)'}],{duration:600,delay:80},event);
  }
  function announce(kind,location){
    transitions++;arrival.dataset.kind=kind;
    put(arrivalLabel,kind==='enter'?'ENTERING SYSTEM':'DEPARTING SYSTEM');put(arrivalName,location.name);
    arrival.hidden=false;announcementUntil=clock+4;
    animate('arrival',arrival,[{opacity:0,transform:'translateX(-18px)'},{opacity:1,transform:'translateX(0)'}],{duration:620},kind);
    animate('arrival-progress',element('.flight-arrival-progress'),[{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration:4000,easing:'linear'},kind);
    root.dispatchEvent(new CustomEvent('flight-regionchange',{detail:{kind,system:location.system,name:location.name}}));
  }
  function hide(){if(!root.hidden){cancelEffects();previous=null;}root.hidden=true;}
  reduced.addEventListener('change',()=>{if(reduced.matches){cancelEffects();if(previous)put(fields.standing,previous.value===null?'—':signed(previous.value));}});
  function update(state,{dt=0,visible=true,paused=false,warping=false,speed=state?.speed||0}={}){
    if(!state||!visible){hide();return;}
    root.hidden=false;data('paused',String(paused));suspend(paused);clock+=paused?0:Math.max(0,dt);
    const changed=state!==observed;
    if(changed){
      const retainWarp=!!observed&&warping;observed=state;nextUpdate=0;previous=null;cancelEffects();lastDamageAt=-Infinity;delete root.dataset.event;
      if(!retainWarp){region=window.nativeManualFlight.currentRegion(state);announcementUntil=0;arrival.hidden=true;}
    }
    if(announcementUntil&&clock>=announcementUntil){arrival.hidden=true;announcementUntil=0;}
    const sequence=state.manualFlightRegion?.sequence,crossed=sequence!==observedSequence;observedSequence=sequence;
    if(!changed&&!crossed&&clock<nextUpdate)return;nextUpdate=clock+.05;
    let crossing=null;
    if(!warping){
      const next=window.nativeManualFlight.currentRegion(state);
      if(next.system!==region?.system){
        if(next.kind==='system'){crossing='enter';announce(crossing,next);}else if(region?.kind==='system'){crossing='leave';announce(crossing,region);}
      }
      region=next;
    }
    const interstellar=region?.kind!=='system',mode=warping?'warp':state.landed?'docked':speed>1?'flight':'holding';
    data('region',interstellar?'interstellar':'system');data('mode',mode);
    put(fields.code,warping?'WARP':interstellar?'DEEP SPACE':'SYS '+String(region.system).padStart(2,'0'));
    const name=warping?'Warp transit':interstellar?'Interstellar space':region.name;
    put(fields.name,name);root.title=name;
    const position=window.nativeManualFlight.position(state);
    put(fields['coordinate-x'],`X: ${coordinate(position.x)}`);put(fields['coordinate-y'],`Y: ${coordinate(position.y)}`);
    put(fields.mode,({warp:'WARP ENGAGED',docked:'DOCKED',flight:'SUBLIGHT',holding:'STATION KEEPING'})[mode]);
    const local=!interstellar&&!warping,owner=window.nativeFactionStanding;
    const known=local&&(state.devMode||state.discovered?.some(id=>(window.nativeSystemCatalog?.physicalId(id)??Number(id))===region.system));
    const relation=local?owner.relationship(state,region.system,{known:!!known}):null;
    const value=relation?.prestige==null?null:Math.round(relation.prestige),status=relation?.status||'',color=relation?.color||owner.colors.Unknown;
    const standingText=value===null?'—':signed(value);
    put(fields['standing-label'],status);
    if(previous?.color!==color)root.style.setProperty('--standing-color',color);
    data('standing',relation?.tone||'unavailable');
    const reputationLabel=local?`Reputation in ${region.name}: ${standingText}, ${status.toLowerCase()}`:'No local system reputation during '+(warping?'warp transit':'interstellar travel');
    if(reputation.getAttribute('aria-label')!==reputationLabel){reputation.setAttribute('aria-label',reputationLabel);reputation.title=reputationLabel;}
    const sameSystem=previous&&local&&previous.local&&region.system===previous.system;
    const reputationChanged=sameSystem&&value!==null&&previous.value!==null&&(value!==previous.value||status!==previous.status);
    if(reputationChanged&&value!==previous.value&&!reduced.matches&&!suspended){
      const displayed=Number(fields.standing.textContent);tween={from:Number.isFinite(displayed)?displayed:previous.value,to:value,at:clock};
      const flash=value>previous.value?owner.colors['Your territory']:'#ff6577';
      animate('reputation',fields.standing,[{color:flash,transform:'translateY(-2px)',opacity:.65},{color:'#d7f0ef',transform:'translateY(0)',opacity:1}],{duration:900},'reputation');
    }else if(!sameSystem||value!==previous?.value){tween=null;}
    if(tween){
      const progress=Math.min(1,Math.max(0,(clock-tween.at)/.7)),eased=1-(1-progress)**3;
      put(fields.standing,signed(Math.round(tween.from+(tween.to-tween.from)*eased)));if(progress===1)tween=null;
    }else put(fields.standing,standingText);
    put(fields.velocity,String(Math.max(0,Math.round(speed))).padStart(3,'0'));
    const debt=state.shipSimulation?.schedule?.pendingSeconds||0;
    put(fields.sync,debt>.25?'SYNC +'+debt.toFixed(1)+'s':'');
    const definition=window.nativeShipDefinitions.forEntity(state,state,{category:'player'}),maximum=window.nativeShipMotion.profiles.manual(definition).maxSpeed;
    const fill=Math.min(1,Math.max(0,speed/Math.max(1,maximum))),transform='scaleX('+fill.toFixed(3)+')';if(drive.style.transform!==transform)drive.style.transform=transform;
    if(previous){
      const damaged=Number(state.hull)<previous.hull||Number(state.shields)<previous.shields;
      if(crossing){react(crossing,local?color:'#e2c886');changeName(previous.name,crossing);}
      else if(mode!==previous.mode){
        const event=mode==='warp'?'warp':previous.mode==='warp'?'warp-exit':mode;
        react(event,mode==='warp'?'#b3adf0':local?color:'#e2c886');
        animate('speed',element('.flight-speed'),[{opacity:.3,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:750},event);
        if(name!==previous.name)changeName(previous.name,event);
      }else if(damaged&&clock-lastDamageAt>=.7){lastDamageAt=clock;react('damage','#ff6577');}
      else if(reputationChanged)react('reputation',color);
    }
    previous={system:region?.system,local,value,status,color,name,mode,hull:Number(state.hull),shields:Number(state.shields)};
    const label='Flight telemetry: '+name+', '+fields.mode.textContent.toLowerCase()+', '+Math.round(speed)+' units per second. Galactic coordinates '+fields['coordinate-x'].textContent+', '+fields['coordinate-y'].textContent+'. '+reputationLabel;if(root.getAttribute('aria-label')!==label)root.setAttribute('aria-label',label);
  }
  window.nativeFlightStatus=Object.freeze({update,hide,snapshot(){return {region:region&&{...region},mode:root.dataset.mode,hidden:root.hidden,announcement:arrival.hidden?null:{kind:arrival.dataset.kind,name:arrivalName.textContent},transitions,standing:previous&&{value:previous.value,status:previous.status,color:previous.color},reactions,event:root.dataset.event||null};}});
})();
