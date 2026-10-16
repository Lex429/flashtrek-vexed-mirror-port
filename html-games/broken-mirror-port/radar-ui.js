// Original native radar remains visible and interactive beneath a cosmetic bezel.
const localRadar=document.createElement('div');localRadar.id='local-radar';localRadar.hidden=true;localRadar.setAttribute('aria-hidden','true');game.appendChild(localRadar);
const radarGuide=document.createElement('button');radarGuide.id='radar-guide';radarGuide.type='button';radarGuide.hidden=true;game.appendChild(radarGuide);
let radarState;
function radarCall(action,value=0){return player?.ruffle().callExternalInterface('vexRadar',action,value);}
radarGuide.onclick=()=>openSol();
function refreshRadar(){
 if(Number(game.dataset.frame)!==154){localRadar.hidden=true;radarGuide.hidden=true;return;}
 const blocked=!solUI.hidden||!tradeUI.hidden||!galaxyMap.hidden||!setupUI.hidden||!saveUI.hidden;
 localRadar.hidden=blocked;if(blocked){radarGuide.hidden=true;return;}
 const s=radarCall('state');radarState=s;
 if(!s?.ok||!s.sol){radarGuide.hidden=true;return;}
 const selected=s.planets.find(n=>n.id===solSelected),goal=s.course?.id===-1?s.course:selected;
 if(!goal){radarGuide.hidden=true;return;}
 const dx=goal.x-s.position.x,dy=goal.y-s.position.y,distance=Math.round(Math.hypot(dx,dy));
 radarGuide.hidden=false;radarGuide.setAttribute('aria-label',`Open Sol map: ${goal.name}, ${distance} units`);
 radarGuide.title='Open Sol map (same as N)';
 radarGuide.innerHTML=`<span style="transform:rotate(${distance<320?0:Math.atan2(dy,dx)*180/Math.PI+90}deg)">${distance<320?'&#9673;':'&#8593;'}</span><div><b>${tradeEscape(goal.name)}</b><small>${distance.toLocaleString()} units</small></div>`;
}
function renderRadar(frame){if(frame!==154){localRadar.hidden=true;radarGuide.hidden=true;}else refreshRadar();}
setInterval(refreshRadar,300);
