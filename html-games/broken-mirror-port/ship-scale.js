/* Static, event-driven scale comparison. It never activates or saves a game. */
(() => {
  'use strict';
  const api=window.nativeShipScale,$=selector=>document.querySelector(selector);
  const rows=api.roster(),byId=new Map(rows.map(row=>[row.id,row]));
  const state={mode:'current',zoom:2.4,preset:'all',search:'',filter:'all',selected:api.anchor.id,ready:false,errors:[]};
  let scale=null;
  const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const number=value=>Number(value).toLocaleString('en-US',{maximumFractionDigits:1,minimumFractionDigits:0});
  const units=value=>number(value)+' u';
  const pending=row=>!row.reference||row.status==='provisional';
  const statusLabel=row=>({official:'Official',licensed:'Licensed reference',museum:'Museum reference',provisional:'Provisional',unverified:'Unverified'}[row.status]);
  const meters=row=>row.reference?(row.reference.approximate||row.status==='provisional'?'≈ ':'')+number(row.reference.meters)+' m':'Unverified';
  const change=row=>row.geometry?.changePercent===null||!row.geometry?'—':(row.geometry.changePercent>=0?'+':'')+number(row.geometry.changePercent)+'%';
  const featureIndex=id=>{const index=api.featured.indexOf(id);return index<0?100:index;};
  rows.sort((a,b)=>featureIndex(a.id)-featureIndex(b.id)||Number(!a.reference)-Number(!b.reference)||
    (a.reference?.meters??a.dimensions.height)-(b.reference?.meters??b.dimensions.height)||a.id-b.id);

  function filtered(){
    return rows.filter(row=>(!state.search||[row.name,row.label,row.reference?.name,row.id].join(' ').toLowerCase().includes(state.search))&&
      (state.filter==='all'||state.filter==='pending'&&pending(row)||state.filter==='sourced'&&!pending(row)||
        state.filter==='provisional'&&row.status==='provisional'||state.filter==='parents'&&row.parentReferences.length>0||
        state.filter==='unmatched'&&!row.reference&&!row.parentReferences.length));
  }
  function lineupRows(){return filtered().filter(row=>row.geometry&&(state.preset==='all'||api.featured.includes(row.id)));}
  function size(row){return state.mode==='corrected'&&row.geometry.corrected?row.geometry.corrected:row.geometry.current;}
  function badge(row){return '<span class="badge'+(pending(row)?' pending':'')+'">'+statusLabel(row)+'</span>';}
  function sourceLink(source,label=source.title){return '<a class="source-link" href="'+escape(source.url)+'" target="_blank" rel="noopener noreferrer">'+escape(label)+' ↗</a>';}
  function parentLinks(row){return row.parentReferences.map(parent=>sourceLink(parent.source,parent.name+': '+(parent.approximate?'≈ ':'')+number(parent.meters)+' m')).join('<br>');}

  function renderLineup(){
    const list=lineupRows(),container=$('#fleet-lineup'),stage=$('#lineup-stage'),scroll=$('#lineup-scroll'),oldScroll=scroll.scrollLeft;
    const height=Math.max(110,...list.map(row=>size(row).height*state.zoom))+38;
    stage.style.setProperty('--hull-height',height+'px');
    stage.querySelectorAll('.grid-line').forEach(line=>line.remove());
    const ruler=$('#ruler');ruler.replaceChildren();ruler.style.height=height+'px';
    const pxPerMeter=scale?.unitsPerMeter*state.zoom,step=100*pxPerMeter>=30?100:200*pxPerMeter>=30?200:500;
    for(let m=0;scale&&m*pxPerMeter<=height-8;m+=step){
      const tick=document.createElement('span');tick.className='ruler-tick';tick.textContent=number(m)+' m';tick.style.top=(height-m*pxPerMeter-5)+'px';ruler.append(tick);
      const line=document.createElement('div');line.className='grid-line'+(m===0?' baseline':'');line.style.top=(26+height-m*pxPerMeter)+'px';stage.prepend(line);
    }
    const fragment=document.createDocumentFragment();
    for(const row of list){
      const dimensions=size(row),w=dimensions.width*state.zoom,h=dimensions.height*state.zoom;
      const card=document.createElement('button');card.type='button';card.dataset.ship=String(row.id);
      card.className='fleet-card '+(pending(row)?row.status:'')+(row.id===state.selected?' selected':'');
      card.setAttribute('aria-label',row.name+', '+meters(row)+', inspect size comparison');
      card.setAttribute('aria-pressed',String(row.id===state.selected));
      card.style.width=Math.max(106,w+26)+'px';
      const bay=document.createElement('div');bay.className='hull-bay';
      row.canvas.style.width=w+'px';row.canvas.style.height=h+'px';row.canvas.setAttribute('aria-hidden','true');bay.append(row.canvas);
      const cap=document.createElement('span');cap.className='hull-cap';cap.textContent=meters(row);cap.style.bottom=(h+12)+'px';bay.append(cap);card.append(bay);
      const label=document.createElement('span');label.className='ship-label';
      label.innerHTML='<strong>'+escape(row.label)+'</strong><small>'+escape(row.reference?.name||'Reference needed')+'</small>';
      card.append(label);card.addEventListener('click',()=>select(row.id));fragment.append(card);
    }
    if(!list.length){const message=document.createElement('p');message.className='empty-state';message.textContent='No loaded ships match this comparison. Choose All ships or change the filters.';fragment.append(message);}
    container.replaceChildren(fragment);scroll.scrollLeft=oldScroll;
    $('#lineup-caption').textContent=list.length+' ships · '+(state.mode==='corrected'?'Danube fixed at its in-game size':'Current apparent lengths on the Danube ruler');
    document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode)));
    $('#show-all').classList.toggle('active',state.preset==='all');$('#show-heroes').classList.toggle('active',state.preset==='heroes');
    $('#zoom-value').value=state.zoom.toFixed(1)+'×';
  }

  function renderTable(){
    const list=filtered(),fragment=document.createDocumentFragment();
    for(const row of list){
      const g=row.geometry,tr=document.createElement('tr');tr.dataset.ship=String(row.id);tr.classList.toggle('selected',row.id===state.selected);
      const current=g?units(g.current.height):'…',corrected=g?.corrected?units(g.corrected.height):row.reference?'…':'Pending reference';
      tr.innerHTML='<td><button type="button" class="table-ship" data-inspect="'+row.id+'">'+
        (row.thumbnail?'<img src="'+row.thumbnail+'" alt="" width="24" height="34">':'')+
        '<span><strong>'+escape(row.label)+'</strong><small>'+escape(row.reference?.name||row.name)+' · #'+row.id+'</small></span></button></td>'+
        '<td class="'+(pending(row)?'pending-value':'')+'">'+escape(meters(row))+'</td>'+
        '<td>'+escape(current)+'<small class="sub-value">'+units(row.dimensions.height)+' sprite</small></td>'+
        '<td class="'+(g?.corrected?'corrected-value':'pending-value')+'">'+escape(corrected)+
          (g?.corrected?'<small class="sub-value">'+units(g.proposedFrameHeight)+' sprite</small>':'')+'</td>'+
        '<td class="change-value'+(g?.changePercent<0?' shrink':'')+'">'+change(row)+'</td>'+
        '<td>'+badge(row)+(row.reference?sourceLink(row.reference.source):row.parentReferences.length?'<span class="sub-value">Parent hull only</span>'+parentLinks(row):'<span class="sub-value">Exact hull not documented</span>')+'</td>';
      tr.querySelector('[data-inspect]').addEventListener('click',()=>{
        if(state.preset==='heroes'&&!api.featured.includes(row.id)){state.preset='all';renderLineup();}
        select(row.id,true);
        $('#ship-detail').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      });
      fragment.append(tr);
    }
    $('#ship-table').replaceChildren(fragment);$('#chart-count').textContent=String(list.length)+' entries';$('#table-empty').hidden=!!list.length;
  }

  function renderDetail(){
    const row=byId.get(state.selected),root=$('#ship-detail');
    if(!row?.geometry){root.hidden=true;return;}
    const g=row.geometry,reference=row.reference,source=reference?.source;
    const provenance=source?sourceLink(source):row.parentReferences.length?'Parent hull references only:<br>'+parentLinks(row):'A reference for this exact hull is still needed.';
    root.innerHTML='<div class="detail-name"><h3>'+escape(row.label)+'</h3><p>'+escape(row.name)+' · roster #'+row.id+'</p></div>'+
      '<div class="detail-stat"><span>REFERENCE LENGTH</span><strong>'+escape(meters(row))+'</strong><small>'+escape(reference?.name||'Exact design unverified')+'</small></div>'+
      '<div class="detail-stat"><span>CURRENT VISIBLE HULL</span><strong>'+units(g.current.height)+'</strong><small>'+units(row.dimensions.height)+' flight sprite</small></div>'+
      '<div class="detail-stat"><span>CORRECTED VISIBLE HULL</span><strong class="'+(g.corrected?'corrected-value':'pending-value')+'">'+(g.corrected?units(g.corrected.height):'Pending')+'</strong><small>'+(g.corrected?change(row)+' · '+units(g.proposedFrameHeight)+' flight sprite':'Current size retained in the lineup')+'</small></div>'+
      '<div class="detail-source">'+badge(row)+provenance+(row.notes?'<p>'+escape(row.notes)+'</p>':'')+
        (row.supportingSources.length?'<p>Supporting references: '+row.supportingSources.map(source=>sourceLink(source)).join(' · ')+'</p>':'')+'</div>';
    root.hidden=false;
  }
  function select(id,scroll=false){
    state.selected=id;
    document.querySelectorAll('[data-ship]').forEach(node=>{node.classList.toggle('selected',Number(node.dataset.ship)===id);if(node.classList.contains('fleet-card'))node.setAttribute('aria-pressed',String(Number(node.dataset.ship)===id));});
    renderDetail();
    if(scroll){const card=$('.fleet-card[data-ship="'+id+'"]'),root=$('#lineup-scroll');if(card)root.scrollLeft=card.offsetLeft-root.clientWidth/2+card.offsetWidth/2;}
  }
  function render(){renderLineup();renderTable();renderDetail();}

  async function loadArt(row,catalog){
    const entry=catalog.ships.find(ship=>ship.id===row.id);
    if(!entry?.frames?.[0])throw Error('Missing catalog artwork for '+row.name);
    const image=await new Promise((resolve,reject)=>{
      const art=new Image(),timer=setTimeout(()=>reject(Error('Artwork timed out: '+row.name)),30000);
      art.onload=()=>{clearTimeout(timer);resolve(art);};art.onerror=()=>{clearTimeout(timer);reject(Error('Artwork unavailable: '+row.name));};
      art.src='../flashtrek-broken-mirror/showcase-assets/'+entry.frames[0];
    });
    const art=row.profile?.align?await row.profile.align(image,0):image;
    const sample=document.createElement('canvas');sample.width=art.width;sample.height=art.height;
    const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(art,0,0);
    const bounds=api.alphaBounds(context.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height);
    if(row.id===api.anchor.id){
      scale=api.createScale(row,bounds,sample);
      $('#anchor-units').textContent=number(scale.anchor.units);
      $('#anchor-frame').textContent=units(scale.anchor.frameUnits)+' flight frame · kept at its in-game size';
    }
    row.geometry=api.geometry(row,bounds,sample,scale);
    const resolution=Math.min(1,512/Math.max(bounds.width,bounds.height));
    row.canvas=document.createElement('canvas');row.canvas.width=Math.max(1,Math.ceil(bounds.width*resolution));row.canvas.height=Math.max(1,Math.ceil(bounds.height*resolution));
    const g=row.canvas.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(sample,bounds.x,bounds.y,bounds.width,bounds.height,0,0,row.canvas.width,row.canvas.height);
    const thumbnail=document.createElement('canvas');thumbnail.height=90;thumbnail.width=Math.max(1,Math.round(90*bounds.width/bounds.height));
    thumbnail.getContext('2d').drawImage(row.canvas,0,0,thumbnail.width,thumbnail.height);row.thumbnail=thumbnail.toDataURL('image/png');
    sample.width=sample.height=1;
  }

  function exportCsv(){
    const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
    const table=[['ID','Ship','Class','Reference meters','Reference status','Current flight frame units','Current visible hull units','Corrected visible hull units','Corrected flight frame units','Change percent','Source','Notes','Parent hull references','Supporting sources'],
      ...filtered().map(row=>[row.id,row.name,row.reference?.name,row.reference?.meters,statusLabel(row),row.dimensions.height,
        row.geometry?.current.height,row.geometry?.corrected?.height,row.geometry?.proposedFrameHeight,row.geometry?.changePercent,row.reference?.source.url,row.notes,
        row.parentReferences.map(parent=>parent.name+': '+parent.meters+' m ('+parent.source.url+')').join('; '),row.supportingSources.map(source=>source.url).join('; ')])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+table.map(line=>line.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='vexed-mirror-federation-scale.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.mode;renderLineup();}));
  $('#fleet-zoom').addEventListener('input',event=>{state.zoom=Number(event.target.value);renderLineup();});
  $('#show-all').addEventListener('click',()=>{state.preset='all';state.filter='all';state.search='';$('#ship-search').value='';$('#reference-filter').value='all';render();$('#lineup-scroll').scrollLeft=0;});
  $('#show-heroes').addEventListener('click',()=>{state.preset='heroes';state.filter='all';state.search='';$('#ship-search').value='';$('#reference-filter').value='all';render();$('#lineup-scroll').scrollLeft=0;});
  $('#reset-view').addEventListener('click',()=>{state.zoom=2.4;$('#fleet-zoom').value='2.4';renderLineup();$('#lineup-scroll').scrollLeft=0;});
  $('#ship-search').addEventListener('input',event=>{state.search=event.target.value.toLowerCase().trim();render();});
  $('#reference-filter').addEventListener('change',event=>{state.filter=event.target.value;render();});
  $('#export-csv').addEventListener('click',exportCsv);
  $('#total-count').textContent=rows.length;$('#reference-count').textContent=rows.filter(row=>!pending(row)).length;$('#pending-count').textContent=rows.filter(pending).length;

  async function boot(){
    render();const status=$('#load-status');
    const response=await fetch('../flashtrek-broken-mirror/showcase-assets/catalog.json');if(!response.ok)throw Error('Ship artwork catalog could not be loaded');
    const catalog=await response.json();
    // Calibrate from Danube's actual aligned artwork before any other hull.
    // Its current visible dimensions and full flight frame are both retained.
    await loadArt(byId.get(api.anchor.id),catalog);
    const queue=rows.filter(row=>row.id!==api.anchor.id);let next=0,complete=1;
    async function worker(){
      while(next<queue.length){const row=queue[next++];try{await loadArt(row,catalog);}catch(error){state.errors.push(String(error));}
        complete++;status.textContent='Loading ship artwork · '+complete+' / '+rows.length;
        // Yield between completed hulls; no continuous animation or game loop.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    await Promise.all(Array.from({length:3},worker));state.ready=true;render();
    status.textContent=state.errors.length?'Some artwork could not be loaded. Refresh to retry. '+state.errors.join(' '):'All '+rows.length+' ships loaded · original artwork · no game save changes';
    status.classList.toggle('error',!!state.errors.length);
  }
  const ready=boot().catch(error=>{state.errors.push(String(error));$('#load-status').textContent='Unable to load the fleet: '+error;$('#load-status').classList.add('error');});
  window.shipScaleAtlas=Object.freeze({ready,snapshot:()=>({ready:state.ready,errors:[...state.errors],mode:state.mode,zoom:state.zoom,
    preset:state.preset,anchor:scale?.anchor||api.anchor,unitsPerMeter:scale?.unitsPerMeter??null,rosterCount:rows.length,sourceCount:rows.filter(row=>!pending(row)).length,pendingCount:rows.filter(pending).length,
    rows:rows.map(({id,name,status,reference,dimensions,geometry,parentReferences})=>({id,name,status,meters:reference?.meters??null,dimensions,geometry,parentReferences}))})});
})();
