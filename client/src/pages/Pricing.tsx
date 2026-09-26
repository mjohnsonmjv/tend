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
    id: "starter",
    name: "Starter",
    monthly: 29,
    annual: 290,
    tag: "For churches under 200",
    perks: [
      "Everything in Free",
      "Custom greeting message",
      "Weekly digest email (planned)",
    ],
    cta: "Start free trial",
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 49,
    annual: 490,
    tag: "For churches 200–500",
    highlighted: true,
    perks: [
      "Everything in Starter",
      "Multiple QR codes (planned)",
      "Automated SMS follow-up (planned)",
      "Export prayer log to CSV (planned)",
    ],
    cta: "Start free trial",
  },
  {
    id: "large",
    name: "Large Church",
    monthly: 99,
    annual: 990,
    tag: "For churches 500+",
    perks: [
      "Everything in Growth",
      "Multiple team accounts (planned)",
      "Small-group ministry views (planned)",
      "Priority support (planned)",
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
          <div className="text-xs uppercase tracking-widest text-primary font-medium mb-4">Pricing</div>
        <h1 className="font-serif text-5xl sm:text-6xl text-foreground leading-tight">
          Start free.
          <br />
          <span className="text-primary">Grow when you're ready.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          The free plan is free forever, no card required. Paid plans start with a 30-day free trial.
        </p>
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
          <p className="mt-3 text-sm text-primary font-medium">Annual billing gives you two months free.</p>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24 grid md:grid-cols-2 xl:grid-cols-4 gap-6">
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
                Expanded care
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

      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-border/60">
        <h2 className="font-serif text-3xl text-foreground text-center mb-10">Common questions</h2>
        <div className="space-y-6 text-foreground/90">
          <Faq q="Is the free plan really free?">
            Yes. One prayer page and one QR code, free forever. No card required. Paid plans add a custom greeting, SMS follow-up, and multi-campus features.
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
