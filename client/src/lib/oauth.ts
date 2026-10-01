import {supabase,SUPABASE_URL} from "./supabase";
import {isTrustedOAuthBroadcast,isTrustedOAuthMessage,oauthErrorMessage,providerOptions,type SocialProvider} from "./oauth-core";
let active=false;
let cancelActive:(()=>void)|null=null;
export function cancelSocialSignIn(){cancelActive?.()}

/** The initiating tab owns the PKCE verifier; no browser storage or provider
 * tokens are passed across windows. Only an authorization code is accepted.
 */
export function startSocialSignIn(provider:SocialProvider):Promise<void>{
  if(active)return Promise.reject(new Error("A sign-in window is already open."));
  if(window.self!==window.top)return Promise.reject(new Error(oauthErrorMessage("frame")));
  if(typeof BroadcastChannel==="undefined")return Promise.reject(new Error("Please update your browser to use Google sign-in, or use email."));
  const popup=window.open("about:blank","_blank","popup,width=520,height=720");
  if(!popup)return Promise.reject(new Error(oauthErrorMessage("blocked")));
  active=true;
  popup.document.title="Sign in to Tend";
  popup.document.body.textContent="Opening secure sign-in…";
  const origin=window.location.origin;
  const channelId=Array.from(crypto.getRandomValues(new Uint8Array(24)),value=>value.toString(16).padStart(2,"0")).join("");
  let channel:BroadcastChannel;
  try{channel=new BroadcastChannel(`tend:oauth:${channelId}`)}
  catch{active=false;popup.close();return Promise.reject(new Error("Your browser could not open secure sign-in. Please use email."))}
  const redirectTo=origin+window.location.pathname+`?oauth_channel=${channelId}`;
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
      if(payload.error){finish(new Error(oauthErrorMessage(payload.error)));return;}
      if(!payload.code)return;
      exchanging=true;
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
        finish(new Error(oauthErrorMessage("exchange_failed")));return;
      }
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
    supabase.auth.signInWithOAuth(providerOptions(provider,redirectTo)).then(({data,error})=>{
      if(finished)return;
      if(error||!data.url){finish(new Error("This sign-in provider is not available yet. Please use email."));return;}
      const url=new URL(data.url);
      if(url.origin!==SUPABASE_URL||url.pathname!=="/auth/v1/authorize"){finish(new Error("Unexpected sign-in address."));return;}
      popup.location.href=data.url;
    }).catch(()=>finish(new Error(oauthErrorMessage("provider_error"))));
  });
}
