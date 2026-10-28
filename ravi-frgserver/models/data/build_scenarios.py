"""Deterministic synthetic JSONL, not real reports or expert-validated examples."""
import argparse,gzip,hashlib,json,time
from collections import Counter
from pathlib import Path
from taxonomy_seed import build_taxonomy

VERSION='ravi-synthetic-500-v1'
PLACES=['محدودهٔ ورودی محل','محدودهٔ خروجی محل','سمت شمال محل','سمت جنوب محل','سمت شرقی محل','سمت غربی محل','بخش میانی محل','کنار مسیر دسترسی','محدودهٔ توقف وسایل','کنار محوطهٔ خدمات','محدودهٔ اصلی مجموعه','محدودهٔ فرعی مجموعه','نزدیک گذرگاه','کنار تابلوهای راهنما','نزدیک محل انتظار','حاشیهٔ محل','بخش پشتی محل','بخش جلویی محل','کنار مسیر عمومی','نزدیک فضای باز محل']
TIMES=['امروز صبح','امروز ظهر','امروز عصر','امروز شب','دیروز صبح','دیروز ظهر','دیروز عصر','دیشب','پریروز صبح','پریروز عصر','سه روز پیش صبح','سه روز پیش عصر','چهار روز پیش صبح','چهار روز پیش عصر','پنج روز پیش صبح','پنج روز پیش عصر','شش روز پیش صبح','شش روز پیش عصر','یک هفته پیش صبح','یک هفته پیش عصر']
STANCES=['observed','reported','uncertain','denied','hypothetical']
PREFIXES={
 'train':['خودم این مورد را دیدم: ','این مورد را شنیدم و خودم ندیدم: ','تنها احتمال این مورد مطرح شده و مطمئن نیستم: ','این مورد رخ نداده است و آن را رد می‌کنم: ','این مورد صرفاً فرضی است و اتفاق واقعی نیست: '],
 'validation':['مشاهدهٔ مستقیم من این بود: ','اطلاعات این بخش نقل‌قول است: ','برای این مورد شاهد کافی ندارم: ','تأکید می‌کنم چنین موردی اتفاق نیفتاده است: ','در یک مثال آموزشی فرض کنید: '],
 'test':['آنچه با چشم خودم مشاهده کردم: ','این قسمت را شخص دیگری برایم تعریف کرد: ','نمی‌توانم وقوع این مورد را تأیید کنم: ','برخلاف ادعای مطرح‌شده، این مورد واقع نشده است: ','از یک موقعیت خیالی صحبت می‌کنم: '],
}
PERSON_TOPICS={'theft','assault','pdf_a04','harassment','trafficking','confinement','pdf_a14','self_harm'}
OBJECT_TOPICS={'theft','damage','forgery','fraud','fire','data_breach','drug_use','drug_supply','hazardous_supply','fireworks'}

def scenario(primary,j,rows):
    p=j%20;t=(j//20)%20;stance=(j//400)%5;mode=j//2000
    split='train' if p<16 else 'validation' if p<18 else 'test'
    first=rows[primary]; second=rows[(primary+17+p+t)%len(rows)]
    text=f'{TIMES[t]}؛ محل: {PLACES[p]}. '
    spans=[{'field':'time','start':0,'end':len(TIMES[t])},
           {'field':'place','start':text.index(PLACES[p]),'end':text.index(PLACES[p])+len(PLACES[p])}]
    episodes=[];accepted=[];candidate=[]
    def add_episode(row,how,join=''):
        nonlocal text
        text+=join;start=len(text);text+=PREFIXES[split][how]+row['statement']
        episodes.append({'subtopic':row['id'],'topic':row['topic'],'stance':STANCES[how],'start':start,'end':len(text)})
        (accepted if how<2 else candidate if how==2 else []).append(row)
    if mode==2:
        add_episode(second,0);add_episode(first,stance,' سپس ')
    else:
        add_episode(first,stance)
        if mode in (1,3):add_episode(second,0,' پس از آن ' if mode==1 else ' هم‌زمان ')
    if mode==4:
        text+=' یک خودروی پارک‌شده هم دیدم؛ ارتباط آن با ماجرا را نمی‌دانم.'
        start=text.index('یک خودروی پارک‌شده');spans.append({'field':'vehicle.observation','start':start,'end':len(text)})
    text+=' نام اشخاص و شمارهٔ پلاک را نمی‌دانم.'
    topic_ids=list(dict.fromkeys(x['topic'] for x in accepted))
    categories=['event','place']
    if set(topic_ids)&PERSON_TOPICS:categories.append('person')
    if set(topic_ids)&OBJECT_TOPICS or mode==4:categories.append('object')
    needs_clarification=bool(candidate) or not accepted
    question='کدام رفتار را با اطمینان مشاهده کرده‌اید؟' if needs_clarification else first['question'] if stance<2 else accepted[0]['question']
    return {
      'id':f'syn-{primary*10000+j+1:07d}', 'synthetic':True,'split':split,
      'case_group':f'{first["id"]}-p{p:02d}-t{t:02d}',
      'template_family':f'{split}-{STANCES[stance]}-{mode}',
      'primary_subtopic':first['id'],'text':text,
      'labels':{'subtopics':[x['id'] for x in accepted],'topics':topic_ids,'categories':categories,
                'candidate_subtopics':[x['id'] for x in candidate],'needs_clarification':needs_clarification},
      'episodes':episodes,'spans':spans,
      'unknown_fields':['person.name','vehicle.plate','source.contact'],
      'next_question':question,'review_required':True,
    }

def validate_record(row,ids,topics):
    assert row['synthetic'] is True and row['review_required'] is True
    assert row['primary_subtopic'] in ids and len(row['text'])<=6000
    assert set(row['labels']['subtopics'])<=ids and set(row['labels']['topics'])<=topics
    for span in row['episodes']+row['spans']:
        assert 0<=span['start']<span['end']<=len(row['text'])
    positive=[e for e in row['episodes'] if e['stance'] in ('observed','reported')]
    assert row['labels']['subtopics']==[e['subtopic'] for e in positive]
    assert row['labels']['topics']==list(dict.fromkeys(e['topic'] for e in positive))
    assert len(row['labels']['subtopics'])==len(set(row['labels']['subtopics']))


def build(out,count=5_000_000):
    if not 1<=count<=5_000_000:raise ValueError('Requested count out of range.')
    out.mkdir(parents=True,exist_ok=True)
    if (out/'manifest.json').exists() or list(out.glob('scenarios-*.jsonl.gz')):
        raise ValueError('Use a new output directory; existing shards are never overwritten.')
    taxonomy=build_taxonomy();rows=taxonomy['subtopics'];ids={r['id'] for r in rows};topics={r['topic'] for r in rows}
    (out/'taxonomy-500.json').write_text(json.dumps(taxonomy,ensure_ascii=False,indent=2)+'\n')
    manifest={'version':VERSION,'synthetic_only':True,'expert_reviewed':False,'trained_checkpoint':False,
      'requested_rows':count,'subtopic_count':500,'source':'authored-compositional-templates',
      'not_independent_real_reports':True,'split_policy':'Place-context families p00-p15 train, p16-p17 validation, p18-p19 test; all stance variants of a case remain together.',
      'template_overlap_warning':'Core subtopic wording is shared. These splits test plumbing and controlled contrasts, not real-world model quality.',
      'shards':[]}
    counts=Counter();primary_counts=Counter();unique_hashes=out/'text-hashes.txt';total=0;raw_total=0;text_total=0;start=time.monotonic()
    with unique_hashes.open('w',buffering=1024*1024) as hashes:
      for shard in range((count+999999)//1000000):
        path=out/f'scenarios-{shard+1:02d}.jsonl.gz';raw_hash=hashlib.sha256();raw_size=0;shard_count=0
        with path.open('wb') as base,gzip.GzipFile(filename='',mode='wb',fileobj=base,compresslevel=1,mtime=0) as f:
          stop=min(count,(shard+1)*1000000)
          for index in range(shard*1000000,stop):
            row=scenario(index//10000,index%10000,rows);validate_record(row,ids,topics)
            text_bytes=row['text'].encode();hashes.write(hashlib.sha256(text_bytes).hexdigest()+'\n')
            encoded=(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n').encode()
            f.write(encoded);raw_hash.update(encoded);raw_size+=len(encoded);text_total+=len(text_bytes)
            counts[row['split']]+=1;primary_counts[row['primary_subtopic']]+=1;total+=1;shard_count+=1
            if total%100000==0:print(json.dumps({'rows':total,'elapsed_seconds':round(time.monotonic()-start,1)}),flush=True)
        with path.open('rb') as f:compressed_hash=hashlib.file_digest(f,'sha256').hexdigest()
        raw_total+=raw_size
        manifest['shards'].append({'file':path.name,'rows':shard_count,'raw_bytes':raw_size,'compressed_bytes':path.stat().st_size,'sha256_raw':raw_hash.hexdigest(),'sha256_compressed':compressed_hash})
        (out/'build-progress.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    manifest.update(rows=total,raw_jsonl_bytes=raw_total,narrative_utf8_bytes=text_total,split_counts=dict(counts),primary_counts=dict(primary_counts),generated_seconds=round(time.monotonic()-start,1),text_deduplication='pending')
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:manifest[k] for k in ['rows','raw_jsonl_bytes','narrative_utf8_bytes','split_counts','generated_seconds']}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--count',type=int,default=5_000_000)
    args=p.parse_args();build(args.out,args.count)
