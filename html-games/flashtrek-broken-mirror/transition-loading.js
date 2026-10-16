// One loading visual for native timeline transitions and modern menu actions.
const transitionLoader=document.createElement('div');
transitionLoader.id='transition-loader';transitionLoader.hidden=true;
transitionLoader.setAttribute('role','status');transitionLoader.setAttribute('aria-live','polite');
transitionLoader.innerHTML='<div class="boot-ship"><img src="startup/red-ship.png" alt=""></div><p class="boot-stage">Preparing your ship</p>';
game.appendChild(transitionLoader);
const transitionStyle=document.createElement('style');
transitionStyle.textContent='#transition-loader{position:absolute;inset:0;z-index:25;background:#000;overflow:hidden}#transition-loader[hidden]{display:none}#transition-loader .boot-stage{top:57%}';
document.head.appendChild(transitionStyle);
let transitionGeneration=0;
function beginGameLoading(message='Preparing your ship'){
 ++transitionGeneration;
 transitionLoader.querySelector('.boot-stage').textContent=message;
 transitionLoader.hidden=false;game.setAttribute('aria-busy','true');
}
function endGameLoading(){
 ++transitionGeneration;transitionLoader.hidden=true;game.removeAttribute('aria-busy');
 if(Number(game.dataset.frame)===154)focusGame();
}
function syncGameLoading(frame){
 // 111..132: game initialization. 147..153 are interactive panels.
 // 155..181: travel or death transition; 182 is the interactive death menu.
 if((frame>=111&&frame<=132)||(frame>=155&&frame<182)||(frame>=184&&frame<=196)){
  beginGameLoading(frame>=157?'Returning to command':frame>=155?'Entering system':'Preparing your ship');
 }else if(frame===154){
  if(transitionLoader.hidden)return;
  const generation=transitionGeneration;
  // Let the new flight frame and its canvas overlays paint before uncovering it.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(generation===transitionGeneration&&Number(game.dataset.frame)===154)endGameLoading();
  }));
 }else endGameLoading();
}
function runWithGameLoading(message,action,onResult){
 beginGameLoading(message);
 // Paint the loader before synchronous Flash save restoration/initialization.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  try{const result=action();if(onResult?.(result)===false)endGameLoading();}
  catch(error){endGameLoading();throw error;}
 }));
}
