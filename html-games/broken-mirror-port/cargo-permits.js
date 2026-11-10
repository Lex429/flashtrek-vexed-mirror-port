/* Freight clearance policy and saved ship documents. Market owners collect fees. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,regulated=new Set([2,3,7,8]),relief=new Set([5,6]);
  const documents=state=>Array.isArray(state.cargoPermits?.documents)?state.cargoPermits.documents:[];
  const day=state=>Math.max(1,Math.floor(Number(state.day)||1));
  function authority(state,system){
    const entry=world.systems.find(entry=>entry.id===Number(system));
    const government=Number(state.planetGovts?.[system]??entry?.governmentId??0);
    const name=government===16?String(state.government||'Your government'):world.governments.find(entry=>entry.id===government)?.name||'Independent';
    const standing=window.nativeFactionStanding?.relationship(state,Number(system))?.status||
      (government===16?'Your territory':Number(state.localPrestige?.[system])>=100?'Allied':Number(state.localPrestige?.[system])<0?'Hostile':'Neutral');
    return {government,name,standing};
  }
  function evaluate(state,{toSystem,toPort,good}){
    toSystem=Number(toSystem);toPort=Number(toPort);good=Number(good);
    const issuer=authority(state,toSystem),base={version:1,government:issuer.government,faction:issuer.name,standing:issuer.standing,toSystem,toPort,good,fee:0};
    if(issuer.standing==='Allied'||issuer.standing==='Your territory'||issuer.government===0)
      return {...base,allowed:true,required:false,status:'clear',kind:'allied',label:'Clearance granted'};
    if(issuer.standing==='Neutral'&&!regulated.has(good))
      return {...base,allowed:true,required:false,status:'clear',kind:'civilian',label:'Clearance granted'};
    if(issuer.standing==='Hostile'&&relief.has(good))
      return {...base,allowed:true,required:true,status:'employer',kind:'humanitarian',label:'Employer provides relief pass'};
    const kind=issuer.standing==='Hostile'?'passage':'trade',fee=kind==='passage'?600:200;
    const held=documents(state).find(doc=>doc.version===1&&doc.status==='valid'&&doc.usesRemaining===1&&doc.government===issuer.government&&doc.toSystem===toSystem&&doc.toPort===toPort&&doc.good===good&&doc.kind===kind);
    return {...base,kind,fee,allowed:!!held,required:true,status:held?'valid':'required',permitId:held?.id,
      label:held?'Valid pass aboard':kind==='passage'?'Trade-passage pass required':'Trade permit required'};
  }
  function issue(state,clearance,{source='purchased',fee=0,jobId=null,tons=null}={}){
    const ledger=state.cargoPermits||{version:1,nextId:1,documents:[]};
    const sequence=Math.max(1,Math.floor(Number(ledger.nextId)||1));
    const id='cargo-permit:'+sequence,reference='TRD-'+String(sequence).padStart(5,'0');
    const record={version:1,id,reference,kind:clearance.kind,
      title:clearance.kind==='humanitarian'?'Humanitarian delivery pass':clearance.kind==='passage'?'Trade-passage pass':'Trade permit',
      government:clearance.government,issuer:clearance.faction+(source==='employer'?' Relief Office':' Trade Office'),
      toSystem:clearance.toSystem,toPort:clearance.toPort,good:clearance.good,
      holder:{captain:String(state.captain||'Captain'),ship:String(state.shipName||'Your ship')},
      issuedDay:day(state),source,fee,status:jobId===null?'valid':'assigned',usesRemaining:jobId===null?1:0,jobId,tons};
    state.cargoPermits={version:1,nextId:sequence+1,documents:[...documents(state),record]};
    return record;
  }
  function update(state,id,changes){
    if(!state.cargoPermits)return;
    state.cargoPermits={...state.cargoPermits,documents:documents(state).map(doc=>doc.id===id?{...doc,...changes}:doc)};
  }
  function authorize(state,job){
    const clearance=evaluate(state,{toSystem:job.toSystem??1,toPort:job.to,good:job.good});
    if(!clearance.allowed)return {ok:false,error:clearance.label+'. Obtain the paperwork before loading.'};
    let document=null;
    if(clearance.status==='employer')document=issue(state,clearance,{source:'employer',jobId:job.id,tons:job.tons});
    else if(clearance.permitId){
      document=documents(state).find(doc=>doc.id===clearance.permitId);
      if(!document||document.status!=='valid'||document.usesRemaining!==1)return {ok:false,error:'This pass is no longer available.'};
      update(state,document.id,{status:'assigned',usesRemaining:0,jobId:job.id,tons:job.tons,assignedDay:day(state)});
    }
    job.authorization={version:1,jobId:job.id,toSystem:job.toSystem??1,toPort:job.to,good:job.good,tons:job.tons,
      government:clearance.government,faction:clearance.faction,kind:clearance.kind,issuedDay:day(state),
      permitId:document?.id||null,reference:document?.reference||null};
    return {ok:true};
  }
  function validShipment(job){
    const authorization=job.authorization;
    // Existing accepted shipments retain permission; new grants are shipment-bound.
    return !authorization||authorization.version===1&&authorization.jobId===job.id&&authorization.toSystem===(job.toSystem??1)&&authorization.toPort===job.to&&authorization.good===job.good&&(authorization.tons===undefined||authorization.tons===job.tons);
  }
  function complete(state,job){
    const id=job.authorization?.permitId;if(!id)return;
    const document=documents(state).find(doc=>doc.id===id);
    if(document?.status==='assigned'&&document.jobId===job.id)update(state,id,{status:'completed',completedDay:day(state)});
  }
  function recordStatus(state,document){
    if(document.status==='assigned')return 'Assigned to shipment';
    if(document.status==='completed')return 'Delivery completed';
    if(document.government!==authority(state,document.toSystem).government)return 'Issuing authority changed';
    const current=evaluate(state,{toSystem:document.toSystem,toPort:document.toPort,good:document.good});
    if(current.required&&current.kind!==document.kind)return 'Additional clearance required';
    return 'Valid for one delivery';
  }
  window.nativeCargoPermits=Object.freeze({documents,authority,evaluate,issue,authorize,validShipment,complete,recordStatus});
})();
