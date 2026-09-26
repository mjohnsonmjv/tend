import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift as GiftIcon, Loader2, AlertCircle, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PublicChurch { slug: string; name: string; }

const PLANS = [
  { id: "starter", name: "Starter", monthly: 29, annual: 290, tag: "For churches under 200" },
  { id: "growth", name: "Growth", monthly: 49, annual: 490, tag: "For churches 200-500" },
  { id: "large", name: "Large Church", monthly: 99, annual: 990, tag: "For churches 500+" },
];

export default function Gift() {
  const { slug } = useParams<{ slug: string }>();
  const [annual, setAnnual] = useState(true);
  const [planId, setPlanId] = useState("growth");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const { data: church, isLoading, isError } = useQuery<PublicChurch>({
    queryKey: ["/api/churches/by-slug", slug],
  });

  async function gift() {
    setStarting(true); setError(null);
    try {
      const res = await apiRequest("POST", "/api/billing/gift", {
        slug, plan: planId, interval: annual ? "year" : "month",
      });
      const { url } = await res.json();
      window.location.assign(url);
    } catch (e: any) {
      setError(e.message || "Could not start gift checkout.");
      setStarting(false);
    }
  }

  const plan = PLANS.find(p => p.id === planId)!;
  const price = annual ? plan.annual : plan.monthly;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="eyebrow mb-3">Give the gift of prayer</p>
        {isLoading ? <Skeleton className="h-10 w-64 mx-auto" /> : isError || !church ? (
          <><h1 className="font-serif text-4xl mb-4">Church not found</h1>
          <p className="text-muted-foreground">We could not find that church's Tend page.</p></>
        ) : (<>
          <h1 className="font-serif text-4xl sm:text-5xl mb-4">Gift Tend to<br />{church.name}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10">
            Cover a paid plan for your church. You pay today, the church's team is notified,
            and the gift renews on your card until you cancel. No Tend account needed.
          </p>

          <div className="flex justify-center gap-2 mb-8">
            <Button variant={annual ? "default" : "outline"} onClick={() => setAnnual(true)} data-testid="button-gift-annual">Annual (2 months free)</Button>
            <Button variant={!annual ? "default" : "outline"} onClick={() => setAnnual(false)} data-testid="button-gift-monthly">Monthly</Button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-8 text-left">
            {PLANS.map(p => (
              <button key={p.id} onClick={() => setPlanId(p.id)} data-testid={`button-gift-plan-${p.id}`}
                className={`rounded-xl border p-5 text-left transition ${planId === p.id ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50"}`}>
                <span className="flex items-center justify-between font-medium">{p.name}{planId === p.id && <Check className="h-4 w-4 text-primary" />}</span>
                <span className="block text-xs text-muted-foreground mt-1">{p.tag}</span>
                <span className="block font-serif text-3xl mt-3">${annual ? p.annual : p.monthly}<span className="text-sm font-sans text-muted-foreground">/{annual ? "year" : "month"}</span></span>
              </button>
            ))}
          </div>

          {error && <p role="alert" className="text-destructive text-sm mb-4 flex items-center justify-center gap-2"><AlertCircle className="h-4 w-4" />{error}</p>}
          <Button size="lg" className="min-h-12 px-8" disabled={starting} onClick={gift} data-testid="button-gift-checkout">
            {starting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting checkout...</> : <><GiftIcon className="h-4 w-4 mr-2" />Gift {plan.name} - ${price}/{annual ? "year" : "month"}</>}
          </Button>
          <p className="text-xs text-muted-foreground mt-6 max-w-md mx-auto leading-relaxed">
            Gifts are charged immediately (no trial). The church keeps its free plan features either way;
            your gift unlocks the paid ones. Cancel anytime by replying to your receipt email.
          </p>
        </>)}
        <Link href="/pricing" className="inline-block mt-8 underline text-sm">See all plans</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
