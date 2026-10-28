// Set J — the theft split and the misconduct family, scored exactly once.
// Wording is new: nothing here appears in the seeds, rules or unit tests.
const p = (must, text, allow = []) => ({ must, text, allow });

export const probes = [
 // theft from a home
 p('home_burglary', 'وقتی از سفر برگشتیم دیدیم قفل در خانه را شکسته‌اند و لپ‌تاپ و طلاها نیست', ['damage']),
 p('home_burglary', 'از پنجرهٔ آشپزخانه وارد منزل شدند و کیف پول را بردند', []),
 p('home_burglary', 'سرقت از واحد مسکونی طبقهٔ سوم گزارش شد', []),
 p('home_burglary', 'دزد از پشت‌بام آمده بود و وسایل حیاط را برده بود', []),
 // theft of or from a vehicle
 p('vehicle_theft', 'پراید سفیدم را از جلوی در دزدیدند', []),
 p('vehicle_theft', 'شیشهٔ ماشین را شکستند و کیف لپ‌تاپ را از روی صندلی بردند', ['damage']),
 p('vehicle_theft', 'لاستیک زاپاس و باتری خودرو را شبانه سرقت کردند', []),
 p('vehicle_theft', 'موتورسیکلتم که قفل فرمان داشت از پارکینگ عمومی ربوده شد', []),
 // bribery
 p('bribery', 'مأمور راهنمایی برای پاره کردن برگهٔ جریمه از من پول خواست تا کاری نکند', ['official_complaint', 'harassment']),
 p('bribery', 'کارشناس اداره گفت اگر حق حساب ندهی پرونده‌ات می‌خوابد', ['official_complaint']),
 p('bribery', 'برای گرفتن مجوز ساخت به مسئول آنجا زیرمیزی دادیم', ['official_complaint']),
 // embezzlement
 p('embezzlement', 'حسابدار شرکت دولتی مبالغی از حساب شرکت به حساب شخصی‌اش منتقل کرده و اختلاس انجام داده', ['financial_complaint', 'fraud']),
 p('embezzlement', 'حیف و میل بودجهٔ مدرسه توسط مدیر', ['financial_complaint']),
 // dereliction
 p('dereliction', 'با اینکه چند بار به پاسگاه اطلاع دادیم هیچ مأموری نیامد و ترک فعل کردند', ['official_complaint']),
 p('dereliction', 'کوتاهی در انجام وظیفهٔ مأموران باعث شد سارق فرار کند', ['official_complaint', 'theft']),
 // networking inside an organisation
 p('corrupt_network', 'مدیران آن سازمان باندبازی کرده‌اند و همهٔ استخدام‌ها از فامیل خودشان است', ['official_complaint']),
 p('corrupt_network', 'با رانت اطلاعاتی زمین‌ها را بین خودشان تقسیم کردند', ['official_complaint', 'property_dispute', 'pdf_b20']),
 // abuse of office
 p('abuse_of_office', 'رئیس درمانگاه با سوءاستفاده از سمتش داروهای کمیاب را به آشنایانش می‌داد', ['official_complaint', 'medical_care', 'supply_issue']),
 p('abuse_of_office', 'فرماندار با اعمال نفوذ پروژه را به شرکت برادرش داد', ['official_complaint']),
 p('abuse_of_office', 'از موقعیت شغلی‌اش در بانک سوءاستفاده کرد و وام بدون ضامن گرفت', ['official_complaint', 'financial_complaint']),
];

export const negatives = [
 ['کیفش را برداشت و از خانه بیرون رفت', 'home_burglary'],
 ['ماشین را برای تعمیر به مکانیکی بردیم', 'vehicle_theft'],
 ['تلویزیون خانه را به تعمیرگاه بردیم', 'vehicle_theft'],
 ['کارمند اداره با حوصله کارم را انجام داد', 'bribery'],
 ['هیچ رشوه‌ای در کار نبود', 'bribery'],
 ['گزارش حسابرسی نشان داد اختلاسی رخ نداده', 'embezzlement'],
 ['مأموران به‌موقع رسیدند و رسیدگی کردند', 'dereliction'],
 ['در کارگاه شبکه‌سازی کامپیوتری شرکت کردم', 'corrupt_network'],
 ['رئیس اداره طبق مقررات مجوز را صادر کرد', 'abuse_of_office'],
 ['فیلمی دربارهٔ رشوه‌خواری دیدم', 'bribery'],
];
