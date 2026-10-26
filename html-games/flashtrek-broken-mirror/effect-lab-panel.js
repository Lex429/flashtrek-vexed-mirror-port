/* Showcase controls for the game-hosted lab. No alternate effect renderer here. */
(() => {
  'use strict';
  const channel='vexed-effect-lab-v1',counts=[10,25,50,100,200];
  const gameOrigin=['7788','7790'].includes(location.port)?'http://127.0.0.1:7791':location.origin;
  const playOrigin=location.port==='7788'?'http://127.0.0.1:7790':location.origin;
  let active=false,busy=false,frame=null,ready=null,readyResolve=null,requestId=0,manifest=null,latest=null,sequence=0;
  let root=null,notice=null,graph=null,settings={},statusOutputs={},runs=[],viewed=null,historyPage=0;
  const pending=new Map(),locked=new Map(),trace=[];
  const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e;};
  function inform(message,error=false){if(notice){notice.textContent=message;notice.dataset.error=String(error);}}
  function setupFrame(){
    if(frame)return ready;
    ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Lab service unavailable. Start tools/effect_lab_server.py, then refresh.')),20000);readyResolve=()=>{clearTimeout(timer);resolve();};});
    frame=document.createElement('iframe');frame.id='effect-lab-frame';frame.title='Game effects stress scene';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads');
    frame.src=gameOrigin+'/html-games/broken-mirror-port/effect-lab-scene.html';document.querySelector('.scene').append(frame);
    return ready;
  }
  async function call(action,payload){
    await setupFrame();const id=++requestId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('Lab did not respond. Refresh the page and try again.'));},180000);
      pending.set(id,{resolve,reject,timer});frame.contentWindow.postMessage({channel,requestId:id,action,payload},gameOrigin);
    });
  }
  function setBusy(value){
    busy=value;
    root.querySelectorAll('[data-lab-lock]').forEach(e=>{e.disabled=value;});
    for(const id of ['ship-select','fleet-filter','animation-filter','previous','next']){
      const e=document.getElementById(id);if(value){if(!locked.has(e))locked.set(e,e.disabled);e.disabled=true;}else if(locked.has(e)){e.disabled=locked.get(e);locked.delete(e);}
    }
    stageAvailability();
  }
  function fixture(){return {count:Number(settings.count.value),scenario:settings.scenario.value,shipType:Number(document.getElementById('ship-select').value),
    mix:settings.mix.checked,mixedWeapons:settings.mixedWeapons.checked,mixedDamage:settings.mixedDamage.checked,rate:Number(settings.rate.value),size:Number(settings.size.value),seed:429,pattern:settings.pattern.value,
    lights:settings.lights.checked,loadLevel:settings.loadLevel.value,shieldRenderer:settings.shieldRenderer.value,weapon:document.getElementById('weapon-select').value,target:120};}
  function candidate(){
    const saved=manifest?.session?.candidate;
    const original=(saved?.implementation===settings.implementation.value?saved:manifest?.candidates?.profiles?.find(p=>p.implementation===settings.implementation.value))||manifest?.release;
    return {...structuredClone(original),schema:1,id:'candidate-v1',name:settings.name.value.trim()||'Candidate',
      shield:{duration:Number(settings.duration.value),energy:Number(settings.energy.value)},weapon:{scale:Number(settings.scale.value)}};
  }
  function saveSession(){return call('session',{candidate:candidate(),fixture:fixture()});}
  function stageAvailability(){
    if(!settings.stage||!manifest)return;
    const profile=candidate(),match=runs.findLast(run=>run.variant==='candidate'&&run.fixture.shieldRenderer!=='legacy'&&JSON.stringify(run.profile)===JSON.stringify(profile));
    const current=match&&EffectLabMetrics.stable(match.code)===EffectLabMetrics.stable(manifest.code);
    settings.stage.disabled=busy||!current||settings.shieldRenderer.value==='legacy';settings.stage.title=current?'Select this measured candidate for Codex to put in game':match?'Source changed; measure this candidate again':'Measure this candidate before staging it';
  }
  async function expandHiddenScene(){
    const scene=document.querySelector('.scene'),bounds=scene.getBoundingClientRect();
    if(getComputedStyle(scene).visibility!=='hidden'&&bounds.height>=120)return false;
    if(!scene.requestFullscreen)throw Error('Use a larger window with the preview visible.');
    await scene.requestFullscreen();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;
  }
  async function preview(){
    if(busy||!manifest)return;const ticket=++sequence;setBusy(true);inform('Preparing preview…');
    try{await expandHiddenScene();await saveSession();await call('preview',{fixture:fixture(),variant:settings.variant.value,profile:settings.variant.value==='baseline'?manifest.release:candidate()});if(ticket===sequence)inform('Previewing. Use Measure to save real frame timings.');}
    catch(error){inform(error.message,true);}finally{if(ticket===sequence)setBusy(false);}
  }
  async function measure(mode){
    if(busy||!manifest)return;const ticket=++sequence;setBusy(true);trace.length=0;
    const original=fixture(),profile=candidate(),variants=mode==='compare'||mode==='matrix'?['baseline','candidate']:[settings.variant.value];
    const selected=mode==='matrix'?counts:[original.count];
    let expanded=false;
    try{
      expanded=await expandHiddenScene();
      await saveSession();manifest=await call('manifest');
      let completed=0;
      for(const count of selected)for(const variant of variants){
        if(ticket!==sequence)return;
        inform(`${++completed} / ${selected.length*variants.length} · ${count} ships · ${variant} · preparing`);
        latest=await call('measure',{fixture:{...original,count},profile:variant==='baseline'?manifest.release:profile,variant,
          duration:Number(settings.seconds.value),warmup:Number(settings.warmup.value)});
        if(ticket!==sequence)return;
        runs.push(latest);runs=runs.slice(-20);viewed=latest;renderResults();stageAvailability();
      }
      inform(latest.metrics.targetObserved?'120 FPS target observed in this renderer test.':'Saved. 120 FPS was not observed; inspect frame times and 1% lows.');
    }catch(error){if(ticket===sequence)inform(error.message,true);}
    finally{if(expanded){await call('stop').catch(()=>{});if(document.fullscreenElement)await document.exitFullscreen();}if(ticket===sequence)setBusy(false);}
  }
  function stop(){sequence++;call('stop').catch(error=>inform(error.message,true));setBusy(false);inform('Stopped. Completed results are kept.');}
  async function checkGame(){
    if(busy||!manifest)return;const ticket=++sequence;setBusy(true);trace.length=0;drawGraph();inform('Starting isolated game check…');
    try{
      await saveSession();await call('stop');
      const bounds=document.querySelector('.scene').getBoundingClientRect(),original=fixture();
      await call('game-check',{fixture:{...original,width:Math.max(320,Math.round(bounds.width)),height:Math.max(240,Math.round(bounds.height)),dpr:Math.min(devicePixelRatio||1,2)},
        profile:settings.variant.value==='baseline'?manifest.release:candidate(),duration:Number(settings.seconds.value),warmup:Number(settings.warmup.value)});
      const deadline=performance.now()+180000;
      while(performance.now()<deadline){
        await new Promise(resolve=>setTimeout(resolve,1000));const data=await call('manifest'),report=data.gameValidation;
        if(report.status==='running')continue;
        if(['error','cancelled'].includes(report.status))throw Error(report.error);
        if(ticket!==sequence)return;
        showMetrics({...report,counters:{visible:report.minimumVisible},fixture:{count:report.requested}});viewed=report;
        root.querySelector('.lab-live-line').textContent=`Actual game · ${report.minimumVisible} / ${report.requested} ships visible · headless browser`;
        const stale=EffectLabMetrics.stable(report.code)!==EffectLabMetrics.stable(data.code);
        root.querySelector('.lab-comparison').textContent=`Game check: ${stale?'stale; measure the current source again':report.status}. ${report.releaseApplied?'Released version.':'Candidate preview; not released.'}`;
        inform(report.status==='passed'?'In-game check passed on this test browser. Confirm in foreground on your target display.':`In-game check: ${report.status}. Inspect FPS and frame times.`);return;
      }
      throw Error('In-game check timed out. Reopen Stress to inspect its saved status.');
    }catch(error){if(ticket===sequence)inform(error.message,true);}
    finally{if(ticket===sequence)setBusy(false);}
  }
  function format(value,suffix=''){return value==null?'Unavailable':Number(value).toFixed(2)+suffix;}
  function showMetrics(report){
    const metrics=report.metrics||report;
    for(const [key,suffix] of [['fps',' FPS'],['low1FPS',' FPS'],['frameMs',' ms'],['p95Ms',' ms'],['p99Ms',' ms'],['maxMs',' ms'],['cpuMs',' ms'],['gpuMs',' ms']])statusOutputs[key].textContent=format(metrics[key],suffix);
    statusOutputs.overBudget.textContent=String(metrics.overBudget??0);
    statusOutputs.coverage.textContent=report.counters?`${report.counters.visible??report.counters.minimumVisible} / ${report.fixture?.count||fixture().count}`:'—';
  }
  function drawGraph(){
    if(!graph)return;const g=graph.getContext('2d'),w=graph.width,h=graph.height;g.clearRect(0,0,w,h);g.fillStyle='#08131e';g.fillRect(0,0,w,h);
    g.strokeStyle='#294151';g.beginPath();g.moveTo(0,h/2);g.lineTo(w,h/2);g.stroke();
    g.fillStyle='#819aac';g.font='10px system-ui';g.fillText('120 FPS',5,h/2-5);
    if(trace.length<2)return;g.strokeStyle='#80d9d4';g.lineWidth=1.5;g.beginPath();trace.forEach((fps,i)=>{const x=i*w/119,y=h-Math.min(240,fps)/240*h;i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();
  }
  function renderResults(){
    const list=root.querySelector('.lab-history'),summary=root.querySelector('.lab-comparison');list.replaceChildren();
    const reversed=[...runs].reverse(),pages=Math.max(1,Math.ceil(reversed.length/3));historyPage=Math.min(historyPage,pages-1);
    for(const run of reversed.slice(historyPage*3,historyPage*3+3)){
      const stale=EffectLabMetrics.stable(run.code)!==EffectLabMetrics.stable(manifest?.code);
      const button=node('button','',`${run.fixture.count} ships · ${run.variant} · ${run.metrics.fps.toFixed(1)} FPS${stale?' · stale':''}`);button.type='button';
      if(stale)button.title='Source changed after this recording. Measure again before staging.';
      button.onclick=()=>{viewed=run;showMetrics(run);renderComparison(run);};list.append(button);
    }
    root.querySelector('[data-history-page]').textContent=`${historyPage+1} / ${pages}`;
    root.querySelector('[data-history-prev]').disabled=historyPage===0;root.querySelector('[data-history-next]').disabled=historyPage>=pages-1;
    function renderComparison(run){
      const other=[...runs].reverse().find(item=>item.variant!==run.variant&&EffectLabMetrics.comparable(item,run));
      if(other){const baseline=run.variant==='baseline'?run:other,candidateRun=run.variant==='candidate'?run:other;
        const stale=EffectLabMetrics.stable(run.code)!==EffectLabMetrics.stable(manifest?.code);
        summary.textContent=`${stale?'Archived comparison; source changed. ':''}Same load: ${baseline.fixture.shieldRenderer==='legacy'?'Legacy':'GPU'} baseline ${baseline.metrics.fps.toFixed(1)} → ${candidateRun.fixture.shieldRenderer==='legacy'?'Legacy':'GPU'} candidate ${candidateRun.metrics.fps.toFixed(1)} FPS. P95 ${baseline.metrics.p95Ms.toFixed(2)} → ${candidateRun.metrics.p95Ms.toFixed(2)} ms. Game check: pending.`;}
      else summary.textContent='Run Compare A/B with the same window and scenario for a matched comparison.';
    }
    if(viewed){showMetrics(viewed);renderComparison(viewed);}
  }
  addEventListener('message',event=>{
    if(!frame||event.source!==frame.contentWindow||event.origin!==gameOrigin||event.data?.channel!==channel)return;
    const {type,payload}=event.data;
    if(type==='ready')readyResolve?.();
    if(type==='reply'){
      const p=pending.get(payload.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(payload.requestId);payload.error?p.reject(Error(payload.error)):p.resolve(payload.result);
    }
    if(type==='telemetry'){
      if(!active)return;trace.push(payload.fps);if(trace.length>120)trace.shift();drawGraph();
      showMetrics({...payload,metrics:{...payload.metrics,fps:payload.fps},fixture:{count:payload.requested}});
      root.querySelector('.lab-live-line').textContent=`${payload.phase} · ${payload.counters.visible} ships visible · ${payload.counters.activeShields} shields · ${payload.counters.activeWeapons} weapons`;
    }
    if(type==='error')inform(payload.message,true);
    if(type==='cancelled')inform(payload.reason,true);
  });
  function create({tabs,section}){
    root=node('section','workspace-group effect-lab-panel');
    notice=node('p','lab-notice','Preparing stress lab…');notice.setAttribute('role','status');
    function label(title,input){const e=node('label','lab-field',title);e.append(input);return e;}
    function select(key,title,options){const e=node('select');e.dataset.labLock='';e.dataset.lab=key;for(const [value,text] of options)e.add(new Option(text,value));settings[key]=e;return label(title,e);}
    function input(key,title,type,value,min,max,step){const e=node('input');e.type=type;e.value=value;e.min=min;e.max=max;e.step=step||1;e.dataset.labLock='';e.dataset.lab=key;settings[key]=e;return label(title,e);}
    function check(key,title){const e=node('input');e.type='checkbox';e.checked=true;e.dataset.labLock='';e.dataset.lab=key;settings[key]=e;return label(title,e);}
    function button(text,action,lock=true){const e=node('button','',text);e.type='button';e.onclick=action;if(lock)e.dataset.labLock='';return e;}
    const scenario=section(),load=section();
    scenario.append(select('count','On-screen ships',counts.map(count=>[count,String(count)])),input('size','Hull size (maximum px)','number',44,16,90));
    load.append(select('scenario','Scenario',[['weapons-hits','Moving weapons + shields + hull hits'],['shields','Repeated shield hits'],['hull','Hull impacts'],['weapons','Sustained weapons'],['shielded-battle','Weapons + shields (intact hulls)'],['idle','Cruising / lighting only']]),
      select('loadLevel','Load level',[['normal','Normal - shared weapon recharge'],['stress','Realistic stress - shared recharge'],['overload','Synthetic overload - fixed rate']]),
      select('pattern','Hit pattern',[['staggered','Staggered impacts'],['volley','Synchronized volleys']]),input('rate','Events / ship / second','number',2,.5,8,.5));
    const loadChecks=node('div','lab-checks');loadChecks.append(check('mixedWeapons','Mixed weapons'),check('mixedDamage','Damage stages'));load.append(loadChecks);
    settings.mixedWeapons.checked=settings.mixedDamage.checked=false;
    load.append(node('p','lab-help','No explosions or wreckage. Stress respects recharge; overload bypasses it. The combined scene includes shielded and unshielded targets.'));
    const checks=node('div','lab-checks');checks.append(check('mix','Mixed game hulls'),check('lights','Ship lighting'));settings.mix.checked=false;scenario.append(checks);
    scenario.append(select('shieldRenderer','Shield renderer',[['gpu','Latest game shields (GPU)'],['legacy','Legacy baseline (comparison only)']]));
    scenario.append(select('variant','Preview / single run',[['baseline','Current game / baseline'],['candidate','Candidate settings']]));
    const previewActions=node('div','lab-pair');previewActions.append(button('Preview',preview),button('Stop',stop,false));scenario.append(previewActions);
    const measurement=section();
    const timing=node('div','lab-pair');timing.append(select('seconds','Measure (seconds)',[2,5,10,20,30].map(n=>[n,n])),select('warmup','Warm up (seconds)',[0,1,2,3,5].map(n=>[n,n])));measurement.append(timing);
    const actions=node('div','lab-pair');actions.append(button('Measure selected',()=>measure('single')),button('Compare A/B',()=>measure('compare')));measurement.append(actions);
    const extraActions=node('div','lab-pair');extraActions.append(button('All counts · A/B',()=>measure('matrix')),button('Check in game',checkGame));measurement.append(extraActions);
    const liveLine=node('p','lab-live-line','120 FPS target · 8.33 ms per frame');measurement.append(liveLine);
    graph=node('canvas','lab-graph');graph.width=320;graph.height=70;graph.setAttribute('aria-label','Recent measured animation-frame rate');measurement.append(graph);
    const metrics=node('dl','lab-metrics'),detailedMetrics=node('dl','lab-metrics');
    for(const [key,text] of [['fps','RAF FPS'],['low1FPS','1% low'],['frameMs','Frame spacing'],['p95Ms','P95'],['p99Ms','P99'],['maxMs','Worst frame'],['cpuMs','CPU work'],['gpuMs','Effects GPU'],['overBudget','Over 8.33 ms'],['coverage','Visible ships']]){
      const cell=node('div');statusOutputs[key]=node('dd','','—');cell.append(node('dt','',text),statusOutputs[key]);
      (['fps','low1FPS','p95Ms','cpuMs'].includes(key)?metrics:detailedMetrics).append(cell);
    }measurement.append(metrics);
    const candidates=section();candidates.append(select('implementation','Shield design',[['shared-v1','Current game design'],['cinematic-shields-v1','Cinematic shields']]));candidates.append(input('name','Candidate name','text','Candidate',0,0));settings.name.maxLength=100;
    candidates.append(input('duration','Shield duration (ms)','number',900,200,1800,50));
    const candidatePair=node('div','lab-pair');candidatePair.append(input('energy','Shield intensity','number',1,.5,1.8,.1),input('scale','Weapon size','number',1,.5,2,.1));candidates.append(candidatePair);
    const instructions=node('p','lab-help','Describe the effect you want to Codex. Measure the candidate here, then select that tested version.');candidates.append(instructions);
    settings.stage=button('Stage candidate for game',async()=>{
      const profile=candidate(),run=runs.findLast(value=>value.variant==='candidate'&&JSON.stringify(value.profile)===JSON.stringify(profile));
      try{await call('stage',{profile,runId:run?.id});inform(`Selected: ${profile.name}. Tell Codex “put it in game”.`);}catch(error){inform(error.message,true);}
    });settings.stage.disabled=true;candidates.append(settings.stage);
    const results=section(),details=section();results.append(node('div','lab-history'));
    const paging=node('nav','workspace-pager'),previous=button('Previous',()=>{historyPage--;renderResults();},false),next=button('Next',()=>{historyPage++;renderResults();},false),page=node('span');
    previous.dataset.historyPrev='';next.dataset.historyNext='';page.dataset.historyPage='';paging.append(previous,page,next);results.append(paging);details.append(detailedMetrics,node('p','lab-comparison'));
    const exportButton=button('Export selected result',()=>call('export',viewed||latest).catch(error=>inform(error.message,true)),false);results.append(exportButton);
    const gameStatus=node('p','lab-help');gameStatus.dataset.gameStatus='';
    const gameButton=button('Open game with FPS overlay',()=>window.open(playOrigin+'/html-games/broken-mirror-port/index.html?effectLabCheck=1','_blank','noopener'),false);results.append(gameButton,gameStatus);
    details.append(button('Export selected result',()=>call('export',viewed||latest).catch(error=>inform(error.message,true)),false),node('p','lab-help','CPU is submission time. GPU covers the shared effects overlay. RAF cadence depends on the display/browser cap. Check in game uses an isolated headless browser; confirm foreground results on your target hardware.'));
    tabs(root,[['scenario',scenario,'Fleet'],['load',load,'Load'],['measure',measurement,'Measure'],['candidate',candidates,'Version'],['results',results,'Runs'],['details',details,'Details']],'stress');root.append(notice);
    settings.count.value='100';settings.seconds.value='10';settings.warmup.value='2';
    root.addEventListener('change',event=>{if(manifest){if(event.target===settings.implementation){const chosen=manifest.candidates?.profiles?.find(p=>p.implementation===settings.implementation.value)||manifest.release;settings.name.value=chosen.name;settings.duration.value=chosen.shield.duration;settings.energy.value=chosen.shield.energy;settings.scale.value=chosen.weapon.scale;}stageAvailability();saveSession().catch(error=>inform(error.message,true));}});
    document.getElementById('reset').addEventListener('click',event=>{if(active){event.preventDefault();event.stopImmediatePropagation();stop();}},true);
    addEventListener('showcase-workspace-tab',async event=>{
      active=event.detail.id==='lab';document.body.classList.toggle('effect-lab-active',active);
      window.nativeDamageArtPreparation?.setPaused(active);
      if(!active){if(frame)stop();return;}
      settings.shieldRenderer.value=window.showcaseShields?.renderer||'gpu';
      try{
        await setupFrame();manifest=await call('manifest');runs=manifest.runs||[];viewed=runs.at(-1)||null;
        const incoming=window.showcaseShields?.snapshot();
        const saved=(incoming?.variant==='candidate'?incoming.profile:null)||manifest.session?.candidate||manifest.candidates?.profiles?.find(p=>p.implementation===manifest.candidates.defaultPreview)||manifest.release;
        settings.implementation.replaceChildren(new Option('Current game design','shared-v1'));
        for(const design of manifest.candidates?.profiles||[])if(design.implementation!=='shared-v1')settings.implementation.add(new Option(design.name,design.implementation));
        if(![...settings.implementation.options].some(option=>option.value===saved.implementation))settings.implementation.add(new Option(saved.name,saved.implementation));
        manifest.session={...manifest.session,candidate:saved};
        settings.implementation.value=saved.implementation;
        settings.variant.value=window.showcaseShields?.snapshot().variant==='candidate'?'candidate':'baseline';
        settings.name.value=saved.name||'Candidate';settings.duration.value=saved.shield.duration;settings.energy.value=saved.shield.energy;settings.scale.value=saved.weapon.scale;
        const savedFixture=manifest.session?.fixture;
        if(savedFixture)for(const key of ['count','scenario','pattern','rate','size','loadLevel'])if(savedFixture[key]!=null){const old=String(savedFixture[key]);settings[key].value=key==='scenario'&&['battle','full-battle','explosions'].includes(old)?'weapons-hits':old;}
        renderResults();setBusy(false);inform('Choose a scene. Preview to inspect it; Measure to record performance.');
        const checked=manifest.gameValidation;
        const stale=checked?.code&&EffectLabMetrics.stable(checked.code)!==EffectLabMetrics.stable(manifest.code);
        gameStatus.textContent=checked?.metrics?`Game check: ${stale?'stale':checked.status} · ${checked.requested} ships · ${checked.metrics.fps.toFixed(1)} FPS. Recheck after changes.`:`Game check: ${checked?.status||'not-run'}.`;
        if(savedFixture)for(const key of ['mix','lights','mixedWeapons','mixedDamage'])if(typeof savedFixture[key]==='boolean')settings[key].checked=savedFixture[key];
      }catch(error){inform(error.message,true);}
    });
    return root;
  }
  window.showcaseEffectLab=Object.freeze({create,get active(){return active;},readManifest:()=>call('manifest'),selection:()=>manifest?{profile:settings.variant.value==='baseline'?structuredClone(manifest.release):candidate(),variant:settings.variant.value,renderer:settings.shieldRenderer.value}:null,snapshot:()=>({active,busy,latest,selected:viewed,gameOrigin})});
})();
