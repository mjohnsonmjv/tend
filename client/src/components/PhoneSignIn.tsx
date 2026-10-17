import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeUsPhone } from "@/lib/oauth-core";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";

const display = (e164: string) => `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
const validEmail = (v: string) => /.+@.+\..+/.test(v.trim());

/**
 * Sign in with a texted code. A number that is not on any account creates a
 * new Tend account, then the user adds an email (needed for church setup).
 */
export function PhoneSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [emailDone, setEmailDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function send(target: string) {
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithOtp({ phone: target, options: { shouldCreateUser: true, channel: "sms" } });
    setBusy(false);
    if (error) { setMsg(error.message || "Couldn't send a code. Try again in a minute."); return false; }
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
    if (error) { setMsg("That code didn't work. Check it, or send a new one."); return; }
    if (!data.user?.email) { setNeedEmail(true); setMsg(""); return; }
    onSignedIn();
  }
  async function saveEmail(e: React.FormEvent) {
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
    setNeedEmail(false); setEmailDone(next); setMsg("");
  }

  if (!open) return (
    <Button type="button" variant="outline" className="w-full h-auto min-h-12 justify-start px-4 py-3" onClick={() => setOpen(true)} data-testid="button-phone-signin">
      <Smartphone size={18} aria-hidden /><span className="flex-1 text-left">Continue with phone</span>
    </Button>
  );
  return (
    <div className="rounded-md border border-border p-4 space-y-3" data-testid="panel-phone-signin">
      {emailDone ? (
        <div className="space-y-3">
          <p className="text-sm">Your account is ready. We sent a confirmation link to <strong>{emailDone}</strong>.</p>
          <Button type="button" className="w-full" onClick={onSignedIn} data-testid="button-phone-email-continue">Continue</Button>
        </div>
      ) : needEmail ? (
        <form onSubmit={saveEmail} className="space-y-3">
          <p className="text-sm font-medium">One more step: add your email.</p>
          <p className="text-xs text-muted-foreground">Your church setup and receipts need an email address.</p>
          <label className="block text-sm font-medium" htmlFor="phone-email">Email</label>
          <Input id="phone-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-phone-email" />
          <Button type="submit" className="w-full" disabled={busy} data-testid="button-phone-email-save">{busy ? "Saving…" : "Save email"}</Button>
        </form>
      ) : !phone ? (
        <form onSubmit={start} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="phone-signin">Mobile number</label>
          <Input id="phone-signin" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(616) 555-0123" value={raw} onChange={(e) => setRaw(e.target.value)} data-testid="input-phone" />
          <Button type="submit" className="w-full" disabled={busy} data-testid="button-phone-send">{busy ? "Sending…" : "Text me a code"}</Button>
          <p className="text-xs text-muted-foreground">We'll text a 6-digit code. Msg & data rates may apply.</p>
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
      <p className="text-xs text-muted-foreground">US numbers only. Msg & data rates may apply.</p>
    </div>
  );
}
