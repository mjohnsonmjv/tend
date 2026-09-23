import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell } from "@/components/DashboardShell";
import type { Church } from "@shared/schema";
import { Download, Printer, Copy, ExternalLink } from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import QRCode from "qrcode";
import { AccessProblem } from "@/components/AccessProblem";

const escapeHtml = (text:string) => text.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export default function ChurchQR() {
  const { id } = useParams<{ id: string }>();
  const churchId = Number(id);
  const { data: church, isLoading,error,refetch } = useQuery<Church>({ queryKey: ["/api/churches", churchId] });
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const { toast } = useToast();

  // Public URL : for QR embedding. In production tend.faith/c/slug.
  const publicUrl = useMemo(() => {
    if (!church) return "";
    return `${window.location.origin}${window.location.pathname}#/c/${church.slug}`;
  }, [church]);

  // Generate locally. No third-party QR service receives church URLs.
  useEffect(() => {
    if (!publicUrl) return;
    QRCode.toDataURL(publicUrl,{width:1024,margin:4,errorCorrectionLevel:"M"})
      .then(setQrDataUrl).catch(()=>toast({title:"Could not generate QR code",variant:"destructive"}));
  }, [church, publicUrl]);

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
    if (!win) return;
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(church.name)}: Prayer requests</title>
          <meta charset="utf-8"/>
          <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800&amp;f[]=satoshi@400,500,700&amp;display=swap" rel="stylesheet"/>
          <style>
            @page { size: letter; margin: 0.5in; }
            * { box-sizing: border-box; }
            body {
              margin: 0; padding: 40px;
              background: #f7f7f0; color: #203e34;
              font-family: 'Satoshi', sans-serif;
              min-height: 100vh;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center;
            }
            .eyebrow { font-size: 12px; letter-spacing: 0.25em; text-transform: uppercase; color: #6b655c; margin-bottom: 24px; }
            .title { font-family: 'Cabinet Grotesk', sans-serif; font-weight: 800; font-size: 68px; line-height: 1.05; margin: 0 0 12px; letter-spacing: -0.035em; }
            .subtitle { font-family: 'Satoshi', sans-serif; font-size: 24px; color: #203e34; margin: 0 0 40px; }
            .qr-wrap { padding: 32px; background: white; border: 2px solid #dcd6cc; border-radius: 16px; margin-bottom: 32px; }
            .qr-wrap img { width: 340px; height: 340px; display: block; }
            .instructions { font-size: 20px; color: #203e34; margin: 0 0 8px; }
            .url { font-family: monospace; font-size: 16px; color: #6b655c; margin-bottom: 40px; }
            .footer { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b655c; }
            .footer .brand { font-family: 'Cabinet Grotesk', sans-serif; font-weight: 800; font-size: 28px; letter-spacing: -0.04em; color: #203e34; }
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
                    className="w-56 h-56"
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
              <ActionCard
                title="Copy the link"
                body="Share your prayer wall directly by URL for emails, texts, or website links."
                icon={<Copy className="h-5 w-5" />}
                cta="Copy link"
                onClick={copyUrl}
                testId="button-copy-link"
              />
              <a
                href={`#/c/${church.slug}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
                data-testid="link-preview-page"
              >
                <div className="flex items-center gap-3 text-primary mb-1">
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
      <div className="flex items-center gap-3 text-primary mb-2">
        {icon}
        <div className="font-medium text-foreground">{title}</div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{body}</p>
      <Button
        data-testid={testId}
        onClick={onClick}
        variant="outline"
        className="w-full border-primary/30 text-primary hover:bg-primary/5"
      >
        {cta}
      </Button>
    </div>
  );
}
