import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeUsPhone } from "@/lib/oauth-core";
import { logAuthEvent } from "@/lib/auth-telemetry";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";

const display = (e164: string) => `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
const validEmail = (v: string) => /.+@.+\..+/.test(v.trim());

/**
 * Sign in with a texted code. A number that is not on any account creates a
 * new Tend account. When the verified user has no email, onNeedEmail fires so
 * the parent can show the email step (it must live outside this panel: the
 * sign-in page swaps to its signed-in view the moment verification succeeds,
 * which would unmount this panel first).
 */
export function PhoneSignIn({ onSignedIn, onNeedEmail }: { onSignedIn: () => void; onNeedEmail?: () => void }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function send(target: string) {
    setBusy(true); setMsg("");
    // Turnstile removed 2026-10-22: the invisible challenge was failing for
    // real users and blocking every code send. Supabase-side CAPTCHA
    // protection is off to match; rate limits + Twilio Verify fraud guard
    // remain. Re-add bot protection here only with a widget config that
    // passes on real phones.
    const { error } = await supabase.auth.signInWithOtp({ phone: target, options: { shouldCreateUser: true, channel: "sms" } });
    setBusy(false);
    if (error) { setMsg(error.message || "Couldn't send a code. Try again in a minute."); return false; }
    logAuthEvent("phone_code_sent", { provider: "phone" });
    setPhone(target); setWait(60); return true;
  }
  async function start(e: React.FormEvent) {
    e.preventDefault();
    const target = normalizeUsPhone(raw);
    if (!target) { setMsg("Enter a 10-digit US mobile number."); return; }
    await send(target);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !/^\d{6}$/.test(code)) { setMsg("Enter the 6-digit code."); return; }
    setBusy(true); setMsg("");
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
    setBusy(false);
    if (error) {
      setMsg("That code didn't work. Check it, or send a new one.");
      logAuthEvent("phone_code_verify_fail", { provider: "phone",
        error_code: /expired/i.test(error.message) ? "CODE_EXPIRED" : "CODE_INVALID" });
      return;
    }
    logAuthEvent("phone_code_verify_ok", { provider: "phone" });
    if (!data.user?.email && onNeedEmail) { onNeedEmail(); return; }
    onSignedIn();
  }

  if (!open) return (
    <Button type="button" variant="outline" className="w-full h-auto min-h-12 justify-start px-4 py-3" onClick={() => setOpen(true)} data-testid="button-phone-signin">
      <Smartphone size={18} aria-hidden /><span className="flex-1 text-left">Continue with phone</span>
    </Button>
  );
  return (
    <div className="rounded-md border border-border p-4 space-y-3" data-testid="panel-phone-signin">
      {!phone ? (
        <form onSubmit={start} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="phone-signin">Mobile number</label>
          <Input id="phone-signin" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(616) 555-0123" value={raw} onChange={(e) => setRaw(e.target.value)} data-testid="input-phone" />
          <Button type="submit" className="w-full" disabled={busy} data-testid="button-phone-send">{busy ? "Sending…" : "Text me a code"}</Button>
          <p className="text-xs text-muted-foreground">By tapping "Text me a code," you agree to receive a one-time sign-in code by text and to Tend's <a className="underline" href="#/terms">Terms</a> and <a className="underline" href="#/privacy">Privacy Policy</a>. One message per request. Msg & data rates may apply. Reply STOP to opt out, HELP for help.</p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="phone-code">Code sent to {display(phone)}</label>
          <Input id="phone-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} data-testid="input-phone-code" />
          <Button type="submit" className="w-full" disabled={busy} data-testid="button-phone-verify">{busy ? "Checking…" : "Sign in"}</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="underline min-h-11" onClick={() => { setPhone(null); setCode(""); setMsg(""); }}>Use a different number</button>
            <button type="button" className="underline min-h-11 disabled:no-underline disabled:text-muted-foreground" disabled={wait > 0 || busy} onClick={() => phone && send(phone)}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</button>
          </div>
        </form>
      )}
      {msg && <p role="status" className="text-sm text-foreground" data-testid="text-phone-message">{msg}</p>}
    </div>
  );
}

/**
 * Email capture for phone-first signups. Rendered by the parent in its
 * signed-in view, since the phone panel unmounts on verification.
 */
export function PhoneEmailStep({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = email.trim();
    if (!validEmail(next)) { setMsg("Enter a valid email address."); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.updateUser({ email: next });
    setBusy(false);
    if (error) {
      setMsg(/already/i.test(error.message)
        ? "That email is already on a Tend account. Sign in with email instead, or use a different email."
        : error.message || "Couldn't save that email. Try again.");
      return;
    }
    try { sessionStorage.setItem("tend_pending_email", next); } catch { /* private mode */ }
    onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3" data-testid="panel-phone-email">
      <p className="text-sm font-medium">One more step: add your email.</p>
      <p className="text-xs text-muted-foreground">Your church setup and receipts need an email address. We'll send a confirmation link.</p>
      <label className="block text-sm font-medium" htmlFor="phone-email">Email</label>
      <Input id="phone-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-phone-email" />
      <Button type="submit" className="w-full min-h-12" disabled={busy} data-testid="button-phone-email-save">{busy ? "Saving…" : "Save email"}</Button>
      {msg && <p role="status" className="text-sm text-foreground">{msg}</p>}
    </form>
  );
}

/** Lets a signed-in user add or change the phone number they sign in with. */
export function PhoneSettings() {
  const [current, setCurrent] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrent(data.user?.phone ? "+" + data.user.phone.replace(/^\+/, "") : null)); }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const target = normalizeUsPhone(raw);
    if (!target) { setMsg("Enter a 10-digit US mobile number."); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.updateUser({ phone: target });
    setBusy(false);
    if (error) { setMsg(/already/i.test(error.message) ? "That number is already used by another Tend account." : error.message || "Couldn't send a code."); return; }
    setPendingPhone(target);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingPhone || !/^\d{6}$/.test(code)) { setMsg("Enter the 6-digit code."); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.verifyOtp({ phone: pendingPhone, token: code, type: "phone_change" });
    setBusy(false);
    if (error) { setMsg("That code didn't work. Try again."); return; }
    setCurrent(pendingPhone); setPendingPhone(null); setRaw(""); setCode("");
    setMsg("Done. You can now sign in with this number.");
  }

  return (
    <div className="space-y-3" data-testid="panel-phone-settings">
      <p className="text-sm">{current ? <>You can sign in with <strong>{display(current)}</strong>.</> : "Add your mobile number to sign in with a texted code."}</p>
      {!pendingPhone ? (
        <form onSubmit={start} className="flex gap-2 flex-wrap">
          <Input type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(616) 555-0123" value={raw} onChange={(e) => setRaw(e.target.value)} className="max-w-xs" aria-label="Mobile number" data-testid="input-settings-phone" />
          <Button type="submit" disabled={busy} data-testid="button-settings-phone-send">{busy ? "Sending…" : current ? "Change number" : "Add number"}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex gap-2 flex-wrap">
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="max-w-xs" aria-label={`Code sent to ${display(pendingPhone)}`} data-testid="input-settings-phone-code" />
          <Button type="submit" disabled={busy} data-testid="button-settings-phone-verify">{busy ? "Checking…" : "Confirm"}</Button>
        </form>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <p className="text-xs text-muted-foreground">US numbers only. By saving your number, you agree to receive one-time sign-in codes by text. Msg & data rates may apply. Reply STOP to opt out, HELP for help.</p>
    </div>
  );
}
