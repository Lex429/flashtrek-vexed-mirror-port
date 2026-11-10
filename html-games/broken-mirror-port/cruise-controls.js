/* The host updates this display; cancelling delegates to navigation. */
(() => {
  'use strict';
  const root=document.createElement('section');root.id='cruise-controls';root.hidden=true;root.setAttribute('aria-label','Cruise control');
  root.innerHTML='<div class="cruise-course"><span class="cruise-kicker">CRUISE CONTROL</span><strong class="cruise-destination" role="status" aria-live="polite"></strong><span class="cruise-hint"></span></div><span class="cruise-distance"></span><button type="button" class="cruise-cancel">Cancel Cruise <kbd>C</kbd></button>';
  document.getElementById('game').append(root);
  const destination=root.querySelector('.cruise-destination'),hint=root.querySelector('.cruise-hint'),distance=root.querySelector('.cruise-distance'),cancel=root.querySelector('button');
  const put=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  cancel.onclick=()=>window.nativeNavigation.call('cancel-cruise');
  root.addEventListener('keydown',event=>{if((event.key==='Enter'||event.code==='Space')&&event.target.closest('button'))event.stopPropagation();});
  let elapsed=0,observed=null;
  window.nativeCruiseControls=Object.freeze({update(state,{dt=0,visible=true,paused=false}={}){
    const active=!!state&&(state.localCruise||state.arrivalApproach);
    root.hidden=!active||!visible;if(root.hidden){observed=null;return;}
    cancel.disabled=paused;elapsed+=Math.max(0,dt);
    if(observed===active&&elapsed<.1)return;observed=active;elapsed=0;
    const course=window.nativePlayerCruise.snapshot(state);if(!course){root.hidden=true;return;}
    root.dataset.mode=course.manual?'manual':'autopilot';
    put(destination,'Cruising to '+course.name);
    put(hint,course.manual?'Manual control · Release controls to resume':'Autopilot engaged · Steer anytime');
    put(distance,Math.ceil(course.distance).toLocaleString()+' units');
  }});
})();
