/* Browser input only. Movement, targeting and weapons retain their shared owners. */
(() => {
  'use strict';
  const deadZone=.18;
  const axis=value=>{
    value=Math.max(-1,Math.min(1,Number(value)||0));
    return Math.abs(value)<=deadZone?0:Math.sign(value)*(Math.abs(value)-deadZone)/(1-deadZone);
  };
  const sony=pad=>/dualsense|dualshock|054c|sony/i.test(pad.id);
  const label=pad=>/dualsense|0ce6|0df2/i.test(pad.id)?'DualSense':/dualshock|05c4|09cc/i.test(pad.id)?'DualShock':sony(pad)?'PlayStation controller':'Controller';
  function stickVector(x,y){
    x=Math.max(-1,Math.min(1,Number(x)||0));y=Math.max(-1,Math.min(1,Number(y)||0));
    const length=Math.hypot(x,y),strength=Math.max(0,(Math.min(1,length)-deadZone)/(1-deadZone));
    return {x:length?x/length*strength:0,y:length?y/length*strength:0,strength};
  }
  function flightCommand(input,ship){
    const flight=input?.flight;if(!flight)return null;
    const command={manualFlight:true,drift:!!flight.brake,turn:0,throttle:0,brake:!!flight.brake,brakeFactor:2};
    if(flight.strength>0){
      command.heading=Math.atan2(flight.y,flight.x);
      const error=command.heading-(Number(ship.heading??ship.angle)||0);
      // Turn using the shared hull limits; avoid thrusting away from the
      // requested direction while the nose is still facing the other way.
      command.throttle=flight.brake?0:flight.strength*Math.max(0,Math.cos(error));
    }
    return command;
  }
  function create({read=()=>navigator.getGamepads?.()||[],readDirect=()=>window.nativeControllerHaptics?.inputDevice?.()}={}){
    let identity=null,device=null,down=[],blocked=[],resetPending=true,stickBlocked=false,direction=null,repeatAt=0;
    let snapshot={connected:false,flight:null,keys:{},pressed:[],released:[],held:[],direction:null};
    function reset(){resetPending=true;snapshot={...snapshot,flight:null,keys:{},pressed:[],released:[],held:[],direction:null};}
    function poll(now=0,enabled=true){
      let pads=[];
      try{pads=Array.from(read()).filter(pad=>pad&&pad.connected!==false);}catch{}
      // Keep one input owner. Prefer native Sony input; use the permissioned
      // DualSense reports only when the browser has no usable Sony gamepad.
      if(!pads.some(pad=>sony(pad)&&pad.mapping==='standard')){
        try{const direct=readDirect();if(direct?.connected)pads.push(direct);}catch{}
      }
      // Prefer the requested PlayStation controller when an Xbox is also paired.
      pads.sort((a,b)=>Number(b.mapping==='standard')-Number(a.mapping==='standard')||Number(sony(b))-Number(sony(a))||a.index-b.index);
      const pad=pads[0],next=pad?`${pad.index}:${pad.id}`:null,changed=identity!==next;
      device=pad||null;
      if(changed){identity=next;resetPending=true;}
      if(!pad){down=[];blocked=[];direction=null;return snapshot={connected:false,changed,flight:null,keys:{},pressed:[],released:[],held:[],direction:null};}
      const values=Array.from(pad.buttons,button=>Math.max(0,Math.min(1,Number(button.value??button.pressed)||0)));
      const x=axis(pad.axes[0]),y=axis(pad.axes[1]),vector=stickVector(pad.axes[0],pad.axes[1]),supported=pad.mapping==='standard';
      if(resetPending||!enabled||!supported){
        blocked=values.map(value=>value>.35);down=values.map(()=>false);stickBlocked=vector.strength>0;direction=null;repeatAt=0;resetPending=false;
      }
      const pressed=[],released=[];
      for(let i=0;i<values.length;i++){
        if(blocked[i]){if(values[i]<=.35)blocked[i]=false;continue;}
        const held=down[i]?values[i]>.35:values[i]>=.65;
        if(held&&!down[i])pressed.push(i);
        if(!held&&down[i])released.push(i);
        down[i]=held;
      }
      if(!vector.strength)stickBlocked=false;
      const usable=enabled&&supported,stick=usable&&!stickBlocked;
      const keys=usable?{ArrowUp:!!down[12],ArrowDown:!!down[13],ArrowLeft:!!down[14],ArrowRight:!!down[15],KeyX:!!down[4]}:{};
      const steering=stick?vector:{x:0,y:0,strength:0};
      const flight=usable&&(steering.strength||down[4])?{...steering,brake:!!down[4]}:null;
      const nextDirection=!usable?null:down[12]?'up':down[13]?'down':down[14]?'left':down[15]?'right':stick&&Math.max(Math.abs(x),Math.abs(y))>.55?(Math.abs(y)>=Math.abs(x)?y<0?'up':'down':x<0?'left':'right'):null;
      let move=null;
      if(nextDirection!==direction){direction=nextDirection;if(direction){move=direction;repeatAt=now+380;}}
      else if(direction&&now>=repeatAt){move=direction;repeatAt=now+120;}
      return snapshot={connected:true,supported,changed,id:pad.id,index:pad.index,label:label(pad),playstation:sony(pad),source:pad.inputSource||'Gamepad',flight,keys,
        pressed:usable?pressed:[],released,held:usable?down.slice():[],direction:move};
    }
    return Object.freeze({poll,reset,get snapshot(){return snapshot;},get device(){return device;}});
  }
  // Existing menus remain the action owners; navigation only focuses/activates
  // their visible controls. Remember indexes across inventory/map rerenders.
  function menuNavigation(){
    const indexes=new WeakMap();let highlighted=null;
    function targets(root){return root?Array.from(root.querySelectorAll('button,input,select,a[href],[role="button"],[tabindex="0"]')).filter(node=>
      !node.disabled&&!node.closest('[hidden],[inert],[aria-hidden="true"]')&&node.getAttribute('aria-disabled')!=='true'&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'):[];}
    function focus(node){highlighted?.classList.remove('gamepad-focus');highlighted=node;node?.classList.add('gamepad-focus');node?.focus({preventScroll:true});node?.scrollIntoView?.({block:'nearest',inline:'nearest'});return node;}
    function adjust(node,step){
      if(node.matches('select')){
        const options=Array.from(node.options).filter(option=>!option.disabled);if(!options.length)return true;
        const index=options.indexOf(node.selectedOptions[0]);node.value=options[(index+step+options.length)%options.length].value;
        node.dispatchEvent(new Event('change',{bubbles:true}));return true;
      }
      if(node.matches('input[type="range"],input[type="number"]')){
        step>0?node.stepUp():node.stepDown();node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true;
      }
      return false;
    }
    function select(root,move){
      const nodes=targets(root);if(!nodes.length)return null;
      let index=nodes.indexOf(document.activeElement);
      if(index>=0&&(move==='left'||move==='right')&&adjust(nodes[index],move==='left'?-1:1))return nodes[index];
      if(index<0)index=Math.min(indexes.get(root)??0,nodes.length-1);
      else if(move)index=(index+(move==='up'||move==='left'?-1:1)+nodes.length)%nodes.length;
      // SVG map redraws can replace the focused destination between presses.
      if(nodes.indexOf(document.activeElement)<0&&indexes.has(root)&&move)index=(index+(move==='up'||move==='left'?-1:1)+nodes.length)%nodes.length;
      indexes.set(root,index);return focus(nodes[index]);
    }
    function activate(root){
      const node=select(root);if(!node)return;
      if(node.matches('select')){adjust(node,1);return;}
      if(node.matches('input:not([type="checkbox"]):not([type="radio"])'))return;
      if(typeof node.click==='function')node.click();
      else node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
    }
    function clear(){highlighted?.classList.remove('gamepad-focus');highlighted=null;}
    return {move:select,activate,clear};
  }
  window.nativeGamepadControls=Object.freeze({create,axis,stickVector,flightCommand,menuNavigation});
})();
