/* Shared showcase/game weapon drawing. Coordinates and zoom come from each scene. */
(() => {
 const hex=color=>'#'+Number(color).toString(16).padStart(6,'0');
 function gradient(ctx,x,y,r,color,alpha){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,'#ffffff');g.addColorStop(.18,color);g.addColorStop(1,color+'00');
  ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
 }
 window.drawShowcaseWeapon=(ctx,shot)=>{
  const color=hex(shot.color),zoom=shot.zoom,units=shot.units;
  ctx.save();
  if(shot.kind==='beam'){
   const thick=Math.max(.4,shot.thickness*units*.45*zoom);
   for(const [width,opacity,tint] of [[thick*1.8,.22,color],[thick,.95,color],[Math.max(.2,thick*.28),.765,'#fff']]){
    ctx.strokeStyle=tint;ctx.globalAlpha=opacity;ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(shot.x1,shot.y1);ctx.lineTo(shot.x2,shot.y2);ctx.stroke();
   }
   gradient(ctx,shot.x1,shot.y1,Math.max(1.5,thick*2.5),color,.9);
  }else if(shot.kind==='torpedo'){
   const unit=units*zoom,outer=8*unit,inner=3.5*unit;
   gradient(ctx,shot.x,shot.y,outer*1.6,color,.6);
   ctx.translate(shot.x,shot.y);ctx.rotate(shot.spin);ctx.fillStyle=color;ctx.beginPath();
   for(let i=0;i<=10;i++){const a=i*Math.PI/5,r=i%2?inner:outer;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(r,0);}
   ctx.fill();ctx.fillStyle='#fff';ctx.globalAlpha=.9025;ctx.beginPath();ctx.arc(0,0,2.2*unit,0,Math.PI*2);ctx.fill();
  }else{
   const dx=Math.cos(shot.angle)*9*zoom,dy=Math.sin(shot.angle)*9*zoom;
   for(const [width,opacity,tint] of [[8.4,.22,color],[3,.95,color],[1,.85,'#fff']]){
    ctx.strokeStyle=tint;ctx.lineWidth=width*zoom;ctx.globalAlpha=opacity;
    ctx.beginPath();ctx.moveTo(shot.x-dx,shot.y-dy);ctx.lineTo(shot.x+dx,shot.y+dy);ctx.stroke();
   }
  }
  ctx.restore();
 };
})();
