import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
import { colors, styles } from "../lib/theme";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.ivory }]}>
        <ActivityIndicator size="large" color={colors.charcoal} />
      </View>
    );
  }

  return <Redirect href={session ? "/(app)/inbox" : "/login"} />;
}
