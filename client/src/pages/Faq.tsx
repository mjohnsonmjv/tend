import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { FAQ_ENTRIES } from "@/lib/faqData";

export default function Faq() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="eyebrow mb-3">Questions</p>
        <h1 className="font-serif text-4xl mb-4">Frequently asked questions</h1>
        <p className="text-muted-foreground mb-12">
          The short answers about how Tend works, what it costs, and who sees what.
          Anything else, write to{" "}
          <a className="underline" href="mailto:support@tendpray.com">support@tendpray.com</a>.
        </p>

        {FAQ_ENTRIES.map((entry) => (
          <section key={entry.question} className="mb-10">
            <h2 className="font-serif text-2xl text-foreground mb-3">{entry.question}</h2>
            <div className="text-foreground/90 leading-relaxed space-y-3">
              {entry.answer.split("\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-14 text-center">
          <Link className="brand-button" href="/signup" data-testid="link-faq-signup">
            Get your QR code <ArrowRight size={16} />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
