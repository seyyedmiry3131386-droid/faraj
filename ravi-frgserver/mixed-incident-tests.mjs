import test from 'node:test';
import assert from 'node:assert/strict';
import {localAnalysis,EVENTS} from './public/scenarios.js';
import {prepareAnalysis} from './public/extraction.js';
import {questionsFor} from './public/domain.js';
import {detailSchema} from './public/details.js';
import {startAnalysisReview,needsAnalysisReview} from './public/analysis-review.js';
import worker from './worker.js';

const narrative='شب گذشته در یکی از خیابان‌های مرکزی تهران، مأموران هنگام گشت‌زنی با گزارش شهروندان درباره تجمع چند نفر در مقابل یک واحد تجاری مواجه شدند. طبق بررسی اولیه، چند نفر از افراد حاضر اقدام به درگیری و ایجاد مزاحمت برای کسبه و رهگذران کرده بودند. در جریان بررسی صحنه مشخص شد یکی از افراد حاضر مقداری مواد مخدر به همراه داشته و فرد دیگری نیز در حال معرفی و فروش مواد به چند نفر بوده است. هنگام حضور مأموران برای کنترل وضعیت، برخی افراد با ایجاد مقاومت، توهین و تهدید به مأموران مانع انجام وظیفه آنها شدند و یکی از آنها با یک وسیله تیز اقدام به تهدید افراد حاضر در محل کرد. همچنین در بررسی‌های بعدی مشخص شد خودروی یکی از افراد حاضر در محل دارای پلاک مخدوش بوده و مدارک خودرو نیز با ابهاماتی همراه است';
const expected=['public_nuisance','drug_supply','pdf_a04','weapon_threat','vehicle_irregularity'];
const labels=a=>a.events.map(id=>EVENTS[id].title);

test('five explicit incident families survive the supplied long narrative and have grounded detail sections',()=>{
 const a=prepareAnalysis(localAnalysis(narrative),narrative);
 assert.deepEqual(new Set(a.events),new Set(expected),JSON.stringify(labels(a)));
 assert.equal(a.known.time,'شب گذشته');
 for(const id of expected){
  assert.ok(narrative.includes(a.eventEvidence[id]),id);
  assert.ok(questionsFor(a).some(q=>q.id==='details_'+id),id);
  assert.ok(detailSchema('details_'+id,id).fields.length>=3,id);
  const answer=a.prefills.find(p=>p.section==='details_'+id&&p.field==='answer');
  assert.ok(answer,id);assert.ok(narrative.includes(answer.value));
 }
 assert.match(a.prefills.find(p=>p.section==='details_drug_supply').value,/به همراه داشته/);
 assert.match(a.prefills.find(p=>p.section==='details_drug_supply').value,/فروش مواد/);
 assert.ok(a.episodes.find(e=>e.event==='weapon_threat').evidence.startsWith('یکی از آنها'));
 assert.ok(!a.episodes.find(e=>e.event==='pdf_a04').evidence.includes('وسیله تیز'));
 assert.ok(!a.events.some(id=>['drug_use','forgery','theft','official_complaint','shooting'].includes(id)));
 const state={text:narrative,analysis:a,extra:{},answers:{},prefillAudit:[]};startAnalysisReview(state);assert.ok(needsAnalysisReview(state));
});

test('fresh incomplete AI output receives missing grounded topics while manual choices and refusals remain authoritative',()=>{
 const a=prepareAnalysis({events:[{type:'public_nuisance',evidence:'ایجاد مزاحمت برای کسبه و رهگذران'}],known:{},prefills:[]},narrative);
 assert.deepEqual(new Set(a.events),new Set(expected));
 const empty=prepareAnalysis({events:[],known:{},clarification:{needed:true}},narrative);assert.deepEqual(new Set(empty.events),new Set(expected));assert.equal(empty.needsClarification,false);
 const generic=prepareAnalysis({events:[{type:'harassment',evidence:'ایجاد مزاحمت برای کسبه و رهگذران'}],known:{}},narrative);assert.deepEqual(new Set(generic.events),new Set(expected));
 for(const id of expected.filter(id=>id!=='public_nuisance'))assert.ok(a.episodes.some(e=>e.event===id));
 assert.deepEqual(prepareAnalysis({events:['public_nuisance'],known:{},reviewed:true},narrative).events,['public_nuisance']);
 const independent='یک فرد را کتک زدند؛ فرد دیگری مأموران را تهدید کرد';const kept=prepareAnalysis({events:[{type:'assault',evidence:'کتک'}],known:{}},independent);assert.ok(kept.events.includes('assault'));assert.ok(kept.events.includes('pdf_a04'));
 const refused=prepareAnalysis({events:[{type:'other',evidence:'شب گذشته'}],known:{},refusal:'رد آزمایشی'},narrative);assert.deepEqual(refused.events,['other']);
 assert.equal(refused.prefills.length,0);
 const again=prepareAnalysis(a,narrative);assert.deepEqual(again.events,a.events);assert.deepEqual(again.episodes,a.episodes);
});

test('reported possession, ordinary materials, negation and separate drug consumption remain distinct',()=>{
 for(const text of ['مواد مخدر به همراه داشت','شنیدم مواد مخدر به همراه داشته است','نگهداری مواد مخدر را گزارش کرد','مواد مخدر همراه داشت و فروش مواد را نیز دیدم'])assert.ok(localAnalysis(text).events.includes('drug_supply'),text);
 for(const text of ['فروش مواد اولیه انجام می‌شد','مواد مخدر دیده شد؛ در مغازه فروش مواد غذایی انجام می‌شد','مواد مخدر به همراه نداشت','نگهداری مواد مخدر نبود','اگر فروش مواد مخدر رخ داد چه کنیم؟','شاید مواد مخدر به همراه داشته باشد','داروهای نسخه‌دار به همراه داشت'])assert.ok(!localAnalysis(text).events.includes('drug_supply'),text);
 assert.ok(!localAnalysis('مواد مخدر به همراه داشت').events.includes('drug_use'));
});

test('weapons, staff presence and document uncertainty never imply unsupported incidents',()=>{
 for(const text of ['با چاقو تهدید کرد','با یک وسیله تیز اقدام به تهدید رهگذران کرد','تهدید با سلاح سرد رخ داد'])assert.ok(localAnalysis(text).events.includes('weapon_threat'),text);
 for(const text of ['چاقو را در آشپزخانه دیدم','با چاقو تهدید نکرد','با چاقو کار می‌کرد و تهدیدی رخ نداد','اگر با چاقو تهدید کرد چه کنیم؟','فرض کنید در یک مثال آموزشی و کاملاً فرضی درباره چند موقعیت مختلف، کسی با چاقو تهدید کرد'])assert.ok(!localAnalysis(text).events.includes('weapon_threat'),text);
 for(const text of ['مقاومت در برابر مأموران انجام شد','تهدید به مأموران رخ داد'])assert.ok(localAnalysis(text).events.includes('pdf_a04'),text);
 for(const text of ['مأموران به محل نزاع رسیدند','از عملکرد مأموران انتقاد کردند','به مأموران توهین کردند','مقاومت در برابر مأموران رخ نداد'])assert.ok(!localAnalysis(text).events.includes('pdf_a04'),text);
 const vehicle=localAnalysis('خودرو پلاک مخدوش داشت و مدارک خودرو با ابهاماتی همراه بود');assert.ok(vehicle.events.includes('vehicle_irregularity'));assert.ok(!vehicle.events.includes('forgery'));assert.ok(!vehicle.events.includes('theft'));
 assert.ok(!localAnalysis('پلاک مخدوش نبود').events.includes('vehicle_irregularity'));
 assert.ok(!localAnalysis('یک خودروی مشکوک دیدم').events.includes('vehicle_irregularity'));
 assert.ok(!localAnalysis('تجمع مسالمت‌آمیز در مقابل واحد تجاری بود').events.includes('public_nuisance'));
});

test('specific threats replace only duplicate generic occurrences',()=>{
 const a=localAnalysis('با چاقو تهدید کرد. در محل دیگری مزاحمت تلفنی رخ داد.');
 assert.ok(a.events.includes('weapon_threat'));assert.ok(a.events.includes('harassment'));
 assert.equal(a.eventEvidence.harassment,'مزاحمت تلفنی');
});

test('Worker returns all five topic families when the upstream model supplies just one',async()=>{
 const original=globalThis.fetch;let request;
 try{
  globalThis.fetch=async(_,options)=>{request=JSON.parse(options.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({events:[{type:'public_nuisance',evidence:'ایجاد مزاحمت برای کسبه و رهگذران'}],known:{time:'',place:'',source:''},prefills:[]})}]}]})};
  const res=await worker.fetch(new Request('https://example.invalid/api/analyze',{method:'POST',body:JSON.stringify({text:narrative})}),{OPENAI_API_KEY:'test-only'});
  assert.equal(res.status,200);const a=await res.json();assert.deepEqual(new Set(a.events),new Set(expected));
  const ids=request.text.format.schema.properties.events.items.properties.type.enum;
  assert.ok(ids.includes('weapon_threat'));assert.ok(ids.includes('vehicle_irregularity'));
 }finally{globalThis.fetch=original}
});

const compositionSeeds={
 public_nuisance:['برای رهگذران مزاحمت ایجاد کرده بودند','ایجاد مزاحمت برای کسبه رخ داد','اخلال در نظم عمومی گزارش شد'],
 drug_supply:['یک فرد مواد مخدر به همراه داشته است','نگهداری مواد مخدر را گزارش کردند','فردی در حال فروش مواد مخدر بود'],
 pdf_a04:['فردی مأموران را تهدید کرد','در برابر مأمورین شهرداری مقاومت کردند','تهدید به مأموران صورت گرفت'],
 weapon_threat:['رهگذران را با چاقو تهدید کردند','با یک وسیلهٔ تیز اقدام به تهدید کرد','تهدید با سلاح سرد گزارش شد'],
 vehicle_irregularity:['پلاک خودرو مخدوش بود','پلاک را مخدوش کرده بودند','مدارک خودرو با ابهاماتی همراه بود']
};
function* permutations(items,prefix=[]){if(prefix.length)yield prefix;for(const item of items)yield* permutations(items.filter(x=>x!==item),[...prefix,item]);}
test('2,600 ordered one-to-five-topic combinations preserve topics, evidence and shared-question deduplication',()=>{
 let checked=0;
 for(const chosen of permutations(expected))for(const separator of ['. ','؛ ','\n','. سپس '])for(const transform of [s=>s,s=>s.replaceAll('ی','ي').replaceAll('ک','ك')]){
  const text=transform(chosen.map(id=>compositionSeeds[id][0]).join(separator));
  const a=prepareAnalysis(localAnalysis(text),text);
  assert.deepEqual(new Set(a.events),new Set(chosen),text);
  assert.ok(a.events.length<=5);
  for(const id of chosen)assert.ok(text.includes(a.eventEvidence[id]),text+' / '+id);
  const qs=questionsFor(a);assert.equal(new Set(qs.map(q=>q.id)).size,qs.length);
  checked++;
 }
 assert.equal(checked,2600);
});
test('243 five-topic wording combinations preserve every topic without implying injury, theft or forgery',()=>{
 for(let n=0;n<243;n++){
  let v=n;const parts=expected.map(id=>{const sentence=compositionSeeds[id][v%3];v=Math.floor(v/3);return sentence});
  const text=parts.join('؛ '),a=localAnalysis(text);
  assert.deepEqual(new Set(a.events),new Set(expected),text);
 }
});
