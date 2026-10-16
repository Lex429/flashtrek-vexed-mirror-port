/* Fleet groups follow the project's artwork collections. Completion reflects
   the effects actually enabled in this showcase, rather than artwork origin. */
(() => {
  'use strict';
  const fleets=[
    {id:'earth',name:'Earth / Federation',ships:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,33,34,35,36,37,38,45,46,47,49,56,57,58,60]},
    {id:'klingon',name:'Klingon',ships:[39,40,41,42,43,61]},
    {id:'romulan',name:'Romulan / Reman',ships:[27,28,29,53,64]},
    {id:'vulcan',name:'Vulcan',ships:[25,26,59,63]},
    {id:'cardassian',name:'Cardassian',ships:[16,31,32,62]},
    {id:'ferengi',name:'Ferengi',ships:[17,18,19]},
    {id:'dominion',name:'Dominion',ships:[30,48,65]},
    {id:'borg',name:'Borg',ships:[44]},
    {id:'tholian',name:'Tholian',ships:[20,66]},
    {id:'delpin',name:'Delpin',ships:[21,22,51]},
    {id:'other',name:'Other / Independent',ships:[23,24,50,52,54,55]},
    {id:'creatures',name:'Creatures · Original',ships:[67,68,69,70,71,72,73,74,75,76,77,78]},
    {id:'mutation-red',name:"Red Mutation",ships:[200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211]},
    {id:'mutation-venom',name:"Venom Green",ships:[212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223]},
    {id:'mutation-purple',name:"Purple Mutation",ships:[224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235]},
    {id:'mutation-white',name:"White Mutation",ships:[236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247]},
    {id:'mutation-borg-rendition',name:"Borg Rendition",ships:[248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259]},
    {id:'mutation-borg-variant',name:"Borg Variant",ships:[260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271]},
    {id:'asteroids',name:'Asteroids',ships:Array.from({length:19},(_,i)=>100+i)}
  ];
  const $=id=>document.getElementById(id);
  function create(ships,isAnimated,onSelect){
    let currentId=null,visible=[];
    const fleetFor=id=>fleets.find(f=>f.ships.includes(id));
    const asteroidReady=s=>s.kind==='asteroid';
    const completed=members=>members.filter(s=>isAnimated(s.id)).length;
    const damageReady=members=>members.filter(asteroidReady).length;
    const members=f=>ships.filter(s=>f.ships.includes(s.id));
    const filter=$('fleet-filter'),status=$('animation-filter'),select=$('ship-select');
    filter.append(new Option('All fleets', 'all'));
    for(const f of fleets){const list=members(f);filter.append(new Option(f.id==='asteroids'?`${f.name} (${damageReady(list)}/${list.length} damage chain ready)`:`${f.name} (${completed(list)}/${list.length} animated)`,f.id));}
    function updateSummary(){
      const asteroidScope=filter.value==='asteroids',scoped=filter.value==='all'?ships.filter(s=>s.kind!=='asteroid'):members(fleets.find(f=>f.id===filter.value));
      const count=asteroidScope?damageReady(scoped):completed(scoped),total=scoped.length;
      $('fleet-progress').textContent=asteroidScope?`${count} damage chain ready · ${total-count} artwork only`:`${count} animated · ${total-count} need animation`;
      $('fleet-progress-bar').value=count;$('fleet-progress-bar').max=total||1;
      $('fleet-progress-bar').setAttribute('aria-label',asteroidScope?`Asteroids: ${count} of ${total} have damage chains`:`${filter.value==='all'?'All fleets':fleetFor(scoped[0]?.id)?.name}: ${count} of ${total} animated`);
      $('ship-results').textContent=visible.length?`${visible.length} ${filter.value==='asteroids'?'asteroid artworks':filter.value==='creatures'?'creature variants':filter.value==='all'?'ships / creatures / asteroids':visible.length===1?'ship':'ships'} shown`:'No ships or creatures match these filters. Try another fleet or animation status.';
    }
    function render(){
      visible=[];select.replaceChildren();
      for(const f of fleets){
        if(filter.value!=='all'&&filter.value!==f.id)continue;
        const list=members(f),matches=list.filter(s=>status.value==='all'||(s.kind==='asteroid'?status.value==='animated'?asteroidReady(s):!asteroidReady(s):status.value==='animated'?isAnimated(s.id):!isAnimated(s.id)));
        if(!matches.length)continue;
        const group=document.createElement('optgroup');group.label=f.id==='asteroids'?`${f.name} · ${damageReady(list)}/${list.length} damage chain ready`:`${f.name} · ${completed(list)}/${list.length} animated`;
        for(const ship of matches){const statusLabel=ship.kind==='asteroid'?asteroidReady(ship)?'Damage chain ready':'Artwork preview':ship.artworkStatus==='intact-only'?'Intact only ? damage pending':isAnimated(ship.id)?'Animated':'Needs animation';const option=new Option(`${ship.name} ? ${statusLabel}`,ship.id);group.append(option);visible.push(ship);}
        select.append(group);
      }
      select.disabled=!visible.length;
      for(const id of ['previous','next'])$(id).disabled=visible.length<2;
      if(visible.some(s=>s.id===currentId))select.value=currentId;
      else if(visible.length){select.value=visible[0].id;onSelect(visible[0].id);}
      updateSummary();
    }
    function sync(id){
      currentId=id;select.value=id;
      const fleet=fleetFor(id),selected=ships.find(s=>s.id===id),asteroid=selected?.kind==='asteroid',ready=isAnimated(id),chainReady=asteroid&&asteroidReady(selected),badge=$('ship-animation-status');
      const creature=ships.find(s=>s.id===id)?.artworkStatus==='intact-only';
      $('selected-fleet').textContent=fleet?.name||'Other / Independent';
      badge.textContent=asteroid?chainReady?'Damage chain ready':'Artwork preview':creature?'Intact only':ready?'Animated':'Needs animation';badge.dataset.status=asteroid?chainReady?'damage-ready':'artwork':ready?'animated':'pending';
      if(asteroid){$('ship-animation-detail').textContent=chainReady?'Weapon damage moves this rock through intact, cracked, fractured and breaking-apart stages. Matching pieces fly off as each damaged section is removed.':'Curated high-resolution asteroid artwork is ready to inspect. Its damage chain has not been created.';return;}
      if(creature){$('ship-animation-detail').textContent='Editable health and biological weapon reactions are ready. Separate light, heavy and severe damage artwork is pending.';return;}
      $('ship-animation-detail').textContent=ready?(id>=69&&ships.find(s=>s.id===id)?.kind==='creature'?'Articulated movement, under-shell circulation, four tissue damage stages and biological breakup are ready.':[67,68].includes(id)?'Living interior pulses, torn membranes and collapse are ready. Living eggs can hatch; severe contents and damage debris stay dead and unlit.':id===23?'Damage sparks, matching torn sails and spar breakup are ready.':id===50?'Travelling vein pulses, leaking wounds, fleshy lobes and pod rupture are ready.':id===55?'Living pulses, twitching wounds, tissue debris and organic rupture are ready.':'Lights, breach effects, matching hull debris and final explosion are ready.'):'Damage artwork is ready. Lights, breach effects and matching hull breakup still need animation.';
    }
    filter.onchange=render;status.onchange=render;
    function navigate(delta){
      if(visible.length<2)return;
      const index=visible.findIndex(s=>s.id===currentId);onSelect(visible[(Math.max(0,index)+delta+visible.length)%visible.length].id);
    }
    // Keep the requested URL ship selected on the first render.
    function init(id){currentId=id;render();sync(id);}
    return Object.freeze({init,sync,navigate});
  }
  window.createShipPicker=create;
})();
