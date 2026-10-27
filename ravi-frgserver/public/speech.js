// Persian dictation through the recogniser built into the browser.
//
// What this does and does not promise:
//  * It needs no API key, no account and no request to this site's backend, so
//    it works on a deployment with no model configured at all.
//  * It is NOT necessarily offline. In Chrome and Edge the Web Speech API is
//    usually served by the browser vendor's own speech service, so the audio
//    can leave the device. Some builds ship an on-device model and some do not,
//    and a page cannot tell which one it got. The interface therefore says
//    «پردازش توسط خود مرورگر» and never claims the audio stays on the device.
//  * Availability is a browser fact, not a configuration fact: Chrome, Edge and
//    Chromium-based Android browsers expose it; Firefox does not. Persian
//    (fa-IR) support also varies by build, which surfaces as a
//    `language-not-supported` error rather than silence.
// When it is missing the caller falls back to typing or to an uploaded file.

export const speechEngine = (win = globalThis) => win.SpeechRecognition || win.webkitSpeechRecognition || null;
export const speechSupported = (win = globalThis) => Boolean(speechEngine(win));

export const speechMessage = error => ({
 'not-allowed': 'اجازهٔ استفاده از میکروفون داده نشده است. از تنظیمات دسترسی همین سایت، میکروفون را مجاز کنید و دوباره بزنید.',
 'service-not-allowed': 'مرورگر اجازهٔ تشخیص گفتار را نداد. سامانه را در یک تب جدا و با نشانی امن باز کنید.',
 'no-speech': 'صدایی شنیده نشد. نزدیک‌تر به میکروفون و کمی بلندتر صحبت کنید.',
 'audio-capture': 'میکروفونی پیدا نشد. اتصال میکروفون را بررسی کنید.',
 'network': 'تشخیص گفتار این مرورگر به اینترنت نیاز دارد و الان در دسترس نیست. می‌توانید متن را بنویسید.',
 'aborted': '',
 'language-not-supported': 'این مرورگر فارسی را برای تشخیص گفتار پشتیبانی نمی‌کند؛ متن را بنویسید یا فایل صوتی بفرستید.',
}[error] ?? 'تشخیص گفتار انجام نشد؛ دوباره تلاش کنید یا متن را بنویسید.');

/**
 * Live dictation. `onPartial` receives the sentence being spoken, `onFinal`
 * receives each completed sentence. The caller decides what to do with them;
 * this module never touches application state.
 */
export function createDictation({
 lang = 'fa-IR', onPartial = () => {}, onFinal = () => {}, onError = () => {}, onState = () => {},
 Engine = speechEngine(), maxDuration = 180000,
} = {}) {
 let session = null;
 const release = s => { clearTimeout(s.timer); s.recognition.onresult = s.recognition.onerror = s.recognition.onend = null; };

 function start() {
  if (session || !Engine) { if (!Engine) onError(speechMessage('language-not-supported')); return; }
  const recognition = new Engine();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  const s = { recognition, stopped: false, timer: null };
  session = s;

  recognition.onresult = event => {
   if (session !== s) return;
   let interim = '';
   for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const text = String(result[0]?.transcript ?? '').trim();
    if (!text) continue;
    if (result.isFinal) onFinal(text); else interim += (interim ? ' ' : '') + text;
   }
   if (interim) onPartial(interim);
  };
  recognition.onerror = event => {
   if (session !== s) return;
   const message = speechMessage(event?.error);
   // The code travels with the message so the page can tell a refused
   // microphone (which will keep failing) from a passing glitch.
   if (message) onError(message, event?.error);
   // `no-speech` is not fatal: the recogniser keeps listening.
   if (event?.error !== 'no-speech') { release(s); session = null; onState('idle'); }
  };
  recognition.onend = () => {
   if (session !== s) return;
   // Browsers end the session on their own after a pause; resume unless stopped.
   if (!s.stopped) { try { recognition.start(); return; } catch { /* fall through to idle */ } }
   release(s); session = null; onState('idle');
  };

  try { recognition.start(); } catch (e) {
   session = null; onState('idle'); onError(speechMessage(e?.name === 'InvalidStateError' ? 'aborted' : ''));
   return;
  }
  onState('listening');
  s.timer = setTimeout(() => stop(), maxDuration);
 }

 function stop() {
  const s = session;
  if (!s) return;
  s.stopped = true;
  try { s.recognition.stop(); } catch { release(s); session = null; onState('idle'); }
 }

 return { start, stop, get active() { return Boolean(session); } };
}

/** Joins dictated sentences into one description without duplicating spaces or punctuation. */
export function appendSpeech(existing, addition) {
 const base = String(existing ?? '').trimEnd();
 const next = String(addition ?? '').trim();
 if (!next) return base;
 if (!base) return next;
 return /[.!؟؛،]$/.test(base) ? `${base} ${next}` : `${base}، ${next}`;
}
