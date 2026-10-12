import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Asks for notification permission at a contextual moment (call after the
 * first inbox view, not on launch), registers the Expo push token, and saves
 * it to public.device_tokens scoped to the user and church.
 * Returns the token string, or null when permission is denied, this is not a
 * physical device, or the EAS project id is not configured yet.
 */
export async function registerPushToken(churchId: number): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  const finalStatus =
    existing === "granted" ? existing : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("prayer-requests", {
      name: "Prayer requests",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    console.warn("Push token registration skipped: no EAS project id yet. Run eas init first.");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { error } = await supabase.from("device_tokens").upsert(
    {
      user_id: user.id,
      church_id: churchId,
      expo_push_token: token,
      platform: Platform.OS === "ios" ? "ios" : "android",
    },
    { onConflict: "user_id,expo_push_token" }
  );
  if (error) {
    console.warn("Could not save push token:", error.message);
  }
  return token;
}

/** Deep link into the OS notification settings for this app. */
export function openNotificationSettings(): void {
  // Implemented by the settings screen via Linking.openSettings().
}
