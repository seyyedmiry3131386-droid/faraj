import {detailSchema,visibleFields} from './details.js';
import {numericErrors} from './inputs.js';
import {plateVisible,plateErrors} from './plates.js';
import {contactErrors} from './contacts.js';
import {reportMode,adapt} from './voice-mode.js';

// Classification and repeated provenance belong to analysis, not to the form.
const technical=new Set(['eventRef','personRef','placeRef','role','basis','subtype','certainty','placeType']);
const page=(id,title,fields,hint='هر موردی را که می‌دانید بنویسید؛ بقیه می‌تواند خالی بماند.')=>({id,title,fields,hint});
const groups={
 person:[
  page('observation','این فرد چه اقدامی انجام داد؟',['notes','movement'],'فقط آنچه از این فرد دیدید یا درباره‌اش شنیدید بنویسید.'),
  page('appearance','سن و ظاهر این فرد را به یاد دارید؟',['age','height','build']),
  page('recognition','چه ویژگی ظاهری دیگری به یاد دارید؟',['clothes','hair','marks']),
  page('count','اگر چند نفر حضور داشتند، تعداد آن‌ها را می‌دانید؟',['count'])
 ],
 place:[
  page('area','این مکان در کدام محدوده قرار دارد؟',['province','city','district']),
  page('address','خیابان یا نشانهٔ نزدیک را می‌دانید؟',['street','landmark']),
  page('building','نام محل یا پلاک ساختمان را می‌دانید؟',['building','number']),
  page('inside','از جزئیات نشانی چیزی می‌دانید؟',['floor','unit','postal']),
  page('context','در این مکان چه اتفاقی افتاد؟',['context','observedAt'],'اگر چند مکان را معرفی کرده‌اید، آنچه در این مکان اتفاق افتاد را کوتاه بنویسید.')
 ],
 vehicle:[
  page('description','چه وسیلهٔ نقلیه‌ای بود؟',['kind','model','color']),
  page('plate','چه بخش‌هایی از پلاک را مشاهده کردید؟',['plateStatus'],'اگر پلاک را ندیدید، همان گزینه را انتخاب کنید.'),
  {...page('plate-entry','بخش‌هایی از پلاک را که دیده‌اید وارد کنید.',[],'قالب پلاک را انتخاب کنید و فقط قسمت‌های معلوم را بنویسید.'),plate:true},
  page('observation','دربارهٔ این وسیله چه چیزی مشاهده کردید؟',['observation','count']),
  page('movement','نشانهٔ خاص یا جهت حرکت را به یاد دارید؟',['marks','direction']),
  page('context','این وسیله چه ارتباطی با اتفاق داشت؟',['relation','observedAt'],'اگر فقط در نزدیکی محل بود، همین را بنویسید؛ ارتباط نامعلوم را حدس نزنید.')
 ],
 object:[
  page('description','این وسیله یا مال چه بود؟',['label','brand','color']),
  page('identity','از تعداد و مشخصات آن چه می‌دانید؟',['quantity','serial','marks']),
  page('condition','وضعیت و آخرین مشاهدهٔ آن را شرح می‌دهید؟',['condition','lastSeen']),
  page('notes','نکتهٔ دیگری دربارهٔ این وسیله دارید؟',['notes'])
 ],
 contact:[
  page('kind','چه راه ارتباطی‌ای در این اتفاق استفاده شد؟',['kind']),
  page('platform','کدام شبکهٔ اجتماعی یا پیام‌رسان بود؟',['platform','otherPlatform']),
  page('social','شناسه یا پیوند آن صفحه را می‌دانید؟',['socialValue']),
  page('phone-kind','چه نوع شماره‌ای دارید؟',['phoneType','phoneCompleteness']),
  page('phone','شماره‌ای را که می‌دانید وارد کنید.',['province','subscriber','mobile','international','phone']),
  page('phone-extra','شماره داخلی یا توضیحی دربارهٔ شماره دارید؟',['extension','phoneNotes']),
  page('email','نشانی ایمیل را می‌دانید؟',['email']),
  page('web','نشانی وب‌سایت را می‌دانید؟',['url']),
  page('context','این راه ارتباطی در اتفاق چه نقشی داشت؟',['context','displayName','contactTime'])
 ],
 time:[page('when','تاریخ یا ساعت دقیق‌تری می‌دانید؟',['date','period','clock']),page('duration','این اتفاق چقدر طول کشید؟',['duration'])],
 source:[
  page('informant','آیا فردی را که این موضوع را به شما اطلاع داد می‌شناسید؟',['informantKnown'],'اگر نمی‌شناسید هم اشکالی ندارد؛ فقط یک راه تماس با او کافی است.'),
  page('informant-known','دربارهٔ او چه می‌دانید؟',['informantRelation','informantName','informantWitness'],'فقط آنچه برای پیگیری لازم است.'),
  page('informant-contact','شماره یا راه ارتباطی با او را دارید؟',['informantContact'],'برای پیگیری، حتی یک شماره یا شناسهٔ پیام‌رسان کافی است. اگر ندارید، از آن بگذرید.'),
  page('evidence','چه جزئیاتی از منبع خبر می‌دانید؟',['url','notes','time'])
 ]
};
const LASTING=new Set(['assault','harassment','confinement','trafficking','service','fire','public_nuisance','environment','business_observation','gambling','drug_use','disaster','explosion','weapon_threat','shooting','pdf_a02','pdf_a03','pdf_a04','other']);
function lasting(analysis,text){
 const events=(analysis?.events||[analysis?.event]).map(e=>typeof e==='string'?e:e?.type).filter(Boolean);
 return !events.length||events.some(e=>LASTING.has(e))||/مدت|چند\s*ساعت|ساعت\s*ها|روزها|هفته\s*ها|ادامه\s*دار|هنوز/.test(String(text||''));
}
/** «Someone else told me», in the questionnaire's wording or the reporter's own. */
export const isHearsay=value=>/از\s*(?:شخص|فرد|کس)\s*دیگری?\s*شنیدم|به\s*من\s*گفت|بهم\s*گفت|تعریف\s*کرد|خبر\s*داد|شنیدم/u.test(String(value||''));
export function fieldIsAsked(section,id){
 if(technical.has(id)||(id==='label'&&section!=='object'))return false;
 return groups[section]?groups[section].some(p=>p.fields.includes(id)):true;
}
export const GATE_COPY={
 place:'نشانی دقیق‌تر یا مکان دیگری را می‌دانید؟',time:'زمان دقیق‌تر یا مدت اتفاق را می‌دانید؟',source:'توضیح بیشتری دربارهٔ نحوهٔ اطلاع خود دارید؟',
 person:'از ظاهر یا رفتار این افراد چیز دیگری به یاد دارید؟',vehicle:'از این وسیله چیز دیگری می‌دانید؟ (رنگ، پلاک، جهت حرکت)',object:'مشخصات بیشتری از این اموال می‌دانید؟'
};
export function detailPages(section,row,event,context={}){
 const schema=detailSchema(section,event,context);if(!schema)return [];
 const fields=visibleFields(schema,row).filter(f=>!technical.has(f.id)&&!f.ref&&!(f.id==='label'&&section!=='object'));
 const byId=new Map(fields.map(f=>[f.id,f]));
 const defs=groups[section]||fields.map(f=>page(f.id,f.label,[f.id],'اگر اطلاعاتی دربارهٔ این مورد ندارید، از آن بگذرید.'));
 // Worded for how the reporter knows: an eyewitness is asked what they saw,
 // someone who was told is asked what they were told.
 const mode=reportMode(context.answers,context.text);
 return defs.flatMap(p=>{
  if(section==='place'&&p.id==='context'&&(context.extra?.place?.rows?.length||0)<2)return [];
  if(section==='person'&&p.id==='count'&&(context.rowIndex>0||context.extra?.details_assault?.enabled&&context.extra.details_assault.rows?.some(r=>r.peopleCount)))return [];
  if(p.plate)return plateVisible(row)?[{...p,fields:[]}]:[];
  // How long it lasted matters for something that goes on (a fight, a
  // threat, a blocked road); for a theft it is noise.
  if(section==='time'&&p.id==='duration'&&!lasting(context.analysis,context.text))return [];
  // The informant pages exist only when the reporter heard it from someone.
  if(section==='source'&&p.id.startsWith('informant')){
   if(!isHearsay(context.answers?.source))return [];
   if(p.id==='informant-known'&&row?.informantKnown!=='بله، می‌شناسمش')return [];
   if(p.id==='informant-contact'&&row?.informantKnown!=='بله، می‌شناسمش')return [];
  }
  // The narrative already named the day («دیشب»), so the date is filled and
  // the question becomes the one thing still missing: roughly what time.
  if(section==='time'&&p.id==='when'&&row?._derivedFrom&&row.date){
   const order=['period','clock','date'].filter(id=>byId.has(id)).map(id=>byId.get(id));
   return [{...p,title:'حدود چه ساعتی بود؟',hint:`تاریخ از «${row._derivedFrom}» در شرح شما پر شد (${row.date}). اگر درست نیست، اصلاحش کنید.`,fields:order}];
  }
  const shown=p.fields.filter(id=>byId.has(id)).map(id=>byId.get(id));
  return shown.length?[{...p,fields:shown}]:[];
 }).map(p=>adapt(p,mode));
}
// The navigation buttons concern the current screen, not data on other
// screens or the entire section. Technical/internal fields never count.
export function pageHasInput(p,row={}){
 if(!p)return false;
 if(p.plate)return Boolean(String(row.plateTemplate||row.plate||'').trim()||Object.values(row.plateDrafts?.[row.plateTemplate]||{}).some(v=>String(v||'').trim()));
 return (p.fields||[]).some(f=>String(row[f.id]??'').trim());
}
export function pageComplete(p,row){
 if(p.plate)return plateVisible(row)&&plateErrors(row).length===0;
 if(p.id==='when'&&row?._derivedFrom&&row.date)return Boolean(String(row.period||'').trim()||String(row.clock||'').trim());
 return p.fields.every(f=>String(row[f.id]||'').trim());
}
export function nextDetailPage(pages,row,after=-1,showKnown=false){return pages.findIndex((p,i)=>i>after&&(showKnown||!pageComplete(p,row)))}
export function pageErrors(section,row,event,p){
 if(!p)return [];
 if(p.plate)return plateErrors(row);
 const errors=[];
 for(const f of p.fields){
  const value=String(row[f.id]||'').trim();if(!value)continue;
  if(f.numeric)errors.push(...numericErrors(f,value));
  else if(value.length>(f.max||300))errors.push(`«${f.label}» بیش از حد طولانی است.`);
  if(f.validate==='url'){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol))throw Error()}catch{errors.push('نشانی وب را با https:// یا http:// وارد کنید.')}}
  if(f.validate==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))errors.push('نشانی ایمیل را بررسی کنید.');
 }
 if(section==='contact'&&['phone','social'].includes(p.id))errors.push(...contactErrors(row));
 return [...new Set(errors)];
}
export function firstInvalidPage(section,row,event,context={}){
 const pages=detailPages(section,row,event,context);
 const index=pages.findIndex(p=>pageErrors(section,row,event,p).length);
 return index>=0?pages[index]:null;
}
export function sectionHasDetails(section,data,event){
 const schema=detailSchema(section,event);if(!schema||!data?.enabled)return false;
 return Boolean(data.rows?.some(row=>visibleFields(schema,row).some(f=>!technical.has(f.id)&&String(row[f.id]||'').trim())||plateVisible(row)&&row.plateTemplate));
}
