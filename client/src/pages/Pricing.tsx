import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Check } from "lucide-react";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    tag: "For churches under 200",
    perks: [
      "One QR code + prayer intake page",
      "Unlimited prayer requests",
      "Pastor dashboard with status tracking",
      "Weekly digest email (planned)",
      "Printable QR poster",
    ],
    cta: "Explore the preview",
  },
  {
    id: "growth",
    name: "Growth",
    price: 49,
    tag: "For churches 200–500",
    highlighted: true,
    perks: [
      "Everything in Starter",
      "Multiple QR codes (planned)",
      "Automated SMS follow-up (planned)",
      "Custom greeting message",
      "Export prayer log to CSV (planned)",
    ],
    cta: "Explore the preview",
  },
  {
    id: "large",
    name: "Large Church",
    price: 99,
    tag: "For churches 500+",
    perks: [
      "Everything in Growth",
      "Multiple pastor accounts (planned)",
      "Small-group ministry views (planned)",
      "Priority support (planned)",
      "Volume pricing to be confirmed",
    ],
    cta: "Explore the preview",
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="text-xs uppercase tracking-widest text-primary font-medium mb-4">Proposed pricing</div>
        <h1 className="font-serif text-5xl sm:text-6xl text-foreground leading-tight">
          Simple plans.
          <br />
          <span className="text-primary">More room to care.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Explore the working preview without payment. Paid plans and a 14-day trial are proposed for launch, not active yet.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
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
              <span className="font-serif text-5xl text-foreground">${p.price}</span>
              <span className="text-muted-foreground">/mo</span>
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
              href="/signup"
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
          <Faq q="Does my congregation need to install anything?">
            No. They scan a QR code with their phone camera, land on a simple submission page, and share their request. That's it.
          </Faq>
          <Faq q="Do I need to know anything technical to set this up?">
            No. Sign up, print the QR code we generate, tape it in the sanctuary. You're done.
          </Faq>
          <Faq q="Can I subscribe yet?">
            Not yet. Billing is not connected in this preview. No payments are collected here.
          </Faq>
          <Faq q="Is this HIPAA-compliant?">
            No. Tend is a pastoral-care pilot, not a medical records system. Pastor login and church-specific database access controls are enabled. Do not use it as a substitute for clinical or emergency services.
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
