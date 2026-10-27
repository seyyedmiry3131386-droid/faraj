import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {CentralStore} from './central-store.mjs';
import {fromBase32,totpAt} from './central-crypto.mjs';
import {createAttemptLimiter} from './central-http.mjs';

test('login limiter fails closed at its key cap and recovers after expiry',()=>{
 let now=0;const limited=createAttemptLimiter({maxKeys:2,maxAttempts:2,windowMs:100,clock:()=>now});
 assert.equal(limited('a'),false);assert.equal(limited('a'),false);assert.equal(limited('a'),true);
 assert.equal(limited('b'),false);assert.equal(limited('c'),true);
 limited.clear('a');assert.equal(limited('c'),false);assert.equal(limited('d'),true);
 now=101;assert.equal(limited('d'),false);assert.equal(limited('a'),false);
});

test('a credential change during scrypt prevents an old login; reset and disable revoke sessions',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ravi-staff-test-'));
 const store=new CentralStore(dir,randomBytes(32));
 t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true})});
 const now=Date.now(),name='staff.one',oldPassword='old long test password';
 const seed=await store.addStaff(name,oldPassword,'reviewer');
 const otp=totpAt(fromBase32(seed),Math.floor(now/30000));
 // authenticate() selects the old row before yielding to asynchronous scrypt.
 // Change the stored hash immediately, as a concurrent reset would do.
 const oldLogin=store.authenticate(name,oldPassword,otp,{now});
 store.db.prepare('UPDATE staff SET password=? WHERE username=?').run(randomBytes(32),name);
 assert.equal(await oldLogin,null,'credentials superseded during verification must not create a session');
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
 const newPassword='new long test password';
 const newSeed=await store.resetStaff(name,newPassword);
 const newOtp=totpAt(fromBase32(newSeed),Math.floor(now/30000));
 const fresh=await store.authenticate(name,newPassword,newOtp,{now});assert.ok(fresh);
 assert.ok(store.session(fresh.token,{now}));
 const thirdSeed=await store.resetStaff(name,'third long test password');
 assert.equal(store.session(fresh.token,{now}),null,'reset must revoke existing sessions');
 const thirdOtp=totpAt(fromBase32(thirdSeed),Math.floor(now/30000));
 const third=await store.authenticate(name,'third long test password',thirdOtp,{now});assert.ok(third);
 assert.equal(store.disableStaff(name),true);assert.equal(store.session(third.token,{now}),null);
 assert.equal(await store.authenticate(name,'third long test password',thirdOtp,{now}),null);
});
