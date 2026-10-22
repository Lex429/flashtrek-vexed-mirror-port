/* Fixed mixed fleet, original display dimensions. Lighting is absent in both conditions. */
(async()=>{
  'use strict';
  const canvas=document.getElementById('gpu'),assets=[];
  for(const source of shieldReplayShips){const image=new Image();image.src='../../html-games/flashtrek-broken-mirror/showcase-assets/'+source.file;await image.decode();assets.push({...source,image});}
  const renderer=await createVexedShieldGPU({canvas,assets}),fleet=[];
  for(let i=0;i<100;i++){
    const a=assets[i%assets.length],w=a.width,h=a.height;let rx=Math.max(26,w*.54+13),ry=Math.max(26,h*.54+13);if(rx/ry>.82&&rx/ry<1.22)rx=ry=Math.max(rx,ry);
    fleet.push({id:i,layer:i%assets.length,x:85+(i%10)*(1110/9),y:88+Math.floor(i/10)*(674/9),w,h,rx,ry,angle:0,phase:i*.71,motion:2});
  }
  // Shelf-pack conservative rotated hull rectangles, without changing artwork
  // dimensions. Energy fields may overlap; no hull covers another hull.
  const packing=fleet.map((a,i)=>({i,bw:Math.max(56,a.w*Math.cos(.25)+a.h*Math.sin(.25)+8),bh:Math.max(56,a.w*Math.sin(.25)+a.h*Math.cos(.25)+8)})).sort((a,b)=>b.bh-a.bh||a.i-b.i);
  let x=36,y=36,rowHeight=0;
  for(const box of packing){if(x+box.bw>1244){x=36;y+=rowHeight+10;rowHeight=0;}fleet[box.i].x=x+box.bw/2;fleet[box.i].y=y+box.bh/2;x+=box.bw+10;rowHeight=Math.max(rowHeight,box.bh);}
  renderer.setFleet(fleet);
  // A pinned finite hit recording, including pre-roll, feeds both OFF and ON.
  const sequence=[];for(let i=0;i<100;i++)for(let born=-900+i*4.5;born<=125000;born+=450){const a=fleet[i],angle=-.6+(i%7)*.19;sequence.push({ship:i,born,x:Math.cos(angle)*a.rx*.94,y:Math.sin(angle)*a.ry*.94,strength:1+(i%3)*.15});}
  sequence.sort((a,b)=>a.born-b.born||a.ship-b.ship);let cursor=0,last=-Infinity,on=false,playing=false,clock=0,start=0;
  function reset(){cursor=0;last=-Infinity;renderer.setFleet(fleet);}
  function paint(time,effects=on){
    if(time<last)reset();while(cursor<sequence.length&&sequence[cursor].born<=time){const e=sequence[cursor++];renderer.hit(e.ship,e);}last=time;
    return renderer.render(time,{effects});
  }
  function auditLayout(){
    const rectangles=fleet.map(a=>({left:a.x-Math.max(56,a.w*Math.cos(.25)+a.h*Math.sin(.25)+8)/2,right:a.x+Math.max(56,a.w*Math.cos(.25)+a.h*Math.sin(.25)+8)/2,top:a.y-Math.max(56,a.w*Math.sin(.25)+a.h*Math.cos(.25)+8)/2,bottom:a.y+Math.max(56,a.w*Math.sin(.25)+a.h*Math.cos(.25)+8)/2}));
    let overlaps=0;for(let i=0;i<rectangles.length;i++)for(let j=0;j<i;j++){const a=rectangles[i],b=rectangles[j];if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)overlaps++;}
    let minFullyVisible=100;for(let t=0;t<=30000;t+=100)minFullyVisible=Math.min(minFullyVisible,renderer.visibility(t).fullyVisible);
    if(overlaps||minFullyVisible!==100)throw Error('Fleet layout invalid: '+JSON.stringify({overlaps,minFullyVisible}));return {overlaps,minFullyVisible,artworkDimensionsUnchanged:true};
  }
  function animate(t){if(!playing)return;clock=t-start;paint(clock);requestAnimationFrame(animate);}
  document.getElementById('toggle').onclick=()=>{on=!on;document.getElementById('toggle').textContent=on?'Shields OFF':'Shields ON';paint(clock);};
  document.getElementById('play').onclick=()=>{playing=!playing;if(playing){start=performance.now()-clock;requestAnimationFrame(animate);}};
  window.shieldGPUReplay={renderer,canvas,fleet,sequence,paint,reset,auditLayout,stop:()=>{playing=false;},get active(){return on;}};
  auditLayout();
  paint(0);document.getElementById('status').textContent='Ready · 100 original-size ships · lighting OFF';
})().catch(e=>{document.getElementById('status').textContent='Failed: '+e.message;console.error(e);});
