import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Logo } from "./Logo";

const AuthContext = createContext<{session:Session|null; loading:boolean}>({session:null,loading:true});
export function AuthProvider({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,current)=>{
      if(event==="SIGNED_OUT" || event==="SIGNED_IN") queryClient.clear();
      setSession(current); setLoading(false);
    });
    return ()=>subscription.unsubscribe();
  },[]);
  return <AuthContext.Provider value={{session,loading}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
export function RequireAuth({children}:{children:ReactNode}) {
  const {session,loading}=useAuth();
  if(loading) return <div className="p-12 text-center" role="status">Checking your session…</div>;
  if(!session) return <main className="max-w-lg mx-auto px-6 py-20"><Logo showWordmark/><h1 className="text-xl mt-10 mb-4">Your church’s prayer inbox is private.</h1><p className="mb-6 text-muted-foreground">Sign in with your Tend account to continue. Only accounts that own a church can access its requests.</p><Link href="/login" className="brand-button" data-testid="link-required-login">Sign in</Link></main>;
  return <>{children}</>;
}
