import {supabase,SUPABASE_URL} from "./supabase";
import {isTrustedOAuthBroadcast,isTrustedOAuthMessage,oauthErrorMessage,providerOptions,type SocialProvider} from "./oauth-core";
import {logAuthEvent,authErrorCode} from "./auth-telemetry";
let active=false;
let cancelActive:(()=>void)|null=null;
export function cancelSocialSignIn(){cancelActive?.()}

/** iOS Safari severs popup opener references and may not expose a new tab's
 * document synchronously, which stranded the sign-in popup on about:blank.
 * iPadOS 13+ reports as MacIntel, hence the touch-points check.
 */
function isIOS():boolean{
  if(typeof navigator==="undefined")return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
}

/** The initiating tab owns the PKCE verifier; no browser storage or provider
 * tokens are passed across windows. Only an authorization code is accepted.
 * On iOS the flow uses a same-tab redirect instead of a popup; the OAuth
 * return page redeems the code itself (see OAuthReturn solo mode).
 */
export function startSocialSignIn(provider:SocialProvider):Promise<void>{
  if(active)return Promise.reject(new Error("A sign-in window is already open."));
  if(window.self!==window.top)return Promise.reject(new Error(oauthErrorMessage("frame")));
  if(typeof BroadcastChannel==="undefined")return Promise.reject(new Error("Please update your browser to use Google sign-in, or use email."));
  const origin=window.location.origin;
  const channelId=Array.from(crypto.getRandomValues(new Uint8Array(24)),value=>value.toString(16).padStart(2,"0")).join("");
  const solo=isIOS();
  const flow=solo?"solo":"popup";
  const startTime=Date.now();
  logAuthEvent("oauth_start",{provider,flow});
  const redirectTo=origin+window.location.pathname+`?oauth_channel=${channelId}`+(solo?"&oauth_solo=1":"");
  const authorize=():Promise<string>=>supabase.auth.signInWithOAuth(providerOptions(provider,redirectTo)).then(({data,error})=>{
    if(error||!data.url)throw new Error("This sign-in provider is not available yet. Please use email.");
    const url=new URL(data.url);
    if(url.origin!==SUPABASE_URL||url.pathname!=="/auth/v1/authorize")throw new Error("Unexpected sign-in address.");
    logAuthEvent("oauth_authorize_ok",{provider,flow,duration_ms:Date.now()-startTime});
    return data.url;
  }).catch((e)=>{logAuthEvent("oauth_authorize_fail",{provider,flow,error_code:authErrorCode(e)});throw e;});
  if(solo){
    // Same-tab redirect. The promise never settles: the page unloads on
    // redirect and the OAuth return page completes the sign-in.
    return authorize().then(url=>{window.location.href=url;return new Promise<void>(()=>{});});
  }
  const popup=window.open("about:blank","_blank","popup,width=520,height=720");
  if(!popup||popup.closed)return Promise.reject(new Error(oauthErrorMessage("blocked")));
  try{
    popup.document.title="Sign in to Tend";
    if(popup.document.body)popup.document.body.textContent="Opening secure sign-in…";
  }catch{
    // Some mobile browsers don't expose the new tab's document synchronously;
    // the authorize navigation below doesn't depend on it.
  }
  active=true;
  let channel:BroadcastChannel;
  try{channel=new BroadcastChannel(`tend:oauth:${channelId}`)}
  catch{active=false;try{popup.close()}catch{}return Promise.reject(new Error("Your browser could not open secure sign-in. Please use email."))}
  return new Promise((resolve,reject)=>{
    let finished=false,exchanging=false;
    const finish=(error?:Error)=>{
      if(finished)return;finished=true;active=false;
      cancelActive=null;
      window.removeEventListener("message",onMessage);
      try{channel.postMessage({type:"tend:oauth-finished",channel:channelId})}catch{}
      channel.close();
      window.clearTimeout(timeout);
      try{popup.close()}catch{}
      if(error)reject(error);else resolve();
    };
    cancelActive=()=>finish(new Error(oauthErrorMessage("closed")));
    const accept=async(payload:{code?:string;error?:string})=>{
      if(finished||exchanging)return;
      if(payload.error){logAuthEvent("oauth_exchange_fail",{provider,flow,error_code:authErrorCode(payload.error)});finish(new Error(oauthErrorMessage(payload.error)));return;}
      if(!payload.code)return;
      exchanging=true;
      const exchangeStart=Date.now();
      let ok=false;
      try{
        const {data,error}=await supabase.auth.exchangeCodeForSession(payload.code);
        ok=!error&&!!data.session&&!!data.user?.email;
      }catch{ok=false;}
      if(!ok){
        // The return tab may have redeemed the code already (it completes the
        // exchange itself when the opener is severed, e.g. iOS Safari). A live
        // session in shared storage still means the user signed in.
        try{
          const {data}=await supabase.auth.getSession();
          ok=!!data.session?.user?.email;
        }catch{ok=false;}
      }
      if(!ok){
        try{await supabase.auth.signOut({scope:"local"});}catch{}
        logAuthEvent("oauth_exchange_fail",{provider,flow,error_code:"EXCHANGE_FAILED"});
        finish(new Error(oauthErrorMessage("exchange_failed")));return;
      }
      logAuthEvent("oauth_exchange_ok",{provider,flow,duration_ms:Date.now()-exchangeStart});
      finish();
    };
    const onMessage=async(event:MessageEvent)=>{
      if(!isTrustedOAuthMessage(event,origin,popup))return;
      await accept(event.data);
    };
    channel.onmessage=async event=>{if(isTrustedOAuthBroadcast(event.data,channelId))await accept(event.data)};
    window.addEventListener("message",onMessage);
    // OAuth providers may sever the opener and report popup.closed before the
    // user returns. Keep the nonce-scoped channel alive until cancel or timeout.
    const timeout=window.setTimeout(()=>finish(new Error(oauthErrorMessage("timeout"))),180000);
    authorize().then(url=>{
      if(finished)return;
      try{popup.location.href=url;}
      catch{window.location.href=url;} // Popup reference unusable: same-tab fallback. Never settles; the page unloads.
    }).catch(()=>finish(new Error(oauthErrorMessage("provider_error"))));
  });
}
