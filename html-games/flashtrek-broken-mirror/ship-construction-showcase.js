/* Isolated construction preview using the same plans and painter as gameplay. */
(() => {
  'use strict';
  const view=window.shipConstructionView;
  const params=new URLSearchParams(location.search),requestedShip=Number(params.get('build')),requestedSpeed=Number(params.get('speed'));
  let panel=null,ships=[],entry=null,selected=Number.isSafeInteger(requestedShip)&&requestedShip>0?requestedShip:7,seconds=0,paused=false,speed=[1,2,4,8].includes(requestedSpeed)?requestedSpeed:1,last=0,raf=0,ticket=0,active=false,zoom=1;
  async function choose(id){
    selected=Number(id);const token=++ticket;entry=null;seconds=0;
    const ship=ships.find(s=>s.id===selected);if(!ship)return;
    panel.querySelector('[data-construction-status]').textContent='Preparing '+ship.name+'…';
    try{const asset=await view.prepare(ship);if(token!==ticket)return;entry=asset;sync();}
    catch(error){panel.querySelector('[data-construction-status]').textContent=error.message;}
  }
  function sync(){
    if(!panel||!entry)return;const value=window.shipConstruction.sample(entry.plan,seconds);
    panel.querySelector('[data-construction-status]').textContent=`${entry.plan.name} · ${value.label} · ${Math.round(value.progress*100)}%`;
    panel.querySelector('[data-construction-scrub]').value=String(value.progress*100);
    const counts={beam:0,module:0,panel:0};for(const job of entry.assembly.jobs)if(job.finish<=value.progress)counts[job.kind]++;
    panel.querySelector('[data-construction-detail]').textContent=`${entry.plan.berth} | Beams ${counts.beam}/${entry.assembly.counts.beams} | Systems ${counts.module}/${entry.assembly.counts.modules} | Hull plates ${counts.panel}/${entry.assembly.counts.plates} | 6 DOT drones`;
    panel.querySelector('[data-construction-pause]').textContent=paused?'Play':'Pause';
  }
  function paint(timestamp){
    raf=0;if(!active)return;const dt=last?Math.min(.1,(timestamp-last)/1000):0;last=timestamp;
    if(entry){if(!paused)seconds=Math.min(entry.plan.seconds,seconds+dt*speed);
      const canvas=panel.querySelector('canvas');view.paintScene(canvas.getContext('2d'),entry,{width:canvas.width,height:canvas.height,seconds,time:seconds});sync();}
    if(!entry){const canvas=panel.querySelector('canvas'),g=canvas.getContext('2d');g.fillStyle='#050c14';g.fillRect(0,0,canvas.width,canvas.height);
      if(view.yard){const scale=Math.min((canvas.width-32)/view.yard.width,(canvas.height-32)/view.yard.height),w=view.yard.width*scale,h=view.yard.height*scale;g.drawImage(view.yard,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}}
    raf=requestAnimationFrame(paint);
  }
  function resizeCanvas(){
    if(!panel||!active)return;const stage=panel.querySelector('.construction-stage'),canvas=panel.querySelector('canvas');
    const rect=stage.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
    const ratio=Math.min(2,devicePixelRatio||1),width=Math.max(1,Math.round(stage.clientWidth*ratio)),height=Math.max(1,Math.round(stage.clientHeight*ratio));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  }
  function activate(value){active=value;document.body.classList.toggle('construction-mode',value);last=0;cancelAnimationFrame(raf);if(active){resizeCanvas();raf=requestAnimationFrame(paint);}}
  function create(){
    panel=document.createElement('section');panel.className='workspace-group construction-preview';
    panel.innerHTML=`<header class="construction-heading"><h3>Earth Heavy Shipyard</h3><p>Watch the full construction and launch.</p></header>
      <div class="construction-stage"><canvas width="1100" height="720" aria-label="Complete shipyard, DOT crews and ship construction"></canvas></div>
      <aside class="construction-sidebar"><label class="construction-ship-field">Construction ship<select data-construction-ship aria-label="Construction ship"></select></label>
      <div class="construction-actions"><button data-construction-replay>Build / replay</button><button data-construction-pause>Pause</button></div>
      <label class="construction-speed-field">Playback speed<select data-construction-speed aria-label="Construction playback speed"><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option><option value="8">8x</option></select></label>
      <p class="construction-status" data-construction-status role="status">Loading ship plans...</p>
      <label class="construction-progress-field">Construction progress<input data-construction-scrub type="range" min="0" max="100" value="0" step="0.1"></label>
      <small data-construction-detail></small><p class="construction-fit-note">The full shipyard, crews and departing ship fit automatically.</p></aside>`;
    const select=panel.querySelector('[data-construction-ship]');
    select.onchange=()=>choose(select.value);
    panel.querySelector('[data-construction-replay]').onclick=()=>{seconds=0;paused=false;sync();};
    panel.querySelector('[data-construction-pause]').onclick=()=>{paused=!paused;sync();};
    panel.querySelector('[data-construction-speed]').onchange=e=>speed=Number(e.target.value);
    panel.querySelector('[data-construction-speed]').value=String(speed);
    panel.querySelector('[data-construction-scrub]').oninput=e=>{if(entry){seconds=entry.plan.seconds*Number(e.target.value)/100;paused=true;sync();}};
    Promise.all([fetch('ship-construction-profiles.json').then(r=>r.json()),view.loadYard()]).then(([data])=>{
      // All existing mechanical hull artwork, including the finished newer classes.
      ships=data.ships.filter(s=>s.frames?.length);
      if(!ships.some(ship=>ship.id===selected))selected=ships[0]?.id||7;
      for(const ship of ships)select.append(new Option(ship.name,ship.id));select.value=selected;choose(selected);
    }).catch(error=>panel.querySelector('[data-construction-status]').textContent=error.message);
    const observer=new ResizeObserver(resizeCanvas);observer.observe(panel.querySelector('.construction-stage'));
    addEventListener('resize',resizeCanvas);
    addEventListener('showcase-workspace-tab',event=>activate(event.detail.id==='construction'));
    return panel;
  }
  window.showcaseShipConstruction=Object.freeze({create,choose,snapshot:()=>({ready:!!entry,active,ship:selected,seconds,paused,speed,zoom,ships:ships.map(s=>s.id),sample:entry?window.shipConstruction.sample(entry.plan,seconds):null,...view.snapshot()})});
})();
