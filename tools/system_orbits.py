"""Orbital relationships and separately qualified physical/display distances.

Retain working ports, moons and save frames. Only explicit misplaced, unsettled
survey planets move; their old poses accompany the catalog for save recovery.
"""
import math


PLANETS = {'planet', 'gas_giant', 'ice_giant', 'dwarf_planet'}


def apply_orbits(records, manifest):
    for record in records:
        bodies = record['bodies']
        by_id = {b['id']: b for b in bodies}
        primary = next(b for b in bodies if b['kind'] == 'star' and not b.get('occludedBy'))
        specified = manifest['orderedSystems'].get(str(record['id']))
        if specified and specified.get('reposition'):
            # Keep the homeworld fixed; use a monotone, compressed radial chart.
            home = by_id[record['homeBodyByLegacy'][str(record['id'])]]
            radius = math.hypot(home['x']-primary['x'], home['y']-primary['y'])
            theta = math.atan2(home['y']-primary['y'], home['x']-primary['x'])
            groups = specified['groups']
            for index, group in enumerate(groups):
                for ident in group:
                    if ident not in specified['reposition']:
                        continue
                    body = by_id[ident]
                    assert not body.get('port') and not body.get('legacyWorldId')
                    body['previousLayoutPosition'] = {key: body[key] for key in ('x', 'y')}
                    angle = theta + (index-len(groups)+1)*0.34
                    distance = radius*(index+1)/len(groups)
                    body.update(x=round(primary['x']+math.cos(angle)*distance),
                                y=round(primary['y']+math.sin(angle)*distance))

        groups_by_star = {}
        for body in bodies:
            if body['kind'] in PLANETS:
                star_id = body.get('starId', primary['id'])
                assert by_id[star_id]['kind'] == 'star'
                body['starId'] = star_id
                groups_by_star.setdefault(star_id, []).append(body)
        for star_id, planets in groups_by_star.items():
            star = by_id[star_id]
            radial = lambda b: math.hypot(b['x']-star['x'], b['y']-star['y'])
            ordered = sorted(planets, key=radial)
            explicit = {ident: index+1 for index, group in enumerate(specified['groups']) for ident in group} if specified else {}
            # The prior released plan owns authored order, including independent
            # groups around Alpha Centauri A/B. Never treat that as screen canon.
            for rank, body in enumerate(ordered, 1):
                order = explicit.get(body['id'], body.get('orbitOrder', rank))
                evidence = specified['evidence'] if body['id'] in explicit else 'authored'
                sources = specified.get('sources', []) if specified else []
                orbit = dict(primaryId=star_id, rank=rank, order=order,
                             orderEvidence=evidence, distanceEvidence='scientific_model',
                             phaseEvidence='illustrative', sources=sources)
                body['orbit'] = orbit

            # Approximate luminosity is a model parameter, never an observed
            # classification inferred from the sprite's colour.
            spectral = star.get('spectralClass', '')
            kind = spectral[:1] if spectral[:1] in manifest['luminosityAssumptions'] else 'G'
            luminosity = manifest['luminosityAssumptions'][kind]
            luminosity = manifest['systemLuminosityAssumptions'].get(str(record['id']), luminosity)
            star['orbitModel'] = dict(luminositySolar=luminosity, evidence='assumed_representative',
                                     source='NASA-HABITABLE-ZONE')
            anchor = next((b for b in ordered if b.get('legacyWorldId') and b['kind'] == 'planet'), None)
            if not anchor:
                anchor = next((b for b in ordered if b['kind'] == 'planet'), ordered[0])
            anchor_index = ordered.index(anchor)
            scale = math.sqrt(luminosity)
            model_axes = [scale*1.75**(i-anchor_index) for i in range(len(ordered))]
            if record['id'] == 4:
                # Compact circumstellar models rather than unstable distant
                # planets assigned across the AB pair. Values remain authored.
                ceiling = 2.3 if star_id == 900 else 2.0
                if model_axes[-1] > ceiling:
                    model_axes = [a*ceiling/model_axes[-1] for a in model_axes]
            for index, body in enumerate(ordered):
                orbit = body['orbit']
                orbit['semiMajorAxisAU'] = round(model_axes[index], 5)
                orbit['sources'] = list(dict.fromkeys(orbit['sources']+['NASA-HABITABLE-ZONE']))
                if record['id'] == 1:
                    orbit.update(semiMajorAxisAU=manifest['solarAxesAU'][str(body['id'])],
                                 orderEvidence='astronomy', distanceEvidence='astronomy',
                                 sources=['NASA-DISTANCES', 'NASA-PLANET-COMPARE'])
                elif record['id'] == 60:
                    ref = {100: 'NASA-KEPLER-B', 101: 'NASA-KEPLER-C', 0: 'NASA-KEPLER-D'}[body['id']]
                    orbit.update(semiMajorAxisAU=manifest['keplerAxesAU'][str(body['id'])],
                                 orderEvidence='astronomy', distanceEvidence='astronomy', sources=[ref])
                if record['id'] == 4:
                    orbit['sources'].append('NASA-BINARY-STABILITY')
            # Equal-distance companion interpretation remains qualified.
            if record['id'] == 12:
                by_id[1]['orbit']['semiMajorAxisAU'] = by_id[0]['orbit']['semiMajorAxisAU']
            star['orbitModel']['chartAnchors'] = [dict(bodyId=b['id'], distanceAU=b['orbit']['semiMajorAxisAU'], radiusUnits=round(radial(b), 3)) for b in ordered]

        for body in bodies:
            if body['kind'] == 'moon':
                parent = by_id.get(body.get('parentId'))
                assert parent is not None
                # Irtok A is a legacy station companion, not a moon gravitationally
                # orbiting a tiny exchange. Retain its pose/name/ID as a facility.
                if parent['kind'] == 'station':
                    body['orbitalRelationship'] = dict(parentId=parent['id'], evidence='authored_facility',
                        note='Station-associated survey companion; no gravitational satellite orbit is established.')
                else:
                    body['orbitalRelationship'] = dict(parentId=parent['id'],
                        primaryId=parent.get('starId', primary['id']), evidence=body['evidence'],
                        distanceEvidence='illustrative', note='Moon orbits its parent planet; chart separation is exaggerated.')
        record['orbitalLayout'] = dict(version=manifest['version'],
            projection='compressed schematic; angular positions are illustrative',
            orderNote=specified['note'] if specified else 'Retain the released authored ordering where no sourced orbital census is established.',
            modelNote=manifest['modelNote'])
