import {categoryForSection,sectionRequired,sectionRelevant} from './question-bank.js';
import {YES,NO,relevantExtraIds} from './details.js';
import {EVENTS,eventIds,detailId} from './scenarios.js';
export {EVENTS,localAnalysis,normalize,normalizeAnalysis,eventIds,detailId} from './scenarios.js';
export function questionsFor(analysis){
 const base={
 clarify:{id:'clarify',title:'دقیقاً چه رفتار یا اتفاقی مشاهده کرده‌اید؟',hint:'به‌جای عنوان کلی، رفتار مشخص، زمان مشاهده و آنچه خودتان دیده یا از دیگری شنیده‌اید را شرح دهید. فعلاً مشخصات خصوصی افراد لازم نیست.',placeholder:'چه دیدید یا چه چیزی به شما گفته شد؟',options:['اطلاعات بیشتری ندارم']},
 time:{id:'time',title:'این اتفاق چه زمانی افتاد؟',hint:'زمان تقریبی هم کافی است.',placeholder:'مثلاً دیروز، حدود ساعت ۱۰ صبح',options:['امروز','دیروز','زمان دقیق را نمی‌دانم']},
 place:{id:'place',title:'این اتفاق کجا افتاد؟',hint:'نام محله، محل یا مسیری را که می‌دانید بنویسید.',placeholder:'محله، خیابان و نشانهٔ نزدیک',options:['مکان را نمی‌دانم']},
 details:{id:'details',title:EVENTS[analysis.event]?.detail||EVENTS.other.detail,hint:EVENTS[analysis.event]?.hint||EVENTS.other.hint,placeholder:'آنچه می‌دانید را بنویسید…',options:['اطلاعات بیشتری ندارم']},
 person:{id:'person',title:'از افراد مرتبط با این اتفاق چیزی می‌دانید؟',hint:'اگر اطلاعاتی دارید، مشخصات هر فرد را جدا و در چند گام کوتاه می‌پرسیم.',group:true,options:[YES,NO]},
 object:{id:'object',title:'از وسایل یا اموال مرتبط با این اتفاق چیزی می‌دانید؟',hint:'مثلاً مال سرقت‌شده، وسیلهٔ آسیب‌دیده یا مدرک مرتبط. خودرو را جدا می‌پرسیم.',group:true,options:[YES,NO]},
 vehicle:{id:'vehicle',title:'از وسیلهٔ نقلیهٔ مرتبط با این اتفاق چیزی می‌دانید؟',hint:'نوع، ظاهر یا پلاک؛ هر مقدار که به یاد دارید کافی است.',group:true,options:[YES,NO]},
 contact:{id:'contact',title:'شماره، حساب یا نشانی اینترنتیِ مرتبط با این اتفاق را می‌دانید؟',hint:'فقط راه ارتباطی‌ای که در همین اتفاق استفاده شده است.',group:true,options:[YES,NO]},
 source:{id:'source',title:'چطور از این اتفاق مطلع شدید؟',hint:'مشاهدهٔ مستقیم را از شنیده‌ها جدا کنید.',placeholder:'نحوهٔ اطلاع خود را توضیح دهید…',options:['خودم شاهد بودم','برای خودم اتفاق افتاده','از شخص دیگری شنیدم','در فضای مجازی دیدم','اطلاعی ندارم']}
 };return relevantExtraIds(analysis).filter(id=>sectionRelevant(id,analysis)).map(id=>{if(id.startsWith('details_')){const event=id.slice(8);return {...base.details,id,title:EVENTS[event].detail,hint:EVENTS[event].hint,topic:EVENTS[event].title,source:EVENTS[event].source}}const custom=(analysis.questions||[]).find(q=>q.id===id);if(custom)return {...custom,placeholder:'فقط آنچه می‌دانید…',options:['اطلاعی ندارم'],topic:EVENTS[custom.event]?.title};return {...base[id]}}).map(q=>({...q,category:categoryForSection(q.id),required:sectionRequired(q.id,analysis)}));
}
export function validateFiles(files,current=[]){
 const errors=[];const accepted=[];let total=current.reduce((n,f)=>n+f.size,0);
 for(const f of files){
  if(current.length+accepted.length>=10){errors.push('حداکثر ۱۰ فایل می‌توانید اضافه کنید.');break}
  if(!f.size){errors.push(`فایل «${f.name}» خالی است.`);continue}
  // Mobile pickers sometimes provide no MIME type or application/octet-stream.
  // Allow the existing set by extension in that case; this is not content or
  // malware verification, and the selected file is kept in browser storage.
  const mime=String(f.type||'').toLowerCase();
  const known=/^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime|3gpp)|audio\/(mpeg|mp3|wav|x-wav|mp4|webm|ogg|x-m4a|aac|3gpp|amr)|application\/pdf)$/.test(mime);
  const generic=(!mime||mime==='application/octet-stream')&&/\.(?:jpe?g|png|webp|gif|heic|heif|mp4|mov|webm|3gp|mp3|wav|m4a|aac|amr|ogg|pdf)$/i.test(f.name||'');
  if(!known&&!generic){errors.push(`نوع فایل «${f.name}» پشتیبانی نمی‌شود.`);continue}
  if(total+f.size>100*1024*1024){errors.push('مجموع حجم فایل‌ها باید حداکثر ۱۰۰ مگابایت باشد.');continue}
  if([...current,...accepted].some(x=>x.name===f.name&&x.size===f.size)){errors.push(`فایل «${f.name}» قبلاً اضافه شده است.`);continue}
  total+=f.size;accepted.push(f)
 }return {accepted,errors};
}
