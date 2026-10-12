import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  supabase,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type PrayerRequest,
  type PrayerStatus,
} from "../../../lib/supabase";
import { colors, styles } from "../../../lib/theme";
import { DEMO_REQUESTS } from "../../../lib/demo-data";

const STATUS_ACTIONS: PrayerStatus[] = ["new", "praying", "prayed_for", "archived"];

export default function RequestDetail() {
  const { id, demo } = useLocalSearchParams<{ id: string; demo?: string }>();
  const router = useRouter();
  const isDemo = demo === "1";
  const [request, setRequest] = useState<PrayerRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    if (isDemo) {
      const found = DEMO_REQUESTS.find((r) => r.id === Number(id));
      if (found) {
        setRequest({ ...found });
        setNotes(found.pastor_notes ?? "");
      } else {
        setError("This prayer request could not be found.");
      }
      setLoading(false);
      return;
    }
    const { data, error: reqError } = await supabase
      .from("tend_prayers")
      .select("*")
      .eq("id", Number(id))
      .single();
    if (reqError) {
      setError("Could not load this prayer request.");
    } else if (data) {
      setRequest(data as PrayerRequest);
      setNotes((data as PrayerRequest).pastor_notes ?? "");
    }
    setLoading(false);
  }, [id, isDemo]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (status: PrayerStatus) => {
    if (!request) return;
    setSaving(true);
    setError(null);
    if (isDemo) {
      // Preview mode: keep changes in memory only.
      setRequest({ ...request, status });
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase
      .from("tend_prayers")
      .update({ status })
      .eq("id", request.id);
    if (updateError) {
      setError("Could not update the status. Please try again.");
    } else {
      setRequest({ ...request, status });
    }
    setSaving(false);
  };

  const confirmDelete = useCallback(() => {
    if (!request) return;
    Alert.alert(
      "Delete this request?",
      "This permanently deletes the request and its prayer activity. This cannot be undone.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            setError(null);
            if (isDemo) {
              router.back();
              return;
            }
            const { error: deleteError } = await supabase
              .from("tend_prayers")
              .delete()
              .eq("id", request.id);
            setSaving(false);
            if (deleteError) {
              setError("Could not delete this request. Please try again.");
            } else {
              router.back();
            }
          },
        },
      ]
    );
  }, [request, isDemo, router]);

  const saveNotes = async () => {
    if (!request) return;
    setSaving(true);
    setError(null);
    if (isDemo) {
      setRequest({ ...request, pastor_notes: notes });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      setSaving(false);
      return;
    }
    const { error: notesError } = await supabase
      .from("tend_prayers")
      .update({ pastor_notes: notes.trim() === "" ? null : notes })
      .eq("id", request.id);
    if (notesError) {
      setError("Could not save your notes. Please try again.");
    } else {
      setRequest({ ...request, pastor_notes: notes });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.charcoal} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>This prayer request could not be found.</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  const displayName = request.is_anonymous ? "Anonymous" : request.submitter_name || "No name given";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
          <Text style={{ fontWeight: "700", fontSize: 18, color: colors.charcoal }}>
            {displayName}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
                marginRight: 8,
                backgroundColor: request.is_private ? colors.stone : colors.sage,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: request.is_private ? colors.muted : colors.charcoal,
                }}
              >
                {request.is_private ? "Private to your team" : "Shared on the prayer wall"}
              </Text>
            </View>
            {request.is_urgent ? (
              <Text style={{ color: colors.danger, fontWeight: "700" }}>Urgent</Text>
            ) : null}
          </View>
        </View>
        <Text style={{ color: colors.charcoal, fontSize: 16, lineHeight: 26 }}>
          {request.message}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>
          {CATEGORY_LABELS[request.category]} · {new Date(request.created_at).toLocaleString()}
        </Text>
        {!request.is_anonymous && (request.submitter_phone || request.submitter_email) ? (
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            {request.submitter_phone}
            {request.submitter_phone && request.submitter_email ? " · " : ""}
            {request.submitter_email}
          </Text>
        ) : null}
      </View>

      <Text style={{ fontWeight: "700", color: colors.charcoal, marginBottom: 8, marginTop: 8 }}>
        Status
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
        {STATUS_ACTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            disabled={saving}
            onPress={() => updateStatus(s)}
            style={{
              minHeight: 44,
              justifyContent: "center",
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 20,
              marginRight: 8,
              marginBottom: 8,
              backgroundColor: request.status === s ? colors.charcoal : colors.white,
              borderWidth: 1,
              borderColor: colors.stone,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: request.status === s ? colors.white : colors.charcoal,
                fontWeight: "600",
              }}
            >
              {STATUS_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontWeight: "700", color: colors.charcoal, marginBottom: 8, marginTop: 8 }}>
        Care notes
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>
        Only your team sees these. Keep the context together for your next conversation.
      </Text>
      <TextInput
        style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
        multiline
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything to remember for follow-up..."
        placeholderTextColor={colors.muted}
      />
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        disabled={saving}
        onPress={saveNotes}
      >
        {saving ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>{savedFlash ? "Saved" : "Save notes"}</Text>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={{ marginTop: 32, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.stone }}>
        <TouchableOpacity
          onPress={confirmDelete}
          disabled={saving}
          style={{
            minHeight: 44,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.danger,
            opacity: saving ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: "600" }}>Delete this request</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
