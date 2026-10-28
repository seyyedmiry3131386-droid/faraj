// A microphone on every free-text answer, not only on the first description.
//
// Added to the page after it renders — the same way the dropdowns are
// enhanced — so no question template has to know about it. Whatever the
// reporter says is appended to that one box, and the box's own input event is
// fired, so the answer is saved exactly as if it had been typed.
//
// The route follows what the deployment offers, in order of privacy:
//  1. our own speech server (or another configured transcriber): record here,
//     convert there;
//  2. the browser's dictation, when the page may use the microphone;
//  3. when direct access is unavailable: select a user-chosen audio file.
// A WebView may grant the microphone, so it is never pre-blocked just because
// the page is in a mini-app.
// The page is NOT re-rendered while listening, so a half-typed answer in any
// other box on the page is never lost.

const TARGETS = 'textarea#guide-input, textarea#answer, .flow-content textarea.field, .guide-step textarea';

export function createFieldVoice({ config, blocked, api, createVoiceRecorder, createDictation, speechSupported, appendSpeech, toast, icon }) {
 let active = null;            // { target, button, kind }
 const setBusy = (button, on, label) => {
  button.classList.toggle('listening', on);
  button.setAttribute('aria-pressed', String(on));
  if (label) button.setAttribute('aria-label', label);
 };
 const put = (target, text) => {
  if (!target?.isConnected || !text) return;
  target.value = appendSpeech(target.value, text).slice(0, Number(target.maxLength) > 0 ? Number(target.maxLength) : 6000);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.focus();
 };
 const finish = () => { if (active) setBusy(active.button, false, 'گفتن پاسخ'); active = null; };

 async function sendFile(file, target, button) {
  if (!config().transcription) { toast('تبدیل صوت به متن روی این سرور فعال نیست؛ پاسخ را بنویسید.'); return; }
  setBusy(button, true, 'در حال تبدیل…'); button.disabled = true;
  try {
   const form = new FormData(); form.append('file', file, file.name || 'answer.webm');
   const result = await api('transcribe', form);
   if (typeof result?.text === 'string' && result.text.trim()) { put(target, result.text.trim()); toast('متن اضافه شد؛ آن را بازبینی کنید.'); }
   else toast('گفتاری تشخیص داده نشد؛ دوباره بگویید یا بنویسید.');
  } catch (error) { toast(error?.message || 'تبدیل صوت انجام نشد.'); }
  finally { button.disabled = false; setBusy(button, false, 'گفتن پاسخ'); }
 }

 const recorder = createVoiceRecorder({
  onState(phase) { if (active?.kind === 'record') setBusy(active.button, phase !== 'idle', phase === 'recording' ? 'پایان ضبط' : 'گفتن پاسخ'); },
  onError(message) { toast(message); finish(); },
  onFile(file) { const a = active; active = null; if (a) sendFile(file, a.target, a.button); },
 });
 const dictation = createDictation({
  onState(phase) { if (phase === 'idle') finish(); },
  onPartial() {},
  onFinal(text) { if (active?.kind === 'dictate') put(active.target, text); },
  onError(message) { toast(message); finish(); },
 });

 function toggle(button) {
  const target = button.closest('.field-voice')?.querySelector('textarea');
  if (!target) return;
  // A second press on the same box stops it.
  if (active?.button === button) { if (active.kind === 'record') recorder.stop(); else dictation.stop(); return; }
  if (active) { if (active.kind === 'record') recorder.stop({ discard: true }); else dictation.stop(); finish(); }
  const c = config();
  if (blocked()) {
   const picker = button.closest('.field-voice').querySelector('input[type=file]');
   active = null; picker?.click(); return;
  }
  if (c.transcription) { active = { target, button, kind: 'record' }; recorder.start(); return; }
  if (speechSupported()) { active = { target, button, kind: 'dictate' }; setBusy(button, true, 'پایان گفتن'); dictation.start(); return; }
  toast('ورودی صوتی در این مرورگر در دسترس نیست؛ پاسخ را بنویسید.');
 }

 /** Wraps each free-text answer box on the page with its own microphone. */
 function enhance(root) {
  const c = config();
  if (!c.transcription && (!speechSupported() || blocked())) return;
  for (const target of root.querySelectorAll(TARGETS)) {
   if (target.closest('.field-voice') || target.disabled || target.readOnly) continue;
   const wrap = document.createElement('div'); wrap.className = 'field-voice';
   target.before(wrap); wrap.append(target);
   wrap.classList.toggle('has-audio-picker',Boolean(c.transcription));
   wrap.insertAdjacentHTML('beforeend', `<button type="button" class="field-voice-btn" data-field-voice aria-label="گفتن پاسخ" aria-pressed="false">${icon('mic')}</button>${c.transcription ? `<button type="button" class="field-voice-upload" data-field-audio aria-label="انتخاب فایل صوتی برای پاسخ">${icon('upload')}</button><input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.aac,.amr,.3gp" hidden>` : ''}`);
   const button = wrap.querySelector('[data-field-voice]');
   button.addEventListener('click', event => { event.preventDefault(); toggle(button); });
   const picker = wrap.querySelector('input[type=file]');
   wrap.querySelector('[data-field-audio]')?.addEventListener('click',event=>{event.preventDefault();picker?.click()});
   picker?.addEventListener('change', () => { if (picker.files[0]) sendFile(picker.files[0], target, button); picker.value = ''; });
  }
 }
 /** Stops anything in progress; called before the page is rebuilt. */
 function stopAll() { if (!active) return; if (active.kind === 'record') recorder.stop({ discard: true }); else dictation.stop(); active = null; }
 return { enhance, stopAll, isActive: () => Boolean(active) };
}
