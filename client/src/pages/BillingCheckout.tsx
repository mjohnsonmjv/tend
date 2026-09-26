import { useEffect, useState } from "react";
import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

const PLAN_NAMES: Record<string, string> = { starter: "Starter", growth: "Growth", large: "Large Church" };

function hashQuery() {
  const q = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(q);
}

type ChurchLite = { id: number; name: string; slug: string; plan: string };

export default function BillingCheckout() {
  const params = hashQuery();
  const plan = params.get("plan") || "";
  const interval = params.get("interval") === "year" ? "year" : "month";
  const [churches, setChurches] = useState<ChurchLite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const planOk = !!PLAN_NAMES[plan];

  useEffect(() => {
    if (!planOk) return;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        window.location.assign("/#/signup");
        return;
      }
      try {
        const res = await apiRequest("GET", "/api/churches");
        const list = (await res.json()) as ChurchLite[];
        setChurches(list);
        if (list.length === 1) startCheckout(list[0].id);
      } catch (e: any) {
        setError(e.message || "Could not load your churches.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout(churchId: number) {
    setStarting(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout", { churchId, plan, interval });
      const data = (await res.json()) as { url: string };
      window.location.assign(data.url);
    } catch (e: any) {
      setError(e.message || "Could not start checkout.");
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <section className="max-w-xl mx-auto px-6 pt-24 pb-24 text-center">
        {!planOk ? (
          <>
            <h1 className="font-serif text-4xl">Choose a plan first.</h1>
            <p className="mt-4 text-muted-foreground">
              <Link href="/pricing" className="underline">See plans</Link>
            </p>
          </>
        ) : error ? (
          <>
            <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
            <h1 className="font-serif text-4xl mt-4">Something went wrong</h1>
            <p className="mt-4 text-muted-foreground">{error}</p>
            <Button className="mt-8" onClick={() => window.location.reload()}>Try again</Button>
          </>
        ) : churches && churches.length > 1 ? (
          <>
            <h1 className="font-serif text-4xl">Which church is this for?</h1>
            <p className="mt-4 text-muted-foreground">
              You're starting the {PLAN_NAMES[plan]} plan ({interval === "year" ? "annual" : "monthly"} billing) with a 30-day free trial.
            </p>
            <div className="mt-8 space-y-3">
              {churches.map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  className="w-full h-12"
                  disabled={starting}
                  onClick={() => startCheckout(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <h1 className="font-serif text-4xl mt-4">Starting your checkout</h1>
            <p className="mt-4 text-muted-foreground">
              {PLAN_NAMES[plan]} plan, {interval === "year" ? "annual" : "monthly"} billing. 30-day free trial, no card required today.
            </p>
          </>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}
