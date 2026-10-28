// Regression tests for grouped local/AI questions, old drafts and replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {GUIDE_STEPS,FOLLOW_UPS,GUIDE_ORDER_VERSION,stepsFor,guideDefinitionsInOrder,guideStageForQuestion,guideQuestionAliases,displayGuideQuestion,guideAnswersFromTurns,migrateGuideOrder} from './public/guidance.js';
import {adapt,personalHearsay} from './public/voice-mode.js';
import {orderedInterviewPath,orderedClientStep,MAX_INTERVIEW_TURNS} from './public/interview-order.js';
import {newInterview,applyStep,answerCurrent,stepBack,consumePriorGuide,guideFallback,interviewRequest} from './public/ai-interview.js';
import {interviewInput,interviewStep,MAX_TURNS as SERVER_MAX} from './llm.js';

const core=GUIDE_STEPS.map(s=>s.id);
const allAnswers={
 source:'از همسایه شنیدم',informantKnown:'فردی که این را به من گفت را می‌شناسم',
 informantRelation:'همسایه است',informantContact:'شماره دارم',
 who:'دو نفر کودک را با اسلحه تهدید کردند',peopleDescription:'لباس تیره داشتند',
 peopleKnown:'قبلاً آن‌ها را دیده بودم',weapon:'چاقو یا قمه',childInvolved:'بله، حاضر بود',
 when:'دیروز',where:'تهران',result:'سرقت و کلاهبرداری و تصادف با پول و آسیب و تکرار؛ به کلانتری اطلاع دادم',
 vehicleInvolved:'یک خودرو در این اتفاق نقش داشت',vehicleDescription:'خودروی آبی',
 amount:'سه میلیون تومان',paymentMethod:'پرداخت نقدی انجام شد',injury:'یک نفر آسیب جدی دید',
 injuryCare:'اورژانس آمد',ongoing:'این وضعیت در لحظهٔ ثبت گزارش ادامه داشت',
 repeated:'چندین بار رخ داد',witness:'فرد دیگری هم شاهد این اتفاق بود',
 reportedBefore:'به کلانتری اطلاع دادم',reason:'سر بدهی بود',method:'از طریق تلگرام تماس گرفت',
 platform:'این ماجرا در تلگرام اتفاق افتاد',
};
const expected=['source','informantKnown','informantRelation','informantContact',
 'who','peopleDescription','peopleKnown','weapon','childInvolved','when','where',
 'result','vehicleInvolved','vehicleDescription','amount','paymentMethod','injury','injuryCare','ongoing','repeated','witness','reportedBefore','reason','method','platform'];
const ids=(answers={},base='',skipped=[])=>stepsFor(answers,base,skipped).map(s=>s.id);
const legacyTurns=()=>Array.from({length:20},(_,i)=>({q:`پرسش قدیمی ${i}`,a:i===0?'روایت قدیمی':''}));

test('every active follow-up is contiguous with its topic and the core order is unchanged',()=>{
 const live=ids(allAnswers);
 assert.deepEqual(live,expected);
 assert.deepEqual(live.filter(id=>core.includes(id)),core);
 assert.deepEqual(new Set(live.filter(id=>!core.includes(id))),new Set(FOLLOW_UPS.filter(s=>!s.deprecated&&!s.legacyOnly).map(s=>s.id)));
 const recordOrder=guideDefinitionsInOrder().map(s=>s.id);
 assert.deepEqual(recordOrder.filter(id=>live.includes(id)),live);
 assert.ok(recordOrder.includes('duration')&&recordOrder.includes('peopleCount'),'old answers remain available in records');
});

test('free-form hearsay, online reports, unknowns and changing a parent behave safely',()=>{
 for(const value of ['از همسایه شنیدم','همسایه گفت','به من اطلاع داد','بهم گفت'])assert.ok(personalHearsay(value),value);
 for(const value of ['در تلگرام شنیدم','از همسایه نشنیدم','خودم دیدم'])assert.equal(personalHearsay(value),false,value);
 assert.deepEqual(ids({source:'از همسایه شنیدم'}).slice(0,3),['source','informantKnown','who']);
 assert.ok(!ids({source:'در تلگرام شنیدم'}).includes('informantKnown'));
 assert.ok(!ids({source:'از همسایه نشنیدم'}).includes('informantKnown'));
 const known={source:'از همسایه شنیدم',informantKnown:'بله'};
 assert.deepEqual(ids(known).slice(0,5),['source','informantKnown','informantRelation','informantContact','who']);
 for(const no of ['نه','نمی‌شناسم','ناشناس است']){
  const list=ids({...known,informantKnown:no});
  assert.ok(!list.includes('informantRelation')&&!list.includes('informantContact'),no);
 }
 assert.ok(!ids(known,'',['source']).includes('informantKnown'));
 assert.ok(!ids({...known,source:'من خودم این را دیدم'},'از همسایه شنیدم که اتفاقی رخ داد').includes('informantKnown'),'explicit change overrides the old base');
 const base='از همسایه شنیدم که خودرو سرقت شده است';
 const covered=ids({},base);
 assert.ok(!covered.includes('source'));
 assert.equal(covered[0],'informantKnown','covered source still opens its immediate branch');
 assert.ok(!ids({},'نمی‌دانم نحوه اطلاع').includes('informantKnown'));
});

test('later answers cannot insert new questions behind a completed topic',()=>{
 const early={source:'من خودم این را دیدم',who:'دو نفر',peopleDescription:'قد بلند',peopleKnown:'قبلاً آن‌ها را دیده بودم',result:'اتفاقی رخ داد'};
 const before=ids(early),after=ids({...early,result:'درگیری با اسلحه، تهدید و تصادف رخ داد',reason:'پول و بدهی',method:'از طریق تلگرام'});
 const throughWho=list=>list.slice(0,list.indexOf('when'));
 assert.deepEqual(throughWho(after),throughWho(before));
 assert.ok(!throughWho(after).includes('weapon'));
 const direct=stepsFor({...early,source:'من خودم دیدم',result:'بعداً از همسایه شنیدم'}).find(s=>s.id==='peopleDescription');
 assert.equal(direct.title,FOLLOW_UPS.find(s=>s.id==='peopleDescription').title,'a later hearsay answer does not turn an eyewitness into a hearsay reporter');
 const resultOnly=ids(early).slice(ids(early).indexOf('result'),ids(early).indexOf('reason'));
 const future=ids({...early,reason:'پول',method:'یک خودرو در اینترنت'});
 assert.deepEqual(future.slice(future.indexOf('result'),future.indexOf('reason')),resultOnly);
 assert.ok(future.includes('platform'),'later context still informs its own topic');
});

test('current and adapted follow-up titles replay, and relayed option wording stays accurate',()=>{
 const desc=FOLLOW_UPS.find(s=>s.id==='peopleDescription');
 for(const mode of ['hearsay','online']){
  const title=adapt(desc,mode).title;
  assert.equal(guideStageForQuestion(title,'peopleDescription')?.id,'peopleDescription');
  assert.equal(displayGuideQuestion(title,'peopleDescription'),title);
  assert.ok(guideQuestionAliases('peopleDescription').includes(title));
 }
 const weapon=FOLLOW_UPS.find(s=>s.id==='weapon');
 const turns=[{stage:'source',q:GUIDE_STEPS[0].title,a:'از فرد دیگری شنیدم'},
  {stage:'weapon',q:weapon.title,a:'چیزی گفته نشد'}];
 const result=guideAnswersFromTurns(turns);
 assert.equal(result.answers.weapon,'درباره وسیله‌ای در دست آن‌ها چیزی به من گفته نشد');
 assert.equal(guideAnswersFromTurns([{stage:'weapon',q:weapon.title,a:'چیزی در دست آن‌ها ندیدم'}]).answers.weapon,'چیزی در دست آن‌ها ندیدم','an existing saved answer is never rewritten');
 assert.equal(guideStageForQuestion('چه کسی: این اتفاق برای چه کسی افتاد؟','who'),null);
});

test('version 4 drafts move missing branches forward without losing old answers or current text',()=>{
 const answers={source:'از همسایه شنیدم',who:'دو نفر',when:'دیروز',where:'تهران',result:'سرقت رخ داد'};
 const old=stepsFor(answers,'',[],{legacyOrder:true});
 const at=old.findIndex(s=>s.id==='reason');assert.ok(at>=0);
 const g={orderVersion:4,mode:'intake',base:'',answers:{...answers},skipped:[],index:at,draft:{step:'reason',value:'متن هنوز تأیید نشده'}};
 migrateGuideOrder(g);
 assert.equal(g.orderVersion,GUIDE_ORDER_VERSION);
 assert.equal(ids(g.answers,g.base,g.skipped)[g.index],'informantKnown');
 assert.equal(g.pendingDrafts.reason,'متن هنوز تأیید نشده');assert.equal(g.draft,null);
 for(const id of ['source','who','when','where','result'])assert.ok(g.resumeCompleted.includes(id));
 assert.deepEqual(g.answers,answers);
 const finished={orderVersion:4,index:old.length,base:'',answers:{...answers},skipped:[]};
 migrateGuideOrder(finished);assert.equal(finished.index,stepsFor(finished.answers,'',finished.skipped).length);
 assert.deepEqual(finished.answers,answers);
});

test('new AI and server replay every branch, prevent early finish, and support 20 legacy turns',async()=>{
 assert.equal(MAX_INTERVIEW_TURNS,45);assert.equal(SERVER_MAX,MAX_INTERVIEW_TURNS);
 const ai=newInterview('intake');ai.turns=legacyTurns();
 assert.equal(interviewRequest(ai,'').orderVersion,GUIDE_ORDER_VERSION);
 const ask=async()=>JSON.stringify({done:true,question:'',options:['ساختگی'],facts:[],urgent:'',narrative:'ساختگی'});
 for(const id of expected){
  const input=interviewInput(interviewRequest(ai,''));assert.equal(typeof input,'object',String(input));
  const server=await interviewStep(ask,input);const client=orderedClientStep(ai,{done:true,question:'نادرست',options:['جعلی']},'');
  assert.equal(server.stage,id);assert.equal(client.stage,id);assert.equal(server.question,client.question);
  assert.equal(server.done,false);assert.equal(server.narrative,'');assert.ok(!server.options.includes('ساختگی'));
  applyStep(ai,server);assert.ok(answerCurrent(ai,allAnswers[id]));
 }
 assert.equal(ai.turns.length,MAX_INTERVIEW_TURNS);
 const finish=await interviewStep(ask,interviewInput(interviewRequest(ai,'')));
 assert.equal(finish.done,true);assert.match(finish.narrative,/روایت قدیمی/);assert.match(finish.narrative,/همسایه/);
 assert.ok(orderedClientStep(ai,{done:false,question:'جعلی'},'').done);
 const tooMany=interviewInput({...interviewRequest(ai,''),turns:[...interviewRequest(ai,'').turns,{q:'x',a:'x'}]});
 assert.equal(typeof tooMany,'string');
});

test('old AI protocol continues in its original order; new out-of-order history is rejected',async()=>{
 const first={stage:'source',q:GUIDE_STEPS[0].title,a:'از فرد دیگری شنیدم'};
 const old={mode:'intake',text:'',turns:[first]};
 assert.equal(orderedInterviewPath(old).next.id,'who');
 assert.equal(orderedInterviewPath({...old,orderVersion:4}).next.id,'who');
 assert.equal(orderedInterviewPath({...old,orderVersion:GUIDE_ORDER_VERSION}).next.id,'informantKnown');
 const illegal={...old,orderVersion:GUIDE_ORDER_VERSION,turns:[first,{stage:'who',q:GUIDE_STEPS[1].title,a:'دو نفر'}]};
 assert.ok(orderedInterviewPath(illegal).error);assert.equal(typeof interviewInput(illegal),'string');
 assert.equal(typeof interviewInput({...old,orderVersion:999}),'string');
});

test('AI reuses prior answers after a newly inserted branch without overwriting a draft',()=>{
 const ai=newInterview('intake');
 ai.priorPending={source:'از همسایه شنیدم',who:'دو نفر',when:'دیروز',where:'تهران',result:'سرقت رخ داد'};
 consumePriorGuide(ai,'');assert.deepEqual(ai.turns.map(t=>t.stage),['source']);
 applyStep(ai,orderedClientStep(ai,{},''));assert.equal(ai.current.stage,'informantKnown');answerCurrent(ai,'');
 consumePriorGuide(ai,'');assert.deepEqual(ai.turns.map(t=>t.stage),['source','informantKnown','who']);
 applyStep(ai,orderedClientStep(ai,{},''));assert.equal(ai.current.stage,'peopleDescription');answerCurrent(ai,'');
 const when=GUIDE_STEPS.find(s=>s.id==='when');ai.pendingDrafts={[when.title]:'متن تازهٔ زمان'};
 consumePriorGuide(ai,'');assert.equal(orderedClientStep(ai,{},'').stage,'when','a user draft takes priority over an older intake answer');
 applyStep(ai,orderedClientStep(ai,{},''));assert.equal(ai.draft,'متن تازهٔ زمان');answerCurrent(ai,ai.draft);
 consumePriorGuide(ai,'');
 assert.deepEqual(ai.turns.slice(-3).map(t=>t.stage),['when','where','result']);
 assert.equal(ai.turns.find(t=>t.stage==='when').a,'متن تازهٔ زمان');
 assert.equal(orderedClientStep(ai,{},'').stage,'vehicleInvolved');
 assert.equal(ai.priorPending.when,undefined);
 const prior={answers:{},skipped:[],pendingDrafts:{when:'متن قدیمی'}};
 const resumed=newInterview('intake');resumed.pendingDrafts={};
 assert.equal(guideFallback(resumed,'',prior).pendingDrafts.when,undefined,'an answered prior draft is not resurrected');
});

test('AI Back, parent changes and fallback keep an unsent dependent answer',()=>{
 const ai=newInterview('intake');
 applyStep(ai,orderedClientStep(ai,{},''));answerCurrent(ai,'از فرد دیگری شنیدم');
 applyStep(ai,orderedClientStep(ai,{},''));assert.equal(ai.current.stage,'informantKnown');ai.draft='نامش را می‌دانم';
 assert.ok(stepBack(ai,''));assert.equal(ai.current.stage,'source');answerCurrent(ai,'خودم دیدم');
 applyStep(ai,orderedClientStep(ai,{},''));assert.equal(ai.current.stage,'who');
 assert.ok(stepBack(ai,''));answerCurrent(ai,'از فرد دیگری شنیدم');
 applyStep(ai,orderedClientStep(ai,{},''));assert.equal(ai.current.stage,'informantKnown');assert.equal(ai.draft,'نامش را می‌دانم');
 const fallback=guideFallback(ai);
 assert.equal(ids(fallback.answers,fallback.base,fallback.skipped)[fallback.index],'informantKnown');
 assert.equal(fallback.pendingDrafts.informantKnown,'نامش را می‌دانم');
 assert.equal(fallback.answers.source,'این را از فرد دیگری شنیدم');
});
