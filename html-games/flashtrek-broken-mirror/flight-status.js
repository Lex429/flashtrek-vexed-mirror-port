const flightNotices=document.createElement('div');flightNotices.id='flight-notices';flightNotices.setAttribute('role','log');flightNotices.setAttribute('aria-live','polite');flightNotices.setAttribute('aria-label','Notifications');flightStatus.prepend(flightNotices);
function gameNotify(message,kind='sol'){
 if(Number(game.dataset.frame)!==154||!message)return;
 const text=String(message);let card=Array.from(flightNotices.children).find(n=>n.dataset.message===text);
 if(!card){card=document.createElement('div');card.className='flight-notice';card.dataset.message=text;card.dataset.kind=kind;card.title=text;const label=document.createElement('span');label.textContent=text;card.append(label);flightNotices.prepend(card);}
 card.classList.remove('leaving');clearTimeout(card.expire);clearTimeout(card.removeAfter);
 card.expire=setTimeout(()=>{card.classList.add('leaving');card.removeAfter=setTimeout(()=>card.remove(),300);},5000);
 while(flightNotices.children.length>4){const old=flightNotices.lastElementChild;clearTimeout(old.expire);clearTimeout(old.removeAfter);old.remove();}
}
function clearFlightNotices(){for(const card of flightNotices.children){clearTimeout(card.expire);clearTimeout(card.removeAfter);}flightNotices.replaceChildren();}
new MutationObserver(()=>{if(Number(game.dataset.frame)!==154)clearFlightNotices();}).observe(game,{attributes:true,attributeFilter:['data-frame']});
