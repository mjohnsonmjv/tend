import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/Logo";
import { Heart } from "lucide-react";
import { trackPrayerSubmitted } from "@/lib/analytics";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PublicChurch {
  slug: string;
  name: string;
  pastorName: string;
  greetingMessage: string;
}

export default function SubmitThanks() {
  const { slug } = useParams<{ slug: string }>();
  useEffect(() => {
    if (slug && slug !== "demo") trackPrayerSubmitted();
  }, [slug]);
  const { data: church } = useQuery<PublicChurch>({
    queryKey: ["/api/churches/by-slug", slug],
  });
  let emailProvided = false;
  try {
    emailProvided = sessionStorage.getItem("tend_email_provided") === "1";
    sessionStorage.removeItem("tend_email_provided");
  } catch { /* storage unavailable */ }

  const [nurtureEmail, setNurtureEmail] = useState("");
  const [nurtureState, setNurtureState] = useState<"idle" | "saving" | "done" | "error">("idle");

  const submitNurture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nurtureState === "saving" || nurtureState === "done") return;
    setNurtureState("saving");
    try {
      await apiRequest("POST", "/api/nurture/lead", { email: nurtureEmail, source: "demo" });
      setNurtureState("done");
    } catch {
      setNurtureState("error");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
          <Heart className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <h1 className="font-serif text-4xl text-foreground leading-tight mb-4">
          {slug === "demo" ? "That’s how simple sharing can be." : "Your request was received."}
        </h1>
        <p className="font-serif italic text-xl text-primary leading-relaxed">
          "{church?.greetingMessage || "Thank you for sharing."}"
        </p>
        {church?.pastorName && (
          <p className="mt-2 text-sm text-muted-foreground">From {church.pastorName}</p>
        )}
        {slug !== "demo" && emailProvided && (
          <p className="mt-6 text-sm text-muted-foreground">
            Thanks for sharing your email. The care team can reach you there if needed.
          </p>
        )}

        <div className="mt-10">
          <Link
            href={`/c/${slug}`}
            data-testid="link-submit-another"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-6 text-sm font-medium text-foreground hover:border-primary/40 transition-colors"
          >
            Share another request
          </Link>
        </div>

        {slug === "demo" && nurtureState !== "done" && (
          <form
            className="mt-10 rounded-xl border border-border bg-card p-6 text-left"
            onSubmit={submitNurture}
          >
            <h2 className="font-serif text-2xl text-foreground mb-2">Get the free rollout kit</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Three short emails: setup tips, the announcement slide, and the pew card. Unsubscribe anytime.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                required
                placeholder="you@church.org"
                value={nurtureEmail}
                onChange={(e) => setNurtureEmail(e.target.value)}
                data-testid="input-nurture-email"
                aria-label="Email address"
              />
              <Button
                type="submit"
                disabled={nurtureState === "saving"}
                data-testid="button-nurture-submit"
                className="shrink-0"
              >
                {nurtureState === "saving" ? "Saving..." : "Send it"}
              </Button>
            </div>
            {nurtureState === "error" && (
              <p className="text-sm text-destructive mt-2" role="alert">
                Could not save your email. Please check the address and try again.
              </p>
            )}
          </form>
        )}
        {slug === "demo" && nurtureState === "done" && (
          <p className="mt-10 text-sm text-muted-foreground" role="status">
            You are in. Watch your inbox for the first email.
          </p>
        )}

        <div className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Logo size={16} />
          <span className="font-serif italic">Tend</span>
        </div>
      </div>
    </div>
  );
}
