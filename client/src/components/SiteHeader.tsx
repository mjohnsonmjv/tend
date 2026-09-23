import { Link } from "wouter";
import { Logo } from "./Logo";
import { ArrowRight } from "lucide-react";
import { useAuth } from "./Auth";

export function SiteHeader() {
  const {session}=useAuth();
  return (
    <header className="brand-header">
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); document.querySelector("main")?.focus(); document.querySelector("main")?.scrollIntoView(); }}>Skip to content</a>
      <div className="brand-container header-inner">
        <Link href="/" data-testid="link-home" aria-label="Tend home"><Logo size={34} showWordmark /></Link>
        <nav aria-label="Main navigation">
          <Link href={session?"/app":"/login"} data-testid="link-login">{session?"My churches":"Sign in"}</Link>
          <Link href="/pricing" data-testid="link-pricing">Pricing</Link>
          <Link href="/signup" data-testid="link-signup" className="header-cta">{session?"New church":"Get your QR code"} <ArrowRight size={16} /></Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="brand-footer">
      <div className="brand-container footer-inner">
        <div><Link href="/" data-testid="link-footer-home"><Logo size={30} showWordmark /></Link><p>Make room for every prayer.</p></div>
        <div className="footer-links"><Link href="/pricing" data-testid="link-footer-pricing">Pricing</Link><Link href="/signup" data-testid="link-footer-signup">Create your church</Link></div>
        <span className="footer-scripture">Inspired by 1 Peter 5:2</span>
      </div>
      <p className="preview-notice">Pilot version. Pastor login and church-specific access are enabled. Billing and automated notifications are not active.</p>
    </footer>
  );
}
