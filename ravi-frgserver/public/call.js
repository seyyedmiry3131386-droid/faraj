// Only known emergency numbers are accepted. The tel: link is followed on
// the user's tap, not on page load: browsers may block automatic redirects,
// and merely opening a URL must never initiate an emergency call.
const SERVICES={'110':'پلیس','115':'اورژانس','125':'آتش‌نشانی','123':'اورژانس اجتماعی','112':'اورژانس'};
const n=new URLSearchParams(location.search).get('n');
if(n&&Object.prototype.hasOwnProperty.call(SERVICES,n)){
 const fa=String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
 document.getElementById('call').href='tel:'+n;
 document.getElementById('call').textContent=fa;
 document.getElementById('call').hidden=false;
 document.getElementById('name').textContent='تماس با '+SERVICES[n];
 document.title='تماس با '+SERVICES[n];
}else{
 document.getElementById('help').textContent='شمارهٔ اضطراری معتبر انتخاب نشده است. شماره را از داخل سامانه انتخاب کنید.';
}
