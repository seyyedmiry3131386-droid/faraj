"""Tests of dataset contracts and model wiring; not model accuracy evaluation."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).with_name('data')))
import torch
from configs import TEXT_PRESETS,TextConfig
from architectures import ReportUnderstanding,TOPICS,SUBTOPICS
from parameter_count import text_count
from persian_text import PersianProcessor,FrozenVocabulary
from incident_dataset import make_batch,supervised_loss
from taxonomy_seed import build_taxonomy
from build_scenarios import scenario,validate_record

class DatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows=build_taxonomy()['subtopics'];cls.ids={r['id'] for r in cls.rows}

    def test_taxonomy_and_every_polarity_have_consistent_labels_and_spans(self):
        self.assertEqual(len(self.ids),500);self.assertEqual(len({r['label'] for r in self.rows}),500)
        self.assertTrue({r['topic'] for r in self.rows}<=set(TOPICS))
        for primary in range(500):
            for mode in range(5):
                for stance in range(5):
                    r=scenario(primary,mode*2000+stance*400,self.rows)
                    validate_record(r,self.ids,set(TOPICS))
                    self.assertEqual(self.rows[primary]['id'] in r['labels']['subtopics'],stance<2)
                    self.assertEqual(self.rows[primary]['id'] in r['labels']['candidate_subtopics'],stance==2)

    def test_case_siblings_never_cross_splits_and_text_variants_are_unique(self):
        seen=set();groups={};counts={}
        for j in range(10000):
            r=scenario(0,j,self.rows)
            self.assertNotIn(r['text'],seen);seen.add(r['text'])
            self.assertEqual(groups.setdefault(r['case_group'],r['split']),r['split'])
            counts[r['split']]=counts.get(r['split'],0)+1
        self.assertEqual(counts,{'train':8000,'validation':1000,'test':1000})

    def test_one_billion_actual_module_count_on_meta_device(self):
        with torch.device('meta'):model=ReportUnderstanding('1b')
        self.assertEqual(sum(p.numel() for p in model.parameters()),sum(text_count(TEXT_PRESETS['1b']).values()))
        self.assertEqual(model.subtopic_head.out_features,500)
        self.assertEqual(sum(p.numel() for p in model.parameters()),1_002_718_554)

    def test_real_hazm_adapter_lexical_initialization_forward_backward(self):
        torch.set_num_threads(2)
        processor=PersianProcessor();rows=[scenario(0,0,self.rows),scenario(1,1200,self.rows)]
        words=sorted({t.text for r in rows for t in processor.process(r['text']).tokens})
        vocab=FrozenVocabulary(['[PAD]','[UNK]']+words)
        TEXT_PRESETS['test-small']=TextConfig(width=320,heads=8,feedforward=640,layers=1,context=256,vocabulary=256)
        try:
            model=ReportUnderstanding('test-small');seed=torch.zeros(256,300);seed[2]=0.25
            matched=torch.zeros(256,dtype=torch.bool);matched[2]=True
            self.assertEqual(model.initialize_lexical_vectors(seed,matched),1)
            self.assertTrue(torch.equal(model.tokens.weight[2,:300],seed[2]))
            self.assertEqual(model.tokens.weight[2,300:].count_nonzero(),0)
            ids,lengths,targets,docs=make_batch(rows,processor,vocab,model.config)
            self.assertEqual(targets['subtopics'][0].sum(),1);self.assertEqual(targets['subtopics'][1].sum(),0)
            self.assertEqual(targets['grounding'].tolist(),[0,1])
            self.assertEqual(targets['entities'][0,lengths[0]-1].item(),-100)
            uncertain=[scenario(0,800,self.rows)]
            _,_,maybe,_=make_batch(uncertain,processor,vocab,model.config)
            self.assertEqual(maybe['subtopics_mask'][0,0].item(),0)
            self.assertEqual(maybe['topics_mask'][0,TOPICS.index('theft')].item(),0)
            output=model(ids,lengths);self.assertEqual(output['subtopic_logits'].shape,(2,500))
            loss=supervised_loss(output,targets);self.assertTrue(torch.isfinite(loss))
            old=model.subtopic_head.weight.detach().clone();optimizer=torch.optim.SGD(model.parameters(),lr=.01)
            loss.backward();self.assertTrue(torch.isfinite(model.subtopic_head.weight.grad).all());optimizer.step()
            self.assertFalse(torch.equal(old,model.subtopic_head.weight))
            for row,doc in zip(rows,docs):self.assertEqual(doc.raw,row['text'])
        finally:del TEXT_PRESETS['test-small']

if __name__=='__main__':unittest.main()
