/* Edited game music and actual destruction sounds, synchronized to the voice. */
(() => {
  'use strict';
  const decoded=new Map();
  function load(context,url){
    if(!decoded.has(url))decoded.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('Film audio unavailable: '+url);return r.arrayBuffer();})
      .then(bytes=>context.decodeAudioData(bytes)).catch(e=>{decoded.delete(url);throw e;}));
    return decoded.get(url);
  }
  function create(){
    let context,music,effects,analyser,buffers,source=null,paused=false,offset=0,began=0,restarts=0,manifest;
    const recent=new Map(),voices=new Map(),heard=new Set();
    function start(settings){
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      context=new Audio();music=context.createGain();effects=context.createGain();
      const limiter=context.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=1;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.12;
      analyser=context.createAnalyser();analyser.fftSize=256;music.connect(limiter);effects.connect(limiter);limiter.connect(analyser);analyser.connect(context.destination);volume(settings);context.resume().catch(()=>{});
    }
    async function prepare(data){manifest=data;if(context){const files=data.explosions||{small:'../flashtrek-broken-mirror/showcase-assets/explodesmall.mp3',large:'../flashtrek-broken-mirror/showcase-assets/explodelarge.mp3'};
      const [song,small,large]=await Promise.all([load(context,data.music),load(context,files.small),load(context,files.large)]);buffers={song,small,large};}}
    function volume(settings){if(music)music.gain.value=settings.music;if(effects)effects.gain.value=settings.effects??.4;}
    function clearMusic(){if(source){try{source.stop();}catch{}source.disconnect();source=null;}}
    function clearVoices(){for(const entry of voices.values()){try{entry.source.stop();}catch{}entry.source.disconnect();entry.gain.disconnect();}voices.clear();}
    function explosion(event,time){
      if(!buffers||!context||paused||context.state!=='running'||voices.has(event.key))return;
      const clip=event.type===18||event.type===7?buffers.small:buffers.large,age=Math.max(0,time-event.at);if(age>=clip.duration)return;
      if(voices.size>=3){const oldest=voices.keys().next().value,entry=voices.get(oldest);try{entry.source.stop();}catch{}voices.delete(oldest);}
      const node=context.createBufferSource(),gain=context.createGain(),speech=manifest.cues.some(c=>time>=c.start-.1&&time<=c.speechEnd+.1);
      node.buffer=clip;gain.gain.value=.24*(speech ? .6 : 1);node.connect(gain);gain.connect(effects);voices.set(event.key,{source:node,gain});
      node.onended=()=>{node.disconnect();gain.disconnect();if(voices.get(event.key)?.source===node)voices.delete(event.key);};node.start(context.currentTime,age);
    }
    function sync(time,force=false){
      if(!context||!buffers||context.state==='closed')return;
      const predicted=offset+(source?context.currentTime-began:0),jump=Math.abs(predicted-time)>.3;
      if(!force&&source&&Math.abs(predicted-time)<.09)return;
      clearMusic();if(jump){clearVoices();if(time<offset)heard.clear();recent.clear();}offset=time;began=context.currentTime;if(paused||context.state!=='running')return;
      source=context.createBufferSource();source.buffer=buffers.song;source.connect(music);source.start(context.currentTime,Math.max(0,Math.min(buffers.song.duration-.002,time)));restarts++;
      if(force&&!jump)for(const event of recent.values())explosion(event,time);
    }
    function explosions(events,time,silent=false){
      for(const e of events){const event={...e,key:`${e.encounter}:${e.id}:${e.at.toFixed(3)}`};if(heard.has(event.key))continue;heard.add(event.key);
        recent.set(event.key,event);if(!silent&&Math.abs(event.at-time)<.2)explosion(event,time);}
      for(const [key,e]of recent)if(time-e.at>5||e.at>time+.2)recent.delete(key);
      if(heard.size>512)heard.clear();
    }
    function pause(value){paused=value;if(!context)return;if(value){offset+=source?context.currentTime-began:0;clearMusic();clearVoices();context.suspend().catch(()=>{});}else context.resume().then(()=>sync(offset,true)).catch(()=>{});}
    function stop(){clearMusic();clearVoices();context?.close().catch(()=>{});context=null;recent.clear();heard.clear();}
    function snapshot(){let peak=0;if(analyser){const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);for(const x of data)peak=Math.max(peak,Math.abs(x));}
      return {state:context?.state||'closed',tracks:source?1:0,explosionVoices:voices.size,weaponSounds:false,ready:!!buffers,time:offset+(context&&source?context.currentTime-began:0),restarts,peak};}
    return {start,prepare,volume,tick:frame=>sync(frame.time),sync,explosions,pause,stop,snapshot};
  }
  window.nativeOpeningScore=Object.freeze({create});
})();
