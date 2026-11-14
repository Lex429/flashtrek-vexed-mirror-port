"""No Gamepad actuator: permission-gated HID output and the real fatal-hit handler."""
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'dualsense-direct'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        brave = Path('C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe')
        browser = p.chromium.launch(headless=True, **({'executable_path': str(brave)} if brave.exists() else {'channel': 'msedge'}))
        page = browser.new_page(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""(()=>{
          window.__nativeHidAvailable=!!navigator.hid;window.__hidPackets=[];window.__hidRequests=0;window.__hidPolls=0;window.__hideGamepad=false;
          window.__hidButtons=Array(18).fill(0);window.__hidAxes=[128,128,128,128];const inputs=new Set();
          window.__hidPad={id:'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({value:0,pressed:false})),vibrationActuator:null};
          Object.defineProperty(navigator,'getGamepads',{value:()=>{__hidPolls++;return __hideGamepad?[]:[__hidPad];}});
          const device={vendorId:0x054c,productId:0x0ce6,productName:'DualSense Wireless Controller',opened:false,
            collections:[{outputReports:[{reportId:0x31,items:[{reportSize:8,reportCount:77}]}]}],async open(){this.opened=true;},async close(){this.opened=false;},
            addEventListener(name,callback){if(name==='inputreport')inputs.add(callback);},removeEventListener(name,callback){if(name==='inputreport')inputs.delete(callback);},
            async sendReport(id,data){__hidPackets.push({id,data:Array.from(data)});}};
          Object.defineProperty(navigator,'hid',{value:{async getDevices(){return [];},async requestDevice(options){__hidRequests++;window.__hidFilters=options.filters;return [device];},addEventListener(){}}});
          setInterval(()=>{
            if(!__hideGamepad||!device.opened||!window.nativeDualSenseHid)return;
            const b=__hidButtons,data=new Uint8Array(77);data.set(__hidAxes,1);
            data[8]=b[12]?(b[15]?1:b[14]?7:0):b[13]?(b[15]?3:b[14]?5:4):b[15]?2:b[14]?6:8;
            for(const [index,mask] of [[0,32],[1,64],[2,16],[3,128]])if(b[index])data[8]|=mask;
            for(const [index,mask] of [[4,1],[5,2],[8,16],[9,32],[10,64],[11,128]])if(b[index])data[9]|=mask;
            data[5]=Math.round(b[6]*255);data[6]=Math.round(b[7]*255);data[10]=(b[16]?1:0)|(b[17]?2:0);
            new DataView(data.buffer).setUint32(73,nativeDualSenseHid.crc32(Uint8Array.from([0xa1,0x31,...data.slice(0,73)])),true);
            for(const callback of inputs)callback({device,reportId:0x31,data:new DataView(data.buffer)});
          },16);
        })();""")
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.locator('#controller-status').click()
        assert page.locator('#pause-vibration-test').is_disabled()
        assert page.locator('#pause-vibration-direct').is_enabled()
        assert 'needs setup' in page.locator('#pause-vibration-status').inner_text()
        assert page.evaluate('__hidRequests') == 0
        assert page.locator('#controller-status').get_attribute('data-vibration') == 'setup'
        page.screenshot(path=str(OUT / 'needs-setup.png'))
        page.locator('#pause-vibration-direct').click()
        page.wait_for_function('()=>nativeControllerHaptics.inspect().directConnected&&!nativeControllerHaptics.inspect().directConnecting')
        assert page.evaluate('__hidRequests') == 1
        assert page.evaluate('__hidFilters.every(f=>f.vendorId===0x054c)')
        assert page.locator('#pause-vibration-test').is_enabled()
        page.locator('#pause-vibration-test').click()
        page.wait_for_function('()=>__hidPackets.some(p=>p.data[4]||p.data[5])')
        page.wait_for_function('()=>document.querySelector(".pause-feedback").textContent.includes("test sent")')
        assert page.evaluate('__hidPackets.at(-1).data[4]===0&&__hidPackets.at(-1).data[5]===0')
        assert page.evaluate('__hidPackets.every(p=>p.id===0x31&&p.data.length===77)')
        page.screenshot(path=str(OUT / 'direct-ready.png'))
        page.evaluate('nativePause.close()')
        page.locator('[data-menu="dev"]').click()
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        page.evaluate("""()=>{
          const s=nativeNpcDev.getState();window.__fatalState=s;
          nativeCivilianTraffic.advance=()=>{};nativeSolEconomy.advance=()=>{};
          s.civilianTraffic.ships=[];s.solEconomy.freighters=[];nativeNpcLives.invalidateMembership(s);
          Object.assign(s,{system:2,localBody:0,x:4e6,y:4e6,angle:0,speed:0,vx:0,vy:0,landed:false,phase:'flight',localCruise:null,arrivalApproach:null});
          nativeSystemCatalog.initialize(s);nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
          const d=nativeShipDefinitions.describe(s,s,{category:'player'});s.hull=d.definition.hull;s.shields=0;
          window.__hidMoves=[];const systems=nativeShipSystems;
          window.nativeShipSystems={...systems,move(state,entity,category,command,profile,dt){
            const result=systems.move(state,entity,category,command,profile,dt);
            if(entity===s){__hidMoves.push({...command});if(__hidMoves.length>300)__hidMoves.shift();}return result;
          }};
        }""")
        page.evaluate('__hideGamepad=true')
        page.wait_for_function('()=>document.querySelector("#controller-status").dataset.inputSource==="WebHID"')
        assert page.locator('#controller-status').get_attribute('data-state') == 'connected'

        def hid_polls(count=4):
            start = page.evaluate('__hidPolls')
            page.wait_for_function('goal=>__hidPolls>=goal', arg=start + count)

        def hid_press(index):
            page.evaluate('i=>__hidButtons[i]=1', index)
            hid_polls()
            page.evaluate('i=>__hidButtons[i]=0', index)
            hid_polls()

        page.evaluate('__hidAxes=[255,128,128,128];__hidMoves=[]')
        try:
            page.wait_for_function('()=>__hidMoves.some(c=>c.heading===0&&c.throttle===1)&&__fatalState.speed>0', timeout=10000)
        except Exception:
            print(json.dumps(page.evaluate('()=>({focus:document.hasFocus(),hidden:document.hidden,input:nativeControllerHaptics.inputDevice(),phase:__fatalState.phase,speed:__fatalState.speed,menu:!document.querySelector("#menu-art").hidden,moves:__hidMoves.slice(-3),paused:nativePause.active,blocked:nativeSimulation.blocked()})'), indent=2))
            raise
        page.evaluate('__hidAxes=[128,128,128,128];__hidButtons[12]=1;__hidButtons[15]=1;__hidMoves=[]')
        page.wait_for_function('()=>__hidMoves.some(c=>c.throttle===1&&c.turn===1&&!Number.isFinite(c.heading))')
        page.evaluate('__hidButtons.fill(0)')
        hid_polls()
        hid_press(4)
        assert page.evaluate('__fatalState.speed===0')
        hid_press(8)
        assert page.evaluate('nativeGalaxyMap.isOpen')
        hid_press(1)
        if page.evaluate('nativeGalaxyMap.isOpen'):
            hid_press(1)
        assert not page.evaluate('nativeGalaxyMap.isOpen')
        hid_press(17)
        assert page.evaluate('nativeShipInventory.active')
        hid_press(17)
        assert not page.evaluate('nativeShipInventory.active')
        hid_press(9)
        assert page.evaluate('nativePause.active')
        hid_press(9)
        assert not page.evaluate('nativePause.active')
        page.screenshot(path=str(OUT / 'direct-input-ready.png'))
        page.evaluate("""()=>{
          const s=__fatalState,d=nativeShipDefinitions.describe(s,s,{category:'player'});
          const result=nativeCombatShots.onPlayerHit(s,d.definition.hull+1,{kind:'torpedo',from:nativeCombatShots.worldPoint(d,{x:-500,y:0}),sourceId:'civilian:test'});
          window.__fatalResult=result;
        }""")
        assert page.evaluate('__fatalResult.destroyed&&__fatalState.phase==="destroyed"')
        page.wait_for_function('()=>__hidPackets.some(p=>p.data[4]>=204&&p.data[5]>=204)')
        page.wait_for_function('()=>__hidPackets.at(-1).data[4]===0&&__hidPackets.at(-1).data[5]===0')
        assert page.evaluate('nativeControllerHaptics.inspect().last.fatal')
        assert not errors, errors
        report = {'passed': True, 'browser': 'Brave' if brave.exists() else 'Edge',
                  'nativeWebHidAvailable': page.evaluate('__nativeHidAvailable'), 'noGamepadActuator': True,
                  'explicitPicker': True, 'directBluetoothReports': True, 'automaticMotorStop': True,
                  'directInputWithEmptyGamepadApi': True, 'stickAndDpadFlight': True, 'mapTouchpadAndPause': True,
                  'fatalDamageSurvivesInputCleanup': True, 'packets': page.evaluate('__hidPackets.length'), 'errors': errors}
        (OUT / 'results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
