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
    let turnaround=null,qDown=false;
    return {reset(){turnaround=null;qDown=false;},command(ship,held){
      const q=!!held('KeyQ');
      if(q&&!qDown&&turnaround===null)turnaround=Math.atan2(Math.sin(ship.angle+Math.PI),Math.cos(ship.angle+Math.PI));
      qDown=q;if(held('KeyX')||held('KeyA')||held('KeyD')||held('ArrowLeft')||held('ArrowRight'))turnaround=null;
      if(turnaround!==null){
        const error=Math.atan2(Math.sin(turnaround-ship.angle),Math.cos(turnaround-ship.angle));
        if(Math.abs(error)<.035){turnaround=null;}
        else return {heading:turnaround,brake:true,brakeFactor:1.7,turnFactor:1.8};
      }
      return {turn:(held('KeyA')||held('ArrowLeft')?-1:0)+(held('KeyD')||held('ArrowRight')?1:0),
        throttle:held('KeyW')||held('ArrowUp')?1:0,reverse:!!(held('KeyS')||held('ArrowDown')),
        brake:!!held('KeyX'),brakeFactor:2};
    }};
  }
  window.nativePlayerCombatControls=Object.freeze({heldFire,rankTargets,smartTargeting,flightControls});
})();
