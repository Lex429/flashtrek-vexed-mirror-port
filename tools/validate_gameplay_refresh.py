"""Qualify real foreground gameplay at a supported refresh; restore the display.

Uses the ordinary full saved fleet, real gameplay owners and existing headed
review. No VSync bypass, synthetic RAF, disabled lighting or replaced mechanics.
Raw frames, source hashes, focus conditions and all failed windows are retained.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]

def qualify(report,hz):
    failures=[];windows=[];budget=1000/hz;minimum=hz*59/60;p95=round(budget*1.08,3);p99=round(budget*2.1,3)
    if not report.get('passed') or report.get('incomplete'):failures.append('Gameplay review did not complete successfully')
    if report.get('javascriptErrors') or report.get('failedRequests'):failures.append('Browser errors or failed requests')
    conditions=report.get('headedConditions',{})
    if conditions.get('headless') is not False:failures.append('Not a real foreground browser measurement')
    if conditions.get('measuredFocusOrVisibilityInterruptions'):failures.append('Measured browser lost focus/visibility')
    if conditions.get('viewportExceedsOuterWindow'):failures.append('Viewport did not fit visible browser window')
    if conditions.get('fullscreenRequested'):
        pages=[page for page in conditions.get('pages',[]) if page.get('mode') in report.get('scenarios',{})]
        if not pages or any(not page.get('fullscreenVerified') for page in pages):failures.append('Native fullscreen dimensions were not verified')
        if conditions.get('measuredFullscreenInterruptions'):failures.append('Measured browser left fullscreen')
    displays=conditions.get('windowsDisplayModesBefore',{}).get('displays',[])
    if not any(d.get('frequencyHz')==hz for d in displays):failures.append('Requested monitor refresh was not active')
    if not report.get('scenarios'):failures.append('No gameplay windows recorded')
    for mode,rows in report.get('warmups',{}).items():
        for row in rows:
            before=row['before'];progress=row['simulationSeconds']-before['simulationSeconds']
            accounted=progress+row['physicsDebtSeconds']-before['physicsDebtSeconds']
            if abs(accounted-row['actualSeconds'])>.05:failures.append(f'{mode} startup: Accepted simulation time was not fully accounted for')
            if row['physicsDebtSeconds']>.1:failures.append(f'{mode} startup: Saved physical debt did not recover')
    for mode,rows in report.get('scenarios',{}).items():
        for row in rows:
            reasons=[];fps=row['averageFps'];interval=row['intervalMs'];state=row['state'];counters=row['counters']
            if fps<minimum:reasons.append('Average frame delivery below target tolerance')
            if interval['p95']>p95:reasons.append('95th-percentile frame interval exceeds target budget')
            if interval['p99']>p99:reasons.append('99th-percentile frame interval exceeds two target intervals')
            if row['frameSpikesOver50ms']:reasons.append('Frame intervals over 50 ms')
            if state['population']!=report['population']:reasons.append('Fleet population changed')
            if counters['simulationProgressSeconds']<row['actualSeconds']*.98:reasons.append('Simulation did not keep up with active wall time')
            if state['physicsDebtSeconds']>.1:reasons.append('Saved physical time is falling behind')
            if mode=='crowdedCombat' and not counters.get('acceptedShots'):reasons.append('Combat did not fire actual weapons')
            if mode=='corridorFlight' and not row.get('before',{}).get('corridorNearbyRocks'):reasons.append('No live corridor field was present at the start of route gameplay')
            if mode=='boundaryFlight':
                before=row.get('before',{}).get('region');after=row.get('after',{}).get('region')
                if not before or not after or before['generation']==after['generation']:reasons.append('Player did not cross an active-area boundary')
            windows.append({'scenario':mode,'run':row['run'],'passed':not reasons,'averageFps':fps,
                'p95FrameMs':interval['p95'],'p99FrameMs':interval['p99'],'worstFrameMs':interval['max'],
                'simulationProgressSeconds':counters['simulationProgressSeconds'],
                'savedPhysicsDebtSeconds':state['physicsDebtSeconds'],'acceptedShots':counters.get('acceptedShots',0),'failures':reasons})
            failures.extend(f'{mode} run {row["run"]}: {reason}' for reason in reasons)
    if not windows:failures.append('No gameplay windows recorded')
    return {'passed':not failures,'targetHz':hz,'scope':'Real game RAF/draw delivery on the configured display; not direct panel scanout measurement.',
        'criteria':{'minimumAverageFps':minimum,'maximumP95Ms':p95,'maximumP99Ms':p99,
                    'maximumSavedPhysicsDebtSeconds':.1,'maximumIntervalsOver50ms':0},'windows':windows,'failures':failures}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--fixture',type=Path,required=True)
    parser.add_argument('--label',required=True)
    parser.add_argument('--hz',type=int,default=120)
    parser.add_argument('--seconds',type=float,default=20)
    parser.add_argument('--runs',type=int,default=3)
    parser.add_argument('--active-warmup',type=float,default=3,help='Retain startup recovery separately before steady gameplay qualification')
    parser.add_argument('--scenarios',default='flight,boundaryFlight,crowdedFlight,crowdedCombat')
    parser.add_argument('--fullscreen',action='store_true')
    parser.add_argument('--browser-path',type=Path,default=Path('C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'))
    args=parser.parse_args()
    assert sys.platform=='win32','Display refresh qualification requires Windows'
    spec=importlib.util.spec_from_file_location('refresh_types',ROOT/'tests/browser-refresh-performance.py')
    types=importlib.util.module_from_spec(spec);spec.loader.exec_module(types);Mode=types.Mode
    assert c.sizeof(Mode)==220
    enum=c.windll.user32.EnumDisplaySettingsW;enum.argtypes=[w.LPCWSTR,w.DWORD,c.POINTER(Mode)]
    change=c.windll.user32.ChangeDisplaySettingsExW;change.argtypes=[w.LPCWSTR,c.POINTER(Mode),w.HWND,w.DWORD,c.c_void_p];change.restype=w.LONG
    def current():
        mode=Mode();mode.size=c.sizeof(mode);assert enum(None,0xffffffff,c.byref(mode));return mode
    def describe(mode):return {'width':mode.width,'height':mode.height,'bits':mode.bits,'hz':mode.hz}
    original=current();selected=None;rates=set();index=0
    while True:
        mode=Mode();mode.size=c.sizeof(mode)
        if not enum(None,index,c.byref(mode)):break
        if (mode.width,mode.height,mode.bits)==(original.width,original.height,original.bits):
            rates.add(mode.hz)
            if mode.hz==args.hz:selected=mode
        index+=1
    assert selected is not None,f'{args.hz} Hz unavailable at current resolution: {sorted(rates)}'
    assert change(None,c.byref(selected),None,2,None)==0,'Display driver rejected refresh test'
    output=ROOT/'test-results/performance-review';output.mkdir(parents=True,exist_ok=True)
    evidence={'before':describe(original),'requestedHz':args.hz,'supportedRates':sorted(rates),'sessionOnly':True}
    qualification={'passed':False,'failures':['Gameplay review did not finish']}
    code=1
    try:
        evidence['setResult']=change(None,c.byref(selected),None,0,None)
        assert evidence['setResult']==0,'Display refresh did not change'
        evidence['during']=describe(current());assert evidence['during']['hz']==args.hz
        print(json.dumps({'display':evidence}),flush=True)
        command=[sys.executable,str(ROOT/'tests/browser-performance-headed.py')]
        if args.fullscreen:command.append('--fullscreen')
        command+=['--','--source-root',str(args.source_root.resolve()),'--fixture',str(args.fixture.resolve()),
            '--label',args.label,'--browser-path',str(args.browser_path.resolve()),'--seconds',str(args.seconds),
            '--runs',str(args.runs),'--scenarios',args.scenarios,'--active-warmup',str(args.active_warmup),'--warm-only']
        with (output/(args.label+'-run.log')).open('w',encoding='utf-8') as log:
            result=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        evidence['reviewExitCode']=result.returncode
        if result.returncode:
            qualification={'passed':False,'failures':['Gameplay review failed; see retained run log']}
        else:
            report=json.loads((output/(args.label+'.json')).read_text(encoding='utf-8'))
            qualification=qualify(report,args.hz)
            qualification['activeWarmupSeconds']=args.active_warmup
            qualification['startupRecovery']=report.get('warmups',{})
            requested=set(args.scenarios.split(','));actual=set(report.get('scenarios',{}))
            if actual!=requested or any(len(rows)!=args.runs for rows in report.get('scenarios',{}).values()):
                qualification['passed']=False;qualification['failures'].append('Requested gameplay windows were not all recorded')
            qualification.update(review=str(output/(args.label+'.json')),fixtureSha256=report.get('initialSaveSha256'),sourceHashes=report.get('sourceHashes'))
        code=0 if qualification['passed'] else 1
    finally:
        evidence['restoreResult']=change(None,c.byref(original),None,0,None);evidence['after']=describe(current())
        qualification['display']=evidence
        (output/(args.label+'-qualification.json')).write_text(json.dumps(qualification,indent=2),encoding='utf-8')
        print(json.dumps({k:v for k,v in qualification.items() if k!='sourceHashes'},indent=2),flush=True)
        assert evidence['restoreResult']==0 and evidence['after']==describe(original),'Original display mode not restored'
    sys.exit(code)

if __name__=='__main__':main()
