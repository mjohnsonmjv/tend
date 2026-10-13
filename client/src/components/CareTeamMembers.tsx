import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Trash2, UserPlus } from "lucide-react";

type Member = { id: number; name: string; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Care team member list for a church. Members sign in with their own Tend
 * account (matching email) and can fully run the church's inbox, prayers,
 * and prayer watches. Rendered inside ChurchSettings.
 *
 * If the tend_care_team_members table is not readable (migration pending),
 * this renders nothing so the rest of settings keeps working.
 */
export function CareTeamMembers({ churchId }: { churchId: number }) {
  const { toast } = useToast();
  // undefined = loading, null = unavailable, Member[] = loaded
  const [members, setMembers] = useState<Member[] | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("tend_care_team_members")
      .select("id,name,email")
      .eq("church_id", churchId)
      .order("created_at", { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setMembers(null);
          return;
        }
        setMembers((data ?? []) as Member[]);
      });
    return () => {
      cancelled = true;
    };
  }, [churchId]);

  const addMember = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) {
      setError("Add a name for this team member.");
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      setError("That email address does not look valid.");
      return;
    }
    if ((members ?? []).some((m) => m.email.toLowerCase() === cleanEmail)) {
      setError("This person is already on the care team.");
      return;
    }
    setError(null);
    setSaving(true);
    const { data, error: insertError } = await supabase
      .from("tend_care_team_members")
      .insert({ church_id: churchId, name: cleanName, email: cleanEmail })
      .select("id,name,email")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(
        insertError?.code === "23505"
          ? "This person is already on the care team."
          : "Could not add this person. Please try again."
      );
      return;
    }
    setMembers((prev) => [...(prev ?? []), data as Member]);
    setName("");
    setEmail("");
    toast({ title: `${cleanName} can now help run this church` });
  };

  const removeMember = async (id: number) => {
    setConfirmRemoveId(null);
    const { error: deleteError } = await supabase
      .from("tend_care_team_members")
      .delete()
      .eq("id", id);
    if (deleteError) {
      toast({
        title: "Could not remove this person",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setMembers((prev) => (prev ?? []).filter((m) => m.id !== id));
  };

  if (members === undefined) {
    return <p className="text-sm text-muted-foreground">Loading care team...</p>;
  }
  if (members === null) {
    return null;
  }

  return (
    <div className="space-y-3">
      {members.length > 0 && (
        <ul className="rounded-md border border-border bg-card divide-y divide-border">
          {members.map((m) => (
            <li
              key={m.id}
              className="px-4 py-3 flex items-center justify-between gap-3 min-h-11"
            >
              <div className="min-w-0">
                <div className="text-foreground truncate">{m.name}</div>
                <div className="text-sm text-muted-foreground truncate">{m.email}</div>
              </div>
              {confirmRemoveId === m.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmRemoveId(null)}
                    data-testid={`button-keep-member-${m.id}`}
                  >
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeMember(m.id)}
                    data-testid={`button-confirm-remove-member-${m.id}`}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 min-h-11 min-w-11"
                  onClick={() => setConfirmRemoveId(m.id)}
                  aria-label={`Remove ${m.name} from the care team`}
                  data-testid={`button-remove-member-${m.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <UserPlus className="h-4 w-4" />
          Add a team member
        </div>
        <p className="text-xs text-muted-foreground">
          They sign in with their own Tend account using this email, then they can
          manage this church just like you.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="min-h-11"
            data-testid="input-member-name"
            aria-label="Team member name"
          />
          <Input
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-11"
            data-testid="input-member-email"
            aria-label="Team member email"
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button
          onClick={addMember}
          disabled={saving || !name.trim() || !email.trim()}
          className="bg-primary hover:bg-primary/90 text-primary-foreground min-h-11"
          data-testid="button-add-member"
        >
          {saving ? "Adding..." : "Add team member"}
        </Button>
      </div>
    </div>
  );
}
