"""Independently reread the gzip artifacts; verify counts, CRC, hashes and uniqueness.

Runs without importing anything from the generator, so a bug in the runner
cannot make the audit agree with it. Every assertion here re-derives its fact
from the stored record rather than trusting the summary.
"""
import gzip, hashlib, json, sys
from pathlib import Path

root=Path(sys.argv[1]); result=json.loads((root/'results.json').read_text())
seen=set(); total=0; combinations={}; topic_counts={}; negatives=0; repeated=0
novice={'records':0,'byNeed':{},'skippedSteps':0,'answeredSteps':0}
FACT_FOR_STEP={'when':'time','where':'place','who':'person','method':'method','reason':'reason','evidence':'evidence','source':'source'}

for shard in result['shards']:
 path=root/shard['file']; assert hashlib.sha256(path.read_bytes()).hexdigest()==shard['gzipSha256']
 rawhash=hashlib.sha256(); count=rawbytes=0; sets=set(); is_novice=shard['file'].endswith('novice.jsonl.gz')
 with gzip.open(path,'rb') as stream:
  for line in stream:
   rawhash.update(line);rawbytes+=len(line);row=json.loads(line);count+=1
   text=row['composed'] if is_novice else row['text']
   digest=hashlib.sha256(text.encode()).digest()
   expected=row['expected_topics']; k=len(expected)
   assert len(set(expected))==k
   assert expected==row['detected_topics'],row['id']
   assert all(row['checks'].values()) and row['errors']==[],row['id']
   assert len(set(row['question_ids']))==len(row['question_ids'])
   assert all('details_'+topic in row['question_ids'] for topic in expected)
   assert all(quote in text for quote in row['evidence'].values())
   assert set(row['evidence'])==set(expected)
   if is_novice:
    novice['records']+=1
    assert row['detected_need']==row['expected_need'],row['id']
    novice['byNeed'][row['expected_need']]=novice['byNeed'].get(row['expected_need'],0)+1
    # Every composed sentence must trace back to an answer the reporter gave.
    for value in row['answers'].values():
     if value: assert value in row['composed'],row['id']
    # A skipped question must leave no trace and no invented fact behind.
    for step in row['skipped']:
     assert step not in row['answers'],row['id']
     fact=FACT_FOR_STEP.get(step)
     if fact: assert fact in row['missing_facts'] or step=='detail',row['id']
    # An answered fact must not still be reported as missing.
    for step,fact in FACT_FOR_STEP.items():
     if row['answers'].get(step): assert fact not in row['missing_facts'],(row['id'],step)
    assert 'clarify' not in row['missing_facts'],row['id']
    for invented in ('undefined','null','نامعلوم','نامشخص'):
     assert invented not in row['composed'],row['id']
    novice['skippedSteps']+=len(row['skipped']);novice['answeredSteps']+=len(row['answers'])
   else:
    assert digest not in seen;seen.add(digest)
    assert 1<=k<=5
    assert set(expected)=={v['id'] for v in row['seed_variants']}
    negatives+=bool(row['negative_control']);repeated+='در زمان دیگری هم ' in text.replace('ي','ی').replace('ك','ک')
    for topic in expected:topic_counts[topic]=topic_counts.get(topic,0)+1
    sets.add(tuple(expected));combinations[k]=len(sets)
 assert count==shard['records'] and rawbytes==shard['rawBytes']
 assert rawhash.hexdigest()==shard['jsonlSha256']
 total+=count
 print(json.dumps({'file':shard['file'],'verified':count,'distinctTopicSets':len(sets)}),flush=True)

assert total==result['total'],(total,result['total'])
assert len(seen)==total-novice['records'],(len(seen),total,novice['records'])
for topic,count in topic_counts.items():assert count==result['topics'][topic]['expected'],topic
assert novice['records']==result['novice']['total'],(novice['records'],result['novice']['total'])
audit={'total':total,'topicRecords':total-novice['records'],'uniqueTopicNarratives':len(seen),
 'distinctTopicSetsBySize':combinations,'distinctTopicSets':sum(combinations.values()),
 'withNegativeControl':negatives,'withRepeatedOccurrence':repeated,'novice':novice,
 'crcAndHashesVerified':True,'sourceHashesVerified':False}
repo=Path(__file__).resolve().parent.parent
for path,digest in result['sourceHashes'].items():assert hashlib.sha256((repo/path).read_bytes()).hexdigest()==digest,path
audit['sourceHashesVerified']=True
(root/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit),flush=True)
