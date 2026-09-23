import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL="https://hvrdkrtismqbrkbmcgne.supabase.co";
export const SUPABASE_KEY="sb_publishable_UP2-cYmMSsOJsSAvxX2cVw_SS5IyHJZ";

// With persistSession:false, Supabase retains sessions and the PKCE verifier
// in its internal in-memory storage. The popup preserves the initiating tab.
// Publishable key only. Database permissions are enforced by RLS.
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: { flowType:"pkce", persistSession:false, autoRefreshToken:true, detectSessionInUrl:false },
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(20000)})},
  },
);
