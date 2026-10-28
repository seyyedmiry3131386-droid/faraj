# راهنمای گام‌به‌گام استقرار راوی روی سرور

این راهنما از یک سرور تازه تا دریافت آزمایشی گزارش را توضیح می‌دهد. نمونه‌ها برای **Ubuntu 22.04/24.04، systemd، یک سرور و یک فرایند Node** هستند. دامنه گزارش‌دهندگان `frgserver.ir` و کارتابل `admin.frgserver.ir` فرض شده‌اند؛ اگر نشانی واقعی متفاوت است، در همه جا آن را هماهنگ تغییر دهید.

> **وضعیت:** این نصب‌کننده، گواهی، DNS و مینی‌اپ روی سرور و گوشی واقعی شما آزمایش نشده‌اند. آزمون‌های خودکار و پیش‌نمایش جایگزین ممیزی مستقل امنیتی، آزمون بار واقعی و پذیرش عملیاتی نیستند. تا تکمیل بخش آخر فقط اطلاعات ساختگی وارد کنید. گزارش‌های مرکزی در کارتابل همین پروژه دریافت می‌شوند.

## نقشه راه

۱. آماده‌سازی سرور و SSH ← ۲. تنظیم و بررسی DNS ← ۳. دریافت کد و نصب Node ← ۴. نصب راوی و Nginx ← ۵. گواهی HTTPS ← ۶. کلیدها و حساب مسئولان ← ۷. اتصال بله و آزمایش ثبت ← ۸. پشتیبان، مدل‌ها و پذیرش.

### قبل از شروع چه چیزهایی لازم است؟

- سرور لینوکس با دسترسی مدیریتی `sudo`، IP عمومی ثابت، دیسک محلی قابل اطمینان و اتصال اینترنت برای نصب وابستگی‌ها و صدور گواهی. فضای مدل‌ها، گزارش‌ها، فایل‌های کاربران و پشتیبان را جداگانه برآورد و پایش کنید.
- کنترل DNS دامنه و یک نام HTTPS **جداگانه** برای کارتابل؛ مسیر `/admin` روی همان مبدأ جایگزین این جداسازی نیست.
- بازوی بله، توکن همان بازو، گوشی با بله، حداقل یک حساب مدیر و برای هر مسئول دیگر حساب جدا و برنامه احراز هویت TOTP.
- Node.js نسخه **۲۲ یا جدیدتر** و npm سازگار در سیستم؛ نمونهٔ بسته SQLite همراه پروژه برای Linux x64/arm64 بررسی شده است. سازگاری معماری و نسخه سیستم را خودتان در نصب واقعی بسنجید.
- برای سرور حدود ۸ گیگابایت RAM، ابتدا سامانه را **بدون مدل** بالا بیاورید. مدل زبانی ۸B و Whisper ممکن است هم‌زمان در حافظه جا نشوند؛ کیفیت و سرعت و ظرفیت باید روی همان سرور سنجیده شوند.

## ۱. آماده‌سازی و محافظت از دسترسی

روی سرور با حساب مدیریتی وارد شوید و ابتدا از اطلاعات و تنظیمات موجود نسخه پشتیبان بگیرید. از سرور تازه یا محیط آزمایشی استفاده کنید؛ نصب‌کننده در صورت وجود مسیرهای نصب قبلی متوقف می‌شود و برای ارتقای خودکار نیست.

```bash
sudo apt update
sudo apt install -y git curl ca-certificates dnsutils openssl
uname -m
cat /etc/os-release
```

اگر فایروال دارید، پیش از تغییر آن مطمئن شوید پورت SSH فعلی و کنسول بازیابی باز می‌مانند؛ در غیر این صورت ممکن است ارتباطتان قطع شود. ورودی ۸۰ و ۴۴۳ برای صدور گواهی HTTP و HTTPS لازم است. پورت‌های داخلی ۴۱۷۳، ۸۷۶۵ و ۱۱۴۳۴ را عمومی نکنید. دسترسی کارتابل را در صورت امکان به VPN یا IPهای مجاز محدود کنید. نمونه Nginx به‌تنهایی VPN و سیاست فایروال را برقرار نمی‌کند.

## ۲. اتصال دامنه و بررسی امکان زیردامنه

در پنل DNS دامنه، با IP واقعی سرور:

| نوع | نام | مقصد |
| --- | --- | --- |
| `A` | `@` | IP عمومی IPv4 سرور |
| `A` | `admin` | همان IP یا IP پراکسی مورد تأیید |
| `A` | `www` | اختیاری؛ فقط اگر می‌خواهید از آن استفاده کنید |

پشتیبانی از زیردامنه یعنی توانایی ساخت رکورد `admin` در DNS؛ به ساخت دامنه تازه نیاز نیست. بعد از ذخیره، از شبکه بیرونی و سرور بررسی کنید:

```bash
dig +short A frgserver.ir
dig +short A admin.frgserver.ir
dig +short AAAA frgserver.ir
dig +short AAAA admin.frgserver.ir
```

رکوردهای A باید به سرور درست برسند. اگر AAAA وجود دارد، IPv6 و مسیریابی و فایروال آن نیز باید واقعاً کار کنند؛ رکورد اشتباه را با مسئول DNS اصلاح کنید. انتشار ممکن است زمان ببرد. اگر نمی‌توانید `admin` بسازید، از مدیر DNS یک نام HTTPS جدا مثل `staff.example.org` بگیرید و نام ادمین را در `/etc/nginx/sites-available/ravi` و `ADMIN_ORIGIN` با آن جایگزین کنید. نتیجه عمومی را با ابزار دیگری هم بررسی کنید؛ صرف وجود رکورد در پنل، اثبات انتشار نیست.

## ۳. دریافت کد و نصب Node

کد باید از مخزن و شاخه مورد تأیید شما دریافت شود. نمونه برای شاخه فعلی این پروژه:

```bash
cd ~
git clone --branch arena/082da376-faraj --single-branch https://github.com/seyyedmiry3131386-droid/faraj.git
cd ~/faraj/ravi-frgserver
```

اگر مخزن خصوصی است، دسترسی Git را طبق سیاست سازمان روی سرور تنظیم کنید؛ رمز یا توکن را در این راهنما، چت یا فایل عمومی وارد نکنید. اگر به جای Git بسته تأییدشده را منتقل کرده‌اید، وارد پوشه‌ای شوید که `deploy/install.sh` و `package-lock.json` را دارد.

```bash
/usr/bin/node --version
npm --version
```

نسخه Node باید ۲۲ یا جدیدتر باشد. نسخه پیش‌فرض مخزن Ubuntu ممکن است قدیمی باشد. آن را از منبع معتبر و مورد تأیید سازمان طوری نصب کنید که **`/usr/bin/node`** و `npm` سازگار در دسترس باشند. برای نمونه، اگر سازمان [مخزن NodeSource](https://github.com/nodesource/distributions) را تأیید کرده است، پس از بررسی پشتیبانی سیستم و بازبینی اسکریپت شخص ثالث می‌توانید از روش زیر استفاده کنید:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o "$HOME/nodesource-setup-22.sh"
less "$HOME/nodesource-setup-22.sh"  # پیش از اجرای مدیریتی بازبینی کنید
sudo bash "$HOME/nodesource-setup-22.sh"
sudo apt install -y nodejs
/usr/bin/node --version
npm --version
```

این مخزن شخص ثالث و نصب آن روی سرور شما در این محیط آزموده نشده‌اند؛ در صورت استفاده از منبع سازمانی، دستور سازگار همان منبع را جایگزین کنید. بسته راوی خودش Node، کلید خارجی یا مدل را همراه ندارد.

## ۴. نصب اولیه برنامه

از همان پوشه پروژه:

```bash
sudo bash deploy/install.sh
sudo systemctl status ravi --no-pager
sudo nginx -t
curl -fsS http://127.0.0.1:4173/healthz
```

اسکریپت بسته‌های لازم، کاربر سیستمی `ravi-web`، برنامه در `/opt/ravi`، سرویس `ravi.service`، تنظیمات Nginx و `/etc/ravi.env` با دسترسی محدود را می‌سازد. اگر نصب قبلی در یکی از مسیرها وجود داشته باشد، متوقف می‌شود و آن را بازنویسی نمی‌کند؛ در صورت نصب ناقص، ابتدا وضعیت را بررسی کنید و بدون پشتیبان مسیرها را حذف نکنید. Node فقط روی loopback است و Nginx پراکسی مورد اعتماد آن است.

**مهم:** نصب جدید با `CENTRAL_ENABLED=0` شروع می‌شود. در این حالت ثبت فقط در مرورگر است؛ داده به کارتابل نمی‌رسد. `npm run dev` نیز پیش‌نمایش محلی است و سرویس مرکزی تولید نیست. برای سرور نصب‌شده، تنظیمات را در `/etc/ravi.env` انجام دهید؛ `server.mjs` فایل `.env` پروژه را خودکار بارگذاری نمی‌کند.

## ۵. HTTPS معتبر

بعد از انتشار DNS، در صورت لزوم نام کارتابل را در فایل Nginx نصب‌شده تغییر دهید و بررسی کنید:

```bash
sudoedit /etc/nginx/sites-available/ravi
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d frgserver.ir -d admin.frgserver.ir --redirect
```

برای نام ادمین متفاوت همان نام واقعی را در هر دو فایل و دستور استفاده کنید. `www` را فقط اگر DNS آن درست است و به گواهی نیاز دارد با `-d www.frgserver.ir` اضافه کنید. پیام‌ها و توافق‌نامه Certbot را بخوانید؛ خطا را نادیده نگیرید. هر دو نشانی را در مرورگر بیرونی بدون هشدار گواهی باز و تمدید را آزمایش کنید:

```bash
sudo certbot renew --dry-run
sudo systemctl status certbot.timer --no-pager
```

این دستورها آزمون HTTPS واقعی در محیط شما هستند، نه چیزی که قبلاً در این پروژه تأیید شده باشد. HTTP را برای ارسال گزارش و ورود مسئول استفاده نکنید.

## ۶. ساخت رازها و حساب‌های جداگانه

دستورات زیر فقط برای **نصب جدید** هستند و از بازنویسی فایل‌های راز موجود جلوگیری می‌کنند. آن‌ها را در پایانه مطمئن اجرا کنید؛ توکن بازو، کلید داده، رمز حساب و URI برنامه TOTP را در چت، Git، log، اسکرین‌شات یا آرگومان دستور نگذارید.

```bash
sudo install -d -o root -g ravi-web -m 750 /etc/ravi
sudo bash -c 'set -euo pipefail; umask 027; set -o noclobber; openssl rand -base64 32 > /etc/ravi/data.key'
sudo bash -c 'set -euo pipefail; umask 027; set -o noclobber; read -rs -p "Bale bot token: " token; echo >&2; printf "%s\n" "$token" > /etc/ravi/bale.token; unset token'
sudo chown root:ravi-web /etc/ravi/data.key /etc/ravi/bale.token
sudo chmod 640 /etc/ravi/data.key /etc/ravi/bale.token
sudoedit /etc/ravi.env
```

در فایل تنظیمات، مقادیر زیر را با نشانی‌های واقعی قرار دهید. تا تکمیل آزمون‌ها `CENTRAL_ENABLED` را صفر نگه دارید:

```ini
APP_ORIGIN=https://frgserver.ir
ADMIN_ORIGIN=https://admin.frgserver.ir
CENTRAL_ENABLED=0
CENTRAL_DATA_DIR=/var/lib/ravi
CENTRAL_DATA_KEY_FILE=/etc/ravi/data.key
BALE_BOT_TOKEN_FILE=/etc/ravi/bale.token
```

فایل `/etc/ravi.env` باید متعلق به root و `0600` باشد. کلید داده را جدا از پشتیبان در مخزن اسرار امن نگه دارید؛ گم‌کردن یا تغییر آن باعث غیرقابل‌خواندن‌شدن گزارش‌ها و اطلاعات TOTP موجود می‌شود و ابزار چرخش خودکار کلید وجود ندارد. توکن باید متعلق به **همان** بازویی باشد که مینی‌اپ را باز می‌کند. ساعت سرور و گوشی TOTP را همگام کنید.

سرویس `ravi` با `StateDirectory` مسیر داده را ساخته است. برای هر مسئول حساب مجزا بسازید؛ نام‌های زیر فقط نمونه‌اند:

```bash
sudo -u ravi-web env CENTRAL_DATA_DIR=/var/lib/ravi CENTRAL_DATA_KEY_FILE=/etc/ravi/data.key /usr/bin/node /opt/ravi/staff-cli.mjs add admin.one admin
sudo -u ravi-web env CENTRAL_DATA_DIR=/var/lib/ravi CENTRAL_DATA_KEY_FILE=/etc/ravi/data.key /usr/bin/node /opt/ravi/staff-cli.mjs add reviewer.one reviewer
```

ابزار رمز را دو بار بدون نمایش دریافت می‌کند و یک URI محرمانه TOTP نمایش می‌دهد. آن را **فقط** در برنامه احراز هویت همان فرد ثبت کنید. نام کاربری ۳ تا ۶۴ کاراکتر کوچک لاتین و رمز حداقل ۱۴ کاراکتر است. `reviewer` همه گزارش‌ها را می‌بیند؛ `admin` علاوه بر آن log دسترسی را هم می‌بیند. ارجاع یا تفکیک پرونده‌ها بر اساس واحد هنوز وجود ندارد.

برای مدیریت حساب، در همان دستور به‌جای بخش `add ...` یکی از `list`، `reset username` یا `disable username` را بگذارید. `reset` رمز و TOTP تازه می‌دهد و نشست‌ها را باطل می‌کند؛ `disable` نیز دسترسی و نشست‌ها را قطع می‌کند. جزئیات در [راهنمای کارتابل](deploy/README.fa.md) است.

## ۷. فعال‌سازی آزمایشی مرکز و مینی‌اپ بله

بعد از آماده‌شدن HTTPS، کلید، حساب مسئول و پشتیبان آزمایشی، در `/etc/ravi.env` مقدار `CENTRAL_ENABLED=1` بگذارید و سرویس را راه‌اندازی مجدد کنید:

```bash
sudo systemctl restart ravi
sudo systemctl status ravi --no-pager
curl -fsS https://frgserver.ir/api/config
```

در خروجی پیکربندی باید `"central":true` ببینید. صفحه `https://admin.frgserver.ir/` باید ورود کارتابل را نشان دهد. اگر نام‌ها متفاوت‌اند نشانی‌های واقعی را به کار ببرید. بازکردن سایت به‌تنهایی سلامت دریافت را اثبات نمی‌کند.

در تنظیمات بازو و مطابق [مستندات رسمی مینی‌اپ بله](https://docs.bale.ai/miniapp)، URL امن `https://frgserver.ir/?via=bale` را برای مینی‌اپ/دکمه مناسب تنظیم کنید. `via=bale` فقط نشانه رابط است؛ هویت با امضای `initData` خام و توکن همان بازو در سرور بررسی می‌شود. شناسه حساب بله تأیید نام واقعی یا تلفن نیست.

با **گوشی واقعی، بازوی واقعی و داده ساختگی**: مینی‌اپ را باز کنید، یک گزارش و فایل آزمایشی بفرستید، رسید `RV-…` را نگه دارید، با حساب و TOTP وارد کارتابل شوید و متن، شناسه حساب و دانلود فایل را بررسی کنید. اتصال نامعتبر/منقضی، قطع شبکه و «بررسی وضعیت» را هم امتحان کنید. ثبت بدون امضای معتبر در مرکز باید رد شود. به [چک‌لیست بله](BALE_MINIAPP.fa.md) برای میکروفون، انتخاب فایل، موقعیت و شماره‌گیر رجوع کنید؛ برای تست، تماس اضطراری واقعی برقرار نکنید.

## ۸. پشتیبان و بازیابی

قبل از پذیرش اطلاعات واقعی، پشتیبان زمان‌بندی‌شده و یک نسخه خارج از سرور و همچنین بازیابی روی محیط آزمایشی را برقرار کنید. مثال ساخت snapshot جدید:

```bash
sudo install -d -o ravi-web -g ravi-web -m 700 /var/backups/ravi
BACKUP="/var/backups/ravi/$(date -u +%Y%m%dT%H%M%SZ)"
sudo -u ravi-web env CENTRAL_DATA_DIR=/var/lib/ravi /usr/bin/node /opt/ravi/backup-cli.mjs "$BACKUP"
```

مقصد باید وجود نداشته باشد و بیرون داده زنده باشد. پشتیبان کلید داده را شامل نمی‌شود؛ کلید را جداگانه و امن نگه دارید. حساب‌ها و گزارش‌های بعد از زمان snapshot در آن نیستند. پیش از بازیابی، سرویس را متوقف، داده فعلی را حفظ و بازیابی و دسترسی حساب‌ها را آزمایش کنید. مراحل و هشدارهای کامل در [بخش پشتیبان و بازیابی](deploy/README.fa.md#۶-پشتیبان-و-بازیابی) آمده‌اند. پشتیبان‌گیری خودکار، هشدار خطا و بازیابی روی سرور شما هنوز پیاده/تأیید عملیاتی نشده‌اند.

## ۹. مدل زبانی و گفتار — اختیاری

بدون مدل، تحلیل محلی و راهنمای مبتنی بر قواعد کار می‌کنند؛ تبدیل **فایل صوتی** به متن در دسترس نیست مگر سرویس گفتار یا ارائه‌دهنده مناسب تنظیم شود. امکان دیکته مرورگر به مرورگر/میزبان بستگی دارد و ممکن است از سرویس بیرونی استفاده کند. انتخاب مدل بیرونی ممکن است متن یا صوت را خارج از سرور شما ارسال کند؛ قبل از تنظیم، سیاست داده و قرارداد ارائه‌دهنده را بررسی کنید.

### مدل زبانی محلی

Ollama یا سرور سازگار را جداگانه طبق راهنمای رسمی آن و سیاست سازمان نصب کنید و فقط روی loopback نگه دارید. پس از دانلود مدل مورد تأیید، نمونه تنظیم در `/etc/ravi.env`:

```ini
LLM_URL=http://127.0.0.1:11434
LLM_MODEL=qwen3:8b
LLM_MAX_ACTIVE=1
LLM_TIMEOUT_MS=240000
```

`qwen3:8b` فقط نمونه است، نه تضمین اجرا با ۸ گیگابایت RAM. پس از راه‌اندازی سرویس مدل، `sudo systemctl restart ravi` و سپس `/api/config` را بررسی و با گزارش ساختگی پاسخ واقعی مدل را آزمایش کنید. روشن‌بودن تنظیمات اثبات کیفیت یا سلامت مدل نیست. گزینه‌های Ollama و OpenAI-compatible، محدودیت و سنجش در [راهنمای مدل](llm/README.fa.md) آمده‌اند. `LLM_URL` محلی بر کلیدهای خارجی مقدم است.

### تبدیل گفتار محلی

نمونه زیر یک سرویس جدا برای Whisper فراهم می‌کند. اجرای آن به اینترنت برای نصب Python و دانلود مدل از منبع مدل، فضای دیسک و زمان نیاز دارد؛ `stt/requirements.txt` شامل وابستگی با نسخه باز است، پس منشأ و نسخه‌های نصب‌شده را طبق سیاست سازمان بررسی کنید. این مراحل روی سرور مقصد شما آزموده نشده‌اند.

```bash
# در ~/faraj/ravi-frgserver؛ نصب‌کننده اصلی پوشه stt را کپی نمی‌کند.
sudo apt install -y python3-venv
sudo install -d -o ravi-web -g ravi-web -m 750 /opt/ravi-stt
sudo install -d -o ravi-web -g ravi-web -m 700 /var/lib/ravi-stt
sudo cp stt/server.py stt/setup.sh stt/requirements.txt /opt/ravi-stt/
sudo chown -R ravi-web:ravi-web /opt/ravi-stt
sudo -u ravi-web env HOME=/var/lib/ravi-stt XDG_CACHE_HOME=/var/lib/ravi-stt/.cache STT_MODEL=medium sh /opt/ravi-stt/setup.sh
sudo chown -R root:root /opt/ravi-stt
sudo chmod -R u=rwX,go=rX /opt/ravi-stt
```

برای نصب جدید، دستور زیر توکن تصادفی یکسان را بدون نمایش در محیط سرویس گفتار و تنظیمات Node می‌گذارد. اگر `/etc/ravi-stt.env` وجود دارد، **دوباره اجرا نکنید**؛ تنظیمات فعلی را با `sudoedit` و بدون افشای توکن بررسی کنید.

```bash
sudo bash -c 'set -euo pipefail; umask 077; test ! -e /etc/ravi-stt.env; token=$(openssl rand -hex 32); printf "STT_HOST=127.0.0.1\nSTT_PORT=8765\nSTT_MODEL=medium\nSTT_DEVICE=cpu\nSTT_MAX_PENDING=1\nSTT_TOKEN=%s\n" "$token" > /etc/ravi-stt.env; printf "\nSTT_URL=http://127.0.0.1:8765\nSTT_TOKEN=%s\nSTT_PROXY_MAX_ACTIVE=1\nSTT_WORKER_MAX_ACTIVE=1\n" "$token" >> /etc/ravi.env; unset token'
```

سرویس نمونه را بسازید؛ `EnvironmentFile` را systemd می‌خواند و نباید در دسترس عمومی باشد:

```bash
sudo tee /etc/systemd/system/ravi-stt.service >/dev/null <<'EOF'
[Unit]
Description=Ravi local speech-to-text
After=network-online.target
Wants=network-online.target

[Service]
User=ravi-web
Group=ravi-web
WorkingDirectory=/opt/ravi-stt
Environment=HOME=/var/lib/ravi-stt
Environment=XDG_CACHE_HOME=/var/lib/ravi-stt/.cache
EnvironmentFile=/etc/ravi-stt.env
ExecStart=/opt/ravi-stt/.venv/bin/python /opt/ravi-stt/server.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
StateDirectory=ravi-stt
StateDirectoryMode=0700
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now ravi-stt
sudo systemctl restart ravi
sudo systemctl status ravi-stt --no-pager
curl -fsS http://127.0.0.1:8765/health
```

پورت ۸۷۶۵ را عمومی نکنید. `/health` نشان می‌دهد سرویس پاسخ می‌دهد، نه اینکه دقت صوت تأیید شده باشد. صوت ساختگیِ فارسی را از داخل برنامه امتحان و متن، نام و عدد را با صوت مقایسه کنید. محدودیت پیش‌فرض مدت صوت ۱۸۵ ثانیه است. [راهنمای گفتار](stt/README.md) و [گزارش سنجش محدود](evaluation/LOAD_REPORT.fa.md) معیارهای واقعی و محدودیت نمونه‌ها را توضیح می‌دهند. `medium` و ۸B را ابتدا جداگانه و سپس تنها با ظرفیت کافی هم‌زمان بسنجید.

## ۱۰. پایش، اشکال‌زدایی و ارتقا

```bash
sudo systemctl status ravi --no-pager
sudo journalctl -u ravi -n 100 --no-pager
sudo nginx -t
curl -fsS http://127.0.0.1:4173/healthz
sudo systemctl status ravi-stt --no-pager   # فقط اگر نصب شده است
sudo journalctl -u ravi-stt -n 100 --no-pager
```

- **سرویس بالا نمی‌آید:** نسخه `/usr/bin/node`، وضعیت بسته SQLite، مجوز `/etc/ravi.env`، فایل‌های کلید و مالکیت `/var/lib/ravi` را بررسی کنید. رازها را در خروجی پشتیبانی کپی نکنید.
- **گواهی خطا دارد:** DNS و رکورد AAAA، رسیدن پورت ۸۰/۴۴۳، نام واقعی هر دو میزبان، زمان سیستم و گزارش Certbot را بررسی کنید.
- **مرکز false است یا صفحه ادمین نیست:** `CENTRAL_ENABLED`، مبدأها، فایل رازها، راه‌اندازی مجدد سرویس و Host عبوری از Nginx را بررسی کنید. پیش‌نمایش dev مرکز ندارد.
- **ثبت 401 می‌دهد:** با همان بازو و در خود بله باز کنید؛ توکن، امضای خام و ساعت/انقضای داده را بررسی کنید. پارامتر `via` جای احراز نیست.
- **تبدیل صوت کار نمی‌کند:** وضعیت مدل، loopback، یکسان‌بودن توکن دو سرویس، زمان پاسخ، نوع/مدت صوت و حافظه را بررسی کنید. `/api/config` فقط پیکربندی را نشان می‌دهد.

برای ارتقا، ابتدا انتشار تأییدشده و تغییرات وابستگی‌ها را بررسی، از داده و تنظیمات پشتیبان معتبر تهیه و ارتقا و بازگشت را روی سرور آزمایشی تکرار کنید. `deploy/install.sh` عمداً روی نصب موجود اجرا نمی‌شود؛ به‌روزرسانی خودکار بدون قطعی یا rollback خودکار در این مخزن وجود ندارد. تا تهیه روش عملیاتی تأییدشده از بازنویسی مستقیم `/opt/ravi` روی سرویس فعال خودداری کنید.

## ۱۱. چک‌لیست پیش از گزارش واقعی

- [ ] HTTPS هر دو مبدأ، تمدید، DNS و محدودیت شبکه کارتابل تأیید شده است.
- [ ] هر مسئول حساب جدا، رمز قوی و TOTP دارد؛ دسترسی‌ها و خروج/ابطال نشست آزموده شده‌اند.
- [ ] ثبت و احراز صحیح/نامعتبر بله، رسید، قطع شبکه و دریافت فایل با گوشی واقعی و داده ساختگی آزموده شده‌اند.
- [ ] سیاست محرمانگی، نگهداری و حذف، واکنش به رخداد، ظرفیت و سهمیه دیسک، پایش و بازیابی پشتیبان تصویب شده‌اند. پیش‌نویس‌ها و پیوست‌های مرورگر با رمزگذاری اختصاصی برنامه محافظت نمی‌شوند و پاک‌کردن داده سایت می‌تواند بازیابی ارسال را از بین ببرد.
- [ ] ممیزی امنیتی مستقل و سیاست اسکن بدافزار فایل‌ها تکمیل شده است؛ اسکن خودکار بدافزار در پروژه وجود ندارد.
- [ ] سرعت، کیفیت و بار مدل‌ها روی سخت‌افزار واقعی و با صوت/متن فارسی نماینده و معیار پذیرش کارفرما سنجیده شده است.

تا تکمیل موارد بالا از داده واقعی استفاده نکنید. جزئیات بیشتر: [استقرار و امنیت](deploy/README.fa.md)، [مینی‌اپ بله](BALE_MINIAPP.fa.md)، [آزمون مرکز](evaluation/CENTRAL_TEST_REPORT.fa.md) و [گزارش مدل‌ها](evaluation/LOAD_REPORT.fa.md).
