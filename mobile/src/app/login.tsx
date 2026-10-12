import { useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth, type OAuthProvider } from "../lib/auth";
import { colors, styles } from "../lib/theme";

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (provider: OAuthProvider) => {
    setBusy(provider);
    setError(null);
    try {
      await signIn(provider);
      router.replace("/(app)/inbox");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.centered, { backgroundColor: colors.ivory }]}>
      <Image
        source={require("../../assets/icon.png")}
        style={{ width: 88, height: 88, borderRadius: 20, marginBottom: 24 }}
      />
      <Text style={styles.title}>Tend Prayer</Text>
      <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 32 }]}>
        Tend the flock of God.{"\n"}Sign in to see your church&apos;s prayer inbox.
      </Text>

      <View style={{ width: "100%", maxWidth: 340 }}>
        <TouchableOpacity
          style={[styles.button, busy === "google" && styles.buttonDisabled]}
          disabled={busy !== null}
          onPress={() => handleSignIn("google")}
        >
          {busy === "google" ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, busy === "azure" && styles.buttonDisabled]}
          disabled={busy !== null}
          onPress={() => handleSignIn("azure")}
        >
          {busy === "azure" ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Continue with Microsoft</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={[styles.subtitle, { textAlign: "center", marginTop: 32, fontSize: 13 }]}>
        For your church&apos;s care team.{"\n"}Prayer requests stay private to your team.
      </Text>

      <TouchableOpacity
        onPress={() => router.replace("/(app)/inbox?demo=1")}
        style={{ marginTop: 16, padding: 8, minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.muted, textAlign: "center", textDecorationLine: "underline" }}>
          Preview the app with sample data
        </Text>
      </TouchableOpacity>
    </View>
  );
}
