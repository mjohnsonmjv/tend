for(var failure of ['denied','closed','blocked','exchange','settings']){
  var failCtx=await oauthBrowser.newContext({viewport:{width:375,height:812}});
  if(failure==='blocked')await failCtx.addInitScript(()=>{window.open=()=>null});
  var failExchanges=0;
  await failCtx.route('https://hvrdkrtismqbrkbmcgne.supabase.co/**',async route=>{
    var u=new URL(route.request().url());
    if(u.pathname.endsWith('/settings'))return failure==='settings'?route.fulfill({status:503,json:{message:'unavailable'}}):route.fulfill({json:{external:{google:true,azure:true}}});
    if(u.pathname.endsWith('/authorize')){
      if(failure==='closed')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Simulated provider</title><p>Waiting for a test decision.</p>'});
      var destination=new URL(u.searchParams.get('redirect_to'));
      destination.searchParams.set(failure==='denied'?'error':'code',failure==='denied'?'access_denied':'expired-code');
      return route.fulfill({status:302,headers:{location:destination.href}});
    }
    if(u.pathname.endsWith('/token')){failExchanges++;return route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Expired code'}})}
    return route.fulfill({json:{}});
  });
  var fp=await failCtx.newPage();
  await fp.goto('http://127.0.0.1:5000/#/login');
  if(failure==='settings'){
    await fp.getByTestId('button-retry-providers').waitFor();
    if(!await fp.getByTestId('button-oauth-google').isDisabled())throw Error('Failed settings not gated');
    await fp.getByTestId('input-auth-email').fill('sample@example.invalid');
    console.log('PASS provider-settings failure leaves email available');
  }else{
    await fp.waitForFunction(()=>!document.querySelector('[data-testid=\"button-oauth-google\"]').disabled);
    var popReady=failure==='closed'?fp.waitForEvent('popup'):null;
    await fp.getByTestId('button-oauth-google').click();
    if(popReady){
      var pc=await popReady;await pc.waitForLoadState();
      await fp.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',data:{type:'tend:oauth-return',code:'spoofed'}})));
      if(failExchanges!==0)throw Error('Spoofed callback accepted');
      await pc.close();
    }
    await fp.getByTestId('text-auth-message').waitFor();
    if(fp.url().endsWith('#/app'))throw Error('Failed flow logged in');
    if(!await fp.getByTestId('button-auth-submit').isEnabled())throw Error('Email remains blocked');
    console.log('PASS '+failure+' handled without session');
  }
  await failCtx.close();
}
var darkCtx=await oauthBrowser.newContext({viewport:{width:1280,height:900},colorScheme:'dark'});
await darkCtx.route('https://hvrdkrtismqbrkbmcgne.supabase.co/auth/v1/settings',r=>r.fulfill({json:{external:{google:true,azure:true}}}));
var darkPage=await darkCtx.newPage();
await darkPage.goto('http://127.0.0.1:5000/#/register');
await darkPage.getByTestId('button-oauth-google').waitFor();
await darkPage.screenshot({path:'/tmp/tend-social-dark.png',fullPage:true});
await darkCtx.close();
