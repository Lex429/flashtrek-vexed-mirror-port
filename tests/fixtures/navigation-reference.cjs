/* Historical unindexed solver: equivalence oracle, not used by gameplay. */
module.exports=clearSegment=>function obstaclePoints(start,goal,circles,padding=0){
    if(clearSegment(start,goal,circles,padding))return [];
    if(circles.some(c=>Math.hypot(goal.x-c.x,goal.y-c.y)<c.radius+padding-1e-5))return null;
    // Vertices lie outside circumscribed twelve-sided clearance polygons.
    // Every candidate edge is checked against every obstacle, not just the one
    // that caused the initial diversion. This runs at route creation, not paint.
    const nodes=[start,goal],count=12,direct=Math.hypot(goal.x-start.x,goal.y-start.y),margin=4*Math.max(0,...circles.map(c=>c.radius+padding));
    const relevant=circles.filter(c=>Math.hypot(start.x-c.x,start.y-c.y)+Math.hypot(goal.x-c.x,goal.y-c.y)<=direct+margin);
    relevant.sort((a,b)=>(Math.hypot(start.x-a.x,start.y-a.y)+Math.hypot(goal.x-a.x,goal.y-a.y))-(Math.hypot(start.x-b.x,start.y-b.y)+Math.hypot(goal.x-b.x,goal.y-b.y)));
    for(const body of relevant.slice(0,10)){
      const radius=(body.radius+padding+.5)/Math.cos(Math.PI/count);
      for(let i=0;i<count;i++){
        const a=i*Math.PI*2/count,p={x:body.x+Math.cos(a)*radius,y:body.y+Math.sin(a)*radius};
        if(circles.every(c=>Math.hypot(p.x-c.x,p.y-c.y)>=c.radius+padding))nodes.push(p);
      }
    }
    if(relevant.length>10){
      const left=Math.min(...relevant.map(c=>c.x-c.radius-padding))-1,right=Math.max(...relevant.map(c=>c.x+c.radius+padding))+1;
      const top=Math.min(...relevant.map(c=>c.y-c.radius-padding))-1,bottom=Math.max(...relevant.map(c=>c.y+c.radius+padding))+1;
      nodes.push({x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom});
    }
    const cost=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set();cost[0]=0;
    for(let step=0;step<nodes.length;step++){
      let best=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(best<0||cost[i]<cost[best]))best=i;
      if(best<0||!Number.isFinite(cost[best]))break;
      if(best===1){const path=[];for(let at=1;previous[at]>0;at=previous[at])path.unshift(nodes[previous[at]]);return path;}
      visited.add(best);
      for(let i=1;i<nodes.length;i++)if(!visited.has(i)&&clearSegment(nodes[best],nodes[i],circles,padding)){
        const next=cost[best]+Math.hypot(nodes[i].x-nodes[best].x,nodes[i].y-nodes[best].y);
        if(next<cost[i]){cost[i]=next;previous[i]=best;}
      }
    }
    return null;
  };
