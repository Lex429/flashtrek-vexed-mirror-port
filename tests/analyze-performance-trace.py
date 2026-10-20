"""Summarize diagnostic traces without adding overlapping parent/child events.

Per-thread unions are wall time inside trace events, not GPU execution duration.
Presentation counts refer to headless Display::DrawAndSwap, not monitor scanout.
"""
import argparse
import json
from pathlib import Path
import statistics

def union(intervals):
    total=0;end=None
    for left,right in sorted(intervals):
        if end is None or left>end:total+=right-left
        elif right>end:total+=right-end
        end=max(right,end if end is not None else right)
    return total/1000

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('trace',type=Path);args=parser.parse_args()
    data=json.loads(args.trace.read_text(encoding='utf-8'));events=data['traceEvents']
    start=next(e['ts'] for e in events if e.get('name')=='vexed-measure-start')
    end=next(e['ts'] for e in events if e.get('name')=='vexed-measure-end')
    complete=[];stacks={}
    for event in events:
        key=(event.get('pid'),event.get('tid'));phase=event.get('ph')
        if phase=='B':stacks.setdefault(key,[]).append(event)
        elif phase=='E' and stacks.get(key):
            begin=stacks[key].pop();complete.append({**begin,'dur':event['ts']-begin['ts']})
        elif phase=='X':complete.append(event)
    rows={};families={name:{} for name in ['raster','compositor','gpuService','garbageCollection','animationCallbacks']}
    presentations=[]
    for event in complete:
        left=max(start,event.get('ts',0));right=min(end,event.get('ts',0)+event.get('dur',0))
        if right<=left:continue
        name=event.get('name','');thread=str(event['pid'])+':'+str(event['tid'])
        row=rows.setdefault(name,{'count':0,'maxMs':0,'intervals':{}});row['count']+=1;row['maxMs']=max(row['maxMs'],(right-left)/1000);row['intervals'].setdefault(thread,[]).append((left,right))
        family='raster' if name=='RasterTask' else 'compositor' if name in ['Display::DrawAndSwap','DrawFrame','BeginMainFrame','PaintArtifactCompositor::Update'] else 'gpuService' if name=='GpuChannel::ExecuteDeferredRequest' else 'garbageCollection' if name.startswith(('V8.GC','MinorGC','MajorGC')) else 'animationCallbacks' if name=='FireAnimationFrame' else None
        if family:families[family].setdefault(thread,[]).append((left,right))
        if name=='Display::DrawAndSwap':presentations.append(event['ts'])
    for row in rows.values():row['unionMsByThread']={thread:union(intervals) for thread,intervals in row.pop('intervals').items()}
    frame_intervals=[(right-left)/1000 for left,right in zip(sorted(presentations),sorted(presentations)[1:])]
    profile_path=args.trace.with_name(args.trace.name.replace('-trace.json','.cpuprofile'))
    self_times={}
    if profile_path.exists():
        profile=json.loads(profile_path.read_text(encoding='utf-8'));nodes={node['id']:node for node in profile['nodes']};at=profile['startTime']
        for sample,delta in zip(profile.get('samples',[]),profile.get('timeDeltas',[])):
            left=at;at+=delta;duration=max(0,min(end,at)-max(start,left))/1000
            if not duration:continue
            frame=nodes[sample]['callFrame'];key=frame.get('url','')+':'+str(frame.get('lineNumber',-1)+1)+' '+frame.get('functionName','')
            self_times[key]=self_times.get(key,0)+duration
    report={'windowMs':(end-start)/1000,'headlessPresentedFrames':len(presentations),'presentationIntervalsMs':{'mean':statistics.mean(frame_intervals) if frame_intervals else 0,'worst':max(frame_intervals,default=0)},
        'threadUnionsMs':{family:{thread:union(intervals) for thread,intervals in threads.items()} for family,threads in families.items()},
        'longestEventNames':sorted(({'name':name,**row} for name,row in rows.items()),key=lambda row:row['maxMs'],reverse=True)[:40],
        'selfSampleMs':sorted(self_times.items(),key=lambda item:item[1],reverse=True)[:40],
        'notes':['Never add thread unions or overlapping categories to game simulation/drawing timers. Inclusive event names are parent/child work; union removes overlap only within each named family/thread. CPU sampling reports leaf self time; native/idle samples need trace context. Hardware GPU execution latency is not equivalent to a raster-thread or compositor CPU event.']}
    output=args.trace.with_name(args.trace.name.replace('-trace.json','-trace-analysis.json'));output.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
