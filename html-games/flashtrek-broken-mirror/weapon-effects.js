/* Shared showcase/game weapon drawing. Coordinates and zoom come from each scene. */
(() => {
 const bounds=new WeakMap();
 const appearance={units:.91976,spinMin:4,spinMax:9,durationMs:kind=>kind==='beam'?180:kind==='torpedo'?560:360,
  beginFrame:canvas=>bounds.set(canvas,{rect:null,width:canvas.width}),endFrame:canvas=>bounds.delete(canvas)};
 window.showcaseWeaponAppearance=appearance;
 window.createShowcaseWeaponVisual=({kind,style,units=appearance.units,spin,spinSpeed})=>({kind,style,units,
  spin:spin??Math.random()*Math.PI*2,spinSpeed:spinSpeed??appearance.spinMin+Math.random()*(appearance.spinMax-appearance.spinMin)});
 window.paintShowcaseWeaponShot=(ctx,shot,geometry,age=0)=>{
  let spin=shot.spin+age/1000*shot.spinSpeed,pixelRatio=null;
  if(geometry.screenPixels){
   // Transform positions first, then draw in CSS pixels so even the shader's minimum widths stay identical.
   const matrix=ctx.getTransform(),frame=bounds.get(ctx.canvas);
   const rect=frame?(frame.rect&&frame.width===ctx.canvas.width?frame.rect:(frame.width=ctx.canvas.width,frame.rect=ctx.canvas.getBoundingClientRect())):ctx.canvas.getBoundingClientRect();
   pixelRatio=ctx.canvas.width/Math.max(1,rect.width);
   const point=(x,y)=>({x:(matrix.a*x+matrix.c*y+matrix.e)/pixelRatio,y:(matrix.b*x+matrix.d*y+matrix.f)/pixelRatio});
   geometry={...geometry,zoom:1};
   for(const [x,y] of [['x','y'],['x1','y1'],['x2','y2']])if(Number.isFinite(geometry[x])&&Number.isFinite(geometry[y])){const mapped=point(geometry[x],geometry[y]);geometry[x]=mapped.x;geometry[y]=mapped.y;}
   if(Number.isFinite(geometry.angle)){const x=Math.cos(geometry.angle),y=Math.sin(geometry.angle);geometry.angle=Math.atan2(matrix.b*x+matrix.d*y,matrix.a*x+matrix.c*y);}
   spin+=Math.atan2(matrix.b,matrix.a);
  }
  const parameters={...geometry,kind:shot.kind,color:shot.style.color,thickness:shot.style.thickness,age,duration:shot.duration||appearance.durationMs(shot.kind),seed:shot.spin,
   units:shot.units??appearance.units,spin,zoom:(geometry.zoom??1)*(window.nativeEffectProfiles?.weapon().scale||1)};
  // GPU packets need geometry, not Canvas drawing commands. Avoid queuing a
  // save/restore and style reset for every shot when the GPU accepts it.
  const gpuMatrix=pixelRatio===null?null:{a:pixelRatio,b:0,c:0,d:pixelRatio,e:0,f:0};
  if(window.nativeEffectProfiles?.queueWeapon?.(ctx,parameters,gpuMatrix))return;
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.shadowColor='transparent';ctx.filter='none';ctx.lineCap='butt';ctx.lineJoin='miter';
  if(pixelRatio!==null)ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  if(window.nativeEffectProfiles)window.nativeEffectProfiles.drawWeapon(window.drawShowcaseWeapon,ctx,parameters);
  else window.drawShowcaseWeapon(ctx,parameters);
  ctx.restore();
 };
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
