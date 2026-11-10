/* Native resource/weapon console on the original 600 x 450 scene grid.
   Retains the extracted resourceIcon0/1/2 and weapon artwork; card spacing,
   typography and illumination belong to this read-only presentation. */
(() => {
  'use strict';
  const canvas = document.getElementById('game-hud');
  const ctx = canvas.getContext('2d');
  const colors = ['#bbcad7', '#e5c66f', '#91d4d1'];
  const accents = ['#78d8ff', '#efc66e', '#86e6d2'];
  const keys = ['deuranium', 'antimatter', 'latinum'];
  const names = ['DEURANIUM', 'ANTIMATTER', 'LATINUM'];
  const images = [];
  const weaponIcons = new Map();
  const outlines = new Map();
  let state = null;
  let fontReady = false;
  const feedback=document.createElement('div');feedback.id='hud-feedback';feedback.hidden=true;feedback.setAttribute('aria-hidden','true');canvas.after(feedback);
  const divider=document.createElement('span');divider.className='hud-bank-divider';feedback.append(divider);
  const lowReserves={deuranium:10,antimatter:10,latinum:40};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),animations=new Map(),pausedAnimations=new Set();
  let weaponCells=[],resources=[],visible=false,suspended=false,devView=null,displayClock=0,rect=null,rectDirty=true,renderCount=0,hovered=null;
  const reactions={fire:0,ready:0,gain:0,spent:0};
  const data=(node,key,value)=>{value=String(value);if(node.dataset[key]!==value)node.dataset[key]=value;};
  function framePath(width,squeeze=1){
    const cut=Math.min(5,width/squeeze*.22),x=cut*squeeze,r=2*squeeze;
    return `M${r} 0H${width-x}L${width} ${cut}V34Q${width} 36 ${width-r} 36H${x}L0 ${36-cut}V2Q0 0 ${r} 0Z`;
  }
  function makeCell(kind,index,x,width,color){
    const node=document.createElement('span');node.className='hud-feedback-cell';node.dataset.kind=kind;node.dataset.index=index;
    const squeeze=kind==='weapon'?width/22:1,cut=Math.min(5,width/squeeze*.22),path=framePath(width,squeeze);
    node.style.cssText=`left:${x/282*100}%;top:${4/43*100}%;width:${width/282*100}%;height:${36/43*100}%;--hud-accent:${color};--hud-order:${index};--hud-squeeze:${squeeze};--hud-cut-x:${cut*squeeze/width*100}%;--hud-cut-y:${cut/36*100}%`;
    node.innerHTML='<span class="hud-cell-interior"><span class="hud-cell-sweep"></span><span class="hud-cell-halo"></span>'+(kind==='weapon'?'<span class="hud-charge"><span></span></span>':'')+`</span><svg class="hud-cell-frame" viewBox="0 0 ${width} 36" preserveAspectRatio="none"><path class="hud-frame-base" d="${path}" vector-effect="non-scaling-stroke"/><path class="hud-frame-trace" d="${path}" pathLength="100" vector-effect="non-scaling-stroke"/></svg><span class="hud-cell-indicator"></span>`;feedback.append(node);
    return {node,index,x,width,until:0,event:null,sweep:node.querySelector('.hud-cell-sweep'),halo:node.querySelector('.hud-cell-halo'),charge:node.querySelector('.hud-charge > span')};
  }
  resources=keys.map((key,i)=>({...makeCell('resource',i,90+i*64,60,accents[i]),key,value:null,text:null,warning:false}));
  function cancelEffects(){for(const animation of animations.values())animation.cancel();animations.clear();pausedAnimations.clear();}
  function animate(key,node,frames,duration=750,easing='cubic-bezier(.2,.7,.2,1)'){
    animations.get(key)?.cancel();
    if(!visible||suspended||reduced.matches)return;
    const animation=node.animate(frames,{duration,easing});animation.id='hud:'+key;animations.set(key,animation);
    const release=()=>{if(animations.get(key)===animation)animations.delete(key);pausedAnimations.delete(animation);};animation.finished.then(release,release);
  }
  function react(cell,kind){
    reactions[kind]++;cell.event=kind;cell.until=displayClock+.9;data(cell.node,'event',kind);
    const color={fire:'#e5faff',ready:'#8cddd9',gain:'#9be9c1',spent:'#efc78c'}[kind];cell.node.style.setProperty('--hud-event-color',color);
    const key=cell.node.dataset.kind+'-'+cell.index;
    animate(key+'-sweep',cell.sweep,[{opacity:0,transform:'translateX(-130%) skewX(-18deg)'},{opacity:.8,offset:.22},{opacity:0,transform:'translateX(380%) skewX(-18deg)'}],kind==='fire'?650:850);
    animate(key+'-halo',cell.halo,[{opacity:0},{opacity:kind==='fire'?1:.9,offset:.15},{opacity:.35,offset:.5},{opacity:0}],kind==='fire'?750:1050,'linear');
  }
  function clearHover(){if(hovered)data(hovered.node,'hover',false);hovered=null;}
  function setPaused(value){
    if(suspended===value)return;suspended=value;data(feedback,'paused',value);
    if(value){clearHover();for(const animation of feedback.getAnimations({subtree:true}))if(animation.playState==='running'){animation.pause();pausedAnimations.add(animation);}}
    else{for(const animation of pausedAnimations)if(animation.playState==='paused')animation.play();pausedAnimations.clear();}
  }
  function hide(){visible=false;feedback.hidden=true;clearHover();cancelEffects();}
  function observe(value,events){
    const fresh=value!==state||devView!==!!value.devMode;let dirty=fresh;
    if(fresh){cancelEffects();for(const key of Object.keys(reactions))reactions[key]=0;for(const cell of [...resources,...weaponCells]){cell.event=null;cell.until=0;data(cell.node,'event','none');}}
    state=value;devView=!!value.devMode;
    for(const cell of resources){
      const amount=devView?Infinity:Number(value[cell.key])||0,text=devView?'∞':formatAmount(amount);
      if(text!==cell.text){dirty=true;if(!fresh&&cell.text!==null&&events)react(cell,amount>cell.value?'gain':'spent');}
      cell.value=amount;cell.text=text;cell.warning=!devView&&amount<lowReserves[cell.key];data(cell.node,'warning',cell.warning);
    }
    const eq=value.shipEquipment,slots=eq?.slots?.weapon,legacy=value.weapons||[1,null,null],count=Math.max(3,Math.min(8,slots?.length??legacy.length));
    if(count!==weaponCells.length){
      clearHover();for(const cell of weaponCells)cell.node.remove();
      for(const [key,animation] of animations)if(key.startsWith('weapon-')){animation.cancel();animations.delete(key);pausedAnimations.delete(animation);}
      weaponCells=Array.from({length:count},(_,i)=>makeCell('weapon',i,i*78/count,66/count,'#7ee8e5'));dirty=true;
    }
    const now=window.nativeSimulation?.seconds(value)||0,disabled=value.hull<=0||value.phase==='disabled'||value.phase==='destroyed';
    for(const cell of weaponCells){
      const instance=eq?.instances?.[slots?.[cell.index]],modelId=slots?instance?.modelId??null:legacy[cell.index]??null,model=window.nativeShipEquipment?.model(modelId)||window.VexedMirrorWeapons?.find(w=>w.id===Number(modelId));
      const identity=instance?.id??modelId,changed=fresh||cell.instanceId!==identity||cell.modelId!==modelId||cell.modelRecharge!==model?.recharge;
      const deadline=Number(instance?.readyAt)||0,remaining=Math.max(0,deadline-now);
      if(changed){
        cell.instanceId=identity;cell.modelId=modelId;cell.name=model?.name||'Empty';cell.modelRecharge=model?.recharge;
        cell.recharge=model?(window.nativeWeaponRules?.weaponSpec(model,window.nativeCombatShots?.weaponVisual(model)?.kind||'beam').recharge||0):0;
        cell.deadline=deadline;cell.charging=remaining>0;cell.event=null;cell.until=0;data(cell.node,'event','none');dirty=true;
      }else{
        if(events&&!disabled&&deadline>cell.deadline+1e-7&&deadline>now)react(cell,'fire');
        else if(events&&!disabled&&cell.charging&&remaining<=0)react(cell,'ready');
        cell.deadline=deadline;cell.charging=remaining>0;
      }
      cell.remaining=remaining;cell.ready=remaining<=0;cell.occupied=Number(modelId)>0;
      cell.fraction=cell.occupied?(cell.ready?1:Math.max(0,1-remaining/Math.max(.001,cell.recharge))):0;
      const transform='scaleX('+cell.fraction.toFixed(3)+')';if(cell.charge.style.transform!==transform)cell.charge.style.transform=transform;
      data(cell.node,'occupied',cell.occupied);data(cell.node,'charging',cell.charging);data(cell.node,'disabled',disabled);
      if(cell.occupied&&!weaponIcons.has(Number(modelId))){
        const icon=new Image();icon.onload=render;icon.src='../flashtrek-broken-mirror/showcase-assets/weapon-icon-remastered-'+Number(model?.visualId??modelId)+'.png';weaponIcons.set(Number(modelId),icon);
      }
    }
    for(const cell of [...resources,...weaponCells])if(cell.event&&displayClock>=cell.until){cell.event=null;data(cell.node,'event','none');}
    const weaponNames=weaponCells.map(cell=>'Weapon '+(cell.index+1)+': '+cell.name+(cell.occupied?(disabled?', disabled':cell.ready?', ready':', recharging '+cell.remaining.toFixed(1)+' seconds'):''));
    const label=[...weaponNames,...resources.map((cell,i)=>names[i]+': '+(devView?'unlimited':cell.text)+(cell.warning?', low reserve':''))].join(', ');
    if(canvas.getAttribute('aria-label')!==label)canvas.setAttribute('aria-label',label);
    if(dirty)render();
  }
  function frame(value,{dt=0,visible:show=true,paused=false}={}){
    if(!value){hide();return;}
    const wasVisible=visible;visible=!!show;feedback.hidden=!visible;setPaused(!!paused);displayClock+=paused?0:Math.max(0,Number(dt)||0);
    if(!visible){cancelEffects();clearHover();}
    observe(value,visible&&wasVisible&&!suspended);
  }
  document.getElementById('game').addEventListener('pointermove',event=>{
    if(!visible||suspended)return;
    if(rectDirty||!rect){rect=canvas.getBoundingClientRect();rectDirty=false;}
    const x=(event.clientX-rect.left)/rect.width*282,y=(event.clientY-rect.top)/rect.height*43;
    const next=y>=4&&y<=40?[...weaponCells,...resources].find(cell=>x>=cell.x&&x<=cell.x+cell.width):null;
    if(next!==hovered){clearHover();hovered=next;if(hovered)data(hovered.node,'hover',true);}
  });
  document.getElementById('game').addEventListener('pointerleave',clearHover);
  addEventListener('native-displaychange',()=>{rectDirty=true;clearHover();});
  reduced.addEventListener('change',()=>{if(reduced.matches)cancelEffects();});

  function image(file) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('HUD artwork unavailable: ' + file));
      im.src = 'assets/hud/' + file;
    });
  }
  function formatAmount(value) {
    value = Math.floor(Number(value));
    if (Number.isNaN(value)) return '0';
    if (Math.abs(value) >= 1000000000) return Math.round(value / 100000000) / 10 + 'B';
    if (Math.abs(value) >= 1000000) return Math.round(value / 100000) / 10 + 'M';
    return String(value);
  }
  function outline(width) {
    if(!outlines.has(width))outlines.set(width,new Path2D(framePath(width)));
    return outlines.get(width);
  }
  function line(x1, y1, x2, y2, width, color, alpha) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function cell(width, color, edgeAlpha, topAlpha) {
    const shape=outline(width);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = .06;
    ctx.stroke(shape);
    const surface=ctx.createLinearGradient(0,0,width,36);surface.addColorStop(0,'#102737');surface.addColorStop(1,'#06131d');
    ctx.fillStyle = surface;
    ctx.globalAlpha = .93;
    ctx.fill(shape);
    ctx.strokeStyle = color;
    ctx.lineWidth = .35;
    ctx.globalAlpha = edgeAlpha;
    ctx.stroke(shape);
    ctx.globalAlpha = 1;
    line(5, .8, width-8, .8, .6, color, topAlpha*.5);
  }
  function text(value, x, baseline, size, color, align) {
    ctx.font = `700 ${size}px VexedHudArial`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, baseline);
  }
  function render() {
    if (!state || !fontReady || images.length !== 4) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    rect=r;rectDirty=false;renderCount++;
    const d = devicePixelRatio || 1;
    const width = Math.round(r.width * d), height = Math.round(r.height * d);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(canvas.width / 282, 0, 0, canvas.height / 43, 0, 0);
    ctx.clearRect(0, 0, 282, 43);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(0, 4);

    const weapons = weaponCells.map(cell=>cell.modelId);
    const weaponCount=Math.max(3,Math.min(8,weapons.length));
    for (let i = 0; i < weaponCount; i++) {
      ctx.save();
      ctx.translate(weaponCells[i].x, 0);ctx.scale(3/weaponCount,1);
      const occupied = Number(weapons[i]) > 0;
      const color = '#7ee8e5';
      cell(22, color, occupied ? .5 : .2, occupied ? .85 : .25);
      ctx.globalAlpha=occupied?.1:.035;ctx.fillStyle=color;ctx.fillRect(4,3,14,8);ctx.globalAlpha=1;
      text('W' + (i + 1), 11, 9.5, 6, occupied ? '#d3f6f3' : '#607a86', 'center');
      if (occupied) {
        // Original hudWeaponIcon1: (330,27), scale 30%; sprite bounds
        // (-23.35,-26) to (25.85,28.35) before that scale.
        const weaponId = Number(weapons[i]);
        const icon = weaponIcons.get(weaponId);
        if (icon?.complete && icon.naturalWidth) ctx.drawImage(icon, 3.25, 14.5, 15.5, 16.5);
        else if (weaponId === 1) ctx.drawImage(images[3], 3.62, 14.7, 14.76, 16.305);
        line(4.6, 33, 17.4, 33, 1, color, .18);
      } else {line(7,23,15,23,.5,color,.25);line(11,19,11,27,.5,color,.25);}
      ctx.restore();
    }

    for (let i = 0; i < 3; i++) {
      ctx.save();
      const cellWidth=resources[i].width;
      ctx.translate(resources[i].x, 0);
      cell(cellWidth, accents[i], .4, .8);
      line(6, 12.5, cellWidth-6, 12.5, .4, accents[i], .1);
      // Keep the original extracted icon, centered in a softly lit dock.
      const glow=ctx.createRadialGradient(14,23,1,14,23,10);glow.addColorStop(0,accents[i]+'35');glow.addColorStop(1,accents[i]+'00');ctx.fillStyle=glow;ctx.fillRect(4,13,20,20);
      ctx.beginPath();ctx.arc(14,23,9.5,0,Math.PI*2);ctx.strokeStyle=accents[i]+'25';ctx.lineWidth=.4;ctx.stroke();
      ctx.drawImage(images[i], 5.25, 14.25, 17.5, 17.5);
      text(names[i], 6, 9.5, 5.6, colors[i], 'left');
      const amount = state.devMode ? '∞' : formatAmount(state[keys[i]]);
      let size = 12.2;
      ctx.font = `700 ${size}px VexedHudArial`;
      while (ctx.measureText(amount).width > 29 && size > 8) {
        size-=.5;
        ctx.font = `700 ${size}px VexedHudArial`;
      }
      ctx.shadowColor=accents[i];ctx.shadowBlur=1.4;
      text(amount, cellWidth-6, 29, size, colors[i], 'right');ctx.shadowBlur=0;
      for(let tick=0;tick<3;tick++)line(cellWidth-14+tick*3,34,cellWidth-12+tick*3,34,.6,accents[i],.35);
      ctx.restore();
    }
    ctx.restore();
  }

  const font = new FontFace('VexedHudArial', 'url(assets/hud/Arial-bold.ttf)', {weight: '700'});
  const ready = Promise.all([
    font.load().then(face => { document.fonts.add(face); fontReady = true; }),
    Promise.all(['resourceIcon0.svg', 'resourceIcon1.svg', 'resourceIcon2.svg', 'weapon1.svg'].map(image))
      .then(loaded => images.push(...loaded))
  ]).then(render);
  window.vexedHud = {
    ready,
    update(value) {
      if(value)observe(value,visible&&!suspended);
    },frame,hide,
    snapshot(){return {visible,paused:suspended,renderCount,animations:animations.size,reactions:{...reactions},resources:resources.map(cell=>({key:cell.key,value:cell.value,text:cell.text,warning:cell.warning,event:cell.event})),weapons:weaponCells.map(cell=>({slot:cell.index,instanceId:cell.instanceId,modelId:cell.modelId,recharge:cell.recharge,remaining:cell.remaining,ready:cell.ready,fraction:cell.fraction,event:cell.event}))};}
  };
  new ResizeObserver(render).observe(canvas);
})();
