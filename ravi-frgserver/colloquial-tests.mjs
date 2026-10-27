import test from 'node:test';
import assert from 'node:assert/strict';
import {localAnalysis,EVENTS} from './public/scenarios.js';
import {prepareAnalysis,applyPrefills} from './public/extraction.js';
import {questionsFor} from './public/domain.js';
import {startAnalysisReview,needsAnalysisReview} from './public/analysis-review.js';
import {topicChoices,topicMatches} from './public/topic-view.js';
import worker from './worker.js';

const narrative='امروز وارد یک سوپر مارکت شدم مشروب میفروخت همزمان خریدارانی بودند که برای خرید مواد مخدر گل به فروشگاه مراجعه کرده بودند\nکه بخاطر اختلاف قیمت دچار نزاع و درگیری شدن\nتماس با 110 حاصل شد اما صرفا نزاع تمامم شد\nفروش ابجو و پیپر رسیدگی نشد';
const expected=['business_observation','drug_supply','assault','official_complaint'];
const ids=text=>localAnalysis(text).events;
const esc=s=>String(s).replace(/[&<>"']/g,'');

test('the exact supermarket narrative retains four evidenced topics and partial complaint handling',()=>{
 for(const text of [narrative,narrative.replace(/\n/g,' '),narrative.replace(/110/g,'۱۱۰'),narrative.replace(/110/g,'١١٠'),narrative.replace(/میفروخت/g,'می‌فروخت').replace(/ابجو/g,'آبجو')]){
  const a=prepareAnalysis(localAnalysis(text),text);
  assert.deepEqual(new Set(a.events),new Set(expected),text);
  assert.equal(a.known.time,'امروز');
  assert.equal(a.eventEvidence.drug_supply,'خرید مواد مخدر');assert.ok(!a.eventEvidence.drug_supply.includes('فروشگاه'));
  for(const id of expected){assert.ok(text.includes(a.eventEvidence[id]));assert.ok(a.prefills.some(p=>p.section==='details_'+id&&p.field==='answer'));assert.ok(questionsFor(a).some(q=>q.id==='details_'+id))}
  assert.ok(a.prefills.some(p=>p.section==='place'&&p.value==='سوپر مارکت'));
  assert.ok(a.prefills.some(p=>p.section==='details_official_complaint'&&p.field==='channel'&&p.value.includes('تماس')));
  assert.ok(a.prefills.some(p=>p.section==='details_official_complaint'&&p.field==='response'&&p.value.includes('تمامم شد')));
  const state={text,analysis:a,answers:{},extra:{}};let serial=0;applyPrefills(state,()=>({_id:String(++serial)}));startAnalysisReview(state);assert.ok(needsAnalysisReview(state));
  assert.ok(!a.prefills.some(p=>['injury','tool'].includes(p.field)));
  assert.equal(new Set(questionsFor(a).map(q=>q.id)).size,questionsFor(a).length);
 }
});

test('colloquial alcohol verbs, spacing and spelling are recognized with clear labels',()=>{
 for(const text of ['مشروب میفروخت','مشروب می‌فروخت','مشروب می فروخت','مشروب میفروختند','آبجو میفروشد','ابجو میفروشن','مشروب میفروشه','شراب فروختند','فروش ابجو','فروش آبجو','آبجوی الکلی میفروخت','مشروب سرو میشد','مشروب سرو می‌شد','مشروب فروشی را گزارش کردند'])assert.ok(ids(text).includes('business_observation'),text);
 assert.match(EVENTS.business_observation.title,/مشروبات الکلی/);assert.match(EVENTS.assault.title,/نزاع.*درگیری/);
 const markup=topicChoices({events:['other']},esc);assert.ok(markup.includes('آبجو'));assert.ok(topicMatches(EVENTS.business_observation.aliases.join(' '),'ابجو'));
});

test('ordinary goods, negated trade, uncertain and hypothetical reports do not create alcohol or drug sales',()=>{
 for(const text of ['مشروب نمیفروخت','مشروب نمی‌فروخت','مشروب نفروختند','فروش مشروب نبود','فروش ابجو انجام نشد','مشروب سرو نمی‌شد','آبجو بدون الکل میفروخت','آبجو غیرالکلی میفروخت','آبجوی بدون الکل میفروخت','الکل صنعتی میفروخت','اگر مشروب میفروخت چه کنیم؟','شاید مشروب میفروخت','گل میفروخت','پیپر میفروخت','خرید مواد غذایی','خرید مواد اولیه','مواد مخدر را در فروشگاه دیدم','نام مواد مخدر روی تابلو فروشگاه بود','مواد مخدر نمیفروخت','مواد مخدر به همراه نداشت','برای خرید مواد مخدر نرفتند']){
  const a=ids(text);assert.ok(!a.includes('business_observation')&&!a.includes('drug_supply'),text+' => '+a.join(','));
 }
});

test('explicit purchase intent remains distinct from completed trade and drug consumption',()=>{
 for(const text of ['برای خرید مواد مخدر گل مراجعه کرده بودند','قصد خرید مواد مخدر را داشتند','مواد مخدر میفروخت','مواد مخدر می‌فروختند','فروش مواد مخدر بود']){const a=prepareAnalysis(localAnalysis(text),text);assert.ok(a.events.includes('drug_supply'),text);assert.ok(!a.events.includes('drug_use'),text)}
 assert.ok(ids('مواد مخدر میفروخت و مصرف مواد رخ نداد').includes('drug_supply'));
 assert.ok(ids('مشروب میفروخت و درگیری نبود').includes('business_observation'));
 assert.ok(!ids('مواد مخدر را دیدم و از فروشگاه گل خریدم').includes('drug_supply'));
});

test('failure of handling does not negate a sale or fight, while an actual denial still does',()=>{
 for(const prefix of ['با 110 تماس گرفتیم. ','به ۱۱۰ زنگ زدیم؛ ','موضوع را به کلانتری اعلام کردیم. ']){
  for(const text of ['فروش ابجو و پیپر رسیدگی نشد','فروش مشروب رسیدگی نشد','نزاع رسیدگی نشد','درگیری لفظی پیگیری نکردند']){
   const a=ids(prefix+text);assert.ok(a.includes('official_complaint'),prefix+text);assert.ok(a.includes(text.includes('فروش')?'business_observation':'assault'),prefix+text);
  }
 }
 for(const text of ['با 110 تماس گرفتیم اما فروش مشروب نبود','با 110 تماس گرفتیم اما نزاع رخ نداد'])assert.ok(!ids(text).includes(text.includes('مشروب')?'business_observation':'assault'),text);
 for(const text of ['با 110 تماس گرفتم','با ۱۱۰ تماس گرفتیم و رسیدگی شد','مأموران آمدند و نزاع تمام شد','به سفارش غذا رسیدگی نشد'])assert.ok(!ids(text).includes('official_complaint'),text);
});

test('unspecified and ended fights are not assumed to cause injury or involve staff',()=>{
 for(const text of ['درگیری شدن','نزاع و درگیری شد','دعوا تموم شد','نزاع تمامم شد','درگیری لفظی رخ داد','درگیری فیزیکی رخ داد'])assert.ok(ids(text).includes('assault'),text);
 for(const text of ['درگیری نبود','درگیری رخ نداد','درگیری ذهنی داشتم'])assert.ok(!ids(text).includes('assault'),text);
 const a=prepareAnalysis(localAnalysis(narrative),narrative);assert.ok(!a.events.includes('pdf_a04'));assert.ok(!a.events.includes('drug_use'));
});

test('incomplete upstream proposals are completed while reviewed/manual choices and refusals survive',()=>{
 for(const events of [[],[{type:'assault',evidence:'نزاع'}],[{type:'drug_supply',evidence:'خرید مواد مخدر'}]])assert.deepEqual(new Set(prepareAnalysis({events,known:{}},narrative).events),new Set(expected));
 assert.deepEqual(prepareAnalysis({events:['assault'],reviewed:true},narrative).events,['assault']);
 assert.deepEqual(prepareAnalysis({events:[],refusal:'رد آزمایشی'},narrative).prefills,[]);
});

test('Worker completes an incomplete mock response for the supermarket example',async()=>{
 const original=globalThis.fetch;let sent;
 try{
  globalThis.fetch=async(_,options)=>{sent=JSON.parse(options.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({events:[{type:'assault',evidence:'نزاع'}],known:{}})}]}]})};
  const response=await worker.fetch(new Request('https://example.invalid/api/analyze',{method:'POST',body:JSON.stringify({text:narrative})}),{OPENAI_API_KEY:'test-only'});
  assert.equal(response.status,200);assert.deepEqual(new Set((await response.json()).events),new Set(expected));
  assert.ok(sent.instructions.includes('Never match فروش inside فروشگاه'));
 }finally{globalThis.fetch=original}
});

test('all 24 orders and three separators preserve four independently reported actions',()=>{
 function* permutations(items){if(!items.length){yield [];return}for(let i=0;i<items.length;i++)for(const rest of permutations(items.filter((_,j)=>j!==i)))yield [items[i],...rest]}
 const phrases=['مشروب میفروخت','برای خرید مواد مخدر گل آمده بودند','نزاع و درگیری شدن','با 110 تماس گرفتیم اما به موضوع رسیدگی نشد'];
 for(const order of permutations(phrases))for(const separator of ['. ','؛ ','\n']){const text=order.join(separator);assert.deepEqual(new Set(ids(text)),new Set(expected),text)}
});
