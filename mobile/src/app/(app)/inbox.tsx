import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { supabase, CATEGORY_LABELS, STATUS_LABELS, type Church, type PrayerRequest, type PrayerStatus } from "../../lib/supabase";
import { DEMO_CHURCH, DEMO_REQUESTS } from "../../lib/demo-data";
import { useAuth } from "../../lib/auth";
import { registerPushToken } from "../../lib/notifications";
import { colors, styles } from "../../lib/theme";

const STATUS_FILTERS: Array<{ key: PrayerStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "praying", label: "Praying" },
  { key: "prayed_for", label: "Prayed for" },
  { key: "archived", label: "Archived" },
];

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function Inbox() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const isDemo = demo === "1";
  const [churches, setChurches] = useState<Church[]>([]);
  const [churchId, setChurchId] = useState<number | null>(null);
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [filter, setFilter] = useState<PrayerStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChurches = useCallback(async () => {
    const { data, error: churchError } = await supabase
      .from("tend_churches")
      .select("id, slug, name, pastor_name, pastor_email, greeting_message, plan, created_at")
      .order("name");
    if (churchError) throw churchError;
    const list = (data ?? []) as Church[];
    setChurches(list);
    setChurchId((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  const loadRequests = useCallback(
    async (forChurchId: number) => {
      let query = supabase
        .from("tend_prayers")
        .select("*")
        .eq("church_id", forChurchId)
        .order("created_at", { ascending: false });
      if (filter !== "all") query = query.eq("status", filter);
      const { data, error: reqError } = await query;
      if (reqError) throw reqError;
      setRequests((data ?? []) as PrayerRequest[]);
    },
    [filter]
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      if (isDemo) {
        setChurches([DEMO_CHURCH]);
        setChurchId((prev) => prev ?? DEMO_CHURCH.id);
      } else {
        await loadChurches();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your churches.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadChurches, isDemo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (churchId === null) return;
    if (isDemo) {
      setRequests(
        filter === "all" ? DEMO_REQUESTS : DEMO_REQUESTS.filter((r) => r.status === filter)
      );
      return;
    }
    loadRequests(churchId).catch((e) =>
      setError(e instanceof Error ? e.message : "Could not load prayer requests.")
    );
    // Ask for push permission after the first inbox view, not on launch.
    registerPushToken(churchId).catch(() => {});
  }, [churchId, loadRequests, isDemo, filter]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.charcoal} />
      </View>
    );
  }

  if (!isDemo && churches.length === 0 && !error) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.title, { textAlign: "center", marginBottom: 8 }]}>No churches yet</Text>
        <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 24 }]}>
          Your account is not connected to a church. Sign up your church at tendpray.com, then
          pull to refresh here.
        </Text>
        <TouchableOpacity
          onPress={() => {
            setLoading(true);
            refresh();
          }}
          style={{
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 20,
            borderRadius: 12,
            backgroundColor: colors.charcoal,
          }}
        >
          <Text style={{ color: colors.white, fontWeight: "600" }}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isDemo ? (
        <View
          style={{
            backgroundColor: colors.gold,
            paddingVertical: 8,
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ color: colors.charcoal, fontWeight: "700", textAlign: "center", fontSize: 13 }}>
            Preview mode — sample data, nothing is real
          </Text>
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        {churches.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
            {churches.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setChurchId(c.id)}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  marginRight: 8,
                  marginBottom: 8,
                  backgroundColor: c.id === churchId ? colors.charcoal : colors.white,
                  borderWidth: 1,
                  borderColor: colors.stone,
                }}
              >
                <Text
                  style={{
                    color: c.id === churchId ? colors.white : colors.charcoal,
                    fontWeight: "600",
                  }}
                >
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 16,
                marginRight: 8,
                marginBottom: 8,
                backgroundColor: f.key === filter ? colors.gold : "transparent",
              }}
            >
              <Text
                style={{
                  color: f.key === filter ? colors.charcoal : colors.muted,
                  fontWeight: f.key === filter ? "700" : "400",
                }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error ? (
        <View style={{ marginHorizontal: 16, alignItems: "center", marginTop: 12 }}>
          <Text style={[styles.errorText, { marginTop: 0, marginBottom: 8 }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              refresh();
            }}
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
      ) : null}

      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refresh();
            }}
          />
        }
        ListEmptyComponent={
          <Text style={[styles.subtitle, { textAlign: "center", marginTop: 40 }]}>
            No prayer requests here yet. When someone scans your church&apos;s code, their
            request will appear in this inbox.
          </Text>
        }
        renderItem={({ item }) => (
          <Link
            href={isDemo ? `/(app)/request/${item.id}?demo=1` : `/(app)/request/${item.id}`}
            asChild
          >
            <TouchableOpacity style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontWeight: "700", color: colors.charcoal }}>
                  {item.is_anonymous ? "Anonymous" : item.submitter_name || "No name given"}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{timeAgo(item.created_at)}</Text>
              </View>
              <Text numberOfLines={2} style={{ color: colors.charcoal, lineHeight: 22 }}>
                {item.message}
              </Text>
              <View style={{ flexDirection: "row", marginTop: 8, alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: colors.muted, marginRight: 12 }}>
                  {CATEGORY_LABELS[item.category]}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginRight: 12 }}>
                  {STATUS_LABELS[item.status]}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                    marginRight: 12,
                    backgroundColor: item.is_private ? colors.stone : colors.sage,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: item.is_private ? colors.muted : colors.charcoal,
                    }}
                  >
                    {item.is_private ? "Private" : "Shared"}
                  </Text>
                </View>
                {item.is_urgent ? (
                  <Text style={{ fontSize: 12, color: colors.danger, fontWeight: "700" }}>Urgent</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          </Link>
        )}
      />

      <View style={{ padding: 16, paddingTop: 0 }}>
        <TouchableOpacity
          style={[styles.button, styles.buttonGold]}
          onPress={() =>
            router.push(
              isDemo
                ? "/(app)/pray?demo=1"
                : churchId
                  ? `/(app)/pray?churchId=${churchId}`
                  : "/(app)/pray"
            )
          }
        >
          <Text style={styles.buttonTextDark}>Pray through these requests</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (isDemo) {
              router.replace("/login");
            } else {
              handleSignOut();
            }
          }}
          style={{ marginTop: 4, padding: 8, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: colors.muted, textAlign: "center" }}>
            {isDemo ? "Back to sign in" : "Sign out"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
