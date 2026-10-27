import {createWriteStream} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createGzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {pipeline} from 'node:stream/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seeds,controls} from './seeds.mjs';
import {openings,whatAnswers,OPTIONAL_BANKS} from './novice-seeds.mjs';
import {EVENTS,localAnalysis} from '../public/scenarios.js';
import {prepareAnalysis} from '../public/extraction.js';
import {questionsFor} from '../public/domain.js';
import {startAnalysisReview,needsAnalysisReview} from '../public/analysis-review.js';
import {guidanceNeed,composeNarrative,missingFacts} from '../public/guidance.js';

const argv=process.argv.slice(2),get=(name,fallback)=>argv.includes(name)?argv[argv.indexOf(name)+1]:fallback;
const count=Number(get('--count','1000000')),out=resolve(get('--out','../evaluation-output'));
// The novice shard covers reporters who do not know what to write: a stuck
// opening, the guided interview that follows, and the narrative it composes.
const noviceCount=Number(get('--novice',String(Math.round(count/25))));
const topicTotal=count-noviceCount;
if(!Number.isInteger(count)||count<5)throw Error('--count must be a positive integer of at least five');
if(!Number.isInteger(noviceCount)||noviceCount<0||noviceCount>=count)throw Error('--novice must be a non-negative integer below --count');
if(topicTotal<5||topicTotal%5)throw Error('--count minus --novice must be a positive multiple of five');
// A run may be split across processes: each picks its shards and writes its own
// partial summary, which merge-results.mjs combines. Every shard draws from its
// own deterministic stream, so the split changes nothing about what is generated.
const only=get('--only','').split(',').map(x=>x.trim()).filter(Boolean);
const wants=name=>!only.length||only.includes(String(name));
const tag=get('--tag',only.length?only.join('-'):'all');
await mkdir(out,{recursive:true});
let randomState=20260921;
const seedStream=n=>{randomState=(20260921+n*7919)>>>0||1};
const random=n=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return (randomState>>>0)%n};
const topicIds=Object.keys(seeds),seen=new Set();
const cities=['تهران','کرج','رشت','مشهد','شیراز','اصفهان','تبریز','یزد','قم','قزوین','ساری','گرگان','اراک','کرمان','بوشهر','اهواز','همدان','سنندج','اردبیل','زنجان'];
const places=['خیابان بهار','میدان آزادی','کوچه گلستان','بلوار دانش','خیابان فرهنگ','میدان امام','خیابان سرو','خیابان آبان','کوچه نسترن','خیابان مهر','بلوار فردوس','خیابان لاله','میدان سپید','بلوار فرهنگ','خیابان دانشجو','میدان بهاران'];
const starters=['آنچه مشاهده کردم این بود:','شرح مشاهداتم:','شاهد این موارد بودم:','از شاهد شنیدم:','در گزارش دریافتی آمده بود:','گزارشم به این شرح است:'];
const punctuation=['. ','؛ ','\n'];
const fa=n=>String(n).replace(/\d/g,c=>'۰۱۲۳۴۵۶۷۸۹'[+c]);
const sorted=x=>[...new Set(x)].sort();
function createCase(k){
 const expected=[];while(expected.length<k){const id=topicIds[random(topicIds.length)];if(!expected.includes(id))expected.push(id)}
 const source=expected.map(id=>({id,variant:random(seeds[id].length)}));
 const clauses=source.map(({id,variant})=>seeds[id][variant]);
 if(random(7)===0){const {id,variant}=source[random(source.length)];clauses.push('در زمان دیگری هم '+seeds[id][1-variant])}
 let negative=null;
 if(random(3)===0){negative=controls[random(controls.length)];clauses.splice(random(clauses.length+1),0,negative[0])}
 const city=cities[random(cities.length)],place=places[random(places.length)];
 const context=`محل گزارش ${city}، ${place} است. زمان گزارش روز ${fa(random(28)+1)} ماه ${fa(random(12)+1)} سال ۱۴۰۴، ساعت ${fa(random(24)).padStart(2,'۰')}:${fa(random(60)).padStart(2,'۰')} است. `;
 let text=context+starters[random(starters.length)]+' '+clauses.join(punctuation[random(punctuation.length)])+'.';
 const typography=random(4);if(typography===1)text=text.replace(/ی/g,'ي').replace(/ک/g,'ك');if(typography===2)text=text.replace(/می /g,'می‌');if(typography===3)text='  '+text+'  ';
 return {text,expected:sorted(expected),source,negative:negative?{text:negative[0],topic:negative[1]}:null,typography};
}
const started=new Date(),performanceStart=performance.now(),perTopic=Object.fromEntries(topicIds.map(id=>[id,{expected:0,found:0,falsePositive:0}]));
const summary={schemaVersion:1,seed:20260921,startedAt:started.toISOString(),scope:'Deterministic synthetic compositional regression; no model training, no live API calls, no estimate of real-world accuracy.',topicCount:topicIds.length,seedPhraseCount:Object.values(seeds).flat().length,total:count,topicRecords:topicTotal,noviceRecords:noviceCount,novice:{total:noviceCount,passed:0,failed:0,needMatches:0,topicMatches:0,groundingFailures:0,missingFactFailures:0,byNeed:{}},duplicateCandidatesSkipped:0,uniqueNarratives:0,passed:0,failed:0,labelExactMatches:0,evidenceFailures:0,questionFailures:0,reviewFailures:0,byTopicCount:{},topics:perTopic,failuresByKind:{},examples:[],shards:[]};
const root=fileURLToPath(new URL('../',import.meta.url)),sources=['evaluation/seeds.mjs','evaluation/novice-seeds.mjs','evaluation/run-million.mjs','public/guidance.js','public/situation.js','public/persian-normalize.js','public/lexicon.js','public/core-rules.js','public/incident-language.js','public/scenarios.js','public/extraction.js','public/domain.js','public/numbered-topics.js','public/extended-bank.js','public/question-bank.js','public/details.js','public/analysis-review.js'];
// The optional answer banks must add no topic of their own, or the novice
// shard's expected labels would be wrong. Verified here, not assumed.
for(const [step,bank] of Object.entries(OPTIONAL_BANKS))for(const phrase of bank){
 const events=localAnalysis(phrase).events;
 if(events.length!==1||events[0]!=='other')throw Error(`novice bank ${step} phrase is not topic-neutral: ${phrase} -> ${events}`);
}
for(const answer of whatAnswers){
 const events=sorted(localAnalysis(answer.phrase).events);
 if(JSON.stringify(events)!==JSON.stringify(sorted(answer.topics)))throw Error(`novice what-answer mislabelled: ${answer.phrase} -> ${events}`);
}
summary.sourceHashes=Object.fromEntries(await Promise.all(sources.map(async name=>[name,createHash('sha256').update(await readFile(resolve(root,name))).digest('hex')])));
for(let k=1;k<=5;k++){
 if(!wants(k))continue;
 seedStream(k);
 const perShard=topicTotal/5;
 const file=`scenarios-${k}-topics.jsonl.gz`,gzip=createGzip({level:6}),sink=createWriteStream(resolve(out,file)),done=pipeline(gzip,sink),rawHash=createHash('sha256');let rawBytes=0;
 const metrics={total:perShard,passed:0,failed:0,labelExactMatches:0};summary.byTopicCount[k]=metrics;
 for(let index=0;index<perShard;index++){
  let c,hash;do{c=createCase(k);hash=createHash('sha256').update(c.text).digest('hex');if(seen.has(hash))summary.duplicateCandidatesSkipped++}while(seen.has(hash));seen.add(hash);
  const a=prepareAnalysis(localAnalysis(c.text),c.text),questions=questionsFor(a),detected=sorted(a.events),errors=[];
  const exact=JSON.stringify(detected)===JSON.stringify(c.expected);
  if(exact){summary.labelExactMatches++;metrics.labelExactMatches++}else errors.push('topic_set');
  const grounded=a.events.every(id=>typeof a.eventEvidence[id]==='string'&&c.text.includes(a.eventEvidence[id]))&&a.prefills.every(p=>c.text.includes(p.evidence)&&p.evidence.includes(p.value))&&a.episodes.every(e=>c.text.includes(e.evidence));
  if(!grounded){errors.push('grounding');summary.evidenceFailures++}
  const ids=questions.map(q=>q.id),complete=c.expected.every(id=>ids.includes('details_'+id));
  if(!complete||new Set(ids).size!==ids.length){errors.push('questions');summary.questionFailures++}
  const state={text:c.text,analysis:a,extra:{},answers:{},prefillAudit:[]};startAnalysisReview(state);
  if(!needsAnalysisReview(state)){errors.push('review_gate');summary.reviewFailures++}
  for(const id of c.expected){perTopic[id].expected++;if(detected.includes(id))perTopic[id].found++}
  for(const id of detected)if(!c.expected.includes(id)&&perTopic[id])perTopic[id].falsePositive++;
  for(const error of errors)summary.failuresByKind[error]=(summary.failuresByKind[error]||0)+1;
  if(errors.length){metrics.failed++;summary.failed++;if(summary.examples.length<80)summary.examples.push({text:c.text,expected:c.expected,detected,errors})}else{metrics.passed++;summary.passed++}
  const record={id:`s${k}-${String(index+1).padStart(6,'0')}`,text:c.text,expected_topics:c.expected,detected_topics:detected,seed_variants:c.source,negative_control:c.negative,typography:c.typography,question_ids:ids,evidence:a.eventEvidence,prefill_count:a.prefills.length,checks:{topic_set:exact,grounding:grounded,questions:!errors.includes('questions'),review:!errors.includes('review_gate')},errors};
  const line=JSON.stringify(record)+'\n';rawHash.update(line);rawBytes+=Buffer.byteLength(line);if(!gzip.write(line))await once(gzip,'drain');
  const processed=summary.passed+summary.failed;if(processed%10000===0)console.log(JSON.stringify({processed,failed:summary.failed,seconds:Math.round((performance.now()-performanceStart)/1000)}));
 }
 gzip.end();await done;
 const bytes=await readFile(resolve(out,file));summary.shards.push({file,records:perShard,rawBytes,gzipBytes:bytes.length,jsonlSha256:rawHash.digest('hex'),gzipSha256:createHash('sha256').update(bytes).digest('hex')});
}

// ------------------------------------------------------- novice shard
// One record per simulated inexperienced reporter: what they typed when they
// were stuck, the answers the guided questions collected, and the narrative the
// browser composed from those answers. Nothing here calls a network service.
if(noviceCount&&wants('novice')){
 seedStream(97);
 const optionalSteps=Object.keys(OPTIONAL_BANKS);
 const file='scenarios-novice.jsonl.gz',gzip=createGzip({level:6}),sink=createWriteStream(resolve(out,file)),done=pipeline(gzip,sink),rawHash=createHash('sha256');let rawBytes=0;
 const metrics=summary.novice;
 for(let index=0;index<noviceCount;index++){
  const [openingText,expectedNeed]=openings[random(openings.length)];
  const what=whatAnswers[random(whatAnswers.length)];
  // A novice answers some questions and skips others; both paths must hold.
  const answers={what:what.phrase};
  const skipped=[];
  for(const step of optionalSteps){
   const bank=OPTIONAL_BANKS[step];
   if(random(4)===0){skipped.push(step);continue}
   answers[step]=bank[random(bank.length)];
  }
  const composed=composeNarrative(answers);
  const need=guidanceNeed(openingText).need;
  const expectedTopics=sorted(what.topics);
  const errors=[];

  if(need===expectedNeed)metrics.needMatches++;else errors.push('guidance_need');
  (metrics.byNeed[expectedNeed]??={expected:0,matched:0}).expected++;
  if(need===expectedNeed)metrics.byNeed[expectedNeed].matched++;

  const a=prepareAnalysis(localAnalysis(composed),composed);
  const detected=sorted(a.events);
  if(JSON.stringify(detected)===JSON.stringify(expectedTopics))metrics.topicMatches++;else errors.push('topic_set');

  // Every composed sentence must trace back to an answer the reporter gave,
  // and every stored quote must appear verbatim in the composed narrative.
  const answered=Object.values(answers).filter(Boolean);
  const composedGrounded=answered.every(value=>composed.includes(value))
   &&a.events.every(id=>typeof a.eventEvidence[id]==='string'&&composed.includes(a.eventEvidence[id]))
   &&a.prefills.every(p=>composed.includes(p.evidence)&&p.evidence.includes(p.value));
  // A skipped question must leave nothing behind: no invented fact, no filler.
  const noInvention=!/undefined|null|نامشخص|نامعلوم/.test(composed)
   &&skipped.every(step=>OPTIONAL_BANKS[step].every(phrase=>!composed.includes(phrase)));
  if(!composedGrounded||!noInvention){errors.push('grounding');metrics.groundingFailures++}

  // A fact the reporter did answer must not still be reported as missing.
  const stillMissing=new Set(missingFacts(composed,a).map(f=>f.id));
  const answeredFacts=[['when','time'],['where','place'],['who','person'],['method','method'],['reason','reason'],['evidence','evidence'],['source','source']];
  const missingWrong=answeredFacts.some(([step,fact])=>answers[step]&&stillMissing.has(fact));
  if(missingWrong||stillMissing.has('clarify')){errors.push('missing_facts');metrics.missingFactFailures++}

  const ids=questionsFor(a).map(q=>q.id);
  if(!expectedTopics.every(id=>ids.includes('details_'+id))||new Set(ids).size!==ids.length)errors.push('questions');
  const state={text:composed,analysis:a,extra:{},answers:{},prefillAudit:[]};startAnalysisReview(state);
  if(!needsAnalysisReview(state))errors.push('review_gate');

  for(const error of errors)summary.failuresByKind[error]=(summary.failuresByKind[error]||0)+1;
  if(errors.length){metrics.failed++;summary.failed++;if(summary.examples.length<80)summary.examples.push({opening:openingText,composed,expected:expectedTopics,detected,errors})}
  else{metrics.passed++;summary.passed++}

  const record={id:`n-${String(index+1).padStart(6,'0')}`,opening:openingText,expected_need:expectedNeed,detected_need:need,
   answers,skipped,composed,expected_topics:expectedTopics,detected_topics:detected,
   missing_facts:[...stillMissing],question_ids:ids,evidence:a.eventEvidence,
   checks:{guidance_need:!errors.includes('guidance_need'),topic_set:!errors.includes('topic_set'),grounding:!errors.includes('grounding'),missing_facts:!errors.includes('missing_facts'),questions:!errors.includes('questions'),review:!errors.includes('review_gate')},errors};
  const line=JSON.stringify(record)+'\n';rawHash.update(line);rawBytes+=Buffer.byteLength(line);if(!gzip.write(line))await once(gzip,'drain');
  const processed=summary.passed+summary.failed;if(processed%10000===0)console.log(JSON.stringify({processed,failed:summary.failed,seconds:Math.round((performance.now()-performanceStart)/1000)}));
 }
 gzip.end();await done;
 const bytes=await readFile(resolve(out,file));summary.shards.push({file,records:noviceCount,rawBytes,gzipBytes:bytes.length,jsonlSha256:rawHash.digest('hex'),gzipSha256:createHash('sha256').update(bytes).digest('hex')});
}
summary.uniqueNarratives=seen.size;summary.finishedAt=new Date().toISOString();summary.durationSeconds=Math.round((performance.now()-performanceStart)/10)/100;
summary.shardSelection=only.length?only:['1','2','3','4','5','novice'];
await writeFile(resolve(out,only.length?`results-${tag}.json`:'results.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({out,total:summary.total,passed:summary.passed,failed:summary.failed,seconds:summary.durationSeconds}));
