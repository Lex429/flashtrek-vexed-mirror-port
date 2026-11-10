"""Check a throttled full-game diagnostic; this cannot certify Chromebook support."""
import argparse
import json
import math
from pathlib import Path

SCENARIOS=('flight','crowdedFlight','crowdedCombat','miningDebris','devMap')


def screen(report, *, runs=2, seconds=8, slowdown=4, minimum_population=1000):
    failures=[]
    windows=[]
    if not report.get('passed') or report.get('incomplete'):
        failures.append('Game measurements did not complete successfully')
    if report.get('javascriptErrors') or report.get('failedRequests'):
        failures.append('Browser errors or failed requests occurred')
    if report.get('cpuSlowdown',0)<slowdown:
        failures.append('Requested CPU slowdown was not recorded')
    if report.get('cpuThrottlingAppliedPages',0)<runs*len(SCENARIOS)+1:
        failures.append('CPU slowdown was not applied to every requested game page')
    if report.get('population',0)<minimum_population:
        failures.append('Fixture does not contain the required full-size fleet')
    viewport=report.get('viewport',{})
    if viewport!={'width':1366,'height':768} or report.get('fixtureSettings',{}).get('dpr')!=1:
        failures.append('Screen requires a 1366 x 768 viewport at pixel density 1')

    for mode in SCENARIOS:
        rows=report.get('scenarios',{}).get(mode,[])
        if len(rows)!=runs or {row.get('run') for row in rows}!=set(range(1,runs+1)):
            failures.append(f'{mode}: Requested repeated windows are missing or duplicated')
        for row in rows:
            reasons=[]
            interval=row.get('intervalMs',{})
            state=row.get('state',{})
            counters=row.get('counters',{})
            values={
                'averageFps':row.get('averageFps'),
                'actualSeconds':row.get('actualSeconds'),
                'p95FrameMs':interval.get('p95'),
                'p99FrameMs':interval.get('p99'),
                'physicsDebtSeconds':state.get('physicsDebtSeconds'),
                'simulationProgressSeconds':counters.get('simulationProgressSeconds'),
            }
            if any(not isinstance(value,(int,float)) or not math.isfinite(value) for value in values.values()):
                reasons.append('Timing or simulation evidence is missing or invalid')
            else:
                if values['actualSeconds']<seconds*.99:
                    reasons.append('Measurement window was too short')
                if values['averageFps']<29.5 or values['p95FrameMs']>35 or values['p99FrameMs']>67:
                    reasons.append('Frame delivery misses the steady 30 FPS target')
                if values['physicsDebtSeconds']>.1 or values['simulationProgressSeconds']<values['actualSeconds']*.98:
                    reasons.append('Simulation is falling behind real time')
            if row.get('frameSpikesOver100ms')!=0:
                reasons.append('A frame stalled for over 100 ms or stall evidence is missing')
            if state.get('population')!=report.get('population'):
                reasons.append('Fleet population changed during measurement')
            if mode=='crowdedCombat' and counters.get('acceptedShots',0)<1:
                reasons.append('Combat did not fire real weapons')
            windows.append({'scenario':mode,'run':row.get('run'),**values,'passed':not reasons,'failures':reasons})
            failures.extend(f'{mode} run {row.get("run")}: {reason}' for reason in reasons)

    warmups=report.get('warmups',{})
    for mode in SCENARIOS:
        rows=warmups.get(mode,[])
        if len(rows)!=runs:
            failures.append(f'{mode}: Active startup recovery was not measured for every run')
        for row in rows:
            before=row['before']
            accounted=row['simulationSeconds']-before['simulationSeconds']+row['physicsDebtSeconds']-before['physicsDebtSeconds']
            if abs(accounted-row['actualSeconds'])>.1 or row['physicsDebtSeconds']>.1:
                failures.append(f'{mode} startup: Simulation time was lost or did not recover')

    return {'passed':not failures,'hardwareSupportConfirmed':False,
            'scope':'Relative CPU slowdown on this host. Real Chromebook GPU, RAM, thermals, input latency and foreground display remain untested.',
            'criteria':{'minimumAverageFps':29.5,'maximumP95Ms':35,'maximumP99Ms':67,
                        'maximumSavedPhysicsDebtSeconds':.1,'maximumIntervalsOver100ms':0,
                        'cpuSlowdown':slowdown,'runsPerScenario':runs,'secondsPerWindow':seconds,
                        'minimumPopulation':minimum_population},
            'windows':windows,'failures':failures}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    report=json.loads(args.report.read_text(encoding='utf-8'))
    result=screen(report)
    result['review']=str(args.report.resolve())
    result['fixtureSha256']=report.get('initialSaveSha256')
    output=args.output or args.report.with_name(args.report.stem+'-screen.json')
    output.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))
    raise SystemExit(0 if result['passed'] else 1)


if __name__=='__main__':
    main()
