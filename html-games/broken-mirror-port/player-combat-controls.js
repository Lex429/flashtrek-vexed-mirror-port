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
    const attackers=new Map();let lastAt=-Infinity,lastKey=null,lastBattle=false;
    function incoming(key,at){if(key&&key!=='player')attackers.set(key,at+6);}
    function threats(at,live=[]){for(const [key,until] of attackers)if(at>until)attackers.delete(key);for(const key of live)incoming(key,at);return new Set(attackers.keys());}
    function choose(targets,{at,current,threats:danger=new Set()}){
      if(!targets.length)return null;
      const battle=danger.size>0,preferred=battle?targets.filter(t=>danger.has(t.key)):targets;
      const rapid=at-lastAt<.7&&at>=lastAt&&current===lastKey&&battle===lastBattle,pool=rapid?targets:preferred.length?preferred:targets;
      const index=rapid?pool.findIndex(t=>t.key===current):-1,result=pool[(index+1)%pool.length];
      lastAt=at;lastKey=result.key;lastBattle=battle;return result;
    }
    return {incoming,threats,choose,reset(){attackers.clear();lastAt=-Infinity;lastKey=null;lastBattle=false;}};
  }
  function flightControls(){
    let turnaround=null,qDown=false,sDown=false,reversePress=false,sSeconds=0,stopping=false,wBlocked=false;
    return {reset(){turnaround=null;qDown=false;sDown=false;reversePress=false;sSeconds=0;stopping=false;wBlocked=false;},command(ship,held,dt=1/60){
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
  window.nativePlayerCombatControls=Object.freeze({heldFire,rankTargets,smartTargeting,flightControls});
})();
