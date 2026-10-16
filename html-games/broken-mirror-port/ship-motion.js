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
  function stop(entity){entity.speed=0;entity.vx=0;entity.vy=0;return entity;}
  function step(entity,command={},profile={},dt){
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
      stop(entity);entity.previousX=oldX;entity.previousY=oldY;
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
    if(command.hold){stop(entity);return {arrived:false,distance,headingError:error,moved:false};}
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
    if(arrived){if(command.snap??profile.snap){entity.x=goal.x;entity.y=goal.y;}stop(entity);}
    return {arrived,distance:remaining,headingError:error,moved:entity.x!==oldX||entity.y!==oldY};
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
  function planLeg(entity,goal,profile={},startedAt=0){
    const start={x:finite(entity.x),y:finite(entity.y)},dx=goal.x-start.x,dy=goal.y-start.y,distance=Math.hypot(dx,dy);
    const maxSpeed=Math.max(.01,finite(profile.maxSpeed,100)),acceleration=Math.max(.01,finite(profile.acceleration,1000000)),braking=Math.max(.01,finite(profile.braking,acceleration));
    const initialSpeed=clamp(finite(entity.speed),0,Math.min(maxSpeed,Math.sqrt(2*braking*distance)));
    const peakSpeed=Math.min(maxSpeed,Math.sqrt(Math.max(0,(2*distance+initialSpeed*initialSpeed/acceleration)/(1/acceleration+1/braking))));
    const accelSeconds=Math.max(0,(peakSpeed-initialSpeed)/acceleration),brakeSeconds=peakSpeed/braking;
    const accelDistance=(initialSpeed+peakSpeed)*accelSeconds/2,brakeDistance=peakSpeed*brakeSeconds/2;
    const cruiseSeconds=Math.max(0,(distance-accelDistance-brakeDistance)/peakSpeed);
    const heading=distance?Math.atan2(dy,dx):finite(entity.heading,finite(entity.angle));
    const headingStart=finite(entity.heading,finite(entity.angle)),turnRate=Math.max(.001,finite(profile.turnRate,1000000));
    return {version:1,start,goal:{x:goal.x,y:goal.y},startedAt:finite(startedAt),distance,heading,headingStart,turnSeconds:Math.abs(wrap(heading-headingStart))/turnRate,
      initialSpeed,peakSpeed,acceleration,braking,accelSeconds,cruiseSeconds,brakeSeconds,accelDistance,duration:accelSeconds+cruiseSeconds+brakeSeconds};
  }
  function sampleLeg(entity,leg,now){
    if(!entity||!leg)return {arrived:false,progress:0};
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
    if(arrived)stop(entity);
    return {arrived,progress,distance:Math.max(0,leg.distance-traveled)};
  }
  window.nativeShipMotion={step,followPath,prepare,stop,profiles,wrap,planLeg,sampleLeg};
})();
