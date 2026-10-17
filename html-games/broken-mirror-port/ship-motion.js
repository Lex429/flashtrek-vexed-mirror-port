/* Authoritative ship motion. Controllers choose commands; this module integrates poses. */
(() => {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
  const validPoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
  const headingKey=entity=>Number.isFinite(entity.heading)?'heading':'angle';
  const combatProfiles={
    18:{speed:.8,turnRate:2.3,acceleration:90},
    23:{speed:.72,turnRate:2.6,acceleration:105},
    47:{speed:.55,turnRate:1.05,acceleration:48},
    52:{speed:.48,turnRate:.7,acceleration:36}
  };
  // These explicit profiles retain the established roles' flight characteristics.
  // A controller can select a profile, but it cannot replace the integration rules.
  const profiles={
    manual(stats){const maxSpeed=Math.max(36,finite(stats?.speedOrOtherStationValue,35)*4.5);return {maxSpeed,acceleration:maxSpeed*.75,braking:maxSpeed*1.2,turnRate:Math.max(.5,finite(stats?.turn,2)/4)};},
    tug(){return {maxSpeed:135,acceleration:38,braking:45,turnRate:1.35,alignmentFloor:.26,alignmentDivisor:Math.PI,brakingDistanceOffset:4,arrivalRadius:7,arrivalSpeed:24};},
    civilian(stats){const maxSpeed=Math.max(36,finite(stats?.speedOrOtherStationValue,40)*3);return {maxSpeed,acceleration:maxSpeed*.75,braking:225,turnRate:Infinity,directGoal:true,arrivalRadius:.75,snap:true};},
    combat(type,cruiseSpeed=105){const data=combatProfiles[type]||combatProfiles[47];return {maxSpeed:Math.max(36,data.speed*finite(cruiseSpeed,105)),acceleration:data.acceleration,braking:data.acceleration,turnRate:data.turnRate,headingGain:3,angularResponse:6,alignmentFloor:.25,alignmentDivisor:2.3,inertial:true};},
    approach(maxSpeed){return {maxSpeed:Math.max(0,finite(maxSpeed)),acceleration:Infinity,braking:180,turnRate:Infinity,headingResponse:4,directGoal:true,arrivalRadius:.75,snap:true};},
    cruise(maxSpeed,factor=1){factor=Math.max(0,finite(factor,1));return {maxSpeed:Math.max(0,finite(maxSpeed)),acceleration:520*factor,braking:360*factor*factor,turnRate:Infinity,headingResponse:4,directGoal:true,arrivalRadius:.75,snap:true};},
    coast(){return {maxSpeed:Infinity,turnRate:.12,damping:2.5,inertial:true};}
  };
  function prepare(entity,{resetVelocity=false,resetAngular=false}={}){
    const key=headingKey(entity),heading=finite(entity[key]);
    entity[key]=heading;
    const speed=Math.max(0,finite(entity.speed));
    entity.speed=speed;
    if(resetVelocity||!Number.isFinite(entity.vx))entity.vx=Math.cos(heading)*speed;
    if(resetVelocity||!Number.isFinite(entity.vy))entity.vy=Math.sin(heading)*speed;
    if(resetAngular)entity.motionAngularVelocity=0;
    return entity;
  }
  function stop(entity,{preserveImpulse=false}={}){entity.speed=0;entity.vx=0;entity.vy=0;if(!preserveImpulse){delete entity.motionKick;delete entity.motionSpin;}return entity;}
  function integrate(entity,command={},profile={},dt){
    const idle={arrived:false,distance:null,headingError:0,moved:false};
    if(!entity||!validPoint(entity)||!Number.isFinite(dt)||dt<=0)return idle;
    if(command.goal&&!validPoint(command.goal))return idle;
    prepare(entity);
    const key=headingKey(entity),oldX=entity.x,oldY=entity.y,oldHeading=entity[key];
    const goal=command.goal,dx=goal?goal.x-entity.x:0,dy=goal?goal.y-entity.y:0;
    const distance=goal?Math.hypot(dx,dy):null;
    const radius=Math.max(0,finite(command.arrivalRadius,finite(profile.arrivalRadius,.75)));
    const arrivalSpeed=Math.max(0,finite(command.arrivalSpeed,finite(profile.arrivalSpeed,Infinity)));
    const engine=Math.max(0,finite(command.engineFactor,1));
    const top=Math.max(0,finite(profile.maxSpeed,Infinity))*engine;
    const acceleration=Math.max(0,finite(profile.acceleration,Infinity))*engine;
    const braking=Math.max(0,finite(profile.braking,acceleration));
    const turnRate=Math.max(0,finite(profile.turnRate,Infinity))*Math.max(0,finite(command.turnFactor,1));
    let desiredHeading=goal?Math.atan2(dy,dx):command.heading;
    if(goal&&distance<=radius&&entity.speed<=arrivalSpeed){
      if(command.snap??profile.snap){entity.x=goal.x;entity.y=goal.y;}
      stop(entity,{preserveImpulse:true});entity.previousX=oldX;entity.previousY=oldY;
      return {arrived:true,distance,headingError:0,moved:oldX!==entity.x||oldY!==entity.y};
    }
    const error=Number.isFinite(desiredHeading)?wrap(desiredHeading-oldHeading):0;
    let change=0;
    if(Number.isFinite(desiredHeading)){
      if(profile.angularResponse>0){
        const angularTarget=clamp(error*finite(profile.headingGain,1),-turnRate,turnRate);
        const previous=finite(entity.motionAngularVelocity,finite(entity.combatAI?.angularVelocity));
        entity.motionAngularVelocity=previous+(angularTarget-previous)*Math.min(1,dt*profile.angularResponse);
        change=clamp(entity.motionAngularVelocity*dt,-Math.abs(error),Math.abs(error));
      }else change=clamp(error*(profile.headingResponse>0?Math.min(1,dt*profile.headingResponse):1),-turnRate*dt,turnRate*dt);
    }else if(command.turn)change=clamp(finite(command.turn),-1,1)*turnRate*dt;
    entity[key]=wrap(oldHeading+change);
    entity.previousX=oldX;entity.previousY=oldY;
    if(command.hold){stop(entity,{preserveImpulse:true});return {arrived:false,distance,headingError:error,moved:false};}
    if(command.coast){
      entity.x+=entity.vx*dt;entity.y+=entity.vy*dt;
      const damping=Math.exp(-Math.max(0,finite(profile.damping))*dt);
      entity.vx*=damping;entity.vy*=damping;entity.speed=Math.hypot(entity.vx,entity.vy);
      return {arrived:false,distance,headingError:error,moved:entity.x!==oldX||entity.y!==oldY};
    }
    let speed=entity.speed;
    if(goal||Number.isFinite(command.heading)||Number.isFinite(command.speed)){
      const alignment=clamp(1-Math.abs(error)/Math.max(.0001,finite(profile.alignmentDivisor,Math.PI)),finite(profile.alignmentFloor,1),1);
      let wanted=Math.min(top,Number.isFinite(command.speed)?Math.max(0,command.speed):top*clamp(finite(command.throttle,1),0,1)*alignment);
      if(goal&&command.braking!==false){
        const remaining=Math.max(0,distance-finite(profile.brakingDistanceOffset));
        wanted=Math.min(wanted,Math.sqrt(2*braking*remaining));
      }
      if(command.brake)wanted=0;
      speed=profile.inertial?wanted:speed+clamp(wanted-speed,-braking*dt,acceleration*dt);
    }else{
      if(command.throttle)speed+=acceleration*clamp(finite(command.throttle),0,1)*dt;
      if(command.brake)speed-=braking*clamp(finite(command.brake,1),0,1)*dt;
    }
    speed=clamp(speed,0,top);
    if(profile.inertial){
      const wantedX=Math.cos(entity[key])*speed,wantedY=Math.sin(entity[key])*speed;
      const ax=wantedX-entity.vx,ay=wantedY-entity.vy,length=Math.hypot(ax,ay);
      const ratio=length>0?Math.min(1,acceleration*dt/length):0;
      entity.vx+=ax*ratio;entity.vy+=ay*ratio;
      const magnitude=Math.hypot(entity.vx,entity.vy);
      if(magnitude>top){entity.vx*=top/magnitude;entity.vy*=top/magnitude;}
    }else{
      const direction=goal&&profile.directGoal&&distance>0?Math.atan2(dy,dx):entity[key];
      entity.vx=Math.cos(direction)*speed;entity.vy=Math.sin(direction)*speed;
    }
    const travel=Math.hypot(entity.vx,entity.vy)*dt;
    const available=goal?Math.max(0,distance-(command.stopAtRadius?radius:0)):Infinity;
    const fraction=travel>0?Math.min(1,available/travel):1;
    entity.x+=entity.vx*dt*fraction;entity.y+=entity.vy*dt*fraction;
    entity.speed=Math.hypot(entity.vx,entity.vy);
    const remaining=goal?Math.hypot(goal.x-entity.x,goal.y-entity.y):null;
    const arrived=!!goal&&remaining<=radius+1e-8&&entity.speed<=arrivalSpeed;
    if(arrived){if(command.snap??profile.snap){entity.x=goal.x;entity.y=goal.y;}stop(entity,{preserveImpulse:true});}
    return {arrived,distance:remaining,headingError:error,moved:entity.x!==oldX||entity.y!==oldY};
  }
  function kickSample(kick,at){
    if(!kick)return {x:0,y:0,vx:0,vy:0};
    if(kick.mode!=='scheduled')return {x:0,y:0,vx:finite(kick.vx),vy:finite(kick.vy)};
    const duration=Math.max(.001,finite(kick.duration,3)),t=clamp(finite(at,finite(kick.at))-finite(kick.at),0,duration),fade=1-t/duration;
    const ax=finite(kick.vx)+2*finite(kick.x)/duration,ay=finite(kick.vy)+2*finite(kick.y)/duration;
    const x=finite(kick.x)+ax*t,y=finite(kick.y)+ay*t;
    return {x:x*fade*fade,y:y*fade*fade,vx:ax*fade*fade-2*x*fade/duration,vy:ay*fade*fade-2*y*fade/duration};
  }
  function applyImpulse(entity,velocity,at,position={x:0,y:0}){
    if(!entity||!validPoint(velocity))return;
    const previous=kickSample(entity.motionKick,at),leg=entity.localLeg||entity.lifeLeg;
    if(Math.hypot(velocity.x,velocity.y,position.x,position.y)<1e-8)return;
    entity.motionKick=leg?{version:1,mode:'scheduled',at,duration:Math.max(.05,Math.min(3,leg.startedAt+leg.duration-at)),
      x:previous.x+position.x,y:previous.y+position.y,vx:previous.vx+velocity.x,vy:previous.vy+velocity.y}:
      {version:1,mode:'free',vx:previous.vx+velocity.x,vy:previous.vy+velocity.y};
  }
  function translationStep(entity,command={},profile={},dt){
    if(entity?.motionKick&&validPoint(entity)&&entity.speed===0&&dt>0&&Number.isFinite(dt)&&(!command.goal||validPoint(command.goal))){delete entity.motionKick;entity.vx=0;entity.vy=0;}
    if(!entity?.motionKick||!validPoint(entity)||!(dt>0)||!Number.isFinite(dt)||command.goal&&!validPoint(command.goal))return integrate(entity,command,profile,dt);
    const sampled=kickSample(entity.motionKick,finite(entity.motionTime,finite(entity.motionKick.at))),kick={version:1,mode:'free',vx:sampled.vx,vy:sampled.vy};
    const oldX=entity.x,oldY=entity.y;
    prepare(entity);entity.vx-=kick.vx;entity.vy-=kick.vy;entity.speed=Math.hypot(entity.vx,entity.vy);
    const result=integrate(entity,command,profile,dt),rate=command.brake?4:command.hold||command.goal?3:command.turn||command.throttle?2:0,decay=Math.exp(-rate*dt),travel=rate?(1-decay)/rate:dt;
    entity.x+=kick.vx*travel;entity.y+=kick.vy*travel;kick.vx*=decay;kick.vy*=decay;
    entity.vx+=kick.vx;entity.vy+=kick.vy;entity.speed=Math.hypot(entity.vx,entity.vy);
    entity.motionKick=Math.hypot(kick.vx,kick.vy)>.001?kick:undefined;
    result.moved=entity.x!==oldX||entity.y!==oldY;
    if(command.goal){result.distance=Math.hypot(command.goal.x-entity.x,command.goal.y-entity.y);result.arrived=result.arrived&&result.distance<=(command.arrivalRadius??profile.arrivalRadius??.75);}
    return result;
  }
  function spinSample(spin,at){
    if(!spin)return {angle:0,velocity:0};
    if(spin.mode!=='scheduled')return {angle:0,velocity:finite(spin.velocity)};
    const t=Math.max(0,finite(at,spin.at)-spin.at),rate=2,angle=finite(spin.angle),c=finite(spin.velocity)+rate*angle,fade=Math.exp(-rate*t);
    return {angle:(angle+c*t)*fade,velocity:(c-rate*(angle+c*t))*fade};
  }
  function applySpinImpulse(entity,velocity,at,angle=0){
    if(!entity||!Number.isFinite(velocity)||!Number.isFinite(angle))return;
    if(Math.abs(velocity)+Math.abs(angle)<1e-9)return;
    const leg=entity.localLeg||entity.lifeLeg;
    if(leg&&entity.motionSpin&&entity.motionSpin.mode!=='scheduled')entity.motionSpin={...entity.motionSpin,mode:'scheduled',at:leg.startedAt,angle:0};
    const previous=spinSample(entity.motionSpin,at);
    entity.motionSpin=leg?{version:1,mode:'scheduled',at,angle:previous.angle+angle,velocity:previous.velocity+velocity}:
      {version:1,mode:'free',velocity:previous.velocity+velocity};
  }
  function step(entity,command={},profile={},dt){
    if(!entity?.motionSpin||!validPoint(entity)||!(dt>0)||!Number.isFinite(dt)||command.goal&&!validPoint(command.goal))return translationStep(entity,command,profile,dt);
    const spin=spinSample(entity.motionSpin,finite(entity.motionTime,entity.motionSpin.at)),rate=command.brake?5:command.turn||command.throttle?4:2;
    const decay=Math.exp(-rate*dt),angle=spin.velocity*(1-decay)/rate,key=headingKey(entity);
    entity[key]=wrap(finite(entity[key])+angle);
    const result=translationStep(entity,command,profile,dt),velocity=spin.velocity*decay;
    if(Math.abs(velocity)>.00001)entity.motionSpin={version:1,mode:'free',velocity};else delete entity.motionSpin;
    return result;
  }
  function followPath(entity,path,index,profile,dt,{start}={}){
    if(!Array.isArray(path)||!path.length)return {arrived:true,index:0,progress:1,moved:false};
    if(!path.every(validPoint))return {arrived:false,index,progress:finite(entity?.progress),moved:false};
    index=clamp(Math.floor(finite(index)),0,path.length-1);
    const goal=path[index],final=index===path.length-1;
    const before=validPoint(goal)&&validPoint(entity)?Math.hypot(goal.x-entity.x,goal.y-entity.y):Infinity;
    const result=step(entity,{goal,braking:final,arrivalRadius:final?profile.arrivalRadius:0,arrivalSpeed:final?profile.arrivalSpeed:0},profile,dt);
    if(!Number.isFinite(dt)||dt<=0||!validPoint(goal))return {...result,index,progress:finite(entity.progress)};
    if(!final&&before<Math.max(12,entity.speed*dt+4))index++;
    const origin=validPoint(start)?start:path[0];
    const total=path.reduce((sum,point,i)=>sum+Math.hypot(point.x-(i?path[i-1].x:origin.x),point.y-(i?path[i-1].y:origin.y)),0);
    let remaining=Math.hypot(path[index].x-entity.x,path[index].y-entity.y);
    for(let i=index+1;i<path.length;i++)remaining+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
    return {...result,arrived:final&&result.arrived,index,progress:clamp(1-remaining/Math.max(1,total),0,1)};
  }
  // A scheduled straight movement command. Sampling the same command for nearby
  // and distant ships gives promotion/demotion an identical world pose. All
  // acceleration and braking geometry remains here, outside job controllers.
  const arrivalEpsilon=1e-6;
  function planLeg(entity,goal,profile={},startedAt=0){
    if(!validPoint(entity)||!validPoint(goal)||!Number.isFinite(startedAt))return {version:2,valid:false,reason:'Movement needs finite start, goal and simulation time',duration:0,distance:0};
    const start={x:finite(entity.x),y:finite(entity.y)},dx=goal.x-start.x,dy=goal.y-start.y,distance=Math.hypot(dx,dy);
    if(!Number.isFinite(distance))return {version:2,valid:false,reason:'Movement distance is outside finite world coordinates',duration:0,distance:0};
    const headingStart=finite(entity.heading,finite(entity.angle));
    if(distance<=arrivalEpsilon)return {version:2,valid:true,start,goal:{x:goal.x,y:goal.y},startedAt,distance,heading:headingStart,headingStart,
      turnSeconds:0,initialSpeed:0,peakSpeed:0,acceleration:0,braking:0,accelSeconds:0,cruiseSeconds:0,brakeSeconds:0,accelDistance:0,duration:0};
    const maxSpeed=Math.max(.01,finite(profile.maxSpeed,100)),acceleration=Math.max(.01,finite(profile.acceleration,1000000)),braking=Math.max(.01,finite(profile.braking,acceleration));
    const initialSpeed=clamp(finite(entity.speed),0,Math.min(maxSpeed,Math.sqrt(2*braking*distance)));
    const peakSpeed=Math.min(maxSpeed,Math.sqrt(Math.max(0,(2*distance+initialSpeed*initialSpeed/acceleration)/(1/acceleration+1/braking))));
    const accelSeconds=Math.max(0,(peakSpeed-initialSpeed)/acceleration),brakeSeconds=peakSpeed/braking;
    const accelDistance=(initialSpeed+peakSpeed)*accelSeconds/2,brakeDistance=peakSpeed*brakeSeconds/2;
    const cruiseSeconds=Math.max(0,(distance-accelDistance-brakeDistance)/peakSpeed);
    const heading=distance?Math.atan2(dy,dx):finite(entity.heading,finite(entity.angle));
    const turnRate=Math.max(.001,finite(profile.turnRate,1000000));
    return {version:2,valid:true,start,goal:{x:goal.x,y:goal.y},startedAt:finite(startedAt),distance,heading,headingStart,turnSeconds:Math.abs(wrap(heading-headingStart))/turnRate,
      initialSpeed,peakSpeed,acceleration,braking,accelSeconds,cruiseSeconds,brakeSeconds,accelDistance,duration:accelSeconds+cruiseSeconds+brakeSeconds};
  }
  function sampleLegBase(entity,leg,now){
    if(!validPoint(entity)||!leg||leg.valid===false||!validPoint(leg.start)||!validPoint(leg.goal)||!Number.isFinite(now))return {arrived:false,invalid:true,progress:0};
    if(leg.version===3){
      if(!Array.isArray(leg.segments)||!leg.segments.length)return {arrived:false,invalid:true,progress:0};
      const segment=leg.segments.find(part=>now<part.startedAt+part.duration)||leg.segments.at(-1);
      const result=sampleLegBase(entity,segment,now);
      return {...result,arrived:!result.invalid&&now>=leg.startedAt+leg.duration,
        progress:clamp((now-leg.startedAt)/Math.max(.001,leg.duration),0,1)};
    }
    const distance=Math.hypot(leg.goal.x-leg.start.x,leg.goal.y-leg.start.y);
    if(distance<=arrivalEpsilon||(Number.isFinite(leg.startedAt)&&Number.isFinite(leg.duration)&&leg.duration>0&&now>=leg.startedAt+leg.duration)){
      entity.previousX=entity.x;entity.previousY=entity.y;entity.x=leg.goal.x;entity.y=leg.goal.y;
      entity[headingKey(entity)]=wrap(finite(leg.heading,finite(entity[headingKey(entity)])));stop(entity,{preserveImpulse:true});
      return {arrived:true,progress:1,distance:0};
    }
    if(!Number.isFinite(leg.duration)||leg.duration<=0||!(leg.distance>0)||!Number.isFinite(leg.startedAt)||!['distance','heading','headingStart','turnSeconds','initialSpeed','peakSpeed','acceleration','braking','accelSeconds','cruiseSeconds','brakeSeconds','accelDistance'].every(key=>Number.isFinite(leg[key])))return {arrived:false,invalid:true,progress:0};
    const elapsed=clamp(finite(now)-leg.startedAt,0,leg.duration),arrived=elapsed>=leg.duration;
    let traveled=0,speed=0;
    if(elapsed<=leg.accelSeconds){speed=leg.initialSpeed+leg.acceleration*elapsed;traveled=(leg.initialSpeed+speed)*elapsed/2;}
    else if(elapsed<=leg.accelSeconds+leg.cruiseSeconds){speed=leg.peakSpeed;traveled=leg.accelDistance+speed*(elapsed-leg.accelSeconds);}
    else{const brakeTime=elapsed-leg.accelSeconds-leg.cruiseSeconds;speed=Math.max(0,leg.peakSpeed-leg.braking*brakeTime);traveled=leg.accelDistance+leg.peakSpeed*leg.cruiseSeconds+(leg.peakSpeed+speed)*brakeTime/2;}
    const progress=arrived||!leg.distance?1:clamp(traveled/leg.distance,0,1),key=headingKey(entity);
    entity.previousX=entity.x;entity.previousY=entity.y;
    entity.x=leg.start.x+(leg.goal.x-leg.start.x)*progress;entity.y=leg.start.y+(leg.goal.y-leg.start.y)*progress;
    entity[key]=wrap(leg.headingStart+wrap(leg.heading-leg.headingStart)*(leg.turnSeconds?clamp(elapsed/leg.turnSeconds,0,1):elapsed?1:0));
    entity.speed=arrived?0:speed;entity.vx=Math.cos(leg.heading)*entity.speed;entity.vy=Math.sin(leg.heading)*entity.speed;
    if(arrived)stop(entity,{preserveImpulse:true});
    return {arrived,progress,distance:Math.max(0,leg.distance-traveled)};
  }
  function sampleLeg(entity,leg,now){
    const result=sampleLegBase(entity,leg,now);if(result.invalid)return result;
    if(entity.motionSpin){
      if(entity.motionSpin.mode!=='scheduled')entity.motionSpin={...entity.motionSpin,mode:'scheduled',at:leg.startedAt,angle:0};
      const spin=spinSample(entity.motionSpin,now);entity[headingKey(entity)]=wrap(entity[headingKey(entity)]+spin.angle);
      if(Math.abs(spin.angle)+Math.abs(spin.velocity)<.00001)delete entity.motionSpin;
    }
    if(!entity.motionKick)return result;
    if(entity.motionKick.mode!=='scheduled')entity.motionKick={...entity.motionKick,mode:'scheduled',x:0,y:0,at:leg.startedAt,duration:Math.max(.05,Math.min(3,leg.duration))};
    const kick=kickSample(entity.motionKick,now);
    if(entity.motionKick.mode==='scheduled'){
      entity.x+=kick.x;entity.y+=kick.y;entity.vx+=kick.vx;entity.vy+=kick.vy;entity.speed=Math.hypot(entity.vx,entity.vy);
      if(now>=entity.motionKick.at+entity.motionKick.duration)delete entity.motionKick;
      if(result.arrived&&Math.hypot(kick.x,kick.y)>.001)result.arrived=false;
    }
    return result;
  }
  const asteroidMass=rock=>Math.max(.00005,(rock.size/40)**3);
  const shipMass=ship=>Math.max(.5,finite(ship.definition?.mass,8*(ship.dimensions.width*ship.dimensions.height/2400)**1.5));
  const hullRadii=ship=>ship.hullRadii||ship.radii;
  const shipInertia=ship=>Math.max(.01,finite(ship.definition?.inertia,shipMass(ship)*(hullRadii(ship).rx**2+hullRadii(ship).ry**2)/4));
  const shipRadius=ship=>Math.max(1,hullRadii(ship).rx,hullRadii(ship).ry);
  // Saved piecewise commands use the ordinary acceleration/braking sampler.
  // The original task goal remains authoritative; detours extend its deadline.
  function routeLeg(entity,goal,points,profile,at,wait=0){
    const start={x:entity.x,y:entity.y},pose={...entity},segments=[];let cursor=at;
    if(wait>0){
      const speed=Math.max(0,finite(pose.speed)),braking=Math.max(.01,finite(profile.braking,225));
      if(speed>.01){
        const heading=Number.isFinite(pose.vx)&&Number.isFinite(pose.vy)&&Math.hypot(pose.vx,pose.vy)>.01?Math.atan2(pose.vy,pose.vx):finite(pose.heading);
        const distance=speed*speed/(2*braking),stopAt={x:pose.x+Math.cos(heading)*distance,y:pose.y+Math.sin(heading)*distance};
        const part=planLeg(pose,stopAt,{...profile,maxSpeed:speed},cursor);segments.push(part);cursor+=part.duration;sampleLegBase(pose,part,cursor);
      }
      segments.push({...planLeg(pose,pose,profile,cursor),duration:wait});cursor+=wait;stop(pose);
    }
    for(const point of [...points,goal]){
      const part=planLeg(pose,point,profile,cursor);if(part.valid===false)return part;
      segments.push(part);cursor+=part.duration;sampleLegBase(pose,part,cursor);stop(pose);
    }
    return {version:3,valid:true,start,goal:{x:goal.x,y:goal.y},startedAt:at,duration:cursor-at,
      distance:segments.reduce((n,s)=>n+s.distance,0),segments};
  }
  // Predict relative motion, rather than steering away from a ship's old pose.
  // Every pilot passes to starboard. Stable identity breaks crossing ties.
  function trafficAdvice(ship,neighbors,profile={}){
    const leg=ship.entity?.localLeg||ship.entity?.lifeLeg;
    const target=leg?.version===3?(leg.segments.find(p=>ship.at<p.startedAt+p.duration&&p.distance>arrivalEpsilon)||leg.segments.at(-1))?.goal:leg?.goal;
    const speed=Math.hypot(ship.vx,ship.vy),distance=target?Math.hypot(target.x-ship.x,target.y-ship.y):Infinity;
    const heading=target&&distance>1?Math.atan2(target.y-ship.y,target.x-ship.x):ship.heading;
    const planned=Math.max(speed,leg&&distance>2?profile.maxSpeed||100:0),vx=speed>10?ship.vx:Math.cos(heading)*planned,vy=speed>10?ship.vy:Math.sin(heading)*planned;
    if(planned<.01)return null;
    const horizon=Math.min(6,Math.max(.5,distance/Math.max(1,planned))),turnRoom=Number.isFinite(profile.turnRate)?Math.min(45,planned/Math.max(.5,profile.turnRate)*.25):0;
    let threat=null;
    for(const other of neighbors){
      if(other.id===ship.id&&other.category===ship.category||other.system!==ship.system)continue;
      const rx=other.x-ship.x,ry=other.y-ship.y,rvx=other.vx-vx,rvy=other.vy-vy,sq=rvx*rvx+rvy*rvy;
      const clearance=shipRadius(ship)+shipRadius(other)+6+Math.min(24,Math.hypot(rvx,rvy)*.1)+turnRoom;
      const closing=rx*rvx+ry*rvy;
      if(closing>=0&&Math.hypot(rx,ry)>clearance*.9)continue;
      const t=sq?clamp(-closing/sq,0,horizon):0,miss=Math.hypot(rx+rvx*t,ry+rvy*t);
      if(miss>=clearance||Math.hypot(rx,ry)>clearance+planned*horizon+Math.hypot(other.vx,other.vy)*horizon)continue;
      const score=t+miss/Math.max(1,clearance);
      if(!threat||score<threat.score){
        const stationary=Math.hypot(other.vx,other.vy)<5,headOn=vx*other.vx+vy*other.vy<-.35*planned*Math.hypot(other.vx,other.vy);
        const key=s=>s.category+':'+s.id,otherPriority=other.category==='player'||shipMass(other)>shipMass(ship)*1.4||
          shipMass(ship)<=shipMass(other)*1.4&&key(ship)>key(other);
        threat={other,t,miss,clearance,score,heading,yield:!stationary&&!headOn&&otherPriority,
          stationary,headOn,distance:Math.hypot(rx,ry)};
      }
    }
    return threat;
  }
  function avoidShips(ship,neighbors,command,profile){
    if(command.hold||command.coast)return command;
    const facing=Number.isFinite(command.heading)?command.heading:command.goal?Math.atan2(command.goal.y-ship.y,command.goal.x-ship.x):ship.heading;
    const speed=Math.min(profile.maxSpeed||100,command.speed??(profile.maxSpeed||100)*(command.throttle??1));
    const intended={...ship,vx:Math.cos(facing)*speed,vy:Math.sin(facing)*speed,heading:facing};
    const advice=trafficAdvice(intended,neighbors,profile);if(!advice||advice.t>2.5)return command;
    if(advice.distance<advice.clearance*.85){
      const dx=ship.x-advice.other.x,dy=ship.y-advice.other.y;
      return {...command,goal:undefined,heading:Math.hypot(dx,dy)>1?Math.atan2(dy,dx):facing,throttle:.65,brake:false,speed:undefined};
    }
    const angle=wrap(facing+Math.min(1.15,.45+Math.max(0,1-advice.t/3)*.7));
    const brake=advice.yield||advice.distance<advice.clearance*1.05;
    return {...command,goal:undefined,heading:angle,throttle:brake?0:Math.min(command.throttle??1,.7),brake,speed:brake?0:command.speed};
  }
  function ellipseSupport(ship,nx,ny){
    const angle=ship.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),x=nx*c+ny*s,y=-nx*s+ny*c;
    const length=Math.hypot(ship.radii.rx*x,ship.radii.ry*y)||1;
    const lx=ship.radii.rx**2*x/length,ly=ship.radii.ry**2*y/length;
    return {x:lx*c-ly*s,y:lx*s+ly*c,r:length};
  }
  const contactAxes=Array.from({length:32},(_,i)=>({x:Math.cos(i*Math.PI/32),y:Math.sin(i*Math.PI/32)}));
  // Swept supporting planes of both oriented physical hull ellipses. Sampled
  // directions conservatively bound the curves; circles are broad phase only.
  function shipPairContact(a,b,dt){
    if(!(dt>0)||!validPoint(a)||!validPoint(b)||!a.radii||!b.radii)return null;
    const ax=finite(a.previousX,a.x),ay=finite(a.previousY,a.y),bx=finite(b.previousX,b.x),by=finite(b.previousY,b.y);
    const fx=bx-ax,fy=by-ay,dx=b.x-a.x-fx,dy=b.y-a.y-fy;
    const sweep=dx*dx+dy*dy,closest=sweep?clamp(-(fx*dx+fy*dy)/sweep,0,1):0;
    if(Math.hypot(fx+dx*closest,fy+dy*closest)>shipRadius(a)+shipRadius(b))return null;
    a={...a,radii:hullRadii(a)};b={...b,radii:hullRadii(b)};
    const ac=Math.cos(a.heading+Math.PI/2),as=Math.sin(a.heading+Math.PI/2),bc=Math.cos(b.heading+Math.PI/2),bs=Math.sin(b.heading+Math.PI/2);
    let enter=0,exit=1,normal=null,shallow=Infinity,overlap=true,shallowNormal=null;
    for(let i=0;i<36;i++){
      const axis=i<32?contactAxes[i]:i===32?{x:ac,y:as}:i===33?{x:-as,y:ac}:i===34?{x:bc,y:bs}:{x:-bs,y:bc};
      const nx=axis.x,ny=axis.y,r=Math.hypot(a.radii.rx*(nx*ac+ny*as),a.radii.ry*(-nx*as+ny*ac))+Math.hypot(b.radii.rx*(nx*bc+ny*bs),b.radii.ry*(-nx*bs+ny*bc));
      const p=fx*nx+fy*ny,v=dx*nx+dy*ny,depth=r-Math.abs(p);
      if(depth<0)overlap=false;
      if(depth<shallow){shallow=depth;const sign=p<0?-1:1;shallowNormal={x:nx*sign,y:ny*sign,r};}
      if(Math.abs(v)<1e-10){if(Math.abs(p)>r)return null;continue;}
      const t1=(-r-p)/v,t2=(r-p)/v,lo=Math.min(t1,t2),hi=Math.max(t1,t2);
      if(lo>enter){enter=lo;const sign=p+v*lo<0?-1:1;normal={x:nx*sign,y:ny*sign,r};}
      exit=Math.min(exit,hi);if(enter>exit||exit<0||enter>1)return null;
    }
    normal=overlap?shallowNormal:normal;if(!normal)return null;
    const t=overlap?0:Math.max(0,enter),nx=normal.x,ny=normal.y;
    const ma=shipMass(a),mb=shipMass(b),ia=shipInertia(a),ib=shipInertia(b),inverse=1/ma+1/mb;
    const ca={x:ax+(a.x-ax)*t,y:ay+(a.y-ay)*t},cb={x:bx+(b.x-bx)*t,y:by+(b.y-by)*t};
    const sa=ellipseSupport(a,nx,ny),sb=ellipseSupport(b,-nx,-ny),point={x:(ca.x+sa.x+cb.x+sb.x)/2,y:(ca.y+sa.y+cb.y+sb.y)/2};
    const ra={x:point.x-ca.x,y:point.y-ca.y},rb={x:point.x-cb.x,y:point.y-cb.y};
    const wa=finite(a.angularVelocity),wb=finite(b.angularVelocity),cross=(r,x,y)=>r.x*y-r.y*x;
    const contactVelocity=(vx,vy,w,r)=>({x:vx-w*r.y,y:vy+w*r.x});
    const va=contactVelocity(finite(a.vx),finite(a.vy),wa,ra),vb=contactVelocity(finite(b.vx),finite(b.vy),wb,rb);
    const closing=Math.max(0,(va.x-vb.x)*nx+(va.y-vb.y)*ny),rnA=cross(ra,nx,ny),rnB=cross(rb,nx,ny);
    const impulse=1.12*closing/(inverse+rnA*rnA/ia+rnB*rnB/ib);
    const normalWA=wa-rnA*impulse/ia,normalWB=wb+rnB*impulse/ib;
    const na=contactVelocity(finite(a.vx)-nx*impulse/ma,finite(a.vy)-ny*impulse/ma,normalWA,ra),nb=contactVelocity(finite(b.vx)+nx*impulse/mb,finite(b.vy)+ny*impulse/mb,normalWB,rb);
    const tx=-ny,ty=nx,rtA=cross(ra,tx,ty),rtB=cross(rb,tx,ty),tangent=(na.x-nb.x)*tx+(na.y-nb.y)*ty;
    const friction=clamp(tangent/(inverse+rtA*rtA/ia+rtB*rtB/ib),-impulse*.08,impulse*.08),ix=nx*impulse+tx*friction,iy=ny*impulse+ty*friction;
    const avx=finite(a.vx)-ix/ma,avy=finite(a.vy)-iy/ma,bvx=finite(b.vx)+ix/mb,bvy=finite(b.vy)+iy/mb,remaining=dt*(1-t);
    const angularA=wa-cross(ra,ix,iy)/ia,angularB=wb+cross(rb,ix,iy)/ib;
    const pa={x:ca.x+avx*remaining,y:ca.y+avy*remaining,vx:avx,vy:avy,angularVelocity:angularA,heading:wrap(a.heading+(angularA-wa)*remaining)};
    const pb={x:cb.x+bvx*remaining,y:cb.y+bvy*remaining,vx:bvx,vy:bvy,angularVelocity:angularB,heading:wrap(b.heading+(angularB-wb)*remaining)};
    const penetration=Math.max(0,normal.r-((pb.x-pa.x)*nx+(pb.y-pa.y)*ny))+.02;
    if(!closing&&penetration<.03)return null;
    pa.x-=nx*penetration*mb/(ma+mb);pa.y-=ny*penetration*mb/(ma+mb);pb.x+=nx*penetration*ma/(ma+mb);pb.y+=ny*penetration*ma/(ma+mb);
    const surfaceA=ellipseSupport({...a,heading:pa.heading},nx,ny),surfaceB=ellipseSupport({...b,heading:pb.heading},-nx,-ny);
    return {t,closing,massA:ma,massB:mb,inertiaA:ia,inertiaB:ib,contactPoint:point,centerA:ca,centerB:cb,normal:{x:nx,y:ny},a:pa,b:pb,
      pointA:{x:pa.x+surfaceA.x,y:pa.y+surfaceA.y},pointB:{x:pb.x+surfaceB.x,y:pb.y+surfaceB.y}};
  }
  const collisionDamageFraction=(closing,otherMass,selfMass)=>Math.min(1,(Math.max(0,closing-70)/180)**2*otherMass/(otherMass+selfMass));
  // Swept ellipse/circle contact uses the physical hull, independent of shield
  // charge. Both bodies receive a mass-weighted impulse; no health is changed.
  function asteroidContact(ship,rock,dt){
    if(!(dt>0)||!validPoint(ship)||!validPoint(rock)||!(rock.size>0)||!ship.radii||!ship.dimensions)return null;
    const heading=finite(ship.heading)+Math.PI/2,c=Math.cos(heading),s=Math.sin(heading),radius=rock.size*.43;
    const shape=hullRadii(ship),rx=Math.max(1,shape.rx+radius),ry=Math.max(1,shape.ry+radius);
    const local=(x,y)=>({x:(x*c+y*s)/rx,y:(-x*s+y*c)/ry});
    const rockVX=finite(rock.vx),rockVY=finite(rock.vy);
    const from=local(finite(ship.previousX,ship.x)-finite(rock.previousX,rock.x-rockVX*dt),finite(ship.previousY,ship.y)-finite(rock.previousY,rock.y-rockVY*dt)),to=local(ship.x-rock.x,ship.y-rock.y);
    const dx=to.x-from.x,dy=to.y-from.y,a=dx*dx+dy*dy,b=2*(from.x*dx+from.y*dy),outside=from.x*from.x+from.y*from.y-1;
    let t=0;
    if(outside>0){const disc=b*b-4*a*outside;if(!a||disc<0)return null;t=(-b-Math.sqrt(disc))/(2*a);if(t<0||t>1)return null;}
    const contact={x:from.x+dx*t,y:from.y+dy*t};
    // Normal points from the ship towards the rock, using the ellipse gradient.
    let nx=-(contact.x/rx*c-contact.y/ry*s),ny=-(contact.x/rx*s+contact.y/ry*c),length=Math.hypot(nx,ny);
    if(length<1e-9){nx=ship.vx-rockVX;ny=ship.vy-rockVY;length=Math.hypot(nx,ny);if(!length){nx=1;ny=0;length=1;}}
    nx/=length;ny/=length;
    const rvx=finite(ship.vx)-rockVX,rvy=finite(ship.vy)-rockVY,closing=Math.max(0,rvx*nx+rvy*ny);
    const rockMass=asteroidMass(rock),bodyMass=shipMass(ship);
    const inverse=1/rockMass+1/bodyMass,impulse=1.18*closing/inverse;
    const tangent=-rvx*ny+rvy*nx,friction=clamp(tangent/inverse,-impulse*.08,impulse*.08);
    const ix=nx*impulse-ny*friction,iy=ny*impulse+nx*friction;
    const contactDistance=Math.hypot(rx*(nx*c+ny*s),ry*(-nx*s+ny*c));
    const penetration=Math.max(0,contactDistance+(ship.x-rock.x)*nx+(ship.y-rock.y)*ny)+.02;
    const rockShare=bodyMass/(bodyMass+rockMass),shipShare=1-rockShare;
    return {t,normal:{x:nx,y:ny},closing,shipMass:bodyMass,rockMass,
      rock:{x:rock.x+nx*penetration*rockShare,y:rock.y+ny*penetration*rockShare,vx:rockVX+ix/rockMass,vy:rockVY+iy/rockMass,spin:clamp(finite(rock.spin)+friction/Math.max(.01,rockMass*radius)*2.5,-5,5)},
      ship:{x:ship.x-nx*penetration*shipShare,y:ship.y-ny*penetration*shipShare,vx:finite(ship.vx)-ix/bodyMass,vy:finite(ship.vy)-iy/bodyMass},
      damageFraction:collisionDamageFraction(closing,bodyMass,rockMass),
      point:{x:rock.x-nx*radius,y:rock.y-ny*radius}};
  }
  function asteroidPairContact(a,b,dt){
    if(!(dt>0)||!validPoint(a)||!validPoint(b)||!(a.size>0)||!(b.size>0))return null;
    const ax=finite(a.previousX,a.x-finite(a.vx)*dt),ay=finite(a.previousY,a.y-finite(a.vy)*dt),bx=finite(b.previousX,b.x-finite(b.vx)*dt),by=finite(b.previousY,b.y-finite(b.vy)*dt);
    const fx=bx-ax,fy=by-ay,dx=b.x-a.x-fx,dy=b.y-a.y-fy,r=(a.size+b.size)*.43;
    const outside=fx*fx+fy*fy-r*r,qa=dx*dx+dy*dy,qb=2*(fx*dx+fy*dy);let t=0;
    if(outside>0){const disc=qb*qb-4*qa*outside;if(!qa||disc<0)return null;t=(-qb-Math.sqrt(disc))/(2*qa);if(t<0||t>1)return null;}
    let nx=fx+dx*t,ny=fy+dy*t,length=Math.hypot(nx,ny);if(length<1e-9){nx=1;ny=0;length=1;}nx/=length;ny/=length;
    const ma=asteroidMass(a),mb=asteroidMass(b),inverse=1/ma+1/mb,rvx=finite(a.vx)-finite(b.vx),rvy=finite(a.vy)-finite(b.vy),closing=Math.max(0,rvx*nx+rvy*ny);
    const tangent=-rvx*ny+rvy*nx+finite(a.spin)*a.size*.43+finite(b.spin)*b.size*.43;
    const impulse=1.18*closing/inverse,friction=clamp(tangent/(3.5*inverse),-impulse*.08,impulse*.08),ix=nx*impulse-ny*friction,iy=ny*impulse+nx*friction;
    const avx=finite(a.vx)-ix/ma,avy=finite(a.vy)-iy/ma,bvx=finite(b.vx)+ix/mb,bvy=finite(b.vy)+iy/mb,remaining=dt*(1-t),penetration=Math.max(0,r-length)+.02;
    const pa={x:ax+(a.x-ax)*t,y:ay+(a.y-ay)*t},pb={x:bx+(b.x-bx)*t,y:by+(b.y-by)*t};
    return {t,closing,normal:{x:nx,y:ny},massA:ma,massB:mb,damageA:collisionDamageFraction(closing,mb,ma),damageB:collisionDamageFraction(closing,ma,mb),
      a:{x:pa.x+avx*remaining-nx*penetration*mb/(ma+mb),y:pa.y+avy*remaining-ny*penetration*mb/(ma+mb),vx:avx,vy:avy,spin:clamp(finite(a.spin)-friction/(ma*a.size*.43)*2.5,-5,5)},
      b:{x:pb.x+bvx*remaining+nx*penetration*ma/(ma+mb),y:pb.y+bvy*remaining+ny*penetration*ma/(ma+mb),vx:bvx,vy:bvy,spin:clamp(finite(b.spin)-friction/(mb*b.size*.43)*2.5,-5,5)}};
  }
  function debrisContact(piece,from,target,type){
    const dt=Math.max(.000001,finite(piece.dt,1/60)),body={...piece,previousX:from.x,previousY:from.y};
    if(type==='ship'){
      const result=asteroidContact(target,body,dt);return result?{...result,targetPose:result.ship,debrisPose:result.rock}:null;
    }
    const result=asteroidPairContact(target,body,dt);return result?{...result,targetPose:result.a,debrisPose:result.b}:null;
  }
  window.nativeShipMotion={step,followPath,prepare,stop,profiles,wrap,planLeg,sampleLeg,routeLeg,trafficAdvice,avoidShips,shipPairContact,shipMass,shipInertia,shipRadius,arrivalEpsilon,asteroidContact,asteroidPairContact,asteroidMass,applyImpulse,kickSample,applySpinImpulse,spinSample,collisionDamageFraction,debrisContact};
})();
