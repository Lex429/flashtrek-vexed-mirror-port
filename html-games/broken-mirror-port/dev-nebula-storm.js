/* Intracloud lightning. Shared fog retains material and hull ownership. */
(() => {
  'use strict';
  const limit=3,size=256,recipes=6,lifetime=.92;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const hash=n=>{let x=Math.imul(n+7919,374761393);x=Math.imul(x^(x>>>13),1274126177);return ((x^(x>>>16))>>>0)/4294967296;};
  const pulse=(t,at,width)=>Math.exp(-Math.pow((t-at)/width,2));
  function envelope(age){
    if(age<0||age>=lifetime)return {glow:0,bolt:0};
    return {glow:clamp(.68*pulse(age,.075,.045)+pulse(age,.205,.07)+.30*pulse(age,.36,.19)),
      bolt:clamp(.7*pulse(age,.075,.019)+pulse(age,.205,.027))};
  }
  function sheetEnvelope(age){const e=envelope(age);return {glow:age>=0&&age<lifetime?clamp(.92*pulse(age,.17,.12)+.25*pulse(age,.43,.18)):0,bolt:e.bolt};}
  function sheetStrength(sheets,x,y){let strength=0;for(const e of sheets){const dx=x-e.x,dy=y-e.y,qx=(dx*e.c+dy*e.s)/e.halfWidth,qy=(-dx*e.s+dy*e.c)/e.halfHeight,r=qx*qx+qy*qy;
    if(r>=1)continue;const t=clamp((r-.05)/.95);strength=Math.max(strength,(1-t*t*(3-2*t))*e.strength);}return strength;}
  function createModel({production=false}={}){
    if(production)return createProductionModel();
    let owner=null,signature='',patch=null,available=false,enabled=true,visible=false,clock=0,nextAt=2.4,sequence=0,pending=0,pendingSheets=0,events=[],weatherSequence=0,burstRemaining=0,sheetAnchor=null;
    const sheets=[];
    function reset(){owner=null;signature='';patch=null;available=visible=false;clock=sequence=pending=pendingSheets=weatherSequence=burstRemaining=0;nextAt=2.4;events=[];sheets.length=0;sheetAnchor=null;}
    function configure(state,nextPatch,allowed){
      const key=nextPatch?[nextPatch.x,nextPatch.y,nextPatch.width,nextPatch.height,nextPatch.angle].join(':'):'';
      if(owner!==state||key!==signature){reset();owner=state;signature=key;patch=nextPatch&&{...nextPatch};}
      available=!!allowed&&!!patch&&!!state?.devMode&&Number(state.system)===1;
      if(!available){events=[];pending=pendingSheets=0;visible=false;}
    }
    function emit(kind='branch',anchor=null){
      if(events.length>=limit)return false;
      const seed=++sequence*37,u=(hash(seed)-.5)*patch.width*.58,v=(hash(seed+1)-.5)*patch.height*.55,c=Math.cos(patch.angle),s=Math.sin(patch.angle);
      const x=anchor?.x??patch.x+u*c-v*s,y=anchor?.y??patch.y+u*s+v*c,rotation=hash(seed+3)*Math.PI*2;
      events.push({id:sequence,kind,born:clock,x,y,radius:Math.min(kind==='sheet'?110:160,Math.min(patch.width,patch.height)*(.21+hash(seed+2)*.14)),
        rotation,recipe:sequence%recipes,depth:.84+hash(seed+4)*.16,
        sheet:kind==='sheet'?{x,y,c:Math.cos(rotation),s:Math.sin(rotation),halfWidth:Math.min(420,patch.width*.28),halfHeight:Math.min(250,patch.height*.20),strength:0}:null});return true;
    }
    function frame(state,dt,view,current){
      configure(state,current.patch,!!current.eligible&&current.enabled&&current.preset==='badlands');
      visible=available&&enabled&&!view.hidden&&!view.reducedMotion;
      if(!visible||view.suspended||!(dt>0))return;
      clock+=dt;events=events.filter(e=>clock-e.born<lifetime);
      while(pending+pendingSheets>0&&events.length<limit){if(pendingSheets){pendingSheets--;emit('sheet',sheetAnchor);}else{pending--;emit();}}
      if(clock>=nextAt){
        const seed=++weatherSequence*101;
        if(!burstRemaining){const activity=hash(seed+5);burstRemaining=activity<.24?1:activity<.58?2+Math.floor(hash(seed+6)*2):4+Math.floor(hash(seed+6)*4);}
        emit(hash(seed+9)<.44?'sheet':'branch');burstRemaining--;
        nextAt=clock+(burstRemaining ? .16+Math.pow(hash(seed+7),1.7)*.68 : 3.2+hash(seed+8)*11.8);
      }
    }
    function trigger(state,current,kind='branch',anchor=null){
      configure(state,current.patch,!!current.eligible&&current.enabled&&current.preset==='badlands');
      if(!available||!enabled||pending+pendingSheets+events.length>=limit)return false;
      if(kind==='sheet'){pendingSheets++;sheetAnchor=anchor&&{x:anchor.x,y:anchor.y};}else pending++;return true;
    }
    function setEnabled(value){enabled=!!value;if(!enabled){events=[];pending=pendingSheets=0;visible=false;}burstRemaining=0;nextAt=clock+2.4;}
    function material(){sheets.length=0;if(visible)for(const e of events)if(e.sheet){e.sheet.strength=sheetEnvelope(clock-e.born).glow*e.depth;sheets.push(e.sheet);}return sheets;}
    function snapshot(){return {enabled,available,visible,clock,nextAt,pending:pending+pendingSheets,limit,burstRemaining,emitted:sequence,
      flashes:events.map(e=>({...e,sheet:e.sheet&&{...e.sheet},age:clock-e.born,...(e.kind==='sheet'?sheetEnvelope:envelope)(clock-e.born)}))};}
    return Object.freeze({frame,trigger,setEnabled,reset,snapshot,material});
  }
  function createProductionModel(){
    let clock=0,available=false,visible=false,enabled=true,events=[];
    const sheets=[];
    function snapshot(){return {production:true,enabled,available,visible,clock,pending:0,limit,emitted:events.length,
      flashes:events.map(e=>({...e,sheet:e.sheet&&{...e.sheet},age:clock-e.born,...(e.kind==='sheet'?sheetEnvelope:envelope)(clock-e.born)}))};}
    return Object.freeze({frame(state,dt,view,current){
      available=!!current?.badlandsWeather&&!!window.nativeBadlandsWeather;
      visible=available&&enabled&&!view.hidden&&!view.reducedMotion;clock=Number(state?.shipSimulation?.seconds)||0;
      events=visible?window.nativeBadlandsWeather.lightning(state,view,clock):[];
    },snapshot,trigger:()=>false,setEnabled(value){enabled=!!value;if(!enabled){events=[];visible=false;}},reset(){events=[];sheets.length=0;available=visible=false;clock=0;},
      material(){sheets.length=0;if(visible)for(const e of events)if(e.sheet){e.sheet.strength=sheetEnvelope(clock-e.born).glow*e.depth;sheets.push(e.sheet);}return sheets;}});
  }
  function createRenderer(options={}){
    const model=createModel(options);let art=null,light=null,view=null;
    const stats={canvases:0,textureBytes:0,draws:0,culled:0,paintMs:0};
    const canvas=(side=size)=>{const c=document.createElement('canvas');c.width=c.height=side;stats.canvases++;stats.textureBytes+=side*side*4;return c;};
    function prepare(){
      if(art)return;
      art=Array.from({length:recipes},(_,i)=>{
        const glow=canvas(),bolt=canvas(),g=glow.getContext('2d'),b=bolt.getContext('2d');
        for(let lobe=0;lobe<5;lobe++){
          const seed=i*47+lobe*11,x=128+(hash(seed)-.5)*92,y=128+(hash(seed+1)-.5)*88,r=64+hash(seed+2)*58;
          const gradient=g.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'rgba(255,255,255,1)');
          gradient.addColorStop(.32,'rgba(255,255,255,.98)');gradient.addColorStop(.66,'rgba(255,255,255,.50)');gradient.addColorStop(1,'rgba(255,255,255,0)');
          g.fillStyle=gradient;g.fillRect(0,0,size,size);
        }
        const edge=g.createRadialGradient(128,128,0,128,128,125);edge.addColorStop(0,'#fff');edge.addColorStop(.65,'#fff');edge.addColorStop(1,'rgba(255,255,255,0)');
        g.globalCompositeOperation='destination-in';g.fillStyle=edge;g.fillRect(0,0,size,size);g.globalCompositeOperation='source-over';
        const points=[];
        for(let step=0;step<=12;step++)points.push({x:43+step*14,y:128+(hash(i*97+step)-.5)*48});
        const path=()=>{b.beginPath();b.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))b.lineTo(p.x,p.y);
          for(const index of [4,8]){const p=points[index],sign=index===4?-1:1;b.moveTo(p.x,p.y);b.lineTo(p.x+11,p.y+sign*20);b.lineTo(p.x+24,p.y+sign*25);b.lineTo(p.x+31,p.y+sign*42);}};
        b.lineCap=b.lineJoin='round';
        for(const [width,colour]of [[9,'rgba(225,235,255,.16)'],[4,'rgba(245,248,255,.44)'],[1.3,'rgba(255,255,255,1)']]){path();b.lineWidth=width;b.strokeStyle=colour;b.stroke();}
        return {glow,bolt};
      });
      light=canvas(1);
    }
    function paint(ctx,pass,paintCloud){
      const state=model.snapshot();if(!state.visible||!state.flashes.length||!view){paintCloud(ctx,pass);return;}
      const started=performance.now(),zoom=view.zoom||1,regions=[];
      for(const flash of state.flashes){
        const cx=view.w/2+(flash.x-view.cameraX)*zoom,cy=view.h/2+(flash.y-view.cameraY)*zoom,radius=flash.radius*zoom;
        const x=Math.floor(cx-radius),y=Math.floor(cy-radius),width=Math.ceil(cx+radius)-x,height=Math.ceil(cy+radius)-y;
        if(x+width<0||y+height<0||x>view.w||y>view.h){stats.culled++;continue;}
        if(flash.glow<.002&&flash.bolt<.002)continue;
        regions.push({flash,cx,cy,radius});
      }
      if(!regions.length){paintCloud(ctx,pass);return;}
      prepare();
      // Tint one continuous copy of the optical layer. Cutting out and replacing
      // individual rectangles antialiases their clip edges twice at fractional
      // game scales, exposing dark square seams. Preserve the original alpha,
      // including every hull/wake opening, with source-atop on this shared copy.
      const scale=Math.min(1,1600/view.w,1000/view.h),rw=Math.round(view.w*scale),rh=Math.round(view.h*scale);
      if(light.width!==rw||light.height!==rh){stats.textureBytes+=(rw*rh-light.width*light.height)*4;light.width=rw;light.height=rh;}
      const g=light.getContext('2d');g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;g.clearRect(0,0,rw,rh);
      g.save();g.scale(rw/view.w,rh/view.h);g.save();paintCloud(g,pass);g.restore();g.globalCompositeOperation='source-atop';
      for(const r of regions){
        const f=r.flash;g.save();g.translate(r.cx,r.cy);g.rotate(f.rotation);g.globalAlpha=f.glow*f.depth;
        g.drawImage(art[f.recipe].glow,-r.radius,-r.radius,r.radius*2,r.radius*2);
        if(pass==='back'){g.globalAlpha=f.bolt;g.drawImage(art[f.recipe].bolt,-r.radius,-r.radius,r.radius*2,r.radius*2);}g.restore();
      }
      g.restore();ctx.drawImage(light,0,0,rw,rh,0,0,view.w,view.h);stats.draws++;
      stats.paintMs+=performance.now()-started;
    }
    return Object.freeze({prepare,paint,frame(state,dt,nextView,current){view=nextView;model.frame(state,dt,nextView,current);},
      trigger:(state,current)=>model.trigger(state,current),setEnabled:model.setEnabled,reset:model.reset,
      triggerSheet:(state,current)=>model.trigger(state,current,'sheet',view&&{x:view.cameraX,y:view.cameraY}),material:model.material,
      snapshot:()=>({...model.snapshot(),renderer:{...stats},reference:options.production?'badlands-world-cloud-layers':'dev-cloud-layers'})});
  }
  window.nativeDevNebulaStorm=Object.freeze({createModel,createRenderer,envelope,sheetEnvelope,sheetStrength,limits:Object.freeze({flashes:limit,recipes,size,lifetime})});
})();
