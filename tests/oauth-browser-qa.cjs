var oauthPW=await import('playwright');
if(typeof oauthBrowser!=="undefined")await oauthBrowser.close();
var oauthBrowser=await oauthPW.chromium.launch({headless:true});
var testAuthBase='https://hvrdkrtismqbrkbmcgne.supabase.co';
var testUser={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'qa@example.invalid',created_at:new Date().toISOString()};
var testJwt='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({sub:testUser.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
var qaCrypto=await import('node:crypto');
for(var provider of ['google','azure']){
  var ctx=await oauthBrowser.newContext({viewport:{width:1280,height:900}});
  var challenge=null,scopeSeen=null,exchangeVerified=false;
  var errors=[];
  await ctx.route(testAuthBase+'/**',async route=>{
    var u=new URL(route.request().url());
    if(u.pathname==='/auth/v1/settings')return route.fulfill({json:{external:{google:true,azure:true}}});
    if(u.pathname==='/auth/v1/authorize'){
      if(u.searchParams.get('provider')!==provider)throw Error('Wrong provider');
      challenge=u.searchParams.get('code_challenge');scopeSeen=u.searchParams.get('scopes');
      if(!challenge||u.searchParams.get('code_challenge_method')!=='s256')throw Error('PKCE challenge missing');
      const destination=new URL(u.searchParams.get('redirect_to'));destination.searchParams.set('code','fictional-auth-code');
      return route.fulfill({status:302,headers:{location:destination.href}});
    }
    if(u.pathname==='/auth/v1/token'){
      const body=route.request().postDataJSON();
      if(body.auth_code!=='fictional-auth-code')throw Error('Wrong code');
      if(qaCrypto.createHash('sha256').update(body.code_verifier).digest('base64url')!==challenge)throw Error('PKCE mismatch');
      exchangeVerified=true;
      return route.fulfill({json:{access_token:testJwt,refresh_token:'fixture-only',token_type:'bearer',expires_in:3600,user:testUser}});
    }
    if(u.pathname==='/auth/v1/user')return route.fulfill({json:{user:testUser}});
    if(u.pathname.includes('/rest/v1/tend_churches'))return route.fulfill({json:[]});
    return route.fulfill({json:{}});
  });
  var p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:5000/#/login');
  await p.getByTestId('button-oauth-'+provider).waitFor();
  await p.waitForFunction(pr=>!document.querySelector('[data-testid="button-oauth-'+pr+'"]').disabled,provider);
  if(provider==='google')await p.screenshot({path:'/tmp/tend-social-enabled-desktop.png'});
  await p.getByTestId('button-oauth-'+provider).click();
  await p.waitForURL(/#\/app/);
  if(!exchangeVerified)throw Error('No token exchange');
  if(scopeSeen!=='openid email profile')throw Error('Unexpected scopes');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS '+provider+': popup callback, S256 verifier matching, identity-only scope, session and return to app');
  await ctx.close();
}
var disabledCtx=await oauthBrowser.newContext({viewport:{width:375,height:812}});
await disabledCtx.route(testAuthBase+'/auth/v1/settings',r=>r.fulfill({json:{external:{google:false,azure:false}}}));
var disabledPage=await disabledCtx.newPage();
await disabledPage.goto('http://127.0.0.1:5000/#/login');
await disabledPage.getByTestId('text-provider-setup').waitFor();
if(!await disabledPage.getByTestId('button-oauth-google').isDisabled()||!await disabledPage.getByTestId('button-oauth-azure').isDisabled())throw Error('Unconfigured providers clickable');
await disabledPage.screenshot({path:'/tmp/tend-social-pending-mobile.png',fullPage:true});
if(await disabledPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
await disabledPage.goto('http://127.0.0.1:5000/?code=not-a-live-code');
await disabledPage.getByTestId('link-callback-login').waitFor();
if(disabledPage.url().includes('code='))throw Error('Code retained in URL');
await disabledPage.goto('http://127.0.0.1:5000/#access_token=not-a-token&refresh_token=not-a-refresh');
await disabledPage.getByTestId('link-callback-login').waitFor();
await disabledPage.waitForFunction(()=>!location.hash.includes("access_token"));
if(disabledPage.url().includes('access_token'))throw Error('Legacy token retained');
console.log('PASS disabled provider gating, no-opener recovery, URL cleanup, mobile fit.');
await disabledCtx.close();
