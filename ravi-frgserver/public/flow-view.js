import {EVENTS,eventIds} from './scenarios.js';
import {detailField} from './input-ui.js';
import {plateEditor} from './plate-ui.js';
import {uiLabel} from './ui-label.js';
import {pageHasInput} from './question-flow.js';

export function renderFlow(c,h){
 const {q,flow,schema,page,row,hasDetails,known,canNext}=c;
 const {escape:e,fa,icon}=h;
 const phase=flow.phase,main=phase==='main',fields=phase==='fields',gate=phase==='gate',more=phase==='more';
 const title=fields?page.title:gate?c.gateTitle:more?({person:'از فرد دیگری هم اطلاعاتی دارید؟',place:'مکان دیگری هم با این اتفاق مرتبط بود؟',vehicle:'از وسیلهٔ نقلیهٔ دیگری هم اطلاعات دارید؟',object:'وسیله یا مال دیگری هم می‌خواهید اضافه کنید؟',contact:'راه ارتباطی دیگری هم می‌دانید؟'}[q.id]||'اطلاعات دیگری هم دارید؟'):q.title;
 const hint=fields?page.hint:gate?'اگر می‌دانید، چند جزئیات کوتاه را در گام‌های بعدی اضافه کنید.':more?'می‌توانید مورد دیگری را اضافه کنید یا به ادامهٔ گزارش بروید.':q.hint;
 const currentName=(fields||more)&&schema?.repeat?`مورد ${fa(flow.row+1)}`:'پرسش تکمیلی';
 const synopsis=`<details class="flow-context"><summary><span>${icon('file')}شرح و اطلاعات ثبت‌شده</span><small>${fa(eventIds(c.analysis).length)} موضوع</small></summary><div class="flow-context-body"><p>${e(c.text)}</p><div class="topic-tags">${eventIds(c.analysis).map(id=>`<span class="analysis-tag">${e(EVENTS[id].title)}</span>`).join('')}</div>${known||''}<div class="inline-edit"><button class="plain" data-action="edit-text">ویرایش شرح</button><button class="plain" data-action="correct-event">اصلاح موضوع گزارش</button></div></div></details>`;
 let body='';
 if(main){
  if(c.prefill)body=c.prefill;
  if(!q.group)body+=`<textarea id="answer" class="field answer-field" rows="3" maxlength="2000" aria-label="${e(q.title)}" placeholder="${e(q.placeholder||'پاسخ شما…')}">${e(c.answer)}</textarea>`;
  body+=`<div class="quick-options ${q.group?'group-choice':''}">${q.options.map((value,i)=>`<button data-answer="${e(value)}" class="${c.answer===value?'selected':''}" aria-pressed="${c.answer===value}">${q.group&&hasDetails?(i===0?'جزئیات بیشتری می‌دانم':'همین اطلاعات را دارم'):e(value)}</button>`).join('')}</div>`;
  if(hasDetails)body+=`<button class="plain flow-edit-details" data-action="flow-edit">${icon('edit')}بازبینی جزئیات ثبت‌شده</button>`;
 }else if(gate){
  body=`<div class="flow-choices"><button class="choice-card" data-action="flow-start">${icon('plus')}بله، جزئیات بیشتری می‌دانم ${icon('arrow')}</button><button class="choice-card" data-action="flow-finish">اطلاعات بیشتری ندارم ${icon('arrow')}</button></div>`;
 }else if(fields){
  body=`<div class="detail-grid flow-fields">${page.fields.map(f=>detailField({...f,visuallyHiddenLabel:page.fields.length===1&&page.title===f.label},row,q.id,flow.row)).join('')}</div>${page.plate?plateEditor(row,flow.row):''}`;
 }else if(more){
  body=`<div class="flow-saved">${icon('check')}${c.rowSummary?'اطلاعات این '+e(schema.singular)+' نگه داشته شد.':'جزئیاتی برای این مورد وارد نشده است.'}</div>${c.rowSummary||''}<div class="flow-choices">${c.rowCount<20?`<button class="choice-card" data-action="flow-add">${icon('plus')}افزودن ${e(schema.singular)} دیگر ${icon('arrow')}</button>`:''}<button class="choice-card" data-action="flow-finish">مورد دیگری ندارم؛ ادامه ${icon('arrow')}</button></div><button class="plain" data-action="flow-edit">${icon('edit')}اصلاح همین مورد</button>`;
 }
 const filled=fields?pageHasInput(page,row):main?Boolean(String(c.answer||'').trim()):false;
 const skipAction=main?'flow-unknown':'flow-skip';
 return `<div class="content flow-content">${h.stepper()}<div class="flow-progress"><span>پرسش‌های تکمیلی</span><small>بخش ${fa(c.index+1)} از ${fa(c.total)}</small><div class="flow-progress-track"><span style="width:${Math.round(c.index/c.total*100)}%"></span></div></div>${synopsis}<section class="panel question-panel focused-question" aria-live="polite"><div class="flow-step-caption"><span>${icon('spark')}${e(currentName)}</span>${fields?`<small>گام ${fa(c.pageIndex+1)} از ${fa(c.pageCount)}</small>`:''}</div><h2 class="question-title">${e(uiLabel(title))}</h2><p class="question-desc">${e(hint)}</p>${body}${c.error?`<div class="error-note" role="alert">${e(c.error)}</div>`:''}${main?`<div class="flow-help"><button class="plain" data-action="answer-help">${icon('help')}راهنمای پاسخ</button>${q.id==='place'&&!c.unknown?`<button type="button" class="plain" data-action="location">افزودن موقعیت کنونی دستگاه (اختیاری)</button><small class="location-note">ممکن است با محل حادثه متفاوت باشد؛ بررسی کنید. با ادامه، بخشی از گزارش و در صورت استفاده از مدل بخشی از درخواست آن می‌شود.</small>${h.miniApp?'<button type="button" class="plain" data-action="open-browser">اگر موقعیت باز نشد، مرورگر گوشی</button>':''}`:''}</div>${c.help?`<div class="ai-help">${e(c.help)}</div>`:''}`:''}<div class="actions flow-actions three-step-actions"><button class="secondary" data-action="question-back">بازگشت</button><button class="primary" id="next-question" data-action="question-next" ${filled?'':'disabled'}>ادامه</button><button class="secondary" id="skip-question" data-action="${skipAction}" ${filled?'disabled':''}>اطلاعات بیشتری درباره این بخش ندارم</button></div></section></div>`;
}
