"""Qualification gates cannot mistake configuration or synthetic clocks for delivery."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('refresh_gate',ROOT/'tools/validate_gameplay_refresh.py')
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)

def report():
    return {'passed':True,'incomplete':False,'population':1210,'javascriptErrors':[],'failedRequests':[],
        'headedConditions':{'headless':False,'measuredFocusOrVisibilityInterruptions':[],
            'viewportExceedsOuterWindow':[],'windowsDisplayModesBefore':{'displays':[{'frequencyHz':120}]}},
        'scenarios':{'flight':[{'run':1,'averageFps':120,'actualSeconds':20,'intervalMs':{'p95':8.4,'p99':16.7,'max':16.8},
            'frameSpikesOver50ms':0,'state':{'population':1210,'physicsDebtSeconds':.015},
            'counters':{'simulationProgressSeconds':20,'acceptedShots':0}}]}}

class GameplayRefreshGate(unittest.TestCase):
    def test_fullscreen_requires_native_dimensions_and_an_uninterrupted_window(self):
        candidate=report();conditions=candidate['headedConditions'];conditions['fullscreenRequested']=True
        self.assertFalse(gate.qualify(candidate,120)['passed'])
        conditions['pages']=[{'mode':'flight','fullscreenVerified':True}]
        self.assertTrue(gate.qualify(candidate,120)['passed'])
        conditions['pages'][0]['fullscreenVerified']=False
        self.assertFalse(gate.qualify(candidate,120)['passed'])
        conditions['pages'][0]['fullscreenVerified']=True;conditions['measuredFullscreenInterruptions']=[{'fullscreen':False}]
        self.assertFalse(gate.qualify(candidate,120)['passed'])

    def test_startup_recovery_retains_all_owed_time(self):
        candidate=report();candidate['warmups']={'flight':[{'before':{'simulationSeconds':10,'physicsDebtSeconds':1.16},
            'simulationSeconds':14.15,'physicsDebtSeconds':.01,'actualSeconds':3}]}
        self.assertTrue(gate.qualify(candidate,120)['passed'])
        candidate['warmups']['flight'][0]['simulationSeconds']=13
        self.assertFalse(gate.qualify(candidate,120)['passed'])
        candidate['warmups']['flight'][0].update(simulationSeconds=13.66,physicsDebtSeconds=.5)
        self.assertFalse(gate.qualify(candidate,120)['passed'])

    def test_complete_foreground_delivery_passes(self):
        self.assertTrue(gate.qualify(report(),120)['passed'])

    def test_refresh_configuration_does_not_excuse_slow_frames_or_stalls(self):
        original=report()
        for change in [lambda r:r.update(averageFps=60),lambda r:r['intervalMs'].update(p95=16.7),
                       lambda r:r['intervalMs'].update(p99=25),lambda r:r.update(frameSpikesOver50ms=1),
                       lambda r:r['state'].update(physicsDebtSeconds=.5),
                       lambda r:r['counters'].update(simulationProgressSeconds=10)]:
            candidate=copy.deepcopy(original);change(candidate['scenarios']['flight'][0])
            self.assertFalse(gate.qualify(candidate,120)['passed'])

    def test_missing_windows_and_headless_or_interrupted_runs_cannot_qualify(self):
        for change in [lambda r:r.update(scenarios={}),lambda r:r.update(scenarios={'flight':[]}),
                       lambda r:r['headedConditions'].update(headless=True),
                       lambda r:r['headedConditions'].update(measuredFocusOrVisibilityInterruptions=[{'focused':False}]),
                       lambda r:r['headedConditions']['windowsDisplayModesBefore']['displays'][0].update(frequencyHz=60)]:
            candidate=report();change(candidate);self.assertFalse(gate.qualify(candidate,120)['passed'])

    def test_actual_combat_and_boundary_crossing_are_required_in_their_windows(self):
        candidate=report();row=candidate['scenarios'].pop('flight');candidate['scenarios']['crowdedCombat']=row
        self.assertFalse(gate.qualify(candidate,120)['passed']);row[0]['counters']['acceptedShots']=1
        self.assertTrue(gate.qualify(candidate,120)['passed'])

        candidate['scenarios']={'boundaryFlight':row};row[0].update(before={'region':{'generation':1}},after={'region':{'generation':1}})
        self.assertFalse(gate.qualify(candidate,120)['passed']);row[0]['after']['region']['generation']=2
        self.assertTrue(gate.qualify(candidate,120)['passed'])

    def test_corridor_gameplay_requires_a_real_undepleted_field(self):
        candidate=report();rows=candidate['scenarios'].pop('flight');candidate['scenarios']['corridorFlight']=rows
        self.assertFalse(gate.qualify(candidate,120)['passed'])
        rows[0]['before']={'corridorNearbyRocks':12}
        self.assertTrue(gate.qualify(candidate,120)['passed'])

if __name__=='__main__':unittest.main()
