import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

function hashQuery() {
  const q = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(q);
}

export default function BillingSuccess() {
  const churchId = hashQuery().get("church");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <section className="max-w-xl mx-auto px-6 pt-24 pb-24 text-center">
        <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
        <h1 className="font-serif text-5xl mt-6">You're all set.</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Your 30-day free trial has started. Nothing is charged today, and you can cancel anytime from your church settings.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          {churchId && (
            <Button asChild className="h-11 px-8">
              <Link href={`/church/${churchId}/dashboard`}>Go to your dashboard</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="h-11 px-8">
            <Link href="/pricing">Back to pricing</Link>
          </Button>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
