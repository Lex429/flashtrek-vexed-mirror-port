"""Browser-free checks of the shared before/after population fixture builder."""
import ast
import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'tests/browser-performance-review.py'


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def representative_save():
    """Keep the five prior-position templates that exposed the 5,000-ship bug."""
    ships = []
    for index in range(162):
        weapon, engine, shield, ability = [kind + ':' + str(index) for kind in ['weapon', 'engine', 'shield', 'ability']]
        ship = {
            'id': index, 'name': 'Original crew ' + str(index), 'shipType': 18,
            'system': [1, 4, 16][index % 3], 'x': 100 + index * 20, 'y': -130 + index,
            'heading': .3, 'speed': 0, 'vx': 0, 'vy': 0, 'phase': 'docked',
            'hull': 100, 'shields': 80, 'credits': 1000 + index, 'cargo': None,
            'cargoOwner': index, 'oreHold': 0, 'nextActionAt': 50 + index,
            'lifeVersion': 1, 'dockingVersion': 1, 'recentEvents': [],
            'task': {'id': 'original:' + str(index), 'kind': 'idle', 'status': 'active'},
            'shipEquipment': {
                'version': 2, 'owner': 'civilian:' + str(index) + ':0', 'nextId': 5,
                'instances': {
                    weapon: {'id': weapon, 'modelId': 1, 'category': 'weapon', 'readyAt': 57.5, 'upgrades': {'level': 2}},
                    engine: {'id': engine, 'modelId': 'standard-engine', 'category': 'engineering', 'readyAt': 0, 'upgrades': {}},
                    shield: {'id': shield, 'modelId': 'standard-shield', 'category': 'shield', 'readyAt': 0, 'upgrades': {}},
                    ability: {'id': ability, 'modelId': 'mining-laser', 'category': 'ability', 'readyAt': 0, 'upgrades': {}},
                },
                'slots': {'weapon': [weapon, None, None], 'engineering': [engine], 'shield': [shield],
                          'repairDrone': [None], 'ability': [None, None]},
                'locker': [ability],
            },
        }
        if index in [0, 12, 61, 109, 159]:
            ship.update(previousX=ship['x'], previousY=ship['y'])
        # Clones must discard old local commands; the original owner retains it.
        if index == 12:
            ship.update(localLeg={'version': 2, 'startedAt': 40, 'duration': 5},
                        motionKick={'version': 1, 'vx': 3, 'vy': 2})
        ships.append(ship)
    return {
        'system': 1, 'x': 10, 'y': 20, 'latinum': 777, 'ore': 6,
        'shipSimulation': {'version': 1, 'seconds': 50},
        'civilianTraffic': {'ships': ships, 'nextId': 162, 'clock': 50,
                            'reservations': {'original:12': {'credits': 31, 'tons': 4}}},
        'solEconomy': {'freighters': [{'id': index, 'credits': 200, 'tons': 4} for index in range(9)],
                       'treasury': 1234},
    }


def population_builder_code():
    # Execute the actual shared builder, not a second implementation. Parsing its
    # enclosing if block avoids importing Playwright or starting the browser CLI.
    tree = ast.parse(BUILDER.read_text(encoding='utf-8-sig'), filename=str(BUILDER))
    blocks = [node for node in ast.walk(tree)
              if isinstance(node, ast.If) and ast.unparse(node.test) == 'args.population'
              and any(isinstance(child, ast.For) and isinstance(child.target, ast.Name)
                      and child.target.id == 'index' for child in node.body)]
    if len(blocks) != 1:
        raise AssertionError('Expected one shared population-builder block; update extraction if its location changes')
    return compile(ast.fix_missing_locations(ast.Module(body=blocks, type_ignores=[])), str(BUILDER), 'exec')


class PerformanceFixtureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.builder = population_builder_code()
        cls.original = representative_save()
        cls.original_hash = fingerprint(cls.original)

    def test_all_population_modes_preserve_original_owners_and_rebase_new_physical_poses(self):
        for population in [1000, 5000]:
            for system in ['existing', 'current']:
                for active in [False, True]:
                    with self.subTest(population=population, distant_system=system, active=active):
                        args = SimpleNamespace(population=population, distant_system=system,
                                               active_distant=active, seed=4292026)
                        namespace = {'json': json, 'args': args, 'initial': copy.deepcopy(self.original)}
                        exec(self.builder, namespace)
                        derived = namespace['initial']
                        original_ships = self.original['civilianTraffic']['ships']
                        ships = derived['civilianTraffic']['ships']
                        appended = ships[len(original_ships):]
                        self.assertEqual(len(appended), population - 172)
                        self.assertEqual(len(ships) + len(derived['solEconomy']['freighters']) + 1, population)
                        self.assertEqual(ships[:162], original_ships)
                        self.assertEqual(len({ship['id'] for ship in ships}), len(ships))
                        self.assertGreater(derived['civilianTraffic']['nextId'], max(ship['id'] for ship in ships))
                        owned_ids = {item for ship in original_ships for item in ship['shipEquipment']['instances']}
                        old_sweep_templates = 0
                        for index, ship in enumerate(appended):
                            template = original_ships[index % len(original_ships)]
                            old_sweep_templates += 'previousX' in template
                            self.assertEqual((ship['previousX'], ship['previousY']), (ship['x'], ship['y']),
                                             'A fresh placement must not sweep from its cloned owner\'s old pose')
                            self.assertGreaterEqual(ship['x'], 1e7)
                            self.assertEqual(ship['y'], 1e7)
                            self.assertEqual(ship['system'], self.original['system'] if system == 'current' else template['system'])
                            self.assertEqual((ship['speed'], ship['vx'], ship['vy']), (0, 0, 0))
                            self.assertEqual(ship['phase'], 'docked')
                            for field in ['localLeg', 'dockingMove', 'motionKick', 'motionSpin', 'disputeId',
                                          'retaliationId', 'combatAI', 'combatInterruption', 'scriptedDemo']:
                                self.assertNotIn(field, ship)
                            equipment = ship['shipEquipment']
                            self.assertEqual(equipment['owner'], 'civilian:' + str(ship['id']) + ':0')
                            self.assertTrue(owned_ids.isdisjoint(equipment['instances']), 'Clones cannot share another owner\'s equipment IDs')
                            owned_ids.update(equipment['instances'])
                            self.assertEqual(len(equipment['instances']), len(template['shipEquipment']['instances']))
                            for item_id, item in equipment['instances'].items():
                                self.assertEqual(item['id'], item_id)
                            for items in [*equipment['slots'].values(), equipment['locker']]:
                                self.assertTrue(all(item is None or item in equipment['instances'] for item in items))
                            self.assertEqual({bank: len(items) for bank, items in equipment['slots'].items()},
                                             {bank: len(items) for bank, items in template['shipEquipment']['slots'].items()})
                            for item, old_item in zip(equipment['instances'].values(), template['shipEquipment']['instances'].values()):
                                self.assertEqual({key: value for key, value in item.items() if key != 'id'},
                                                 {key: value for key, value in old_item.items() if key != 'id'})
                            if active:
                                self.assertIsNone(ship['cargo'])
                                self.assertEqual(ship['cargoOwner'], ship['id'])
                                self.assertGreaterEqual(ship['nextActionAt'], 51)
                                self.assertLessEqual(ship['nextActionAt'], 80.75)
                            else:
                                self.assertEqual(ship['nextActionAt'], 1e9)
                        self.assertEqual(old_sweep_templates, 27 if population == 1000 else 149,
                                         'Representative templates must retain the original stale-sweep exposure')
                        # Adding fixture owners must not alter the original fleet,
                        # player inventory, contract reservations or Sol balances.
                        remaining = dict(derived)
                        remaining['civilianTraffic'] = dict(derived['civilianTraffic'],
                                                             ships=original_ships, nextId=162)
                        self.assertEqual(remaining, self.original)
                        self.assertEqual(json.loads(namespace['saved']), derived)
                        self.assertEqual(fingerprint(self.original), self.original_hash)


if __name__ == '__main__':
    unittest.main()
