import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/Logo";
import { Heart } from "lucide-react";
import { trackPrayerSubmitted } from "@/lib/analytics";
import { apiRequest } from "@/lib/queryClient";
import { loadTurnstile, turnstileToken } from "@/lib/turnstile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PublicChurch {
  slug: string;
  name: string;
  pastorName: string;
  greetingMessage: string;
}

/** Verses shown on the confirmation screen, rotated randomly per visit.
 *  Pulled from the homepage "What Scripture says about prayer" cards. */
const THANKS_VERSES = [
  { text: "Therefore I tell you, whatever you ask in prayer, believe that you have received it, and it will be yours.", ref: "Mark 11:24" },
  { text: "Pray without ceasing, give thanks in all circumstances; for this is God's will for you in Christ Jesus.", ref: "1 Thessalonians 5:17-18" },
  { text: "Likewise the Spirit helps us in our weakness. For we do not know what to pray for as we ought, but the Spirit himself intercedes for us with groanings too deep for words.", ref: "Romans 8:26" },
  { text: "And I tell you, ask, and it will be given to you; seek, and you will find; knock, and it will be opened to you.", ref: "Luke 11:9" },
  { text: "Therefore, confess your sins to one another and pray for one another, that you may be healed. The prayer of a righteous person has great power as it is working.", ref: "James 5:16" },
  { text: "Call to me and I will answer you, and will tell you great and hidden things that you have not known.", ref: "Jeremiah 33:3" },
];

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
  const [nurtureError, setNurtureError] = useState("");
  const [verse] = useState(() => THANKS_VERSES[Math.floor(Math.random() * THANKS_VERSES.length)]);

  useEffect(() => {
    if (slug === "demo") loadTurnstile().catch(() => {});
  }, [slug]);

  const submitNurture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nurtureState === "saving" || nurtureState === "done") return;
    setNurtureState("saving");
    setNurtureError("");
    try {
      const token = await turnstileToken();
      await apiRequest("POST", "/api/nurture/lead", { email: nurtureEmail, source: "demo", turnstileToken: token });
      setNurtureState("done");
    } catch (err: any) {
      setNurtureError(err?.message === "captcha unavailable"
        ? "Could not load the spam check. Please check your connection and try again."
        : "Could not save your email. Please check the address and try again.");
      setNurtureState("error");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md w-full">
        <img
          src="/tend-thanks-blur.jpg"
          alt="Morning sunlight through wildflowers"
          className="w-full aspect-[16/10] object-cover rounded-2xl mb-8"
        />
        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
          <Heart className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <h1 className="font-serif text-4xl text-foreground leading-tight mb-4">
          {slug === "demo" ? "That’s how simple sharing can be." : "Your request was received."}
        </h1>
        <p className="font-serif italic text-xl text-[#8a6d1f] leading-relaxed">
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

        <p className="mt-10 font-serif italic text-lg text-[#8a6d1f] leading-relaxed">
          "{verse.text}"
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{verse.ref} (ESV)</p>

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
            <div id="turnstile-holder" aria-hidden="true" />
            {nurtureState === "error" && (
              <p className="text-sm text-destructive mt-2" role="alert">
                {nurtureError || "Could not save your email. Please check the address and try again."}
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
