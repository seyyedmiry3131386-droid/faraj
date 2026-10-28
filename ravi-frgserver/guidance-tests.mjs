import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {guidanceNeed,composeNarrative,missingFacts,factCoverage,FACT_LABELS,GUIDE_STEPS,coreStepsFor,canFinishGuide,nextGuideStep,explainAnalysis} from './public/guidance.js';
import {createDictation,speechSupported,speechMessage,appendSpeech} from './public/speech.js';
import {localAnalysis} from './public/scenarios.js';
import {questionsFor} from './public/domain.js';

test('a reporter who says they do not know what to write is offered guidance, not an error',()=>{
 for(const text of ['نمیدونم چی بگم','نمی‌دانم چه بنویسم','بلد نیستم','از کجا شروع کنم؟','راهنماییم کن','چی بنویسم'])
  assert.equal(guidanceNeed(text).need,'unsure',text);
 for(const text of ['','   ','\n'])assert.equal(guidanceNeed(text).need,'empty',text);
 for(const text of ['سلام','ببخشید','تست'])assert.equal(guidanceNeed(text).need,'empty',text);
 for(const text of ['دزدی','یه چیزی شد'])assert.equal(guidanceNeed(text).need,'short',text);
 assert.equal(guidanceNeed('یک موضوع مهم و ناراحت کننده برای من پیش آمده است').need,'vague');
 assert.equal(guidanceNeed('دیروز در خیابان بهار گوشی‌ام را زدند و خودم دیدم').need,'ok');
});

test('the interview has seven core stages and a separate evidence checklist',()=>{
 assert.deepEqual(FACT_LABELS.map(f=>f.label),['چه شد','از کجا می‌دانید','چه کسی','کِی','کجا','چگونه','چرا','چه مدرکی']);
 const ids=GUIDE_STEPS.map(s=>s.id);
 assert.deepEqual(ids,['source','who','when','where','result','reason','method']);
 assert.equal(new Set(ids).size,ids.length);
 // Every question may stay unknown; nothing is mandatory.
 assert.deepEqual(GUIDE_STEPS.filter(s=>s.required).map(s=>s.id),[]);
});

test('dependent questions stay with their topic and core stages retain their relative order',()=>{
 const order=['source','who','when','where','result','reason','method'];
 const answers={};
 const values={source:'این را از فرد دیگری شنیدم',who:'یک نفر این کار را انجام داد',when:'دیروز',
  where:'خیابان بهار',result:'دو نفر با موتور آمدند و شیشهٔ ماشین را شکستند',reason:'',method:'از پنجره وارد شدند'};
 for(const id of order){
  answers[id]=values[id];
  const live=stepsFor(answers).map(s=>s.id);
  assert.deepEqual(live.filter(id=>order.includes(id)),order);
 }
 const live=stepsFor(answers).map(s=>s.id);
 assert.equal(live.indexOf('informantKnown'),live.indexOf('source')+1);
 assert.equal(live.indexOf('peopleDescription'),live.indexOf('who')+1);
 assert.ok(live.indexOf('peopleKnown')<live.indexOf('when'));
 assert.ok(live.indexOf('vehicleInvolved')>live.indexOf('result')&&live.indexOf('vehicleInvolved')<live.indexOf('reason'));
 assert.ok(!live.includes('peopleCount'));
});

test('early finish cannot bypass a core stage, but can omit later follow-ups',async()=>{
 const answers={source:'این را از فرد دیگری شنیدم',who:'این اتفاق برای خودم افتاد',when:'دیروز',
  where:'خیابان بهار',result:'دو نفر کیف و گوشی را بردند',reason:'گفتند سر بدهی بوده است',
  method:'شیشه ماشین را شکستند',evidence:'عکس دارم'};
 const live=stepsFor(answers);
 assert.ok(interviewProgress(answers).enough);
 const lastCore=live.findIndex(s=>s.id==='method');
 for(let i=0;i<=lastCore;i++)assert.equal(canFinishGuide(live,i),false,live[i].id);
 assert.ok(live.length>GUIDE_STEPS.length);
 assert.equal(canFinishGuide(live,lastCore+1),true);
 const {renderGuide}=await import('./public/guide-view.js');
 const helpers={escape:s=>s,fa:n=>String(n),icon:()=>'',stepper:()=>''};
 assert.doesNotMatch(renderGuide({index:1,answers,base:''},helpers),/data-action="guide-finish"/);
 const html=renderGuide({index:lastCore,answers,base:''},helpers);
 assert.doesNotMatch(html,/data-action="guide-finish"/);
 for(const action of ['guide-back','guide-next','guide-skip'])assert.match(html,new RegExp(`data-action="${action}"`));
});

test('only the original description suppresses base stages, in their fixed order',()=>{
 const base='دیشب در خیابان بهار موتورم را بردند و خودم دیدم';
 const missing=coreStepsFor({},base).map(s=>s.id);
 for(const covered of ['source','when','where','result'])assert.ok(!missing.includes(covered),covered);
 const order=GUIDE_STEPS.map(s=>s.id);
 assert.deepEqual(missing,order.filter(id=>missing.includes(id)));
 const live=stepsFor({},base).map(s=>s.id);
 assert.deepEqual(live.filter(id=>order.includes(id)),missing);
 // A vague initial text must not suddenly hide the «what» question merely
 // because a later source answer happens to mention a classified incident.
 assert.ok(coreStepsFor({source:'دو نفر کیف را بردند'},'لطفاً راهنمایی کنید').some(s=>s.id==='result'));
});

test('composed narratives contain only answers the reporter actually gave',()=>{
 const answers={result:'سرقت رخ داد',when:'دیروز',where:'خیابان بهار'};
 const text=composeNarrative(answers);
 assert.match(text,/دیروز/);assert.match(text,/خیابان بهار/);assert.match(text,/سرقت/);
 // Skipped questions leave no trace: nothing about people, motive, method or evidence.
 for(const absent of ['نمی‌دانم','چه کسی','انگیزه','مدرک','undefined','null'])assert.equal(text.includes(absent),false,absent);
 assert.equal(composeNarrative({}),'');
 assert.equal(composeNarrative({result:'  '}),'');
});

test('a narrative built by the interview classifies and produces its detail questions',()=>{
 const cases=[
  [{result:'سرقت رخ داد. شیشهٔ ماشین را شکستند و کیف را بردند',when:'دیروز',where:'خیابان بهار'},'theft'],
  [{result:'کلاهبرداری رخ داد. پول را گرفت و کالا را تحویل نداد',when:'هفتهٔ گذشته'},'fraud'],
  [{result:'آتش‌سوزی رخ داد',where:'انبار محله'},'fire'],
  [{result:'تهدید و مزاحمت رخ داد. مدام زنگ می‌زند'},'harassment'],
  [{result:'مشکل در خدمات شهری وجود دارد. چراغ کوچه چند شب است خاموش است'},'service'],
 ];
 for(const [answers,expected] of cases){
  const text=composeNarrative(answers);
  const a=localAnalysis(text);
  assert.ok(a.events.includes(expected),`${expected} :: ${text} => ${a.events}`);
  assert.ok(a.eventEvidence[expected]&&text.includes(a.eventEvidence[expected]),'evidence must be verbatim');
  assert.ok(questionsFor(a).some(q=>q.id===`details_${expected}`));
 }
});

test('missing facts are reported for a thin narrative and disappear as they are answered',()=>{
 const thin=missingFacts('یه چیزی شد').map(f=>f.id);
 for(const id of ['clarify','time','place','person','method','reason','evidence','source'])assert.ok(thin.includes(id),id);
 const full=composeNarrative({result:'دو نفر ناشناس آمدند. کیف و گوشی',when:'دیروز',where:'خیابان بهار',
  who:'این اتفاق برای خودم افتاد',method:'شیشهٔ ماشین را شکستند',
  evidence:'تصویر دوربین محل موجود است',source:'من خودم این را دیدم'});
 const left=missingFacts(full).map(f=>f.id);
 assert.deepEqual(left,['reason']);
 const coverage=factCoverage(full);
 assert.equal(coverage.total,8);assert.equal(coverage.count,7);
 // An unknown motive is never filled in on the reporter's behalf.
 assert.equal(full.includes('انگیزه'),false);
});

test('every missing-fact prompt carries a question and a hint that allows «I do not know»',()=>{
 for(const fact of missingFacts('یه چیزی شد')){
  assert.ok(fact.title.length>8,fact.id);assert.ok(fact.hint.length>8,fact.id);
  assert.ok(fact.label&&fact.label.length<=20,fact.id);
 }
 assert.match(missingFacts('یه چیزی شد').find(f=>f.id==='reason').hint,/حدس/);
 assert.match(missingFacts('یه چیزی شد').find(f=>f.id==='method').hint,/حدس/);
});

test('the guide never advances past an unanswered opening question',()=>{
 assert.equal(nextGuideStep({}),0);
 assert.equal(nextGuideStep({what:'سرقت رخ داد'},1),1);
});

test('the analysis summary names topics only when the engine found them',()=>{
 assert.match(explainAnalysis(localAnalysis('یه چیزی شد')),/هنوز موضوع مشخصی/);
 assert.match(explainAnalysis(localAnalysis('دیروز کیفم را دزدیدند')),/سرقت/);
});

test('dictation works from the browser engine alone, with no key and no request',()=>{
 let started=0,stopped=0,handlers={};
 class Engine{
  start(){started++;if(started>1&&!this._resumed)this._resumed=true}
  stop(){stopped++;handlers.onend?.()}
  set onresult(fn){handlers.onresult=fn} set onerror(fn){handlers.onerror=fn} set onend(fn){handlers.onend=fn}
  get onresult(){return handlers.onresult} get onerror(){return handlers.onerror} get onend(){return handlers.onend}
 }
 const finals=[],partials=[],states=[];
 const d=createDictation({Engine,onFinal:t=>finals.push(t),onPartial:t=>partials.push(t),onState:s=>states.push(s)});
 d.start();
 assert.equal(started,1);assert.deepEqual(states,['listening']);
 handlers.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'دیروز کیفم'}}]});
 handlers.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'دیروز کیفم را دزدیدند'}}]});
 assert.deepEqual(partials,['دیروز کیفم']);
 assert.deepEqual(finals,['دیروز کیفم را دزدیدند']);
 d.stop();
 assert.equal(stopped,1);assert.deepEqual(states,['listening','idle']);
 assert.equal(d.active,false);
});

test('a browser without speech recognition says so instead of failing silently',()=>{
 const errors=[];
 const d=createDictation({Engine:null,onError:e=>errors.push(e)});
 d.start();
 assert.equal(errors.length,1);assert.match(errors[0],/پشتیبانی نمی‌کند|بنویسید/);
 assert.equal(speechSupported({}),false);
 assert.equal(speechSupported({SpeechRecognition:class{}}),true);
 assert.equal(speechMessage('aborted'),'');
 assert.match(speechMessage('not-allowed'),/میکروفون/);
});

test('a silent moment does not end the session, and dictated sentences join cleanly',()=>{
 let handlers={},stops=0;
 class Engine{start(){}stop(){stops++;handlers.onend?.()}
  set onresult(f){handlers.onresult=f}set onerror(f){handlers.onerror=f}set onend(f){handlers.onend=f}
  get onresult(){return handlers.onresult}get onerror(){return handlers.onerror}get onend(){return handlers.onend}}
 const errors=[],states=[];
 const d=createDictation({Engine,onError:e=>errors.push(e),onState:s=>states.push(s)});
 d.start();
 handlers.onerror({error:'no-speech'});
 assert.equal(d.active,true,'a pause must not end dictation');
 assert.deepEqual(states,['listening']);
 d.stop();assert.equal(stops,1);
 assert.equal(appendSpeech('','سلام'),'سلام');
 assert.equal(appendSpeech('دیروز اتفاقی افتاد.','کیفم را بردند'),'دیروز اتفاقی افتاد. کیفم را بردند');
 assert.equal(appendSpeech('دیروز اتفاقی افتاد','کیفم را بردند'),'دیروز اتفاقی افتاد، کیفم را بردند');
});

test('the composer carries no instructions and opens the interview by itself',async()=>{
 const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 // No panel advertises the interview any more: the assistant recognises a
 // reporter who cannot describe the event and opens it without being asked.
 assert.equal(/guide-offer/.test(source),false);
 assert.equal(/missingPanel|guidanceBlocks/.test(source),false);
 assert.match(source,/guidanceNeed\(state\.text\)\.need/);
 assert.match(source,/data-action="dictate"/);
 // Analysis must never be gated on an external service being configured.
 assert.equal(/throw new Error\(config\.error/.test(source),false);
 assert.match(source,/engineNote/);
});

// ---------------------------------------------------------------- edge cases
test('«نمی‌دانم» at any step leaves that fact out instead of inventing one',()=>{
 // A skipped step contributes nothing, and the fact stays on the missing list.
 const answers={result:'سرقت رخ داد',when:'دیروز'};
 const text=composeNarrative(answers);
 const missing=missingFacts(text).map(f=>f.id);
 for(const id of ['place','person','method','reason','evidence'])assert.ok(missing.includes(id),id);
 // The narrative must not contain a placeholder standing in for the unknown.
 for(const invented of ['نامعلوم','نامشخص','undefined','null','خالی','سایر'])assert.equal(text.includes(invented),false,invented);
 // An option whose recorded phrase is empty («دلیلی نمی‌دانم») stores nothing.
 const reasonStep=GUIDE_STEPS.find(s=>s.id==='reason');
 const unknownOption=reasonStep.options.find(o=>o.label==='دلیلی نمی‌دانم');
 assert.equal(unknownOption.phrase,'');
 assert.equal(composeNarrative({result:'سرقت رخ داد',reason:unknownOption.phrase}).includes('دلیل'),false);
});

test('a corrected answer replaces the earlier one and leaves no trace of it',()=>{
 const answers={result:'سرقت رخ داد',where:'خیابان بهار'};
 answers.where='کوچه گلستان';
 const text=composeNarrative(answers);
 assert.match(text,/کوچه گلستان/);
 assert.equal(text.includes('خیابان بهار'),false);
 // Correcting the opening answer changes the topic the narrative carries.
 const corrected=composeNarrative({...answers,result:'آتش‌سوزی رخ داد'});
 assert.deepEqual(localAnalysis(corrected).events,['fire']);
 assert.equal(corrected.includes('سرقت'),false);
});

test('a negated answer is not turned into a positive report',()=>{
 for(const [detail,forbidden] of [
  ['سرقتی رخ نداد و فقط شیشه شکسته بود','theft'],
  ['کسی کتک نخورد','assault'],
  ['آتش‌سوزی نشد','fire'],
 ]){
  const text=composeNarrative({result:`تخریب اموال رخ داد. ${detail}`});
  assert.equal(localAnalysis(text).events.includes(forbidden),false,detail);
 }
});

test('several events described in one answer all survive into the report',()=>{
 const text=composeNarrative({result:'سرقت رخ داد. شیشهٔ ماشین را شکستند و بعد تهدیدم کردند',when:'دیروز'});
 const a=localAnalysis(text);
 for(const id of ['theft','damage'])assert.ok(a.events.includes(id),`${id} :: ${a.events}`);
 assert.ok(a.events.some(id=>['harassment','weapon_threat','pdf_a16'].includes(id)),String(a.events));
 // Every topic keeps a quote taken verbatim from the composed narrative.
 for(const id of a.events)assert.ok(text.includes(a.eventEvidence[id]),id);
});

test('a reason or evidence the reporter never gave is never written into the report',()=>{
 const text=composeNarrative({result:'نزاع و درگیری رخ داد',when:'دیشب',where:'کوچه گلستان',who:'این اتفاق برای فرد دیگری افتاد'});
 for(const phrase of ['گفتند سر','از قبل','عکس دارم','فیلم دارم','دوربین','شاهد بود','رسید'])assert.equal(text.includes(phrase),false,phrase);
 const missing=missingFacts(text).map(f=>f.id);
 assert.ok(missing.includes('reason'));assert.ok(missing.includes('evidence'));
 // Asking again is the only remedy the engine offers for an unknown fact.
 const reason=missingFacts(text).find(f=>f.id==='reason');
 assert.match(reason.hint,/نمی‌دانم|حدس/);
});

test('an empty interview produces nothing rather than an empty-looking report',()=>{
 assert.equal(composeNarrative({}),'');
 assert.equal(composeNarrative({when:'دیروز'}),'دیروز.');
 // A narrative with no behaviour still asks the clarifying question first.
 assert.equal(missingFacts('دیروز.')[0].id,'clarify');
});

test('browser speech support is reported from the engine, never assumed',()=>{
 assert.equal(speechSupported({}),false);
 assert.equal(speechSupported({webkitSpeechRecognition:class{}}),true);
 // Persian support varies by build; the browser reports it as an error we relay.
 assert.match(speechMessage('language-not-supported'),/فارسی/);
 // The site must not claim the audio stays on the device.
 assert.match(speechMessage('network'),/اینترنت/);
});

test('the belongings answer is recorded as written, never recast as damage',()=>{
 const text=composeNarrative({result:'کیفم را بردند. کیفم سالم پیدا شد'});
 assert.match(text,/کیفم سالم پیدا شد/);
 // The engine must not contradict the reporter by asserting damage.
 assert.equal(/آسیب دید|از بین رفت/.test(text),false,text);
 assert.match(composeNarrative({result:'سرقت رخ داد. گوشی و کیف'}),/گوشی و کیف/);
});

test('an unknown motive is not mistaken for an inability to describe the event',()=>{
 assert.equal(guidanceNeed('دیروز در خیابان بهار کیفم را دزدیدند ولی نمی‌دانم چرا').need,'ok');
 assert.equal(guidanceNeed('کیفم را زدند، نمی‌دانم کی بود').need,'ok');
 assert.equal(guidanceNeed('دیشب شیشهٔ مغازه را شکستند، نمی‌دانم چه کسی').need,'ok');
 // A reporter who genuinely cannot start still reaches the interview.
 for(const text of ['نمیدونم چی بگم','نمی‌دانم چه بنویسم','راهنماییم کن'])assert.equal(guidanceNeed(text).need,'unsure',text);
});

test('a bare quantity is not read as a time',()=>{
 assert.ok(missingFacts('دو نفر ۳ گوشی را دزدیدند').map(f=>f.id).includes('time'));
 assert.ok(missingFacts('۵ عدد لاستیک بردند').map(f=>f.id).includes('time'));
 // Real time expressions still count.
 for(const text of ['ساعت ۱۰ صبح کیفم را بردند','دیروز کیفم را بردند','در سال ۱۴۰۴ رخ داد','ساعت ۱۴:۳۰ اتفاق افتاد'])
  assert.equal(missingFacts(text).map(f=>f.id).includes('time'),false,text);
});

test('«نمی‌دانم چرا این کار را کرد» produces no cause in the report',()=>{
 const text=composeNarrative({result:'نزاع و درگیری رخ داد. نمی‌دانم چرا این کار را کرد',reason:''});
 assert.match(text,/نمی‌دانم چرا این کار را کرد/);
 for(const invented of ['سر اختلاف','سر پول','به خاطر','انگیزه او','کینه'])assert.equal(text.includes(invented),false,invented);
});

test('«شاهدی ندارم» produces no witness in the report',()=>{
 const text=composeNarrative({result:'سرقت رخ داد',evidence:'شاهدی ندارم'});
 assert.match(text,/شاهدی ندارم/);
 for(const invented of ['شاهد بود','عکس دارم','فیلم دارم','دوربین'])assert.equal(text.includes(invented),false,invented);
});

test('a corrected time keeps the correction and drops the first answer',()=>{
 const answers={result:'سرقت رخ داد',when:'دیروز'};
 answers.when='پریروز';
 const text=composeNarrative(answers);
 assert.match(text,/پریروز/);assert.equal(text.includes('دیروز'),false);
 // A correction written into the free text is preserved verbatim.
 const spelled=composeNarrative({result:'سرقت رخ داد',when:'اول گفتم دیروز، اشتباه کردم پریروز بود'});
 assert.match(spelled,/اشتباه کردم پریروز بود/);
});

test('«گم کرده‌ام» is not turned into a definite theft',()=>{
 const text=composeNarrative({result:'گوشی‌ام را ندزدیدند، گم کرده‌ام'});
 assert.equal(localAnalysis(text).events.includes('theft'),false,text);
 assert.equal(localAnalysis('گوشی‌ام را ندزدیدند، گم کرده‌ام').events.includes('theft'),false);
});

test('a stuck reporter is asked one plain question that suggests no answer',()=>{
 const first=GUIDE_STEPS[0];
 assert.equal(first.id,'source');
 assert.equal(first.title,'این را خودتان دیدید یا از کسی شنیدید؟');
 // Neither the question nor the hint tells the reporter what to say happened.
 for(const leading of ['احتمالا','حتما','باید','مطمئنا','شما که'])assert.equal(first.title.includes(leading),false,leading);
 // Every option is how they know, not a claim put in their mouth.
 assert.ok(first.options.length>=4);
 // And nothing is recorded until they choose or write.
 assert.equal(composeNarrative({}),'');
});

test('an unknown fact can always be skipped, in the interview and in the questionnaire',async()=>{
 const {answerIsUnknown}=await import('./public/answers.js');
 // Every interview step offers a skip; nothing is mandatory.
 const skippable=GUIDE_STEPS.filter(s=>s.skippable).map(s=>s.id);
 for(const id of ['when','where','who','result','method','reason','source'])assert.ok(skippable.includes(id),id);
 assert.equal(GUIDE_STEPS.filter(s=>!s.skippable).length,0);
 // «نمی‌دانم» stays a valid answer in the questionnaire and disables that section's rows.
 for(const value of ['نمی‌دانم','نمیدونم','اطلاعی ندارم','نامعلوم'])assert.equal(answerIsUnknown(value),true,value);
 const view=await readFile(new URL('./public/guide-view.js',import.meta.url),'utf8');
 assert.match(view,/data-action="guide-skip"/);
 const app=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 assert.match(app,/'guide-skip':/);
});

test('the report is never filed without the reporter confirming it',async()=>{
 const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 // The submit control stays disabled until the confirmation box is ticked.
 assert.match(source,/#submit-report'\)\.disabled=!e\.target\.checked/);
 assert.match(source,/state\.confirmed=e\.target\.checked/);
 // Any later edit clears the confirmation rather than carrying it over.
 assert.ok(source.split('state.confirmed=false').length>5);
});

// ------------------------------------------------- situational follow-ups
test('actor and count are one question rather than a distant duplicate',async()=>{
 const {stepsFor,GUIDE_STEPS}=await import('./public/guidance.js');
 const who=GUIDE_STEPS.find(s=>s.id==='who');
 assert.match(who.title,/چه کسی یا چه کسانی/);assert.match(who.hint,/تعداد/);
 for(const result of ['سرقت رخ داد','نزاع و درگیری رخ داد','چراغ کوچه خاموش است','آتش‌سوزی رخ داد']){
  const ids=stepsFor({result}).map(s=>s.id);assert.ok(ids.includes('who'));assert.ok(!ids.includes('peopleCount'),result);
 }
});

test('answering who opens actor details; an unknown actor closes the dependent branch',async()=>{
 const {stepsFor}=await import('./public/guidance.js');
 const ids=(a,skip=[])=>stepsFor(a,'',skip).map(s=>s.id);
 const before=ids({result:'سرقت رخ داد'});
 assert.equal(before.includes('peopleDescription'),false,'not asked before the actor is known');
 const after=ids({result:'سرقت رخ داد',who:'دو نفر این کار را انجام دادند'});
 assert.ok(after.includes('peopleDescription'));assert.ok(after.includes('peopleKnown'));
 assert.equal(after.indexOf('peopleDescription'),after.indexOf('who')+1);
 assert.ok(after.indexOf('peopleKnown')<after.indexOf('when'));
 assert.equal(after.indexOf('peopleKnown'),after.indexOf('peopleDescription')+1);
 assert.equal(ids({result:'سرقت رخ داد'},['who']).includes('peopleDescription'),false);
 assert.equal(ids({result:'سرقت رخ داد',who:'نمی‌دانم'}).includes('peopleDescription'),false);
 // An older answer is still useful, while an explicitly skipped old count
 // must not be followed by more questions about the unknown person.
 assert.ok(ids({result:'سرقت رخ داد',peopleCount:'دو نفر در این اتفاق دخیل بودند'}).includes('peopleDescription'));
 assert.ok(!ids({result:'سرقت رخ داد',who:'یک نفر'},['peopleCount']).includes('peopleDescription'));
 assert.ok(!ids({result:'سرقت رخ داد',who:'فرد انجام‌دهنده برای من آشنا بود'}).includes('peopleKnown'));
});

test('vehicle, money and platform questions follow the account, not every report',async()=>{
 const {stepsFor}=await import('./public/guidance.js');
 const ids=a=>stepsFor(a).map(s=>s.id);
 assert.ok(ids({result:'تصادف رخ داد'}).includes('vehicleInvolved'));
 assert.equal(ids({result:'آتش‌سوزی رخ داد'}).includes('vehicleInvolved'),false);
 assert.ok(ids({result:'سرقت رخ داد',vehicleInvolved:'یک موتورسیکلت در این اتفاق نقش داشت'}).includes('vehicleDescription'));
 assert.ok(ids({result:'کلاهبرداری رخ داد'}).includes('amount'));
 assert.equal(ids({result:'چراغ کوچه چند شب است خاموش است'}).includes('amount'),false);
 assert.ok(ids({result:'کلاهبرداری رخ داد',detail:'در تلگرام پول گرفت'}).includes('platform'));
 assert.equal(ids({result:'آتش‌سوزی رخ داد'}).includes('platform'),false);
});

test('every situational answer is optional and reaches the narrative verbatim',async()=>{
 const {stepsFor}=await import('./public/guidance.js');
 for(const step of stepsFor({result:'سرقت رخ داد',peopleCount:'دو نفر در این اتفاق دخیل بودند',vehicleInvolved:'یک خودرو در این اتفاق نقش داشت'}))
  assert.ok(step.skippable,step.id);
 const text=composeNarrative({result:'سرقت رخ داد',peopleCount:'دو نفر در این اتفاق دخیل بودند',
  peopleDescription:'یکی قد بلند با کاپشن مشکی',peopleKnown:'افراد برای من ناشناس بودند',
  vehicleInvolved:'یک موتورسیکلت در این اتفاق نقش داشت',vehicleDescription:'دو رقم آخر پلاک ۴۷',amount:'حدود دوازده میلیون تومان'});
 for(const fragment of ['دو نفر','یکی قد بلند با کاپشن مشکی','ناشناس بودند','موتورسیکلت','دو رقم آخر پلاک ۴۷','دوازده میلیون'])
  assert.ok(text.includes(fragment),fragment);
 // Nothing is invented for a branch that was never answered.
 const bare=composeNarrative({result:'سرقت رخ داد'});
 for(const invented of ['نفر','پلاک','مبلغ','ظاهر'])assert.equal(bare.includes(invented),false,invented);
});

// ---------------------------------------------------------------------------
// Situation reading: the assistant must behave as though it had read what the
// reporter already wrote, must notice when a phone call comes before a form,
// and must not treat «نمی‌دانم» as a fact.
// ---------------------------------------------------------------------------
import {stepsFor,finalNarrative,readAnswer,triage,interviewProgress,assist,isNonAnswer} from './public/guidance.js';

const ids = (answers,base='')=>stepsFor(answers,base).map(s=>s.id);

test('a fact the reporter already wrote is never asked again',()=>{
 const base='دیشب حدود ساعت ۱۱ در خیابان بهار موتورم را بردند، قفلش را شکسته بودند.';
 const asked=ids({},base);
 // Time, place, the behaviour itself and the method are all in their sentence.
 for(const skipped of ['when','where','method'])assert.equal(asked.includes(skipped),false,skipped);
 // What is genuinely missing is still asked.
 for(const kept of ['who','source','reason'])assert.ok(asked.includes(kept),kept);
 // With no text of their own, the full interview is offered.
 for(const kept of ['source','who','when','where','result','reason','method'])assert.ok(ids({},'').includes(kept),kept);
});

test('the interview never collapses to nothing, however complete the text',()=>{
 const base='دیروز ساعت سه در خیابان ولیعصر دو نفر ناشناس با شکستن قفل موتورم را بردند؛ فیلم دوربین را دارم و خودم دیدم، گفتند سر بدهی بوده است.';
 assert.ok(stepsFor({},base).length>=1);
});

test('branches open from the reporter’s own words, not only from the interview',()=>{
 assert.ok(ids({},'دو نفر در کوچه همسایه را با چاقو تهدید کردند و کتکش زدند').includes('injury'));
 assert.ok(ids({},'چراغ کوچه خاموش است و کسی رسیدگی نمی‌کند').includes('ongoing'));
 // A calm property report opens none of the harm branches.
 const calm=ids({},'دیروز از مغازه جنس بردند');
 for(const noise of ['injury','childInvolved','paymentMethod'])assert.equal(calm.includes(noise),false,noise);
});

test('a branch that depends on an answer appears only after that answer',()=>{
 const base='در کوچه دعوا شد و یکی خونی شد';
 assert.equal(ids({},base).includes('injuryCare'),false);
 assert.ok(ids({injury:'یک نفر آسیب جدی دید'},base).includes('injuryCare'));
 assert.equal(ids({injury:'کسی در این اتفاق آسیب ندید'},base).includes('injuryCare'),false);
});

test('an account that is still running is told to call before it is asked to type',()=>{
 const urgent=triage('الان دارن تو کوچه همسایه رو کتک میزنن و خونی شده');
 assert.equal(urgent.level,'emergency');
 assert.ok(urgent.numbers.includes('۱۱۰'));
 assert.ok(triage('همین الان بوی گاز میاد و دارد نشت می‌کند').numbers.includes('۱۲۵'));
 assert.equal(triage('برادرم قرص خورده و بیهوش شده').numbers.includes('۱۱۵'),true);
 // A report with no urgent behaviour in it gets no panel at all.
 for(const calm of ['چراغ کوچه خاموش است','از یک سایت خرید کردم و کالا نرسید','قبض برقم اشتباه آمده'])
  assert.equal(triage(calm).level,'none',calm);
});

test('urgency is read from the behaviour, not only from the word «الان»',()=>{
 // A theft or a rape reported calmly, hours later, still deserves the number.
 for(const urgent of ['دیروز موتورم را دزدیدند','به من تجاوز شد','دیشب به مغازه‌ام دستبرد زدند'])
  assert.ok(triage(urgent).numbers.includes('۱۱۰'),urgent);
 assert.ok(triage('دیشب خانه‌مان آتش گرفت').numbers.includes('۱۲۵'));
 assert.ok(triage('یک کارگر از داربست افتاد').numbers.includes('۱۱۵'));
 // A finished report is «attention», not «emergency»: the wording decides how
 // loudly, the behaviour decides whether at all.
 assert.equal(triage('دیروز موتورم را دزدیدند').level,'attention');
 assert.equal(triage('الان دارن موتورمو میبرن').level,'emergency');
 // At most two numbers reach the screen.
 for(const t of ['به من تجاوز شد','الان دارن همسایه رو با چاقو میزنن و خونی شده'])
  assert.ok(triage(t).numbers.length<=2,t);
 // Complaints never raise it.
 for(const calm of ['تأخیر قطار و بی‌پاسخ ماندن شکایت','گران‌فروشی در میوه‌فروشی'])
  assert.equal(triage(calm).numbers.length,0,calm);
});

test('«نمی‌دانم» in an answer box is a skip, never a recorded fact',()=>{
 for(const value of ['نمیدونم','نمی‌دانم','یادم نیست','ندیدم','مطمئن نیستم','',' ','؟'])
  assert.ok(readAnswer(value).skipped,value);
 assert.ok(isNonAnswer('نمیدونم'));
 const real=readAnswer('پراید سفید بود');
 assert.equal(real.skipped,false);
 assert.equal(real.answer,'پراید سفید بود');
 // And it leaves no trace in the narrative.
 const text=finalNarrative({what:'سرقت رخ داد'},'');
 for(const word of ['نمی‌دانم','نمیدونم','یادم نیست'])assert.equal(text.includes(word),false,word);
});

test('the reporter’s own sentence survives the interview verbatim',()=>{
 const base='دیشب جلوی در خانه، کیفم را از دستم کشیدند و فرار کردند.';
 const text=finalNarrative({who:'این اتفاق برای خودم افتاد',peopleCount:'دو نفر در این اتفاق دخیل بودند'},base);
 assert.ok(text.startsWith(base));
 assert.ok(text.includes('دو نفر'));
});

test('a complete account can be filed without walking every remaining question',()=>{
 const full='دیروز ساعت چهار در خیابان بهار دو نفر ناشناس با شکستن شیشه، کیف داخل خودرو را بردند؛ خودم دیدم و فیلم دوربین را دارم.';
 assert.ok(interviewProgress({},full).enough);
 assert.equal(interviewProgress({},'').enough,false);
});

test('assist reports understanding, gaps and urgency in one call, and invents nothing',()=>{
 const out=assist('دیشب در خیابان بهار موتورم را بردند');
 // A stolen motorbike is now «سرقت خودرو», a kind of theft.
 assert.ok(out.topics.includes('vehicle_theft'));
 assert.ok(out.missing.some(f=>f.id==='evidence'));
 assert.equal(out.triage.level,'attention');
 assert.ok(out.triage.numbers.includes('۱۱۰'));
 assert.equal(out.need.need,'ok');
 const blank=assist('نمیدونم چی بگم');
 assert.equal(blank.need.need,'unsure');
 assert.deepEqual(blank.topics,[]);
});

// ---------------------------------------------------------------------------
// A question the reporter has already answered in their own words must not be
// asked again. The answer is not copied anywhere: their sentence is already in
// the report, so dropping the question is what «auto-filled» means here.
// ---------------------------------------------------------------------------
test('a full account leaves almost nothing to ask',()=>{
 const base='دیشب ساعت ۱۱ در خیابان بهار دو نفر با شکستن قفل موتورم را بردند، یکیشان کاپشن مشکی داشت و ناشناس بودند. خودم دیدم و فیلم دوربین را دارم.';
 const asked=ids({},base);
 for(const already of ['what','when','where','method','who','peopleCount','peopleDescription','peopleKnown','evidence','source','detail','result','vehicleInvolved'])
  assert.equal(asked.includes(already),false,already);
 assert.ok(asked.length<=3,`asked ${asked.join(',')}`);
});

test('the retired how-many question never repeats, whether a count was supplied or not',()=>{
 for(const said of ['دو نفر آمدند و کیفم را بردند','یه نفر موتورمو برد','سه تا مرد ریختند داخل مغازه','چند نفر به من حمله کردند','کسی وارد مغازه شد و جنس‌ها را برد'])
  assert.equal(ids({},said).includes('peopleCount'),false,said);
});

test('each kind of detail closes its own question and no other',()=>{
 const check=(text,closed,open)=>{
  const asked=ids({},text);
  assert.equal(asked.includes(closed),false,`${closed} should be closed by: ${text}`);
  if(open)assert.ok(asked.includes(open),`${open} should stay open for: ${text}`);
 };
 check('دو میلیون تومان کارت به کارت کردم','amount');
 check('از طریق تلگرام با من تماس گرفت','platform');
 check('یک پراید سفید به من زد و فرار کرد','vehicleDescription');
 check('دستم زخمی شد و به درمانگاه رفتم','injury');
 check('این چندمین بار است که تکرار می‌شود','repeated');
 check('چاقو دستش بود','weapon');
 check('قبلاً به کلانتری شکایت کردم','reportedBefore');
});

test('a legacy count answer remains in the narrative without reviving the duplicate question',()=>{
 const base='دو نفر آمدند و کیفم را بردند',answer='سه تا پنج نفر در این اتفاق دخیل بودند';
 assert.equal(ids({peopleCount:answer},base).includes('peopleCount'),false);
 assert.ok(composeNarrative({peopleCount:answer}).includes(answer));
 // Old draft migration can reconstruct the historical question list.
 assert.ok(stepsFor({peopleCount:answer},base,[],{legacyPeople:true}).some(s=>s.id==='peopleCount'));
});

// ---------------------------------------------------------------------------
// The guide and the questionnaire are one conversation. What the guide learned
// — including an explicit «نمی‌دانم» — must not be asked again.
// ---------------------------------------------------------------------------
import {carryGuideAnswers} from './public/guidance.js';

test('an «I don’t know» in the guide closes the same question in the questionnaire',()=>{
 const {answers,detailsUnknown}=carryGuideAnswers({what:'سرقت رخ داد'},['when','where','source','peopleCount','result','vehicleInvolved','detail']);
 assert.equal(answers.time,'زمان دقیق را نمی‌دانم');
 assert.equal(answers.place,'مکان را نمی‌دانم');
 assert.equal(answers.source,'اطلاعی ندارم');
 assert.equal(answers.person,'خیر، اطلاعی ندارم');
 assert.equal(answers.object,'خیر، اطلاعی ندارم');
 assert.equal(answers.vehicle,'خیر، اطلاعی ندارم');
 assert.equal(detailsUnknown,true);
});

test('a real answer in the guide is carried in the questionnaire’s own wording',()=>{
 const {answers}=carryGuideAnswers({when:'دیشب',where:'خیابان بهار',source:'این را از فرد دیگری شنیدم'},[]);
 assert.equal(answers.time,'دیشب');
 assert.equal(answers.place,'خیابان بهار');
 assert.equal(answers.source,'از شخص دیگری شنیدم');
 // «it happened to me» answers how they know, too
 assert.equal(carryGuideAnswers({who:'این اتفاق برای خودم افتاد'},[]).answers.source,'برای خودم اتفاق افتاده');
});

test('a question the guide never asked carries nothing, so it is asked once, not skipped',()=>{
 const {answers,detailsUnknown}=carryGuideAnswers({what:'سرقت رخ داد'},[]);
 assert.deepEqual(answers,{});
 assert.equal(detailsUnknown,false);
 // Knowing the count but not the faces does not close the people section.
 assert.equal(carryGuideAnswers({peopleCount:'دو نفر در این اتفاق دخیل بودند'},['peopleDescription']).answers.person,undefined);
});

test('the narrative’s own place and source are captured verbatim for confirmation',()=>{
 const a=localAnalysis('دیشب در خیابان بهار دو نفر کیفم را بردند. همسایه‌مان دید و به من گفت.');
 assert.equal(a.known.place,'خیابان بهار');
 assert.equal(a.known.source,'همسایه‌مان دید و به من گفت');
 assert.equal(localAnalysis('در خیابان شهید بهشتی تصادف شد').known.place,'خیابان شهید بهشتی');
 assert.equal(localAnalysis('موتورم را بردند').known.place,'');
});
