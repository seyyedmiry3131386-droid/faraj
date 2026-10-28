import {PLATE_TEMPLATES,plateTemplate,plateParts,plateFields,plateVisible,persianDigits} from './plates.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const band='<span class="plate-band" aria-hidden="true"><span class="plate-flag"><i></i><i></i><i></i></span><b>I.R.</b><b>IRAN</b></span>';
function plaque(t,p,index=null,partial=false){
 const edit=index!==null;
 const slot=(key,length,extra='')=>{const f=plateFields(t).find(f=>f.id===key);const v=String(p[key]||'');return edit?`<input class="plate-slot ${extra}" data-plate-row="${index}" data-plate-part="${key}" aria-label="${esc(f?.label||key)}" autocomplete="off" inputmode="${f?.numeric&&!partial?'numeric':'text'}" maxlength="${f?.length||40}" value="${esc(v)}" placeholder="${'ـ'.repeat(Math.min(length,5))}" dir="ltr">`:`<span class="plate-slot plate-value ${extra}" style="font-family:'Vazir',Arial,sans-serif">${esc(persianDigits(v||'؟'.repeat(length)))}</span>`};
 let content='';
 if(t.layout==='national')content=`${band}${slot('left',2)}${t.symbol?`<span class="plate-symbol">${esc(t.symbol)}</span>`:slot('letter',1,'plate-letter')} ${slot('middle',3)}<span class="plate-region"><small>ایران</small>${slot('region',2)}</span>`;
 else if(t.layout==='motorcycle')content=`${band}<span class="plate-motor-rows">${slot('top',3)}${slot('bottom',5)}</span>`;
 else if(t.layout==='freezone')content=`${band}<span class="plate-free-numbers">${slot('number',5)}<small>منطقهٔ آزاد</small></span><span class="plate-region"><small>کد منطقه</small>${slot('region',2)}</span>`;
 else content=`${band}<span class="plate-free-text"><small>${esc(t.label)}</small>${slot('text',5)}</span>`;
 return `<div class="iran-plate tone-${t.tone} layout-${t.layout}" dir="ltr" ${edit?'role="group" aria-label="ورود اطلاعات در قالب پلاک"':'role="img" aria-label="'+esc(t.label+'؛ '+Object.values(p).join(' '))+'"'}>${content}</div>`;
}
export function plateEditor(row,index){
 if(!plateVisible(row))return '';
 const t=plateTemplate(row.plateTemplate),p=plateParts(row);
 return `<section class="plate-editor" aria-label="پلاک وسیلهٔ نقلیه ${index+1}"><label for="plate-template-${index}">قالب پلاک مشاهده‌شده</label><select class="field" id="plate-template-${index}" data-plate-template="${index}"><option value="">قالب را انتخاب کنید</option>${PLATE_TEMPLATES.map(x=>`<option value="${x.id}" ${x.id===row.plateTemplate?'selected':''}>${esc(x.label)}</option>`).join('')}</select>${t?`${plaque(t,p,index,row.plateStatus==='بخشی را دیدم')}${t.layout==='freezone'?`<label for="plate-zone-${index}">نام منطقهٔ آزاد، در صورت مشاهده</label><input id="plate-zone-${index}" class="field" data-plate-row="${index}" data-plate-part="zone" maxlength="30" value="${esc(p.zone||'')}">`:''}<p class="plate-tip">${row.plateStatus==='بخشی را دیدم'?'فقط بخش دیده‌شده را وارد کنید. جای رقم نامعلوم «؟» بگذارید؛ بخش کاملاً نامعلوم را خالی بگذارید.':'اعداد و حرف را مطابق پلاک وارد کنید. اگر بخشی را نمی‌دانید، وضعیت را به «بخشی را Didem» تغییر دهید.'}</p>`:'<p class="plate-tip">نوع نامشخص یا پلاک متفاوت را با گزینهٔ «قالب دیگر / نامشخص» ثبت کنید.</p>'}${!t&&row.plate?`<label for="legacy-plate-${index}">متن پلاک از پیش‌نویس قبلی</label><input class="field" id="legacy-plate-${index}" data-detail-group="vehicle" data-detail-row="${index}" data-detail-field="plate" value="${esc(row.plate)}"><p class="plate-tip">متن قبلی حفظ شده است؛ با انتخاب قالب، بخش‌های دیده‌شده را وارد کنید.</p>`:''}</section>`;
}
export function savedPlatePreview(plate){const t=plateTemplate(plate?.template);return t?plaque(t,plate.parts||{}):''}
