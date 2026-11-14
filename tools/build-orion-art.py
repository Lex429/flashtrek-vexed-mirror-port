"""Package generated Orion masters and measure shared lamp/breach profile data.

This preserves the generated artwork and fixed full canvas. The only pixel
operation is ordinary whole-frame deployment resampling to the existing 512 px
fleet resolution; damage, backgrounds and ship designs come from image_gen.
"""
import hashlib,json,math,subprocess
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'html-games/flashtrek-broken-mirror/showcase-assets'
DEST=ART/'orion'
STAGES=['intact','light','heavy','severe']
SIZE=512

def components(points):
    points=set(points);result=[]
    while points:
        first=points.pop();group=[first];queue=[first]
        while queue:
            x,y=queue.pop()
            for dx,dy in [(-1,-1),(0,-1),(1,-1),(-1,0),(1,0),(-1,1),(0,1),(1,1)]:
                p=(x+dx,y+dy)
                if p in points:points.remove(p);queue.append(p);group.append(p)
        result.append(group)
    return sorted(result,key=len,reverse=True)

def runs(points,left,top):
    rows={}
    for x,y in points:rows.setdefault(y-top,[]).append(x-left)
    result=[]
    for y in sorted(rows):
        xs=sorted(rows[y]);start=last=xs[0]
        for x in xs[1:]:
            if x==last+1:last=x
            else:result.append([y,start,last-start+1]);start=last=x
        result.append([y,start,last-start+1])
    return result

code="const fs=require('fs'),vm=require('vm'),c=vm.createContext({window:{}});for(const n of ['world-data','orion-world'])vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+n+'.js','utf8'),c);process.stdout.write(JSON.stringify(c.window.nativeOrionWorld.hulls));"
hulls=json.loads(subprocess.check_output(['node','-e',code],cwd=ROOT,text=True))
generation=json.loads((DEST/'generation.json').read_text(encoding='utf8'))
assert len(generation['stages'])==16,'Finish all four sequential damage chains first'
profiles={};audit=[]
catalog_path=ART/'catalog.json';catalog=json.loads(catalog_path.read_text(encoding='utf8'))
combat_path=ART/'combat-data.json';combat=json.loads(combat_path.read_text(encoding='utf8'))
for hull in hulls:
    key=hull['file'];frames=[];metrics=[]
    for stage,name in enumerate(STAGES):
        row=next(row for row in generation['stages'] if row['id']==hull['id'] and row['stage']==stage)
        master=DEST/row['master'];assert hashlib.sha256(master.read_bytes()).hexdigest()==row['sha256']
        if stage:
            parent=next(r for r in generation['stages'] if r['id']==hull['id'] and r['stage']==stage-1)
            assert row['input']==parent['master'] and row['inputSha256']==parent['sha256'],'Damage stage did not use its immediate parent'
        with Image.open(master) as source:
            assert source.mode=='RGBA';frame=source.resize((SIZE,SIZE),Image.Resampling.LANCZOS)
        frame.save(DEST/f'orion-{key}-{name}.png',optimize=True);frames.append(frame)
        alpha=frame.getchannel('A');histogram=alpha.histogram()
        assert sum(histogram[:8])>SIZE*SIZE*.3,'Opaque backdrop in generated sprite'
        solid=alpha.point(lambda value:255 if value>=150 else 0)
        metrics.append({'stage':stage,'solidPixels':sum(histogram[150:]),'solidBounds':solid.getbbox(),
            'masterSha256':row['sha256'],'deployedSha256':hashlib.sha256((DEST/f'orion-{key}-{name}.png').read_bytes()).hexdigest()})
    pixels=list(frames[0].getdata());lights=[]
    predicates=[('teal',lambda r,g,b:r<g*.7 and g>145 and b>115 and g>b*.7 and g<b*1.9,'#56f0cd'),
                ('amber',lambda r,g,b:r>240 and g>110 and g<r*.8 and b<r*.35,'#ffc15a')]
    for tint,predicate,color in predicates:
        points={(i%SIZE,i//SIZE) for i,(r,g,b,a) in enumerate(pixels) if a>=150 and predicate(r,g,b)}
        for group in components(points):
            if len(group)<2:continue
            left=min(p[0] for p in group);right=max(p[0] for p in group);top=min(p[1] for p in group);bottom=max(p[1] for p in group)
            width=right-left+1;height=bottom-top+1
            if max(width,height)>80:continue
            lights.append({'x':round(sum(p[0] for p in group)/len(group),2),'y':round(sum(p[1] for p in group)/len(group),2),
                'left':left,'top':top,'w':width,'h':height,'r':min(24,max(3,max(width,height)*.55)),
                'kind':'core' if tint=='teal' else 'running','offSevere':True,'tint':'lens','color':color,
                'runs':runs(group,left,top),'phase':round(len(lights)*.73,2)})
    assert any(light['kind']=='core' for light in lights),'No painted Orion engine masks found'
    damage=[[]];removed_by_stage=[]
    for stage in range(1,4):
        before=list(frames[stage-1].getchannel('A').getdata());after=list(frames[stage].getchannel('A').getdata())
        removed={(i%SIZE,i//SIZE) for i,(a,b) in enumerate(zip(before,after)) if a>=150 and b<40}
        added=sum(a<40 and b>=150 for a,b in zip(before,after));removed_by_stage.append(len(removed))
        assert len(removed)>15,'Damage stage removed no physical hull pieces'
        metrics[stage].update(removedPixels=len(removed),addedPixels=added)
        points=[{**p,'r':round(p['r']*1.12,2)} for p in damage[-1]]
        for group in components(removed):
            if len(group)<4:continue
            x=sum(p[0] for p in group)/len(group);y=sum(p[1] for p in group)/len(group)
            if any(math.hypot(x-p['x'],y-p['y'])<18 for p in points):continue
            points.append({'x':round(x,2),'y':round(y,2),'r':round(min(13,max(5,math.sqrt(len(group)/math.pi)*.35)),2)})
            if len(points)>=min(12,stage*4):break
        assert points;damage.append(points)
    opaque=[(i%SIZE,i//SIZE) for i,p in enumerate(pixels) if p[3]>=150]
    def surface(x,y):return min(opaque,key=lambda p:(p[0]-x)**2+(p[1]-y)**2)
    locations=[('command prow',.5,.2),('port forward hull',.32,.38),('starboard forward hull',.68,.38),
        ('port mid hull',.3,.56),('starboard mid hull',.7,.56),('reactor housing',.5,.62),
        ('port aft hull',.32,.74),('starboard aft hull',.68,.74),('port engine',.36,.88),('starboard engine',.64,.88),('stern',.5,.88)]
    sites=[[name,*surface(x*SIZE,y*SIZE)] for name,x,y in locations]
    sites.extend([f'breach section {index+1}',p['x'],p['y']] for index,p in enumerate(damage[3]))
    core=next(site[1:] for site in sites if site[0]=='reactor housing')
    profiles[str(hull['id'])]={'width':SIZE,'height':SIZE,'displayRatio':1,'shifts':[[0,0,SIZE,SIZE] for _ in STAGES],
        'animationReady':True,'lights':lights,'damage':damage,'sites':sites,'core':core,'energyColor':'#ffb260',
        'fragmentOptions':{'armorChips':True,'darkening':42,'minimumAlpha':150,'regions':damage,'maxPieces':3}}
    emitters={'beam':{'x':0,'y':-.32},'projectile':{'x':0,'y':-.35},**hull.get('emitters',{})}
    for point in emitters.values():
        x=round((point['x']+.5)*SIZE);y=round((point['y']+.5)*SIZE)
        assert frames[0].getpixel((x,y))[3]>=150,'Weapon mount is outside the original physical hull'
    row={'id':hull['id'],'name':hull['name'],'kind':'ship','origin':'Original Orion artwork, built-in image_gen',
        'artworkStatus':'animated','frames':[f'orion/orion-{key}-{stage}.png' for stage in STAGES],
        'original':f'orion/orion-{key}-intact.png','bounds':[0,SIZE,0,SIZE],'previewSize':320,'damageFramesReady':True,
        'mass':hull['massClass']*75,'debrisKind':1,'size':150,'shieldColor':'blue',
        'points':[{'kind':'beam',**emitters['beam']},{'kind':'torpedo',**emitters['projectile']}]}
    existing=next((i for i,e in enumerate(catalog['ships']) if e['id']==hull['id']),None)
    if existing is None:catalog['ships'].append(row)
    else:catalog['ships'][existing]=row
    combat['ships'][str(hull['id'])]={'name':hull['name'],'weaponsRating':hull['massClass']+1,'hull':hull['hull'],'shields':hull['shields']}
    audit.append({'id':hull['id'],'ship':key,'lights':len(lights),'engineMasks':sum(p['kind']=='core' for p in lights),'frames':metrics,'removedByStage':removed_by_stage})
profile_source='/* Measured masks and breach anchors from the sequential Orion artwork. */\nwindow.orionAnimationProfiles='+json.dumps(profiles,separators=(',',':'))+';\nObject.assign(window.earthAnimationProfiles,window.orionAnimationProfiles);\n'
(ART.parent/'orion-profiles.js').write_text(profile_source,encoding='utf8',newline='\n')
catalog_path.write_text(json.dumps(catalog,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
combat_path.write_text(json.dumps(combat,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
(DEST/'art-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print(json.dumps([{'ship':r['ship'],'lights':r['lights'],'engineMasks':r['engineMasks'],'removedByStage':r['removedByStage']} for r in audit]))
