import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell } from "@/components/DashboardShell";
import type { Church, PrayerRequest, Status } from "@shared/schema";
import { CATEGORY_LABELS, STATUS_LABELS, STATUSES } from "@shared/schema";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, Archive, Undo2, User, Phone, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AccessProblem } from "@/components/AccessProblem";

export default function PrayerDetail() {
  const { id, prayerId } = useParams<{ id: string; prayerId: string }>();
  const churchId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: church,error:churchError } = useQuery<Church>({ queryKey: ["/api/churches", churchId] });
  const { data: prayer, isLoading,error:prayerError,refetch } = useQuery<PrayerRequest>({
    queryKey: ["/api/prayers", Number(prayerId)],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/prayers/${prayerId}`);
      return res.json();
    },
  });

  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (prayer) setNotes(prayer.pastorNotes ?? "");
  }, [prayer?.id, prayer?.pastorNotes]);

  const setStatus = useMutation({
    mutationFn: async (status: Status) => {
      const res = await apiRequest("PATCH", `/api/prayers/${prayerId}/status`, { status });
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/prayers", Number(prayerId)], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "stats"] });
    },
  });

  const saveNotes = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/prayers/${prayerId}/notes`, { notes });
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/prayers", Number(prayerId)], updated);
      toast({ title: "Notes saved", description: "Your note is saved with this request." });
    },
  });

  const dirty=!!prayer && notes!==(prayer.pastorNotes??"");
  useEffect(()=>{
    if(!dirty)return;
    const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=""};
    window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);
  },[dirty]);
  if(churchError||prayerError||(prayer&&prayer.churchId!==churchId)) return <DashboardShell church={church}><AccessProblem retry={()=>refetch()}/></DashboardShell>;
  if (isLoading || !prayer) {
    return (
      <DashboardShell church={church}>
        <div className="max-w-3xl mx-auto p-10 space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell church={church}>
      <div className="max-w-3xl mx-auto p-6 sm:p-10">
        <button
          onClick={() => {if(!dirty||window.confirm("Leave without saving your note?"))navigate(`/church/${churchId}/dashboard`)}}
          data-testid="button-back"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to prayer inbox
        </button>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
          <span className="font-medium text-primary">
            {CATEGORY_LABELS[prayer.category as keyof typeof CATEGORY_LABELS]}
          </span>
          <span>·</span>
          <span>{new Date(prayer.createdAt).toLocaleString()}</span>
          {prayer.isUrgent && (
            <span className="inline-flex items-center gap-1 text-accent">
              <AlertCircle className="h-3 w-3" /> Urgent
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            {STATUS_LABELS[prayer.status as Status]}
          </span>
        </div>

        {/* Message */}
        <blockquote className="text-lg text-foreground leading-relaxed break-words py-4 my-6">
          "{prayer.message}"
        </blockquote>

        {/* Submitter */}
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">From</div>
          {prayer.isAnonymous ? (
            <div className="text-foreground italic">Anonymous</div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-foreground">
                <User className="h-4 w-4 text-muted-foreground" />
                {prayer.submitterName || "Unnamed"}
              </div>
              {prayer.submitterPhone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <a href={`tel:${prayer.submitterPhone}`} className="hover:text-primary">
                    {prayer.submitterPhone}
                  </a>
                  <a
                    href={`sms:${prayer.submitterPhone}`}
                    className="ml-2 text-xs text-primary underline underline-offset-4"
                  >
                    Open your phone’s text app
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* Status actions */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Move to</div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button
                key={s}
                variant={prayer.status === s ? "default" : "outline"}
                size="sm"
                data-testid={`button-status-${s}`}
                onClick={() => setStatus.mutate(s)}
                disabled={setStatus.isPending}
                className={prayer.status === s ? "bg-primary text-primary-foreground" : ""}
              >
                {s === "praying" && <Heart className="mr-1.5 h-3 w-3" />}
                {s === "archived" && <Archive className="mr-1.5 h-3 w-3" />}
                {s === "new" && <Undo2 className="mr-1.5 h-3 w-3" />}
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>
        {setStatus.isError&&<p role="alert" className="text-destructive text-sm mb-5">Status wasn’t saved. Please try again.</p>}

        {/* Pastor notes */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="pastor-notes" className="text-sm font-medium text-foreground">Pastor's notes</label>
            <span className="text-xs text-muted-foreground">Only you can see these</span>
          </div>
          <Textarea
            id="pastor-notes"
            maxLength={4000}
            data-testid="input-pastor-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Follow up on Tuesday. Called them Sunday afternoon..."
            className="font-serif"
          />
          <p className="text-xs text-muted-foreground mt-2">{notes.length}/4,000 characters · {dirty?"Unsaved changes":"Saved"}</p>
          {saveNotes.isError&&<p role="alert" className="text-destructive text-sm mt-3">Your note wasn’t saved. The text is still here; please try again.</p>}
          <Button
            data-testid="button-save-notes"
            onClick={() => saveNotes.mutate()}
            disabled={saveNotes.isPending || notes === (prayer.pastorNotes ?? "")}
            className="mt-3 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saveNotes.isPending ? "Saving..." : "Save notes"}
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}
