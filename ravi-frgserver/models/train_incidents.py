"""Single-device training entry point. Dataset construction is NOT training.
Requires an explicitly provisioned CUDA device for the default 1B configuration.
No automatic cloud provisioning, paid API calls, publishing or production loading.
"""
import argparse,json,hashlib,itertools
from pathlib import Path
import numpy as np
import torch
from architectures import ReportUnderstanding,BANK_VERSION,TOPICS,SUBTOPICS,SCENARIO_TAXONOMY
from configs import TEXT_PRESETS
from persian_text import PersianProcessor,FrozenVocabulary,PIPELINE_VERSION
from incident_dataset import iter_records,shuffled,make_batch,supervised_loss


def run(args):
    if args.device.startswith('cuda') and not torch.cuda.is_available():
        raise RuntimeError('CUDA is unavailable; no model training has started.')
    if args.output.exists():raise ValueError('Checkpoint exists; choose a new output file.')
    if args.epochs<1 or args.batch_size<1 or args.accumulation<1 or (args.max_steps is not None and args.max_steps<1):raise ValueError('Invalid training limits.')
    torch.manual_seed(args.seed)
    manifest=json.loads((args.dataset/'manifest.json').read_text())
    if manifest.get('text_deduplication')!='passed':raise ValueError('Dataset deduplication has not passed.')
    vocab=FrozenVocabulary.load(args.vectors/'vocabulary.json');processor=PersianProcessor()
    model=ReportUnderstanding(args.preset).to(args.device)
    lexical=np.load(args.vectors/'glove-seed.npy',allow_pickle=False)
    matched=np.load(args.vectors/'glove-matched.npy',allow_pickle=False)
    model.initialize_lexical_vectors(lexical,matched)
    optimizer=torch.optim.AdamW(model.parameters(),lr=args.learning_rate)
    optimizer.zero_grad(set_to_none=True);updates=0;seen=0;accumulated=0
    for epoch in range(args.epochs):
        stream=iter(shuffled(iter_records(args.dataset,'train'),seed=args.seed+epoch))
        while rows:=list(itertools.islice(stream,args.batch_size)):
            ids,lengths,targets,_=make_batch(rows,processor,vocab,model.config,args.device)
            loss=supervised_loss(model(ids,lengths),targets)
            if not torch.isfinite(loss):raise RuntimeError('Nonfinite loss; refusing to save checkpoint.')
            (loss/args.accumulation).backward();seen+=len(rows);accumulated+=1
            if accumulated==args.accumulation:
                torch.nn.utils.clip_grad_norm_(model.parameters(),1.0)
                optimizer.step();optimizer.zero_grad(set_to_none=True);updates+=1;accumulated=0
                print(json.dumps({'optimizer_updates':updates,'examples_seen':seen,'loss':loss.item()}),flush=True)
                if args.max_steps is not None and updates>=args.max_steps:break
        if args.max_steps is not None and updates>=args.max_steps:break
    if accumulated:
        # Correct the scale of a final partial accumulation group.
        for parameter in model.parameters():
            if parameter.grad is not None:parameter.grad.mul_(args.accumulation/accumulated)
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);optimizer.step();updates+=1
    if not updates:raise RuntimeError('No training updates; checkpoint was not written.')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    checkpoint={'model':model.state_dict(),'optimizer':optimizer.state_dict(),'preset':args.preset,
      'bank_version':BANK_VERSION,'taxonomy_version':SCENARIO_TAXONOMY['version'],
      'topics':TOPICS,'subtopics':SUBTOPICS,'pipeline_version':PIPELINE_VERSION,
      'vocabulary_sha256':hashlib.sha256((args.vectors/'vocabulary.json').read_bytes()).hexdigest(),
      'dataset_manifest_sha256':hashlib.sha256((args.dataset/'manifest.json').read_bytes()).hexdigest(),
      'optimizer_updates':updates,'examples_seen':seen,'synthetic_only':True,'production_ready':False,
      'untrained_heads':['module_head','relation_head','question_ranker']}
    torch.save(checkpoint,args.output)
    print('Saved experimental checkpoint; no evaluation or deployment performed.',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--dataset',type=Path,required=True);p.add_argument('--vectors',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--preset',choices=TEXT_PRESETS,default='1b')
    p.add_argument('--device',default='cuda');p.add_argument('--epochs',type=int,default=1)
    p.add_argument('--batch-size',type=int,default=2);p.add_argument('--accumulation',type=int,default=16)
    p.add_argument('--learning-rate',type=float,default=1e-5);p.add_argument('--max-steps',type=int)
    p.add_argument('--seed',type=int,default=23)
    run(p.parse_args())
