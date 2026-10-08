import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, ArrowLeft, Church } from "lucide-react";

interface WallPrayer {
  id: number;
  message: string;
  category: string | null;
  isAnonymous: boolean;
  submitterName: string | null;
  createdAt: string;
  prayCount: number;
}

function displayName(p: { isAnonymous: boolean; submitterName: string | null }) {
  if (p.isAnonymous || !p.submitterName) return "Anonymous";
  const parts = p.submitterName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function PrayerWall() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [prayedIds, setPrayedIds] = useState<Set<number>>(new Set());

  const { data: church } = useQuery({
    queryKey: ["/api/churches/by-slug", slug],
    queryFn: async () => (await apiRequest("GET", `/api/churches/by-slug/${slug}`)).json(),
  });

  const { data: prayers, isLoading } = useQuery<WallPrayer[]>({
    queryKey: ["prayer-wall", slug],
    enabled: !!church?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tend_prayers")
        .select("id,message,category,is_anonymous,submitter_name,created_at,tend_prayer_prays(count)")
        .eq("church_id", church.id)
        .eq("is_private", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        message: r.message,
        category: r.category,
        isAnonymous: r.is_anonymous,
        submitterName: r.submitter_name,
        createdAt: r.created_at,
        prayCount: r.tend_prayer_prays?.[0]?.count ?? 0,
      }));
    },
  });

  const pray = useMutation({
    mutationFn: async (prayerId: number) => {
      const { data, error } = await supabase.rpc("record_prayer_pray", { p_prayer_id: prayerId });
      if (error) throw error;
      return { prayerId, count: data as number };
    },
    onSuccess: ({ prayerId, count }) => {
      setPrayedIds((s) => new Set(s).add(prayerId));
      queryClient.setQueryData<WallPrayer[]>(["prayer-wall", slug], (old) =>
        old?.map((p) => (p.id === prayerId ? { ...p, prayCount: count } : p))
      );
      // Fire-and-forget: notify the requester someone prayed.
      void supabase.functions.invoke("send-prayed-notification", { body: { prayerId } }).catch(() => {});
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Link href={`/c/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to prayer form
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Church className="h-6 w-6 text-primary" />
          <h1 className="font-serif text-3xl text-foreground">{church?.name ?? "Prayer wall"}</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          These are the requests our church family is lifting up. When you pray for one, tap “I prayed” so they know they’re not alone.
        </p>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
        ) : !prayers?.length ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <Heart className="h-8 w-8 text-primary mx-auto mb-4" />
            <p className="font-serif text-xl text-foreground mb-2">No shared requests yet</p>
            <p className="text-sm text-muted-foreground">
              When our care team shares prayer requests here, you’ll see them in this space.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {prayers.map((p) => {
              const prayed = prayedIds.has(p.id);
              return (
                <article key={p.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="text-sm font-medium text-foreground">{displayName(p)}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(p.createdAt)}</span>
                  </div>
                  <p className="text-foreground leading-relaxed mb-4">“{p.message}”</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {p.prayCount === 0 ? "Be the first to pray" : p.prayCount === 1 ? "1 person prayed" : `${p.prayCount} people prayed`}
                    </span>
                    <Button
                      size="sm"
                      variant={prayed ? "default" : "outline"}
                      disabled={prayed || pray.isPending}
                      data-testid={`button-pray-${p.id}`}
                      onClick={() => pray.mutate(p.id)}
                      className="min-h-[44px] px-5"
                    >
                      <Heart className={`mr-1.5 h-4 w-4 ${prayed ? "fill-current" : ""}`} />
                      {prayed ? "Amen" : "I prayed"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-10">
          Powered by Tend · {church?.name}’s care team reviews every request.
        </p>
      </div>
    </div>
  );
}
