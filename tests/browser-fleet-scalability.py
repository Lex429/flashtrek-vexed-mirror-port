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

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def source_hashes(source):
    return {str(path.relative_to(source)).replace('\\','/'):digest(path)
        for folder in ['html-games/broken-mirror-port','html-games/flashtrek-broken-mirror']
        for path in sorted([*(source/folder).glob('*.js'),*(source/folder).glob('*.html')])}

def case_command(args,name):
    case=CASES[name]
    command=[sys.executable,str(ROOT/'tests/browser-performance-review.py'),'--source-root',str(args.source_root),
        '--label',f'{args.label}-{name}','--revision-label',args.revision_label,'--fixture',str(args.fixture),'--warm-only',
        '--seconds',str(args.seconds),'--runs',str(args.runs),'--seed',str(args.seed),'--scenarios',args.scenarios,
        '--visible-ships',str(case['visible']),'--distant-system',case['system'],'--dpr',str(case['dpr']),
        '--width',str(args.width),'--height',str(args.height),'--mixed-ships','--capacity-matrix','--stationary-observer']
    if case['population']==5000:command.append('--save-probe')
    if case['population']:command.extend(['--population',str(case['population'])])
    if case.get('active'):command.append('--active-distant')
    return command

def comparable_command(command):
    # Keep the case CLI exact, allowing only equivalent spellings of file paths.
    normalized=list(command[2:])
    for index,value in enumerate(normalized[:-1]):
        if value in ['--source-root','--fixture']:
            path=Path(normalized[index+1]);normalized[index+1]=str((ROOT/path).resolve())
    return normalized

def read_report(args,name,fixture_hash,expected_sources,expected_harnesses):
    label=f'{args.label}-{name}';case=CASES[name]
    path=ROOT/'test-results/performance-review'/f'{label}.json'
    def require(ok,reason):
        if not ok:raise ValueError(f'{name}: {reason}')
    require(path.is_file(),f'missing child report {path}')
    report=json.loads(path.read_text(encoding='utf-8'))
    require(isinstance(report,dict),'child report is not an object')
    require(report.get('label')==label,'child label differs')
    require(Path(report.get('sourceRoot','')).resolve()==args.source_root.resolve(),'child source root differs')
    require(report.get('sourceHashes')==expected_sources,'source hashes differ from the current served checkout')
    require(report.get('harnessHashes')==expected_harnesses,'review/stability harness hashes differ')
    require(report.get('initialSaveSha256')==fixture_hash,'initial fixture hash differs')
    require(report.get('revision')==args.revision_label,'revision label differs')
    require(report.get('randomSeed')==args.seed,'seed differs')
    require(report.get('secondsPerWindow')==args.seconds and report.get('runs')==args.runs,'window duration or run count differs')
    require(report.get('viewport')==dict(width=args.width,height=args.height),'viewport differs')
    settings=dict(population=case['population'],visibleShips=case['visible'],mixedShips=True,
        distantSystem=case['system'],activeDistant=case.get('active',False),dpr=case['dpr'],
        capacityMatrix=True,stationaryObserver=True)
    require(report.get('fixtureSettings')==settings,'case settings differ')
    require(report.get('passed') is True and report.get('incomplete') is False,'child report is not explicitly passed and complete')
    require(not report.get('javascriptErrors') and not report.get('failedRequests'),'child report contains browser/request failures')
    modes=args.scenarios.split(',')
    require(list(report.get('scenarios',{}))==modes,'scenario list/order differs')
    for mode in modes:
        rows=report['scenarios'][mode]
        require(isinstance(rows,list) and all(isinstance(row,dict) for row in rows),f'{mode}: invalid run records')
        require([row.get('run') for row in rows]==list(range(1,args.runs+1)),f'{mode}: missing or duplicate runs')
        require(report.get('scenarioFixtures',{}).get(mode,{}).get('sourceSha256')==report.get('derivedSaveSha256')
            and bool(report.get('derivedSaveSha256')),f'{mode}: derived fixture metadata differs')
        for row in rows:
            frames=path.parent/f'{label}-{mode}-{row["run"]}-frames.json'
            require(frames.is_file() and frames.stat().st_size>2,f'{mode} run {row["run"]}: missing raw frame file')
            post=row.get('postWindow',{});state=row.get('state',{})
            require(post.get('blocked') is True and post.get('recording') is False
                and 'simulationSeconds' in state and post.get('simulationSeconds')==state['simulationSeconds']
                and 'physicsDebtSeconds' in state and post.get('physicsDebtSeconds')==state['physicsDebtSeconds'],
                f'{mode} run {row["run"]}: missing or changed post-window clock/debt checkpoint')
    return path,report

def write_checkpoint(path,result):
    temporary=path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result,indent=2),encoding='utf-8');temporary.replace(path)

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
    parser.add_argument('--resume',action='store_true',help='Skip only completed checkpoint cases whose source, fixture, harness, settings and child artifacts still match')
    args=parser.parse_args();OUTPUT.mkdir(parents=True,exist_ok=True)
    assert args.fixture.exists(),'Create the isolated fixture once before the matrix'
    selected=args.cases.split(',');assert all(name in CASES for name in selected)
    fixture_hash=digest(args.fixture)
    expected_sources=source_hashes(args.source_root.resolve())
    expected_harnesses={name:digest(ROOT/'tests'/name) for name in
        ['browser-performance-review.py','browser-stability.py','browser-npc-performance.py']}
    checkpoint_path=OUTPUT/f'{args.label}.json';verified={}
    result={'label':args.label,'sourceRoot':str(args.source_root.resolve()),'initialSaveSha256':fixture_hash,
        'seed':args.seed,'secondsPerWindow':args.seconds,'runs':args.runs,'cases':{},
        'notes':['Every case runs sequentially in fresh browser contexts through browser-performance-review.py.',
        'Regional and same-system distant-record cases retain identical nearby counts; visible-count cases intentionally increase nearby work.',
        'Matrix-only canvas-derived placement keeps configured original-size artwork initially visible; no scripted observer input or per-frame pose resetting is used. Actual painted actors and visible hull bounds are reported as contacts scatter ships.',
        'No heavy trace or save probe overlaps clean timing. A 60-Hz headless result does not establish a hardware refresh ceiling.']}
    if args.resume:
        try:
            saved=json.loads(checkpoint_path.read_text(encoding='utf-8'))
            if not isinstance(saved,dict):raise ValueError('matrix checkpoint is not an object')
            for key in ['label','sourceRoot','initialSaveSha256','seed','secondsPerWindow','runs']:
                if saved.get(key)!=result[key]:raise ValueError(f'matrix {key} differs')
            if not isinstance(saved.get('cases'),dict):raise ValueError('matrix cases are missing')
            for name,entry in saved['cases'].items():
                if not isinstance(entry,dict) or name not in CASES or entry.get('configuration')!=CASES[name]:raise ValueError(f'{name}: unknown or changed configuration')
                if comparable_command(entry.get('command',[]))!=comparable_command(case_command(args,name)):
                    raise ValueError(f'{name}: case CLI differs')
                path,report=read_report(args,name,fixture_hash,expected_sources,expected_harnesses)
                if (ROOT/entry.get('report','')).resolve()!=path.resolve():raise ValueError(f'{name}: child report path differs')
                if entry.get('sourceHashes')!=report['sourceHashes']:raise ValueError(f'{name}: matrix/child source hashes differ')
                if entry.get('population')!=report['population']:raise ValueError(f'{name}: matrix/child population differs')
                if entry.get('browserVersion')!=report['browserVersion'] or entry.get('graphics')!=report['graphics']:
                    raise ValueError(f'{name}: matrix/child browser metadata differs')
                for mode,rows in report['scenarios'].items():
                    summary=entry.get('summaries',{}).get(mode,{})
                    workloads=[dict(state=row['state'],counters=row['counters'],lifeBefore=row['before'].get('life'),
                        lifeAfter=row['after'].get('life'),capacity=row.get('capacity')) for row in rows]
                    if summary.get('workloads')!=workloads or summary.get('frames')!=sum(row['frames'] for row in rows) or summary.get('seconds')!=sum(row['actualSeconds'] for row in rows):
                        raise ValueError(f'{name}: matrix/child completed windows differ')
                verified[name]=entry
        except (OSError,ValueError,TypeError,KeyError) as error:
            parser.error(f'Cannot resume {checkpoint_path}: {error}. Use a new label or archive the stale checkpoint; no cases were run.')
        result['cases'].update(verified)
        result['resume']={'checkpoint':str(checkpoint_path.relative_to(ROOT)),
            'verifiedCompletedCases':list(verified),'executedCases':[],
            'notes':['Original process exit codes are not inferred. Only explicitly complete, passed child artifacts recorded in the matrix checkpoint are reused. Incomplete or orphan child reports are rerun.']}
    for name in selected:
        if name in verified:
            print(json.dumps({'resumedCase':name,'completedArtifactsVerified':True,'originalProcessExitCode':'not inferred'}),flush=True)
            continue
        case=CASES[name];label=f'{args.label}-{name}';command=case_command(args,name)
        completed=subprocess.run(command,cwd=ROOT,check=True)
        report_path,report=read_report(args,name,fixture_hash,expected_sources,expected_harnesses);summaries={}
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
            'sourceHashes':report['sourceHashes'],'summaries':summaries,'processExitCode':completed.returncode}
        if args.resume:result['resume']['executedCases'].append(name)
        write_checkpoint(checkpoint_path,result)
    assert digest(args.fixture)==fixture_hash,'Matrix modified the isolated initial fixture'
    write_checkpoint(checkpoint_path,result)
    print(json.dumps({'report':str(checkpoint_path),'cases':list(result['cases'])}),flush=True)

if __name__=='__main__':main()
