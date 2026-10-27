// Set I — written for the seven topics added from the requirements document,
// and scored exactly once. No wording is reused from the seeds, the rules or
// the unit tests: the question is whether the new vocabulary generalises or
// only recognises the phrases it was written from.
const p = (must, text, allow = []) => ({ must, text, allow });

export const probes = [
 // drone over a named installation
 p('drone_sighting', 'یک کوادکوپتر چند دقیقه بالای سد پرواز کرد', []),
 p('drone_sighting', 'نزدیک باند فرودگاه یک هواپیمای بدون سرنشین دیدیم', []),
 p('drone_sighting', 'بالای انبار سوخت پالایشگاه یک ریزپرنده می‌چرخید', []),
 // handling goods believed stolen
 p('stolen_goods', 'یک نفر قطعات خودروی مسروقه را نصف قیمت و بدون فاکتور می‌فروشد', ['theft']),
 p('stolen_goods', 'در آن انبار جنس دزدی نگهداری می‌کنند', ['theft']),
 p('stolen_goods', 'مال‌خری موتورهای سرقتی در آن مغازه انجام می‌شود', ['theft']),
 // gambling and betting
 p('gambling', 'یک قمارخانه در طبقهٔ زیرین راه افتاده است', []),
 p('gambling', 'نوجوان‌ها در یک سایت شرط‌بندی فوتبال پول می‌گذارند', []),
 p('gambling', 'شب‌ها آنجا پاسور با پول بازی می‌کنند و برد و باخت دارند', []),
 // investment schemes
 p('investment_fraud', 'شرکتی با سود ماهانهٔ تضمینی از اهالی سرمایه جذب کرده و دفترش بسته شده', ['fraud', 'financial_complaint']),
 p('investment_fraud', 'یک طرح پانزی برای خرید ارز دیجیتال راه انداخته بودند', ['fraud']),
 p('investment_fraud', 'پیش‌فروش صوری ویلا انجام می‌دادند و اصل پول مردم را پس ندادند', ['fraud', 'pdf_b23', 'property_dispute']),
 // attacks on accounts, devices and systems
 p('cyber_attack', 'سامانهٔ شرکت با باج‌افزار قفل شد و همهٔ پرونده‌ها پاک شد', ['data_breach']),
 p('cyber_attack', 'یک لینک فرستادند و بعد از آن اکانتم رفت', ['data_breach', 'fraud']),
 p('cyber_attack', 'به دوربین‌های مداربستهٔ ساختمان دسترسی گرفته بودند', ['data_breach']),
 // someone else's account, SIM or papers
 p('identity_misuse', 'حسابش را اجاره داده بود و پول کلاهبرداری از آن رد می‌شد', ['fraud', 'financial_complaint']),
 p('identity_misuse', 'یک سیم‌کارت به نام من ثبت شده که خودم نگرفته‌ام', ['forgery', 'pdf_b24']),
 p('identity_misuse', 'با کارت ملی برادرم بدون اطلاع او حساب باز کرده بودند', ['forgery', 'pdf_b24', 'impersonation']),
 // channels teaching how to make dangerous things
 p('dangerous_instruction', 'یک گروه تلگرامی آموزش ساخت مواد منفجره منتشر می‌کند', ['pdf_a13', 'online_harm', 'explosion']),
 p('dangerous_instruction', 'در یک وب‌سایت دستورالعمل ساخت سم گذاشته‌اند', ['hazardous_supply']),
 // the vocabulary added to existing topics
 p('pdf_a15', 'سالمندآزاری یک پیرمرد در خانهٔ فرزندش گزارش شد', ['assault', 'family_dispute']),
 p('vehicle_irregularity', 'شماره شاسی موتورسیکلت را دستکاری کرده بودند', ['forgery']),
 p('pdf_a05', 'خرابکاری عمدی در خط لولهٔ گاز شهرک انجام شده بود', ['damage', 'service', 'explosion']),
 p('theft', 'دیشب به انبار مغازه دستبرد زدند', ['pdf_b16']),
 p('accident', 'یک سمند به عابر زد و بدون توقف رفت', []),
];

export const negatives = [
 ['بچه‌ها در پارک با پهپاد اسباب‌بازی بازی می‌کردند', 'drone_sighting'],
 ['پرواز نمایشی پهپاد در نمایشگاه هوایی انجام شد', 'drone_sighting'],
 ['همهٔ اجناس مغازه فاکتور رسمی داشت', 'stolen_goods'],
 ['هیچ مال مسروقه‌ای پیدا نشد', 'stolen_goods'],
 ['در آن جلسه فقط شطرنج بازی می‌کردند', 'gambling'],
 ['قماری در کار نبود', 'gambling'],
 ['سود سپردهٔ بانکی‌ام را دریافت کردم', 'investment_fraud'],
 ['کلاس آموزش سرمایه‌گذاری امن برگزار شد', 'investment_fraud'],
 ['آنتی‌ویروس سامانه به‌روزرسانی شد', 'cyber_attack'],
 ['هیچ نفوذی به سامانه رخ نداد', 'cyber_attack'],
 ['حساب بانکی‌ام را خودم افتتاح کردم', 'identity_misuse'],
 ['سیم‌کارت به نام خودم است', 'identity_misuse'],
 ['دورهٔ آموزش ایمنی مواد شیمیایی برگزار شد', 'dangerous_instruction'],
 ['فیلمی دربارهٔ خنثی‌سازی بمب دیدم', 'dangerous_instruction'],
 ['پلاک و شماره شاسی هر دو سالم بود', 'vehicle_irregularity'],
 ['هیچ دستبردی به انبار نزده بودند', 'theft'],
];
