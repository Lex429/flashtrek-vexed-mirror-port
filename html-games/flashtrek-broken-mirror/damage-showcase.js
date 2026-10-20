/* Visual showcase: installed ship textures; formulas from rebirth-combat.as,
   rebirth-destruction.as, rebirth-debris.as and rebirth-destruction.js.
   Combat ratings are extracted from the installed game; icons use transparent remasters. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('scene'),ctx=canvas.getContext('2d'),base='showcase-assets/';
  const asteroidCutCanvas=document.createElement('canvas');asteroidCutCanvas.width=canvas.width;asteroidCutCanvas.height=canvas.height;const asteroidCutCtx=asteroidCutCanvas.getContext('2d');
  const asteroidCutMaskCanvas=document.createElement('canvas');asteroidCutMaskCanvas.width=canvas.width;asteroidCutMaskCanvas.height=canvas.height;const asteroidCutMaskCtx=asteroidCutMaskCanvas.getContext('2d');
  const names=['Intact','Light damage','Heavy damage','Severe damage'],colors={enemy:'#ff7777',fleet:'#9cffb4',neutral:'#ffd66e'};
  const state={ready:false,ship:null,hull:100,shields:100,shieldsEnabled:true,shieldCharge:100,cloaked:false,damage:26,paused:false,slow:false,rotate:false,compare:false,sound:false,zoom:1,angle:0,target:'enemy',destroyed:false,time:0,shots:[],particles:[],debris:[],stationFragments:[],stationSparks:[],stationGlassCracks:[],stationArcs:[],flash:null,sequence:null,miningSequence:null,miningSplit:null,asteroidOreField:null,hits:0,weaponReadyAt:{},asteroidTransition:null,asteroidBlast:null};
  let catalog,combat,shooter,shipPicker,asteroidData,structureData,last=performance.now(),selectionToken=0,asteroidAlphaCache=null,asteroidShieldCache=null;const images=new Map(),pendingImages=new Map(),audio=new Set();
  let lastHit=null;
  const healthOverrides={};
  try{const saved=JSON.parse(localStorage.getItem('creatureHealth')||'{}');for(const [id,v] of Object.entries(saved))if(Number.isFinite(v)&&v>=1&&v<=100000)healthOverrides[id]=v;}catch{}
  const asteroidMaxHealth=()=>Math.round(clamp(45+(state.ship?.previewSize||250)*.19,65,150));
  const stats=()=>droneShip()?{hull:state.ship.maxHealth,shields:0,weaponsRating:0}:structure()||artworkOnlyShip()?{hull:100,shields:0,weaponsRating:0}:asteroid()?{hull:state.ship.maxHealth||asteroidMaxHealth(),shields:0,weaponsRating:0}:creature()?{hull:healthOverrides[state.ship.id]||combat?.creatures?.[state.ship.id]?.health||100,shields:0,weaponsRating:0}:combat.ships[state.ship.id]||(tugDamageShip()?{hull:100,shields:0,weaponsRating:0}:undefined),firingStats=()=>combat.ships[shooter.id];
  const number=n=>Number(n.toFixed(2)).toLocaleString();
  const hullPoints=()=>state.hull*stats().hull/100,shieldPoints=()=>state.shields*stats().shields/100;
  function weaponCards(){
    if(!combat||!shooter)return;
    $('firing-rating').textContent=`Weapon damage and recharge are independent of ship`;
    const [kind,index]=$('weapon-select').value.split(':');
    const w=catalog.weapons[kind]?.[Number(index)];
    if(!w)return;
    $(kind+'-style').value=index;
    $('fire-weapon').dataset.fire=kind;
    $('fire-weapon').className='fire '+kind;
    $('weapon-icon').src=base+w.icon;$('weapon-icon').alt=w.name;
    $('weapon-rating').textContent=`Damage ${number(w.baseDamage)}`;
    $('weapon-details').textContent=`Recharge ${number(w.recharge/13)} seconds`;
    $('selected-weapon-icon').src=base+w.icon;
    $('selected-weapon-name').textContent=w.name;
    document.querySelectorAll('[data-weapon]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.weapon===kind+':'+index)));
    updateRecharge();

  }

  function updateRecharge(){
    if(!catalog||!state.ship)return;
    const [kind,index]=$('weapon-select').value.split(':'),weapon=catalog.weapons[kind]?.[Number(index)];
    if(!weapon)return;
    const bypass=$('visual-damage').checked,remaining=bypass?0:Math.max(0,(state.weaponReadyAt[weapon.id]||0)-state.time),duration=weapon.recharge*1000/13;
    const percent=duration>0?Math.max(0,Math.min(100,(1-remaining/duration)*100)):100;
    const status=bypass?'Visual mode: no recharge':remaining>0?`${(Math.ceil(remaining/100)/10).toFixed(1)}s until ready`:'Ready to fire';
    const bar=$('weapon-recharge-bar');$('weapon-recharge-fill').style.width=percent+'%';
    $('weapon-recharge').dataset.state=remaining>0?'charging':'ready';
    if($('weapon-recharge-status').textContent!==status)$('weapon-recharge-status').textContent=status;
    bar.setAttribute('aria-valuenow',String(Math.round(percent)));bar.setAttribute('aria-valuetext',status);
    $('fire-weapon').disabled=!state.ready||state.destroyed||!!state.eggHatch||remaining>0||(!!state.repair||!!state.droneBattle?.isBusy())&&!currentDroneTarget();
    $('drone-test-fire').disabled=$('fire-weapon').disabled;
  }

  const movingCreature=()=>creature()&&!egg();
  const larva=()=>state.ship?.creatureType==='larva'||[69,70].includes(state.ship?.id);
  const frameFile=()=>state.ship.frames[stage()]||state.ship.frames[0];
  const egg=()=>state.ship?.creatureType==='egg'||[67,68].includes(state.ship?.id);
  const babyFile=()=>state.ship.babyFile||`creatures/larva-${state.ship.id===67?'a':'b'}-intact.png`;
  const droneShip=()=>state.ship?.kind==='drone';
  const asteroid=()=>state.ship?.kind==='asteroid';
  const structure=()=>state.ship?.kind==='structure'||state.ship?.kind==='turret';
  const animatedStructure=()=>structure()&&!!state.ship.damageReady;
  const creature=()=>state.ship?.kind==='creature';
  const intactOnly=()=>state.ship?.artworkStatus==='intact-only';
  const artworkOnlyShip=()=>state.ship?.kind==='ship'&&intactOnly();
  const tugDamageShip=()=>state.ship?.id===416&&!!state.ship.damageReady;
  const biological=()=>!!window.starterShips.get(state.ship?.id)?.biological;
  const biology=()=>window.starterShips.get(state.ship?.id)?.biology;
  const starter=()=>window.starterShips.get(state.ship?.id);
  const enhancedShip=()=>!!starter()||[56,57,58,59].includes(state.ship?.id);
  const shipEffects=()=>starter()?.effects||(state.ship?.id===56?window.constitutionTugEffects:state.ship?.id===57?window.tugEffects:state.ship?.id===58?window.olympicEffects:window.cthiaEffects);
  const debrisImpacts=window.createDebrisImpacts();
  let nearbyAsteroids=[];
  function reportEnvironmentalImpact(event){
    $('debris-impact-status').textContent=`${event.source==='explosion'?'Blast':'Debris'} hit: ${event.kind==='shield'?'shield flash':'hull sparks'}. Shields and hull unchanged.`;
    if(event.kind==='shield')playSound('shieldhit',.08);
  }
  const environmentalImpacts=window.createEnvironmentalImpacts({
    getShips:()=>shooter?[{id:'nearby',...emitter(),radius:Math.max(emitter().w,emitter().h)*.55}]:[],
    getAsteroids:()=>nearbyAsteroids.filter(rock=>!rock.destroyed),
    onShipImpact:(_,event)=>reportEnvironmentalImpact(debrisImpacts.impact(event,emitter(),images.get(shooter.frames[0]),state,event.kind)),
    onAsteroidHit:destroyNearbyAsteroid
  });
  function resetNearbyAsteroids(){
    const l=state.ship?layout():{x:540,y:253};
    nearbyAsteroids=(asteroidData||[]).slice(0,3).map((rock,i)=>({id:`nearby-rock-${i}`,file:rock.file,x:l.x+[-185,180,-145][i],y:l.y+[-105,105,140][i],size:[36,46,32][i],radius:[18,23,16][i],destroyed:false}));
  }
  function destroyNearbyAsteroid(rock,event){
    if(rock.destroyed)return;rock.destroyed=true;rock.destroyedAt=state.time;
    const im=images.get(rock.file);
    if(im)for(let i=0;i<9;i++){
      const piece=extractRockShard(im,im.width*(.2+Math.random()*.6),im.height*(.2+Math.random()*.6),im.width*.1);if(!piece)continue;
      const angle=i*Math.PI*2/9,speed=65+Math.random()*85;
      state.debris.push({x:rock.x,y:rock.y,texture:piece.texture,w:piece.w*rock.size,h:piece.h*rock.size,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,angle,spin:(Math.random()-.5)*6,born:state.time,ttl:1900,asteroidShard:true});
    }
    rockBurst(rock);burst(rock,.65);playSound('explodesmall',.05);
    $('debris-impact-status').textContent=`${event.kind==='explosion'?'Blast':'Debris'} destroyed a nearby asteroid. Ship impacts cause no damage.`;
  }
  function stepEnvironmentalDebris(piece,oldX,oldY){
    environmentalImpacts.stepDebris(piece,oldX,oldY,state.time,{skipShips:true});
    const impact=debrisImpacts.step(piece,oldX,oldY,emitter(),images.get(shooter.frames[0]),state);
    if(impact)reportEnvironmentalImpact(impact);
  }
  function drawEnvironmentalScene(){
    for(const rock of nearbyAsteroids)if(!rock.destroyed){const im=images.get(rock.file);if(im)shipImage(im,rock.x,rock.y,rock.size,rock.size);}
    environmentalImpacts.draw(ctx,state.time);
  }
  function drawNearbyShip(source){
    const flash=debrisImpacts.currentFlash(),c=Math.cos(source.a),s=Math.sin(source.a),dx=(flash?.x||0)-source.centerX,dy=(flash?.y||0)-source.centerY;
    const impact=flash?{...flash,x:dx*c+dy*s,y:-dx*s+dy*c,kind:flash.source}:null;
    ctx.save();ctx.translate(source.centerX,source.centerY);ctx.rotate(source.a);
    if(impact)window.drawShowcaseShieldSurface(ctx,0,0,source.w,source.h,shieldColor(shooter),1,state.time,{refract:true,impact});
    shipImage(images.get(shooter.frames[0]),0,0,source.w,source.h);
    if(impact)window.drawShowcaseShieldSurface(ctx,0,0,source.w,source.h,shieldColor(shooter),1,state.time,{front:true,impact});
    ctx.restore();debrisImpacts.draw(ctx,source,state.time,shieldColor(shooter));
    label('FIRING SHIP · '+shooter.name.toUpperCase(),source.centerX,source.centerY+64);
  }
  const cthiaOptions={lights:true,damage:true,anchors:false,impact:null,toolDemo:false};
  let cthiaFragments=[[],[],[],[]],stationFragmentTemplates=[[],[],[],[],[]];
  const artworkLightLayers=new Map();
  const damageTargets=new Map();
  const stationConfigs={
    272:{breaches:[{x:-.30,y:-.28,r:.065,stage:1},{x:.35,y:.27,r:.07,stage:2},{x:-.16,y:.16,r:.074,stage:3},{x:.29,y:-.34,r:.035,stage:3},{x:.015,y:-.015,r:.064,stage:3}],rings:[[.43,28,-.05],[.265,20,.07]],lightColors:['#9feaff','#ffcf86']},
    290:{breaches:[{x:-.23,y:-.25,r:.072,stage:1},{x:.23,y:.25,r:.078,stage:2},{x:-.24,y:.25,r:.095,stage:3},{x:.09,y:-.03,r:.11,stage:3}],points:[[-.40,-.40],[-.34,-.35],[-.31,-.28],[.40,-.40],[.34,-.35],[.31,-.28],[-.40,.40],[-.34,.35],[-.31,.28],[.40,.40],[.34,.35],[.31,.28],[-.20,0],[.20,0],[0,-.20],[0,.20]],lightColors:['#ffb963','#ef823c']},
    309:{breaches:[{x:-.30,y:-.28,r:.064,stage:1},{x:.38,y:.01,r:.08,stage:2},{x:-.27,y:.26,r:.11,stage:3},{x:0,y:0,r:.07,stage:3}],rings:[[.44,30,.03],[.19,15,.05]],lightColors:['#ffc168','#fff0aa']},
    313:{breaches:[{x:-.31,y:-.20,r:.065,stage:1},{x:.29,y:.19,r:.095,stage:2},{x:.17,y:-.23,r:.075,stage:3},{x:0,y:0,r:.088,stage:3}],rings:[[.39,30,.04],[.29,24,0]],lightColors:['#b4ff65','#f0ffac']},
    278:{breaches:[{x:-.17,y:-.29,r:.064,stage:1},{x:.07,y:-.25,r:.067,stage:2},{x:.10,y:.16,r:.075,stage:3},{x:-.20,y:.32,r:.075,stage:3}],points:[[-.28,-.36],[.28,-.36],[-.20,-.24],[.20,-.24],[0,-.26],[-.20,-.07],[.20,-.07],[-.06,.14],[.06,.14],[-.27,.34],[.27,.34],[-.05,.39],[.05,.39]],lightColors:['#ffd58c','#e1f3ff']},
    280:{breaches:[{x:-.19,y:-.22,r:.065,stage:1},{x:.22,y:.19,r:.074,stage:2},{x:0,y:0,r:.080,stage:3},{x:-.22,y:.19,r:.067,stage:3}],rings:[[.29,18,.13],[.16,12,0]],lightColors:['#ffd58c','#d9eeff']},
    292:{breaches:[{x:-.14,y:-.17,r:.073,stage:1},{x:.14,y:.16,r:.092,stage:2},{x:.25,y:-.17,r:.090,stage:3}],points:[[-.43,-.34],[-.28,-.34],[-.13,-.34],[.02,-.34],[.17,-.34],[.32,-.34],[.43,-.34],[-.43,.33],[-.28,.33],[-.13,.33],[.02,.33],[.17,.33],[.32,.33],[.43,.33]],lightColors:['#9bff72','#ffd184']},
    294:{breaches:[{x:-.39,y:-.23,r:.060,stage:1},{x:.29,y:0,r:.083,stage:2},{x:-.25,y:.19,r:.095,stage:3}],points:[[-.44,-.40],[-.30,-.39],[-.15,-.39],[0,-.39],[.15,-.39],[.30,-.39],[.44,-.40],[-.44,.39],[-.30,.39],[-.15,.39],[0,.39],[.15,.39],[.30,.39],[.44,.39],[-.32,0],[-.15,0],[0,0],[.15,0],[.32,0]],lightColors:['#9bff72','#ffd184']},
    305:{breaches:[{x:-.26,y:-.30,r:.068,stage:1},{x:.29,y:.27,r:.083,stage:2},{x:.28,y:-.28,r:.088,stage:3},{x:0,y:0,r:.072,stage:3}],rings:[[.43,24,0],[.34,18,.08],[.15,12,0]],lightColors:['#71cfff','#b8eaff']},
    307:{breaches:[{x:.025,y:-.27,r:.064,stage:1},{x:.30,y:0,r:.079,stage:2},{x:0,y:.29,r:.082,stage:3},{x:0,y:0,r:.076,stage:3}],points:[[0,-.43],[0,-.29],[0,-.15],[.43,0],[.30,0],[.15,0],[0,.15],[0,.29],[0,.43],[-.15,0],[-.30,0],[-.43,0]],lightColors:['#ffd46b','#fff2b5']},
    274:{breaches:[{x:-.039,y:-.404,r:.052,stage:1},{x:.311,y:-.046,r:.088,stage:2},{x:.086,y:.210,r:.080,stage:3},{x:.086,y:.305,r:.080,stage:3},{x:-.002,y:-.002,r:.054,stage:3}]},
    276:{breaches:[{x:-.29,y:-.26,r:.07,stage:1},{x:.12,y:-.29,r:.085,stage:2},{x:.09,y:0,r:.10,stage:2},{x:.13,y:.30,r:.085,stage:2},{x:.015,y:-.32,r:.075,stage:3},{x:0,y:0,r:.11,stage:3},{x:.025,y:.32,r:.085,stage:3}],rings:[[.39,24,0],[.24,16,0]],lightColors:['#f8a08e','#c8e9ff']},
    282:{breaches:[{x:-.29,y:-.24,r:.075,stage:1},{x:.29,y:.24,r:.085,stage:2},{x:-.27,y:.25,r:.085,stage:3},{x:0,y:0,r:.07,stage:3}],points:[[-.31,-.24],[.31,-.24],[-.31,.24],[.31,.24],[0,-.30],[0,.30],[-.16,0],[.16,0]],lightColors:['#93daff','#ffd48b']},
    284:{breaches:[{x:-.27,y:-.27,r:.075,stage:1},{x:.28,y:0,r:.085,stage:2},{x:-.05,y:.30,r:.09,stage:3},{x:0,y:0,r:.065,stage:3}],rings:[[.39,22,0],[.18,12,0]],lightColors:['#ffd991','#b2ecff']},
    286:{breaches:[{x:-.25,y:-.28,r:.073,stage:1},{x:.27,y:.03,r:.085,stage:2},{x:-.20,y:.28,r:.09,stage:3},{x:0,y:0,r:.067,stage:3}],rings:[[.37,23,0],[.20,14,0]],lightColors:['#79f7ef','#ffdba7']},
    288:{breaches:[{x:-.11,y:-.29,r:.07,stage:1},{x:.22,y:.04,r:.08,stage:2},{x:-.25,y:.18,r:.083,stage:3},{x:0,y:.29,r:.065,stage:3}],points:[[-.20,-.35],[0,-.35],[.20,-.35],[-.22,-.17],[.18,-.17],[-.23,0],[.20,0],[-.21,.21],[.18,.21],[-.12,.38],[.10,.38]],lightColors:['#a7ddff','#ffc277']},
    298:{breaches:[{x:-.30,y:-.23,r:.077,stage:1},{x:.30,y:-.23,r:.08,stage:2},{x:0,y:0,r:.08,stage:3},{x:0,y:.29,r:.085,stage:3}],points:[[-.39,-.26],[-.26,-.26],[-.13,-.26],[.13,-.26],[.26,-.26],[.39,-.26],[-.18,0],[.18,0],[-.19,.25],[0,.25],[.19,.25]],lightColors:['#b5e5ff','#ffd28e']},
    300:{breaches:[{x:-.27,y:-.08,r:.072,stage:1},{x:.20,y:-.12,r:.085,stage:2},{x:-.25,y:.25,r:.09,stage:3},{x:0,y:0,r:.065,stage:3}],rings:[[.40,24,0],[.19,14,0]],lightColors:['#97d9ff','#ffdaa2']},
    311:{breaches:[{x:-.25,y:-.30,r:.07,stage:1},{x:.24,y:-.14,r:.08,stage:2},{x:-.22,y:.10,r:.085,stage:3},{x:0,y:.29,r:.08,stage:3}],points:[[-.25,-.39],[.25,-.39],[-.21,-.20],[.21,-.20],[-.20,0],[.20,0],[-.20,.19],[.20,.19],[-.13,.38],[.13,.38]],lightColors:['#91d9ff','#b9faff']}
  };
  const stationConfig=()=>stationConfigs[state.ship?.id]||stationConfigs[272],stationBreaches=()=>stationConfig().breaches;
  async function prepareCthiaFragments(){
    const frames=state.ship.frames.map(file=>images.get(file));
    const anchors=starter()?.breakAnchors||(state.ship.id===56?window.constitutionTugBreakAnchors:state.ship.id===57?window.tugBreakAnchors:state.ship.id===58?window.olympicBreakAnchors:[[275,199],[84,201],[208,111],[315,261],[220,321],[139,401],[42,319],[328,320],[253,447]]);
    return await window.showcaseStageFragments.prepareAsync(frames,anchors);
  }
  function breakCthia(before,after){
    if(!enhancedShip()||after<=before||state.destroyed)return;
    if(biological()){biology().stageRupture(state,before,after,world,state.zoom);return;}
    window.showcaseStageFragments.emit({debris:state.debris,fragments:cthiaFragments,before,after,layout:layout(),world,
      angle:state.angle,time:state.time,zoom:state.zoom,burst});
  }
  const dotDamageEffects=window.dotBasicDamage.createEffects();
  function breakDot(before,after,impact=null){
    if(!droneShip())return;
    if(after<before){dotDamageEffects.clear();return;}
    dotDamageEffects.emit({...window.droneShowcase.damagePose(state.ship,layout(),state.angle),before,after,time:state.time,sourceId:state.ship.id,impact:impact?world(impact):null});
  }
  function prepareEarthStarbaseFragments(){
    const earthShapes=[null,
      [[[-.46,-.36],[-.39,-.44],[-.31,-.39],[-.36,-.28],[-.45,-.27]],[[-.38,-.44],[-.27,-.49],[-.22,-.40],[-.32,-.35]],[[-.44,-.28],[-.35,-.30],[-.32,-.21],[-.42,-.17]]],
      [[[.37,.12],[.48,.12],[.49,.24],[.40,.27],[.36,.21]],[[.40,.24],[.49,.21],[.47,.36],[.38,.40],[.36,.31]],[[.36,.32],[.43,.29],[.44,.42],[.35,.47],[.32,.41]]],
      [[[-.27,.07],[-.16,.04],[-.09,.14],[-.19,.22],[-.29,.16]],[[-.22,.18],[-.10,.13],[-.03,.23],[-.10,.32],[-.23,.29]],[[-.12,.07],[.00,.06],[.04,.18],[-.09,.23]],[[.23,-.43],[.34,-.45],[.41,-.36],[.32,-.28],[.22,-.34]],[[-.08,-.13],[.04,-.13],[.11,-.04],[.01,.03],[-.08,-.02]],[[.00,-.02],[.11,-.06],[.13,.08],[.02,.11],[-.05,.04]]]];
    const breachShapes=stage=>stationBreaches().filter(site=>site.stage===stage).flatMap(site=>{
      const {x,y,r}=site,w=r*1.75,h=r*1.55;
      return [
        [[x-w,y-h],[x+.015,y-h*.9],[x+.03,y+.015],[x-w*.85,y+.025]],
        [[x-.025,y-.015],[x+w,y-h*.8],[x+w*.9,y+h],[x-.015,y+h*.9]],
        [[x-w*.72,y+.01],[x+.025,y-.015],[x+w*.72,y+h*.7],[x-w*.8,y+h]]
      ];
    });
    const gridShapes=(left,right,columns,rows)=>Array.from({length:columns*rows},(_,i)=>{const col=i%columns,row=Math.floor(i/columns),x0=left+(right-left)*col/columns,x1=left+(right-left)*(col+1)/columns,y0=-.5+row/rows,y1=-.5+(row+1)/rows;return[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];});
    const shapes=state.ship.id===272?earthShapes:state.ship.id===276?[null,breachShapes(1),gridShapes(0,.5,4,5),gridShapes(-.17,.4,5,6)]:[null,...[1,2,3].map(breachShapes)];
    stationFragmentTemplates=[[],[],[],[],[]];
    for(let s=1;s<=3;s++){
      const old=images.get(state.ship.frames[s-1]),next=images.get(state.ship.frames[s]),surface=document.createElement('canvas');surface.width=old.width;surface.height=old.height;const g=surface.getContext('2d');g.drawImage(next,0,0,old.width,old.height);const nextPixels=g.getImageData(0,0,old.width,old.height).data;
      stationFragmentTemplates[s]=shapes[s].map(poly=>stationHullPiece(old,poly,nextPixels,state.ship.id===276&&s>=2)).filter(Boolean);
    }
    stationFragmentTemplates[4]=stationFinalPieces(images.get(state.ship.frames[3]));
    return window.wreckageEffects?.primeAll(stationFragmentTemplates.flat().map(p=>p.texture));
  }
  function stationHullPiece(im,poly,nextPixels=null,removedOnly=false){
    const xs=poly.map(p=>(p[0]+.5)*im.width),ys=poly.map(p=>(p[1]+.5)*im.height),left=Math.max(0,Math.floor(Math.min(...xs))),top=Math.max(0,Math.floor(Math.min(...ys))),right=Math.min(im.width,Math.ceil(Math.max(...xs))),bottom=Math.min(im.height,Math.ceil(Math.max(...ys)));if(right<=left||bottom<=top)return null;
    const texture=document.createElement('canvas');texture.width=right-left;texture.height=bottom-top;const g=texture.getContext('2d');g.beginPath();poly.forEach(([x,y],i)=>{const px=(x+.5)*im.width-left,py=(y+.5)*im.height-top;if(i)g.lineTo(px,py);else g.moveTo(px,py);});g.closePath();g.clip();g.drawImage(im,-left,-top);
    if(nextPixels){const pixels=g.getImageData(0,0,texture.width,texture.height),data=pixels.data;let kept=0;for(let y=0;y<texture.height;y++)for(let x=0;x<texture.width;x++){const i=(y*texture.width+x)*4;if(data[i+3]<96)continue;const j=((y+top)*im.width+x+left)*4,oldLight=(data[i]*.26+data[i+1]*.59+data[i+2]*.15),newLight=(nextPixels[j]*.26+nextPixels[j+1]*.59+nextPixels[j+2]*.15),oldMetal=Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<66,exposed=nextPixels[j+3]<95||!removedOnly&&oldMetal&&oldLight>82&&(newLight<Math.min(76,oldLight*.57)||nextPixels[j]>nextPixels[j+1]*1.35&&nextPixels[j+1]>nextPixels[j+2]*1.12&&newLight<oldLight*.84);if(exposed)kept++;else data[i+3]=0;}if(kept<45)return null;g.putImageData(pixels,0,0);}
    return{texture,x:(left+right)/2/im.width-.5,y:(top+bottom)/2/im.height-.5,w:(right-left)/im.width,h:(bottom-top)/im.height,...stationBurnMasks(texture)};
  }
  function stationBurnMasks(texture){
    const w=texture.width,h=texture.height,g=texture.getContext('2d'),source=g.getImageData(0,0,w,h).data,edge=document.createElement('canvas'),hot=document.createElement('canvas');edge.width=hot.width=w;edge.height=hot.height=h;const eg=edge.getContext('2d'),hg=hot.getContext('2d'),char=eg.createImageData(w,h),heat=hg.createImageData(w,h),edgeSites=[],depths=[2,4,7];let seen=0;
    const present=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&source[(y*w+x)*4+3]>70;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=(y*w+x)*4;if(source[k+3]<70)continue;let depth=0;
      for(const d of depths){if(!present(x-d,y)||!present(x+d,y)||!present(x,y-d)||!present(x,y+d)){depth=d;break;}}
      if(!depth)continue;const variation=(x*29+y*17)%23;
      char.data.set(depth===2?[36+variation,25+variation,20+variation,205]:[27,21,19,depth===4?150:85],k);
      if(depth<=4&&variation<14)heat.data.set([255,80+variation*7,18,depth===2?215:115],k);
      if(depth===2){seen++;const site={x:x/w-.5,y:y/h-.5};if(edgeSites.length<16)edgeSites.push(site);else if(Math.random()<16/seen)edgeSites[Math.floor(Math.random()*16)]=site;}
    }
    eg.putImageData(char,0,0);hg.putImageData(heat,0,0);return{edge,hot,edgeSites};
  }
  function stationFinalPieces(im){
    const w=im.width,h=im.height,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(im,0,0);const pixels=g.getImageData(0,0,w,h).data,owners=new Int16Array(w*h).fill(-1),groups=Array.from({length:24},()=>({left:w,top:h,right:-1,bottom:-1,count:0})),tau=Math.PI*2;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=y*w+x;if(pixels[k*4+3]<30)continue;const nx=x/w-.5,ny=y/h-.5,a=Math.atan2(ny,nx),r=Math.hypot(nx,ny),rough=.011*Math.sin(a*17+r*63)+.006*Math.sin(x*.061+y*.047)+.003*Math.sin(x*.117-y*.099),band=r+rough<.155?0:r+rough<.295?1:2,count=band===0?5:band===1?8:11,offset=band===0?0:band===1?5:13,warp=a+(band===1?0.11:band===2?-0.08:0)+.13*Math.sin(r*39+a*6)+.045*Math.sin(r*91-a*13),sector=Math.floor((((warp%tau)+tau)%tau)/tau*count)%count,id=offset+sector,b=groups[id];owners[k]=id;b.left=Math.min(b.left,x);b.top=Math.min(b.top,y);b.right=Math.max(b.right,x);b.bottom=Math.max(b.bottom,y);b.count++;
    }
    return groups.map((b,id)=>{
      if(!b.count)return null;const width=b.right-b.left+1,height=b.bottom-b.top+1,texture=document.createElement('canvas');texture.width=width;texture.height=height;const tg=texture.getContext('2d'),cut=tg.createImageData(width,height);
      for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++){const k=y*w+x;if(owners[k]!==id)continue;cut.data.set(pixels.subarray(k*4,k*4+4),((y-b.top)*width+x-b.left)*4);}
      tg.putImageData(cut,0,0);const piece={texture,x:(b.left+b.right+1)/2/w-.5,y:(b.top+b.bottom+1)/2/h-.5,w:width/w,h:height/h,band:id<5?0:id<13?1:2};Object.assign(piece,stationBurnMasks(texture));return piece;
    }).filter(Boolean);
  }
  function stationSparkBurst(site,count=12){
    const p=world(site),l=layout(),out=Math.atan2(p.y-l.y,p.x-l.x);
    for(let i=0;i<count;i++){const a=out+(Math.random()-.5)*2.3,speed=(22+Math.random()*100)*state.zoom;state.stationSparks.push({x:p.x+(Math.random()-.5)*l.w*.025,y:p.y+(Math.random()-.5)*l.h*.025,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,born:state.time,ttl:180+Math.random()*430,size:.7+Math.random()*1.15});}
  }
  function stationElectricArcs(site,count=3){
    for(let i=0;i<count;i++)state.stationArcs.push({x:site.x,y:site.y,r:site.r||.055,born:state.time+i*65,ttl:190+Math.random()*140,turn:Math.random()*Math.PI*2,seed:Math.random()*10});
    state.stationArcs=state.stationArcs.slice(-24);
  }
  function breakEarthStarbase(before,after,impactSite=null){
    if(!animatedStructure()||after<=before)return;
    const l=layout(),focused=impactSite&&impactSite.stage>before&&impactSite.stage<=after;
    for(const s of after===4?[4]:Array.from({length:after-before},(_,i)=>before+i+1)){
      const pieces=s===4?(before===3?stationFragmentTemplates[4]:stationFinalPieces(images.get(state.ship.frames[before]))):stationFragmentTemplates[s];
      for(const piece of pieces){const p=world(piece),direction=Math.atan2(p.y-l.y,p.x-l.x),speed=(s===4?78:37)+(Math.random()*30),delay=s===4?(piece.band===2?80:piece.band===1?245:400)+Math.random()*110:80+Math.random()*80;state.stationFragments.push({...piece,x:p.x,y:p.y,w:piece.w*l.w,h:piece.h*l.h,vx:Math.cos(direction)*speed*state.zoom,vy:Math.sin(direction)*speed*state.zoom,angle:state.angle,spin:(Math.random()-.5)*(s===4?1.7:1.0),born:state.time,delay,trailAt:state.time+delay+100,ttl:s===4?5300:3300});}
      for(const site of stationBreaches().filter(b=>b.stage===s||s===4)){if(focused&&s!==4&&site!==impactSite)continue;stationSparkBurst(site,s===4?12:s===3?15:23);stationElectricArcs(site,s===4?4:3);}
      if(s===2||s===3){const sites=stationBreaches().filter(b=>b.stage===s&&(!focused||b===impactSite));for(const site of sites)for(let i=0;i<3;i++)state.stationGlassCracks.push({x:site.x+(Math.random()-.5)*site.r,y:site.y+(Math.random()-.5)*site.r,born:state.time+Math.random()*120,ttl:580+Math.random()*200,turn:Math.random()*Math.PI*2});}
    }
    state.stationFragments=state.stationFragments.slice(-45);state.stationSparks=state.stationSparks.slice(-130);
  }
  let seed=743;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const stars=Array.from({length:160},()=>({x:random()*900,y:random()*540,r:random()*.9+.25,a:random()*.6+.2}));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const stage=()=>state.hull<25?3:state.hull<50?2:state.hull<75?1:0;
  const color=n=>'#'+n.toString(16).padStart(6,'0');
  function explain(text){$('explanation').textContent=text;}
  function loadImage(file){
    if(pendingImages.has(file))return pendingImages.get(file);
    const promise=new Promise((resolve,reject)=>{
      const im=new Image();let attempt=0;
      const request=()=>{im.src=base+file+'?v=tug-ii-a-anim-3'+(attempt?'&retry='+attempt:'');};
      im.onload=async()=>{if(/^debris-\d+-\d+\.png$/.test(file))await window.wreckageEffects?.prime(im);images.set(file,im);if(attempt){const stage=state.ship?.frames.indexOf(file)??-1;if(stage>=0)$('thumb-'+stage).src=im.src;}resolve(im);};
      im.onerror=()=>{if(++attempt<3)setTimeout(request,attempt*250);else{pendingImages.delete(file);reject(Error('Could not load '+file));}};
      request();
    });
    pendingImages.set(file,promise);return promise;
  }
  function playSound(file,volume=.18){
    if(!state.sound||!file)return;
    if(audio.size>=6){const old=audio.values().next().value;old.pause();audio.delete(old);}
    const a=new Audio(base+file+'.mp3');a.volume=volume;audio.add(a);const remove=()=>audio.delete(a);a.onended=remove;a.onerror=remove;a.play().catch(remove);
  }
  function stopSequence(){state.sequence=null;$('sequence').textContent='▶ Play damage sequence';}
  function clearEffects(){dotDamageEffects.clear();cthiaOptions.toolDemo=false;state.droneBattle=null;state.repair=null;state.repairSurface=null;repairControls(false);window.tugIIADamage?.reset();state.weaponReadyAt={};state.eggHatch=null;state.evolution=null;state.evolutionLanding=null;state.miningSequence=null;state.miningSplit=null;state.asteroidOreField=null;state.asteroidTransition=null;state.asteroidBlast=null;state.stationImpact=null;state.stationFragments=[];state.stationSparks=[];state.stationGlassCracks=[];state.stationArcs=[];cthiaOptions.impact=null;if(window.larvaMotion){window.larvaMotion.mode='idle';window.larvaMotion.offset=0;window.larvaMotion.xOffset=0;window.larvaMotion.born=state.time;}state.bioLeakAt=0;state.bioDeath=null;state.cthiaBlast=null;state.shots=[];state.particles=[];state.debris=[];state.flash=null;debrisImpacts.reset();environmentalImpacts.reset();resetNearbyAsteroids();$('debris-impact-status').textContent='Blast waves and debris destroy nearby asteroids. Ship shields flash or hulls spark without damage.';}
  const repairControlStates=new Map();
  const repairWorkshop=window.repairDroneFleet.mount({isBusy:()=>!!state.repair||!!state.droneBattle?.isBusy(),canWave:()=>!!state.repair&&!state.repair.snapshot().recalling&&!state.droneBattle?.waveActive(),waveActive:()=>!!state.droneBattle?.waveActive(),onWave:()=>{if(state.droneBattle?.launchWave(window.repairDroneFleet.read().wave,state.time)){updateUI();explain("Red hunters launched. Blue defenders intercept attackers while green Dot’s continue welding.");}},isReady:()=>state.ready&&state.ship?.id===1,onChange:()=>updateUI(),onLaunch:()=>startSteamrunnerRepair(true)});
  function repairControls(active){
    for(const id of ['hull','destroy','cloak','shields','sequence','repair','repair-demo','compare','firing-ship']){
      const button=$(id);
      if(active){if(!repairControlStates.has(id))repairControlStates.set(id,button.disabled);button.disabled=true;}
      else if(repairControlStates.has(id)){button.disabled=repairControlStates.get(id);repairControlStates.delete(id);}
    }
  }
  function allDroneTargets(){
    return [...(state.repair?.snapshot().drones||[]).map(d=>({...d,owner:state.repair})),...(state.droneBattle?.snapshot().drones||[]).map(d=>({...d,owner:state.droneBattle}))];
  }
  function currentDroneTarget(){
    const value=$('repair-attack-target').value;
    if(value==='ship')return null;
    const owner=/^\d+$/.test(value)?state.repair:state.droneBattle;
    const target=owner?.target(/^\d+$/.test(value)?Number(value):value);return target?{...target,owner}:null;
  }
  function refreshDroneCombat(){
    const select=$('repair-attack-target'),previous=select.value,mission=state.repair,busy=!!mission||!!state.droneBattle?.isBusy();
    const roster=allDroneTargets(),ids=new Set(['ship',...roster.map(d=>String(d.id))]);
    for(const option of [...select.options])if(!ids.has(option.value))option.remove();
    select.options[0].disabled=busy;
    for(const drone of roster){
      const label=typeof drone.id==='number'?`Dot’s ${drone.id+1}`:drone.id;
      let option=[...select.options].find(o=>o.value===String(drone.id));
      if(!option){option=new Option('',String(drone.id));select.add(option);}
      option.textContent=`${label} / ${drone.tier} / ${Math.ceil(drone.health)} of ${drone.maxHealth} HP / ${drone.phase}`;
      option.disabled=!drone.owner.target(drone.id);
    }
    select.value=previous;
    if(busy&&!currentDroneTarget())select.value=[...select.options].find(o=>!o.disabled)?.value||'ship';
    if(!busy)select.value='ship';
    $('drone-recall').disabled=!busy||(!mission&&!state.droneBattle?.isBusy())||(!!mission?.snapshot().recalling&&!!state.droneBattle?.snapshot().recalling);
    const battle=state.droneBattle?.snapshot(),stats=battle?.metrics;
    $('drone-combat-status').textContent=busy?`Green Dot’s evade; blue defenders intercept red hunters. Click a drone to target it. ${stats?`${stats.hits} projectile hits / ${stats.interceptions} body blocks / ${Math.round(stats.repairDamage)} worker damage.`:''}`:state.repairSurface?'Partial repairs are preserved. Buy replacements or relaunch the survivors to continue.':'Choose a damage state and launch repairs. Matched red waves launch automatically when enabled.';
  }
  function shotPoint(shot){return shot.dronePoint||world(shot.hit);}
  function hitRepairDrone(shot){
    const result=shot.repairMission.hit(shot.droneId,shot.damage,state.time);
    if(!result.hit){$('hit-result').textContent='Drone shot missed: the target was already destroyed or safely docked.';return;}
    state.hits++;lastHit={weaponId:shot.style.id,weapon:shot.style.name,damage:shot.damage,droneDamage:result.damage,droneId:shot.droneId,target:"drone",overkill:Math.max(0,shot.damage-result.damage),hullDamage:0,shieldDamage:0,visual:shot.visual};
    $('hit-result').textContent=`${shot.style.name}: ${typeof shot.droneId==='number'?'Dot’s '+(shot.droneId+1):shot.droneId} took ${number(result.damage)} damage / ${number(result.health)} HP remaining${result.destroyed?' / DESTROYED':''}`;
    explain(result.role&&result.role!=='repair'?`${result.role} drone ${result.destroyed?'destroyed':'hit'}. ${result.health} HP remains. Owned blue losses are saved.`:result.destroyed?(result.allLost?'All Dot’s have been destroyed. Repairs stop at the progress reached. Buy replacements to continue.':result.reassigned?'Dot’s destroyed and removed from the workshop inventory. Survivors are taking over its unfinished work.':'Returning drone destroyed and removed from the workshop inventory. Completed repairs remain intact.'):`Dot’s hit. ${number(result.health)} HP remains.`);
    updateUI();
  }
  function startSteamrunnerRepair(focus=false){
    if(!state.ready||state.ship.id!==1||state.repair||state.droneBattle?.isBusy())return;
    if(state.hull>=100&&!state.destroyed){explain('No repairs needed. The hull is intact, so the drones stay aboard.');return;}
    const inventory=window.repairDroneFleet.read();
    const automatic=repairWorkshop.autoAttack();
    if(!Object.values(inventory.owned).some(n=>n>0)){explain('No Dot’s remain. Buy a replacement in the workshop.');return;}
    stopSequence();
    const sourceStage=state.destroyed?3:stage(),previous=state.repairSurface;
    let source=previous?.frame()||images.get(state.ship.frames[sourceStage]);
    if(state.destroyed){source=document.createElement('canvas');source.width=images.get(state.ship.frames[0]).width;source.height=images.get(state.ship.frames[0]).height;}
    clearEffects();state.destroyed=false;state.cloaked=false;window.CinematicCloak?.reset(state);
    state.shields=0;state.shieldsEnabled=false;$('shields').checked=false;
    state.paused=false;$('pause').setAttribute('aria-pressed','false');$('pause').textContent='Pause';
    if(focus){state.compare=false;state.zoom=1.5;$('zoom').value=150;$('compare').setAttribute('aria-pressed','false');}
    state.repair=window.steamrunnerRepair.create(source,images.get(state.ship.frames[0]),state.time,{
      layout:layout(),angle:state.angle,source:{...emitter(),shipId:shooter.id},fleet:inventory.owned,
      launchDelay:automatic?Math.max(800,(Object.values(inventory.defense).reduce((a,b)=>a+b,0)-1)*140+200):0,
      damageScale:(100-state.hull)/85,onDestroyed:tier=>window.repairDroneFleet.lose(tier),onExplosion:blast=>{state.cthiaBlast=blast;}
    });
    state.droneBattle=window.droneBattle.create({repair:state.repair,defense:inventory.defense,born:state.time,
      geometry:{layout:layout(),angle:state.angle,source:{...emitter(),shipId:shooter.id}},
      onDestroyed:(tier,id,role)=>window.repairDroneFleet.lose(tier,role)});
    if(automatic)state.droneBattle.launchWave(window.droneBattle.planWave(inventory),state.time,{coordinated:true});
    state.repairHull=state.hull;state.repairUiAt=0;
    updateUI();repairControls(true);$('scene-label').textContent='STEAMRUNNER / HULL RECONSTRUCTION';
    explain(`Repairing from ${Math.round(state.hull)}% hull. ${automatic?"Red hunters are approaching the work area as your fleet deploys.":"Automatic attacks are off."} Drones share the remaining work and can be targeted by weapons. Recall stops welding and returns the survivors; repaired metal stays repaired.`);
  }
  function stepSteamrunnerRepair(){
    const repair=state.repair;if(!repair)return;
    const done=repair.advance(state.time,{layout:layout(),angle:state.angle,source:{...emitter(),shipId:shooter.id}}),snapshot=repair.snapshot();
    state.hull=state.repairHull+(100-state.repairHull)*snapshot.progress;
    if(done){
      state.repair=null;state.repairSurface=snapshot.progress<1?repair:null;repairControls(!!state.droneBattle?.isBusy());updateUI();
      explain(snapshot.progress===1?'Hull repair complete. Surviving Dot’s have returned to the support ship.':snapshot.outcome==='failed'?`Repairs halted at ${Math.round(state.hull)}% hull. All drones were lost. Completed repairs are preserved; buy replacements to continue.`:`Drones recalled at ${Math.round(state.hull)}% hull. Completed repairs are preserved. Relaunch to finish the remaining work.`);
    }else if(state.time>=state.repairUiAt){
      state.repairUiAt=state.time+100;updateUI();repairControls(true);
      $('scene-label').textContent='STEAMRUNNER / HULL RECONSTRUCTION';$('stage-badge').textContent=(snapshot.outcome==='failed'?'HALTED ':snapshot.recalling?'RECALLED ':'REPAIRING ')+Math.round(snapshot.progress*100)+'%';
    }
  }
  function reset(repairOnly=false){
    stopSequence();clearEffects();state.hull=100;state.shields=100;state.shieldCharge=100;state.shieldsEnabled=true;state.cloaked=false;state.destroyed=false;state.hits=0;lastHit=null;$('hit-result').textContent='Fire a weapon to measure its hit.';$('shields').checked=true;
    if(!repairOnly){
      state.angle=0;state.paused=false;state.slow=false;state.rotate=false;state.compare=false;state.zoom=1;state.damage=26;state.target='enemy';
      cthiaOptions.lights=true;cthiaOptions.damage=true;cthiaOptions.anchors=false;
      for(const [id,key] of [['ship-lights','lights'],['damage-effects','damage'],['effect-locations','anchors']])$(id).setAttribute('aria-pressed',String(cthiaOptions[key]));
      for(const id of['pause','slow','rotate','compare'])$(id).setAttribute('aria-pressed','false');$('pause').textContent='Ⅱ Pause';$('zoom').value=100;$('hit-strength').value=26;$('damage-output').value='26%';
      document.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.target==='enemy')));
    }
    if(structure()||tugDamageShip()||droneShip()){state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;$('shields').checked=false;}
    updateUI();if(animatedStructure()){explain(`${state.ship.name} restored. Its station lights are active; fire weapons to expose burning hull at each damage stage.`);return;}if(structure()){explain(state.ship.name+' artwork preview reset. Damage animations will be added next.');return;}if(intactOnly()){explain(state.ship.name+' restored to full health. Weapon testing is ready; separate damage artwork is pending.');return;}if(creature()){explain(egg()?'Egg restored: living contents pulse beneath the intact membrane.':'Creature restored: movement, under-shell circulation and intact tissue are restored.');return;}explain(repairOnly?'Hull repaired to 100%. The intact artwork is restored in the same position and at the same size.':'Demo reset. Fire a weapon, enable shields, or play the guided damage sequence.');
  }
  function configureArtworkUI(){
    const only=intactOnly();
    const isAsteroid=asteroid();
    $('mine-asteroid').hidden=!isAsteroid;
    $('mine-asteroid').disabled=!state.ready||!!state.miningSequence;
    $('hatch').hidden=!egg();$('hatch').disabled=!state.ready||state.destroyed||stage()===3||!!state.eggHatch||!!state.evolution;
    $('evolve').hidden=![67,69].includes(state.ship.id);$('evolve').disabled=!state.ready||state.destroyed||stage()===3||!!state.evolution;
    $('evolve').textContent=state.evolution?'Evolution in progress…':state.ship.id===67?'Evolve: Egg A → Larva A → Juvenile A':'Evolve: Larva A → Juvenile A';
    if(isAsteroid){state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;}
    document.querySelector('.weapon-console').hidden=false;
    document.querySelector('.health-panel').hidden=false;
    document.querySelector('.damage-strip').hidden=false;
    if(isAsteroid){
      const labels=['Intact rock','Cracked rock','Fractured rock','Breaking apart'];
      document.querySelectorAll('button[data-stage]').forEach((b,i)=>{
        b.querySelector('b').textContent=`0${i+1} · ${labels[i]}`;
        b.querySelector('small').textContent=['75–100% asteroid health','50–under 75%','25–under 50%','Under 25%'][i];
        b.querySelector('img').alt=labels[i];
      });
    }else{
      const labels=['01 · Intact','02 · Light','03 · Heavy','04 · Severe'],details=['75–100% hull','50–under 75%','25–under 50%','Under 25% hull'],alts=['Intact ship','Lightly damaged ship','Heavily damaged ship','Severely damaged ship'];
      document.querySelectorAll('button[data-stage]').forEach((b,i)=>{b.querySelector('b').textContent=labels[i];b.querySelector('small').textContent=details[i];b.querySelector('img').alt=alts[i];});
    }
    document.querySelector('.hull-readout .range-label').firstChild.textContent=creature()?'Health ':'Hull ';
    $('creature-health-controls').hidden=!creature();$('larva-motion-controls').hidden=!movingCreature();document.querySelector('[data-motion=newborn]').hidden=!larva();for(const mode of ['forward','turn'])document.querySelector(`[data-motion=${mode}]`).hidden=state.ship.id!==69;
    document.querySelector('.cloak-controls').hidden=creature()||isAsteroid||animatedStructure()||tugDamageShip()||droneShip();document.querySelector('.shield-readout').hidden=creature()||isAsteroid||animatedStructure()||tugDamageShip()||droneShip();
    if(creature()){state.shields=0;state.shieldsEnabled=false;state.shieldCharge=0;}
    $('debris-controls').hidden=creature()||isAsteroid;
    document.querySelector('.target-controls').hidden=creature()||isAsteroid;
    document.querySelector('.viewer-heading .eyebrow').textContent=isAsteroid?'SELECTED ASTEROID':creature()?'SELECTED CREATURE':animatedStructure()?'SELECTED STRUCTURE':'SELECTED SHIP';
    $('scene-label').textContent=isAsteroid?`${state.ship.oreLabel.toUpperCase()} ASTEROID TEST`:creature()?'CREATURE HEALTH & MOTION':animatedStructure()?`${state.ship.name.toUpperCase()} DAMAGE PREVIEW`:'LIVE DAMAGE PREVIEW';
    $('compare').disabled=only||isAsteroid||animatedStructure();
    document.querySelector('label[for="hull"]').textContent=isAsteroid?'Adjust asteroid health':creature()?'Adjust tissue integrity':'Adjust hull manually';
    $('repair').textContent=droneShip()?'Restore drone':isAsteroid?'Restore asteroid':creature()?(egg()?'Restore egg':'Restore creature'):'Repair hull';
    $('destroy').textContent=droneShip()?'Destroy drone':isAsteroid?'Destroy asteroid':creature()?(egg()?'Destroy egg':'Kill creature'):animatedStructure()?'Destroy station':'Destroy ship';
    for(const id of ['hull','repair','destroy','sequence'])$(id).disabled=!state.ready||!!state.miningSequence;
    document.querySelectorAll('button[data-stage]').forEach(b=>{
      const pending=only&&Number(b.dataset.stage)>0,small=b.querySelector('small');
      small.dataset.normalText=(asteroid()?['75–100% asteroid health','50–under 75%','25–under 50%','Under 25%']:['75–100% hull','50–under 75%','25–under 50%','Under 25% hull'])[Number(b.dataset.stage)];
      small.textContent=only?(pending?'Artwork pending':'Original artwork'):small.dataset.normalText;
      b.disabled=pending||!state.ready||!!state.miningSequence||!!state.evolution;
      b.querySelector('img').hidden=pending;
    });
    return only;
  }
  function updateUI(){
    if(!state.ship)return;
    $('repair-demo').hidden=state.ship.id!==1;$('repair-demo').disabled=!state.ready||!!state.repair;
    $('repair-workshop').hidden=state.ship.id!==1;repairWorkshop.refresh();refreshDroneCombat();
    $('damage-effects').hidden=false;$('effect-locations').hidden=false;$('drone-light-demo').hidden=!droneShip();$('drone-light-demo').disabled=!state.ready||state.destroyed;$('drone-light-demo').setAttribute('aria-pressed',String(cthiaOptions.toolDemo));
    $('evolve').hidden=![67,69].includes(state.ship.id);
    $('hull').disabled=!!state.evolution;
    if(structure()&&!animatedStructure()||artworkOnlyShip()){
      document.querySelector('.weapon-console').hidden=true;document.querySelector('.health-panel').hidden=true;document.querySelector('.damage-strip').hidden=true;
      $('mine-asteroid').hidden=true;$('hatch').hidden=true;$('cthia-controls').hidden=!artworkOnlyShip();$('debris-controls').hidden=true;
      document.querySelector('.target-controls').hidden=true;document.querySelector('.cloak-controls').hidden=true;document.querySelector('.shield-readout').hidden=true;
      document.querySelector('.viewer-heading .eyebrow').textContent=artworkOnlyShip()?'SELECTED SHIP':state.ship.kind==='turret'?'SELECTED TURRET':'SELECTED STRUCTURE';
      $('scene-label').textContent=artworkOnlyShip()?'LIVE SHIP LIGHTING PREVIEW':state.ship.kind==='turret'?'TURRET ARTWORK PREVIEW':'STATION & FACILITY ARTWORK PREVIEW';
      $('stage-badge').textContent=artworkOnlyShip()?'INTACT ONLY':'ARTWORK READY';$('stage-badge').dataset.stage=0;$('compare').disabled=true;
      if(artworkOnlyShip()){
        const lights=window.tugClassIILights.snapshot(state.ship.id);
        $('animation-example').textContent='Tug Class II lighting';
        $('ship-lights').hidden=false;$('ship-lights').textContent='Ship lights';
        $('damage-effects').hidden=true;$('effect-locations').hidden=true;
        $('cthia-status').textContent=lights?cthiaOptions.lights?`${lights.total} live light regions active: red running lights, blue nacelle strips, and warm hull lamps.`:`${lights.total} live light regions switched off. Damage stages are pending.`:'Preparing light locations…';
      }
      canvas.setAttribute('aria-label',`${state.ship.name}, intact artwork preview; damage animations pending`);
      return;
    }
    if(animatedStructure()){
      configureArtworkUI();const s=stage();state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;
      $('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${stats().hull} (${number(state.hull)}%)`;
      $('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=s>=2?'#ed8b94':s===1?'#e9bc73':'#88dcdf';
      $('ship-health').textContent=`${state.ship.name} hull ${number(hullPoints())} / ${stats().hull} · No shields`;
      $('stage-badge').textContent=state.destroyed?'DESTROYED':names[s].toUpperCase();$('stage-badge').dataset.stage=state.destroyed?4:s;
      $('cthia-controls').hidden=!state.ready;$('animation-example').textContent=`${state.ship.name} station effects`;
      $('ship-lights').hidden=false;$('ship-lights').textContent='Station lights';$('damage-effects').textContent='Breach fires';
      $('cthia-status').textContent=state.destroyed?'The station has broken apart. Repair hull to restore it.':s===0?'Running lights and illuminated station windows are active.':s===3?'Power has failed across the station. Only exposed fires glow; armor and sparks break away from the shattered rings.':`${s} exposed hull ${s===1?'breach':'breaches'} with glowing fire, sparks and failing lights.`;
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===s)));
      document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!state.ready);$('destroy').disabled=state.destroyed||!state.ready;
      canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'destroyed':names[s]}, ${Math.round(state.hull)} percent hull`);return;
    }
    if(asteroid()){
      configureArtworkUI();$('cthia-controls').hidden=true;$('hatch').hidden=true;$('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${stats().hull} health`;$('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=state.hull<25?'#ed8b94':state.hull<50?'#e9bc73':'#88dcdf';$('stage-badge').textContent=state.destroyed?'DESTROYED':['INTACT','CRACKED','FRACTURED','BREAKING APART'][stage()];$('stage-badge').dataset.stage=state.destroyed?4:stage();
      $('ship-health').textContent=`Asteroid health ${number(hullPoints())} / ${stats().hull} - No shields - ${state.ship.oreLabel}: ${state.ship.oreRole}`;$('hit-result').textContent=lastHit?`${lastHit.weapon}: ${number(lastHit.hullDamage)} asteroid damage - ${number(hullPoints())} health remains`:`Deposit: ${state.ship.oreLabel}. Choose a weapon and fire at the asteroid.`;
      document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!!state.miningSequence||!state.ready);$('destroy').disabled=state.destroyed||!!state.miningSequence||!state.ready;
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===stage())));
      canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'destroyed':number(hullPoints())+' health'}, weapon test`);return;
    }
    if(configureArtworkUI()&&!creature()){
      $('hull').value=100;$('stage-badge').textContent='INTACT ONLY';$('stage-badge').dataset.stage=0;
      $('cthia-controls').hidden=true;
      $('ship-health').textContent='Intact artwork ready. Light, heavy and severe damage stages and biological destruction are pending.';
      $('hit-result').textContent='Damage testing will be available after the damage stages are created.';
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.stage)===0)));
      canvas.setAttribute('aria-label',state.ship.name+', intact creature artwork; damage stages pending');
      return;
    }
    if(droneShip()){
      const s=stage();state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;
      $('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${stats().hull} (${number(state.hull)}%)`;
      $('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=s>=2?'#ed8b94':s===1?'#e9bc73':'#88dcdf';
      $('ship-health').textContent=`Drone health ${number(hullPoints())} / ${stats().hull} · No shields`;
      $('stage-badge').textContent=state.destroyed?'DESTROYED':names[s].toUpperCase();$('stage-badge').dataset.stage=state.destroyed?4:s;
      document.querySelector('.viewer-heading .eyebrow').textContent='SELECTED DRONE';$('scene-label').textContent='DRONE DAMAGE PREVIEW';
      $('cthia-controls').hidden=!state.ready;$('animation-example').textContent=state.ship.name+' effects';
      $('ship-lights').hidden=false;$('ship-lights').textContent='Drone lights';$('damage-effects').textContent='Damage effects';$('effect-locations').hidden=true;
      $('cthia-status').textContent=state.destroyed?'Power is off. Matching hull pieces drift apart. Restore drone to inspect again.':!cthiaOptions.lights?'Drone lights are switched off.':cthiaOptions.toolDemo?'Testing tool and engine lighting. Preview flashes do not fire weapons or spend resources.':s===0?'Status lights, engine glow and tier-specific power pulses are active. Test tool lights to preview welding or weapon flashes.':`${names[s]}: lamps fail, armor tears, and exposed wiring sparks.`;
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===s)));
      document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!state.ready);$('destroy').disabled=state.destroyed||!state.ready;
      canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'destroyed':names[s]}, ${number(hullPoints())} health`);return;
    }
    if(creature()){
      const s=stage();$('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${number(stats().hull)} health`;
      $('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=s>=2?'#ed8b94':'#88dcdf';$('creature-max-health').value=stats().hull;
      $('stage-badge').textContent=state.evolution?window.creatureEvolution.phase(state.evolution.origin,state.time-state.evolution.born).toUpperCase():state.eggHatch?(state.eggHatch.complete?'HATCHED':'HATCHING'):state.destroyed?'DEAD':s===3?'DEAD / SEVERE':names[s].toUpperCase();$('stage-badge').dataset.stage=state.destroyed?4:s;
      $('ship-health').textContent=`Health ${number(hullPoints())} / ${stats().hull} · No shields`+(intactOnly()?' · Damage artwork pending':egg()&&s===3?' · Contents dead; no internal glow':'');
      if(!lastHit)$('hit-result').textContent='Fire a weapon to measure tissue damage.';
      document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!state.ready||!!state.eggHatch||!!state.evolution);
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===s)));
      document.querySelectorAll('[data-motion]').forEach(b=>{b.disabled=state.destroyed||s===3||!!state.evolution;b.setAttribute('aria-pressed',String(b.dataset.motion===window.larvaMotion.mode));});
      $('destroy').disabled=state.destroyed||!state.ready||!!state.evolution;
      $('cthia-controls').hidden=!state.ready;$('animation-example').textContent=state.ship.name+' biological damage';
      $('ship-lights').hidden=false;$('ship-lights').textContent=egg()?'Living interior':'Under-shell glow';$('damage-effects').textContent='Wound activity';
      $('cthia-status').textContent=state.evolution?'Egg A hatches, Larva A crawls and turns, then molts into Juvenile A.':state.eggHatch?'The baby pulls free; the empty shell fades away.':state.destroyed?'Dead membrane and tissue drift apart.':s===3?'Dead contents: internal glow and breathing have stopped.':egg()?'Internal light pulses beneath the membrane; damaged tissue leaks and tears.':'Living veins pulse beneath shell seams; legs and tissue move with the selected motion.';
      canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'dead':names[s]}, ${number(hullPoints())} health`);return;
    }
    const s=stage();$('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${number(stats().hull)} (${number(state.hull)}%)`;$('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=s>=2?'#ed8b94':s===1?'#e9bc73':'#88dcdf';
    $('shield-output').value=`${number(shieldPoints())} / ${number(stats().shields)} (${number(state.shields)}%)`;$('shield-bar').style.width=state.shields+'%';$('shields').checked=state.shieldsEnabled;
    $('ship-health').textContent=`Hull ${number(stats().hull)} · Shields ${number(stats().shields)} · Weapons rating ${number(stats().weaponsRating)}`;
    $('cloak').setAttribute('aria-pressed',String(state.cloaked));$('cloak').textContent=state.cloaked?'Uncloak':'Cloak';$('cloak').disabled=state.destroyed||!state.ready;
    $('cloak-status').textContent=state.cloaked?'Cloaked indefinitely. Shields are down. Fire or enable shields to reveal the ship.':'Cloaking lowers shields. Firing or raising shields reveals the ship.';
    $('stage-badge').textContent=state.eggHatch?(state.eggHatch.complete?'HATCHED':'HATCHING'):state.destroyed?'DESTROYED':state.cloaked?'CLOAKED':names[s].toUpperCase();$('stage-badge').dataset.stage=state.destroyed?4:s;
    document.querySelectorAll('[data-stage]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===s));});
    document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!state.ready);
    $('destroy').disabled=state.destroyed||!state.ready;
    $('cthia-controls').hidden=!enhancedShip()&&!tugDamageShip();$('animation-example').textContent=state.ship.name+' animation example';$('ship-lights').hidden=state.ship.id===23;$('ship-lights').textContent=biological()?'Living pulses':state.ship.id===23?'Sail glints':'Ship lights';$('damage-effects').textContent=biological()?'Wound activity':state.ship.id===23?'Sail damage':'Damage effects';
    if(tugDamageShip()){$('animation-example').textContent='Tug Class II-A damage effects';$('damage-effects').hidden=false;$('damage-effects').textContent='Hull fires';$('effect-locations').hidden=true;$('cthia-status').textContent=s===3?`Severe wreck: running lights are out; breach fires ${cthiaOptions.damage?'burning':'off'}.`:s===0?'Intact hull: running lights active; no exposed breaches.':`${window.tugClassIILights.snapshot(state.ship.id,s)?.total||0} light regions · hull fires ${cthiaOptions.damage?'on':'off'}.`;}
    if(enhancedShip()){const effects=shipEffects().snapshot(s,state.time,cthiaOptions);$('cthia-status').textContent=state.eggHatch?'Membrane splits and peels back as the matching larva pulls free.':state.destroyed?(state.ship.id===23?'Sails and spars are breaking apart.':biological()?'The body ruptures; detached tissue twitches, then fades.':'Ship destroyed: attached lights and breach effects are off.'):state.ship.id===23?`${effects.damageSites} active damage sites${cthiaOptions.anchors?' · Amber: damage locations':''}`:biological()?`${effects.organs} pulsing organs · ${effects.activeWounds} active wounds${cthiaOptions.anchors?' · Cyan: organs; amber: wounds':''}`:`${effects.lights} light locations · ${effects.damageSites} active breaches${cthiaOptions.anchors?' · Cyan: lights; amber: breaches':''}`;}
    canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'destroyed':names[s]}, ${Math.round(state.hull)} percent hull, ${Math.round(state.shields)} percent shields`);
  }
  async function selectShip(id){
    biology()?.release?.();const token=++selectionToken;state.ready=false;stopSequence();clearEffects();state.ship=catalog.ships.find(s=>s.id===id);state.hull=100;state.shields=100;state.shieldCharge=100;state.shieldsEnabled=true;state.cloaked=false;state.destroyed=false;state.angle=0;state.hits=0;lastHit=null;$('hit-result').textContent='Fire a weapon to measure its hit.';
    $('loading').hidden=false;$('loading').textContent='Loading '+state.ship.name+'…';$('ship-name').textContent=state.ship.name;$('ship-source').textContent=structure()?state.ship.origin:asteroid()?state.ship.oreLabel+' deposit':state.ship.origin==='Biological remaster'?'Living tissue artwork':state.ship.origin==='AI remaster'?'Remastered artwork':state.ship.origin==='Rebirth'?'Rebirth artwork':'Your supplied sheet';$('ship-select').value=id;
    for(let i=0;i<4;i++){if(droneShip())$('thumb-'+i).removeAttribute('src');else if(state.ship.frames[i])$('thumb-'+i).src=base+state.ship.frames[i]+'?v=tug-ii-a-anim-3';else $('thumb-'+i).removeAttribute('src');}if(intactOnly()||asteroid()||structure()){state.compare=false;$('compare').setAttribute('aria-pressed','false');}shipPicker?.sync(id);updateUI();
    try{
      if(droneShip()){
        const entry=state.ship,frames=await window.droneShowcase.prepare(entry);
        await Promise.all([loadImage(shooter.frames[0]),...(asteroidData||[]).slice(0,3).map(rock=>loadImage(rock.file))]);
        if(token!==selectionToken)return;
        frames.forEach((frame,i)=>{images.set(entry.frames[i],frame);$('thumb-'+i).src=frame.toDataURL();});
        entry.hitPoints=opaquePoints(frames[0]);state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;resetNearbyAsteroids();
        state.ready=true;$('loading').hidden=true;updateUI();
        explain(`${entry.name} is ready. Select a damage stage, fire a weapon, or destroy and restore the drone. This inspection does not change your purchased fleet.`);return;
      }
      const assets=animatedStructure()?[...state.ship.frames,shooter.frames[0]]:structure()||artworkOnlyShip()?[state.ship.frames[0]]:asteroid()?[...state.ship.frames,shooter.frames[0],state.ship.oreImage]:[...state.ship.frames,state.ship.original,shooter.frames[0],...(egg()?[babyFile()]:[]),...([67,69].includes(id)?Object.values(window.creatureEvolution.files):[]),...(creature()?[]:Array.from({length:6},(_,i)=>`debris-${state.ship.debrisKind}-${i}.png`))];await Promise.all(assets.map(loadImage));
      if(id===1&&window.dotSprites)await window.dotSprites.ready;
      if(token!==selectionToken)return;
      await Promise.all((asteroidData||[]).slice(0,3).map(rock=>loadImage(rock.file)));resetNearbyAsteroids();
      if(animatedStructure()){state.ship.hitPoints=opaquePoints(images.get(state.ship.frames[0]));await prepareEarthStarbaseFragments();if(token!==selectionToken)return;if([286,300].includes(state.ship.id))prepareArtworkLights();state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;state.ready=true;$('loading').hidden=true;updateUI();explain(`${state.ship.name} is ready. Hits tear away matching armor sections while exposed fires glow. All powered lights fail in the severe stage.`);return;}
      if(structure()){state.shields=0;state.shieldsEnabled=false;state.ready=true;$('loading').hidden=true;updateUI();explain(state.ship.kind==='turret'?`${state.ship.name} equipment icon is available for the turret animation pass.`:`${state.ship.name} artwork is available. Damage animations will be built in the next pass.`);return;}
      if(artworkOnlyShip()){window.tugClassIILights.prepare(id,images.get(state.ship.frames[0]));state.ready=true;$('loading').hidden=true;updateUI();explain(`${state.ship.name} has live lights at its painted lamps, nacelle tips and drive strips. Use Ship lights to toggle the effect; damage stages are pending.`);return;}
      if(asteroid()){state.ship.hitPoints=opaquePoints(images.get(state.ship.frames[0]));state.ship.maxHealth=asteroidMaxHealth();state.ready=true;$('loading').hidden=true;updateUI();explain(`${state.ship.name} contains ${state.ship.oreLabel}: ${state.ship.oreRole} Any phaser, proton weapon, or other weapon destroys it with one hit and ejects matching mineral fragments. Damage stages remain available for manual animation review.`);return;}
      if(starter()?.alignReference)images.set(state.ship.original,starter().alignReference(images.get(state.ship.original)));
      state.ship.hitPoints=opaquePoints(images.get(state.ship.frames[0]));if(enhancedShip()){if(starter())state.ship.frames.forEach((file,s)=>{const aligned=starter().align(images.get(file),s);images.set(file,aligned);if(aligned.toDataURL)$('thumb-'+s).src=aligned.toDataURL();});if(id===57||id===58)state.ship.frames.forEach((file,s)=>{const aligned=(id===57?window.alignTugFrame:window.alignOlympicFrame)(images.get(file),s);images.set(file,aligned);if(aligned.toDataURL)$('thumb-'+s).src=aligned.toDataURL();});if(state.ship.frames[3]){const severe=shipEffects().unlitFrame(images.get(state.ship.frames[3]));images.set(state.ship.frames[3],severe);$('thumb-3').src=severe.toDataURL();}if(biological()){cthiaFragments=[[],[],[],[]];if(biology().prepareAsync)await biology().prepareAsync(state.ship.frames.map(file=>images.get(file)));else{biology().prepare(state.ship.frames.map(file=>images.get(file)));await biology().ready;}if(token!==selectionToken)return;}else{const fragments=await prepareCthiaFragments();if(token!==selectionToken)return;cthiaFragments=fragments;const destruction=window.createShipDestruction();await destruction.prepareAsync(state.ship.frames.map(file=>images.get(file)),window.earthFractureConfigs.get(id)||starter()?.destruction||(id===56?window.constitutionTugDestructionConfig:id===57?window.tugDestructionConfig:id===58?window.olympicDestructionConfig:{}));if(token!==selectionToken)return;window.cthiaDestruction=destruction;}}if(token!==selectionToken)return;if(tugDamageShip()){state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;for(let s=0;s<3;s++)window.tugClassIILights.prepare(id,images.get(state.ship.frames[s]),s);window.tugIIADamage.prepare(state.ship.frames.map(file=>images.get(file)));await window.tugIIADamage.ready;if(token!==selectionToken)return;}state.ship.hitPoints=opaquePoints(images.get(state.ship.frames[0]));if(egg())biology().prepareHatch(images.get(babyFile()));state.ready=true;$('loading').hidden=true;updateUI();
      if(id===67){const files=window.creatureEvolution.files,larvaImage=images.get(files.larva);window.starterShips.get(69).biology.prepare([larvaImage,larvaImage,larvaImage,larvaImage]);biology().prepareHatch(larvaImage,images.get(files.rupture),images.get(files.husk));}
      if(intactOnly()){explain(state.ship.name+' is ready for weapon testing with editable health and no shields. Separate damage artwork is pending.'+(larva()?' Try Newborn, Idle, Crawl and Settle.':''));return;}
      explain(`${state.ship.name} is ready. ${biological()?'Its four biological stages show torn membranes, exposed organs and necrotic tissue.':state.ship.origin==='AI remaster'?'Its four hull stages use newly rebuilt artwork matched to your approved fleet references.':state.ship.origin==='Rebirth'?'Its four hull stages use Rebirth artwork.':'Its four hull stages use your supplied damage sheet.'} ${egg()?'Choose a damage stage, play the damage sequence, or hatch the healthy egg. Dead eggs cannot hatch.':creature()?'Choose Idle, Crawl or Settle; fire weapons to see tissue damage and weakening circulation.':'Fire a weapon to see the damage develop.'}`);
    }catch(e){if(token===selectionToken){$('loading').textContent=e.message+' — reload the page to try again.';explain('The ship artwork could not be loaded.');}}
  }
  function opaquePoints(im){
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const rgba=g.getImageData(0,0,c.width,c.height).data,points=[];
    for(let y=2;y<c.height;y+=6)for(let x=2;x<c.width;x+=6)if(rgba[(y*c.width+x)*4+3]>160)points.push({x:x/c.width-.5,y:y/c.height-.5});
    return points.length?points:[{x:0,y:0}];
  }
  function layout(){
    const b=state.ship.bounds,ratio=starter()?.displayRatio??((b[1]-b[0])/(b[3]-b[2])),max=(state.ship.previewSize||235)*state.zoom;
    const land=state.ship.id===71?state.evolutionLanding:null,remaining=land?1-Math.min(1,(state.time-land.born)/2200):0;
    return {x:(state.compare?645:540)+(state.ship.id===69?window.larvaMotion.xOffset||0:0)+(land?land.x*remaining:0),y:253+(movingCreature()?window.larvaMotion.offset:0)+(land?land.y*remaining:0),w:ratio>1?max:max*ratio,h:ratio>1?max/ratio:max};
  }
  function world(p){const l=layout(),a=state.angle,c=Math.cos(a),s=Math.sin(a),x=p.x*l.w,y=p.y*l.h;return{x:l.x+x*c-y*s,y:l.y+x*s+y*c};}
  function hullPoint(){const points=state.ship.hitPoints;return points[Math.floor(Math.random()*points.length)];}
  function artworkDamageTarget(nextStage){
    const beforeFile=state.ship.frames[nextStage-1],afterFile=state.ship.frames[nextStage],key=beforeFile+'|'+afterFile;
    if(damageTargets.has(key))return damageTargets.get(key);
    const before=images.get(beforeFile),after=images.get(afterFile);
    if(!before||!after)return null;
    const w=before.width,h=before.height,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(before,0,0,w,h);const old=g.getImageData(0,0,w,h).data;
    g.clearRect(0,0,w,h);g.drawImage(after,0,0,w,h);const current=g.getImageData(0,0,w,h).data;
    const tile=Math.max(18,Math.round(Math.min(w,h)/20)),cols=Math.ceil(w/tile),scores=new Float32Array(cols*Math.ceil(h/tile)),xs=new Float32Array(scores.length),ys=new Float32Array(scores.length);
    for(let y=2;y<h;y+=5)for(let x=2;x<w;x+=5){const i=(y*w+x)*4,a=old[i+3],b=current[i+3];if(a<100)continue;
      const oldLight=old[i]*.26+old[i+1]*.59+old[i+2]*.15,newLight=current[i]*.26+current[i+1]*.59+current[i+2]*.15;
      const change=Math.max(0,a-b)*2+Math.max(0,oldLight-newLight)*Math.min(1,b/160);if(change<20)continue;
      const bin=Math.floor(y/tile)*cols+Math.floor(x/tile);scores[bin]+=change;xs[bin]+=x*change;ys[bin]+=y*change;
    }
    let best=-1;for(let i=0;i<scores.length;i++)if(best<0||scores[i]>scores[best])best=i;
    const target=best>=0&&scores[best]>0?{x:xs[best]/scores[best]/w-.5,y:ys[best]/scores[best]/h-.5}:null;
    damageTargets.set(key,target);return target;
  }
  function shotTarget(damage){
    let hull=hullPoints(),shields=shieldPoints();
    for(const queued of state.shots)if(!queued.impacted&&queued.droneId===undefined){const absorbed=Math.min(shields,queued.damage);shields-=absorbed;hull=Math.max(0,hull-(queued.damage-absorbed));}
    const before=hull/stats().hull*100,absorbed=Math.min(shields,damage),after=Math.max(0,hull-(damage-absorbed))/stats().hull*100;
    const nextStage=after<25?3:after<50?2:after<75?1:0,currentStage=before<25?3:before<50?2:before<75?1:0;
    if(nextStage>currentStage&&damage>absorbed){
      if(animatedStructure()){const site=stationBreaches().find(b=>b.stage===nextStage);if(site)return{point:site,site};}
      if(enhancedShip()){const site=shipEffects().damageSites?.(nextStage)?.[0];if(site)return{point:site};}
      const site=artworkDamageTarget(nextStage);if(site)return{point:site};
    }
    return{point:hullPoint()};
  }
  function emitter(){
    const l=layout(),x=state.compare?110:135,y=425,a=Math.atan2(l.y-y,l.x-x)+Math.PI/2;
    const b=shooter.bounds,r=(b[1]-b[0])/(b[3]-b[2]),w=88*r,h=88,p=shooter.points.find(p=>p.kind==='beam')||{x:0,y:-.42};
    return {x:x+p.x*w*Math.cos(a)-p.y*h*Math.sin(a),y:y+p.x*w*Math.sin(a)+p.y*h*Math.cos(a),centerX:x,centerY:y,w,h,a};
  }
  function burst(point,strength=1,sparksOnly=false,delay=0){
    window.showcaseHullBurst.burst(state.particles,point,state.time,catalog.units,state.zoom,strength,sparksOnly,delay);
  }
  function beginAsteroidTransition(before,after,hitPoint=null){
    if(!asteroid()||before===after)return;
    const from=images.get(state.ship.frames[before]),to=images.get(state.ship.frames[after]);
    if(from&&to){state.asteroidTransition={from,to,born:state.time,duration:720};emitAsteroidTransitionFragments(from,to,layout(),after<before);}
  }
  function drawAsteroidSprite(l){
    if(state.miningSplit&&!state.destroyed){drawMiningSplit(l);return;}
    const transition=state.asteroidTransition,next=images.get(frameFile());
    shipImage(next,l.x,l.y,l.w,l.h,state.angle);
    if(transition&&state.time-transition.born>=transition.duration)state.asteroidTransition=null;
  }
  const miningCutCache=new WeakMap();
  function miningCutGeometry(im){
    if(miningCutCache.has(im))return miningCutCache.get(im);
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const g=c.getContext('2d');g.drawImage(im,0,0);
    const alpha=g.getImageData(0,0,c.width,c.height).data;
    let left=c.width,top=c.height,right=0,bottom=0;
    for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2)if(alpha[(y*c.width+x)*4+3]>90){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    if(right<=left||bottom<=top){left=0;top=0;right=c.width-1;bottom=c.height-1;}
    const x0=left/c.width,x1=right/c.width,height=(bottom-top)/c.height;
    const cuts={x0,x1,bases:[.26,.5,.74].map(f=>(top+(bottom-top)*f)/c.height-.5),wave:Math.min(.06,height*.07)};
    miningCutCache.set(im,cuts);return cuts;
  }
  function miningCutPoint(cuts,pass,x){const i=x*28;return{x:x-.5,y:cuts.bases[pass]+cuts.wave*Math.sin(i*.57)+cuts.wave*.3*Math.sin(i*1.61)};}
  function createMiningCutPieces(im,cuts){
    const w=im.width,h=im.height,cut=(pass,i)=>{const p=miningCutPoint(cuts,pass,i/28);return{x:i/28*w,y:(p.y+.5)*h};},pieces=[];
    for(let row=0;row<4;row++){
      const texture=document.createElement('canvas');texture.width=w;texture.height=h;const g=texture.getContext('2d');g.beginPath();
      if(row===0){g.moveTo(0,0);g.lineTo(w,0);g.lineTo(w,cut(0,28).y);for(let i=28;i>=0;i--){const p=cut(0,i);g.lineTo(p.x,p.y);}}
      else if(row===3){g.moveTo(0,h);g.lineTo(w,h);g.lineTo(w,cut(2,28).y);for(let i=28;i>=0;i--){const p=cut(2,i);g.lineTo(p.x,p.y);}}
      else{const upper=row-1,lower=row;g.moveTo(0,cut(upper,0).y);for(let i=1;i<=28;i++){const p=cut(upper,i);g.lineTo(p.x,p.y);}g.lineTo(w,cut(lower,28).y);for(let i=28;i>=0;i--){const p=cut(lower,i);g.lineTo(p.x,p.y);}}
      g.closePath();g.clip();g.drawImage(im,0,0);pieces.push(texture);
    }
    return pieces;
  }
  function createMiningSplit(im){
    const angle=state.angle,normal={x:-.1*Math.cos(angle)-Math.sin(angle),y:-.1*Math.sin(angle)+Math.cos(angle)},tangent={x:Math.cos(angle)-.1*Math.sin(angle),y:Math.sin(angle)+.1*Math.cos(angle)},cuts=miningCutGeometry(im),pieces=createMiningCutPieces(im,cuts),heatPieces=pieces.map(texture=>{const hot=document.createElement('canvas');hot.width=texture.width;hot.height=texture.height;const g=hot.getContext('2d');g.drawImage(texture,0,0);g.globalCompositeOperation='source-atop';g.fillStyle='#ff5b16';g.fillRect(0,0,hot.width,hot.height);return hot;}),parts=pieces.map((texture,index)=>{const side=index-1.5,speed=18+Math.abs(side)*8+Math.random()*8,lateral=(Math.random()-.5)*9;return{x:0,y:0,vx:normal.x*side*speed+tangent.x*lateral,vy:normal.y*side*speed+tangent.y*lateral,rotation:0,spin:(Math.random()-.5)*.2,released:false,samples:miningPieceSamples(texture)};});
    return {cuts,pieces,heatPieces,parts,born:state.time,cutCount:0,heatBorn:null,minerals:null};
  }
  function drawMiningOreCollection(l,split,clipToShield=true){
    const elapsed=state.time-split.collectionBorn,shieldFade=650,ore=images.get(state.ship?.oreImage);if(!ore)return;
    if(!split.oreTransportPixels){
      const sample=document.createElement('canvas');sample.width=24;sample.height=24;
      const sampleCtx=sample.getContext('2d');sampleCtx.drawImage(ore,0,0,24,24);
      const pixels=sampleCtx.getImageData(0,0,24,24).data;
      split.oreTransportPixels=[];
      for(let py=0;py<24;py+=2)for(let px=0;px<24;px+=2){
        const at=(py*24+px)*4;if(pixels[at+3]<75)continue;
        split.oreTransportPixels.push({x:(px+.5)/24-.5,y:(py+.5)/24-.5,color:`rgb(${Math.min(255,pixels[at]+85)},${Math.min(255,pixels[at+1]+95)},${Math.min(255,pixels[at+2]+105)})`,seed:Math.abs(Math.sin(px*12.9898+py*78.233))});
      }
    }
    ctx.save();if(clipToShield)clipMiningOres(l,split);
    split.minerals.forEach((mineral,index)=>{
      const local=elapsed-shieldFade-index*110,progress=clamp(local/1350,0,1);
      if(progress>=1)return;
      const x=l.x+mineral.x,y=l.y+mineral.y,size=mineral.size;
      ctx.save();ctx.translate(x,y);ctx.rotate(mineral.angle);
      if(local<0){ctx.drawImage(ore,-size/2,-size/2,size,size);ctx.restore();return;}
      const solid=1-clamp((progress-.08)/.62,0,1);
      if(solid>0){ctx.globalAlpha=solid;ctx.shadowColor='#bdeaff';ctx.shadowBlur=3+progress*8;ctx.drawImage(ore,-size/2,-size/2,size,size);}
      ctx.globalCompositeOperation='lighter';
      const shimmer=Math.sin(Math.PI*progress),fade=1-clamp((progress-.66)/.34,0,1);
      for(const pixel of split.oreTransportPixels){
        const phase=(pixel.seed+index*.13)%1;
        if(progress<phase*.42||progress>.48+phase*.52)continue;
        const flicker=.55+.45*Math.sin(state.time*.025+phase*41);
        ctx.globalAlpha=shimmer*fade*flicker*(.55+pixel.seed*.45);
        ctx.fillStyle=pixel.seed>.85?'#f4ffff':pixel.color;
        const jitter=Math.sin(state.time*.008+phase*23)*Math.min(1.5,progress*2),px=pixel.x*size+jitter,py=pixel.y*size-Math.min(2,progress*2)*pixel.seed;
        const pointSize=pixel.seed>.9?2:1.4;
        ctx.fillRect(px,py,pointSize,pointSize);
      }
      drawMiningFlare(0,0,size*1.2,'#b4eaff',Math.sin(Math.PI*progress)*.18);
      ctx.restore();
    });ctx.restore();
  }
  function drawDestroyedAsteroidOres(l){
    const field=state.asteroidOreField,ore=images.get(state.ship?.oreImage);if(!field||!ore)return;
    const growth=clamp((state.time-field.born)/800,0,1);
    if(field.collectionBorn!==undefined){drawMiningOreCollection(l,field,false);return;}
    for(const mineral of field.minerals){const size=mineral.size*(.015+.985*growth);ctx.save();ctx.globalAlpha=.25+.75*growth;ctx.shadowColor=oreBeamColor[state.ship.oreType]||'#b4ecff';ctx.shadowBlur=12;ctx.filter='brightness(1.16) saturate(1.18)';ctx.translate(l.x+mineral.x,l.y+mineral.y);ctx.rotate(mineral.angle);ctx.drawImage(ore,-size/2,-size/2,size,size);ctx.restore();}
  }
  function drawMiningSplit(l){
    const split=state.miningSplit;
    const partOffset=part=>{const gather=split.heatBorn===null?1:1-.86*miningShieldProgress();return{x:part.x*gather,y:part.y*gather};};
    const partPoint=(index,point)=>{const part=split.parts[index],offset=partOffset(part),x=point.x*l.w,y=point.y*l.h,angle=state.angle+part.rotation,c=Math.cos(angle),s=Math.sin(angle);return{x:l.x+offset.x+x*c-y*s,y:l.y+offset.y+x*s+y*c};};
    const drawPart=(g,texture,index,scale=1,alpha=1)=>{const part=split.parts[index],offset=partOffset(part);g.save();g.globalAlpha*=alpha;g.translate(l.x+offset.x,l.y+offset.y);g.rotate(state.angle+part.rotation);g.scale(scale,scale);g.drawImage(texture,-l.w/2,-l.h/2,l.w,l.h);g.restore();};
    const heat=split.heatBorn===null?0:clamp((state.time-split.heatBorn)/4400,0,1),pressure=miningShieldProgress(),drain=clamp((heat-.16)/.72,0,1),ore=images.get(state.ship?.oreImage),squeeze=1-.7*pressure;
    const pool=(index,alpha,growth=0,g=ctx)=>{const part=split.parts[index],gather=1-.86*pressure,x=l.x+part.x*gather,y=l.y+part.y*gather+l.h*.035*gather,rx=l.w*(.034+.05*growth),ry=l.h*(.012+.021*growth),wave=Math.sin(state.time*.004+index*1.7)*.08;g.save();g.globalCompositeOperation='lighter';g.globalAlpha=alpha;g.shadowColor='#ff6419';g.shadowBlur=12+growth*12;g.fillStyle='#ff751c';g.beginPath();g.moveTo(x-rx,y);g.bezierCurveTo(x-rx*.8,y-ry*(1+wave),x-rx*.3,y-ry*1.3,x,y-ry*(.75+wave));g.bezierCurveTo(x+rx*.45,y-ry*1.15,x+rx*.78,y-ry*.85,x+rx,y);g.bezierCurveTo(x+rx*.65,y+ry,x-rx*.55,y+ry*1.1,x-rx,y);g.fill();g.fillStyle='#fff0a0';g.globalAlpha*=.72;g.beginPath();g.ellipse(x,y-ry*.15,rx*.52,ry*.25,0,0,Math.PI*2);g.fill();g.restore();return{x:x-l.x,y:y-l.y};};
    if(split.minerals){if(split.collectionBorn!==undefined){drawMiningOreCollection(l,split);return;}const elapsed=state.time-split.mineralBorn,growth=clamp(elapsed/800,0,1),cool=clamp((elapsed-800)/1400,0,1),flare=Math.exp(-Math.pow((heat-.84)/.075,2)),rockFade=1-clamp(growth/.22,0,1);if(growth<1)split.pieces.forEach((texture,index)=>{const scale=Math.min(1-.4*pressure,split.mineralScale||1)*(1-.28*growth),alpha=(1-.78*drain)*rockFade;drawPart(ctx,texture,index,scale,alpha);if(alpha>0){const part=split.parts[index];ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=heat*.52*rockFade;ctx.shadowColor='#ff5418';ctx.shadowBlur=2+4*(1-pressure);ctx.translate(l.x+partOffset(part).x,l.y+partOffset(part).y);ctx.rotate(state.angle+part.rotation);ctx.scale(scale,scale);ctx.drawImage(split.heatPieces[index],-l.w/2,-l.h/2,l.w,l.h);ctx.restore();}});for(let i=0;i<split.parts.length;i++)pool(i,1-cool*.96,growth);if(flare>.01){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=flare*.9;const flash=ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,l.w*.35);flash.addColorStop(0,'#fffbd4');flash.addColorStop(.2,'#fff0a0');flash.addColorStop(.55,'#ff9a27');flash.addColorStop(1,'#ff501000');ctx.fillStyle=flash;ctx.beginPath();ctx.arc(l.x,l.y,l.w*.35,0,Math.PI*2);ctx.fill();ctx.restore();}if(ore){ctx.save();clipMiningOres(l,split);for(const mineral of split.minerals){const size=mineral.size*(.015+.985*growth);ctx.save();ctx.globalAlpha=.25+.75*growth;ctx.shadowColor=oreBeamColor[state.ship.oreType]||'#b4ecff';ctx.shadowBlur=12*(1-cool)+5;ctx.filter=`brightness(${1.08+.12*(1-cool)}) saturate(1.18)`;ctx.translate(l.x+mineral.x,l.y+mineral.y);ctx.rotate(mineral.angle);ctx.drawImage(ore,-size/2,-size/2,size,size);ctx.restore();}ctx.restore();}return;}
    split.pieces.forEach((texture,index)=>{drawPart(ctx,texture,index,1-.4*pressure,1-.78*drain);if(heat>0){const part=split.parts[index],pieceScale=1-.4*pressure;ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=heat*.52;ctx.shadowColor='#ff5418';ctx.shadowBlur=2+4*(1-pressure);ctx.translate(l.x+partOffset(part).x,l.y+partOffset(part).y);ctx.rotate(state.angle+part.rotation);ctx.scale(pieceScale,pieceScale);ctx.drawImage(split.heatPieces[index],-l.w/2,-l.h/2,l.w,l.h);ctx.restore();}});
    if(heat>.18){asteroidCutCtx.clearRect(0,0,asteroidCutCanvas.width,asteroidCutCanvas.height);asteroidCutCtx.save();for(let index=0;index<split.parts.length;index++){const part=split.parts[index],gather=1-.86*pressure,target={x:l.x+part.x*gather,y:l.y+part.y*gather+l.h*.035*gather},amount=clamp((heat-.18)/.55,0,1),sourceY=[split.cuts.bases[0]-.1,split.cuts.bases[0],split.cuts.bases[2],split.cuts.bases[2]+.1][index];asteroidCutCtx.save();asteroidCutCtx.globalCompositeOperation='lighter';asteroidCutCtx.lineCap='round';asteroidCutCtx.globalAlpha=amount*(.68+.2*Math.sin(state.time*.009+index));asteroidCutCtx.strokeStyle='#ff6b19';asteroidCutCtx.shadowColor='#ff741e';asteroidCutCtx.shadowBlur=9;asteroidCutCtx.lineWidth=2+amount*6;for(let stream=0;stream<3;stream++){const source=partPoint(index,{x:(stream-1)*.17,y:sourceY}),sway=Math.sin(state.time*.006+stream+index)*7;asteroidCutCtx.beginPath();asteroidCutCtx.moveTo(source.x,source.y);asteroidCutCtx.bezierCurveTo(source.x+sway,source.y+l.h*.08,target.x-sway,target.y-l.h*.08,target.x,target.y);asteroidCutCtx.stroke();asteroidCutCtx.beginPath();asteroidCutCtx.moveTo(source.x,source.y);asteroidCutCtx.bezierCurveTo(source.x+sway,source.y+l.h*.08,target.x-sway,target.y-l.h*.08,target.x,target.y);asteroidCutCtx.strokeStyle='#ffd36b';asteroidCutCtx.shadowBlur=2;asteroidCutCtx.lineWidth=Math.max(1,amount*1.8);asteroidCutCtx.stroke();}asteroidCutCtx.restore();pool(index,amount,0,asteroidCutCtx);}asteroidCutCtx.restore();asteroidCutMaskCtx.clearRect(0,0,asteroidCutMaskCanvas.width,asteroidCutMaskCanvas.height);asteroidCutMaskCtx.save();asteroidCutMaskCtx.translate(l.x,l.y);asteroidCutMaskCtx.rotate(state.angle);const fieldScale=miningShieldScale()*.9;asteroidCutMaskCtx.drawImage(images.get(state.ship?.frames?.[0]),-l.w*.525*fieldScale,-l.h*.525*fieldScale,l.w*1.05*fieldScale,l.h*1.05*fieldScale);asteroidCutMaskCtx.restore();asteroidCutCtx.save();asteroidCutCtx.globalCompositeOperation='destination-in';asteroidCutCtx.drawImage(asteroidCutMaskCanvas,0,0);asteroidCutCtx.restore();ctx.drawImage(asteroidCutCanvas,0,0);}
    asteroidCutCtx.clearRect(0,0,asteroidCutCanvas.width,asteroidCutCanvas.height);asteroidCutCtx.save();asteroidCutCtx.globalCompositeOperation='lighter';asteroidCutCtx.lineCap='round';asteroidCutCtx.lineJoin='round';
    const seamScale=1-.4*pressure;for(let pass=0;pass<split.cutCount;pass++)for(const index of [pass,pass+1]){asteroidCutCtx.beginPath();for(let i=0;i<=28;i++){const cut=miningCutPoint(split.cuts,pass,i/28),p=partPoint(index,{x:cut.x*seamScale,y:cut.y*seamScale});if(i===0)asteroidCutCtx.moveTo(p.x,p.y);else asteroidCutCtx.lineTo(p.x,p.y);}asteroidCutCtx.strokeStyle=`rgba(255,113,35,${.55*(1-heat)})`;asteroidCutCtx.lineWidth=3*seamScale;asteroidCutCtx.shadowColor='#ff8b39';asteroidCutCtx.shadowBlur=9*(1-heat)*seamScale;asteroidCutCtx.stroke();asteroidCutCtx.strokeStyle=`rgba(255,240,183,${1-heat})`;asteroidCutCtx.lineWidth=.9*seamScale;asteroidCutCtx.shadowBlur=3*(1-heat)*seamScale;asteroidCutCtx.stroke();}
    asteroidCutCtx.restore();asteroidCutMaskCtx.clearRect(0,0,asteroidCutMaskCanvas.width,asteroidCutMaskCanvas.height);
    split.pieces.forEach((texture,index)=>drawPart(asteroidCutMaskCtx,texture,index,seamScale));
    asteroidCutCtx.save();asteroidCutCtx.globalCompositeOperation='destination-in';asteroidCutCtx.drawImage(asteroidCutMaskCanvas,0,0);asteroidCutCtx.restore();asteroidCutMaskCtx.clearRect(0,0,asteroidCutMaskCanvas.width,asteroidCutMaskCanvas.height);asteroidCutMaskCtx.save();asteroidCutMaskCtx.translate(l.x,l.y);asteroidCutMaskCtx.rotate(state.angle);const seamShieldScale=miningShieldScale()*.9;asteroidCutMaskCtx.drawImage(images.get(state.ship?.frames?.[0]),-l.w*.525*seamShieldScale,-l.h*.525*seamShieldScale,l.w*1.05*seamShieldScale,l.h*1.05*seamShieldScale);asteroidCutMaskCtx.restore();asteroidCutCtx.save();asteroidCutCtx.globalCompositeOperation='destination-in';asteroidCutCtx.drawImage(asteroidCutMaskCanvas,0,0);asteroidCutCtx.restore();ctx.drawImage(asteroidCutCanvas,0,0);
  }
  function rockBurst(point){
    const shades=['#a9957d','#786b5c','#514940','#c0ab8d'];
    for(let i=0;i<12;i++){const a=Math.random()*Math.PI*2,speed=25+Math.random()*95;state.particles.push({x:point.x,y:point.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:2+Math.random()*4,born:state.time,ttl:260+Math.random()*380,color:shades[i%shades.length]});}
  }
  function extractRockShard(im,cx,cy,radius){
    const sides=5+Math.floor(Math.random()*4),start=Math.random()*Math.PI*2,vertices=[];
    for(let i=0;i<sides;i++){const a=start+i*Math.PI*2/sides,r=radius*(.66+Math.random()*.48);vertices.push({x:clamp(cx+Math.cos(a)*r,0,im.width),y:clamp(cy+Math.sin(a)*r,0,im.height)});}
    const left=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p.y)))),right=Math.min(im.width,Math.ceil(Math.max(...vertices.map(p=>p.x)))),bottom=Math.min(im.height,Math.ceil(Math.max(...vertices.map(p=>p.y))));
    if(right-left<3||bottom-top<3)return null;
    const texture=document.createElement('canvas');texture.width=right-left;texture.height=bottom-top;const g=texture.getContext('2d');
    g.beginPath();vertices.forEach((p,i)=>i?g.lineTo(p.x-left,p.y-top):g.moveTo(p.x-left,p.y-top));g.closePath();g.clip();g.drawImage(im,-left,-top);
    return {texture,x:cx/im.width-.5,y:cy/im.height-.5,w:texture.width/im.width,h:texture.height/im.height};
  }
  function emitAsteroidTransitionFragments(from,to,l,reverse=false){
    if(from.width!==to.width||from.height!==to.height)return;
    const w=from.width,h=from.height,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const g=canvas.getContext('2d');g.drawImage(reverse?to:from,0,0,w,h);
    const pixels=g.getImageData(0,0,w,h).data,fromAlpha=document.createElement('canvas'),toAlpha=document.createElement('canvas');fromAlpha.width=toAlpha.width=w;fromAlpha.height=toAlpha.height=h;
    const a=fromAlpha.getContext('2d'),b=toAlpha.getContext('2d');a.drawImage(reverse?to:from,0,0,w,h);b.drawImage(reverse?from:to,0,0,w,h);
    const oldA=a.getImageData(0,0,w,h).data,newA=b.getImageData(0,0,w,h).data,missing=[];
    let minX=w,minY=h,maxX=-1,maxY=-1,sumX=0,sumY=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(oldA[i+3]>90&&newA[i+3]<24){missing.push([x,y,i]);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);sumX+=x;sumY+=y;}}
    if(missing.length<24)return;
    const meanX=sumX/missing.length,meanY=sumY/missing.length;let xx=0,yy=0,xy=0;
    for(const [x,y]of missing){xx+=(x-meanX)**2;yy+=(y-meanY)**2;xy+=(x-meanX)*(y-meanY);}
    const axis=Math.atan2(2*xy,xx-yy)/2,ux=Math.cos(axis),uy=Math.sin(axis),projected=missing.map(p=>(p[0]-meanX)*ux+(p[1]-meanY)*uy).sort((x,y)=>x-y);
    const centers=[.12,.37,.63,.88].map(q=>{const v=projected[Math.floor(q*(projected.length-1))];return{x:meanX+ux*v,y:meanY+uy*v};});
    const groups=centers.map(()=>[]);
    for(const pixel of missing){let best=0,distance=Infinity;for(let i=0;i<centers.length;i++){const dx=pixel[0]-centers[i].x,dy=pixel[1]-centers[i].y,d=dx*dx+dy*dy;if(d<distance){best=i;distance=d;}}groups[best].push(pixel);}
    for(const group of groups){if(group.length<12)continue;let lx=w,ly=h,rx=0,by=0,cx=0,cy=0;for(const [x,y]of group){lx=Math.min(lx,x);ly=Math.min(ly,y);rx=Math.max(rx,x);by=Math.max(by,y);cx+=x;cy+=y;}cx/=group.length;cy/=group.length;
      const texture=document.createElement('canvas');texture.width=rx-lx+1;texture.height=by-ly+1;const tg=texture.getContext('2d'),image=tg.createImageData(texture.width,texture.height);
      for(const [x,y,i]of group){const dest=((y-ly)*texture.width+x-lx)*4;image.data.set(pixels.subarray(i,i+4),dest);}tg.putImageData(image,0,0);
      let at=world({x:cx/w-.5,y:cy/h-.5}),dx=at.x-l.x,dy=at.y-l.y,len=Math.max(1,Math.hypot(dx,dy)),sign=reverse?-1:1,offset=reverse?18:0;
      at={x:at.x+dx/len*offset,y:at.y+dy/len*offset};const speed=(105+Math.random()*115)*state.zoom*sign;
      state.debris.push({...at,texture,w:(rx-lx+1)/w*l.w,h:(by-ly+1)/h*l.h,vx:dx/len*speed,vy:dy/len*speed,angle:state.angle,spin:(Math.random()-.5)*6,born:state.time,ttl:1900+Math.random()*750,asteroidShard:true,transitionShard:true});
    }
  }
  function emitAsteroidShards(im,l,hitPoint,count,speedScale,lifeScale){
    if(!im)return;
    for(let i=0;i<count;i++){
      const sample=hitPoint||state.ship.hitPoints[Math.floor(Math.random()*state.ship.hitPoints.length)],baseX=sample.x+.5,baseY=sample.y+.5;
      const cx=clamp((baseX+(Math.random()-.5)*.34)*im.width,0,im.width),cy=clamp((baseY+(Math.random()-.5)*.34)*im.height,0,im.height);
      const piece=extractRockShard(im,cx,cy,im.width*(.045+Math.random()*.075));if(!piece)continue;
      const at=world(piece),direction=Math.atan2(at.y-l.y,at.x-l.x)+(Math.random()-.5)*.75,speed=(80+Math.random()*190)*speedScale*state.zoom;
      state.debris.push({...at,texture:piece.texture,w:piece.w*l.w,h:piece.h*l.h,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,angle:state.angle,spin:(Math.random()-.5)*7,born:state.time,ttl:(1500+Math.random()*1300)*lifeScale,asteroidShard:true});
    }
  }
  function createAsteroidOreField(l){
    const size=l.w*.22;
    state.asteroidOreField={born:state.time,minerals:[[0,-.78],[-.78,.43],[.78,.43]].map(([x,y])=>({x:x*size,y:y*size,angle:Math.random()*.5-.25,size}))};
  }
  const oreBeamColor={dilithium:'#80dfff',trellium:'#e9ad61',tritanium:'#c6d0d8',gallicite:'#79eb9d',benamite:'#ff8397'};
  function drawAsteroidDebris(){
    for(const p of state.debris){if(!p.asteroidShard)continue;const age=state.time-p.born;if(age<0||age>p.ttl)continue;const fade=Math.min(1,(p.ttl-age)/500);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=fade;ctx.drawImage(p.texture,-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}
  }
  function drawAsteroidBlast(l){
    if(!state.asteroidBlast||state.miningSequence)return;const age=state.time-state.asteroidBlast.born,duration=260;if(age>=duration){state.asteroidBlast=null;return;}
    const t=age/duration;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#e5b979';ctx.lineWidth=2+5*(1-t);ctx.beginPath();ctx.ellipse(l.x,l.y,12+t*l.w*.72,10+t*l.h*.72,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function miningSweep(age){
    const elapsed=Math.max(0,age-500),passDuration=1050,passGap=150,passSpan=passDuration+passGap,pass=Math.min(2,Math.floor(elapsed/passSpan)),raw=elapsed>=passSpan*2+passDuration?1:clamp((elapsed-pass*passSpan)/passDuration,0,1),ease=.5-.5*Math.cos(Math.PI*raw),progress=pass%2?1-ease:ease,cuts=miningCutGeometry(images.get(state.ship.frames[0])),x=cuts.x0+(cuts.x1-cuts.x0)*progress,point=miningCutPoint(cuts,pass,x);
    return {pass,raw,ease,progress,point};
  }
  function asteroidOpaqueAt(point){
    const im=images.get(state.ship?.frames?.[0]);if(!im)return false;
    if(asteroidAlphaCache?.image!==im)asteroidSurfacePoint(point);
    const {width,height,alpha}=asteroidAlphaCache,x=clamp(Math.floor((point.x+.5)*width),0,width-1),y=clamp(Math.floor((point.y+.5)*height),0,height-1);
    return alpha[(y*width+x)*4+3]>100;
  }
  function asteroidSurfacePoint(point){
    const im=images.get(state.ship?.frames?.[0]);if(!im)return point;
    if(asteroidAlphaCache?.image!==im){const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);asteroidAlphaCache={image:im,width:im.width,height:im.height,alpha:g.getImageData(0,0,im.width,im.height).data};}
    const {width,height,alpha}=asteroidAlphaCache,x0=clamp(Math.round((point.x+.5)*(width-1)),0,width-1),y0=clamp(Math.round((point.y+.5)*(height-1)),0,height-1),opaque=(x,y)=>alpha[(y*width+x)*4+3]>160;
    if(opaque(x0,y0))return point;
    let nearest=null,best=Infinity;for(let r=1;r<=10&&!nearest;r++)for(let y=Math.max(0,y0-r);y<=Math.min(height-1,y0+r);y++)for(let x=Math.max(0,x0-r);x<=Math.min(width-1,x0+r);x++){if(!opaque(x,y))continue;const d=(x-x0)**2+(y-y0)**2;if(d<best){best=d;nearest={x:x/width-.5,y:y/height-.5};}}
    if(nearest)return nearest;
    const points=state.ship?.hitPoints||[];for(const p of points){const dx=(p.x-point.x)*width,dy=(p.y-point.y)*height,d=dx*dx+dy*dy;if(d<best){best=d;nearest=p;}}
    return nearest||point;
  }
  function asteroidShieldOutline(im){
    if(!im)return null;if(asteroidShieldCache?.image===im)return asteroidShieldCache.canvas;
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.shadowColor='#49c9ff';g.shadowBlur=Math.max(3,im.width*.012);g.drawImage(im,0,0);g.globalCompositeOperation='destination-out';g.shadowBlur=0;g.drawImage(im,0,0);asteroidShieldCache={image:im,canvas:c};return c;
  }
  function miningShieldProgress(){const split=state.miningSplit;return split?.heatBorn===null||!split?0:clamp((state.time-split.heatBorn)/3600,0,1);}
  function miningShieldScale(){const p=miningShieldProgress(),ease=p*p*(3-2*p);return 1.05-.43*ease;}
  function miningOreShieldRadius(l,split=state.miningSplit){
    return Math.max(l.w*.22,...(split?.minerals||[]).map(mineral=>Math.hypot(mineral.x,mineral.y)+mineral.size*.64+13));
  }
  function clipMiningOres(l,split=state.miningSplit){
    ctx.beginPath();ctx.arc(l.x,l.y,miningOreShieldRadius(l,split)-2,0,Math.PI*2);ctx.clip();
  }
  function oreCollectionFade(field){return field.collectionBorn===undefined?1:1-clamp((state.time-field.collectionBorn-1800)/500,0,1);}
  function drawOreShieldRing(l,field,fade=oreCollectionFade(field)){
    const radius=miningOreShieldRadius(l,field),glow=ctx.createRadialGradient(0,0,radius*.35,0,0,radius);
    glow.addColorStop(0,'rgba(24,110,205,0)');glow.addColorStop(.78,'rgba(32,136,236,.06)');glow.addColorStop(1,'rgba(78,205,255,.22)');
    ctx.globalAlpha=fade;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.72*fade;ctx.strokeStyle='#71dcff';ctx.lineWidth=1.7;ctx.shadowColor='#31baff';ctx.shadowBlur=11;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();
    ctx.shadowBlur=0;ctx.globalAlpha=.3*fade;ctx.lineWidth=.6;ctx.beginPath();ctx.arc(0,0,radius-5,0,Math.PI*2);ctx.stroke();
  }
  function drawMiningFlare(x,y,r,color,strength=1,angle=0){
    if(strength<=0)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.min(.8,strength);
    const bloom=ctx.createRadialGradient(0,0,0,0,0,r);
    bloom.addColorStop(0,'#fffef2');bloom.addColorStop(.12,color);bloom.addColorStop(.42,color+'44');bloom.addColorStop(1,'#00000000');
    ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
    const streak=ctx.createLinearGradient(-r*1.5,0,r*1.5,0);
    streak.addColorStop(0,'#00000000');streak.addColorStop(.45,color+'00');streak.addColorStop(.5,'#ffffff');streak.addColorStop(.55,color+'00');streak.addColorStop(1,'#00000000');
    ctx.globalAlpha*=.45;ctx.fillStyle=streak;ctx.fillRect(-r*1.5,-.55,r*3,1.1);
    ctx.globalAlpha*=.5;ctx.fillRect(-.45,-r*.55,.9,r*1.1);ctx.restore();
  }
  function drawMiningShield(l){
    const im=images.get(state.ship?.frames?.[0]),outline=asteroidShieldOutline(im);if(!outline)return;
    const hasOre=!!state.miningSplit?.minerals,collectionFade=hasOre?oreCollectionFade(state.miningSplit):1,progress=miningShieldProgress(),scale=(hasOre?Math.max(miningShieldScale(),.70):miningShieldScale())*(1+.008*Math.sin(state.time*.012)*progress);
    ctx.save();ctx.translate(l.x,l.y);ctx.rotate(state.angle);ctx.globalCompositeOperation='lighter';ctx.filter='none';
    if(hasOre)drawOreShieldRing(l,state.miningSplit,collectionFade);
    else{
      ctx.globalAlpha=(.48+.12*Math.sin(state.time*.006))*(1-progress);ctx.drawImage(outline,-l.w*.525*scale,-l.h*.525*scale,l.w*1.05*scale,l.h*1.05*scale);
      ctx.globalAlpha=(.25+.35*progress)*(.72+.28*Math.sin(state.time*.018));ctx.filter=`hue-rotate(${195*progress}deg) saturate(1.6)`;ctx.drawImage(outline,-l.w*.525*scale,-l.h*.525*scale,l.w*1.05*scale,l.h*1.05*scale);
    }
    ctx.restore();
    const ripples=state.miningSplit?.ripples||[];for(let i=ripples.length-1;i>=0;i--){const r=ripples[i],age=state.time-r.born,t=age/r.ttl;if(t>=1){ripples.splice(i,1);continue;}ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=(1-t)*.8;ctx.strokeStyle=progress>.3?'#ff9b43':'#8feaff';ctx.shadowColor=progress>.3?'#ff651f':'#40cfff';ctx.shadowBlur=9;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(r.x,r.y,5+16*t,3+9*t,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    if(progress>.12&&collectionFade>0){
      const amount=clamp((progress-.12)/.78,0,1),arcs=hasOre?13:22,discharge=state.miningSplit.collectionBorn===undefined?0:1-collectionFade;
      const hash=n=>{const v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v);};
      asteroidCutCtx.clearRect(0,0,asteroidCutCanvas.width,asteroidCutCanvas.height);asteroidCutCtx.save();
      const fill=asteroidCutCtx.createRadialGradient(l.x,l.y,0,l.x,l.y,l.w*.7);
      fill.addColorStop(0,hasOre?'rgba(70,180,255,.055)':`rgba(75,187,255,${.10+.10*amount})`);
      fill.addColorStop(.65,hasOre?'rgba(28,127,255,.035)':`rgba(28,127,255,${.07+.09*amount})`);
      fill.addColorStop(1,'rgba(9,70,160,0)');
      asteroidCutCtx.globalAlpha=collectionFade;asteroidCutCtx.fillStyle=fill;asteroidCutCtx.fillRect(0,0,asteroidCutCanvas.width,asteroidCutCanvas.height);
      asteroidCutCtx.globalCompositeOperation='lighter';asteroidCutCtx.lineCap='round';asteroidCutCtx.lineJoin='round';
      for(let i=0;i<arcs;i++){
        const frame=Math.floor(state.time/(85+i%4*23)),seed=hash(i*19+frame),activity=hasOre?.63:.78;
        if(seed>activity+.16*(discharge<.45?discharge:0))continue;
        const a=i*Math.PI*2/arcs+hash(i*7)*.22+state.time*.000075;
        const edge=asteroidSurfacePoint({x:Math.cos(a)*.72,y:Math.sin(a)*.72});
        const start=world({x:edge.x*scale*.93,y:edge.y*scale*.93});
        const inward=.22+hash(i*31+frame)*.22,end=world({x:edge.x*scale*(1-inward),y:edge.y*scale*(1-inward)});
        const dx=end.x-start.x,dy=end.y-start.y,length=Math.max(1,Math.hypot(dx,dy)),nx=-dy/length,ny=dx/length;
        const points=[start];
        for(let segment=1;segment<6;segment++){
          const t=segment/6,jitter=(hash(i*41+frame*13+segment*17)-.5)*(hasOre?5:8);
          points.push({x:start.x+dx*t+nx*jitter,y:start.y+dy*t+ny*jitter});
        }
        points.push(end);
        const path=()=>{asteroidCutCtx.beginPath();points.forEach((p,n)=>n?asteroidCutCtx.lineTo(p.x,p.y):asteroidCutCtx.moveTo(p.x,p.y));};
        const brightness=(.55+.45*hash(i*13+frame*7))*(hasOre?.5:.8)*(1+.65*(1-discharge)*discharge);
        asteroidCutCtx.globalAlpha=brightness*collectionFade*.28;asteroidCutCtx.strokeStyle='#379bff';asteroidCutCtx.shadowColor='#2faeff';asteroidCutCtx.shadowBlur=5;asteroidCutCtx.lineWidth=hasOre?2.1:3.2;path();asteroidCutCtx.stroke();
        asteroidCutCtx.globalAlpha=brightness*collectionFade;asteroidCutCtx.strokeStyle=i%4===0?'#efffff':'#9de7ff';asteroidCutCtx.shadowBlur=hasOre?1:2.5;asteroidCutCtx.lineWidth=hasOre?.42:.7;path();asteroidCutCtx.stroke();
        if(hash(i*23+frame*11)>.72){
          const root=points[2],branch=points[4],side=hash(i*5+frame)*2-1;
          asteroidCutCtx.globalAlpha=brightness*collectionFade*.55;asteroidCutCtx.lineWidth=.4;
          asteroidCutCtx.beginPath();asteroidCutCtx.moveTo(root.x,root.y);asteroidCutCtx.lineTo(branch.x+nx*side*7,branch.y+ny*side*7);asteroidCutCtx.stroke();
        }
      }
      asteroidCutCtx.restore();
      asteroidCutMaskCtx.clearRect(0,0,asteroidCutMaskCanvas.width,asteroidCutMaskCanvas.height);
      asteroidCutMaskCtx.save();asteroidCutMaskCtx.translate(l.x,l.y);asteroidCutMaskCtx.rotate(state.angle);
      asteroidCutMaskCtx.drawImage(im,-l.w*.525*scale,-l.h*.525*scale,l.w*1.05*scale,l.h*1.05*scale);asteroidCutMaskCtx.restore();
      asteroidCutCtx.save();asteroidCutCtx.globalCompositeOperation='destination-in';asteroidCutCtx.drawImage(asteroidCutMaskCanvas,0,0);asteroidCutCtx.restore();
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=hasOre?.62:.82;ctx.drawImage(asteroidCutCanvas,0,0);ctx.restore();
    }
    const flare=hasOre?0:Math.exp(-Math.pow((progress-.97)/.035,2));if(flare>.015){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=flare*.75;const glow=ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,l.w*.25);glow.addColorStop(0,'#fffbdc');glow.addColorStop(.35,'#fff0a0');glow.addColorStop(1,'#ff821400');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(l.x,l.y,l.w*.25,0,Math.PI*2);ctx.fill();ctx.restore();}
    if(flare>.015)drawMiningFlare(l.x,l.y,l.w*.23,'#ffb65b',flare*.55,state.angle);
  }
  function miningPieceSamples(texture){
    const c=document.createElement('canvas');c.width=texture.width;c.height=texture.height;const g=c.getContext('2d');g.drawImage(texture,0,0);
    const data=g.getImageData(0,0,c.width,c.height).data,stride=Math.max(1,Math.floor(Math.max(c.width,c.height)/280)),samples=[];
    const solid=(x,y)=>data[(y*c.width+x)*4+3]>70,add=(x,y)=>samples.push({x:(x+.5)/c.width-.5,y:(y+.5)/c.height-.5});
    for(let x=0;x<c.width;x+=stride){let top=-1,bottom=-1;for(let y=0;y<c.height;y++)if(solid(x,y)){top=y;break;}if(top<0)continue;for(let y=c.height-1;y>=top;y--)if(solid(x,y)){bottom=y;break;}add(x,top);if(bottom!==top)add(x,bottom);}
    for(let y=0;y<c.height;y+=stride){let left=-1,right=-1;for(let x=0;x<c.width;x++)if(solid(x,y)){left=x;break;}if(left<0)continue;for(let x=c.width-1;x>=left;x--)if(solid(x,y)){right=x;break;}add(left,y);if(right!==left)add(right,y);}
    const interior=Math.max(5,Math.round(Math.max(c.width,c.height)/72));
    for(let y=Math.floor(interior/2);y<c.height;y+=interior)for(let x=Math.floor(interior/2);x<c.width;x+=interior)if(solid(x,y))add(x,y);
    return samples;
  }
  function insideAsteroidShield(point){
    const im=images.get(state.ship?.frames?.[0]);if(!im)return true;
    const scale=miningShieldScale()*1.05,scaled={x:point.x/scale,y:point.y/scale};
    if(asteroidAlphaCache?.image!==im){const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);asteroidAlphaCache={image:im,width:im.width,height:im.height,alpha:g.getImageData(0,0,im.width,im.height).data};}
    const {width,height,alpha}=asteroidAlphaCache,x=Math.round((scaled.x+.5)*(width-1)),y=Math.round((scaled.y+.5)*(height-1));
    if(x<0||x>=width||y<0||y>=height)return false;
    const fringe=Math.max(1,Math.round(Math.min(width,height)*.003));
    for(let yy=Math.max(0,y-fringe);yy<=Math.min(height-1,y+fringe);yy++)for(let xx=Math.max(0,x-fringe);xx<=Math.min(width-1,x+fringe);xx++)if(alpha[(yy*width+xx)*4+3]>60)return true;
    return false;
  }
  function drawAsteroidCut(l,m,age){
    if(!asteroid()||age>3950)return null;
    const im=images.get(frameFile());if(!im)return null;
    const sweep=miningSweep(age),activePass=sweep.pass,segments=28,cuts=miningCutGeometry(images.get(state.ship.frames[0])),point=(pass,i)=>miningCutPoint(cuts,pass,cuts.x0+(cuts.x1-cuts.x0)*i/segments);
    asteroidCutCtx.clearRect(0,0,asteroidCutCanvas.width,asteroidCutCanvas.height);asteroidCutCtx.save();asteroidCutCtx.translate(l.x,l.y);asteroidCutCtx.rotate(state.angle);asteroidCutCtx.globalCompositeOperation='lighter';asteroidCutCtx.lineCap='round';asteroidCutCtx.lineJoin='round';
    const drawTrail=(pass,progress,width,color,blur)=>{asteroidCutCtx.beginPath();const distance=segments*progress,last=Math.floor(distance);for(let n=0;n<=last;n++){const i=pass%2?segments-n:n,p=point(pass,i);if(n===0)asteroidCutCtx.moveTo(p.x*l.w,p.y*l.h);else asteroidCutCtx.lineTo(p.x*l.w,p.y*l.h);}if(last<distance){const from=pass%2?segments-last:last,to=pass%2?from-1:from+1,a=point(pass,from),b=point(pass,to),f=distance-last;asteroidCutCtx.lineTo((a.x+(b.x-a.x)*f)*l.w,(a.y+(b.y-a.y)*f)*l.h);}asteroidCutCtx.strokeStyle=color;asteroidCutCtx.lineWidth=width;asteroidCutCtx.shadowColor=color;asteroidCutCtx.shadowBlur=blur;asteroidCutCtx.stroke();};
    const completed=state.miningSplit?.cutCount||0;for(let pass=0;pass<activePass;pass++)if(pass>=completed){drawTrail(pass,1,4,'rgba(255,104,28,.45)',8);drawTrail(pass,1,1.8,'#ff9b42',5);drawTrail(pass,1,.8,'#fff2b0',2);}
    if(activePass>=completed){drawTrail(activePass,sweep.ease,4,'rgba(255,104,28,.45)',8);drawTrail(activePass,sweep.ease,1.8,'#ff9b42',5);drawTrail(activePass,sweep.ease,.8,'#fff2b0',2);}
    const contact=asteroidOpaqueAt(sweep.point),tip=sweep.point,spark=1.7+Math.sin(age*.047)*.7;if(contact){asteroidCutCtx.shadowColor='#ffe7a0';asteroidCutCtx.shadowBlur=12;asteroidCutCtx.fillStyle='#fff8d6';asteroidCutCtx.beginPath();asteroidCutCtx.arc(tip.x*l.w,tip.y*l.h,spark,0,Math.PI*2);asteroidCutCtx.fill();}
    asteroidCutCtx.globalCompositeOperation='destination-in';asteroidCutCtx.shadowBlur=0;asteroidCutCtx.drawImage(im,-l.w/2,-l.h/2,l.w,l.h);asteroidCutCtx.restore();ctx.drawImage(asteroidCutCanvas,0,0);
    return contact?world(tip):null;
  }
  function drawMiningEffects(l,source){
    const m=state.miningSequence;if(!m)return;const age=state.time-m.born,progress=clamp((age-500)/3450,0,1);
    ctx.save();ctx.textAlign='center';ctx.font='700 10px system-ui';ctx.fillStyle='#a8eaff';ctx.shadowColor='#36bfff';ctx.shadowBlur=10;ctx.fillText('CUTTING '+state.ship.name.toUpperCase(),540,72);ctx.shadowBlur=0;ctx.fillStyle='#153241';ctx.fillRect(392,81,296,3);ctx.fillStyle='#46ceff';ctx.fillRect(392,81,296*progress,3);ctx.restore();
    const cutTip=drawAsteroidCut(l,m,age);
    if(age<5000){
      const sweep=miningSweep(age),inPass=sweep.raw>0&&sweep.raw<1,beamPower=inPass&&cutTip ? Math.sin(Math.PI*sweep.raw) : 0;
      const fallback=.22+.56*(.5+.5*Math.sin(age*.003));const ex=cutTip?.x??(l.x-l.w*.4+l.w*fallback),ey=cutTip?.y??(l.y+Math.sin(age*.004)*l.h*.20);
      if(beamPower>0){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=beamPower;ctx.lineCap='round';ctx.shadowColor='#36c9ff';ctx.shadowBlur=8+8*beamPower;ctx.strokeStyle='rgba(51,184,255,.48)';ctx.lineWidth=3.5+1.2*beamPower;ctx.beginPath();ctx.moveTo(source.x,source.y);ctx.lineTo(ex,ey);ctx.stroke();ctx.shadowBlur=4+4*beamPower;ctx.strokeStyle='#d8faff';ctx.lineWidth=1+0.6*beamPower;ctx.beginPath();ctx.moveTo(source.x,source.y);ctx.lineTo(ex,ey);ctx.stroke();ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(ex,ey,2.5+beamPower,0,Math.PI*2);ctx.fill();if(sweep.raw>.94){ctx.globalAlpha=(sweep.raw-.94)/.06*.5;ctx.strokeStyle='#fff2c1';ctx.lineWidth=1.2;ctx.shadowBlur=9;ctx.beginPath();ctx.ellipse(ex,ey,5+8*(sweep.raw-.94)/.06,3+5*(sweep.raw-.94)/.06,state.time*.002,0,Math.PI*2);ctx.stroke();}ctx.restore();}
      if(beamPower>0&&cutTip)drawMiningFlare(ex,ey,17+beamPower*9,'#ffd18a',beamPower*.65,Math.atan2(ey-source.y,ex-source.x));
    }
  }
  function destroy(sourceStage=stage()){
    if(!state.ready||state.destroyed)return;
    const l=layout(),mass=clamp((state.ship.mass-1)/1199,0,1),strength=4+6*mass,bursts=Math.round(12+18*mass);
    state.eggHatch=null;state.hull=0;state.destroyed=true;state.cloaked=false;state.shields=0;state.shots=[];
    environmentalImpacts.explode({x:l.x,y:l.y,born:state.time,radius:Math.max(490,Math.hypot(l.x-emitter().centerX,l.y-emitter().centerY)+80),duration:1050});
    if(droneShip()){
      breakDot(sourceStage,3);
      const shipBlast=window.droneShowcase.shipExplosion(state,{...window.droneShowcase.damagePose(state.ship,l,state.angle),time:state.time});
      if(!shipBlast){state.debris.push(...window.droneShowcase.explode(state.ship,l,state.angle,state.time));burst(l,2.2);for(let i=0;i<4;i++)burst(world(hullPoint()),.9,true,i*35);}
      playSound(shipBlast?'explodelarge':'explodesmall',.14);updateUI();explain(`${state.ship.name} destroyed. Its own unpowered hull pieces break apart. Restore drone to inspect again; your purchased fleet is unchanged.`);return;
    }
    if(asteroid()){
      state.miningSequence=null;state.miningSplit=null;state.asteroidTransition=null;state.asteroidBlast={born:state.time};
      emitAsteroidShards(images.get(state.ship.frames[3])||images.get(frameFile()),l,null,22,1.9,2.2);
      for(let i=0;i<7;i++)rockBurst(world(hullPoint()));createAsteroidOreField(l);playSound('explodesmall',.16);updateUI();
      explain(`${state.ship.name} fractures and bursts apart. Its 3 ${state.ship.oreLabel} pieces remain in place. Click the ore to transport it with the mining tool effect.`);
      return;
    }
    if(animatedStructure()){
      breakEarthStarbase(sourceStage,4);state.cthiaBlast={born:state.time,zoom:state.zoom};
      for(const [i,site] of stationBreaches().entries()){
        const blast={...site,delay:i*120,size:i===stationBreaches().length-1?48:28+site.r*40};
        const p=world(blast),born=state.time+blast.delay;state.particles.push({...p,vx:0,vy:0,size:blast.size*state.zoom,born,ttl:570,realistic:'blast',phase:i*1.7});
        for(let j=0;j<16;j++){const a=Math.random()*Math.PI*2,speed=(45+Math.random()*125)*state.zoom;state.particles.push({...p,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:(.55+Math.random()*.75)*state.zoom,born:born+Math.random()*90,ttl:450+Math.random()*670,realistic:'spark'});}
        for(let j=0;j<7;j++){const a=Math.random()*Math.PI*2,speed=(10+Math.random()*25)*state.zoom;state.particles.push({x:p.x+(Math.random()-.5)*16,y:p.y+(Math.random()-.5)*16,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:(5+Math.random()*9)*state.zoom,born:born+j*30,ttl:900+Math.random()*900,realistic:j<3?'fire':'smoke',phase:Math.random()*6});}
      }
      playSound('explodelarge',.14);updateUI();
      explain(`${state.ship.name} breaks apart. Its unpowered, burning hull sections drift away. Repair hull to restore the station.`);return;
    }
    if(biological()){
      biology().emit(state,l,world,sourceStage,state.zoom);playSound('explodelarge',.10);updateUI();
      explain(creature()&&!egg()?'The creature dies and tears into tissue and ichor. Restore creature returns it to full health.':creature()?'The dead egg collapses and tears into dark membrane, tissue and fluid. Nothing hatches; its interior and fragments stay unlit. Restore egg returns the living intact state.':state.ship.id===50?'The Lifeform contracts, swells and bursts. Fleshy lobes, sticky strands, ichor and spores drift outward as circulation fails. Repair hull restores the living pod.':'The Bioship convulses, swells and ruptures. Chitin, dying organs, ichor and spores drift outward with trailing sinews. Repair hull restores the living body.');return;
    }
    if(enhancedShip()){
      state.particles=[];window.cthiaDestruction.emit(state,l,world,sourceStage,state.zoom,{x:emitter().centerX,y:emitter().centerY});
      playSound('explode',.14);updateUI();explain(state.ship.id===23?'The sailing ship tears into its remaining sails, spars and navigation capsule. Small ignition flashes, sparks and fading smoke follow the torn material. Repair hull restores the ship.':state.ship.name+' breaks into its remaining hull sections. Breach flashes, hot sparks and fading smoke follow the wreckage; the reactor flares, then loses power. Use Repair hull to restore it.');return;
    }
    if(tugDamageShip()){
      window.tugIIADamage.destroy(l,state.angle,state.time);
      for(let i=0;i<5;i++)burst(world(hullPoint()),2.2,false,i*75);
      playSound('explodelarge',.14);updateUI();
      explain('The armored freight tug breaks apart. Its damaged hull pieces tumble away from the fire and blast; Repair hull restores the ship.');return;
    }
    burst(l,strength);burst(l,strength*.7,false,35);
    for(let i=0;i<bursts;i++)burst(world(hullPoint()),(1.6+3.6*mass)*(.8+Math.random()*.9),false,i*18);
    for(let i=0;i<12;i++)burst(world(hullPoint()),3.2+Math.random()*2.4,true,50+i*26);
    const count=Math.round(5+15*clamp((state.ship.mass-1)/999,0,1));
    for(let i=0;i<count;i++){
      const p=world(hullPoint()),a=Math.random()*Math.PI*2,speed=(20+Math.random()*180)*.8*state.zoom;
      state.debris.push({...p,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,spin:(Math.random()*2-1)*(1.2+Math.random()*2.2),angle:Math.random()*Math.PI*2,
        born:state.time,ttl:10000+Math.random()*10000,size:clamp(state.ship.size*(.09+Math.random()*.07),15,50)*.8*state.zoom,file:`debris-${state.ship.debrisKind}-${Math.floor(Math.random()*6)}.png`});
    }
    playSound(state.ship.mass<400?'explodesmall':state.ship.mass>800?'explodelarge':'explode',.14);updateUI();
    explain(animatedStructure()?`${state.ship.name} destroyed. Fires flare across the damaged hull and wreckage drifts away. Use Repair hull to restore the station.`:'Ship destroyed. Explosions spread across the hull while Rebirth debris spins outward, slows and fades. Use Repair hull to bring it back.');
  }
  function startAsteroidMining(){
    if(!asteroid()||!state.ready||state.miningSequence)return;
    stopSequence();clearEffects();state.hull=100;state.destroyed=false;state.shields=0;state.shieldsEnabled=false;
    state.miningSequence={born:state.time,cutCount:0,lastSparkEase:undefined,lastSparkPass:-1};updateUI();
    state.miningSplit=null;explain('Mining beam locked. Each completed laser pass frees a section to drift away while the cutter continues across the remaining rock.');
  }
  function stepAsteroidMining(){
    const m=state.miningSequence;if(!m)return;const t=state.time-m.born;
    if(t>500&&t<3950){const sweep=miningSweep(t),previous=m.lastSparkEase;if(m.lastSparkPass===sweep.pass&&previous!==undefined&&sweep.ease>previous&&asteroidOpaqueAt(sweep.point)){const p=world(sweep.point),normalAngle=state.angle+(Math.random()<.68?-Math.PI/2:Math.PI/2),count=1+(Math.random()<Math.min(.65,(sweep.ease-previous)*180)?1:0);for(let i=0;i<count;i++){const angle=normalAngle+(Math.random()-.5)*1.25,speed=65+Math.random()*145;state.particles.push({x:p.x,y:p.y,vx:Math.cos(angle)*speed+(sweep.pass%2?-18:18),vy:Math.sin(angle)*speed,gravity:75+Math.random()*115,size:1.2+Math.random()*1.5,born:state.time,ttl:260+Math.random()*290,miningSpark:true});}}m.lastSparkPass=sweep.pass;m.lastSparkEase=sweep.ease;}
    const thresholds=[1550,2750,3950];while(m.cutCount<thresholds.length&&t>=thresholds[m.cutCount]){const cutCount=++m.cutCount;if(!state.miningSplit)state.miningSplit=createMiningSplit(images.get(state.ship.frames[0]));state.miningSplit.cutCount=cutCount;const releaseRows=cutCount===1?[0]:cutCount===2?[1]:[2,3];for(const row of releaseRows)state.miningSplit.parts[row].released=true;if(cutCount===3){state.miningSplit.heatBorn=state.time;state.miningSequence=null;updateUI();explain('The cuts are complete. Heat is building inside the shield and the rock is beginning to glow.');}}
  }
  function fitMiningOres(l,ore){
    const sample=document.createElement('canvas');sample.width=ore.width;sample.height=ore.height;
    const g=sample.getContext('2d',{willReadFrequently:true});g.drawImage(ore,0,0);
    const alpha=g.getImageData(0,0,ore.width,ore.height).data,step=Math.max(3,Math.floor(Math.min(ore.width,ore.height)/34)),points=[];
    for(let y=0;y<ore.height;y+=step)for(let x=0;x<ore.width;x+=step)if(alpha[(y*ore.width+x)*4+3]>95)points.push({x:(x+.5)/ore.width-.5,y:(y+.5)/ore.height-.5});
    const rock=images.get(state.ship.frames[0]),rockCanvas=document.createElement('canvas');rockCanvas.width=rock.width;rockCanvas.height=rock.height;
    const rockContext=rockCanvas.getContext('2d',{willReadFrequently:true});rockContext.drawImage(rock,0,0);
    const rockAlpha=rockContext.getImageData(0,0,rock.width,rock.height).data;let left=rock.width,right=0,top=rock.height,bottom=0;
    for(let y=0;y<rock.height;y+=2)for(let x=0;x<rock.width;x+=2)if(rockAlpha[(y*rock.width+x)*4+3]>60){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const shieldScale=Math.max(miningShieldScale(),.70),radiusX=Math.max(.08,(right-left)/rock.width*shieldScale*.45),radiusY=Math.max(.08,(bottom-top)/rock.height*shieldScale*.45);
    const positions=[[-1,-1],[1,-1],[-1,1],[1,1]],angles=positions.map(()=>Math.random()*.5-.25),ca=Math.cos(state.angle),sa=Math.sin(state.angle);
    for(let fraction=.25;fraction>=.10;fraction-=.01){
      const size=l.w*fraction,offset=size*.52,minerals=positions.map(([col,row],i)=>({x:col*offset,y:row*offset,angle:angles[i],size}));
      const fits=minerals.every(mineral=>{const cr=Math.cos(mineral.angle),sr=Math.sin(mineral.angle);
        return points.every(point=>{const px=mineral.x+(point.x*cr-point.y*sr)*size,py=mineral.y+(point.x*sr+point.y*cr)*size;
          const localX=(px*ca+py*sa)/l.w,localY=(-px*sa+py*ca)/l.h;
          return (localX/radiusX)**2+(localY/radiusY)**2<=1;});
      });
      if(fits)return minerals;
    }
    const size=l.w*.10;return positions.map(([col,row],i)=>({x:col*size*.52,y:row*size*.52,angle:angles[i],size}));
  }
  function stepMiningSplit(dt){
    const split=state.miningSplit;if(!split)return;const l=layout(),ca=Math.cos(state.angle),sa=Math.sin(state.angle);
    if(split.heatBorn!==null)for(const part of split.parts){part.vx=0;part.vy=0;part.spin=0;}
    if(split.heatBorn!==null&&state.time-split.heatBorn>=3200&&!split.minerals){const ore=images.get(state.ship?.oreImage);if(ore){split.mineralScale=1-.4*miningShieldProgress();split.minerals=fitMiningOres(l,ore);split.mineralBorn=state.time;}else split.minerals=[];}
    if(split.minerals)return;
    if(split.heatBorn!==null)return;
    for(const part of split.parts)if(part.released){
      const ox=part.x,oy=part.y,or=part.rotation,nx=ox+part.vx*dt,ny=oy+part.vy*dt,nr=or+part.spin*dt,pieceScale=1-.4*miningShieldProgress();
      const outside=(x,y,rotation)=>{const angle=state.angle+rotation,cr=Math.cos(angle),sr=Math.sin(angle);for(const p of part.samples){const sx=l.x+x+p.x*l.w*pieceScale*cr-p.y*l.h*pieceScale*sr,sy=l.y+y+p.x*l.w*pieceScale*sr+p.y*l.h*pieceScale*cr,dx=sx-l.x,dy=sy-l.y,local={x:(dx*ca+dy*sa)/l.w,y:(-dx*sa+dy*ca)/l.h};if(!insideAsteroidShield(local))return local;}return null;};
      const failed=outside(nx,ny,nr);
      if(!failed){part.x=nx;part.y=ny;part.rotation=nr;continue;}
      let safe=0,blocked=1;
      if(!outside(ox,oy,or))for(let i=0;i<7;i++){const t=(safe+blocked)/2;if(outside(ox+(nx-ox)*t,oy+(ny-oy)*t,or+(nr-or)*t))blocked=t;else safe=t;}
      part.x=ox+(nx-ox)*safe;part.y=oy+(ny-oy)*safe;part.rotation=or+(nr-or)*safe;
      const shieldScale=miningShieldScale()*1.05,surface=asteroidSurfacePoint({x:failed.x/shieldScale,y:failed.y/shieldScale}),edge={x:surface.x*shieldScale,y:surface.y*shieldScale},contact=world(edge),dx=(failed.x-edge.x)*l.w*ca-(failed.y-edge.y)*l.h*sa,dy=(failed.x-edge.x)*l.w*sa+(failed.y-edge.y)*l.h*ca,len=Math.hypot(dx,dy)||1,nxv=dx/len,nyv=dy/len,dot=part.vx*nxv+part.vy*nyv;
      if(dot>0){part.vx-=1.35*dot*nxv;part.vy-=1.35*dot*nyv;}else{part.vx*=.35;part.vy*=.35;}part.spin*=-.4;
      split.ripples=split.ripples||[];split.ripples.push({x:contact.x,y:contact.y,born:state.time,ttl:520});if(split.ripples.length>10)split.ripples.shift();
    }
  }
  function hit(shot){
    if(shot.repairMission){hitRepairDrone(shot);return;}
    if(state.destroyed)return;state.repairSurface=null;
    state.hits++;const before=stage(),p=world(shot.hit),shielded=state.shields>0,oldHull=hullPoints(),oldShields=shieldPoints();let amount=shot.damage,absorbed=0;
    if(shielded){absorbed=Math.min(oldShields,amount);state.shields=Number(((oldShields-absorbed)/stats().shields*100).toFixed(12));amount-=absorbed;const l=layout(),vx=p.x-shot.from.x,vy=p.y-shot.from.y,length=Math.hypot(vx,vy)||1,c=Math.cos(state.angle),s=Math.sin(state.angle);state.flash={born:state.time,color:shieldColor(),x:shot.hit.x*l.w,y:shot.hit.y*l.h,dx:(vx*c+vy*s)/length,dy:(-vx*s+vy*c)/length,kind:shot.kind,energy:1+Math.min(.55,absorbed/Math.max(1,oldShields)*.7),charge:state.shields/100};playSound('shieldhit',.12);}
    if(amount>0){state.hull=Number((Math.max(0,oldHull-amount)/stats().hull*100).toFixed(12));if(biological()){biology().spray(state,p,state.zoom,20);cthiaOptions.impact={born:state.time,point:shot.hit};}else if(animatedStructure()){if(stage()===before)stationSparkBurst(shot.hit,7);}else if(!asteroid())burst(p,1);}
    if(tugDamageShip()&&state.hull>0&&stage()>before)window.tugIIADamage.change(before,stage(),layout(),state.angle,state.time,p);
    if(animatedStructure()&&amount>0)state.stationImpact={born:state.time,point:shot.hit};
    lastHit={weaponId:shot.style.id,weapon:shot.style.name,damage:shot.damage,shieldDamage:absorbed,hullDamage:oldHull-hullPoints(),overkill:Math.max(0,amount-oldHull),visual:shot.visual};
    $('hit-result').textContent=`${shot.style.name}: ${number(shot.damage)} damage | Shield damage: ${number(absorbed)} | ${asteroid()?'Asteroid':creature()?'Health':'Hull'} damage: ${number(lastHit.hullDamage)}${lastHit.overkill?' | Overkill: '+number(lastHit.overkill):''}${shot.visual?' | Visual override':''}`;
    updateUI();
    if(state.hull<=0){destroy(before);return;}
    if(asteroid()){state.miningSplit=null;if(stage()>before)beginAsteroidTransition(before,stage());explain(`${shot.style.name} hit ${state.ship.name} for ${number(lastHit.hullDamage)} damage. ${number(hullPoints())} / ${stats().hull} asteroid health remains${stage()>before?`; ${names[stage()]} damage artwork is now visible`:''}. Restore the asteroid to replay mining or test another weapon.`);return;}
    breakEarthStarbase(before,stage(),shot.site);
    breakCthia(before,stage());breakDot(before,stage(),shot.hit);
    if(shielded&&amount===0)explain(`Shield hit: ${Math.round(state.shields)}% shields remain. Hull stays at ${Math.round(state.hull)}%, so its damage artwork stays unchanged.`);
    else if(creature())explain(`${shot.style.name} dealt ${number(lastHit.hullDamage)} health damage. ${number(hullPoints())} / ${stats().hull} health remains.${intactOnly()?' Tissue reactions are visible; separate damage artwork is pending.':''}`);
    else if(stage()>before)explain(`Hull fell to ${Math.round(state.hull)}%. ${names[stage()]} artwork is now visible; the ${animatedStructure()?'station':'ship'} keeps the same alignment and size.`);
    else explain(`Hull hit: ${Math.round(state.hull)}% remains. ${biological()?'Ichor marks the injured tissue.':'Sparks mark the impact.'} The next artwork changes below ${stage()===0?75:stage()===1?50:25}% hull.`);
  }
  function shieldColor(ship=state.ship){const s=String(ship.shieldColor);return s==='green'?'#50ff78':s==='yellow'?'#ffd95a':s==='purple'?'#b465ff':'#50d5ff';}
  function fire(kind,visualPercent=null){
    if(!state.ready||state.destroyed||state.eggHatch||state.evolution)return;
    if(state.cloaked){state.cloaked=false;updateUI();}
    const drone=currentDroneTarget();if((state.repair||state.droneBattle?.isBusy())&&!drone){explain("Select a deployed drone to test weapon damage, or recall the fleet before firing at the hull.");return;}
    const index=Number($(kind+'-style').value),style=catalog.weapons[kind][index],from=emitter(),visual=visualPercent!==null||$('visual-damage').checked,damage=visual?(visualPercent??state.damage)*(drone?.maxHealth||stats().hull)/100:style.baseDamage;
    if(!visual){
      const remaining=(state.weaponReadyAt[style.id]||0)-state.time;
      if(remaining>0){explain(`${style.name} recharging: ${number(remaining/1000)} seconds remaining.`);return;}
      state.weaponReadyAt[style.id]=state.time+style.recharge*1000/13;
    }
    const target=drone?{point:{x:0,y:0},site:null}:shotTarget(damage),shot={...window.createShowcaseWeaponVisual({kind,style,units:catalog.units}),visual,from:{x:from.x,y:from.y},hit:target.point,site:target.site,born:state.time,damage};
    if(drone){shot.repairMission=drone.owner;shot.droneId=drone.id;shot.dronePoint={...drone.position};}
    state.shots.push(shot);playSound(style.sound);
    if(kind!=='beam')explain(`${style.name} is traveling toward ${drone?'the selected drone':'the hull'}. Damage is applied when it arrives.`);
    updateRecharge();
  }
  function sequence(){
    state.eggHatch=null;
    if(state.sequence){stopSequence();explain('Damage sequence stopped. Use the controls to continue inspecting the ship.');return;}
    reset(true);state.shields=0;state.shieldsEnabled=false;state.shieldCharge=100;updateUI();state.paused=false;$('pause').setAttribute('aria-pressed','false');$('pause').textContent='Ⅱ Pause';
    state.sequence={born:state.time,index:0,events:[{at:700,kind:'beam'},{at:2400,kind:'torpedo'},{at:4100,kind:'disruptor'},{at:5800,kind:'torpedo'},{at:9200,repair:true}]};
    $('sequence').textContent='■ Stop sequence';explain(creature()?'Biological sequence: shell splits, tissue tears, circulation stops and goes dark, then the dead body breaks apart and restores.':'Guided sequence: four 26% hull hits show light, heavy and severe damage, then destruction and repair.');
  }
  function step(dt){
    state.time+=dt*1000;dotDamageEffects.update(state.time);state.repairSurface?.advanceEffects?.(state.time);if(tugDamageShip())window.tugIIADamage.update(dt,state.time);if(asteroid()){stepAsteroidMining();stepMiningSplit(dt);}if(movingCreature()&&!state.destroyed&&stage()<3){const m=window.larvaMotion;if(m.mode==='crawl'){const pace=shipEffects().snapshot(stage(),state.time,cthiaOptions).pace||1;m.offset=-Math.sin((state.time-m.born)*.0006*pace)*(state.ship.creatureType==='queen'||[77,78].includes(state.ship.id)?26:45);}else if(m.mode==='settle')m.offset*=Math.exp(-dt*2.5);}if(state.eggHatch&&!state.eggHatch.complete&&state.time-state.eggHatch.born>=6500){state.eggHatch.complete=true;updateUI();explain('The baby has pulled free and is wriggling beside the empty shell. Restore egg to replay hatching.');}if(state.rotate&&!state.destroyed)state.angle+=dt*.35;stepSteamrunnerRepair();
    if(state.droneBattle){
      const busy=state.droneBattle.isBusy();state.droneBattle.advance(state.time,{layout:layout(),angle:state.angle,source:{...emitter(),shipId:shooter.id}});
      if(!state.repair&&busy&&!state.droneBattle.isBusy()){repairControls(false);updateUI();}
      else if(state.time>(state.droneBattleUiAt||0)){state.droneBattleUiAt=state.time+100;repairWorkshop.refresh();refreshDroneCombat();}
    }
    if(state.ship.id===69&&!state.destroyed){const m=window.larvaMotion,age=state.time-m.born;
      if(m.mode==='forward'){const d=Math.min(82,age*.042);m.offset=(m.startY||0)-d*Math.cos(state.angle)+Math.sin(age*.016)*2;m.xOffset=(m.startX||0)+d*Math.sin(state.angle);if(age>=2100){m.mode='idle';m.born=state.time;updateUI();}}
      if(m.mode==='turn'){const p=Math.min(1,age/1900),ease=p*p*(3-2*p);state.angle=(m.turnFromAngle||0)+Math.PI*ease;if(p===1){m.mode='idle';m.born=state.time;updateUI();}}
    }
    if(state.evolution){const e=state.evolution,age=state.time-e.born,p=window.creatureEvolution.phase(e.origin,age);
      if(p!==e.phase){e.phase=p;updateUI();}
      if(p==='complete'&&!e.done){e.done=true;const bornFrom=e.origin;queueMicrotask(async()=>{await selectShip(71);if(state.ship?.id===71&&state.ready){state.evolutionLanding={born:state.time,x:15,y:bornFrom===67?-45:-20};explain('Evolution complete. Juvenile A has emerged from Larva A’s shed shell.');}});}
    }
    if(state.sequence){const seq=state.sequence,e=seq.events[seq.index];if(e&&state.time-seq.born>=e.at){seq.index++;if(e.repair){reset(true);explain(creature()?'Sequence complete: all four tissue stages, dead egg breakup and restoration.':'Sequence complete: all four hull stages, destruction and repair. Try another ship or switch weapon styles.');}else if(creature()){const before=stage();state.hull=Math.max(0,state.hull-26);if(!state.hull)destroy(before);else{breakCthia(before,stage());breakDot(before,stage());updateUI();}}else fire(e.kind,26);}}
    for(const shot of state.shots)if(shot.repairMission){const target=shot.repairMission.target(shot.droneId);if(target)shot.dronePoint={...target.position};}
    for(const shot of [...state.shots])if(!shot.impacted&&state.time-shot.born>=(shot.kind==='beam'?70:650)){shot.impacted=true;hit(shot);}
    state.shots=state.shots.filter(s=>state.time-s.born<(s.kind==='beam'?180:730));
    if(state.asteroidOreField?.collectionBorn!==undefined&&state.time-state.asteroidOreField.collectionBorn>2500){state.asteroidOreField=null;explain(`${state.ship.oreLabel} transported. Restore the asteroid to mine again.`);}
    for(const p of state.particles){if(state.time<p.born)continue;if(!p.miningSpark&&!p.realistic){window.showcaseHullBurst.update(p,dt);continue;}if(p.miningSpark)p.vy+=p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;const drag=Math.max(0,1-(p.miningSpark?.72:p.core?3.6:2.8)*dt);p.vx*=drag;p.vy*=drag;}
    state.particles=state.particles.filter(p=>state.time-p.born<p.ttl);
    if(animatedStructure()){
      if(!state.destroyed&&stage()>0&&cthiaOptions.damage&&Math.random()<dt*(stage()===3?4:2)){const sites=stationBreaches().filter(b=>b.stage<=stage()),site=sites[Math.floor(Math.random()*sites.length)];stationSparkBurst(site,1+Math.floor(Math.random()*3));if(Math.random()<.4)stationElectricArcs(site,1);}
      for(const piece of state.stationFragments){const released=state.time-piece.born-piece.delay;if(released<0)continue;const oldX=piece.x,oldY=piece.y;piece.x+=piece.vx*dt;piece.y+=piece.vy*dt;piece.angle+=piece.spin*dt;stepEnvironmentalDebris(piece,oldX,oldY);piece.vx*=Math.max(0,1-dt*.12);piece.vy*=Math.max(0,1-dt*.12);
        if(released<2400&&piece.edgeSites?.length&&state.time>=piece.trailAt){piece.trailAt=state.time+95+Math.random()*45;const site=piece.edgeSites[Math.floor(Math.random()*piece.edgeSites.length)],lx=site.x*piece.w,ly=site.y*piece.h,ca=Math.cos(piece.angle),sa=Math.sin(piece.angle),x=piece.x+lx*ca-ly*sa,y=piece.y+lx*sa+ly*ca;state.particles.push({x,y,vx:-piece.vx*.13,vy:-piece.vy*.13,size:(3+Math.random()*3)*state.zoom,born:state.time,ttl:700+Math.random()*550,phase:Math.random()*6,realistic:'smoke'});if(released<1600)state.particles.push({x,y,vx:piece.vx*.1,vy:piece.vy*.1,size:(2.5+Math.random()*4)*state.zoom,born:state.time,ttl:400+Math.random()*500,phase:Math.random()*6,realistic:'fire'});if(released<1100&&Math.random()<.7)state.particles.push({x,y,vx:piece.vx*.2+(Math.random()-.5)*36,vy:piece.vy*.2+(Math.random()-.5)*36,size:.75*state.zoom,born:state.time,ttl:330+Math.random()*260,realistic:'spark'});}
      }
      state.stationFragments=state.stationFragments.filter(piece=>state.time-piece.born<piece.ttl);
      for(const spark of state.stationSparks){spark.x+=spark.vx*dt;spark.y+=spark.vy*dt;spark.vx*=Math.max(0,1-dt*1.1);spark.vy*=Math.max(0,1-dt*1.1);}
      state.stationSparks=state.stationSparks.filter(spark=>state.time-spark.born<spark.ttl);
      state.stationGlassCracks=state.stationGlassCracks.filter(crack=>state.time-crack.born<crack.ttl);
      state.stationArcs=state.stationArcs.filter(arc=>state.time-arc.born<arc.ttl);
    }
    for(const p of state.debris){if(state.time<p.born)continue;
      if(p.cthia&&!p.wreck){const oldX=p.x,oldY=p.y;window.showcaseStageFragments.update(p,dt);stepEnvironmentalDebris(p,oldX,oldY);continue;}
      const oldX=p.x,oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;stepEnvironmentalDebris(p,oldX,oldY);if(p.asteroidShard){if(state.miningSequence){const l=layout(),dx=(p.x-l.x)/(l.w*.63),dy=(p.y-l.y)/(l.h*.70),r=Math.hypot(dx,dy);if(r>.88){p.x=l.x+dx/r*l.w*.55;p.y=l.y+dy/r*l.h*.62;const dot=p.vx*dx/r+p.vy*dy/r;p.vx=(p.vx-2*dot*dx/r)*.42;p.vy=(p.vy-2*dot*dy/r)*.42;}}const drag=Math.max(0,1-.32*dt);p.vx*=drag;p.vy*=drag;continue;}p.vx*=Math.max(0,1-(p.farTravel?.055:p.structural?(p.small?.35:.65):.2)*dt);p.vy*=Math.max(0,1-(p.farTravel?.055:p.structural?(p.small?.35:.65):.2)*dt);}
    environmentalImpacts.update(state.time);
    state.debris=state.debris.filter(p=>state.time-p.born<p.ttl);window.cthiaDestruction.updateTrails(state);if(biological()){biology().updateTrails(state);biology().updateLiving(state,world,stage(),state.zoom,cthiaOptions);}
  }
  function gradient(x,y,r,hex,alpha=1){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#ffffff');g.addColorStop(.18,hex);g.addColorStop(1,hex+'00');ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  function shipImage(im,x,y,w,h,a=0,flash=false){
    if(!im)return;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.drawImage(im,-w/2,-h/2,w,h);
    if(flash&&state.flash&&state.time-state.flash.born<620){
      window.drawShowcaseShieldFlash(ctx,im,w,h,state.flash,state.time);
    }ctx.restore();
  }
  function label(text,x,y,align='center',tint='#7089a0'){ctx.textAlign=align;ctx.fillStyle=tint;ctx.font='10px system-ui';ctx.fillText(text,x,y);}
  function drawCombatTargetFrame(l){
    window.drawShowcaseTargetFrame(ctx,{
      x:l.x,y:l.y,w:l.w,h:l.h,name:state.ship.name,kind:state.target,color:colors[state.target],
      shield:state.shields/100,hull:state.hull/100,shieldColor:shieldColor()
    });
  }
  function drawEarthResearchLights(t,active){
    // Coordinates follow the illuminated channels in the 1254px Earth Research artwork.
    const wings=[[[606,490],[550,265],[505,30]],[[765,596],[990,541],[1220,503]],[[673,767],[718,992],[758,1225]],[[478,666],[262,707],[36,744]]];
    const point=(wing,u)=>{const v=1-u;return{x:v*v*wing[0][0]+2*v*u*wing[1][0]+u*u*wing[2][0],y:v*v*wing[0][1]+2*v*u*wing[1][1]+u*u*wing[2][1]};};
    const blocked=(x,y)=>active.some(b=>Math.hypot(x/1254-.5-b.x,y/1254-.5-b.y)<b.r*2.2);
    const channelBlocked=(x,y)=>active.some(b=>Math.hypot(x/1254-.5-b.x,y/1254-.5-b.y)<b.r*1.3);
    ctx.save();ctx.scale(1/1254,1/1254);ctx.translate(-627,-627);ctx.lineCap='round';
    for(const [wingIndex,wing] of wings.entries()){
      ctx.beginPath();let tracing=false;for(let step=0;step<=80;step++){const {x,y}=point(wing,step/80);if(channelBlocked(x,y)){tracing=false;continue;}if(tracing)ctx.lineTo(x,y);else{ctx.moveTo(x,y);tracing=true;}}
      ctx.globalAlpha=.3;ctx.strokeStyle='#ffb951';ctx.lineWidth=26;ctx.shadowColor='#ffb951';ctx.shadowBlur=28;ctx.stroke();
      ctx.globalAlpha=.48;ctx.strokeStyle='#ffe29b';ctx.lineWidth=3;ctx.shadowBlur=12;ctx.stroke();
      const runner=.5-.5*Math.cos(t*1.65+wingIndex*.35);
      for(let i=0;i<19;i++){
        const u=.07+i*.0475,{x,y}=point(wing,u);if(blocked(x,y))continue;
        const distance=Math.abs(u-runner),wave=Math.exp(-distance*distance/.006),brightness=.32+.68*wave;
        ctx.globalAlpha=brightness;ctx.fillStyle='#ffd883';ctx.shadowColor='#ffae42';ctx.shadowBlur=18+16*wave;
        ctx.beginPath();ctx.ellipse(x,y,8+4*wave,5+2*wave,Math.atan2(wing[2][1]-wing[0][1],wing[2][0]-wing[0][0]),0,Math.PI*2);ctx.fill();
        if(wave>.3){ctx.globalAlpha=.95*wave;ctx.fillStyle='#fffbed';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
      }
      const hot=point(wing,runner),runningGlow=ctx.createRadialGradient(hot.x,hot.y,0,hot.x,hot.y,32);
      runningGlow.addColorStop(0,'rgba(255,251,224,.9)');runningGlow.addColorStop(.3,'rgba(255,205,100,.6)');runningGlow.addColorStop(1,'rgba(255,170,45,0)');
      if(!blocked(hot.x,hot.y)){ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle=runningGlow;ctx.beginPath();ctx.arc(hot.x,hot.y,32,0,Math.PI*2);ctx.fill();}
    }
    const hubPulse=.75+.25*Math.sin(t*2.4),hub=ctx.createRadialGradient(627,623,8,627,623,83);
    hub.addColorStop(0,`rgba(145,245,255,${.65*hubPulse})`);hub.addColorStop(.55,`rgba(37,193,255,${.42*hubPulse})`);hub.addColorStop(1,'rgba(37,193,255,0)');
    ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle=hub;ctx.beginPath();ctx.arc(627,623,83,0,Math.PI*2);ctx.fill();
    for(const [x,y] of [[627,570],[680,623],[627,676],[574,623]]){if(blocked(x,y))continue;ctx.globalAlpha=.6+.3*Math.sin(t*2.2+(x+y)*.01);ctx.fillStyle='#8eeaff';ctx.shadowColor='#4ddfff';ctx.shadowBlur=17;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();}
    for(const [x,y] of [[546,544],[704,544],[704,709],[558,707],[519,620],[735,620]]){if(blocked(x,y))continue;ctx.globalAlpha=.65+.25*Math.sin(t*1.9+(x+y)*.02);ctx.fillStyle='#ffe4a2';ctx.shadowColor='#ffae49';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function prepareArtworkLights(){
    for(const file of state.ship.frames){
      if(artworkLightLayers.has(file))continue;
      const im=images.get(file),w=im.width,h=im.height,source=document.createElement('canvas');source.width=w;source.height=h;
      const sourceContext=source.getContext('2d',{willReadFrequently:true});sourceContext.drawImage(im,0,0);const pixels=sourceContext.getImageData(0,0,w,h).data;
      const cyan=document.createElement('canvas'),amber=document.createElement('canvas');cyan.width=amber.width=w;cyan.height=amber.height=h;
      const cyanContext=cyan.getContext('2d'),amberContext=amber.getContext('2d'),cyanPixels=cyanContext.createImageData(w,h),amberPixels=amberContext.createImageData(w,h);
      const habitat=state.ship.id===300,tile=28,columns=Math.ceil(w/tile),cells=columns*Math.ceil(h/tile),bins=habitat?[0,1].map(()=>({count:new Uint16Array(cells),x:new Float32Array(cells),y:new Float32Array(cells)})):null;
      for(let i=0;i<pixels.length;i+=4){
        const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];if(a<80)continue;
        let kind=-1;
        if(b>120&&g>110&&b>r*1.3&&g>r*1.25){cyanPixels.data[i]=84;cyanPixels.data[i+1]=244;cyanPixels.data[i+2]=255;cyanPixels.data[i+3]=Math.min(235,a*.9);kind=0;}
        else if(r>150&&g>(habitat?145:110)&&b<g*(habitat ? .95 : .82)&&r>g*.98){amberPixels.data[i]=255;amberPixels.data[i+1]=219;amberPixels.data[i+2]=133;amberPixels.data[i+3]=Math.min(235,a*.9);kind=1;}
        if(habitat&&kind>=0){const pixel=i/4,x=pixel%w,y=Math.floor(pixel/w),bin=Math.floor(y/tile)*columns+Math.floor(x/tile),group=bins[kind];group.count[bin]++;group.x[bin]+=x;group.y[bin]+=y;}
      }
      const points=[];if(habitat)for(const [kind,group] of bins.entries())for(let bin=0;bin<cells;bin++){const count=group.count[bin];if(count<6)continue;points.push({x:group.x[bin]/count,y:group.y[bin]/count,r:kind===0?18:13,kind});}
      cyanContext.putImageData(cyanPixels,0,0);amberContext.putImageData(amberPixels,0,0);artworkLightLayers.set(file,{cyan,amber,w,h,points});
    }
  }
  function drawArtworkLights(t,s){
    const layer=artworkLightLayers.get(state.ship.frames[s]),habitat=state.ship.id===300;if(!layer)return;
    ctx.save();ctx.scale(1/layer.w,1/layer.h);ctx.translate(-layer.w/2,-layer.h/2);
    for(const [im,color,phase] of [[layer.cyan,'#3ff5f2',0],[layer.amber,'#ffd589',1.4]]){
      const pulse=habitat ? .68+.32*Math.sin(t*(phase?2.8:2.1)+phase) : .78+.22*Math.sin(t*(phase?2.8:2.1)+phase);
      ctx.globalAlpha=(habitat ? .72 : .55)*pulse;ctx.shadowColor=color;ctx.shadowBlur=habitat?22:18;ctx.drawImage(im,0,0);
      ctx.globalAlpha=(habitat ? .62 : .45)*pulse;ctx.shadowBlur=0;ctx.drawImage(im,0,0);
    }
    if(habitat)for(const point of layer.points){
      const pulse=.55+.45*Math.sin(t*(point.kind?2.7:2.3)+point.x*.019+point.y*.013),r=point.r;
      const glow=ctx.createRadialGradient(point.x,point.y,0,point.x,point.y,r);
      glow.addColorStop(0,point.kind?`rgba(255,231,158,${.68*pulse})`:`rgba(112,243,255,${.6*pulse})`);
      glow.addColorStop(1,point.kind?'rgba(255,198,85,0)':'rgba(54,210,255,0)');
      ctx.globalAlpha=1;ctx.fillStyle=glow;ctx.fillRect(point.x-r,point.y-r,r*2,r*2);
    }
    ctx.restore();
  }
  function drawEarthStarbaseEffects(l){
    const s=stage(),t=state.time*.001,active=stationBreaches().filter(b=>b.stage<=s),config=stationConfig();
    ctx.save();ctx.translate(l.x,l.y);ctx.rotate(state.angle);ctx.scale(l.w,l.h);ctx.globalCompositeOperation='lighter';
    if(cthiaOptions.lights&&s<3){
      if(state.ship.id===274)drawEarthResearchLights(t,active);
      else if([286,300].includes(state.ship.id))drawArtworkLights(t,s);
      else{const lights=config.points||config.rings.flatMap(([ring,count,offset])=>Array.from({length:count},(_,i)=>{const a=i*Math.PI*2/count+offset;return[Math.cos(a)*ring,Math.sin(a)*ring];}));
        for(const [i,[x,y]] of lights.entries()){
          if(state.ship.id===276&&s>=2&&x>.05)continue;
          if(active.some(b=>Math.hypot(x-b.x,y-b.y)<b.r*2.2))continue;
          const pulse=.5+.5*Math.sin(t*(1.7+(i%3)*.14)+i*.8),flicker=s>0&&i%11===0?(.25+.75*(Math.sin(t*15+i*3)>0?1:0)):1;
          ctx.globalAlpha=(.15+.33*pulse)*flicker;ctx.fillStyle=config.lightColors[i%7===0?1:0];ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=5;
          ctx.beginPath();ctx.ellipse(x,y,.0055,.006,0,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.shadowBlur=0;
    }
    if(cthiaOptions.damage)for(const [i,b] of active.entries()){
      const heat=.68+.32*Math.sin(t*(3.1+i*.43)+i*1.8),r=b.r;
      const reflected=ctx.createRadialGradient(b.x,b.y,r*.18,b.x,b.y,r*1.65);reflected.addColorStop(0,`rgba(255,154,49,${.27*heat})`);reflected.addColorStop(.45,`rgba(255,75,20,${.18*heat})`);reflected.addColorStop(1,'rgba(255,65,15,0)');ctx.globalAlpha=1;ctx.fillStyle=reflected;ctx.fillRect(b.x-r*1.7,b.y-r*1.7,r*3.4,r*3.4);
      ctx.save();ctx.beginPath();ctx.ellipse(b.x,b.y,r*.83,r*.71,-.25,0,Math.PI*2);ctx.clip();
      const core=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,r);core.addColorStop(0,`rgba(255,220,118,${.38*heat})`);core.addColorStop(.3,`rgba(255,112,31,${.34*heat})`);core.addColorStop(1,'rgba(255,48,12,0)');ctx.fillStyle=core;ctx.fillRect(b.x-r,b.y-r,r*2,r*2);ctx.restore();
      if(cthiaOptions.anchors){ctx.globalAlpha=.8;ctx.strokeStyle='#ffd06d';ctx.lineWidth=.003;ctx.beginPath();ctx.arc(b.x,b.y,r*1.2,0,Math.PI*2);ctx.stroke();}
    }
    for(const crack of state.stationGlassCracks){const age=state.time-crack.born;if(age<0||age>crack.ttl)continue;const fade=1-age/crack.ttl;ctx.globalAlpha=fade*.8;ctx.strokeStyle='#d6efff';ctx.lineWidth=.0018;ctx.shadowColor='#9fdcff';ctx.shadowBlur=3;for(let ray=0;ray<6;ray++){const a=crack.turn+ray*Math.PI/3,len=.018+(ray%3)*.004,mx=crack.x+Math.cos(a)*len*.55,my=crack.y+Math.sin(a)*len*.55;ctx.beginPath();ctx.moveTo(crack.x,crack.y);ctx.lineTo(mx,my);ctx.lineTo(crack.x+Math.cos(a+.15)*len,crack.y+Math.sin(a+.15)*len);ctx.stroke();ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx+Math.cos(a+.72)*len*.42,my+Math.sin(a+.72)*len*.42);ctx.stroke();}ctx.shadowBlur=0;}
    for(const arc of state.stationArcs){const age=state.time-arc.born;if(age<0||age>arc.ttl)continue;const fade=1-age/arc.ttl,span=arc.r*2.2,dx=Math.cos(arc.turn)*span,dy=Math.sin(arc.turn)*span;ctx.save();ctx.globalAlpha=fade*.9;ctx.strokeStyle=state.ship.structureGroup==='Shipyards'?'#a8eaff':'#d6efff';ctx.shadowColor='#65c9ff';ctx.shadowBlur=8;ctx.lineWidth=.0024;ctx.beginPath();for(let j=0;j<=6;j++){const u=j/6,offset=j===0||j===6?0:Math.sin(arc.seed+j*17)*arc.r*.34,x=arc.x+(u-.5)*dx-offset*dy/span,y=arc.y+(u-.5)*dy+offset*dx/span;if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();ctx.restore();}
    if(state.stationImpact){const age=state.time-state.stationImpact.born;if(age<420){const p=state.stationImpact.point,q=1-age/420,r=.012+.055*(1-q);ctx.globalAlpha=q*.8;ctx.strokeStyle='#fff2bb';ctx.lineWidth=.0025*q;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();const flare=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,.055*q);flare.addColorStop(0,`rgba(255,255,237,${q*.8})`);flare.addColorStop(1,'rgba(255,116,33,0)');ctx.fillStyle=flare;ctx.fillRect(p.x-.055,p.y-.055,.11,.11);}}
    ctx.restore();
  }
  function drawEarthStarbaseBreakup(l){
    for(const piece of state.stationFragments){const age=state.time-piece.born,released=age-piece.delay,fade=clamp((piece.ttl-age)/650,0,1);ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);ctx.globalAlpha=fade;const burned=window.wreckageEffects?.draw(ctx,piece.texture,piece.w,piece.h,Math.max(0,released));if(!burned)ctx.drawImage(piece.texture,-piece.w/2,-piece.h/2,piece.w,piece.h);if(!burned&&released>=0&&piece.edge){ctx.drawImage(piece.edge,-piece.w/2,-piece.h/2,piece.w,piece.h);if(released<2500){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=fade*(1-released/2500)**1.25*(.7+.3*Math.sin(state.time*.031));ctx.drawImage(piece.hot,-piece.w/2,-piece.h/2,piece.w,piece.h);ctx.restore();}}ctx.restore();}
    if(!cthiaOptions.damage)return;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    for(const spark of state.stationSparks){const age=state.time-spark.born,q=clamp(1-age/spark.ttl,0,1),speed=Math.hypot(spark.vx,spark.vy),dx=spark.vx/(speed||1),dy=spark.vy/(speed||1),trail=(3+speed*.05)*q;ctx.globalAlpha=q*.9;ctx.strokeStyle=age<spark.ttl*.28?'#fff3cb':age<spark.ttl*.7?'#ffc26a':'#f46a28';ctx.lineWidth=spark.size*q;ctx.shadowColor='#ff9a3b';ctx.shadowBlur=5*q;ctx.beginPath();ctx.moveTo(spark.x-dx*trail,spark.y-dy*trail);ctx.lineTo(spark.x,spark.y);ctx.stroke();}
    ctx.restore();
  }
  function draw(){
    ctx.clearRect(0,0,900,540);ctx.fillStyle='#050b12';ctx.fillRect(0,0,900,540);
    const bg=ctx.createRadialGradient(490,265,0,490,265,480);bg.addColorStop(0,'#122d3b90');bg.addColorStop(1,'#050b1200');ctx.fillStyle=bg;ctx.fillRect(0,0,900,540);
    for(const s of stars){ctx.globalAlpha=s.a;ctx.fillStyle='#bcd6f2';ctx.fillRect(s.x,s.y,s.r,s.r);}ctx.globalAlpha=1;
    ctx.strokeStyle='#25495b28';ctx.lineWidth=1;for(let x=30;x<900;x+=90){ctx.beginPath();ctx.moveTo(x,60);ctx.lineTo(x,475);ctx.stroke();}for(let y=70;y<475;y+=90){ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(870,y);ctx.stroke();}
    if(!state.ready)return;
    drawEnvironmentalScene();
    if(structure()&&!animatedStructure()||artworkOnlyShip()){
      const l=layout();shipImage(images.get(state.ship.frames[0]),l.x,l.y,l.w,l.h,state.angle);
      if(artworkOnlyShip())window.tugClassIILights.draw(ctx,state.ship.id,l,state.angle,state.time,cthiaOptions.lights);
      label(artworkOnlyShip()?`INTACT SHIP - LIGHTS ${cthiaOptions.lights?'ON':'OFF'}`:state.ship.kind==='turret'?'EQUIPMENT ICON PREVIEW':'STRUCTURE ARTWORK PREVIEW',l.x,460,'center','#9fc6d8');
      return;
    }
    if(asteroid()){
      const l=layout(),source=emitter();if(!state.repair&&!state.repairSurface)drawNearbyShip(source);
      if(!state.destroyed||state.miningSequence)drawAsteroidSprite(l);
      if(state.miningSequence||state.miningSplit)drawMiningShield(l);
      drawAsteroidDebris();drawAsteroidBlast(l);drawMiningEffects(l,source);drawDestroyedAsteroidOres(l);
      label(state.asteroidOreField?(state.asteroidOreField.collectionBorn===undefined?'CLICK ORE TO TRANSPORT':'ORE TRANSPORTING'):state.destroyed?'ASTEROID DESTROYED':`${number(hullPoints())} / ${stats().hull} HEALTH`,l.x,460,state.destroyed?'#ed8b94':'#e9bc73');
      for(const shot of state.shots){const hit=shotPoint(shot),age=state.time-shot.born,t=clamp(age/650,0,1);window.paintShowcaseWeaponShot(ctx,shot,{zoom:state.zoom,x1:shot.from.x,y1:shot.from.y,x2:hit.x,y2:hit.y,x:shot.from.x+(hit.x-shot.from.x)*t,y:shot.from.y+(hit.y-shot.from.y)*t,angle:Math.atan2(hit.y-shot.from.y,hit.x-shot.from.x)},age);}
      for(const p of state.particles){const age=state.time-p.born;if(age<0||age>p.ttl)continue;const fade=1-age/p.ttl,size=Math.max(1,Math.round(p.size));if(p.miningSpark){const t=clamp(age/p.ttl,0,1),color=t<.22?'#fff5cb':t<.62?'#ffd16e':'#ff782b',tail=Math.min(10,Math.hypot(p.vx,p.vy)*.035);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=fade;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.7,size*.72);ctx.shadowColor=t<.5?'#ffe19a':'#ff792f';ctx.shadowBlur=4*fade;ctx.beginPath();ctx.moveTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.lineTo(p.x+tail*p.vx/Math.max(1,Math.hypot(p.vx,p.vy)),p.y+tail*p.vy/Math.max(1,Math.hypot(p.vx,p.vy)));ctx.stroke();ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.6,size*.42)*fade,0,Math.PI*2);ctx.fill();ctx.restore();continue;}ctx.globalAlpha=fade;ctx.fillStyle=p.color|| (p.core?'#ff8c14':'#ffd25a');ctx.fillRect(Math.round(p.x)-Math.floor(size/2),Math.round(p.y)-Math.floor(size/2),size,size);}ctx.globalAlpha=1;
      ctx.globalAlpha=1;return;
    }
    ctx.save();window.cthiaDestruction.shake(ctx,state);
    const l=layout(),source=emitter();if(!state.repair&&!state.repairSurface)drawNearbyShip(source);
    if(state.compare){shipImage(images.get(state.ship.original),285,253,l.w,l.h,state.angle);label('ORIGINAL REFERENCE',285,460);label('UPDATED · '+(state.destroyed?'DESTROYED':names[stage()].toUpperCase()),l.x,460);ctx.strokeStyle='#38505e';ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(450,75);ctx.lineTo(450,435);ctx.stroke();ctx.setLineDash([]);}
    else if(!state.repair&&!state.repairSurface)label(state.evolution?`${state.evolution.phase.toUpperCase()} · ${state.evolution.phase==='hatching'?'EGG A':state.evolution.phase==='juvenile'||state.evolution.phase==='complete'?'JUVENILE A':'LARVA A'}`:state.ship.name.toUpperCase(),l.x,460);
    if(!state.destroyed){
      const shieldVisible=!state.cloaked&&!creature()&&!structure()&&state.shieldsEnabled&&!!state.flash;
      if(shieldVisible)window.drawShowcaseShieldSurface(ctx,l.x,l.y,l.w,l.h,shieldColor(),Math.max(.08,state.shields/100),state.time,{refract:true,impact:state.flash});
      ctx.save();if(state.cloaked)ctx.globalAlpha=.18;
      if(state.repair||state.repairSurface)(state.repair||state.repairSurface).drawBody(ctx,l,state.angle);
      else if(droneShip())window.droneShowcase.draw(ctx,state.ship,l,state.angle,state.hull,state.time,cthiaOptions);
      else if(state.evolution)window.creatureEvolution.draw(ctx,{state,evolution:state.evolution,layout:l,assets:images,eggBiology:window.starterShips.get(67).biology,larvaBiology:window.starterShips.get(69).biology});
      else if(state.eggHatch){biology().drawHatch(ctx,state,l);}else if(biological()){biology().drawBody(ctx,images.get(frameFile()),l,state.angle,stage(),state.time);if(state.flash&&state.time-state.flash.born<620){ctx.save();ctx.translate(l.x,l.y);ctx.rotate(state.angle);window.drawShowcaseShieldFlash(ctx,images.get(frameFile()),l.w,l.h,state.flash,state.time);ctx.restore();}}else shipImage(images.get(frameFile()),l.x,l.y,l.w,l.h,state.angle,true);
      if(tugDamageShip()&&!state.cloaked)window.tugClassIILights.draw(ctx,state.ship.id,l,state.angle,state.time,cthiaOptions.lights,stage());
      if(tugDamageShip())window.tugIIADamage.drawHull(ctx,l,state.angle,state.time,stage(),cthiaOptions.damage);
      if(enhancedShip()&&!state.repair&&!state.repairSurface&&!state.cloaked&&!state.eggHatch&&!state.evolution)shipEffects().draw(ctx,l,state.angle,stage(),state.time,cthiaOptions);if(animatedStructure())drawEarthStarbaseEffects(l);ctx.restore();
      if(shieldVisible)window.drawShowcaseShieldSurface(ctx,l.x,l.y,l.w,l.h,shieldColor(),Math.max(.08,state.shields/100),state.time,{front:true,impact:state.flash});
      if(!state.repair&&!creature()&&!structure())drawCombatTargetFrame(l);
    }
    if(state.repair||state.repairSurface)(state.repair||state.repairSurface).drawBeam(ctx,l,state.angle,state.time,source,Number($('repair-attack-target').value),cthiaOptions);
    if(state.droneBattle)state.droneBattle.draw(ctx,state.time,$('repair-attack-target').value,cthiaOptions);
    if(state.repair||state.repairSurface||state.droneBattle?.isBusy())drawNearbyShip(source);
    if(animatedStructure())drawEarthStarbaseBreakup(l);
    if(biological()&&state.destroyed)biology().drawDeath(ctx,state);
    if(droneShip())dotDamageEffects.draw(ctx,state.time);
    for(const shot of state.shots){
      const hit=shotPoint(shot),age=state.time-shot.born,t=clamp(age/650,0,1);
      window.paintShowcaseWeaponShot(ctx,shot,{zoom:state.zoom,
        x1:shot.from.x,y1:shot.from.y,x2:hit.x,y2:hit.y,
        x:shot.from.x+(hit.x-shot.from.x)*t,y:shot.from.y+(hit.y-shot.from.y)*t,
        angle:Math.atan2(hit.y-shot.from.y,hit.x-shot.from.x)},age);
    }
    for(const p of state.debris){if(p.cthia&&!p.wreck){window.showcaseStageFragments.draw(ctx,p,state.time);continue;}const age=state.time-p.born;if(age<0)continue;const fade=age/p.ttl;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=fade<.65?1:Math.max(0,(1-fade)/.35);const im=p.texture||images.get(p.file);if(p.biological)window.bioshipEffects.drawWreck(ctx,p,state.time);else if(p.structural)window.cthiaDestruction.drawStructuralWreck(ctx,p,state.time);else if(im&&!window.wreckageEffects?.draw(ctx,im,p.w||p.size,p.h||p.size,age))ctx.drawImage(im,-(p.w||p.size)/2,-(p.h||p.size)/2,p.w||p.size,p.h||p.size);if(p.wreck&&!p.structural)window.cthiaDestruction.drawWreckGlow(ctx,p,state.time);ctx.restore();}
    if(tugDamageShip())window.tugIIADamage.drawPieces(ctx,state.time);
    for(const p of state.particles){const age=state.time-p.born;if(age<0||age>p.ttl)continue;if(p.realistic){if(p.realistic.startsWith('bio-'))window.bioshipEffects.drawParticle(ctx,p,state.time);else window.cthiaDestruction.drawParticle(ctx,p,state.time);continue;}window.showcaseHullBurst.draw(ctx,p,state.time);}
    ctx.restore();ctx.globalAlpha=1;
  }
  function frame(now){const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;if(state.ready&&!state.paused)step(dt*(state.slow?.25:1));updateRecharge();if(state.repair||state.droneBattle?.isBusy())repairControls(true);draw();repairWorkshop.draw?.(state.time,cthiaOptions);requestAnimationFrame(frame);}
  function resize(){const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(900*dpr);canvas.height=Math.round(540*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
  const oreHit=(event)=>{const field=state.asteroidOreField||state.miningSplit;if(!asteroid()||!field?.minerals||field.collectionBorn!==undefined||field.born!==undefined&&state.time-field.born<700)return false;const rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/900,rect.height/540),drawW=900*scale,drawH=540*scale,offsetX=(rect.width-drawW)/2,offsetY=(rect.height-drawH)/2,x=(event.clientX-rect.left-offsetX)/scale,y=(event.clientY-rect.top-offsetY)/scale,l=layout();return field.minerals.some(m=>Math.hypot(x-(l.x+m.x),y-(l.y+m.y))<Math.max(m.size*.65,15));};
  canvas.addEventListener('pointermove',event=>{canvas.style.cursor=oreHit(event)?'pointer':'';});
  canvas.addEventListener('click',event=>{
    if(!state.repair&&!state.droneBattle?.isBusy())return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*900/rect.width,y=(event.clientY-rect.top)*540/rect.height;
    const hit=allDroneTargets().filter(d=>d.owner.target(d.id)&&Math.hypot(d.position.x-x,d.position.y-y)<19).sort((a,b)=>Math.hypot(a.position.x-x,a.position.y-y)-Math.hypot(b.position.x-x,b.position.y-y))[0];
    if(hit){$('repair-attack-target').value=String(hit.id);updateRecharge();}
  });
  canvas.addEventListener('pointerleave',()=>{canvas.style.cursor='';});
  canvas.addEventListener('click',event=>{const field=state.asteroidOreField||state.miningSplit;if(!oreHit(event))return;field.collectionBorn=state.time;canvas.style.cursor='';explain(field===state.miningSplit?'Ore selected. The shield is discharging; the minerals will dematerialize in place.':'Ore selected. The minerals will dematerialize in place.');});
  document.addEventListener('click',event=>{if(!$('weapon-picker').contains(event.target))$('weapon-picker').open=false;});
  $('weapon-picker').addEventListener('keydown',event=>{if(event.key==='Escape'){$('weapon-picker').open=false;$('weapon-picker').querySelector('summary').focus();}});
  $('ship-select').addEventListener('change',()=>selectShip(Number($('ship-select').value)));
  for(const [id,delta]of[['previous',-1],['next',1]])$(id).onclick=()=>shipPicker?.navigate(delta);
  document.querySelectorAll('[data-fire]').forEach(b=>b.onclick=()=>{stopSequence();fire(b.dataset.fire);});
  $('mine-asteroid').onclick=startAsteroidMining;
  document.querySelectorAll('[data-stage]').forEach(b=>{if(b.tagName==='BUTTON')b.onclick=()=>{if(!state.ready)return;const before=state.destroyed?3:stage(),asteroidShowcase=asteroid();stopSequence();if(!asteroidShowcase)clearEffects();state.destroyed=false;state.hull=[100,65,40,15][Number(b.dataset.stage)];state.shields=state.shieldsEnabled?100:0;if(asteroidShowcase){state.shots=[];state.asteroidOreField=null;beginAsteroidTransition(before,stage());}else{if(tugDamageShip())window.tugIIADamage.change(before,stage(),layout(),state.angle,state.time);breakEarthStarbase(before,stage());breakCthia(before,stage());breakDot(before,stage());}updateUI();explain(asteroidShowcase?`${['Intact','Cracked','Fractured','Breaking apart'][stage()]} asteroid state selected. Matching rock fragments fly from the old state as the new image appears.`:animatedStructure()?`${names[stage()]} ${state.ship.name} selected. Armor from the new breach breaks free as the fires glow beneath it.`:`${names[stage()]} at ${state.hull}% ${creature()?'tissue integrity':'hull'}. Compare the four thumbnails: the art stays aligned across every stage.`);};});
  $('hull').oninput=()=>{if(!state.ready)return;if(state.repair)clearEffects();const before=state.destroyed?3:stage();stopSequence();state.eggHatch=null;state.shots=[];if(asteroid())state.asteroidOreField=null;state.hull=Number($('hull').value);if(state.hull===0)destroy(before);else{state.destroyed=false;if(droneShip())state.debris=state.debris.filter(p=>!p.droneWreck);beginAsteroidTransition(before,stage());if(stage()<before){state.debris=state.debris.filter(p=>!p.cthia);if(animatedStructure()){state.stationFragments=[];state.stationSparks=[];state.stationGlassCracks=[];state.stationArcs=[];}}if(tugDamageShip())window.tugIIADamage.change(before,stage(),layout(),state.angle,state.time);breakEarthStarbase(before,stage());breakCthia(before,stage());breakDot(before,stage());updateUI();explain(`${state.hull}% ${asteroid()?'asteroid integrity':creature()?'tissue integrity':'hull'}: ${names[stage()]}. The stage changes below 75%, 50% and 25%.`);}};
  $('hit-strength').oninput=()=>{state.damage=Number($('hit-strength').value);$('damage-output').value=state.damage+'%';};
  $('debris-target-shields').onchange=()=>{debrisImpacts.setShields($('debris-target-shields').checked);$('debris-impact-status').textContent=$('debris-target-shields').checked?'Nearby ship shields up. Blasts and debris cause shield flashes without damage.':'Nearby ship shields down. Blasts and debris cause hull sparks without damage.';};
  $('cloak').onclick=()=>{
    if(!state.ready||state.destroyed||creature())return;stopSequence();
    state.cloaked=!state.cloaked;
    if(state.cloaked){if(state.shieldsEnabled)state.shieldCharge=state.shields;state.shieldsEnabled=false;state.shields=0;state.flash=null;}
    updateUI();explain(state.cloaked?'Cloaked indefinitely with shields down. Fire or raise shields to reveal the ship.':'Ship revealed. Shields remain down until enabled.');
  };
  $('shields').onchange=()=>{
    if(!state.ready||state.destroyed||creature())return;stopSequence();
    const enabled=$('shields').checked;
    if(enabled){state.cloaked=false;state.shields=state.shieldCharge;}
    else{state.shieldCharge=state.shields;state.shields=0;state.flash=null;}
    state.shieldsEnabled=enabled;updateUI();
    explain(enabled?'Ship revealed. Shields enabled at their remaining charge.':'Shields are down. The next weapon hit will damage the hull.');
  };
  document.querySelectorAll('[data-motion]').forEach(b=>b.onclick=()=>{if(!movingCreature()||state.destroyed||stage()===3||state.evolution)return;const m=window.larvaMotion;if(b.dataset.motion==='turn'){m.turnFromAngle=state.angle;state.rotate=false;$('rotate').setAttribute('aria-pressed','false');}if(b.dataset.motion==='forward'){m.startX=m.xOffset||0;m.startY=m.offset||0;}m.mode=b.dataset.motion;m.born=state.time;updateUI();});
  $('creature-max-health').onchange=()=>{const value=Number($('creature-max-health').value);if(!creature()||!Number.isFinite(value)||value<1||value>100000){updateUI();return;}healthOverrides[state.ship.id]=Math.round(value);try{localStorage.setItem('creatureHealth',JSON.stringify(healthOverrides));}catch{}reset(true);explain('Maximum health updated. Creature restored for a fresh weapon test.');};
  $('hatch').onclick=()=>{if(!egg()||!state.ready||state.destroyed||stage()===3||state.eggHatch)return;reset(true);state.paused=false;$('pause').setAttribute('aria-pressed','false');$('pause').textContent='? Pause';state.eggHatch={born:state.time,complete:false};updateUI();explain('The living egg pulses as its baby pushes through the membrane. The shell peels back and wet strands stretch as the larva pulls free.');};
  $('evolve').onclick=()=>{if(!state.ready||![67,69].includes(state.ship.id)||state.destroyed||stage()===3||state.evolution)return;const origin=state.ship.id;reset(true);state.paused=false;state.slow=false;state.rotate=false;state.angle=0;$('pause').setAttribute('aria-pressed','false');$('slow').setAttribute('aria-pressed','false');$('rotate').setAttribute('aria-pressed','false');state.evolution={origin,born:state.time,phase:origin===67?'hatching':'crawling',done:false};updateUI();explain(origin===67?'Evolution started: Egg A hatches, Larva A crawls and turns, then molts into Juvenile A.':'Evolution started: Larva A crawls and turns, then molts into Juvenile A.');};
  $('repair-demo').onclick=()=>startSteamrunnerRepair(true);
  $('repair-attack-target').onchange=()=>updateRecharge();
  $('drone-test-fire').onclick=()=>$('fire-weapon').click();
  $('drone-light-demo').onclick=()=>{cthiaOptions.toolDemo=!cthiaOptions.toolDemo;updateUI();};
  $('drone-recall').onclick=()=>{const recalled=state.repair?.recall(state.time);state.droneBattle?.recall();if(recalled||state.droneBattle?.isBusy()){updateUI();explain('Recall ordered. Welding has stopped; completed repairs are preserved. Drones remain vulnerable until they reach the support ship.');}};
  $('repair').onclick=()=>state.ship.id===1?startSteamrunnerRepair():reset(true);$('reset').onclick=()=>reset();$('destroy').onclick=()=>{stopSequence();destroy();};$('sequence').onclick=()=>{if(state.ready)sequence();};
  for(const id of['pause','slow','rotate','compare'])$(id).onclick=()=>{const key=id==='pause'?'paused':id;state[key]=!state[key];$(id).setAttribute('aria-pressed',String(state[key]));if(id==='pause')$(id).textContent=state.paused?'▶ Resume':'Ⅱ Pause';if(id==='compare')explain(state.compare?'Original reference on the left; updated interactive art on the right. Fire a weapon or select a damage stage to inspect the upgrade.':'Live damage preview restored. The four thumbnails below let you inspect each stage directly.');};
  $('zoom').oninput=()=>state.zoom=Number($('zoom').value)/100;
  for(const [id,key] of [['ship-lights','lights'],['damage-effects','damage'],['effect-locations','anchors']])$(id).onclick=()=>{cthiaOptions[key]=!cthiaOptions[key];$(id).setAttribute('aria-pressed',String(cthiaOptions[key]));updateUI();explain(key==='anchors'?(state.ship.id===23?'Amber markers show damage locations on the sails and spars.':biological()?'Effect locations: cyan markers show living organs; amber markers show tissue wounds.':'Effect locations: cyan markers show lamps, windows and running lights; amber markers show breaches in the selected damage stage.'):state.ship.name+' '+(biological()?(key==='lights'?'living pulses':'wound activity'):(state.ship.id===23?(key==='lights'?'sail glints':'sail damage'):(key==='lights'?'ship lights':'damage effects')))+' '+(cthiaOptions[key]?'enabled.':'disabled.'));};
  document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{state.target=b.dataset.target;document.querySelectorAll('[data-target]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));explain(`${b.textContent} target selected. The target frame and status use the remastered game's ${b.dataset.target==='enemy'?'red':b.dataset.target==='fleet'?'green':'amber'} selection color.`);});
  $('sound').onclick=()=>{state.sound=!state.sound;$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').textContent=state.sound?'Sound on':'Sound off';if(!state.sound){for(const a of audio)a.pause();audio.clear();}};
  window.showcaseState=()=>({ready:state.ready,droneBattle:state.droneBattle?.snapshot()||null,repair:state.repair?.snapshot()||null,repairRemainder:state.repairSurface?.snapshot()||null,droneInventory:window.repairDroneFleet.read(),ship:state.ship?.id,droneInspection:droneShip()?{...window.droneShowcase.inspect(state.ship,state.hull,state.time,cthiaOptions),wreckCount:state.debris.filter(p=>p.droneWreck).length,damageEffects:dotDamageEffects.snapshot(),explosion:window.droneShowcase.explosionSnapshot(state)}:null,creatureMotion:movingCreature()?{...window.larvaMotion}:null,larvaMotion:larva()?{...window.larvaMotion}:null,hatching:egg()&&state.eggHatch?biology().hatchSnapshot(state):null,kind:state.ship?.kind||'ship',tugIIADamage:tugDamageShip()?window.tugIIADamage.snapshot():null,intactOnly:intactOnly(),combat:combat&&state.ship&&stats()?{hull:hullPoints(),maxHull:stats().hull,shields:shieldPoints(),maxShields:stats().shields,firingShip:shooter.id,weaponsRating:firingStats().weaponsRating,lastHit,visualOverride:$('visual-damage').checked}:null,hull:state.hull,shields:state.shields,shieldsEnabled:state.shieldsEnabled,cloaked:state.cloaked,stage:stage(),destroyed:state.destroyed,paused:state.paused,slow:state.slow,rotate:state.rotate,compare:state.compare,target:state.target,shots:state.shots.length,particles:state.particles.length,debris:state.debris.length,asteroidFragments:state.debris.filter(p=>p.asteroidShard&&!p.ore).length,asteroidOre:state.asteroidOreField?.minerals.length||0,asteroidTransition:!!state.asteroidTransition,cthiaPieces:state.debris.filter(p=>p.cthia).length,stationFragments:state.stationFragments.length,stationSparks:state.stationSparks.length,stationArcs:state.stationArcs.length,cthiaWreck:state.debris.filter(p=>p.wreck).map(p=>({name:p.name,stage:p.sourceStage,x:p.x,y:p.y,angle:p.angle,pixels:p.pixels,structural:!!p.structural,edgePixels:p.edgePixels||0,tumbleRate:p.tumbleRate||0,small:!!p.small,farTravel:!!p.farTravel,vx:p.vx,vy:p.vy,ttl:p.ttl,w:p.w,h:p.h})),nearbyShip:debrisImpacts.snapshot(),biological:biological(),bioDeath:state.bioDeath?{born:state.bioDeath.born,rupture:state.bioDeath.rupture,stage:state.bioDeath.stage}:null,cthiaCutAudit:enhancedShip()?(biological()?biology().audit():window.cthiaDestruction.audit()):null,realisticParticles:state.particles.filter(p=>p.realistic).length,cthiaFragmentPixels:enhancedShip()?cthiaFragments.map(parts=>parts.reduce((n,p)=>n+p.pixels,0)):null,sequence:!!state.sequence,angle:state.angle,time:state.time,hits:state.hits,enhancedEffects:enhancedShip()&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,constitutionTug:state.ship?.id===56&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,tug:state.ship?.id===57&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,olympic:state.ship?.id===58&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,cthia:state.ship?.id===59&&!state.destroyed?window.cthiaEffects.snapshot(stage(),state.time,cthiaOptions):null});
  window.evolutionState=()=>state.evolution?{...state.evolution,age:state.time-state.evolution.born,total:window.creatureEvolution.total(state.evolution.origin)}:null;
  window.showcaseEnvironment=()=>({nearbyAsteroids:nearbyAsteroids.map(rock=>({...rock})),...environmentalImpacts.snapshot()});
  (async()=>{
  try{
      const responses=await Promise.all([fetch(base+'catalog.json?v=tug-ii-a-anim-3'),fetch(base+'combat-data.json?v=weapon-independent-1'),fetch(base+'asteroids.json?v=ore-types-2'),fetch(base+'structures.json?v=vulcan-halfbreak-1')]);if(responses.some(r=>!r.ok))throw Error('Could not load ship, asteroid, structure, or combat data');[catalog,combat,asteroidData,structureData]=await Promise.all(responses.map(r=>r.json()));catalog.weapons=combat.weapons;for(const entry of window.droneShowcase.entries()){if(catalog.ships.some(ship=>ship.id===entry.id))throw Error("Duplicate drone showcase ID");catalog.ships.push(entry);}catalog.ships.push(...asteroidData.map((rock,index)=>({id:100+index,name:rock.name,kind:'asteroid',origin:'Curated mining artwork',oreType:rock.oreType,oreLabel:rock.oreLabel,oreRole:rock.oreRole,oreImage:rock.oreImage,frames:rock.name==='Asteroid 01'?['asteroids/asteroid_01_intact.png','asteroids/asteroid_01_light.png','asteroids/asteroid_01_heavy.png','asteroids/asteroid_01_severe.png']:[rock.file,`${rock.file.slice(0,-4)}_light.png`,`${rock.file.slice(0,-4)}_heavy.png`,`${rock.file.slice(0,-4)}_severe.png`],original:rock.file,bounds:[0,rock.width,0,rock.height],previewSize:Math.min(235,Math.max(rock.width,rock.height)),debrisKind:1,mass:1})));catalog.ships.push(...structureData.map(item=>({id:item.id,name:item.name,kind:item.kind,origin:item.source,structureGroup:item.group,frames:item.damageFrames||[item.file,null,null,null],damageReady:!!item.damageFrames,original:item.file,bounds:[0,item.width,0,item.height],previewSize:item.kind==='turret'?155:260,artworkStatus:item.damageFrames?'damage-ready':'artwork-preview',debrisKind:1,mass:item.damageFrames?850:1,size:item.damageFrames?260:undefined})));shooter=catalog.ships.find(s=>s.id===6);
      shipPicker=window.createShipPicker(catalog.ships,id=>window.starterShips.has(id)&&window.starterShips.get(id).animationReady!==false||[56,57,58,59].includes(id)||!!catalog.ships.find(ship=>ship.id===id)?.damageReady,selectShip);
      for(const kind of['beam','torpedo','disruptor']){
        const group=document.createElement('optgroup');group.label={beam:'Phasers / beams',torpedo:'Torpedoes',disruptor:'Disruptors / pulses'}[kind];
        const heading=document.createElement('p');heading.className='weapon-group';heading.textContent=group.label;$('weapon-options').append(heading);
        for(const [index,w]of catalog.weapons[kind].entries()){
          $(kind+'-style').append(new Option(w.name,index));group.append(new Option(w.name,kind+':'+index));
          const button=document.createElement('button');button.type='button';button.dataset.weapon=kind+':'+index;button.setAttribute('aria-pressed','false');
          const icon=document.createElement('img');icon.src=base+w.icon;icon.alt='';
          const label=document.createElement('span');label.textContent=w.name;
          const damage=document.createElement('small');damage.textContent=number(w.baseDamage)+' damage';
          button.append(icon,label,damage);button.onclick=()=>{$('weapon-select').value=button.dataset.weapon;weaponCards();$('weapon-picker').open=false;$('weapon-picker').querySelector('summary').focus();};
          $('weapon-options').append(button);
        }
        $('weapon-select').append(group);
        $(kind+'-style').onchange=weaponCards;
      }
      $('weapon-select').disabled=false;$('weapon-select').onchange=weaponCards;
      for(const s of catalog.ships.filter(s=>combat.ships[s.id]))$('firing-ship').append(new Option(s.name,s.id));$('firing-ship').value=6;
      $('firing-ship').onchange=async()=>{const candidate=catalog.ships.find(s=>s.id===Number($('firing-ship').value));try{await loadImage(candidate.frames[0]);if(Number($('firing-ship').value)!==candidate.id)return;stopSequence();debrisImpacts.reset();shooter=candidate;weaponCards();}catch(e){$('firing-ship').value=shooter.id;explain(e.message);}};
      for(const w of combat.equipment){const row=document.createElement('div');row.className='equipment-item';const img=document.createElement('img');img.src=base+w.icon;img.alt=w.name;img.title=w.iconSharedWith?'Original Photon Torpedo icon, shared by this launcher':w.name;const text=document.createElement('span');text.textContent=`${w.name} · Base ${w.baseDamage} · · Recharge ${w.recharge} ticks${w.id===26?' · Radiation contacts: 10 to player, 100 to NPCs':w.id===27?' · No firing handler in the installed game':''}`;row.append(img,text);$('equipment-list').append(row);}
      weaponCards();
      $('disruptor-style').value=catalog.weapons.disruptor.findIndex(w=>w.name.toLowerCase().includes('disruptor'));$('torpedo-style').value=catalog.weapons.torpedo.findIndex(w=>w.id===15);weaponCards();$('ship-select').disabled=false;const requested=Number(new URLSearchParams(location.search).get('ship'));const first=catalog.ships.some(s=>s.id===requested)?requested:59;shipPicker.init(first);await selectShip(first);if(first===1&&new URLSearchParams(location.search).get('repair')==='1')startSteamrunnerRepair(true);
    }catch(e){$('loading').textContent=e.message+' — reload the page to try again.';}
  })();
})();

