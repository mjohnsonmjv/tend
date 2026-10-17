import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { MessageSquare } from "lucide-react";

const NUMBER_DISPLAY = "(616) 816-4172";
const NUMBER_SMS = "+16168164172";

export default function TextLine() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-6 py-16">
        <p className="eyebrow mb-3">Tend Prayer Requests by text</p>
        <h1 className="font-serif text-4xl mb-4">Text us a prayer request.</h1>
        <p className="text-foreground/90 leading-relaxed mb-8">
          Send your prayer request by text message. It is shared privately with the Tend prayer team. It is never posted publicly.
        </p>

        <div className="rounded-2xl border border-border bg-card p-6 mb-8 text-center">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 text-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground mb-1">Text your prayer request to</p>
          <a href={`sms:${NUMBER_SMS}`} className="font-serif text-3xl underline decoration-primary decoration-2 underline-offset-4" data-testid="link-text-number">
            {NUMBER_DISPLAY}
          </a>
        </div>

        <section className="rounded-2xl bg-muted/40 border border-border p-6 text-sm leading-relaxed space-y-3" data-testid="sms-disclosure">
          <h2 className="font-serif text-xl text-foreground">What you agree to when you text</h2>
          <p>
            By texting your prayer request to {NUMBER_DISPLAY}, you agree to receive text messages from Tend Prayer Requests, operated by Mark Johnson Ventures LLC, about your request.
            You will receive one confirmation reply for each request you send. Message frequency varies.
          </p>
          <p>Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help, or email <a className="underline" href="mailto:support@tendpray.com">support@tendpray.com</a>.</p>
          <p>Consent to receive texts is not a condition of any purchase. Mobile numbers are never sold or shared with third parties or affiliates for marketing purposes.</p>
          <p>
            See our <a className="underline" href="#/terms">Terms</a> and <a className="underline" href="#/privacy">Privacy Policy</a>.
            This line is not monitored for emergencies. In an emergency, call 911.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
