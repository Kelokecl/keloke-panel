import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeProfileAuth } from './authProfileListener.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
function harness(fetchProfile) {
  let listener; const profiles=[]; let unsubscribed=false;
  const cleanup=subscribeProfileAuth({onAuthStateChange:fn=>{listener=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}},{fetchProfile,setProfile:p=>profiles.push(p),signOut:async()=>{},onError:e=>{throw e;}});
  return {event:(...args)=>listener(...args),profiles,cleanup,get unsubscribed(){return unsubscribed;}};
}
test('auth callback returns before querying, releasing the auth lock', async()=>{
  let locked=true;
  const h=harness(async email=>{assert.equal(locked,false);return {email};});
  const result=h.event('SIGNED_IN',{user:{email:'test@example.invalid'}});
  assert.equal(result,undefined); assert.equal(h.profiles.length,0);
  locked=false; await tick(); assert.equal(h.profiles[0].email,'test@example.invalid');h.cleanup();
});
test('a pending profile cannot restore a signed-out user',async()=>{
  let resolve; const h=harness(()=>new Promise(r=>resolve=r));
  h.event('SIGNED_IN',{user:{email:'test@example.invalid'}});await tick();
  h.event('SIGNED_OUT',null);resolve({email:'test@example.invalid'});await tick();
  assert.deepEqual(h.profiles,[null]);h.cleanup();
});
test('unmount cancels scheduled work and unsubscribes',async()=>{
  let calls=0;const h=harness(async()=>{calls++;return {};});
  h.event('SIGNED_IN',{user:{email:'test@example.invalid'}});h.cleanup();await tick();
  assert.equal(calls,0);assert.equal(h.unsubscribed,true);
});

test('a transient profile failure preserves the current session and profile',async()=>{
  let listener; let signedOut=false; const profiles=[]; const errors=[];
  const cleanup=subscribeProfileAuth({onAuthStateChange:fn=>{listener=fn;return {data:{subscription:{unsubscribe(){}}}};}},{fetchProfile:async()=>{throw new Error('Network timeout');},setProfile:p=>profiles.push(p),signOut:async()=>{signedOut=true;},onError:e=>errors.push(e.message)});
  listener('TOKEN_REFRESHED',{user:{email:'test@example.invalid'}}); await tick();
  assert.equal(signedOut,false);assert.deepEqual(profiles,[]);assert.deepEqual(errors,['Network timeout']);cleanup();
});
