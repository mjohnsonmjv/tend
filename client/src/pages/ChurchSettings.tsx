import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell } from "@/components/DashboardShell";
import { useEffect, useState } from "react";
import type { Church } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, ExternalLink } from "lucide-react";
import { AccessProblem } from "@/components/AccessProblem";
import { publicChurchUrl } from "@/lib/inbox";

export default function ChurchSettings() {
  const { id } = useParams<{ id: string }>();
  const churchId = Number(id);
  const { toast } = useToast();
  const { data: church, isLoading,error,refetch } = useQuery<Church>({ queryKey: ["/api/churches", churchId] });
  const { data: billing } = useQuery<{ configured: boolean; plans: any[] }>({
    queryKey: ["/api/billing/status"],
  });

  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    if (church) setGreeting(church.greetingMessage);
  }, [church]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/churches/${churchId}/greeting`, { greeting });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId] });
      toast({ title: "Greeting updated" });
    },
  });

  if(error) return <DashboardShell church={church}><AccessProblem retry={()=>refetch()}/></DashboardShell>;
  return (
    <DashboardShell church={church}>
      <div className="max-w-3xl mx-auto p-6 sm:p-10 space-y-10">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground leading-tight">Settings</h1>
          <p className="mt-2 text-muted-foreground">
            Tune what your congregation sees and manage billing.
          </p>
        </div>

        {isLoading || !church ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <Section title="Greeting message" hint="Shown to congregation after they submit a request.">
              <Textarea
                data-testid="input-greeting"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                rows={3}
                maxLength={300}
                className="font-serif italic"
              />
              <Button
                data-testid="button-save-greeting"
                onClick={() => save.mutate()}
                disabled={save.isPending || !greeting.trim() || greeting === church.greetingMessage}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {save.isPending ? "Saving..." : "Save greeting"}
              </Button>
              {save.isError&&<p role="alert" className="text-destructive text-sm">Couldn’t save the greeting. Please try again.</p>}
              {save.isSuccess&&<p role="status" className="text-sm text-primary">Greeting saved.</p>}
            </Section>

            <Section title="Your church URL" hint="This is what the QR code links to. It's fixed after signup.">
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3 font-mono text-sm text-foreground flex items-center justify-between">
                <span className="break-all">{publicChurchUrl(church.slug)}</span>
                <a
                  href={`#/c/${church.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:text-primary/80"
                  data-testid="link-open-slug"
                  aria-label="Open your public prayer page"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </Section>

            <Section title="Pastor" hint="Contact info on your account.">
              <div className="rounded-md border border-border bg-card px-4 py-3 space-y-1">
                <div className="text-foreground">{church.pastorName}</div>
                <div className="text-sm text-muted-foreground">{church.pastorEmail}</div>
              </div>
            </Section>

            <Section
              title="Billing"
              hint={
                church.plan === "trial"
                  ? "You're on the free 14-day trial. Add a plan to continue after."
                  : `Current plan: ${church.plan}`
              }
            >
              {!billing?.configured && (
                <div className="rounded-md border border-dashed border-accent/40 bg-accent/5 p-4 text-sm text-foreground/80">
                  <div className="flex items-center gap-2 text-accent mb-1 font-medium">
                    <CreditCard className="h-4 w-4" /> Billing is not active
                  </div>
                  No charges occur during this pilot. Stripe Checkout and subscription management will be enabled after test-mode verification and pricing approval.
                </div>
              )}
              {billing?.plans && (
                <div className="grid sm:grid-cols-3 gap-3 mt-4">
                  {billing.plans.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">
                        {p.name}
                      </div>
                      <div className="font-serif text-2xl text-foreground mt-1">${p.price}/mo</div>
                      <div className="text-xs text-muted-foreground mt-2">{p.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-serif text-xl text-foreground">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
