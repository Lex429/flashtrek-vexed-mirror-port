/* Showcase drone combat: simulation owns movement, weapon cooldowns and swept
   projectile contacts. Drawing only observes the resulting state. */
(() => {
  'use strict';
  const profiles=window.repairDroneFleet.roles;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const alive=d=>d.health>0&&!['waiting','docked','departed'].includes(d.phase);
  function planWave({owned,defense,wave}){
    const tiers=profiles.repair.map(t=>t.id),list=[];
    for(const [i,id] of tiers.entries())for(let n=0;n<(wave[id]||0)&&list.length<8;n++)list.push(i);
    if(!list.length)return {basic:0,upgraded:0,advanced:0};
    const workers=tiers.reduce((n,id)=>n+(owned[id]||0),0),guards=tiers.reduce((n,id)=>n+(defense[id]||0),0);
    const rate=profiles.repair.reduce((n,t)=>n+(owned[t.id]||0)*t.rate,0);
    const bestWorker=Math.max(0,...tiers.map((id,i)=>owned[id]?i:0));
    const bestGuard=Math.max(0,...tiers.map((id,i)=>defense[id]?i:0));
    const floor=Math.max(bestWorker,bestGuard-1);
    const count=Math.min(8,Math.max(list.length,Math.ceil(rate/3),Math.ceil(guards*1.2),workers?2:0));
    while(list.length<count)list.push(floor);
    for(let i=0;i<list.length;i++)list[i]=Math.max(list[i],floor);
    // Enough real armor to survive several defender volleys. Never change
    // weapon damage, worker rates, or the player's configured/saved wave.
    const defenseDps=profiles.defense.reduce((n,t)=>n+(defense[t.id]||0)*t.damage/(t.cooldown/1000),0);
    while(list.reduce((n,i)=>n+profiles.attack[i].health,0)<defenseDps*3){
      const weakest=list.indexOf(Math.min(...list));if(list[weakest]>=2)break;list[weakest]++;
    }
    return Object.fromEntries(tiers.map((id,i)=>[id,list.filter(n=>n===i).length]));
  }
  function create({repair,defense,born,geometry,onDestroyed=()=>{}}){
    let now=born,nextId=0,recalling=false,shots=[],effects=[],events=[],wrecks=[],shotId=0;
    const fighters=[],metrics={fired:0,hits:0,interceptions:0,repairDamage:0,defenseDamage:0,attackDamage:0};
    const home=()=>{const s=geometry.source;return {x:s.centerX+s.w*.08*Math.cos(s.a)-s.h*.07*Math.sin(s.a),y:s.centerY+s.w*.08*Math.sin(s.a)+s.h*.07*Math.cos(s.a)};};
    const workers=()=>repair.snapshot().drones.map(d=>repair.target(d.id)).filter(Boolean);
    const live=role=>fighters.filter(d=>d.role===role&&alive(d));
    function spawn(role,inventory,time,coordinated=false){
      let slot=0;
      const stations=coordinated?repair.deploymentTargets():[];
      for(const profile of [...profiles[role]].reverse())for(let i=0;i<(inventory[profile.id]||0)&&slot<8;i++,slot++){
        let position=role==='defense'?home():{x:865+slot*12,y:55+slot*30};
        if(stations.length){
          const station=stations[slot%stations.length].position,l=geometry.layout,dx=station.x-l.x,dy=station.y-l.y,len=Math.hypot(dx,dy)||1;
          const offset=160+(slot%3)*20,side=(slot%2?1:-1)*32;
          position={x:station.x+dx/len*offset-dy/len*side,y:station.y+dy/len*offset+dx/len*side};
        }
        fighters.push({id:(role==='defense'?'blue-':'red-')+nextId++,role,tier:profile.id,profile,
          health:profile.health,maxHealth:profile.health,position,heading:0,phase:'waiting',
          launch:time+slot*(role==='defense'?140:160),readyAt:time+slot*160+400,targetId:null,slot,coordinated});
      }
    }
    spawn('defense',defense,born);
    function target(id){const d=fighters.find(d=>d.id===id);return d&&alive(d)?{id:d.id,role:d.role,tier:d.tier,health:d.health,maxHealth:d.maxHealth,position:{...d.position}}:null;}
    function hit(id,amount,time=now){
      const d=fighters.find(d=>d.id===id);if(!d||!alive(d)||!Number.isFinite(amount)||amount<=0)return {hit:false};
      const damage=Math.min(d.health,amount);d.health-=damage;
      effects.push({x:d.position.x,y:d.position.y,born:time,role:d.role,dead:!d.health});
      if(!d.health){
        d.phase='destroyed';d.targetId=null;
        const pieces=window.droneSprites?.fragments(d.tier,d.role)||[],c=Math.cos(d.heading),s=Math.sin(d.heading);
        for(const [i,piece] of pieces.entries()){
          const a=i*2.39996,speed=35+(i%5)*13;
          wrecks.push({texture:piece.texture,width:piece.width,height:piece.height,x:d.position.x+piece.x*c-piece.y*s,y:d.position.y+piece.x*s+piece.y*c,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,angle:d.heading+Math.PI/2,spin:(i%2?1:-1)*(1+i%4),born:time,ttl:1800+(i%4)*150});
        }wrecks=wrecks.slice(-192);
        if(d.role==='defense')onDestroyed(d.tier,d.id,'defense');
      }
      return {hit:true,damage,health:d.health,destroyed:!d.health,tier:d.tier,role:d.role};
    }
    function launchWave(inventory,time=now,{coordinated=false}={}){
      if(waveActive()||recalling||(!workers().length&&!(coordinated&&repair.deploymentTargets().length)))return false;
      // Retain recent wrecks for their brief effect; old waves cannot accumulate.
      for(let i=fighters.length-1;i>=0;i--)if(fighters[i].role==='attack')fighters.splice(i,1);
      spawn('attack',inventory,time,coordinated);return true;
    }
    function waveActive(){return fighters.some(d=>d.role==='attack'&&d.health>0&&d.phase!=='departed');}
    function isBusy(){return fighters.some(d=>d.health>0&&!['docked','departed'].includes(d.phase))||shots.length>0;}
    const nearest=(from,list)=>list.reduce((best,d)=>!best||distance(from,d.position)<distance(from,best.position)?d:best,null);
    function clearanceGoal(position,goal){
      const l=geometry.layout;if(!l.w||!l.h)return goal;
      const c=Math.cos(geometry.angle||0),s=Math.sin(geometry.angle||0),rx=l.w*.52+20,ry=l.h*.52+20;
      const local=p=>({x:((p.x-l.x)*c+(p.y-l.y)*s)/rx,y:(-(p.x-l.x)*s+(p.y-l.y)*c)/ry});
      const world=p=>({x:l.x+p.x*rx*c-p.y*ry*s,y:l.y+p.x*rx*s+p.y*ry*c});
      const a=local(position),b=local(goal),radius=Math.hypot(a.x,a.y),goalRadius=Math.hypot(b.x,b.y);
      if(goalRadius<1.06){const r=goalRadius||1;b.x*=1.08/r;b.y*=1.08/r;goal=world(b);}
      if(radius<1.04){const r=radius||1;return world({x:a.x/r*1.15,y:a.y/r*1.15});}
      const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/(dx*dx+dy*dy||1)));
      if(Math.hypot(a.x+dx*t,a.y+dy*t)>1.04)return goal;
      const start=Math.atan2(a.y,a.x),end=Math.atan2(b.y,b.x),delta=Math.atan2(Math.sin(end-start),Math.cos(end-start));
      const angle=start+Math.sign(delta||1)*.42;
      return world({x:Math.cos(angle)*Math.max(1.12,Math.min(radius,1.4)),y:Math.sin(angle)*Math.max(1.12,Math.min(radius,1.4))});
    }
    function move(d,goal,dt,stop=0){
      const actual=goal;goal=clearanceGoal(d.position,goal);if(goal!==actual)stop=0;
      const dx=goal.x-d.position.x,dy=goal.y-d.position.y,len=Math.hypot(dx,dy);
      if(len>.1)d.heading=Math.atan2(dy,dx);
      const step=Math.min(Math.max(0,len-stop),d.profile.speed*dt);
      if(step>0){d.position.x+=dx/len*step;d.position.y+=dy/len*step;}
      d.thrust=step>0?.7:0;return distance(d.position,actual);
    }
    function contact(a,b,p,r){
      const dx=b.x-a.x,dy=b.y-a.y,px=a.x-p.x,py=a.y-p.y,A=dx*dx+dy*dy,C=px*px+py*py-r*r;
      if(C<=0)return 0;if(!A)return null;
      const B=2*(px*dx+py*dy),disc=B*B-4*A*C;if(disc<0)return null;
      const t=(-B-Math.sqrt(disc))/(2*A);return t>=0&&t<=1?t:null;
    }
    function tick(dt,time){
      const green=workers(),blue=live('defense'),red=live('attack'),rs=repair.snapshot();
      const pending=rs.drones.some(d=>d.health>0&&d.phase==='waiting');
      const safe=rs.recalling||rs.outcome==='failed'||(!green.length&&!pending&&rs.elapsed>1000);
      for(const d of fighters){
        if(!d.health||['docked','departed'].includes(d.phase))continue;
        if(time<d.launch)continue;
        if(d.phase==='waiting')d.phase=d.role==='defense'?'launching':'hunting';
        if(d.role==='defense'&&(recalling||safe)){
          d.phase='returning';d.targetId=null;if(move(d,home(),dt)<8)d.phase='docked';continue;
        }
        if(d.role==='attack'&&!green.length&&!pending&&!blue.length&&time-born>1000){
          d.phase='retreating';d.targetId=null;move(d,{x:1020,y:-100},dt);if(d.position.x>970||d.position.y< -70)d.phase='departed';continue;
        }
        let victim,goal;
        if(d.role==='attack'){
          const approaching=d.coordinated&&time<(rs.firstWeldAt||0)-300;
          const worker=nearest(d.position,approaching?repair.deploymentTargets():green),interceptor=nearest(d.position,blue);
          const provoked=blue.find(b=>b.id===d.provokedBy&&time-d.provokedAt<2500);
          victim=provoked||(interceptor&&distance(d.position,interceptor.position)<100?interceptor:worker||interceptor);
          goal=victim?.position;d.phase='hunting';
        }else{
          // Prefer enemies closing on a worker over enemies farther from it.
          const worker=nearest(d.position,green);
          victim=red.reduce((best,r)=>!best||distance(r.position,worker?.position||d.position)<distance(best.position,worker?.position||d.position)?r:best,null);
          if(victim){
            const anchor=worker?.position||home(),dx=victim.position.x-anchor.x,dy=victim.position.y-anchor.y,len=Math.hypot(dx,dy)||1;
            goal={x:anchor.x+dx/len*Math.min(70,len*.5),y:anchor.y+dy/len*Math.min(70,len*.5)};d.phase='intercepting';
          }else{const anchor=worker?.position||geometry.layout;goal={x:anchor.x-35-d.slot*8,y:anchor.y-45};d.phase='escorting';}
        }
        d.targetId=victim?.id??null;
        if(goal){if(d.role==='attack')move(d,goal,dt,d.profile.range*.6);else move(d,goal,dt,5);}
        if(!victim||distance(d.position,victim.position)>d.profile.range||time<d.readyAt||shots.length>=128||victim.role==='repair'&&!repair.target(victim.id))continue;
        d.heading=Math.atan2(victim.position.y-d.position.y,victim.position.x-d.position.x);
        const barrel=d.volley||0,local=window.droneSprites?.muzzle(d.tier,d.role,barrel)||{x:16,y:0},c=Math.cos(d.heading),s=Math.sin(d.heading);
        const from={x:d.position.x+local.x*c-local.y*s,y:d.position.y+local.x*s+local.y*c};
        const speed=300,len=distance(from,victim.position)||1,dx=(victim.position.x-from.x)/len,dy=(victim.position.y-from.y)/len;d.volley=barrel+1;d.firedAt=time;d.firedBarrel=barrel;
        shots.push({id:shotId++,owner:d.id,role:d.role,targetId:victim.id,source:{...from},mount:{x:d.position.x,y:d.position.y,heading:d.heading,tier:d.tier,barrel},position:from,vx:dx*speed,vy:dy*speed,damage:d.profile.damage,born:time,ttl:1400});
        d.readyAt=time+d.profile.cooldown;metrics.fired++;
      }
      for(const shot of shots){
        if(shot.done)continue;const from=shot.position,to={x:from.x+shot.vx*dt,y:from.y+shot.vy*dt};
        const candidates=shot.role==='defense'?live('attack'):[...workers(),...live('defense')];
        let found=null,fraction=Infinity;
        for(const candidate of candidates){const t=contact(from,to,candidate.position,candidate.role==='repair'?8:11);if(t!==null&&t<fraction){found=candidate;fraction=t;}}
        if(found){
          shot.position={x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction};shot.done=true;
          const result=found.role==='repair'?repair.hit(found.id,shot.damage,time):hit(found.id,shot.damage,time);
          if(result.hit){
            metrics.hits++;metrics[found.role+'Damage']+=result.damage;
            const intercepted=shot.role==='attack'&&found.role==='defense'&&typeof shot.targetId==='number';if(intercepted)metrics.interceptions++;
            const enemy=fighters.find(d=>d.id===found.id);if(enemy&&shot.role==='defense'){enemy.provokedBy=shot.owner;enemy.provokedAt=time;}
            events.push({time,shotId:shot.id,role:shot.role,targetRole:found.role,targetId:found.id,damage:result.damage,destroyed:result.destroyed,intercepted,position:{...shot.position},targetPosition:{...found.position}});
            if(found.role==='repair')effects.push({...shot.position,born:time,role:'repair',dead:result.destroyed});
          }
        }else shot.position=to;
      }
      shots=shots.filter(s=>!s.done&&time-s.born<s.ttl);effects=effects.filter(e=>time-e.born<1000).slice(-120);wrecks=wrecks.filter(p=>time-p.born<p.ttl);events=events.slice(-64);
    }
    function advance(time,nextGeometry){
      if(nextGeometry)geometry=nextGeometry;
      // Catch up in bounded physical steps, never by applying timer damage.
      while(now+0.001<time){const step=Math.min(1000/60,time-now);now+=step;tick(step/1000,now);}
      repair.setThreats(live('attack').map(d=>d.position));
    }
    function recall(){recalling=true;return true;}
    function snapshot(){return {recalling,busy:isBusy(),waveActive:waveActive(),time:now,metrics:{...metrics},events:events.map(e=>({...e,position:{...e.position},targetPosition:{...e.targetPosition}})),
      drones:fighters.map(d=>({id:d.id,role:d.role,tier:d.tier,health:d.health,maxHealth:d.maxHealth,damageStage:window.droneSprites?.stage(d.health,d.maxHealth)??0,powered:d.health>0,launch:d.launch-born,phase:d.phase,position:{...d.position},heading:d.heading,targetId:d.targetId,readyAt:d.readyAt,firedAt:d.firedAt??null,firedBarrel:d.firedBarrel??null})),
      shots:shots.map(s=>({...s,source:{...s.source},mount:{...s.mount},position:{...s.position}})),wreckCount:wrecks.length,texturedWreckCount:wrecks.length};}
    function draw(ctx,time,selectedId,options={}){
      for(const d of fighters){
        if(!alive(d))continue;ctx.save();ctx.translate(d.position.x,d.position.y);ctx.rotate(d.heading);window.steamrunnerRepair.drawDrone(ctx,{...d,lights:options.lights,effects:options.damage,weaponFlash:Number.isFinite(d.firedAt)?Math.max(0,1-(time-d.firedAt)/150):0},time);ctx.restore();
        const color=d.role==='attack'?'#ff6c64':'#71caff';ctx.save();ctx.fillStyle='#151c2b';ctx.fillRect(d.position.x-13,d.position.y+25,26,3);ctx.fillStyle=color;ctx.fillRect(d.position.x-13,d.position.y+25,26*d.health/d.maxHealth,3);
        if(d.id===selectedId){ctx.strokeStyle='white';ctx.lineWidth=1;ctx.strokeRect(d.position.x-28,d.position.y-28,60,58);}ctx.restore();
      }
      for(const p of wrecks){const age=(time-p.born)/1000;ctx.save();ctx.globalAlpha=Math.max(0,1-age*1000/p.ttl);ctx.translate(p.x+p.vx*age,p.y+p.vy*age);ctx.rotate(p.angle+p.spin*age);ctx.drawImage(p.texture,-p.width/2,-p.height/2,p.width,p.height);ctx.restore();}
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
      for(const s of shots){const speed=Math.hypot(s.vx,s.vy);ctx.strokeStyle=s.role==='attack'?'#ff5042':'#48adff';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=9;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.position.x-s.vx/speed*12,s.position.y-s.vy/speed*12);ctx.lineTo(s.position.x,s.position.y);ctx.stroke();ctx.fillStyle='white';ctx.fillRect(s.position.x-1,s.position.y-1,2,2);}
      ctx.shadowBlur=5;
      for(const e of effects){const age=(time-e.born)/1000;ctx.globalAlpha=Math.max(0,1-age);ctx.strokeStyle=e.dead?'#ffbc62':'#e5faff';ctx.lineWidth=e.dead?2:1;
        for(let i=0;i<(e.dead?16:7);i++){const angle=i*2.39996,len=(e.dead?70:35)*age;ctx.beginPath();ctx.moveTo(e.x+Math.cos(angle)*len,e.y+Math.sin(angle)*len);ctx.lineTo(e.x+Math.cos(angle)*(len+5),e.y+Math.sin(angle)*(len+5));ctx.stroke();}}
      ctx.restore();
    }
    return {advance,target,hit,launchWave,waveActive,isBusy,recall,snapshot,draw};
  }
  window.droneBattle={create,planWave};
})();
