"""Measure actual game artwork against the atlas and preserve pre-scale hardware."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before',type=Path,help='Optional pre-install definition snapshot')
args=parser.parse_args()
output=ROOT/'test-results/ship-scale-game';output.mkdir(parents=True,exist_ok=True)
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1400,'height':1000})
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html',wait_until='domcontentloaded')
    page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden',timeout=90000)
    after=page.evaluate('''()=>({ships:nativeShipDefinitions.registered().map(entry=>{const d=nativeShipDefinitions.get(entry.id);return Object.fromEntries(['id','name','hull','shields','cargo','price','slots','startingEquipment','npcStartingEquipment','npcPolicy','thrusters','statUpgrades','capabilities','mass','inertia','dimensions'].map(key=>[key,d[key]]))})})''')
    scaled=page.evaluate('Object.keys(nativeShipScaleSettings.gameplayShips).map(Number)')
    if args.before:
        before=json.loads(args.before.read_text(encoding='utf8'))
        assert [r['id'] for r in before['ships']]==[r['id'] for r in after['ships']]
        for old,new in zip(before['ships'],after['ships']):
            for key in old:
                if key=='dimensions' and old['id'] in scaled:continue
                assert old[key]==new[key],(old['id'],key,old[key],new[key])
    measured=page.evaluate(r'''async()=>{
      const rows=[],check=(v,m)=>{if(!v)throw Error(m)},scale=nativeShipScaleSettings;
      for(const [key,row] of Object.entries(scale.ships)){
        const id=Number(key),d=nativeShipDefinitions.get(id),asset=await vexedFlightAssets.loadShip(id,d.hull);
        const canvas=document.createElement('canvas');canvas.width=asset.width;canvas.height=asset.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(asset.art,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>=32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        const visibleHeight=d.dimensions.height*(bottom-top+1)/canvas.height;
        const visibleWidth=d.dimensions.width*(right-left+1)/canvas.width;
        const frame=scale.gameplayShips[id].dimensions,expectedHeight=frame.height*row.bounds.height/row.artwork.height;
        check(Math.abs(visibleHeight-expectedHeight)<1e-8,'Visible hull length differs from compact gameplay scale '+id);
        check(visibleHeight<=row.meters*scale.unitsPerMeter+1e-8,'Compact hull exceeds its full reference scale '+id);
        check(Math.abs(visibleWidth-visibleHeight*(right-left+1)/(bottom-top+1))<1e-8,'Hull aspect changed '+id);
        check(d.mass===row.physical.mass&&d.inertia===row.physical.inertia,'Physical hardware changed '+id);
        for(const category of ['player','civilian','tug']){
          const dims=nativeShipDefinitions.dimensions({shipType:id},category);
          check(dims.width===d.dimensions.width&&dims.height===d.dimensions.height,'Role changed scale '+id+'/'+category);
        }
        rows.push({id,meters:row.meters,visibleHeight,visibleWidth,frame:d.dimensions});
      }
      return rows;
    }''')
    atlas=browser.new_page(viewport={'width':1440,'height':1100})
    atlas.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/ship-scale.html',wait_until='domcontentloaded')
    atlas.wait_for_function('window.shipScaleAtlas?.snapshot().ready',timeout=90000)
    snapshot=atlas.evaluate('shipScaleAtlas.snapshot()');assert not snapshot['errors'],snapshot['errors']
    game={r['id']:r for r in after['ships']}
    for row in snapshot['rows']:
        if row['geometry']['corrected'] is None:continue
        assert row['geometry']['current']['height']<=row['geometry']['corrected']['height']+1e-8,row['id']
        assert row['geometry']['current']['width']<=row['geometry']['corrected']['width']+1e-8,row['id']
        assert row['dimensions']==game[row['id']]['dimensions'],row['id']
    assert game[7]['dimensions']['height']==11.7
    assert not errors,errors
    report={'passed':True,'measuredHulls':len(measured),'rosterHulls':len(after['ships']),
            'roleCases':len(measured)*3,'danubeFrameHeight':11.7,'unitsPerMeter':snapshot['unitsPerMeter'],
            'beforeAndAfterStatsVerified':bool(args.before),'javascriptErrors':errors,'rows':measured}
    (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    (output/'definitions-after.json').write_text(json.dumps(after,indent=2),encoding='utf8')
    atlas.screenshot(path=str(output/'atlas-applied.png'),full_page=True)
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}),flush=True)
    browser.close()
