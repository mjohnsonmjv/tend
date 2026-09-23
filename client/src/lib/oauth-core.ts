export type SocialProvider="google"|"azure";
export const OAUTH_RETURN="tend:oauth-return";
export type OAuthReturn={type:typeof OAUTH_RETURN;code?:string;error?:string;channel?:string};
export const validOAuthChannel=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9_-]{32,64}$/.test(value);
export function providerOptions(provider:SocialProvider,redirectTo:string){
  return {provider,options:{redirectTo,scopes:"openid email profile",skipBrowserRedirect:true,queryParams:{prompt:"select_account"}}};
}
export function providerFlags(payload:unknown):Record<SocialProvider,boolean>{
  const external=(payload as {external?:Record<string,unknown>})?.external;
  return {google:external?.google===true,azure:external?.azure===true};
}
export function parseOAuthReturn(href:string):OAuthReturn|null{
  const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1));
  const channel=validOAuthChannel(url.searchParams.get("oauth_channel"))?url.searchParams.get("oauth_channel")!:undefined;
  if(url.searchParams.has("code")) {
    const code=url.searchParams.get("code")||"";
    return code.length>0&&code.length<=2048?{type:OAUTH_RETURN,code,channel}:{type:OAUTH_RETURN,error:"invalid_callback",channel};
  }
  if(url.searchParams.has("error")||hash.has("error"))return {type:OAUTH_RETURN,error:(url.searchParams.get("error")||hash.get("error"))==="access_denied"?"access_denied":"provider_error",channel};
  if(hash.has("access_token")||hash.has("refresh_token"))return {type:OAUTH_RETURN,error:"restart_required",channel};
  return null;
}
export function isTrustedOAuthMessage(event:{origin:string;source:unknown;data:unknown},origin:string,popup:unknown):event is {origin:string;source:unknown;data:OAuthReturn}{
  if(!popup||event.source!==popup||event.origin!==origin)return false;
  const value=event.data as OAuthReturn|null;
  if(!value||typeof value!=="object"||value.type!==OAUTH_RETURN)return false;
  return (typeof value.code==="string"&&value.code.length>0&&value.code.length<=2048)||(typeof value.error==="string"&&value.error.length<=100);
}
export function isTrustedOAuthBroadcast(value:unknown,channel:string):value is OAuthReturn{
  const payload=value as OAuthReturn|null;
  if(!payload||typeof payload!=="object"||payload.type!==OAUTH_RETURN||payload.channel!==channel)return false;
  return (typeof payload.code==="string"&&payload.code.length>0&&payload.code.length<=2048)||(typeof payload.error==="string"&&payload.error.length<=100);
}
export function oauthErrorMessage(reason:string){
  if(reason==="access_denied"||reason==="closed")return "Sign-in was canceled. You can try again or use email.";
  if(reason==="blocked")return "Your browser blocked the sign-in window. Allow pop-ups for Tend and try again, or use email.";
  if(reason==="timeout")return "Sign-in timed out. Please try again.";
  if(reason==="frame")return "Social sign-in needs Tend open in its own browser tab, not inside an embedded preview.";
  return "We couldn’t complete sign-in. Please try again from the original Tend sign-in page.";
}
