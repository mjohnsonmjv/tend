import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in."
  );
}

// Session lives in the Keychain (iOS) / Keystore (Android), never in plain
// storage. On web, SecureStore is native-only, so fall back to localStorage.
const WebAdapter = {
  getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
  removeItem: (key: string) => { localStorage.removeItem(key); return Promise.resolve(); },
};
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? WebAdapter : SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

// Mirrors public.tend_churches in Supabase. RLS scopes reads to churches the
// signed-in user owns.
export interface Church {
  id: number;
  slug: string;
  name: string;
  pastor_name: string;
  pastor_email: string;
  greeting_message: string;
  plan: string;
  created_at: string;
}

export type PrayerCategory = "prayer" | "check_in" | "praise" | "question";
export type PrayerStatus = "new" | "praying" | "prayed_for" | "archived";

// Mirrors public.tend_prayers in Supabase. RLS scopes reads to prayers of
// churches the signed-in user owns; updates are limited to status and
// pastor_notes.
export interface PrayerRequest {
  id: number;
  church_id: number;
  submitter_name: string | null;
  submitter_phone: string | null;
  submitter_email: string | null;
  message: string;
  category: PrayerCategory;
  is_anonymous: boolean;
  is_urgent: boolean;
  is_private: boolean;
  status: PrayerStatus;
  pastor_notes: string | null;
  created_at: string;
}

export const CATEGORY_LABELS: Record<PrayerCategory, string> = {
  prayer: "Prayer request",
  check_in: "Check-in",
  praise: "Praise",
  question: "Question",
};

export const STATUS_LABELS: Record<PrayerStatus, string> = {
  new: "New",
  praying: "Praying",
  prayed_for: "Prayed for",
  archived: "Archived",
};
