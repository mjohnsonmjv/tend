import { useEffect, useState } from "react";
import { Link } from "wouter";
import QRCode from "qrcode";
import { ArrowDown, ArrowRight, Check, Heart, LockKeyhole } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Logo } from "@/components/Logo";

export default function Landing() {
  const [qr, setQr] = useState("");
  useEffect(() => {
    const url = `${location.origin}${location.pathname}#/c/demo`;
    QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: "M", color: { dark: "#203e34", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, []);
  return (
    <div className="brand-site">
      <SiteHeader />
      <main id="main-content">
        <section className="tend-hero brand-container">
          <div className="hero-copy">
            <p className="eyebrow">A little closer to your congregation</p>
            <h1>One QR code.<br />A place for<br /><span>every prayer.</span></h1>
            <p className="hero-description">Get a QR code for your church. Your congregation scans it to share prayer needs. You see the requests in one place, ready to pray and follow up.</p>
            <Link className="brand-button" href="/signup" data-testid="link-hero-signup">Get your church’s QR code <ArrowRight size={18} /></Link>
            <p className="hero-note">No app for your congregation to download.</p>
            <Link className="text-action mr-6" href="/demo" data-testid="link-try-inbox">Try the prayer inbox <ArrowRight size={16}/></Link>
            <button className="text-action" data-testid="button-how-it-works" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>See how it works <ArrowDown size={16} /></button>
          </div>
          <div className="hero-demonstration" aria-label="Illustration of a church prayer invitation and pastor inbox">
            <div className="invitation">
              <Logo size={28} showWordmark />
              <p className="invitation-heading">How can we<br />pray for you?</p>
              <p>Big or small.<br />You don’t have to carry it alone.</p>
              <Link href="/c/demo" data-testid="link-demo-qr" aria-label="Open the example prayer form" className="invitation-qr">
                {qr ? <img src={qr} alt="QR code to the example prayer form" width={180} height={180} /> : <div className="qr-loading">Preparing QR code</div>}
              </Link>
              <span className="invitation-caption">Scan to share a prayer request</span>
              <span className="example-label">Example invitation</span>
            </div>
            <div className="inbox-example">
              <div className="inbox-example-top"><span><Heart size={16} /> Prayer inbox</span><span className="sample-label">Example</span></div>
              <div className="example-person"><span className="initial-avatar">JM</span><div><strong>Jordan M.</strong><span>Prayer request</span></div><span className="new-label">New</span></div>
              <p>My mom has surgery this week. Please pray for peace for our family.</p>
              <div className="example-footer"><Check size={14} /> Received and ready for your care</div>
            </div>
          </div>
        </section>

        <section className="promise-strip"><div className="brand-container"><span>Less administration.</span><strong>More room to care.</strong><span>That’s Tend.</span></div></section>

        <section id="how-it-works" className="brand-container how-section">
          <div className="section-intro"><p className="eyebrow">From a scan to a conversation</p><h2>A simple invitation.<br />A meaningful connection.</h2><p>Give people an easy way to tell you what’s on their hearts. Keep the technology out of the way.</p></div>
          <div className="steps-list">
            {[
              ["01", "Make it yours.", "Create your church’s prayer page and welcome message. Tend generates the QR code for you."],
              ["02", "Put it where people gather.", "Download your code for the bulletin or screen. Print a poster for the lobby. The same code keeps working."],
              ["03", "See the need. Take the next step.", "Read requests in your prayer inbox. Mark what you’re praying for and keep notes for your next conversation."]
            ].map(([n, title, body]) => <article className="step-row" key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}
          </div>
        </section>

        <section className="care-section">
          <div className="brand-container care-grid">
            <div><p className="eyebrow">Built around people, not paperwork</p><h2>Some things are<br />hard to say<br />on a Sunday.</h2><p>A quiet place to share can open the door to a real conversation. Tend helps you make that invitation.</p></div>
            <div className="care-details">
              <article><LockKeyhole size={22} /><div><h3>Let people choose how to share.</h3><p>Leave a name and a phone number for follow-up, or submit without identifying details.</p></div></article>
              <article><Heart size={22} /><div><h3>Remember the person behind the request.</h3><p>Move from new to praying to prayed for. Keep the context together so your next conversation starts with care.</p></div></article>
              <p className="care-principle">The care is yours.<br />Tend helps you keep track.</p>
            </div>
          </div>
        </section>

        <section className="brand-container closing-section">
          <div><p className="eyebrow">An open invitation</p><h2>Make room for<br />every prayer.</h2></div>
          <div><p>Start with one QR code for your church.<br />Let the conversations grow from there.</p><Link className="brand-button" href="/signup" data-testid="link-cta-signup">Get your church’s QR code <ArrowRight size={18} /></Link></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
