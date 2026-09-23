import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({ password: z.string().min(8, "Use at least 8 characters.") });

/** True when the URL carries a password-recovery marker (added to redirectTo by the login page). */
export function isRecoveryUrl(href: string): boolean {
  try {
    return new URL(href).searchParams.get("recovery") === "1";
  } catch {
    return false;
  }
}

export default function Recovery() {
  const [status, setStatus] = useState<"verifying" | "ready" | "done" | "error">("verifying");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "" } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      // Remove the single-use code from the address bar before doing anything else.
      history.replaceState(null, "", url.pathname + "#/login");
      if (!code) {
        if (!cancelled) { setStatus("error"); setMessage("This reset link is missing its code. Request a new one from the sign-in page."); }
        return;
      }
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.session) throw error || new Error("That reset link is invalid or has expired. Request a new one from the sign-in page.");
        if (!cancelled) setStatus("ready");
      } catch (e: any) {
        if (!cancelled) { setStatus("error"); setMessage(e.message || "That reset link is invalid or has expired."); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(values: z.infer<typeof schema>) {
    setMessage(""); setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      await supabase.auth.signOut({ scope: "local" });
      setStatus("done");
    } catch (e: any) {
      setMessage(e.message || "Could not update your password. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div><SiteHeader /><main className="max-w-lg mx-auto px-6 py-16">
      <h1 className="text-3xl mb-3">Choose a new password</h1>
      {status === "verifying" && <p role="status" className="text-muted-foreground">Checking your reset link…</p>}
      {status === "error" && <><p role="alert" className="rounded border p-4 text-sm mb-6">{message}</p><Link href="/login" className="brand-button">Back to sign in</Link></>}
      {status === "ready" && (
        <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-5">
          <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>New password</FormLabel><FormControl><Input {...field} type="password" autoComplete="new-password" data-testid="input-new-password" /></FormControl><FormMessage /></FormItem>} />
          <Button className="w-full h-12" disabled={pending} data-testid="button-set-password">{pending ? "Please wait…" : "Set new password"}</Button>
        </form></Form>
      )}
      {status === "done" && <><p role="status" className="rounded border p-4 text-sm mb-6">Your password is updated. Sign in with your new password.</p><Link href="/login" className="brand-button" data-testid="link-recovery-login">Sign in</Link></>}
      {message && status !== "error" && <p role="status" className="rounded border p-4 mt-5 text-sm">{message}</p>}
    </main><SiteFooter /></div>
  );
}
