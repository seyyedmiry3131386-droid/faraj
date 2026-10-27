// Reporting templates adapted from the user's original plate picker. Formatting
// validates a transcription, never ownership, authenticity or vehicle identity.
const template=(id,label,layout='national',tone='white',symbol='')=>({id,label,layout,tone,symbol});
export const PLATE_TEMPLATES=[
 template('private','شخصی / ملی'),template('accessible','نشان ویلچر','national','white','♿'),
 template('taxi','تاکسی','national','yellow','ت'),template('public','عمومی','national','yellow','ع'),
 template('government','دولتی','national','red','الف'),template('police','انتظامی','national','green','پ'),
 template('irgc','سپاه','national','green','ث'),template('army','ارتش','national','khaki','ش'),
 template('armed_forces','ستاد کل','national','blue','ف'),template('defense','وزارت دفاع','national','blue','ز'),
 template('agricultural','کشاورزی','national','yellow','ک'),template('temporary','گذر موقت (گ)','national','white','گ'),
 template('diplomatic','دیپلماتیک (D)','national','blue','D'),template('service','خدمات سفارت (S)','national','blue','S'),
 template('motorcycle','موتورسیکلت','motorcycle'),template('freezone','منطقهٔ آزاد','freezone'),
 template('latin','گذر موقت / لاتین','latin'),template('protocol','تشریفات','free','red'),
 template('historical','تاریخی','free','brown'),template('other','قالب دیگر / نامشخص','free')
];
export const plateTemplate=id=>PLATE_TEMPLATES.find(t=>t.id===id);
export const asciiDigits=s=>String(s||'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
export const persianDigits=s=>asciiDigits(s).replace(/\d/g,c=>'۰۱۲۳۴۵۶۷۸۹'[Number(c)]);
export const plateVisible=row=>row.kind!=='دوچرخه'&&['کامل دیدم','بخشی را دیدم'].includes(row.plateStatus);
export const plateParts=row=>row.plateDrafts?.[row.plateTemplate]||{};
export function normalizePlateInput(row,key,value){
 const field=plateFields(plateTemplate(row.plateTemplate)).find(f=>f.id===key);
 if(!field)return '';
 let v=asciiDigits(value);
 if(field.numeric)v=v.replace(row.plateStatus==='بخشی را دیدم'?/[^\d?؟]/g:/\D/g,'').replace(/\?/g,'؟');
 if(key==='letter')v=v.replace(/[يك]/g,c=>c==='ي'?'ی':'ک').replace(/[^آ-ی؟]/g,'');
 return field.numeric?persianDigits(v.slice(0,field.length)):v.slice(0,field.length);
}
export function plateFields(t){
 if(!t)return [];
 if(t.layout==='national')return [{id:'left',label:'دو رقم سمت چپ',length:2,numeric:true},...(!t.symbol?[{id:'letter',label:'حرف پلاک',length:3}]:[]),{id:'middle',label:'سه رقم میانی',length:3,numeric:true},{id:'region',label:'کد دو رقمی ایران',length:2,numeric:true}];
 if(t.layout==='motorcycle')return [{id:'top',label:'سه رقم ردیف بالا',length:3,numeric:true},{id:'bottom',label:'پنج رقم ردیف پایین',length:5,numeric:true}];
 if(t.layout==='freezone')return [{id:'number',label:'شمارهٔ پنج رقمی',length:5,numeric:true},{id:'region',label:'کد منطقهٔ آزاد',length:2,numeric:true},{id:'zone',label:'نام منطقهٔ آزاد',length:30,optional:true}];
 return [{id:'text',label:'نوشتهٔ مشاهده‌شده روی پلاک',length:40}];
}
export function plateText(row){
 if(!plateVisible(row))return '';
 const t=plateTemplate(row.plateTemplate);if(!t)return String(row.plate||'').trim();
 const p=plateParts(row),parts=plateFields(t);if(!parts.some(f=>String(p[f.id]||'').trim()))return '';
 const val=(id,n)=>persianDigits(p[id]||'؟'.repeat(n));
 if(t.layout==='national')return `${val('left',2)} ${t.symbol||p.letter||'؟'} ${val('middle',3)} ایران ${val('region',2)}`;
 if(t.layout==='motorcycle')return `بالا: ${val('top',3)} / پایین: ${val('bottom',5)}`;
 if(t.layout==='freezone')return `${val('number',5)} — کد ${val('region',2)}${p.zone?` — ${p.zone}`:''}`;
 return String(p.text||'').trim();
}
export function plateErrors(row){
 if(!plateVisible(row))return [];
 if(row._plateSkipped&&!row.plateTemplate&&!String(row.plate||'').trim())return [];
 const t=plateTemplate(row.plateTemplate);
 // Preserve older free-text drafts until their author explicitly selects a template.
 if(!t)return row.plate?.trim()?[]:['قالب پلاک را انتخاب کنید و بخش مشاهده‌شده را بنویسید.'];
 const parts=plateParts(row),fields=plateFields(t),full=row.plateStatus==='کامل دیدم',errors=[];
 const hasObserved=fields.some(f=>/[\dA-Za-zآ-ی♿]/.test(asciiDigits(parts[f.id])));
 if(!hasObserved)errors.push('حداقل یک بخش دیده‌شده از پلاک را بنویسید؛ یا وضعیت مشاهده را تغییر دهید.');
 for(const f of fields){const v=asciiDigits(parts[f.id]).trim();if(full&&!f.optional&&!v){errors.push(`«${f.label}» را کامل کنید یا «بخشی را دیدم» را انتخاب کنید.`);continue}if(!v)continue;
 if(f.numeric){const allowed=full?/^\d+$/:/^[\d?؟]+$/;if(!allowed.test(v)||(full?v.length!==f.length:v.length>f.length))errors.push(`«${f.label}» ${full?`باید ${f.length} رقم باشد`:`حداکثر ${f.length} رقم یا علامت ؟ می‌پذیرد`}.`)}
 else if(f.id==='letter'&&!/^(?:[بجددسصطقلم نوهیژزگتپثشفکع]|الف|[?؟])$/.test(v.replace(/\s/g,'')))errors.push('حرف پلاک را بررسی کنید؛ برای قالب‌های خاص، نوع مناسب را انتخاب کنید.');
 if(full&&/[?؟]/.test(v))errors.push('برای بخش نامعلوم، وضعیت «بخشی را دیدم» را انتخاب کنید.');
 }return [...new Set(errors)];
}
export function serializePlate(row){
 const t=plateTemplate(row.plateTemplate),text=plateText(row);if(!text)return null;
 return {template:t?.id||'legacy',label:t?.label||'متن ثبت‌شدهٔ قبلی',status:row.plateStatus,text,parts:t?Object.fromEntries(plateFields(t).filter(f=>String(plateParts(row)[f.id]||'').trim()).map(f=>[f.id,plateParts(row)[f.id]])):{text}};
}
