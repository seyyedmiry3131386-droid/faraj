import {asciiDigits,numericInput} from './inputs.js';
// Provincial prefixes and platform catalog adapted from the supplied original UI.
export const LANDLINE_CODES={'آذربایجان شرقی':'041','آذربایجان غربی':'044','اردبیل':'045','اصفهان':'031','البرز':'026','ایلام':'084','بوشهر':'077','تهران':'021','چهارمحال و بختیاری':'038','خراسان جنوبی':'056','خراسان رضوی':'051','خراسان شمالی':'058','خوزستان':'061','زنجان':'024','سمنان':'023','سیستان و بلوچستان':'054','فارس':'071','قزوین':'028','قم':'025','کردستان':'087','کرمان':'034','کرمانشاه':'083','کهگیلویه و بویراحمد':'074','گلستان':'017','گیلان':'013','لرستان':'066','مازندران':'011','مرکزی':'086','هرمزگان':'076','همدان':'081','یزد':'035'};
export const PHONE_TYPES=['تلفن ثابت ایران','تلفن همراه ایران','شمارهٔ بین‌المللی'];
export const SOCIAL_PLATFORMS=[
 ['telegram','تلگرام','t.me/',['t.me','telegram.me']],['instagram','اینستاگرام','instagram.com/',['instagram.com']],
 ['x','ایکس','x.com/',['x.com','twitter.com']],['whatsapp','واتساپ','wa.me/',['wa.me','whatsapp.com','chat.whatsapp.com','api.whatsapp.com']],
 ['youtube','یوتیوب','youtube.com/',['youtube.com','youtu.be']],['facebook','فیسبوک','facebook.com/',['facebook.com','fb.com']],
 ['linkedin','لینکدین','linkedin.com/',['linkedin.com']],['github','گیت‌هاب','github.com/',['github.com']],
 ['tiktok','تیک‌تاک','tiktok.com/@',['tiktok.com']],['threads','تردز','threads.net/@',['threads.net','threads.com']],
 ['discord','دیسکورد','discord.gg/',['discord.gg','discord.com']],['eitaa','ایتا','eitaa.com/',['eitaa.com']],
 ['bale','بله','ble.ir/',['ble.ir','bale.ai']],['soroush','سروش','splus.ir/',['splus.ir','soroushplus.ir']],
 ['rubika','روبیکا','rubika.ir/',['rubika.ir']],['igap','آی‌گپ','igap.net/',['igap.net']],
 ['gap','گپ','gap.im/',['gap.im']],['virasty','ویراستی','virasty.com/',['virasty.com']],['aparat','آپارات','aparat.com/',['aparat.com']]
].map(([id,name,prefix,hosts])=>({id,name,prefix,hosts}));
export const socialPlatform=value=>SOCIAL_PLATFORMS.find(p=>p.id===value||p.name===value);
export function socialAddress(platform,value){
 const raw=String(value||'').trim(),p=socialPlatform(platform);
 if(!raw)return {url:'',value:'',error:''};
 const fail=error=>({url:'',value:raw,error});
 if(/\s/.test(raw))return fail('شناسه یا پیوند نباید فاصله داشته باشد.');
 const looksURL=/^[a-z][a-z\d+.-]*:/i.test(raw)||/^(?:\/\/|www\.)/i.test(raw)||/^[^/@]+\.[a-z]{2,}\//i.test(raw)||SOCIAL_PLATFORMS.some(item=>item.hosts.includes(raw.toLowerCase()));
 if(looksURL||!p){
  let u;try{u=new URL(/^[a-z][a-z\d+.-]*:/i.test(raw)?raw:'https://'+raw.replace(/^\/\//,''))}catch{return fail('نشانی معتبر را با https:// وارد کنید.')}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port)return fail('فقط پیوند عادی http یا https قابل ثبت است.');
  if(p&&!p.hosts.includes(u.hostname.replace(/^www\./i,'')))return fail('این پیوند متعلق به بستر انتخاب‌شده نیست؛ بستر یا پیوند را اصلاح کنید.');
  if(p&&u.pathname==='/'&&!u.search)return fail('شناسه یا مسیر صفحه را بعد از نام بستر وارد کنید.');
  const prefix=p&&'https://'+p.prefix;
  return {url:u.href,value:prefix&&u.href.startsWith(prefix)?u.href.slice(prefix.length):u.href,error:''};
 }
 const path=raw.replace(/^@|^\/+/, '');
 if(!path)return fail('شناسه یا مسیر صفحه را وارد کنید.');
 return {url:'https://'+p.prefix+path,value:path,error:''};
}
const compactPhone=value=>asciiDigits(value).replace(/[\s()\-–]/g,'');
export function domesticPhone(value){
 let v=compactPhone(value);
 if(v.startsWith('+98'))v='0'+v.slice(3);else if(v.startsWith('0098'))v='0'+v.slice(4);else if(v.length===12&&v.startsWith('98'))v='0'+v.slice(2);
 return v;
}
export function landlineParts(value){
 const v=domesticPhone(value);
 if(!/^\d{11}$/.test(v))return null;
 const province=Object.keys(LANDLINE_CODES).find(name=>v.startsWith(LANDLINE_CODES[name]));
 return province?{province,subscriber:v.slice(3)}:null;
}
export function migrateContact(row){
 if(row.kind==='تلفن'&&!row.phoneType&&row.phone){
  const landline=landlineParts(row.phone),domestic=domesticPhone(row.phone);
  if(landline){row.phoneType=PHONE_TYPES[0];Object.assign(row,landline)}
  else if(/^09\d{9}$/.test(domestic)){row.phoneType=PHONE_TYPES[1];row.mobile=domestic}
  // Unknown legacy phone text stays visible until corrected, never silently removed.
 }
 if(row.kind==='شبکهٔ اجتماعی یا پیام‌رسان'&&!row.socialValue&&(row.url||row.handle))row.socialValue=row.url||row.handle;
 return row;
}
export function setContactInput(row,id,value,{paste=false}={}){
 if(id==='subscriber'){
  const full=landlineParts(value);
  if(full){Object.assign(row,full);return {value:row.subscriber,rerender:true}}
  if(paste&&compactPhone(value).length>8)return {error:'شمارهٔ ثابت کامل باید پیش‌شمارهٔ معتبر و ۸ رقم مشترک داشته باشد؛ ورودی قبلی حفظ شد.'};
  row.subscriber=numericInput(value,8);
 }else if(id==='mobile')row.mobile=numericInput(domesticPhone(value),11);
 else if(id==='international')row.international=numericInput(compactPhone(value).replace(/^\+|^00/,''),15);
 else if(id==='socialValue')row.socialValue=String(value).slice(0,500);
 else row[id]=value;
 return {value:row[id]};
}
export function contactErrors(row){
 const errors=[];
 if(row.kind==='شبکهٔ اجتماعی یا پیام‌رسان'&&row.socialValue){
  if(!row.platform)errors.push('برای نشانی فضای مجازی، بستر را انتخاب کنید.');
  else {const parsed=socialAddress(row.platform,row.socialValue);if(parsed.error)errors.push(parsed.error)}
 }
 if(row.kind!=='تلفن')return errors;
 if(!row.phoneType){if(row.phone)errors.push('نوع شمارهٔ تلفن قبلی را انتخاب و قالب آن را بررسی کنید.');return errors}
 const partial=row.phoneCompleteness==='فقط بخشی از شماره';
 if(row.phoneType===PHONE_TYPES[0]&&row.subscriber){
  if(!/^\d{1,8}$/.test(asciiDigits(row.subscriber))||(!partial&&(!LANDLINE_CODES[row.province]||row.subscriber.length!==8)))errors.push('شمارهٔ ثابت کامل به استان و ۸ رقم مشترک نیاز دارد؛ شمارهٔ ناقص را «فقط بخشی از شماره» علامت بزنید.');
 }
 if(row.phoneType===PHONE_TYPES[1]&&row.mobile&&!new RegExp(partial?'^\\d{1,11}$':'^09\\d{9}$').test(asciiDigits(row.mobile)))errors.push('شمارهٔ همراه کامل باید ۱۱ رقم و با ۰۹ شروع شود؛ شمارهٔ ناقص را مشخص کنید.');
 if(row.phoneType===PHONE_TYPES[2]&&row.international&&!new RegExp(partial?'^\\d{1,15}$':'^[1-9]\\d{5,14}$').test(asciiDigits(row.international)))errors.push('شمارهٔ بین‌المللی را همراه کد کشور و حداکثر ۱۵ رقم وارد کنید.');
 return errors;
}
export function contactDerived(row){
 const fields=[];
 if(row.kind==='تلفن'){
  const partial=row.phoneCompleteness==='فقط بخشی از شماره';let number='';
  if(row.phoneType===PHONE_TYPES[0]&&row.subscriber)number=(LANDLINE_CODES[row.province]||'؟')+' '+row.subscriber;
  if(row.phoneType===PHONE_TYPES[1])number=row.mobile||'';
  if(row.phoneType===PHONE_TYPES[2]&&row.international)number='+'+row.international;
  if(number)fields.push({id:'formattedPhone',label:partial?'بخش مشاهده‌شدهٔ شماره (ناقص)':'شمارهٔ تلفن با پیش‌شماره',value:number});
 }
 if(row.kind==='شبکهٔ اجتماعی یا پیام‌رسان'){
  const parsed=socialAddress(row.platform,row.socialValue);
  if(parsed.url&&!parsed.error)fields.push({id:'socialLink',label:'نشانی فضای مجازی',value:parsed.url});
 }
 return fields;
}
