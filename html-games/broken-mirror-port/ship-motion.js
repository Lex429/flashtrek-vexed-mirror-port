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
  function stop(entity,{preserveImpulse=false}={}){entity.speed=0;entity.vx=0;entity.vy=0;if(!preserveImpulse)delete entity.motionKick;return entity;}
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
  function step(entity,command={},profile={},dt){
    if(entity?.motionKick&&validPoint(entity)&&entity.speed===0&&dt>0&&Number.isFinite(dt)&&(!command.goal||validPoint(command.goal))){delete entity.motionKick;entity.vx=0;entity.vy=0;}
    if(!entity?.motionKick||!validPoint(entity)||!(dt>0)||!Number.isFinite(dt)||command.goal&&!validPoint(command.goal))return integrate(entity,command,profile,dt);
    const sampled=kickSample(entity.motionKick,finite(entity.motionTime,finite(entity.motionKick.at))),kick={version:1,mode:'free',vx:sampled.vx,vy:sampled.vy};
    const oldX=entity.x,oldY=entity.y;
    prepare(entity);entity.vx-=kick.vx;entity.vy-=kick.vy;entity.speed=Math.hypot(entity.vx,entity.vy);
    const result=integrate(entity,command,profile,dt),rate=command.brake?4:command.hold||command.goal?3:0,decay=Math.exp(-rate*dt),travel=rate?(1-decay)/rate:dt;
    entity.x+=kick.vx*travel;entity.y+=kick.vy*travel;kick.vx*=decay;kick.vy*=decay;
    entity.vx+=kick.vx;entity.vy+=kick.vy;entity.speed=Math.hypot(entity.vx,entity.vy);
    entity.motionKick=Math.hypot(kick.vx,kick.vy)>.001?kick:undefined;
    result.moved=entity.x!==oldX||entity.y!==oldY;
    if(command.goal){result.distance=Math.hypot(command.goal.x-entity.x,command.goal.y-entity.y);result.arrived=result.arrived&&result.distance<=(command.arrivalRadius??profile.arrivalRadius??.75);}
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
    const result=sampleLegBase(entity,leg,now);if(result.invalid||!entity.motionKick)return result;
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
  const collisionDamageFraction=(closing,otherMass,selfMass)=>Math.min(1,(Math.max(0,closing-70)/180)**2*otherMass/(otherMass+selfMass));
  // Swept ellipse/circle contact uses the same oriented shield/hull radii as
  // weapons. Both bodies receive a mass-weighted impulse; no health is changed.
  function asteroidContact(ship,rock,dt){
    if(!(dt>0)||!validPoint(ship)||!validPoint(rock)||!(rock.size>0)||!ship.radii||!ship.dimensions)return null;
    const heading=finite(ship.heading)+Math.PI/2,c=Math.cos(heading),s=Math.sin(heading),radius=rock.size*.43;
    const rx=Math.max(1,ship.radii.rx+radius),ry=Math.max(1,ship.radii.ry+radius);
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
    const rockMass=asteroidMass(rock),shipMass=Math.max(.5,finite(ship.definition?.mass,8*(ship.dimensions.width*ship.dimensions.height/2400)**1.5));
    const inverse=1/rockMass+1/shipMass,impulse=1.18*closing/inverse;
    const tangent=-rvx*ny+rvy*nx,friction=clamp(tangent/inverse,-impulse*.08,impulse*.08);
    const ix=nx*impulse-ny*friction,iy=ny*impulse+nx*friction;
    const contactDistance=Math.hypot(rx*(nx*c+ny*s),ry*(-nx*s+ny*c));
    const penetration=Math.max(0,contactDistance+(ship.x-rock.x)*nx+(ship.y-rock.y)*ny)+.02;
    const rockShare=shipMass/(shipMass+rockMass),shipShare=1-rockShare;
    return {t,normal:{x:nx,y:ny},closing,shipMass,rockMass,
      rock:{x:rock.x+nx*penetration*rockShare,y:rock.y+ny*penetration*rockShare,vx:rockVX+ix/rockMass,vy:rockVY+iy/rockMass,spin:clamp(finite(rock.spin)+friction/Math.max(.01,rockMass*radius)*2.5,-5,5)},
      ship:{x:ship.x-nx*penetration*shipShare,y:ship.y-ny*penetration*shipShare,vx:finite(ship.vx)-ix/shipMass,vy:finite(ship.vy)-iy/shipMass},
      damageFraction:collisionDamageFraction(closing,shipMass,rockMass),
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
  window.nativeShipMotion={step,followPath,prepare,stop,profiles,wrap,planLeg,sampleLeg,arrivalEpsilon,asteroidContact,asteroidPairContact,asteroidMass,applyImpulse,kickSample,collisionDamageFraction,debrisContact};
})();
