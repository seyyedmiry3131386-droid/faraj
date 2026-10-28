import {activePrefills,currentPrefillValue,rejectPrefill,confirmPrefills} from './extraction.js';
import {detailSchema,relevantExtraIds} from './details.js';
import {EVENTS,eventIds} from './scenarios.js';
import {normalizeFieldInput,numericErrors} from './inputs.js';
import {setAnswer,answerIsUnknown} from './answers.js';

// Facts filled from the description are confirmed a screenful at a time.
const PER_PAGE=3;
const eventKey=state=>[...eventIds(state.analysis)].sort().join('|');
export function startAnalysisReview(state){
 const active=new Set(activePrefills(state));
 state.analysisReview={version:1,text:state.text,eventKey:eventKey(state),page:0,complete:false,items:(state.prefillAudit||[]).flatMap((p,i)=>active.has(p)?[i]:[])};
 state.qIndex=0;state.flow=null;state.step=1;state.confirmed=false;
}
export function needsAnalysisReview(state){
 const r=state.analysisReview;
 return Boolean(state.analysis&&(!r||r.version!==1||r.text!==state.text||r.eventKey!==eventKey(state)||!r.complete));
}
export function reviewFrame(state){
 let r=state.analysisReview;
 if(!r||r.version!==1||r.text!==state.text||r.eventKey!==eventKey(state)){startAnalysisReview(state);r=state.analysisReview}
 const total=Math.max(1,Math.ceil(r.items.length/PER_PAGE));
 r.page=Math.min(Math.max(0,r.page),total-1);
 const allowed=relevantExtraIds(state.analysis);
 const entries=r.items.slice(r.page*PER_PAGE,r.page*PER_PAGE+PER_PAGE).flatMap(index=>{
  const p=state.prefillAudit[index];if(!p)return [];
  const schema=detailSchema(p.section,state.analysis.event),field=schema?.fields.find(f=>f.id===p.field);
  const rowIndex=state.extra[p.section]?.rows?.findIndex(row=>row._id===p.rowId)??-1;
  const value=currentPrefillValue(state,p);
  const unavailable=p.status==='rejected'||!allowed.includes(p.section)||!value||(p.field!=='answer'&&!state.extra[p.section]?.enabled);
  return [{...p,index,fieldSchema:field,value,unavailable,unknown:answerIsUnknown(value),label:p.field==='answer'?schema?.title||p.section:field?.label||p.field,sectionTitle:schema?.singular&&rowIndex>=0?`${schema.singular} ${(rowIndex+1).toLocaleString('fa-IR')}`:schema?.title}];
 });
 return {entries,page:r.page,total,empty:r.items.length===0,complete:r.complete};
}
export function editReviewFact(state,index,input){
 const p=state.prefillAudit?.[index];if(!p||p.status==='rejected')return 'این پاسخ دیگر فعال نیست.';
 const schema=detailSchema(p.section,state.analysis.event),field=schema?.fields.find(f=>f.id===p.field);
 if(p.field!=='answer'&&!field)return 'این کادر در بانک سؤال‌ها نیست.';
 const value=p.field==='answer'?String(input).trim():normalizeFieldInput(field,String(input)).trim();
 if(value.length>(p.field==='answer'?2000:field.max||300))return 'متن از ظرفیت این کادر بیشتر است.';
 const errors=field?.numeric?numericErrors(field,value):[];if(errors.length)return errors.join(' ');
 if(!value){rejectPrefill(state,index);return ''}
 if(p.field==='answer')setAnswer(state,p.section,value);
 else{const row=state.extra[p.section]?.rows?.find(row=>row._id===p.rowId);if(!row)return 'این مورد دیگر در گزارش نیست.';row[p.field]=value}
 p.editedValue=value;p.status='edited';state.confirmed=false;return '';
}
export function advanceAnalysisReview(state){
 const frame=reviewFrame(state);
 for(const p of frame.entries)if(!p.unavailable){const audit=state.prefillAudit[p.index];audit.status='confirmed'}
 if(frame.page+1<frame.total){state.analysisReview.page++;return false}
 completeAnalysisReview(state);return true;
}
/**
 * Ends the review. `brief` files what the reporter already wrote and skips
 * straight to documents: a general report is a complete report, and a reporter
 * who has nothing more to add should not be walked through questions to prove
 * it. The detailed path stays the default.
 */
export function completeAnalysisReview(state,{brief=false}={}){
 confirmPrefills(state);state.analysisReview.complete=true;state.brief=brief;
 state.step=brief?2:1;state.qIndex=0;state.flow=null;state.confirmed=false;
}
export function backAnalysisReview(state){
 if(reviewFrame(state).page>0)state.analysisReview.page--;else state.step=0;
}
export function renderAnalysisReview(state,{escape,fa,icon,stepper},error=''){
 const frame=reviewFrame(state),a=state.analysis;
 return `<div class="content flow-content">${stepper()}<section class="panel focused-question extraction-review" aria-labelledby="extraction-review-title"><div class="flow-step-caption"><span>${icon('spark')}بازبینی برداشت از روایت</span><small>گام ${fa(frame.page+1)} از ${fa(frame.total)}</small></div><h2 id="extraction-review-title" class="question-title" tabindex="-1">درست متوجه شدم؟</h2><p class="question-desc">اول این برداشت‌ها را بررسی کنید؛ بعد سراغ سؤال‌های تکمیلی می‌رویم.</p><div class="review-topics"><span>موضوع‌های پیشنهادی</span><div class="topic-tags">${eventIds(a).map(id=>`<span class="analysis-tag">${escape(EVENTS[id].title)}</span>`).join('')}</div><button class="plain" data-action="correct-event">${icon('edit')}اصلاح موضوع‌ها</button></div>${a.needsClarification?'<p class="review-empty">هنوز رفتار مشخصی برای انتخاب موضوع روشن نیست. پس از تأیید، یک سؤال کوتاه برای روشن‌شدن آن می‌پرسم.</p>':''}${frame.empty&&!a.needsClarification?'<p class="review-empty">پاسخ قابل اتکایی برای پرکردن کادرها پیدا نکردم. پس از تأیید موضوع‌ها، جزئیات را از شما می‌پرسم.</p>':''}<div class="review-facts">${frame.entries.map(p=>`<article class="review-fact ${p.unavailable?'removed':''}"><small>${p.field==='answer'?'پاسخ پیشنهادی':escape(p.sectionTitle)}</small><h3>${escape(p.label)}</h3>${p.unavailable?'<p class="review-empty">این پاسخ حذف یا غیرفعال شد؛ در گزارش استفاده نمی‌شود.</p>':`<p class="review-fact-value">${escape(p.value)}</p>${p.editedValue!==undefined?'<small class="review-edited">اصلاح‌شده توسط شما</small>':''}<details><summary>عبارت منبع در روایت</summary><blockquote>${escape(p.evidence)}</blockquote></details><div class="review-fact-actions"><button class="plain" data-review-edit="${p.index}">${icon('edit')}اصلاح پاسخ</button><button class="plain" data-reject-prefill="${p.index}">${icon('trash')}حذف پاسخ</button></div>`}</article>`).join('')}</div><details class="flow-context review-narrative"><summary>نمایش شرح اولیه</summary><div class="flow-context-body"><p>${escape(state.text)}</p><button class="plain" data-action="edit-text">ویرایش شرح و تحلیل دوباره</button></div></details>${error?`<p class="error-note" role="alert">${escape(error)}</p>`:''}<div class="actions flow-actions"><button class="secondary" data-action="analysis-review-back">${icon('back')}بازگشت</button><button class="primary" data-action="analysis-review-next">${frame.page+1<frame.total?'تأیید این بخش و ادامه':'تکمیل جزئیات'}${icon('arrow')}</button></div></section></div>`;
}
