"""Visible-desktop companion to the unchanged same-save performance review.

Default: real headed Edge, fixed requested CSS viewport/DPR, three 20-second
windows for ordinary/crowded flight and combat. --fullscreen uses a trusted
button gesture before fixture setup and the display's native viewport/DPR.
All remaining arguments are forwarded to browser-performance-review.py.

This is an optional manual diagnostic, not a CI gate. Run it sequentially on an
unobstructed desktop; output stays under ignored test-results/. Current monitor
mode and game RAF delivery are different observations from physical scanout.
"""
import argparse
import ctypes
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import sys

ROOT = Path(__file__).resolve().parents[1]


def display_modes():
    """Read-only current Windows modes; never changes a display or GPU setting."""
    result={'platform':platform.platform(),'capturedAtUtc':datetime.now(timezone.utc).isoformat(),
            'available':False,'displays':[],
            'note':'Configured monitor frequency is not measured browser delivery or physical scanout.'}
    if os.name!='nt':
        result['reason']='EnumDisplaySettingsExW is available only on Windows.'
        return result
    try:
        from ctypes import wintypes
        class POINTL(ctypes.Structure):
            _fields_=[('x',wintypes.LONG),('y',wintypes.LONG)]
        class DISPLAY_UNION(ctypes.Structure):
            _fields_=[('dmPosition',POINTL),('dmDisplayOrientation',wintypes.DWORD),('dmDisplayFixedOutput',wintypes.DWORD)]
        class PRINTER_UNION(ctypes.Union):
            _fields_=[('display',DISPLAY_UNION),('printer',ctypes.c_short*8)]
        class DEVMODEW(ctypes.Structure):
            _fields_=[('dmDeviceName',wintypes.WCHAR*32),('dmSpecVersion',wintypes.WORD),('dmDriverVersion',wintypes.WORD),
                ('dmSize',wintypes.WORD),('dmDriverExtra',wintypes.WORD),('dmFields',wintypes.DWORD),('settings',PRINTER_UNION),
                ('dmColor',ctypes.c_short),('dmDuplex',ctypes.c_short),('dmYResolution',ctypes.c_short),('dmTTOption',ctypes.c_short),
                ('dmCollate',ctypes.c_short),('dmFormName',wintypes.WCHAR*32),('dmLogPixels',wintypes.WORD),
                ('dmBitsPerPel',wintypes.DWORD),('dmPelsWidth',wintypes.DWORD),('dmPelsHeight',wintypes.DWORD),
                ('dmDisplayFlags',wintypes.DWORD),('dmDisplayFrequency',wintypes.DWORD),('dmICMMethod',wintypes.DWORD),
                ('dmICMIntent',wintypes.DWORD),('dmMediaType',wintypes.DWORD),('dmDitherType',wintypes.DWORD),
                ('dmReserved1',wintypes.DWORD),('dmReserved2',wintypes.DWORD),('dmPanningWidth',wintypes.DWORD),('dmPanningHeight',wintypes.DWORD)]
        class DISPLAY_DEVICEW(ctypes.Structure):
            _fields_=[('cb',wintypes.DWORD),('DeviceName',wintypes.WCHAR*32),('DeviceString',wintypes.WCHAR*128),
                ('StateFlags',wintypes.DWORD),('DeviceID',wintypes.WCHAR*128),('DeviceKey',wintypes.WCHAR*128)]
        if ctypes.sizeof(DEVMODEW)!=220 or ctypes.sizeof(DISPLAY_DEVICEW)!=840:
            raise RuntimeError('Unexpected Win32 structure layout; monitor metadata was not queried.')
        user32=ctypes.WinDLL('user32',use_last_error=True)
        enum_devices=user32.EnumDisplayDevicesW
        enum_devices.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,ctypes.POINTER(DISPLAY_DEVICEW),wintypes.DWORD]
        enum_devices.restype=wintypes.BOOL
        enum_settings=user32.EnumDisplaySettingsExW
        enum_settings.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,ctypes.POINTER(DEVMODEW),wintypes.DWORD]
        enum_settings.restype=wintypes.BOOL
        for index in range(64):
            device=DISPLAY_DEVICEW();device.cb=ctypes.sizeof(device)
            if not enum_devices(None,index,ctypes.byref(device),0):break
            if not device.StateFlags&1:continue
            mode=DEVMODEW();mode.dmSize=ctypes.sizeof(mode)
            item={'device':device.DeviceName,'adapter':device.DeviceString,'primary':bool(device.StateFlags&4),'stateFlags':device.StateFlags}
            if enum_settings(device.DeviceName,0xFFFFFFFF,ctypes.byref(mode),0):
                item.update(width=mode.dmPelsWidth,height=mode.dmPelsHeight,bitsPerPixel=mode.dmBitsPerPel,
                    frequencyHz=mode.dmDisplayFrequency if mode.dmDisplayFrequency>1 else None,
                    x=mode.settings.display.dmPosition.x,y=mode.settings.display.dmPosition.y,orientation=mode.settings.display.dmDisplayOrientation)
            else:item['modeError']=ctypes.get_last_error()
            result['displays'].append(item)
        result['available']=bool(result['displays'])
    except Exception as error:
        result['reason']=str(error)
    return result


DESKTOP_EVENTS=r'''()=>{
 const p=window.__headedReview={events:[]};
 for(const kind of ['focus','blur','visibilitychange','fullscreenchange','resize'])addEventListener(kind,()=>{
   if(p.events.length>=256)return;
   p.events.push({kind,at:performance.now(),measured:!!window.__stability?.record,visible:document.visibilityState,
     focused:document.hasFocus(),fullscreen:!!document.fullscreenElement,width:innerWidth,height:innerHeight,dpr:devicePixelRatio});
 });
}'''

PAGE_METADATA=r'''()=>{
 const canvas=document.querySelector('#space'),rect=canvas?.getBoundingClientRect();
 return {mode:window.__reviewMode||null,visibility:document.visibilityState,focused:document.hasFocus(),
   fullscreen:!!document.fullscreenElement,fullscreenError:window.__headedFullscreenError||null,
   window:{innerWidth,innerHeight,outerWidth,outerHeight,screenX,screenY,devicePixelRatio},
   screen:{width:screen.width,height:screen.height,availWidth:screen.availWidth,availHeight:screen.availHeight,
     colorDepth:screen.colorDepth,pixelDepth:screen.pixelDepth,orientation:screen.orientation?{type:screen.orientation.type,angle:screen.orientation.angle}:null},
   visualViewport:visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null,
   gameCanvas:canvas?{width:canvas.width,height:canvas.height,cssWidth:rect.width,cssHeight:rect.height}:null,
   events:window.__headedReview?.events||[]};
}'''


class PageProxy:
    def __init__(self,page,owner,index):
        self._page,self._owner,self._index=page,owner,index
        self._captured=False
        page.add_init_script('('+DESKTOP_EVENTS+')()')

    def __getattr__(self,name):return getattr(self._page,name)

    def goto(self,*args,**kwargs):
        result=self._page.goto(*args,**kwargs)
        if self._owner.fullscreen:
            # A trusted click grants Fullscreen API activation. Stop its events
            # before gameplay handlers; the ordinary fixture resets input later.
            self._page.evaluate(r'''()=>{
              const button=document.createElement('button');button.id='headed-fullscreen-entry';button.textContent='Enter benchmark fullscreen';
              button.style.cssText='position:fixed;top:12px;left:12px;z-index:2147483647;padding:16px';
              for(const kind of ['pointerdown','pointerup','mousedown','mouseup'])button.addEventListener(kind,e=>e.stopPropagation());
              button.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();
                document.documentElement.requestFullscreen({navigationUI:'hide'}).then(()=>button.remove(),error=>{
                  window.__headedFullscreenError=String(error);button.remove();});});
              document.body.append(button);
            }''')
            self._page.locator('#headed-fullscreen-entry').click()
            self._page.wait_for_function('()=>document.fullscreenElement||window.__headedFullscreenError',timeout=10000)
            error=self._page.evaluate('window.__headedFullscreenError||null')
            if error:raise RuntimeError('Trusted fullscreen request failed: '+error)
            # Some automated desktop sessions acknowledge the DOM request while
            # retaining a normal outer window. Verify an actual full-screen
            # window, rather than labelling that acknowledgement native fullscreen.
            session=self._page.context.new_cdp_session(self._page)
            try:
                target=session.send('Browser.getWindowForTarget')
                session.send('Browser.setWindowBounds',{'windowId':target['windowId'],'bounds':{'windowState':'fullscreen'}})
            finally:session.detach()
            self._page.wait_for_function('()=>document.fullscreenElement&&innerWidth>=screen.width-2&&innerHeight>=screen.height-2',timeout=10000)
        return result

    def capture(self):
        if self._captured:return
        self._captured=True
        row={'page':self._index}
        try:
            row.update(self._page.evaluate(PAGE_METADATA))
            session=self._page.context.new_cdp_session(self._page)
            try:row['browserWindow']=session.send('Browser.getWindowForTarget')
            finally:session.detach()
        except Exception as error:row['metadataError']=str(error)
        self._owner.pages.append(row)

    def close(self,*args,**kwargs):
        self.capture()
        return self._page.close(*args,**kwargs)


class BrowserProxy:
    def __init__(self,browser,owner):self._browser,self._owner=browser,owner
    def __getattr__(self,name):return getattr(self._browser,name)

    def new_page(self,*args,**kwargs):
        if self._owner.fullscreen:
            # Native fullscreen is a separately labelled protocol. Do not claim
            # an emulated CSS viewport or overridden DPR is the physical screen.
            kwargs.pop('viewport',None);kwargs.pop('device_scale_factor',None);kwargs['no_viewport']=True
        raw=self._browser.new_page(*args,**kwargs)
        if not self._owner.fullscreen:
            # The emulated viewport must fit inside a visible desktop window;
            # Playwright's default outer window can be shorter than that viewport.
            session=raw.context.new_cdp_session(raw)
            try:
                target=session.send('Browser.getWindowForTarget')
                session.send('Browser.setWindowBounds',{'windowId':target['windowId'],'bounds':{'windowState':'maximized'}})
            finally:session.detach()
        page=PageProxy(raw,self._owner,len(self._owner.created)+1)
        self._owner.created.append(page)
        return page

    def close(self,*args,**kwargs):
        for page in self._owner.created:
            if not page._page.is_closed():page.capture()
        return self._browser.close(*args,**kwargs)


class BrowserTypeProxy:
    def __init__(self,kind,owner):self._kind,self._owner=kind,owner
    def __getattr__(self,name):return getattr(self._kind,name)

    def launch(self,*args,**kwargs):
        kwargs['headless']=False
        if self._owner.position:
            kwargs['args']=[*kwargs.get('args',[]),'--window-position='+self._owner.position]
        return BrowserProxy(self._kind.launch(*args,**kwargs),self._owner)


class PlaywrightProxy:
    def __init__(self,playwright,owner):self._playwright,self.chromium=playwright,BrowserTypeProxy(playwright.chromium,owner)
    def __getattr__(self,name):return getattr(self._playwright,name)


class HeadedContext:
    def __init__(self,original,owner):self._manager,self._owner=original(),owner
    def __enter__(self):return PlaywrightProxy(self._manager.__enter__(),self._owner)
    def __exit__(self,*args):return self._manager.__exit__(*args)


def option(arguments,name,default=None):
    for index,value in enumerate(arguments):
        if value==name:return arguments[index+1] if index+1<len(arguments) else default
        if value.startswith(name+'='):return value.split('=',1)[1]
    return default


def main():
    parser=argparse.ArgumentParser(description=__doc__,add_help=False)
    parser.add_argument('--fullscreen',action='store_true')
    parser.add_argument('--headed-monitor',help=r'Optional active Win32 device, for example \\.\DISPLAY2; positions only this temporary browser.')
    parser.add_argument('--headed-help',action='store_true')
    args,forwarded=parser.parse_known_args()
    if args.headed_help:parser.print_help();return
    if forwarded and forwarded[0]=='--':forwarded=forwarded[1:]
    if '--help' in forwarded or '-h' in forwarded:
        print(__doc__)
    else:
        if not option(forwarded,'--label'):parser.error('Pass a separate --label for this headed protocol.')
        if not option(forwarded,'--scenarios'):forwarded+=['--scenarios','flight,crowdedFlight,crowdedCombat']
        if '--cold-only' not in forwarded and '--warm-only' not in forwarded:forwarded.append('--warm-only')
        if not args.fullscreen:
            if not option(forwarded,'--width'):forwarded+=['--width','1200']
            if not option(forwarded,'--height'):forwarded+=['--height','650']
    modes=display_modes()
    position=None
    if args.headed_monitor:
        selected=next((item for item in modes['displays'] if item['device'].casefold()==args.headed_monitor.casefold()),None)
        if not selected or 'x' not in selected:parser.error('Requested monitor is not an active readable Win32 display.')
        position=f"{selected['x']+32},{selected['y']+32}"
    owner=argparse.Namespace(fullscreen=args.fullscreen,position=position,pages=[],created=[])
    spec=importlib.util.spec_from_file_location('headed_review',ROOT/'tests/browser-performance-review.py')
    review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
    original_sync=review.sync_playwright;review.sync_playwright=lambda:HeadedContext(original_sync,owner)
    original_argv=sys.argv;sys.argv=[str(ROOT/'tests/browser-performance-review.py'),*forwarded]
    label=option(forwarded,'--label','headed-help')
    report_path=review.OUTPUT/f'{label}.json'
    previous_report_stamp=report_path.stat().st_mtime_ns if report_path.exists() else None
    metadata={'protocol':'headed-native-fullscreen' if args.fullscreen else 'headed-fixed-viewport',
        'headless':False,'fullscreenRequested':args.fullscreen,'requestedMonitor':args.headed_monitor,
        'windowsDisplayModesBefore':modes,'forwardedArguments':forwarded,
        'wrapperSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'notes':['The unchanged review owns fixtures, seed, equipment, input, warm-up, windows and frame summaries.',
          'Win32 mode is configured refresh, not measured panel scanout. Game draw/RAF intervals are not a count of compositor-presented or physically displayed frames.',
          'Run before/after sequentially on the same unobstructed display. Focus/visibility events are recorded without per-frame desktop polling.',
          'Fullscreen uses a trusted pre-fixture button click and native viewport/DPR; compare it only against the same separately labelled fullscreen protocol.',
          'No OS registry, power, GPU, monitor-refresh or global browser setting is changed. Temporary isolated browser storage remains owned by the existing review.']}
    failure=None
    try:
        review.main()
    except BaseException as error:
        failure=error
        metadata['failure']=repr(error)
    finally:
        sys.argv=original_argv;review.sync_playwright=original_sync
        metadata['pages']=owner.pages
        metadata['viewportExceedsOuterWindow']=[row['page'] for row in owner.pages if row.get('window') and
            (row['window']['innerWidth']>row['window']['outerWidth'] or row['window']['innerHeight']>row['window']['outerHeight'])]
        metadata['measuredFocusOrVisibilityInterruptions']=[{'page':row['page'],'mode':row.get('mode'),'event':event}
            for row in owner.pages for event in row.get('events',[])
            if event['measured'] and (not event['focused'] or event['visible']!='visible')]
        metadata['windowsDisplayModesAfter']=display_modes()
        if label!='headed-help':
            output=review.OUTPUT;output.mkdir(parents=True,exist_ok=True)
            metadata['reviewReportWritten']=report_path.exists() and report_path.stat().st_mtime_ns!=previous_report_stamp
            (output/f'{label}-headed-conditions.json').write_text(json.dumps(metadata,indent=2),encoding='utf8')
            if metadata['reviewReportWritten']:
                report=json.loads(report_path.read_text(encoding='utf8'));report['headedConditions']=metadata
                report['harnessHashes']['browser-performance-headed.py']=metadata['wrapperSha256']
                if args.fullscreen:
                    report['requestedEmulatedViewport']=report['viewport'];report['requestedEmulatedDpr']=report['fixtureSettings']['dpr']
                    actual=[row for row in owner.pages if row.get('mode') in report['scenarios']]
                    report['actualViewportAndDprPerPage']=[{'page':row['page'],'mode':row['mode'],'window':row.get('window'),'gameCanvas':row.get('gameCanvas')} for row in actual]
                    geometry={(row['window']['innerWidth'],row['window']['innerHeight'],row['window']['devicePixelRatio']) for row in actual if row.get('window')}
                    if len(geometry)==1:
                        width,height,dpr=next(iter(geometry));report['viewport']={'width':width,'height':height};report['fixtureSettings']['dpr']=dpr
                    else:
                        report['viewport']={'variesByPageOrUnavailable':True};report['fixtureSettings']['dpr']=None
                    report['notes'].append('Fullscreen wrapper removes viewport/DPR emulation. Requested viewport fields are retained for provenance; actual per-page values govern comparison.')
                report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
    if failure:raise failure


if __name__=='__main__':main()
