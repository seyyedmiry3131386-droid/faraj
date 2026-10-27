// Bale's documented WebApp SDK provides ready/expand and openLink for URLs;
// it does not document native microphone, geolocation, file or telephone APIs.
// Browser APIs must be called by a user gesture and may still be denied by the
// host WebView, OS, iframe policy or the user. Never treat host detection or
// initDataUnsafe as authentication. See https://docs.bale.ai/miniapp.

export function inMiniApp() {
 try {
  return Boolean(window.__raviBaleHost || window.BaleWebApp || window.Bale?.WebApp?.isMiniAppSupported ||
   /[?&]via=bale(?:&|$)/i.test(location.search) || /\bBale\b/i.test(navigator.userAgent || '') ||
   window.Telegram?.WebApp?.initData);
 } catch { return false; }
}

const hostApp = () => inMiniApp() ? (window.Bale?.WebApp || window.Telegram?.WebApp || null) : null;
let initialized = false;
/** The early loader starts the official SDK. A missing SDK never blocks UI. */
export function loadHostSdk() {
 if (!inMiniApp()) return Promise.resolve(null);
 const pending = window.__raviBaleSdk || Promise.resolve(hostApp());
 return pending.then(app => {
  if (app && !initialized) {
   initialized = true;
   try { app.ready?.(); } catch {}
   try { app.expand?.(); } catch {}
  }
  return app || null;
 }).catch(() => null);
}

/** Open a same-origin HTTP(S) page in the device browser on an explicit tap. */
export function openExternal(url) {
 let target;
 try {
  target = new URL(url, location.href);
  if (!['https:', 'http:'].includes(target.protocol) || target.origin !== location.origin) return false;
 } catch { return false; }
 const app = hostApp();
 if (app?.openLink) { try { app.openLink(target.href, {try_instant_view:false}); return true; } catch {} }
 // With noopener the browser can return null even after opening a tab; the
 // return value means the request was issued, not that opening succeeded.
 try { window.open(target.href, '_blank', 'noopener,noreferrer'); return true; } catch { return false; }
}

/** Copy only after the reporter asks; no background clipboard reads. */
export async function copyText(text) {
 try { await navigator.clipboard.writeText(text); return true; } catch {}
 try {
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.append(area); area.select();
  const ok = document.execCommand('copy'); area.remove(); return ok;
 } catch { return false; }
}

const EMERGENCY_NUMBERS = new Set(['110', '115', '125', '123', '112']);
/** A whitelisted, same-origin page with a user-activated tel: link. */
export function emergencyBrowserUrl(number) {
 if (!EMERGENCY_NUMBERS.has(String(number))) return '';
 try { return new URL(`/call.html?n=${encodeURIComponent(number)}`, location.origin).href; } catch { return ''; }
}

/** Browser copy of the page: do not leak mini-app launch data into a new tab. */
export function browserUrl() {
 try {
  const url = new URL(location.href);
  for (const key of [...url.searchParams.keys()]) if (key === 'via' || /^tgWebApp/i.test(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.toString();
 } catch { return '/'; }
}
