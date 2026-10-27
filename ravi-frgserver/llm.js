// A real language model on our own server, and the AI interview that uses it.
//
// Two things live here:
//   1. `local()`: calls a self-hosted model (Ollama by default, or any server
//      that speaks the OpenAI chat-completions protocol: llama.cpp, vLLM, LM
//      Studio). Nothing leaves the server; no API key is involved.
//   2. The interview: the model reads the report and answers, but the server
//      controls the next question using the same ordered stages as the guide.
//
// Model output is untrusted: facts must come from the reporter's words, and
// neither the model's question nor its done flag can bypass the ordered path.

import { GUIDE_STEPS, guideAnswersFromTurns, composeNarrative, displayNewsDomain } from './public/guidance.js';
import { orderedInterviewPath as interviewPath } from './public/interview-order.js';

const LLM_DEFAULT_URL = 'http://127.0.0.1:11434';

/** Which API the self-hosted server speaks. Ollama unless told otherwise. */
export const llmApi = env => (String(env.LLM_API || '').toLowerCase() === 'openai' ? 'openai' : 'ollama');

/** Reasoning models (Qwen3 and friends) print <think>…</think>; the answer is after it. */
export function stripThinking(text) {
  return String(text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim();
}

function llmError(message, code, status) {
  return Object.assign(new Error(message), { apiCode: code, httpStatus: status });
}

// One isolate/process can otherwise flood a serial local model with requests
// that cannot finish before the browser times out. This is admission control,
// not a cross-process/distributed lock; operators can raise the limit for a
// model server with genuinely parallel capacity.
const localInFlight = new Map();
function admitLocal(base, env) {
  const configured = Number(env.LLM_MAX_ACTIVE);
  const limit = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 64) : 1;
  const count = localInFlight.get(base) || 0;
  if (count >= limit) throw llmError('مدل هوش مصنوعی مشغول است؛ کمی بعد دوباره تلاش کنید.', 'llm_busy', 503);
  localInFlight.set(base, count + 1);
  return () => {
    const remaining = (localInFlight.get(base) || 1) - 1;
    if (remaining) localInFlight.set(base, remaining);
    else localInFlight.delete(base);
  };
}

/**
 * Same call shape as the hosted providers in worker.js:
 * {instructions, input, text:{format:{schema}}, max_output_tokens}.
 */
export async function local(env, body, fetcher = globalThis.fetch) {
  const base = String(env.LLM_URL || LLM_DEFAULT_URL).replace(/\/+$/, '');
  const schema = body.text?.format?.schema;
  const messages = [
    { role: 'system', content: body.instructions },
    { role: 'user', content: String(body.input ?? '') },
  ];
  const timeout = Number(env.LLM_TIMEOUT_MS) || 240000;
  const maxTokens = Math.min(Number(body.max_output_tokens) || 2048, Number(env.LLM_MAX_TOKENS) || 4096);
  const release = admitLocal(base, env);
  try {
  let r;
  try {
    if (llmApi(env) === 'openai') {
      const url = /\/v1$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
      r = await fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(env.LLM_KEY ? { Authorization: `Bearer ${env.LLM_KEY}` } : {}) },
        body: JSON.stringify({
          model: env.LLM_MODEL || 'qwen3:8b', messages, temperature: 0.2, max_tokens: maxTokens, stream: false,
          // Qwen3's default thinking can consume the entire output budget and
          // leave content empty. Match Ollama's think:false for Qwen3 on
          // llama.cpp/vLLM; an explicit LLM_THINKING=on opts back in.
          ...((String(env.LLM_THINKING || '').toLowerCase() === 'off' ||
              (!env.LLM_THINKING && /qwen3/i.test(env.LLM_MODEL || 'qwen3:8b')))
            ? { chat_template_kwargs: { enable_thinking: false } } : {}),
          ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'result', schema, strict: true } } } : {}),
        }),
        signal: AbortSignal.timeout(timeout),
      });
    } else {
      r = await fetcher(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.LLM_MODEL || 'qwen3:8b', messages, stream: false, think: false,
          ...(schema ? { format: schema } : {}),
          keep_alive: env.LLM_KEEP_ALIVE || '30m',
          options: { temperature: 0.2, num_ctx: Number(env.LLM_CTX) || 8192, num_predict: maxTokens },
        }),
        signal: AbortSignal.timeout(timeout),
      });
    }
  } catch (e) {
    if (['TimeoutError', 'AbortError'].includes(e.name)) throw e;
    throw llmError('مدل هوش مصنوعی روی سرور در دسترس نیست؛ برنامهٔ مدل (Ollama) را روشن کنید.', 'llm_unreachable', 0);
  }
  if (!r.ok) {
    let detail = '';
    try { detail = JSON.stringify(await r.json()); } catch {}
    if (r.status === 404 && /model/i.test(detail)) throw llmError(`مدل «${env.LLM_MODEL || 'qwen3:8b'}» روی سرور نصب نیست؛ یک بار دستور ollama pull را اجرا کنید.`, 'model_not_found', 404);
    throw llmError('مدل هوش مصنوعی پاسخ نداد؛ دوباره تلاش کنید.', 'llm_error', r.status);
  }
  const v = await r.json();
  const raw = llmApi(env) === 'openai' ? v.choices?.[0]?.message?.content : v.message?.content;
  const truncated = v.done_reason === 'length' || v.choices?.[0]?.finish_reason === 'length';
  if ((truncated && schema) || (typeof raw === 'string' && /<think>/i.test(raw) && !/<\/think>/i.test(raw)))
    throw llmError('پاسخ مدل کامل نشد؛ شرح را کوتاه‌تر کنید یا دوباره تلاش کنید.', 'incomplete', 200);
  const out = stripThinking(raw);
  if (!out) throw llmError('پاسخ قابل استفاده از مدل دریافت نشد؛ دوباره تلاش کنید.', 'empty', 200);
  return out;
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// The interview

export const URGENT_NUMBERS = ['', '110', '115', '125', '123'];
// Preserve up to 20 old answers and still allow all seven new stages.
export const MAX_TURNS = 27;

const str = { type: 'string' };
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const INTERVIEW_SCHEMA = obj({
  done: { type: 'boolean' },
  question: str,
  options: { type: 'array', items: str },
  facts: { type: 'array', items: obj({ label: str, value: str }) },
  urgent: { type: 'string', enum: URGENT_NUMBERS },
  narrative: str,
  domain: { type: 'string', enum: ['انتظامی', 'اداری', 'امنیتی', 'خدماتی', 'مرور', 'اجتماعی', 'سایر'] },
  quality_grade: { type: 'string', enum: ['عالی', 'معمولی', 'ضعیف', 'خالی'] },
  quantity_note: { type: 'string', enum: ['کم', 'متوسط', 'کامل', 'بیش از حد', 'خالی'] },
  reporter_role: { type: 'string', enum: ['vedadegar', 'shahid', 'eshteghal', 'nashel'] },
});

const ORDERED_STAGES = GUIDE_STEPS.map((step, index) => `${index + 1}. ${step.id}: ${step.title}`).join('\n');

export const INTERVIEW_SYSTEM = `You are a Persian incident-reporting interviewer for فراجا. Read the report and answers, extract only the reporter's actual words as facts, and classify the report. Never invent or infer a motive, method, identity, or other fact.

The interview follows this exact order:
${ORDERED_STAGES}

The application determines next_guide_step after accounting for the original description and previous answers. If next_guide_step is present, set done=false and return its question exactly. Do not change stages, insert a follow-up, repeat a completed stage, or end early. If next_guide_step is null, set done=true and question="". Accept an unknown or skipped answer without guessing. Never ask for something the reporter already said.

Return short Persian options only for the supplied question, or an empty list. The application controls the final question and options. Facts must be verbatim excerpts from the description or answers. For the reason and method, distinguish observed or reported information from speculation.

URGENT: If life/safety is at immediate risk (injury, fire, gas, violence in progress, child danger), set urgent to 110/115/125/123.
DOMAIN: انتظامی, اداری, امنیتی, خدماتی, مرور, اجتماعی, or سایر.
QUALITY_GRADE: عالی, معمولی, ضعیف, or خالی.
QUANTITY_NOTE: کم, متوسط, کامل, بیش از حد, or خالی.
REPORTER_ROLE: vedadegar (reporter/victim), shahid (witness), eshteghal (heard from others), nashel (unclear).

Never record ethnicity, nationality, religion, politics, or clothing unless directly relevant to a concrete harmful act. Never ask for passwords, card numbers, CVV, or OTPs. Never presume guilt — say «فرد» not «مجرم».`;

export const INTAKE_ADDENDUM = `
The reporter does not know how to start. Begin with the supplied source question. The application builds the final narrative from the reporter's answers without adding facts.`;

export const DETAIL_ADDENDUM = `
The reporter already wrote a narrative and chose to give a more complete report. Do not ask them to repeat the story. "narrative" is always "".`;

const fold = s => String(s ?? '')
  .replace(/[‌‏‎]/g, ' ')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا')
  .replace(/[ً-ْٰ]/g, '')
  .replace(/[؟?!.،,؛;:«»"'()\-–—]/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** Two questions are the same question when their words mostly coincide. */
export function sameQuestion(a, b) {
  const x = fold(a), y = fold(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const stop = new Set(['را', 'به', 'از', 'در', 'که', 'و', 'این', 'آن', 'ان', 'با', 'آیا', 'ایا', 'چه', 'یا', 'هم', 'شما', 'می', 'است', 'بود']);
  const words = s => new Set(s.split(' ').filter(w => w.length > 1 && !stop.has(w)));
  const A = words(x), B = words(y);
  if (!A.size || !B.size) return false;
  let common = 0; for (const w of A) if (B.has(w)) common++;
  return common / Math.min(A.size, B.size) >= 0.75 && common / Math.max(A.size, B.size) >= 0.6;
}

const UNKNOWN_OPTION = /^(?:نمی ?دانم|نمیدونم|نمی دونم|رد شدن|اطلاعی ندارم|هیچکدام|هیچ کدام)$/;

/** Validates the request body; returns an error string or the cleaned input. */
export function interviewInput(body) {
  if (!body || typeof body !== 'object') return 'درخواست نامعتبر است.';
  const mode = body.mode === 'intake' ? 'intake' : 'detail';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length > 6000) return 'متن بیش از حد طولانی است.';
  if (mode === 'detail' && text.length < 3) return 'شرح گزارش خالی است.';
  if (!Array.isArray(body.turns) || body.turns.length > MAX_TURNS) return 'پرسش و پاسخ‌ها نامعتبرند.';
  const turns = [];
  for (const t of body.turns) {
    if (!t || typeof t.q !== 'string' || typeof t.a !== 'string' || t.q.length > 400 || t.a.length > 1500 ||
        (t.stage !== undefined && (typeof t.stage !== 'string' || !t.stage || t.stage.length > 40))) return 'پرسش و پاسخ‌ها نامعتبرند.';
    turns.push({ q: t.q.trim(), a: t.a.trim(), ...(t.stage === undefined ? {} : { stage: t.stage }) });
  }
  const topics = (Array.isArray(body.topics) ? body.topics : []).filter(t => typeof t === 'string').slice(0, 8).map(t => t.slice(0, 80));
  const input = { mode, text, turns, topics };
  return interviewPath(input).error || input;
}

export function interviewMessage({ mode, text, turns, topics }, next) {
  return JSON.stringify({
    narrative: text || '(هنوز چیزی ننوشته است)',
    topics_detected_by_the_form: topics,
    previous_questions_and_answers: turns.map(t => ({ question: t.q, answer: t.a || '(رد شد / نمی‌داند)', ...(t.stage ? { stage: t.stage } : {}) })),
    questions_asked_so_far: turns.length,
    next_guide_step: next ? { id: next.id, question: next.title, hint: next.hint } : null,
    mode,
  });
}

/** Everything the model returns passes through here before the browser sees it. */
export function cleanInterview(raw, input) {
  const { text, turns, mode } = input;
  let v = raw;
  if (typeof v === 'string') v = JSON.parse(stripThinking(v));
  if (!v || typeof v !== 'object') throw new SyntaxError('interview');
  const said = [text, ...turns.map(t => t.a)].map(fold).join(' \n ');
  const grounded = value => { const f = fold(value); return f.length >= 1 && said.includes(f); };
  const facts = [];
  for (const f of Array.isArray(v.facts) ? v.facts : []) {
    const label = String(f?.label ?? '').trim().slice(0, 40), value = String(f?.value ?? '').trim().slice(0, 300);
    if (!label || !value || !grounded(value)) continue;
    if (facts.some(x => x.label === label && x.value === value)) continue;
    facts.push({ label, value });
    if (facts.length >= 20) break;
  }
  let question = String(v.question ?? '').replace(/^\s*(?:\d+|[۰-۹]+)\s*[-.)]\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 220);
  let done = Boolean(v.done) || !question || turns.length >= MAX_TURNS;
  const repeated = !done && turns.some(t => sameQuestion(t.q, question));
  if (repeated) done = true;
  if (done) question = '';
  const options = done ? [] : [...new Set((Array.isArray(v.options) ? v.options : [])
    .map(o => String(o ?? '').replace(/\s+/g, ' ').trim()).filter(o => o && o.length <= 60 && !UNKNOWN_OPTION.test(fold(o))))].slice(0, 4);
  const urgent = URGENT_NUMBERS.includes(String(v.urgent)) ? String(v.urgent) : '';
  const narrative = mode === 'intake' && done ? String(v.narrative ?? '').trim().slice(0, 6000) : '';
  const requestedDomain = displayNewsDomain(v.domain);
  const domain = ['انتظامی','اداری','امنیتی','خدماتی','مرور','اجتماعی','سایر'].includes(requestedDomain) ? requestedDomain : 'سایر';
  const quality_grade = ['عالی','معمولی','ضعیف','خالی'].includes(String(v.quality_grade)) ? String(v.quality_grade) : 'ضعیف';
  const quantity_note = ['کم','متوسط','کامل','بیش از حد','خالی'].includes(String(v.quantity_note)) ? String(v.quantity_note) : 'متوسط';
  const reporter_role = ['vedadegar','shahid','eshteghal','nashel'].includes(String(v.reporter_role)) ? String(v.reporter_role) : 'nashel';
  return { done, question, options, facts, urgent, narrative, repeated, domain, quality_grade, quantity_note, reporter_role };
}

/**
 * One interview step on any configured model. The prompt conditions the model,
 * but the server—not the model—chooses the stage and question. Even a model
 * that asks the wrong thing or declares itself done cannot skip ahead.
 */
export async function interviewStep(ask, input) {
  const path = interviewPath(input);
  if (path.error) throw llmError(path.error, 'invalid_interview', 400);
  const instructions = INTERVIEW_SYSTEM + (input.mode === 'intake' ? INTAKE_ADDENDUM : DETAIL_ADDENDUM);
  const raw = await ask({
    instructions,
    input: interviewMessage(input, path.next),
    text: { format: { type: 'json_schema', name: 'interview', strict: true, schema: INTERVIEW_SCHEMA } },
    max_output_tokens: 1500,
  });
  const result = cleanInterview(raw, input);
  delete result.repeated;
  if (path.next) {
    const step = path.next;
    return {
      ...result,
      done: false,
      stage: step.id,
      question: step.title,
      hint: step.hint,
      // An unknown has its own button. Only offer choices with a factual
      // phrase; free text and skipping remain available on every stage.
      options: (step.options || []).filter(o => o.phrase).map(o => o.label).slice(0, 4),
      narrative: '',
    };
  }
  const { answers, legacy } = guideAnswersFromTurns(path.turns);
  const narrative = input.mode === 'intake'
    ? [...legacy, composeNarrative(answers)].filter(Boolean).join('\n').slice(0, 6000)
    : '';
  return { ...result, done: true, stage: null, question: '', hint: '', options: [], narrative };
}
