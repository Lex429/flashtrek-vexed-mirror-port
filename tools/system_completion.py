"""Apply explicitly released, fully illustrated local planetary rosters.

The user-authored plan is data, not an automatic filler rule. Existing bodies,
their local poses and economic identities are never replaced by new records.
"""
import hashlib
import json
import math


def reference_for(planet):
    if planet['asset']=='othrel-sol-v2':
        return '09 - Uranus.png'
    if planet['asset']=='sathren-sol-v2':
        return '05 - Mars.png'
    lower=planet['appearance'].lower()
    if planet['kind']=='gas_giant':
        return '08 - Saturn.png' if 'ring' in lower else '07 - Jupiter.png'
    if planet['kind']=='ice_giant':
        return '10 - Neptune.png'
    if any(word in lower for word in ['seas','ocean','rivers','river','lakes','lake','deltas','forests','forest','grassland']):
        return '03 - Earth.png'
    if 'cloud' in lower:
        return '02 - Venus.png'
    return '04 - Moon.png' if any(word in lower for word in ['ice','frost','frozen']) else '05 - Mars.png'


def apply_completion(records, plan, game):
    by_id = {record['id']: record for record in records}
    assert len(plan['systems']) == 40
    assert sum(len(s['planets']) for s in plan['systems']) == 215
    assert len({s['id'] for s in plan['systems']}) == 40
    assert set(plan['releasedSystems']) <= {s['id'] for s in plan['systems']}
    for system in plan['systems']:
        if system['id'] not in plan['releasedSystems']:
            continue
        record = by_id[system['id']]
        bodies = record['bodies']
        old = {b['id']: b for b in bodies}
        anchor = next(p for p in system['planets'] if 'existingBodyId' in p)
        home = old[anchor['existingBodyId']]
        if system['id']==11:
            home['alternateNames']=['Rigel X']
            old[900].update(name='Beta Rigel',art='assets/system-planets/star-a.webp',
                            evidence='authored_layout',spectralClass='Blue-white representative artwork for the user-approved Beta Rigel interpretation',
                            description='The user-approved ten-planet Beta Rigel interpretation; the existing Rigel destination represents Rigel X. Artwork and local spacing are game adaptations.')
        # Keep all old local coordinates. New neighbors follow the proposal's
        # inner-to-outer order around their stated primary, at illustrative scale.
        if system['id'] == 51:
            enclosed = old[900]
            assert enclosed.get('occludedBy') == 1
            enclosed['name'] = 'Dyson B (enclosed)'
            enclosed['evidence'] = 'authored_layout'
            bodies.append(dict(id=901, name='Dyson A', kind='star',
                               art='assets/system-planets/star-g.webp',
                               x=-4500, y=-3200, size=230, population=0,
                               port=False, evidence='authored_layout',
                               description='Exposed primary of the user-authored binary layout. The Sphere surrounds the separate companion; the binary arrangement is game fiction.'))
            assert all(p['starId']==901 for p in system['planets'])
        primary = next(b for b in bodies if b['id'] == anchor['starId'])
        scale = math.hypot(home['x']-primary['x'], home['y']-primary['y'])
        theta = math.atan2(home['y']-primary['y'], home['x']-primary['x'])
        for p in system['planets']:
            image = game/'assets/system-planets'/(p['asset']+'.webp')
            provenance_file = image.with_suffix('.provenance.json')
            assert image.is_file() and provenance_file.is_file(), f'Unfinished artwork: {image}'
            provenance = json.loads(provenance_file.read_text(encoding='utf-8'))
            assert provenance['generator'] == 'built-in image_gen'
            assert provenance['sha256'] == hashlib.sha256(image.read_bytes()).hexdigest()
            if 'existingBodyId' in p:
                body = old[p['existingBodyId']]
                assert body['name'] == p['name']
            else:
                assert p['id'] not in old, (system['id'], p['id'])
                parent_star = next(b for b in bodies if b['id'] == p['starId'])
                group = [entry for entry in system['planets'] if entry['starId'] == p['starId']]
                ordinal = group.index(p)
                if anchor in group:
                    home_order = group.index(anchor)
                    radius = scale*(ordinal+1)/(home_order+1) if ordinal < home_order else scale+2600*(ordinal-home_order)
                    angle = theta + (ordinal-home_order)*.34
                else:
                    radius = 2800+ordinal*2600
                    angle = 2.7+ordinal*.42
                x = round(parent_star['x']+math.cos(angle)*radius)
                y = round(parent_star['y']+math.sin(angle)*radius)
                body = dict(id=p['id'], name=p['name'], kind=p['kind'],
                            x=x, y=y, size=250 if p['kind']=='gas_giant' else 200 if p['kind']=='ice_giant' else 145,
                            population=0, port=False, evidence='authored',
                            nameEvidence='reference' if p['name'].startswith(('Orion ', 'Procyon ')) else 'authored',
                            sourceRefs=[], description=p['appearance']+' User-authored local world; its appearance and placement are game adaptations. No new settlement is implied.')
                bodies.append(body)
            body.update(art='assets/system-planets/'+p['asset']+'.webp',
                        appearance=p['appearance'], orbitOrder=p['orbitOrder'],
                        starId=p['starId'], completionVersion=plan['version'])
        assert len([b for b in bodies if b['kind'] in ['planet','gas_giant','ice_giant']]) == len(system['planets'])
        record['notes'] = ('The original destinations, moons, facilities and saved poses are retained. '
                           'The user-approved planetary roster uses Earth and Sol as artwork references. '
                           'New companion names, environments and local orbital spacing are game adaptations. '
                           'Appearance directions do not rewrite the existing historical descriptions or populations.')
        record['completionVersion'] = plan['version']
