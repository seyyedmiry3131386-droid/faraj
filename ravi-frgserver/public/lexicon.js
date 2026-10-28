// Shared Persian phrase families for the local classifier.
//
// Reports are written the way people speak: «گوشی‌ام را زدند» is a theft,
// «آتیش گرفت» is a fire, «میکشمت» is a threat. The generated patterns below
// cover ordinary conjugation, colloquial endings and common alternative
// spellings so a narrative does not have to use catalogue vocabulary to be
// classified. Patterns describe what a reporter said happened; none of them is
// a legal finding.
//
// Everything here is written in ordinary Persian and folded through `rx`,
// so patterns and narratives share one orthography (see persian-normalize.js).
import { rx, foldPattern } from './persian-normalize.js';
export { rx };

// ---------------------------------------------------------------- morphology
/** End of a word: the next character must not continue it. */
export const B = '(?![\\p{L}\\p{N}_])';
/** Start of a word. */
export const A = '(?<![\\p{L}\\p{N}_])';

/**
 * A positive verb form must not be the negated one: «ندزدیدند» is not a theft
 * and «نمی‌فروشد» is not a sale. Every builder below refuses a directly
 * preceding «ن», and `negated` exists for the patterns that want that form.
 */
const POS = '(?<!ن)';
// A verb may carry an object clitic in speech: «می‌زنتش»، «بردنش».
const CLITIC_OBJ = '(?:ش|شون|شان|مون|مان|تون|تان|م|ت)?';
const PAST_END = '(?:ه\\s+(?:است|اند|بود(?:ند|ن|م|یم|ی)?|ام|ای|اید|ایم)(?![\\p{L}\\p{N}_])|ند|نن|ن|یم|ی|م|ه)?' + CLITIC_OBJ;
const PRES_END = '(?:ند|نن|ن|د|ه|م|یم|ی|ت)?' + CLITIC_OBJ;
/** Past-tense conjugations of a past stem, including perfect and colloquial «-ن». */
export const pv = stem => `${POS}${stem}${PAST_END}`;
/** Present/progressive forms, with or without a written «می» separator. */
export const nv = stem => `${POS}می\\s*${stem}${PRES_END}`;
/** Past progressive: «می‌کرد»، «می‌زدند». */
export const pg = stem => `${POS}می\\s*${stem}(?:ند|نن|ن|م|یم|ی)?`;
/** Negated present forms written without «می»: «ندهی»، «نکنند». */
export const neg = stem => `ن${stem}${PRES_END}`;
/** Every negated finite form of one verb, for the denial patterns. */
export const negated = (past, pres) => `(?:ن${past}${PAST_END}|نمی\\s*${past}${PRES_END}|نمی\\s*${pres}${PRES_END}|ن${pres}${PRES_END})`;
/** Subjunctive «ب-» forms. */
export const sv = stem => `${POS}ب${stem}(?:ند|نن|ن|د|م|یم|ی)?`;
/** Every common finite form of one verb. */
export const v = (past, pres) => `(?:${pv(past)}|${pg(past)}${pres ? `|${nv(pres)}|${sv(pres)}` : ''})`;
/** Alternation helper. */
export const any = (...items) => `(?:${items.flat().join('|')})`;
/** Optional possessive/object clitics and the colloquial «رو» for «را». */
export const CLITIC = '(?:\\s*(?:ام|مان|تان|شان|هایم|هایش|ها|ی|م|ت|ش))?(?:\\s+(?:را|رو))?';
/** Ezafe, written or not. */
export const EZ = '(?:\\s*(?:ی|ء)?\\s+|\\s+)';

// ------------------------------------------------------------------ entities
export const WEAPON = any(
 'سلاح(?:\\s+(?:سرد|گرم))?', 'اسلحه', 'تفنگ', 'کلت', 'هفت\\s*تیر', 'شاتگان', 'کلاشینکف',
 'چاقو', 'قمه', 'ساطور', 'شمشیر', 'قداره', 'تیغه?', 'خنجر', 'چاقوی\\s+ضامن\\s*دار',
 'چماق', 'باتوم', 'پنجه\\s*بوکس', 'شوکر', 'میله\\s*(?:ی\\s+)?(?:اهنی|فلزی)', 'لوله\\s*(?:ی\\s+)?(?:اهنی|فلزی)',
 'وسیله\\s*(?:ی|ای)?\\s+تیز', 'جسم\\s+تیز', 'شی\\s*(?:ء)?\\s+تیز', 'الت\\s+(?:سرد|برنده)'
);
export const STAFF = any(
 'مامور(?:ان|ین|ها)?', 'کارکنان', 'کارمند(?:ان|ها)?', 'پرسنل',
 'اتش\\s*نشان(?:ان|ها)?', 'امدادگر(?:ان|ها)?', 'پلیس', 'افسر', 'سرباز(?:ان|ها)?',
 'نیرو(?:ی|های)\\s+(?:انتظامی|امدادی)', 'عوامل\\s+(?:شهرداری|اورژانس|برق|گاز|ابفا)'
) + B;
export const AGENCY = '(?:\\s*(?:ی|های)?\\s*(?:دولتی|شهرداری|انتظامی|پلیس|کلانتری|اورژانس|اتش\\s*نشانی|امدادی|خدماتی|اب|برق|گاز|مخابرات|ابفا|خدمت\\s*رسان|راهور|بهداشت)){0,3}';
export const VEHICLE = any('ماشین', 'خودرو', 'اتومبیل', 'پراید', 'پژو', 'سمند', 'تیبا', 'دنا', 'رانا', 'کویید', 'شاهین', 'پیکان', 'ال\\s*نود', 'موتور(?:\\s*سیکلت)?', 'وانت', 'نیسان', 'کامیون', 'کامیونت', 'اتوبوس', 'تاکسی', 'ون', 'تریلی', 'مینی\\s*بوس');
export const VALUABLE = any(
 'گوشی(?:\\s*(?:موبایل|همراه))?', 'موبایل', 'تلفن\\s+همراه', 'کیف(?:\\s*پول)?', 'کوله', 'ساک',
 'لپ\\s*تاپ', 'تبلت', 'دوربین', 'طلا(?:ها)?', 'جواهر(?:ات)?', 'سکه(?:\\s*ها)?', 'پول(?:\\s*ها)?', 'وجه\\s+نقد',
 'دوچرخه', 'موتور(?:\\s*سیکلت)?', 'ماشین', 'خودرو', 'باتری', 'رینگ', 'لاستیک(?:\\s*ها)?',
 'کابل(?:\\s*های?)?(?:\\s+(?:برق|مخابرات|مسی))?', 'کولر', 'چمدان', 'بار', 'جنس(?:\\s*ها)?', 'اجناس', 'محموله', 'قطعات'
);
export const CHILD_OR_ELDER = any('کودک(?:ان|ی)?', 'بچه(?:\\s*ها|ام|اش|ی)?', 'دختر\\s*بچه', 'پسر\\s*بچه', 'نوزاد', 'سالمند(?:ان)?', 'پیرمرد', 'پیرزن', 'مادربزرگ(?:ش|م)?', 'پدربزرگ(?:ش|م)?', 'فرد\\s+معلول', 'معلول', 'نابینا');
export const ONLINE = any('اینترنت(?:ی)?', 'مجازی', 'انلاین', 'تلگرام', 'واتساپ', 'واتس\\s*اپ', 'اینستاگرام', 'اینستا', 'توییتر', 'توئیتر', 'ایتا', 'بله', 'روبیکا', 'سروش', 'پیام\\s*رسان', 'شبکه\\s*(?:ی\\s+)?اجتماعی', 'کانال', 'گروه', 'سایت', 'وب\\s*سایت', 'صفحه');
export const ESSENTIAL_GOOD = any('دارو(?:ها|یی)?', 'کالا(?:ی\\s+اساسی|ها)?', 'سوخت', 'بنزین', 'گازوئیل', 'ارز', 'دلار', 'طلا', 'روغن', 'شکر', 'برنج', 'ارد', 'نان', 'شیر\\s*خشک', 'لاستیک', 'سیمان', 'مرغ', 'گوشت');

// ------------------------------------------------------------------- actions
/** Taking away: «برد»، «بردند»، «می‌برند»، «دزدید»، «سرقت کرد». */
// The word must END here: «برد» is also the start of «برداشت» (picked up),
// and «کیفش را برداشت و رفت» is not a theft. And it is never the reporter's
// own action: «کیفم را به خانه بردم» (I took) ends in «م», which no «they
// took it» form does.
export const TAKE = A + '(?!برد\\s+و\\s+باخت)' + any(v('برد', 'بر'), v('دزدید', 'دزد'), v('قاپید', 'قاپ'), v('ربود', 'ربا'), 'به\\s+سرقت\\s+' + v('رفت', 'ر'), 'سرقت\\s+' + v('شد', 'شو'), 'سرقت\\s+' + v('کرد', 'کن')) + B + '(?<!م)';
/** Striking: «زد»، «کتک زد»، «مشت زد»، «می‌زند». */
export const HIT = A + any('کتک\\s*کاری', 'کتک(?:م|ت|ش|مان|تان|شان|مون|تون|شون)?' + B, 'ضرب\\s+و\\s+شتم', 'ضرب\\s+و\\s+جرح', v('زد', 'زن'), v('کوبید', 'کوب'));
/** Breaking or wrecking. */
export const BREAK = A + any(v('شکست', 'شکن'), v('ترکاند', 'ترکان'), 'خرد\\s+' + v('کرد', 'کن'), 'داغان\\s+' + v('کرد', 'کن'), 'تخریب\\s+' + v('کرد', 'کن'), v('سوزاند', 'سوزان'), 'اتش\\s+' + v('زد', 'زن'), v('پنچر', ''), 'خط\\s*خطی\\s+' + v('کرد', 'کن'));
/** Threatening. */
const THREAT_CLITIC = 'تهدید(?:مان|مون|تان|تون|شان|شون|م|ت|ش)?';
export const THREATEN = A + any(THREAT_CLITIC + '\\s*' + v('کرد', 'کن'), THREAT_CLITIC + '\\s+' + v('شد', 'شو'), THREAT_CLITIC + B, v('ترساند', 'ترسان'));
/** Selling or supplying. */
export const SELL = A + any(v('فروخت', 'فروش'), 'فروش' + B, 'عرضه', 'سرو' + B, v('داد', 'ده') + '\\s*$', 'پخش' + B, 'توزیع' + B, 'رد\\s+و\\s+بدل');
/** Observing or being told. */
/** Coming and arriving, written and spoken. */
export const COME = A + any(v('امد', 'ای'), 'می\\s*(?:اد|ان|ام|ایم)' + CLITIC_OBJ, v('اومد', 'ا'));
export const REPORTED = A + any('گزارش\\s+' + v('شد', 'شو'), 'گزارش\\s+' + v('کرد', 'کن'), v('دید', 'بین'), v('شنید', 'شنو'), 'شاهد' + B, 'مشاهده\\s+' + v('شد', 'شو'), 'مشاهده\\s+' + v('کرد', 'کن'));

// ---------------------------------------------------------------- guard sets
/**
 * Contexts that describe something other than a reported occurrence: fiction,
 * drills, precautions, instructions and questions. Checked in the words leading
 * up to a match, so «فیلمی دربارهٔ سرقت مسلحانه» is not filed as a robbery.
 */
export const FRAME_GUARD = rx(
 '(?:' + any(
  'فیلم(?:\\s+(?:سینمایی|مستند))?', 'مستند', 'سریال', 'گزارش\\s+تلویزیونی', 'برنامه\\s*(?:ی\\s+)?تلویزیون', 'رمان', 'داستان', 'کتاب', 'نمایش', 'تئاتر', 'بازی\\s+رایانه\\s*ای', 'کلیپ\\s+اموزشی',
  'مانور', 'تمرین', 'رزمایش', 'دوره\\s*(?:ی\\s+)?اموزش(?:ی)?', 'کارگاه\\s+اموزشی', 'کلاس\\s+اموزش',
  'برای\\s+(?:جلوگیری|پیشگیری)\\s+از', 'از\\s+ترس', 'به\\s+منظور\\s+پیشگیری', 'جهت\\s+پیشگیری', 'پیشگیری\\s+از',
  'بیمه\\s*(?:ی\\s+)?', 'خبر\\s*(?:ی\\s+)?(?:قدیمی|خارجی)', 'در\\s+خواب', 'خواب\\s+دیدم', 'شایعه'
 ) + ')[^؛.!؟\\n]{0,45}$', 'u');

/** Explicit non-occurrence or a guess, read from the words that follow a match. */
export const DENIAL = rx('(?:' + any(
 negated('بود', 'باش'), 'نیست', 'نبوده', negated('شد', 'شو'), negated('کرد', 'کن'), negated('داشت', 'دار'),
 negated('خرید', 'خر'), negated('فروخت', 'فروش'), negated('رفت', 'ر'), negated('خورد', 'خور'),
 negated('دید', 'بین'), negated('گرفت', 'گیر'), negated('برد', 'بر'), 'نیامد', 'نیامده',
 'رخ\\s+' + negated('داد', 'ده'), 'اتفاق\\s+' + negated('یفتاد', 'یفت'), 'در\\s+کار\\s+نبود', 'صورت\\s+نگرفت', 'گزارش\\s+نشد'
) + ')', 'u');

/** Hedged or hypothetical framing read from the words before a match. */
export const HEDGE = rx('(?:' + any(
 'شاید', 'احتمال(?:ا|ی|\\s+دارد|\\s+می\\s*رود)?', 'ممکن\\s+است', 'نمی\\s*دانم', 'مطمئن\\s+نیستم',
 'فکر\\s+کردم', 'خیال\\s+کردم', 'گمان\\s+کردم', 'به\\s+نظر\\s+رسید', 'انگار', 'مثل\\s+اینکه',
 'چه\\s+(?:کار|کنم)'
) + ')[^؛.!؟\\n]{0,40}$', 'u');

/**
 * Framing that makes the whole sentence illustrative rather than reported,
 * however far ahead of the phrase it appears: «فرض کنید …»، «یک مثال فرضی …».
 */
export const HYPOTHETICAL = rx('(?:' + any(
 'فرض\\s+کن(?:ید|یم|)', 'مثال\\s*(?:ی\\s+)?(?:فرضی|اموزشی)', 'کاملا\\s+فرضی', 'به\\s*طور\\s+فرضی', 'سناریو',
 'فرضی' + B, 'تمرینی' + B, 'نمونه\\s*(?:ی\\s+)?سوال'
) + ')', 'u');

/** A later clause that withdraws the claim: «فکر کردم دعواست ولی شوخی می‌کردند». */
export const RETRACTION = rx('(?:' + any(
 'شوخی', 'اشتباه\\s+' + v('کرد', 'کن'), 'سوء\\s*تفاهم', 'اشتباه\\s+' + v('فهمید', 'فهم'), 'چیزی\\s+نبود', 'الکی', 'واقعی\\s+نبود'
) + ')', 'u');

export const foldSource = foldPattern;
