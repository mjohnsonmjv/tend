import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift as GiftIcon, Loader2, AlertCircle, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PublicChurch { slug: string; name: string; }

const GIFT_PRICE = 490;

const GIFT_PERKS = [
  "A full year of the Church plan",
  "One payment today",
  "The church's team is notified right away",
];

export default function Gift() {
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const { data: church, isLoading, isError } = useQuery<PublicChurch>({
    queryKey: ["/api/churches/by-slug", slug],
  });

  async function gift() {
    setStarting(true); setError(null);
    try {
      const res = await apiRequest("POST", "/api/billing/gift", {
        slug, plan: "growth", interval: "year",
      });
      const { url } = await res.json();
      window.location.assign(url);
    } catch (e: any) {
      setError(e.message || "Could not start gift checkout.");
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="eyebrow mb-3">Give the gift of prayer</p>
        {isLoading ? <Skeleton className="h-10 w-64 mx-auto" /> : isError || !church ? (
          <><h1 className="font-serif text-4xl mb-4">Church not found</h1>
          <p className="text-muted-foreground">We could not find that church's Tend page.</p></>
        ) : (<>
          <h1 className="font-serif text-4xl sm:text-5xl mb-4">Gift a year of Tend to<br />{church.name}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10">
            Cover a full year of Tend for your church. You pay once today and the church's team
            is notified. No Tend account needed.
          </p>

          <div className="max-w-md mx-auto rounded-2xl border border-primary/40 bg-primary/5 p-6 mb-8 text-left" data-testid="card-gift-year">
            <span className="flex items-center justify-between font-medium">Church plan, one year<GiftIcon className="h-4 w-4 text-primary" /></span>
            <span className="block font-serif text-4xl mt-3">${GIFT_PRICE}<span className="text-sm font-sans text-muted-foreground"> one payment</span></span>
            <ul className="mt-4 space-y-2">
              {GIFT_PERKS.map(perk => (
                <li key={perk} className="flex items-start gap-2 text-sm text-foreground/90">
                  <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />{perk}
                </li>
              ))}
            </ul>
          </div>

          {error && <p role="alert" className="text-destructive text-sm mb-4 flex items-center justify-center gap-2"><AlertCircle className="h-4 w-4" />{error}</p>}
          <Button size="lg" className="min-h-12 px-8" disabled={starting} onClick={gift} data-testid="button-gift-checkout">
            {starting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting checkout...</> : <><GiftIcon className="h-4 w-4 mr-2" />Gift a year of Tend - ${GIFT_PRICE}</>}
          </Button>
          <p className="text-xs text-muted-foreground mt-6 max-w-md mx-auto leading-relaxed">
            Gifts are charged once, today (no trial, no renewal). The church keeps its free plan
            features either way; your gift unlocks the paid ones for a full year. When the year
            ends, we email you both, and you can gift again if you would like.
          </p>
        </>)}
        <Link href="/pricing" className="inline-block mt-8 underline text-sm">See all plans</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
