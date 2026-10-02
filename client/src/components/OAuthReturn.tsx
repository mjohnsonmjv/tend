import {useEffect,useState} from "react";
import {Logo} from "./Logo";
import {supabase} from "@/lib/supabase";
import {oauthErrorMessage,type OAuthReturn as Callback} from "@/lib/oauth-core";

// How long the return tab waits for the original tab to confirm it redeemed
// the authorization code before completing the exchange itself. iOS Safari
// routinely severs window.opener, evicts the background tab, or ignores
// window.close(), any of which strands this page forever without the fallback.
export const OAUTH_ACK_TIMEOUT_MS=8000;

export function OAuthReturn({payload}:{payload:Callback}){
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let done=false;
    let channel:BroadcastChannel|undefined;
    const goApp=()=>{if(done)return;done=true;window.location.href="/#/app";};
    const fail=(message:string)=>{if(done)return;done=true;setError(message);};

    // No ack from the original tab: finish the sign-in right here. The PKCE
    // verifier lives in this origin's shared localStorage, so this tab can
    // redeem the code even when the opener is gone.
    const finishHere=async()=>{
      if(payload.error){fail(oauthErrorMessage(payload.error));return;}
      if(!payload.code){fail("We couldn't complete sign-in. Please try again from the Tend sign-in page.");return;}
      let ok=false;
      try{
        const {data,error:exchangeError}=await supabase.auth.exchangeCodeForSession(payload.code);
        ok=!exchangeError&&!!data.session;
      }catch{ok=false;}
      if(!ok){
        // The original tab may have redeemed the code first; a live session
        // in shared storage still means the user signed in.
        try{
          const {data}=await supabase.auth.getSession();
          ok=!!data.session;
        }catch{ok=false;}
      }
      if(!ok){fail("We couldn't complete sign-in. Please try again from the Tend sign-in page.");return;}
      goApp();
    };

    if(payload.solo){
      // Same-tab redirect flow (used on iOS instead of a popup): no original
      // tab will ack, so redeem the authorization code immediately.
      void finishHere();
      return ()=>{done=true;};
    }
    const timer=window.setTimeout(finishHere,OAUTH_ACK_TIMEOUT_MS);
    const onAck=(event:MessageEvent)=>{
      if(payload.channel&&event.data?.type==="tend:oauth-finished"&&event.data?.channel===payload.channel){
        window.clearTimeout(timer);
        // The original tab redeemed the code. Try to close; iOS Safari
        // ignores window.close(), so navigate into the app as the fallback.
        try{window.close();}catch{}
        window.setTimeout(goApp,600);
      }
    };

    if(payload.channel){
      try{
        channel=new BroadcastChannel(`tend:oauth:${payload.channel}`);
        channel.onmessage=onAck;
        channel.postMessage(payload);
      }catch{channel=undefined;}
    }
    if(window.opener&&!window.opener.closed){
      try{window.opener.postMessage(payload,window.location.origin);}catch{}
    }
    return ()=>{window.clearTimeout(timer);try{channel?.close();}catch{}};
  },[]);
  return <main className="max-w-lg mx-auto px-6 py-20">
    <Logo showWordmark/><h1 className="text-xl mt-8 mb-4">{error?"We couldn't finish signing you in":"Completing your sign-in"}</h1>
    <p role="status" className="text-muted-foreground leading-relaxed">{error??"Keep this window open for a moment. You will land in Tend automatically."}</p>
    {error&&<a href="/#/login" className="brand-button mt-6" data-testid="link-callback-login">Return to sign in</a>}
  </main>;
}
