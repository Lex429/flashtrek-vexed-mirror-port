"""Build the game's local systems from the reviewed lore, without changing legacy IDs.

The reviewed Mirror expansion explicitly adapts selected Prime geography and
reference schemes; evidence tags keep those separate from screen facts.
Run from any directory. Writes the catalog, art prompts and an append-only world extension.
"""
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'html-games' / 'broken-mirror-port'
RESEARCH = json.loads((ROOT / 'docs/research/system-lore/systems.json').read_text(encoding='utf-8'))
LORE = {s['id']: s for s in RESEARCH['systems']}
NEIGHBORHOODS = json.loads((ROOT/'tools/system-neighborhoods.json').read_text(encoding='utf-8'))['systems']
ADDITIONS = json.loads((ROOT/'tools/system-additions.json').read_text(encoding='utf-8'))
EXPANSION = json.loads((ROOT/'tools/mirror-expansion.json').read_text(encoding='utf-8'))
LAYOUT = json.loads((ROOT/'tools/system-layout.json').read_text(encoding='utf-8'))
OUT = GAME / 'assets' / 'system-planets'
OUT.mkdir(parents=True, exist_ok=True)

def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

SOL_ART = '../flashtrek-broken-mirror/art-review/sol-planets/'
ART = 'assets/system-planets/'
BASE_PROMPT = ('Use case: stylized-concept. Asset type: production planet sprite for the Star Trek-inspired Vexed Mirror game. '
    'Render ONE complete spherical planet isolated on genuinely transparent background. Detailed realistic orbital photography / '
    'cinematic astronomical matte painting, crisp geography, subtle atmospheric limb where appropriate, natural sunlight from upper left, '
    'soft night-side terminator on lower right, matching polished Sol planet sprites. Centered full circular disk occupies 88 percent of '
    'a square image, all edges comfortably inside frame. No background stars, no text, no labels, no UI, no spacecraft, '
    'no other planets, no ground-level landscape. Planet subject: ')
SUBJECTS = {
 2: 'Orion, a lush tropical alien world with teal seas, dense green jungle continents and curling white cloud systems. Original alien geography.',
 3: 'Lik Prime, mostly ochre desert, small tropical regions, polluted turquoise inland seas and vast strip-mining scars.',
 4: 'Alpha Centauri colony planet, beautiful temperate ocean world, green continents, white weather systems, faint dense coastal settlements.',
 5: 'Paso, once habitable and now utterly lifeless from strip-mining: scorched rock, toxic rust and grey surface, dry basins and mining scars.',
 6: 'New Switzerland, a beautiful temperate human refuge, snowy mountain ranges, green continental valleys and deep blue seas.',
 7: 'Trey, grim arid prison world with enormous deep canyon systems, eroded sandstone plateaus and sparse grey clouds.',
 8: 'Epsilon, an abandoned temperate human colony world with weathered green-brown continents, blue ocean and thin clouds.',
 9: 'Quintus, dry temperate military outpost planet with dusty ochre continents and scattered ocean basins.',
 10: 'The Broken Mirror Gorn world: abandoned dry reptilian homeworld with barren amber land, dead seas and a thin sickly atmosphere. This is game lore, not a claim about Gornar.',
 11: 'Rigel VII, rocky temperate planet with rugged brown-grey mountains, dark blue seas and diffuse pale clouds.',
 12: 'Vulcan, hot arid rust-red desert planet, orange sandstone continents, volcanic mountains, sparse thin dusty clouds and no large blue oceans.',
 13: 'Opusab, a peaceful flowering alien world with subtle violet vegetation on green continents, blue seas and delicate clouds.',
 14: 'Ferenginar, a very wet lush green world with vast swirling rain clouds and small gaps revealing dark green land and water.',
 15: 'Lysia, an inhabited temperate alien world with green-brown continents, blue oceans and soft cloud bands.',
 16: 'Nausicaa, a harsh rugged grey-brown world with muted ochre atmosphere, rocky mountains and dark seas.',
 17: 'Denmark, a pristine rich blue-green planet with intricate river systems, lush continents, snow peaks and white cloud swirls.',
 18: 'Tholia, an extremely hot hostile world: deep amber-red atmosphere, volcanic rock glimpsed under orange cloud layers. No Earth-like oceans.',
 19: 'Flash, inhabited temperate alien world with blue seas, emerald continents, pale atmospheric rim and faint city networks.',
 20: 'Oce Nu, a small inhabited blue-grey frontier world with battered arid continents and scattered ocean basins.',
 21: 'Koann, a militarized industrial world with grey-brown continents, dark ocean and tiny subtle orbital-era city lights on the night side.',
 22: 'Biakisch, pristine preindustrial alien world with large green forests, warm shallow turquoise seas and delicate white clouds.',
 23: 'Delpi, almost entirely ocean, 99.8 percent water, deep sapphire water and turquoise shallows, a few tiny islands and swirling white clouds.',
 24: 'Iconia, devastated ancient homeworld with weathered ochre-grey continents, old impact scars, sparse ocean and thin clouds.',
 25: 'Andoria, a spherical frozen MOON, blue-white ice sheets, rugged glacial terrain and pale blue atmosphere. Show only the moon; its gas giant parent is a separate asset.',
 26: 'Konae, small uncolonized pleasant world, blue seas, green-brown continents and scattered white clouds.',
 27: 'Trill, a lush temperate world with green continents, blue oceans, mountain chains and intricate white weather patterns.',
 28: 'Tepos, industrial weapons-trading world with brown-green land, grey seas and faint warm night-side settlement patterns.',
 29: 'Blender, a war-scarred alien world with blasted brown-grey continents, impact scars, remnants of green land and a smoky thin atmosphere.',
 30: 'Remus, a tidally locked rocky mining world, austere dark grey mountains and deep scarred mineral basins, heavily scorched ochre sunward side, shadowed cold hemisphere. No blue oceans.',
 31: 'Romulus, lush temperate Romulan homeworld: blue-green oceans, deep emerald wooded continental landmasses, mountain ranges and intricate white weather systems, restrained pale cyan atmosphere. Original geography, intact pre-supernova Mirror game world.',
 32: 'Harman, an abandoned frozen wasteland planet, grey-white ice fields, dark frozen mountain chains and a very thin pale atmosphere.',
 33: 'Kardon, a planet whose surface has been burned away by catastrophe, blackened charcoal crust with scarred copper fissures and no life.',
 34: 'Vex, almost destroyed homeworld, blackened green-grey terrain, enormous scars and dead basins, a thin eerie green atmosphere. Intact spherical planet, not an explosion.',
 35: 'Lameu, independent temperate colony world, blue water, patchy olive-green continents and thin white cloud systems.',
 36: 'Batos, a dry frontier outpost planet with orange-brown land, modest dark seas and thin haze.',
 37: 'Worf, a peaceful Klingon colony planet, earthy green-brown continents, blue-grey ocean and mountain ranges.',
 38: "Qo'noS, rugged Klingon homeworld, olive-brown landmasses and mountain chains, dark green-blue ocean, dense turbulent pale clouds. No destroyed moon in this asset.",
 39: 'Xonok, heavily strip-mined barren rocky world, grey-brown mining scars and toxic murky atmospheric haze, no life or blue oceans.',
 40: 'Qem-Kis, largely abandoned former metropolis world, grey urban continental patterns, dark ocean and sparse patches of cloud.',
 41: 'Anorez, biodiverse wilderness world, green forest continents and wetlands, rich blue ocean and delicate white cloud systems.',
 42: "Du'Qot, a harsh Klingon frontier world with rust-brown mountains, dark seas and pale cloud bands.",
 43: 'Hof-Maso, Klingon frontier planet with olive ochre continents, modest blue-grey sea basins and thin clouds.',
 44: 'Nyoabek, distant inhabited alien world, dusky purple-brown continental terrain and dark blue seas, soft pale cloud bands.',
 45: "Hos'Ichu, a volcanic world with black basalt continents, glowing lava fissures, sulfur haze and sparse dark seas.",
 46: "Kah'Less, dismal rugged training world, treacherous brown mountain ranges, dark blue-grey ocean and dense storm systems.",
 47: 'Bajor, beautiful pristine temperate planet, rich blue oceans, deep green and ochre continents, snow-capped mountains and clean white weather patterns.',
 48: 'Noron, arid desert world, ochre dune continents, rugged sandstone, a few small turquoise oases, little vegetation.',
 49: 'Erasariel, very cold distant inhabited planet, blue-white ice, rugged frozen mountain chains and a thin pale atmospheric halo.',
 50: 'Cardassia Prime, hot heavily urbanized depleted world, ochre-grey continents with vast fine metallic city grids over much of the surface, small dark seas and pale haze.',
 51: 'Dyson, abandoned advanced civilization home planet, dusty brown terrain and silent ancient city traces. Render only this spherical planet, NOT a Dyson sphere megastructure.',
 52: 'Pirates Haven, a lawless harsh frontier world with battered rocky brown continents, deep blue-black ocean and turbulent pale clouds.',
}
prompts = {slug(LORE[i]['gameName']): BASE_PROMPT + subject for i, subject in SUBJECTS.items()}
if (OUT/'romulus.actual-prompt.txt').exists():
    prompts['romulus']=(OUT/'romulus.actual-prompt.txt').read_text(encoding='utf-8').strip()
extra_subjects = {
 'inner-rock': 'a small airless inner rocky planet, detailed charcoal and warm copper crater fields, no atmosphere or water.',
 'outer-giant': 'a large alien gas giant with cream, amber and muted teal cloud bands and intricate swirling storms, no rings.',
 'outer-ice': 'a cold outer ice planet, pale blue frozen crust, fractured ice sheets and subtle grey mountains.',
 'frontier-moon': 'a small airless alien moon, grey basalt, intricate craters and long eroded mineral ridges.',
 'andorian-giant': 'the unnamed Andorian gas giant, pale blue and lavender cloud bands with subtle storms, broad delicate icy rings; entire tilted ring ellipse and sphere fit inside frame.',
 'bajor-viii': 'Bajor VIII, an outer planetary destination: muted blue-grey and tan cloud layers, subtle swirling storms; original visual interpretation because its full appearance is not established.',
 'derna': 'Derna, a rocky moon of Bajor, pale grey-brown rugged craters and mineral highlands, no atmosphere or water.',
 'jeraddo': 'Jeraddo, a rocky moon of Bajor, russet and grey crater fields and dust plains, intact in this Mirror game adaptation.',
 'praxis': 'Praxis, Klingon moon after its catastrophic mining explosion, a round grey-brown moon with a very large missing wedge and jagged broken exposed interior, drifting small rubble close to broken edge, no explosion or glow. Entire object contained in frame.',
 't-khut': "T'Khut, large volcanic orange-red planetary companion of Vulcan, rugged dark continents and bright rust deserts, subdued lava fissures and thin haze.",
 'kerkhov': 'Kerkhov, an alien planetary destination in the Vulcan system, subdued teal and ochre cloud formations and rugged dark surface, original visual interpretation.',
 'romulan-inner': 'unnamed inner planet in the Romulan home system, rust and charcoal airless cratered rock, mineral ridges and heat-darkened terrain.',
 'romulan-outer': 'unnamed outer planet in the Romulan home system, a cold blue-grey planet with subtle white icy cloud bands and storms; original visual interpretation.',
 'cardassia-i': 'Cardassia I, hot inner rocky world, orange-brown barren mountains and dusty grey impact basins, thin heat haze; original visual interpretation.',
 'cardassia-iii': 'Cardassia III, rocky alien world with olive-brown continents, dark shallow seas and scattered thin clouds; original visual interpretation.',
 'cardassia-iv': 'Cardassia IV, harsh dry world with rust-brown ridges and grey rock, subtle atmospheric haze and no lush vegetation; original visual interpretation.',
 'cardassia-v': 'Cardassia V, remote cold rocky world with slate blue-grey terrain, white ice caps and thin pale clouds; original visual interpretation.',
 'ceres': 'Ceres, Solar System dwarf planet, realistically grey heavily cratered rock and subtle bright salt deposits, spherical full disk, no atmosphere.',
 'haumea': 'Haumea, Solar System elongated rapidly rotating icy dwarf planet, realistic pale grey-white rocky ice texture, horizontally elongated ellipsoid instead of spherical, thin delicate ring entirely contained in frame.',
 'makemake': 'Makemake, Solar System dwarf planet, pale rust-red methane ice surface with subtle patchy bright frost, full spherical disk, no clouds.',
 'eris': 'Eris, Solar System dwarf planet, bright pale grey-white icy surface with soft mottling, full spherical disk, no clouds.',
 'copper-rock': 'a small airless rocky planet with deep copper mineral basins, charcoal volcanic plains and densely detailed ancient craters, no atmosphere or water.',
 'silver-rock': 'a small airless rocky planet of silver-grey basalt, pale crater rays and dark ancient lava plains, no atmosphere or water.',
 'jade-giant': 'an alien gas giant with subdued jade green, pale cream and slate blue cloud bands and intricate turbulent vortices, no rings.',
 'violet-giant': 'an alien gas giant with muted lavender, pearl grey and indigo cloud bands and delicate turbulent storms, no rings.',
 'rust-moon': 'an airless alien moon with rust-brown mineral highlands, silver-grey impact craters and long dark ridges, no clouds.',
 'ice-moon': 'an airless alien moon of pale blue-white fractured water ice, intricate grey ridges and subtle ancient impact features, no clouds.',
}
prompts.update({key: BASE_PROMPT + value for key, value in extra_subjects.items()})
for key in ['haumea-v2', 'halkan-homeworld']:
    prompt_file=OUT/(key+'.actual-prompt.txt')
    if prompt_file.exists():prompts[key]=prompt_file.read_text(encoding='utf-8').strip()
prompts['dyson-sphere'] = ('Use case: stylized-concept. Asset type: transparent production game sprite matching the cinematic realistic Sol planet artwork. '
    'Show ONE entire immense spherical Dyson shell megastructure from exterior orbital distance, isolated on genuinely transparent background. '
    'A star is fully enclosed INSIDE the sphere and is not visible separately. The shell is dark steel and blue-grey titanium with extraordinarily intricate '
    'tiny interlocking geometric engineering panels and restrained cyan habitation lights, softly lit from upper left with a dark terminator on lower right. '
    'A complete spherical disk occupies 88 percent of a square frame. No orbiting objects, no rings, no Earth continents, no clouds, no text, no labels, no stars or background. '
    'This is The Sphere in the Broken Mirror Dyson system, not a Borg cube and not a planet.')

def body(ident, name, kind='planet', art=None, evidence='game', **kw):
    return dict(id=ident, name=name, kind=kind, art=art or ART+'inner-rock.png', evidence=evidence,
                port=False, population=0, size=140, description='', **kw)

records = []
sol_names = ['Sun','Mercury','Venus','Earth','Moon','Mars','Asteroid Belt','Jupiter','Saturn','Uranus','Neptune','Pluto']
sol_xy = [(-6000,-1000),(-4100,1100),(-2300,-1500),(0,0),(1400,-250),(4800,1800),(8000,-1400),(11800,2700),(15300,-2700),(19000,3300),(23200,-4400),(27400,4200)]
sol_sizes = [266,87,147,180,67,119,147,231,217,157,154,56]
sol_pop = [0,84000,120000,4200000000,50200000,133800000,0,1200000,320000,48000,36000,0]
sol_desc = ['Our star. Observe from a safe distance.','Mercury Extraction Outpost buys ore and supplies equipment.','The Venus orbital depot handles supplies above the clouds.',"Sol's main port, shipyard, and center of government.",'Lunar settlement and mining outpost.','Mars Colony and Refinery.','A wide belt of mining regions.','Jupiter orbital station supports supply ships and prospectors.',"Saturn's orbital depot serves outer system shipping lanes.",'A remote orbital research outpost.','Neptune Frontier Station, a distant trading and exploration destination.','A remote, uninhabited dwarf planet beyond Neptune.']
sol=[]
for i,n in enumerate(sol_names):
    kind={0:'star',4:'moon',6:'belt',7:'gas_giant',8:'gas_giant',9:'ice_giant',10:'ice_giant',11:'dwarf_planet'}.get(i,'planet')
    b=body(i,n,kind,SOL_ART+f'{i:02} - {n}.png','astronomy',x=sol_xy[i][0],y=sol_xy[i][1])
    b.update(size=sol_sizes[i],port=i in [1,2,3,4,5,7,8,9,10],population=sol_pop[i],description=sol_desc[i])
    if i==3:b['legacyWorldId']=1
    if i==4:b['parentId']=3
    sol.append(b)
for i,n,x,y in [(12,'Ceres',8200,-2100),(13,'Haumea',29200,-2400),(14,'Makemake',31100,2200),(15,'Eris',33600,-3000)]:
    b=body(i,n,'dwarf_planet',ART+('haumea-v2' if n=='Haumea' else slug(n))+'.webp','astronomy',x=x,y=y)
    b.update(size=48,description=f'{n}, a dwarf planet in Sol. No port is established here in this game.')
    sol.append(b)
records.append(dict(id=1,name='Sol',legacyIds=[1],homeBodyByLegacy={'1':3},bodies=sol,notes='Existing Sol coordinates, IDs, ports and economy retained. Additional dwarf planets have no invented settlements.'))

names = {12:'40 Eridani',16:'Nausicaa',25:'Andorian',30:'Romulus',31:'Romulus',38:"Qo'noS",47:'Bajoran',50:'Cardassian'}
home_names={16:'Nausicaa',38:"Qo'noS",47:'Bajor',50:'Cardassia Prime'}
for ident,s in LORE.items():
    if ident in (1,30):continue
    home_name=home_names.get(ident,s['gameName'])
    home=body(0,home_name,'moon' if ident==25 else 'planet',ART+slug(s['gameName'])+'.webp','screen' if s['starTrekPrime']['classification']=='screen_world_match' else 'game')
    home.update(x=0,y=0,size=180,legacyWorldId=ident,port=s['brokenMirror']['populationBillions']>0,
                description=s['brokenMirror']['description'],sourceRefs=s['starTrekPrime']['sourceRefs'] if home['evidence']=='screen' else ['BM'])
    bs=[home]
    notes='The original Broken Mirror destination is retained. No additional planets are established by the reviewed sources; an incomplete survey is left incomplete rather than filled with assumed worlds. Appearance and chart spacing are interpretations.'
    def add(name,kind='planet',asset=None,evidence='screen',parent=None):
        b=body(len(bs),name,kind,ART+(asset or slug(name))+'.webp',evidence)
        b.update(sourceRefs=[] if evidence=='authored' else s['starTrekPrime']['sourceRefs'],description=f'{name}, a local {kind.replace("_"," ")}. Its appearance and chart spacing are game art interpretations; no new settlement is implied.')
        if parent is not None:b['parentId']=parent
        bs.append(b)
        return b
    if ident==31:
        rem=add('Remus',asset='remus');rem.update(size=180,legacyWorldId=30,port=LORE[30]['brokenMirror']['populationBillions']>0,description=LORE[30]['brokenMirror']['description'])
        p=add('V’Ralas',asset='romulan-inner');p.update(nameEvidence='authored',description='The unnamed inner world on the indexed Nemesis system diagram. V’Ralas is a Vexed Mirror survey name, not a screen-established proper name.')
        p=add('Draevan',asset='romulan-outer');p.update(nameEvidence='authored',description='The unnamed outer world on the indexed Nemesis system diagram. Draevan is a Vexed Mirror survey name, not a screen-established proper name.')
        notes='Romulus and Remus are in one physical system. Both retain their settlements and services. V’Ralas and Draevan are original game names for the diagram\'s unnamed worlds. Star spectral type and an unverified companion are not asserted.'
    elif ident==25:
        giant=add('Andor','gas_giant','andorian-giant',evidence='production_reference');giant['size']=250
        giant.update(sourceRefs=['ANDORIA','ANDOR-PRODUCTION'],description='Andoria\'s ringed gas giant. Andor follows the Enterprise writers\' production explanation distinguishing Andor from its inhabited moon Andoria; it is not asserted as an unambiguous spoken screen name.')
        home['parentId']=giant['id'];home['size']=105
        notes='Andoria is a moon of the ringed gas giant Andor. The giant\'s name follows the Enterprise writers\' production explanation; its evidence label distinguishes that from screen dialogue. A Procyon orbital number and additional named moons are not asserted.'
    elif ident==12:
        add("T'Khut",asset='t-khut',evidence='reported_screen_graphic')
        add('40 Eridani A I',asset='inner-rock',evidence='reported_screen_graphic')
        p=add('Kerkhov',asset='kerkhov')
        m=add('Kerkhov A','moon','frontier-moon',parent=p['id']);m.update(nameEvidence='authored',description='The Kerkhovian moon from Charades, displayed under the original game survey designation Kerkhov A. The source establishes the moon, not this name.')
        m=add("T'Khut A",'moon','outer-ice','reported_screen_graphic',1);m.update(nameEvidence='authored',description='The moon on the reported T\'Khut system graphic, displayed as T\'Khut A under a game survey designation. The source does not establish this name.')
        notes="40 Eridani / Vulcan system. T'Khut and the inner planet follow the reported Strange New Worlds graphic, not the conflicting RPG six-planet roster. Delta Vega is Kelvin and excluded. Orbital spacing is illustrative."
    elif ident==38:
        add('Praxis','moon','praxis',parent=0)
        notes="Qo'noS and Praxis retained together. The damaged Praxis image adapts the Prime catastrophe for this Mirror game; Qo'noS III is not added as a separate planet."
    elif ident==47:
        p=add('Bajor VIII',asset='bajor-viii')
        m=add('Bajor VIII-b','moon','frontier-moon',parent=p['id']);m.update(nameEvidence='authored',description='The second moon of Bajor VIII mentioned in Past Prologue. Bajor VIII-b is this game\'s survey designation, not an asserted spoken proper name.')
        add('Derna','moon','derna',parent=0)
        add('Jeraddo','moon','jeraddo',parent=0)
        notes='Bajor, Bajor VIII, its second moon, Derna and Jeraddo are supported names. The conflicting fourteen-planet licensed orbital census is not promoted to screen fact. Derna and Jeraddo belong to Bajor, not Bajor VIII. The existing game wormhole remains authoritative.'
    elif ident==50:
        for n in [1,3,4,5]:add('Cardassia '+{1:'I',3:'III',4:'IV',5:'V'}[n],asset='cardassia-'+{1:'i',3:'iii',4:'iv',5:'v'}[n])
        notes='Cardassia Prime is also Cardassia II: one body, not two. I, III, IV and V are included; an unsupported eight-planet census is not invented.'
    elif ident==11:
        notes='The original game world Rigel is retained. Its stellar identity is unresolved: the game destination is not automatically renamed Rigel VII, and Rigel VII, Beta Rigel/Rigel X and Rigel Kentaurus are not combined here without evidence.'
    elif ident==51:
        sphere=add('The Sphere','megastructure','dyson-sphere','game')
        sphere.update(legacyWorldId=51,port=home['port'],size=330,sourceRefs=['BM','BM-EXTRACT'],description='The populated Dyson shell surrounding the local star. This is the inhabited destination described in Broken Mirror; the old home planet is abandoned.')
        home.pop('legacyWorldId');home.update(port=False,population=0)
        notes='The old Dyson home planet is abandoned; its population and existing legacy services belong to The Sphere. The enclosed primary is catalogued but occluded by its shell. This is original Broken Mirror lore, not a claim that this is the Relics system.'
    # No automatic filler, minimum world count or ID-based planet-type pattern.
    # The small explicit list applies only to original game worlds, not Trek rosters.
    additions=NEIGHBORHOODS.get(str(ident),[])
    if additions:
        assert s['starTrekPrime']['classification']=='game_world_no_screen_mapping_established',ident
        notes='Broken Mirror game region with deliberately authored neighbors. The additions are original Vexed Mirror fiction, not Star Trek canon or observed exoplanets. Planet types, appearances and chart spacing are interpretations.'
    for entry in additions:
        assert entry['id']>=100 and entry['id']<900
        b=body(entry['id'],entry['name'],entry['kind'],ART+entry['asset']+'.webp','authored')
        b.update(sourceRefs=[],description='Original Vexed Mirror addition. No Star Trek source or astronomical observation establishes this world; no population or port is implied.')
        b['description']=entry.get('description',b['description'])
        if 'parentId' in entry:b['parentId']=entry['parentId']
        bs.append(b)
    # System-scaled positions, anchored at the original primary world (0,0).
    majors=[b for b in bs[1:] if 'parentId' not in b]
    for index,b in enumerate(majors):
        angle=(index*.83+.28)*math.pi
        radius=2300+index*1200
        b.update(x=round(math.cos(angle)*radius),y=round(math.sin(angle)*radius*.62))
    for b in bs:
        if 'parentId' in b and b['id']!=0:
            p=next(c for c in bs if c['id']==b['parentId'])
            b.update(x=p['x']+900,y=p['y']+450+(b['id']%2)*450,size=66)
    if ident==25:
        # Keep the original populated moon at the origin and its parent nearby.
        bs[1].update(x=-1500,y=-900)
    # Keep known inner/outer ordering sensible without asserting true distances.
    for b in bs:
        if b['name'] in ['V’Ralas','Cardassia I','40 Eridani A I']:
            b.update(x=-1800,y=-1200)
        if b['name']=='Draevan':
            b.update(x=4600,y=2300)
        if b['name']=='The Sphere':b.update(x=-4000,y=0)
        if b['name']=="T'Khut":b.update(x=-1100,y=1100)
        if ident==50 and b['name'] in ['Cardassia III','Cardassia IV','Cardassia V']:
            b.update(zip(['x','y'],{'Cardassia III':(2000,1300),'Cardassia IV':(4400,2300),'Cardassia V':(6500,-500)}[b['name']]))
    # Rebase moons after the parent placement has been finalized.
    for b in bs:
        if 'parentId' in b and b['id']!=0:
            p=next(c for c in bs if c['id']==b['parentId'])
            if ident!=25:b.update(x=p['x']+900,y=p['y']+450+(b['id']%2)*450)
    for entry in additions:
        next(b for b in bs if b['id']==entry['id']).update(x=entry['x'],y=entry['y'],size=entry['size'])
    star_name={4:'Alpha Centauri A',12:'40 Eridani A'}.get(ident,'Primary star')
    b=body(900,star_name,'star',SOL_ART+'00 - Sun.png','reference' if ident in [4,12] else 'authored_layout',x=-3800,y=-2600)
    b.update(size=230,description='Local primary. Star placement and display scale are illustrative; no unsupported spectral classification is asserted.')
    if ident==51:b.update(x=-4000,y=0,occludedBy=1)
    bs.append(b)
    if ident==4:
        b=body(901,'Alpha Centauri B','star',SOL_ART+'00 - Sun.png','astronomy',x=-5500,y=1400);b['size']=170;bs.append(b)
    if ident==12:
        for n,name in enumerate(['40 Eridani B','40 Eridani C']):
            b=body(901+n,name,'star',SOL_ART+'00 - Sun.png','reference',x=-5500-n*1300,y=1800+n*1200);b['size']=85-n*20;bs.append(b)
    records.append(dict(id=ident,name=names.get(ident,s['gameName']),legacyIds=[30,31] if ident==31 else [ident],homeBodyByLegacy={'30':1,'31':0} if ident==31 else {str(ident):1 if ident==51 else 0},bodies=bs,notes=notes))

for addition in ADDITIONS['systems'] + EXPANSION['systems']:
    record=addition['catalog']
    assert record['id']>52 and record['id'] not in [r['id'] for r in records]
    for b in record['bodies']:
        b.setdefault('art',ART+b.pop('asset','inner-rock')+'.webp')
        b.setdefault('population',0);b.setdefault('port',False)
    records.append(record)
# Explicit overlays retain every previously saved body's identity and pose.
for record in records:
    overlay=EXPANSION['overlays'].get(str(record['id']),{})
    record['notes']+=' '+overlay.get('notes','')
    home=next(b for b in record['bodies'] if b['id']==record['homeBodyByLegacy'][str(record['id'])])
    home['description']=overlay.get('homeDescription',home['description'])+overlay.get('appendDescription','')
    for ident,description in overlay.get('bodyDescriptions',{}).items():
        next(b for b in record['bodies'] if b['id']==int(ident))['description']=description
    for b in overlay.get('bodies',[]):
        assert b['id'] not in [old['id'] for old in record['bodies']]
        b.setdefault('art',ART+b.pop('asset','inner-rock')+'.webp')
        record['bodies'].append(b)
    primary=next(b for b in record['bodies'] if b['kind']=='star')
    star=EXPANSION['stars'].get(str(record['id']),dict(name=record['name']+' A',asset='star-g',spectralClass='Unresolved; G-type artwork is a game interpretation',evidence='authored_layout',source=''))
    primary.update(name=star['name'],art=ART+star['asset']+'.webp',evidence=star['evidence'],spectralClass=star['spectralClass'],sourceRefs=[star['source']] if star['source'] else [],description='Primary star. '+star['spectralClass']+'. Display color, size and chart spacing are illustrative; unknown classifications are not canon claims.')
    for companion in record['bodies']:
        if companion['kind']=='star' and companion is not primary:
            asset='star-white-dwarf' if companion['name']=='40 Eridani B' else 'star-m' if companion['name']=='40 Eridani C' else 'star-k'
            companion['art']=ART+asset+'.webp'
from system_completion import apply_completion
COMPLETION=json.loads((ROOT/'tools/system-completion.json').read_text(encoding='utf-8'))
apply_completion(records, COMPLETION, GAME)
from system_orbits import apply_orbits
ORBITS=json.loads((ROOT/'tools/system-orbits.json').read_text(encoding='utf-8'))
apply_orbits(records, ORBITS)
for prompt_file in OUT.glob('*.actual-prompt.txt'):
    key=prompt_file.name.removesuffix('.actual-prompt.txt')
    if (OUT/(key+'.webp')).is_file() and (OUT/(key+'.provenance.json')).is_file():
        prompts[key]=prompt_file.read_text(encoding='utf-8').strip()
world_file=GAME/'world-data.js'
marker='/* Authored append-only destination extension; generated from tools/system-additions.json and tools/mirror-expansion.json. */'
original=world_file.read_text(encoding='utf-8').split('/* Authored append-only destination extension;',1)[0].rstrip()
all_additions=ADDITIONS['systems']+EXPANSION['systems']
layout_by_id={p['id']:p for p in LAYOUT['positions']}
assert set(layout_by_id)==set(range(54,92)), 'The blended layout only moves the 38 latest additions'
for addition in all_additions:
    p=layout_by_id.get(addition['world']['id'])
    if p:addition['world']['mapPosition']={key:p[key] for key in ['x','y']}
world_file.write_text(original+'\n\n'+marker+'\nwindow.VexedMirrorWorld.systems.push(...'+json.dumps([a['world'] for a in all_additions],ensure_ascii=False,separators=(',',':'))+');\nwindow.VexedMirrorWorld.shipyards='+json.dumps(EXPANSION['shipyards'],ensure_ascii=False,separators=(',',':'))+';\nwindow.VexedMirrorWorld.chartLayoutVersion='+str(LAYOUT['version'])+';\nwindow.VexedMirrorWorld.geologyMapPositions='+json.dumps(LAYOUT['geologyMapPositions'],separators=(',',':'))+';\n',encoding='utf-8')
data=dict(version=2,orbitalLayoutVersion=ORBITS['version'],researchDate=ORBITS['checkedOn'],originalDestinations=52,additionalDestinations=len(all_additions),sourceRefs={**{key:source['url'] for key,source in RESEARCH['sources'].items()},**ADDITIONS['sources'],**EXPANSION['sources'],**ORBITS['sources']},continuity='Broken Mirror with explicitly identified Prime-geography adaptations',neighborPolicy=EXPANSION['policy'],orbitalPolicy=ORBITS['policy'],systems=records)
(GAME/'system-catalog-data.js').write_text('/* Generated by tools/build-system-catalog.py. Evidence and layout are separate. */\nwindow.VexedMirrorSystemData = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(OUT/'prompts.json').write_text(json.dumps(dict(generator='built-in image_gen',basePrompt=BASE_PROMPT,assets=[dict(id=k,file=k+'.webp',prompt=v) for k,v in prompts.items()]),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(physicalSystems=len(records),legacyWorlds=52,additionalDestinations=len(all_additions),totalDestinations=52+len(all_additions),bodies=sum(len(r['bodies']) for r in records),artPrompts=len(prompts))))

