"""Run foreground battle measurements at a supported refresh rate; restore it afterward.

Windows changes are session-only. Resolution, colour depth and saved settings stay
unchanged. Raw game reports keep all stalls and the usual 120 FPS acceptance gate.
"""
import argparse,ctypes as c,json,subprocess,sys
from ctypes import wintypes as w
from pathlib import Path
REPO=Path(__file__).resolve().parents[1]
class Mode(c.Structure):
 _fields_=[('name',w.WCHAR*32),('spec',w.WORD),('driver',w.WORD),('size',w.WORD),('extra',w.WORD),('fields',w.DWORD),('union',c.c_byte*16),('color',w.SHORT),('duplex',w.SHORT),('yres',w.SHORT),('tt',w.SHORT),('collate',w.SHORT),('form',w.WCHAR*32),('logPixels',w.WORD),('bits',w.DWORD),('width',w.DWORD),('height',w.DWORD),('flags',w.DWORD),('hz',w.DWORD),('rest',w.DWORD*8)]
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--root',type=Path,required=True);parser.add_argument('--hz',type=int,default=120)
 parser.add_argument('--counts',nargs='+',type=int,default=[50,100]);parser.add_argument('--seconds',type=int,default=30)
 parser.add_argument('--lights',choices=['on','off','both'],default='both');parser.add_argument('--batch',choices=['auto','on','off'],default='auto')
 parser.add_argument('--load-level',choices=['normal','stress','overload'],default='normal');parser.add_argument('--label',required=True)
 args=parser.parse_args();assert sys.platform=='win32' and c.sizeof(Mode)==220
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
 assert selected is not None,f'{args.hz} Hz is unavailable at the current resolution: {sorted(rates)}'
 evidence={'before':describe(original),'supportedRates':sorted(rates),'requestedHz':args.hz,'sessionOnly':True}
 assert change(None,c.byref(selected),None,2,None)==0,'Driver rejected the refresh mode test'
 output=REPO/'test-results/cinematic-battle'/f'{args.label}-display.json'
 try:
  result=change(None,c.byref(selected),None,0,None);evidence['setResult']=result
  assert result==0,'Display mode did not change';evidence['during']=describe(current());assert evidence['during']['hz']==args.hz
  print(json.dumps({'display':evidence}),flush=True)
  command=[sys.executable,str(REPO/'tests/browser-battle-performance.py'),'--root',str(args.root),'--counts',*[str(n) for n in args.counts],'--seconds',str(args.seconds),'--warmup','12','--lights',args.lights,'--batch',args.batch,'--load-level',args.load_level,'--label',args.label]
  subprocess.run(command,cwd=REPO,check=True)
 finally:
  evidence['restoreResult']=change(None,c.byref(original),None,0,None);evidence['after']=describe(current())
  output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(evidence,indent=2))
  print(json.dumps({'displayRestored':evidence['after'],'restoreResult':evidence['restoreResult']}),flush=True)
  assert evidence['restoreResult']==0 and evidence['after']==describe(original),'Original display mode was not restored'
if __name__=='__main__':main()
