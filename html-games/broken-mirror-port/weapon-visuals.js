/* Native collisions and projectile positions drive the shared weapon renderer. */
(() => {
 const canvas=document.createElement('canvas');canvas.id='weapon-visuals';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'5',display:'none'});
 game.appendChild(canvas);const ctx=canvas.getContext('2d');
 let shots=[],received=0,raf=0,frames=0,updates=0;
 function clear(){shots=[];ctx.clearRect(0,0,canvas.width,canvas.height);canvas.style.display='none';if(raf)cancelAnimationFrame(raf);raf=0;}
 function draw(now){
  raf=0;ctx.setTransform(canvas.width/600,0,0,canvas.height/450,0,0);ctx.clearRect(0,0,600,450);
  if(Number(game.dataset.frame)!==154){clear();return;}
  ctx.save();ctx.beginPath();ctx.rect(0,42,600,360);ctx.clip();
  for(const shot of shots){
   if(shot.kind==='beam'&&shot.age+now-received>=180)continue;
   window.drawShowcaseWeapon(ctx,{...shot,spin:shot.spin+(now-received)/1000*shot.spinSpeed});
  }
  ctx.restore();frames++;
  if(shots.length)raf=requestAnimationFrame(draw);else canvas.style.display='none';
 }
 window.vexCombatVisualUpdate=(records,zoom,units)=>{
  received=performance.now();updates++;
  shots=(records||[]).map(s=>({...s,zoom:1/Math.max(.1,Number(zoom)),units:Number(units)}));
  canvas.style.display=shots.length?'block':'none';
  if(!raf&&shots.length)raf=requestAnimationFrame(draw);
  if(!shots.length)ctx.clearRect(0,0,canvas.width,canvas.height);
  return true;
 };
 const resize=()=>{const r=game.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);};
 new ResizeObserver(resize).observe(game);
 new MutationObserver(()=>{if(Number(game.dataset.frame)!==154)clear();}).observe(game,{attributes:true,attributeFilter:['data-frame']});
 window.vexCombatVisualState=()=>({shots:shots.map(s=>({...s})),frames,updates});
})();
