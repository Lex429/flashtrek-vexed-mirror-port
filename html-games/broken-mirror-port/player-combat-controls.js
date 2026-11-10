/* Player intent only: weapon owners retain eligibility, recharge and damage. */
(() => {
  'use strict';
  function heldFire({targetKey,allowed,request}) {
    let held=null,lastFrame=null;
    const stop=()=>{held=null;};
    function step(frame) {
      if(!held)return false;
      if(!allowed()||targetKey()!==held){stop();return false;}
      if(lastFrame===frame)return false;
      lastFrame=frame;return request();
    }
    function start(frame) {
      stop();
      if(!allowed())return false;
      held=targetKey();
      return held?step(frame):false;
    }
    return Object.freeze({start,step,stop,get active(){return held!==null;},get target(){return held;}});
  }
  function rankTargets(targets,{threats,distance,miningKey=null}) {
    return targets.sort((a,b)=>Number(threats.has(b.key))-Number(threats.has(a.key))||
      Number(b.key===miningKey)-Number(a.key===miningKey)||distance(a)-distance(b)||a.key.localeCompare(b.key));
  }
  function smartTargeting(){
    const attackers=new Map();let lastAt=-Infinity,lastKey=null,lastBattle=false,lastHeading=null,order=[],attention=null,lastActive=new Set();
    function incoming(key,at){if(key&&key!=='player')attackers.set(key,at+6);}
    function threats(at,live=[]){for(const [key,until] of attackers)if(at>until)attackers.delete(key);for(const key of live)incoming(key,at);return new Set(attackers.keys());}
    function plan(targets,{at,current,heading,threats:danger=new Set(),activeThreats=danger}){
      if(!targets.length)return null;
      const battle=danger.size>0,preferred=battle?targets.filter(t=>danger.has(t.key)):targets;
      const directional=Number.isFinite(heading),turned=directional&&lastHeading!==null&&Math.abs(Math.atan2(Math.sin(heading-lastHeading),Math.cos(heading-lastHeading)))>Math.PI/4;
      const interrupted=battle&&activeThreats.has(targets[0].key)&&!lastActive.has(targets[0].key);
      const rapid=at-lastAt<(directional?2:.7)&&at>=lastAt&&current===lastKey&&battle===lastBattle&&!turned&&!interrupted;
      const keys=rapid&&directional?[...order.filter(key=>targets.some(t=>t.key===key)),...targets.filter(t=>!order.includes(t.key)).map(t=>t.key)]:targets.map(t=>t.key);
      const pool=rapid?keys.map(key=>targets.find(t=>t.key===key)):directional?targets:preferred.length?preferred:targets;
      const index=rapid?pool.findIndex(t=>t.key===current):-1,result=pool[(index+1)%pool.length];
      return {result,keys,battle,activeThreats,heading:directional?heading:null};
    }
    function choose(targets,options){const next=plan(targets,options);if(!next)return null;lastAt=options.at;lastKey=next.result.key;lastBattle=next.battle;lastHeading=next.heading;lastActive=new Set(next.activeThreats);order=next.keys;return next.result;}
    return {incoming,threats,choose,peek:(targets,options)=>plan(targets,options)?.result||null,
      attention(key,at,kind='selection'){if(key)attention={key,kind,until:at+10};},focus:at=>attention&&at<=attention.until?{...attention}:null,
      reset(){attackers.clear();lastAt=-Infinity;lastKey=null;lastBattle=false;lastHeading=null;lastActive=new Set();order=[];attention=null;}};
  }
  function rankIntent(targets,{ship,threats=new Set(),liveThreats=new Set(),urgency=new Map(),mining=false,miningRange=360,focus=null,current=null}){
    const heading=Number(ship.heading??ship.angle)||0;
    return targets.map(target=>{
      const pose=target.pose||target.entry||target,dx=pose.x-ship.x,dy=pose.y-ship.y,distance=Math.hypot(dx,dy);
      const angle=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-heading),Math.cos(Math.atan2(dy,dx)-heading))),facing=Math.max(0,Math.cos(angle));
      const danger=threats.has(target.key),rock=target.kind==='asteroid';
      let score=95*facing**4+(angle<=Math.PI/4?24:0)+(angle<Math.PI/12?12:0)+18/(1+distance/350);
      if(danger)score+=180+(angle<=Math.PI/4?90:0)+(urgency.get(target.key)||0);
      if(liveThreats.has(target.key))score+=300;
      if(!danger&&mining&&rock)score+=45*facing+(distance<=miningRange?18:0);
      if(focus?.key===target.key&&angle<Math.PI/3)score+=focus.kind==='combat'?30:12;
      if(current===target.key&&angle<Math.PI/4)score+=4;
      const weapon=target.weapon;
      if(weapon){score+=weapon.canReach?12:0;score+=weapon.ready?3:0;score+=weapon.clear?18:-18;}
      return {...target,score,distance,angle,danger};
    }).sort((a,b)=>b.score-a.score||a.distance-b.distance||a.key.localeCompare(b.key));
  }
  // Analog trigger presses are edges. A held trigger never cycles or inherits
  // the keyboard's hold-to-clear gesture; release below the lower threshold.
  function targetTrigger({allowed,acquire}){
    let down=false;
    return {update(value){value=Number(value)||0;if(value<=.35){down=false;return false;}if(value<.65||down)return false;down=true;return allowed()?acquire():false;},get down(){return down;}};
  }
  function flightControls(){
    let turnaround=null,qDown=false,sDown=false,reversePress=false,sSeconds=0,stopping=false,wBlocked=false;
    return {get maneuvering(){return turnaround!==null;},reset(){turnaround=null;qDown=false;sDown=false;reversePress=false;sSeconds=0;stopping=false;wBlocked=false;},command(ship,held,dt=1/60){
      const s=!!(held('KeyS')||held('ArrowDown')),stop=!!held('KeyX'),w=!!(held('KeyW')||held('ArrowUp'));
      let drift=!!ship.motionDrift;
      // A tap cuts flight assist without spending momentum. Holding the same
      // press brakes and stays stopped; reverse needs a fresh press at rest.
      if(s&&!sDown){reversePress=!stop&&!(ship.speed>0||Math.hypot(ship.vx||0,ship.vy||0)>0);sSeconds=0;drift=!reversePress;}
      if(!s||stop)reversePress=false;
      sSeconds=s?sSeconds+Math.max(0,Number(dt)||0):0;
      if(s||stop)wBlocked=w;
      if(!w)wBlocked=false;
      if(stop)stopping=true;
      if(w&&!wBlocked&&!s&&!stop){drift=false;stopping=false;}
      if(s&&reversePress){drift=false;stopping=false;}
      sDown=s;
      const brake=stopping||(s&&!reversePress&&sSeconds>=.18);
      const q=!!held('KeyQ');
      if(q&&!qDown&&turnaround===null){turnaround=Math.atan2(Math.sin(ship.angle+Math.PI),Math.cos(ship.angle+Math.PI));wBlocked=w;}
      qDown=q;if(s||stop||held('KeyA')||held('KeyD')||held('ArrowLeft')||held('ArrowRight'))turnaround=null;
      if(turnaround!==null){
        const error=Math.atan2(Math.sin(turnaround-ship.angle),Math.cos(turnaround-ship.angle));
        if(Math.abs(error)<.035){turnaround=null;}
        else return {manualFlight:true,drift:false,heading:turnaround,brake:true,brakeFactor:1.7,turnFactor:1.8};
      }
      return {manualFlight:true,drift,turn:(held('KeyA')||held('ArrowLeft')?-1:0)+(held('KeyD')||held('ArrowRight')?1:0),
        throttle:!brake&&!s&&!wBlocked&&w?1:0,reverse:s&&reversePress,
        brake,brakeFactor:2};
    }};
  }
  window.nativePlayerCombatControls=Object.freeze({heldFire,rankTargets,rankIntent,smartTargeting,targetTrigger,flightControls});
})();
