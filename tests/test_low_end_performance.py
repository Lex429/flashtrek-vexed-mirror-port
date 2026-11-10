"""A fast-looking browser cannot pass by dropping ships or slowing game time."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('low_end_screen',ROOT/'tools/check_low_end_performance.py')
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)


def report():
    row={'averageFps':30,'actualSeconds':8,'intervalMs':{'p95':33.4,'p99':50},
         'frameSpikesOver100ms':0,'state':{'population':1210,'physicsDebtSeconds':.01},
         'counters':{'simulationProgressSeconds':8,'acceptedShots':4}}
    warm={'before':{'simulationSeconds':0,'physicsDebtSeconds':.01},
          'simulationSeconds':3,'physicsDebtSeconds':.01,'actualSeconds':3}
    return {'passed':True,'incomplete':False,'population':1210,'cpuSlowdown':4,
            'cpuThrottlingAppliedPages':11,'viewport':{'width':1366,'height':768},
            'fixtureSettings':{'dpr':1},'javascriptErrors':[],'failedRequests':[],
            'scenarios':{mode:[dict(copy.deepcopy(row),run=run) for run in (1,2)] for mode in gate.SCENARIOS},
            'warmups':{mode:[copy.deepcopy(warm) for _ in (1,2)] for mode in gate.SCENARIOS}}


class LowEndPerformanceScreen(unittest.TestCase):
    def test_complete_diagnostic_passes_without_certifying_hardware(self):
        result=gate.screen(report())
        self.assertTrue(result['passed'])
        self.assertFalse(result['hardwareSupportConfirmed'])

    def test_missing_throttle_population_or_gameplay_windows_cannot_pass(self):
        changes=[lambda r:r.update(cpuSlowdown=1),lambda r:r.update(cpuThrottlingAppliedPages=1),
                 lambda r:r.update(population=169),lambda r:r.update(incomplete=True),
                 lambda r:r.update(javascriptErrors=['failure']),
                 lambda r:r['scenarios'].pop('crowdedCombat'),
                 lambda r:r['scenarios']['flight'][1].update(run=1),
                 lambda r:r['warmups'].pop('flight')]
        for change in changes:
            with self.subTest(change=change):
                candidate=report();change(candidate)
                self.assertFalse(gate.screen(candidate)['passed'])

    def test_slow_frames_stalls_missing_data_and_fake_fast_simulation_fail(self):
        changes=[lambda r:r.update(averageFps=25),lambda r:r['intervalMs'].update(p95=45),
                 lambda r:r['intervalMs'].update(p99=100),lambda r:r.update(frameSpikesOver100ms=1),
                 lambda r:r.update(actualSeconds=2),lambda r:r.update(averageFps=float('nan')),
                 lambda r:r.pop('intervalMs'),lambda r:r['state'].update(physicsDebtSeconds=.4),
                 lambda r:r['state'].update(population=169),
                 lambda r:r['counters'].update(simulationProgressSeconds=4)]
        for change in changes:
            with self.subTest(change=change):
                candidate=report();change(candidate['scenarios']['flight'][0])
                self.assertFalse(gate.screen(candidate)['passed'])

    def test_combat_and_startup_time_must_be_real(self):
        candidate=report();candidate['scenarios']['crowdedCombat'][0]['counters']['acceptedShots']=0
        self.assertFalse(gate.screen(candidate)['passed'])
        candidate=report();candidate['warmups']['flight'][0]['simulationSeconds']=1
        self.assertFalse(gate.screen(candidate)['passed'])


if __name__=='__main__':
    unittest.main()
