/* Adapted from Downloads/FlashTrek Rebirth/flashtrek.html:
 * beginPlayerTravelToPlanet, drawShipAtWorld, drawWarpFx,
 * startSimpleWarpIn and the warp-in interpolation in step().
 * Rebirth world distances use its default 0.625 zoom in this flight view.
 */
(() => {
  'use strict';
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const zoom = .625;
  const departureMs = 1100, arrivalMs = 700;
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
  function alignment(elapsedMs,from,to,duration=900){
    const t=smooth(elapsedMs/duration),delta=Math.atan2(Math.sin(to-from),Math.cos(to-from));
    return {kind:'alignment',angle:from+delta*t,speed:0,shipX:300,shipY:225,cameraX:0,cameraY:0,alpha:1,squeezeX:1,pulse:.12+.55*t,nacelleCharge:.65*t,ring:null};
  }
  function charging(elapsedMs,angle,duration=1200){
    const charge=.65+.35*smooth(elapsedMs/duration);
    return {kind:'charging',angle,speed:0,shipX:300,shipY:225,cameraX:0,cameraY:0,alpha:1,squeezeX:1,pulse:charge,nacelleCharge:charge,ring:null};
  }
  function departure(elapsedMs, angle, options={}) {
    const duration=options.duration||departureMs,t = clamp(elapsedMs / duration);
    const view=options.view||{w:600,h:450},radius=Math.min(32,view.w*.08,view.h*.08),margin=radius*1.5+16;
    const dx=Math.sin(angle),dy=-Math.cos(angle),edge=Math.min((view.w/2-margin)/Math.max(1e-6,Math.abs(dx)),(view.h/2-margin)/Math.max(1e-6,Math.abs(dy)));
    const limit=options.reducedMotion?0:Math.max(0,Math.min(320,edge*.7)),vanish=.58,run=clamp(t/vanish),distance=limit*run*run*run;
    const gone=t>=vanish,tail=clamp((t-vanish)/(1-vanish)),flashHold=Math.min(.3,100/(duration*(1-vanish))),flashFade=clamp((tail-flashHold)/(1-flashHold));
    return {kind:'departure',angle,speed:gone?0:3*limit/(duration/1000*vanish)*run*run,nacelleCharge:1,
      shipX:300+dx*distance,shipY:225+dy*distance,cameraX:0,cameraY:0,
      alpha:gone?0:1-smooth((t-(vanish-.1))/.1),squeezeX:1-.88*smooth((t-.3)/(vanish-.3)),pulse:1,ring:null,
      flash:gone&&t<1?{x:300+dx*limit,y:225+dy*limit,radius:radius*(.85+.4*smooth(tail/.24)),alpha:options.reducedMotion?.45*Math.pow(1-tail,1.7):Math.pow(1-flashFade,1.7)}:null};
  }
  function arrival(elapsedMs, angle, options={}) {
    const t0 = clamp(elapsedMs / (options.duration||arrivalMs));
    const t = t0 * t0 * (3 - 2 * t0);
    const fade = clamp(t0 / .35);
    const squeeze = .10 + .90 * fade;
    const distance = 2600 * zoom * (1 - t);
    return {kind:'arrival', angle, speed:0, shipX:300, shipY:225,
      cameraX:-Math.sin(angle)*distance, cameraY:Math.cos(angle)*distance,
      alpha:fade, squeezeX:squeeze, pulse:1-t0, ring:null};
  }
  // The player animates the camera on arrival. An observer sees that same
  // movement on the arriving ship while their own camera stays in place.
  function worldEffect(kind, elapsedMs, angle, x, y, options={}) {
    const effect = kind === 'departure' ? departure(elapsedMs, angle, options) : arrival(elapsedMs, angle, options);
    return {...effect,
      shipX:x + (kind === 'departure' ? effect.shipX - 300 : effect.cameraX),
      shipY:y + (kind === 'departure' ? effect.shipY - 225 : effect.cameraY),
      cameraX:0, cameraY:0,
      ring:effect.ring ? {...effect.ring,x,y} : null,
      flash:effect.flash?{...effect.flash,x:x+(effect.flash.x-300),y:y+(effect.flash.y-225)}:null};
  }
  function journeyDeparture(journey,at,frame={x:0,y:0},options={}){
    const elapsed=(at-Number(journey?.departedAt))*1000,from=journey?.galaxyFrom;
    if(!(elapsed>=0&&elapsed<departureMs)||!from)return null;
    const points=journey.waypoints||[from,journey.galaxyTo],to=points.find(p=>p&&Math.hypot(p.x-from.x,p.y-from.y)>1e-6)||journey.galaxyTo;
    if(!to)return null;
    const angle=Math.atan2(to.y-from.y,to.x-from.x)+Math.PI/2;
    return worldEffect('departure',elapsed,angle,from.x-frame.x,from.y-frame.y,options);
  }
  window.vexedRebirthWarp = {alignment,charging,departure,arrival,worldEffect,journeyDeparture,departureMs,arrivalMs,arrivalSpeed:220*zoom};
})();
