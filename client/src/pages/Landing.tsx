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
        <section className="tend-hero hero-photo">
          <div className="brand-container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Inspired by 1 Peter 5:2</p>
            <h1>The easiest way to<br />collect <span>prayer requests.</span></h1>
            <p className="hero-description">Sign up in minutes. Tend builds your church's prayer page and QR code. Drop the code on your announcement slides or print it on the weekly cards. Your people scan it, and every request lands in one inbox, ready for care and follow-up.</p>
            <Link className="brand-button" href="/signup" data-testid="link-hero-signup">Get your church’s QR code <ArrowRight size={18} /></Link>
            <p className="hero-note">No app for your congregation to download.</p>
            <Link className="text-action mr-6" href="/demo" data-testid="link-try-inbox">Try the prayer inbox <ArrowRight size={16}/></Link>
            <button className="text-action" data-testid="button-how-it-works" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>See how it works <ArrowDown size={16} /></button>
          </div>
          <div className="hero-demonstration" aria-label="Illustration of a church prayer invitation and prayer inbox">
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
          </div>
        </section>

        <section className="promise-strip photo-band"><div className="brand-container"><span>"Tend the flock of God."</span><strong>That is why we are called Tend.</strong><span>1 Peter 5:2</span></div></section>

        <section id="how-it-works" className="brand-container how-section">
          <div className="section-intro"><p className="eyebrow">From a scan to a conversation</p><h2>A simple invitation.<br />A meaningful connection.</h2><p>Give people an easy way to tell you what’s on their hearts. Keep the technology out of the way.</p></div>
          <div className="steps-list">
            {[
              ["01", "Anyone can set it up.", "You do not need to be the pastor. A staff member, a volunteer, a committee, or a giver who wants to sponsor prayer for the church can create the prayer page in minutes. Tend generates the QR code for you."],
              ["02", "Put it where people gather.", "Download your code for the bulletin or screen. Print a poster for the lobby. The same code keeps working."],
              ["03", "See the need. Take the next step.", "Read requests in your prayer inbox. Mark what you’re praying for and keep notes for your next conversation."]
            ].map(([n, title, body]) => <article className="step-row" key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}
          </div>
        </section>

        <section className="brand-container who-section">
          <div className="kit-intro">
          <div className="section-intro"><p className="eyebrow">Every Sunday, everywhere</p><h2>One code.<br />Slides, cards, lobby.</h2><p>The same QR code works wherever you put it. Drop it into your announcement slides, print it on the weekly cards, hang the poster in the lobby. When someone feels the nudge to ask for prayer, the invitation is already there.</p></div>
          <div className="kit-previews">
            <img src="/kit/tend-announcement-slide.png" alt="Preview of the Tend announcement slide" loading="lazy" />
            <img src="/kit/tend-pew-card.png" alt="Preview of the Tend printed prayer card" loading="lazy" />
          </div>
          </div>
          <div className="who-grid">
            <article><h3>Announcement slide</h3><p>A ready-made slide for your Sunday screens. Add your church's QR code and it is done.</p><p><a className="text-action" href="/kit/tend-announcement-slide.pdf" data-testid="link-kit-slide">Download the slide (PDF) <ArrowRight size={16} /></a></p></article>
            <article><h3>Printed card</h3><p>A card for the bulletin or the seat backs. Print a stack each week.</p><p><a className="text-action" href="/kit/tend-pew-card.pdf" data-testid="link-kit-card">Download the card (PDF) <ArrowRight size={16} /></a></p></article>
            <article><h3>Lobby poster</h3><p>Your dashboard generates a printable poster with your church's QR code on it.</p><p><Link className="text-action" href="/signup" data-testid="link-kit-poster">Get your QR code <ArrowRight size={16} /></Link></p></article>
          </div>
        </section>

        <section className="brand-container who-section">
          <div className="section-intro"><p className="eyebrow">It starts with one person</p><h2>You do not have to<br />be the pastor.</h2><p>Tend was made to be started by whoever cares enough to begin. If that is you, your church's prayer page and QR code can be ready in minutes.</p></div>
          <div className="who-grid">
            <article><h3>Pastors and staff</h3><p>Open a door that never closes. Let people share prayer needs the moment they feel them, not just on Sunday morning.</p></article>
            <article><h3>Volunteers and committees</h3><p>No technical background needed. Create the page, download the QR code, and put it in the bulletin or on the lobby screen.</p></article>
            <article><h3>Givers</h3><p>Sponsor Tend for your church. It is a simple gift that helps build a lasting culture of prayer.</p></article>
          </div>
        </section>

        <section className="care-section">
          <div className="brand-container care-grid">
            <div><p className="eyebrow">Built around people, not paperwork</p><h2>Some things are<br />hard to say<br />on a Sunday.</h2><p>Getting prayer requests out of people is one of the hardest parts of church life. A quiet, simple invitation can open the door to a real conversation. Tend helps your church build a culture where asking for prayer feels natural.</p></div>
            <div className="care-details">
              <article><LockKeyhole size={22} /><div><h3>Let people choose how to share.</h3><p>Leave a name and a phone number for follow-up, or submit without identifying details.</p></div></article>
              <article><Heart size={22} /><div><h3>Remember the person behind the request.</h3><p>Move from new to praying to prayed for. Keep the context together so your next conversation starts with care.</p></div></article>
              <p className="care-principle">The care is yours.<br />Tend helps you keep track.</p>
            </div>
          </div>
        </section>

        <section className="closing-section photo-band">
          <div className="brand-container closing-inner">
          <div><p className="eyebrow">An open invitation</p><h2>Grow a culture<br />of prayer.</h2></div>
          <div><p>Start with one QR code for your church.<br />Let the conversations grow from there.</p><Link className="brand-button" href="/signup" data-testid="link-cta-signup">Get your church’s QR code <ArrowRight size={18} /></Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
