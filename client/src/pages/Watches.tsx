import { useState } from "react";
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
import { Plus, Loader2, Copy, Check, Trash2 } from "lucide-react";
import type { Church } from "@shared/schema";

interface Watch {
  id: number; churchId: number; title: string; description: string | null;
  slug: string; startDate: string; endDate: string | null;
  slotMinutes: number; isActive: boolean; createdAt: number;
}

export default function Watches() {
  const { id } = useParams<{ id: string }>();
  const churchId = Number(id);
  const { toast } = useToast();
  const church = useQuery<Church>({ queryKey: ["/api/churches", churchId] });
  const watches = useQuery<Watch[]>({ queryKey: [`/api/churches/${churchId}/watches`], enabled: !!church.data });

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/churches/${churchId}/watches`, {
      title, description, startDate, endDate: endDate || null, slotMinutes: 15,
    })).json(),
    onSuccess: (w: Watch) => {
      queryClient.invalidateQueries({ queryKey: [`/api/churches/${churchId}/watches`] });
      setShowForm(false); setTitle(""); setDescription(""); setEndDate("");
      toast({ title: "Prayer watch created", description: "Share the signup link to fill the day." });
    },
    onError: (e: Error) => toast({ title: "Could not create the watch", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (watchId: number) => (await apiRequest("DELETE", `/api/watches/${watchId}`)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/churches/${churchId}/watches`] }),
    onError: (e: Error) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  const signupUrl = (slug: string) => `${window.location.origin}${window.location.pathname}#/w/${slug}`;
  const copyLink = async (w: Watch) => {
    try { await navigator.clipboard.writeText(signupUrl(w.slug)); setCopied(w.id); setTimeout(() => setCopied(null), 2000); }
    catch { toast({ title: "Copy failed", description: signupUrl(w.slug) }); }
  };

  return (
    <DashboardShell church={church.data}>
      <div className="max-w-4xl mx-auto p-5 sm:p-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl">24/7 prayer watches</h1>
            <p className="text-muted-foreground mt-1">Cover every 15 minutes of the day in prayer. Share the link, watch the day fill.</p>
          </div>
          <Button onClick={() => setShowForm(v => !v)}><Plus className="h-4 w-4 mr-2" /> New watch</Button>
        </div>

        {showForm && (
          <div className="border border-border rounded-2xl p-6 mb-8 bg-card">
            <h2 className="font-serif text-xl mb-4">Start a prayer watch</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Label htmlFor="w-title">Title</Label><Input id="w-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Easter week 24/7 prayer" /></div>
              <div className="sm:col-span-2"><Label htmlFor="w-desc">Description <span className="text-muted-foreground font-normal">(shown on the signup page)</span></Label><Textarea id="w-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Join our church family in covering every minute in prayer…" rows={2} /></div>
              <div><Label htmlFor="w-start">Start date</Label><Input id="w-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div><Label htmlFor="w-end">End date <span className="text-muted-foreground font-normal">(blank = ongoing)</span></Label><Input id="w-end" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} /></div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">Each day is split into 96 fifteen-minute slots. The first two weeks of slots are created now; more fill in as people visit.</p>
            <div className="flex gap-2 mt-4">
              <Button disabled={!title.trim() || !startDate || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create watch"}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {watches.isLoading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          : watches.isError ? <p className="text-destructive">Could not load your prayer watches.</p>
          : !watches.data?.length ? (
            <div className="border border-dashed border-border rounded-2xl p-10 text-center">
              <p className="font-serif text-xl mb-2">No prayer watches yet</p>
              <p className="text-muted-foreground text-sm">Start one above — a week of 24/7 prayer, a day of prayer before Easter, or an ongoing ministry.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {watches.data.map(w => (
                <div key={w.id} className="border border-border rounded-2xl p-5 bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link href={`/church/${churchId}/watches/${w.id}`} className="font-serif text-xl hover:underline">{w.title}</Link>
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(w.startDate + "T12:00:00").toLocaleDateString()} – {w.endDate ? new Date(w.endDate + "T12:00:00").toLocaleDateString() : "ongoing"}
                        {!w.isActive && <span className="ml-2 text-xs uppercase tracking-wide">(paused)</span>}
                      </p>
                    </div>
                    <button className="text-muted-foreground hover:text-destructive" aria-label="Delete watch"
                      onClick={() => { if (confirm(`Delete "${w.title}" and all its signups?`)) remove.mutate(w.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Link href={`/church/${churchId}/watches/${w.id}`}><Button variant="outline" size="sm">Day dashboard</Button></Link>
                    <Button variant="outline" size="sm" onClick={() => copyLink(w)}>
                      {copied === w.id ? <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</> : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy signup link</>}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </DashboardShell>
  );
}
