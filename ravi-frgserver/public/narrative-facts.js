// Facts the reporter already wrote in the description, placed into the
// follow-up questions so they are not asked again.
//
// Used by the browser engine (and to top up a model's answer). Every value is
// either copied word for word from the description, or, for a choice field, is
// the one option that the quoted words name: «دیشب» → «شب», «موتور» →
// «موتورسیکلت», «دو نفر» → 2. `DERIVE` holds those mappings; a derived value is
// accepted only when DERIVE gives exactly that value for the quoted words.

const Z = '[\\s\\u200c]*';
const NUM_WORDS = { 'یک': 1, 'یه': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10 };
const DIGITS = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const PEOPLE_RX = new RegExp(`(?<![\\p{L}])(یک|یه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|[۰-۹0-9]{1,2})${Z}(?:تا${Z})?(?:نفر|مرد|زن|پسر|دختر|جوان|سارق|دزد)`, 'u');
const RELATION_RX = /(?<![\p{L}])(همسایه|همکار|دوست|برادر|خواهر|پدر|مادر|همسر|شوهر|خانم|پسر|دختر|پسرعمو|دخترعمو|پسرخاله|دخترخاله|فامیل|آشنا|اقوام|صاحبخانه|مستاجر|نگهبان|سرایدار|مغازه[\s‌]*دار|فروشنده|راننده)[\p{L}‌]{0,6}/u;
const TOLD_RX = /(?:به\s*من|بهم|برایم|برام)\s*(?:گفت|گفتن|گفتند|خبر\s*داد)|تعریف\s*کرد|خبر\s*داد/u;
const VEHICLE_WORDS = [
  [/موتور[\s‌]*سیکلت|موتور/u, 'موتورسیکلت'],
  [/وانت|نیسان/u, 'وانت'], [/کامیون(?:ت)?|تریلی/u, 'کامیون'], [/مینی[\s‌]*بوس|اتوبوس/u, 'اتوبوس'],
  [/(?<![\p{L}])ون(?![\p{L}])/u, 'ون'], [/دوچرخه/u, 'دوچرخه'],
  [/ماشین|خودرو|اتومبیل|پراید|پژو|سمند|تیبا|دنا|رانا|شاهین|پیکان|تاکسی|ال[\s‌]*نود/u, 'خودرو'],
];
const MODEL = '(?:پراید|پژو(?:[\\s‌]+(?:۲۰۶|۲۰۷|۴۰۵|پارس|[0-9٠-٩]{3}))?|سمند|تیبا|دنا|رانا|شاهین|پیکان|کوییک|ال[\\s‌]*نود|نیسان)';
const COLOR = '(?:سفید|مشکی|نقره[\\s‌]*ای|خاکستری|آبی|قرمز|سبز|زرد|نوک[\\s‌]*مدادی|سرمه[\\s‌]*ای|قهوه[\\s‌]*ای)';
const VEHICLE_NAME = '(?:ماشین|خودرو(?:ی)?|اتومبیل|موتورسیکلت|موتور|وانت|کامیون|تاکسی|اتوبوس|دوچرخه)';
const VEHICLE_DESCRIPTION = new RegExp(`(?<![\\p{L}])(${MODEL}|${VEHICLE_NAME})(?:[\\s‌]+(?:رنگ[\\s‌]+)?(${COLOR}))?(?![\\p{L}])`, 'gu');
const MODEL_EXACT = new RegExp(`^(?:${MODEL})$`, 'u');

// Only a directly stated model or a vehicle word immediately paired with a
// color can be a characteristic. A whole incident sentence is never one.
// Reject uncertain or negative statements rather than turning them into facts.
export function vehicleCharacteristics(evidence) {
 const s=String(evidence||'');
 const out=[];
 for(const m of s.matchAll(VEHICLE_DESCRIPTION)){
  const before=s.slice(Math.max(0,m.index-24),m.index),after=s.slice(m.index+m[0].length,m.index+m[0].length+24);
  if(/(?:شاید|احتمال|حدس|مطمئن\s*نیست|معلوم\s*نیست|نامشخص|نمی[\s‌]*دان|نمی[\s‌]*دون)[^.،؛!?؟\n]*$/u.test(before)||/^[\s‌]*(?:را[\s‌]*)?(?:نبود|نیست|نداشت|نمی[\s‌]*دان|نمی[\s‌]*دون)/u.test(after))continue;
  const model=MODEL_EXACT.test(m[1])?m[1]:'';
  if(!model&&!m[2])continue;
  out.push({observation:m[0].trim(),model,color:m[2]||''});
 }
 return out;
}
const ITEM_RX = /(?<![\p{L}])(گوشی(?:[\s‌]*(?:موبایل|همراه))?|موبایل|کیف(?:[\s‌]*پول)?|کوله(?:[\s‌]*پشتی)?|ساک|لپ[\s‌]*تاپ|تبلت|دوربین|طلا(?:ها|جات)?|جواهرات|سکه(?:[\s‌]*ها)?|پول(?:[\s‌]*نقد)?|کارت[\s‌]*(?:بانکی|ملی|عابر[\s‌]*بانک)|مدارک|شناسنامه|گواهینامه|ضبط|باتری|رینگ|لاستیک(?:[\s‌]*ها)?|دوچرخه|تلویزیون|ساعت[\s‌]*مچی)(?![\p{L}])/gu;
const THEFT_VERB = /بردن|بردند|بردن|دزدید|دزدیدند|دزدیدن|سرقت|زدند|زدن|قاپید|ربودند|برده[\s‌]*(?:اند|شد)/u;

/** How a quoted part of the description maps onto a choice field. */
export const DERIVE = {
  'time.period': q => {
    const s = String(q).replace(/‌/g, ' ');
    if (/صبح\s*زود|سحر|سپیده/.test(s)) return 'صبح زود';
    if (/نیمه\s*شب|نصف\s*شب|نصفه\s*شب|بامداد/.test(s)) return 'نیمه‌شب';
    if (/بعد\s*از\s*ظهر|بعدازظهر|بعد\s*ازظهر/.test(s)) return 'بعدازظهر';
    if (/عصر/.test(s)) return 'عصر';
    if (/ظهر/.test(s)) return 'ظهر';
    if (/صبح/.test(s)) return 'صبح';
    if (/شب/.test(s)) return 'شب';
    return '';
  },
  'source.informantKnown': q => (RELATION_RX.test(q) && TOLD_RX.test(q) ? 'بله، می‌شناسمش' : ''),
  'source.informantWitness': q => (/دید|دیده|شاهد\s*بود/.test(q) && TOLD_RX.test(q) ? 'خودش دید' : ''),
  'person.count': q => { const m = String(q).match(PEOPLE_RX); if (!m) return ''; const n = NUM_WORDS[m[1]] ?? Number(DIGITS(m[1])); return n >= 1 && n <= 99 ? String(n) : ''; },
  'vehicle.kind': q => VEHICLE_WORDS.find(([rx]) => rx.test(q))?.[1] || '',
  'vehicle.plateStatus': q => (/پلاک[^.؛!؟\n]{0,25}(?:ندیدم|ندیدیم|ندید|معلوم\s*نبود|نخواندم|نتونستم\s*بخونم)/u.test(q) ? 'پلاک را ندیدم' : /بدون\s*پلاک|پلاک\s*نداشت/u.test(q) ? 'فاقد پلاک بود' : ''),
  'object.role': q => (THEFT_VERB.test(q) ? 'مال سرقت‌شده' : /شکست|آسیب|خراب/.test(q) ? 'مال آسیب‌دیده' : ''),
};
export const derived = (section, field, evidence) => DERIVE[`${section}.${field}`]?.(evidence) || '';

const sentences = text => {
  const out = []; const rx = /[^.؛!؟\n،,]+[.؛!؟\n،,]?/gu; let m;
  while ((m = rx.exec(text))) { const v = m[0].trim(); if (v.length >= 3) out.push(v.replace(/[.؛!؟،,]$/u, '').trim()); }
  return out;
};

/** Prefill proposals, in the same shape as a model's: {section,rowKey,field,value,evidence}. */
export function narrativePrefills(text, topics = []) {
  const out = [];
  const add = (section, field, value, evidence, rowKey = 'first') => { if (value && evidence && text.includes(evidence)) out.push({ section, rowKey, field, value, evidence }); };
  const parts = sentences(text);

  // When: a clock time and the part of the day, as the reporter wrote them.
  const clock = text.match(/(?:حدود\s+|حوالی\s+)?ساعت\s*[۰-۹0-9]{1,2}(?:\s*[:٫.]\s*[۰-۹0-9]{2}|\s*و\s*نیم)?(?:\s*(?:صبح|ظهر|بعد[\s‌]*از[\s‌]*ظهر|عصر|شب|بامداد))?/u)?.[0];
  if (clock) add('time', 'clock', clock.trim(), clock.trim());
  const dayPart = text.match(/صبح[\s‌]*زود|نیمه[\s‌]*شب|نصف[\s‌]*شب|بعد[\s‌]*از[\s‌]*ظهر|بعدازظهر|(?<![\p{L}])(?:دیشب|امشب|پریشب|شب|صبح|ظهر|عصر|سحر|بامداد)(?![\p{L}])/u)?.[0];
  if (dayPart) add('time', 'period', derived('time', 'period', dayPart), dayPart);

  // How they know: the person who told them.
  const told = parts.find(p => TOLD_RX.test(p));
  if (told) {
    const rel = told.match(RELATION_RX)?.[0];
    if (rel) { add('source', 'informantRelation', rel, told); add('source', 'informantKnown', derived('source', 'informantKnown', told), told); }
    add('source', 'informantWitness', derived('source', 'informantWitness', told), told);
  }

  // Who: how many people, and what they did.
  const people = parts.find(p => PEOPLE_RX.test(p));
  if (people) {
    add('person', 'count', derived('person', 'count', people), people);
    add('person', 'notes', people, people);
  }

  // Vehicles: one row per kind the reporter mentioned.
  const seenKinds = new Set();
  for (const p of parts) {
    for (const [rx, kind] of VEHICLE_WORDS) {
      if (!rx.test(p) || seenKinds.has(kind)) continue;
      seenKinds.add(kind);
      const key = 'v-' + kind;
      add('vehicle', 'kind', kind, p.match(rx)[0], key);
      const feature=vehicleCharacteristics(p).find(f=>derived('vehicle','kind',f.observation)===kind);
      if(feature){
        add('vehicle','observation',feature.observation,p,key);
        if(feature.model)add('vehicle','model',feature.model,p,key);
        if(feature.color)add('vehicle','color',feature.color,p,key);
      }
      const plate = parts.find(s => /پلاک/.test(s) && rx.test(s)) || (seenKinds.size === 1 ? parts.find(s => /پلاک/.test(s) && !VEHICLE_WORDS.some(([r]) => r.test(s))) : null);
      if (plate) add('vehicle', 'plateStatus', derived('vehicle', 'plateStatus', plate), plate, key);
    }
  }

  // What was taken or damaged: one row per item, only when the description
  // says it was taken or damaged.
  const theft = topics.some(t => /theft|burglary|stolen|pdf_a09/.test(t));
  const damage = topics.some(t => /damage/.test(t));
  if (theft || damage) {
    const seen = new Set();
    for (const p of parts) {
      const role = derived('object', 'role', p);
      if (!role) continue;
      for (const m of p.matchAll(ITEM_RX)) {
        const item = m[1].replace(/‌/g, ' ');
        if (seen.has(item) || seen.size >= 6) continue;
        seen.add(item);
        const key = 'o-' + item;
        add('object', 'label', m[1], p, key);
        add('object', 'role', role, p, key);
      }
    }
  }
  return out;
}
