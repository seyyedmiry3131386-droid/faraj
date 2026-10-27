// These are destinations from the current configuration, not a guarantee that
// a self-hosted URL points to this machine or that browser dictation is local.
export function privacySummary(config = {}) {
  if (config.loaded === false) return 'وضعیت سرویس‌های تحلیل و گفتار مشخص نیست؛ اتصال را بررسی کنید. دیکتهٔ مرورگر ممکن است از سرویس مرورگر استفاده کند.';
  const destinations = {
    local: 'سرویس مدل زبانی تنظیم‌شده',
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI',
  };
  const analysis = config.ai
    ? `شرح و پاسخ‌های لازم برای تحلیل به ${destinations[config.provider] || 'سرویس مدل تنظیم‌شده'} فرستاده می‌شوند.`
    : 'تحلیل متن در مرورگر انجام می‌شود.';
  const audio = config.sttLocal
    ? 'فایل صوتی برای تبدیل به سرویس گفتار تنظیم‌شده فرستاده می‌شود؛ محل آن را تنظیمات سرور تعیین می‌کند.'
    : config.transcription
      ? 'فایل صوتی برای تبدیل به OpenAI فرستاده می‌شود.'
      : 'سرویس تبدیل فایل صوتی تنظیم نشده است.';
  const evidence=config.central?'با ثبت نهایی، گزارش، مستندات و شناسهٔ تأییدشدهٔ حساب بله به کارتابل مرکزی این سامانه ارسال می‌شوند؛ شناسهٔ حساب بله به‌معنای تأیید هویت حقیقی نیست. مستندات برای تحلیل مدل فرستاده نمی‌شوند.':'فایل‌های مستندات برای تحلیل ارسال نمی‌شوند و در همین مرورگر باقی می‌مانند.';
  return `${analysis} ${audio} دیکتهٔ مرورگر ممکن است از سرویس مرورگر استفاده کند. ${evidence}`;
}
