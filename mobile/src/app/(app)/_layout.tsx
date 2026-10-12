import { Stack } from "expo-router";
import { colors } from "../../lib/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ivory },
        headerTintColor: colors.charcoal,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.ivory },
      }}
    >
      <Stack.Screen name="inbox" options={{ title: "Prayer inbox" }} />
      <Stack.Screen name="request/[id]" options={{ title: "Prayer request" }} />
      <Stack.Screen name="pray" options={{ title: "Pray", presentation: "modal" }} />
    </Stack>
  );
}
