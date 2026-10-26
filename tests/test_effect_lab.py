"""Version selection must never promote an unmeasured or changed candidate."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from effect_lab import CORE,FOLDER,RELEASE,Lab,atomic,profile,promote,versions


class EffectLabTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'repo';self.state=Path(self.tmp.name)/'state'
        for name in CORE:
            path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('// fixture',encoding='utf-8')
        self.release={'schema':1,'id':'prod','name':'Production','implementation':'shared-v1','modules':[],
                      'shield':{'duration':900,'energy':1},'weapon':{'scale':1}}
        atomic(self.root/RELEASE,self.release);self.lab=Lab(self.root,self.state)
        self.candidate=copy.deepcopy(self.release);self.candidate.update(id='candidate',name='Candidate');self.candidate['shield']['duration']=1000
        self.lab.post('session',{'candidate':self.candidate,'fixture':{'count':100}})

    def tearDown(self):
        self.tmp.cleanup()

    def measured(self):
        frames=[1000/120]*240
        return self.lab.post('runs',{'variant':'candidate','profile':self.candidate,'fixture':{'count':100},
            'code':versions(self.root,self.candidate),'metrics':{'valid':True,'fps':120,'samples':240},'frames':frames,
            'counters':{'minimumVisible':100}})

    def test_unmeasured_rejected_and_review_does_not_apply(self):
        with self.assertRaises(ValueError):self.lab.post('stage',{'profile':self.candidate})
        run=self.measured();self.lab.post('stage',{'profile':self.candidate,'runId':run['id']})
        promote(self.root,self.state)
        self.assertEqual(json.loads((self.root/RELEASE).read_text()),self.release)
        promote(self.root,self.state,True)
        self.assertEqual(json.loads((self.root/RELEASE).read_text()),self.candidate)
        self.assertEqual(json.loads((self.lab.state/'previous-release.json').read_text()),self.release)
        self.assertEqual(json.loads((self.lab.state/'game-validation.json').read_text())['status'],'pending')

    def test_source_changes_block_staging_and_promotion(self):
        run=self.measured();self.lab.post('stage',{'profile':self.candidate,'runId':run['id']})
        (self.root/CORE[0]).write_text('// changed')
        with self.assertRaises(ValueError):self.lab.post('stage',{'profile':self.candidate,'runId':run['id']})
        with self.assertRaises(ValueError):promote(self.root,self.state,True)

    def test_profile_change_requires_new_measurement(self):
        run=self.measured();self.candidate['weapon']['scale']=1.1
        with self.assertRaises(ValueError):self.lab.post('stage',{'profile':self.candidate,'runId':run['id']})

    def test_legacy_comparisons_cannot_be_promoted_as_gpu_candidates(self):
        run=self.measured();run['fixture']['shieldRenderer']='legacy'
        run=self.lab.post('runs',run)
        with self.assertRaisesRegex(ValueError,'comparison only'):
            self.lab.post('stage',{'profile':self.candidate,'runId':run['id']})

    def test_bounded_history_and_invalid_run(self):
        for _ in range(23):self.measured()
        self.assertEqual(len(self.lab.manifest()['runs']),20)
        run=self.measured();run['metrics']['valid']=False
        with self.assertRaises(ValueError):self.lab.post('runs',run)

    def test_module_path_and_numeric_validation(self):
        for bad in [float('nan'),True,100000]:
            candidate=copy.deepcopy(self.candidate);candidate['shield']['duration']=bad
            with self.assertRaises(ValueError):profile(candidate)
        self.candidate['modules']=['../escape.js']
        with self.assertRaises(ValueError):profile(self.candidate)


if __name__=='__main__':unittest.main()
