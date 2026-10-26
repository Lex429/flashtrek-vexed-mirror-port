/* Camera and painting only. The isolated campaign advances before this renderer. */
(() => {
  'use strict';
  const clamp=v=>Math.max(0,Math.min(1,v)),lerp=(a,b,t)=>a+(b-a)*t;
  function create(canvas){
    const ctx=canvas.getContext('2d',{alpha:false}),assets=new Map(),pictures=new Map(),worlds=new Map(),sky=window.vexedSpace.create();
    let gpu=null,effects=null,campaign=null,view=null,cut=null,preparation=null,generation=0,loaded=false,frames=0,lastFrameMs=0,skyId='',skyTime=0,pending=0,cameraCut='',focus=null,explosionQueue=[];
    const failures=[],visited=new Set(),shared={skyFrames:0,liveShips:0,cloakFrames:0,disabledFrames:0,destructionFrames:0,shieldSubmissions:0,weaponFrames:0};
    for(const system of window.VexedMirrorWorld.systems){
      const bodies=window.nativeSystemCatalog.bodies(system.id),home=window.nativeSystemCatalog.homeId(system.id),body=bodies.find(b=>b.id===home&&b.kind!=='star')||bodies.find(b=>b.kind==='planet');
      if(body)worlds.set(system.id,{...body,name:system.name,bodyName:body.name,population:Math.round((system.populationBillions||.01)*1e9)});
    }
    const worldIds=[1,2,25,12,30,31,38,50,57,87,8,16,22,7,46,63].filter(id=>worlds.has(id));
    const catalogWorlds=window.nativeSystemCatalog.records.reduce((n,s)=>n+s.bodies.filter(b=>['planet','dwarf-planet','moon'].includes(b.kind)).length,0);
    async function prepare(){
      if(preparation)return preparation;const ticket=++generation;
      preparation=(async()=>{
        await window.nativeEffectProfiles.ready;
        if(ticket!==generation)return;
        if(!gpu){const presentation=await window.createVexedShieldPresentation({space:canvas,radii:(d,size)=>window.nativeShipDefinitions.surfaceRadii(size,true,d.definition)});
          if(ticket!==generation){presentation.destroy();return;}gpu=presentation;gpu.canvas.id='opening-live-effects';}
        if(!campaign){campaign=window.nativeOpeningCampaign.create({effects:null,onExplosion:e=>explosionQueue.push(e),rockImage:r=>pictures.get('rock:'+r.file)});
          effects=window.nativeShipEffects.fork({isolated:true,blocked:()=>false,now:()=>campaign.visualTime*1000,gpu:()=>gpu,environment:campaign.environment,limits:{entries:24,bytes:384*1024*1024}});campaign.effects=effects;}
        let cursor=0;
        await Promise.all(Array.from({length:3},async()=>{
          while(cursor<window.nativeOpeningCampaign.types.length&&ticket===generation){const type=window.nativeOpeningCampaign.types[cursor++];if(assets.has(type))continue;
            pending++;try{const d=window.nativeShipDefinitions.get(type);assets.set(type,await window.vexedFlightAssets.loadShip(type,d.hull));}catch(e){failures.push(`Ship ${type}: ${e.message}`);}finally{pending--;}
          }
        }));
        if(ticket!==generation)return;
        for(const type of window.nativeOpeningCampaign.types){if(ticket!==generation)return;await effects.prepare(type,'civilian');}
        const load=async(key,url)=>{if(pictures.has(key))return;try{pictures.set(key,await window.vexedFlightAssets.loadImage(url));}catch(e){failures.push(`${key}: ${e.message}`);}};
        for(let i=0;i<worldIds.length;i+=3){if(ticket!==generation)return;await Promise.all(worldIds.slice(i,i+3).map(id=>load('world:'+id,worlds.get(id).art)));}
        const rocks=window.nativeSolAsteroids.placements.slice(0,3);
        await Promise.all([load('flash','startup/flash-trek.png'),load('title','startup/vexed-mirror.png'),...rocks.map((r,i)=>load('rock:'+i,'../flashtrek-broken-mirror/showcase-assets/'+r.file))]);
        if(ticket===generation)loaded=true;
      })();return preparation;
    }
    function resize(){const dpr=Math.min(devicePixelRatio||1,1.5,1920/innerWidth);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);}
    function advance(frame){
      if(!loaded)return;
      cut=window.nativeOpeningCampaign.shotAt(frame.manifest,frame.time);view=campaign.advance(cut,frame.reducedMotion);visited.add(cut.world);
      frame.location=cut.location;
    }
    function camera(frame){
      const p=cut.progress,motion=frame.reducedMotion?0:p;
      const key=cut.id+':'+cut.start;
      if(cameraCut!==key){cameraCut=key;
        const actor=cut.id==='war'?view.actors.find(a=>a.id==='film:imperial0'):view.actors.find(a=>a.shields>0&&effects.snapshot(campaign.describe(a)).flash)||view.actors[0];
        const death=campaign.snapshot().events.at(-1);focus=cut.view==='wreck'||cut.view==='aftermath'?{x:death?.x??actor?.x??650,y:death?.y??actor?.y??420}:actor?{id:actor.id,x:actor.x,y:actor.y}:null;
      }
      const live=focus?.id&&view.actors.find(a=>a.id===focus.id);if(live)Object.assign(focus,{x:live.x,y:live.y});
      let x=590+motion*22,y=395-motion*10,zoom=1.1+motion*.045;
      if(cut.view==='raid'){x=580+motion*110;y=390;zoom=1.13+motion*.08;}
      if(cut.view==='bombardment'){x=660+motion*60;y=475;zoom=1.03+motion*.1;}
      if(cut.view==='shield'){
        if(focus){x=focus.x+100;y=focus.y;zoom=1.62+motion*.12;}
      }
      if(['wreck','aftermath'].includes(cut.view)){
        x=focus?.x??650;y=focus?.y??420;zoom=cut.view==='wreck'?1.35:1.06;
      }
      if(cut.view==='gallery'){x=740+motion*70;y=450;zoom=.95+motion*.08;}
      if(cut.view==='resolve'){x=690;y=400;zoom=1.04+motion*.16;}
      return {x,y,zoom};
    }
    function paintPlanet(id,x,y,r,alpha=1){
      const art=pictures.get('world:'+id);if(!art)return;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(art,x-r,y-r,r*2,r*2);
      sky.planetHalo(ctx,{x,y,width:r*2,height:r*2},id);ctx.restore();
    }
    function paintWorlds(frame){
      if(cut.view==='gallery'){
        const id=worldIds.indexOf(cut.world),others=[worldIds[(id+3)%worldIds.length],worldIds[(id+7)%worldIds.length]];
        paintPlanet(cut.world,1180,820,440);paintPlanet(others[0],130,160,100,.8);paintPlanet(others[1],420,80,65,.65);
        ctx.font='11px system-ui';ctx.fillStyle='#c6c3bc';ctx.fillText(worlds.get(others[0]).name.toUpperCase(),35,290);ctx.fillText(worlds.get(others[1]).name.toUpperCase(),355,180);visited.add(others[0]);visited.add(others[1]);
      }else if(cut.view==='bombardment')paintPlanet(cut.world,935,920,500);
      else paintPlanet(cut.world,cut.kind==='founding'?1200:1200,960,cut.kind==='founding'?580:490,cut.kind==='aftermath'?.32:1);
      if(cut.kind==='resolve'){
        const neighbors=[12,7,31,30,50,57].filter(id=>pictures.has('world:'+id));
        neighbors.forEach((id,i)=>{paintPlanet(id,105+i*215,70,45,.7);visited.add(id);});
      }
    }
    function archive(frame){
      const population=worlds.get(cut.world)?.population||1e9,snapshot=campaign.snapshot();
      if(['raid','bombardment'].includes(cut.kind)){
        const casualties={18:12,7:8,47:80,10:160},deaths=snapshot.events.filter(e=>e.kind==='destruction'&&e.encounter===cut.id),loss=(view.planet?.damage||0)*1500000+deaths.reduce((n,e)=>n+(casualties[e.type]||200),0);
        const remaining=Math.max(Math.round(population*.7),population-Math.round(loss));
        ctx.save();ctx.fillStyle='#080c12b8';ctx.fillRect(1110,112,405,126);ctx.strokeStyle='#bfa07466';ctx.strokeRect(1110,112,405,126);
        ctx.font='10px system-ui';ctx.letterSpacing='2px';ctx.fillStyle='#c9b794';ctx.fillText('ANNEXATION · ARCHIVE ESTIMATE',1130,139);
        ctx.font='28px Georgia';ctx.letterSpacing='0px';ctx.fillStyle='#eee0c7';ctx.fillText(remaining.toLocaleString('en-US'),1130,177);
        ctx.font='11px system-ui';ctx.fillStyle='#e19578';ctx.fillText(`RESIDENT POPULATION   −${Math.round(loss).toLocaleString('en-US')}`,1130,204);
        ctx.fillStyle='#c5b7a4';ctx.fillText(`${deaths.length} VESSELS LOST · IMPERIAL CONTROL EXPANDING`,1130,224);ctx.restore();
      }
      ctx.font='10px system-ui';ctx.letterSpacing='2px';ctx.fillStyle='#afaa9d';ctx.fillText(`${window.nativeSystemCatalog.records.length} SYSTEMS · ${catalogWorlds} CATALOGUED WORLDS`,84,682);ctx.letterSpacing='0px';
      ctx.fillStyle='#c3a777';ctx.font='11px system-ui';ctx.letterSpacing='4px';ctx.fillText('HISTORICAL ARCHIVE',84,714);
      ctx.font='25px Georgia';ctx.letterSpacing='0px';ctx.fillStyle='#eee0c7';ctx.fillText(cut.view==='bombardment'?'THE PRICE OF SUBMISSION':frame.chapter,82,752);
      if(cut.kind==='raid'||cut.kind==='bombardment'){ctx.font='11px system-ui';ctx.fillStyle='#bdad90';ctx.fillText('I.S.S. ENTERPRISE NCC-1701 · IMPERIAL CAMPAIGN',84,777);}
    }
    function title(frame){
      const hits=frame.events.titleHits;for(const [i,[key,y,width]]of [['flash',330,640],['title',465,880]].entries()){
        ctx.globalAlpha=clamp((frame.time-hits[i])/.12);const art=pictures.get(key);if(art)ctx.drawImage(art,800-width/2,y-art.height/art.width*width/2,width,art.height/art.width*width);
      }
      ctx.globalAlpha=clamp((frame.time-hits[1]-.2)/.8);ctx.font='14px system-ui';ctx.textAlign='center';ctx.letterSpacing='6px';ctx.fillStyle='#c5b086';ctx.fillText('YOUR COMMAND AWAITS',800,610);ctx.textAlign='start';ctx.letterSpacing='0px';ctx.globalAlpha=1;
    }
    function draw(frame){
      const began=performance.now();frames++;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);if(!loaded||!view)return;
      const c=camera(frame),scale=Math.min(canvas.width/1600,canvas.height/900),ox=(canvas.width-1600*scale)/2,oy=(canvas.height-900*scale)/2;
      gpu?.beginFrame(ctx);ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.beginPath();ctx.rect(0,0,1600,900);ctx.clip();
      const skyTarget=frame.reducedMotion?2:cut.local;
      if(skyId!==cut.id||skyTarget<skyTime){sky.enterSystem(cut.world,true);skyId=cut.id;skyTime=0;}
      while(skyTime<skyTarget-.00001){const dt=Math.min(1/30,skyTarget-skyTime);sky.update(dt,{locx:-1.8,locy:-.22,speed:70});skyTime+=dt;}
      const project=a=>({x:800+(a.x-c.x)*c.zoom,y:450+(a.y-c.y)*c.zoom});
      const occluders=view.actors.filter(a=>(a.cloak||0)<.15).map(a=>{const p=project(a),d=campaign.describe(a),r=d.hullRadii;return {...p,width:a.dimensions.width*c.zoom,height:a.dimensions.height*c.zoom,contains(x,y){const angle=a.heading+Math.PI/2,dx=x-p.x,dy=y-p.y,cs=Math.cos(angle),sn=Math.sin(angle);return ((dx*cs+dy*sn)/(r.rx*c.zoom))**2+((-dx*sn+dy*cs)/(r.ry*c.zoom))**2<1;}};});
      sky.render(ctx,{w:1600,h:900,playerX:c.x,playerY:c.y,heading:.1,reducedMotion:frame.reducedMotion},occluders);shared.skyFrames++;
      ctx.save();ctx.translate(800,450);ctx.scale(c.zoom,c.zoom);ctx.translate(-c.x,-c.y);paintWorlds(frame);
      for(const rock of view.rocks){if(rock.hull<=0)continue;const art=pictures.get('rock:'+rock.file);if(art){ctx.save();ctx.translate(rock.x,rock.y);ctx.rotate((rock.id*.8)+(view.clock*.006));ctx.drawImage(art,-rock.size/2,-rock.size/2,rock.size,rock.size);ctx.restore();}}
      const star=sky.light,light=star?{...star,x:c.x+(star.x-800)/c.zoom,y:c.y+(star.y-450)/c.zoom}:null;
      for(const a of view.actors){const d=campaign.describe(a),cloak=a.cloak||0;ctx.save();ctx.globalAlpha=window.CinematicCloak.opacity(cloak,.018);
        const art=effects.asset(d)||assets.get(a.shipType);effects.paintShip(ctx,d,{x:a.x,y:a.y,dimensions:a.dimensions,asset:art,appearance:{light,lights:a.phase!=='disabled'&&cloak<.08,damage:true}});ctx.restore();shared.liveShips++;
        if(cloak>0&&cloak<1&&art){ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.heading+Math.PI/2);window.CinematicCloak.draw(ctx,art.art,a.dimensions.width,a.dimensions.height,cloak,view.clock*1000);ctx.restore();shared.cloakFrames++;}
        if(a.phase==='disabled')shared.disabledFrames++;
      }
      const movieView={state:view.state,ship:{x:0,y:0},cx:0,cy:0,w:1600,h:900,zoom:1};
      view.shots.paintAll(ctx,movieView);effects.paint(view.state,ctx,movieView);
      for(const burst of view.rockBursts)window.nativeAsteroidCombat.paintRockFragments(ctx,burst,view.visualTime*1000);
      if(view.planet)for(const p of view.planet.particles)window.showcaseHullBurst.draw(ctx,p,view.visualTime*1000);
      ctx.restore();
      const vignette=ctx.createRadialGradient(800,450,360,800,450,950);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#000b');ctx.fillStyle=vignette;ctx.fillRect(0,0,1600,900);
      if(cut.kind==='founding'){ctx.font='300 100px Georgia';ctx.fillStyle='#e5d5b5';ctx.fillText('2125',110,350);ctx.font='12px system-ui';ctx.letterSpacing='4px';ctx.fillStyle='#ac9e86';ctx.fillText('THE EARTH EMPIRE',116,387);ctx.letterSpacing='0px';}
      if(frame.title)title(frame);else archive(frame);
      const fade=frame.title?clamp((frame.time-frame.manifest.duration+1.4)/1.4):Math.min(1,cut.progress*12,(1-cut.progress)*14);
      ctx.fillStyle=`rgba(0,0,0,${frame.title?fade:1-fade})`;ctx.fillRect(0,0,1600,900);ctx.restore();
      if(gpu){gpu.endFrame(ctx,view.visualTime*1000);gpu.canvas.style.clipPath=`inset(${oy/canvas.height*innerHeight}px ${ox/canvas.width*innerWidth}px)`;gpu.canvas.style.opacity=String(frame.title?1:fade);}
      const stats=campaign.snapshot().stats;shared.shieldSubmissions=stats.shieldHits;shared.weaponFrames=stats.shots;shared.destructionFrames=stats.destroyed;
      lastFrameMs=performance.now()-began;
    }
    async function warm(manifest,needed){
      canvas.style.visibility='hidden';if(gpu)gpu.canvas.style.visibility='hidden';
      try{for(const time of [1,10,25,35,45,71,75,0]){if(!needed())return;const f=window.nativeOpeningStoryboard.sample(manifest,time);f.manifest=manifest;f.reducedMotion=false;advance(f);draw(f);await new Promise(r=>setTimeout(r,0));}}
      finally{canvas.style.visibility='';if(gpu)gpu.canvas.style.visibility='';campaign?.clear();view=null;skyId='';visited.clear();explosionQueue=[];}
    }
    resize();return {prepare,resize,advance,draw,warm,explosions(){const events=explosionQueue;explosionQueue=[];return events;},cancelPreparation(){generation++;preparation=null;},release(){campaign?.clear();gpu?.destroy();gpu=null;campaign=null;effects=null;loaded=false;view=null;skyId='';preparation=null;explosionQueue=[];},
      snapshot:()=>({frames,prepared:assets.size,pending,failures:[...failures],assets:assets.size,scene:cut?.kind,lastFrameMs,
        worlds:[...visited],catalogWorlds,shared:{...shared,parallaxStars:sky.state.stars.length,skyElapsed:sky.state.elapsed,destructionReady:loaded},
        campaign:campaign?.snapshot()||null,effects:effects?.metrics()||null,liveEffects:gpu?.snapshot()||null})};
  }
  window.nativeOpeningRenderer=Object.freeze({create});
})();
