/* Saved population counts for galaxy worlds and Sol settlements. */
(() => {
  'use strict';
  const secondsPerDay=120,tickSeconds=3,daysPerYear=365;
  const nonnegative=value=>Math.max(0,Math.round(Number(value)||0));
  const displayFrames=new WeakMap();
  const metricFrames=new WeakMap();

  function animateMetric(element,count,suffix=''){
    if(!element)return;
    count=Math.max(0,Math.round(Number(count)||0));
    const previous=Number(element.dataset.metricValue);
    const prior=metricFrames.get(element);
    if(prior)cancelAnimationFrame(prior);
    element.dataset.metricValue=String(count);
    const format=value=>value.toLocaleString()+suffix;
    if(!Number.isFinite(previous)||matchMedia('(prefers-reduced-motion: reduce)').matches||!element.isConnected){
      element.textContent=format(count);
      return;
    }
    element.classList.remove('population-pulse');
    void element.offsetWidth;
    element.classList.add('population-pulse');
    const start=performance.now(),duration=500;
    const step=now=>{
      if(!element.isConnected)return;
      const progress=Math.min(1,(now-start)/duration);
      element.textContent=format(Math.round(previous+(count-previous)*(1-Math.pow(1-progress,3))));
      if(progress<1)metricFrames.set(element,requestAnimationFrame(step));
      else{metricFrames.delete(element);element.classList.remove('population-pulse');}
    };
    metricFrames.set(element,requestAnimationFrame(step));
  }

  function animateDisplay(element,count,prefix=''){
    if(!element)return;
    count=nonnegative(count);
    const previous=Number(element.dataset.populationValue);
    if(previous===count)return;
    const frame=displayFrames.get(element);
    if(frame)window.cancelAnimationFrame(frame);
    element.dataset.populationValue=String(count);
    const format=value=>prefix+(value?value.toLocaleString():'Uninhabited');
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(!Number.isFinite(previous)||reduced||!element.isConnected){
      element.textContent=format(count);
      return;
    }
    element.classList.remove('population-pulse');
    void element.offsetWidth;
    element.classList.add('population-pulse');
    const start=window.performance.now(),duration=900;
    const step=now=>{
      if(!element.isConnected)return;
      const progress=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-progress,3);
      element.textContent=format(Math.round(previous+(count-previous)*eased));
      if(progress<1)displayFrames.set(element,window.requestAnimationFrame(step));
      else{displayFrames.delete(element);element.classList.remove('population-pulse');}
    };
    displayFrames.set(element,window.requestAnimationFrame(step));
  }

  function initialize(state,systems,sol){
    const galaxy=state.planetPopulationCounts&&typeof state.planetPopulationCounts==='object'?state.planetPopulationCounts:{};
    state.planetPopulationCounts=Object.fromEntries(systems.map(system=>{
      const saved=Number(galaxy[system.id]);
      const initial=nonnegative(Number(state.planetPopulations?.[system.id])*1e9);
      return [system.id,Number.isSafeInteger(saved)&&saved>=0?saved:initial];
    }));
    const savedSol=state.solPopulations&&typeof state.solPopulations==='object'?state.solPopulations:{};
    state.solPopulations=Object.fromEntries(sol.map(node=>{
      const saved=Number(savedSol[node.id]);
      return [node.id,Number.isSafeInteger(saved)&&saved>=0?saved:nonnegative(node.population)];
    }));
    // Star Charts starting figures supplied for Earth, the Moon, and Mars.
    // Apply once to saves made with the earlier placeholder populations.
    if(sol.length&&Number(state.populationBaselineVersion)!==2){
      for(const [systemId,localId] of [[1,3]]){
        const count=nonnegative(sol.find(node=>node.id===localId)?.population);
        state.planetPopulationCounts[systemId]=count;
        state.planetPopulations[systemId]=count/1e9;
        state.solPopulations[localId]=count;
      }
      for(const id of [4,5])state.solPopulations[id]=nonnegative(sol.find(node=>node.id===id)?.population);
      state.populationBaselineVersion=2;
    }
    state.populationClock=Math.max(0,Number(state.populationClock)||0)%tickSeconds;
    state.populationDayFraction=Math.max(0,Number(state.populationDayFraction)||0)%1;
    return state;
  }

  function countEvents(expected,random){
    const whole=Math.floor(expected);
    return whole+(random()<expected-whole?1:0);
  }

  function change(count,days,id,kind,random){
    if(count<=0||days<=0)return count;
    const year=days/daysPerYear;
    const births=countEvents(count*(kind==='sol'?.011:id===1?.010:.0105)*year,random);
    const deaths=countEvents(count*(kind==='sol'?.009:id===1?.011:.0095)*year,random);
    const migrationRate=kind==='sol'?(id===5?.004:(id%3-1)*.0015):id===1?-.0007:(id%5-2)*.0004;
    const expectedMigration=count*migrationRate*year;
    const variation=Math.sqrt(Math.max(1,births+deaths))*(random()-.5)*2;
    return nonnegative(count+births-deaths+Math.round(expectedMigration+variation));
  }

  function advanceDays(state,days,random=Math.random){
    days=Math.max(0,Number(days)||0);
    if(!days)return false;
    let changed=false;
    for(const [id,value] of Object.entries(state.planetPopulationCounts||{})){
      const next=change(nonnegative(value),days,Number(id),'galaxy',random);
      if(next!==value){state.planetPopulationCounts[id]=next;changed=true;}
    }
    for(const [id,value] of Object.entries(state.solPopulations||{})){
      if(Number(id)===3)continue; // Earth uses the galaxy's Earth population.
      const next=change(nonnegative(value),days,Number(id),'sol',random);
      if(next!==value){state.solPopulations[id]=next;changed=true;}
    }
    return changed;
  }

  function advanceSeconds(state,seconds,random=Math.random){
    if(!state||seconds<=0)return false;
    state.populationClock=(Number(state.populationClock)||0)+seconds;
    let changed=false;
    while(state.populationClock>=tickSeconds){
      state.populationClock-=tickSeconds;
      const days=tickSeconds/secondsPerDay;
      changed=advanceDays(state,days,random)||changed;
      state.populationDayFraction=(Number(state.populationDayFraction)||0)+days;
      if(state.populationDayFraction>=1){
        const whole=Math.floor(state.populationDayFraction+1e-9);
        state.day+=whole;
        state.populationDayFraction-=whole;
      }
    }
    return changed;
  }

  window.nativePopulation={initialize,advanceDays,advanceSeconds,animateDisplay,animateMetric};
})();
