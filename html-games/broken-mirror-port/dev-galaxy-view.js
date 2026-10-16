/* Dev-only overview of the same continuous coordinates used by live flight. */
(() => {
  'use strict';
  const flight=window.nativeManualFlight;
  const systems=flight.systems.map(system=>({system,position:flight.planetPosition(system.id)})).filter(entry=>entry.position);
  const systemNames=new Map(systems.map(({system})=>[system.id,system.name]));
  const stage=document.getElementById('game');
  const panel=document.createElement('aside');
  panel.id='dev-galaxy-ships';panel.hidden=true;
  panel.innerHTML='<div class="dev-galaxy-ships-head"><strong>SHIP LOCATIONS</strong><span data-count></span></div><label>System<select data-system><option value="all">All systems</option></select></label><label>Find ship<input data-search type="search" placeholder="Name or class"></label><div class="dev-galaxy-ship-list" data-list></div><div class="dev-galaxy-legend">Blue: civilian · Green: tug · Gold: in warp · Gray: disabled or destroyed</div>';
  stage.append(panel);
  const systemFilter=panel.querySelector('[data-system]'),search=panel.querySelector('[data-search]'),list=panel.querySelector('[data-list]'),count=panel.querySelector('[data-count]');
  for(const {system} of systems)systemFilter.add(new Option(system.name,String(system.id)));
  let active=false,lastRefresh=0,lastState=null,mapHits=[];
  const nameOf=id=>systemNames.get(Number(id))||`System ${id}`;
  const details=ship=>ship.phase==='warp'&&ship.destinationSystem?`In warp: ${nameOf(ship.system)} → ${nameOf(ship.destinationSystem)}`:ship.kind==='tug'?`Sol · ${window.nativeSolEconomy.names[ship.port]||'in transit'} · ${Math.round(ship.x)}, ${Math.round(ship.y)} u`:`${nameOf(ship.system)}${ship.system===1&&window.nativeSolEconomy.names[ship.port]?` · ${window.nativeSolEconomy.names[ship.port]}`:''} · ${Math.round(ship.x)}, ${Math.round(ship.y)} u`;
  function allShips(state){
    const civilians=window.nativeCivilianTraffic?.initialize(state).ships.map(ship=>({...ship,kind:'civilian'}))||[];
    const tugs=(state.solEconomy?.freighters||[]).map(ship=>({...ship,kind:'tug',system:1,port:ship.port||ship.from,name:`Tug Class II #${ship.id+1}`}));
    return [...civilians,...tugs];
  }
  function refresh(state){
    if(!active||!state)return;
    const query=search.value.trim().toLowerCase(),system=systemFilter.value,all=allShips(state);
    const ships=all.filter(ship=>(system==='all'||String(ship.system)===system||String(ship.destinationSystem)===system)&&(!query||ship.name.toLowerCase().includes(query)||ship.kind.includes(query)));
    ships.sort((a,b)=>a.system-b.system||a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
    count.textContent=`${ships.length} / ${all.length}`;
    const fragment=document.createDocumentFragment();
    for(const ship of ships){
      const row=document.createElement('div');row.className=`dev-galaxy-ship ${ship.kind}`;
      const title=document.createElement('strong');title.textContent=ship.name;
      const location=document.createElement('span');location.textContent=details(ship);
      const status=document.createElement('small');status.textContent=ship.phase==='warp'?`WARP · ${Math.ceil(ship.timer)} s remaining`:ship.phase==='cruise'||ship.phase==='encounter'||ship.phase==='mining-flight'?`${ship.phase.toUpperCase()} · ${Math.round(ship.speed||0)} u/s`:ship.phase.toUpperCase();
      row.append(title,location,status);fragment.append(row);
    }
    list.replaceChildren(fragment);
  }
  systemFilter.onchange=()=>refresh(lastState);
  search.oninput=()=>refresh(lastState);
  stage.querySelector('#space').addEventListener('click',event=>{
    if(!active)return;
    const rect=event.currentTarget.getBoundingClientRect(),view=window.nativeView.measure(event.currentTarget),x=(event.clientX-rect.left)*view.w/rect.width,y=(event.clientY-rect.top)*view.h/rect.height;
    const hit=mapHits.filter(point=>Math.hypot(point.x-x,point.y-y)<12).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
    if(hit){systemFilter.value=String(hit.id);refresh(lastState);}
  });
  function setActive(enabled){active=!!enabled;panel.hidden=!active;lastRefresh=0;if(active)refresh(lastState);}

  function paint(ctx,view,state){
    const {w,h}=view,ship=flight.position(state),mapW=active?w-Math.min(300,w*.36):w;
    if(!ship)return;
    lastState=state;
    if(active&&performance.now()-lastRefresh>1000){lastRefresh=performance.now();refresh(state);}
    const fleet=allShips(state),bySystem=new Map();
    for(const vessel of fleet)if(vessel.phase!=='warp'||!vessel.destinationSystem){const group=bySystem.get(vessel.system)||[];group.push(vessel);bySystem.set(vessel.system,group);}
    const target=flight.guidance(state),destination=target&&flight.planetPosition(target.id);
    const points=[...systems.map(entry=>entry.position),ship];
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
    const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const marginX=Math.max(36,Math.min(76,mapW*.09)),marginY=Math.max(52,Math.min(78,h*.13));
    const scale=Math.min((mapW-marginX*2)/Math.max(1,maxX-minX),(h-marginY*2)/Math.max(1,maxY-minY));
    const left=(mapW-(maxX-minX)*scale)/2,top=(h-(maxY-minY)*scale)/2;
    const screen=p=>({x:left+(p.x-minX)*scale,y:top+(p.y-minY)*scale});
    const background=ctx.createRadialGradient(mapW*.48,h*.45,10,mapW*.48,h*.45,Math.max(mapW,h)*.7);
    background.addColorStop(0,'#103044');background.addColorStop(.6,'#071a2a');background.addColorStop(1,'#030a13');
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
    ctx.save();
    ctx.strokeStyle='rgba(98,163,187,.12)';ctx.lineWidth=1;
    for(let i=0;i<=10;i++){
      const x=marginX+(mapW-marginX*2)*i/10,y=marginY+(h-marginY*2)*i/10;
      ctx.beginPath();ctx.moveTo(x,marginY);ctx.lineTo(x,h-marginY);ctx.moveTo(marginX,y);ctx.lineTo(w-marginX,y);ctx.stroke();
    }
    if(destination){
      const a=screen(ship),b=screen(destination);
      ctx.strokeStyle='rgba(110,237,229,.8)';ctx.lineWidth=1.6;ctx.setLineDash([6,5]);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
    }
    for(const {system,position} of systems){
      const p=screen(position),current=system.id===state.system,tracked=system.id===target?.id;
      ctx.beginPath();ctx.arc(p.x,p.y,tracked?5:current?4:2.6,0,Math.PI*2);
      ctx.fillStyle=tracked?'#f4d783':current?'#9af3dc':'#88bfd2';ctx.fill();
      if(current||tracked){ctx.beginPath();ctx.arc(p.x,p.y,tracked?9:7,0,Math.PI*2);ctx.strokeStyle=tracked?'#f4d7839c':'#9af3dc9c';ctx.lineWidth=1;ctx.stroke();}
    }
    mapHits=systems.map(({system,position})=>({id:system.id,...screen(position)}));
    for(const {system,position} of systems){
      const vessels=bySystem.get(system.id)||[],p=screen(position);
      vessels.forEach((vessel,index)=>{
        const angle=index*2.399963,radius=8+Math.sqrt(index)*2.5;
        ctx.beginPath();ctx.arc(p.x+Math.cos(angle)*radius,p.y+Math.sin(angle)*radius,2.1,0,Math.PI*2);
        ctx.fillStyle=vessel.phase==='disabled'||vessel.phase==='destroyed'?'#8b929d':vessel.kind==='tug'?'#69e4a8':'#61bde9';ctx.fill();
      });
      if(vessels.length){ctx.fillStyle='#e8f8ff';ctx.font='700 9px system-ui';ctx.fillText(String(vessels.length),p.x+10,p.y-8);}
    }
    for(const vessel of fleet){
      if(vessel.phase!=='warp'||!vessel.destinationSystem)continue;
      const origin=systems.find(entry=>entry.system.id===vessel.system)?.position,dest=systems.find(entry=>entry.system.id===vessel.destinationSystem)?.position;
      if(!origin||!dest)continue;
      const progress=Math.max(.05,Math.min(.95,1-(Number(vessel.timer)||0)/(Number(vessel.warpDuration)||18))),a=screen(origin),b=screen(dest);
      ctx.beginPath();ctx.arc(a.x+(b.x-a.x)*progress,a.y+(b.y-a.y)*progress,3,0,Math.PI*2);ctx.fillStyle='#ffd978';ctx.fill();
    }
    const occupied=[];
    const order=[...systems].sort((a,b)=>{
      const priority=entry=>entry.system.id===target?.id?2:entry.system.id===state.system?1:0;
      return priority(b)-priority(a);
    });
    ctx.font=`${w<650?9:10}px system-ui`;
    for(const {system,position} of order){
      const p=screen(position),name=system.name,width=ctx.measureText(name).width,height=12;
      const candidates=[[p.x+8,p.y-4],[p.x+8,p.y+13],[p.x-width-8,p.y-4],[p.x-width-8,p.y+13]];
      const candidate=candidates.find(([x,y])=>x>=5&&x+width<=mapW-5&&y-height>=46&&y<h-20&&!occupied.some(box=>x<box.x+box.w&&x+width>box.x&&y-height<box.y+box.h&&y>box.y));
      if(!candidate)continue;
      const [x,y]=candidate;occupied.push({x:x-2,y:y-height-1,w:width+4,h:height+3});
      ctx.lineWidth=2.5;ctx.strokeStyle='#061522';ctx.strokeText(name,x,y);
      ctx.fillStyle=system.id===target?.id?'#f9e4a2':system.id===state.system?'#b7ffeb':'#bfd6e2';ctx.fillText(name,x,y);
    }
    const player=screen(ship);
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate((Number(state.angle)||0)+Math.PI/2);
    ctx.shadowColor='#a2fff0';ctx.shadowBlur=12;ctx.fillStyle='#eafffb';ctx.strokeStyle='#052d37';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(6,7);ctx.lineTo(0,3);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.font='700 11px system-ui';ctx.fillStyle='#d4fff4';ctx.strokeStyle='#061522';ctx.lineWidth=3;
    ctx.strokeText('YOU',player.x+9,player.y-10);ctx.fillText('YOU',player.x+9,player.y-10);
    ctx.restore();
    ctx.fillStyle='#e4f8ff';ctx.font='600 16px system-ui';ctx.fillText('GALAXY VIEW',18,25);
    ctx.fillStyle='#90bbca';ctx.font='11px system-ui';ctx.fillText(`${systems.length} SYSTEMS · ${fleet.length} SHIPS · CLICK A SYSTEM`,18,43);
    if(target){ctx.fillStyle='#e5dbad';ctx.fillText(`TRACKING ${target.name.toUpperCase()} · ${Math.round(target.distance).toLocaleString()} u`,18,h-18);}
    else{ctx.fillStyle='#a3cbd8';ctx.fillText('Select a destination on the interstellar map to show its route.',18,h-18);}
  }
  window.nativeGalaxyOverview={paint,setActive};
})();
