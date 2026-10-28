import test from 'node:test';
import assert from 'node:assert/strict';
import {requestLocation} from './public/device-permissions.js';
import {validateFiles} from './public/domain.js';

test('location is requested synchronously and only once for an explicit call',()=>{
 let sync=true,calls=0,position;
 requestLocation({secure:true,geolocation:{getCurrentPosition(ok,_err,opts){
  calls++;assert.equal(sync,true);assert.equal(opts.maximumAge,0);assert.equal(opts.timeout,12000);
  ok({coords:{latitude:35.12345,longitude:51.12345,accuracy:12}});
 }},onPosition:p=>position=p});
 sync=false;assert.equal(calls,1);assert.deepEqual(position,{latitude:35.12345,longitude:51.12345,accuracy:12});
});

test('location denial, host policy, unavailable sensor and timeout have safe alternatives',()=>{
 let calls=0,message;
 const geo={getCurrentPosition(_ok,fail){calls++;fail({code:1})}};
 requestLocation({secure:true,geolocation:geo,onError:m=>message=m});assert.match(message,/تنظیمات/);assert.equal(calls,1);
 requestLocation({secure:false,geolocation:geo,onError:m=>message=m});assert.match(message,/HTTPS/);assert.equal(calls,1);
 requestLocation({secure:true,policy:{allowsFeature:()=>false},geolocation:geo,onError:m=>message=m});assert.match(message,/این پنجره/);assert.equal(calls,1);
 for(const [code,pattern] of [[2,/GPS/],[3,/زمان/]]){
  requestLocation({secure:true,geolocation:{getCurrentPosition(_a,b){b({code})}},onError:m=>message=m});assert.match(message,pattern);
 }
 requestLocation({secure:true,geolocation:null,onError:m=>message=m});assert.match(message,/دستی/);
});

test('invalid coordinates are refused and accuracy can be unknown',()=>{
 let out,message;
 requestLocation({secure:true,geolocation:{getCurrentPosition(ok){ok({coords:{latitude:200,longitude:51}})}},onPosition:p=>out=p,onError:m=>message=m});
 assert.equal(out,undefined);assert.match(message,/قابل خواندن نبود/);
 requestLocation({secure:true,geolocation:{getCurrentPosition(ok){ok({coords:{latitude:35,longitude:51,accuracy:-1}})}},onPosition:p=>out=p});
 assert.deepEqual(out,{latitude:35,longitude:51,accuracy:null});
});

test('evidence picker tolerates common mobile generic MIME types without admitting arbitrary file extensions',()=>{
 const valid=['photo.JPG','clip.m4a','evidence.pdf'].map(name=>new File(['x'],name,{type:'application/octet-stream'}));
 valid.push(new File(['x'],'camera.heic',{type:'image/heic'}));
 const result=validateFiles(valid);assert.equal(result.accepted.length,4);assert.deepEqual(result.errors,[]);
 const unknown=validateFiles([new File(['x'],'script.exe',{type:'application/octet-stream'})]);assert.equal(unknown.accepted.length,0);assert.match(unknown.errors[0],/پشتیبانی نمی‌شود/);
 const fake=validateFiles([new File(['x'],'photo.jpg',{type:'text/html'})]);assert.equal(fake.accepted.length,0);
});
