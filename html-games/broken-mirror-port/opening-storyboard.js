/* Pure narration clock. The campaign director owns encounters and choreography. */
(() => {
  'use strict';
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
  const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  function sample(manifest,seconds,reduced=false){
    const time=clamp(seconds,0,manifest.duration),cues=manifest.cues;
    let index=cues.findIndex(c=>time<c.end);if(index<0)index=cues.length-1;
    const cue=cues[index],title=time>=manifest.titleStart;let first=index,last=index;
    while(first>0&&cues[first-1].scene===cue.scene)first--;
    while(last<cues.length-1&&cues[last+1].scene===cue.scene)last++;
    const start=first===0?0:cues[first].start,stop=cues[last].end,elapsed=reduced?(stop-start)*.46:Math.max(0,time-start);
    return {manifest,time,index,scene:title?'title':cue.scene,cue,progress:clamp((time-start)/Math.max(.001,stop-start)),elapsed,title,
      transition:title?clamp((time-manifest.titleStart)/1.4):Math.min(clamp((time-start)/1.1),clamp((stop-time)/.65)),
      events:manifest.events||{},visualTime:reduced?start+elapsed:time,reducedMotion:reduced,
      subtitle:!title&&time>=cue.start&&time<cue.speechEnd+.35?cue.text:'',location:title?'VEXED MIRROR':cue.location,
      chapter:title?'YOUR COMMAND AWAITS':cue.chapter};
  }
  window.nativeOpeningStoryboard=Object.freeze({sample,noise,clamp,mix});
})();
