/* Read-only defense console. Damage notifications come from the shared hit owner. */
(() => {
  'use strict';
  const root=document.createElement('section');root.id='ship-vitals';root.hidden=true;root.setAttribute('aria-label','Ship defenses');
  const icons={shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z',hull:'M12 2 5 9v11h14V9zM9 10h6v7H9z'};
  const icon=kind=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="${icons[kind]}"/></svg>`;
  root.innerHTML=`<div class="vitals-console"><div class="vitals-meters">${['shield','hull'].map(kind=>`<div class="vitals-meter" data-vital="${kind}"><div class="vitals-meter-heading">${icon(kind)}<span>${kind==='shield'?'SHIELDS':'HULL'}</span><strong class="vitals-percent"></strong></div><div class="vitals-track" role="meter" aria-label="${kind==='shield'?'Shield energy':'Hull integrity'}" aria-valuemin="0"><span class="vitals-loss" aria-hidden="true"></span><span class="vitals-fill" aria-hidden="true"><span class="vitals-scan"></span></span><span class="vitals-hit-ripple" aria-hidden="true"></span><svg class="vitals-hit-arcs" viewBox="0 0 240 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0 7 14 5 23 9 34 2 44 7 55 4 63 9 76 3 87 6 99 2 109 8 119 4 132 10 144 3 154 7 168 2 181 8 192 4 206 9 220 3 230 7 240 5"/><path d="m28 7 12 4 8-5m43 0 9 5 12-4m40 0 10 4 11-5m35 1 9-5 7 3"/></svg></div><span class="vitals-hit-flash" aria-hidden="true"></span><div class="vitals-readout"><span></span></div></div>`).join('')}</div></div>`;
  document.querySelector('#game').append(root);
  const find=selector=>root.querySelector(selector);
  const meters=Object.fromEntries(['shield','hull'].map(kind=>{const node=find(`[data-vital="${kind}"]`);return [kind,{node,track:node.querySelector('.vitals-track'),fill:node.querySelector('.vitals-fill'),loss:node.querySelector('.vitals-loss'),flash:node.querySelector('.vitals-hit-flash'),ripple:node.querySelector('.vitals-hit-ripple'),arcs:node.querySelector('.vitals-hit-arcs'),percent:node.querySelector('.vitals-percent'),label:node.querySelector('.vitals-readout span')}];}));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),animations=new Map(),pausedAnimations=new Set();
  const number=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):0),fmt=value=>number(value).toLocaleString(undefined,{maximumFractionDigits:1});
  const put=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  const attr=(node,key,value)=>{value=String(value);if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
  const data=(node,key,value)=>{value=String(value);if(node.dataset[key]!==value)node.dataset[key]=value;};
  let observed=null,previous=null,values=null,clock=0,impactUntil=0,paused=false,shieldHits=0,hullHits=0,lastImpact=null;
  const recoveryUntil={shield:0,hull:0};
  function cancel(){for(const animation of animations.values())animation.cancel();animations.clear();pausedAnimations.clear();}
  function animate(key,node,frames,duration=650,delay=0,easing='cubic-bezier(.16,.7,.2,1)'){
    animations.get(key)?.cancel();
    if(root.hidden||paused||reduced.matches)return;
    const animation=node.animate(frames,{duration,delay,easing});animation.id='vitals:'+key;animations.set(key,animation);
    const release=()=>{if(animations.get(key)===animation)animations.delete(key);pausedAnimations.delete(animation);};animation.finished.then(release,release);
  }
  function suspend(value){
    if(paused===value)return;paused=value;data(root,'paused',value);
    if(value){for(const animation of root.getAnimations({subtree:true})){if(animation.playState==='running'){animation.pause();pausedAnimations.add(animation);}}}
    else{for(const animation of pausedAnimations)if(animation.playState==='paused')animation.play();pausedAnimations.clear();}
  }
  function hide(){root.hidden=true;cancel();impactUntil=0;}
  function meter(kind,value,maximum,label){
    const m=meters[kind],ratio=maximum>0?Math.min(1,value/maximum):0,transform=`scaleX(${ratio})`;
    const level=maximum<=0?'absent':ratio<=.25?'critical':ratio<=.5?'low':'healthy';
    if(m.fill.style.transform!==transform)m.fill.style.transform=transform;
    if(m.loss.style.transform!==transform)m.loss.style.transform=transform;
    put(m.percent,maximum>0?Math.round(ratio*100)+'%':'—');put(m.label,label);
    attr(m.track,'aria-valuemax',Math.max(1,maximum));attr(m.track,'aria-valuenow',Math.min(maximum,value));attr(m.track,'aria-valuetext',`${fmt(value)} of ${fmt(maximum)}. ${label}`);data(m.node,'level',level);
    return {value,maximum,ratio,label,level};
  }
  function update(state,{dt=0,visible=true,paused:isPaused=false,safeBottom=0}={}){
    if(!state||!visible){hide();return;}
    const fresh=state!==observed||previous?.type!==state.shipType;
    if(fresh){cancel();observed=state;previous=null;impactUntil=0;lastImpact=null;shieldHits=0;hullHits=0;recoveryUntil.shield=recoveryUntil.hull=0;}
    root.hidden=false;suspend(isPaused);clock+=isPaused?0:number(dt);
    const inset=String(number(safeBottom));if(root.style.getPropertyValue('--vitals-safe-bottom')!==inset)root.style.setProperty('--vitals-safe-bottom',inset);
    const d=window.nativeShipDefinitions.forEntity(state),hull=number(state.hull),shields=number(state.shields),hullMax=number(d.hull),shieldMax=number(d.ratedShields??d.shields),capacity=number(d.shields),condition=number(d.shieldCondition);
    if(previous)for(const [kind,value,old,maximum,oldMax] of [['shield',shields,previous.shields,shieldMax,previous.shieldMax],['hull',hull,previous.hull,hullMax,previous.hullMax]]){
      if(maximum!==oldMax||value<old)recoveryUntil[kind]=0;
      else if(value>old+.000001)recoveryUntil[kind]=clock+.8;
    }
    const recovering=clock<recoveryUntil.shield,repairing=clock<recoveryUntil.hull;
    data(meters.shield.node,'recovery',recovering);data(meters.hull.node,'recovery',repairing);
    const shieldLabel=!shieldMax?'NOT FITTED':!capacity?'GENERATOR OFFLINE':condition<100?'GEN '+fmt(condition)+'%':shields<=0?'DEPLETED':recovering?(shields>=capacity?'RESTORED':'RECHARGING'):'ONLINE';
    const hullLabel=state.phase==='destroyed'||hull<=0?'DESTROYED':state.phase==='disabled'?'DISABLED':hull<=hullMax*.25?'CRITICAL':repairing?(hull>=hullMax?'RESTORED':'REPAIRING'):hull<hullMax?'DAMAGED':'NOMINAL';
    values={shield:meter('shield',shields,shieldMax,shieldLabel),hull:meter('hull',hull,hullMax,hullLabel),shieldCapacity:capacity,shieldCondition:condition};
    const critical=state.phase==='disabled'||hull<=hullMax*.25;
    data(root,'critical',critical);data(root,'shieldDown',shields<=0||capacity<=0);
    if(clock>=impactUntil)data(root,'impact','none');
    previous={type:state.shipType,hull,shields,hullMax,shieldMax};
  }
  function impact(descriptor,result){
    if(descriptor.entity!==observed||descriptor.entity!==descriptor.state||!result.ok||result.amount<=0||root.hidden||paused)return;
    const kind=result.hullDamage>0?'hull':'shield',hit=result.contacts[kind]?.local;
    const length=Math.hypot(hit?.x||0,hit?.y||0)||1,x=(hit?.x||0)/length,y=(hit?.y||0)/length;
    const side=!hit?'DIRECT':Math.abs(x)>Math.abs(y)?x<0?'PORT':'STARBOARD':y<0?'FORWARD':'AFT';
    data(root,'impact',kind);
    lastImpact={kind,side,shield:result.absorbed,hull:result.hullDamage};impactUntil=clock+1.8;
    for(const [channel,amount] of [['shield',result.absorbed],['hull',result.hullDamage]]){
      if(amount<=0)continue;
      if(channel==='shield')shieldHits++;else hullHits++;
      const m=meters[channel],before=result.before[channel==='shield'?'shields':'hull'],max=values?.[channel].maximum||1;
      const old=Math.min(1,before/max),next=Math.max(0,(before-amount)/max);
      const strength=Math.min(1,Math.sqrt(amount/max)*2.2),peak=.5+strength*.5,collapsed=channel==='shield'&&result.shields<=0;
      m.node.style.setProperty('--hit-at',(next*100).toFixed(2)+'%');
      m.loss.style.transform=`scaleX(${next})`;
      animate(channel+'-loss',m.loss,[{transform:`scaleX(${old})`,opacity:.9},{transform:`scaleX(${next})`,opacity:.25}],850+strength*250,100);
      animate(channel+'-flash',m.flash,collapsed?[{opacity:1},{opacity:.05,offset:.13},{opacity:.85,offset:.23},{opacity:0,offset:.38},{opacity:.6,offset:.5},{opacity:0}]:[{opacity:0},{opacity:peak,offset:.05},{opacity:.15,offset:.15},{opacity:peak*.7,offset:.23},{opacity:0}],collapsed?1100:500+strength*350,0,'linear');
      animate(channel+'-ripple',m.ripple,[{opacity:0,transform:'translateX(-120%) skewX(-22deg) scaleX(.7)'},{opacity:peak,offset:.12},{opacity:peak*.7,offset:.4},{opacity:0,transform:'translateX(420%) skewX(-22deg) scaleX(1.3)'}],650+strength*200);
      animate(channel+'-arcs',m.arcs,[{opacity:0,transform:'scaleY(.5)'},{opacity:peak,offset:.07},{opacity:.05,offset:.15},{opacity:peak*.8,transform:'scaleY(1.3)',offset:.24},{opacity:0,offset:.36},{opacity:peak*.4,offset:.48},{opacity:0,transform:'scaleY(.7)'}],collapsed?1000:450+strength*250,0,'linear');
      if(channel==='hull'){const kick=1+strength*2;animate('hull-jolt',m.node,[{transform:'translateX(0)'},{transform:`translateX(${-kick}px)`,offset:.1},{transform:`translateX(${kick*.6}px)`,offset:.25},{transform:'translateX(-.5px)',offset:.4},{transform:'translateX(0)'}],350+strength*150,0,'linear');}
    }
  }
  reduced.addEventListener('change',()=>{if(reduced.matches)cancel();});
  window.nativeShipVitals=Object.freeze({update,hide,impact,snapshot(){return {hidden:root.hidden,paused,shieldHits,hullHits,lastImpact:lastImpact&&{...lastImpact},values:values&&{...values,shield:{...values.shield},hull:{...values.hull}},animations:animations.size};}});
})();
