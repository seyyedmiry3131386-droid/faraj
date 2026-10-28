import {complaintContext,incidentNegationTail,hasInternalTradeNegation,isNonAlcoholic,endsWithSaleVerb} from './incident-language.js';
import {EXTENDED_EVENTS,EXTRA_RULES} from './extended-bank.js';
import {NUMBERED_TOPICS,NUMBERED_RULES} from './numbered-topics.js';
import {BANK_VERSION,inferCategories,CATEGORIES} from './question-bank.js';
import {foldIndexed,normalize} from './persian-normalize.js';
import {FRAME_GUARD,HEDGE,HYPOTHETICAL,DENIAL,RETRACTION,VEHICLE} from './lexicon.js';
import {CORE_RULES} from './core-rules.js';
import {TERM_RULES} from './topic-terms.js';
// Shared taxonomy and normalization for the browser and API. These are reporting
// topics, not legal findings. Multiple topics may apply to the same narrative.
export const EVENTS={
 ...NUMBERED_TOPICS,
 ...EXTENDED_EVENTS,
 data_breach:{title:'دسترسی یا افشای بدون اجازهٔ اطلاعات',detail:'چه رفتار مشخصی از دسترسی یا افشای بدون اجازه مشاهده کرده‌اید؟',hint:'نشانهٔ مشاهده‌شده، حساب یا وسیلهٔ درگیر و نحوهٔ اطلاع را توضیح دهید؛ رمز، محتوای محرمانه یا اطلاعات خصوصی غیرضروری ننویسید.',modules:['person','contact']},
 trafficking:{title:'احتمال قاچاق انسان و بهره‌کشی',detail:'چه نشانه‌ای از اجبار، فریب یا بهره‌کشی مشاهده یا دریافت کرده‌اید؟',hint:'وعدهٔ اولیه، محدودیت رفت‌وآمد، گرفتن مدارک یا وادارکردن به کار را فقط در صورت اطلاع شرح دهید. انتقال افراد به‌تنهایی اثبات قاچاق نیست.',modules:['person','vehicle','contact']},
 confinement:{title:'ربایش یا نگهداری اجباری',detail:'دربارهٔ بردن یا نگه‌داشتن فرد برخلاف خواستش چه می‌دانید؟',hint:'ترتیب اتفاق‌ها، آخرین مشاهده و نحوهٔ اطلاع خود را جدا بنویسید.',modules:['person','vehicle','contact']},
 forgery:{title:'جعل یا استفاده از مدرک جعلی',detail:'کدام مدرک محل تردید است و چه چیزی دربارهٔ آن مشاهده کرده‌اید؟',hint:'نوع مدرک و نحوهٔ استفاده را بنویسید؛ اگر جعلی‌بودن فقط شنیده یا احتمال است، مشخص کنید.',modules:['person','contact']},
 assault:{title:'نزاع، درگیری یا آسیب بدنی',detail:'چه نوع درگیری رخ داد و چه رفتاری مشاهده کردید؟',hint:'درگیری لفظی یا فیزیکی و رفتار دیده‌شده را شرح دهید؛ آسیب، سلاح یا مقصر نامعلوم را حدس نزنید.',modules:['person','vehicle','contact']},
 theft:{title:'سرقت',detail:'چه چیزی به سرقت رفته است؟',hint:'نوع مال، مشخصات و آخرین زمان مشاهده را در صورت اطلاع بنویسید.',modules:['person','vehicle','contact']},
 fraud:{title:'کلاهبرداری',detail:'چه وعده یا معامله‌ای مطرح شد و چه اتفاقی افتاد؟',hint:'روش پرداخت و آنچه دریافت کرده‌اید را توضیح دهید. رمز یا اطلاعات بانکی کامل ننویسید.',modules:['person','contact']},
 damage:{title:'تخریب اموال',detail:'چه آسیبی به اموال وارد شده است؟',hint:'نوع مال و آسیب قابل مشاهده را شرح دهید؛ علت نامعلوم را حدس نزنید.',modules:['person','vehicle','contact']},
 fire:{title:'آتش‌سوزی',detail:'کدام بخش دچار آتش‌سوزی شده بود؟',hint:'آنچه مشاهده کردید و خسارت قابل مشاهده را شرح دهید.',modules:[]},
 accident:{title:'حادثه و تصادف',detail:'چه آسیب یا خسارتی مشاهده کردید؟',hint:'مشاهدات خود را توضیح دهید؛ تعیین مقصر لازم نیست.',modules:['person','vehicle','contact']},
 harassment:{title:'تهدید و مزاحمت',detail:'چه رفتار یا تهدید مشخصی رخ داده است؟',hint:'رفتار یا عبارت گفته‌شده و دفعات وقوع را در صورت اطلاع بنویسید.',modules:['person','contact']},
 service:{title:'خدمات شهری',detail:'مشکل مشاهده‌شده چیست؟',hint:'خرابی یا اختلال و تأثیر قابل مشاهدهٔ آن را شرح دهید.',modules:[]},
 other:{title:'سایر رخدادهای آسیب‌زا',detail:'ترتیب اتفاق‌ها و نتیجهٔ قابل مشاهده چه بود؟',hint:'آنچه می‌دانید را به زبان خودتان شرح دهید. می‌توانید بخش‌های مرتبط را از «موضوع‌ها و بخش‌ها» اضافه کنید.',modules:[]}
};
export const eventIds=a=>{const values=Array.isArray(a?.events)?a.events:[a?.event];const ids=[...new Set(values.map(v=>typeof v==='string'?v:v?.type).filter(id=>Object.hasOwn(EVENTS,id)))];return ids.length?ids:['other']};
export const detailId=id=>`details_${id}`;
export const titleFor=a=>eventIds(a).map(id=>EVENTS[id].title).join(' + ');
export {normalize} from './persian-normalize.js';
// Split complete narrative clauses, preserving each verbatim span for review.
export const incidentClauses=text=>String(text).split(/(?<=[.؛!؟\n])\s*|\s+و\s+(?=یکی از)|\s+(?=(?:ماشین|خودرو|بعد از|هرچی|هر چه|اما |ولی |سپس |همچنین |هم\s*زمان ))/u).map(x=>x.trim().replace(/\s+و$/u,'')).filter(Boolean);
// A narrower label supersedes the general one it is a kind of: an investment
// scheme is a fraud, a phishing attack is an unauthorized access, and a channel
// teaching bomb-making is not itself a bombing. Both would otherwise be
// reported, which reads as two separate incidents.
const specificTopics={...NUMBERED_TOPICS,weapon_threat:{replaces:['harassment']},
 investment_fraud:{replaces:['fraud','financial_complaint']},
 cyber_attack:{replaces:['data_breach']},
 identity_misuse:{replaces:['impersonation']},
 dangerous_instruction:{replaces:['pdf_a13','online_harm']},
 stolen_goods:{replaces:[]},gambling:{replaces:[]},drone_sighting:{replaces:[]},
 bribery:{replaces:['official_complaint']},dereliction:{replaces:['official_complaint']},corrupt_network:{replaces:['official_complaint']},
 abuse_of_office:{replaces:['official_complaint','impersonation']},embezzlement:{replaces:['financial_complaint']},sexual_violence:{replaces:['assault','harassment']},online_harm:{replaces:['assault','harassment']},public_nuisance:{replaces:['harassment']}};
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36)};
/**
 * The supplemental sections the narrative itself brings up: a vehicle, a
 * phone or online account, people. Only these (and the ones the topic
 * needs) are asked about; a car break-in is not asked for a web address.
 */
export function mentionedFollowups(text){
 const s=String(text||'').replace(/‌/g,' ');
 return [
  ...(/خودرو|ماشین|موتور|وسیله نقلیه|(?:^|\s)ون(?:\s|$|[،.])|کامیون|وانت|اتوبوس|تاکسی|پراید|پژو|سمند|تیبا|پیکان|دوچرخه|پلاک/.test(s)?['vehicle']:[]),
  ...(/تلگرام|واتساپ|واتس اپ|اینستاگرام|ایتا|روبیکا|پیام رسان بله|سروش|تماس گرفت|زنگ زد|تلفن|شماره|پیام رسان|پیام داد|پیامک|حساب کاربری|پیج|صفحه (?:اینستاگرام|مجازی)|سایت|وب سایت|لینک|ایمیل|آیدی|ایدی|اکانت|کارت به کارت|شماره کارت|شماره حساب|شبا|درگاه/.test(s)?['contact']:[]),
  ...(/(?:یک|دو|سه|چهار|پنج|چند|[۰-۹\d]+)\s*(?:تا\s*)?(?:نفر|مرد|زن|پسر|دختر|جوان)|سارق|دزد|مهاجم|ضارب|راننده|فروشنده|مامور|مأمور|کارمند|همسایه|شاهد|مردی|زنی|پسری|دختری|فردی/.test(s)?['person']:[])
 ];
}
export function normalizeAnalysis(raw={},text=''){
 const grounded=e=>typeof e==='string'&&e.trim().length>=3&&text.includes(e.trim());
 const rawEvents=Array.isArray(raw.events)?raw.events:[raw.event];
 const usable=rawEvents.filter(v=>typeof v==='string'||grounded(v?.evidence));
 const events=eventIds({events:usable});
 const allowed=['time','place','source',...events.map(detailId)];
 const seen=new Set();
 const prompts=(Array.isArray(raw.prompts)?raw.prompts:[]).filter(p=>allowed.includes(p.section)&&grounded(p.evidence)&&typeof p.title==='string'&&p.title.length<=240&&p.title.length>5&&!seen.has(p.section)&&seen.add(p.section)).map(p=>({...p,hint:String(p.hint||'').slice(0,400)}));
 const questions=(Array.isArray(raw.questions)?raw.questions:[]).filter(q=>events.includes(q.event)&&grounded(q.evidence)&&typeof q.title==='string'&&q.title.length>5&&q.title.length<=240).filter(q=>q.title.length<=120&&!/به کدام بخش|کدام دسته|عنوان فرد|نوع رخداد/.test(q.title)).slice(0,2).map(q=>({id:`custom_${hash(q.event+q.title)}`,title:q.title,hint:String(q.hint||'').slice(0,400),event:q.event,evidence:q.evidence})).filter((q,i,a)=>a.findIndex(x=>x.id===q.id)===i);
 const needsClarification=Boolean(raw.clarification?.needed)||(!raw.clarificationHandled&&events.every(id=>id==='other'));
 const observationOnly=events.every(id=>id==='other');
 const categoryEvidence=Object.fromEntries((Array.isArray(raw.categories)?raw.categories:[]).filter(c=>Object.hasOwn(CATEGORIES,c?.type)&&grounded(c.evidence)).map(c=>[c.type,c.evidence]));
 const categories=[...new Set([...(Array.isArray(raw.categories)?raw.categories:[]).filter(c=>typeof c==='string'&&Object.hasOwn(CATEGORIES,c)),...Object.keys(categoryEvidence)])];
 const known=Object.fromEntries(['time','place','source'].map(k=>[k,typeof raw.known?.[k]==='string'&&text.includes(raw.known[k])?raw.known[k]:'']));
 return {...raw,bankVersion:BANK_VERSION,categories:observationOnly?['event']:categories,categoryEvidence:{...raw.categoryEvidence,...categoryEvidence},needsClarification,observationOnly,events,event:events[0],title:titleFor({events}),known,prompts:observationOnly?[]:prompts,questions:observationOnly?[]:questions,followups:[...new Set((!observationOnly?[...(Array.isArray(raw.followups)?raw.followups:[]),...mentionedFollowups(text)]:[]).filter(x=>['person','vehicle','contact'].includes(x)))],eventEvidence:{...Object.fromEntries(Object.entries(raw.eventEvidence||{}).filter(([id,evidence])=>events.includes(id)&&grounded(evidence))),...Object.fromEntries(rawEvents.filter(e=>e?.type&&events.includes(e.type)&&grounded(e.evidence)).map(e=>[e.type,e.evidence]))}};
}
// Drug talk must be explicit in the same sentence: food, industrial materials
// and a remote mention elsewhere in the narrative do not qualify.
const drugContext=/(?:مواد\s+مخدر|مخدر|تریاک|حشیش|هروئین|شیشه|کراک|گل|ماری\s*جوانا|سرنگ|خمار|نشئه|ساقی|(?:کشیدن|مصرف|تزریق)\s+مواد(?!\s+(?:غذایی|اولیه|شیمیایی|شوینده))|تزریق(?!\s+(?:اشتباه|دارو|واکسن|سرم|انسولین|امپول))|(?:خرید|فروش|پخش|توزیع|قاچاق|حمل|مرکز\s+پخش)\s+مواد(?!\s+(?:غذایی|اولیه|شیمیایی|شوینده|محترقه|منفجره)))/u;
const onlineContext=/اینترنت|مجازی|انلاین|تلگرام|واتساپ|واتس\s*اپ|اینستاگرام|اینستا|توییتر|توئیتر|ایتا|روبیکا|پیام\s*رسان|شبکه\s*(?:ی\s+)?اجتماعی|کانال|گروه|وب\s*سایت|سایت|صفحه/u;

export function localAnalysis(text){
 const src=String(text);
 // One folded view for matching, one index map back into the untouched
 // narrative so every stored quote stays exactly as the reporter wrote it.
 const {s:folded,map}=foldIndexed(src);
 const s=folded;
 const from=i=>map[Math.min(i,map.length-1)];
 const upto=i=>map[Math.max(0,Math.min(i,map.length-1))];
 const quote=(index,length)=>src.slice(from(index),upto(index+length-1)+1);
 // Never join a subject in one sentence to a predicate in another.
 const sentences=[...s.matchAll(/[^؛.!؟\n]+/gu)];
 const rules=[...CORE_RULES,...EXTRA_RULES];
 const eventEvidence={},events=[],occurrences=new Map(),localEventOffsets={};
 // Shared acceptance test. A match only becomes a reported topic when the
 // narrative asserts it: not negated, not hedged, not hypothetical, not fiction
 // or a drill, and not withdrawn later in the same sentence.
 const accepts=(id,m)=>{
  const sentenceStart=m.sentenceStart,sentence=m.sentence;
  if(id==='pdf_a02'&&/تجمع|تظاهرات|اعتصاب|راهپیمایی|تحصن/.test(sentence))return false;
  if(id==='online_harm'&&!onlineContext.test(sentence))return false;
  if((id==='drug_supply'||id==='drug_use')&&!drugContext.test(sentence))return false;
  if(id==='official_complaint'&&!complaintContext(m,s))return false;
  const before=s.slice(Math.max(sentenceStart,m.index-70),m.index);
  const rest=s.slice(m.index+m[0].length);
  const after=incidentNegationTail(id,rest.split(/[،,؛.!؟\n]|\s+(?:اما|ولی|سپس|و|و سپس|بعد از|هم زمان|تا|که|چون|زیرا)\s/u)[0].slice(0,30));
  if(isNonAlcoholic(id,m[0],after))return false;
  if(id==='assault'&&/^\s*(?:ذهنی|فکری|درسی|نرم افزاری|سیاسی|لفظی با خودش)/u.test(after))return false;
  if(id==='theft'&&/(?:سوار|داخل|توی)\s+\S{0,14}$/u.test(before))return false;
  // An unspecified conflict inside the same public-nuisance phrase is not a second bodily-injury allegation.
  if(id==='assault'&&m[0]==='درگیری'&&/^\s+و\s+(?:ایجاد\s+)?مزاحمت\s+(?:برای|به)\s+(?:کسبه|رهگذران|مردم)/u.test(rest))return false;
  const lead=s.slice(sentenceStart,m.index);
  // Retold fiction, drills, precautions and cautionary framing are not reports.
  if(FRAME_GUARD.test(lead))return false;
  // An explicitly hypothetical or illustrative framing covers the whole sentence,
  // however far ahead of the phrase it was written.
  if(HYPOTHETICAL.test(lead))return false;
  // «اگر … چه کنیم؟» asks a question; it does not report an occurrence.
  if(/(?:^|[\s،])(?:اگر|اگه|چنانچه|در\s+صورتی?\s+که)/u.test(lead)&&(s[sentenceStart+sentence.length]==='؟'||/چ(?:ه|ی)\s*(?:کنیم|کنم|کار|باید)|چیکار|چکار|چطور|چجور|چگونه|چه\s+کسی/u.test(sentence)))return false;
  // A clause that withdraws the claim in the same sentence removes it.
  if(RETRACTION.test(rest.split(/[؛.!؟\n]/u)[0]))return false;
  // «صدای ترقه بود نه گلوله»: a contrastive «نه» denies the phrase after it.
  if(/(?:^|[\s،])نه\s*$/u.test(before))return false;
  // An explicit positive fight predicate survives a later denial of injury.
  const positiveConflict=['assault','pdf_a04'].includes(id)&&/^\s+(?:(?:لفظی|فیزیکی)\s+)?(?:کرد(?:ند|ن|م|یم|ی)?|شد(?:ند|ن|م|یم|ی)?|داشت(?:ند|م|یم|ی)?|رخ داد)(?=\s|$|[،؛.!؟])/.test(after);
  const denied=DENIAL.test(after)&&!positiveConflict&&!endsWithSaleVerb(m[0]);
  if(denied||hasInternalTradeNegation(id,m[0])||HEDGE.test(before))return false;
  // «بدون» inside the matched span negates it — «پرواز بدون تأخیر» reports no
  // delay. The exceptions are the phrases where «بدون X» IS the reported harm:
  // an unarmed theft, an access without permission, an act without consent.
  if(/(?:^|\s)(?:بدون|عدم|فاقد)\s/u.test(m[0])&&!/(?:بدون|عدم|فاقد)\s+(?:هیچ\s+|استفاده\s+از\s+)?(?:سلاح|اسلحه|چاقو|خشونت|مجوز|اجازه|رضایت|اطلاع|پروانه|رسیدگی|پیگیری|مزد|حقوق|دستمزد|یخچال|کلاه|کفش|تجهیزات|کمربند|ایمنی|بیمه|نظارت|بهداشت|الکل|سرنشین)/u.test(m[0]))return false;
  return !/(?:بدون|عدم)\s*$/.test(before);
 };
 const located=re=>sentences.flatMap(part=>[...part[0].matchAll(re)].map(m=>Object.assign(m,{index:m.index+part.index,sentenceStart:part.index,sentence:part[0]})));
 for(const [id,re] of [...rules,...NUMBERED_RULES]){
  const matches=located(re).filter(m=>accepts(id,m));
  if(matches.length){events.push(id);occurrences.set(id,matches);eventEvidence[id]=quote(matches[0].index,matches[0].length===undefined?matches[0][0].length:matches[0][0].length)}
 }
 // Second stage. The phrase rules above describe sentence structures; a
 // narrative that simply names the behaviour in words they do not cover would
 // otherwise fall through to «other». One unambiguous term is enough; an
 // ordinary term needs a second, different one in the same sentence. Every
 // candidate passes exactly the same acceptance test as a phrase rule, so a
 // negated, hedged or fictional mention still adds nothing.
 const replacedByFound=new Set(events.flatMap(id=>specificTopics[id]?.replaces||[]));
 const weakHits=new Map();
 for(const [id,re,strength] of TERM_RULES){
  if(occurrences.has(id)||replacedByFound.has(id))continue;
  const matches=located(re).filter(m=>accepts(id,m));
  if(!matches.length)continue;
  if(strength==='strong'){events.push(id);occurrences.set(id,matches);eventEvidence[id]=quote(matches[0].index,matches[0][0].length);continue}
  // Two DIFFERENT ordinary terms, in the SAME sentence, or it is not evidence.
  const bySentence=new Map();
  for(const m of matches){
   const group=bySentence.get(m.sentenceStart)||{terms:new Set(),first:m};
   group.terms.add(m[0]);
   if(m.index<group.first.index)group.first=m;
   bySentence.set(m.sentenceStart,group);
  }
  const confirmed=[...bySentence.values()].filter(g=>g.terms.size>=2);
  if(confirmed.length)weakHits.set(id,confirmed.map(g=>g.first));
 }
 for(const [id,matches] of weakHits){
  if(occurrences.has(id))continue;
  events.push(id);occurrences.set(id,matches);eventEvidence[id]=quote(matches[0].index,matches[0][0].length);
 }
 // Prefer a specific numbered topic over its generic template only when every
 // generic occurrence is inside that topic's evidence. Separate episodes survive.
 const covered=(id,m)=>events.some(specific=>specificTopics[specific]?.replaces.includes(id)&&occurrences.get(specific).some(n=>n.index<=m.index&&n.index+n[0].length>=m.index+m[0].length));
 const selected=events.filter(id=>!occurrences.get(id).every(m=>covered(id,m)));
 for(const id of selected){
  const match=occurrences.get(id).find(m=>!covered(id,m));
  eventEvidence[id]=quote(match.index,match[0].length);localEventOffsets[id]=from(match.index);
 }
 // A theft, told apart by where it happened. Each reported theft is read from
 // its own SENTENCE, not the whole account: a burglary and a car stolen the
 // next day are two thefts, and each keeps its own label and quote. The
 // vehicle wins inside one sentence — «موتورم را از پارکینگ خانه بردند» is a
 // vehicle theft that happened at home.
 const ti=selected.indexOf('theft');
 if(ti>=0){
  // Bounded on the left: «تلویزیون» ends in «ون» (van).
  const carRx=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+VEHICLE+')','u');
  const homeRx=/(?:^|\s)(?:خانه|خونه|منزل|اپارتمان|ویلا|واحد\s+مسکونی|حیاط|پشت\s*بام|انباری\s+خانه)/u;
  const kindOf=m=>carRx.test(m.sentence||'')?'vehicle_theft':homeRx.test(m.sentence||'')?'home_burglary':'theft';
  const groups=new Map();
  for(const m of occurrences.get('theft').filter(x=>!covered('theft',x)))groups.set(kindOf(m),[...(groups.get(kindOf(m))||[]),m]);
  if(groups.size&&!(groups.size===1&&groups.has('theft'))){
   const kinds=[...groups.keys()].filter(k=>k==='theft'||!selected.includes(k));
   selected.splice(ti,1,...kinds);
   const e=events.indexOf('theft');if(e>=0)events.splice(e,1,...kinds.filter(k=>!events.includes(k)||k==='theft'));
   const theftEvidence=eventEvidence.theft,theftOffset=localEventOffsets.theft;
   if(!groups.has('theft')){delete eventEvidence.theft;delete localEventOffsets.theft}
   for(const k of kinds){const first=groups.get(k)[0];occurrences.set(k,groups.get(k));eventEvidence[k]=quote(first.index,first[0].length);localEventOffsets[k]=from(first.index)}
   void theftEvidence;void theftOffset;
  }
 }
 // A narrower label replaces the general one it is a kind of, when both come
 // from the same sentence: «کارمند شهرداری رشوه خواست» is one bribe, not a
 // bribe plus a separate complaint about the municipality. In different
 // sentences they are different things and both stay.
 const NARROWS={bribery:['official_complaint','pdf_b22'],dereliction:['official_complaint'],corrupt_network:['official_complaint'],
  abuse_of_office:['official_complaint','impersonation'],embezzlement:['financial_complaint'],
  investment_fraud:['fraud','financial_complaint'],cyber_attack:['data_breach'],dangerous_instruction:['pdf_a13','online_harm','explosion','hazardous_supply'],identity_misuse:['impersonation']};
 for(const [narrow,generals] of Object.entries(NARROWS)){
  if(!selected.includes(narrow))continue;
  const where=new Set(occurrences.get(narrow).map(m=>m.sentenceStart));
  for(const g of generals){
   const gi=selected.indexOf(g);if(gi<0)continue;
   if(occurrences.get(g).every(m=>where.has(m.sentenceStart))){selected.splice(gi,1);delete eventEvidence[g];delete localEventOffsets[g]}
  }
 }
 let cursor=0;const spans=incidentClauses(src).map(value=>{const start=src.indexOf(value,cursor);cursor=start+value.length;return {value,start,end:cursor}});
 const localEpisodes=selected.flatMap(event=>occurrences.get(event).filter(m=>!covered(event,m)).map(m=>{
  const start=from(m.index),end=upto(m.index+m[0].length-1)+1;
  return {event,evidence:spans.find(p=>p.start<=start&&p.end>=end)?.value||src.slice(start,end)};
 })).filter((e,i,all)=>all.findIndex(p=>p.event===e.event&&p.evidence===e.evidence)===i);
 const time=s.match(/(?:امروز|دیروز|دیشب|شب گذشته|روز گذشته|پریروز|صبح امروز|امشب|هفته گذشته|هفته پیش|ماه گذشته)(?:\s+ساعت\s+[\d۰-۹:٫]+)?|ساعت\s+[\d۰-۹:٫]+/);
 const timeQuote=time?quote(time.index,time[0].length):'';
 // Where and how they know, as verbatim spans, so the questionnaire can show
 // them for confirmation instead of asking again. Written in folded
 // orthography; `quote` maps the match back to the reporter's own spelling.
 // One name after the place noun — «خیابان بهار» — or two when the first is an
 // honorific («خیابان شهید بهشتی»). A second plain word is usually the next
 // clause («خیابان بهار دو نفر…»), so it is not taken.
 const NAME='(?:(?:شهید|امام|ایت\\s*الله|دکتر|سردار|حضرت)\\s+)?[^\\s،,.؛!؟]+';
 const place=s.match(new RegExp('(?:خیابان|کوچه|میدان|بلوار|بزرگراه|اتوبان|محله|شهرک|روستای|جاده|پاساژ|بازار|ایستگاه|پارک|ترمینال|فرودگاه)\\s+(?!(?:را|رو|که|و|به|از|در|با)(?:\\s|$))'+NAME+'(?:\\s*[،,]?\\s*(?:نزدیک|جلوی|کنار|روبروی|پشت)\\s+[^\\s،,.؛!؟]+)?','u'));
 const placeQuote=place?quote(place.index,place[0].length).trim():'';
 // «How do you know» is the whole clause that says it — «همسایه‌مان دید و به
 // من گفت» — so the span starts at the clause boundary, not mid-word.
 const HEARD='(?:به\\s+من\\s+گفت(?:ند|ه)?|بهم\\s+گفت(?:ن|ند)?|برایم\\s+تعریف\\s+کرد(?:ند)?|برام\\s+تعریف\\s+کرد(?:ن)?|خبر\\s+داد(?:ند|ن)?|تعریف\\s+کرد(?:ند|ن)?|شنیدم)';
 const heard=s.match(new RegExp('(?<=(?:^|[،,.؛!؟\\n])\\s*)[^،,.؛!؟\\n]{0,60}?'+HEARD,'u'))||s.match(new RegExp(HEARD,'u'));
 const saw=s.match(/(?:خودم\s+(?:دیدم|شاهد\s+بودم)|با\s+چشم\s+خودم\s+دیدم|شاهد\s+بودم|جلوی\s+چشمم)/u);
 const online=s.match(/(?:در|تو|توی)\s+(?:اینستاگرام|اینستا|تلگرام|واتساپ|ایتا|روبیکا|بله|کانال|صفحه|فضای\s+مجازی)\S*\s+(?:\S+\s+){0,2}(?:دیدم|خواندم|خوندم)/u);
 const sourceHit=heard||online||saw;
 const sourceQuote=sourceHit?quote(sourceHit.index,sourceHit[0].length).trim():'';
 return normalizeAnalysis({eventEvidence,localEventOffsets,localEpisodes,events:selected.length?selected:['other'],known:{time:timeQuote,place:placeQuote,source:sourceQuote},categories:inferCategories(s,selected.length?selected:['other']),followups:mentionedFollowups(s),mode:'preview'},text);
}
