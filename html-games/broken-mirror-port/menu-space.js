/* Main-menu space behind independent HTML controls. */
const menuSpace=(()=>{
 const canvas=document.getElementById('menu-space'),ctx=canvas.getContext('2d',{alpha:true});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let raf=0,last=0,time=0,frames=0,px=0,py=0,aimX=0,aimY=0,projected=[];
 const field=window.nativeMenuStarfield,stars=field.create(720);
 // Paint behind the opening screen so its fade never exposes the native grid.
 function visible(){return !menuArt.hidden&&!document.hidden&&!window.nativePause?.active&&!document.body.classList.contains('playing')&&!game.classList.contains('setup-open');}
 function cloud(x,y,rx,ry,color){
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
  const gradient=ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,color);gradient.addColorStop(.45,color.replace(/,[\d.]+\)$/ ,',0.035)'));gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 function draw(dt){
  const {w,h}=window.nativeView.fit(canvas,ctx),ox=(w-600)/2,oy=(h-450)/2;
  if(window.nativePause?.active)dt=0;
  ctx.fillStyle='#030711';ctx.fillRect(0,0,w,h);
  time+=dt;const ease=1-Math.exp(-dt*2.5);px+=(aimX-px)*ease;py+=(aimY-py)*ease;
  cloud(ox+430+Math.sin(time*.018)*34+px*8,oy+170+Math.cos(time*.014)*20+py*6,290,205,'rgba(54,67,121,0.16)');
  cloud(ox+140+Math.cos(time*.012)*30+px*12,oy+320+Math.sin(time*.016)*18+py*9,250,185,'rgba(91,37,72,0.115)');
  cloud(ox+325+px*5,oy+245+py*4,210,155,'rgba(35,90,108,0.085)');
  projected=[];const travel=time*field.speed;
  for(const star of stars){
   const point=field.project(star,travel,w,h,px,py);projected.push(point);
   if(!point.visible)continue;
   const {x,y,z,radius,opacity}=point;
   const dx=x-point.trailX,dy=y-point.trailY,length=Math.hypot(dx,dy),shutter=Math.min(1,9/Math.max(.001,length));
   if(z<1.8&&length>.5){
    ctx.globalAlpha=opacity*.28;ctx.strokeStyle=star.color;ctx.lineWidth=Math.max(.35,radius*.6);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(x-dx*shutter,y-dy*shutter);ctx.lineTo(x,y);ctx.stroke();
   }
   ctx.globalAlpha=opacity;ctx.fillStyle=star.color;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
   if(star.size>1&&z<1.6){ctx.globalAlpha=opacity*.08;ctx.beginPath();ctx.arc(x,y,radius*3,0,Math.PI*2);ctx.fill();}
  }
  ctx.globalAlpha=1;
  frames++;
 }
 function loop(now){raf=0;if(!visible())return;const dt=last?Math.min((now-last)/1000,.06):0;last=now;draw(dt);raf=requestAnimationFrame(loop);}
 function sync(){
  if(raf)cancelAnimationFrame(raf);raf=0;last=0;
  if(!visible())return;
  if(reduced.matches){px=py=0;draw(0);}else raf=requestAnimationFrame(loop);
 }
 function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const scale=Math.min(devicePixelRatio||1,1.5,1600/r.width);canvas.width=Math.round(r.width*scale);canvas.height=Math.round(r.height*scale);if(visible())draw(0);}
 game.addEventListener('pointermove',event=>{if(!visible()||reduced.matches)return;const r=game.getBoundingClientRect();aimX=(event.clientX-r.left)/r.width-.5;aimY=(event.clientY-r.top)/r.height-.5;});
 game.addEventListener('pointerleave',()=>{aimX=aimY=0;});
 new ResizeObserver(resize).observe(canvas);
 const observer=new MutationObserver(()=>{resize();sync();});
 observer.observe(menuArt,{attributes:true,attributeFilter:['hidden']});observer.observe(document.getElementById('startup'),{attributes:true,attributeFilter:['hidden']});
 observer.observe(game,{attributes:true,attributeFilter:['class']});observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 return {prepare(){resize();sync();},get state(){return {frames,time,travel:time*field.speed,px,py,running:!!raf,reducedMotion:reduced.matches,projected:projected.map(p=>({...p}))};}};
})();
