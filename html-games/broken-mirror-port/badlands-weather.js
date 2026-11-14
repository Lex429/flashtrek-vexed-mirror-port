/* World-authored Badlands weather, generated locally from stable cell IDs.
   Sampling is pure: motion/damage, simulation time and rendering keep their owners. */
(() => {
  'use strict';
  const root=typeof window==='undefined'?self:window,cellX=700,cellY=650,weatherX=1000,weatherY=800;
  const cells=new Map(),queries=new Map(),events=new Map(),limit=128;
  const hash=n=>{let x=Math.imul(n+1171,374761393);x=Math.imul(x^(x>>>13),1274126177);return ((x^(x>>>16))>>>0)/4294967296;};
  const seed=(x,y)=>Math.imul(x,73856093)^Math.imul(y,19349663);
  function retain(map,key,value){map.set(key,value);if(map.size>limit)map.delete(map.keys().next().value);return value;}
  function frame(state,system=state?.system){
    const home=root.nativeManualFlight?.anchor?.(73),origin=root.nativeManualFlight?.anchor?.(system),b=root.nativeBadlands?.boundary;
    return home&&origin&&b?{x:home.x-origin.x,y:home.y-origin.y,rx:b.rx,ry:b.ry,system}:null;
  }
  function bounds(view,pad=0){const z=view.zoom||1;return {minX:view.cameraX-view.w/z/2-pad,minY:view.cameraY-view.h/z/2-pad,maxX:view.cameraX+view.w/z/2+pad,maxY:view.cameraY+view.h/z/2+pad};}
  function inside(f,x,y,pad=0){return Math.hypot((Math.abs(x)+pad)/f.rx,(Math.abs(y)+pad)/f.ry)<.997;}
  function range(f,box,pitchX,pitchY,pad=0){
    let left=box.minX-f.x-pad,right=box.maxX-f.x+pad,top=box.minY-f.y-pad,bottom=box.maxY-f.y+pad;
    if(right< -f.rx||left>f.rx||bottom< -f.ry||top>f.ry)return null;
    // Large-map inspection cannot materialize a whole region's hazard registry.
    if(right-left>6000){const c=(left+right)/2;left=c-3000;right=c+3000;}
    if(bottom-top>6000){const c=(top+bottom)/2;top=c-3000;bottom=c+3000;}
    return {x0:Math.floor(Math.max(-f.rx,left)/pitchX),x1:Math.floor(Math.min(f.rx,right)/pitchX),y0:Math.floor(Math.max(-f.ry,top)/pitchY),y1:Math.floor(Math.min(f.ry,bottom)/pitchY)};
  }
  function vortices(state,box,system=state?.system){
    const f=frame(state,system);if(!f)return [];
    if(!box){const p=system===1?root.vexedSolFlight?.shipPosition?.(state)||state:state;box={minX:(p.x||0)-650,maxX:(p.x||0)+650,minY:(p.y||0)-500,maxY:(p.y||0)+500};}
    const r=range(f,box,cellX,cellY,145);if(!r)return [];
    const key=[f.x,f.y,f.rx,f.ry,r.x0,r.x1,r.y0,r.y1].join(':');if(queries.has(key))return queries.get(key);
    const list=[];
    for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){
      const id=x+':'+y;let v=cells.get(id);
      if(!v){const s=seed(x,y),px=(x+.5+(hash(s)-.5)*.55)*cellX,py=(y+.5+(hash(s+1)-.5)*.55)*cellY;
        v=Object.freeze({id:'badlands-vortex:'+id,x:px,y:py,radius:64+hash(s+2)*34,direction:hash(s+3)>.5?1:-1,phase:hash(s+4)*Math.PI*2,strength:.85+hash(s+5)*.35});retain(cells,id,v);}
      if(inside(f,v.x,v.y,145))list.push(Object.freeze({...v,x:v.x+f.x,y:v.y+f.y}));
    }
    return retain(queries,key,Object.freeze(list));
  }
  function blueprint(kind,x,y,cycle){
    const key=kind+':'+x+':'+y+':'+cycle;if(events.has(key))return events.get(key);
    const s=seed(x,y)^Math.imul(cycle,83492791),px=(x+.5+(hash(s)-.5)*.6)*weatherX,py=(y+.5+(hash(s+1)-.5)*.6)*weatherY,angle=hash(s+2)*Math.PI*2;
    const list=[];
    if(kind==='heat'){
      list.push(Object.freeze({id:'badlands-heat:'+x+':'+y+':'+cycle,born:cycle*24+hash(s+3)*8,x:px,y:py,halfWidth:190,halfHeight:124,angle,phase:hash(s+4)*Math.PI*2,duration:13+hash(s+5)*5,driftX:Math.cos(angle)*3.5,driftY:Math.sin(angle)*3.5}));
    }else{
      const activity=hash(s+6),count=activity<.24?1:activity<.58?2+Math.floor(hash(s+7)*2):4+Math.floor(hash(s+7)*3);let born=cycle*18+1+hash(s+3)*5;
      for(let i=0;i<count;i++){
        const k=hash(s+i*17+8)<.44?'sheet':'branch',rotation=angle+hash(s+i*17+9)*.5;
        const ex=px+(hash(s+i*17+10)-.5)*180,ey=py+(hash(s+i*17+11)-.5)*140;
        list.push(Object.freeze({id:'badlands-lightning:'+x+':'+y+':'+cycle+':'+i,kind:k,born,x:ex,y:ey,radius:k==='sheet'?110:160,rotation,recipe:(s+i>>>0)%6,depth:.84+hash(s+i+12)*.16,
          sheet:k==='sheet'?Object.freeze({x:ex,y:ey,c:Math.cos(rotation),s:Math.sin(rotation),halfWidth:420,halfHeight:250,strength:0}):null}));
        born+=.16+Math.pow(hash(s+i*17+13),1.7)*.68;
      }
    }return retain(events,key,Object.freeze(list));
  }
  function select(kind,state,view,seconds){
    const f=frame(state);if(!f||!view)return [];
    const box=bounds(view),r=range(f,box,weatherX,weatherY,kind==='heat'?250:450);if(!r)return [];
    const period=kind==='heat'?24:18,cycle=Math.floor(seconds/period),list=[];
    for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++)for(let c=cycle-1;c<=cycle;c++)for(const e of blueprint(kind,x,y,c)){
      const age=seconds-e.born;if(age<0||age>=(kind==='heat'?e.duration:.92)||!inside(f,e.x,e.y,200))continue;
      const ex=e.x+f.x+(e.driftX||0)*age,ey=e.y+f.y+(e.driftY||0)*age,pad=kind==='heat'?250:e.sheet?450:170;
      if(ex+pad<box.minX||ex-pad>box.maxX||ey+pad<box.minY||ey-pad>box.maxY)continue;
      list.push({...e,x:ex,y:ey,...(e.sheet?{sheet:{...e.sheet,x:ex,y:ey}}:{})});
    }
    list.sort((a,b)=>Math.hypot(a.x-view.cameraX,a.y-view.cameraY)-Math.hypot(b.x-view.cameraX,b.y-view.cameraY)||String(a.id).localeCompare(String(b.id)));
    return list.slice(0,3);
  }
  function localize(list,origin){return list.map(e=>({...e,x:e.x-origin.x,y:e.y-origin.y,...(e.sheet?{sheet:{...e.sheet,x:e.sheet.x-origin.x,y:e.sheet.y-origin.y}}:{})}));}
  root.nativeBadlandsWeather=Object.freeze({frame,bounds,vortices,localize,lightning:(state,view,seconds)=>select('lightning',state,view,seconds),heat:(state,view,seconds)=>select('heat',state,view,seconds),
    metrics:()=>({cachedCells:cells.size,cachedQueries:queries.size,cachedEvents:events.size,limit}),limits:Object.freeze({radius:98,weather:3,cellX,cellY})});
})();
