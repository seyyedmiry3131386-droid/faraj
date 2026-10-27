import {EXTENDED_EVENTS,TOPIC_VARIANTS} from './extended-bank.js';
import {NUMBERED_TOPICS} from './numbered-topics.js';
import {orderedSections} from './question-bank.js';
import {numericErrors} from './inputs.js';
import {LANDLINE_CODES,PHONE_TYPES,SOCIAL_PLATFORMS,contactErrors,contactDerived} from './contacts.js';
import {plateVisible,serializePlate,plateErrors} from './plates.js';
import {EVENTS,eventIds,detailId} from './scenarios.js';
import {uiLabel} from './ui-label.js';
const presentSchema=s=>({...s,title:uiLabel(s.title),...(s.singular?{singular:uiLabel(s.singular)}:{}),fields:s.fields.map(f=>({...f,label:uiLabel(f.label)}))});
const field=(id,label,extra={})=>({id,label,...extra});
const select=(id,label,options,extra={})=>field(id,label,{type:'select',options,...extra});
export const YES='بله، اطلاعات دارم',NO='خیر، اطلاعی ندارم';
export const DETAILS={
 source:{title:'جزئیات منبع اطلاع',toggle:'جزئیات بیشتری از نحوهٔ اطلاع دارم',fields:[
 // When someone else told the reporter, that person is the one who saw it.
 // Knowing them opens more; not knowing them still leaves one thing worth
 // having: any way to reach them.
 select('informantKnown','آیا فردی را که این موضوع را به شما اطلاع داد می‌شناسید؟',['بله، می‌شناسمش','نه، نمی‌شناسمش']),
 field('informantRelation','نسبت یا آشنایی شما با او',{placeholder:'مثلاً همسایه، همکار، یکی از اقوام',show:r=>r.informantKnown==='بله، می‌شناسمش'}),
 field('informantName','نام یا عنوانی که او را با آن می‌شناسید',{placeholder:'فقط اگر لازم می‌دانید',show:r=>r.informantKnown==='بله، می‌شناسمش'}),
 select('informantWitness','آیا آن فرد خود شاهد این اتفاق بود؟',['خودش دید','خودش هم از کسی شنیده بود','نمی‌دانم'],{show:r=>r.informantKnown==='بله، می‌شناسمش'}),
 field('informantContact','شماره یا راه ارتباطی با او',{ltr:true,max:120,placeholder:'شمارهٔ تلفن یا شناسهٔ پیام‌رسان'}),
 field('time','زمان مطلع شدن از رخداد'),field('type','نوع منبع',{placeholder:'مثلاً مشاهدهٔ مستقیم یا آگهی اینترنتی'}),field('url','پیوند مطلب مرتبط، در صورت وجود',{validate:'url',ltr:true,placeholder:'https://…'}),field('notes','توضیح نحوهٔ اطلاع',{wide:true})]},
 time:{title:'جزئیات زمان',toggle:'تاریخ، ساعت یا بازهٔ دقیق‌تری می‌دانم',fields:[field('date','تاریخ رخداد',{placeholder:'مثلاً ۱۴۰۵/۰۶/۲۹'}),select('period','حدود چه ساعتی',['صبح زود','صبح','ظهر','بعدازظهر','عصر','شب','نیمه‌شب','نمی‌دانم']),field('clock','ساعت دقیق، اگر می‌دانید',{placeholder:'مثلاً ۲۱:۳۰ یا بین ۱۸ تا ۱۹'}),field('duration','مدت رخداد',{placeholder:'مثلاً حدود ده دقیقه'}),select('certainty','دقت زمان',['دقیق','تقریبی'])]},
 place:{title:'مکان‌های مرتبط',toggle:'نشانی دقیق‌تر یا چند مکان مرتبط می‌دانم',singular:'مکان',repeat:true,fields:[field('label','عنوان مکان',{placeholder:'مثلاً محل اول یا مقصد گفته‌شده'}),select('role','ارتباط این مکان با رخداد',['محل مشاهده','مبدأ حرکت','محل نگهداری','محل توقف','مقصد مشاهده‌شده','مقصد گفته‌شده','نامعلوم','سایر']),field('observedAt','زمان اتفاق در این مکان'),field('context','آنچه در این مکان اتفاق افتاد',{wide:true}),select('basis','نحوهٔ اطلاع از مکان',['خودم مشاهده کردم','از فرد درگیر شنیدم','از شاهد شنیدم','در مستندات مرتبط دیدم']),field('province','استان'),field('city','شهر یا روستا'),field('district','محله یا محدوده'),field('street','خیابان و کوچه'),field('building','نام یا توصیف محل'),select('placeType','نوع مکان',['رستوران یا کافه','مسکونی','تجاری','اداری','کارگاه یا انبار','معبر عمومی','فضای باز','نامشخص']),field('number','پلاک ساختمان',{max:30}),field('postal','کدپستی',{inputmode:'numeric',numeric:true,max:10,exact:10,placeholder:'۱۰ رقم، در صورت اطلاع'}),field('floor','طبقه',{max:20}),field('unit','واحد',{max:20}),field('landmark','نشانهٔ نزدیک یا مسیر دسترسی',{wide:true})]},
 person:{title:'افراد مرتبط با رخداد',singular:'فرد',repeat:true,fields:[field('label','عنوان فرد در این گزارش',{placeholder:'مثلاً فرد اول؛ نیازی به نام کامل نیست'}),select('role','نقش فرد طبق اطلاعات شما',['فرد آسیب‌دیده','شاهد','فردی که رفتار گزارش‌شده را انجام داد','راننده','فرد تماس‌گیرنده','نقش نامعلوم','سایر']),select('basis','نحوهٔ اطلاع از مشخصات',['خودم مشاهده کردم','در تصویر یا ویدئوی رخداد دیدم','از شاهد شنیدم']),field('count','تعداد افراد مشاهده‌شده',{numeric:true,inputmode:'numeric',max:5,min:1}),field('age','سن تقریبی',{placeholder:'مثلاً حدود ۳۰ تا ۴۰ سال'}),field('height','قد تقریبی',{placeholder:'مثلاً حدود ۱۷۵ سانتی‌متر'}),field('build','اندام تقریبی',{placeholder:'فقط آنچه مشاهده کرده‌اید'}),field('clothes','لباس و رنگ آن',{wide:true}),field('hair','رنگ و حالت مو یا ریش'),field('marks','نشانهٔ ظاهری دیگری که به یاد دارید',{placeholder:'مثلاً عینک یا کلاه'}),field('movement','جهت حرکت یا مسیر رفتن فرد',{wide:true}),field('notes','آنچه دربارهٔ رفتار این فرد می‌دانید',{wide:true})]},
 vehicle:{title:'وسیلهٔ نقلیهٔ مرتبط با رخداد',singular:'وسیلهٔ نقلیه',repeat:true,fields:[field('label','عنوان وسیله در این گزارش',{placeholder:'مثلاً خودروی اول یا گروه خودروهای پارک‌شده'}),field('observation','مشخصهٔ وسیله',{wide:true}),field('count','تعداد تقریبی وسایل، در صورت اطلاع'),select('kind','نوع وسیله',['خودرو','ون','موتورسیکلت','وانت','کامیون','اتوبوس','دوچرخه','سایر']),field('model','نام وسیله'),field('color','رنگ'),select('plateStatus','وضعیت مشاهدهٔ پلاک',['کامل دیدم','بخشی را دیدم','پلاک را ندیدم','فاقد پلاک بود'],{show:r=>r.kind!=='دوچرخه'}),field('marks','نشانهٔ متمایز وسیله',{placeholder:'مثلاً آسیب بدنه یا برچسب'}),field('direction','جهت حرکت در زمان رخداد'),field('observedAt','زمانی که این وسیله را دیدید'),field('relation','آنچه از ارتباط این وسیله با اتفاق می‌دانید',{wide:true,placeholder:'مثلاً با این خودرو محل را ترک کرد'})]},
 object:{title:'اشیاء و اموال مرتبط',singular:'شیء',repeat:true,fields:[field('label','نام وسیله یا مال',{placeholder:'مثلاً کیف اول یا مدرک مشاهده‌شده'}),select('kind','نوع شیء',['مال شخصی','مدرک یا سند','کالای معامله','وسیلهٔ دیجیتال','حساب یا دادهٔ دیجیتال','تجهیزات یا تأسیسات','سایر']),select('role','ارتباط شیء با رخداد',['مال سرقت‌شده','مال آسیب‌دیده','موضوع معامله','مدرک مرتبط','وسیلهٔ استفاده‌شده در رخداد','نامعلوم','سایر']),field('brand','برند و مدل'),field('color','رنگ و ظاهر'),field('quantity','تعداد',{numeric:true,inputmode:'numeric',max:6,min:1}),field('serial','شماره سریال یا شناسهٔ وسیله',{max:80,placeholder:'فقط در صورت اطلاع؛ بدون رمز یا شناسهٔ خصوصی افراد'}),field('condition','وضعیت و آسیب قابل مشاهده',{wide:true}),field('marks','نشانهٔ متمایز یا بسته‌بندی'),field('lastSeen','آخرین زمان و محل مشاهده',{wide:true}),select('basis','نحوهٔ اطلاع از شیء',['خودم مشاهده کردم','در مستند رخداد دیدم','از فرد درگیر شنیدم','از شاهد شنیدم']),field('notes','توضیح مرتبط دیگر',{wide:true})]},
 contact:{title:'راه ارتباطیِ استفاده‌شده در رخداد',singular:'راه ارتباطی',repeat:true,fields:[
 select('kind','نوع راه ارتباطی',['شبکهٔ اجتماعی یا پیام‌رسان','تلفن','ایمیل','وب‌سایت']),
 select('platform','نام شبکهٔ اجتماعی یا پیام‌رسان',[...SOCIAL_PLATFORMS.map(p=>({value:p.name,label:p.name+' — '+p.prefix})),'سایر'],{show:r=>r.kind==='شبکهٔ اجتماعی یا پیام‌رسان'}),
 field('otherPlatform','نام شبکهٔ اجتماعی یا پیام‌رسان دیگر',{show:r=>r.platform==='سایر'&&r.kind==='شبکهٔ اجتماعی یا پیام‌رسان'}),
 field('socialValue','شناسه یا پیوند فضای مجازی',{show:r=>r.kind==='شبکهٔ اجتماعی یا پیام‌رسان',ltr:true,max:500,widget:'social',wide:true,placeholder:'شناسه، مسیر صفحه یا پیوند کامل'}),
 field('url','نشانی وب‌سایت',{show:r=>r.kind==='وب‌سایت',ltr:true,validate:'url',max:500,placeholder:'https://…'}),
 select('phoneType','نوع شمارهٔ تلفن',PHONE_TYPES,{show:r=>r.kind==='تلفن'}),
 field('phone','شماره از پیش‌نویس قبلی؛ نوع آن را انتخاب کنید',{show:r=>r.kind==='تلفن'&&!r.phoneType&&Boolean(r.phone),ltr:true,max:30}),
 select('phoneCompleteness','چقدر از شماره را می‌دانید؟',['شماره کامل','فقط بخشی از شماره'],{show:r=>r.kind==='تلفن'&&Boolean(r.phoneType)}),
 select('province','استان و پیش‌شماره',[...Object.entries(LANDLINE_CODES).map(([label,code])=>({value:label,label:label+' — '+code}))],{show:r=>r.kind==='تلفن'&&r.phoneType===PHONE_TYPES[0]}),
 field('subscriber','شمارهٔ ثابت بدون پیش‌شماره',{show:r=>r.kind==='تلفن'&&r.phoneType===PHONE_TYPES[0],ltr:true,widget:'landline',numeric:true,inputmode:'numeric',max:8,placeholder:'۸ رقم مشترک'}),
 field('extension','داخلی، در صورت اطلاع',{show:r=>r.kind==='تلفن'&&r.phoneType===PHONE_TYPES[0],ltr:true,numeric:true,inputmode:'numeric',max:6}),
 field('mobile','شمارهٔ همراه',{show:r=>r.kind==='تلفن'&&r.phoneType===PHONE_TYPES[1],ltr:true,numeric:true,inputmode:'numeric',max:11,placeholder:'09xxxxxxxxx'}),
 field('international','شماره با کد کشور، بدون +',{show:r=>r.kind==='تلفن'&&r.phoneType===PHONE_TYPES[2],ltr:true,numeric:true,inputmode:'numeric',max:15,placeholder:'کد کشور و شماره'}),
 field('phoneNotes','کدام بخش از شماره را دیده‌اید؟',{show:r=>r.kind==='تلفن'&&r.phoneCompleteness==='فقط بخشی از شماره',wide:true,placeholder:'مثلاً چهار رقم آخر؛ ترتیب ارقام را حدس نزنید'}),
 field('email','نشانی ایمیل مرتبط',{show:r=>r.kind==='ایمیل',ltr:true,validate:'email',max:254}),
 field('displayName','نامی که در این تماس یا حساب نمایش داده می‌شد'),field('context','این حساب یا شماره چگونه در اتفاق استفاده شد؟',{wide:true,placeholder:'مثلاً حسابی که آگهی فروش را منتشر کرده بود'}),field('contactTime','زمان آخرین ارتباط مرتبط با رخداد')]
 }
};
const eventFields={
 ...Object.fromEntries(Object.entries(NUMBERED_TOPICS).map(([id,e])=>[id,e.fields])),
 ...Object.fromEntries(Object.entries(EXTENDED_EVENTS).map(([id,e])=>[id,e.fields])),
 trafficking:[field('promise','وعده یا شرایط اولیه، در صورت اطلاع',{wide:true}),field('coercion','رفتار مشخصِ اجبار یا فریب',{wide:true}),field('restriction','محدودیت رفت‌وآمد یا دسترسی به مدارک',{wide:true}),field('exploitation','نوع بهره‌کشی گزارش‌شده، در صورت اطلاع',{wide:true}),field('sequence','ترتیب جابه‌جایی‌ها و اتفاق‌ها',{wide:true}),field('lastContact','آخرین مشاهده یا ارتباط با فرد آسیب‌دیده',{wide:true}),select('basis','مبنای این اطلاعات',['مشاهدهٔ مستقیم','گفتهٔ فرد آسیب‌دیده','گفتهٔ شاهد','مستند مرتبط','ترکیبی؛ در شرح مشخص شده'])],
 confinement:[field('lastSeen','زمان و محل آخرین مشاهده',{wide:true}),field('restriction','آنچه دربارهٔ محدودیت آزادی می‌دانید',{wide:true}),field('sequence','ترتیب انتقال یا نگهداری، در صورت اطلاع',{wide:true})],
 forgery:[field('document','نوع مدرک'),field('sign','نشانهٔ مشاهده‌شده یا علت تردید',{wide:true}),field('use','نحوهٔ استفاده از مدرک در همین رخداد',{wide:true}),select('basis','مبنای تردید',['خودم مدرک را دیدم','از شاهد شنیدم','فقط احتمال می‌دهم'])],
 assault:[field('tool','وسیله یا سلاح مشاهده‌شده، بدون حدس'),field('peopleCount','تعداد تقریبی افراد، در صورت اطلاع'),field('frequency','دفعات یا الگوی تکرار'),field('behavior','رفتار مشاهده‌شده',{wide:true}),field('injury','آسیب قابل مشاهده، بدون حدس پزشکی',{wide:true}),field('sequence','ترتیب اتفاق‌ها',{wide:true})],
 theft:[field('item','نوع مال سرقت‌شده'),field('brand','برند، مدل یا مشخصات مال'),field('serial','شمارهٔ سریال مال، در صورت اطلاع'),field('value','ارزش تقریبی و واحد پول'),field('lastSeen','آخرین زمان و مکان مشاهدهٔ مال',{wide:true}),field('entry','آثار ورود یا آسیب مشاهده‌شده',{wide:true})],
 fraud:[field('method','روش معامله یا وعدهٔ داده‌شده',{wide:true}),field('amount','مبلغ و واحد پول'),select('payment','روش پرداخت',['کارت‌به‌کارت','انتقال بانکی','درگاه پرداخت','نقدی','سایر']),field('date','تاریخ پرداخت'),field('reference','شمارهٔ پیگیری تراکنش',{placeholder:'بدون رمز یا شمارهٔ کامل کارت'}),field('result','آنچه پس از پرداخت رخ داد',{wide:true})],
 damage:[field('object','مال آسیب‌دیده'),field('extent','نوع و میزان آسیب قابل مشاهده',{wide:true}),field('cause','علت، فقط اگر مشاهده کرده‌اید',{wide:true}),field('value','برآورد خسارت و واحد پول')],
 accident:[field('type','نوع حادثه'),field('damage','خسارت قابل مشاهده',{wide:true}),field('injury','آسیب جسمی مشاهده‌شده، در صورت اطلاع',{wide:true}),field('conditions','وضعیت محیط در زمان حادثه',{wide:true})],
 fire:[field('part','بخش دچار آتش‌سوزی'),field('damage','خسارت مشاهده‌شده',{wide:true}),field('condition','وضعیت محل هنگام مشاهده',{wide:true})],
 harassment:[field('channel','روش وقوع مزاحمت یا تهدید'),field('words','رفتار یا عبارت دقیق، در صورت یادآوری',{wide:true}),field('frequency','تعداد دفعات و بازهٔ زمانی'),field('evidence','نوع مستند موجود؛ اصل آن را در مرحلهٔ مستندات اضافه کنید',{wide:true})],
 service:[field('type','نوع خدمت یا تأسیسات'),field('duration','مدت ادامهٔ مشکل'),field('impact','اثر قابل مشاهدهٔ مشکل',{wide:true}),field('prior','پیگیری قبلی، در صورت انجام',{wide:true})],
 data_breach:[field('affected','حساب، سامانه یا وسیلهٔ درگیر؛ بدون رمز و اطلاعات محرمانه',{wide:true}),field('observed','نشانهٔ مشخص دسترسی یا افشای بدون اجازه',{wide:true}),field('discovered','زمان و روش آگاه‌شدن از این موضوع',{wide:true}),field('impact','اثر قابل مشاهده',{wide:true})],
 other:[field('sequence','ترتیب اتفاق‌ها',{wide:true}),field('impact','آسیب یا نتیجهٔ قابل مشاهده',{wide:true})]
};
export function detailSchema(id,event,context={}){
 const type=id.startsWith('details_')?id.slice(8):event;
 if(id==='details'||id.startsWith('details_'))return presentSchema({title:`جزئیات ${EVENTS[type]?.title||'رخداد'}`,toggle:'جزئیات بیشتری از این بخش می‌دانم',fields:[...(TOPIC_VARIANTS[type]?[select('subtype','نوع رخداد طبق اطلاعات شما',[...TOPIC_VARIANTS[type],'نامشخص','سایر'])]:[]),...(eventFields[type]||eventFields.other)]});
 const schema=DETAILS[id];if(!schema)return null;
 if(!schema.repeat)return presentSchema(schema);
 const analysis=context.analysis||{event};
 const fields=[...schema.fields];
 const topics=eventIds(analysis);
 if(topics.length>1)fields.unshift(select('eventRef','این مورد به کدام بخش مربوط است؟',[{value:'all',label:'چند بخش از همین گزارش'},...topics.map(id=>({value:id,label:EVENTS[id].title}))]));
 const link=(target,label)=>{if(!relevantExtraIds(analysis).includes(target))return;const data=context.extra?.[target];if(!data?.enabled)return;const options=(data.rows||[]).filter(r=>r._id).map((r,i)=>({value:r._id,label:r.label||`${DETAILS[target].singular} ${i+1}`}));if(options.length)fields.push(select(`${target}Ref`,label,options,{ref:target}))};
 if(id==='person')link('place','مکان مرتبط با این فرد');
 if(id==='vehicle'||id==='object'){link('person','فرد مرتبط با این وسیله');link('place','محل مشاهدهٔ این وسیله')}
 if(id==='contact'){link('person','فرد مرتبط با این راه ارتباطی');link('place','مکان مرتبط با این راه ارتباطی')}
 return presentSchema({...schema,fields});
}
export function visibleFields(schema,row){return schema.fields.filter(f=>!f.show||f.show(row))}
export function relevantExtraIds(analysis){
 const events=eventIds(analysis);
 return orderedSections(analysis||{},events.map(detailId),(analysis?.questions||[]).filter(q=>events.includes(q.event)).map(q=>q.id));
}
export function extraSections(extra={},event,allowed,analysis){
 return Object.entries(extra).flatMap(([id,data])=>{
 if(!data?.enabled||(allowed&&!allowed.includes(id)))return [];
 const schema=detailSchema(id,event,{extra,analysis});if(!schema)return [];
 const rows=(data.rows||[]).map(row=>{const fields=visibleFields(schema,row).filter(f=>String(row[f.id]||'').trim()).flatMap(f=>{const option=f.type==='select'?f.options.find(o=>(typeof o==='string'?o:o.value)===row[f.id]):null;if(f.type==='select'&&!option)return [];return [{id:f.id,label:f.label,value:option&&typeof option==='object'?option.label:String(row[f.id]).trim()}]});const plate=id==='vehicle'?serializePlate(row):null;if(id==='contact')fields.push(...contactDerived(row));if(plate)fields.push({id:'plate',label:`پلاک — ${plate.label}`,value:plate.text,plate});return fields}).filter(row=>row.length);
 return rows.length?[{id,title:schema.title,singular:schema.singular,rows}]:[]});
}
export function entityGraph(extra={},analysis){
 const allowed=relevantExtraIds(analysis),entities=[],links=[];
 for(const kind of ['place','person','object','vehicle','contact']){const data=extra[kind];if(!data?.enabled||!allowed.includes(kind))continue;const schema=detailSchema(kind,analysis?.event,{extra,analysis});for(const row of data.rows||[]){if(!row._id)continue;const fields=Object.fromEntries(visibleFields(schema,row).filter(f=>!f.ref&&row[f.id]&&(f.type!=='select'||f.options.some(o=>(typeof o==='string'?o:o.value)===row[f.id]))).map(f=>[f.id,row[f.id]]));const plate=kind==='vehicle'?serializePlate(row):null;if(plate)fields.plate=plate;if(kind==='contact')for(const field of contactDerived(row))fields[field.id]=field.value;if(!Object.keys(fields).length)continue;entities.push({id:row._id,kind,...(row._topicSuggestions?.length?{topicSuggestions:row._topicSuggestions.filter(p=>eventIds(analysis).includes(p.event)&&row[p.field]===p.value).map(({event,evidence})=>({event,evidence}))}:{}),category:kind==='vehicle'?'object':kind==='contact'?'person':kind,fields});for(const f of schema.fields.filter(f=>f.ref&&row[f.id]))links.push({from:row._id,to:row[f.id],relation:f.id})}}
 const ids=new Set(entities.map(e=>e.id));return {events:eventIds(analysis),entities,links:links.filter(l=>ids.has(l.to))};
}
export function removeEntityRow(extra,group,index){const id=extra[group]?.rows?.[index]?._id;extra[group]?.rows?.splice(index,1);if(id)for(const data of Object.values(extra))for(const row of data.rows||[])for(const key of ['placeRef','personRef'])if(row[key]===id)delete row[key]}
export function extraErrors(id,data,event){
 if(!data?.enabled)return [];const schema=detailSchema(id,event);if(!schema)return [];
 const result=[];
 for(const row of data.rows||[]){
  for(const f of visibleFields(schema,row)){
   const value=String(row[f.id]||'').trim();if(!value)continue;
   if(f.numeric)result.push(...numericErrors(f,value));
   else if(value.length>(f.max||300))result.push(`«${f.label}» بیش از حد طولانی است.`);
   if(f.validate==='url'){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw Error()}catch{result.push('پیوند را با https:// یا http:// وارد کنید.')}}
   if(f.validate==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))result.push('نشانی ایمیل را بررسی کنید.');
  }
  if(id==='vehicle')result.push(...plateErrors(row));
  if(id==='contact')result.push(...contactErrors(row));
 }
 return [...new Set(result)];
}
