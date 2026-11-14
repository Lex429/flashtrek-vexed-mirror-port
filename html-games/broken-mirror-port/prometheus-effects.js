/* Cosmetic MVAM exhaust and docking-lock light. No physical consequences. */
(()=>{
 'use strict';
 const histories=new WeakMap(),clamp=t=>Math.max(0,Math.min(1,t));
 const now=s=>window.nativeSimulation.seconds(s);
 const pose=d=>window.nativeSimulationFrame?.renderPose?.(d.state,d)||d;
 const ports=type=>window.nativeShipDefinitions.artworkProfile(type)?.effectPorts;
 function reset(state){histories.delete(state);}
 function advance(state,ships){
  let tracks=histories.get(state);if(!tracks)histories.set(state,tracks=new Map());
  for(const ship of ships){
   const applied=ship.entity?.motionActuation,jets=applied?.jets||[],engines=jets.filter(j=>j.kind==='engine'),rear=jets.filter(j=>j.dy>0),front=jets.filter(j=>j.dy<0);
   tracks.set(ship.id,{...applied,jets,thrust:Math.max(0,...(engines.length?engines:rear).map(j=>j.level)),braking:Math.max(0,...front.map(j=>j.level)),yaw:applied?.alpha||0});
  }
 }
 function bloom(ctx,x,y,r,alpha,color='65,192,255'){
  if(!(r>0)||alpha<=0)return;
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(224,255,255,'+alpha+')');g.addColorStop(.18,'rgba('+color+','+alpha*.8+')');g.addColorStop(1,'rgba('+color+',0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 }
 function flame(ctx,x,y,direction,length,width,power,at,seed){
  if(power<.035)return;
  // A pressure-expanded envelope, dense inner jet and short luminous cells.
  // All variation comes from simulation time, so a paused exhaust stays still.
  const heat=Math.sqrt(power),flutter=1+.07*Math.sin(at*47+seed)+.045*Math.sin(at*79+seed*1.7),l=length*flutter*(.55+.45*heat),w=width*(.6+.4*heat);
  const bend=w*(.16*Math.sin(at*23+seed)+.09*Math.sin(at*37+seed*.7));
  ctx.save();ctx.translate(x,y);ctx.rotate(direction-Math.PI/2);
  ctx.save();ctx.translate(bend*.4,l*.37);ctx.scale(w*2.2,l*.7);
  const halo=ctx.createRadialGradient(0,0,0,0,0,1);halo.addColorStop(0,'rgba(24,136,255,'+power*.22+')');halo.addColorStop(.45,'rgba(16,89,255,'+power*.1+')');halo.addColorStop(1,'rgba(10,44,255,0)');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
  const envelope=(span,spread,alpha,inner)=>{
   const tip=bend*span,gradient=ctx.createLinearGradient(0,0,0,l*span);
   gradient.addColorStop(0,inner?'rgba(240,253,255,'+alpha+')':'rgba(116,224,255,'+alpha*.9+')');
   gradient.addColorStop(.14,inner?'rgba(175,244,255,'+alpha+')':'rgba(44,164,255,'+alpha+')');
   gradient.addColorStop(.45,'rgba(37,137,255,'+alpha*.78+')');gradient.addColorStop(.78,'rgba(27,90,245,'+alpha*.3+')');gradient.addColorStop(1,'rgba(15,65,230,0)');
   ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(-w*spread*.42,0);
   ctx.bezierCurveTo(-w*spread*.8,l*span*.1,-w*spread*1.12+tip*.2,l*span*.24,-w*spread*.8+tip*.5,l*span*.49);
   ctx.bezierCurveTo(-w*spread*.62+tip*.8,l*span*.72,tip-w*spread*.16,l*span*.9,tip,l*span);
   ctx.bezierCurveTo(tip+w*spread*.24,l*span*.87,w*spread*.72+tip*.65,l*span*.64,w*spread*.89+tip*.35,l*span*.38);
   ctx.bezierCurveTo(w*spread*1.03,l*span*.2,w*spread*.7,l*span*.08,w*spread*.42,0);ctx.closePath();ctx.fill();
  };
  envelope(1,1.3,.24+heat*.48,false);envelope(.78,.72,.35+heat*.5,true);envelope(.33,.33,.55+heat*.4,true);
  for(let i=0;i<3;i++){
   const t=.18+i*.17,cy=l*t,cx=bend*t,r=w*(.46-i*.08),a=power*(.18-i*.04)*(1+.15*Math.sin(at*31+seed+i));
   const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,r*1.7);glow.addColorStop(0,'rgba(202,247,255,'+a+')');glow.addColorStop(.5,'rgba(76,185,255,'+a*.6+')');glow.addColorStop(1,'rgba(31,116,255,0)');
   ctx.save();ctx.translate(cx,cy);ctx.scale(1,1.6);ctx.translate(-cx,-cy);ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,r*1.7,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  bloom(ctx,0,0,w*2.6,power*.36);ctx.restore();
 }
 function plume(ctx,ship,at,docking,controls,layer){
  const d=pose(ship),w=d.dimensions.width,h=d.dimensions.height;
  if(!controls?.jets)return;
  ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.heading+Math.PI/2);
  for(const [index,jet]of controls.jets.entries()){
   if((jet.kind==='engine')!==(layer==='under'))continue;
   const engine=jet.kind==='engine',power=jet.level;
   const length=engine?5+h*.22*Math.sqrt(power):2+w*.22*Math.sqrt(power),width=engine?Math.max(1,w*.043):Math.max(.65,w*.026);
   flame(ctx,jet.x,jet.y,Math.atan2(jet.dy,jet.dx),length,width,power,at,d.shipType+index*3.9);
  }
  ctx.restore();
 }
 function locks(ctx,lead,at,strength,green=false){
  const d=pose(lead),w=d.dimensions.width,h=d.dimensions.height,color=green?'115,255,216':'100,220,255';
  ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.heading+Math.PI/2);
  const hardpoints=ports(d.shipType)?.locks||[{x:-.31,y:-.28},{x:.31,y:-.28},{x:-.31,y:.18},{x:.31,y:.18}];
  for(const point of hardpoints)bloom(ctx,point.x*w,point.y*h,3.4,strength*.45,color);
  ctx.restore();
 }
 function paint(ctx,state,lead,escorts,view,layer){
  const g=state.prometheus;if(!g)return;
  const at=now(state),age=at-g.startedAt,joined=g.mode==='joined',docking=g.mode==='recalling'&&g.dockingAt!=null;
  const z=view.zoom||1,d=pose(lead),ships=[lead,...escorts],coupling=g.mode==='separating'||g.mode==='recalling';
  ctx.save();ctx.translate(view.cx-view.ship.x*z,view.cy-view.ship.y*z);ctx.scale(z,z);ctx.globalCompositeOperation='screen';
  for(const ship of ships){
    if(coupling)plume(ctx,ship,at,docking,histories.get(state)?.get(ship.id),layer);
  }
  if(layer!=='under'){
   if(g.mode==='separating'){
    const charge=age<.43?clamp(age/.25):clamp(1-(age-.43)/.8);locks(ctx,lead,at,charge);
    if(age<.43)bloom(ctx,d.x,d.y,lead.dimensions.width*.6,charge*.22);
   }
   if(g.mode==='recalling'){
    const strength=docking?.3+.7*clamp((at-g.dockingAt)/1.65):.22+.12*Math.sin(at*5);
    locks(ctx,lead,at,strength,true);
   }
   if(joined&&!g.assembly&&g.joinedAt!=null){
    const p=(at-g.joinedAt)/.85;if(p>=0&&p<1)locks(ctx,lead,at,(1-p)*.9,true);
   }
  }
  ctx.restore();
 }
 window.nativePrometheusEffects=Object.freeze({reset,advance,paint,snapshot:state=>Array.from(histories.get(state)||[],([id,controls])=>({id,...controls}))});
})();
