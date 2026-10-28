// Presentation follows the user's original PHP interface; report state stays in app.js.
export function legacyShell(content,{view,icon}) {
 const toolbar=view==='welcome'?'':`<header class="legacy-toolbar"><button class="legacy-back" data-action="home">${icon('back')}صفحهٔ نخست</button></header>`;
 return `<div class="app-shell"><div class="workspace">${toolbar}<main class="main" id="main">${content}</main><footer class="footer"><span class="copyright">تمامی حقوق این سامانه متعلق به سازمان رزم سوم فراجا میباشد.</span></footer></div></div>`;
}

export function legacyWelcome({hasCurrent,draft}) {
 const resume=hasCurrent||draft;
 return `<div class="legacy-home"><div class="legacy-home-brand"><img class="legacy-home-logo" src="/assets/faraja.webp" alt="لوگوی فراجا" width="140" height="140"><p class="organization-name">سازمان رزم سوم فراجا</p></div><p class="legacy-motto" lang="ar">كُونُوا قَوَّامِينَ لِلَّهِ شُهَدَاءَ بِالْقِسْطِ</p><section class="legacy-quote"><p>امنیت پایدار، بدون مشارکت و همراهی مردم امکان‌پذیر نیست.</p></section><section class="legacy-welcome"><h1>سامانهٔ ثبت گزارش</h1><p>هر گزارش مسئولانهٔ شما، گامی مؤثر در پاسداری از امنیت است.<br>از همراهی و مسئولیت‌پذیری شما سپاسگزاریم.</p><div class="legacy-signature">فرماندهی انتظامی جمهوری اسلامی ایران</div></section><div class="legacy-home-buttons"><button class="legacy-main-card" data-action="new"><strong>ثبت گزارش جدید</strong></button>${resume?`<button class="legacy-main-card legacy-secondary-card" data-action="${hasCurrent?'continue-report':'draft'}"><strong>ادامهٔ گزارش قبلی</strong></button>`:''}<button class="legacy-main-card legacy-secondary-card" data-action="reports"><strong>گزارش‌های من</strong></button></div></div>`;
}
