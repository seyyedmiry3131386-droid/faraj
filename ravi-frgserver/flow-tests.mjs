import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {detailPages,pageComplete,pageHasInput,nextDetailPage,pageErrors,firstInvalidPage,sectionHasDetails,isHearsay} from './public/question-flow.js';
import {renderFlow} from './public/flow-view.js';
import {EVENTS,localAnalysis} from './public/scenarios.js';
import {questionsFor} from './public/domain.js';
import {detailSchema,extraErrors,YES,NO,entityGraph} from './public/details.js';
import {questionAnswered} from './public/question-bank.js';
import {effectiveExtras,answerIsUnknown,setAnswer} from './public/answers.js';
import {confirmPrefills,prepareAnalysis,applyPrefills,applyTopicAssignments} from './public/extraction.js';
import {PHONE_TYPES} from './public/contacts.js';

const context={analysis:{events:['assault','theft'],event:'assault'},extra:{person:{enabled:true,rows:[{_id:'a',label:'فرد آزمایشی'}]},place:{enabled:true,rows:[{_id:'p',label:'مکان آزمایشی'}]}}};
test('every ordinary detail step has at most three fields and no classification or repeated source questions',()=>{
 const variants={contact:[{}, {kind:'تلفن'},...[0,1,2].map(i=>({kind:'تلفن',phoneType:PHONE_TYPES[i],phoneCompleteness:'فقط بخشی از شماره'})),{kind:'شبکهٔ اجتماعی یا پیام‌رسان',platform:'سایر'},{kind:'ایمیل'},{kind:'وب‌سایت'}],vehicle:[{},{kind:'خودرو',plateStatus:'کامل دیدم'},{kind:'دوچرخه'}]};
 for(const section of ['person','place','object','vehicle','contact','time','source',...Object.keys(EVENTS).map(e=>'details_'+e)])for(const row of variants[section]||[{}]){
  for(const p of detailPages(section,row,'assault',context)){
   assert.ok(p.fields.length<=3,section+': '+p.id);
   assert.ok(p.fields.every(f=>!['eventRef','personRef','placeRef','role','basis','subtype','certainty','placeType'].includes(f.id)),section);
   assert.ok(p.fields.every(f=>f.id!=='label'||section==='object'));
  }
 }
});
test('contact branches show only the chosen channel and preserve the landline input format',()=>{
 const empty=detailPages('contact',{},'fraud');assert.deepEqual(empty.map(p=>p.id),['kind','context']);
 const row={kind:'تلفن',phoneType:PHONE_TYPES[0],phoneCompleteness:'شماره کامل'};
 const pages=detailPages('contact',row,'fraud');assert.ok(!pages.some(p=>['social','web','email'].includes(p.id)));
 assert.deepEqual(pages.find(p=>p.id==='phone').fields.map(f=>f.id),['province','subscriber']);
 const bad={...row,province:'تهران',subscriber:'123'};assert.ok(pageErrors('contact',bad,'fraud',pages.find(p=>p.id==='phone')).length);
 assert.equal(pageErrors('contact',bad,'fraud',pages.find(p=>p.id==='phone-kind')).length,0);
 assert.equal(firstInvalidPage('contact',bad,'fraud').id,'phone');
});
test('plate editing is its own step and vanishes for unseen plates and bicycles',()=>{
 assert.equal(detailPages('vehicle',{kind:'خودرو',plateStatus:'پلاک را ندیدم'},'theft').some(p=>p.plate),false);
 assert.equal(detailPages('vehicle',{kind:'دوچرخه',plateStatus:'کامل دیدم'},'theft').some(p=>p.id==='plate'||p.plate),false);
 const row={kind:'خودرو',plateStatus:'کامل دیدم'};const pages=detailPages('vehicle',row,'theft');const plate=pages.find(p=>p.plate);
 assert.ok(plate);assert.ok(pageErrors('vehicle',row,'theft',plate).length);assert.equal(pageErrors('vehicle',row,'theft',pages[0]).length,0);
});
test('already filled steps are skipped on forward navigation but available for editing',()=>{
 const row={age:'حدود ۳۰ سال',height:'حدود ۱۷۰',build:'متوسط',notes:'به سمت خروجی رفت',movement:'خروجی'};
 const pages=detailPages('person',row,'assault');assert.equal(pageComplete(pages[0],row),true);assert.equal(pageComplete(pages[1],row),true);
 assert.equal(pages[nextDetailPage(pages,row)].id,'recognition');assert.equal(nextDetailPage(pages,row,-1,true),0);
});
test('legacy required detail values remain readable while technical fields are not asked',()=>{
 const row={label:'فرد اول',role:'شاهد',basis:'خودم مشاهده کردم',eventRef:'assault',age:'۳۰',placeRef:'p'};
 const pages=detailPages('person',row,'assault',context);assert.ok(pages.flatMap(p=>p.fields).some(f=>f.id==='age'));assert.ok(!pages.flatMap(p=>p.fields).some(f=>['eventRef','placeRef','role','label','basis'].includes(f.id)));
 assert.ok(sectionHasDetails('person',{enabled:true,rows:[row]},'assault'));
});

// Exercise the application's actual navigation functions without a browser.
// Rendering/storage/focus are side effects; all question, validation and state logic is real.
const appSource=await readFile('./public/app.js','utf8');
const navigation=appSource.slice(appSource.indexOf('function flowState(q)'),appSource.indexOf('function questionPage()'));
let rowSequence=0;
function harness(section='person',existing){
 const state=existing||{analysis:localAnalysis('دیدم یک فرد کیف را به سرقت برد'),answers:{},extra:{},step:1,busy:false,confirmed:false};
 state.qIndex=questionsFor(state.analysis).findIndex(q=>q.id===section);
 const snapshots=[];
 const deps={state,detailPages,pageComplete,pageHasInput,nextDetailPage,pageErrors,firstInvalidPage,sectionHasDetails,isHearsay,detailSchema,extraErrors,answerIsUnknown,setAnswer,YES,NO,questionAnswered,confirmPrefills,
 currentQuestions:()=>questionsFor(state.analysis),currentExtra:()=>effectiveExtras(state.extra,state.answers),newRow:()=>({_id:'row-'+(++rowSequence)}),persist:()=>snapshots.push(JSON.parse(JSON.stringify(state))),render:()=>{},focusQuestion:()=>{},finishClarification:()=>{state.clarified=true}};
 const methods=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;let errors='',questionHelp=false;${navigation};return {flowFrame,answerChoice,beginDetails,backQuestion,nextQuestion,finishFlowSection,skipFlowSection,addFlowRow,markSectionUnknown,getError:()=>errors};`)(deps);
 return {state,snapshots,...methods};
}
test('yes goes directly into the first small step; back restores it and saves draft progress',async()=>{
 const h=harness();h.answerChoice(YES);assert.equal(h.state.flow.phase,'fields');assert.equal(h.state.flow.page,'observation');
 h.state.extra.person.rows[0].notes='فرد نمونه به سمت در رفت';await h.nextQuestion();assert.equal(h.state.flow.page,'appearance');
 h.backQuestion();assert.equal(h.state.flow.page,'observation');assert.equal(h.state.extra.person.rows[0].notes,'فرد نمونه به سمت در رفت');assert.equal(h.snapshots.at(-1).flow.page,'observation');
});
test('unknown skips the details immediately and keeps old detail values disabled',()=>{
 const h=harness();h.state.extra.person={enabled:false,rows:[{_id:'old',age:'۳۰'}]};const index=h.state.qIndex;h.answerChoice(NO);
 assert.equal(h.state.qIndex,index+1);assert.equal(h.state.answers.person,NO);assert.equal(h.state.extra.person.enabled,false);
});
test('keeping known details is different from declaring the entire section unknown',()=>{
 const h=harness();h.state.extra.person={enabled:true,rows:[{_id:'known',age:'حدود ۳۰ سال'}]};const index=h.state.qIndex;h.answerChoice(NO);
 assert.equal(h.state.qIndex,index+1);assert.equal(h.state.extra.person.enabled,true);assert.notEqual(h.state.answers.person,NO);
});
test('an address uses one main answer, an optional gate, then small detail steps',async()=>{
 const h=harness('place');setAnswer(h.state,'place','محلهٔ نمونه');await h.nextQuestion();assert.equal(h.state.flow.phase,'gate');
 h.beginDetails();assert.equal(h.state.flow.page,'area');h.state.extra.place.rows[0].district='محلهٔ نمونه';await h.nextQuestion();assert.equal(h.state.flow.page,'address');
 h.finishFlowSection();assert.equal(h.state.flow,null);assert.equal(h.state.answers.place,'محلهٔ نمونه');
});
test('a partial postcode blocks only its own step and finish returns to the invalid field',async()=>{
 const h=harness('place');setAnswer(h.state,'place','نشانی نمونه');h.beginDetails();h.state.extra.place.rows[0].postal='۱۲۳';h.state.extra.place.rows[0].district='محله';
 await h.nextQuestion();assert.equal(h.state.flow.page,'address');assert.equal(h.getError(),'');
 h.finishFlowSection();assert.equal(h.state.flow.page,'inside');assert.match(h.getError(),/۱۰|10/);
});
test('adding another person does not display or merge the previous person fields',()=>{
 const h=harness();h.answerChoice(YES);h.state.extra.person.rows[0].age='حدود ۳۰';h.addFlowRow();
 assert.equal(h.state.flow.row,1);assert.equal(h.state.extra.person.rows.length,2);assert.equal(h.state.extra.person.rows[1].age,undefined);assert.notEqual(h.state.extra.person.rows[0]._id,h.state.extra.person.rows[1]._id);
});
test('restoring a saved detail step preserves its page and entered values',async()=>{
 const h=harness();h.answerChoice(YES);h.state.extra.person.rows[0].notes='رفتار ثبت شده';await h.nextQuestion();h.state.extra.person.rows[0].age='حدود ۴۰';
 const clone=JSON.parse(JSON.stringify(h.state)),restored=harness('person',clone);
 assert.equal(restored.flowFrame(questionsFor(clone.analysis)[clone.qIndex]).page.id,'appearance');assert.equal(clone.extra.person.rows[0].age,'حدود ۴۰');
});
const htmlHelpers={escape:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fa:n=>String(n),icon:()=>'<svg></svg>',stepper:()=>'<div>مراحل</div>'};
test('rendered person screen contains only the current fields and the narrative is collapsed',()=>{
 const a=localAnalysis('دیدم یک فرد کیف را به سرقت برد'),q=questionsFor(a).find(q=>q.id==='person'),schema=detailSchema('person',a.event),row={},pages=detailPages('person',row,a.event),page=pages.find(p=>p.id==='appearance');
 const html=renderFlow({q,analysis:a,schema,row,page,flow:{phase:'fields',row:0},hasDetails:false,known:'',text:'متن آزمایشی',index:0,total:8,pageIndex:1,pageCount:pages.length,canNext:true},{...htmlHelpers});
 assert.equal((html.match(/data-detail-field=/g)||[]).length,3);
 assert.ok(!html.includes('data-detail-field="clothes"'));assert.ok(!html.includes('data-detail-field="eventRef"'));assert.ok(!html.includes('data-detail-field="role"'));
 assert.ok(html.includes('<details class="flow-context">'));assert.ok(!html.includes('<details class="flow-context" open'));
});
test('question copy matches yes/no choices and unsafe AI wording cannot replace the address question',()=>{
 const a=localAnalysis('سرقت رخ داد');a.prompts=[{section:'place',title:'این مورد به کدام بخش مربوط است؟'}];
 for(const q of questionsFor(a).filter(q=>q.group))assert.match(q.title,/می‌دانید؟$/);
 assert.equal(questionsFor(a).find(q=>q.id==='place').title,'این اتفاق کجا افتاد؟');
});
test('automatic topic suggestions require an extracted entity and evidence for the same event',()=>{
 const text='فرد با کت آبی کیف را سرقت کرد. خودروی سفید فقط آنجا پارک بود.';
 const raw={events:[{type:'theft',evidence:'کیف را سرقت کرد'}],prefills:[{section:'person',rowKey:'p1',field:'clothes',value:'کت آبی',evidence:'فرد با کت آبی کیف را سرقت کرد.'},{section:'vehicle',rowKey:'v1',field:'color',value:'سفید',evidence:'خودروی سفید فقط آنجا پارک بود.'}],topicAssignments:[{section:'person',rowKey:'p1',event:'theft',evidence:'فرد با کت آبی کیف را سرقت کرد.'},{section:'vehicle',rowKey:'v1',event:'theft',evidence:'خودروی سفید فقط آنجا پارک بود.'}]};
 const a=prepareAnalysis(raw,text);assert.equal(a.topicAssignments.length,1);const s={text,analysis:a,answers:{},extra:{}};applyPrefills(s,()=>({_id:'example-'+(++rowSequence)}));applyTopicAssignments(s);
 assert.equal(s.extra.person.rows[0]._topicSuggestions[0].event,'theft');assert.equal(s.extra.vehicle.rows[0]._topicSuggestions,undefined);assert.equal(entityGraph(s.extra,a).links.length,0);
});
test('no more information preserves previously filled section details',()=>{
 const h=harness();h.state.extra.person={enabled:true,rows:[{_id:'kept',age:'۳۰'}]};h.markSectionUnknown();
 assert.notEqual(h.state.answers.person,NO);assert.equal(h.state.extra.person.enabled,true);assert.equal(h.state.extra.person.rows[0].age,'۳۰');
});
test('the mixed report can traverse every progressive section to evidence without losing original facts',async()=>{
 const text='داخل یک رستوران سنتی در گلاب دره دیدم که مشروب سرو میشه ماشین های مدل بالا جلوی در رستوران پارک بودن و بعد از خروج افراد نزاع با سلاح سرد رخ میداد هرچی هم به مامورین کلانتری 124 اعلام میکنیم رسیدگی نمیکنن';
 const state={text,analysis:prepareAnalysis(localAnalysis(text),text),answers:{},extra:{},step:1,busy:false,confirmed:false};applyPrefills(state,()=>({_id:'mixed-'+(++rowSequence)}));
 const h=harness(questionsFor(state.analysis)[0].id,state);
 let clicks=0;
 while(state.step===1&&clicks++<150){
  const q=questionsFor(state.analysis)[state.qIndex],c=h.flowFrame(q);
  if(c.flow.phase==='main'){
   if(q.group){h.answerChoice(YES);continue}
   if(!state.answers[q.id])setAnswer(state,q.id,'پاسخ آزمایشی');await h.nextQuestion();
  }else if(c.flow.phase==='gate')h.beginDetails();
  else if(c.flow.phase==='more')h.finishFlowSection();
  else{
   if(q.id==='contact'&&c.page.id==='kind')c.row.kind='تلفن';
   if(q.id==='contact'&&c.page.id==='phone-kind'){c.row.phoneType=PHONE_TYPES[0];c.row.phoneCompleteness='شماره کامل'}
   if(q.id==='contact'&&c.page.id==='phone'){c.row.province='تهران';c.row.subscriber='11111111'}
   if(q.id==='vehicle'&&c.page.id==='description')c.row.kind='خودرو';
   if(q.id==='vehicle'&&c.page.id==='plate')c.row.plateStatus='پلاک را ندیدم';
   if(pageHasInput(c.page,c.row))await h.nextQuestion();else h.skipFlowSection();assert.equal(h.getError(),'');
  }
 }
 assert.equal(state.step,2,'flow must reach attachments');assert.ok(clicks<150);assert.equal(state.extra.place.rows[0].district,'گلاب دره');assert.equal(state.extra.details_assault.rows[0].tool,'سلاح سرد');assert.equal(state.extra.details_official_complaint.rows[0].agency,'کلانتری 124');
});

// ---------------------------------------------------------------------------
// «دیشب» is a day. The reporter should not be asked to turn it into a date.
// ---------------------------------------------------------------------------
import {resolveRelativeDate,toJalali} from './public/jalali.js';
import {applyRelativeDate} from './public/extraction.js';

test('the Jalali conversion matches the official calendar, including Nowruz edge days',()=>{
 const cases=[[2024,3,20,'۱۴۰۳/۰۱/۰۱'],[2025,3,20,'۱۴۰۳/۱۲/۳۰'],[2025,3,21,'۱۴۰۴/۰۱/۰۱'],[2026,3,21,'۱۴۰۵/۰۱/۰۱'],[2026,9,22,'۱۴۰۵/۰۶/۳۱'],[2026,9,23,'۱۴۰۵/۰۷/۰۱'],[1979,2,11,'۱۳۵۷/۱۱/۲۲']];
 for(const [y,m,d,want] of cases)assert.equal(toJalali(new Date(y,m-1,d)),want,`${y}-${m}-${d}`);
});

test('a day-word in the narrative fills the date; a range does not',()=>{
 const today=new Date(2026,8,24);
 assert.equal(resolveRelativeDate('دیشب موتورم را بردند',today),'۱۴۰۵/۰۷/۰۱');
 assert.equal(resolveRelativeDate('امروز صبح دیدم',today),'۱۴۰۵/۰۷/۰۲');
 assert.equal(resolveRelativeDate('پریروز',today),'۱۴۰۵/۰۶/۳۱');
 // «last week» is a range, not a day. It is left for the reporter.
 for(const range of ['هفتهٔ گذشته','چند روز پیش','ماه قبل'])assert.equal(resolveRelativeDate(range,today),'',range);
});

test('the derived date is filled, marked, and never overrides the reporter',()=>{
 const make=()=>({_id:'r'});
 const today=new Date(2026,8,24);
 const s={text:'دیشب کیفم را بردند',extra:{}};
 applyRelativeDate(s,make,resolveRelativeDate,today);
 assert.equal(s.extra.time.rows[0].date,'۱۴۰۵/۰۷/۰۱');
 assert.equal(s.extra.time.rows[0]._derivedFrom,'دیشب');
 // A date the reporter typed is theirs.
 const own={text:'دیشب کیفم را بردند',extra:{time:{enabled:true,rows:[{_id:'r',date:'۱۴۰۵/۰۶/۱۰'}]}}};
 applyRelativeDate(own,make,resolveRelativeDate,today);
 assert.equal(own.extra.time.rows[0].date,'۱۴۰۵/۰۶/۱۰');
 // If the narrative stops naming a day, a date we derived is withdrawn.
 s.text='کیفم را بردند';
 applyRelativeDate(s,make,resolveRelativeDate,today);
 assert.equal(s.extra.time.rows[0].date,undefined);
});

test('with the day known, the time page asks only roughly when',()=>{
 const row={_id:'r',date:'۱۴۰۵/۰۷/۰۱',_derivedFrom:'دیشب'};
 const pages=detailPages('time',row,'theft');
 assert.equal(pages[0].title,'حدود چه ساعتی بود؟');
 assert.equal(pages[0].fields[0].id,'period');
 assert.match(pages[0].hint,/دیشب/);
 // Picking a period completes it; the date alone does not.
 assert.equal(pageComplete(pages[0],row),false);
 assert.equal(pageComplete(pages[0],{...row,period:'شب'}),true);
});

// ---------------------------------------------------------------------------
// «Someone told me»: ask whether the reporter knows them. Known → a little
// more; unknown → at least one way to reach them.
// ---------------------------------------------------------------------------
test('hearsay opens the informant questions; a direct witness does not',()=>{
 const heard={answers:{source:'از شخص دیگری شنیدم'}},saw={answers:{source:'خودم شاهد بودم'}};
 assert.equal(detailPages('source',{},'theft',heard)[0].id,'informant');
 assert.equal(detailPages('source',{},'theft',saw).some(p=>p.id.startsWith('informant')),false);
 // The reporter's own words count too.
 assert.ok(isHearsay('همسایه‌مان دید و به من گفت'));
 assert.equal(isHearsay('خودم دیدم'),false);
});

test('a known informant gets details; an unknown one closes dependent questions',()=>{
 const ctx={answers:{source:'از شخص دیگری شنیدم'}};
 const known=detailPages('source',{informantKnown:'بله، می‌شناسمش'},'theft',ctx).map(p=>p.id);
 assert.deepEqual(known.slice(0,3),['informant','informant-known','informant-contact']);
 const unknown=detailPages('source',{informantKnown:'نه، نمی‌شناسمش'},'theft',ctx);
 assert.deepEqual(unknown.filter(p=>p.id.startsWith('informant')).map(p=>p.id),['informant']);
 // Nothing about the person until the reporter says whether they know them.
 assert.deepEqual(detailPages('source',{},'theft',ctx).filter(p=>p.id.startsWith('informant')).map(p=>p.id),['informant']);
});

// ---------------------------------------------------------------------------
// Questions are worded for how the reporter knows. Someone who was told about
// a car is not asked «when did you see it».
// ---------------------------------------------------------------------------
import {reportMode,phrase,adapt} from './public/voice-mode.js';

test('the reporter’s position is read from their answer, then from their words',()=>{
 assert.equal(reportMode({source:'از شخص دیگری شنیدم'}),'hearsay');
 assert.equal(reportMode({source:'در فضای مجازی دیدم'}),'online');
 assert.equal(reportMode({source:'برای خودم اتفاق افتاده'}),'victim');
 assert.equal(reportMode({source:'خودم شاهد بودم'}),'witness');
 assert.equal(reportMode({},'همسایه‌مان دید و به من گفت'),'hearsay');
 assert.equal(reportMode({},'دیشب موتورم را بردند'),'');
 // An explicit answer outranks the narrative.
 assert.equal(reportMode({source:'خودم شاهد بودم'},'بعد به من گفتند'),'witness');
});

test('someone who was told is asked what was said, not what they saw',()=>{
 const heard={answers:{source:'از شخص دیگری شنیدم'}},saw={answers:{source:'خودم شاهد بودم'}};
 const labels=ctx=>detailPages('vehicle',{kind:'خودرو'},'theft',ctx).flatMap(p=>[p.title,...p.fields.map(f=>f.label)]);
 assert.ok(labels(saw).includes('زمانی که این وسیله را دیدید'));
 assert.ok(labels(heard).includes('زمانی که این وسیله مشاهده شد'));
 assert.equal(labels(heard).some(l=>/را دیدید|مشاهده کردید|به یاد دارید/.test(l)),false);
});

test('re-wording does not mutate definitions and relayed choices do not assert direct observation',()=>{
 const step={id:'x',title:'چه بخش‌هایی از پلاک را مشاهده کردید؟',options:[{label:'چیزی ندیدم',phrase:'چیزی در دست آن‌ها ندیدم'}],fields:[{id:'observedAt',label:'زمانی که این وسیله را دیدید'}]};
 const out=adapt(step,'hearsay');
 assert.equal(out.title,'چه بخش‌هایی از پلاک مشاهده شده بود؟');
 assert.equal(out.options[0].phrase,'درباره وسیله‌ای در دست آن‌ها چیزی به من گفته نشد');
 assert.equal(step.options[0].phrase,'چیزی در دست آن‌ها ندیدم'); // original schema remains untouched
 assert.equal(out.options[0].label,'چیزی گفته نشد');
 assert.equal(out.fields[0].id,'observedAt');
 assert.equal(step.title,'چه بخش‌هایی از پلاک را مشاهده کردید؟');   // the shared schema is not mutated
 assert.equal(phrase('متنی که جدول ندارد','hearsay'),'متنی که جدول ندارد');
});
