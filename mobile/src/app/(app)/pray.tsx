import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  supabase,
  CATEGORY_LABELS,
  type Church,
  type PrayerRequest,
} from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { DEMO_REQUESTS } from "../../lib/demo-data";
import { colors, styles } from "../../lib/theme";

/**
 * Manual pray-through: one request at a time, read it, pray, mark it
 * prayed for. The voice loop (reads aloud, hears you, checks off with a
 * chime) lands here next — see specs/one-button-pray.md.
 */
export default function Pray() {
  const router = useRouter();
  const { demo, churchId } = useLocalSearchParams<{ demo?: string; churchId?: string }>();
  const isDemo = demo === "1";
  useAuth(); // keeps the session warm; the layout already gates on auth

  const [queue, setQueue] = useState<PrayerRequest[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [prayedCount, setPrayedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isDemo) {
        const open = DEMO_REQUESTS.filter(
          (r) => r.status === "new" || r.status === "praying"
        );
        setQueue(open.map((r) => ({ ...r })));
        setIndex(0);
        setPrayedCount(0);
        return;
      }
      let forChurchId = churchId ? Number(churchId) : NaN;
      if (!Number.isFinite(forChurchId)) {
        const { data, error: churchError } = await supabase
          .from("tend_churches")
          .select("id")
          .order("name")
          .limit(1)
          .single();
        if (churchError) throw churchError;
        forChurchId = (data as Church).id;
      }
      const { data, error: reqError } = await supabase
        .from("tend_prayers")
        .select("*")
        .eq("church_id", forChurchId)
        .in("status", ["new", "praying"])
        .order("created_at", { ascending: true });
      if (reqError) throw reqError;
      setQueue((data ?? []) as PrayerRequest[]);
      setIndex(0);
      setPrayedCount(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load prayer requests.");
    } finally {
      setLoading(false);
    }
  }, [isDemo, churchId]);

  useEffect(() => {
    load();
  }, [load]);

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setMarking(false);
  }, []);

  const markPrayed = useCallback(async () => {
    const current = queue[index];
    if (!current || marking) return;
    setMarking(true);
    if (!isDemo) {
      const { error: updateError } = await supabase
        .from("tend_prayers")
        .update({ status: "prayed_for" })
        .eq("id", current.id);
      if (updateError) {
        setError("Could not mark this one prayed for. Please try again.");
        setMarking(false);
        return;
      }
    }
    setPrayedCount((c) => c + 1);
    advance();
  }, [queue, index, marking, isDemo, advance]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.charcoal} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.errorText, { marginBottom: 16 }]}>{error}</Text>
        <TouchableOpacity
          onPress={load}
          style={{
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 20,
            borderRadius: 12,
            backgroundColor: colors.charcoal,
          }}
        >
          <Text style={{ color: colors.white, fontWeight: "600" }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const done = index >= queue.length;
  const current = queue[index];

  if (done) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 44, marginBottom: 16 }}>🙏</Text>
        <Text style={[styles.title, { textAlign: "center", marginBottom: 12 }]}>Amen</Text>
        <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 8 }]}>
          {queue.length === 0
            ? "Nothing waiting to be prayed for right now."
            : prayedCount === 1
              ? "You prayed for 1 request."
              : `You prayed for ${prayedCount} requests.`}
        </Text>
        <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 32, fontSize: 14 }]}>
          The voice loop is still being built — one day this screen will read each need aloud
          and listen as you pray.
        </Text>
        <View style={{ width: "100%", maxWidth: 340 }}>
          <TouchableOpacity style={[styles.button, styles.buttonGold]} onPress={() => router.back()}>
            <Text style={styles.buttonTextDark}>Back to inbox</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const displayName = current.is_anonymous
    ? "Anonymous"
    : current.submitter_name || "No name given";

  return (
    <View style={[styles.screen, { padding: 20 }]}>
      <Text style={{ textAlign: "center", color: colors.muted, fontSize: 13, marginBottom: 12 }}>
        {index + 1} of {queue.length}
      </Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View style={styles.card}>
          <Text style={{ fontWeight: "700", fontSize: 18, color: colors.charcoal, marginBottom: 12 }}>
            {displayName}
          </Text>
          <Text style={{ color: colors.charcoal, fontSize: 17, lineHeight: 28 }}>
            {current.message}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>
            {CATEGORY_LABELS[current.category]}
          </Text>
        </View>
      </ScrollView>

      <View style={{ paddingTop: 12 }}>
        <TouchableOpacity
          style={[styles.button, styles.buttonGold, marking && styles.buttonDisabled]}
          disabled={marking}
          onPress={markPrayed}
        >
          {marking ? (
            <ActivityIndicator color={colors.charcoal} />
          ) : (
            <Text style={styles.buttonTextDark}>Mark as prayed for</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={advance}
          disabled={marking}
          style={{ minHeight: 44, justifyContent: "center", marginTop: 4 }}
        >
          <Text style={{ color: colors.muted, textAlign: "center", fontSize: 15 }}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={{ textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 8 }}>
        Nothing is recorded or shared beyond your team.
      </Text>
    </View>
  );
}
