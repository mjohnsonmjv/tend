import { useMemo, useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { generateChurchQr } from "@/lib/churchQr";
import { ChevronLeft, ChevronRight, Copy, Check, Send, Loader2, ArrowLeft, Download, QrCode } from "lucide-react";
import type { Church } from "@shared/schema";

interface Watch {
  id: number; churchId: number; title: string; description: string | null;
  slug: string; startDate: string; endDate: string | null;
  slotMinutes: number; isActive: boolean;
}
interface Slot {
  id: number; startsAt: string; endsAt: string;
  name: string | null; email: string | null; phone: string | null; signedUpAt: string | null;
}
interface DayView { total: number; filled: number; slots: Slot[]; }

const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

export default function WatchDashboard() {
  const { id, watchId } = useParams<{ id: string; watchId: string }>();
  const churchId = Number(id), wid = Number(watchId);
  const { toast } = useToast();
  const [dayISO, setDayISO] = useState(() => toISODate(new Date()));
  const [inviteText, setInviteText] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQr, setShowQr] = useState(false);

  const church = useQuery<Church>({ queryKey: ["/api/churches", churchId] });
  const watch = useQuery<Watch>({ queryKey: [`/api/watches/${wid}`], enabled: !!church.data });
  const day = useQuery<DayView>({ queryKey: [`/api/watches/${wid}/day?date=${dayISO}`], enabled: !!watch.data });
  const invites = useQuery<{ id: number; email: string; sentAt: string | null }[]>({
    queryKey: [`/api/watches/${wid}/invites`], enabled: !!watch.data,
  });

  const moveDay = (n: number) => {
    const d = new Date(dayISO + "T12:00:00"); d.setDate(d.getDate() + n);
    setDayISO(toISODate(d));
  };

  const hours = useMemo(() => {
    const map = new Map<number, Slot[]>();
    for (const s of day.data?.slots || []) {
      const h = new Date(s.startsAt).getHours();
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [day.data]);

  const openings = useMemo(() => {
    const slots = day.data?.slots || [];
    const blocks: { start: string; end: string; count: number }[] = [];
    let cur: Slot[] = [];
    const flush = () => { if (cur.length) { blocks.push({ start: cur[0].startsAt, end: cur[cur.length - 1].endsAt, count: cur.length }); cur = []; } };
    for (const s of slots) { if (s.name) flush(); else cur.push(s); }
    flush();
    return blocks;
  }, [day.data]);

  const signups = useMemo(() => (day.data?.slots || []).filter(s => s.name), [day.data]);
  const pct = day.data && day.data.total ? Math.round((day.data.filled / day.data.total) * 100) : 0;
  const signupUrl = watch.data ? `${window.location.origin}${window.location.pathname}#/w/${watch.data.slug}` : "";

  const sendInvites = useMutation({
    mutationFn: async () => {
      const emails = inviteText.split(/[\s,;]+/).map(e => e.trim()).filter(e => /.+@.+\..+/.test(e));
      return (await apiRequest("POST", `/api/watches/${wid}/invites`, { emails })).json();
    },
    onSuccess: (out) => {
      setInviteText("");
      queryClient.invalidateQueries({ queryKey: [`/api/watches/${wid}/invites`] });
      toast({ title: "Invites sent", description: `${out.sent || 0} email${out.sent === 1 ? "" : "s"} sent.` });
    },
    onError: (e: Error) => toast({ title: "Could not send invites", description: e.message, variant: "destructive" }),
  });

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(signupUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast({ title: "Copy failed", description: signupUrl }); }
  };

  // QR code for the signup link, generated locally when the pastor opens it.
  useEffect(() => {
    if (!showQr || !signupUrl) return;
    let cancelled = false;
    generateChurchQr(signupUrl)
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) toast({ title: "Could not generate QR code", variant: "destructive" }); });
    return () => { cancelled = true; };
  }, [showQr, signupUrl]);

  const downloadQr = () => {
    if (!qrDataUrl || !watch.data) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `tend-${watch.data.slug}-prayer-qr.png`;
    a.click();
  };

  return (
    <DashboardShell church={church.data}>
      <div className="max-w-5xl mx-auto p-5 sm:p-10">
        <Link href={`/church/${churchId}/watches`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> All prayer watches
        </Link>
        {watch.isLoading ? <Skeleton className="h-10 w-1/2" /> : watch.data && (
          <>
            <h1 className="font-serif text-3xl">{watch.data.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={copyLink}>
                {copied ? <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</> : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy signup link</>}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowQr(v => !v)}>
                <QrCode className="h-3.5 w-3.5 mr-1.5" /> QR code
              </Button>
              <span className="text-xs text-muted-foreground font-mono truncate max-w-full">{signupUrl}</span>
            </div>
            {showQr && (
              <div className="border border-border rounded-2xl p-5 bg-card mt-4 flex flex-col sm:flex-row items-center gap-5">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code for the prayer watch signup page" className="w-44 h-44 rounded-lg border border-border" />
                ) : (
                  <Skeleton className="w-44 h-44 rounded-lg" />
                )}
                <div className="text-center sm:text-left">
                  <h2 className="font-serif text-xl mb-1">Share the signup QR</h2>
                  <p className="text-sm text-muted-foreground mb-3">Print it in the bulletin or show it on screen. Anyone who scans it lands on the signup page.</p>
                  <Button variant="outline" size="sm" onClick={downloadQr} disabled={!qrDataUrl}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download PNG
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Day navigation + coverage */}
        <div className="border border-border rounded-2xl p-5 bg-card mt-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="icon" onClick={() => moveDay(-1)} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-center">
              <div className="font-semibold">{fmtDay(new Date(dayISO + "T12:00:00"))}</div>
              {dayISO !== toISODate(new Date()) && (
                <button className="text-xs text-primary underline" onClick={() => setDayISO(toISODate(new Date()))}>Back to today</button>
              )}
            </div>
            <Button variant="outline" size="icon" onClick={() => moveDay(1)} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {day.isLoading ? <Skeleton className="h-16" /> : day.data && (
            <>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium">{day.data.filled} of {day.data.total} slots filled</span>
                <span className="text-muted-foreground">{pct}% covered</span>
              </div>
              <div className="h-4 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-4">
                <div className="text-sm font-medium mb-1.5">Openings ({openings.length} {openings.length === 1 ? "gap" : "gaps"})</div>
                {openings.length === 0 ? <p className="text-sm text-muted-foreground">This day is fully covered.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {openings.map((b, i) => (
                      <span key={i} className="text-xs border border-border rounded-full px-3 py-1.5 bg-background">
                        {fmtTime(b.start)} – {fmtTime(b.end)} <span className="text-muted-foreground">({b.count} {b.count === 1 ? "slot" : "slots"})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          {/* Slot timeline */}
          <div className="border border-border rounded-2xl p-5 bg-card">
            <h2 className="font-serif text-xl mb-4">Time slots</h2>
            {day.isLoading ? <Skeleton className="h-64" /> : (
              <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                {hours.map(([hour, slots]) => (
                  <div key={hour}>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {new Date(2026, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {slots.map(s => (
                        <div key={s.id} title={s.name || "Open"}
                          className={`rounded-lg border px-2.5 py-2 text-xs ${s.name ? "border-primary/50 bg-primary/10" : "border-border bg-background"}`}>
                          <div className="font-semibold">{fmtTime(s.startsAt)}</div>
                          <div className={`truncate ${s.name ? "" : "text-muted-foreground"}`}>{s.name || "Open"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {/* Signups */}
            <div className="border border-border rounded-2xl p-5 bg-card">
              <h2 className="font-serif text-xl mb-4">Signups ({signups.length})</h2>
              {signups.length === 0 ? <p className="text-sm text-muted-foreground">No one has signed up for this day yet.</p> : (
                <ul className="divide-y divide-border max-h-72 overflow-y-auto">
                  {signups.map(s => (
                    <li key={s.id} className="py-2.5 text-sm">
                      <div className="flex justify-between gap-2"><span className="font-medium">{s.name}</span><span className="text-muted-foreground shrink-0">{fmtTime(s.startsAt)}</span></div>
                      {(s.email || s.phone) && <div className="text-xs text-muted-foreground mt-0.5">{[s.email, s.phone].filter(Boolean).join(" · ")}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Invites */}
            <div className="border border-border rounded-2xl p-5 bg-card">
              <h2 className="font-serif text-xl mb-2">Invite people</h2>
              <p className="text-sm text-muted-foreground mb-3">Paste email addresses separated by commas or new lines. Each person gets an email with the signup link.</p>
              <Label htmlFor="wd-invites" className="sr-only">Email addresses</Label>
              <Textarea id="wd-invites" rows={3} value={inviteText} onChange={e => setInviteText(e.target.value)} placeholder="mary@example.com, john@example.com" />
              <Button className="mt-3 w-full" disabled={!inviteText.trim() || sendInvites.isPending} onClick={() => sendInvites.mutate()}>
                {sendInvites.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : <><Send className="h-4 w-4 mr-2" /> Send invites</>}
              </Button>
              {invites.data && invites.data.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-1.5">Invited ({invites.data.length})</div>
                  <ul className="text-sm text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                    {invites.data.map(i => <li key={i.id}>{i.email}{i.sentAt ? "" : " (not sent yet)"}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
