/* Physical bonus items. Shared motion integrates; shared contact solvers apply
   impulses. Painting/inspection only sample the saved world poses. */
(() => {
  'use strict';
  const runtime=new WeakMap(),clock=s=>Math.max(0,Number(s.shipSimulation?.seconds)||0);
  const eligible=s=>s&&!!window.nativeManualFlight.anchor(s.system);
  const valid=p=>p&&['x','y','heading','vx','vy','angularVelocity','at'].every(k=>Number.isFinite(p[k]));
  const owner=s=>s.collectableMotion?.version===3&&s.collectableMotion.layout===window.nativeCollectableSites.version?s.collectableMotion:null;
  const motion=()=>window.nativeShipMotion;
  const settling=Object.freeze({driftRate:.8,spinRate:1,speedFloor:.04,spinFloor:.001});
  // Saved contacts retain finite settling; new sites keep their gentle drift.
  const wasBumped=(pose,item)=>Math.hypot(pose.vx-item.physics.vx,pose.vy-item.physics.vy)>1e-9||Math.abs(pose.angularVelocity-item.physics.spin)>1e-9;
  function integrate(pose,dt,item){
    pose.settling??=wasBumped(pose,item);
    if(!(dt>0))return;
    if(pose.settling){
      const drift=motion().settleVelocity(pose.vx,pose.vy,dt,settling.driftRate,settling.speedFloor);
      const spin=motion().settleVelocity(pose.angularVelocity,0,dt,settling.spinRate,settling.spinFloor);
      pose.previousX=pose.x;pose.previousY=pose.y;pose.x+=drift.x;pose.y+=drift.y;
      if(spin.x)pose.heading=motion().wrap(pose.heading+spin.x);
      pose.vx=drift.vx;pose.vy=drift.vy;pose.angularVelocity=spin.vx;pose.speed=Math.hypot(pose.vx,pose.vy);
      return;
    }
    motion().step(pose,{coast:true,turn:Math.sign(pose.angularVelocity)},
      {maxSpeed:Infinity,damping:0,turnRate:Math.abs(pose.angularVelocity)},dt);
  }
  function sample(state,item,seed){
    const saved=owner(state)?.items?.[item.id],at=clock(state);
    const pose=valid(saved)?{...saved}:{...seed,vx:item.physics.vx,vy:item.physics.vy,angularVelocity:item.physics.spin,at};
    integrate(pose,Math.max(0,at-pose.at),item);
    return {...pose,roll:pose.heading+Math.PI/2};
  }
  function initialize(state){
    if(!eligible(state))return null;
    const available=window.nativeCollectables.available(state);
    // Versions 1/2 were the Earth-only Dev exhibit. Only unowned pickups are
    // relocated; the saved ownership manifest and original IDs stay intact.
    if(!owner(state))state.collectableMotion={version:3,layout:window.nativeCollectableSites.version,items:{}};
    const records=state.collectableMotion.items||={};
    for(const item of available)if(!valid(records[item.id]))records[item.id]={x:item.gx,y:item.gy,heading:item.heading,
      vx:item.physics.vx,vy:item.physics.vy,angularVelocity:item.physics.spin,settling:false,at:clock(state)};
    for(const item of available)records[item.id].settling??=wasBumped(records[item.id],item);
    const remaining=new Set(available.map(i=>i.id));
    for(const id of Object.keys(records))if(!remaining.has(id))delete records[id];
    return state.collectableMotion;
  }
  function data(state){let rt=runtime.get(state);if(!rt){rt={at:-1,contacts:new Map(),history:[]};runtime.set(state,rt);}return rt;}
  function projected(state,pose){const origin=window.nativeManualFlight.anchor(state.system);return {...pose,x:pose.x-origin.x,y:pose.y-origin.y,
    previousX:(pose.previousX??pose.x)-origin.x,previousY:(pose.previousY??pose.y)-origin.y,system:state.system};}
  function track(state,entity,before){window.nativeSimulationFrame?.trackPose(state,entity,projected(state,before),projected(state,entity));}
  function advance(state,dt){
    if(!eligible(state)||!(dt>0)||window.nativeSimulation.blocked())return;
    const root=initialize(state),at=clock(state),rt=data(state);rt.at=at;
    for(const [id,pose] of Object.entries(root.items)){
      const before={...pose},elapsed=Math.max(0,at-pose.at);integrate(pose,elapsed,window.nativeCollectables.get(id));pose.at=at;
      // A calendar skip coasts analytically; it never sweeps the
      // entire unattended journey through the newly activated local scene.
      if(elapsed>dt+1e-7){pose.previousX=pose.x-pose.vx*dt;pose.previousY=pose.y-pose.vy*dt;}
      else if(!elapsed){pose.previousX=pose.x;pose.previousY=pose.y;}
      track(state,pose,before);
    }
  }
  function body(state,item,pose){
    const width=item.spaceSize*Math.min(1,item.aspect),height=item.spaceSize*Math.min(1,1/item.aspect);
    return {...projected(state,pose),id:'collectable:'+item.id,category:'collectable',entity:pose,
      dimensions:{width,height},radii:{rx:width*.46,ry:height*.46},definition:{mass:item.mass}};
  }
  function store(state,item,result){
    const pose=owner(state).items[item.id],before={...pose};
    const origin=window.nativeManualFlight.anchor(state.system),x=result.x+origin.x,y=result.y+origin.y;
    Object.assign(pose,result,{x,y,settling:true,at:clock(state),previousX:x,previousY:y});track(state,pose,before);
    return body(state,item,pose);
  }
  const activeShip=s=>s?.entity&&s.hull>0&&!s.entity.journey&&!['destroyed','warp','arriving'].includes(s.entity.phase);
  function shipBody(ship,dt){
    const travel=Math.hypot(ship.x-ship.previousX,ship.y-ship.previousY);
    return travel>Math.max(500,Math.hypot(ship.vx,ship.vy)*dt*3+50)?{...ship,previousX:ship.x,previousY:ship.y}:ship;
  }
  function record(state,item,other,result,point){
    const rt=data(state),at=clock(state),key=item.id+':'+other.id,last=rt.contacts.get(key)??-Infinity;rt.contacts.set(key,at);
    if(at-last<.25||result.closing<.05)return;
    rt.history.push({item:item.id,other:other.id,category:other.category,at,closing:result.closing,
      vx:result.a.vx,vy:result.a.vy,spin:result.a.angularVelocity});if(rt.history.length>80)rt.history.shift();
    if(other.category!=='collectable'&&other.category!=='asteroid')window.nativeShipSystems.visualImpact(state,other,
      {kind:'ship',visualOnly:true,physicalContact:true,from:point,point,energy:Math.min(1,result.closing/150)});
  }
  function collide(state,dt){
    if(!eligible(state)||!(dt>0)||window.nativeSimulation.blocked()||data(state).at!==clock(state))return;
    const root=owner(state),systems=window.nativeShipSystems;
    const local=projected(state,window.nativeManualFlight.position(state)),r=window.nativeShipDetail?.radius(state)||6500;
    const bounds=window.nativeShipDetail?.bounds(state)||{minX:local.x-r,minY:local.y-r,maxX:local.x+r,maxY:local.y+r};
    // Distant relics retain analytical motion without activating remote rocks,
    // ship registries or artwork merely because the galaxy is being viewed.
    const items=window.nativeCollectables.catalog.filter(i=>{
      if(!root.items[i.id])return false;const b=body(state,i,root.items[i.id]),padding=motion().shipRadius(b);
      return Math.max(b.x,b.previousX)+padding>=bounds.minX&&Math.min(b.x,b.previousX)-padding<=bounds.maxX&&
        Math.max(b.y,b.previousY)+padding>=bounds.minY&&Math.min(b.y,b.previousY)-padding<=bounds.maxY;
    });
    for(const item of items){
      let a=body(state,item,root.items[item.id]);
      const radius=motion().shipRadius(a),scene=systems.query(state,{system:state.system,
        minX:Math.min(a.previousX,a.x)-radius,minY:Math.min(a.previousY,a.y)-radius,
        maxX:Math.max(a.previousX,a.x)+radius,maxY:Math.max(a.previousY,a.y)+radius,categories:['player','civilian','tug','repair-drone','asteroid']});
      const candidates=scene.bystanders.filter(activeShip).map(s=>({other:s,body:shipBody(s,dt)}));
      for(const rock of scene.rocks){const r=rock.size*.43;candidates.push({other:rock,body:{...rock,heading:(rock.angle||0)-Math.PI/2,
        angularVelocity:rock.spin||0,radii:{rx:r,ry:r},dimensions:{width:r*2,height:r*2},definition:{mass:motion().asteroidMass(rock)}}});}
      const hits=candidates.map(c=>({...c,hit:motion().shipPairContact(a,c.body,dt)})).filter(c=>c.hit).sort((x,y)=>x.hit.t-y.hit.t);
      for(const candidate of hits){
        const other=candidate.other,b=other.category==='asteroid'?candidate.body:shipBody(systems.resolve(state,other.id,state.system)||other,dt);
        const result=motion().shipPairContact(a,b,dt);if(!result)continue;
        a=store(state,item,result.a);
        if(other.category==='asteroid')window.nativeAsteroidMotion.applyContact(state,other.entity,
          {...result.b,angle:motion().wrap(result.b.heading+Math.PI/2),spin:result.b.angularVelocity});
        else systems.applyContact(state,b,result.b);
        record(state,item,other,result,result.pointB);
      }
    }
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i],b=items[j],result=motion().shipPairContact(body(state,a,root.items[a.id]),body(state,b,root.items[b.id]),dt);
      if(result){store(state,a,result.a);store(state,b,result.b);record(state,a,{id:b.id,category:'collectable'},result,result.pointB);}
    }
    const rt=data(state);for(const [key,at] of rt.contacts)if(clock(state)-at>1)rt.contacts.delete(key);
  }
  function presentation(state,item){
    const entity=owner(state)?.items?.[item.id];if(!entity)return item;
    const pose=window.nativeSimulationFrame?.renderPose(state,{...item,entity})||item;
    return {...item,x:pose.x,y:pose.y,roll:pose.heading+Math.PI/2};
  }
  window.nativeCollectableMotion=Object.freeze({initialize,sample,advance,collide,presentation,
    snapshot:state=>({contacts:data(state).history.map(e=>({...e}))})});
})();
