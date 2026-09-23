import {supabase,SUPABASE_URL} from "./supabase";
import {isTrustedOAuthMessage,oauthErrorMessage,providerOptions,type SocialProvider} from "./oauth-core";
let active=false;

/** The initiating tab owns the PKCE verifier; no browser storage or provider
 * tokens are passed across windows. Only an authorization code is accepted.
 */
export function startSocialSignIn(provider:SocialProvider):Promise<void>{
  if(active)return Promise.reject(new Error("A sign-in window is already open."));
  if(window.self!==window.top)return Promise.reject(new Error(oauthErrorMessage("frame")));
  const popup=window.open("about:blank","_blank","popup,width=520,height=720");
  if(!popup)return Promise.reject(new Error(oauthErrorMessage("blocked")));
  active=true;
  popup.document.title="Sign in to Tend";
  popup.document.body.textContent="Opening secure sign-in…";
  const origin=window.location.origin;
  const redirectTo=origin+window.location.pathname;
  return new Promise((resolve,reject)=>{
    let finished=false,exchanging=false;
    const finish=(error?:Error)=>{
      if(finished)return;finished=true;active=false;
      window.removeEventListener("message",onMessage);
      window.clearInterval(poll);window.clearTimeout(timeout);
      try{popup.close()}catch{}
      if(error)reject(error);else resolve();
    };
    const onMessage=async(event:MessageEvent)=>{
      if(finished||exchanging||!isTrustedOAuthMessage(event,origin,popup))return;
      if(event.data.error){finish(new Error(oauthErrorMessage(event.data.error)));return;}
      if(!event.data.code)return;
      exchanging=true;
      try{
        const {data,error}=await supabase.auth.exchangeCodeForSession(event.data.code);
        if(error||!data.session||!data.user?.email){
          await supabase.auth.signOut({scope:"local"});
          finish(new Error(oauthErrorMessage("exchange_failed")));return;
        }
        finish();
      }catch{finish(new Error(oauthErrorMessage("exchange_failed")))}
    };
    window.addEventListener("message",onMessage);
    const poll=window.setInterval(()=>{if(!exchanging&&popup.closed)finish(new Error(oauthErrorMessage("closed")))},500);
    const timeout=window.setTimeout(()=>finish(new Error(oauthErrorMessage("timeout"))),180000);
    supabase.auth.signInWithOAuth(providerOptions(provider,redirectTo)).then(({data,error})=>{
      if(finished)return;
      if(error||!data.url){finish(new Error("This sign-in provider is not available yet. Please use email."));return;}
      const url=new URL(data.url);
      if(url.origin!==SUPABASE_URL||url.pathname!=="/auth/v1/authorize"){finish(new Error("Unexpected sign-in address."));return;}
      popup.location.href=data.url;
    }).catch(()=>finish(new Error(oauthErrorMessage("provider_error"))));
  });
}
