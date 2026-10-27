import {LANDLINE_CODES,socialPlatform,socialAddress} from './contacts.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function detailField(f,row,group,index){
 const id=`detail-${group}-${index}-${f.id}`;
 const attrs=`id="${id}" data-detail-group="${group}" data-detail-row="${index}" data-detail-field="${f.id}"`;
 let input=f.type==='select'?`<select class="field" ${attrs}><option value="">انتخاب کنید؛ اگر نمی‌دانید خالی بگذارید</option>${f.options.map(v=>{const value=typeof v==='string'?v:v.value,label=typeof v==='string'?v:v.label;return `<option value="${esc(value)}" ${row[f.id]===value?'selected':''}>${esc(label)}</option>`}).join('')}</select>`:`<input class="field" ${attrs} type="text" ${f.ltr?'dir="ltr"':''} inputmode="${f.numeric?'numeric':f.inputmode||'text'}" maxlength="${f.max||300}" value="${esc(row[f.id]||'')}" placeholder="${esc(f.placeholder||'در صورت اطلاع')}" ${f.numeric?'data-numeric="true"':''}>`;
 if(f.widget==='landline')input=`<div class="structured-entry" dir="ltr"><span class="entry-prefix" aria-label="پیش‌شماره استان">${LANDLINE_CODES[row.province]||'—'}</span>${input}</div><small class="field-help">۸ رقم شماره، بدون پیش‌شماره. می‌توانید شمارهٔ کامل را هم جای‌گذاری کنید.</small>`;
 if(f.widget==='social'){
  const p=socialPlatform(row.platform),parsed=socialAddress(row.platform,row.socialValue);
  input=`<div class="structured-entry social-entry" dir="ltr"><span class="entry-prefix" data-social-prefix="${index}">${esc(/^https?:\/\//.test(row.socialValue||'')?'':p?.prefix||'https://')}</span>${input}</div><small class="field-help">شناسه یا پیوند صفحه را وارد کنید.</small><output class="social-preview" data-social-preview="${index}" dir="ltr">${esc(parsed.error?'':parsed.url)}</output>`;
 }
 return `<div class="detail-cell ${f.wide?'wide':''}"><label for="${id}" ${f.visuallyHiddenLabel?'class="visually-hidden"':''}>${esc(f.label)}</label>${input}</div>`;
}
