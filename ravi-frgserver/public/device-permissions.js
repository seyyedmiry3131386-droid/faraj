// Call from a user gesture only. We do not watch or retain location in the
// background; the caller decides whether/how to insert the returned position.
export function requestLocation({
  geolocation=globalThis.navigator?.geolocation,
  secure=globalThis.isSecureContext,
  policy=globalThis.document?.permissionsPolicy || globalThis.document?.featurePolicy,
  onPosition=()=>{}, onError=()=>{},
}={}) {
  if (secure===false) return onError('برای موقعیت مکانی باید سامانه با نشانی امن HTTPS باز شود؛ یا نشانی را دستی بنویسید.');
  try {
    if (policy?.allowsFeature && !policy.allowsFeature('geolocation'))
      return onError('دسترسی موقعیت در این پنجره مجاز نیست؛ سامانه را در مرورگر گوشی باز کنید یا نشانی را دستی بنویسید.');
  } catch { /* Unsupported policy inspection is not proof of denial. */ }
  if (!geolocation?.getCurrentPosition) return onError('موقعیت مکانی در این محیط پشتیبانی نمی‌شود؛ نشانی را دستی بنویسید.');
  try {
    geolocation.getCurrentPosition(position=>{
      const {latitude,longitude,accuracy}=position?.coords || {};
      if (!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)
        return onError('موقعیت قابل خواندن نبود؛ نشانی را دستی بنویسید.');
      onPosition({latitude,longitude,accuracy:Number.isFinite(accuracy)&&accuracy>=0?accuracy:null});
    },error=>{
      const message = error?.code===1
        ? 'اجازهٔ موقعیت رد یا مسدود شد. موقعیت دستگاه و دسترسی بله یا سایت را در تنظیمات بررسی کنید؛ یا نشانی را دستی بنویسید.'
        : error?.code===2
        ? 'موقعیت در دسترس نیست. GPS یا اینترنت دستگاه را بررسی کنید؛ یا نشانی را دستی بنویسید.'
        : error?.code===3
        ? 'زمان دریافت موقعیت تمام شد؛ دوباره تلاش کنید یا نشانی را دستی بنویسید.'
        : 'دریافت موقعیت ممکن نشد؛ نشانی را دستی بنویسید.';
      onError(message);
    },{enableHighAccuracy:false,timeout:12000,maximumAge:0});
  } catch {
    onError('دریافت موقعیت در این محیط ممکن نیست؛ نشانی را دستی بنویسید.');
  }
}
