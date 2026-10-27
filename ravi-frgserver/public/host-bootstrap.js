// Start the official Bale SDK before the application module, only when the
// page appears to have been launched by a messenger. Bale passes its launch
// parameters in the hash; its SDK removes that hash after reading it. This is
// host detection for UI/fallbacks only, NOT authentication.
(function () {
  let remembered = false;
  try { remembered = /tgWebApp(?:Version|Data|Platform)/.test(sessionStorage.getItem('__bale__initParams') || ''); } catch {}
  const marked = /[?&]via=bale(?:&|$)/i.test(location.search);
  const launch = /(?:^|[?#&])tgWebApp(?:Version|Data|Platform)=/i.test(location.hash);
  const nativeBridge = Boolean(window.BaleWebApp);
  const hostAgent = /\bBale\b/i.test(navigator.userAgent || '');
  if (!marked && !launch && !remembered && !nativeBridge && !hostAgent && !window.Bale?.WebApp) return;
  window.__raviBaleHost = true;
  window.__raviBaleSdk = new Promise(resolve => {
    if (window.Bale?.WebApp) return resolve(window.Bale.WebApp);
    const script = document.createElement('script');
    script.src = 'https://tapi.bale.ai/miniapp.js';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => resolve(window.Bale?.WebApp || null);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
})();
