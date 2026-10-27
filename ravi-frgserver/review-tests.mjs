import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EVENTS,localAnalysis,eventIds} from './public/scenarios.js';
import {questionsFor} from './public/domain.js';
import {prepareAnalysis,applyPrefills,activePrefills,rejectPrefill} from './public/extraction.js';
import {startAnalysisReview,needsAnalysisReview,reviewFrame,editReviewFact,advanceAnalysisReview,completeAnalysisReview,backAnalysisReview,renderAnalysisReview} from './public/analysis-review.js';
import {detailPages,nextDetailPage} from './public/question-flow.js';
import {detailSchema,extraErrors} from './public/details.js';
import {effectiveExtras,answerIsUnknown} from './public/answers.js';
import worker from './worker.js';

const cafe='توی یک کافه در غرب تهران دیدم چند نفر درحال توهین به اسلام و ترویج شیطان پرستی بودن هم زمان درحال کشیدن مواد و فروش ان هم بودن و سپس با مامورین شهرداری دعوا کردن';
let sequence=0;
const row=()=>({_id:'test-review-'+ ++sequence});
function stateFor(text=cafe,raw=localAnalysis(text)){
 const state={text,analysis:prepareAnalysis(raw,text),answers:{},extra:{},qIndex:0,step:0};applyPrefills(state,row);return state;
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const helpers={escape,fa:n=>String(n),icon:()=>'',stepper:()=>''};

test('cafe narrative yields three independent behaviours and no religious or official-misconduct classification',()=>{
 const s=stateFor();assert.deepEqual(new Set(s.analysis.events),new Set(['pdf_a04','drug_use','drug_supply']));
 assert.equal(s.answers.place,'توی یک کافه در غرب تهران');assert.equal(s.extra.place.rows[0].district,'غرب تهران');
 assert.equal(s.answers.details_pdf_a04,'سپس با مامورین شهرداری دعوا کردن');
 assert.match(s.answers.details_drug_supply,/کشیدن مواد و فروش ان/);
 assert.ok(s.analysis.prefills.every(p=>s.text.includes(p.evidence)&&p.evidence.includes(p.value)));
 assert.ok(s.analysis.prefills.every(p=>!/اسلام|شیطان/.test(p.value)));
 assert.equal(s.extra.person,undefined);assert.equal(s.extra.contact,undefined);
 const qs=questionsFor(s.analysis);assert.equal(qs.length,new Set(qs.map(q=>q.id)).size);
 for(const e of s.analysis.events)assert.ok(qs.some(q=>q.id==='details_'+e));
});

test('consumption, supply, denial, ordinary materials and conditional narratives stay distinct',()=>{
 const cases=[
  ['در کافه مصرف مواد دیدم',['drug_use']],
  ['فروش مواد مخدر دیدم',['drug_supply']],
  ['مواد مخدر مصرف نمی‌کردند',[]],
  ['مصرف مواد دیدم ولی فروش مواد مخدر نبود',['drug_use']],
  ['اگر فروش مواد مخدر دیدیم چه کنیم؟',[]],
  ['مصرف مواد غذایی و فروش آن را دیدم',[]],
  ['در یک کارگاه فروش مواد اولیه انجام می‌شد',[]],
  ['فروش شیشه پنجره انجام می‌شد',[]],
  ['کشیدن مواد و فروش آن را دیدم',['drug_use','drug_supply']]
 ];
 for(const [text,want] of cases)assert.deepEqual(localAnalysis(text).events.filter(e=>e.startsWith('drug_')),want,text);
});

test('official involvement, armed fight and title impersonation do not imply separate unobserved offences',()=>{
 const events=text=>localAnalysis(text).events;
 assert.deepEqual(events('با مامورین شهرداری دعوا کردند'),['pdf_a04']);
 // A bribe now has its own topic, which narrows the general complaint; still
 // one incident, one label — not a bribe plus a separate complaint.
 assert.deepEqual(events('کارمند از من رشوه خواست'),['bribery']);
 assert.ok(events('پس از درگیری مسلحانه محل را ترک کردند').includes('pdf_a03'));
 assert.ok(!events('پس از درگیری مسلحانه محل را ترک کردند').includes('shooting'));
 assert.deepEqual(events('فردی با جعل عنوان از من پول خواست'),['pdf_b22']);
 assert.ok(events('درگیری مسلحانه و تیراندازی دیدم').includes('pdf_a03'));
});

test('all new concrete topics have independent question schemas and grounded preview coverage',()=>{
 const cases={home_burglary:'سرقت از منزل ما شد و طلاها را بردند',vehicle_theft:'ضبط ماشینم را دزدیدند',bribery:'کارمند شهرداری برای امضای پرونده رشوه خواست',embezzlement:'مسئول صندوق تعاونی اختلاس کرده است',dereliction:'مأمور کلانتری در رسیدگی به شکایت ترک فعل کرد',corrupt_network:'چند مدیر با هم شبکه‌سازی کرده‌اند',abuse_of_office:'رئیس بانک از موقعیتش سوءاستفاده کرد',drone_sighting:'پهپاد بالای پالایشگاه پرواز می‌کرد',stolen_goods:'اجناس مسروقه در آن مغازه فروخته می‌شود',gambling:'در آن خانه قمار می‌کنند',investment_fraud:'یک طرح هرمی برای جذب سرمایه راه افتاده بود',cyber_attack:'باج‌افزار روی سامانه اجرا شده بود',identity_misuse:'حسابش را اجاره داده بود',dangerous_instruction:'در یک صفحه دستورالعمل ساخت سم منتشر شده بود',drug_use:'مصرف مواد دیدم',drug_supply:'فروش مواد مخدر دیدم',resource_extraction:'برداشت شن از رودخانه دیدم',financial_complaint:'برداشت بدون اجازه از حساب دیدم',property_dispute:'اختلاف ملکی رخ داد',family_dispute:'اختلاف خانوادگی رخ داد',medical_care:'شکایت از بیمارستان دارم',traffic_violation:'عبور از چراغ قرمز دیدم',passenger_complaint:'شکایت مسافر از خدمات بود',workplace_accident:'سقوط از داربست دیدم',self_harm:'نگران آسیب به خود است',fireworks:'مواد محترقه در محل دیدم',sexual_violence:'آزار جنسی گزارش شده است',online_harm:'در تلگرام فراخوان برای حمله به افراد دیدم',public_nuisance:'مزاحمت صوتی ایجاد شده بود'};
 for(const [event,text] of Object.entries(cases)){
  const a=localAnalysis(text);assert.ok(a.events.includes(event),event);assert.ok(text.includes(a.eventEvidence[event]),event);
  const q=questionsFor(a).find(q=>q.id==='details_'+event);assert.ok(q?.title&&q.hint,event);
  assert.ok(detailSchema(q.id,event).fields.length>=3,event);
 }
 assert.equal(Object.keys(EVENTS).length,78);
});

test('belief, peaceful expression, foreign status and broad security labels only request concrete clarification',()=>{
 for(const text of ['توهین به اسلام و ترویج شیطان پرستی می‌کردند','چند تبعه بیگانه و دیپلمات در مرز دیدم','فراخوان تجمع مسالمت آمیز در تلگرام منتشر شد','یک نفر جاسوسی می‌کرد','موضوع امور امنیتی و غیرمجاز است']){
  const s=stateFor(text);assert.deepEqual(s.analysis.events,['other'],text);assert.deepEqual(questionsFor(s.analysis).map(q=>q.id),['clarify']);assert.equal(s.analysis.prefills.length,0);
 }
});

test('initial review blocks questionnaire until every small review page is accepted',()=>{
 const s=stateFor();startAnalysisReview(s);
 assert.equal(s.step,1);assert.equal(needsAnalysisReview(s),true);assert.equal(reviewFrame(s).entries.length,3);
 assert.equal(advanceAnalysisReview(s),false);assert.equal(needsAnalysisReview(s),true);assert.equal(s.qIndex,0);
 assert.equal(advanceAnalysisReview(s),true);assert.equal(needsAnalysisReview(s),false);assert.equal(s.qIndex,0);
 assert.ok(activePrefills(s).every(p=>p.status==='confirmed'));
});

test('review edits and deletions survive draft restore and analysis of unchanged text',()=>{
 const s=stateFor();startAnalysisReview(s);
 const district=s.prefillAudit.findIndex(p=>p.field==='district'),building=s.prefillAudit.findIndex(p=>p.field==='building');
 assert.equal(editReviewFact(s,district,'غرب شهر تهران، محدودهٔ دقیق را نمی‌دانم'),'');rejectPrefill(s,building);
 advanceAnalysisReview(s);
 const restored=structuredClone(s);restored.analysis=prepareAnalysis(localAnalysis(restored.text),restored.text);applyPrefills(restored,row);
 assert.equal(reviewFrame(restored).page,1);assert.equal(needsAnalysisReview(restored),true);
 assert.equal(restored.extra.place.rows[0].district,'غرب شهر تهران، محدودهٔ دقیق را نمی‌دانم');assert.equal(restored.extra.place.rows[0].building,undefined);
 advanceAnalysisReview(restored);assert.equal(needsAnalysisReview(restored),false);
 assert.equal(activePrefills(restored).find(p=>p.field==='district').editedValue,'غرب شهر تهران، محدودهٔ دقیق را نمی‌دانم');
 assert.equal(activePrefills(restored).some(p=>p.field==='building'),false);
});

test('deleting every fact on the current page does not skip the next unreviewed facts',()=>{
 const s=stateFor();startAnalysisReview(s);const indices=reviewFrame(s).entries.map(p=>p.index);
 indices.forEach(i=>rejectPrefill(s,i));assert.equal(reviewFrame(s).page,0);assert.ok(reviewFrame(s).entries.every(p=>p.unavailable));
 assert.equal(advanceAnalysisReview(s),false);assert.equal(reviewFrame(s).entries.length,3);assert.equal(needsAnalysisReview(s),true);
});

test('unknown location disables its nested facts in initial review and numeric edits obey postcode constraints',()=>{
 const text='در مغازه سرقت رخ داد. کدپستی ۱۲۳۴۵۶۷۸۹۰ بود';
 const s=stateFor(text,{...localAnalysis(text),prefills:[{section:'place',rowKey:'first',field:'postal',value:'۱۲۳۴۵۶۷۸۹۰',evidence:'کدپستی ۱۲۳۴۵۶۷۸۹۰ بود'}]});
 startAnalysisReview(s);const postal=s.prefillAudit.findIndex(p=>p.field==='postal');
 assert.match(editReviewFact(s,postal,'۱۲۳'),/۱۰|10/);assert.equal(s.extra.place.rows[0].postal,'1234567890');
 assert.equal(editReviewFact(s,postal,'۰۱۲۳۴۵۶۷۸۹'),'');assert.equal(s.extra.place.rows[0].postal,'0123456789');
 const answer=s.prefillAudit.findIndex(p=>p.section==='place'&&p.field==='answer');assert.equal(editReviewFact(s,answer,'مکان را نمی‌دانم'),'');
 assert.equal(s.extra.place.enabled,false);assert.equal(activePrefills(s,'place').length,0);assert.ok(reviewFrame(s).entries.find(p=>p.index===postal).unavailable);
});

test('changed narrative or changed topics invalidates previous approval; no-fact analyses still review topics',()=>{
 const s=stateFor();startAnalysisReview(s);while(!advanceAnalysisReview(s)){}
 s.text+=' ساعت ۱۰ بود';assert.equal(needsAnalysisReview(s),true);assert.equal(reviewFrame(s).page,0);
 while(!advanceAnalysisReview(s)){}s.analysis.events=['assault'];assert.equal(needsAnalysisReview(s),true);
 const none=stateFor('متوجه شدم یک نفر مشکوک است');startAnalysisReview(none);assert.equal(reviewFrame(none).empty,true);
 assert.equal(advanceAnalysisReview(none),true);assert.deepEqual(questionsFor(none.analysis).map(q=>q.id),['clarify']);
});

test('rendered review limits visible facts, escapes narrative and offers edits before follow-up questions',()=>{
 const s=stateFor(cafe+' <img src=x onerror=alert(1)>');startAnalysisReview(s);
 const html=renderAnalysisReview(s,helpers);assert.equal((html.match(/<article class="review-fact /g)||[]).length,3);
 assert.equal((html.match(/data-review-edit=/g)||[]).length,3);assert.equal((html.match(/data-reject-prefill=/g)||[]).length,3);
 assert.ok(html.includes('data-action="correct-event"'));assert.ok(!html.includes('id="answer"'));assert.ok(!html.includes('<img src=x'));
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<details open'));assert.ok(html.includes('تأیید این بخش و ادامه'));
 advanceAnalysisReview(s);
 const last=renderAnalysisReview(s,helpers);
 // The choice between a general and a detailed report is asked once, on its
 // own page right after the description — not repeated here.
 assert.ok(last.includes('تکمیل جزئیات'));
 assert.equal(last.includes('همین کافی است'),false);
});

test('a brief report skips the questionnaire and keeps the account it was given',()=>{
 const s=stateFor();startAnalysisReview(s);while(reviewFrame(s).page+1<reviewFrame(s).total)advanceAnalysisReview(s);
 completeAnalysisReview(s,{brief:true});
 assert.equal(s.brief,true);
 assert.equal(s.step,2);                 // straight to documents
 assert.equal(s.analysisReview.complete,true);
 assert.equal(needsAnalysisReview(s),false);
 // The detailed route is unchanged.
 const d=stateFor();startAnalysisReview(d);while(reviewFrame(d).page+1<reviewFrame(d).total)advanceAnalysisReview(d);
 completeAnalysisReview(d);
 assert.equal(d.brief,false);
 assert.equal(d.step,1);
});

test('review back navigation preserves edits and returns to description only from first page',()=>{
 const s=stateFor();startAnalysisReview(s);advanceAnalysisReview(s);backAnalysisReview(s);assert.equal(s.analysisReview.page,0);assert.equal(s.step,1);
 backAnalysisReview(s);assert.equal(s.step,0);assert.equal(needsAnalysisReview(s),true);
});

const appSource=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
test('both actual analysis entry paths initialize the confirmation gate, including after prior approval',async()=>{
 const fn=appSource.slice(appSource.indexOf('async function analyze('),appSource.indexOf('async function addFiles('));
 const preview=appSource.match(/'analysis-preview':(async\(\)=>\{.*?\}),record:startRecording/s)[1];
 for(const mode of ['preview','analyze']){
  const state=stateFor();startAnalysisReview(state);while(!advanceAnalysisReview(state)){}
  const saved=[];
  const run=new Function('deps',`const {state,config,api,localAnalysis,acceptAnalysis,startAnalysisReview,persist,render,stopVoice}=deps;let transcriptReviewed=false,errors='';${fn};return ${mode==='preview'?preview:'analyze'};`)({state,config:{ai:false,loaded:true},localAnalysis,acceptAnalysis:raw=>{state.analysis=prepareAnalysis(raw,state.text);applyPrefills(state,row)},startAnalysisReview,persist:async()=>saved.push(structuredClone(state)),render:()=>{},stopVoice:()=>{}});
  await run();assert.ok(needsAnalysisReview(state),mode);assert.equal(state.analysisReview.page,0);assert.equal(saved.at(-1).analysisReview.complete,false);
 }
});

test('actual questionnaire entry skips re-asking confirmed main answers and respects unknown locations',()=>{
 const fn=appSource.slice(appSource.indexOf('function prepareQuestionAfterReview(){'),appSource.indexOf('function questionPage(){'));
 const s=stateFor();startAnalysisReview(s);const place=s.prefillAudit.findIndex(p=>p.section==='place'&&p.field==='answer');editReviewFact(s,place,'مکان را نمی‌دانم');while(!advanceAnalysisReview(s)){}
 const qs=questionsFor(s.analysis),run=new Function('deps',`const {state,currentQuestions,activePrefills,answerIsUnknown,currentExtra,extraErrors,nextDetailPage,flowPages}=deps;${fn};return prepareQuestionAfterReview;`)({state:s,currentQuestions:()=>qs,activePrefills,answerIsUnknown,currentExtra:()=>effectiveExtras(s),extraErrors,nextDetailPage,flowPages:(q,row)=>detailPages(q.id,row,s.analysis.event,{analysis:s.analysis,extra:effectiveExtras(s)})});
 s.qIndex=qs.findIndex(q=>q.id==='place');run();assert.notEqual(qs[s.qIndex]?.id,'place');
 s.qIndex=qs.findIndex(q=>q.id==='details_drug_supply');s.flow=null;run();assert.equal(s.flow.phase,'gate');assert.equal(s.flow.section,'details_drug_supply');
});

test('API contract includes expanded enums, multi-action guidance and user review without calling upstream',async()=>{
 const original=globalThis.fetch;let request;
 try{
  globalThis.fetch=async(_,init)=>{request=JSON.parse(init.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({events:[{type:'drug_use',evidence:'کشیدن مواد'},{type:'drug_supply',evidence:'کشیدن مواد و فروش ان'},{type:'assault',evidence:'دعوا کردن'}],known:{time:'',place:'توی یک کافه در غرب تهران',source:''},refusal:''})}]}]})};
  const response=await worker.fetch(new Request('https://test.invalid/api/analyze',{method:'POST',body:JSON.stringify({text:cafe})}),{OPENAI_API_KEY:'test-only'});
  assert.equal(response.status,200);assert.deepEqual(new Set((await response.json()).events),new Set(['drug_use','drug_supply','pdf_a04']));
  assert.deepEqual(new Set(request.text.format.schema.properties.events.items.properties.type.enum),new Set(Object.keys(EVENTS)));
  assert.match(request.instructions,/BEFORE the follow-up questionnaire/);assert.match(request.instructions,/Official presence in a fight does not imply official_complaint/);assert.match(request.instructions,/omit those as classification criteria/);
 }finally{globalThis.fetch=original}
});

test('staff conflict needs a reported relation, preserves denials and leaves injury unknown',()=>{
 for(const text of ['با مامورین شهرداری دعوا کردند','حمله به مأمور رخ داد','با کارکنان آتش‌نشانی دعوای لفظی کردند','درگیری لفظی با کارمندان شهرداری رخ داد','با مامورین شهرداری دعوا کردند و جراحتی نبود','با مامورین شهرداری دعوا کردند، کسی مجروح نشده بود']){
  const a=prepareAnalysis(localAnalysis(text),text);
  assert.ok(a.events.includes('pdf_a04'),text);assert.ok(!a.events.includes('assault'),text);
  assert.ok(!a.prefills.some(p=>p.field==='injury'||p.field==='damage'),text);
 }
 for(const text of ['مأموران شهرداری در کافه حضور داشتند','در کافه دعوا شد و مأموران شهرداری آنجا بودند','با مامورین درباره دعوا صحبت کردم','دعوا را به مأمورین شهرداری گزارش کردم','با مأموران شهرداری درگیری نداشتند','با مأمورین شهرداری دعوا نکردند','اگر با مامورین شهرداری دعوا کنند چه می‌شود؟','این حمله به ماموریت شرکت آسیب زد'])assert.ok(!localAnalysis(text).events.includes('pdf_a04'),text);
});

test('separate civilian and staff conflicts keep separate source excerpts',()=>{
 const text='اول یک نفر را کتک زدند؛ سپس با مامورین شهرداری دعوا کردند';
 const a=prepareAnalysis(localAnalysis(text),text);
 assert.deepEqual(new Set(a.events),new Set(['assault','pdf_a04']));
 assert.equal(a.prefills.find(p=>p.section==='details_assault'&&p.field==='answer')?.value,'اول یک نفر را کتک زدند؛');
 assert.equal(a.prefills.find(p=>p.section==='details_pdf_a04'&&p.field==='answer')?.value,'سپس با مامورین شهرداری دعوا کردند');
 const denied='با مأمورین شهرداری دعوا نکردند؛ بعد یک نفر را کتک زدند';
 const b=prepareAnalysis(localAnalysis(denied),denied);
 assert.deepEqual(b.events,['assault']);
 assert.equal(b.prefills.find(p=>p.section==='details_assault'&&p.field==='answer')?.value,'بعد یک نفر را کتک زدند');
});

test('AI generic conflict is refined with grounded fields while manual choices and separate episodes survive',()=>{
 const evidence='با مامورین شهرداری دعوا کردند',text='شنیدم '+evidence;
 const raw={events:[{type:'assault',evidence:'دعوا'}],known:{},prefills:[{section:'details_assault',field:'answer',value:text,evidence:text}],episodes:[{event:'assault',evidence:text}]};
 const a=prepareAnalysis(raw,text);
 assert.deepEqual(a.events,['pdf_a04']);
 assert.equal(a.prefills[0].section,'details_pdf_a04');assert.equal(a.prefills[0].value,text);
 assert.equal(a.episodes[0].event,'pdf_a04');assert.equal(raw.prefills[0].section,'details_assault');
 assert.deepEqual(prepareAnalysis({events:['assault'],known:{}},text).events,['assault']);
 const both='اول یک نفر را کتک زدند؛ سپس '+evidence;
 const b=prepareAnalysis({...raw,prefills:[],episodes:[]},both);
 assert.deepEqual(new Set(b.events),new Set(['assault','pdf_a04']));
 assert.equal(b.eventEvidence.assault,'کتک');
});
