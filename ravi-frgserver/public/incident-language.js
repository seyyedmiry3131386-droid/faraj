// Phrase families follow the supplied original incident-nlp.js approach.
// Use full words and observed actions; keep offsets in the original narrative.
// Rules operate on the length-preserving normalization in scenarios.js.
const end='(?![\\p{L}\\p{N}_])';
const start='(?<![\\p{L}\\p{N}_])';
const alcohol='(?:مشروب(?:ات)?(?:\\s+الکلی)?|[آا]ب\\s*جو(?:ی)?|شراب|ودکا|ویسکی|عرق(?:\\s+سگی)?|نوشیدنی\\s+الکلی)';
const sell='(?:ن?می\\s*فرو(?:خت(?:ند|ن|م|یم|ی)?|ش(?:ند|ن|د|م|یم|ی|ه))|ن?فروخت(?:ند|ن|م|یم|ی)?)'+end;
// Supplying, serving, handing over or producing for sale.
const supply='(?:فروش|عرضه|سرو|توزیع|پخش|تهیه|دست\\s*ساز)'+end;
const give='(?:ن?می\\s*د(?:اد(?:ند|ن|م|یم|ی)?|ه(?:ند|ن|د|م|یم|ی)?|ن|ند)|ن?داد(?:ند|ن|م|یم|ی)?|سرو\\s+(?:ن?می\\s*)?(?:کرد|کن|شد|شو|می)\\S*|درست\\s+(?:ن?می\\s*)?(?:کرد|کن)\\S*)'+end;
// The alcohol word and the trading verb may sit a few words apart; the same
// window keeps «نمی‌فروختند» inside the quote so the denial check can see it.
export const ALCOHOL_RULE=new RegExp(start+'(?:'+alcohol+end+'[^؛.!؟\\n]{0,34}?(?:'+sell+'|'+supply+'|'+give+')|'+supply+'(?:\\s+(?:کردن|غیر\\s*مجاز|روزانه|پنهانی|بطری|و\\s+سرو)){0,2}\\s*(?:ی\\s+)?[^؛.!؟\\n]{0,16}?'+alcohol+end+'|مشروب\\s*فروشی'+end+')','gu');
const drug='(?:مواد\\s+مخدر|مخدر|تریاک|حشیش|هروئین|ماری\\s*جوانا|کوکائین|مت\\s*امفتامین|مواد(?!\\s+(?:غذایی|اولیه|شیمیایی|پاک\\s*کننده|شوینده|محترقه|منفجره)))(?:ه|هست)?'+end;
const handling='(?:خرید|فروش|قاچاق|توزیع|عرضه|حمل|نگهداری|جابه\\s*جایی|پخش|همراه داشتن)'+end;
export const DRUG_SUPPLY_RULE=new RegExp(start+'(?:'+handling+'\\s+'+drug+'|'+drug+'[^؛.!؟\\n]{0,25}?(?:'+sell+'|فروش'+end+'|(?:به\\s+)?همراه\\s+ن?داشت(?:ه|ند|ن|م|یم|ی)?'+end+'|(?:به\\s+)?همراه\\s+دارد'+end+'|ن?داشت(?:ه|ند|ن|م|یم|ی)?'+end+'|دارد'+end+')|(?:کشیدن|مصرف)\\s+مواد(?: مخدر)?\\s+و\\s+(?:فروش|توزیع)\\s+(?:آن|ان|آنها|انها)'+end+')','gu');
export const HANDLING_FAILURE=/(?:رسیدگی|پیگیری|پی گیری|پاسخگویی|پاسخ گویی)\s*(?:(?:انجام\s*)?نشد(?:ه)?|نکرد(?:ند|ن|ه)?|نمی\s*(?:کنند|کنن|کند|کرد(?:ند|ن)?|شه|شود)|صورت\s+نگرفت)|(?:عدم|نبود)\s+(?:رسیدگی|پیگیری|پی گیری)/u;
export const COMPLAINT_RULE=new RegExp('(?:کلانتری|دستگاه|مامور|مأمور|کارمند)[^؛.!؟\\n]{0,55}(?:پاسخ نداد|رسیدگی نکرد|رشوه|تعدی)|شکایت از (?:عملکرد|مامور|مأمور|کلانتری)|(?:تعدی|سوءاستفاده از شغل|سوء استفاده از شغل|رشوه خواهی)|'+HANDLING_FAILURE.source,'gu');
const office=/(?:کلانتری|شهرداری|مامور(?:ان|ین)?|پلیس|دستگاه دولتی|اداره|سازمان|اورژانس|اتش\s*نشانی|دادسرا|دادگاه|شکایت|شکایتم|پرونده|درخواست|سامانه|بازرسی)/u;
const policeNumber='(?<![\\d۰-۹٠-٩])[1۱١][1۱١][0۰٠](?![\\d۰-۹٠-٩])';
export const POLICE_CONTACT=new RegExp('(?:تماس\\s+(?:با\\s+)?|زنگ\\s+(?:به\\s+)?)'+policeNumber+'|(?:با\\s+|به\\s+)?'+policeNumber+'\\s+(?:تماس|زنگ)','u');
export function complaintContext(match,text){
 // Failure to fulfil a shop order is not automatically official misconduct.
 if(!HANDLING_FAILURE.test(match[0]))return true;
 const nearby=text.slice(Math.max(0,match.index-350),match.index+match[0].length+120);
 return office.test(nearby)||POLICE_CONTACT.test(nearby);
}
export function incidentNegationTail(id,tail){
 // “فروش آبجو رسیدگی نشد” negates handling, not the reported sale.
 return id==='official_complaint'?tail:tail.split(/رسیدگی|پیگیری|پی گیری|پاسخگویی|پاسخ گویی/u)[0];
}
export function hasInternalTradeNegation(id,quote){
 return ['business_observation','drug_supply','weapon_threat'].includes(id)&&/(?:نمی\s*(?:فرو|خر|کن|کرد)|نفروخت|نخرید|نکرد|نبود|نیست|نداشت|ندارد)/u.test(quote);
}
export function isNonAlcoholic(id,quote,tail){
 return id==='business_observation'&&/بدون\s+الکل|غیر\s*الکلی/u.test(quote+' '+tail.split(/[،؛.!؟\n]|\s+و\s/u)[0]);
}

export const endsWithSaleVerb=quote=>new RegExp(sell+'$','u').test(quote)&&!hasInternalTradeNegation('business_observation',quote);
