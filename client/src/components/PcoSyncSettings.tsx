import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPcoStatus,
  fetchPcoWorkflows,
  requestPcoConnectUrl,
  setPcoWorkflow,
  syncPcoPending,
  parsePcoSyncReturn,
  stripPcoSyncReturn,
  markPcoConnectPending,
  consumePcoConnectPending,
  pcoErrorMessage,
} from "@/lib/pcoSync";

type Banner = { kind: "success" | "error" | "info"; text: string };

const bannerClass: Record<Banner["kind"], string> = {
  success: "rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-foreground",
  error: "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground",
  info: "rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground",
};

export function PcoSyncSettings({ churchId }: { churchId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const didInit = useRef(false);
  const [freshReturn, setFreshReturn] = useState<boolean | null>(null);

  const returned = useMemo(() => parsePcoSyncReturn(window.location.hash), []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    setFreshReturn(consumePcoConnectPending(churchId));
    const cleaned = stripPcoSyncReturn(window.location.hash);
    if (cleaned !== window.location.hash) {
      window.history.replaceState(null, "", cleaned || "#/");
    }
  }, [churchId]);

  const statusQuery = useQuery({
    queryKey: ["pco-status", churchId],
    queryFn: () => fetchPcoStatus(churchId),
    retry: false,
  });

  const workflowsQuery = useQuery({
    queryKey: ["pco-workflows", churchId],
    queryFn: () => fetchPcoWorkflows(churchId),
    enabled: !!statusQuery.data?.connected,
    retry: false,
    staleTime: 60000,
  });

  useEffect(() => {
    if (freshReturn === null) return;
    if (returned.error) {
      setBanner({ kind: "error", text: pcoErrorMessage(returned.error) });
    } else if (returned.connected || (freshReturn && statusQuery.data?.connected)) {
      setBanner({
        kind: "success",
        text: "Planning Center is connected. Choose the workflow below and new prayer requests will flow into it.",
      });
    } else if (freshReturn && statusQuery.data && !statusQuery.data.connected) {
      setBanner({ kind: "info", text: "The Planning Center connection did not finish. Try connecting again." });
    }
  }, [returned, freshReturn, statusQuery.data]);

  const saveWorkflow = useMutation({
    mutationFn: (workflowId: string | null) => setPcoWorkflow(churchId, workflowId),
    onSuccess: (_data, workflowId) => {
      queryClient.setQueryData(["pco-status", churchId], (old: unknown) =>
        old && typeof old === "object" ? { ...old, workflow_id: workflowId } : old,
      );
      toast({
        title: "Workflow saved",
        description: "New prayer requests will go to this Planning Center workflow.",
      });
    },
    onError: (e: unknown) =>
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      }),
  });

  async function connect() {
    setConnectError("");
    setConnecting(true);
    try {
      const url = await requestPcoConnectUrl(churchId);
      markPcoConnectPending(churchId);
      window.location.href = url;
    } catch (e: unknown) {
      setConnectError(e instanceof Error ? e.message : "Could not start the Planning Center connection. Try again.");
      setConnecting(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncMessage("");
    try {
      const summary = await syncPcoPending(churchId);
      queryClient.invalidateQueries({ queryKey: ["pco-status", churchId] });
      if (summary.attempted === 0) {
        setSyncMessage("Nothing new to sync.");
      } else if (summary.failed === 0) {
        setSyncMessage(`Synced ${summary.synced} ${summary.synced === 1 ? "request" : "requests"}.`);
      } else {
        setSyncMessage(
          `Synced ${summary.synced} of ${summary.attempted}. Could not sync ${summary.failed}: ${summary.failureReasons.join("; ")}.`,
        );
      }
    } catch (e: unknown) {
      setSyncMessage(e instanceof Error ? e.message : "Sync failed. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  if (statusQuery.isLoading) return <Skeleton className="h-36 w-full" />;
  if (statusQuery.isError)
    return (
      <div>
        <p role="alert" className="text-sm text-destructive">
          Could not check the Planning Center connection.
        </p>
        <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => statusQuery.refetch()}>
          Try again
        </Button>
      </div>
    );

  const status = statusQuery.data!;
  const lastSynced =
    status.last_synced_at &&
    new Date(status.last_synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="space-y-4">
      {banner && (
        <p role="status" className={bannerClass[banner.kind]}>
          {banner.text}
        </p>
      )}
      {!status.connected ? (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-sm text-foreground/80 leading-relaxed">
            Connect Planning Center to copy new prayer requests into your Planning Center People workflow as
            cards. Tend stays the capture layer. Planning Center stays the system of record.
          </p>
          <Button
            data-testid="button-pco-connect"
            onClick={connect}
            disabled={connecting}
            className="w-full min-h-12 mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {connecting ? "Opening Planning Center..." : "Connect Planning Center"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            You will sign in to Planning Center, then sign back in to Tend to choose a workflow.
          </p>
          {connectError && (
            <p role="alert" className="text-sm text-destructive mt-2">
              {connectError}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
            <p className="text-sm font-medium text-foreground">
              Connected{status.organization ? ` to ${status.organization}` : ""}
            </p>
          </div>
          <div>
            <label htmlFor="pco-workflow" className="text-sm font-medium text-foreground">
              Prayer workflow
            </label>
            <select
              id="pco-workflow"
              data-testid="select-pco-workflow"
              className="mt-2 block w-full min-h-12 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={status.workflow_id ?? ""}
              disabled={workflowsQuery.isLoading || saveWorkflow.isPending}
              onChange={(e) => saveWorkflow.mutate(e.target.value || null)}
            >
              <option value="">Choose a workflow</option>
              {(workflowsQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-2">
              New prayer requests will appear as cards in this workflow.
            </p>
            {workflowsQuery.isError && (
              <p className="text-xs text-destructive mt-1">
                Could not load workflows.{" "}
                <button type="button" className="underline min-h-11" onClick={() => workflowsQuery.refetch()}>
                  Try again
                </button>
              </p>
            )}
          </div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {status.pending_count > 0 ? `${status.pending_count} waiting to sync.` : "All caught up."}
                {lastSynced ? ` Last synced ${lastSynced}.` : ""}
              </p>
              <Button
                data-testid="button-pco-sync"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={syncNow}
                disabled={syncing || !status.workflow_id}
              >
                {syncing ? "Syncing..." : "Sync now"}
              </Button>
            </div>
            {!status.workflow_id && (
              <p className="text-xs text-muted-foreground mt-2">Choose a workflow above before syncing.</p>
            )}
            {syncMessage && (
              <p role="status" className="text-sm text-foreground/80 mt-2">
                {syncMessage}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
