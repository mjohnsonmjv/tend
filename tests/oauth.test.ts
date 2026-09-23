import {test} from "node:test";
import assert from "node:assert/strict";
import {providerOptions,providerFlags,parseOAuthReturn,isTrustedOAuthMessage,isTrustedOAuthBroadcast,OAUTH_RETURN,oauthErrorMessage} from "../client/src/lib/oauth-core";
test("Google and Microsoft request identity-only scopes and account selection",()=>{
  for(const provider of ["google","azure"] as const){
    const v=providerOptions(provider,"https://tend.example/");
    assert.equal(v.provider,provider);assert.equal(v.options.skipBrowserRedirect,true);
    assert.equal(v.options.scopes,"openid email profile");assert.equal(v.options.queryParams.prompt,"select_account");
    assert.ok(!v.options.scopes.includes("offline_access"));
  }
});
test("provider configuration fails closed",()=>{
  assert.deepEqual(providerFlags({external:{google:true,azure:false}}),{google:true,azure:false});
  assert.deepEqual(providerFlags({external:{google:"true",azure:1}}),{google:false,azure:false});
  assert.deepEqual(providerFlags(null),{google:false,azure:false});
});
test("callbacks parse codes but do not accept legacy tokens",()=>{
  assert.equal(parseOAuthReturn("https://tend.example/?code=abc")?.code,"abc");
  const channel="a".repeat(48);
  assert.deepEqual(parseOAuthReturn(`https://tend.example/?oauth_channel=${channel}&code=abc`),{type:OAUTH_RETURN,code:"abc",channel});
  assert.equal(parseOAuthReturn("https://tend.example/?oauth_channel=guessable&code=abc")?.channel,undefined);
  assert.equal(parseOAuthReturn("https://tend.example/#access_token=secret&refresh_token=other")?.error,"restart_required");
  assert.equal(parseOAuthReturn("https://tend.example/#/login"),null);
  assert.equal(parseOAuthReturn("https://tend.example/?code=")?.error,"invalid_callback");
});
test("broadcast callbacks require the one-time channel",()=>{
  const channel="b".repeat(48),payload={type:OAUTH_RETURN,code:"abc",channel};
  assert.equal(isTrustedOAuthBroadcast(payload,channel),true);
  assert.equal(isTrustedOAuthBroadcast({...payload,channel:"c".repeat(48)},channel),false);
  assert.equal(isTrustedOAuthBroadcast({type:OAUTH_RETURN,code:"abc"},channel),false);
});
test("callback errors never expose provider descriptions",()=>{
  const result=parseOAuthReturn("https://tend.example/?error=access_denied&error_description=private-value");
  assert.equal(result?.error,"access_denied");assert.ok(!JSON.stringify(result).includes("private-value"));
});
test("cross-window messages require both exact origin and exact popup",()=>{
  const popup={};const event={origin:"https://tend.example",source:popup,data:{type:OAUTH_RETURN,code:"abc"}};
  assert.equal(isTrustedOAuthMessage(event,"https://tend.example",popup),true);
  assert.equal(isTrustedOAuthMessage({...event,origin:"https://evil.example"},"https://tend.example",popup),false);
  assert.equal(isTrustedOAuthMessage({...event,source:{}},"https://tend.example",popup),false);
  assert.equal(isTrustedOAuthMessage({...event,data:{type:"other",code:"abc"}},"https://tend.example",popup),false);
  assert.equal(isTrustedOAuthMessage({...event,data:{type:OAUTH_RETURN,code:"x".repeat(2049)}},"https://tend.example",popup),false);
});
test("recoverable errors explain the next step",()=>{
  for(const reason of ["blocked","closed","timeout","frame","provider_error"])assert.ok(oauthErrorMessage(reason).length>20);
});
