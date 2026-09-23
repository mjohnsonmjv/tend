var mockCtx=await devBrowser.newContext({viewport:{width:1280,height:900}});
var mockPage=await mockCtx.newPage();
var mockChurch=null;
var mockPosts=0;
var mockUser={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'qa@example.invalid',created_at:new Date().toISOString()};
var mockJwt='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({sub:mockUser.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
await mockCtx.route('https://hvrdkrtismqbrkbmcgne.supabase.co/**',async route=>{
  var req=route.request();var url=new URL(req.url());var body={};try{body=req.postDataJSON()||{}}catch{}
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  var reply={};var statusCode=200;
  if(url.pathname.includes('/auth/v1/token'))reply={access_token:mockJwt,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user:mockUser};
  else if(url.pathname.includes('/auth/v1/user'))reply=mockUser;
  else if(url.pathname.includes('/rest/v1/tend_churches')){
    if(req.method()==='POST'){
      mockPosts++;
      if(body.slug==='taken-church'){statusCode=409;reply={code:'23505',message:'Duplicate slug'};}
      else{mockChurch={id:9999,name:body.name,slug:body.slug,pastorName:body.pastor_name,pastorEmail:mockUser.email,greetingMessage:body.greeting_message,plan:'pilot',createdAt:new Date().toISOString()};reply=mockChurch;}
    }else if(url.searchParams.get('id')==='eq.404'){statusCode=406;reply={code:'PGRST116',message:'Not found'};}
    else reply=url.searchParams.has('id')?mockChurch:mockChurch?[mockChurch]:[];
  }else if(url.pathname.includes('tend_prayers')) reply=[];
  await route.fulfill({status:statusCode,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(reply)});
});
await mockPage.goto('http://127.0.0.1:5000/#/login');
await mockPage.getByTestId('input-auth-email').fill(mockUser.email);
await mockPage.getByTestId('input-auth-password').fill('Local-fixture-only');
await mockPage.getByTestId('button-auth-submit').click();
await mockPage.waitForURL(/#\/app/);
await mockPage.getByTestId('link-create-another-church').click();
await mockPage.getByTestId('button-setup-next').click();
await mockPage.getByText('Enter a church name.',{exact:true}).waitFor();
await mockPage.getByTestId('input-church-name').fill('Fictional Care Church');
await mockPage.getByTestId('input-slug').fill('demo');
await mockPage.getByTestId('button-setup-next').click();
await mockPage.getByText('Please choose another church URL.',{exact:true}).waitFor();
await mockPage.getByTestId('input-slug').fill('taken-church');
await mockPage.getByTestId('button-setup-next').click();
await mockPage.getByTestId('card-welcome-preview').waitFor();
await mockPage.screenshot({path:'/tmp/tend-onboarding-desktop.png'});
await mockPage.getByTestId('button-create-church').click();
await mockPage.getByTestId('text-setup-error').waitFor();
await mockPage.getByRole('button',{name:'Back',exact:true}).click();
await mockPage.getByTestId('input-slug').fill('fictional-care-church');
await mockPage.getByTestId('button-setup-next').click();
await mockPage.setViewportSize({width:375,height:812});
await mockPage.screenshot({path:'/tmp/tend-onboarding-mobile.png',fullPage:true});
await mockPage.getByTestId('button-create-church').click();
await mockPage.waitForURL(/church\/9999\/qr/);
await mockPage.getByTestId('img-qr-preview').waitFor();
await mockPage.goto('http://127.0.0.1:5000/#/church/404/qr');
await mockPage.getByTestId('access-problem').waitFor();
await mockPage.goto('http://127.0.0.1:5000/#/church/404/settings');
await mockPage.getByTestId('access-problem').waitFor();
await mockPage.goto('http://127.0.0.1:5000/#/church/404/dashboard');
await mockPage.getByTestId('access-problem').waitFor();
console.log('PASS mocked onboarding: field validation, reserved slug, duplicate recovery, public display name, two-step creation, QR page, inaccessible-church states. No live records or emails created.');
console.log('Mock church creation requests',mockPosts);
await mockCtx.close();
