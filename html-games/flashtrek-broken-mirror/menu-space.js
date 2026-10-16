/* Main-menu space behind independent HTML controls. */
const menuSpace=(()=>{
 const canvas=document.getElementById('menu-space'),ctx=canvas.getContext('2d',{alpha:true});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let raf=0,last=0,time=0,frames=0,px=0,py=0,aimX=0,aimY=0;
 const stars=Array.from({length:185},(_,i)=>({x:(Math.random()-.5)*6,y:(Math.random()-.5)*4.5,z:.6+Math.random()*3.4,size:i%13===0?1.25:.4+Math.random()*.45,speed:i%3===0?.045:.022,color:i%9===0?'#b4d7fa':i%17===0?'#eed8d4':'#d6dceb'}));
 // Paint behind the opening screen so its fade never exposes the native grid.
 function visible(){return !menuArt.hidden&&!document.hidden;}
 function cloud(x,y,rx,ry,color){
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
  const gradient=ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,color);gradient.addColorStop(.45,color.replace(/,[\d.]+\)$/ ,',0.035)'));gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 function draw(dt){
  ctx.setTransform(canvas.width/600,0,0,canvas.height/450,0,0);
  ctx.fillStyle='#030711';ctx.fillRect(0,0,600,450);
  time+=dt;const ease=1-Math.exp(-dt*2.5);px+=(aimX-px)*ease;py+=(aimY-py)*ease;
  cloud(430+Math.sin(time*.018)*34+px*8,170+Math.cos(time*.014)*20+py*6,290,205,'rgba(54,67,121,0.16)');
  cloud(140+Math.cos(time*.012)*30+px*12,320+Math.sin(time*.016)*18+py*9,250,185,'rgba(91,37,72,0.115)');
  cloud(325+px*5,245+py*4,210,155,'rgba(35,90,108,0.085)');
  for(const star of stars){
   star.z-=dt*star.speed;
   let x=300+star.x/star.z*260+px*8/star.z,y=228+star.y/star.z*260+py*6/star.z;
   if(star.z<.5||x<-12||x>612||y<-12||y>462){star.z=3.5+Math.random()*.5;star.x=(Math.random()-.5)*6;star.y=(Math.random()-.5)*4.5;x=300+star.x/star.z*260;y=228+star.y/star.z*260;}
   const radius=Math.max(.28,star.size/star.z*.85);
   ctx.globalAlpha=Math.min(.8,.16+(.95/star.z));ctx.fillStyle=star.color;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
   if(star.size>1&&star.z<1.6){ctx.globalAlpha=.08;ctx.beginPath();ctx.arc(x,y,radius*3,0,Math.PI*2);ctx.fill();}
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
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 return {prepare(){resize();sync();},get state(){return {frames,time,px,py,running:!!raf,reducedMotion:reduced.matches};}};
})();
