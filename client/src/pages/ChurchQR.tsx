import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell } from "@/components/DashboardShell";
import type { Church } from "@shared/schema";
import { Download, Printer, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { generateChurchQr } from "@/lib/churchQr";
import { apiRequest } from "@/lib/queryClient";
import { AccessProblem } from "@/components/AccessProblem";

const escapeHtml = (text:string) => text.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export default function ChurchQR() {
  const { id } = useParams<{ id: string }>();
  const churchId = Number(id);
  const { data: church, isLoading,error,refetch } = useQuery<Church>({ queryKey: ["/api/churches", churchId] });
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const { toast } = useToast();

  // Paid tiers (starter/growth) can put their own logo in the QR center.
  // Free tiers get the Tend mark. Branding lives in tend_churches.website_url
  // and logo_url (migration 20261018_church_branding.sql).
  const isPaid = church?.plan === "starter" || church?.plan === "growth";
  const [branding, setBranding] = useState<{ websiteUrl: string | null; logoUrl: string | null } | null>(null);
  const [siteInput, setSiteInput] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [found, setFound] = useState<{ dataUrl: string; logoUrl: string } | null>(null);

  // Public URL : for QR embedding. In production tendpray.com/#/c/<slug>.
  const publicUrl = useMemo(() => {
    if (!church) return "";
    return `${window.location.origin}${window.location.pathname}#/c/${church.slug}`;
  }, [church]);

  // Load saved branding for paid tiers (graceful when the branding
  // migration has not been applied yet).
  useEffect(() => {
    if (!church || !isPaid) return;
    let cancelled = false;
    apiRequest("GET", `/api/churches/${church.id}/branding`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        setBranding(data);
        if (data.websiteUrl) setSiteInput(data.websiteUrl);
      })
      .catch(() => { /* branding unavailable: the QR still works */ });
    return () => { cancelled = true; };
  }, [church?.id, isPaid]);

  // Generate locally. No third-party QR service receives church URLs.
  // Free tiers get the Tend mark in the center; paid tiers get the church's
  // own logo once saved, or a clean code until then.
  const activeLogo = isPaid ? (branding?.logoUrl ?? null) : undefined;
  useEffect(() => {
    if (!publicUrl) return;
    let cancelled = false;
    generateChurchQr(publicUrl, { centerLogo: activeLogo })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) toast({title:"Could not generate QR code",variant:"destructive"}); });
    return () => { cancelled = true; };
  }, [church, publicUrl, activeLogo]);

  const findLogo = async () => {
    const site = siteInput.trim();
    if (!site) {
      toast({ title: "Enter your church website first", variant: "destructive" });
      return;
    }
    setDetecting(true);
    setFound(null);
    try {
      // Real serverless endpoint (Vercel), not the Supabase-routed /api/* path.
      const res = await fetch(`/api/detect-logo?url=${encodeURIComponent(site)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not find a logo.");
      setFound({ dataUrl: data.dataUrl, logoUrl: data.logoUrl });
    } catch (e) {
      toast({
        title: "No logo found",
        description: e instanceof Error ? e.message : "Try your homepage address.",
        variant: "destructive",
      });
    } finally {
      setDetecting(false);
    }
  };

  const useFoundLogo = async () => {
    if (!found || !church) return;
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/churches/${church.id}/branding`, {
        websiteUrl: siteInput.trim(),
        logoUrl: found.dataUrl,
      });
      const data = await res.json();
      setBranding(data);
      setFound(null);
      toast({ title: "Logo added", description: "Your QR code now carries your church logo." });
    } catch (e) {
      toast({
        title: "Could not save the logo",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeLogo = async () => {
    if (!church) return;
    try {
      const res = await apiRequest("PATCH", `/api/churches/${church.id}/branding`, {
        websiteUrl: siteInput.trim() || null,
        logoUrl: null,
      });
      setBranding(await res.json());
    } catch (e) {
      toast({
        title: "Could not remove the logo",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const downloadPng = async () => {
    if (!qrDataUrl || !church) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `tend-${church.slug}-qr.png`;
    a.click();
  };

  const printPoster = () => {
    if (!church) return;
    const win = window.open("", "_blank");
    if (!win) {
      toast({ title: "Popup blocked", description: "Allow popups for tendpray.com, then try again.", variant: "destructive" });
      return;
    }
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(church.name)}: Prayer requests</title>
          <meta charset="utf-8"/>
          <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&amp;family=Instrument+Serif:ital@0;1&amp;display=swap" rel="stylesheet"/>
          <style>
            @page { size: letter; margin: 0.5in; }
            * { box-sizing: border-box; }
            body {
              margin: 0; padding: 40px;
              background: #FFFFFF; color: #2A2521;
              font-family: 'Instrument Sans', sans-serif;
              min-height: 100vh;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center;
            }
            .eyebrow { font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase; color: #6F665B; margin-bottom: 24px; }
            .title { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 68px; line-height: 1.05; margin: 0 0 12px; letter-spacing: -0.02em; }
            .subtitle { font-family: 'Instrument Sans', sans-serif; font-size: 24px; color: #2A2521; margin: 0 0 40px; }
            .qr-wrap { padding: 32px; background: white; border: 2px solid #E2DACA; border-radius: 16px; margin-bottom: 32px; }
            .qr-wrap img { width: 340px; height: auto; display: block; }
            .instructions { font-size: 20px; color: #2A2521; margin: 0 0 8px; }
            .url { font-family: monospace; font-size: 16px; color: #6F665B; margin-bottom: 40px; }
            .footer { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6F665B; }
            .footer .brand { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 28px; letter-spacing: -0.02em; color: #2A2521; }
          </style>
        </head>
        <body>
          <div class="eyebrow">${escapeHtml(church.name)}</div>
          <h1 class="title">Share a prayer request</h1>
          <p class="subtitle">Big or small. You don’t have to carry it alone.</p>
          <div class="qr-wrap">
            <img src="${qrDataUrl}" alt="QR code to submit a prayer request"/>
          </div>
          <p class="instructions">Scan with your phone camera</p>
          <p class="url">${escapeHtml(publicUrl.replace(/^https?:\/\//, ""))}</p>
          <div class="footer">Powered by <span class="brand">Tend</span> · 1 Peter 5:2</div>
        </body>
      </html>
    `);
    win.document.close();
    win.onload = async () => { await win.document.fonts.ready; win.print(); };
  };

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(publicUrl); toast({ title: "Link copied", description: "Paste it into your bulletin or website." }); }
    catch { toast({title:"Copy this link",description:publicUrl}); }
  };

  const inviteMessage = useMemo(() => {
    if (!church || !publicUrl) return "";
    return `Hi everyone! This is our small group's prayer page. Drop a request anytime and we'll be praying for you: ${publicUrl}`;
  }, [church, publicUrl]);

  const copyInvite = async () => {
    if (!inviteMessage) return;
    try { await navigator.clipboard.writeText(inviteMessage); toast({ title: "Invite copied", description: "Paste it into your group text thread." }); }
    catch { toast({ title: "Copy this invite", description: inviteMessage }); }
  };

  if(error) return <DashboardShell church={church}><AccessProblem retry={()=>refetch()}/></DashboardShell>;
  return (
    <DashboardShell church={church}>
      <div className="max-w-4xl mx-auto p-6 sm:p-10">
        <div className="mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground leading-tight">
            Your church's QR code
          </h1>
          <p className="mt-2 text-muted-foreground">
            One code for your whole congregation. Print it, post it, and start catching prayers.
          </p>
        </div>

        {isLoading || !church ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* QR preview */}
            <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center justify-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                Preview
              </div>
              <div className="rounded-xl bg-white border border-border p-6 shadow-sm">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR code"
                    className="w-56 h-auto"
                    data-testid="img-qr-preview"
                  />
                ) : (
                  <Skeleton className="w-56 h-56" />
                )}
              </div>
              <div className="mt-6 text-center">
                <div className="font-serif text-xl text-foreground italic">{church.name}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground break-all">
                  {publicUrl}
                </div>
                {!isPaid && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Paid plans put your church logo in the center.
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-4">
              <ActionCard
                title="Print a poster"
                body="A ready-to-print 8.5×11 sanctuary poster. Perfect for the fellowship hall or entrance."
                icon={<Printer className="h-5 w-5" />}
                cta="Open print view"
                onClick={printPoster}
                testId="button-print-poster"
              />
              <ActionCard
                title="Download PNG"
                body="High-resolution PNG. Drop into your bulletin template, church website, or slide deck."
                icon={<Download className="h-5 w-5" />}
                cta="Download PNG"
                onClick={downloadPng}
                testId="button-download-png"
              />
              {isPaid && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="font-medium text-foreground mb-1">Your church logo</div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    Put your logo in the center of the code. Paste your website and we will find it. No upload needed.
                  </p>
                  {branding?.logoUrl ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={branding.logoUrl}
                        alt="Church logo"
                        className="h-14 w-14 object-contain rounded-lg bg-white border border-border p-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{branding.websiteUrl}</div>
                        <button
                          type="button"
                          onClick={removeLogo}
                          className="text-sm text-muted-foreground underline underline-offset-2"
                          data-testid="button-remove-logo"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        value={siteInput}
                        onChange={(e) => setSiteInput(e.target.value)}
                        placeholder="yourchurch.org"
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground"
                        data-testid="input-church-website"
                      />
                      {found ? (
                        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                          <img
                            src={found.dataUrl}
                            alt="Detected logo"
                            className="h-12 w-12 object-contain rounded bg-white border border-border p-1"
                          />
                          <div className="flex-1 text-sm text-foreground">Is this your logo?</div>
                          <Button
                            size="sm"
                            onClick={useFoundLogo}
                            disabled={saving}
                            data-testid="button-use-logo"
                          >
                            {saving ? "Saving" : "Use it"}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={findLogo}
                          disabled={detecting}
                          variant="outline"
                          className="w-full border-primary/30 text-[#8a6d1f] hover:bg-primary/5"
                          data-testid="button-find-logo"
                        >
                          {detecting ? "Looking for your logo" : "Find my logo"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <ActionCard
                title="Copy the link"
                body="Share your prayer wall directly by URL for emails, texts, or website links."
                icon={<Copy className="h-5 w-5" />}
                cta="Copy link"
                onClick={copyUrl}
                testId="button-copy-link"
              />
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-3 text-[#8a6d1f] mb-2">
                  <MessageCircle className="h-5 w-5" />
                  <div className="font-medium text-foreground">Text it to your small group</div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Copy a ready-made invite and drop it in your group thread. Anyone who taps the link can share a request in seconds.
                </p>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed mb-4" data-testid="text-group-invite">
                  {inviteMessage}
                </div>
                <Button
                  data-testid="button-copy-invite"
                  onClick={copyInvite}
                  variant="outline"
                  className="w-full border-primary/30 text-[#8a6d1f] hover:bg-primary/5"
                >
                  Copy group invite
                </Button>
              </div>
              <a
                href={`#/c/${church.slug}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
                data-testid="link-preview-page"
              >
                <div className="flex items-center gap-3 text-[#8a6d1f] mb-1">
                  <ExternalLink className="h-5 w-5" />
                  <span className="font-medium">Preview the public page</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  See exactly what your congregation sees when they scan the QR code.
                </p>
              </a>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function ActionCard({
  title,
  body,
  icon,
  cta,
  onClick,
  testId,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
  cta: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3 text-[#8a6d1f] mb-2">
        {icon}
        <div className="font-medium text-foreground">{title}</div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{body}</p>
      <Button
        data-testid={testId}
        onClick={onClick}
        variant="outline"
        className="w-full border-primary/30 text-[#8a6d1f] hover:bg-primary/5"
      >
        {cta}
      </Button>
    </div>
  );
}
