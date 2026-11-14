/* Shared construction plans. Sampling is pure; the game clock owns completion. */
(() => {
  'use strict';
  const clamp = n => Math.max(0, Math.min(1, n));
  const phases = Object.freeze([
    {id:'prepare', name:'Preparing assembly berth', end:.06},
    {id:'frame', name:'Assembling structural frame', end:.30},
    {id:'components', name:'Installing major components', end:.52},
    {id:'plating', name:'Welding hull plating', end:.86},
    {id:'power', name:'Testing power and engines', end:.94},
    {id:'launch', name:'Releasing clamps and launching', end:1}
  ].map(Object.freeze));
  function family(ship) {
    const name=String(ship.name||'').toLowerCase();
    if(/cube|borg/.test(name))return 'cube';
    if(/bird|warbird|der.idex|norexan|romulan|reman|warhawk/.test(name))return 'warbird';
    if(/b.rel|k.tinga|k.vort|neg.var|vorcha|qonos|klingon/.test(name))return 'winged';
    if(/galor|keldon|hideki|behemoth|cardass/.test(name))return 'spine';
    if(/sail|bajoran/.test(name))return 'sail';
    if(/jem.hadar|dominion|marauder|corsair|ravager|dart/.test(name))return 'winged';
    if(/shuttle|runabout|flyer|saber|defiant|fighter|scout|tug|freight|caravan/.test(name))return 'compact';
    if(/c.thia|vulcan|warpship|explorer/.test(name))return 'ring';
    return 'nacelles';
  }
  const names={
    nacelles:['Engineering hull','Saucer assembly','Port nacelle','Starboard nacelle','Connecting pylons'],
    warbird:['Central hull','Forward command section','Port wing','Starboard wing','Engine assemblies'],
    winged:['Central hull','Forward section','Port wing','Starboard wing','Engine assemblies'],
    spine:['Structural spine','Command section','Port hull','Starboard hull','Drive section'],
    compact:['Core frame','Forward hull','Port assembly','Starboard assembly','Drive section'],
    cube:['Central lattice','Forward lattice','Port lattice','Starboard lattice','Outer systems'],
    sail:['Central hull','Forward rigging','Port sail','Starboard sail','Drive and rigging'],
    ring:['Central hull','Command section','Port ring','Starboard ring','Drive section']
  };
  function profile(ship) {
    const kind=family(ship),mass=Math.max(1,Number(ship.massClass)||1);
    return Object.freeze({id:Number(ship.id),name:String(ship.name),family:kind,
      seconds:Math.round(36+mass*9),parts:Object.freeze(names[kind].map((name,index)=>Object.freeze({name,index,
        start:.25+index*.043,end:.39+index*.043,dx:index===2?-.32:index===3?.32:0,dy:index===1?-.24:index===4?.26:0}))),
      berth:kind==='compact'?'Lower internal assembly berth':'Main internal assembly berth'});
  }
  function component(plan,x,y) {
    if(plan.family==='cube')return y<.26?1:x<.28?2:x>.72?3:y>.76?4:0;
    if(plan.family==='nacelles')return y<.43?1:x<.23?2:x>.77?3:x>.37&&x<.63?0:4;
    if(plan.family==='compact')return y<.3?1:y>.76?4:x<.3?2:x>.7?3:0;
    return y<.28?1:y>.8?4:x<.35?2:x>.65?3:0;
  }
  function sample(plan,seconds) {
    const progress=clamp(Math.max(0,Number(seconds)||0)/plan.seconds);
    const phase=phases.find(p=>progress<p.end)||phases.at(-1);
    return {progress,phase:progress===1?'complete':phase.id,label:progress===1?'Construction complete':phase.name,
      frame:clamp((progress-.06)/.24),plating:clamp((progress-.52)/.34),power:clamp((progress-.86)/.08),
      launch:clamp((progress-.94)/.06),parts:plan.parts.map(p=>clamp((progress-p.start)/(p.end-p.start))),
      remaining:Math.max(0,plan.seconds-Math.max(0,Number(seconds)||0))};
  }
  const smooth=n=>{const t=clamp(n);return t*t*t*(t*(t*6-15)+10);};
  const berth=plan=>({u:.5,v:plan.family==='compact'?.73:.40});
  function release(plan,height,span,progress){
    const t=clamp(progress),distance=span*1421/1107*.65+height*.65;
    return {x:0,y:distance*smooth(t),rotation:Math.PI/2*smooth((t-.68)/.32)};
  }
  function blueprint(plan,{width:w,height:h,rgba}){
    const tile=Math.max(18,Math.ceil(Math.max(w,h)/10)),panels=[],frames=[],machines=[],byCell=new Map();
    const opaque=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&rgba[(Math.floor(y)*w+Math.floor(x))*4+3]>16;
    const near=(points,x,y)=>points.reduce((best,p)=>!best||Math.hypot(p.x-x,p.y-y)<Math.hypot(best.x-x,best.y-y)?p:best,null);
    for(let top=0,row=0;top<h;top+=tile,row++)for(let left=0,col=0;left<w;left+=tile,col++){
      const right=Math.min(w,left+tile),bottom=Math.min(h,top+tile),points=[];let sx=0,sy=0;
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(opaque(x,y)){points.push({x,y});sx+=x;sy+=y;}
      if(!points.length)continue;
      const center=near(points,sx/points.length,sy/points.length),seam=[center,
        near(points,center.x,top),near(points,right-1,center.y),near(points,center.x,bottom-1),near(points,left,center.y),center];
      const panel={kind:'panel',name:'Hull plate',row,col,left,top,width:right-left,height:bottom-top,
        x:center.x,y:center.y,part:component(plan,center.x/w,center.y/h),pixels:points.length,seam};
      panels.push(panel);byCell.set(row+':'+col,panel);
    }
    function beam(a,b){
      const length=Math.hypot(b.x-a.x,b.y-a.y);if(length<4||length>tile*1.7)return;
      let supported=0;for(let i=0;i<=12;i++)if(opaque(a.x+(b.x-a.x)*i/12,a.y+(b.y-a.y)*i/12))supported++;
      if(supported<9)return;
      frames.push({kind:'beam',name:'Structural beam',a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},
        x:(a.x+b.x)/2,y:(a.y+b.y)/2,part:a.part,width:Math.max(2,tile*.085),seam:[a,b]});
    }
    for(const p of panels){
      for(const [dr,dc] of [[1,0],[0,1]]){const other=byCell.get((p.row+dr)+':'+(p.col+dc));if(other)beam(p,other);}
      // Each disconnected hull assembly receives actual local ribs before fitting.
      if(!frames.some(b=>Math.hypot(b.x-p.x,b.y-p.y)<tile)){
        const half=tile*.22;let a={x:p.x-half,y:p.y,part:p.part},b={x:p.x+half,y:p.y};
        while(!opaque(a.x,a.y)&&a.x<p.x-1)a.x++;while(!opaque(b.x,b.y)&&b.x>p.x+1)b.x--;beam(a,b);
      }
    }
    const priority=[0,4,1,2,3],rank=p=>priority.indexOf(p.part)*w*h+Math.hypot(p.x-w/2,p.y-h*.6)*h;
    panels.sort((a,b)=>rank(a)-rank(b));frames.sort((a,b)=>rank(a)-rank(b));
    for(let i=0;i<panels.length;i+=3){const p=panels[i];machines.push({kind:'module',name:plan.parts[p.part].name+' systems',
      x:p.x,y:p.y,part:p.part,width:Math.min(tile*.62,p.width*.75),height:Math.min(tile*.52,p.height*.75),seam:[{x:p.x,y:p.y},...p.seam.slice(1,4)]});}
    const chosen=frames.filter((_,i)=>i%Math.max(1,Math.ceil(frames.length/54))===0);
    const jobs=[],workers=6;
    function schedule(list,start,end){
      const slots=Math.max(1,Math.ceil(list.length/workers)),span=(end-start)/(slots+.18);
      list.forEach((piece,i)=>{const worker=i%workers,at=start+Math.floor(i/workers)*span+worker*span*.025;
        const path=piece.seam,weldPath=[];
        for(let step=0;step<=48;step++){
          const q=step/48*(path.length-1),a=path[Math.floor(q)],b=path[Math.min(path.length-1,Math.floor(q)+1)],t=q-Math.floor(q);
          let x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
          if(!opaque(x,y)){
            let found=false;for(let r=1;r<=tile&&!found;r++)for(let i=0;i<16;i++){
              const u=x+Math.cos(i*Math.PI/8)*r,v=y+Math.sin(i*Math.PI/8)*r;if(opaque(u,v)){x=u;y=v;found=true;break;}}
          }
          weldPath.push({x,y});
        }
        jobs.push({...piece,weldPath,id:jobs.length,worker,start:at,finish:at+span*.96,pickup:at+span*.20,arrival:at+span*.66});});
    }
    schedule(chosen,.06,.30);schedule(machines,.30,.52);schedule(panels,.52,.86);
    return {version:2,width:w,height:h,tile,workers,jobs,
      counts:{beams:chosen.length,modules:machines.length,plates:panels.length},
      lanes:Array.from({length:workers},(_,i)=>jobs.filter(j=>j.worker===i)),alphaPixels:panels.reduce((n,p)=>n+p.pixels,0)};
  }
  function taskState(job,progress){
    if(progress<job.start)return {phase:'stored',installed:false,carried:false,delivery:0,weld:0};
    if(progress<job.pickup)return {phase:'pickup',installed:false,carried:false,delivery:0,weld:0};
    if(progress<job.arrival)return {phase:'delivery',installed:false,carried:true,delivery:smooth((progress-job.pickup)/(job.arrival-job.pickup)),weld:0};
    if(progress<job.finish)return {phase:'welding',installed:false,carried:false,delivery:1,weld:clamp((progress-job.arrival)/(job.finish-job.arrival))};
    return {phase:'installed',installed:true,carried:false,delivery:1,weld:1};
  }
  window.shipConstruction=Object.freeze({phases,profile,component,sample,clamp,smooth,berth,release,blueprint,taskState});
})();
