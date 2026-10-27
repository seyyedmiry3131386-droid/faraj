# Evaluation

Two different things are measured here, and they must not be confused. The figures below are historical results on small, manually authored synthetic sets; they are not an independently collected or representative sample of real reports, and cannot establish real-world accuracy or a reliable production error rate.

## 1. Generalisation — `holdout*.mjs`

Persian phrases written by hand, independently of the classifier's regular
expressions, and labelled from the reporting taxonomy rather than from any
prediction. This is the only measurement that says anything about unseen text.

```sh
node evaluation/run-holdout.mjs           # sets A+B (development)
node evaluation/run-holdout.mjs --dev     # the half used while tuning
node evaluation/run-holdout.mjs --test    # the half held back from tuning
node evaluation/run-holdout-c.mjs         # set C
node evaluation/run-holdout-d.mjs         # set D
```

`recall` is the share of probes whose intended topic (or a narrower topic the
taxonomy says replaces it) was reported. `outOfScopePredictions` counts topics
predicted outside what the probe's labels allow. `controlRejectionRate` is the
share of the hard-negative controls correctly **not** reported — it is a
rejection rate on those controls, not the classifier's precision, which would
need a labelled sample of real reports to state.

**First-contact figures matter more than final ones.** Each set was scored once
before it influenced any rule, and that first figure is what estimates unseen
performance. Scored again after its misses were fixed, a set measures the fix,
not generalisation:

| set | n | scored once, before any fix | after fixing its misses |
| --- | --- | --- | --- |
| A+B | 315 | 14.6% | 98.7% |
| C | 126 | 81.8% | 99.2% |
| D | 63 | 82.5% | 95.2% |
| E | 69 | 85.5% | 100% |
| F | 69 | **92.8%** | 98.6% |
| G | 68 | **92.7%** | 98.5% |
| H | 69 | **88.4%** | 98.6% |

Sets C–G were each written after the preceding round of rule changes, in
registers the earlier sets do not cover: spoken Persian, bureaucratic notation,
SMS spelling with Arabic ي/ك and no zero-width joiners, call-centre dictation,
chat shorthand, and reports relayed on someone else's behalf.

**The mean first-contact score on the three synthetic sets F, G and H was about 91%**, with set scores from 88% to 93%. This is a description of those sets, not an estimate of performance on all unseen Persian or actual reports. The spread illustrates sensitivity to wording and register; independent, representative labelled reports would be needed for an operational estimate.

The rise from 14.6% to ~91% came from two changes that generalise - full verb
morphology with colloquial endings, and a concept-vocabulary layer - not from
memorising probes. The lower first-contact figures of C and D reflect an engine
that had only phrase rules at the time.

**What the pattern means.** Each new set finds some vocabulary the engine has not met; fixing it lifts that set's score, but the next synthetic set finds more misses. These small sets do not establish a performance ceiling, prove 95% accuracy, or replace evaluation on real reports.

Every set currently rejects 100% of its hard-negative controls.

## Precision

`controlRejectionRate` is the share of the hard-negative controls correctly
**not** reported. It is a rejection rate on those controls, not the classifier's
precision: stating precision would need a labelled sample of real reports, which
this project does not have. `outOfScopePredictions` counts topics predicted
outside what a probe's labels allow, which is the closest thing here to a
false-positive count on positive text.

## 2. Compositional regression — `run-million.mjs`

A template-driven software regression over the deployed classification,
preparation, question-selection and review-gate functions. It is **not** a
benchmark, a training corpus, a held-out test set, or evidence of real-world
accuracy: its narratives are built from the same seed phrases the rules were
written against, so a high pass rate means nothing changed, not that the engine
is accurate.

```sh
node evaluation/run-million.mjs --count 5000000 --novice 200000 --out /abs/path --only 1,2,3
node evaluation/run-million.mjs --count 5000000 --novice 200000 --out /abs/path --only 4,5,novice
node evaluation/merge-results.mjs /abs/path
python evaluation/audit-corpus.py /abs/path
```

`--only` splits the shards across processes; each shard draws from its own
deterministic stream, so the split changes nothing about what is generated.
`merge-results.mjs` sums the partial summaries. Outputs belong outside the
repository.

Six gzip JSONL shards are streamed. Five carry narratives with one to five
expected topics. The sixth is the **novice shard**: one record per simulated
inexperienced reporter — what they typed when stuck, the answers the guided
questions collected, and the narrative the browser composed from them. It
checks that the stuck opening is recognised for the right reason, that the
composed narrative classifies to exactly the topic its answers carry, that
every composed sentence traces back to an answer, that a skipped question
leaves nothing behind, and that an answered fact is not still reported missing.
The optional answer banks are verified to be topic-neutral at start-up, so the
expected label of a composed narrative is exactly what its opening answer
carries.

`seeds.mjs` holds 126 independently authored positive phrases covering all 63
concrete topics plus 14 negation, uncertainty, hypothetical and criticism
controls. `novice-seeds.mjs` holds the stuck openings with their expected
diagnosis and the interview answer banks. These labels are fixed inputs;
predictions are never used as ground truth.

The run records the generation seed, source hashes, per-topic counts, unique
narrative count, duration, per-shard record counts and every failure. Failed
cases are never excluded. `audit-corpus.py` independently rereads all
artifacts, verifies gzip CRC/hashes, record counts, labels, grounding, source
hashes and uniqueness.

## What neither measurement covers

Those two measurements do not cover speech recognition, browser usability,
downstream intake, concurrency, live model responses, or accuracy on real reports.
Separate limited real-model/load tests are documented in [LOAD_REPORT.fa.md](LOAD_REPORT.fa.md).
No model weights are trained; the research architecture in `models/` remains untrained.

For repeatable opt-in load tests of an already running service, use
`npm run eval:load -- --help`. Aggregate status and latency are printed, without
logging audio, narratives, replies or tokens. Remote targets require explicit
permission and `--allow-remote`. Run only against systems you own or administer.

Scope is voluntary factual incident reporting. The generators contain no
identity dossiers, real names, sensitive-belief profiling, political-affiliation
tracking, or enforcement recommendations.


## مجموعهٔ I — موضوع‌های افزوده از سند نیازمندی‌ها

۲۵ نمونه و ۱۶ کنترل منفی برای هفت موضوع تازه، با واژگانی که در seedها، قواعد و تست‌ها نیامده است.

| | بار اول (پیش از هر اصلاح) | پس از اصلاح شکست‌ها |
| --- | --- | --- |
| بازخوانی | **۸۸٪** (۲۲ از ۲۵) | ۱۰۰٪ |
| رد کنترل‌های منفی | ۹۳٫۷۵٪ (۱ خطا) | ۱۰۰٪ |
| برچسب خارج از دامنه | ۱ | ۰ |

شکست‌های بار اول و آنچه اصلاح شد:

- «هواپیمای بدون سرنشین» را نگهبانِ «بدون» رد می‌کرد (همان لایه‌ای که «پرواز بدون تأخیر» را می‌گیرد) → «سرنشین» به فهرست استثناها اضافه شد.
- «سود ماهانهٔ تضمینی» تشخیص داده نمی‌شد؛ فقط «سود تضمینی» چسبیده در واژگان بود.
- «به دوربین‌ها دسترسی گرفته بودند» به‌دلیل مرز واژه در انتهای فعل رد می‌شد → به لایهٔ عبارتی منتقل شد.
- «سیم‌کارت به نام خودم است» به‌اشتباه سوءاستفاده از هویت خوانده می‌شد → «خودم» استثنا شد.
- «برد و باخت» فعل سرقت را فعال می‌کرد → اصطلاح قمار از فعل «بردن» جدا شد.

عدد **۸۸٪** سنجش تعمیم این واژگان است؛ عدد ۱۰۰٪ پس از اصلاح، دیگر تعمیم نیست و نباید به‌جای آن استناد شود.

## مجموعهٔ J — تفکیک سرقت و موضوع‌های بازرسی و حفاظت

۲۰ نمونه و ۱۰ کنترل منفی برای سرقت از منزل، سرقت خودرو، ارتشا، اختلاس، ترک فعل، شبکه‌سازی و سوءاستفاده از جایگاه شغلی.

| | بار اول | پس از اصلاح |
| --- | --- | --- |
| بازخوانی | **۷۰٪** (۱۴ از ۲۰) | ۱۰۰٪ |
| رد کنترل‌های منفی | ۹۰٪ (۱ خطا) | ۱۰۰٪ |

شکست‌های بار اول:

- «پراید سفیدم را … دزدیدند» و «موتورسیکلتم … ربوده شد»: خودرو به‌عنوان مفعول و فعل مجهول در قواعد نبود.
- «قفل را شکسته‌اند و لپ‌تاپ نیست»: سرقتی که فقط با «نیست» گفته می‌شود.
- «مأمور … پول خواست تا کاری نکند»: رشوه بدون واژهٔ «رشوه»؛ و «نکند» در جملهٔ هدف، کل گزارش را نفی‌شده نشان می‌داد.
- «با سوءاستفاده از سمتش» و «از موقعیت شغلی‌اش در بانک سوءاستفاده کرد»: ضمیر متصل و فاصلهٔ بیشتر میان واژه‌ها.
- خطای کنترل: «کارگاه شبکه‌سازی کامپیوتری» فساد خوانده شد؛ «شبکه‌سازی» حالا فقط در بافت سازمانی شمرده می‌شود.

دو خطای مثبت قدیمی هم حین این کار پیدا و رفع شد: «کیفش را **برد**اشت» (فعل «برد» مرز واژه نداشت) و «کیفم را به خانه **بردم**» (کار خود گزارش‌دهنده سرقت خوانده می‌شد).

**قاعدهٔ امتیازدهی:** برچسبی که برچسب نمونه را صریحاً «جایگزین» می‌کند (مثلاً `vehicle_theft` برای `theft`) درست شمرده می‌شود.
برای عادلانه ماندن، همین قاعده در کنترل‌های منفی هم اعمال می‌شود: اگر کنترلی با برچسب زیرمجموعه گزارش شود، خطا است.
