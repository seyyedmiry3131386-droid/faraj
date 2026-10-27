"""Build an explicit Hazm vocabulary and aligned, permitted GloVe seed vectors.
This imports lexical weights only; it does not train the incident encoder.
"""
import argparse,hashlib,json,sys
from pathlib import Path
from collections import Counter
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from persian_text import PersianProcessor,PIPELINE_VERSION
from build_scenarios import scenario
from taxonomy_seed import build_taxonomy

def prepare(source,out):
    out.mkdir(parents=True,exist_ok=True)
    processor=PersianProcessor();taxonomy=build_taxonomy()['subtopics'];freq=Counter()
    # Fit the authored vocabulary on training contexts only; no validation/test text.
    for k in range(500):
        for j in [0,380,400,780,800,1180,1200,1580,1600,1980,2000,4000,6000,8000]:
            row=scenario(k,j,taxonomy);assert row['split']=='train'
            freq.update(t.text for t in processor.process(row['text']).tokens)
    tokens=['[PAD]','[UNK]']+[word for word,_ in sorted(freq.items(),key=lambda x:(-x[1],x[0]))]
    ids={w:i for i,w in enumerate(tokens)};vectors=np.zeros((32768,300),dtype=np.float32);matched=np.zeros(32768,dtype=np.bool_)
    lines=0;collisions=0;rejected=0
    with source.open(encoding='utf-8') as f:
      for line in f:
        parts=line.rstrip().split();lines+=1
        if len(parts)!=301:
            rejected+=1
            continue
        values=np.asarray(parts[1:],dtype=np.float32)
        if not np.isfinite(values).all():raise ValueError('Nonfinite vector')
        word=processor.normalizer.normalize(parts[0]);pieces=processor.tokenizer.tokenize(word)
        if len(pieces)!=1 or pieces[0]!=word or word in ('[PAD]','[UNK]'):continue
        if word not in ids:
            if len(tokens)==32768:continue
            ids[word]=len(tokens);tokens.append(word)
        i=ids[word]
        if matched[i]:collisions+=1;continue
        vectors[i]=values;matched[i]=True
    if len(tokens)!=32768:raise ValueError('Not enough usable vocabulary entries')
    with source.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
    vocab={'pipeline_version':PIPELINE_VERSION,'tokens':tokens,'trained_incident_tokenizer':False,
           'provenance':'Training-template lexicon, then normalized source-vector vocabulary; no held-out examples fitted.',
           'source_sha256':sha}
    (out/'vocabulary.json').write_text(json.dumps(vocab,ensure_ascii=False,separators=(',',':'))+'\n')
    np.save(out/'glove-seed.npy',vectors,allow_pickle=False);np.save(out/'glove-matched.npy',matched,allow_pickle=False)
    report={'source_vectors':lines,'vocabulary_size':len(tokens),'matched_vectors':int(matched.sum()),
      'authored_train_vocabulary':len(freq),'train_vocabulary_matches':sum(bool(matched[ids[w]]) for w in freq),
      'normalized_collisions_skipped':collisions,'source_sha256':sha,'dimensions':300,
      'malformed_rows_excluded':rejected,
      'weights_trained_this_run':False,'encoder_trained':False}
    (out/'vectors-manifest.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--out',required=True,type=Path)
    a=p.parse_args();prepare(a.source,a.out)
