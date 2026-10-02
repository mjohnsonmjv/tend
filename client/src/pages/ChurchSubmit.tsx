import { useState, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import { ChevronDown, Camera, X, Loader2 } from "lucide-react";
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
  const [name, setName] = useState(() => {
    try { return localStorage.getItem("tend_name") || ""; } catch { return ""; }
  });
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(() => {
    try { return localStorage.getItem("tend_anon") === "1"; } catch { return false; }
  });
  const [isUrgent, setIsUrgent] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [guided, setGuided] = useState(false);
  const [gWeighing, setGWeighing] = useState("");
  const [gSomeone, setGSomeone] = useState("");
  const [gThankful, setGThankful] = useState("");

  // Guided answers stitched into a single request. Skipped prompts are left out.
  const guidedMessage = () => {
    const parts: string[] = [];
    if (gWeighing.trim()) parts.push(`Weighing on me: ${gWeighing.trim()}`);
    if (gSomeone.trim()) parts.push(`Pray for: ${gSomeone.trim()}`);
    if (gThankful.trim()) parts.push(`Thankful for: ${gThankful.trim()}`);
    return parts.join("\n");
  };
  const effectiveMessage = guided ? guidedMessage() : message;
  const [submissionKey] = useState(()=>crypto.randomUUID());
  const [website,setWebsite] = useState("");

  // Optional profile photo: either the submitter's Google profile photo
  // (one-tap import) or an uploaded image. Remembered on this device.
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => {
    try { return localStorage.getItem("tend_photo_url"); } catch { return null; }
  });
  const [photoPath, setPhotoPath] = useState<string | null>(() => {
    try { return localStorage.getItem(`tend_photo_path_${slug}`); } catch { return null; }
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(() => photoUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const persistPhoto = (url: string | null, path: string | null, preview: string | null) => {
    setPhotoUrl(url); setPhotoPath(path); setPhotoPreview(preview);
    try {
      if (url) localStorage.setItem("tend_photo_url", url); else localStorage.removeItem("tend_photo_url");
      if (path) localStorage.setItem(`tend_photo_path_${slug}`, path); else localStorage.removeItem(`tend_photo_path_${slug}`);
    } catch { /* storage unavailable */ }
  };

  const useGooglePhoto = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const { data: { session: existing } } = await supabase.auth.getSession();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          skipBrowserRedirect: true,
          redirectTo: `${window.location.origin}${window.location.pathname}#/auth/photo-callback`,
        },
      });
      if (error || !data?.url) throw error || new Error("oauth");
      const popup = window.open(data.url, "tend-google-photo", "width=480,height=640");
      if (!popup) {
        toast({ title: "Popup blocked", description: "Allow popups for this site, then try again.", variant: "destructive" });
        setPhotoBusy(false);
        return;
      }
      const cleanup = () => {
        window.clearInterval(watch);
        window.removeEventListener("message", onMessage);
        if (!existing) supabase.auth.signOut().catch(() => {});
        setPhotoBusy(false);
      };
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== window.location.origin || !e.data || e.data.type !== "tend-photo") return;
        cleanup();
        if (e.data.error || !e.data.avatarUrl) {
          toast({ title: "Google photo not added", description: "Please try again or upload a photo instead.", variant: "destructive" });
          return;
        }
        persistPhoto(e.data.avatarUrl, null, e.data.avatarUrl);
        if (!name.trim() && e.data.name) setName(e.data.name);
        toast({ title: "Photo added", description: "Your Google profile photo will appear with your request." });
      };
      let watch = 0;
      watch = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          toast({ title: "Google photo not added", description: "The sign-in window was closed before finishing." });
        }
      }, 500);
      window.addEventListener("message", onMessage);
    } catch {
      toast({ title: "Google photo not added", description: "Please try again or upload a photo instead.", variant: "destructive" });
      setPhotoBusy(false);
    }
  };

  const compressImage = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress"))), "image/jpeg", 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("load")); };
    img.src = src;
  });

  const onPhotoFile = async (file: File | undefined) => {
    if (!file || photoBusy) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "That file isn't an image", description: "Please choose a photo file.", variant: "destructive" });
      return;
    }
    setPhotoBusy(true);
    try {
      const blob = await compressImage(file);
      const path = `photos/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("prayer-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      persistPhoto(null, path, URL.createObjectURL(blob));
      toast({ title: "Photo added", description: "Your photo will appear with your request." });
    } catch {
      toast({ title: "Photo not added", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
    // Retry transient failures: the RPC is idempotent via submissionKey,
    // so a retried submit can never create a duplicate prayer request.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    mutationFn: async () => {
      await apiRequest("POST", `/api/churches/by-slug/${slug}/prayers`, {
        message: guided ? guidedMessage() : message,
        category,
        submitterName: isAnonymous ? undefined : name || undefined,
        submitterPhone: isAnonymous ? undefined : phone || undefined,
        submitterEmail: isAnonymous ? undefined : email.trim() || undefined,
        submitterPhotoUrl: isAnonymous ? undefined : photoUrl || undefined,
        submitterPhotoPath: isAnonymous ? undefined : photoPath || undefined,
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
        localStorage.setItem("tend_anon", isAnonymous ? "1" : "0");
        if (!isAnonymous && name.trim()) localStorage.setItem("tend_name", name.trim());
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
            Share a prayer need with {church.pastorName}. A few honest words is enough; nothing is too small.
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

          {/* Message: free write or guided prompts */}
          {guided ? (
            <div>
              <Label className="text-sm font-medium">Answer what you can. Skip the rest.</Label>
              <div className="mt-2 space-y-4">
                <div>
                  <Label htmlFor="g-weighing" className="text-sm font-normal">
                    What is weighing on you this week?
                  </Label>
                  <Input
                    id="g-weighing"
                    data-testid="input-guided-weighing"
                    value={gWeighing}
                    onChange={(e) => setGWeighing(e.target.value)}
                    placeholder="e.g. Work has been overwhelming"
                    maxLength={500}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="g-someone" className="text-sm font-normal">
                    Who in your life could use prayer?
                  </Label>
                  <Input
                    id="g-someone"
                    data-testid="input-guided-someone"
                    value={gSomeone}
                    onChange={(e) => setGSomeone(e.target.value)}
                    placeholder="e.g. My dad, surgery on Thursday"
                    maxLength={500}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="g-thankful" className="text-sm font-normal">
                    Anything you are thankful for?
                  </Label>
                  <Input
                    id="g-thankful"
                    data-testid="input-guided-thankful"
                    value={gThankful}
                    onChange={(e) => setGThankful(e.target.value)}
                    placeholder="e.g. The baby slept through the night"
                    maxLength={500}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const stitched = guidedMessage();
                  if (stitched) setMessage(stitched);
                  setGuided(false);
                }}
                data-testid="button-guided-off"
                className="mt-4 text-sm text-primary underline underline-offset-4"
              >
                Prefer to write it yourself?
              </button>
            </div>
          ) : (
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
              <button
                type="button"
                onClick={() => setGuided(true)}
                data-testid="button-guided-on"
                className="mt-3 text-sm text-primary underline underline-offset-4"
              >
                Not sure what to write? Answer 3 quick questions instead.
              </button>
            </div>
          )}

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

          {/* Profile photo (only if not anonymous, never in demo) */}
          {!isAnonymous && slug !== "demo" && (
            <div className="rounded-md border border-border bg-card px-4 py-3" data-testid="section-photo">
              <div className="flex items-center gap-3">
                {photoPreview ? (
                  <img src={photoPreview} alt="Your photo" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" data-testid="img-photo-preview" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0" aria-hidden="true">
                    <Camera className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">Add your photo <span className="text-muted-foreground font-normal">(optional)</span></div>
                  <div className="text-xs text-muted-foreground mt-0.5">So the care team can see who they're praying for. Only visible to your church's team.</div>
                </div>
                {photoPreview && (
                  <button type="button" onClick={() => persistPhoto(null, null, null)} aria-label="Remove photo" data-testid="button-photo-remove" className="p-2 -m-1 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {!photoPreview && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={useGooglePhoto} disabled={photoBusy} data-testid="button-photo-google">
                    {photoBusy && <Loader2 className="h-4 w-4 animate-spin" />} Use my Google photo
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={photoBusy} data-testid="button-photo-upload">
                    Upload a photo
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Upload a photo" onChange={(e) => onPhotoFile(e.target.files?.[0])} data-testid="input-photo-file" />
                </div>
              )}
            </div>
          )}

          {/* Name & contact (only if not anonymous), tucked behind an expander */}
          {!isAnonymous && (
            <div className="rounded-md border border-border bg-card">
              <button
                type="button"
                onClick={() => setShowContact((v) => !v)}
                aria-expanded={showContact}
                data-testid="button-toggle-contact"
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-left"
              >
                <span className="font-medium text-foreground">
                  {name.trim() ? `Posting as ${name.trim()}` : "Add your name"}
                  <span className="text-muted-foreground font-normal"> (optional)</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showContact ? "rotate-180" : ""}`} />
              </button>
              {showContact && (
              <div className="space-y-4 px-4 pb-4">
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
            disabled={submit.isPending || !effectiveMessage}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-base"
          >
            {submit.isPending ? "Sending..." : slug === "demo" ? "Try the example" : "Share prayer request"}
          </Button>
          {!effectiveMessage && !submit.isPending && (
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
