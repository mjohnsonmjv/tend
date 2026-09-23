import {useEffect,useState} from "react";
import {Logo} from "./Logo";
import type {OAuthReturn as Callback} from "@/lib/oauth-core";

export function OAuthReturn({payload}:{payload:Callback}){
  const [waiting,setWaiting]=useState(false);
  useEffect(()=>{
    if(!window.opener||window.opener.closed)return;
    try{
      window.opener.postMessage(payload,window.location.origin);
      setWaiting(true);
    }catch{}
  },[]);
  return <main className="max-w-lg mx-auto px-6 py-20">
    <Logo showWordmark/><h1 className="text-xl mt-8 mb-4">{waiting?"Completing your sign-in":"Return to the Tend sign-in page"}</h1>
    <p role="status" className="text-muted-foreground leading-relaxed">{waiting?"Keep your original Tend window open. This window will close when sign-in completes. If it stays open, close it and try again from Tend.":"For your security, this link cannot sign you in on its own. If you just confirmed your email, you can now return to Tend and sign in."}</p>
    {!waiting&&<a href="./#/login" className="brand-button mt-6" data-testid="link-callback-login">Return to sign in</a>}
  </main>;
}
