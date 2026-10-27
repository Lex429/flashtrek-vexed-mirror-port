/* Original Broken Mirror computer clips for menus and inventory feedback. */
(() => {
  'use strict';
  const key='vexedMirror.menuSounds.v1',menu=document.getElementById('menu-art');
  // Preserve the Flash MP3 seek/sample bounds, removing its encoder padding.
  const seek=1661/11025;
  const clips={hover:{file:'comp2',peak:.07,samples:1612},press:{file:'comp1',peak:.25,samples:2816},confirm:{file:'comp3',peak:.25,samples:9312}};
  const encoded=new Map(),buffers=new Map(),voices=new Set(),played={hover:0,press:0,confirm:0};
  let enabled=true,context=null,decoding=null,lastHover=-Infinity,generation=0;
  try{enabled=localStorage.getItem(key)!=='off';}catch{}
  for(const clip of Object.values(clips)){
    encoded.set(clip.file,fetch(`assets/menu-sounds/${clip.file}.mp3`).then(response=>{
      if(!response.ok)throw Error(`Original menu sound unavailable: ${clip.file}`);
      return response.arrayBuffer();
    }).catch(error=>{console.warn(error);return null;}));
  }
  const toggle=document.createElement('button');
  toggle.id='menu-sound-toggle';toggle.type='button';toggle.setAttribute('aria-label','Toggle original menu sound effects');menu.append(toggle);
  function label(){toggle.textContent=enabled?'Sound on':'Sound off';toggle.setAttribute('aria-pressed',String(enabled));}
  function unlock(){
    if(!enabled)return;
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    context||=new Audio();
    if(context.state==='suspended')context.resume().catch(()=>{});
    decoding||=Promise.all(Object.values(clips).map(async clip=>{
      const data=await encoded.get(clip.file);if(!data)return;
      try{
        const buffer=await context.decodeAudioData(data.slice(0));let peak=.001;
        for(let channel=0;channel<buffer.numberOfChannels;channel++)for(const value of buffer.getChannelData(channel))peak=Math.max(peak,Math.abs(value));
        buffers.set(clip.file,{buffer,peak});
      }catch(error){console.warn('Original menu sound could not decode',clip.file,error);}
    }));
  }
  function stop(){generation++;for(const voice of voices){try{voice.source.stop();}catch{}}voices.clear();}
  function play(kind,delay=0){
    if(!enabled||!context||document.hidden||!clips[kind])return false;
    const now=performance.now();
    if(kind==='hover'){if(now-lastHover<160)return false;lastHover=now;}
    const ticket=generation,request=async()=>{
      await decoding;
      if(!enabled||ticket!==generation||document.hidden||context.state!=='running')return;
      const clip=clips[kind],decoded=buffers.get(clip.file);if(!decoded)return;
      if(kind==='press')for(const voice of voices)if(voice.kind==='hover'){try{voice.source.stop();}catch{}}
      if(voices.size>=4){const first=voices.values().next().value;try{first.source.stop();}catch{}voices.delete(first);}
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=decoded.buffer;
      gain.gain.value=Math.min(2.5,clip.peak/decoded.peak);source.connect(gain);gain.connect(context.destination);
      const voice={kind,source,gain};voices.add(voice);
      source.onended=()=>{voices.delete(voice);source.disconnect();gain.disconnect();};
      source.start(context.currentTime+Math.max(0,delay),seek,clip.samples/11025);played[kind]++;
    };
    request().catch(error=>console.warn('Original menu sound playback failed',error));return true;
  }
  toggle.addEventListener('click',()=>{
    enabled=!enabled;try{localStorage.setItem(key,enabled?'on':'off');}catch{}
    if(enabled)unlock();else stop();label();
  });
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,e=>{
    if(e.isTrusted&&!menu.hidden&&!document.body.classList.contains('playing'))unlock();
  },{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  label();
  window.nativeMenuSounds=Object.freeze({play,stop,inventory(kind){unlock();return play({equip:'confirm',unequip:'press',reject:'hover',select:'press'}[kind]||'press');},snapshot:()=>({enabled,unlocked:!!context,state:context?.state||'locked',decoded:[...buffers.keys()],played:{...played},active:voices.size})});
})();
