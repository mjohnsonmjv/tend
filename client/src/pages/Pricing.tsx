import { useState } from "react";
import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Check } from "lucide-react";

const PLANS = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    annual: 0,
    tag: "Free forever",
    perks: [
      "One QR code + prayer intake page",
      "Prayer inbox with status tracking",
      "Printable QR poster",
    ],
    cta: "Start for free",
  },
  {
    id: "growth",
    name: "Church",
    monthly: 49,
    annual: 490,
    tag: "Every church, every size",
    highlighted: true,
    perks: [
      "Everything in Free",
      "Your logo in the QR code and on your prayer page",
      "Custom greeting message",
      "Care team accounts",
      "24/7 prayer watches",
      "Planning Center sync",
    ],
    cta: "Start free trial",
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="text-xs uppercase tracking-widest text-[#8a6d1f] font-medium mb-4">Pricing</div>
        <h1 className="font-serif text-5xl sm:text-6xl text-foreground leading-tight">
          Start free.
          <br />
          <span className="text-[#8a6d1f]">Grow when you're ready.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          The free plan is free forever, no card required. Paid plans start with a 30-day free trial.
        </p>
        <div className="mt-8 max-w-2xl mx-auto rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5">
          <p className="font-serif text-xl text-foreground">100% of profits go to charity.</p>
          <p className="mt-2 text-sm text-muted-foreground">Every dollar Tend earns beyond costs is donated to support Compassion International orphans. Your subscription feeds kids.</p>
        </div>
        <div className="mt-8 inline-flex items-center rounded-full border border-border bg-card p-1" role="group" aria-label="Billing period">
          <button
            type="button"
            data-testid="toggle-monthly"
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${!annual ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Monthly
          </button>
          <button
            type="button"
            data-testid="toggle-annual"
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${annual ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Annual
          </button>
        </div>
        {annual && (
          <p className="mt-3 text-sm text-[#8a6d1f] font-medium">Annual billing gives you two months free.</p>
        )}
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-24 grid md:grid-cols-2 gap-6">
        {PLANS.map((p) => (
          <div
            key={p.id}
            data-testid={`card-plan-${p.id}`}
            className={`rounded-2xl border p-8 flex flex-col ${
              p.highlighted
                ? "border-primary/40 bg-primary/5 shadow-md relative"
                : "border-border bg-card"
            }`}
          >
            {p.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                Everything included
              </div>
            )}
            <div className="text-sm text-muted-foreground uppercase tracking-widest">{p.tag}</div>
            <h2 className="font-serif text-3xl text-foreground mt-2">{p.name}</h2>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="font-serif text-5xl text-foreground">${annual ? p.annual : p.monthly}</span>
              <span className="text-muted-foreground">{p.monthly === 0 ? "forever" : annual ? "/yr" : "/mo"}</span>
            </div>
            <ul className="mt-8 space-y-3 flex-1">
              {p.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-sm text-foreground/90">
                  <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  {perk}
                </li>
              ))}
            </ul>
            <Link
              href={p.id === "free" ? "/signup" : `/billing/checkout?plan=${p.id}&interval=${annual ? "year" : "month"}`}
              data-testid={`link-plan-${p.id}`}
              className={`mt-8 inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors ${
                p.highlighted
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                  : "bg-foreground hover:bg-foreground/90 text-background"
              }`}
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16 -mt-6 text-center" data-testid="section-gift-year">
        <h2 className="font-serif text-3xl text-foreground">Or gift a year to your church</h2>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Any member can cover a full year of Tend for their church: one payment of $490,
          no renewal, nothing for the church to manage. Look for "Gift Tend to this church"
          at the bottom of your church's prayer page.
        </p>
      </section>

      <p className="text-center text-sm text-muted-foreground pb-10 -mt-4" data-testid="text-stripe-note">
        Payments are processed securely by <span className="font-semibold text-foreground">Stripe</span>.
      </p>

      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-border/60">
        <h2 className="font-serif text-3xl text-foreground text-center mb-10">Common questions</h2>
        <div className="space-y-6 text-foreground/90">
          <Faq q="Is the free plan really free?">
            Yes. One prayer page and one QR code, free forever. No card required. The Church plan adds your logo, a custom greeting, care team accounts, 24/7 prayer watches, and Planning Center sync.
          </Faq>
          <Faq q="Does my congregation need to install anything?">
            No. They scan a QR code with their phone camera, land on a simple submission page, and share their request. That's it.
          </Faq>
          <Faq q="Do I need to know anything technical to set this up?">
            No. Sign up, print the QR code we generate, tape it in the sanctuary. You're done.
          </Faq>
          <Faq q="How does the free trial work?">
            Paid plans start with a 30-day free trial. No card is required up front, and you can cancel anytime.
          </Faq>
          <Faq q="Is this HIPAA-compliant?">
            No. Tend is a pastoral-care pilot, not a medical records system. Account sign-in and church-specific database access controls are enabled. Do not use it as a substitute for clinical or emergency services.
          </Faq>
          <Faq q="Can I use this for something other than prayer requests?">
            The form also supports check-ins, praises, and questions.
          </Faq>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-serif text-xl text-foreground mb-2">{q}</h3>
      <p className="text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
