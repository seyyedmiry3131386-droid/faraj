// Held-out probes. Persian phrasings written independently of the classifier's
// regular expressions: colloquial speech, alternative verb forms, alternative
// spellings, Arabic-Indic typography and indirect wording. Labels are fixed
// inputs and are never derived from predictions.
//
// `must`  the topic the phrasing is meant to report; missing it is a recall miss.
// `allow` further topics a careful reader could justify from the same words;
//         anything predicted outside must+allow counts as a false positive.
const p = (must, text, allow = []) => ({ must, text, allow });

export const probes = [
 // --- pdf_a02  obstruction of routes and service interruption
 p('pdf_a02', 'خیابان اصلی را با بلوک سیمانی بسته بودند و ماشین‌ها رد نمی‌شدند', ['service', 'public_nuisance', 'traffic_violation']),
 p('pdf_a02', 'ورودی پایانه را بستند و اتوبوس‌ها نتوانستند خارج شوند', ['public_nuisance', 'service']),
 p('pdf_a02', 'راه دسترسی بیمارستان مسدود شده بود و آمبولانس معطل ماند', ['service', 'public_nuisance']),
 p('pdf_a02', 'عمداً برق محله را قطع کردند و خدمات مخابرات هم از کار افتاد', ['service', 'damage']),
 p('pdf_a02', 'روی ریل قطار مانع گذاشته بودند', ['service', 'damage', 'public_nuisance']),

 // --- pdf_a03  armed conflict, hostage taking, shooting
 p('pdf_a03', 'چند نفر با اسلحه به هم حمله کردند', ['assault', 'weapon_threat', 'shooting']),
 p('pdf_a03', 'یک نفر را گروگان گرفته بودند و اجازه خروج نمی‌دادند', ['confinement', 'pdf_a14']),
 p('pdf_a03', 'با قمه و چاقو به جان هم افتادند', ['assault', 'weapon_threat', 'pdf_b15']),
 p('pdf_a03', 'به سمت مغازه تیر شلیک کردند', ['shooting', 'damage']),
 p('pdf_a03', 'نزاع گروهی با سلاح سرد رخ داد', ['assault', 'weapon_threat', 'pdf_b15']),

 // --- pdf_a04  conflict with, threat to or obstruction of staff
 p('pdf_a04', 'به مأمور اورژانس فحاشی کرد و او را هل داد', ['assault', 'harassment']),
 p('pdf_a04', 'نگذاشتند آتش‌نشان‌ها وارد محل شوند', ['public_nuisance']),
 p('pdf_a04', 'مانع کار کارگران شرکت برق شدند', ['public_nuisance', 'service']),
 p('pdf_a04', 'با پلیس گلاویز شد', ['assault']),
 p('pdf_a04', 'کارمند شهرداری را کتک زدند', ['assault', 'pdf_a15']),

 // --- pdf_a05  explosion or damage to sensitive infrastructure
 p('pdf_a05', 'مخزن پالایشگاه منفجر شد و شعله بالا رفت', ['explosion', 'fire']),
 p('pdf_a05', 'دکل‌های شبکه سراسری برق را خراب کرده بودند', ['damage', 'service']),
 p('pdf_a05', 'در ایستگاه گاز صدای انفجار آمد', ['explosion']),
 p('pdf_a05', 'به تأسیسات آب محله آسیب عمدی زده بودند', ['damage', 'service']),
 p('pdf_a05', 'انبار سوخت آتش گرفت و دود همه‌جا را گرفت', ['fire']),

 // --- pdf_a09  armed theft
 p('pdf_a09', 'با اسلحه وارد طلافروشی شدند و طلاها را بردند', ['theft', 'weapon_threat', 'pdf_a17']),
 p('pdf_a09', 'چاقو گذاشت زیر گلویش و کیفش را برد', ['theft', 'weapon_threat']),
 p('pdf_a09', 'مسلح آمدند و پول صندوق بانک را خالی کردند', ['theft', 'weapon_threat']),
 p('pdf_a09', 'با تفنگ تهدید کرد و موبایلم را گرفت', ['theft', 'weapon_threat']),
 p('pdf_a09', 'سرقت همراه با سلاح گرم گزارش شد', ['theft', 'weapon_threat']),

 // --- pdf_a10  large scale hoarding of essentials causing shortage
 p('pdf_a10', 'انبار بزرگی از دارو را نگه داشته بودند و دارو در شهر نایاب شد', ['supply_issue', 'pdf_b17']),
 p('pdf_a10', 'احتکار گسترده روغن باعث شد قفسه‌ها خالی بماند', ['supply_issue', 'pdf_b17']),
 p('pdf_a10', 'سوخت را در مقیاس بزرگ انبار کردند و کمبود شدید ایجاد شد', ['supply_issue', 'pdf_b17']),
 p('pdf_a10', 'احتکار سازمان‌یافتهٔ ارز موجب کمبود در بازار شد', ['supply_issue', 'pdf_b20']),
 p('pdf_a10', 'دپوی کلان شکر باعث کمیاب شدن آن در استان شد', ['supply_issue']),

 // --- pdf_a13  bombing or violent attack
 p('pdf_a13', 'بمب کار گذاشته بودند در ساختمان', ['explosion']),
 p('pdf_a13', 'با ماشین عمداً به جمعیت زد', ['accident', 'assault', 'traffic_violation']),
 p('pdf_a13', 'تهدید کردند که ساختمان را منفجر می‌کنند', ['harassment', 'explosion', 'pdf_a16']),
 p('pdf_a13', 'حملهٔ تروریستی به مرکز خرید گزارش شد', ['assault', 'explosion']),
 p('pdf_a13', 'بستهٔ انفجاری در ایستگاه پیدا شد', ['explosion', 'discovery']),

 // --- pdf_a14  abduction and forced confinement
 p('pdf_a14', 'دختربچه را سوار ون کردند و بردند', ['confinement', 'trafficking']),
 p('pdf_a14', 'او را در انباری نگه داشته بودند و اجازهٔ بیرون رفتن نمی‌دادند', ['confinement']),
 p('pdf_a14', 'برای آزاد کردنش پول خواستند', ['confinement', 'harassment']),
 p('pdf_a14', 'برخلاف میلش او را به شهر دیگری منتقل کردند', ['confinement', 'trafficking']),
 p('pdf_a14', 'گفتند تا پول ندهی آزادش نمی‌کنیم', ['confinement', 'harassment']),

 // --- pdf_a15  domestic violence and abuse of vulnerable people
 p('pdf_a15', 'شوهرش هر شب او را می‌زند', ['assault', 'family_dispute']),
 p('pdf_a15', 'پدر بچه را با کمربند زده بود', ['assault']),
 p('pdf_a15', 'مادربزرگش را در خانه کتک می‌زنند', ['assault']),
 p('pdf_a15', 'صدای جیغ و کتک‌کاری از واحد بغلی می‌آمد و بچه گریه می‌کرد', ['assault', 'public_nuisance']),
 p('pdf_a15', 'آزار کودک در خانه گزارش شد', ['assault', 'pdf_b26']),

 // --- pdf_a16  threat to kill or seriously harm
 p('pdf_a16', 'گفت می‌کشمت', ['harassment']),
 p('pdf_a16', 'تهدید کرد که خونش را می‌ریزد', ['harassment']),
 p('pdf_a16', 'پیام داد که زنده‌ات نمی‌گذارم', ['harassment', 'pdf_b27']),
 p('pdf_a16', 'گفت بلایی سرت می‌آورم که زمین‌گیر شوی', ['harassment']),
 p('pdf_a16', 'تهدید به مرگ دریافت کردم', ['harassment']),

 // --- pdf_a17  forced entry with threat
 p('pdf_a17', 'در خانه را شکستند و وارد شدند و تهدید کردند', ['damage', 'harassment', 'theft']),
 p('pdf_a17', 'به زور وارد مغازه شدند و صاحبش را زدند', ['assault', 'damage']),
 p('pdf_a17', 'با فشار در را باز کردند و با چاقو تهدیدمان کردند', ['weapon_threat', 'damage', 'harassment']),
 p('pdf_a17', 'ریختند داخل حیاط و کتک‌کاری کردند', ['assault']),
 p('pdf_a17', 'ورود قهری به منزل همراه با ضرب و جرح گزارش شد', ['assault']),

 // --- pdf_b08  discrimination and irregularity in public services
 p('pdf_b08', 'یارانه را به بعضی دادند و به ما ندادند', ['official_complaint', 'financial_complaint']),
 p('pdf_b08', 'در نوبت‌دهی درمانگاه با ما فرق گذاشتند', ['official_complaint', 'medical_care']),
 p('pdf_b08', 'تسهیلات مسکن را ناعادلانه توزیع کردند', ['official_complaint', 'financial_complaint']),
 p('pdf_b08', 'در ثبت‌نام مدرسه بین بچه‌ها تبعیض قائل شدند', ['official_complaint']),
 p('pdf_b08', 'بی‌عدالتی در تخصیص سهمیه گزارش شد', ['official_complaint']),

 // --- pdf_b11  price increases for goods, medicine and services
 p('pdf_b11', 'قیمت شیرخشک را دو برابر کرده بودند', ['supply_issue']),
 p('pdf_b11', 'دارو را گران‌تر از نرخ روی جعبه فروختند', ['supply_issue']),
 p('pdf_b11', 'نان را بالاتر از نرخ مصوب می‌دهند', ['supply_issue']),
 p('pdf_b11', 'کرایه را چند برابر حساب کرد', ['supply_issue', 'passenger_complaint', 'financial_complaint']),
 p('pdf_b11', 'گران‌فروشی مواد غذایی در مغازه دیده شد', ['supply_issue']),

 // --- pdf_b15  recurring local violence, extortion, dangerous supply
 p('pdf_b15', 'هر شب سر خیابان از مغازه‌دارها پول می‌گیرند', ['harassment', 'financial_complaint']),
 p('pdf_b15', 'مرتب در محله دعوا راه می‌اندازند و کسی جرئت نمی‌کند حرف بزند', ['assault', 'public_nuisance']),
 p('pdf_b15', 'چند وقت است در کوچه اسلحه رد و بدل می‌کنند', ['hazardous_supply']),
 p('pdf_b15', 'باج‌گیری از کسبه هر هفته تکرار می‌شود', ['harassment']),
 p('pdf_b15', 'نزاع خیابانی در این محله مرتب اتفاق می‌افتد', ['assault', 'public_nuisance']),

 // --- pdf_b16  petty unarmed theft
 p('pdf_b16', 'موتورم را بردند، سلاحی در کار نبود', ['theft']),
 p('pdf_b16', 'توی اتوبوس جیبم را زدند', ['theft']),
 p('pdf_b16', 'کابل‌های برق کوچه را بریدند و بردند', ['theft', 'damage', 'service']),
 p('pdf_b16', 'کیفم را از دستم قاپیدند، چاقو یا اسلحه نداشت', ['theft']),
 p('pdf_b16', 'سرقت ماشین بدون هیچ سلاحی انجام شد', ['theft']),

 // --- pdf_b17  small scale, retail hoarding
 p('pdf_b17', 'مغازه‌دار روغن را انبار کرده و به مشتری نمی‌دهد و صف طولانی شده', ['supply_issue']),
 p('pdf_b17', 'داروخانه دارو را نگه داشته و می‌گوید موجود نیست', ['supply_issue', 'medical_care']),
 p('pdf_b17', 'احتکار خرد شکر در فروشگاه محله دیده شد', ['supply_issue']),
 p('pdf_b17', 'کالا را از قفسه جمع کرده‌اند تا گران‌تر بفروشند', ['supply_issue', 'pdf_b11']),
 p('pdf_b17', 'احتکار صنفی لاستیک گزارش شد', ['supply_issue']),

 // --- pdf_b20  smuggling, land grabbing, financial irregularity
 p('pdf_b20', 'شبانه زمین کشاورزی مردم را تصرف کرده‌اند', ['property_dispute']),
 p('pdf_b20', 'محموله‌های بزرگ کالای قاچاق را شبانه جابه‌جا می‌کنند', ['supply_issue']),
 p('pdf_b20', 'با سند جعلی زمین را به نام خودش زد', ['forgery', 'pdf_b24', 'property_dispute', 'fraud']),
 p('pdf_b20', 'در بازار ارز اختلال ایجاد کرده‌اند', ['financial_complaint']),
 p('pdf_b20', 'قاچاق سوخت در مقیاس بزرگ گزارش شد', ['supply_issue']),

 // --- pdf_b22  impersonating an official for money or coercion
 p('pdf_b22', 'خودش را مأمور برق معرفی کرد و بابت جریمه پول گرفت', ['impersonation', 'fraud', 'financial_complaint']),
 p('pdf_b22', 'با کارت شناسایی تقلبی آمد و گفت باید جریمه بدهید', ['impersonation', 'forgery', 'fraud']),
 p('pdf_b22', 'گفت از کلانتری آمده و باید پول نقد بدهم', ['impersonation', 'fraud']),
 p('pdf_b22', 'با لباس شبیه مأموران آمد و وجه دریافت کرد', ['impersonation', 'fraud']),
 p('pdf_b22', 'جعل عنوان بازرس برای گرفتن وجه انجام شد', ['impersonation', 'fraud']),

 // --- pdf_b23  transaction fraud, prepayment without delivery
 p('pdf_b23', 'بیعانهٔ خانه را گرفت و دیگر جواب تلفن نداد', ['fraud', 'financial_complaint', 'property_dispute']),
 p('pdf_b23', 'پول ماشین را واریز کردم ولی ماشینی تحویل ندادند', ['fraud', 'financial_complaint']),
 p('pdf_b23', 'برای اجارهٔ ویلا پول گرفت ولی ویلایی وجود نداشت', ['fraud', 'financial_complaint']),
 p('pdf_b23', 'پیش‌خرید کردم، تاریخ گذشت و کالا نرسید', ['fraud', 'supply_issue', 'financial_complaint']),
 p('pdf_b23', 'کلاهبرداری در فروش آپارتمان گزارش شد', ['fraud', 'property_dispute']),

 // --- pdf_b24  forgery or misuse of identity and ownership documents
 p('pdf_b24', 'با وکالت‌نامهٔ تقلبی ماشین را فروخت', ['forgery', 'fraud']),
 p('pdf_b24', 'از کارت ملی من بدون اجازه برای گرفتن سیم‌کارت استفاده کردند', ['forgery', 'data_breach', 'fraud']),
 p('pdf_b24', 'سند مالکیت را دستکاری کرده بودند', ['forgery', 'property_dispute']),
 p('pdf_b24', 'قرارداد را به نام من جعل کرده بودند', ['forgery', 'fraud']),
 p('pdf_b24', 'با مدارک هویتی دیگری وام گرفته بودند', ['forgery', 'fraud', 'financial_complaint']),

 // --- pdf_b25  stalking and repeated harassment
 p('pdf_b25', 'هر روز جلوی در خانه‌ام می‌ایستد و دنبالم می‌آید', ['harassment']),
 p('pdf_b25', 'مدام زنگ می‌زند و پیام می‌دهد و دست‌بردار نیست', ['harassment']),
 p('pdf_b25', 'چند هفته است تا محل کارم تعقیبم می‌کند', ['harassment']),
 p('pdf_b25', 'مزاحمت‌ها هر روز تکرار می‌شود', ['harassment']),
 p('pdf_b25', 'تعقیب مکرر در مسیر مدرسه گزارش شد', ['harassment']),

 // --- pdf_b26  forced exploitation of children and vulnerable people
 p('pdf_b26', 'بچه‌ها را مجبور می‌کنند سر چهارراه گدایی کنند و پولشان را می‌گیرند', ['trafficking']),
 p('pdf_b26', 'کودک را وادار به دزدی می‌کردند', ['trafficking', 'theft']),
 p('pdf_b26', 'زنی بچه‌ها را می‌آورد و آخر شب درآمدشان را می‌برد', ['trafficking']),
 p('pdf_b26', 'با تهدید فرد معلول را به کار وادار کرده بودند', ['trafficking', 'harassment']),
 p('pdf_b26', 'بهره‌کشی از کودکان کار گزارش شد', ['trafficking']),

 // --- pdf_b27  cyber extortion and online abuse
 p('pdf_b27', 'گفت اگر پول ندهی عکس‌هایت را پخش می‌کنم', ['harassment', 'data_breach']),
 p('pdf_b27', 'با اسم من در اینستاگرام صفحه ساخته‌اند', ['data_breach', 'impersonation', 'online_harm']),
 p('pdf_b27', 'چت‌های خصوصی‌ام را تهدید کرد منتشر کند', ['harassment', 'data_breach']),
 p('pdf_b27', 'از عکس‌های شخصی‌ام برای باج‌گیری استفاده کردند', ['harassment', 'data_breach']),
 p('pdf_b27', 'اخاذی اینترنتی با تهدید انتشار فیلم انجام شد', ['harassment', 'data_breach']),

 // --- official_complaint
 p('official_complaint', 'چند بار به کلانتری گفتم ولی هیچ کاری نکردند', []),
 p('official_complaint', 'پرونده را ماه‌هاست معطل گذاشته‌اند و جواب نمی‌دهند', []),
 p('official_complaint', 'کارمند اداره گفت اگر شیرینی بدهی زودتر انجام می‌شود', ['financial_complaint', 'fraud']),
 p('official_complaint', 'شکایتم را ثبت کردند اما پیگیری نشد', []),
 p('official_complaint', 'مأمور با من برخورد بدی کرد و به شکایتم رسیدگی نکرد', []),

 // --- business_observation  alcohol sale or service
 p('business_observation', 'توی آن کافه زیرزمینی مشروب می‌دادند', []),
 p('business_observation', 'بطری‌های ودکا را به مشتری می‌فروختند', []),
 p('business_observation', 'مشروب دست‌ساز درست می‌کرد و می‌فروخت', []),
 p('business_observation', 'در مهمانی آبجو سرو کردند', []),
 p('business_observation', 'فروش شراب در آن مغازه دیده شد', []),

 // --- environment
 p('environment', 'فاضلاب کارخانه را توی رودخانه رها کرده‌اند', []),
 p('environment', 'درخت‌های پارک را شبانه بریدند', ['damage']),
 p('environment', 'سگ‌ها را آزار می‌دادند', []),
 p('environment', 'زباله‌های بیمارستانی را در بیابان ریخته بودند', ['service', 'food_safety']),
 p('environment', 'دود کارخانه هوای محله را آلوده کرده', []),

 // --- disaster
 p('disaster', 'زمین‌لرزه آمد و دیوار حیاط ریخت', ['damage']),
 p('disaster', 'آب از رودخانه بالا زد و خانه‌ها را گرفت', ['damage']),
 p('disaster', 'کوه ریزش کرد و جاده بسته شد', ['pdf_a02', 'service']),
 p('disaster', 'طوفان سقف انبار را کند', ['damage']),
 p('disaster', 'سیل روستا را فرا گرفت', ['damage']),

 // --- supply_issue
 p('supply_issue', 'یخچالی که خریدم از روز اول کار نمی‌کرد', ['financial_complaint']),
 p('supply_issue', 'هیچ داروخانه‌ای انسولین ندارد', []),
 p('supply_issue', 'جنس معیوب تحویل دادند و پس نمی‌گیرند', ['financial_complaint', 'fraud']),
 p('supply_issue', 'شیر خشک در شهر پیدا نمی‌شود', []),
 p('supply_issue', 'کالای تحویلی با آنچه سفارش دادم فرق داشت', ['financial_complaint', 'fraud']),

 // --- food_safety
 p('food_safety', 'مرغ توی مغازه بو گرفته بود', []),
 p('food_safety', 'آشپزخانهٔ رستوران پر از سوسک بود', []),
 p('food_safety', 'بعد از خوردن آن غذا حالمان بد شد', ['medical_care']),
 p('food_safety', 'تاریخ مصرف لبنیات گذشته بود و هنوز می‌فروختند', ['supply_issue', 'fraud']),
 p('food_safety', 'گوشت را بدون یخچال نگه داشته بودند', []),

 // --- shooting
 p('shooting', 'صدای تیر آمد', []),
 p('shooting', 'به سمت آسمان تیراندازی کردند', ['fireworks']),
 p('shooting', 'گلوله به شیشه خورد', ['damage']),
 p('shooting', 'دیدم که شلیک کرد', []),
 p('shooting', 'صدای چند گلوله پشت سر هم شنیده شد', []),

 // --- explosion
 p('explosion', 'یک صدای مهیب آمد و شیشه‌ها لرزید', ['damage']),
 p('explosion', 'کپسول گاز ترکید', ['fire', 'damage']),
 p('explosion', 'انفجار در کارگاه رخ داد', ['workplace_accident']),
 p('explosion', 'دیگ بخار منفجر شده بود', ['workplace_accident', 'damage']),
 p('explosion', 'صدای انفجار از ساختمان کناری آمد', []),

 // --- impersonation
 p('impersonation', 'خودش را دکتر معرفی کرد ولی مدرکی نداشت', ['medical_care', 'fraud']),
 p('impersonation', 'گفت از شرکت گاز آمده اما کارت نداشت', ['fraud']),
 p('impersonation', 'وانمود کرد بازرس بهداشت است', ['fraud', 'food_safety']),
 p('impersonation', 'با عنوان کارشناس بانک تماس گرفت', ['fraud', 'financial_complaint']),
 p('impersonation', 'خود را مأمور شهرداری معرفی کرده بود', []),

 // --- discovery
 p('discovery', 'یک نفر کنار جدول افتاده بود و تکان نمی‌خورد', []),
 p('discovery', 'مردی را بیهوش در پارک پیدا کردیم', []),
 p('discovery', 'جسدی در کانال آب دیده شد', []),
 p('discovery', 'پیکر یک ناشناس در زمین خالی پیدا شد', []),
 p('discovery', 'فردی بی‌حرکت در راه‌پله افتاده بود', []),

 // --- hazardous_supply
 p('hazardous_supply', 'در کانال تلگرامی سلاح می‌فروشند', ['online_harm', 'drug_supply']),
 p('hazardous_supply', 'اسلحه را زیر پتو جابه‌جا می‌کردند', []),
 p('hazardous_supply', 'مواد منفجره را در انبار نگه داشته بودند', ['explosion', 'fireworks']),
 p('hazardous_supply', 'قمه و شمشیر را در مغازه عرضه می‌کردند', []),
 p('hazardous_supply', 'خرید و فروش فشنگ در محله دیده شد', []),

 // --- drug_use
 p('drug_use', 'گوشهٔ پارک داشتند شیشه می‌کشیدند', []),
 p('drug_use', 'بوی حشیش از راه‌پله می‌آمد', []),
 p('drug_use', 'یک نفر در کوچه تزریق می‌کرد', []),
 p('drug_use', 'تریاک مصرف می‌کردند', []),
 p('drug_use', 'استعمال مواد مخدر در محل دیده شد', []),

 // --- drug_supply
 p('drug_supply', 'سر کوچه بسته‌های کوچک رد و بدل می‌کنند و پول می‌گیرند', []),
 p('drug_supply', 'گفتند آن خانه مرکز پخش مواد است', []),
 p('drug_supply', 'شیشه می‌فروخت', []),
 p('drug_supply', 'مقدار زیادی مواد مخدر در صندوق عقب داشت', ['vehicle_irregularity']),
 p('drug_supply', 'توزیع مواد مخدر در پارک گزارش شد', []),

 // --- weapon_threat
 p('weapon_threat', 'قمه کشید روی ما', ['assault']),
 p('weapon_threat', 'چاقو درآورد و گفت جلو نیا', ['harassment']),
 p('weapon_threat', 'با یک میلهٔ آهنی تهدیدمان کرد', ['harassment', 'assault']),
 p('weapon_threat', 'اسلحه را نشان داد و گفت ساکت باش', ['harassment']),
 p('weapon_threat', 'با چاقو مردم را ترساند', ['harassment', 'public_nuisance']),

 // --- vehicle_irregularity
 p('vehicle_irregularity', 'پلاک ماشین را با گل پوشانده بودند', []),
 p('vehicle_irregularity', 'شمارهٔ شاسی با کارت ماشین یکی نبود', ['forgery']),
 p('vehicle_irregularity', 'پلاک موتور خوانا نبود', []),
 p('vehicle_irregularity', 'برگ سبز خودرو مشکوک به نظر می‌رسید', ['forgery']),
 p('vehicle_irregularity', 'روی پلاک برچسب زده بودند تا دیده نشود', []),

 // --- resource_extraction
 p('resource_extraction', 'با بیل مکانیکی از بستر رودخانه شن بار می‌زدند', ['environment']),
 p('resource_extraction', 'چاه غیرمجاز زده‌اند و آب می‌کشند', ['environment']),
 p('resource_extraction', 'از تپه خاک برمی‌دارند و می‌برند', ['environment']),
 p('resource_extraction', 'معدن را بدون مجوز کار می‌کنند', ['environment']),
 p('resource_extraction', 'برداشت بی‌رویه از منابع آب زیرزمینی دیده شد', ['environment']),

 // --- financial_complaint
 p('financial_complaint', 'از حسابم بدون اطلاع پول کم شده', ['fraud', 'data_breach']),
 p('financial_complaint', 'حقوق چند ماه کارگران را نداده', []),
 p('financial_complaint', 'چکش برگشت خورد و بدهی را نمی‌دهد', []),
 p('financial_complaint', 'پولی که قرض داده بودم پس نمی‌دهد', []),
 p('financial_complaint', 'اختلاف بر سر مبلغ قرارداد پیش آمده', []),

 // --- property_dispute
 p('property_dispute', 'همسایه دیوار را جابه‌جا کرد و بخشی از حیاط ما را گرفت', ['damage']),
 p('property_dispute', 'مستأجر تخلیه نمی‌کند', []),
 p('property_dispute', 'قفل مغازه را عوض کرده و نمی‌گذارد وارد شوم', ['damage']),
 p('property_dispute', 'سر مالکیت زمین اختلاف داریم', []),
 p('property_dispute', 'راه دسترسی به ملکم را بسته‌اند', ['pdf_a02']),

 // --- family_dispute
 p('family_dispute', 'با همسرم دعوای لفظی شد', ['assault']),
 p('family_dispute', 'سر ارث با برادرم اختلاف داریم', ['financial_complaint']),
 p('family_dispute', 'پدر و مادرم مدام با هم بحث می‌کنند', []),
 p('family_dispute', 'اختلاف بر سر حضانت بچه پیش آمده', []),
 p('family_dispute', 'در خانواده اختلاف شدیدی وجود دارد', []),

 // --- medical_care
 p('medical_care', 'دکتر داروی اشتباه تجویز کرد', []),
 p('medical_care', 'بعد از عمل وضعش بدتر شد و کسی جواب نمی‌دهد', ['official_complaint']),
 p('medical_care', 'پرستار سرم را اشتباه وصل کرد', []),
 p('medical_care', 'بیمارستان بیمار را پذیرش نکرد', ['official_complaint', 'pdf_b08']),
 p('medical_care', 'داروی تقلبی به ما دادند', ['fraud', 'supply_issue']),

 // --- traffic_violation
 p('traffic_violation', 'با سرعت زیاد از لای ماشین‌ها لایی می‌کشید', []),
 p('traffic_violation', 'جلوی در پارکینگ دوبله پارک کرده بود', ['public_nuisance']),
 p('traffic_violation', 'از چراغ قرمز رد شد', []),
 p('traffic_violation', 'در خیابان یک‌طرفه خلاف آمد', []),
 p('traffic_violation', 'موتورسوار روی پیاده‌رو حرکت می‌کرد', ['public_nuisance']),

 // --- passenger_complaint
 p('passenger_complaint', 'پروازمان را کنسل کردند و هزینه را برنگرداندند', ['financial_complaint', 'fraud']),
 p('passenger_complaint', 'قطار چند ساعت تأخیر داشت', []),
 p('passenger_complaint', 'چمدانم را در فرودگاه گم کردند', ['theft']),
 p('passenger_complaint', 'راننده اتوبوس ما را وسط راه پیاده کرد', []),
 p('passenger_complaint', 'خدمات وعده‌داده‌شده در تور سفر ارائه نشد', ['fraud']),

 // --- workplace_accident
 p('workplace_accident', 'کارگر از طبقهٔ سوم ساختمان افتاد', ['accident']),
 p('workplace_accident', 'دستش لای دستگاه ماند', ['accident']),
 p('workplace_accident', 'داربست کارگاه ریخت', ['accident', 'damage']),
 p('workplace_accident', 'در کارخانه بدون کلاه ایمنی کار می‌کنند و خطرناک است', []),
 p('workplace_accident', 'حادثه هنگام جوشکاری رخ داد', ['accident', 'fire']),

 // --- self_harm
 p('self_harm', 'گفت دیگر نمی‌خواهد زنده بماند', []),
 p('self_harm', 'روی دستش بریدگی‌های تازه دیدم و نگرانش هستم', []),
 p('self_harm', 'نگرانم که به خودش صدمه بزند', []),
 p('self_harm', 'حرف از تمام کردن همه چیز می‌زد', []),
 p('self_harm', 'خودزنی کرده بود', []),

 // --- fireworks
 p('fireworks', 'بچه‌ها ترقه می‌ترکانند و خطرناک است', ['public_nuisance']),
 p('fireworks', 'در انباری مواد محترقه نگه داشته‌اند', ['hazardous_supply', 'explosion']),
 p('fireworks', 'فشفشه به بالکن خورد و آتش گرفت', ['fire']),
 p('fireworks', 'دست پسربچه با ترقه آسیب دید', ['accident']),
 p('fireworks', 'مواد آتش‌بازی را در مغازه می‌فروختند', ['hazardous_supply']),

 // --- sexual_violence
 p('sexual_violence', 'بدون رضایت به او دست زد', ['assault', 'harassment']),
 p('sexual_violence', 'در تاکسی مزاحمش شد و دست‌درازی کرد', ['harassment']),
 p('sexual_violence', 'تعرض جنسی گزارش شد', ['assault']),
 p('sexual_violence', 'مجبورش کردند به رابطه', ['assault']),
 p('sexual_violence', 'آزار جنسی در محل کار رخ داد', ['harassment']),

 // --- online_harm
 p('online_harm', 'در گروه واتساپ نوشته بودند بریزیم خانه‌اش را آتش بزنیم', ['harassment']),
 p('online_harm', 'در توییتر برای کتک زدن یک نفر فراخوان داده بودند', ['harassment']),
 p('online_harm', 'در کانال تلگرام آدرس خانه‌اش را گذاشته و گفته‌اند بروید سراغش', ['harassment', 'data_breach']),
 p('online_harm', 'پیام دعوت به خشونت در اینستاگرام منتشر شد', ['harassment']),
 p('online_harm', 'در شبکهٔ اجتماعی تهدید به حمله به مغازه منتشر شد', ['harassment']),

 // --- public_nuisance
 p('public_nuisance', 'تا نصفه‌شب صدای موزیک بلند بود', []),
 p('public_nuisance', 'جلوی پیاده‌رو را با بساط گرفته‌اند', ['pdf_a02']),
 p('public_nuisance', 'در کوچه عربده می‌کشند', []),
 p('public_nuisance', 'ورودی ساختمان را مسدود کرده‌اند', ['pdf_a02']),
 p('public_nuisance', 'سد معبر جلوی مغازه ایجاد شده', ['pdf_a02']),

 // --- data_breach
 p('data_breach', 'وارد ایمیلم شده بودند و پیام‌ها را خوانده بودند', []),
 p('data_breach', 'اطلاعات مشتریان شرکت را بیرون داده بودند', []),
 p('data_breach', 'لینک جعلی بانک فرستادند و اطلاعاتم را گرفتند', ['fraud']),
 p('data_breach', 'اکانت اینستاگرامم را گرفتند', []),
 p('data_breach', 'عکس‌های خصوصی‌ام بدون اجازه منتشر شد', ['pdf_b27', 'harassment']),

 // --- trafficking
 p('trafficking', 'پاسپورتشان را گرفته‌اند و اجازه نمی‌دهند بروند', ['confinement']),
 p('trafficking', 'با وعدهٔ کار آوردندشان و حالا بی‌مزد کار می‌کنند', ['financial_complaint']),
 p('trafficking', 'کارگران را در کارگاه حبس کرده و کار می‌کشند', ['confinement']),
 p('trafficking', 'فروش انسان گزارش شد', []),
 p('trafficking', 'بهره‌کشی از اتباع در مزرعه دیده شد', ['pdf_b26']),

 // --- confinement
 p('confinement', 'او را در اتاق حبس کرده بودند', []),
 p('confinement', 'به زور سوار ماشینش کردند و بردند', ['pdf_a14']),
 p('confinement', 'اجازه نمی‌دهند از خانه بیرون بیاید', []),
 p('confinement', 'گروگان گرفته شده بود', ['pdf_a03']),
 p('confinement', 'فرد را برخلاف میلش نگه داشته بودند', []),

 // --- forgery
 p('forgery', 'مدرک دانشگاهی‌اش تقلبی بود', []),
 p('forgery', 'امضای من را جعل کرده بودند', []),
 p('forgery', 'با شناسنامهٔ دیگری کار راه انداخته بود', ['impersonation']),
 p('forgery', 'رسید بانکی را دستکاری کرده بود', ['fraud', 'financial_complaint']),
 p('forgery', 'گواهینامهٔ جعلی ارائه داد', []),

 // --- assault
 p('assault', 'زد توی صورتش', []),
 p('assault', 'با مشت و لگد به جانش افتادند', []),
 p('assault', 'سر صف دعوایشان شد و به هم پریدند', []),
 p('assault', 'با میله به سرش زدند', ['weapon_threat']),
 p('assault', 'کتک‌کاری شدیدی رخ داد', []),

 // --- theft
 p('theft', 'گوشی‌ام را زدند', []),
 p('theft', 'از خانه‌مان طلا بردند', ['pdf_b16']),
 p('theft', 'باتری ماشین را باز کرده و برده بودند', ['pdf_b16', 'damage']),
 p('theft', 'مغازه را زده بودند و جنس‌ها را برده بودند', ['pdf_b16', 'damage']),
 p('theft', 'دوچرخه‌ام را دزدیدند', ['pdf_b16']),

 // --- fraud
 p('fraud', 'گفت سرمایه‌گذاری کن سود می‌دهم، پول را گرفت و رفت', ['financial_complaint', 'pdf_b23']),
 p('fraud', 'در سایت خرید کردم، پول رفت و جنسی نیامد', ['financial_complaint', 'pdf_b23', 'supply_issue']),
 p('fraud', 'وعدهٔ استخدام داد و پول گرفت', ['financial_complaint', 'pdf_b23']),
 p('fraud', 'با ترفند قرعه‌کشی حسابم را خالی کردند', ['financial_complaint', 'data_breach']),
 p('fraud', 'کلاهبرداری تلفنی گزارش شد', []),

 // --- damage
 p('damage', 'شیشهٔ ماشینم را شکستند', []),
 p('damage', 'دیوار مغازه را با اسپری خط‌خطی کردند', []),
 p('damage', 'لاستیک‌ها را پنچر کرده بودند', []),
 p('damage', 'در پارک نیمکت‌ها را شکسته بودند', ['public_nuisance']),
 p('damage', 'به اموال عمومی آسیب زدند', []),

 // --- fire
 p('fire', 'انبار آتش گرفت', []),
 p('fire', 'از پنجرهٔ واحد روبه‌رو شعله بیرون می‌زد', []),
 p('fire', 'آتیش گرفته بود و دود بلند شد', []),
 p('fire', 'حریق در ساختمان مسکونی رخ داد', []),
 p('fire', 'کپسول گاز شعله‌ور شد', ['explosion']),

 // --- accident
 p('accident', 'دو تا ماشین به هم زدند', []),
 p('accident', 'موتوری با عابر برخورد کرد', []),
 p('accident', 'ماشین رفت توی جدول', []),
 p('accident', 'بچه از پله‌ها افتاد و آسیب دید', []),
 p('accident', 'تصادف زنجیره‌ای در جاده رخ داد', []),

 // --- harassment
 p('harassment', 'مدام پیام‌های توهین‌آمیز می‌فرستد', []),
 p('harassment', 'سر راهم را می‌گیرد و متلک می‌اندازد', ['public_nuisance']),
 p('harassment', 'گفت اگر پول ندهی کار دستت می‌دهم', ['financial_complaint']),
 p('harassment', 'تهدیدم کرد که آبرویم را می‌برد', []),
 p('harassment', 'مزاحمت تلفنی مکرر داشتم', ['pdf_b25']),

 // --- service
 p('service', 'چراغ کوچه چند شب است روشن نمی‌شود', []),
 p('service', 'لولهٔ آب ترکیده و کوچه را آب گرفته', []),
 p('service', 'زباله‌ها را چند روز است جمع نکرده‌اند', ['environment']),
 p('service', 'وسط خیابان یک چالهٔ بزرگ افتاده', ['pdf_a02']),
 p('service', 'روشنایی معبر خراب است', []),
];

// Hard negatives: incident vocabulary without an asserted occurrence, or
// ordinary activity that resembles one. Predicting `topic` here is a false positive.
export const negatives = [
 ['اگر سرقت شد چه کار کنم؟', 'theft'],
 ['از ترس سرقت دوربین گذاشتم', 'theft'],
 ['دعوا نکردند و مسئله حل شد', 'assault'],
 ['فکر کردم کتک‌کاری است ولی شوخی می‌کردند', 'assault'],
 ['احتمالاً کلاهبرداری بوده، مطمئن نیستم', 'fraud'],
 ['هیچ آتش‌سوزی رخ نداد', 'fire'],
 ['تمرین اطفای حریق برگزار شد', 'fire'],
 ['تصادفی در کار نبود', 'accident'],
 ['مشروبات الکلی نمی‌فروشند', 'business_observation'],
 ['نوشیدنی بدون الکل سرو می‌کردند', 'business_observation'],
 ['مواد غذایی می‌فروختند', 'drug_supply'],
 ['مواد اولیهٔ ساختمانی تخلیه می‌کردند', 'drug_supply'],
 ['مواد مخدر همراهش نبود', 'drug_supply'],
 ['پلاک خودرو کاملاً خوانا بود', 'vehicle_irregularity'],
 ['با چاقو میوه پوست می‌کند', 'weapon_threat'],
 ['کسی را با چاقو تهدید نکرد', 'weapon_threat'],
 ['از عملکرد شهرداری انتقاد کردند', 'pdf_a04'],
 ['با مأموران همکاری کردند', 'pdf_a04'],
 ['تجمع کاملاً مسالمت‌آمیز بود', 'public_nuisance'],
 ['غذا سالم بود و مشکلی نداشت', 'food_safety'],
 ['شاید خشونت خانگی باشد، نمی‌دانم', 'pdf_a15'],
 ['ربایشی اتفاق نیفتاد', 'confinement'],
 ['صدای ترقه بود نه گلوله', 'shooting'],
 ['انفجاری رخ نداده بود', 'explosion'],
 ['فرض کنید آدم‌ربایی رخ دهد', 'pdf_a14'],
 ['تهدید به قتل نشده بود', 'pdf_a16'],
 ['مدرکش جعلی نبود', 'forgery'],
 ['فیلم سینمایی دربارهٔ سرقت مسلحانه دیدم', 'pdf_a09'],
 ['کارگاه بدون حادثه تعطیل شد', 'workplace_accident'],
 ['هیچ دارویی کم نبود', 'supply_issue'],
];
