// The self-hosted model path and the AI interview, tested against mock-llm.mjs.
// These check the plumbing and the safety checks, not a model's quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import { local, stripThinking, sameQuestion, cleanInterview, interviewStep, interviewInput, INTERVIEW_SCHEMA, MAX_TURNS } from './llm.js';
import { start } from './mock-llm.mjs';
import { newInterview, interviewRequest, answerCurrent, applyStep, stepBack, answersNarrative, guideFallback, interviewRecord, MAX_TURNS as CLIENT_MAX_TURNS } from './public/ai-interview.js';
import { GUIDE_STEPS, coreStepsFor, stepsFor } from './public/guidance.js';
import {orderedClientStep} from './public/interview-order.js';
import { modelScores } from './evaluation/llm-metrics.mjs';

const server = await start(0);
const port = server.address().port;
const env = { LLM_URL: `http://127.0.0.1:${port}`, LLM_MODEL: 'qwen3:8b' };
const post = (path, body, e = env) => worker.fetch(new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e);
const TEXT = 'دیشب حدود ساعت ۱۱ در خیابان بهار دو نفر با موتور آمدند، شیشهٔ ماشینم را شکستند و کیف و گوشی‌ام را از داخل ماشین بردند. همسایه‌مان دید و به من گفت.';
test.after(() => server.close());

test('model evaluation does not count failed negative controls as correct rejections', () => {
  const scores = modelScores([{ok:false,modelHit:false}], [{ok:false,modelFalse:false}]);
  assert.equal(scores.modelAloneRecall, 0);
  assert.equal(scores.modelAloneControlRejection, 0);
  assert.equal(scores.modelControlRejectionOnUsable, null);
  const mixed = modelScores([], [{ok:false,modelFalse:false}, {ok:true,modelFalse:false}]);
  assert.equal(mixed.modelAloneControlRejection, 50);
  assert.equal(mixed.modelControlRejectionOnUsable, 100);
});

test('Ollama protocol: /api/chat, schema as format, no thinking, a context large enough', async () => {
  server.requests.length = 0;
  const out = await local(env, { instructions: 'sys', input: JSON.stringify({ description: 'x' }), text: { format: { schema: { type: 'object' } } }, max_output_tokens: 100 });
  const req = server.requests.at(-1);
  assert.equal(req.path, '/api/chat');
  assert.deepEqual(req.body.format, { type: 'object' });
  assert.equal(req.body.think, false);
  assert.equal(req.body.stream, false);
  assert.ok(req.body.options.num_ctx >= 8192);
  assert.equal(req.body.model, 'qwen3:8b');
  assert.equal(typeof JSON.parse(out), 'object');
});

test('OpenAI-compatible protocol (llama.cpp, vLLM, LM Studio): json_schema, <think> removed', async () => {
  server.requests.length = 0;
  const out = await local({ ...env, LLM_API: 'openai', LLM_URL: `http://127.0.0.1:${port}/v1` }, { instructions: 'sys', input: JSON.stringify({ description: TEXT }), text: { format: { schema: { type: 'object' } } } });
  const req = server.requests.at(-1);
  assert.equal(req.path, '/v1/chat/completions');
  assert.equal(req.body.response_format.type, 'json_schema');
  assert.deepEqual(req.body.chat_template_kwargs, { enable_thinking: false });
  assert.ok(!out.includes('<think>'));
  assert.ok(Array.isArray(JSON.parse(out).events));
  assert.equal(stripThinking('<think>x</think>\n```json\n{"a":1}\n```'), '{"a":1}');
});

test('OpenAI-compatible Qwen3 disables thinking unless explicitly opted in; other models are unchanged', async () => {
  const body = { instructions: 'sys', input: 'check' };
  const seen = [];
  const fetcher = async (_url, opts) => { seen.push(JSON.parse(opts.body)); return Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }); };
  await local({ LLM_URL: 'http://qwen-test', LLM_API: 'openai', LLM_MODEL: 'Qwen3-0.6B' }, body, fetcher);
  await local({ LLM_URL: 'http://qwen-test', LLM_API: 'openai', LLM_MODEL: 'Qwen3-0.6B', LLM_THINKING: 'on' }, body, fetcher);
  await local({ LLM_URL: 'http://qwen-test', LLM_API: 'openai', LLM_MODEL: 'different-model' }, body, fetcher);
  await local({ LLM_URL: 'http://qwen-test', LLM_API: 'openai', LLM_MODEL: 'custom-alias', LLM_THINKING: 'off' }, body, fetcher);
  assert.deepEqual(seen[0].chat_template_kwargs, { enable_thinking: false });
  assert.equal(seen[1].chat_template_kwargs, undefined);
  assert.equal(seen[2].chat_template_kwargs, undefined);
  assert.deepEqual(seen[3].chat_template_kwargs, { enable_thinking: false });
});

test('local admission limits in-flight work and always releases after success or failure', async () => {
  let unblock, calls = 0;
  const gate = new Promise(resolve => { unblock = resolve; });
  const opts = { LLM_URL: 'http://admission-test', LLM_API: 'openai', LLM_MODEL: 'other' };
  const body = { instructions: '', input: '' };
  const fetcher = async () => { calls++; await gate; return Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }); };
  const first = local(opts, body, fetcher);
  await assert.rejects(local(opts, body, fetcher), e => e.apiCode === 'llm_busy' && e.httpStatus === 503);
  assert.equal(calls, 1);
  unblock();
  assert.equal(await first, 'OK');
  assert.equal(await local(opts, body, fetcher), 'OK');
  await assert.rejects(local(opts, body, async () => { throw new Error('offline'); }), e => e.apiCode === 'llm_unreachable');
  assert.equal(await local(opts, body, fetcher), 'OK');
});

test('configured parallel capacity is respected and incomplete thinking is never displayed', async () => {
  const body = { instructions: '', input: '' }, opts = { LLM_URL: 'http://parallel-test', LLM_API: 'openai', LLM_MAX_ACTIVE: 2 };
  let unblock; const gate = new Promise(resolve => { unblock = resolve; });
  const fetcher = async () => { await gate; return Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }); };
  const a = local(opts, body, fetcher), b = local(opts, body, fetcher);
  await assert.rejects(local(opts, body, fetcher), e => e.apiCode === 'llm_busy');
  unblock(); assert.deepEqual(await Promise.all([a,b]), ['OK','OK']);
  await assert.rejects(local(opts, body, async () => Response.json({ choices: [{ message: { content: '<think>private incomplete' }, finish_reason: 'length' }] })), e => e.apiCode === 'incomplete');
});

test('a model that is not installed, or a server that is off, is reported in Persian', async () => {
  await assert.rejects(local({ ...env, LLM_MODEL: 'missing' }, { instructions: '', input: '' }), e => e.apiCode === 'model_not_found' && /ollama pull/.test(e.message));
  await assert.rejects(local({ LLM_URL: 'http://127.0.0.1:9' }, { instructions: '', input: '' }), e => e.apiCode === 'llm_unreachable');
});

test('config: a self-hosted model makes the site AI-driven, and wins over API keys', async () => {
  const v = await (await worker.fetch(new Request('http://localhost/api/config'), { ...env, OPENAI_API_KEY: 'sk-test' })).json();
  assert.equal(v.ai, true); assert.equal(v.provider, 'local'); assert.equal(v.interview, true); assert.equal(v.model, 'qwen3:8b');
  const none = await (await worker.fetch(new Request('http://localhost/api/config'), {})).json();
  assert.equal(none.ai, false); assert.equal(none.interview, false);
});

test('analysis runs on the self-hosted model with the short brief', async () => {
  server.requests.length = 0;
  const r = await post('/api/analyze', { text: TEXT });
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.equal(v.mode, 'ai');
  assert.ok(v.events.length >= 1);
  const req = server.requests.at(-1);
  assert.ok(req.body.messages[0].content.length < 20000, 'the short brief, not the 50k-character one');
  assert.ok(req.body.format.properties.events);
});

test('interview uses the first missing ordered stage and removes invented model facts', async () => {
  const r = await post('/api/interview', { mode: 'detail', text: TEXT, turns: [], topics: ['سرقت خودرو و لوازم داخل خودرو'] });
  assert.equal(r.status, 200);
  const v = await r.json();
  const first = coreStepsFor({}, TEXT)[0];
  assert.equal(v.done, false);
  assert.equal(v.stage, first.id);
  assert.equal(v.question, first.title);
  assert.ok(!v.options.includes('نمی‌دانم'));
  assert.deepEqual(v.facts.map(f => f.value).sort(), ['خیابان بهار', 'دیشب'].sort());
  const sent = server.requests.at(-1).body.messages;
  assert.match(sent[0].content, /Never ask for something the reporter already said/);
  assert.equal(JSON.parse(sent[1].content).next_guide_step.id, first.id);
  assert.match(sent[1].content, /خیابان بهار/);
});

test('the model receives previous answers and finishes only after missing stages', async () => {
  const expected = coreStepsFor({}, TEXT).map(s => s.id);
  const turns = [];
  for (let i = 0; i <= expected.length; i++) {
    const v = await (await post('/api/interview', { mode: 'detail', text: TEXT, turns })).json();
    if (v.done) break;
    turns.push({ q: v.question, stage: v.stage, a: i === 1 ? '' : 'پاسخ ' + i });
  }
  assert.deepEqual(turns.map(t => t.stage), expected);
  assert.equal(JSON.parse(server.requests.at(-1).body.messages[1].content).next_guide_step, null);
});

test('wrong, repeated, and premature model proposals cannot bypass the seven stages', async () => {
  const order = ['source','who','when','where','result','reason','method'];
  const turns = [];
  let calls = 0;
  const uncooperative = async request => {
    calls++;
    const target = JSON.parse(request.input).next_guide_step;
    assert.equal(target?.id || null, order[turns.length] || null);
    const positions = order.map((id,i)=>request.instructions.indexOf(`${i+1}. ${id}:`));
    assert.ok(positions.every((p,i)=>p>=0 && (i===0 || p>positions[i-1])), 'prompt uses the same order');
    // The question, options, done flag and invented final narrative are all
    // deliberately wrong. They must never determine what reaches the user.
    return JSON.stringify({ done: calls % 2 === 1, question: 'مدرک و زمان را بگویید؟', options: ['گزینه ساختگی'], facts: [], urgent: '', narrative: 'واقعیت ساختگی' });
  };
  for (const [index, id] of order.entries()) {
    const input = interviewInput({ mode: 'intake', text: 'نمی‌دانم چه بنویسم', turns });
    assert.equal(typeof input, 'object');
    const v = await interviewStep(uncooperative, input);
    assert.equal(v.done, false);
    assert.equal(v.stage, id);
    assert.equal(v.question, GUIDE_STEPS[index].title);
    assert.ok(!v.options.includes('گزینه ساختگی'));
    assert.equal(v.narrative, '');
    turns.push({ q: v.question, stage: v.stage, a: id === 'result' ? 'گوشی‌ام را در مترو زدند' : '' });
  }
  const end = await interviewStep(uncooperative, interviewInput({ mode: 'intake', text: '', turns }));
  assert.equal(calls, order.length + 1);
  assert.equal(end.done, true);
  assert.equal(end.question, '');
  assert.match(end.narrative, /گوشی‌ام را در مترو زدند/);
  assert.doesNotMatch(end.narrative, /واقعیت ساختگی|نمی‌دانم/);
});

test('question similarity: same question in other words is caught, a different one is not', () => {
  assert.ok(sameQuestion('چند نفر بودند؟', 'چند نفر بودند'));
  assert.ok(sameQuestion('آیا کسی زخمی شد؟', 'کسی زخمی شد؟'));
  assert.ok(!sameQuestion('چند نفر بودند؟', 'چه ساعتی بود؟'));
  assert.ok(!sameQuestion('ماشین کجا پارک بود؟', 'ماشین چه رنگی بود؟'));
});

test('interview limits: turn cap, sizes, urgent number whitelist, narrative only at the end of intake', () => {
  const turns = Array.from({ length: MAX_TURNS }, (_, i) => ({ q: 'پرسش ' + i, a: 'پاسخ' }));
  const capped = cleanInterview({ done: false, question: 'یک پرسش دیگر؟', options: [], facts: [], urgent: '', narrative: '' }, { text: TEXT, turns, mode: 'detail' });
  assert.equal(capped.done, true);
  const odd = cleanInterview({ done: false, question: '1. چه شد؟', options: ['a', 'b', 'c', 'd', 'e', 'x'.repeat(80)], facts: [], urgent: '999', narrative: 'x' }, { text: TEXT, turns: [], mode: 'detail' });
  assert.equal(odd.question, 'چه شد؟'); assert.equal(odd.options.length, 4); assert.equal(odd.urgent, ''); assert.equal(odd.narrative, '');
  assert.equal(typeof interviewInput({ mode: 'detail', text: 'x'.repeat(6001), turns: [] }), 'string');
  assert.equal(typeof interviewInput({ mode: 'detail', text: TEXT, turns: [{ q: 1 }] }), 'string');
  assert.equal(typeof interviewInput({ mode: 'intake', text: '', turns: [] }), 'object');
});

test('intake: all seven stages are ordered and a draft is built from actual answers', async () => {
  const answers = { source: 'خودم دیدم', who: 'یک نفر', when: 'دیروز', where: 'ایستگاه مترو', result: 'گوشی‌ام را در مترو زدند' };
  const turns = [];
  for (const step of GUIDE_STEPS) {
    const r = await post('/api/interview', { mode: 'intake', text: 'نمی‌دونم چی بنویسم', turns });
    assert.equal(r.status, 200);
    const v = await r.json();
    assert.equal(v.done, false); assert.equal(v.stage, step.id); assert.equal(v.question, step.title);
    turns.push({ q: v.question, stage: v.stage, a: answers[step.id] || '' });
  }
  const end = await (await post('/api/interview', { mode: 'intake', text: '', turns })).json();
  assert.equal(end.done, true);
  for (const value of ['گوشی‌ام را در مترو زدند','دیروز','ایستگاه مترو','من خودم این را دیدم','یک نفر این کار را انجام داد'])
    assert.ok(end.narrative.includes(value), value);
  assert.doesNotMatch(end.narrative, /نمی‌دانم|دربارهٔ اموال/);
});

test('bad or out-of-order stage histories are refused before any model call', async () => {
  server.requests.length = 0;
  for (const body of [
    { mode: 'detail', text: '', turns: [] },
    { mode: 'intake', text: '', turns: [{ q: GUIDE_STEPS[1].title, stage: 'who', a: '' }] },
    { mode: 'intake', text: '', turns: [{ q: GUIDE_STEPS[1].title, stage: 'source', a: '' }] },
    { mode: 'intake', text: '', turns: [{ q: GUIDE_STEPS[0].title, stage: 'source', a: '' }, { q: GUIDE_STEPS[0].title, stage: 'source', a: '' }] },
    { mode: 'intake', text: '', turns: [{ q: GUIDE_STEPS[0].title, stage: 'unknown', a: '' }] },
    { mode: 'intake', text: '', turns: [{ q: GUIDE_STEPS[0].title, stage: 12, a: '' }] },
  ]) {
    const r = await post('/api/interview', body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(server.requests.length, 0);
});

test('older free-form drafts are preserved without counting as an ordered stage', async () => {
  const turns = [{ q: 'پرسش مدل قدیمی؟', a: 'کیفم را بردند' }];
  const input = interviewInput({ mode: 'intake', text: '', turns });
  const v = await interviewStep(async () => JSON.stringify({ done: true, question: '', facts: [], options: [], urgent: '', narrative: 'ساختگی' }), input);
  assert.equal(v.stage, 'source');
  assert.equal(v.question, GUIDE_STEPS[0].title);
  assert.match(answersNarrative({turns}), /کیفم را بردند/);
  // An old model may have happened to ask a question identical to a later
  // stage. Preserve it as legacy without letting it skip the source stage.
  const coincidental = [{q:GUIDE_STEPS[1].title,a:'برای همسایه بود'}];
  const next = await interviewStep(async()=>JSON.stringify({done:true,question:'',facts:[],options:[]}),interviewInput({mode:'intake',text:'',turns:coincidental}));
  assert.equal(next.stage,'source');
  assert.match(answersNarrative({turns:coincidental}),/برای همسایه بود/);
  assert.equal(MAX_TURNS, CLIENT_MAX_TURNS);
  const tooManyLegacy = Array.from({length:21}, (_,i) => ({q:'پرسش قدیمی '+i,a:''}));
  assert.equal(typeof interviewInput({mode:'intake',text:'',turns:tooManyLegacy}), 'string');
});

test('untagged clients advance only by the exact next question and keep their answers', async () => {
  const turns=[];
  const ask=async()=>JSON.stringify({done:true,question:'',facts:[],options:[]});
  for (const step of GUIDE_STEPS) {
    const next=await interviewStep(ask,interviewInput({mode:'intake',text:'',turns}));
    assert.equal(next.stage,step.id);
    turns.push({q:next.question,a:step.id==='source'?'خودم دیدم':step.id==='result'?'کیفم را بردند':''});
  }
  const end=await interviewStep(ask,interviewInput({mode:'intake',text:'',turns}));
  assert.equal(end.done,true);
  assert.match(end.narrative,/من خودم این را دیدم/);
  assert.match(end.narrative,/کیفم را بردند/);
});

test('a maximum-length legacy draft still has room for every ordered stage', async () => {
  const turns = Array.from({length:20}, (_,i) => ({q:'پرسش قدیمی '+i, a:i===0?'شرح قبلی':''}));
  const ask = async () => JSON.stringify({done:true,question:'',facts:[],options:[],urgent:'',narrative:'ساختگی'});
  for (const expected of GUIDE_STEPS) {
    const input=interviewInput({mode:'intake',text:'',turns});
    assert.equal(typeof input, 'object');
    const next=await interviewStep(ask,input);
    assert.equal(next.stage,expected.id);
    turns.push({q:next.question,stage:next.stage,a:''});
  }
  assert.equal(turns.length, 20 + GUIDE_STEPS.length);
  assert.ok(MAX_TURNS > turns.length, 'the grouped protocol has room for follow-ups too');
  const end=await interviewStep(ask,interviewInput({mode:'intake',text:'',turns}));
  assert.equal(end.done,true);
  assert.match(end.narrative,/شرح قبلی/);
});

test('stage ids survive answer, back, retry, and fallback to the offline guide', () => {
  const ai = newInterview('intake');
  const values = {source:'از فرد دیگری شنیدم',informantKnown:'',who:'',when:'دیروز',where:'خیابان بهار',result:'کیفم را بردند'};
  const expected=['source','informantKnown','who','when','where','result'];
  for (const id of expected) {
    const step=orderedClientStep(ai,{},'');assert.equal(step.stage,id);
    applyStep(ai,step);assert.ok(answerCurrent(ai,values[id]));
  }
  assert.deepEqual(interviewRequest(ai, '').turns.map(t=>t.stage), expected);
  assert.ok(stepBack(ai));
  assert.equal(ai.current.stage, 'result');
  assert.ok(ai.current.hint);
  assert.equal(ai.draft, 'کیفم را بردند');
  answerCurrent(ai, ai.draft);
  const fallback = guideFallback(ai);
  assert.equal(fallback.answers.source, 'این را از فرد دیگری شنیدم');
  assert.equal(fallback.answers.result, 'کیفم را بردند');
  assert.ok(fallback.skipped.includes('who'));
  assert.equal(stepsFor(fallback.answers, fallback.base, fallback.skipped)[fallback.index].id, 'vehicleInvolved');
  assert.match(answersNarrative(ai), /کیفم را بردند/);
});

test('browser side: answer, back, early finish, record', () => {
  const ai = newInterview('intake');
  applyStep(ai, { done: false, question: 'چه اتفاقی افتاد؟', options: [], facts: [] });
  answerCurrent(ai, 'کیفم را دزدیدند');
  applyStep(ai, { done: false, question: 'کجا بود؟', options: ['خانه', 'خیابان'], facts: [] });
  answerCurrent(ai, '');
  assert.equal(answersNarrative(ai), 'کیفم را دزدیدند');
  assert.ok(stepBack(ai)); assert.equal(ai.current.question, 'کجا بود؟'); assert.deepEqual(ai.current.options, ['خانه', 'خیابان']);
  answerCurrent(ai, 'خیابان');
  applyStep(ai, { done: true, question: '', facts: [{ label: 'مکان', value: 'خیابان' }] });
  assert.equal(ai.done, true);
  assert.deepEqual(interviewRecord(ai).turns.map(t => t.a), ['کیفم را دزدیدند', 'خیابان']);
});

test('model domain vocabulary includes انتظامی and اجتماعی and accepts old metadata without rewriting facts',()=>{
 const choices=INTERVIEW_SCHEMA.properties.domain.enum;
 assert.ok(choices.includes('انتظامی'));assert.ok(choices.includes('اجتماعی'));assert.ok(!choices.includes('رفاه'));
 const text='او گفت رفاه خانواده مهم است';
 const raw={done:false,question:'یک پرسش؟',domain:'رفاه',facts:[{label:'گفته',value:text}]};
 const result=cleanInterview(raw,{mode:'detail',text,turns:[]});
 assert.equal(result.domain,'اجتماعی');assert.equal(result.facts[0].value,text);
 assert.equal(cleanInterview({...raw,domain:'انتظامی'},{mode:'detail',text,turns:[]}).domain,'انتظامی');
 const ai=newInterview('intake');applyStep(ai,{done:false,stage:'source',question:GUIDE_STEPS[0].title,domain:'رفاه'});assert.equal(ai.domain,'اجتماعی');
});
