import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL="https://hvrdkrtismqbrkbmcgne.supabase.co";
export const SUPABASE_KEY="sb_publishable_UP2-cYmMSsOJsSAvxX2cVw_SS5IyHJZ";

// With persistSession:false, Supabase keeps sessions in internal in-memory
// storage so they never touch disk. But the PKCE code verifier MUST survive
// a full-page navigation (iOS same-tab OAuth redirect) and background-tab
// eviction (iOS severs popup openers and discards the initiating tab), so
// *-code-verifier keys are mirrored to localStorage. Sessions stay ephemeral.
// Publishable key only. Database permissions are enforced by RLS.
const VERIFIER_SUFFIX="-code-verifier";
const memoryFallback=new Map<string,string>();
const hybridStorage={
  getItem(key:string):string|null{
    if(!key.endsWith(VERIFIER_SUFFIX))return memoryFallback.get(key)??null;
    try{const v=window.localStorage.getItem(key);if(v!=null)return v;}catch{/* private mode */}
    return memoryFallback.get(key)??null;
  },
  setItem(key:string,value:string):void{
    if(key.endsWith(VERIFIER_SUFFIX)){try{window.localStorage.setItem(key,value);}catch{/* private mode */}}
    memoryFallback.set(key,value);
  },
  removeItem(key:string):void{
    if(key.endsWith(VERIFIER_SUFFIX)){try{window.localStorage.removeItem(key);}catch{/* private mode */}}
    memoryFallback.delete(key);
  },
};
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: { flowType:"pkce", persistSession:false, autoRefreshToken:true, detectSessionInUrl:false, storage:hybridStorage },
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(20000)})},
  },
);
