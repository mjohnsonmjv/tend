import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import { CATEGORY_LABELS } from "@shared/schema";
import type { Category } from "@shared/schema";

interface PublicChurch {
  slug: string;
  name: string;
  pastorName: string;
  greetingMessage: string;
}

export default function ChurchSubmit() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category>("prayer");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [submissionKey] = useState(()=>crypto.randomUUID());
  const [website,setWebsite] = useState("");

  const validEmail = (v: string) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const validateContact = () => {
    let ok = true;
    if (!isAnonymous && phone.includes("@")) {
      setPhoneError("That looks like an email address. Please enter a phone number here, or use the email field below.");
      ok = false;
    } else {
      setPhoneError("");
    }
    if (!isAnonymous && !validEmail(email)) {
      setEmailError("Enter a valid email address, or leave this blank.");
      ok = false;
    } else {
      setEmailError("");
    }
    return ok;
  };

  const { data: church, isLoading } = useQuery<PublicChurch>({
    queryKey: ["/api/churches/by-slug", slug],
  });

  const submit = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/churches/by-slug/${slug}/prayers`, {
        message,
        category,
        submitterName: isAnonymous ? undefined : name || undefined,
        submitterPhone: isAnonymous ? undefined : phone || undefined,
        submitterEmail: isAnonymous ? undefined : email.trim() || undefined,
        isAnonymous,
        isUrgent,
        isPrivate: true,
        submissionKey,
        website,
      });
    },
    onSuccess: () => {
      try {
        sessionStorage.setItem("tend_email_provided", !isAnonymous && email.trim() ? "1" : "");
      } catch { /* storage unavailable */ }
      navigate(`/c/${slug}/thanks`);
    },
    onError: () => {
      toast({
        title: "Couldn't submit",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <Skeleton className="h-12 w-3/4 mx-auto" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!church) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Logo size={48} className="text-primary/60 mb-6" />
        <h1 className="font-serif text-3xl text-foreground mb-2">This church isn't set up yet</h1>
        <p className="text-muted-foreground">Check the QR code or ask your church's care team for the correct link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground prayer-form">
      <div className="max-w-md mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <Logo size={40} className="text-primary mx-auto mb-4" />
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Share a prayer request</div>
          <h1 className="font-serif text-3xl text-foreground leading-tight">{church.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Share a prayer need with {church.pastorName}.
          </p>
          <p className="preview-notice mt-4 rounded-md">{slug === "demo" ? "Example form. Nothing entered here is saved or sent." : "Your request is shared with this church’s account owner, not posted publicly. Share only information you are comfortable giving your church’s care team. This is not an emergency service."}</p>
        </div>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validateContact()) return;
            submit.mutate();
          }}
        >
          <div hidden aria-hidden="true"><label>Leave this field empty<input value={website} onChange={e=>setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"/></label></div>
          {/* Category */}
          <div>
            <Label className="text-sm font-medium">What are you sharing?</Label>
            <RadioGroup
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
              className="mt-2 grid grid-cols-2 gap-2"
            >
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <label
                  key={c}
                  htmlFor={`cat-${c}`}
                  data-testid={`radio-category-${c}`}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-md border cursor-pointer transition-colors ${
                    category === c
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <RadioGroupItem value={c} id={`cat-${c}`} />
                  <span className="text-sm">{CATEGORY_LABELS[c]}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Message */}
          <div>
            <Label htmlFor="message" className="text-sm font-medium">
              {category === "prayer" && "What's on your heart?"}
              {category === "praise" && "What are you thankful for?"}
              {category === "check_in" && "How are you doing?"}
              {category === "question" && "What's your question?"}
            </Label>
            <Textarea
              id="message"
              data-testid="input-message"
              placeholder={
                category === "prayer"
                  ? "Please pray for..."
                  : category === "praise"
                    ? "God answered..."
                    : "I'm here today, and..."
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              minLength={3}
              maxLength={2000}
              required
              className="mt-1.5 font-serif italic text-base"
            />
          </div>

          {/* Anonymous toggle */}
          <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors">
            <Checkbox
              checked={isAnonymous}
              onCheckedChange={(v) => setIsAnonymous(!!v)}
              className="mt-0.5"
              data-testid="checkbox-anonymous"
            />
            <div>
              <div className="text-sm font-medium text-foreground">Share anonymously</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Your church's care team will see the request but nothing that identifies you.
              </div>
            </div>
          </label>

          {/* Name & phone (only if not anonymous) */}
          {!isAnonymous && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-sm">
                  Your name <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="name"
                  data-testid="input-submitter-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name is fine"
                  maxLength={100}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm">
                  Phone <span className="text-muted-foreground font-normal">(optional) for care-team follow-up</span>
                </Label>
                <Input
                  id="phone"
                  data-testid="input-submitter-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(""); }}
                  placeholder="(555) 123-4567"
                  maxLength={32}
                  className="mt-1.5"
                />
                {phoneError && (
                  <p className="mt-1.5 text-xs text-destructive" data-testid="text-phone-error">{phoneError}</p>
                )}
              </div>
              <div>
                <Label htmlFor="email" className="text-sm">
                  Email <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="email"
                  data-testid="input-submitter-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                  placeholder="you@example.com"
                  maxLength={254}
                  className="mt-1.5"
                />
                {emailError ? (
                  <p className="mt-1.5 text-xs text-destructive" data-testid="text-email-error">{emailError}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">So the care team can follow up if needed. We will never share it.</p>
                )}
              </div>
            </div>
          )}

          {/* Urgent */}
          <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-card cursor-pointer hover:border-accent/40 transition-colors">
            <Checkbox
              checked={isUrgent}
              onCheckedChange={(v) => setIsUrgent(!!v)}
              className="mt-0.5"
              data-testid="checkbox-urgent"
            />
            <div>
              <div className="text-sm font-medium text-foreground">This is urgent</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Flags this request in the inbox. This is not monitored for emergencies.
              </div>
            </div>
          </label>

          <Button
            type="submit"
            data-testid="button-submit-prayer"
            disabled={submit.isPending || !message}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-base"
          >
            {submit.isPending ? "Sending..." : slug === "demo" ? "Try the example" : "Share prayer request"}
          </Button>
          {!message && !submit.isPending && (
            <p className="text-xs text-center text-muted-foreground -mt-3" data-testid="text-submit-hint">
              Share a few words above to send your request.
            </p>
          )}
          <p className="text-xs text-center text-muted-foreground pt-2">
            Powered by <span className="font-serif italic">Tend</span> · One QR code for your church
          </p>
          <p className="text-xs text-center pt-1">
            <Link href={`/gift/${slug}`} className="underline text-muted-foreground" data-testid="link-gift-church">Gift Tend to this church</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
