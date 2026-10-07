import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import { ChevronLeft, ChevronRight, Check, Loader2, Clock, ChevronDown } from "lucide-react";

interface WatchInfo {
  id: number; slug: string; title: string; description: string | null;
  churchName: string; startDate: string; endDate: string | null;
  slotMinutes: number; isActive: boolean;
}
interface Slot { id: number; startsAt: string; endsAt: string; taken: boolean; displayName?: string | null; }
interface DayView { total: number; filled: number; slots: Slot[]; }

const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

export default function WatchSignup() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState(() => { try { return localStorage.getItem("tend_name") || ""; } catch { return ""; } });
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [signupKey] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<{ startsAt: string; title: string } | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  const watch = useQuery<WatchInfo>({ queryKey: [`/api/watches/by-slug/${slug}`] });

  const days = useMemo(() => {
    if (!watch.data) return [];
    const start = new Date(watch.data.startDate + "T12:00:00");
    const end = watch.data.endDate ? new Date(watch.data.endDate + "T12:00:00") : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const first = start < today ? today : start;
    const activeWeekdays: number[] | null = (watch.data as any).activeWeekdays ?? null;
    const list: Date[] = [];
    for (let i = 0; i < 28 && list.length < 8; i++) {
      const d = new Date(first); d.setDate(d.getDate() + i);
      if (end && d > end) break;
      if (activeWeekdays && !activeWeekdays.includes(d.getDay())) continue;
      list.push(d);
    }
    return list;
  }, [watch.data]);

  const activeDay = days[Math.min(dayOffset, Math.max(0, days.length - 1))];
  const activeISO = activeDay ? toISODate(activeDay) : null;

  const day = useQuery<DayView>({
    queryKey: [`/api/watches/by-slug/${slug}/day?date=${activeISO}`],
    enabled: !!activeISO,
  });

  const signup = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/watches/by-slug/${slug}/signup`, {
      slotId: selectedSlot!.id, name, email, phone, website, signupKey, anonymous,
    })).json(),
    onSuccess: (data) => {
      try { localStorage.setItem("tend_name", name); } catch { /* ignore */ }
      setDone({ startsAt: data.startsAt, title: data.title });
      setSelectedSlot(null);
      day.refetch();
    },
    onError: (e: Error) => {
      toast({ title: "Could not save your signup", description: e.message, variant: "destructive" });
      day.refetch();
    },
  });

  // Group slots by hour for the timeline grid.
  const hours = useMemo(() => {
    const map = new Map<number, Slot[]>();
    for (const s of day.data?.slots || []) {
      const h = new Date(s.startsAt).getHours();
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [day.data]);

  // Consecutive open blocks, for the "openings" summary.
  const openings = useMemo(() => {
    const slots = day.data?.slots || [];
    const blocks: { start: string; end: string; count: number }[] = [];
    let cur: Slot[] = [];
    const flush = () => {
      if (cur.length) {
        blocks.push({ start: cur[0].startsAt, end: cur[cur.length - 1].endsAt, count: cur.length });
        cur = [];
      }
    };
    for (const s of slots) { if (s.taken) flush(); else cur.push(s); }
    flush();
    return blocks;
  }, [day.data]);

  const pct = day.data && day.data.total ? Math.round((day.data.filled / day.data.total) * 100) : 0;

  if (watch.isLoading) return <div className="min-h-screen p-8 max-w-2xl mx-auto space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (watch.isError || !watch.data) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <Logo size={40} /><h1 className="font-serif text-2xl mt-4">This prayer watch was not found</h1>
      <p className="text-muted-foreground mt-2">Check the link and try again.</p>
    </div>
  );
  const w = watch.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-5 py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2"><Logo size={20} /><span>{w.churchName}</span></div>
          <h1 className="font-serif text-3xl">{w.title}</h1>
          {w.description && <p className="text-muted-foreground mt-2">{w.description}</p>}
          <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1.5"><Clock className="h-4 w-4" /> Around-the-clock prayer. Pick a 15-minute time to cover.</p>
          <button onClick={() => setShowWhy(v => !v)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
            Why 24/7 prayer?
            <ChevronDown className={`h-4 w-4 transition-transform ${showWhy ? "rotate-180" : ""}`} />
          </button>
          {showWhy && (
            <div className="mt-3 text-sm text-muted-foreground space-y-2.5 leading-relaxed">
              <p>When Bill Bright founded Cru in 1951, one of the first things he did was organize a 24-hour prayer chain. He divided each day into 96 fifteen-minute segments and invited friends to cover them in prayer. He knew the ministry would only be as effective as God allowed it to be.</p>
              <p>That is how every great movement of God begins: ordinary people surrendering to Him in prayer, around the clock. When you take a time slot, you are joining that story.</p>
              <p className="font-serif italic text-foreground">"Pray continually." <span className="not-italic text-xs">1 Thessalonians 5:17</span></p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6">
        {/* Day picker */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="icon" disabled={dayOffset <= 0} onClick={() => setDayOffset(o => o - 1)} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="text-center">
            <div className="font-semibold">{activeDay ? fmtDay(activeISO!) : ""}</div>
            <div className="text-xs text-muted-foreground">{day.data ? `${day.data.filled} of ${day.data.total} covered` : ""}</div>
          </div>
          <Button variant="outline" size="icon" disabled={dayOffset >= days.length - 1} onClick={() => setDayOffset(o => o + 1)} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
        </div>

        {/* Coverage */}
        {day.data && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1.5"><span className="font-medium">Day coverage</span><span className="text-muted-foreground">{pct}% full</span></div>
            <div className="h-3 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            {openings.length > 0 && (
              <div className="mt-3 text-sm">
                <span className="font-medium">Openings: </span>
                <span className="text-muted-foreground">{openings.slice(0, 4).map(b => `${fmtTime(b.start)} – ${fmtTime(b.end)}`).join(" · ")}{openings.length > 4 ? ` · +${openings.length - 4} more` : ""}</span>
              </div>
            )}
          </div>
        )}

        {day.isLoading ? <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div> : (
          <div className="space-y-4">
            {hours.map(([hour, slots]) => (
              <div key={hour}>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {new Date(2026, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {slots.map(s => (
                    <button
                      key={s.id}
                      disabled={s.taken}
                      onClick={() => setSelectedSlot(s)}
                      className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${s.taken
                        ? "border-border bg-muted/60 text-muted-foreground cursor-default"
                        : "border-primary/40 bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary"}`}
                    >
                      <span className="block">{fmtTime(s.startsAt)}</span>
                      {s.taken && s.displayName && (
                        <span className="block text-xs font-normal opacity-70 truncate">{s.displayName}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-8">Your first name shows on taken times so the church can see the prayer chain. Check "Keep my name private" to show as Anonymous instead.</p>
      </main>

      {/* Signup sheet */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setSelectedSlot(null)}>
          <div className="bg-background rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif text-xl mb-1">Cover this time in prayer</h2>
            <p className="text-muted-foreground text-sm mb-4">{activeDay ? fmtDay(activeISO!) : ""} · {fmtTime(selectedSlot.startsAt)} – {fmtTime(selectedSlot.endsAt)}</p>
            <div className="space-y-3">
              <div><Label htmlFor="ws-name">Your name</Label><Input id="ws-name" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" autoFocus /></div>
              <div><Label htmlFor="ws-email">Email <span className="text-muted-foreground font-normal">(optional, for a reminder)</span></Label><Input id="ws-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div>
              <div><Label htmlFor="ws-phone">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label><Input id="ws-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" /></div>
              <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border accent-primary" />
                <span>Keep my name private <span className="text-muted-foreground font-normal">(shows as Anonymous)</span></span>
              </label>
              <input type="text" value={website} onChange={e => setWebsite(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
              <Button className="w-full" disabled={!name.trim() || signup.isPending} onClick={() => signup.mutate()}>
                {signup.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Sign me up"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setSelectedSlot(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation */}
      {done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDone(null)}>
          <div className="bg-background rounded-2xl p-8 w-full max-w-md shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center"><Check className="h-6 w-6 text-primary" /></div>
            <h2 className="font-serif text-2xl mb-2">You are signed up</h2>
            <p className="text-muted-foreground">{new Date(done.startsAt).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {fmtTime(done.startsAt)}</p>
            <p className="text-sm text-muted-foreground mt-3">Thank you for covering this time in prayer for {w.churchName}.</p>
            <Button className="mt-6 w-full" onClick={() => setDone(null)}>Done</Button>
            <Link href={`/w/${slug}`} className="text-xs text-muted-foreground underline mt-3 inline-block">Sign up for another time</Link>
          </div>
        </div>
      )}
    </div>
  );
}
