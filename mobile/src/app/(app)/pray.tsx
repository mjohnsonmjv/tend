import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, styles } from "../../lib/theme";

/**
 * Placeholder for the one-button pray voice loop (see specs/one-button-pray.md).
 * The full experience: the app reads each need aloud, you pray aloud with eyes
 * closed, it hears you and checks the request off with a soft chime.
 * Voice capture and ElevenLabs transcription land here next.
 */
export default function Pray() {
  const router = useRouter();

  return (
    <View style={[styles.centered, { backgroundColor: colors.ivory }]}>
      <Text style={[styles.title, { textAlign: "center", marginBottom: 12 }]}>Pray mode</Text>
      <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 8 }]}>
        One tap, then pray aloud through your church&apos;s requests. The app listens and checks
        each one off as you pray for it, with a soft chime.
      </Text>
      <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 32, fontSize: 14 }]}>
        The voice loop is still being built. For now, open each request from the inbox and mark it
        prayed for when you have prayed.
      </Text>

      <View style={{ width: "100%", maxWidth: 340 }}>
        <TouchableOpacity
          style={[styles.button, styles.buttonGold, styles.buttonDisabled]}
          disabled
        >
          <Text style={styles.buttonTextDark}>Start praying (coming soon)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back to inbox</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.subtitle, { textAlign: "center", marginTop: 32, fontSize: 13 }]}>
        The microphone is only ever used during pray mode. Nothing is recorded or stored.
      </Text>
    </View>
  );
}
