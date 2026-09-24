import { createHandler } from "./handler.ts";

// Supabase supplies these public credentials to hosted functions. No service-role
// credential is required: the database RPC authorizes each signed delivery.
let publishable = "";
try {
  publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? "";
} catch { /* Legacy public key remains a supported fallback. */ }

Deno.serve(createHandler({
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  publicKey: publishable || Deno.env.get("SUPABASE_ANON_KEY") || "",
  resendKey: Deno.env.get("RESEND_API_KEY") ?? "",
  from: Deno.env.get("CONFIRM_FROM") || "Tend <support@tendpray.com>",
}));
