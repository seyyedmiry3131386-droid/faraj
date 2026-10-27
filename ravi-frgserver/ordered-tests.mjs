import test from 'node:test';
import assert from 'node:assert/strict';
import {GUIDE_STEPS,LEGACY_STAGE_TITLES,FOLLOW_UPS,guideStageForQuestion,displayGuideQuestion,guideAnswersFromTurns,migrateGuideOrder,coreStepsFor,stepsFor,unknownStagesInText,carryGuideAnswers,composeNarrative,isNonAnswer,newsDomain,displayNewsDomain} from './public/guidance.js';
import {orderedInterviewPath,orderedClientStep} from './public/interview-order.js';
import {guideFallback,newInterview,applyStep,answerCurrent,stepBack} from './public/ai-interview.js';
import {vehicleCharacteristics} from './public/narrative-facts.js';
import {prepareAnalysis,groundPrefills,removeLegacyVehicleNarratives} from './public/extraction.js';
import {localAnalysis} from './public/scenarios.js';
import {detailSchema} from './public/details.js';
import {detailPages,pageHasInput} from './public/question-flow.js';
import {uiLabel} from './public/ui-label.js';

const order=['source','who','when','where','result','reason','method'];
test('seven stages ask for the actor; witness, victim and driver alone do not answer who',()=>{
 assert.deepEqual(GUIDE_STEPS.map(s=>s.id),order);
 assert.match(GUIDE_STEPS.find(s=>s.id==='who').title,/چه کسی این کار را انجام داد/);
 for(const text of ['مادر من قربانی سرقت شد','دو نفر شاهد آمدند','یک راننده در تصادف مجروح شد','شاهدی کیف سرقت شده را دید'])
  assert.ok(coreStepsFor({},text).some(s=>s.id==='who'),text);
 assert.ok(!coreStepsFor({},'یک دزد کیف را برد').some(s=>s.id==='who'));
});

test('explicit unknown parents suppress dependent questions, without destroying retained answers',()=>{
 const a={source:'این را از فرد دیگری شنیدم',result:'دو نفر با خودرو کیفم را بردند',peopleCount:'دو نفر در این اتفاق دخیل بودند',vehicleInvolved:'یک خودرو در این اتفاق نقش داشت'};
 const ids=(skipped)=>stepsFor(a,'',skipped).map(s=>s.id);
 for(const id of ['peopleCount','peopleDescription','peopleKnown','weapon','childInvolved'])assert.ok(!ids(['who']).includes(id),id);
 for(const id of ['vehicleInvolved','vehicleDescription','amount','injury','ongoing','witness','reportedBefore'])assert.ok(!ids(['result']).includes(id),id);
 for(const id of ['informantKnown','informantRelation','informantContact'])assert.ok(!ids(['source']).includes(id),id);
 assert.ok(!ids(['vehicleInvolved']).includes('vehicleDescription'));
 assert.ok(!ids(['peopleCount']).includes('peopleDescription'));
 const noInformant={...a,informantKnown:'فردی که این را به من گفت را نمی‌شناسم'};
 assert.ok(!stepsFor(noInformant).some(s=>['informantContact','informantRelation'].includes(s.id)));
 assert.equal(a.vehicleInvolved,'یک خودرو در این اتفاق نقش داشت');
 for(const answer of ['نمی‌دانم','اطلاعی ندارم','اطلاعات بیشتری ندارم','نامشخص'])assert.equal(isNonAnswer(answer),true,answer);
 const carrier=carryGuideAnswers({},['who','when','where','result','method']);
 for(const id of ['person','time','place','object','vehicle','details_*','contact'])assert.ok(carrier.blockedSections.includes(id),id);
});

test('explicit unknown in the original description closes only that stage and its details',()=>{
 const text='خودم دیدم کیفم را بردند اما نمی‌دانم چه کسی این کار را کرد و دلیلش معلوم نیست.';
 assert.deepEqual(new Set(unknownStagesInText(text)),new Set(['who','reason']));
 const steps=coreStepsFor({},text).map(s=>s.id);
 assert.ok(!steps.includes('who'));assert.ok(!steps.includes('reason'));
 assert.ok(!stepsFor({},text).some(s=>s.id==='peopleCount'));
 assert.ok(unknownStagesInText('من نمی‌دانم چه شد').includes('result'));
 const allUnknown=['نمی‌دانم نحوه اطلاع','نمی‌دانم چه کسی','نمی‌دانم زمان','نمی‌دانم کجا','نمی‌دانم چه شد','نمی‌دانم چرا','نمی‌دانم چگونه'].join('\n');
 assert.deepEqual(stepsFor({},allUnknown),[]);
});

test('client also ignores premature, reordered and invented model output',()=>{
 const ai=newInterview('intake');
 for(const expected of GUIDE_STEPS){
  const next=orderedClientStep(ai,{done:true,stage:'evidence',question:'سؤال جعلی',options:['جعلی'],narrative:'ساختگی'},'');
  assert.equal(next.done,false);assert.equal(next.stage,expected.id);assert.equal(next.question,expected.title);
  assert.ok(!next.options.includes('جعلی'));assert.equal(next.narrative,'');
  applyStep(ai,next);answerCurrent(ai,expected.id==='result'?'کیفم را بردند':'');
 }
 assert.equal(orderedClientStep(ai,{done:false,stage:'source',question:'تکراری'},'').done,true);
});

test('old victim and evidence questions remain legacy; they cannot count as the actor stage',()=>{
 const old=[{stage:'source',q:GUIDE_STEPS[0].title,a:'خودم دیدم'},
  {stage:'who',q:'چه کسی: این اتفاق برای چه کسی افتاد؟',a:'برای مادرم بود'},
  {stage:'when',q:GUIDE_STEPS[2].title,a:'دیروز'},
  {stage:'evidence',q:'مدرک یا نشانه‌ای دارید؟',a:'فیلم دارم'}];
 let p=orderedInterviewPath({mode:'intake',turns:old});assert.equal(p.next.id,'who');
 assert.equal(p.turns[1].stage,undefined);assert.equal(p.turns[1].a,'برای مادرم بود');assert.equal(p.turns[3].a,'فیلم دارم');
 const replay=[...old];
 for(const step of GUIDE_STEPS.slice(1)){
  p=orderedInterviewPath({mode:'intake',turns:replay});assert.equal(p.next.id,step.id);
  replay.push({stage:step.id,q:step.title,a:step.id==='who'?'یک نفر':''});
 }
 assert.equal(orderedInterviewPath({mode:'intake',turns:replay}).next,null);
 assert.ok(orderedInterviewPath({mode:'intake',turns:[{stage:'when',q:GUIDE_STEPS[2].title,a:''}]}).error);
});

test('AI back preserves the current unsent draft and guide fallback retains prior unknowns',()=>{
 const ai=newInterview('intake');applyStep(ai,{done:false,stage:'source',question:GUIDE_STEPS[0].title,options:[]});answerCurrent(ai,'خودم دیدم');
 applyStep(ai,{done:false,stage:'who',question:GUIDE_STEPS[1].title,options:[]});ai.draft='یک پاسخ هنوز ارسال نشده';
 assert.ok(stepBack(ai));answerCurrent(ai,'خودم دیدم');applyStep(ai,{done:false,stage:'who',question:GUIDE_STEPS[1].title,options:[]});
 assert.equal(ai.draft,'یک پاسخ هنوز ارسال نشده');
 const old=newInterview('intake');old.pendingDrafts={[LEGACY_STAGE_TITLES.when]:'پیش‌نویس قدیمی'};
 applyStep(old,{done:false,stage:'when',question:GUIDE_STEPS[2].title,options:[]});assert.equal(old.draft,'پیش‌نویس قدیمی');
 answerCurrent(old,old.draft);assert.equal(old.pendingDrafts[LEGACY_STAGE_TITLES.when],undefined);
 const detail=newInterview('detail');const base='من خودم دیدم کیفم را بردند';
 const prior={answers:{source:'من خودم این را دیدم'},skipped:['who'],forText:base};
 const g=guideFallback(detail,base,prior);
 assert.equal(g.answers.source,prior.answers.source);assert.ok(g.skipped.includes('who'));
 assert.ok(!stepsFor(g.answers,g.base,g.skipped).some(s=>s.id==='peopleCount'));
});

test('vehicle characteristic is a short grounded model or characteristic, never the incident sentence',()=>{
 const text='دیروز یک پراید سفید کنار خیابان بود و شیشه خودرو شکست و کیف را سرقت کردند.';
 const a=prepareAnalysis(localAnalysis(text),text);
 const vehicle=a.prefills.filter(p=>p.section==='vehicle');
 assert.ok(vehicle.some(p=>p.field==='observation'&&p.value==='پراید سفید'));
 assert.ok(vehicle.some(p=>p.field==='model'&&p.value==='پراید'));
 assert.ok(vehicle.every(p=>p.field!=='observation'||p.value!==text));
 const raw=[{section:'vehicle',field:'observation',value:text,evidence:text,rowKey:'x'},
  {section:'vehicle',field:'model',value:'خودرو',evidence:text,rowKey:'x'},
  {section:'vehicle',field:'color',value:'سفید',evidence:text,rowKey:'x'}];
 const safe=groundPrefills(raw,text,a);assert.deepEqual(safe.map(p=>p.field),['color']);
 for(const q of ['یک ماشین در محل بود','شاید پراید بود','پراید نیست','مرد لباس سفید پوشید و ماشین کنار خیابان بود'])assert.deepEqual(vehicleCharacteristics(q),[],q);
 const unknown='ماشین جلوی مغازه پارک بود و کیف سرقت شد';
 const unknownAnalysis=prepareAnalysis(localAnalysis(unknown),unknown);
 assert.ok(!unknownAnalysis.prefills.some(p=>p.section==='vehicle'&&['observation','model','color'].includes(p.field)));
});

test('old automatic full-sentence vehicle values are retired without losing the source or manual edits',()=>{
 const source='ماشین جلوی مغازه پارک بود و کیف سرقت شد';
 const audit={section:'vehicle',field:'observation',rowId:'v',value:source,evidence:source,status:'confirmed'};
 const s={text:source,extra:{vehicle:{enabled:true,rows:[{_id:'v',observation:source}]}},prefillAudit:[{...audit}]};
 assert.equal(removeLegacyVehicleNarratives(s),1);assert.equal(s.extra.vehicle.rows[0].observation,undefined);
 assert.equal(s.text,source);assert.equal(s.prefillAudit[0].status,'rejected');assert.equal(s.prefillAudit[0].value,source);
 const edited={text:source,extra:{vehicle:{enabled:true,rows:[{_id:'v',observation:source}]}},prefillAudit:[{...audit,editedValue:source}]};
 assert.equal(removeLegacyVehicleNarratives(edited),0);assert.equal(edited.extra.vehicle.rows[0].observation,source);
});

test('label cleanup is presentation-only, current page determines button state and domain is a local suggestion',()=>{
 assert.equal(uiLabel('مشخصهٔ وسیله'),'مشخصه وسیله');
 assert.equal(detailSchema('vehicle','theft').fields.find(f=>f.id==='observation').label,'مشخصه وسیله');
 const quote='گفت «وسیلهٔ آبی بود»';assert.ok(composeNarrative({result:quote}).includes(quote));
 const pages=detailPages('vehicle',{},'theft'),description=pages.find(p=>p.id==='description');
 assert.equal(pageHasInput(description,{plateStatus:'پلاک را ندیدم'}),false);
 assert.equal(pageHasInput(description,{model:'پراید'}),true);
 assert.equal(pageHasInput(description,{model:'  '}),false);
 assert.ok(newsDomain('دیروز کیفم را سرقت کردند').includes('انتظامی'));
});

test('questions have no category prefix, witness is clear, and duration is never asked',()=>{
 const labels=['این را خودتان دیدید یا از کسی شنیدید؟','چه کسی این کار را انجام داد؟',
  'این اتفاق چه زمانی رخ داد؟','این اتفاق در کدام محل رخ داد؟',
  'چه اتفاقی رخ داد و چه چیزی در آن دخیل بود؟','آیا درباره دلیل یا انگیزه این اتفاق اطلاعاتی دارید؟','این اتفاق چگونه رخ داد؟'];
 assert.deepEqual(GUIDE_STEPS.map(s=>s.title),labels);
 assert.equal(FOLLOW_UPS.find(s=>s.id==='witness').title,'آیا فرد دیگری هم این اتفاق را مشاهده کرد؟');
 for(const [base,answers] of [['دیروز کیفم را سرقت کردند',{}],
  ['این مشکل قطع آب همچنان ادامه دارد',{ongoing:'این وضعیت در لحظهٔ ثبت گزارش ادامه داشت'}],
  ['',{result:'خودرو را بردند',ongoing:'ادامه دارد'}]]){
  assert.ok(!stepsFor(answers,base).some(s=>s.id==='duration'),base);
  assert.ok(!stepsFor(answers,base).some(s=>s.title.includes('از کِی این مشکل شروع شده است')));
 }
 assert.equal(detailSchema('details_self_harm','self_harm').fields.find(f=>f.id==='observation').label,'چه گفته یا رفتاری باعث نگرانی شما شده است؟');
});

test('old seven-stage labels replay exactly, preserve answers and do not turn victim into actor',()=>{
 const turns=GUIDE_STEPS.map((s,i)=>({stage:s.id,q:LEGACY_STAGE_TITLES[s.id],a:`پاسخ ${i+1}`}));
 const p=orderedInterviewPath({mode:'intake',turns});
 assert.equal(p.error,undefined);assert.equal(p.next,null);
 assert.deepEqual(guideAnswersFromTurns(p.turns).completed,order);
 assert.equal(guideAnswersFromTurns(p.turns).answers.who,'پاسخ 2');
 for(const step of GUIDE_STEPS)assert.equal(guideStageForQuestion(LEGACY_STAGE_TITLES[step.id],step.id)?.id,step.id);
 assert.equal(guideStageForQuestion('چه کسی: این اتفاق برای چه کسی افتاد؟','who'),null);
 assert.equal(displayGuideQuestion('چه کسی: این اتفاق برای چه کسی افتاد؟','who'),'این اتفاق برای چه کسی افتاد؟');
 assert.equal(guideStageForQuestion(LEGACY_STAGE_TITLES.source,'who'),null);
});

test('migrating a duration draft preserves the user answer and cursor, and completion keeps observations',()=>{
 const answers={source:'من خودم این را دیدم',who:'یک نفر',when:'دیروز',where:'تهران',
  result:'مشکل قطع آب ادامه دارد',reason:'نامعلوم',method:'نامعلوم',ongoing:'این وضعیت در لحظهٔ ثبت گزارش ادامه داشت'};
 const before=stepsFor(answers,'',[],{includeDeprecated:true});const at=before.findIndex(s=>s.id==='duration');assert.ok(at>=0);
 const g={orderVersion:2,index:at,base:'',answers:{...answers},skipped:[],draft:{step:'duration',value:'از دو هفته پیش'}};
 migrateGuideOrder(g);assert.equal(g.orderVersion,3);assert.equal(g.answers.duration,'از دو هفته پیش');assert.equal(g.draft,null);
 assert.equal(stepsFor(g.answers,g.base,g.skipped)[g.index].id,before[at+1].id);
 const narrative=composeNarrative({...g.answers,injury:'یک نفر آسیب دید',injuryCare:'اورژانس آمد',repeated:'این اتفاق تکرار شد'});
 for(const expected of ['از دو هفته پیش','یک نفر آسیب دید','اورژانس آمد','این وضعیت در لحظهٔ ثبت گزارش ادامه داشت','این اتفاق تکرار شد'])assert.ok(narrative.includes(expected),expected);
 const last={orderVersion:2,index:before.length,answers:{...answers,duration:'از پارسال'},skipped:[],base:''};
 migrateGuideOrder(last);assert.equal(last.index,stepsFor(last.answers,last.base,last.skipped).length);assert.ok(composeNarrative(last.answers).includes('از پارسال'));
 const atLater=before.findIndex(s=>s.id==='witness');assert.ok(atLater>at);
 const later={orderVersion:2,index:atLater,answers:{...answers,duration:'چند روزی است'},skipped:[],base:'',draft:{step:'witness',value:'یک نفر شاهد بود'}};
 migrateGuideOrder(later);assert.equal(stepsFor(later.answers,later.base,later.skipped)[later.index].id,'witness');assert.equal(later.draft.value,'یک نفر شاهد بود');
});

test('domain metadata is renamed while the user\'s own wording remains intact',()=>{
 assert.ok(newsDomain('در بیمارستان خدمات درمانی دریافت نکرده است').includes('اجتماعی'));
 assert.equal(displayNewsDomain('رفاه، امنیتی'),'اجتماعی، امنیتی');
 assert.equal(displayNewsDomain('رسیدگی به رفاه خانواده'),'رسیدگی به رفاه خانواده');
 const quote='او گفت «رفاه خانواده‌ام مهم است»';assert.ok(composeNarrative({result:quote}).includes(quote));
});
