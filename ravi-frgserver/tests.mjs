import test from 'node:test';import assert from 'node:assert/strict';import {localAnalysis,questionsFor,validateFiles} from './public/domain.js';import worker,{transcriptionForm} from './worker.js';
import {extraSections,extraErrors} from './public/details.js';
test('preserves known facts and selects relevant detail sections',()=>{const a=localAnalysis('دیروز متوجه شدم کیفم به سرقت رفته است');assert.equal(a.event,'theft');assert.equal(a.known.time,'دیروز');assert.equal(a.known.place,'');assert.deepEqual(questionsFor(a).map(q=>q.id),['time','details_theft','source','object','person','place'])});
test('enforces evidence count, size, type and duplicate limits',()=>{const f={name:'a.pdf',size:10,type:'application/pdf'};assert.equal(validateFiles([f],Array.from({length:10},(_,i)=>({...f,name:String(i)}))).accepted.length,0);assert.equal(validateFiles([{...f,size:101*1024*1024}]).accepted.length,0);assert.equal(validateFiles([{...f,type:'text/html'}]).accepted.length,0);assert.equal(validateFiles([f]).accepted.length,1);assert.equal(validateFiles([f],[f]).accepted.length,0)});
test('unconfigured API reports preview',async()=>{const r=await worker.fetch(new Request('https://example.com/api/config'));assert.equal((await r.json()).ai,false);assert.equal((await worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',body:'{}'}))).status,503)});
test('blocks cross-origin writes and malformed input',async()=>{const env={OPENAI_API_KEY:'test'};assert.equal((await worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',headers:{Origin:'https://other.com'},body:'{}'}),env)).status,403);assert.equal((await worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',body:'bad'}),env)).status,400)});

test('service reports require place and event, with personal and communication sections optional',()=>{const qs=questionsFor({event:'service',known:{}});assert.deepEqual(qs.filter(q=>q.required).map(q=>q.id),['place','time','details_service']);assert.ok(qs.filter(q=>['person','contact'].includes(q.id)).every(q=>q.required===false));assert.ok(questionsFor({event:'fraud',known:{}}).some(q=>q.id==='contact'))});
test('hidden and disabled fields never appear in saved detail summaries',()=>{const extra={vehicle:{enabled:true,rows:[{kind:'خودرو',plateStatus:'پلاک را ندیدم',plate:'stale'}]},person:{enabled:false,rows:[{clothes:'stale'}]}};const out=extraSections(extra,'theft',['vehicle','person']);assert.equal(out.length,1);assert.equal(out[0].rows[0].some(f=>f.id==='plate'),false);assert.equal(extraSections(extra,'service',['time','place','details_service','source']).length,0)});
test('validates Persian postcode and visible partial-plate requirements',()=>{assert.equal(extraErrors('place',{enabled:true,rows:[{postal:'۱۲۳'}]},'theft').length,1);assert.equal(extraErrors('place',{enabled:true,rows:[{postal:'۱۲۳۴۵۶۷۸۹۰'}]},'theft').length,0);assert.equal(extraErrors('vehicle',{enabled:true,rows:[{plateStatus:'بخشی را دیدم'}]},'theft').length,1);assert.equal(extraErrors('contact',{enabled:true,rows:[{kind:'تلفن',url:'javascript:stale',phone:'test'}]},'fraud').length,1)});
test('transcription uses correct language field for each model',()=>{const f=new File(['fictional audio'],'test.wav',{type:'audio/wav'});const modern=transcriptionForm(f,'gpt-transcribe');assert.equal(modern.get('languages[]'),'fa');assert.equal(modern.has('language'),false);const fallback=transcriptionForm(f,'gpt-4o-transcribe');assert.equal(fallback.get('language'),'fa');assert.equal(fallback.has('languages[]'),false)});
test('upstream secrets are never reflected in API errors',async(t)=>{t.mock.method(globalThis,'fetch',async()=>Response.json({error:{code:'invalid_api_key',message:'do not expose upstream credential'}},{status:401}));const r=await worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',body:JSON.stringify({text:'این یک گزارش آزمایشی از سرقت است'})}),{OPENAI_API_KEY:'unit-test'});const data=await r.json();assert.equal(r.status,502);assert.equal(JSON.stringify(data).includes('credential'),false);assert.match(data.error,/کلید/)});
test('transcription falls back only for missing model',async(t)=>{let models=[];t.mock.method(globalThis,'fetch',async(_url,opts)=>{models.push(opts.body.get('model'));return models.length===1?Response.json({error:{code:'model_not_found'}},{status:404}):Response.json({text:'متن آزمایشی'})});const form=new FormData();form.append('file',new File(['test audio'],'test.wav',{type:'audio/wav'}));const r=await worker.fetch(new Request('https://example.com/api/transcribe',{method:'POST',body:form}),{OPENAI_API_KEY:'unit-test'});assert.equal(r.status,200);assert.deepEqual(models,['gpt-transcribe','gpt-4o-transcribe']);assert.equal((await r.json()).model,'gpt-4o-transcribe')});

import {normalizeAnalysis,eventIds} from './public/scenarios.js';
import {entityGraph,removeEntityRow,relevantExtraIds,detailSchema} from './public/details.js';
test('mixed trafficking and forgery keep both topics and ask shared details once',()=>{
 const a=localAnalysis('دیروز درباره قاچاق انسان و مدرک جعلی با یک ون و پیام تلگرام مطلع شدم');
 assert.deepEqual(a.events,['trafficking','forgery']);
 const ids=questionsFor(a).map(q=>q.id);
 assert.deepEqual(ids,['person','contact','time','details_trafficking','details_forgery','source','object','vehicle','place']);
 assert.equal(new Set(ids).size,ids.length);
});
test('ordinary transport and negated labels do not imply trafficking',()=>{
 assert.deepEqual(eventIds(localAnalysis('امروز چند مسافر با ون به مقصد رسیدند')),['other']);
 assert.equal(eventIds(localAnalysis('قاچاق انسان نبود؛ فقط درباره سرقت گزارش می‌دهم')).includes('trafficking'),false);
 assert.equal(eventIds(localAnalysis('قاچاق انسان نبود؛ فقط درباره سرقت گزارش می‌دهم')).includes('theft'),true);
});
test('AI extraction must be grounded and custom question IDs remain stable',()=>{
 const text='از شاهد درباره قاچاق انسان و مدرک جعلی شنیدم';
 const raw={events:[{type:'trafficking',evidence:'قاچاق انسان'},{type:'forgery',evidence:'مدرک جعلی'},{type:'theft',evidence:'کیف سرقت شد'}],known:{time:'دیروز',place:'تهران',source:'از شاهد'},prompts:[{section:'place',title:'آیا محل استفاده از مدرک را می‌دانید؟',hint:'در صورت اطلاع',evidence:'مدرک جعلی'}],questions:[{event:'forgery',title:'چه کسی درباره مدرک به شما گفته است؟',evidence:'از شاهد',hint:'لازم نیست نام کامل بنویسید'},{event:'theft',title:'چه کسی کیف را سرقت کرد؟',evidence:'کیف سرقت شد'}]};
 const a=normalizeAnalysis(raw,text),b=normalizeAnalysis(raw,text);
 assert.deepEqual(a.events,['trafficking','forgery']);assert.equal(a.known.time,'');assert.equal(a.known.place,'');assert.equal(a.known.source,'از شاهد');
 assert.equal(a.questions.length,1);assert.equal(a.questions[0].id,b.questions[0].id);
 assert.equal(questionsFor(a).find(q=>q.id==='place').title,'این اتفاق کجا افتاد؟'); // Stable wording matches the address input.
 assert.ok(questionsFor(a).some(q=>q.id===a.questions[0].id));
 const edited={...a,events:['service']};assert.ok(!relevantExtraIds(edited).includes(a.questions[0].id));
});
test('entity links survive row movement and disappear when targets are removed',()=>{
 const analysis={events:['trafficking','forgery'],event:'trafficking'};
 const extra={place:{enabled:true,rows:[{_id:'p1',label:'مبدأ'},{_id:'p2',label:'محل دوم'}]},person:{enabled:true,rows:[{_id:'a',label:'فرد اول',role:'شاهد',placeRef:'p2'}]},vehicle:{enabled:true,rows:[{_id:'v',label:'ون',personRef:'a',placeRef:'p2'}]}};
 let graph=entityGraph(extra,analysis);assert.equal(graph.entities.length,4);assert.equal(graph.links.length,3);
 const summary=extraSections(extra,analysis.event,relevantExtraIds(analysis),analysis);
 assert.ok(summary.find(s=>s.id==='vehicle').rows[0].some(f=>f.id==='personRef'&&f.value==='فرد اول'));
 const reloaded=JSON.parse(JSON.stringify(extra));assert.deepEqual(entityGraph(reloaded,analysis),graph);
 removeEntityRow(extra,'place',1);graph=entityGraph(extra,analysis);assert.equal(graph.links.length,1);assert.equal(extra.person.rows[0].placeRef,undefined);
 extra.person.enabled=false;assert.equal(entityGraph(extra,analysis).links.length,0);
});
test('removed topics and hidden fields are omitted without deleting draft answers',()=>{
 const extra={details_trafficking:{enabled:true,rows:[{coercion:'گفتهٔ شاهد'}]},details_forgery:{enabled:true,rows:[{document:'مدرک نمونه'}]}};
 const a={events:['forgery'],event:'forgery'};
 const out=extraSections(extra,a.event,relevantExtraIds(a),a);assert.deepEqual(out.map(s=>s.id),['details_forgery']);assert.equal(extra.details_trafficking.rows[0].coercion,'گفتهٔ شاهد');
});
test('API returns validated multi-topic analysis using the new structured contract',async(t)=>{
 const output={events:[{type:'trafficking',evidence:'قاچاق انسان'},{type:'forgery',evidence:'مدرک جعلی'}],known:{time:'',place:'',source:''},followups:[],prompts:[],questions:[],refusal:''};
 t.mock.method(globalThis,'fetch',async(_url,opts)=>{const sent=JSON.parse(opts.body);assert.equal(sent.text.format.schema.properties.events.type,'array');assert.equal(sent.store,false);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]})});
 const response=await worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',body:JSON.stringify({text:'گزارش آزمایشی قاچاق انسان با مدرک جعلی'})}),{OPENAI_API_KEY:'unit-test'});
 assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.events,['trafficking','forgery']);assert.equal(result.mode,'ai');
});

import {answerIsUnknown,setAnswer,effectiveExtras,reconcileAnswers} from './public/answers.js';
import {PLATE_TEMPLATES,plateErrors,plateText,serializePlate} from './public/plates.js';
test('unknown answers consistently disable details in drafts, summaries and links',()=>{
 const state={answers:{place:'نشانی قدیمی'},extra:{place:{enabled:true,rows:[{_id:'p',label:'نشانی آزمایشی',postal:'۱۲۳'}]},person:{enabled:true,rows:[{_id:'a',label:'فرد آزمایشی',placeRef:'p'}]}},confirmed:true};
 setAnswer(state,'place','مکان را نمی‌دانم');assert.equal(state.confirmed,false);assert.equal(state.extra.place.enabled,false);assert.equal(state.extra.place.rows[0].label,'نشانی آزمایشی');
 // Legacy contradictory drafts are safe even before reconciliation is persisted.
 state.extra.place.enabled=true;const active=effectiveExtras(state.extra,state.answers);const a={event:'theft'};
 assert.equal(extraErrors('place',active.place,a.event).length,0);
 assert.equal(extraSections(active,a.event,relevantExtraIds(a),a).some(s=>s.id==='place'),false);
 assert.equal(entityGraph(active,a).links.length,0);
 const restored=reconcileAnswers(JSON.parse(JSON.stringify(state)));assert.equal(restored.extra.place.enabled,false);
 setAnswer(restored,'place','نشانی جدید');assert.equal(restored.extra.place.enabled,false);
});
test('unknown detection accepts Persian variants without hiding qualified observations',()=>{
 for(const text of ['نمی‌دانم','نمیدانم','خیر، اطلاعی ندارم','زمان دقیق را نمی‌دانم','اطلاعات بیشتری ندارم'])assert.equal(answerIsUnknown(text),true,text);
 assert.equal(answerIsUnknown('زمان دقیق را نمی‌دانم ولی حدود ظهر بود'),false);
 assert.equal(answerIsUnknown('از شاهد شنیدم'),false);
});
test('national plates use segmented values and preserve leading zeroes across digit scripts',()=>{
 const row={kind:'خودرو',plateStatus:'کامل دیدم',plateTemplate:'private',plateDrafts:{private:{left:'۰۱',letter:'ب',middle:'٠٢٣',region:'45'}}};
 assert.deepEqual(plateErrors(row),[]);assert.equal(plateText(row),'۰۱ ب ۰۲۳ ایران ۴۵');
 const restored=JSON.parse(JSON.stringify(row));assert.deepEqual(serializePlate(restored),serializePlate(row));
 row.plateDrafts.private.middle='2';assert.ok(plateErrors(row).length>0);
});
test('partial plates allow unknown positions, complete plates do not',()=>{
 const row={kind:'ون',plateStatus:'بخشی را دیدم',plateTemplate:'private',plateDrafts:{private:{left:'۱؟'}}};
 assert.deepEqual(plateErrors(row),[]);assert.equal(plateText(row),'۱؟ ؟ ؟؟؟ ایران ؟؟');
 row.plateStatus='کامل دیدم';assert.ok(plateErrors(row).length>0);
 row.plateStatus='پلاک را ندیدم';assert.equal(plateText(row),'');assert.equal(serializePlate(row),null);assert.deepEqual(plateErrors(row),[]);
});
test('template switching isolates saved parts and bicycle selection hides all plate data',()=>{
 const row={kind:'خودرو',plateStatus:'کامل دیدم',plateTemplate:'taxi',plateDrafts:{taxi:{left:'۱۲',middle:'۳۴۵',region:'۶۷'},private:{left:'۹۸',letter:'ب',middle:'۷۶۵',region:'۴۳'}}};
 assert.equal(plateText(row),'۱۲ ت ۳۴۵ ایران ۶۷');row.plateTemplate='private';assert.equal(plateText(row),'۹۸ ب ۷۶۵ ایران ۴۳');
 row.kind='دوچرخه';assert.equal(serializePlate(row),null);assert.deepEqual(plateErrors(row),[]);
 const a={event:'theft'};const sections=extraSections({vehicle:{enabled:true,rows:[row]}},a.event,relevantExtraIds(a),a);
 assert.ok(sections[0].rows[0].every(f=>!['plate','plateStatus'].includes(f.id)));
});
test('motorcycle and free-zone templates round-trip with their distinct structures',()=>{
 const motor={kind:'موتورسیکلت',plateStatus:'کامل دیدم',plateTemplate:'motorcycle',plateDrafts:{motorcycle:{top:'۱۲۳',bottom:'۴۵۶۷۸'}}};
 assert.deepEqual(plateErrors(motor),[]);assert.equal(plateText(motor),'بالا: ۱۲۳ / پایین: ۴۵۶۷۸');
 const fz={kind:'خودرو',plateStatus:'کامل دیدم',plateTemplate:'freezone',plateDrafts:{freezone:{number:'۰۱۲۳۴',region:'۲۲',zone:'منطقه آزمایشی'}}};
 assert.deepEqual(plateErrors(fz),[]);assert.match(plateText(fz),/۰۱۲۳۴/);assert.equal(new Set(PLATE_TEMPLATES.map(t=>t.id)).size,PLATE_TEMPLATES.length);
});
test('bare allegations get clarification and no identity or contact questionnaire',()=>{
 const a=localAnalysis('متوجه شدم یک نفر جاسوسی میکرده و در تلگرام است');assert.equal(a.needsClarification,true);assert.deepEqual(questionsFor(a).map(q=>q.id),['clarify']);
 const limited=normalizeAnalysis({...a,clarificationHandled:true,clarification:{needed:false},followups:['person','contact'],questions:[{event:'other',title:'شمارهٔ این فرد چیست؟',evidence:'یک نفر'}]},'متوجه شدم یک نفر جاسوسی میکرده و در تلگرام است');
 assert.deepEqual(questionsFor(limited).map(q=>q.id),['time','place','details_other','source']);
});
test('concrete unauthorized access routes to incident details without assuming a motive',()=>{
 const a=localAnalysis('دیروز متوجه دسترسی بدون اجازه به حسابم شدم');
 assert.deepEqual(a.events,['data_breach']);assert.equal(a.needsClarification,false);assert.ok(questionsFor(a).some(q=>q.id==='details_data_breach'));
});

test('the questionnaire validator accepts completed structured plates and rejects incomplete ones',()=>{
 const data={enabled:true,rows:[{kind:'خودرو',plateStatus:'کامل دیدم',plateTemplate:'private',plateDrafts:{private:{left:'۱۲',letter:'ب',middle:'۳۴۵',region:'۶۷'}}}]};
 assert.deepEqual(extraErrors('vehicle',data,'theft'),[]);
 data.rows[0].plateDrafts.private.middle='۳';assert.ok(extraErrors('vehicle',data,'theft').length>0);
 data.rows[0].plateStatus='پلاک را ندیدم';assert.deepEqual(extraErrors('vehicle',data,'theft'),[]);
});

import {CATEGORIES,BANK_VERSION,requiredCategories,sectionRequired,questionAnswered} from './public/question-bank.js';
import {numericInput,numericErrors} from './public/inputs.js';
import {normalizePlateInput} from './public/plates.js';
import {LANDLINE_CODES,PHONE_TYPES,landlineParts,setContactInput,contactErrors,contactDerived,migrateContact,socialAddress} from './public/contacts.js';
test('four-category bank supports mixed coverage and optional unknown field values',()=>{
 assert.deepEqual(Object.keys(CATEGORIES),['person','place','event','object']);
 const a=localAnalysis('یک فرد شاهد سرقت کیف در پارکینگ ساختمان بود');
 assert.deepEqual(new Set(requiredCategories(a)),new Set(['person','place','event','object']));
 const qs=questionsFor(a);assert.equal(qs.find(q=>q.id==='person').required,true);assert.equal(qs.find(q=>q.id==='object').required,true);
 assert.equal(qs.find(q=>q.id==='source').required,false);
 // Nothing in this account involves a vehicle or a phone/online account, so neither is asked.
 assert.equal(qs.some(q=>q.id==='vehicle'||q.id==='contact'),false);
 for(const q of qs.filter(q=>q.required)){assert.equal(questionAnswered(q,{}),false);assert.equal(questionAnswered(q,{[q.id]:'نمی‌دانم'}),true)}
 assert.deepEqual(extraErrors('person',{enabled:true,rows:[{}]},'theft'),[]);
 assert.equal(new Set(qs.map(q=>q.id)).size,qs.length);
});
test('grounded AI categories and explicit reporter corrections share the bank',()=>{
 const text='گزارش ساختگی: سرقت کیف در ساختمان';
 const a=normalizeAnalysis({events:[{type:'theft',evidence:'سرقت کیف'}],categories:[{type:'place',evidence:'در ساختمان'},{type:'person',evidence:'راننده'}]},text);
 assert.equal(a.bankVersion,BANK_VERSION);assert.ok(requiredCategories(a).includes('place'));assert.equal(requiredCategories(a).includes('person'),false);
 assert.equal(sectionRequired('place',{...a,categorySelection:['person']}),false);assert.equal(sectionRequired('person',{...a,categorySelection:['person']}),true);
});
test('structured details alone satisfy a main section and unknown overrides them everywhere',()=>{
 const q={id:'place',required:true},state={answers:{},extra:{place:{enabled:true,rows:[{_id:'p',postal:'0123456789'}]}}};
 assert.equal(questionAnswered(q,state.answers,effectiveExtras(state.extra,state.answers)),true);
 setAnswer(state,'place','نمی‌دانم');assert.equal(effectiveExtras(state.extra,state.answers).place.enabled,false);
 assert.deepEqual(extraSections(effectiveExtras(state.extra,state.answers),'theft',['place']),[]);
});
test('numeric entry normalizes all digit scripts, preserves zero and enforces length',()=>{
 assert.equal(numericInput('a۰١2-۳۴x۵',5),'01234');assert.equal(numericInput('۰۰۱',3),'001');
 assert.ok(numericErrors({label:'تعداد',numeric:true,max:5,min:1},'ab').length);
 assert.ok(extraErrors('object',{enabled:true,rows:[{quantity:'۱۲x'}]},'theft').length);
 const row={plateTemplate:'private',plateStatus:'کامل دیدم'};
 assert.equal(normalizePlateInput(row,'left','a۰1x۲'),'۰۱');assert.equal(normalizePlateInput(row,'middle','۱?۲'),'۱۲');
 row.plateStatus='بخشی را دیدم';assert.equal(normalizePlateInput(row,'middle','۱?x٢۳'),'۱؟۲');
});
test('landline paste infers its own province without truncating the prefix into the number',()=>{
 assert.equal(Object.keys(LANDLINE_CODES).length,31);
 assert.deepEqual(landlineParts('+۹۸ (۲۱) ۱۲۳۴-۵۶۷۸'),{province:'تهران',subscriber:'12345678'});
 const row={kind:'تلفن',phoneType:PHONE_TYPES[0],province:'تهران',subscriber:'12345678'};
 assert.equal(setContactInput(row,'subscriber','031 87654321',{paste:true}).rerender,true);
 assert.equal(row.province,'اصفهان');assert.equal(row.subscriber,'87654321');assert.deepEqual(contactErrors(row),[]);
 const before=JSON.stringify(row);assert.ok(setContactInput(row,'subscriber','09912345678',{paste:true}).error);assert.equal(JSON.stringify(row),before);
 row.subscriber='۱۲۳';assert.ok(contactErrors(row).length);row.phoneCompleteness='فقط بخشی از شماره';assert.deepEqual(contactErrors(row),[]);
 assert.match(contactDerived(row)[0].label,/ناقص/);
 row.kind='ایمیل';assert.deepEqual(contactDerived(row),[]);assert.deepEqual(contactErrors(row),[]);
});
test('mobile and international formats distinguish complete and partial numbers',()=>{
 const row={kind:'تلفن',phoneType:PHONE_TYPES[1]};setContactInput(row,'mobile','+۹۸ ۹۱۲ ۰۰۰ ۰۰۰۰');assert.equal(row.mobile,'09120000000');assert.deepEqual(contactErrors(row),[]);
 row.mobile='0912';assert.ok(contactErrors(row).length);row.phoneCompleteness='فقط بخشی از شماره';assert.deepEqual(contactErrors(row),[]);
 row.phoneType=PHONE_TYPES[2];row.phoneCompleteness='شماره کامل';setContactInput(row,'international','+44 20 0000 0000');assert.equal(row.international,'442000000000');assert.deepEqual(contactErrors(row),[]);
});
test('social templates accept handles or matched URLs, preserve shortlinks, reject mismatched hosts',()=>{
 assert.equal(socialAddress('تلگرام','@test_account').url,'https://t.me/test_account');
 assert.equal(socialAddress('تلگرام','https://t.me/test_account').value,'test_account');
 assert.equal(socialAddress('یوتیوب','https://youtu.be/example').url,'https://youtu.be/example');
 assert.equal(socialAddress('تیک‌تاک','@example').url,'https://tiktok.com/@example');
 for(const value of ['javascript:alert(1)','https://instagram.com/example','https://t.me.evil.example/xx'])assert.ok(socialAddress('تلگرام',value).error);
 assert.ok(socialAddress('تلگرام','https://t.me').error);assert.ok(socialAddress('تلگرام','bad user').error);
 assert.equal(socialAddress('سایر','https://example.com/profile').url,'https://example.com/profile');
});
test('legacy phone and social drafts migrate without fabricating unknown values',()=>{
 const phone=migrateContact({kind:'تلفن',phone:'۰۲۱۱۲۳۴۵۶۷۸'});assert.equal(phone.province,'تهران');assert.equal(phone.subscriber,'12345678');
 const unknown=migrateContact({kind:'تلفن',phone:'بخشی نامعلوم'});assert.equal(unknown.phone,'بخشی نامعلوم');assert.equal(unknown.phoneType,undefined);
 const social=migrateContact({kind:'شبکهٔ اجتماعی یا پیام‌رسان',platform:'تلگرام',handle:'@fictional'});assert.equal(contactDerived(social)[0].value,'https://t.me/fictional');
});
test('object and specialized contacts round-trip to summaries and graph while hidden fields stay excluded',()=>{
 const a=localAnalysis('گزارش آزمایشی سرقت کیف');const extra={object:{enabled:true,rows:[{_id:'o',label:'کیف آزمایشی',quantity:'1'}]},contact:{enabled:true,rows:[{_id:'c',kind:'تلفن',phoneType:PHONE_TYPES[0],province:'تهران',subscriber:'12345678',socialValue:'hidden',platform:'تلگرام'}]}};
 const out=extraSections(extra,a.event,relevantExtraIds(a),a),graph=entityGraph(extra,a);
 assert.equal(out.find(s=>s.id==='contact').rows[0].find(f=>f.id==='formattedPhone').value,'021 12345678');
 assert.ok(!JSON.stringify(out).includes('hidden'));assert.equal(graph.entities.find(e=>e.kind==='object').category,'object');assert.equal(graph.entities.find(e=>e.kind==='contact').fields.formattedPhone,'021 12345678');
 assert.deepEqual(entityGraph(JSON.parse(JSON.stringify(extra)),a),graph);
});
test('API instructions and output schema contain the same four-category contract',async(t)=>{
 t.mock.method(globalThis,'fetch',async(_url,opts)=>{const sent=JSON.parse(opts.body);assert.deepEqual(sent.text.format.schema.properties.categories.items.properties.type.enum,Object.keys(CATEGORIES));assert.ok(sent.instructions.includes(BANK_VERSION));return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({events:[{type:'theft',evidence:'سرقت کیف'}],categories:[{type:'object',evidence:'کیف'}],known:{},followups:[],prompts:[],questions:[],clarification:{needed:false},refusal:''})}]}]})});
 const res=await worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',body:JSON.stringify({text:'شرح ساختگی سرقت کیف برای آزمون'})}),{OPENAI_API_KEY:'unit-test'});assert.equal(res.status,200);assert.ok(requiredCategories(await res.json()).includes('object'));
});
test('social handles containing dots stay handles and do not become foreign domains',()=>{
 assert.equal(socialAddress('اینستاگرام','@fictional.user').url,'https://instagram.com/fictional.user');
 assert.equal(socialAddress('اینستاگرام','fictional.user').value,'fictional.user');
});
test('explicit observed thief wording activates person and object main sections in preview',()=>{
 const a=localAnalysis('گزارش ساختگی: سارق کیف را برد');
 assert.ok(requiredCategories(a).includes('person'));assert.ok(requiredCategories(a).includes('object'));assert.ok(a.events.includes('theft'));
});

import {prepareAnalysis,applyPrefills,activePrefills,rejectPrefill,confirmPrefills,groundPrefills} from './public/extraction.js';
const complexNarrative='داخل یک رستوران سنتی در گلاب دره دیدم که مشروب سرو میشه ماشین های مدل بالا جلوی در رستوران پارک بودن و بعد از خروج افراد نزاع با سلاح سرد رخ میداد هرچی هم به مامورین کلانتری 124 اعلام میکنیم رسیدگی نمیکنن';
let rowSequence=0;
const makeTestRow=()=>({_id:'fictional-'+(++rowSequence)});
function prefilledState(text=complexNarrative){const state={text,answers:{},extra:{},analysis:prepareAnalysis(localAnalysis(text),text)};applyPrefills(state,makeTestRow);return state}
test('restaurant narrative retains all three topics and grounded facts without invented vehicle links',()=>{
 const s=prefilledState();assert.deepEqual(new Set(s.analysis.events),new Set(['assault','official_complaint','business_observation']));
 assert.equal(s.extra.place.rows[0].district,'گلاب دره');assert.equal(s.extra.place.rows[0].building,'رستوران سنتی');
 assert.equal(s.extra.details_assault.rows[0].tool,'سلاح سرد');assert.equal(s.extra.details_official_complaint.rows[0].agency,'کلانتری 124');
 assert.equal(s.extra.vehicle.rows[0].observation,undefined);assert.equal(s.extra.vehicle.rows[0].model,undefined);assert.equal(s.extra.vehicle.rows[0].personRef,undefined);
 assert.equal(entityGraph(s.extra,s.analysis).links.length,0);assert.equal(s.analysis.episodes.length,3);
 for(const p of s.prefillAudit)assert.ok(complexNarrative.includes(p.evidence));
 assert.equal(questionsFor(s.analysis).filter(q=>q.id==='place').length,1);
 for(const f of ['injury','peopleCount','frequency'])assert.equal(s.extra.details_assault.rows[0][f],undefined);
 for(const f of ['reportTime','channel','reference','response'])assert.equal(s.extra.details_official_complaint.rows[0][f],undefined);
});
test('extraction rejects invented values, unsupported fields, invalid numbers and private links',()=>{
 const text='دیروز نزاع دیدم؛ سلاح سرد بود و کدپستی ۱۲۳ را شنیدم';const a=localAnalysis(text);
 const raw=[
 {section:'details_assault',field:'tool',value:'قمه',evidence:'سلاح سرد'},
 {section:'person',field:'nationality',value:'دیروز',evidence:'دیروز'},
 {section:'vehicle',field:'personRef',value:'دیروز',evidence:'دیروز'},
 {section:'place',field:'postal',value:'۱۲۳',evidence:'کدپستی ۱۲۳'},
 {section:'details_assault',field:'answer',value:'سلاح سرد',evidence:'سلاح سرد بود و کدپستی ۱۲۳ را شنیدم'},
 {section:'details_assault',field:'tool',value:'سلاح سرد',evidence:'سلاح سرد بود'}];
 const p=groundPrefills(raw,text,a);assert.equal(p.length,1);assert.equal(p[0].field,'tool');
});
test('unknown answers suppress automatic values, summaries and validation until reporter re-enables them',()=>{
 const s=prefilledState();setAnswer(s,'place','مکان را نمی‌دانم');assert.equal(activePrefills(s,'place').length,0);
 assert.equal(extraSections(effectiveExtras(s.extra,s.answers),s.analysis.event,relevantExtraIds(s.analysis),s.analysis).some(x=>x.id==='place'),false);
 const restored=JSON.parse(JSON.stringify(s));applyPrefills(restored,makeTestRow);assert.equal(restored.answers.place,'مکان را نمی‌دانم');assert.equal(restored.extra.place.enabled,false);
});
test('rejected and edited prefills stay rejected or edited after draft restore and repeat analysis',()=>{
 const s=prefilledState();const i=s.prefillAudit.findIndex(p=>p.section==='place'&&p.field==='answer');rejectPrefill(s,i);
 s.extra.place.rows[0].district='محلهٔ اصلاح‌شده';
 const restored=JSON.parse(JSON.stringify(s));applyPrefills(restored,makeTestRow);
 assert.equal(restored.answers.place,undefined);assert.equal(restored.extra.place.rows[0].district,'محلهٔ اصلاح‌شده');
 assert.equal(activePrefills(restored,'place').some(p=>p.field==='answer'||p.field==='district'),false);
});
test('a changed narrative clears stale automatic facts but preserves manual corrections',()=>{
 const s=prefilledState();s.extra.place.rows[0].district='محلهٔ اصلاح‌شده';s.answers.details_assault='شرح اصلاح‌شدهٔ من';
 s.text='امروز سرقت کیف را در مغازه دیدم';s.analysis=prepareAnalysis(localAnalysis(s.text),s.text);applyPrefills(s,makeTestRow);
 assert.equal(s.extra.place.rows[0].district,'محلهٔ اصلاح‌شده');assert.equal(s.answers.details_assault,'شرح اصلاح‌شدهٔ من');
 assert.equal(s.extra.details_assault.rows.length,0);assert.equal(s.extra.vehicle.rows.length,0);assert.equal(s.answers.details_official_complaint,undefined);
 assert.equal(activePrefills(s).some(p=>p.value.includes('124')),false);
});
test('automatic fields never join a reporter-authored entity and always keep distinct extracted rows',()=>{
 const text='نزاع رخ داد؛ خودروی سفید و خودروی مشکی را دیدم';let a=prepareAnalysis({...localAnalysis(text),prefills:[{section:'vehicle',rowKey:'one',field:'color',value:'سفید',evidence:'خودروی سفید'},{section:'vehicle',rowKey:'two',field:'color',value:'مشکی',evidence:'خودروی مشکی'}]},text);
 const s={text,analysis:a,answers:{},extra:{}};applyPrefills(s,makeTestRow);assert.equal(s.extra.vehicle.rows.length,2);assert.notEqual(s.extra.vehicle.rows[0]._id,s.extra.vehicle.rows[1]._id);assert.equal(entityGraph(s.extra,a).links.length,0);
 const manual={text,analysis:a,answers:{},extra:{vehicle:{enabled:true,rows:[{_id:'user-row',model:'مدل واردشده'}]}}};applyPrefills(manual,makeTestRow);assert.equal(manual.extra.vehicle.rows.length,1);assert.equal(manual.extra.vehicle.rows[0].color,undefined);
});
test('repeat occurrences of the same event preserve separate evidence episodes',()=>{
 const text='دیروز نزاع در محل اول دیدم. امروز نزاع دیگری در محل دوم دیدم.';
 const a=prepareAnalysis({events:[{type:'assault',evidence:'نزاع'}],episodes:[{event:'assault',evidence:'دیروز نزاع در محل اول دیدم.'},{event:'assault',evidence:'امروز نزاع دیگری در محل دوم دیدم.'},{event:'theft',evidence:'نزاع'}]},text);
 assert.equal(a.episodes.length,2);assert.deepEqual(a.events,['assault']);
});
test('hypothetical and negated incidents do not create positive local classifications',()=>{
 for(const text of ['اگر نزاع با سلاح سرد اتفاق افتاد چه کنیم؟','در این رستوران مشروب سرو نمی‌شد.','نزاع رخ نداد؛ فقط درباره کمبود دارو می‌نویسم'])assert.equal(localAnalysis(text).events.includes(text.includes('مشروب')?'business_observation':'assault'),false,text);
});
test('bare spying and peaceful expression do not produce identity extraction',()=>{
 for(const text of ['گفتند این فرد جاسوسی می‌کرده است','چند نفر به صورت مسالمت‌آمیز اعتراض کردند']){
 const a=prepareAnalysis({...localAnalysis(text),prefills:[{section:'person',field:'label',value:'فرد',evidence:'این فرد'}]},text);assert.equal(a.needsClarification,true);assert.equal(a.prefills.length,0);assert.equal(questionsFor(a).some(q=>q.id==='person'||q.id==='contact'),false);
 }
});
test('expanded bank includes structured complaint and violence questions and all incident subtypes',()=>{
 assert.ok(detailSchema('details_official_complaint','official_complaint').fields.some(f=>f.id==='reference'));
 assert.ok(detailSchema('details_assault','assault').fields.some(f=>f.id==='tool'));
 assert.ok(detailSchema('details_fraud','fraud').fields.find(f=>f.id==='subtype').options.includes('معامله یا اجارهٔ ملک'));
});
test('model request uses grounded extraction schema, a reasoning budget and never returns partial JSON',async(t)=>{
 let requestBody;
 t.mock.method(globalThis,'fetch',async(_url,opts)=>{requestBody=JSON.parse(opts.body);return Response.json({status:'incomplete',output:[{content:[{type:'output_text',text:'{}'}]}]})});
 const r=await worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',body:JSON.stringify({text:complexNarrative})}),{OPENAI_API_KEY:'unit-test'});
 assert.equal(r.status,502);assert.match((await r.json()).error,/کامل نشد/);
 assert.equal(requestBody.model,'gpt-6-astra');assert.equal(requestBody.reasoning.effort,'low');assert.equal(requestBody.text.format.schema.properties.prefills.type,'array');assert.equal(requestBody.text.format.schema.properties.episodes.type,'array');assert.equal(requestBody.store,false);
});
test('confirmation applies only to active current-section prefills',()=>{const s=prefilledState();confirmPrefills(s,'place');assert.ok(activePrefills(s,'place').every(p=>p.status==='confirmed'));assert.ok(activePrefills(s,'vehicle').every(p=>p.status==='pending'))});
test('AI reanalysis of unchanged text can fill untouched sections without restoring rejected facts',()=>{
 const text='دیروز نزاع در رستوران رخ داد و سلاح سرد دیده شد';const s={text,answers:{},extra:{},analysis:prepareAnalysis({events:['assault']},text)};applyPrefills(s,makeTestRow);
 s.analysis=prepareAnalysis({events:['assault'],prefills:[{section:'place',field:'answer',value:'رستوران',evidence:'در رستوران'},{section:'details_assault',field:'tool',value:'سلاح سرد',evidence:'سلاح سرد دیده شد'}]},text);applyPrefills(s,makeTestRow);
 assert.equal(s.answers.place,'رستوران');rejectPrefill(s,s.prefillAudit.findIndex(p=>p.section==='place'));applyPrefills(s,makeTestRow);assert.equal(s.answers.place,undefined);assert.equal(s.extra.details_assault.rows.length,1);
});
