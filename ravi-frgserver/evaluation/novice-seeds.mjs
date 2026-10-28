// Fixed inputs for the novice-reporter shard. A novice opening is what someone
// types when they do not know how to start; the interview answers are what the
// guided questions collect afterwards. Labels here are authored, never derived
// from what the engine predicts.
//
// The optional answer banks are deliberately topic-neutral: they elaborate on
// circumstances without naming another reportable behaviour, so the expected
// topic set of a composed narrative is exactly the set its `what` answer
// carries. `assertNeutral` in the runner checks that property at start-up
// rather than trusting this comment.

/** [text, expected guidanceNeed] */
export const openings = [
 ['نمیدونم چی بگم', 'unsure'],
 ['نمی‌دانم چه بنویسم', 'unsure'],
 ['نمی‌دونم از کجا شروع کنم', 'unsure'],
 ['بلد نیستم گزارش بنویسم', 'unsure'],
 ['راهنماییم کنید', 'unsure'],
 ['چی بنویسم؟', 'unsure'],
 ['کمکم کنید', 'unsure'],
 ['نمی‌تونم توضیح بدم', 'unsure'],
 ['هیچی نمی‌دونم', 'unsure'],
 ['چطور بنویسم', 'unsure'],
 ['سلام', 'empty'],
 ['درود', 'empty'],
 ['ببخشید', 'empty'],
 ['لطفا', 'empty'],
 ['تست', 'empty'],
 ['', 'empty'],
 ['   ', 'empty'],
 ['دزدی', 'short'],
 ['یه چیزی شد', 'short'],
 ['مشکل دارم', 'short'],
 ['اتفاق بدی افتاد', 'short'],
 ['کمک', 'short'],
 ['خیلی ناراحتم', 'short'],
 ['یک موضوع ناراحت کننده برای من پیش آمده است', 'vague'],
 ['وضعیت خوبی نیست و باید پیگیری شود', 'vague'],
 ['می‌خواهم یک موضوع را رسما اعلام کنم', 'vague'],
 ['چیزی که دیدم اصلا درست نبود', 'vague'],
];

/** The opening interview answer, with the topic it is authored to carry. */
export const whatAnswers = [
 { phrase: 'سرقت رخ داد', topics: ['theft'] },
 { phrase: 'کلاهبرداری رخ داد', topics: ['fraud'] },
 { phrase: 'نزاع و درگیری رخ داد', topics: ['assault'] },
 { phrase: 'تهدید و مزاحمت رخ داد', topics: ['harassment'] },
 { phrase: 'تصادف رخ داد', topics: ['accident'] },
 { phrase: 'آتش‌سوزی رخ داد', topics: ['fire'] },
 { phrase: 'تخریب اموال رخ داد', topics: ['damage'] },
 { phrase: 'چراغ معبر خاموش بود', topics: ['service'] },
];

/** Circumstantial elaborations that name no further reportable behaviour. */
export const details = [
 'همه چیز خیلی سریع اتفاق افتاد',
 'از سمت کوچه آمدند و دوباره برگشتند',
 'چند دقیقه طول کشید و بعد رفتند',
 'اول متوجه نشدم و بعد فهمیدم',
 'وقتی رسیدم همه چیز تمام شده بود',
 'دو بار همین وضعیت پیش آمد',
 'با سر و صدا بیرون رفتم و نگاه کردم',
 'همسایه‌ها هم بیرون آمده بودند',
];
export const whens = ['همین حالا', 'امروز', 'دیشب', 'دیروز', 'چند روز پیش', 'هفتهٔ گذشته', 'امروز صبح', 'دیروز حدود ظهر'];
export const wheres = ['خیابان بهار', 'کوچه گلستان', 'میدان آزادی', 'بلوار دانش', 'محلهٔ سرو', 'نزدیک نانوایی محله', 'جلوی مدرسه', 'پارک نسترن'];
export const whos = ['این اتفاق برای خودم افتاد', 'این اتفاق برای یکی از نزدیکانم افتاد', 'این اتفاق برای فرد دیگری افتاد'];
export const results = ['کیف و گوشی', 'دوچرخه', 'مقداری پول نقد', 'لوازم داخل خودرو', 'وسایل مغازه'];
/** How it happened, worded without naming a second behaviour. */
export const methods = [
 'بدون اینکه کسی متوجه شود انجام شد',
 'از سمت کوچهٔ پشتی وارد شدند',
 'خیلی سریع و در چند ثانیه انجام شد',
 'با تلفن تماس گرفتند و بعد اتفاق افتاد',
 'وقتی محل خلوت بود انجام شد',
];
/** Only what the reporter was actually told; never an inferred motive. */
export const reasons = [
 'گفتند سر اختلاف قبلی بوده است',
 'گفتند سر پول یا بدهی بوده است',
 'خودش گفت از قبل با هم مشکل داشتند',
];
export const evidences = [
 'از این اتفاق عکس دارم',
 'از این اتفاق فیلم دارم',
 'پیام‌های مرتبط را دارم',
 'رسید یا سند مرتبط را دارم',
 'تصویر دوربین محل موجود است',
 'فرد دیگری شاهد این اتفاق بود',
];
export const sources = ['من خودم این را دیدم', 'این را از فرد دیگری شنیدم', 'این را در فضای مجازی دیدم'];

/** Interview steps that may be skipped, with the bank each draws from. */
export const OPTIONAL_BANKS = { detail: details, when: whens, where: wheres, who: whos, result: results, method: methods, reason: reasons, evidence: evidences, source: sources };
