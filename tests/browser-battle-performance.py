"""Foreground Brave/RTX game measurements, with every raw frame retained.

The weapons-hits scenario combines scripted movement, mixed weapons, shield and
hull contacts. No destruction or wreckage is emitted. It does not run combat AI.
"""
import argparse,json,os,sys,tempfile
from pathlib import Path
from types import SimpleNamespace
REPO=Path(__file__).resolve().parents[1];sys.path.insert(0,str(REPO/'tools'))
from effect_lab import atomic,versions
from validate_effect_game import validate
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--root',type=Path,default=Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',REPO)))
 parser.add_argument('--implementation',default='cinematic-battle-v2')
 parser.add_argument('--scenario',default='weapons-hits')
 parser.add_argument('--load-level',choices=['normal','stress','overload'],default='normal')
 parser.add_argument('--counts',type=int,nargs='+',default=[10,25,50,100,200])
 parser.add_argument('--seconds',type=int,default=10);parser.add_argument('--warmup',type=int,default=8)
 parser.add_argument('--lights',choices=['on','off','both'],default='on');parser.add_argument('--label',default='performance')
 parser.add_argument('--batch',choices=['auto','on','off'],default='auto',help='Use automatic production selection, or force a renderer for comparison')
 parser.add_argument('--cpu-surfaces',action='store_true',help='Isolated snapshot experiment only')
 parser.add_argument('--cpu-profile',type=Path,help='Diagnostic run only; cannot approve performance')
 args=parser.parse_args();root=args.root
 if args.cpu_surfaces:
  assert root!=REPO,'Only mutate an isolated experiment'
  path=root/'html-games/broken-mirror-port/ship-sprite-cache.js';s=path.read_text()
  path.write_text(s.replace("getContext('2d')","getContext('2d',{willReadFrequently:true})"))
 candidate=next(p for p in json.loads((root/'html-games/flashtrek-broken-mirror/effect-candidates.json').read_text())['profiles'] if p['implementation']==args.implementation)
 fixture={'scenario':args.scenario,'loadLevel':args.load_level,'shipType':6,'mix':True,'mixedWeapons':True,'mixedDamage':False,'rate':2,'size':44,'seed':429,'pattern':'staggered','shieldRenderer':'gpu','weapon':'beam:0','hullBatch':args.batch=='on' if args.batch!='auto' else 'auto'}
 result={'sourceRoot':str(root),'profile':candidate,'code':versions(root,candidate),'games':[]}
 output=REPO/'test-results/cinematic-battle'/f'{args.label}.json'
 with tempfile.TemporaryDirectory(prefix='vexed-battle-performance-') as state:
  for lights in ([False,True] if args.lights=='both' else [args.lights=='on']):
   for count in args.counts:
    a=SimpleNamespace(root=root,state=Path(state),count=count,seconds=args.seconds,warmup=args.warmup,headed=True,browser_path=Path('C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'))
    if args.cpu_profile:a.cpu_profile=args.cpu_profile
    report=validate(a,fixture_override={**fixture,'count':count,'lights':lights},preview_profile=candidate)
    assert report['counters']['explosions']==0 and report['counters']['destructionEnabled'] is False
    assert report.get('shipEffects',{}).get('wrecks',0)==0
    assert not report['shields']['resources']['primitiveRejected']
    result['games'].append(report);atomic(output,result)
    print(json.dumps({'ships':count,'lights':lights,'status':report['status'],'metrics':report['metrics'],'visible':report['minimumVisible'],'counters':report['counters'],'resources':{k:v for k,v in report['shields']['resources'].items() if k in ['radiancePeak','gpuHullPaints','radianceSourcePeak','primitiveRejected']}}),flush=True)
 print('Saved '+str(output),flush=True)
if __name__=='__main__':main()
