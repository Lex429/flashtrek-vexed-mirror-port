/* Film director. Shared motion, firing, damage and effects run in isolated state.
 * Scene descriptions select goals and targets; they never paint or mutate a save. */
(() => {
  'use strict';
  const clamp=v=>Math.max(0,Math.min(1,v)),lerp=(a,b,t)=>a+(b-a)*t;
  const rate=3.5,step=1/30;
  const types=[2,3,4,5,6,7,10,11,18,25,29,39,40,41,42,43,47,58,426,427];
  const damageTypes=[2,3,6,7,18,25,29,39,426,427];
  function cuts(manifest){
    const c=manifest.cues,s=scene=>c.find(c=>c.scene===scene).start;
    const a=s('expansion'),b=s('annexation'),r=s('revolution'),k=s('klingons'),n=s('anarchy'),w=s('war'),f=s('aftermath'),q=s('resolve'),t=manifest.titleStart;
    return [
      [0,a,'earth','founding',1,'EARTH · 2125','wide'],
      [a,a+(b-a)/3,'raid-orion','raid',2,'ORION · CIVILIAN CORRIDOR','raid'],
      [a+(b-a)/3,a+(b-a)*2/3,'raid-vulcan','raid',12,'VULCAN · IMPERIAL ADVANCE','raid'],
      [a+(b-a)*2/3,b,'raid-andor','raid',25,'ANDORIA · NO SAFE PASSAGE','raid'],
      [b,b+(r-b)*.45,'annexation','raid',87,'TELLAR · ANNEXATION','raid'],
      [b+(r-b)*.45,r,'bombardment','bombardment',2,'ORION · ORBITAL BOMBARDMENT','bombardment'],
      [r,r+(k-r)*.48,'rebellion','rebellion',12,'VULCAN · REVOLUTION','wide'],
      [r+(k-r)*.48,k,'rebellion','rebellion',12,'VULCAN · SHIELDS FAILING','shield'],
      [k,k+(n-k)*.56,'klingons','klingons',38,"QO’NOS · THE KLINGON ADVANCE",'wide'],
      [k+(n-k)*.56,n,'klingons','klingons',38,'THE CONQUERORS BECOME THE CONQUERED','shield'],
      [n,n+3.2,'remus','gallery',30,'REMUS · A FRACTURED GALAXY','gallery'],
      [n+3.2,n+6.4,'cardassia','gallery',50,'CARDASSIA · BORDERS IN FLAMES','gallery'],
      [n+6.4,w,'border-war','border',31,'ROMULUS · ANOTHER WAR','wide'],
      [w,w+4.7,'war','war',1,'THE EARTH–KLINGON FRONT','wide'],
      [w+4.7,w+8.9,'war','war',1,'SHIELDS DOWN · HULL BREACHES','shield'],
      [w+8.9,f,'war','war',1,'THE PRICE OF THE WAR','wreck'],
      [f,q,'war','aftermath',1,'THE SURVIVORS','aftermath'],
      [q,q+2.45,'risa','gallery',57,'RISA · WORLDS WORTH SAVING','gallery'],
      [q+2.45,q+4.7,'romulus','gallery',31,'ROMULUS · A GALAXY WITHOUT PEACE','gallery'],
      [q+4.7,t,'resolve','resolve',1,'EARTH · A FIRM HAND','resolve'],
      [t,manifest.duration,'title','title',1,'VEXED MIRROR','title']
    ].map(([start,end,id,kind,world,location,view])=>({start,end,id,kind,world,location,view}));
  }
  function shotAt(manifest,time){
    const list=cuts(manifest),cut=list.find(c=>time<c.end)||list.at(-1),first=list.find(c=>c.id===cut.id);
    const combatStop=list.find(c=>c.id===cut.id&&c.kind==='aftermath')?.start??Infinity;
    return {...cut,origin:first.start,local:Math.max(0,time-first.start),combatStop,progress:clamp((time-cut.start)/(cut.end-cut.start))};
  }
  function create({effects,onExplosion=()=>{},rockImage=()=>null}){
    let actors=[],rocks=[],rockBursts=[],state=null,current=null,elapsed=0,clock=0,history=[],events=[],planet=null,shots=null,filmTime=0,lastRequested=-Infinity;
    const stats={shots:0,hits:0,shieldHits:0,shieldCollapses:0,hullHits:0,disabled:0,destroyed:0,shipContacts:0,debrisShips:0,debrisAsteroids:0,worldHits:0};
    const describe=entity=>entity.planet?planet.descriptor:window.nativeShipDefinitions.describe(state,entity,{category:'civilian'});
    const alive=()=>actors.filter(a=>a.hull>0);
    function log(kind,data={}){const e={at:filmTime,kind,encounter:current?.id,...data};history.push(e);if(history.length>500)history.shift();return e;}
    function scenery(){return {bystanders:alive().map(describe),rocks:rocks.filter(r=>r.hull>0).map(r=>({...r,rockId:r.slotId})),destructibles:planet?[planet.descriptor]:[]};}
    function damage(target,amount,impact){
      const d=target.entity?target:describe(target),entity=d.entity;
      if(entity.planet){
        const result=window.nativeShipDamage.apply(d,amount,impact);planet.damage+=result.hullDamage;stats.worldHits++;log('bombardment',{ship:impact.sourceId,world:current.world,damage:result.hullDamage});
        if(result.contacts.hull){window.showcaseHullBurst.burst(planet.particles,{...result.contacts.hull.world,damage:result.hullDamage,capacity:200,kind:impact.kind},clock/rate*1000,.91976,1,1.4);}
        return result;
      }
      // A crippling volley precedes the lethal barrage, using the shared
      // nonlethal/disable policy rather than writing hull or shield values.
      if(current.kind==='war'&&entity.id==='film:imperial0'&&clock/rate<8.9)impact={...impact,nonlethal:true};
      const result=window.nativeShipDamage.apply(d,amount,impact);if(!result.ok)return result;
      if(result.amount===0){effects.visualImpact(state,d,impact);return result;}
      effects.hit(state,d,result,impact);stats.hits++;
      if(result.absorbed){stats.shieldHits++;if(result.shields===0){stats.shieldCollapses++;log('shield-collapse',{id:entity.id});}}
      if(result.hullDamage){stats.hullHits++;log('hull-hit',{id:entity.id,stage:result.afterStage,hull:result.hull});}
      if(result.disabled&&entity.phase!=='disabled'){entity.phase='disabled';stats.disabled++;log('disabled',{id:entity.id});}
      if(result.destroyed){entity.phase='destroyed';entity.destroyedAt=filmTime;stats.destroyed++;const e=log('destruction',{id:entity.id,type:entity.shipType,x:entity.x,y:entity.y});events.push(e);onExplosion(e);}
      return result;
    }
    function applyHit(s,result,event,source){
      const target=result.target;
      if(target?.rockId!=null){const r=rocks.find(r=>r.slotId===target.rockId);if(r){r.hull=0;log('asteroid-destroyed',{id:r.slotId});}return {ok:true};}
      if(!target?.entity)return {ok:false};
      return damage(target,event.damage,{from:result.from||result.point,point:result.point,contact:result.contact,kind:event.kind,weaponColor:shots.weaponVisual(event.weapon).style?.color,sourceId:source.id,weaponEventId:event.id});
    }
    const environment=window.createEnvironmentalImpacts({
      getShips:()=>alive().map(a=>({id:'civilian:'+a.id,system:1,x:a.x,y:a.y,radius:describe(a).radius,descriptor:describe(a)})),
      getAsteroids:()=>rocks.filter(r=>r.hull>0).map(r=>({...r,entity:r,radius:r.size*.45})),
      debrisContact:(piece,from,target,type)=>window.nativeShipMotion.debrisContact(piece,from,type==='ship'?target.descriptor:target.entity,type),
      resolveDebris(piece,target,type,result){
        Object.assign(piece,{x:result.debrisPose.x,y:result.debrisPose.y,vx:result.debrisPose.vx,vy:result.debrisPose.vy,spin:result.debrisPose.spin});
        const e=type==='ship'?target.descriptor.entity:target.entity;Object.assign(e,result.targetPose);
      },
      onShipImpact(target,event){if(event.kind!=='debris')return;effects.visualImpact(state,describe(target.descriptor.entity),{...event,physicalContact:true});stats.debrisShips++;log('debris-ship',{id:target.id,x:event.x,y:event.y});},
      onAsteroidHit(target,event){if(event.kind!=='debris')return;stats.debrisAsteroids++;
        if(event.firstHit){const rock=target.entity,result=window.nativeAsteroidCombat.environmentalDamage(rock.maxHull,rock.maxHull-rock.hull,rock.maxHull*.25);rock.hull=result.hull;
          if(result.changedStage){rock.stage=Math.min(3,(rock.stage||0)+1);const pieces=window.nativeAsteroidCombat.makeRockShards(rock,{chips:true,image:rockImage(rock)});
            rockBursts.push({rock:{...rock},born:clock/rate*1000,pieces});if(rockBursts.length>12)rockBursts.shift();}}
        log('debris-asteroid',{id:target.id,x:event.x,y:event.y});}
    });
    const environmentAdapter={
      explode(s,source,options){environment.explode({...source,born:clock/rate*1000,radius:Math.min(420,Math.max(120,source.size*2.2+100)),duration:850,affectAsteroids:false,...options});},
      debris(s,piece,x,y,options){piece.dt=options.dt;piece.size=Math.max(2,Math.hypot(piece.w||0,piece.h||0)*.6||piece.size||2);environment.stepDebris(piece,x,y,clock/rate*1000,options);}
    };
    function add(id,type,x,y,height,faction,config={}){
      const definition=window.nativeShipDefinitions.get(type),size=window.nativeShipDefinitions.presentation(type)||definition.dimensions||{width:70,height:100};
      const ratio=typeof size==='object'?size.width/size.height:.65;
      const entity={id:'film:'+id,shipType:type,system:1,category:'civilian',x,y,previousX:x,previousY:y,heading:faction==='earth'?0:Math.PI,
        vx:0,vy:0,speed:0,hull:definition.hull*(config.hull??1),shields:definition.shields*(config.shields??1),phase:'flight',
        dimensions:{width:height*ratio,height},faction,home:{x,y},nextFire:config.delay||0,goal:{x,y},...config};
      // Fractions are initial battle conditions; typed hull/weapon stats remain shared.
      entity.hull=definition.hull*(config.hull??1);entity.shields=definition.shields*(config.shields??1);
      if(entity.civilian){entity.heading=-.25;entity.goal={x:x+150,y:y-60};}
      window.nativeWeaponLoadout.ensure(state,entity,config.weapons||definition.equipment);actors.push(entity);return entity;
    }
    function initialize(cut){
      if(cut.kind==='aftermath')cut={...cut,kind:'war'};
      effects.reset();environment.reset();actors=[];rocks=[];rockBursts=[];planet=null;elapsed=0;clock=0;current=cut;
      state={system:1,shipSimulation:{version:1,seconds:0},civilianTraffic:{ships:[]},destroyedAsteroids:[],minedAsteroids:[]};
      shots=window.nativeCombatShots.fork({isolated:true,blocked:()=>false,scene:scenery,seconds:()=>clock,
        resolve:(s,id)=>alive().map(describe).find(d=>d.id===id)||null,applyHit});
      if(cut.kind==='founding'){
        add('founding',2,660,425,250,'earth');[3,5,6,427].forEach((t,i)=>add('escort'+i,t,330+i*180,200+(i%2)*70,65,'earth'));
      }else if(['raid','bombardment'].includes(cut.kind)){
        add('kirk',426,360,310,230,'earth',{weapons:[1,1,15]});
        add('constitution',427,200,540,125,'earth',{weapons:[1,15,0]});add('saber',6,220,130,95,'earth');
        if(cut.kind==='raid'){
          [18,7,47,10].forEach((type,i)=>add('refugee'+i,type,680+(i%2)*115,240+Math.floor(i/2)*180,70+(i%2)*18,'civilian',{civilian:true,shields:0,hull:i===0?.55:1,delay:999}));
          add('defender',cut.world===12?25:29,850,640,100,'defender',{hull:.55,shields:.35,delay:1.2});
        }else{
          // A target patch on the visible upper hemisphere, within orbital weapon range.
          const e={id:'film:surface',planet:true,x:780,y:460,hull:1e9,shields:0,heading:0};
          const d={entity:e,id:e.id,state,category:'planet',system:1,x:e.x,y:e.y,heading:0,hull:e.hull,shields:0,
            dimensions:{width:90,height:70},definition:{hull:1e9,shields:0,damageStages:[.75,.5,.25],capabilities:{},geometry:{hull:{rx:45,ry:35}}},radii:{rx:45,ry:35}};
          planet={entity:e,descriptor:d,damage:0,particles:[]};actors[0].goal={x:460,y:240};actors[0].nextFire=0;
        }
      }else if(['rebellion','klingons','war','border'].includes(cut.kind)){
        const left=cut.kind==='border'?[29,25,18,7]:cut.kind==='war'?[2,427,3,6,5,11]:[426,3,6,427,7];
        const right=cut.kind==='rebellion'?[25,29,3,7,6]:cut.kind==='border'?[39,40,43,41]:[39,40,41,42,43,29];
        left.forEach((type,i)=>add('imperial'+i,type,290-(i%2)*150,135+Math.floor(i/2)*195+(i%2)*65,110+(i===0?65:0),'earth',
          {hull:i===0?.6:.32,shields:cut.kind==='klingons'?.45:.35,delay:.25+i*.18}));
        right.forEach((type,i)=>add('opponent'+i,type,720+(i%2)*160,135+Math.floor(i/2)*195+(i%2)*65,100+(i===1?45:0),cut.kind==='rebellion'?'rebel':'klingon',
          {hull:.32,shields:cut.kind==='war'?.15:.28,delay:cut.kind==='klingons'?4.72*rate:i*.14}));
        rocks=[{id:1,slotId:1,x:625,y:380,size:66,file:0},{id:2,slotId:2,x:500,y:675,size:95,file:1},{id:3,slotId:3,x:970,y:580,size:78,file:2}]
          .map(r=>({...r,previousX:r.x,previousY:r.y,vx:0,vy:0,spin:0,angle:r.id*.8,hull:50,maxHull:50,stage:0,system:1}));
      }else if(cut.kind==='resolve')add('survivor',427,660,390,210,'earth',{hull:.42,shields:.1});
      else if(cut.kind==='gallery'){
        const list=cut.world===30?[7,58,47,18]:cut.world===50?[11,29,25,10]:[427,5,7,58];
        list.forEach((t,i)=>add('traveller'+i,t,220+i*245,280+(i%2)*180,75+(i===1?35:0),'civilian',{civilian:true,delay:999}));
      }
    }
    function targetFor(a){
      if(planet&&a.faction==='earth')return planet.descriptor;
      const enemies=alive().filter(b=>b.faction!==a.faction&&!(b.faction==='earth'&&a.faction==='civilian'));
      if(!enemies.length)return null;
      if(current.kind==='war'&&a.faction!=='earth'&&clock/rate>4.2){const flagship=enemies.find(e=>e.id==='film:imperial0');if(flagship)return describe(flagship);}
      enemies.sort((a,b)=>(a.civilian?0:1)-(b.civilian?0:1)||a.hull-b.hull);
      return describe(enemies.find(b=>Math.hypot(b.x-a.x,b.y-a.y)<510)||enemies[0]);
    }
    function tick(dt,cut){
      clock+=dt;state.shipSimulation.seconds=clock;filmTime=cut.origin+clock/rate;
      const list=alive();
      for(const a of list){
        let target=!a.civilian?targetFor(a):null;
        a.cloak=current.kind==='klingons'&&a.faction==='klingon'?1-clamp((clock/rate-2.36)/1.5):0;
        if(current.kind==='klingons'&&a.id==='film:opponent5')a.cloak=Math.max(a.cloak,clamp((clock/rate-6.82)/1.4));
        const d=describe(a),profile={maxSpeed:a.civilian?8:12,acceleration:16,braking:40,turnRate:.65,inertial:true,arrivalRadius:5,arrivalSpeed:1};
        let command=a.phase==='disabled'?{coast:true}:a.civilian?{goal:a.goal,speed:8}:target?{heading:Math.atan2(target.y-a.y,target.x-a.x),speed:Math.hypot(target.x-a.x,target.y-a.y)>440?9:0}:{hold:true};
        if(!a.civilian&&target&&!target.entity?.planet){
          const limit=a.faction==='earth'?440:650;
          if(a.faction==='earth'&&a.x>=limit||a.faction!=='earth'&&a.x<=limit)command={...command,speed:0};
        }
        command=window.nativeShipMotion.avoidShips(d,list.filter(b=>b!==a).map(describe),command,profile);
        window.nativeShipMotion.step(a,command,profile,dt);
        if(a.civilian||a.phase==='disabled'||a.cloak>.08||!target||clock<a.nextFire||filmTime>=cut.combatStop)continue;
        const result=shots.fireFor({state,shooter:describe(a),getSource:()=>describe(a),getTarget:()=>target.entity.hull>0?describe(target.entity):null,
          defaults:a.weapons||undefined,owner:'opening'});
        a.nextFire=clock+(result.ok ? .06 : .12);
        if(result.ok){stats.shots++;log('shot',{id:a.id,type:a.shipType,weapon:result.kind});}
      }
      for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
        const result=window.nativeShipMotion.shipPairContact(describe(list[i]),describe(list[j]),dt);if(!result)continue;
        Object.assign(list[i],result.a);Object.assign(list[j],result.b);stats.shipContacts++;
      }
      shots.advance(state,dt);environment.update(clock/rate*1000);effects.advance(state,dt/rate);
      for(const rock of rocks){rock.previousX=rock.x;rock.previousY=rock.y;rock.x+=rock.vx*dt;rock.y+=rock.vy*dt;rock.vx*=Math.exp(-2*dt);rock.vy*=Math.exp(-2*dt);}
      for(const burst of rockBursts)window.nativeAsteroidCombat.advanceRockFragments(burst,clock/rate*1000,dt/rate,(p,x,y,elapsed)=>environmentAdapter.debris(state,p,x,y,{sourceKey:'asteroid:'+burst.rock.slotId,dt:elapsed}));
      rockBursts=rockBursts.filter(b=>clock/rate*1000-b.born<2000);
      if(planet){for(const p of planet.particles)window.showcaseHullBurst.update(p,dt/rate);planet.particles=planet.particles.filter(p=>clock/rate*1000-p.born<p.ttl);}
    }
    function advance(cut,reduced=false){
      const local=reduced?Math.min(3,(cut.end-cut.origin)*.46):cut.local;
      const requested=cut.origin+cut.local;
      if(current&&requested<lastRequested-.05){shots?.reset();effects.reset();environment.reset();current=null;history=[];events=[];for(const k of Object.keys(stats))stats[k]=0;}
      lastRequested=requested;
      if(!current||current.id!==cut.id||local<elapsed-.00001){shots?.reset();initialize(cut);}
      while(elapsed+step/rate<=local+.000001){tick(step,cut);elapsed+=step/rate;}
      filmTime=cut.origin+elapsed;
      return {actors:alive(),rocks,rockBursts,planet,state,shots,current,elapsed,clock,visualTime:clock/rate};
    }
    return {advance,describe,environment:environmentAdapter,get visualTime(){return clock/rate;},get effects(){return effects;},set effects(value){effects=value;},
      snapshot:()=>({encounter:current?.id,elapsed,clock,actors:actors.map(a=>({id:a.id,type:a.shipType,x:a.x,y:a.y,hull:a.hull,shields:a.shields,phase:a.phase,cloak:a.cloak,dimensions:a.dimensions})),stats:{...stats},events:[...events],history:[...history],rocks:rocks.map(r=>({id:r.id,hull:r.hull,x:r.x,y:r.y}))}),
      clear(){shots?.reset();effects.reset();environment.reset();current=null;actors=[];rocks=[];history=[];events=[];lastRequested=-Infinity;for(const k of Object.keys(stats))stats[k]=0;}};
  }
  window.nativeOpeningCampaign=Object.freeze({types,damageTypes,cuts,shotAt,create,rate});
})();
