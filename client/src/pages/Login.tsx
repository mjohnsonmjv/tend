import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { Form,FormField,FormItem,FormLabel,FormControl,FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SiteHeader,SiteFooter } from "@/components/SiteHeader";
import { useAuth } from "@/components/Auth";
import { useQuery } from "@tanstack/react-query";
import { startSocialSignIn } from "@/lib/oauth";
import type {SocialProvider} from "@/lib/oauth-core";
import { SiGoogle } from "react-icons/si";

const schema=z.object({email:z.string().email("Enter a valid email address."),password:z.string().min(8,"Use at least 8 characters.")});
export default function Login({register=false}:{register?:boolean}) {
  const [,navigate]=useLocation();
  const {session}=useAuth();
  const [message,setMessage]=useState("");
  const [pending,setPending]=useState(false);
  const [accepted,setAccepted]=useState(false);
  const [socialPending,setSocialPending]=useState<SocialProvider|null>(null);
  const providers=useQuery<Record<SocialProvider,boolean>>({queryKey:["/api/auth/providers"],enabled:!session,staleTime:30000});
  // Microsoft is paused. Only Google's availability controls this section.
  const socialVisible=providers.isError||!providers.data||providers.data.google;
  async function social(provider:SocialProvider){
    setMessage("");setSocialPending(provider);
    try{await startSocialSignIn(provider);navigate("/app");}
    catch(error:any){setMessage(error.message||"Unable to sign in. Try email instead.")}
    finally{setSocialPending(null)}
  }
  const form=useForm<z.infer<typeof schema>>({resolver:zodResolver(schema),defaultValues:{email:"",password:""}});
  async function submit(values:z.infer<typeof schema>){
    setMessage("");setPending(true);
    try{
      if(register){
        const {data,error}=await supabase.auth.signUp({...values,options:{emailRedirectTo:location.origin+location.pathname}});
        if(error) throw error;
        if(data.session) navigate("/signup");
        else setMessage("Check your email to confirm your account, then return here to sign in. If the email is delayed, check spam. Already registered? Use Sign in.");
      } else {
        const {error}=await supabase.auth.signInWithPassword(values);
        if(error) throw error;
        navigate("/app");
      }
    }catch(e:any){setMessage(e.message || "Unable to sign in. Please try again.");}
    finally{setPending(false)}
  }
  async function forgotPassword(){
    const email=form.getValues("email");
    if(!email||!/.+@.+\..+/.test(email)){setMessage("Enter your email address above first, then choose Forgot password.");return;}
    setMessage("");setPending(true);
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname+"?recovery=1"});
      if(error) throw error;
      setMessage("If that email has a Tend account, a reset link is on its way. Give it a minute, and check spam.");
    }catch(e:any){setMessage(e.message || "Could not send a reset link. Try again.");}
    finally{setPending(false)}
  }
  return <div><SiteHeader/><main className="max-w-lg mx-auto px-6 py-16">
    <h1 className="text-3xl mb-3">{register?"Create your pastor account":"Welcome back."}</h1>
    <p className="text-muted-foreground mb-8">{register?"Use a supported sign-in provider or create an email account. Then set up your church and its QR code.":"Sign in to your church’s prayer inbox."}</p>
    {session ? <Link className="brand-button" href="/app">Open my churches</Link> :
    <>{socialVisible&&<><div className="space-y-3 mb-7" aria-label="Social sign-in options">
      {(["google"] as const).map(provider=>{
        const label="Google";
        const Icon=SiGoogle;
        return <Button key={provider} type="button" variant="outline" className="w-full h-auto min-h-12 flex-wrap justify-start px-4 py-3" onClick={()=>social(provider)} disabled={pending||!!socialPending||providers.data?.[provider]!==true} data-testid={`button-oauth-${provider}`}>
          <Icon size={18} aria-hidden/><span className="flex-1 text-left">{socialPending===provider?`Connecting to ${label}…`:`Continue with ${label}`}</span>
          {providers.data?.[provider]!==true&&<span className="text-xs text-muted-foreground">{providers.isLoading?"Checking…":providers.isError?"Unavailable":"Setup pending"}</span>}
        </Button>;
      })}
      {providers.isError?<div className="text-xs text-muted-foreground" role="status">Couldn’t check social sign-in. Email sign-in is still available. <button type="button" className="underline min-h-11" onClick={()=>providers.refetch()} data-testid="button-retry-providers">Try again</button></div>:
        providers.data&&!providers.data.google?<p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-provider-setup">Google sign-in is not active yet. You can use email below.</p>:<p className="text-xs text-muted-foreground leading-relaxed">Only basic identity is requested. No access to your inbox, contacts, calendar, or church directory.</p>}
      {socialPending&&<p role="status" className="text-sm text-primary">Finish signing in in the new window. Keep this page open.</p>}
    </div><div className="relative border-t mb-7"><span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">or continue with email</span></div></>}
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-5">
      <FormField control={form.control} name="email" render={({field})=><FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" autoComplete="email" data-testid="input-auth-email"/></FormControl><FormMessage/></FormItem>}/>
      <FormField control={form.control} name="password" render={({field})=><FormItem><FormLabel>Password</FormLabel><FormControl><Input {...field} type="password" autoComplete={register?"new-password":"current-password"} data-testid="input-auth-password"/></FormControl><FormMessage/></FormItem>}/>
      {register&&<label className="flex items-start gap-3 text-sm cursor-pointer">
        <Checkbox checked={accepted} onCheckedChange={(v)=>setAccepted(v===true)} className="mt-0.5 shrink-0" data-testid="checkbox-terms"/>
        <span className="text-muted-foreground">I agree to the <Link href="/terms" className="underline text-foreground">Terms of Service</Link> and <Link href="/privacy" className="underline text-foreground">Privacy Policy</Link>.</span>
      </label>}
      <Button className="w-full h-12" disabled={pending||!!socialPending||(register&&!accepted)} data-testid="button-auth-submit">{pending?"Please wait…":register?"Create email account":"Sign in with email"}</Button>
    </form></Form>
    {!register&&<p className="text-sm mt-4 text-center"><button type="button" className="underline min-h-11" onClick={forgotPassword} disabled={pending} data-testid="link-forgot-password">Forgot password?</button></p>}
    {message && <p role="status" className="rounded border p-4 mt-5 text-sm" data-testid="text-auth-message">{message}</p>}
    </>}
    <p className="text-sm mt-6">{register?"Already have an account?":"New to Tend?"} <Link href={register?"/login":"/signup"} className="underline" data-testid="link-auth-switch">{register?"Sign in":"Create an account"}</Link></p>
    <p className="text-xs mt-5 text-muted-foreground">For privacy, sessions are kept in memory. Refreshing or closing the page requires signing in again. Your church data stays saved.</p>
  </main><SiteFooter/></div>;
}
