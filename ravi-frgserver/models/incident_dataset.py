"""Streaming adapter for synthetic incident examples. Never mixes evaluation splits."""
import gzip,json,random
from pathlib import Path
import torch
from torch.nn import functional as F
from architectures import TOPICS,SUBTOPICS,CATEGORIES,ENTITY_TYPES,SCENARIO_TAXONOMY
from persian_text import prepare_batch


def iter_records(directory,split='train'):
    root=Path(directory);manifest=json.loads((root/'manifest.json').read_text())
    if manifest['version']!=SCENARIO_TAXONOMY['version']:
        raise ValueError('Dataset/model taxonomy versions differ.')
    if split not in ('train','validation','test'):raise ValueError('Invalid split.')
    # Round-robin shards to avoid training on one entire shard before the next.
    files=[]
    try:
        for shard in manifest['shards']:
            if Path(shard['file']).name!=shard['file']:raise ValueError('Invalid shard path.')
            files.append(gzip.open(root/shard['file'],'rt',encoding='utf-8'))
        active=list(files)
        while active:
            for f in active[:]:
                line=f.readline()
                if not line:active.remove(f);continue
                row=json.loads(line)
                if row['split']==split:yield row
    finally:
        for f in files:f.close()


def shuffled(records,buffer_size=20000,seed=23):
    rng=random.Random(seed);buffer=[]
    for row in records:
        if len(buffer)<buffer_size:buffer.append(row);continue
        i=rng.randrange(len(buffer));yield buffer[i];buffer[i]=row
    rng.shuffle(buffer);yield from buffer


def make_batch(rows,processor,vocabulary,config,device='cpu'):
    batch=prepare_batch([r['text'] for r in rows],processor,vocabulary,config)
    ids=torch.tensor(batch.input_ids,dtype=torch.long,device=device)
    lengths=torch.tensor(batch.lengths,dtype=torch.long,device=device)
    def multihot(key,names):
        values=torch.zeros((len(rows),len(names)),device=device)
        index={name:i for i,name in enumerate(names)}
        for i,row in enumerate(rows):
            for name in row['labels'][key]:
                if name not in index:raise ValueError(f'Unsupported {key} label: {name}')
                values[i,index[name]]=1
        return values
    entity=torch.full_like(ids,-100)
    for i,(row,doc) in enumerate(zip(rows,batch.documents)):
        # Only the explicitly annotated time/place header is fully labelled.
        # Unannotated entities inside episode prose are UNKNOWN, never O negatives.
        header_end=min(e['start'] for e in row['episodes'])
        for j,t in enumerate(doc.tokens):
            if t.raw_end<=header_end:entity[i,j]=0
        for span in row['spans']:
            kind=span['field']
            if kind not in ('time','place'):continue
            indices=[j for j,t in enumerate(doc.tokens) if t.raw_start>=span['start'] and t.raw_end<=span['end']]
            for n,j in enumerate(indices):entity[i,j]=1+2*ENTITY_TYPES.index(kind)+(n>0)
    targets={'topics':multihot('topics',TOPICS),'subtopics':multihot('subtopics',SUBTOPICS),
             'categories':multihot('categories',CATEGORIES),'entities':entity,
             'grounding':torch.tensor([int(r['labels']['needs_clarification']) for r in rows],device=device)}
    parents={r['id']:r['topic'] for r in SCENARIO_TAXONOMY['subtopics']}
    for key,names in [('topics',TOPICS),('subtopics',SUBTOPICS)]:
        mask=torch.ones_like(targets[key]);index={name:i for i,name in enumerate(names)}
        for i,row in enumerate(rows):
            for candidate in row['labels']['candidate_subtopics']:
                label=candidate if key=='subtopics' else parents[candidate]
                if label not in row['labels'][key]:mask[i,index[label]]=0
        targets[key+'_mask']=mask
    return ids,lengths,targets,batch.documents


def supervised_loss(output,targets):
    def masked_bce(logits,key):
        loss=F.binary_cross_entropy_with_logits(logits,targets[key],reduction='none')
        mask=targets[key+'_mask'];return (loss*mask).sum()/mask.sum().clamp_min(1)
    return (masked_bce(output['topic_logits'],'topics')+
            masked_bce(output['subtopic_logits'],'subtopics')+
            F.binary_cross_entropy_with_logits(output['category_logits'],targets['categories'])+
            F.cross_entropy(output['grounding_logits'],targets['grounding'])+
            F.cross_entropy(output['entity_logits'].transpose(1,2),targets['entities'],ignore_index=-100))
