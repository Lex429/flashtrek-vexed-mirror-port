/* The showcase workshop has its own versioned inventory and demo budget. */
(() => {
  'use strict';
  const key='vexedMirrorRepairWorkshop.v1',capacity=8;
  const tiers=Object.freeze([
    Object.freeze({id:'basic',name:'Basic',cost:300,rate:1,travel:1,health:40,description:'Utility hull / single welding tool'}),
    Object.freeze({id:'upgraded',name:'Upgraded',cost:900,rate:1.8,travel:1.25,health:90,description:'Armored hull / articulated tools'}),
    Object.freeze({id:'advanced',name:'Advanced',cost:2400,rate:3,travel:1.55,health:180,description:'Precision hull / multiple welding tools'})
  ]);
  const empty=()=>({basic:0,upgraded:0,advanced:0});
  const roles=Object.freeze({
    repair:tiers,
    attack:Object.freeze(tiers.map((t,i)=>Object.freeze({...t,speed:[85,110,140][i],damage:[7,11,16][i],cooldown:[950,750,600][i],range:[110,135,155][i]}))),
    defense:Object.freeze(tiers.map((t,i)=>Object.freeze({...t,cost:[400,1200,3000][i],health:[60,120,220][i],speed:[110,140,170][i],damage:[9,14,20][i],cooldown:[650,520,420][i],range:[125,145,170][i]})))
  });
  const fresh=()=>({version:2,credits:6000,owned:{basic:1,upgraded:0,advanced:0},defense:empty(),wave:{basic:2,upgraded:0,advanced:0}});
  const copy=s=>({version:2,credits:s.credits,owned:{...s.owned},defense:{...s.defense},wave:{...s.wave}});
  const units=inventory=>tiers.reduce((n,t)=>n+inventory[t.id],0);
  const count=s=>units(s.owned)+units(s.defense);
  const valid=inventory=>inventory&&tiers.every(t=>Number.isSafeInteger(inventory[t.id])&&inventory[t.id]>=0)&&units(inventory)<=capacity;
  let state=fresh();
  try{
    const saved=JSON.parse(localStorage.getItem(key));
    if(saved?.version===1){saved.version=2;saved.defense=empty();saved.wave={basic:2,upgraded:0,advanced:0};}
    if(saved?.version===2&&Number.isSafeInteger(saved.credits)&&saved.credits>=0&&saved.credits<=1e9&&
      valid(saved.owned)&&valid(saved.defense)&&valid(saved.wave)&&count(saved)<=capacity)state=copy(saved);
  }catch{}
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{}};
  function lose(id,role='repair'){
    const inventory=role==='repair'?'owned':role==='defense'?'defense':null;
    if(!inventory||!tiers.some(t=>t.id===id)||state[inventory][id]<=0)return false;
    const next=copy(state);next[inventory][id]--;state=next;persist();return true;
  }
  function transact(id,upgrade=false,role='repair'){
    const catalog=roles[role],inventory=role==='repair'?'owned':role==='defense'?'defense':null;
    if(!inventory)return {ok:false,message:'Attack drones belong to the enemy-wave controls.'};
    const index=catalog.findIndex(t=>t.id===id),tier=catalog[index];
    if(!tier)return {ok:false,message:'Unknown drone tier.'};
    if(upgrade&&(index===catalog.length-1||!state[inventory][id]))return {ok:false,message:'No drone available for this upgrade.'};
    if(!upgrade&&count(state)>=capacity)return {ok:false,message:'All eight hangar slots are occupied. Upgrade a drone instead.'};
    const target=upgrade?catalog[index+1]:tier,cost=upgrade?target.cost-tier.cost:tier.cost;
    if(state.credits<cost)return {ok:false,message:'Not enough demo credits.'};
    const next=copy(state);next.credits-=cost;if(upgrade)next[inventory][id]--;next[inventory][target.id]++;
    state=next;persist();return {ok:true,message:upgrade?`One ${role==='repair'?'Dot’s':role+' drone'} upgraded from ${tier.name} to ${target.name}.`:`${target.name} ${role==='repair'?'Dot’s':role+' drone'} purchased.`};
  }
  function configureWave(id,action){
    const index=tiers.findIndex(t=>t.id===id);if(index<0)return false;
    const next=copy(state);
    if(action==='add'){if(units(next.wave)>=capacity)return false;next.wave[id]++;}
    else if(action==='remove'){if(!next.wave[id])return false;next.wave[id]--;}
    else if(action==='upgrade'){if(!next.wave[id]||index===2)return false;next.wave[id]--;next.wave[tiers[index+1].id]++;}
    else return false;
    state=next;persist();return true;
  }
  function mount({isBusy=()=>false,isReady=()=>true,canWave=()=>false,onChange=()=>{},onLaunch=()=>{},onWave=()=>{},waveActive=()=>false}={}){
    const root=document.getElementById('repair-workshop');if(!root)return {refresh(){}};
    const cards=root.querySelector('.drone-tier-list'),panels={},tabs={},previews=[],previewConditions={};
    const previewCondition=document.createElement('select');previewCondition.id='dot-preview-condition';
    for(const [health,label] of [[100,'Intact / 75–100%'],[65,'Light / 50–under 75%'],[40,'Heavy / 25–under 50%'],[15,'Severe / under 25%'],[0,'Destroyed / no power']])previewCondition.add(new Option(label,String(health)));
    const conditionLabel=document.createElement('label');conditionLabel.htmlFor=previewCondition.id;conditionLabel.className='dot-preview-condition';conditionLabel.append(document.createTextNode('Dot’s condition preview'),previewCondition);
    previewCondition.onchange=()=>draw(lastPreviewTime,lastPreviewOptions);
    let lastPreviewTime=0,lastPreviewOptions={},lastPreviewKey='';
    const tabBar=document.createElement('div');tabBar.className='drone-role-tabs';tabBar.setAttribute('role','tablist');tabBar.setAttribute('aria-label','Drone roles');
    root.insertBefore(tabBar,cards);
    const marker=document.createComment('drone role panels');root.insertBefore(marker,cards);
    for(const role of ['repair','defense','attack']){
      const panel=document.createElement('div');panel.className='drone-role-panel';panel.dataset.dronePanel=role;panel.id='drone-panel-'+role;panel.setAttribute('role','tabpanel');
      const tab=document.createElement('button');tab.type='button';tab.setAttribute('role','tab');tab.id='drone-tab-'+role;tab.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',tab.id);tab.dataset.droneRole=role;
      tab.textContent={repair:'Green / Dot’s',defense:'Blue / Defense',attack:'Red / Attack'}[role];
      tab.onclick=()=>{for(const key of Object.keys(panels)){panels[key].hidden=key!==role;tabs[key].setAttribute('aria-selected',String(key===role));tabs[key].tabIndex=key===role?0:-1;}};
      tabs[role]=tab;panels[role]=panel;tabBar.append(tab);root.insertBefore(panel,marker);
      const list=role==='repair'?cards:document.createElement('div');list.className='drone-tier-list'+(role==='repair'?'':' drone-'+role+'-list');panel.append(list);
      const condition=role==='repair'?previewCondition:previewCondition.cloneNode(true);
      condition.id=role==='repair'?'dot-preview-condition':role+'-preview-condition';previewConditions[role]=condition;
      const label=role==='repair'?conditionLabel:document.createElement('label');
      if(role!=='repair'){label.className='dot-preview-condition';label.htmlFor=condition.id;label.append(document.createTextNode((role==='attack'?'Attack':'Defence')+' drone condition preview'),condition);condition.onchange=()=>draw(lastPreviewTime,lastPreviewOptions);}
      panel.prepend(label);
      if(role!=='repair'){const note=document.createElement('p');note.className='drone-role-note';note.textContent=role==='defense'?'Blue defenders share your hangar and launch with the green Dot’s.':'Configure the hostile fleet here. Enemy upgrades use no demo credits.';panel.prepend(note);}
      for(const [index,tier] of roles[role].entries()){
        const card=document.createElement('article');card.className='drone-tier';card.dataset.tier=tier.id;card.dataset.role=role;
        const preview=document.createElement('canvas');preview.width=200;preview.height=200;preview.className='drone-preview';preview.setAttribute('role','img');preview.setAttribute('aria-label',role==='repair'?`${tier.name} Dot’s repair unit`:`${tier.name} ${role} drone`);
        const paintPreview=(time=0,options={})=>{
          const g=preview.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,preview.width,preview.height);
          if(window.droneSprites?.drawPreview(g,tier.id,preview.width,preview.height,{role,health:Number(condition.value),maxHealth:100,time,lights:options.lights!==false,effects:options.damage!==false}))return;
          g.save();g.translate(100,70);g.scale(5.2,5.2);window.steamrunnerRepair.drawDrone(g,{tier:tier.id,role,thrust:0},0);g.restore();
        };paintPreview();previews.push({role,paint:paintPreview});window.droneSprites?.ready.then(()=>paintPreview());
        const title=document.createElement('h4');title.textContent=role==='repair'?`${tier.name} Dot’s`:tier.name;
        const description=document.createElement('p');description.textContent=role==='repair'?tier.description:role==='defense'?['Worker escort / light interceptor','Rapid interception / armored hull','Precision defense / heavy weapons'][index]:['Worker hunter / light weapon','Armed hunter / armored hull','Fast pursuit / heavy weapons'][index];
        const rate=document.createElement('small');rate.textContent=role==='repair'?`${tier.rate}\u00d7 repair / ${tier.health} HP`:`${tier.damage} damage / ${(tier.cooldown/1000).toFixed(2)}s / ${tier.health} HP`;
        const owned=document.createElement('strong');owned.dataset[role==='repair'?'owned':role==='defense'?'ownedDefense':'enemyCount']=tier.id;
        card.append(preview,title,description,rate,owned);
        if(role==='attack'){
          for(const action of ['add','remove','upgrade']){
            if(action==='upgrade'&&index===2)continue;
            const button=document.createElement('button');button.type='button';button.dataset['enemy'+action[0].toUpperCase()+action.slice(1)]=tier.id;
            button.textContent=action==='add'?'Add attacker':action==='remove'?'Remove one':`Upgrade one to ${tiers[index+1].name}`;
            button.onclick=()=>{if(!waveActive()&&configureWave(tier.id,action)){refresh();onChange();}};card.append(button);
          }
        }else{
          const buy=document.createElement('button');buy.type='button';buy.dataset[role==='repair'?'buyDrone':'buyDefense']=tier.id;buy.textContent=`Buy / ${tier.cost.toLocaleString()} cr`;buy.setAttribute('aria-label',`Buy ${tier.name} ${role==='repair'?'Dot’s':role+' drone'} for ${tier.cost} demo credits`);
          const act=upgrade=>{if(isBusy())return;const result=transact(tier.id,upgrade,role);root.querySelector('.drone-shop-status').textContent=result.message;refresh();if(result.ok)onChange();};
          buy.onclick=()=>act(false);card.append(buy);
          if(index<2){const upgrade=document.createElement('button');upgrade.type='button';upgrade.dataset[role==='repair'?'upgradeDrone':'upgradeDefense']=tier.id;upgrade.textContent=`Upgrade to ${roles[role][index+1].name} / ${(roles[role][index+1].cost-tier.cost).toLocaleString()} cr`;upgrade.onclick=()=>act(true);card.append(upgrade);}
        }
        list.append(card);
      }
    }
    tabBar.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const items=[...tabBar.children],at=items.indexOf(document.activeElement);
      const index=event.key==='Home'?0:event.key==='End'?2:(at+(event.key==='ArrowRight'?1:2))%3;items[index].click();items[index].focus();
    });
    const waveSummary=document.createElement('p');waveSummary.className='drone-wave-summary';panels.attack.append(waveSummary);
    const launchWave=document.createElement('button');launchWave.className='drone-wave-launch';launchWave.type='button';launchWave.textContent='Launch red attack wave';launchWave.onclick=()=>{if(canWave()&&units(state.wave)){onWave();refresh();}};panels.attack.append(launchWave);
    const autoLabel=document.createElement('label');autoLabel.className='drone-auto-attack';
    const autoAttack=document.createElement('input');autoAttack.type='checkbox';autoAttack.id='drone-auto-attack';autoAttack.checked=true;
    autoLabel.append(autoAttack,document.createTextNode('Launch a matched attack wave with repairs'));
    root.querySelector('.drone-workshop-launch').after(autoLabel);autoAttack.onchange=()=>refresh();
    tabs.repair.click();
    function refresh(){
      const total=count(state),busy=isBusy();
      root.querySelector('.drone-credits').textContent=state.credits.toLocaleString();
      root.querySelector('.drone-fleet-summary').textContent=`${total} / ${capacity} hangar slots / ${units(state.owned)} Dot’s / ${units(state.defense)} blue / ${tiers.reduce((n,t)=>n+state.owned[t.id]*t.rate,0).toFixed(1)}\u00d7 repair capacity`;
      for(const role of ['repair','defense'])for(const [index,tier] of roles[role].entries()){
        const inventory=role==='repair'?state.owned:state.defense,card=panels[role].querySelector(`[data-tier="${tier.id}"]`);
        card.querySelector('strong').textContent=`Owned: ${inventory[tier.id]}`;
        card.querySelector(`[data-${role==='repair'?'buy-drone':'buy-defense'}]`).disabled=busy||total>=capacity||state.credits<tier.cost;
        const upgrade=card.querySelector(`[data-${role==='repair'?'upgrade-drone':'upgrade-defense'}]`);if(upgrade)upgrade.disabled=busy||!inventory[tier.id]||state.credits<roles[role][index+1].cost-tier.cost;
      }
      for(const [index,tier] of tiers.entries()){
        panels.attack.querySelector(`[data-enemy-count="${tier.id}"]`).textContent=`In wave: ${state.wave[tier.id]}`;
        panels.attack.querySelector(`[data-enemy-add="${tier.id}"]`).disabled=waveActive()||units(state.wave)>=capacity;
        panels.attack.querySelector(`[data-enemy-remove="${tier.id}"]`).disabled=waveActive()||!state.wave[tier.id];
        const upgrade=panels.attack.querySelector(`[data-enemy-upgrade="${tier.id}"]`);if(upgrade)upgrade.disabled=waveActive()||!state.wave[tier.id];
      }
      const matched=window.droneBattle.planWave(state);
      waveSummary.textContent=`Manual wave: ${units(state.wave)} red attackers. Automatic encounter: ${tiers.map(t=>`${matched[t.id]} ${t.name}`).join(' / ')}. Matched to the owned fleet; saved wave settings stay as configured.`;
      autoAttack.disabled=busy;
      launchWave.disabled=!canWave()||!units(state.wave);
      root.querySelector('.drone-workshop-reset').disabled=busy;
      root.querySelector('.drone-workshop-launch').disabled=busy||!isReady()||units(state.owned)===0;
      root.querySelector('.drone-flight-note').textContent=busy?'Drones are in flight. Green Dot’s repair; blue defenders intercept red hunters.':units(state.owned)===0?'Buy a green Dot’s to resume repairs. Blue defenders cannot repair the hull.':autoAttack.checked&&units(state.wave)?'Blue escorts launch first, then green Dot’s. Red attackers approach automatically while welding begins. Owned losses are saved.':'Automatic attacks are off. Launch a manual wave from the Attack tab when ready. Owned losses are saved.';
    }
    root.querySelector('.drone-workshop-reset').onclick=()=>{if(isBusy())return;state=fresh();persist();root.querySelector('.drone-shop-status').textContent='Workshop reset: one Basic Dot’s and 6,000 demo credits.';refresh();onChange();};
    root.querySelector('.drone-workshop-launch').onclick=()=>{if(!isBusy()&&isReady()&&units(state.owned)){onLaunch();refresh();}};
    function draw(time,options={}){
      lastPreviewTime=time;lastPreviewOptions=options;if(root.hidden)return;
      const role=Object.keys(panels).find(k=>!panels[k].hidden),stamp=[role,Math.floor(time/75),previewConditions[role]?.value,options.lights,options.damage].join(':');
      if(stamp===lastPreviewKey)return;lastPreviewKey=stamp;
      for(const preview of previews)if(preview.role===role)preview.paint(time,options);
    }
    refresh();return {refresh,draw,autoAttack:()=>autoAttack.checked&&units(state.wave)>0};
  }
  window.repairDroneFleet=Object.freeze({tiers,roles,capacity,read:()=>copy(state),buy:(id,role='repair')=>transact(id,false,role),upgrade:(id,role='repair')=>transact(id,true,role),configureWave,lose,mount});
})();
