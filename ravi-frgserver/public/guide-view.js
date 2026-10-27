// The guided interview screen. Pure rendering over the guidance engine, so it
// runs with no API and no network: every question, option and composed sentence
// comes from guidance.js in the browser.
import { stepsFor, finalNarrative, missingFacts, factCoverage, triage, FACT_LABELS } from './guidance.js';
import {uiLabel} from './ui-label.js';

/** Progress strip over the seven facts a report is built from. */
export function factStrip(text, analysis, { escape, fa }) {
 const { covered, count, total } = factCoverage(text, analysis);
 const have = new Set(covered.map(f => f.id));
 return `<div class="fact-strip" aria-label="اطلاعات لازم گزارش">
  <span class="fact-strip-count">${fa(count)} از ${fa(total)} مورد</span>
  <ul>${FACT_LABELS.map(f => `<li class="${have.has(f.id) ? 'have' : 'need'}"><span aria-hidden="true">${have.has(f.id) ? '✓' : '•'}</span>${escape(f.label)}</li>`).join('')}</ul>
 </div>`;
}

/** The list of still-missing facts, phrased as the next things to add. */
export function missingPanel(text, analysis, { escape, icon }) {
 const missing = missingFacts(text, analysis);
 if (!missing.length) return '';
 return `<section class="missing-facts" aria-label="اطلاعاتی که هنوز در شرح نیست">
  <h3>${icon('help')}این‌ها هنوز در شرح شما نیست</h3>
  <p>لازم نیست همه را بدانید. «نمی‌دانم» هم پاسخ درستی است و حدس‌زدن لازم نیست.</p>
  <ul>${missing.map(f => `<li><b>${escape(f.label)}</b> — ${escape(f.title)}<small>${escape(f.hint)}</small></li>`).join('')}</ul>
  <button class="secondary" data-action="guide-open">${icon('spark')}قدم‌به‌قدم کمکم کن</button>
 </section>`;
}

/** One interview step. `guide` is {index, answers}. */
export function renderGuide(guide, { escape, fa, icon, stepper, miniApp = false }, error = '') {
 // The question list is rebuilt from the answers each time, so a branch that
 // became relevant (or stopped being relevant) is reflected immediately.
 const base = guide.base || '';
 const steps = stepsFor(guide.answers || {}, base, guide.skipped || []);
 if(!steps.length)return `<div class="content flow-content">${stepper()}<section class="panel focused-question"><h2 class="question-title">پرسش دیگری باقی نمانده است.</h2><div class="actions"><button class="secondary" data-action="guide-back">بازگشت</button><button class="primary" data-action="guide-finish">ادامه</button></div></section></div>`;
 const index = Math.min(Math.max(0, guide.index || 0), steps.length - 1);
 const step = steps[index];
 const value = String(guide.answers?.[step.id] ?? '');
 // An option that records nothing is still the option the reporter picked, so
 // it stays selected and its prompt stays visible until they describe the fault.
 const chosen = (step.options || []).find(o => (o.phrase && o.phrase === value) || o.label === guide.chosenLabel?.[step.id]);
 const custom = guide.draft?.step === step.id ? String(guide.draft.value || '') : (value && !chosen ? value : '');
 const hasValue = Boolean(custom.trim() || chosen?.phrase);
 const preview = finalNarrative(guide.answers || {}, base);
 // The bar grows from where it stood on the previous screen.
 const pct = Math.round(((index + 1) / steps.length) * 100);
 const from = Number.isFinite(guide.lastPct) ? guide.lastPct : pct;
 guide.lastPct = pct;

 return `<div class="content flow-content">${stepper()}
 <section class="panel focused-question guide-step" aria-labelledby="guide-title">
  <div class="guide-progress" role="progressbar" aria-label="پیشرفت" aria-valuemin="1" aria-valuemax="${steps.length}" aria-valuenow="${index + 1}"><span style="--from:${from}%;--to:${pct}%"></span></div>
  <div class="flow-step-caption"><span>${icon('spark')}راهنمای گام‌به‌گام</span><small>گام ${fa(index + 1)} از ${fa(steps.length)}</small></div>
  <h2 id="guide-title" class="question-title" tabindex="-1">${escape(uiLabel(step.title))}</h2>
  <p class="question-desc">${escape(uiLabel(step.hint))}</p>
  <label class="guide-free"><span>${escape(uiLabel(step.freeTextLabel || 'با زبان خودتان بنویسید'))}</span><textarea id="guide-input" rows="2" maxlength="1500" placeholder="${escape(uiLabel(step.placeholder || ''))}">${escape(custom)}</textarea></label>
  ${step.options ? `<div class="guide-options" role="group" aria-label="گزینه‌ها">${step.options.map((o, i) => `<button type="button" class="guide-chip ${chosen === o ? 'selected' : ''}" data-guide-option="${i}" style="--i:${i}" aria-pressed="${chosen === o}"><span class="guide-chip-check" aria-hidden="true"></span><span>${escape(uiLabel(o.label))}</span></button>`).join('')}</div>` : ''}
  ${chosen?.needsDetail ? `<p class="guide-needs-detail" role="status">${escape(chosen.needsDetail)}</p>` : ''}
  ${step.id === 'where' ? `<button type="button" class="plain" data-action="location">افزودن موقعیت کنونی دستگاه (اختیاری)</button><small class="location-note">موقعیت فعلی ممکن است با محل حادثه متفاوت باشد؛ پیش از ادامه بررسی کنید. با ادامه، بخشی از گزارش و در صورت استفاده از مدل بخشی از درخواست آن می‌شود.</small>${miniApp?'<button type="button" class="plain" data-action="open-browser">اگر موقعیت باز نشد، مرورگر گوشی</button>':''}` : ''}
  ${preview ? `<details class="guide-preview"><summary>متنی که تا اینجا ساخته شده</summary><p>${escape(preview)}</p></details>` : ''}
  ${error ? `<p class="error-note" role="alert">${escape(error)}</p>` : ''}
  <div class="actions flow-actions three-step-actions">
   <button class="secondary" data-action="guide-back">بازگشت</button>
   <button class="primary" data-action="guide-next" ${hasValue?'':'disabled'}>ادامه</button>
   <button class="secondary" data-action="guide-skip" ${hasValue?'disabled':''}>اطلاعات بیشتری درباره این بخش ندارم</button>
  </div>
 </section></div>`;
}


/**
 * The emergency numbers this account should see, as something to tap. One
 * short line and the numbers themselves — on a phone, a paragraph here is a
 * paragraph nobody reads. The report stays open underneath it.
 */
export function triageBanner(text, { escape, icon }, analysis = null, { miniApp = false } = {}) {
 const { level, services } = triage(text, analysis);
 if (level === 'none') return '';
 const latin = n => n.replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
 // A real tel: anchor preserves the user's native tap (including long-press
 // and JS failure). Some WebViews block it, so an immediate browser/manual
 // fallback is exposed without claiming that the dialer opened.
 const tile = s => `<a href="tel:${latin(s.number)}" data-dial="${latin(s.number)}" aria-label="تماس با ${escape(s.name)}، ${escape(s.number)}"><b>${escape(s.number)}</b><span>${escape(s.name)}</span></a>`;
 return `<section class="triage ${level}" role="status" aria-label="شماره‌های فوریت">
  <p>${icon('help')}${level === 'emergency' ? 'اگر همین حالا در جریان است، اول تماس بگیرید.' : 'اگر خطر هنوز برقرار است، اول تماس بگیرید.'}</p>
  <div class="triage-numbers">${services.map(tile).join('')}</div>
  <div class="triage-fallback" id="triage-fallback" hidden></div>
 </section>`;
}

/** What the emergency panel shows, as a short key: equal keys, identical panel. */
export function triageKey(text) {
 const { level, numbers } = triage(text);
 return `${level}:${numbers.join(',')}`;
}
