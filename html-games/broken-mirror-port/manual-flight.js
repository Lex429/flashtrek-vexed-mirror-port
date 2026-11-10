/* Continuous coordinates for ordinary flight between the game's systems. */
(() => {
  'use strict';
  const systems = window.VexedMirrorWorld.systems;
  const byId = new Map(systems.map(system => [system.id, system]));
  const earth = byId.get(1).mapPosition;
  const unitsPerChartPoint = 1000;
  const arrivalRadius = 2500;
  // A relative floating-point tolerance, not an offset from the map border.
  const boundaryMargin = 0,edgeEpsilon=1e-10;
  let regionCatalog=null,regionRows=[];const locations=new WeakMap();
  // These two original systems have no chart coordinates or warp lane.
  const unchartedPositions = new Map([[51, {x:-250, y:-125}], [52, {x:-220, y:-160}]]);

  function chartPosition(id) {
    if(Number(id)===30&&window.nativeSystemCatalog){const base=byId.get(31).mapPosition,body=window.nativeSystemCatalog.bodies(31).find(b=>b.legacyWorldId===30);return {x:base.x+body.x/1000,y:base.y+body.y/1000};}
    return byId.get(Number(id))?.mapPosition || unchartedPositions.get(Number(id)) || null;
  }
  function anchor(id) {
    const position = chartPosition(id);
    return position ? {x:(position.x-earth.x)*unitsPerChartPoint, y:(position.y-earth.y)*unitsPerChartPoint} : null;
  }
  function localPosition(state) {
    return state.system === 1 && window.vexedSolFlight
      ? window.vexedSolFlight.shipPosition(state)
      : {x:Number(state.x)||0, y:Number(state.y)||0};
  }
  function position(state) {
    const origin = anchor(state.system), local = localPosition(state);
    return origin && {x:origin.x+local.x, y:origin.y+local.y};
  }
  function chartShipPosition(state) {
    const ship=position(state);
    return ship && {x:earth.x+ship.x/unitsPerChartPoint,y:earth.y+ship.y/unitsPerChartPoint};
  }
  // The chart and flight indicator share physical system envelopes. The saved
  // system is still the coordinate frame; deep space does not replace it.
  function boundaries(){
    const catalog=window.nativeSystemCatalog;
    if(regionCatalog!==catalog||!regionRows.length){
      regionCatalog=catalog;
      regionRows=(catalog?.records||systems).map(record=>{
        const origin=anchor(record.id),bounds=catalog?.boundary(record.id)||{x:-220,y:75,rx:arrivalRadius,ry:arrivalRadius};
        return origin&&bounds?Object.freeze({id:record.id,name:record.name,legacyIds:record.legacyIds||[record.id],x:origin.x+bounds.x,y:origin.y+bounds.y,rx:bounds.rx,ry:bounds.ry}):null;
      }).filter(Boolean);
    }
    return regionRows;
  }
  function regionAtPoint(state,ship,preferred=null){
    if(!ship)return {kind:'interstellar',system:null,name:'Interstellar space'};
    const rows=boundaries(),catalog=window.nativeSystemCatalog,score=row=>Math.hypot((ship.x-row.x)/row.rx,(ship.y-row.y)/row.ry);
    const previous=preferred==null?null:rows.find(row=>row.id===(catalog?.physicalId(preferred)??preferred));
    let region=previous&&score(previous)<=1+edgeEpsilon?previous:null;
    if(!region){let nearest=Infinity;for(const row of rows){const distance=score(row);if(distance<=1+edgeEpsilon&&distance<nearest){nearest=distance;region=row;}}}
    if(!region)return {kind:'interstellar',system:null,name:'Interstellar space'};
    const known=!!state.devMode||region.legacyIds.some(id=>state.discovered?.includes(id));
    return {kind:'system',system:region.id,name:known?region.name:`Unknown system S-${String(region.id).padStart(2,'0')}`,known};
  }
  function regionAt(state,previousSystem=undefined){return regionAtPoint(state,position(state),previousSystem===undefined?state.system:previousSystem);}
  function initializeRegion(state){
    const region=regionAt(state),saved=state.manualFlightRegion,sequence=Number(saved?.sequence)||0;
    state.manualFlightRegion={version:1,system:region.system,sequence};
    locations.set(state,{region,point:position(state),frame:state.system});return region;
  }
  function currentRegion(state){
    const retained=locations.get(state),point=position(state);
    if(retained&&retained.frame===state.system&&retained.point?.x===point?.x&&retained.point?.y===point?.y){
      // Discovery changes the display name without inventing another crossing.
      const region=retained.region;if(region.system==null)return region;
      return {...region,name:(state.devMode||state.discovered?.some(id=>window.nativeSystemCatalog?.physicalId(id)===region.system))?window.nativeSystemCatalog?.name(region.system)||region.name:region.name};
    }
    return regionAt(state,state.manualFlightRegion?.system);
  }
  function advanceRegion(state){
    if(window.nativeSimulation?.blocked?.())return null;
    const previous=locations.get(state)?.region||(state.manualFlightRegion?.version===1?{system:state.manualFlightRegion.system}:regionAt(state)),next=regionAt(state,previous.system);
    let entered=false;
    if(next.system!=null&&!window.nativeSystemCatalog?.sameSystem(next.system,state.system)&&next.system!==state.system){
      entered=enter(state,byId.get(next.system));
    }
    const changed=previous.system!==next.system;
    if(!state.manualFlightRegion||changed)state.manualFlightRegion={version:1,system:next.system,sequence:(Number(state.manualFlightRegion?.sequence)||0)+(changed?1:0)};
    locations.set(state,{region:next,point:position(state),frame:state.system});
    return changed||entered?{previous,next,entered,exited:next.system==null,sequence:state.manualFlightRegion.sequence}:null;
  }
  function planetPosition(id) {
    const origin = anchor(id);
    return origin && {x:origin.x-220, y:origin.y+75};
  }
  function guidance(state,id=state.manualTargetSystem) {
    const ship=position(state),destination=planetPosition(id),system=byId.get(Number(id));
    if(!ship||!destination||!system)return null;
    const dx=destination.x-ship.x,dy=destination.y-ship.y;
    const known=state.devMode||state.discovered?.includes(system.id);
    return {id:system.id,name:known?system.name:`Unknown system S-${String(system.id).padStart(3,'0')}`,dx,dy,distance:Math.hypot(dx,dy)};
  }
  function nearbySystem(state) {
    const region=regionAt(state,state.manualFlightRegion?.system);
    return region.system!=null&&region.system!==state.system&&!window.nativeSystemCatalog?.sameSystem(region.system,state.system)?byId.get(region.system)||null:null;
  }
  function enter(state,system) {
    const ship=position(state),origin=anchor(system.id);
    if(!ship||!origin)return false;
    state.system=system.id;
    state.planet=system.name;
    state.x=ship.x-origin.x;
    state.y=ship.y-origin.y;
    state.previousX=state.x;state.previousY=state.y;
    state.localBody=window.nativeSystemCatalog?.homeId(system.id)??(system.id===1?3:0);
    window.nativeSystemCatalog?.initialize(state);
    window.vexedSolFlight?.setTarget(state.localBody,state.system);
    state.landed=false;
    state.discovered=[...new Set([...(state.discovered||[]),system.id])];
    return true;
  }
  window.nativeManualFlight={systems,chartPosition,anchor,position,chartShipPosition,boundaries,regionAtPoint,regionAt,initializeRegion,currentRegion,advanceRegion,planetPosition,guidance,nearbySystem,enter,unitsPerChartPoint,arrivalRadius,boundaryMargin};
})();
