import test from 'node:test';
import assert from 'node:assert/strict';
import {
 GUIDE_STEPS, coreStepsFor, stepsFor, guideStageWithContext, guideAnswersFromTurns,
 finalNarrative, migrateGuideOrder, interviewOptionLabels,
} from './public/guidance.js';
import {orderedInterviewPath, orderedClientStep} from './public/interview-order.js';
import {newInterview, answerCurrent, applyStep, stepBack} from './public/ai-interview.js';
import {interviewInput, interviewStep} from './llm.js';

const step = (id, text = '', answers = {}, skipped = []) => stepsFor(answers, text, skipped).find(s => s.id === id);
const labels = s => (s?.options || []).map(o => o.label);
const phrases = s => (s?.options || []).map(o => o.phrase).filter(Boolean);
const expectedSelfHarm = ['فرد یا افراد مورد اشاره را می‌شناسم', 'فرد یا افراد مورد اشاره را نمی‌شناسم'];
const sourceTurn = a => ({stage: 'source', q: GUIDE_STEPS[0].title, a});

test('the precise self-harm report offers neutral person information, not contradictory counts', () => {
 for (const text of ['یک نفر خودکشی کرد', 'فردی به خودش آسیب زد', 'کسی گفت قصد خودکشی دارد',
  'دو نفر خودکشی کردند', 'تعدادی خودکشی کردند', 'فردی خودكشي کرد']) {
  const who = step('who', text);
  assert.ok(who, text);
  assert.deepEqual(labels(who), expectedSelfHarm, text);
  assert.ok(who.allowFreeText && who.skippable);
  assert.ok(!labels(who).includes('یک نفر') && !labels(who).includes('چند نفر'));
  assert.ok(!phrases(step('reason', text)).some(x => /اختلاف|پول|بدهی/.test(x)), text);
  const injury = step('injury', text);
  if (injury) {
   assert.deepEqual(phrases(injury), [], text);
   assert.ok(injury.allowFreeText && injury.skippable);
  }
 }
 // Neither classifying the text nor showing a shortcut writes an answer.
 assert.equal(finalNarrative({}, 'یک نفر خودکشی کرد'), 'یک نفر خودکشی کرد');
 assert.deepEqual(labels(GUIDE_STEPS.find(s => s.id === 'who')), ['یک نفر', 'چند نفر', 'فرد ناشناس', 'فرد آشنا']);
});

test('unknown, counted, ambiguous, negated and mixed descriptions get different safe choices', () => {
 const unspecific = step('who', 'نمیدونم چی بگم');
 assert.deepEqual(labels(unspecific), []);
 assert.ok(unspecific.allowFreeText && unspecific.skippable);
 assert.deepEqual(labels(step('who', 'کیف سرقت شد')), ['یک نفر', 'چند نفر', 'فرد ناشناس', 'فرد آشنا']);
 // A chosen count remains editable when going Back; it must not filter itself.
 assert.deepEqual(labels(step('who', 'کیف سرقت شد', {who:'چند نفر این کار را انجام دادند'})),
  ['یک نفر', 'چند نفر', 'فرد ناشناس', 'فرد آشنا']);
 for (const text of ['کیف سرقت شد و یک نفر شاهد بود', 'کیف سرقت شد و دو نفر شاهد بودند',
  'کیف سرقت شد و ۲ نفر شاهد بودند', 'کیف سرقت شد و ٢ نفر شاهد بودند']) {
  const names = labels(step('who', text));
  assert.deepEqual(names, ['فرد ناشناس', 'فرد آشنا'], text);
 }
 for (const text of ['یک نفر در تصادف مجروح شد', 'خانه آتش گرفت', 'یک نفر خودکشی نکرد',
  'یک نفر خودکشی کرد، همان روز کیف سرقت شد']) {
  const who = step('who', text);
  if (who) assert.deepEqual(labels(who), [], text);
 }
 // Negating self-harm must not prevent choices for an independently reported theft.
 assert.deepEqual(labels(step('who', 'کسی خودکشی نکرد، ولی کیف سرقت شد')),
  ['یک نفر', 'چند نفر', 'فرد ناشناس', 'فرد آشنا']);
});

test('suggestions for motives and examples are limited to the reported context', () => {
 for (const text of ['', 'خانه آتش گرفت', 'کیف سرقت شد', 'یک نفر خودکشی کرد', 'تصادف شد']) {
  assert.deepEqual(phrases(step('reason', text)), [], text);
 }
 const dispute = step('reason', 'دیشب دو نفر با هم دعوا کردند');
 assert.deepEqual(phrases(dispute), ['گفتند سر اختلاف قبلی بوده است']);
 assert.deepEqual(labels(dispute).filter(x=>x!=='دلیلی نمی‌دانم'), phrases(dispute));
 assert.deepEqual(phrases(step('reason', 'اختلاف خانوادگی درباره بدهی پیش آمد')),
  ['گفتند سر اختلاف قبلی بوده است', 'گفتند سر پول یا بدهی بوده است']);
 const reason = GUIDE_STEPS.find(s => s.id === 'reason');
 assert.deepEqual(phrases(guideStageWithContext(reason, 'گزارش درگیری است، شاید بدهی داشته‌اند')), []);
 assert.deepEqual(phrases(guideStageWithContext(reason, 'گزارش درگیری است، اختلاف بر سر بدهی نبود')), []);
 const result = GUIDE_STEPS.find(s => s.id === 'result');
 const method = GUIDE_STEPS.find(s => s.id === 'method');
 for (const text of ['', 'آتش سوزی شد', 'یک نفر خودکشی کرد']) {
  assert.doesNotMatch(guideStageWithContext(result, text).placeholder, /شیشه|کیف/);
  assert.doesNotMatch(guideStageWithContext(method, text).placeholder, /شیشه|کیف/);
 }
 assert.match(guideStageWithContext(result, 'کیف سرقت شد').placeholder, /شیشه/);
});

test('answers can add or remove suggestions without moving the seven-stage cursor', () => {
 const blank = 'نمیدونم چی بگم';
 const described = {source:'از همسایه شنیدم یک نفر خودکشی کرد'};
 assert.deepEqual(labels(step('who', blank, described)), expectedSelfHarm);
 assert.deepEqual(labels(step('who', blank, {source:'خودم دیدم کیف سرقت شد'})),
  ['یک نفر', 'چند نفر', 'فرد ناشناس', 'فرد آشنا']);
 const emptyIds = coreStepsFor({}, '').map(s => s.id);
 assert.deepEqual(coreStepsFor(described, '').map(s => s.id), emptyIds);
 const turns = [];
 const answers = ['از همسایه شنیدم یک نفر خودکشی کرد', expectedSelfHarm[0], 'دیروز', 'تهران', 'گفته‌اش را شنیدم', '', ''];
 for (let i = 0; i < GUIDE_STEPS.length; i++) {
  const path = orderedInterviewPath({mode:'intake', text:blank, turns});
  assert.equal(path.error, undefined);
  assert.equal(path.next.id, GUIDE_STEPS[i].id);
  if (i === 1) assert.deepEqual(labels(path.next), expectedSelfHarm);
  turns.push({stage:path.next.id, q:path.next.title, a:answers[i]});
 }
 const complete = orderedInterviewPath({mode:'intake', text:blank, turns});
 assert.equal(complete.error, undefined);
 assert.equal(complete.next, null);
 assert.equal(guideAnswersFromTurns(complete.turns).answers.who, expectedSelfHarm[0]);
});

test('server and client ignore model-proposed keywords and agree on contextual options', async () => {
 const turns = [sourceTurn('خودم دیدم')];
 const input = {mode:'detail', text:'یک نفر خودکشی کرد', turns, topics:[]};
 assert.notEqual(typeof interviewInput(input), 'string');
 const model = async () => ({done:true, question:'پرسش ساختگی', options:['یک نفر', 'چند نفر', 'انگیزه مالی'], facts:[]});
 const server = await interviewStep(model, input);
 const client = orderedClientStep({mode:'detail', turns}, {done:true, options:['یک نفر', 'چند نفر']}, input.text);
 assert.equal(server.stage, 'who'); assert.equal(client.stage, 'who');
 assert.deepEqual(server.options, expectedSelfHarm); assert.deepEqual(client.options, expectedSelfHarm);
 assert.equal(server.done, false); assert.equal(client.done, false);
 const answerTurn = {stage:'who', q:server.question, a:server.options[1]};
 assert.equal(guideAnswersFromTurns([...turns, answerTurn]).answers.who, expectedSelfHarm[1]);
 // The incident may first appear in the answer, not in the initial text.
 const later = {mode:'intake', text:'نمیدونم', turns:[sourceTurn('از دیگری شنیدم یک نفر خودکشی کرد')], topics:[]};
 const laterServer = await interviewStep(model, later);
 const laterClient = orderedClientStep({mode:later.mode, turns:later.turns}, {}, later.text);
 assert.deepEqual(laterServer.options, expectedSelfHarm);
 assert.deepEqual(laterClient.options, expectedSelfHarm);
});

test('Back refreshes old choices but preserves selected and unsent answers verbatim', () => {
 const text='یک نفر خودکشی کرد';
 const ai=newInterview('detail');
 ai.turns=[sourceTurn('خودم دیدم'), {stage:'who',q:GUIDE_STEPS[1].title,a:'یک نفر این کار را انجام داد',options:['یک نفر','چند نفر']}];
 ai.current={stage:'when',question:GUIDE_STEPS[2].title,options:['دیروز']};
 ai.draft='حدود ظهر دیروز';
 assert.ok(stepBack(ai,text));
 assert.deepEqual(ai.current.options, expectedSelfHarm);
 assert.equal(ai.draft, 'یک نفر این کار را انجام داد');
 assert.equal(ai.pendingDrafts[GUIDE_STEPS[2].title], 'حدود ظهر دیروز');
 assert.ok(answerCurrent(ai,ai.draft));
 const next=orderedClientStep(ai,{},text);
 assert.equal(next.stage,'when'); applyStep(ai,next);
 assert.equal(ai.draft,'حدود ظهر دیروز');
 assert.equal(guideAnswersFromTurns(ai.turns).answers.who,'یک نفر این کار را انجام داد');
});

test('old guide drafts keep their answer, position and editable text when choices change', () => {
 const base='یک نفر خودکشی کرد';
 const answers={source:'من خودم این را دیدم',who:'یک نفر این کار را انجام داد'};
 const old=stepsFor(answers,base,[],{includeDeprecated:true});
 const index=old.findIndex(s=>s.id==='who'); assert.ok(index>=0);
 const draft={orderVersion:2, mode:'detail', index, base, answers:{...answers}, skipped:[],
  draft:{step:'who', value:'آن فرد را از قبل می‌شناختم'}};
 migrateGuideOrder(draft);
 assert.equal(draft.orderVersion,3);
 assert.equal(stepsFor(draft.answers,base,draft.skipped)[draft.index].id,'who');
 assert.equal(draft.answers.who,answers.who);
 assert.equal(draft.draft.value,'آن فرد را از قبل می‌شناختم');
 assert.deepEqual(interviewOptionLabels(stepsFor(draft.answers,base)[draft.index]),expectedSelfHarm);
});
