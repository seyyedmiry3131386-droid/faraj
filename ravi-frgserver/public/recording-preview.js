// The most recent recording is kept in browser memory only. Show recovery
// controls on *every* voice panel, including local STT and the mini-app.
export function recordingPreview({url, hasRecording, alreadyTranscribed, canRetry, busy}, escape) {
  if(!hasRecording)return '';
  const action=canRetry
    ? alreadyTranscribed
      ? '<span>متن این صوت اضافه شد.</span>'
      : `<button class="secondary" data-action="retry-transcribe" ${busy?'disabled':''}>تبدیل این فایل به متن</button>`
    : '<span>تبدیل فایل صوتی به متن روی این سرور تنظیم نشده است. می‌توانید متن را بنویسید یا از دیکتهٔ مرورگر استفاده کنید.</span>';
  return `<div class="recording-preview"><audio controls preload="metadata" src="${escape(url)}" aria-label="پخش صوت ضبط‌شده"></audio><div class="voice-actions"><button class="plain" data-action="download-recording">دریافت صوت</button>${action}</div></div>`;
}
