"""Sequential, same-fixture fleet capacity measurements through the real game.

This driver uses the shared clean timing owner; it does not run tracing or other
browser workloads concurrently. Results are measurements, not portable FPS gates.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/fleet-scalability'
CASES={
    'current':dict(population=0,visible=12,system='existing',dpr=1),
    '1000-regional':dict(population=1000,visible=12,system='existing',dpr=1),
    '5000-regional':dict(population=5000,visible=12,system='existing',dpr=1),
    '1000-one-system':dict(population=1000,visible=12,system='current',dpr=1),
    '5000-one-system':dict(population=5000,visible=12,system='current',dpr=1),
    '1000-active-regional':dict(population=1000,visible=12,system='existing',dpr=1,active=True),
    '5000-active-regional':dict(population=5000,visible=12,system='existing',dpr=1,active=True),
    '25-visible':dict(population=0,visible=25,system='existing',dpr=1),
    '50-visible':dict(population=0,visible=50,system='existing',dpr=1),
    '100-visible':dict(population=0,visible=100,system='existing',dpr=1),
    '50-visible-dpr2':dict(population=0,visible=50,system='existing',dpr=2),
}

def percentile(values,fraction):
    if not values:return 0
    ordered=sorted(values);return ordered[min(len(ordered)-1,int((len(ordered)-1)*fraction))]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--label',required=True)
    parser.add_argument('--revision-label',default='working tree')
    parser.add_argument('--fixture',type=Path,required=True)
    parser.add_argument('--seconds',type=float,default=20)
    parser.add_argument('--runs',type=int,default=3)
    parser.add_argument('--seed',type=int,default=4292026)
    parser.add_argument('--width',type=int,default=1280)
    parser.add_argument('--height',type=int,default=850)
    parser.add_argument('--cases',default=','.join(CASES))
    parser.add_argument('--scenarios',default='crowdedFlight')
    args=parser.parse_args();OUTPUT.mkdir(parents=True,exist_ok=True)
    assert args.fixture.exists(),'Create the isolated fixture once before the matrix'
    selected=args.cases.split(',');assert all(name in CASES for name in selected)
    fixture_hash=hashlib.sha256(args.fixture.read_bytes()).hexdigest()
    result={'label':args.label,'sourceRoot':str(args.source_root.resolve()),'initialSaveSha256':fixture_hash,
        'seed':args.seed,'secondsPerWindow':args.seconds,'runs':args.runs,'cases':{},
        'notes':['Every case runs sequentially in fresh browser contexts through browser-performance-review.py.',
        'Regional and same-system distant-record cases retain identical nearby counts; visible-count cases intentionally increase nearby work.',
        'Matrix-only canvas-derived placement keeps configured original-size artwork initially visible; no scripted observer input or per-frame pose resetting is used. Actual painted actors and visible hull bounds are reported as contacts scatter ships.',
        'No heavy trace or save probe overlaps clean timing. A 60-Hz headless result does not establish a hardware refresh ceiling.']}
    for name in selected:
        case=CASES[name];label=f'{args.label}-{name}'
        command=[sys.executable,str(ROOT/'tests/browser-performance-review.py'),'--source-root',str(args.source_root),
            '--label',label,'--revision-label',args.revision_label,'--fixture',str(args.fixture),'--warm-only',
            '--seconds',str(args.seconds),'--runs',str(args.runs),'--seed',str(args.seed),'--scenarios',args.scenarios,
            '--visible-ships',str(case['visible']),'--distant-system',case['system'],'--dpr',str(case['dpr']),
            '--width',str(args.width),'--height',str(args.height),'--mixed-ships','--capacity-matrix','--stationary-observer']
        if case['population']==5000:command.append('--save-probe')
        if case['population']:command.extend(['--population',str(case['population'])])
        if case.get('active'):command.append('--active-distant')
        subprocess.run(command,cwd=ROOT,check=True)
        report_path=ROOT/'test-results/performance-review'/f'{label}.json'
        report=json.loads(report_path.read_text(encoding='utf-8'));summaries={}
        for mode,rows in report['scenarios'].items():
            frames=[]
            for row in rows:
                path=report_path.parent/f'{label}-{mode}-{row["run"]}-frames.json'
                frames.extend(json.loads(path.read_text(encoding='utf-8')))
            intervals=[frame['intervalMs'] for frame in frames if frame['intervalMs']>0]
            seconds=sum(row['actualSeconds'] for row in rows)
            summaries[mode]={'frames':len(frames),'seconds':seconds,'averageFps':len(frames)/seconds if seconds else 0,
                'medianMs':percentile(intervals,.5),'p95Ms':percentile(intervals,.95),'p99Ms':percentile(intervals,.99),
                'worstMs':max(intervals,default=0),'above33Ms':sum(value>33 for value in intervals),
                'above50Ms':sum(value>50 for value in intervals),
                'workloads':[dict(state=row['state'],counters=row['counters'],lifeBefore=row['before'].get('life'),lifeAfter=row['after'].get('life'),capacity=row.get('capacity')) for row in rows]}
        result['cases'][name]={'configuration':case,'command':command,'report':str(report_path.relative_to(ROOT)),
            'browserVersion':report['browserVersion'],'graphics':report['graphics'],'population':report['population'],
            'sourceHashes':report['sourceHashes'],'summaries':summaries}
        (OUTPUT/f'{args.label}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    assert hashlib.sha256(args.fixture.read_bytes()).hexdigest()==fixture_hash,'Matrix modified the isolated initial fixture'
    print(json.dumps({'report':str(OUTPUT/f'{args.label}.json'),'cases':list(result['cases'])}),flush=True)

if __name__=='__main__':main()
