import { Link } from "wouter";
import { Logo } from "./Logo";
import { ArrowRight } from "lucide-react";
import { useAuth } from "./Auth";
import { supabase } from "@/lib/supabase";

export function SiteHeader() {
  const {session}=useAuth();
  async function signOut(){ await supabase.auth.signOut().catch(()=>{}); window.location.href="/login"; }
  return (
    <header className="brand-header">
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); const m = document.querySelector("main"); if (m) { m.setAttribute("tabindex", "-1"); (m as HTMLElement).focus({ preventScroll: true }); m.scrollIntoView(); } }}>Skip to content</a>
      <div className="brand-container header-inner">
        <Link href="/" data-testid="link-home" aria-label="Tend home"><Logo size={34} showWordmark /></Link>
        <nav aria-label="Main navigation">
          <Link href={session?"/app":"/login"} data-testid="link-login">{session?"My churches":"Sign in"}</Link>
          <Link href="/pricing" data-testid="link-pricing">Pricing</Link>
          {session&&<button type="button" onClick={signOut} data-testid="button-signout">Sign out</button>}
          <Link href="/signup" data-testid="link-signup" className="header-cta">{session?"New church or group":"Get your QR code"} <ArrowRight size={16} /></Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="brand-footer">
      <div className="brand-container footer-inner">
        <div><Link href="/" data-testid="link-footer-home"><Logo size={30} showWordmark /></Link><p>Make room for every prayer.</p><p>100% of profits donated to support Compassion International orphans.</p></div>
        <div className="footer-links"><Link href="/pricing" data-testid="link-footer-pricing">Pricing</Link><Link href="/signup" data-testid="link-footer-signup">Create your church or group</Link><Link href="/privacy" data-testid="link-footer-privacy">Privacy</Link><Link href="/terms" data-testid="link-footer-terms">Terms</Link><Link href="/text" data-testid="link-footer-text">Text a prayer request</Link><a href="mailto:support@tendpray.com" data-testid="link-footer-contact">support@tendpray.com</a></div>
        <span className="footer-scripture">Inspired by 1 Peter 5:2</span>
      </div>
    </footer>
  );
}
