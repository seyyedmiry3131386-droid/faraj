// The AI interview screen: the server enforces the same ordered base stages as
// the offline guide while the model reads the report and extracts facts.
// This module holds state and draws it; app.js does the network call.

import { GUIDE_STEPS, GUIDE_ORDER_VERSION, guideQuestionAliases, guideStageForQuestion, guideStageWithContext, interviewOptionLabels, displayGuideQuestion, displayNewsDomain, stepsFor, guideAnswersFromTurns, composeNarrative } from './guidance.js';
import {orderedInterviewPath} from './interview-order.js';
import {uiLabel} from './ui-label.js';

export const UNKNOWN_ANSWER = 'نمی‌دانم';
// The server also permits older draft answers plus seven ordered stages.
export const MAX_TURNS = 27;

export function newInterview(mode = 'detail') {
  return { mode: mode === 'intake' ? 'intake' : 'detail', turns: [], current: null, facts: [], urgent: '', narrative: '', done: false, draft: '', domain: 'سایر', quality_grade: 'ضعیف', quantity_note: 'متوسط', reporter_role: 'nashel' };
}

/** What the server needs: the report and the questions and answers so far. */
export function interviewRequest(ai, text, topics = []) {
  return { mode: ai.mode, text: String(text || ''), turns: ai.turns.map(t => ({ q: t.q, a: t.a, ...(t.stage ? { stage: t.stage } : {}) })), topics };
}

/** Records the reporter's answer to the question on screen. '' means «I don't know». */
export function answerCurrent(ai, answer) {
  if (!ai?.current) return false;
  ai.turns.push({ q: ai.current.question, a: String(answer || '').trim(), options: ai.current.options || [],
    ...(ai.current.stage ? { stage: ai.current.stage } : {}), ...(ai.current.hint ? { hint: ai.current.hint } : {}) });
  if(ai.pendingDrafts){
    delete ai.pendingDrafts[ai.current.question];
    // Old victim questions sometimes carry stage:'who' too; they are not the
    // actor stage and must not erase its separate pending answer.
    const canonical=guideStageForQuestion(ai.current.question,ai.current.stage||null);
    if(canonical)for(const title of guideQuestionAliases(canonical.id))delete ai.pendingDrafts[title];
  }
  ai.current = null; ai.draft = '';
  return true;
}

/** Applies what the server sent back. */
export function applyStep(ai, step) {
  ai.facts = Array.isArray(step.facts) ? step.facts : ai.facts;
  if (step.urgent) ai.urgent = step.urgent;
  if (step.domain) ai.domain = displayNewsDomain(step.domain);
  if (step.quality_grade) ai.quality_grade = step.quality_grade;
  if (step.quantity_note) ai.quantity_note = step.quantity_note;
  if (step.reporter_role) ai.reporter_role = step.reporter_role;
  if (step.done || !step.question || ai.turns.length >= MAX_TURNS) {
    ai.done = true; ai.current = null;
    if (step.narrative) ai.narrative = step.narrative;
    return;
  }
  ai.current = { question: step.question, options: Array.isArray(step.options) ? step.options.slice(0, 4) : [],
    ...(step.stage ? { stage: step.stage } : {}), ...(step.hint ? { hint: step.hint } : {}) };
  const titles=[step.question,...guideQuestionAliases(step.stage)];
  ai.draft=String(titles.map(title=>ai.pendingDrafts?.[title]).find(value=>typeof value==='string'&&value.trim())||'');
}

/** Back: the last question comes back on screen with its answer in the box. */
export function stepBack(ai, text = null) {
  const last = ai.turns.pop();
  if (!last) return false;
  if(ai.current&&String(ai.draft||'').trim())(ai.pendingDrafts??={})[ai.current.question]=ai.draft;
  const step=guideStageForQuestion(last.q,last.stage||null);
  // Old histories may contain yesterday's static shortcuts. Recompute them
  // from the description and answers preceding this question, while keeping
  // the user's old answer in the editable draft exactly as it was.
  const context = text === null ? null : [text,...ai.turns.map(t=>t.a)].filter(Boolean).join('\n');
  const presented = step && context !== null ? guideStageWithContext(step,context) : step;
  const options = step && context !== null ? interviewOptionLabels(presented) : (last.options || []);
  ai.current = { question: presented?.title || last.q, options,
    ...(last.stage ? { stage: last.stage } : {}), ...((presented?.hint||last.hint) ? { hint: presented?.hint||last.hint } : {}) };
  ai.draft = last.a; ai.done = false;
  return true;
}

/** Build the account from the reporter's own answers if no narrative is supplied. */
export function answersNarrative(ai, text = '') {
  const path = orderedInterviewPath({mode:ai.mode,text,turns:ai.turns});
  const { answers, legacy } = guideAnswersFromTurns(path.turns || ai.turns);
  return [...legacy, composeNarrative(answers)].filter(Boolean).join('\n');
}

/** Continue an interrupted intake with the offline guide, keeping all answers. */
export function guideFallback(ai, text = '', prior = null) {
  const path = orderedInterviewPath({mode:ai.mode,text,turns:ai.turns});
  const fromTurns = guideAnswersFromTurns(path.turns || ai.turns);
  const answers = {...(prior?.answers||{}),...fromTurns.answers};
  // A more recent explicit answer/skip supersedes the intake's older value.
  for(const id of fromTurns.skipped)if(!Object.hasOwn(fromTurns.answers,id))delete answers[id];
  const skipped=[...new Set([...(prior?.skipped||[]),...fromTurns.skipped])]
   .filter(id=>fromTurns.skipped.includes(id)||!Object.hasOwn(answers,id));
  const {completed,legacy}=fromTurns;
  const base = [ai.mode === 'detail' ? String(text || '').trim() : '', ...legacy].filter(Boolean).join('\n');
  const steps = stepsFor(answers, base, skipped);
  const coreIds = new Set(GUIDE_STEPS.map(s => s.id));
  const done = new Set([...completed,...Object.keys(prior?.answers||{}),...(prior?.skipped||[])]);
  let index = steps.findIndex(s => coreIds.has(s.id) && !done.has(s.id));
  if (index < 0) index = steps.findIndex(s => !coreIds.has(s.id) && !done.has(s.id));
  if (index < 0) index = steps.length;
  return { orderVersion:GUIDE_ORDER_VERSION,index,answers,skipped,base };
}

/** Question-and-answer lines for the review page and the saved report. */
export function interviewRecord(ai) {
  if (!ai || !ai.turns.length) return null;
  return { turns: ai.turns.map(t => ({ q: displayGuideQuestion(t.q,t.stage||null), a: t.a || UNKNOWN_ANSWER })), facts: ai.facts || [], domain: displayNewsDomain(ai.domain || 'سایر'), quality_grade: ai.quality_grade || 'ضعیف', quantity_note: ai.quantity_note || 'متوسط', reporter_role: ai.reporter_role || 'nashel' };
}

export function renderInterview(ai, { escape, icon, stepper, fa, miniApp = false }, { loading = false, error = '' } = {}) {
  const n = ai.turns.length + (ai.current ? 1 : 0);
  // The emergency call box belongs to the description page only (the
  // reporter's request); later screens never show it.
  const history = ai.turns.length
    ? `<details class="ai-history"><summary>پاسخ‌های قبلی (${fa(ai.turns.length)})</summary><ol>${ai.turns.map(t => `<li><b>${escape(displayGuideQuestion(t.q,t.stage||null))}</b><span>${escape(t.a || UNKNOWN_ANSWER)}</span></li>`).join('')}</ol></details>`
    : '';
  const facts = ai.facts?.length
    ? `<details class="ai-facts"><summary>${icon('spark')}آنچه تا اینجا از گزارش شما ثبت شد</summary><ul>${ai.facts.map(f => `<li><b>${escape(f.label)}</b><span>${escape(f.value)}</span></li>`).join('')}</ul></details>`
    : '';
  let body;
  if (ai.done && !loading) {
    body = `<h2 id="ai-question" class="question-title" tabindex="-1">پرسش‌ها تمام شد.</h2><div class="ai-actions"><button class="primary" data-action="ai-finish">${ai.mode === 'intake' ? 'ساخت شرح' : 'رفتن به مستندات'} ${icon('arrow')}</button></div>`;
  } else if (loading || !ai.current) {
    body = `<div class="ai-thinking" role="status" aria-live="polite"><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${ai.turns.length ? 'دستیار پاسخ شما را می‌خواند…' : 'دستیار گزارش شما را می‌خواند…'}</span></div>`;
  } else {
    const chips = (ai.current.options || []).map((o, i) => `<button type="button" class="guide-chip" style="--i:${i}" data-ai-option="${i}"><span class="guide-chip-check" aria-hidden="true"></span>${escape(uiLabel(o))}</button>`).join('');
    body = `<h2 id="ai-question" class="question-title" tabindex="-1">${escape(uiLabel(displayGuideQuestion(ai.current.question,ai.current.stage||null)))}</h2>
${ai.current.hint ? `<p class="question-desc">${escape(uiLabel(ai.current.hint))}</p>` : ''}
<textarea id="ai-answer" class="field answer-field" rows="3" maxlength="1500" dir="auto" placeholder="${chips ? 'یا پاسخ خودتان را بنویسید…' : 'پاسخ خود را بنویسید…'}" aria-labelledby="ai-question">${escape(ai.draft || '')}</textarea>
${chips ? `<div class="guide-chips ai-chips">${chips}</div>` : ''}
${ai.current.stage === 'where' ? `<button type="button" class="plain" data-action="location">افزودن موقعیت کنونی دستگاه (اختیاری)</button><small class="location-note">موقعیت فعلی ممکن است با محل حادثه متفاوت باشد؛ پیش از ادامه بررسی کنید. با ادامه، بخشی از گزارش و درخواست مدل می‌شود.</small>${miniApp?'<button type="button" class="plain" data-action="open-browser">اگر موقعیت باز نشد، مرورگر گوشی</button>':''}` : ''}
<div class="actions three-step-actions"><button class="secondary" data-action="ai-back">بازگشت</button><button class="primary" data-action="ai-send" ${String(ai.draft||'').trim()?'':'disabled'}>ادامه</button><button class="secondary" data-action="ai-unknown" ${String(ai.draft||'').trim()?'disabled':''}>اطلاعات بیشتری درباره این بخش ندارم</button></div>`;
  }
  const failed = error
    ? `<div class="error-note" role="alert">${escape(error)}</div><div class="ai-actions"><button class="primary" data-action="ai-retry">تلاش دوباره</button><button class="secondary" data-action="ai-fallback">ادامه بدون دستیار</button></div>`
    : '';
  return `<div class="content flow-content ai-interview">${ai.mode === 'detail' ? stepper() : ''}
<section class="panel focused-question" aria-busy="${loading ? 'true' : 'false'}">
<div class="flow-step-caption"><span>${icon('spark')}دستیار هوشمند</span>${n ? `<small>پرسش ${fa(n)}</small>` : ''}</div>
${error && !ai.current ? '' : body}${failed}
${!ai.current || loading ? `<div class="ai-footer"><button class="plain" data-action="ai-back">${icon('back')}بازگشت</button></div>` : ''}
${facts}${history}
</section></div>`;
}
