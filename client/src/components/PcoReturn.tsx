import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "./Logo";

const PCO_ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Planning Center sign-in before it finished.",
  not_configured: "Planning Center sign-in is not set up yet. Please use email instead.",
  invalid_callback: "Planning Center did not return a valid sign-in response. Please try again.",
  invalid_state: "This sign-in attempt expired. Please try again.",
  exchange_failed: "Planning Center could not complete the sign-in. Please try again.",
  identity_failed: "Planning Center did not return your profile. Please try again.",
  no_email: "Planning Center did not share an email address, so Tend could not create your account.",
  account_failed: "Tend could not set up your account. Please try again or use email.",
  ticket_failed: "Tend could not finish your sign-in. Please try again.",
  server_error: "Something went wrong during sign-in. Please try again.",
};

export function parsePcoReturn(href: string): { ticket?: string; error?: string } | null {
  const url = new URL(href);
  const ticket = url.searchParams.get("pco_ticket") || "";
  const error = url.searchParams.get("pco_error") || "";
  if (!ticket && !error) return null;
  if (ticket && !/^[A-Za-z0-9_-]{16,128}$/.test(ticket)) return { error: "invalid_callback" };
  return { ticket: ticket || undefined, error: error.slice(0, 64) || undefined };
}

export function PcoReturn({ ticket, error, onDone }: { ticket?: string; error?: string; onDone: () => void }) {
  const [message, setMessage] = useState("Completing your sign-in…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ticket) {
        if (!cancelled) {
          setMessage(PCO_ERRORS[error || ""] || "Planning Center sign-in did not complete. Please try again.");
          setFailed(true);
        }
        return;
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: ticket, type: "email" });
      if (cancelled) return;
      if (verifyError) {
        setMessage("This sign-in link has expired or was already used. Please try again.");
        setFailed(true);
        return;
      }
      // Session is established in memory; hand back to the app without reloading.
      window.history.replaceState(null, "", "/#/app");
      onDone();
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <main className="max-w-lg mx-auto px-6 py-20">
      <Logo showWordmark />
      <h1 className="text-xl mt-8 mb-4">{failed ? "Sign-in did not complete" : "Signing you in"}</h1>
      <p role="status" className="text-muted-foreground leading-relaxed">{message}</p>
      {failed && <a href="./#/login" className="brand-button mt-6" data-testid="link-pco-login">Back to sign in</a>}
    </main>
  );
}
