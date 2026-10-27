# راوی — دستیار ثبت گزارش
دستیار فارسی ثبت گزارش با پیش‌نویس مرورگر و، در استقرار Node، دریافت مرکزی اختیاری و کارتابل مسئولان. ثبت در این سامانه به معنی ارسال به سامانهٔ رسمی دیگری نیست.

برای پیش‌نمایش محلی: `npm ci`، سپس `npm run dev`. پیش‌نمایش فقط ذخیرهٔ مرورگری دارد و مرکز یا احراز بله را فعال نمی‌کند. `npm test` رگرسیون نرم‌افزاری، `npm run test:stt` آزمون سرویس گفتار و `npm run build` بررسی نحو و ساخت Worker هستند؛ مدل واقعی و دستگاه واقعی جداگانه آزموده می‌شوند. آزمون مرورگر ترتیب و پیش‌نویس `npm run test:ui:order` به Chromium و سرور توسعه نیاز دارد. بسته‌های سرور در `package-lock.json` قفل شده‌اند. جزئیات نتایج، پیش‌نیازها و محدودیت‌های آخرین اجرا در [`evaluation/CENTRAL_TEST_REPORT.fa.md`](evaluation/CENTRAL_TEST_REPORT.fa.md) و [`evaluation/LOAD_REPORT.fa.md`](evaluation/LOAD_REPORT.fa.md) آمده‌اند.

شرح/صوت ← تحلیل و بازبینی ← پرسش‌های مرتبط ← پیوست ← تأیید ← ذخیره. پیش‌نویس و فایل‌ها در IndexedDB همین مرورگر می‌مانند؛ در حالت مرکزی، پس از تأیید و احراز بله، نسخهٔ گزارش و حداکثر ۱۰ فایل با مجموع ۱۰۰ MiB نیز به سرور ارسال می‌شود. راهنماهای اصلی: **[راهنمای صفر تا صد نصب روی سرور](SERVER_README.fa.md)**، [جزئیات استقرار و کارتابل](deploy/README.fa.md)، [مینی‌اپ بله](BALE_MINIAPP.fa.md) و [گزارش اندازه‌گیری مدل‌ها](evaluation/LOAD_REPORT.fa.md). این کد هنوز به‌جای استقرار و پذیرش عملیاتی مستقل نیست.

## موتور فارسی داخل مرورگر

طبقه‌بندی، راهنمای گام‌به‌گام و تشخیص کمبود اطلاعات کاملاً در مرورگر انجام می‌شوند و به هیچ کلید API، سرور یا اینترنتی نیاز ندارند.
اجزا: `public/persian-normalize.js` (یکسان‌سازی املایی با نگاشت اندیس، تا نقل‌قول‌ها عیناً در متن اصلی بمانند)،
`public/lexicon.js` (صرف فعل، حالت محاوره‌ای و ضمایر متصل)، `public/core-rules.js`، `public/numbered-topics.js`،
`public/extended-bank.js` و `public/incident-language.js` (خانواده‌های عبارتی ۷۰ موضوع)، و `public/guidance.js`.

سه لایهٔ فیلتر جلوی گزارش‌شدنِ چیزی که رخ نداده را می‌گیرند: نفی (`نبود`، `رخ نداد`، `نمی‌فروشد`)، تردید و فرض
(`شاید`، `فرض کنید`، `اگر … چه کنیم؟`)، و قاب‌بندی غیرواقعی (فیلم، مانور، بیمه، «از ترس»). فعل مثبت هرگز با «ن» چسبیده مطابقت نمی‌کند،
بنابراین «ندزدیدند» سرقت ثبت نمی‌شود.

## راهنمای کاربر ناآگاه

اگر کاربر بنویسد «نمی‌دانم چه بنویسم»، سامانه گام‌به‌گام با پرسش‌های ساده روایت را از او می‌گیرد و شرح گزارش را از
پاسخ‌های خودش می‌سازد. ترتیب مراحل پایه در `public/guidance.js` برای راهنمای محلی و مصاحبهٔ مدل یکسان است:

۱. نحوه اطلاع (`source`) ← ۲. چه کسی این کار را انجام داد (`who`؛ فاعل) ← ۳. چه زمانی (`when`) ← ۴. چه مکانی (`where`) ←
۵. چه چیزی (`result`) ← ۶. چرا (`reason`) ← ۷. چگونه (`method`).

در مسیر مدل، سرور و مرورگر مرحله و پرسش بعدی را کنترل می‌کنند؛ پیشنهاد مدل نمی‌تواند مرحله‌ای را جابه‌جا کند یا زودتر پایان دهد.
در مسیر تکمیلی اطلاعاتی که در شرح اولیه شناسایی شده‌اند تکرار نمی‌شوند؛ در تهیه شرح از ابتدا هر هفت مرحله طی می‌شود.
هر مرحله را می‌توان با «اطلاعات بیشتری درباره این بخش ندارم» رد کرد و در این صورت جزئیات وابسته پرسیده نمی‌شوند. ادامه فقط
وقتی کادری پر شده و گزینه نداشتن اطلاعات فقط وقتی همه کادرهای آن بخش خالی‌اند فعال است؛ انتخاب کلیدواژه نیز پیش می‌رود.
پرسش‌های تکمیلی مرتبط در هر دو مسیر بعد از مراحل پایه می‌آیند؛ مدرک مرحله هشتم پایه نیست.

پاسخ ردشده واقعیت ساختگی به متن اضافه نمی‌کند و وضعیت نامعلوم برای جلوگیری از تکرار حفظ می‌شود. پاک‌سازی همزه فقط به
برچسب‌ها اعمال می‌شود، نه به متن و نقل‌قول کاربر. تشخیص پوشش و وابستگی مبتنی بر قواعد است و به‌دلیل تنوع زبان فارسی
ممکن است خطا کند؛ گزارش نهایی و پیشنهادهای مدل باید توسط گزارش‌دهنده بازبینی شوند.

### موقعیت‌فهمی

راهنما متنی را که کاربر خودش نوشته می‌خواند و **همان را دوباره نمی‌پرسد**. اگر کسی بنویسد «دیشب ساعت ۱۱ در خیابان بهار
موتورم را بردند، قفلش را شکسته بودند»، پرسش‌های «چه شد»، «کِی»، «کجا» و «چگونه» حذف می‌شوند و فقط چیزی پرسیده می‌شود که
در متن او نیست. متن اصلی کاربر هم عیناً در ابتدای شرح نهایی می‌ماند (`finalNarrative`).

پس از مراحل پایه، پرسش‌های تکمیلی مرتبط از دل خود ماجرا بیرون می‌آیند (`FOLLOW_UPS` در `public/guidance.js`):

| شاخه | کِی پرسیده می‌شود |
| --- | --- |
| چند نفر بودند؟ ← ظاهرشان ← می‌شناختیدشان؟ ← چیزی دستشان بود؟ | وقتی شخصی در ماجرا نقش دارد |
| کسی آسیب دید؟ ← کمک پزشکی رسید؟ | ضرب‌وشتم، تصادف، حادثهٔ کار، آتش‌سوزی، انفجار… |
| آیا همچنان ادامه دارد؟ ← آیا قبلاً هم رخ داده است؟ | خدمات شهری، مزاحمت، حبس، آلودگی… |
| وسیلهٔ نقلیه ← مشخصات و پلاک | تصادف، سرقت وسیله، تخلف رانندگی |
| مبلغ ← پول چطور جابه‌جا شد؟ | کلاهبرداری و شکایت مالی |
| بستر (تلگرام، واتساپ، سایت…) | ماجرای اینترنتی |
| کودکی در ماجرا بود؟ | قاچاق، آزار، مواد، خودآزاری |
| آیا فرد دیگری هم این اتفاق را مشاهده کرد؟ ← قبلاً به جایی اطلاع داده‌اید؟ | همهٔ گزارش‌ها / شکایت‌های اداری |

هر شاخه اختیاری است: «نمی‌دانم» یا رد کردن، شاخه‌های وابسته را نیز می‌بندد و وضعیت نامعلوم حفظ می‌شود. پس از طی
مراحل پایه، اگر اطلاعات کافی ثبت شده باشد، دکمهٔ «همین‌قدر کافی است» برای صرف‌نظر از پرسش‌های تکمیلی ظاهر می‌شود.

### اولویت تماس فوری

فوریت از **دو** جا خوانده می‌شود:

- **رفتار** (`URGENT_TOPICS` در `public/guidance.js`) — سرقت، تجاوز، ضرب‌وشتم، تهدید با سلاح، آدم‌ربایی، قاچاق، تیراندازی،
  آتش‌سوزی، انفجار، تصادف، حادثهٔ کار، خودزنی، کشف جسد. این‌ها شمارهٔ تماس را می‌گیرند حتی اگر کاربر ننوشته باشد «الان».
- **لحن** (`public/situation.js`) — «در جریان است»، آسیب، نشت گاز، خطر جانی. این فقط تعیین می‌کند کادر با چه شدتی
  نشان داده شود: `emergency` یا `attention`.

شماره‌ها به‌صورت دکمهٔ `tel:` نمایش داده می‌شوند (روی موبایل یک ضربه)، **حداکثر دو تا**، به ترتیب
۱۱۰ پلیس ← ۱۱۵ اورژانس ← ۱۲۵ آتش‌نشانی ← ۱۲۳ اورژانس اجتماعی. کادر مانع ثبت گزارش نیست و شکایت‌های اداری،
مشکلات خدمات شهری و گران‌فروشی هرگز آن را نمی‌گیرند.

## ورود صوتی بدون کلید API

دیکتهٔ فارسی با موتور تشخیص گفتار خود مرورگر (`public/speech.js`، `fa-IR`) انجام می‌شود: بدون کلید، بدون حساب و بدون درخواست به سرور این سامانه.
**این لزوماً آفلاین نیست:** در کروم و اج این پردازش معمولاً روی سرویس گفتار سازندهٔ مرورگر انجام می‌شود و صفحه نمی‌تواند تشخیص دهد
کدام حالت فعال است؛ رابط کاربری همین را صریح می‌گوید و ادعای ماندن صدا روی دستگاه نمی‌کند. فایرفاکس این موتور را ندارد و پیام روشن می‌گیرد.
تبدیل فایل صوتی به متن به سرویس گفتار تنظیم‌شده نیاز دارد؛ این سرویس می‌تواند روی سرور خودتان باشد. فایل ضبط‌شده در حافظهٔ مرورگر برای پخش، دریافت یا تلاش مجدد باقی می‌ماند، نه لزوماً پس از تازه‌سازی صفحه.

## اتصال به یک سرویس هوش مصنوعی

سامانه مدل محلی و دو ارائه‌دهندهٔ بیرونی را می‌شناسد و هیچ‌کدام اجباری نیستند. بدون مدل یا کلید تنظیم‌شده، تحلیل در مرورگر انجام می‌شود.

```
cp .env.example .env     # سپس اتصال مورد نیاز را تنظیم کنید
npm run dev              # http://localhost:4173
```

| متغیر | اثر |
| --- | --- |
| `LLM_URL` + `LLM_MODEL` | مدل زبانی محلی یا سرور سازگار؛ راهنما در [`llm/README.fa.md`](llm/README.fa.md). |
| `ANTHROPIC_API_KEY` | تحلیل با Claude (`ANTHROPIC_MODEL`، پیش‌فرض `claude-sonnet-4-5`). **تبدیل فایل صوتی به متن ندارد.** |
| `OPENAI_API_KEY` | تحلیل با OpenAI (`OPENAI_MODEL`) به‌علاوهٔ تبدیل صوت (`OPENAI_TRANSCRIBE_MODEL`). |
| `STT_URL` (+`STT_TOKEN`) | **تبدیل صوت با سرویس تنظیم‌شده**، بدون کلید API بیرونی — راهنما در [`stt/README.md`](stt/README.md). بر `OPENAI_API_KEY` مقدم است. |

مدل زبانی محلی بر Anthropic و OpenAI مقدم است؛ بدون آن، اگر هر دو کلید تنظیم شوند Anthropic برای تحلیل و OpenAI برای صوت استفاده می‌شود. `/api/config` این قابلیت‌ها را جدا گزارش می‌کند
(`provider` و `transcription`) تا رابط کاربری دکمهٔ تبدیل صوت را وقتی در دسترس نیست نشان ندهد.

کلید فقط روی سرور خوانده می‌شود و هرگز به مرورگر نمی‌رسد. `.env` در `.gitignore` است. متن خطاهای سرویس بیرونی هم
بازتاب داده نمی‌شود؛ پیام فارسی جایگزین می‌شود تا کلید یا جزئیات حساب از کانال خطا بیرون نرود (آزمون در `provider-tests.mjs`).

**مدل بیرونی تصمیم‌گیرنده نیست.** خروجی‌اش یک پیشنهاد است که در برابر موتور مرورگر بازبینی می‌شود: هر موضوعی که
موتور محلی از متن مستند کرده حفظ می‌شود و مدل نمی‌تواند حذفش کند. اگر سرویس خطا بدهد یا کلید نباشد، تحلیل روی موتور
محلی انجام می‌شود و همین در رابط کاربری نوشته می‌شود.

گزارش آزمون‌های واقعی محدود، بار هم‌زمان، محدودیت‌ها و دستور تکرار در [`evaluation/LOAD_REPORT.fa.md`](evaluation/LOAD_REPORT.fa.md) است. Whisper medium و small آزموده شدند؛ نتیجهٔ مدل زبانی کوچک‌تر به ۸B پیش‌فرض تعمیم ندارد.

## API


Server-side Worker uses `OPENAI_API_KEY` in Sites environment secrets. Never put keys in client code. Optional `OPENAI_MODEL` defaults to `gpt-6-astra`; `OPENAI_TRANSCRIBE_MODEL` defaults to `gpt-transcribe`. Responses API uses a strict schema, factual extraction, and store:false. `/api/config` reports configuration, not account health. Without a key the UI explicitly shows preview mode using simple keyword rules. Microphone capture always uses MediaRecorder independently of config availability; transcription uses the server endpoint. A failed config load is not silently treated as an unconfigured/offline classifier.

Official docs consulted:
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/speech-to-text

## ذخیره و دامنهٔ سامانه

پیش‌نویس، پاسخ‌ها و فایل‌ها در IndexedDB مرورگر هستند؛ پاک‌کردن داده‌های سایت یا عوض‌کردن مرورگر می‌تواند آنها را از بین ببرد. در حالت مرکزی، ثبت نهایی با امضای معتبر بله به پایگاه Node و کارتابل همین پروژه می‌رسد؛ رسید مرکزی فقط شناسهٔ دریافت همین سامانه است. پس از قطع پاسخ، همان کلید ارسال برای بررسی وضعیت و جلوگیری از ثبت دوباره استفاده می‌شود؛ دو ارسال مستقل با کلیدهای متفاوت الزاماً تکراری تشخیص داده نمی‌شوند. در حالت محلی شناسه فقط مرجع مرورگر است. **هیچ ارتباط یا ارسال خودکار به سامانهٔ رسمی دیگر وجود ندارد.**

گزارش‌ها به رویدادهای مشخص محدودند. شناساییِ تقصیر، پروفایل‌سازی و نظارت بر عقیده یا فعالیت مسالمت‌آمیز انجام نمی‌شود. تماس اضطراری فقط لینک به شماره‌گیر دستگاه است؛ برقراری تماس و عملکرد میزبان تضمین‌شده نیست. پیوست‌ها برای تحلیل به مدل فرستاده نمی‌شوند.

## Deployment

دریافت مرکزی و کارتابل فقط در `server.mjs` (Node تک‌فرایندی پشت Nginx و دو مبدأ HTTPS) موجود است. `dev.mjs`، استقرار استاتیک و Worker در `dist/` مرکز ندارند؛ صرفاً مسیر محلی/پیش‌نمایش را ارائه می‌کنند. نصب‌کننده مرکز را عمداً خاموش می‌گذارد. مراحل واقعی DNS، TLS، اسرار، ساخت حساب، پشتیبان، محدودیت‌ها و آزمون پذیرش: [`deploy/README.fa.md`](deploy/README.fa.md).

## سوابق نسخه‌های قبلی

بخش‌های Version 2 تا v18 در ادامه **تاریخی** هستند و اعداد آزمون، نبود کارتابل یا نبود مرورگر در آنها وضعیت همان زمان را توصیف می‌کند، نه وضعیت فعلی. برای امکانات و محدودیت‌های کنونی به ابتدای این سند و راهنمای استقرار رجوع کنید.

## Version 2
Conditional details for time/address (building number, postcode, floor, unit), incident-specific damage/property/payment details, voluntary observed appearance, vehicles with partial plates, and communication channels actually involved in the incident. No search, identity matching, tracking, inference of guilt, or external data collection. Structured details are retained in drafts, review, saved reports and text downloads.
Transcription uses gpt-transcribe with Persian language context; if unavailable (model_not_found only) it falls back to gpt-4o-transcribe. Input uses mono, 128 kbps when supported, noise suppression and echo cancellation. Recorded audio can be retried without re-recording; output remains editable.

## Version 4
Unknown-answer handling is shared by rendering, draft restoration, validation, final summaries and the entity graph. Choosing an unknown answer disables its detail section; older draft values remain recoverable after explicitly reopening details and are excluded from submitted output while hidden. Qualified statements such as an approximate time remain editable.

The Iranian plate picker is adapted from the user-supplied original UI. Twenty templates cover national variants, motorcycle, free-zone and free-text formats. Segmented entry preserves unknown positions, Persian/Arabic/Latin digits and leading zeroes. Different templates retain separate draft values; only the selected visible format is exported. The UI does not verify authenticity, ownership, regional allocation or legal status.

Unclear narratives request a description of observed conduct before selecting detailed incident questions. Bare accusations do not open a personal-data questionnaire. Concrete unauthorized access or disclosure can be reported without inferring motive. The original system's political/religious monitoring and private-identity dossier fields are not part of this implementation.

Verification: 25 Node tests including unknown-answer state transitions, conditional export, template switching, plate completeness and clarification. Browser regression checks cover desktop/mobile layout and final review. The model prototypes in models/ remain untrained architecture designs, separate from the active site's questionnaire catalog.


## Version 5 — four-category question bank

`public/question-bank.js` is the shared routing/AI contract: person, place, event, object. Related main sections require acknowledgement; unknown is valid and every field is optional. Supplemental categories, communication, vehicles and provenance may be skipped. Mixed topics are preserved. The bank is inspectable from the sidebar.

`docs/QUESTION_BANK.fa.md` and `models/question-bank.json` are reproducibly exported with `node scripts/export-question-bank.mjs`. The untrained text model now includes a four-output category head and object entity/relation labels. This is **not training or deployed model inference**. Exact glyph matching for Iranian plates is still blocked by the missing authentic typeface; the original supplied archive has Vazir only.

Original input formats restored: 31 provincial fixed-line prefixes + eight subscriber digits and optional extension; complete/partial domestic mobile and international numbers; 19 social-platform templates with prefix, handle or URL, mismatched-host rejection, repeated contact rows and hidden-field exclusion. Numeric boxes filter letters and normalize Persian/Arabic/ASCII digits; final validation also checks restored drafts. Full-number landline paste preserves the pasted province rather than substituting a previously selected one.

Version 5 verification: 37 Node tests pass. Browser checks cover required/optional sections, unknown-location suppression, numeric entry, landline and social draft recovery, 390px mobile telephone layout, segmented plate entry, evidence transition, final review and local report save. The generated bank can be opened from the sidebar. Production AI/ASR accuracy was not measured; previous upstream requests encountered account-region restrictions. Training is not performed, and no checkpoint is deployed.

## Version 6 — grounded mixed-incident reports

The new original archive and all six PDF pages were reviewed. The shared bank now has 24 incident topics, 31 sections and 187 field definitions, including subtypes and dedicated violence, agency-complaint, environmental, food-safety and consumer-report questions. `docs/ORIGINAL_SYSTEM_COVERAGE.fa.md` records the mapping and exclusions. Political/religious/clothing/peaceful-expression surveillance and identity dossiers are not imported.

`public/extraction.js` validates verbatim values against source evidence and permitted field definitions. The UI fills known values, exposes their source excerpts, accepts removal/correction, and requires reporter review. A local provenance ledger preserves edits and rejections on draft restore and prevents stale automatic answers from surviving a changed narrative. Unknown answers consistently suppress details, validation and saved summaries. Entity relationships, phone/plate segments and select options are never inferred. Distinct event episodes can retain separate evidence spans; a parked vehicle is not linked to a participant automatically. Source-derived main answers no longer reappear after deletion through the legacy known-value merge.

The Responses API configuration migrates to `gpt-6-astra` with low reasoning, structured prefills/episodes and bounded output/timeout. An incomplete response is rejected rather than accepted as a partial analysis. The active model's quality and account access are not verified in this release; prior calls encountered regional restrictions. The preview route remains explicitly rule-based and limited. User API credentials stay in runtime secret storage.

Local untrained text architectures now have configurable 50M/157M/395M sizes; analytic counts and the versioned question-bank contract are updated. No training, pretrained checkpoint, tokenizer or PyTorch runtime is supplied, and no accuracy benefit from architecture size is claimed. The speech prototype and hosted ASR configuration are unchanged.

Verification: 50 software tests; successful static/Worker build and packaged Worker import. Local preview could not be reached by the cloud browser in this environment, so v6 visual/end-to-end browser verification is incomplete. Reports and attachments continue to be stored only in the current browser, with no official intake backend.

## Version 7 — progressive questions and plain Persian copy

The questionnaire now presents one short task with at most three ordinary fields. Plate entry remains one separate visual task. Long entity forms have been replaced by small conditional steps; the narrative, prior values and extraction provenance are available in collapsed summaries. More entities are added one at a time. Known completed steps are skipped during normal forward navigation and remain editable. Drafts preserve the current section, row and step.

Event matching, manual entity labels, repeated source/role selectors and legal subtype selectors are not asked in the main flow. `topicAssignments` are optional internal AI organisation suggestions that require an existing extracted entity plus evidence for the same event; unknown links stay unset and no ownership, identity or guilt is inferred. Legacy detailed values and manually entered links remain readable. Main question copy is curated so its grammar and answer format agree; arbitrary API prompts no longer replace these questions. At most two short, grounded clarification questions can supplement the bank.

The renderer is in `public/flow-view.js`; the page definitions, conditional fields and validation helpers are in `public/question-flow.js`. The generated bank marks `askedInFlow` separately from supported legacy/extracted fields. The full bank has 188 field definitions; these are not displayed at once.

Verification: 67 passing software tests, including tests of the application's actual navigation functions, conditional telephone/plate paths, draft recovery, unknown-vs-keep semantics, generated HTML, and a full mixed-scenario progression to the attachments step. Browser visual verification is not completed: running the preview server with the needed permissions was rejected by the environment's automatic permission controls. No access-control workaround was attempted. Hosted AI accuracy and ASR are unchanged and not claimed as newly verified.


## Version 8 — broader conduct topics and confirmation before questions

39 topics / 46 shared and event sections / 260 field definitions. The new topics separate reported drug consumption from supply, and add resource extraction, financial/property/family disputes, medical service complaints, unsafe driving, passenger complaints, workplace accidents, self-harm concerns, fireworks, sexual violence, specific online calls to harm, and public nuisance. Administrative umbrella terms are mapped to concrete conduct; duplicates are merged. See `docs/TOPIC_COVERAGE.fa.md` for the complete requested-label mapping and scope exclusions.

The cafe regression selects drug_use + drug_supply + assault, extracts the cafe/west-Tehran location and separate episodes, and does not infer official misconduct, religion-based reporting, a particular substance, identity or ownership. Local rules are limited fallbacks; the API schema and instructions share all 39 topics. They do not guarantee correct classification of every wording.

Every fresh analysis opens a required review gate before the questionnaire. At most three extracted facts appear per step, with verbatim source, edit and delete controls; topics are editable. Drafts retain the review page, accepted changes and deletions. Topic/narrative changes require renewed review. Confirmed main answers lead to optional additional details instead of being asked again. Existing evidence/final-review/local-save stages remain in place.

Verification: 82 passing Node tests, including actual analysis entry functions, review pagination, edits/deletions, draft restoration, unknown details, independent topics, false-positive controls, rendering HTML escaping, and a mocked Worker API contract. Build and packaged import graph checks pass. No browser visual test or successful live AI response is claimed for this release. Model prototypes remain untrained; their topic heads follow the regenerated bank.


## Version 9 — one independent topic per eligible numbered PDF paragraph

The six-page source PDF was visually checked: 17 paragraphs in part الف and 27 in part ب, for 44 numbered items. The two numbered section headings and unnumbered checkmark examples are not incident IDs. 23 eligible concrete-incident paragraphs have independent immutable `pdf_aNN` / `pdf_bNN` topic IDs, concise unique Persian labels, original full wording, source part/number/page, a scope contract and dedicated fields. 21 political/religious/demographic/military surveillance paragraphs are excluded from the operational catalog; see `docs/PDF_TOPIC_INDEX.fa.md` for the complete numbered disposition. Source numbering is not compacted after exclusions.

The existing 39 generic topics and draft IDs remain supported (62 total topics, 69 sections, 367 field definitions). Numbered topics are listed separately in the correction dialog, searchable by name, source wording or Persian/Arabic/Latin paragraph number. Full source descriptions stay collapsed in topic correction, the question bank, initial confirmation and detail questions. No priority score or emergency workflow is inferred from the PDF's original headings.

The shared Worker catalog and structured schema include the independent IDs and scope. Conservative preview rules prefer a numbered subtype over its generic template only for the same occurrence; unrelated events survive, with separate grounded prefill clauses. A weapon's absence, scale of hoarding, political motive or criminal affiliation is never inferred from the topic title. Existing initial fact confirmation and short progressive questions remain in place.

Validation: 92 passing Node tests, including numbering/page integrity, independent question schemas, specificity and exclusions, duplicate-episode handling, source disclosure HTML, search and mocked API integration. Build and packaged module graph are checked. No live API success or browser visual verification is claimed. The model architectures remain untrained.

## Version 10 — unified catalog, staff conflicts and a 1B research configuration

The topic correction dialog and question bank now share one Persian alphabetical catalog. PDF-derived topics use the same labels and selection controls as other topics; source IDs, full descriptions and numeric search are retained without separate source headings. No topic IDs or draft values were migrated or merged.

The café scenario now proposes `drug_use`, `drug_supply`, and `pdf_a04` (حمله یا درگیری با کارکنان و مأموران). A reported fight with staff does not require an injury or assert physical violence, guilt or an initiator. Its first question distinguishes verbal, physical and unspecified conflict. Staff presence and reporting an unrelated fight to employees do not trigger this topic. The shared API postprocessor corrects a generic assault proposal when the narrative explicitly establishes the staff relationship. Separate non-staff violence keeps its own topic and evidence; manual topic choices remain authoritative.

`models/configs.py` now defaults the **untrained Python prototype** to `1b`: 1,001,946,980 analytically counted parameters, width 1536, 33 layers, 24 attention heads, FFN 6144 and context 4096. This does not resize the external API model or create trained weights. The deployed Worker still uses the existing OpenAI service and the explicit rules fallback.

The Python prototype has a real Hazm 0.12.1 preprocessing path through `ReportUnderstanding.forward_text`: conservative Persian normalization, tokenization, original-text evidence offsets, explicit frozen-vocabulary loading, padding and context validation. No report-specific vocabulary fitting, silent truncation or fabricated normalized quotations. A trained vocabulary and weights are not included. See `models/DESIGN.fa.md` for setup and remaining training prerequisites.

Validation: 95 passing Node tests and 6 passing Python tests using the installed Hazm package. Tests include the café scenario, staff-presence/negation controls, separate episodes, API correction, unified catalog, source offsets, Persian/Arabic/Latin digits, negation and context overflow. Parameter counts are analytical; PyTorch forward/backward for the 1B configuration and model accuracy have not been evaluated. Browser visual testing and a successful live AI response are not claimed.

## Version 11 — original interface and synthetic training materials

The interface again follows the uploaded original PHP application's centered welcome page, Faraja logo, muted green palette, white cards, compact progress pills and narrow forms. The sidebar/dashboard is replaced with a small internal menu. The existing narrative analysis, confirmation gate, progressive questions, evidence upload and local report storage continue inside that layout. Returning to the welcome screen preserves the active report and its attachments; the primary action resumes it or a saved draft.

`models/data` contains a reproducible 500-subtopic synthetic scenario generator. The generated artifact has 5,000,000 records and 5,746,275,086 raw JSONL bytes (1,972,444,000 narrative-text bytes), in five million-row gzip shards. Shard CRCs, byte counts and hashes were independently rechecked; every generated row passed structural validation, 5,000 records were independently sampled, and no exact narrative hash was duplicated. These are template/composition variants, not five million independently authored or expert-reviewed cases. Shared subtype wording means held-out synthetic splits are not credible real-world accuracy evaluation.

Only the unrestricted GloVe vectors from PersianNER were imported; the academic-only annotated NER corpus was excluded. farsinlp is a discovery index, not a licensed monolithic training corpus. The fixed Hazm vocabulary contains 32,768 entries; 32,655 match source vectors. A 500-way subtopic head brings the 1B research prototype to 1,002,715,480 parameters. The streaming data adapter, partial-supervision masks, lexical initialization and training entry point are included. Full model training, evaluation and serving were not performed: no GPU was available. The active API and speech service are unchanged. See models/DESIGN.fa.md and the dataset's README for limitations and provenance.

Validation: 95 existing Node tests pass. Python tests cover actual Hazm preprocessing, synthetic schema/splits, real PyTorch meta parameter counts, and a small network's lexical initialization and backward update. These software checks do not establish model accuracy. Browser visual validation remains incomplete because the cloud browser cannot reach the local preview in this environment.

## Version 15 — explicit multi-incident coverage

The supplied street narrative now yields five independently evidenced reporting topics: public nuisance; reported possession/supply of drugs; staff threats/resistance; threats with a weapon or sharp object; and defaced plates or unclear vehicle documents. The last two have dedicated question sections. Drug possession does not imply consumption or sale; unclear vehicle documents do not establish forgery or theft. The existing drug topic now explicitly includes possession/storage, and the staff topic includes directly reported threats and resistance, with neutral questions about the actual conduct.

The preview recognizes additional Persian wordings and clause boundaries. Its matched episodes retain verbatim source excerpts and time phrases such as شب گذشته. A conservative completeness check augments fresh API proposals for these five explicit topic families, including empty or single-topic model output. It never modifies a user's manual topic choice, reviewed draft or refusal. A generic threat is removed only if its occurrence is covered by a supported specific topic; unrelated threats and civilian violence remain. The bank now has 64 topics / 71 sections / 377 field definitions. Source paragraph references remain absent from the interface.

Validation: 103 Node tests and 10 Python tests pass. The Node suite includes the exact user narrative, an intentionally incomplete mocked upstream response, 2,600 ordered one-to-five-topic combinations, 243 wording combinations, and negative/uncertain/hypothetical controls. These are controlled synthetic software regressions, not independent model-accuracy evaluation. The requested readiness for 80 million scenarios is not established; no such corpus or full-scale benchmark was run and no new large-model training was performed. Live upstream quality and ASR were not retested. Bank exports and research-model parameter counts were synchronized (1B configuration: 1,002,718,554 parameters, still untrained).


## Version 16 — one-million-case regression and original searchable pickers

Executed 1,000,000 unique synthetic narratives through the actual local analysis, preparation, question-selection and initial review-gate pipeline: all passed the defined checks. Each of the one-to-five-topic groups contains 200,000 cases. The corpus covers 63 concrete topics and 408,593 distinct topic sets, built from 126 independently labelled positive seed phrases and 14 controls. Artifacts were independently reread to verify record counts, gzip CRC, compressed/raw hashes, grounding, source hashes and exact narrative uniqueness. This is controlled template-based regression; context-only variants are included. It is not a million expert-authored cases, a held-out real-world accuracy estimate, upstream API quality testing or model training. Reproduction and limits: `evaluation/README.md`.

Pilot findings fixed: regex relationships no longer span independent sentences; negation/uncertainty and online context are sentence scoped; unrelated peaceful activity does not suppress a separate reported obstruction. Same-occurrence generic duplicates are suppressed for forced-entry threats, recurring extortion/supply, sexual violence and online calls for violence, while independent occurrences survive. Fresh API completion now considers all concrete bank topics with literal evidence, preserving manual choices, reviewed drafts and refusals. All 107 Node tests pass, including every ordered pair; 1,000 corpus samples also passed 2,000 deliberately incomplete mock API proposals. No live upstream calls, ASR changes or trained weights are included.

The welcome page always offers “ثبت گزارش جدید” above the conditional resume action. Starting a replacement requires confirmation that the previous draft and attached evidence will be deleted; cancellation preserves them, and failed draft deletion does not silently reset the report. Old voice retries are cleared with a new report. The facilities menu and region selector are removed. Searchable dropdown styling is copied from the supplied original interface; a native-select adapter preserves existing value/change handlers, numeric/plate/contact validation and draft restoration, and adds search, keyboard navigation and focus handling. Footer text stays unchanged. Build/import consistency and generated shell markup were checked. Interactive browser visual verification was unavailable because the local Playwright browser executable is absent.


## Version 17 — colloquial supermarket report and partial handling

Reproduced the new supermarket narrative against v16: alcohol sales and the handling complaint were absent, the fight had an unclear public label, and the drug match wrongly ended inside فروشگاه. The historical million-case template regression did not cover these natural phrasings; its success must not be presented as real-world accuracy.

A shared, source-offset-preserving phrase-family module adapts the original app's synonym approach for colloquial sale verbs, attached/spaced می, آبجو/ابجو, requested drug purchases and handling failures. Full-word boundaries prevent فروش matching فروشگاه. Explicit purchase intent remains distinct from completed transactions or drug consumption; ordinary flowers, paper, nonalcoholic beer and industrial alcohol do not establish those topics. Negation of handling no longer erases the reported underlying incident. A contact with 110 alone does not establish misconduct or an attack on officers, and an ended fight is not attributed to police unless stated.

The exact narrative now proposes four topics with literal evidence: business_observation, drug_supply, assault and official_complaint. Clear Persian labels expose alcohol service/sales and fights instead of ambiguous venue/bodily-injury labels. The original IDs and existing draft choices remain stable. The channel, partial result and supermarket type are proposed only as literal text spans for initial confirmation; unknown injury, weapon, identities, completed purchase and who ended the fight remain blank. Topic search includes familiar aliases from the original selection catalog. Shared API instructions and completion use the same distinctions.

Validation: 116 Node tests pass, including the exact report with/without newlines and three digit scripts, positive/negative colloquial variants, partial handling, unchanged manual/reviewed drafts and a mocked Worker response. All 24 orders of the four observations under three separators pass (72 compositions), along with the existing broader regressions. The new shared module is packaged for both client and Worker. No live upstream-model accuracy claim, speech change, new model training or rerun of the historical million-case corpus is made.

## v18 — recording and API reliability

Local recording is no longer gated by the config request or key presence. A session owns its stream and recorder; duplicate starts are blocked, pending permission requests can be cancelled, stale stop callbacks cannot write into a new report, and the final audio chunk is flushed before releasing the microphone. Supported browser MIME types retain matching filenames, with device-specific permission/error messages and a separate-tab link in embedded previews. Browser SpeechRecognition is no longer an implicit alternate provider.

The voice panel retains the latest audio in memory for playback, download and retry, including after failed transcription; it does not survive a page reload. A successful retry appends its transcript once. Uploads with valid audio filenames and common generic/mobile MIME types are accepted, while empty and oversized files are rejected. API errors distinguish network, timeout, key, quota, region, model and response failures. Server logs contain only route, fixed error code and upstream status. Keys and raw upstream errors are never returned or logged. `/api/check` makes a minimal Responses request; it verifies text connectivity only, and explicitly reports that audio has not yet been tested. `/api/config` reports configuration, not health.

Validation: 131 tests passed, including 15 new recorder lifecycle, client transport, server upload/error and actual app-flow regressions. Build and source syntax checks passed. Models and runtime secrets were preserved. The official speech-to-text guide confirms the current `gpt-transcribe` language-hint request shape: https://developers.openai.com/api/docs/guides/speech-to-text . Live HTTP verification from the development environment was blocked by a Cloudflare 403 before reaching application routes; no successful real OpenAI transcription or physical-microphone browser test is claimed. No browser executable is available in this environment.


## اجرا داخل مینی‌اپ بله

طبق [مستندات رسمی مینی‌اپ بله](https://docs.bale.ai/miniapp)، مینی‌اپ یک صفحهٔ HTTPS است و `Bale.WebApp` متدهایی مانند `ready`، `expand` و `openLink` دارد؛ متد بومی تضمین‌شده‌ای برای میکروفون، GPS، انتخاب فایل یا شماره‌گیر در آن مستند نشده است. بارگذاری SDK رسمی `https://tapi.bale.ai/miniapp.js` با تشخیص نشانه‌های میزبانی بله پیش از ماژول برنامه آغاز می‌شود؛ اگر دیر برسد یا قطع باشد رابط منتظر آن نمی‌ماند. برای تشخیص پایدار، URL را در @botfather به‌شکل `https://example.com/?via=bale` ثبت کنید؛ حالت عادی مرورگر، SDK شخص ثالث را بارگذاری نمی‌کند. نشانهٔ میزبان و `initDataUnsafe` برای احراز هویت معتبر نیستند؛ در حالت مرکزی، سرور Node امضای `initData` و زمان آن را با توکن همان بازو بررسی می‌کند. این احراز حساب بله است، نه تأیید نام یا هویت حقیقی.

| قابلیت | رفتار در مینی‌اپ |
| --- | --- |
| میکروفون | با زدن دکمهٔ ضبط، `getUserMedia` در همان اقدام کاربر درخواست می‌شود؛ پیش از آن هیچ مجوزی درخواست نمی‌شود. اگر کاربر، WebView، سیاست iframe یا سیستم‌عامل اجازه ندهد، پیام راهنما، انتخاب فایل، ضبط با برنامهٔ گوشی و راه بازکردن مرورگر وجود دارد. صوت ضبط‌شده برای پخش/دریافت و تلاش دوباره در حافظه می‌ماند. |
| موقعیت | فقط با زدن «افزودن موقعیت کنونی» یک درخواست `getCurrentPosition` انجام می‌شود؛ موقعیت به پاسخ موجود افزوده می‌شود و قابل ویرایش است. ممکن است محل کنونی با محل حادثه فرق کند؛ در صورت رد دسترسی، ورود دستی همیشه ممکن است. |
| فایل و دوربین | انتخاب‌گر بومی فایل یا دوربین فقط پس از انتخاب کاربر باز می‌شود و فقط فایل انتخاب‌شده خوانده می‌شود؛ انتخاب‌گر ممکن است در بعضی نسخه‌های میزبان پشتیبانی نشود. حداکثر ۱۰ فایل و ۱۰۰ MiB؛ پیش‌نویس در مرورگر است و در حالت مرکزی فایل‌ها با ثبت نهایی به کارتابل سامانه ارسال می‌شوند. |
| تماس اضطراری | خودِ شماره یک لینک واقعی `tel:` است تا همان ضربهٔ کاربر به شماره‌گیر برسد؛ تماس خودکار انجام نمی‌شود. اگر میزبان آن را مسدود کند، شماره برای ورود دستی، کپی، و بازکردن صفحهٔ تماس در مرورگر باقی می‌ماند. صفحهٔ کمکی فقط ۱۱۰، ۱۱۵، ۱۲۵، ۱۲۳ و ۱۱۲ را می‌پذیرد و برای بازکردن شماره‌گیر یک ضربهٔ جدا لازم دارد. |

**محدودیت مهم:** صفحهٔ وب نمی‌تواند اعطای مجوز سیستم‌عامل، پشتیبانی انتخاب‌گر، یا بازشدن قطعی شماره‌گیر را به میزبان تحمیل کند. در بلهٔ تحت وب، والد iframe نیز باید میکروفون و موقعیت را با `allow` و سیاست مناسب مجاز کند؛ هدر صفحهٔ فرزند نمی‌تواند محدودیت والد را دور بزند. بازکردن مرورگر جدا ممکن است پیش‌نویس و فایل‌ها را منتقل نکند و متن گزارش بدون درخواست صریح در کلیپ‌بورد کپی نمی‌شود. در [`BALE_MINIAPP.fa.md`](BALE_MINIAPP.fa.md) چک‌لیست انتشار و تست دستگاه آمده است.

آزمون خودکار `npm run test:miniapp` میزبان و دستگاه را شبیه‌سازی می‌کند؛ اثبات رفتار یک نسخهٔ واقعی بله، مجوز سیستم یا شماره‌گیر واقعی نیست. قبل از انتشار، Android و نسخه‌های دیگر مدنظر را با خود بله و دستگاه واقعی آزمایش کنید. webhook ربات برای دریافت پیام صوتی یا موقعیت در گفتگو در این پروژه پیاده‌سازی نشده است.


## هوش مصنوعی واقعی روی سرور خودتان

با نصب Ollama و اجرای `llm\setup-windows.bat`، یک مدل زبانی متن‌باز (پیش‌فرض `qwen3:8b`) روی همان سرور گزارش را تحلیل می‌کند؛ سرور پرسش‌های پایه را بر اساس ترتیب ثابت بالا یکی‌یکی ارائه می‌دهد. بدون مدل، سامانه با موتور قاعده‌محور مرورگر کار می‌کند. جزئیات، سخت‌افزار لازم و اندازه‌گیری دقت: [llm/README.fa.md](llm/README.fa.md).
