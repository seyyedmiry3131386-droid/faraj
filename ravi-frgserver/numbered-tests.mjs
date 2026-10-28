import test from 'node:test';
import assert from 'node:assert/strict';
import {NUMBERED_TOPICS,NUMBERED_RULES,sourceReference} from './public/numbered-topics.js';
import {EVENTS,localAnalysis,normalizeAnalysis} from './public/scenarios.js';
import {questionsFor} from './public/domain.js';
import {detailSchema} from './public/details.js';
import {prepareAnalysis,applyPrefills} from './public/extraction.js';
import {startAnalysisReview,advanceAnalysisReview,needsAnalysisReview,renderAnalysisReview} from './public/analysis-review.js';
import {topicChoices,topicMatches,topicEntries} from './public/topic-view.js';
import worker from './worker.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const helpers={escape,fa:String,icon:()=>'',stepper:()=>''};
test('eligible PDF paragraphs retain independent IDs, original numbering, pages and concise unique labels',()=>{
 const a=[2,3,4,5,9,10,13,14,15,16,17],b=[8,11,15,16,17,20,22,23,24,25,26,27];
 assert.equal(Object.keys(NUMBERED_TOPICS).length,23);
 for(const [part,numbers] of [['الف',a],['ب',b]])assert.deepEqual(Object.values(NUMBERED_TOPICS).filter(t=>t.source.part===part).map(t=>t.source.number),numbers);
 assert.equal(new Set(Object.values(NUMBERED_TOPICS).map(t=>t.title)).size,23);
 for(const [id,topic] of Object.entries(NUMBERED_TOPICS)){
  assert.ok(topic.title.length<=42,topic.title);assert.ok(topic.source.original.length>70,id);assert.ok(topic.source.original.length>topic.title.length,id);
  assert.ok([1,2,3].includes(topic.source.page));assert.ok(sourceReference(topic).includes(topic.source.number.toLocaleString('fa-IR')));
  assert.equal(EVENTS[id].source,topic.source);assert.ok(topic.fields.length>=3,id);
 }
 for(const n of [15,16,17])assert.notEqual(NUMBERED_TOPICS['pdf_a'+n].title,NUMBERED_TOPICS['pdf_b'+n].title);
});

test('each independent paragraph generates its own detail question and schema while shared questions stay deduplicated',()=>{
 const events=Object.keys(NUMBERED_TOPICS),a=normalizeAnalysis({events},''),qs=questionsFor(a);
 for(const event of events){const q=qs.find(q=>q.id==='details_'+event);assert.ok(q,event);assert.equal(q.source.number,NUMBERED_TOPICS[event].source.number);assert.deepEqual(detailSchema(q.id,event).fields,NUMBERED_TOPICS[event].fields.map(f=>({...f,label:f.label.replace(/\u0654/g,'').replace(/ۀ/g,'ه')})))}
 for(const id of ['person','place','time','object','source'])assert.equal(qs.filter(q=>q.id===id).length,1,id);
 // Vehicle and contact are asked only when the incident involves one; never twice.
 for(const id of ['vehicle','contact'])assert.ok(qs.filter(q=>q.id===id).length<=1,id);
});

test('numbered topics classify independently with verbatim evidence, including matching numbers across parts',()=>{
 const cases={pdf_a02:'مسدود شدن خیابان را دیدم',pdf_a03:'درگیری مسلحانه رخ داد',pdf_a04:'حمله به مأمور باعث مصدومیت شد',pdf_a05:'انفجار در نیروگاه رخ داد',pdf_a09:'سرقت مسلحانه رخ داد',pdf_a10:'احتکار کلان دارو باعث کمبود شده است',pdf_a13:'بمب گذاری گزارش شد',pdf_a14:'آدم ربایی رخ داد',pdf_a15:'خشونت خانگی را گزارش می‌کنم',pdf_a16:'تهدید به قتل شنیدم',pdf_a17:'ورود اجباری به منزل همراه تهدید بود',pdf_b08:'تبعیض در توزیع یارانه رخ داد',pdf_b11:'افزایش قیمت دارو را دیدم',pdf_b15:'اخاذی در محله هر روز تکرار شده است',pdf_b16:'سرقت خودرو بدون سلاح رخ داد',pdf_b17:'احتکار صنفی دارو گزارش شده است',pdf_b20:'قاچاق کلان کالا گزارش شد',pdf_b22:'با جعل عنوان پول گرفتند',pdf_b23:'کلاهبرداری در اجاره رخ داد',pdf_b24:'جعل اسناد هویتی گزارش شد',pdf_b25:'تعقیب و مزاحمت تکراری رخ داد',pdf_b26:'اجبار کودک به سرقت را دیدم',pdf_b27:'تهدید به انتشار تصاویر خصوصی دریافت کردم'};
 assert.equal(NUMBERED_RULES.length,Object.keys(cases).length);
 for(const [id,text] of Object.entries(cases)){const a=localAnalysis(text);assert.ok(a.events.includes(id),id+' '+a.events);assert.ok(text.includes(a.eventEvidence[id]),id)}
});

test('numbered specificity never fabricates weapon absence, hoarding, violence against staff or political wrongdoing',()=>{
 for(const text of ['انبار بزرگی پر از دارو دیدم','قیمت دارو ثابت بود','مأموران شهرداری در کافه حضور داشتند','جلسه انتقادی در منزل برگزار کردند','خودرو را به سرقت بردند','ارز و طلا خرید و فروش شد'])assert.equal(localAnalysis(text).events.some(id=>id.startsWith('pdf_')),false,text);
 assert.ok(localAnalysis('سرقت خودرو با اسلحه رخ داد').events.includes('pdf_a09'));
 assert.ok(!localAnalysis('سرقت خودرو با اسلحه رخ داد').events.includes('pdf_b16'));
 assert.ok(!localAnalysis('اگر سرقت مسلحانه رخ داد چه کنیم؟').events.includes('pdf_a09'));
 assert.ok(!localAnalysis('درگیری مسلحانه رخ نداد').events.includes('pdf_a03'));
});

test('generic duplicate is removed only for the same occurrence; separate events and old drafts retain their IDs',()=>{
 assert.deepEqual(localAnalysis('سرقت مسلحانه رخ داد').events,['pdf_a09']);
 const mixed=localAnalysis('سرقت مسلحانه رخ داد؛ بعداً سرقت کیف را در جای دیگری دیدم');assert.ok(mixed.events.includes('pdf_a09'));assert.ok(mixed.events.includes('theft'));
 const old=normalizeAnalysis({events:['theft'],known:{},reviewed:true},'سرقت مسلحانه');assert.deepEqual(old.events,['theft']);
 const multi=localAnalysis('تهدید به قتل شنیدم؛ در محل دیگری سرقت خودرو بدون سلاح رخ داد');assert.ok(multi.events.includes('pdf_a16'));assert.ok(multi.events.includes('pdf_b16'));
});

test('separate scales of alleged hoarding and weapon contexts are never merged into one source number',()=>{
 assert.ok(localAnalysis('احتکار کلان دارو همراه کمبود بود').events.includes('pdf_a10'));
 assert.ok(!localAnalysis('احتکار کلان دارو همراه کمبود بود').events.includes('pdf_b17'));
 assert.ok(localAnalysis('احتکار صنفی گزارش شد').events.includes('pdf_b17'));
 assert.ok(!localAnalysis('احتکار صنفی گزارش شد').events.includes('pdf_a10'));
});

test('generic and numbered theft episodes prefill their own clauses rather than repeating the first incident',()=>{
 const text='سرقت مسلحانه رخ داد؛ بعداً سرقت کیف را در جای دیگری دیدم';
 const a=prepareAnalysis(localAnalysis(text),text);
 assert.equal(a.prefills.find(p=>p.section==='details_pdf_a09'&&p.field==='answer').value,'سرقت مسلحانه رخ داد؛');
 assert.equal(a.prefills.find(p=>p.section==='details_theft'&&p.field==='answer').value,'بعداً سرقت کیف را در جای دیگری دیدم');
});

test('topic search accepts Persian/Arabic/Latin numbering and full wording without duplicating checkbox IDs',()=>{
 const html=topicChoices({events:['pdf_a09','pdf_b16']},escape);
 assert.equal((html.match(/data-topic="pdf_a09"/g)||[]).length,1);assert.equal((html.match(/data-topic="pdf_b16"/g)||[]).length,1);
 assert.ok(html.includes('data-topic="pdf_a09" checked'));assert.ok(!html.includes('شرح کامل بند'));assert.ok(!html.includes('موضوع‌های شماره‌دار سند'));assert.ok(!html.includes('سایر موضوع‌های بانک'));
 const ids=[...html.matchAll(/data-topic="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,Object.keys(EVENTS).length);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(ids,topicEntries().map(([id])=>id));assert.ok(!html.includes('data-topic-group'));
 assert.deepEqual(topicEntries().map(([,e])=>e.title),Object.values(EVENTS).map(e=>e.title).sort((a,b)=>a.localeCompare(b,'fa')));
 const t=NUMBERED_TOPICS.pdf_a09,search=t.title+' '+sourceReference(t)+' '+t.source.original;
 for(const query of ['الف ۹','الف 9','الف ٩','طلافروشی'])assert.ok(topicMatches(search,query),query);
 assert.equal(topicMatches(search,'ب ۹'),false);assert.ok(!html.includes('<details open'));
 assert.ok(!html.includes('class="topic-source"'));
});

test('numbered-topic proposals require confirmation without showing document references',()=>{
 const text='در کافه تهدید به قتل شنیدم';let id=0;const state={text,analysis:prepareAnalysis(localAnalysis(text),text),answers:{},extra:{}};applyPrefills(state,()=>({_id:'numbered-'+ ++id}));startAnalysisReview(state);
 assert.ok(needsAnalysisReview(state));const html=renderAnalysisReview(state,helpers);assert.ok(!html.includes('بند الف–۱۶'));assert.ok(!html.includes(escape(NUMBERED_TOPICS.pdf_a16.source.original)));assert.ok(html.includes(escape(NUMBERED_TOPICS.pdf_a16.title)));assert.ok(!html.includes('id="answer"'));
 while(!advanceAnalysisReview(state)){}assert.equal(needsAnalysisReview(state),false);assert.ok(state.answers.details_pdf_a16.includes('تهدید به قتل'));
});

test('excluded surveillance paragraphs do not enter API taxonomy or create contact questions',async()=>{
 const excluded=['pdf_a01','pdf_a06','pdf_a07','pdf_a08','pdf_a11','pdf_a12','pdf_b01','pdf_b02','pdf_b03','pdf_b04','pdf_b05','pdf_b06','pdf_b07','pdf_b09','pdf_b10','pdf_b12','pdf_b13','pdf_b14','pdf_b18','pdf_b19','pdf_b21'];
 for(const id of excluded)assert.equal(Object.hasOwn(EVENTS,id),false,id);
 for(const text of ['تجمع مسالمت آمیز بازنشستگان برگزار شد','مسدود شدن خیابان به دلیل تجمع مسالمت آمیز بود','نیروهای نظامی از محل عبور کردند','جلسه مذهبی غیررسمی در منزل بود','چند تبعه خارجی در محله زندگی می‌کنند'])assert.deepEqual(questionsFor(localAnalysis(text)).map(q=>q.id),['clarify']);
 const original=globalThis.fetch;let request;
 try{globalThis.fetch=async(_,options)=>{request=JSON.parse(options.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({events:[{type:'pdf_a09',evidence:'سرقت مسلحانه'}],known:{time:'',place:'',source:''}})}]}]})};
 const response=await worker.fetch(new Request('https://example.invalid/api/analyze',{method:'POST',body:JSON.stringify({text:'سرقت مسلحانه رخ داده است'})}),{OPENAI_API_KEY:'test-only'});
 assert.equal(response.status,200);assert.deepEqual((await response.json()).events,['pdf_a09']);assert.match(request.instructions,/Never merge two distinct numbered paragraphs/);
 const ids=request.text.format.schema.properties.events.items.properties.type.enum;assert.ok(ids.includes('pdf_a09'));for(const id of excluded)assert.ok(!ids.includes(id));
 }finally{globalThis.fetch=original}
});
