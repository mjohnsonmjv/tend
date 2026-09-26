import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight, Check, Heart, LockKeyhole } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

const EASE_OUT = "easeOut" as const;

/** Fade-up reveal when scrolled into view. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

const EXAMPLE_REQUESTS = [
  { name: "Jordan M.", initials: "JM", text: "My mom has surgery this week. Please pray for peace for our family." },
  { name: "Sam R.", initials: "SR", text: "Starting a new job on Monday. Pray I find my footing and good people around me." },
  { name: "Priya K.", initials: "PK", text: "Our neighbor lost her husband last month. Pray for comfort for their family." },
];

/** Hero visual: the Tend invitation on a large church's screens, above a cycling example inbox. */
function HeroVisual() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % EXAMPLE_REQUESTS.length), 5200);
    return () => clearInterval(id);
  }, [reduceMotion, paused]);

  const request = EXAMPLE_REQUESTS[index];

  return (
    <motion.div
      className="hero-visual"
      aria-label="Example of the Tend prayer inbox"
      initial={{ opacity: 0, y: 44, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.35, ease: EASE_OUT }}
    >
      <div className="inbox-example"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        aria-label="Example prayer inbox (auto-rotating demo, pauses on hover or focus)">
        <div className="inbox-example-top"><span><span className="live-dot" aria-hidden="true" /><Heart size={16} /> Prayer inbox</span><span className="sample-label">Example</span></div>
        <div aria-live="off">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            <div className="example-person"><span className="initial-avatar">{request.initials}</span><div><strong>{request.name}</strong><span>Prayer request</span></div><span className="new-label">New</span></div>
            <p>{request.text}</p>
          </motion.div>
        </AnimatePresence>
        </div>
        <div className="example-footer"><Check size={14} /> Received and ready for your care</div>
      </div>
    </motion.div>
  );
}

export default function Landing() {
  const heroItem = (delay: number) => ({
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.65, delay, ease: EASE_OUT },
  });

  return (
    <MotionConfig reducedMotion="user">
    <div className="brand-site">
      <SiteHeader />
      <main id="main-content">
        <section className="tend-hero">
          <div className="brand-container hero-grid">
          <div className="hero-copy">
            <motion.p className="eyebrow" {...heroItem(0)}>Inspired by 1 Peter 5:2</motion.p>
            <motion.h1 {...heroItem(0.1)}>The easiest way to<br />collect <span>prayer requests.</span></motion.h1>
            <motion.p className="hero-description" {...heroItem(0.2)}>Sign up in minutes. Tend builds your church's prayer page and QR code. Drop the code on your announcement slides or print it on the weekly cards. Your people scan it, and every request lands in one inbox, ready for care and follow-up.</motion.p>
            <motion.div {...heroItem(0.3)}>
              <Link className="brand-button" href="/signup" data-testid="link-hero-signup">Get your church’s QR code <ArrowRight size={18} /></Link>
            </motion.div>
            <motion.p className="hero-note" {...heroItem(0.38)}>No app for your congregation to download.</motion.p>
            <motion.div {...heroItem(0.46)}>
              <Link className="text-action mr-6" href="/demo" data-testid="link-try-inbox">Try the prayer inbox <ArrowRight size={16}/></Link>
              <button className="text-action" data-testid="button-how-it-works" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>See how it works <ArrowDown size={16} /></button>
            </motion.div>
          </div>
          <HeroVisual />
          </div>
        </section>

        <section className="promise-strip photo-band"><div className="brand-container"><Reveal><span>"Tend the flock of God."</span><strong>That is why we are called Tend.</strong><span>1 Peter 5:2</span></Reveal></div></section>

        <section id="how-it-works" className="brand-container how-section">
          <Reveal className="section-intro"><p className="eyebrow">From a scan to a conversation</p><h2>A simple invitation.<br />A meaningful connection.</h2><p>Give people an easy way to tell you what’s on their hearts. Keep the technology out of the way.</p></Reveal>
          <div className="steps-list">
            {[
              ["01", "Anyone can set it up.", "You do not need to be the pastor. A staff member, a volunteer, a committee, or a giver who wants to sponsor prayer for the church can create the prayer page in minutes. Tend generates the QR code for you."],
              ["02", "Put it where people gather.", "Download your code for the bulletin or screen. Print a poster for the lobby. The same code keeps working."],
              ["03", "See the need. Take the next step.", "Read requests in your prayer inbox. Mark what you’re praying for and keep notes for your next conversation."]
            ].map(([n, title, body], i) => (
              <Reveal key={n} delay={i * 0.08}>
                <article className="step-row"><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="brand-container who-section">
          <div className="kit-intro">
          <Reveal className="section-intro"><p className="eyebrow">Every Sunday, everywhere</p><h2>One code.<br />Slides, cards, lobby.</h2><p>The same QR code works wherever you put it. Drop it into your announcement slides, print it on the weekly cards, hang the poster in the lobby. When someone feels the nudge to ask for prayer, the invitation is already there.</p></Reveal>
          <div className="kit-previews">
            <motion.img src="/kit/tend-announcement-slide.png" alt="Preview of the Tend announcement slide" loading="lazy"
              initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-70px" }}
              transition={{ duration: 0.6, ease: EASE_OUT }} whileHover={{ y: -6, scale: 1.02 }} />
            <motion.img src="/kit/tend-pew-card.png" alt="Preview of the Tend printed prayer card" loading="lazy"
              initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-70px" }}
              transition={{ duration: 0.6, delay: 0.12, ease: EASE_OUT }} whileHover={{ y: -6, scale: 1.02 }} />
          </div>
          </div>
          <div className="who-grid">
            {[
              ["Announcement slide", "A ready-made slide for your Sunday screens. Add your church's QR code and it is done.", <p key="l"><a className="text-action" href="/kit/tend-announcement-slide.pdf" data-testid="link-kit-slide">Download the slide (PDF) <ArrowRight size={16} /></a></p>],
              ["Printed card", "A card for the bulletin or the seat backs. Print a stack each week.", <p key="l"><a className="text-action" href="/kit/tend-pew-card.pdf" data-testid="link-kit-card">Download the card (PDF) <ArrowRight size={16} /></a></p>],
              ["Lobby poster", "Your dashboard generates a printable poster with your church's QR code on it.", <p key="l"><Link className="text-action" href="/signup" data-testid="link-kit-poster">Get your QR code <ArrowRight size={16} /></Link></p>],
            ].map(([title, body, link], i) => (
              <Reveal key={title as string} delay={i * 0.08}>
                <article><h3>{title}</h3><p>{body}</p>{link}</article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="brand-container who-section">
          <Reveal className="section-intro"><p className="eyebrow">It starts with one person</p><h2>You do not have to<br />be the pastor.</h2><p>Tend was made to be started by whoever cares enough to begin. If that is you, your church's prayer page and QR code can be ready in minutes.</p></Reveal>
          <div className="who-grid">
            {[
              ["Pastors and staff", "Open a door that never closes. Let people share prayer needs the moment they feel them, not just on Sunday morning."],
              ["Volunteers and committees", "No technical background needed. Create the page, download the QR code, and put it in the bulletin or on the lobby screen."],
              ["Givers", "Sponsor Tend for your church. It is a simple gift that helps build a lasting culture of prayer."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 0.08}>
                <article><h3>{title}</h3><p>{body}</p></article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="care-section">
          <div className="brand-container care-grid">
            <Reveal><p className="eyebrow">Built around people, not paperwork</p><h2>Some things are<br />hard to say<br />on a Sunday.</h2><p>Getting prayer requests out of people is one of the hardest parts of church life. A quiet, simple invitation can open the door to a real conversation. Tend helps your church build a culture where asking for prayer feels natural.</p></Reveal>
            <div className="care-details">
              <Reveal delay={0.05}><article><LockKeyhole size={22} /><div><h3>Let people choose how to share.</h3><p>Leave a name and a phone number for follow-up, or submit without identifying details.</p></div></article></Reveal>
              <Reveal delay={0.13}><article><Heart size={22} /><div><h3>Remember the person behind the request.</h3><p>Move from new to praying to prayed for. Keep the context together so your next conversation starts with care.</p></div></article></Reveal>
              <Reveal delay={0.2}><p className="care-principle">The care is yours.<br />Tend helps you keep track.</p></Reveal>
            </div>
          </div>
        </section>

        <section className="closing-section photo-band">
          <div className="brand-container closing-inner">
          <Reveal><p className="eyebrow">An open invitation</p><h2>Grow a culture<br />of prayer.</h2></Reveal>
          <Reveal delay={0.1}><p>Start with one QR code for your church.<br />Let the conversations grow from there.</p><Link className="brand-button" href="/signup" data-testid="link-cta-signup">Get your church’s QR code <ArrowRight size={18} /></Link></Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
    </MotionConfig>
  );
}
